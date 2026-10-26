import { dateOnly, digits6, exponentOf, formatMoney, groupSecret, recoveryCodesText, relativeTime, summarizeUserAgent, toHex } from "./format";

describe("money", () => {
  it("uses each currency's own decimals", () => {
    expect(exponentOf("USD")).toBe(2);
    expect(exponentOf("JPY")).toBe(0);
    expect(exponentOf("KWD")).toBe(3);
    expect(formatMoney(4900, "USD")).toContain("49.00");
    expect(formatMoney(4900, "JPY")).toContain("4,900");
    expect(formatMoney(1234, "KWD")).toContain("1.234");
  });
});

describe("two-factor secret", () => {
  it("groups the secret in fours, uppercase, without spaces or dashes", () => {
    expect(groupSecret("jbswy3dpehpk3pxp")).toBe("JBSW Y3DP EHPK 3PXP");
    expect(groupSecret("JBSW-Y3DP EHPK3")).toBe("JBSW Y3DP EHPK 3");
    expect(groupSecret("ABCD")).toBe("ABCD");
  });
  it("keeps codes to six digits", () => {
    expect(digits6("12a 34-567")).toBe("123456");
  });
  it("writes the recovery codes file", () => {
    expect(recoveryCodesText(["a1", "b2"], "Northwind")).toBe("Northwind recovery codes\nEach code signs you in once if you lose your authenticator app.\n\na1\nb2\n");
  });
});

describe("time", () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  it("reads recent times relatively, then as a date", () => {
    expect(relativeTime("2026-10-26T11:59:40Z", now)).toBe("Just now");
    expect(relativeTime("2026-10-26T11:55:00Z", now)).toBe("5 min ago");
    expect(relativeTime("2026-10-26T09:00:00Z", now)).toBe("3 h ago");
    expect(relativeTime("2026-10-25T11:00:00Z", now)).toBe("Yesterday");
    expect(relativeTime("2026-10-22T12:00:00Z", now)).toBe("4 d ago");
    expect(relativeTime("2026-09-01T12:00:00Z", now)).toBe(dateOnly("2026-09-01T12:00:00Z"));
    expect(relativeTime(null, now)).toBe("");
  });
});

describe("devices", () => {
  it("names browsers and this app", () => {
    expect(summarizeUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605 Version/17 Safari/605")).toBe("Safari on macOS");
    expect(summarizeUserAgent("okhttp/4.12.0")).toBe("Android app");
    expect(summarizeUserAgent("OpenLMS/42 CFNetwork/1490 Darwin/23.0.0")).toBe("iOS app");
    expect(summarizeUserAgent(null)).toBe("Unknown device");
  });
});

describe("toHex", () => {
  it("converts theme colours for native SDKs", () => {
    expect(toHex("hsl(0, 0%, 100%)")).toBe("#ffffff");
    expect(toHex("hsl(0, 100%, 50%)")).toBe("#ff0000");
    expect(toHex("#0E7C8C")).toBe("#0e7c8c");
  });
});
