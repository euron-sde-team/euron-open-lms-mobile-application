import { NativeModules } from "react-native";
import { ApiError } from "../../../api/vendor/client/errors";
import { DownloadManager, type DownloadsApi, type EngineDeps } from "./engine";
import type { DownloadIndex } from "./state";

const MASTER = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=640x360\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720\nhd.m3u8\n";
const MEDIA = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="https://keys.test/k1"\n#EXTINF:4,\na.ts\n#EXTINF:4,\nb.ts\n#EXTINF:4,\nc.ts\n#EXT-X-ENDLIST\n';
const ITEM = "01HXITEMAAAAAAAAAAAAAAAAAA";

function fakeDeps(over: Partial<EngineDeps> = {}) {
  const files = new Map<string, number>();
  const texts = new Map<string, string>();
  const keys = new Map<string, string>();
  let saved: DownloadIndex | undefined;
  const fetched: string[] = [];
  const deps: EngineDeps = {
    rootDir: "/docs/downloads",
    exists: async (p) => files.has(p) || texts.has(p),
    mkdir: async () => undefined,
    remove: async (p) => {
      for (const k of [...files.keys(), ...texts.keys()]) if (k === p || k.startsWith(`${p}/`)) {
        files.delete(k);
        texts.delete(k);
      }
    },
    move: async (a, b) => {
      files.set(b, files.get(a) ?? 0);
      files.delete(a);
    },
    size: async (p) => files.get(p) ?? texts.get(p)?.length ?? 0,
    writeText: async (p, t) => {
      texts.set(p, t);
    },
    excludeFromBackup: jest.fn(async () => undefined),
    fetchText: async (url) => (url.endsWith("master.m3u8") ? MASTER : MEDIA),
    fetchBase64: jest.fn(async () => "AAECAwQFBgcICQoLDA0ODw=="),
    fetchToFile: (url, path) => {
      fetched.push(url);
      return { promise: Promise.resolve().then(() => {
        files.set(path, 100);
      }), cancel: jest.fn() };
    },
    load: () => saved,
    save: (i) => {
      saved = i;
    },
    writeKey: async (id, b64) => {
      keys.set(id, b64);
    },
    readKey: async (id) => keys.get(id) ?? null,
    clearKey: async (id) => {
      keys.delete(id);
    },
    deviceId: () => "device-test-1",
    now: () => Date.parse("2026-05-01T12:00:00Z"),
    ...over,
  };
  return { deps, files, texts, keys, fetched, saved: () => saved };
}

function fakeApi(over: Partial<{ download: jest.Mock; validate: jest.Mock; remove: jest.Mock }> = {}) {
  const download =
    over.download ??
    jest.fn(async () => ({ itemId: ITEM, courseId: "c1", courseSlug: "botany", title: "Leaves", durationSeconds: 12, watermark: "juniper@example.com", offlineExpiresAt: "2026-05-15T00:00:00Z", provider: "EVS", manifestUrl: "https://evs.test/v/master.m3u8", expiresAt: "2026-05-01T18:00:00Z" }));
  const validate = over.validate ?? jest.fn(async () => ({ valid: [] as { itemId: string; offlineExpiresAt: string }[], revoked: [] as string[] }));
  const remove = over.remove ?? jest.fn(async () => undefined);
  return { api: { learn: { download }, my: { validateDownloads: validate, removeDownload: remove } } as unknown as DownloadsApi, download, validate, remove };
}

const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

const input = { itemId: ITEM, courseSlug: "botany", courseTitle: "Botany", title: "Leaves" };

describe("DownloadManager", () => {
  it("downloads one HLS variant, keeps the key in the Keychain and writes a local playlist", async () => {
    const f = fakeDeps();
    const { api, download } = fakeApi();
    const m = new DownloadManager(f.deps);
    await m.attach(api, "u_1");
    m.start(input);
    await flush();
    expect(download).toHaveBeenCalledWith(ITEM, "device-test-1");
    expect(m.get(ITEM)).toMatchObject({ state: "done", progress: 1, kind: "hls", watermark: "juniper@example.com", offlineExpiresAt: "2026-05-15T00:00:00Z" });
    expect(f.fetched.every((u) => u.startsWith("https://evs.test/v/") && u.endsWith(".ts"))).toBe(true);
    expect(f.fetched).toHaveLength(3);
    expect(f.keys.get(ITEM)).toBe("AAECAwQFBgcICQoLDA0ODw==");
    const playlist = f.texts.get(`/docs/downloads/${ITEM}/index.m3u8`) ?? "";
    expect(playlist).toContain('URI="key"');
    expect(playlist).not.toContain("https://");
    expect([...f.files.keys()].some((k) => k.includes("key"))).toBe(false);
    expect(f.saved()?.entries[0].userId).toBe("u_1");
  });

  it("resumes without fetching segments already on disk", async () => {
    const f = fakeDeps();
    f.files.set(`/docs/downloads/${ITEM}/s00000.ts`, 100);
    f.files.set(`/docs/downloads/${ITEM}/s00001.ts`, 100);
    const { api } = fakeApi();
    const m = new DownloadManager(f.deps);
    await m.attach(api, "u_1");
    m.start(input);
    await flush();
    expect(f.fetched).toEqual(["https://evs.test/v/c.ts"]);
    expect(m.get(ITEM)?.state).toBe("done");
  });

  it("downloads an MP4 to one file", async () => {
    const f = fakeDeps();
    const { api } = fakeApi({ download: jest.fn(async () => ({ itemId: ITEM, courseId: "c1", courseSlug: "botany", title: "Leaves", durationSeconds: 12, watermark: null, offlineExpiresAt: "2026-05-15T00:00:00Z", provider: "MP4", url: "https://cdn.test/v.mp4", expiresAt: null })) });
    const m = new DownloadManager(f.deps);
    await m.attach(api, "u_1");
    m.start(input);
    await flush();
    expect(f.fetched).toEqual(["https://cdn.test/v.mp4"]);
    expect(f.files.has(`/docs/downloads/${ITEM}/video.mp4`)).toBe(true);
    expect(await m.offlineSource(ITEM)).toEqual({ uri: `file:///docs/downloads/${ITEM}/video.mp4`, watermark: null, kind: "mp4" });
  });

  it("fails with the server's reason, and waits for the network on a dropped connection", async () => {
    const refused = fakeApi({ download: jest.fn(async () => Promise.reject(new ApiError({ status: 409, code: "DOWNLOAD_LIMIT_REACHED", message: "x", details: { limit: 3 } }))) });
    const m = new DownloadManager(fakeDeps().deps);
    await m.attach(refused.api, "u_1");
    m.start(input);
    await flush();
    expect(m.get(ITEM)).toMatchObject({ state: "failed", error: "You can keep 3 downloads. Remove one first." });

    const offline = fakeApi({ download: jest.fn(async () => Promise.reject(new ApiError({ status: 0, code: "NETWORK_ERROR", message: "x" }))) });
    const m2 = new DownloadManager(fakeDeps().deps);
    await m2.attach(offline.api, "u_1");
    m2.start(input);
    await flush();
    expect(m2.get(ITEM)).toMatchObject({ state: "paused", autoResume: true });
    offline.download.mockImplementation(fakeApi().download);
    await m2.online();
    await flush();
    expect(m2.get(ITEM)?.state).toBe("done");
  });

  it("deletes revoked copies with their key on revalidation and keeps valid ones", async () => {
    const f = fakeDeps();
    const { api, validate } = fakeApi();
    const m = new DownloadManager(f.deps);
    await m.attach(api, "u_1");
    m.start(input);
    await flush();
    validate.mockResolvedValueOnce({ valid: [], revoked: [ITEM] });
    await m.revalidate({ force: true });
    expect(validate).toHaveBeenCalledWith("device-test-1", [ITEM]);
    expect(m.get(ITEM)).toBeUndefined();
    expect(f.keys.has(ITEM)).toBe(false);
    expect([...f.files.keys()].some((k) => k.includes(ITEM))).toBe(false);
  });

  it("purges another account's copies when a new learner signs in", async () => {
    const f = fakeDeps();
    const { api } = fakeApi();
    const m = new DownloadManager(f.deps);
    await m.attach(api, "u_1");
    m.start(input);
    await flush();
    const again = new DownloadManager(f.deps);
    await again.attach(api, "u_2");
    expect(again.getSnapshot()).toEqual([]);
  });

  it("plays HLS through the loopback server after handing it the key", async () => {
    const native = { start: jest.fn(async () => ({ port: 4321, token: "abcdef0123456789abcdef0123456789" })), stop: jest.fn(), setKey: jest.fn(async () => undefined) };
    (NativeModules as Record<string, unknown>).OpenLmsLoopback = native;
    const f = fakeDeps();
    const { api } = fakeApi();
    const m = new DownloadManager(f.deps);
    await m.attach(api, "u_1");
    m.start(input);
    await flush();
    const src = await m.offlineSource(ITEM);
    expect(native.setKey).toHaveBeenCalledWith(ITEM, "AAECAwQFBgcICQoLDA0ODw==");
    expect(src).toEqual({ uri: `http://127.0.0.1:4321/abcdef0123456789abcdef0123456789/${ITEM}/index.m3u8`, watermark: "juniper@example.com", kind: "hls" });
    delete (NativeModules as Record<string, unknown>).OpenLmsLoopback;
  });

  it("will not play an expired copy", async () => {
    const f = fakeDeps({ now: () => Date.parse("2026-06-01T00:00:00Z") });
    const { api } = fakeApi();
    const m = new DownloadManager(f.deps);
    await m.attach(api, "u_1");
    m.start(input);
    await flush();
    expect(await m.offlineSource(ITEM)).toBeNull();
  });

  it("resumes an interrupted download from the saved index", async () => {
    const f = fakeDeps();
    f.deps.save({ version: 1, entries: [{ itemId: ITEM, userId: "u_1", courseId: null, courseSlug: "botany", courseTitle: "Botany", title: "Leaves", kind: null, state: "downloading", progress: 0.3, bytes: 0, durationSeconds: null, watermark: null, offlineExpiresAt: null, createdAt: "2026-05-01T00:00:00Z", updatedAt: "2026-05-01T00:00:00Z", error: null, autoResume: false }] });
    const m = new DownloadManager(f.deps);
    expect(m.get(ITEM)?.state).toBe("queued");
    await m.attach(fakeApi().api, "u_1");
    await flush();
    expect(m.get(ITEM)?.state).toBe("done");
  });
});
