import { applyValidation, downloadErrorMessage, effectiveState, foreignEntries, groupByCourse, idsToValidate, isPlayable, nextToRun, totalBytes, transition, type DownloadEntry } from "./state";

const NOW = Date.parse("2026-05-01T12:00:00Z");

function entry(itemId: string, over: Partial<DownloadEntry> = {}): DownloadEntry {
  return {
    itemId,
    userId: "u_1",
    courseId: "c1",
    courseSlug: "botany",
    courseTitle: "Botany",
    title: `Lesson ${itemId}`,
    kind: "hls",
    state: "done",
    progress: 1,
    bytes: 1000,
    durationSeconds: 60,
    watermark: null,
    offlineExpiresAt: "2026-05-10T00:00:00Z",
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
    error: null,
    autoResume: false,
    ...over,
  };
}

describe("download state machine", () => {
  it("runs queued -> downloading -> done", () => {
    let e = entry("a", { state: "queued", progress: 0, bytes: 0 });
    e = transition(e, { type: "start" });
    expect(e.state).toBe("downloading");
    e = transition(e, { type: "progress", progress: 0.4, bytes: 400 });
    e = transition(e, { type: "progress", progress: 0.2 });
    expect(e.progress).toBe(0.4);
    e = transition(e, { type: "complete", bytes: 900 });
    expect(e).toMatchObject({ state: "done", progress: 1, bytes: 900 });
  });

  it("pauses, resumes and fails, ignoring events that do not apply", () => {
    let e = transition(entry("a", { state: "downloading", progress: 0.3 }), { type: "pause", auto: true, error: "Waiting for a connection." });
    expect(e).toMatchObject({ state: "paused", autoResume: true });
    expect(transition(e, { type: "complete", bytes: 1 }).state).toBe("paused");
    e = transition(e, { type: "resume" });
    expect(e).toMatchObject({ state: "queued", error: null, autoResume: false });
    e = transition(transition(e, { type: "start" }), { type: "fail", error: "nope" });
    expect(e).toMatchObject({ state: "failed", error: "nope" });
    expect(transition(entry("done"), { type: "fail", error: "x" }).state).toBe("done");
  });

  it("reads a finished copy past its licence as expired, and not playable", () => {
    expect(effectiveState(entry("a"), NOW)).toBe("done");
    expect(isPlayable(entry("a"), NOW)).toBe(true);
    const old = entry("b", { offlineExpiresAt: "2026-04-30T00:00:00Z" });
    expect(effectiveState(old, NOW)).toBe("expired");
    expect(isPlayable(old, NOW)).toBe(false);
    expect(effectiveState(entry("c", { offlineExpiresAt: null }), NOW)).toBe("expired");
    expect(effectiveState(entry("d", { state: "downloading", offlineExpiresAt: "2026-01-01T00:00:00Z" }), NOW)).toBe("downloading");
  });
});

describe("revalidation", () => {
  it("extends valid licences, drops revoked ones and leaves the rest", () => {
    const entries = [entry("a", { offlineExpiresAt: "2026-04-30T00:00:00Z" }), entry("b"), entry("c")];
    const { entries: next, removed } = applyValidation(entries, { valid: [{ itemId: "a", offlineExpiresAt: "2026-05-31T00:00:00Z" }], revoked: ["b"] });
    expect(removed).toEqual(["b"]);
    expect(next.map((e) => e.itemId)).toEqual(["a", "c"]);
    expect(isPlayable(next[0], NOW)).toBe(true);
    expect(next[1]).toBe(entries[2]);
  });

  it("asks only about copies that hold a licence", () => {
    expect(idsToValidate([entry("a"), entry("b", { state: "queued", offlineExpiresAt: null })])).toEqual(["a"]);
  });

  it("finds another account's copies", () => {
    const list = [entry("a"), entry("b", { userId: "u_2" })];
    expect(foreignEntries(list, "u_1").map((e) => e.itemId)).toEqual(["b"]);
    expect(foreignEntries(list, null)).toEqual([]);
  });
});

describe("queue and display", () => {
  it("runs at most two at a time, oldest queued first", () => {
    const list = [entry("a", { state: "queued", createdAt: "2026-04-03T00:00:00Z" }), entry("b", { state: "queued", createdAt: "2026-04-01T00:00:00Z" }), entry("c", { state: "queued", createdAt: "2026-04-02T00:00:00Z" })];
    expect(nextToRun(list, new Set())).toEqual(["b", "c"]);
    expect(nextToRun(list, new Set(["b"]))).toEqual(["c"]);
    expect(nextToRun(list, new Set(["x", "y"]))).toEqual([]);
  });

  it("groups by course and adds up storage", () => {
    const list = [entry("a"), entry("b", { courseSlug: "chem", courseTitle: "Chemistry", createdAt: "2026-03-01T00:00:00Z" }), entry("c")];
    expect(groupByCourse(list).map((g) => [g.courseTitle, g.entries.length])).toEqual([["Chemistry", 1], ["Botany", 2]]);
    expect(totalBytes(list)).toBe(3000);
  });

  it("explains refusals by code", () => {
    expect(downloadErrorMessage("DOWNLOAD_LIMIT_REACHED", { limit: 25 })).toBe("You can keep 25 downloads. Remove one first.");
    expect(downloadErrorMessage("DOWNLOADS_NOT_ALLOWED")).toMatch(/cannot be downloaded/);
    expect(downloadErrorMessage("SOMETHING_NEW")).toBe("The download stopped. Try again.");
  });
});
