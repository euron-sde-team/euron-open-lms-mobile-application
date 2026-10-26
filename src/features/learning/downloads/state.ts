/**
 * The offline downloads index and its rules, pure so they are unit tested. One entry per
 * video lecture, persisted in prefs (PREF.downloads) and stamped with the learner's id so
 * another account on the same phone never sees them.
 *
 * States: queued -> downloading -> done | failed | paused. A done copy past its
 * `offlineExpiresAt` without a successful revalidation reads as "expired" and does not
 * play; a later revalidation that extends the licence brings it back. Revoked copies are
 * deleted (files, key and entry).
 */
import type { OfflineValidation } from "../../../api/vendor/types";

export type DownloadState = "queued" | "downloading" | "paused" | "done" | "failed" | "expired";

export interface DownloadEntry {
  itemId: string;
  userId: string;
  courseId: string | null;
  courseSlug: string;
  courseTitle: string;
  title: string;
  /** "hls" plays through the loopback server; "mp4" plays the file directly. */
  kind: "hls" | "mp4" | null;
  /** Stored state; `effectiveState` adds "expired". */
  state: Exclude<DownloadState, "expired">;
  /** 0..1 */
  progress: number;
  bytes: number;
  durationSeconds: number | null;
  watermark: string | null;
  /** From the licence; null until the server issued one. */
  offlineExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** A short message for a failed or waiting download. */
  error: string | null;
  /** Paused because the connection dropped: resumes on its own when back online. */
  autoResume: boolean;
}

export interface DownloadIndex {
  version: 1;
  entries: DownloadEntry[];
}

export const EMPTY_INDEX: DownloadIndex = { version: 1, entries: [] };

export function effectiveState(e: DownloadEntry, now: number = Date.now()): DownloadState {
  if (e.state === "done" && isPastExpiry(e, now)) return "expired";
  return e.state;
}

function isPastExpiry(e: Pick<DownloadEntry, "offlineExpiresAt">, now: number): boolean {
  if (!e.offlineExpiresAt) return true;
  const t = Date.parse(e.offlineExpiresAt);
  return !Number.isFinite(t) || t <= now;
}

export function isPlayable(e: DownloadEntry, now: number = Date.now()): boolean {
  return effectiveState(e, now) === "done";
}

export type DownloadEvent =
  | { type: "start" }
  | { type: "licence"; offlineExpiresAt: string; watermark: string | null; durationSeconds: number | null; kind: "hls" | "mp4"; courseId: string; courseSlug: string; title: string }
  | { type: "progress"; progress: number; bytes?: number }
  | { type: "complete"; bytes: number }
  | { type: "fail"; error: string }
  | { type: "pause"; auto?: boolean; error?: string | null }
  | { type: "resume" };

/** The download state machine. Events that do not apply in the current state are ignored. */
export function transition(e: DownloadEntry, ev: DownloadEvent, now: string = new Date().toISOString()): DownloadEntry {
  const at = { ...e, updatedAt: now };
  switch (ev.type) {
    case "start":
      return e.state === "queued" ? { ...at, state: "downloading", error: null, autoResume: false } : e;
    case "licence":
      return { ...at, offlineExpiresAt: ev.offlineExpiresAt, watermark: ev.watermark, durationSeconds: ev.durationSeconds, kind: ev.kind, courseId: ev.courseId, courseSlug: ev.courseSlug, title: ev.title };
    case "progress":
      return e.state === "downloading" ? { ...at, progress: clamp01(Math.max(e.progress, ev.progress)), bytes: ev.bytes ?? e.bytes } : e;
    case "complete":
      return e.state === "downloading" ? { ...at, state: "done", progress: 1, bytes: ev.bytes, error: null, autoResume: false } : e;
    case "fail":
      return e.state === "downloading" || e.state === "queued" ? { ...at, state: "failed", error: ev.error, autoResume: false } : e;
    case "pause":
      return e.state === "downloading" || e.state === "queued" ? { ...at, state: "paused", autoResume: !!ev.auto, error: ev.error ?? null } : e;
    case "resume":
      return e.state === "paused" || e.state === "failed" ? { ...at, state: "queued", error: null, autoResume: false } : e;
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

/**
 * Folds a validation answer into the index: valid licences get their new expiry, revoked
 * ones are returned for deletion. Entries the server was not asked about are untouched.
 */
export function applyValidation(entries: DownloadEntry[], result: OfflineValidation, now: string = new Date().toISOString()): { entries: DownloadEntry[]; removed: string[] } {
  const valid = new Map(result.valid.map((v) => [v.itemId, v.offlineExpiresAt]));
  const revoked = new Set(result.revoked);
  const removed: string[] = [];
  const kept: DownloadEntry[] = [];
  for (const e of entries) {
    if (revoked.has(e.itemId)) {
      removed.push(e.itemId);
      continue;
    }
    const exp = valid.get(e.itemId);
    kept.push(exp ? { ...e, offlineExpiresAt: exp, updatedAt: now } : e);
  }
  return { entries: kept, removed };
}

/** Entries that hold a licence the server should be asked about (finished or in flight). */
export function idsToValidate(entries: DownloadEntry[]): string[] {
  return entries.filter((e) => e.offlineExpiresAt !== null).map((e) => e.itemId);
}

/** Entries that belong to another account (or none) on this phone. */
export function foreignEntries(entries: DownloadEntry[], userId: string | null): DownloadEntry[] {
  return userId ? entries.filter((e) => e.userId !== userId) : [];
}

export function totalBytes(entries: DownloadEntry[]): number {
  return entries.reduce((n, e) => n + (Number.isFinite(e.bytes) ? e.bytes : 0), 0);
}

export interface CourseGroup {
  courseSlug: string;
  courseTitle: string;
  entries: DownloadEntry[];
}

/** Grouped by course (in the order the first lesson was saved), newest lesson last within a course. */
export function groupByCourse(entries: DownloadEntry[]): CourseGroup[] {
  const groups = new Map<string, CourseGroup>();
  const sorted = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const e of sorted) {
    const g = groups.get(e.courseSlug) ?? { courseSlug: e.courseSlug, courseTitle: e.courseTitle, entries: [] };
    g.entries.push(e);
    groups.set(e.courseSlug, g);
  }
  return [...groups.values()];
}

/** Items to start when there is room: queued first, oldest first. */
export function nextToRun(entries: DownloadEntry[], running: ReadonlySet<string>, max = 2): string[] {
  const free = max - running.size;
  if (free <= 0) return [];
  return entries
    .filter((e) => e.state === "queued" && !running.has(e.itemId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, free)
    .map((e) => e.itemId);
}

/** The message for a refused download, by the API's code. */
export function downloadErrorMessage(code: string, details?: unknown): string {
  switch (code) {
    case "OFFLINE_DISABLED":
      return "Downloads are switched off for this academy.";
    case "DOWNLOADS_NOT_ALLOWED":
      return "This course's videos cannot be downloaded.";
    case "NOT_A_VIDEO":
    case "NOT_DOWNLOADABLE":
    case "DOWNLOAD_NOT_SUPPORTED":
      return "This video cannot be downloaded.";
    case "VIDEO_NOT_READY":
      return "This video is still processing. Try again later.";
    case "DOWNLOAD_LIMIT_REACHED": {
      const limit = (details as { limit?: unknown } | null | undefined)?.limit;
      return typeof limit === "number" ? `You can keep ${limit} downloads. Remove one first.` : "You have reached the download limit. Remove one first.";
    }
    case "COURSE_ACCESS_REQUIRED":
      return "Enroll in the course to download this lesson.";
    case "NETWORK_ERROR":
      return "Waiting for a connection.";
    case "STORAGE_FULL":
      return "Not enough space on this phone.";
    case "UNSUPPORTED_STREAM":
      return "This video's format cannot be saved for offline viewing.";
    default:
      return "The download stopped. Try again.";
  }
}
