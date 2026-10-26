import { clock, expiryLine, formatBytes, formatDuration, progressLine, timeAgo } from "./format";

describe("learning formatters", () => {
  it("formats lesson lengths and the player clock", () => {
    expect(formatDuration(0)).toBe("0 min");
    expect(formatDuration(20)).toBe("1 min");
    expect(formatDuration(45 * 60)).toBe("45 min");
    expect(formatDuration(3 * 3600 + 20 * 60)).toBe("3 h 20 min");
    expect(clock(222)).toBe("03:42");
    expect(clock(3729)).toBe("1:02:09");
    expect(clock(Number.NaN)).toBe("00:00");
  });

  it("formats sizes and progress", () => {
    expect(formatBytes(null)).toBeNull();
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatBytes(2.25 * 1024 ** 3)).toBe("2.3 GB");
    expect(progressLine(42.9, 8, 19)).toBe("42% · 8 of 19");
    expect(progressLine(100, 19, 19)).toBe("Completed");
  });

  it("reads relative times and licence expiry", () => {
    const now = Date.parse("2026-03-10T12:00:00Z");
    expect(timeAgo("2026-03-10T11:59:50Z", now)).toBe("Just now");
    expect(timeAgo("2026-03-10T11:30:00Z", now)).toBe("30 min ago");
    expect(timeAgo("2026-03-10T09:00:00Z", now)).toBe("3 h ago");
    expect(timeAgo("2026-03-09T09:00:00Z", now)).toBe("Yesterday");
    expect(timeAgo("2026-03-06T12:00:00Z", now)).toBe("4 days ago");
    expect(expiryLine("2026-03-22T13:00:00Z", now)).toBe("Expires in 12 days");
    expect(expiryLine("2026-03-10T18:00:00Z", now)).toBe("Expires today");
    expect(expiryLine("2026-03-01T00:00:00Z", now)).toBe("Expired");
  });
});
