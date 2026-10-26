import { breakdownPercents, clock, exponentOf, factsLine, formatDuration, formatMoney, levelLabel, savingPercent, timeAgo } from "./format";

describe("formatMoney", () => {
  it("uses each currency's own decimals, never dividing by 100 blindly", () => {
    expect(exponentOf("USD")).toBe(2);
    expect(exponentOf("JPY")).toBe(0);
    expect(exponentOf("KWD")).toBe(3);
    expect(formatMoney(4999, "USD")).toMatch(/49\.99/);
    expect(formatMoney(4900, "JPY")).toMatch(/4,900/);
    expect(formatMoney(4900, "JPY")).not.toMatch(/49\b/);
    expect(formatMoney(1250, "KWD")).toMatch(/1\.250/);
  });
  it("drops decimals only on whole amounts when compact", () => {
    expect(formatMoney(4900, "USD", { compact: true })).toMatch(/\$49$/);
    expect(formatMoney(4950, "USD", { compact: true })).toMatch(/49\.50/);
    expect(formatMoney(4900, "USD")).toMatch(/49\.00/);
  });
  it("formats INR in rupees", () => {
    expect(formatMoney(499900, "INR", { compact: true })).toMatch(/4,999/);
  });
});

describe("savingPercent", () => {
  const m = (amountMinor: number, currency = "USD") => ({ amountMinor, currency });
  it("rounds the real saving", () => expect(savingPercent(m(7500), m(10000))).toBe(25));
  it("is null without a cheaper price, a compare-at, or with mixed currencies", () => {
    expect(savingPercent(m(10000), m(10000))).toBeNull();
    expect(savingPercent(m(10000), null)).toBeNull();
    expect(savingPercent(m(7500), m(10000, "EUR"))).toBeNull();
  });
});

describe("durations and facts", () => {
  it("reads lengths in words and as a clock", () => {
    expect(formatDuration(0)).toBe("0 min");
    expect(formatDuration(20)).toBe("1 min");
    expect(formatDuration(45 * 60)).toBe("45 min");
    expect(formatDuration(3 * 3600 + 20 * 60)).toBe("3 h 20 min");
    expect(formatDuration(2 * 3600)).toBe("2 h");
    expect(formatDuration(3 * 3600 + 20 * 60, { short: true })).toBe("3h 20m");
    expect(clock(185)).toBe("3:05");
    expect(clock(3729)).toBe("1:02:09");
  });
  it("builds the card facts line", () => {
    expect(levelLabel("ALL_LEVELS")).toBe("All levels");
    expect(factsLine({ level: "BEGINNER", durationSeconds: 12000, itemCount: 12 })).toBe("Beginner · 3 h 20 min · 12 lessons");
    expect(factsLine({ level: "ADVANCED", durationSeconds: 0, itemCount: 1 })).toBe("Advanced · 1 lesson");
  });
});

describe("reviews", () => {
  it("turns the breakdown into percentages, highest first", () => {
    const r = breakdownPercents({ "1": 0, "2": 0, "3": 1, "4": 1, "5": 2 });
    expect(r.map((x) => x.stars)).toEqual([5, 4, 3, 2, 1]);
    expect(r[0]).toEqual({ stars: 5, count: 2, percent: 50 });
    expect(breakdownPercents({ "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 })[0].percent).toBe(0);
  });
  it("says how long ago, coarsely", () => {
    const now = Date.parse("2026-10-26T12:00:00Z");
    expect(timeAgo("2026-10-26T11:59:40Z", now)).toBe("Just now");
    expect(timeAgo("2026-10-26T11:15:00Z", now)).toBe("45 min ago");
    expect(timeAgo("2026-10-25T11:00:00Z", now)).toBe("Yesterday");
    expect(timeAgo("2026-10-20T12:00:00Z", now)).toBe("6 days ago");
  });
});
