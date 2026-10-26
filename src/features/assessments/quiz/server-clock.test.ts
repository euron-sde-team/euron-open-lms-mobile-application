import type { ApiClient } from "../../../api/client";
import { clockOffsetFromDate, requestWithClock, startAttempt } from "./server-clock";

describe("clock offset from the Date header", () => {
  it("measures the server ahead of the device at the round-trip midpoint", () => {
    const sent = Date.parse("2026-01-01T10:00:00.000Z");
    // Server says 10:02:00 (truncated to the second); round trip 400 ms.
    expect(clockOffsetFromDate("Thu, 01 Jan 2026 10:02:00 GMT", sent, sent + 400)).toBe(120_000 + 500 - 200);
  });

  it("measures a device clock that runs ahead", () => {
    const sent = Date.parse("2026-01-01T10:05:00.000Z");
    expect(clockOffsetFromDate("Thu, 01 Jan 2026 10:00:00 GMT", sent, sent)).toBe(-300_000 + 500);
  });

  it("treats sub-second differences as noise", () => {
    const sent = Date.parse("2026-01-01T10:00:00.300Z");
    expect(clockOffsetFromDate("Thu, 01 Jan 2026 10:00:00 GMT", sent, sent + 100)).toBe(0);
  });

  it("returns null without a usable header", () => {
    expect(clockOffsetFromDate(null, 0, 0)).toBeNull();
    expect(clockOffsetFromDate("garbage", 0, 0)).toBeNull();
  });
});

describe("requests with the clock", () => {
  const fakeApi = (date: string | null, data: unknown) => {
    const request = jest.fn(async () => ({ json: async () => data, headers: { get: (k: string) => (k.toLowerCase() === "date" ? date : null) } }));
    return { api: { http: { request } } as unknown as ApiClient, request };
  };

  it("reads the body and the offset from one raw call", async () => {
    const { api, request } = fakeApi("Thu, 01 Jan 2026 10:01:00 GMT", { id: "at1" });
    const t = [Date.parse("2026-01-01T10:00:00.000Z"), Date.parse("2026-01-01T10:00:00.000Z")];
    const r = await requestWithClock<{ id: string }>(api, "GET", "/assessments/attempts/at1", () => t.shift()!);
    expect(r).toEqual({ data: { id: "at1" }, offsetMs: 60_500 });
    expect(request).toHaveBeenCalledWith("GET", "/assessments/attempts/at1", { raw: true });
  });

  it("starts an attempt with a POST and falls back to no offset without a Date header", async () => {
    const { api, request } = fakeApi(null, { id: "at2" });
    const r = await startAttempt(api, "item/1");
    expect(r.offsetMs).toBe(0);
    expect(request).toHaveBeenCalledWith("POST", "/assessments/quizzes/item%2F1/attempts", { raw: true, body: {} });
  });

  it("rejects like the typed client", async () => {
    const api = { http: { request: jest.fn(async () => Promise.reject(new Error("NO_ATTEMPTS_LEFT"))) } } as unknown as ApiClient;
    await expect(startAttempt(api, "q")).rejects.toThrow("NO_ATTEMPTS_LEFT");
  });
});
