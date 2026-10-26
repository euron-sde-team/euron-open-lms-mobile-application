/**
 * The offline download engine. One manager for the app; screens read it through
 * useDownloads() (useSyncExternalStore) and never touch files themselves.
 *
 * For each video it asks the API for a licence (POST /api/learn/items/:itemId/downloads),
 * then:
 *   - HLS (EVS or plain HLS): fetches the master playlist, keeps ONE variant (hls.ts),
 *     fetches its media playlist, downloads the AES-128 key once into the Keychain (never
 *     to disk), downloads every segment (skipping those already on disk, so a pause or a
 *     crash resumes where it stopped) and writes a local playlist with relative URIs and
 *     the key at the loopback server's key route;
 *   - MP4: downloads the file.
 * At most two items run at a time. Files live in DocumentDir/downloads/<itemId>/ and are
 * excluded from iCloud backup. Licences are revalidated on start and when the phone comes
 * back online; revoked copies are deleted with their key.
 */
import { Platform } from "react-native";
import ReactNativeBlobUtil from "react-native-blob-util";
import type { ApiClient } from "../../../api/client";
import { isApiError } from "../../../api/vendor/client/errors";
import type { OfflineDownload } from "../../../api/vendor/types";
import { secureStore } from "../../../lib/secure-store";
import { PREF, prefs } from "../../../lib/storage";
import { isMasterPlaylist, parseMaster, parseMedia, pickVariant, rewriteMedia, type MediaEntry } from "./hls";
import { ensureStarted, isSafeId, playlistUrl, setKey } from "./loopback";
import { applyValidation, downloadErrorMessage, EMPTY_INDEX, foreignEntries, idsToValidate, isPlayable, nextToRun, transition, type DownloadEntry, type DownloadEvent, type DownloadIndex } from "./state";

export type DownloadsApi = Pick<ApiClient, "learn" | "my">;

export interface Task {
  promise: Promise<void>;
  cancel: () => void;
}

/** Everything the engine needs from the platform, injectable for tests. */
export interface EngineDeps {
  rootDir: string;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  size(path: string): Promise<number>;
  writeText(path: string, text: string): Promise<void>;
  excludeFromBackup(path: string): Promise<void>;
  fetchText(url: string): Promise<string>;
  fetchBase64(url: string): Promise<string>;
  fetchToFile(url: string, path: string, onProgress?: (received: number, total: number) => void): Task;
  load(): DownloadIndex | undefined;
  save(index: DownloadIndex): void;
  writeKey(itemId: string, b64: string): Promise<void>;
  readKey(itemId: string): Promise<string | null>;
  clearKey(itemId: string): Promise<void>;
  deviceId(): string;
  now(): number;
}

class StreamError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

class Cancelled extends Error {}

const SEGMENT_CONCURRENCY = 3;
const MAX_RUNNING = 2;
const REVALIDATE_EVERY_MS = 10 * 60_000;

export interface StartInput {
  itemId: string;
  courseSlug: string;
  courseTitle: string;
  title: string;
  durationSeconds?: number | null;
}

export interface OfflineSource {
  uri: string;
  watermark: string | null;
  kind: "hls" | "mp4";
}

export class DownloadManager {
  private index: DownloadIndex;
  private listeners = new Set<() => void>();
  private running = new Map<string, { cancelled: boolean; tasks: Set<Task> }>();
  private api: DownloadsApi | null = null;
  private userId: string | null = null;
  private lastValidated = 0;
  private validating: Promise<void> | null = null;

  constructor(private readonly deps: EngineDeps) {
    const stored = deps.load();
    const entries = stored?.version === 1 && Array.isArray(stored.entries) ? stored.entries : [];
    // The app was closed mid-download: those continue from the queue.
    this.index = { version: 1, entries: entries.map((e) => (e.state === "downloading" ? { ...e, state: "queued" as const } : e)) };
  }

  // ─── Store ──────────────────────────────────────────────────────────────

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): DownloadEntry[] => this.index.entries;

  get(itemId: string): DownloadEntry | undefined {
    return this.index.entries.find((e) => e.itemId === itemId);
  }

  private commit(entries: DownloadEntry[]) {
    this.index = { version: 1, entries };
    this.deps.save(this.index);
    for (const l of this.listeners) l();
  }

  private update(itemId: string, ev: DownloadEvent) {
    const nowIso = new Date(this.deps.now()).toISOString();
    this.commit(this.index.entries.map((e) => (e.itemId === itemId ? transition(e, ev, nowIso) : e)));
  }

  private itemDir(itemId: string): string {
    if (!isSafeId(itemId)) throw new Error("Invalid item id");
    return `${this.deps.rootDir}/${itemId}`;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * Connects the engine to the signed-in learner. Copies saved by another account on this
   * phone are deleted; queued work continues.
   */
  async attach(api: DownloadsApi | null, userId: string | null): Promise<void> {
    this.api = api;
    if (userId && userId !== this.userId) {
      this.userId = userId;
      const foreign = foreignEntries(this.index.entries, userId);
      for (const e of foreign) await this.purge(e.itemId);
    }
    this.pump();
  }

  /** Signed out: stop work. Files stay until another account signs in or the learner deletes them. */
  detach() {
    this.api = null;
    for (const [, run] of this.running) {
      run.cancelled = true;
      for (const t of run.tasks) t.cancel();
    }
  }

  /** The connection came back: resume what paused for it, then revalidate. */
  async online(): Promise<void> {
    const waiting = this.index.entries.filter((e) => e.state === "paused" && e.autoResume);
    if (waiting.length) this.commit(this.index.entries.map((e) => (e.state === "paused" && e.autoResume ? transition(e, { type: "resume" }) : e)));
    this.pump();
    await this.revalidate({ force: true });
  }

  /**
   * Asks the server which copies may keep playing. Valid licences slide forward; revoked
   * ones are deleted. Without a network the copies keep their last expiry.
   */
  revalidate(opts: { force?: boolean } = {}): Promise<void> {
    if (this.validating) return this.validating;
    const api = this.api;
    const ids = idsToValidate(this.index.entries);
    if (!api || !ids.length) return Promise.resolve();
    if (!opts.force && this.deps.now() - this.lastValidated < REVALIDATE_EVERY_MS) return Promise.resolve();
    this.validating = (async () => {
      try {
        const result = await api.my.validateDownloads(this.deps.deviceId(), ids);
        this.lastValidated = this.deps.now();
        const { entries, removed } = applyValidation(this.index.entries, result, new Date(this.deps.now()).toISOString());
        for (const id of removed) {
          this.cancelRun(id);
          await this.deleteFiles(id);
        }
        this.commit(entries);
      } catch {
        // Offline or the server is down: expiry rules keep protecting the copies.
      } finally {
        this.validating = null;
      }
    })();
    return this.validating;
  }

  // ─── Actions ────────────────────────────────────────────────────────────

  start(input: StartInput): void {
    if (!this.userId) throw new Error("Sign in to download lessons.");
    if (!isSafeId(input.itemId)) throw new Error("Invalid item id");
    const existing = this.get(input.itemId);
    if (existing) {
      if (existing.state === "paused" || existing.state === "failed") this.resume(input.itemId);
      return;
    }
    const now = new Date(this.deps.now()).toISOString();
    const entry: DownloadEntry = {
      itemId: input.itemId,
      userId: this.userId,
      courseId: null,
      courseSlug: input.courseSlug,
      courseTitle: input.courseTitle,
      title: input.title,
      kind: null,
      state: "queued",
      progress: 0,
      bytes: 0,
      durationSeconds: input.durationSeconds ?? null,
      watermark: null,
      offlineExpiresAt: null,
      createdAt: now,
      updatedAt: now,
      error: null,
      autoResume: false,
    };
    this.commit([...this.index.entries, entry]);
    this.pump();
  }

  pause(itemId: string): void {
    this.cancelRun(itemId);
    this.update(itemId, { type: "pause" });
  }

  resume(itemId: string): void {
    this.update(itemId, { type: "resume" });
    this.pump();
  }

  /** Deletes the copy here and tells the server the licence is free again. */
  async remove(itemId: string): Promise<void> {
    await this.purge(itemId);
    const api = this.api;
    if (api) await api.my.removeDownload(itemId, this.deps.deviceId()).catch(() => undefined);
  }

  async removeAll(): Promise<void> {
    for (const e of [...this.index.entries]) await this.remove(e.itemId);
  }

  /** The source to play a finished copy offline, or null when it may not play. */
  async offlineSource(itemId: string): Promise<OfflineSource | null> {
    const e = this.get(itemId);
    if (!e || !isPlayable(e, this.deps.now()) || !e.kind) return null;
    const dir = this.itemDir(itemId);
    if (e.kind === "mp4") return { uri: `file://${dir}/video.mp4`, watermark: e.watermark, kind: "mp4" };
    const key = await this.deps.readKey(itemId);
    const server = await ensureStarted(this.deps.rootDir);
    if (key) await setKey(itemId, key);
    return { uri: playlistUrl(server, itemId), watermark: e.watermark, kind: "hls" };
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async purge(itemId: string) {
    this.cancelRun(itemId);
    await this.deleteFiles(itemId);
    this.commit(this.index.entries.filter((e) => e.itemId !== itemId));
  }

  private async deleteFiles(itemId: string) {
    await this.deps.remove(this.itemDir(itemId)).catch(() => undefined);
    await this.deps.clearKey(itemId).catch(() => undefined);
  }

  private cancelRun(itemId: string) {
    const run = this.running.get(itemId);
    if (!run) return;
    run.cancelled = true;
    for (const t of run.tasks) t.cancel();
  }

  private pump() {
    if (!this.api) return;
    for (const id of nextToRun(this.index.entries, new Set(this.running.keys()), MAX_RUNNING)) this.run(id);
  }

  private async run(itemId: string) {
    const api = this.api;
    if (!api || this.running.has(itemId)) return;
    const ctx = { cancelled: false, tasks: new Set<Task>() };
    this.running.set(itemId, ctx);
    this.update(itemId, { type: "start" });
    try {
      const licence = await api.learn.download(itemId, this.deps.deviceId());
      if (ctx.cancelled) throw new Cancelled();
      const kind = licence.provider === "MP4" ? "mp4" : "hls";
      this.update(itemId, { type: "licence", offlineExpiresAt: licence.offlineExpiresAt, watermark: licence.watermark, durationSeconds: licence.durationSeconds, kind, courseId: licence.courseId, courseSlug: licence.courseSlug, title: licence.title });
      const dir = this.itemDir(itemId);
      await this.deps.mkdir(dir).catch(() => undefined);
      await this.deps.excludeFromBackup(dir).catch(() => undefined);
      const bytes = kind === "mp4" ? await this.fetchMp4(itemId, licence, dir, ctx) : await this.fetchHls(itemId, licence, dir, ctx);
      this.update(itemId, { type: "complete", bytes });
    } catch (e) {
      if (ctx.cancelled || e instanceof Cancelled) {
        // Paused or deleted on purpose: the state was already set by the caller.
      } else if (isApiError(e) && e.code === "NETWORK_ERROR") {
        this.update(itemId, { type: "pause", auto: true, error: downloadErrorMessage("NETWORK_ERROR") });
      } else if (isApiError(e)) {
        this.update(itemId, { type: "fail", error: downloadErrorMessage(e.code, e.details) });
      } else if (e instanceof StreamError) {
        this.update(itemId, { type: "fail", error: downloadErrorMessage(e.code) });
      } else {
        // A transfer that failed mid-way (dropped connection, timeout): wait for the network.
        this.update(itemId, { type: "pause", auto: true, error: downloadErrorMessage("NETWORK_ERROR") });
      }
    } finally {
      this.running.delete(itemId);
      this.pump();
    }
  }

  private async fetchMp4(itemId: string, licence: OfflineDownload, dir: string, ctx: { cancelled: boolean; tasks: Set<Task> }): Promise<number> {
    if (licence.provider === "EVS") throw new StreamError("UNSUPPORTED_STREAM");
    const target = `${dir}/video.mp4`;
    if (!(await this.deps.exists(target))) {
      const part = `${target}.part`;
      await this.transfer(licence.url, part, ctx, (r, t) => t > 0 && this.update(itemId, { type: "progress", progress: r / t, bytes: r }));
      await this.deps.move(part, target);
    }
    return this.deps.size(target);
  }

  private async fetchHls(itemId: string, licence: OfflineDownload, dir: string, ctx: { cancelled: boolean; tasks: Set<Task> }): Promise<number> {
    const masterUrl = licence.provider === "EVS" ? licence.manifestUrl : licence.url;
    let mediaUrl = masterUrl;
    let text = await this.deps.fetchText(masterUrl);
    if (isMasterPlaylist(text)) {
      const variant = pickVariant(parseMaster(text, masterUrl));
      if (!variant || variant.audio) throw new StreamError("UNSUPPORTED_STREAM");
      mediaUrl = variant.uri;
      text = await this.deps.fetchText(mediaUrl);
    }
    const parsed = parseMedia(text, mediaUrl);
    if (!parsed.segments.length || parsed.unsupportedEncryption || parsed.keyUris.length > 1) throw new StreamError("UNSUPPORTED_STREAM");
    if (ctx.cancelled) throw new Cancelled();

    if (parsed.keyUris.length === 1 && !(await this.deps.readKey(itemId))) {
      const b64 = await this.deps.fetchBase64(parsed.keyUris[0]);
      if (!b64) throw new StreamError("UNSUPPORTED_STREAM");
      await this.deps.writeKey(itemId, b64);
    }

    const files: MediaEntry[] = [...(parsed.map ? [parsed.map] : []), ...parsed.segments];
    const total = parsed.totalDuration || files.length;
    const weight = (f: MediaEntry) => (parsed.totalDuration ? f.duration : 1);
    let done = 0;
    let bytes = 0;
    const queue = [...files];
    const worker = async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        if (ctx.cancelled) throw new Cancelled();
        const target = `${dir}/${f.local}`;
        if (!(await this.deps.exists(target))) {
          const part = `${target}.part`;
          await this.transfer(f.uri, part, ctx);
          await this.deps.move(part, target);
        }
        bytes += await this.deps.size(target).catch(() => 0);
        done += weight(f);
        this.update(itemId, { type: "progress", progress: done / total, bytes });
      }
    };
    await Promise.all(Array.from({ length: Math.min(SEGMENT_CONCURRENCY, files.length) }, worker));
    const playlist = `${dir}/index.m3u8`;
    await this.deps.writeText(playlist, rewriteMedia(parsed, mediaUrl));
    return bytes + (await this.deps.size(playlist).catch(() => 0));
  }

  private async transfer(url: string, path: string, ctx: { cancelled: boolean; tasks: Set<Task> }, onProgress?: (r: number, t: number) => void) {
    if (ctx.cancelled) throw new Cancelled();
    await this.deps.remove(path).catch(() => undefined);
    const task = this.deps.fetchToFile(url, path, onProgress);
    ctx.tasks.add(task);
    try {
      await task.promise;
    } finally {
      ctx.tasks.delete(task);
    }
    if (ctx.cancelled) throw new Cancelled();
  }
}

// ─── Platform wiring ────────────────────────────────────────────────────────

/** A random installation id, made once (never a hardware identifier). */
export function deviceId(): string {
  const existing = prefs.getString(PREF.deviceId);
  if (existing && /^[A-Za-z0-9_-]{8,128}$/.test(existing)) return existing;
  let id = "";
  while (id.length < 32) id += Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, "0");
  id = `m${id.slice(0, 31)}`;
  prefs.setString(PREF.deviceId, id);
  return id;
}

function httpOk(status: number): boolean {
  return status >= 200 && status < 300;
}

export function platformDeps(): EngineDeps {
  const fs = ReactNativeBlobUtil.fs;
  // iOS only: the JS method exists on Android too, but has no native side there and never
  // settles. Android needs nothing: the app sets allowBackup="false".
  const ios = Platform.OS === "ios" ? (ReactNativeBlobUtil as unknown as { ios?: { excludeFromBackupKey?: (p: string) => Promise<void> } }).ios : undefined;
  return {
    rootDir: `${fs.dirs.DocumentDir}/downloads`,
    exists: (p) => fs.exists(p),
    mkdir: async (p) => {
      if (!(await fs.exists(p))) await fs.mkdir(p);
    },
    remove: async (p) => {
      if (await fs.exists(p)) await fs.unlink(p);
    },
    move: (a, b) => fs.mv(a, b).then(() => undefined),
    size: async (p) => Number((await fs.stat(p)).size) || 0,
    writeText: (p, t) => fs.writeFile(p, t, "utf8"),
    excludeFromBackup: async (p) => {
      await ios?.excludeFromBackupKey?.(p);
    },
    fetchText: async (url) => {
      // A stalled playlist request must fail (and pause the download), never hang it.
      const res = await fetchWithTimeout(url, 30_000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
    fetchBase64: async (url) => {
      const res = await ReactNativeBlobUtil.fetch("GET", url);
      if (!httpOk(res.info().status)) throw new Error(`HTTP ${res.info().status}`);
      return String(res.base64());
    },
    fetchToFile: (url, path, onProgress) => {
      const req = ReactNativeBlobUtil.config({ path, overwrite: true, timeout: 60_000 }).fetch("GET", url);
      const withProgress = onProgress ? req.progress({ interval: 500 }, onProgress) : req;
      const promise = withProgress.then((res) => {
        if (!httpOk(res.info().status)) throw new Error(`HTTP ${res.info().status}`);
      });
      return { promise, cancel: () => req.cancel() };
    },
    load: () => prefs.getJson<DownloadIndex>(PREF.downloads) ?? EMPTY_INDEX,
    save: (index) => prefs.setJson(PREF.downloads, index),
    writeKey: (id, b64) => secureStore.writeDownloadKey(id, b64),
    readKey: (id) => secureStore.readDownloadKey(id),
    clearKey: (id) => secureStore.clearDownloadKey(id),
    deviceId,
    now: () => Date.now(),
  };
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

let manager: DownloadManager | null = null;

/** The app's one download manager. */
export function downloadManager(): DownloadManager {
  if (!manager) manager = new DownloadManager(platformDeps());
  return manager;
}
