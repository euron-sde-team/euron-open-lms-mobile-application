import type { Submission } from "../../../api/vendor/types";
import { buildSubmission, isEmptySubmission, latePolicy, sortSubmissions, submitState, validateRepoUrl } from "./assignment-state";

const sub = (version: number, status: Submission["status"]): Submission => ({ id: `s${version}`, version, status, body: null, bodyHtml: null, url: null, files: [], isLate: false, submittedAt: "2026-01-01T10:00:00Z", review: null });
const NOW = Date.parse("2026-02-01T00:00:00Z");

describe("submitState", () => {
  it("is open with no submissions and no due date", () => {
    expect(submitState({ submissions: [], dueAt: null, allowLate: false }, NOW)).toEqual({ open: true, late: false });
  });
  it("waits while the latest version is with the reviewer, whatever order the API used", () => {
    expect(submitState({ submissions: [sub(1, "CHANGES_REQUESTED"), sub(2, "SUBMITTED")], dueAt: null, allowLate: false }, NOW)).toEqual({ open: false, reason: "PENDING" });
  });
  it("is closed once approved", () => {
    expect(submitState({ submissions: [sub(2, "APPROVED"), sub(1, "CHANGES_REQUESTED")], dueAt: null, allowLate: false }, NOW)).toEqual({ open: false, reason: "APPROVED" });
  });
  it("reopens after changes are requested or the work is not approved", () => {
    expect(submitState({ submissions: [sub(1, "CHANGES_REQUESTED")], dueAt: null, allowLate: false }, NOW).open).toBe(true);
    expect(submitState({ submissions: [sub(1, "REJECTED")], dueAt: null, allowLate: false }, NOW).open).toBe(true);
  });
  it("applies the late policy after the due date", () => {
    expect(submitState({ submissions: [], dueAt: "2026-01-15T00:00:00Z", allowLate: false }, NOW)).toEqual({ open: false, reason: "PAST_DUE" });
    expect(submitState({ submissions: [], dueAt: "2026-01-15T00:00:00Z", allowLate: true }, NOW)).toEqual({ open: true, late: true });
    expect(submitState({ submissions: [], dueAt: "2026-03-01T00:00:00Z", allowLate: false }, NOW)).toEqual({ open: true, late: false });
  });
  it("describes the late policy", () => {
    expect(latePolicy({ dueAt: null, allowLate: true })).toBeNull();
    expect(latePolicy({ dueAt: "2026-01-01T00:00:00Z", allowLate: true })).toBe("Late work accepted and marked late");
    expect(latePolicy({ dueAt: "2026-01-01T00:00:00Z", allowLate: false })).toBe("No late submissions");
  });
  it("sorts versions newest first", () => {
    expect(sortSubmissions([sub(1, "REJECTED"), sub(3, "SUBMITTED"), sub(2, "REJECTED")]).map((s) => s.version)).toEqual([3, 2, 1]);
  });
});

describe("repository links", () => {
  it("accepts empty and full https links", () => {
    expect(validateRepoUrl("")).toBeNull();
    expect(validateRepoUrl("  https://github.com/juniper/solar  ")).toBeNull();
  });
  it("rejects http, other schemes and fragments", () => {
    expect(validateRepoUrl("http://github.com/x")).toMatch(/https/);
    // eslint-disable-next-line no-script-url -- the point of the test: script URLs are refused
    expect(validateRepoUrl("javascript:alert(1)")).toMatch(/https/);
    expect(validateRepoUrl("github.com/x")).toMatch(/full link/);
    expect(validateRepoUrl("https://localhost")).toMatch(/full link/);
  });
});

describe("submission body", () => {
  const all = { text: true, files: true, url: true, maxFiles: 3 };
  it("sends only what the assignment accepts, nothing empty", () => {
    expect(buildSubmission(all, { body: "My answer", url: " https://x.dev/r ", uploadIds: ["u1"] })).toEqual({ body: "My answer", url: "https://x.dev/r", uploadIds: ["u1"] });
    expect(buildSubmission({ ...all, url: false, files: false }, { body: "Text", url: "https://x.dev", uploadIds: ["u1"] })).toEqual({ body: "Text" });
    expect(buildSubmission(all, { body: "   ", url: "", uploadIds: [] })).toEqual({});
  });
  it("knows an empty submission", () => {
    expect(isEmptySubmission({})).toBe(true);
    expect(isEmptySubmission({ uploadIds: [] })).toBe(true);
    expect(isEmptySubmission({ url: "https://x.dev" })).toBe(false);
  });
});
