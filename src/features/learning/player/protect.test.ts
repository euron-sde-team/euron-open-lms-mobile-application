import { shouldProtect } from "./protect";
import { isExpiring, qualityOptions, resumePoint, sourceFromPlayback, youtubeId } from "./source";

describe("shouldProtect", () => {
  it.each([
    [{ offline: true, isPreview: false, accessMode: "FREE" as const }, true],
    [{ offline: true, isPreview: true, accessMode: null }, true],
    [{ offline: false, isPreview: false, accessMode: "PAID" as const }, true],
    [{ offline: false, isPreview: false, accessMode: "SUBSCRIPTION_ONLY" as const }, true],
    [{ offline: false, isPreview: false, accessMode: null }, true],
    [{ offline: false, isPreview: true, accessMode: "PAID" as const }, false],
    [{ offline: false, isPreview: false, accessMode: "FREE" as const }, false],
  ])("%o -> %s", (input, expected) => {
    expect(shouldProtect(input)).toBe(expected);
  });
});

describe("player sources", () => {
  it("maps each provider without building URLs", () => {
    expect(sourceFromPlayback({ provider: "EVS", manifestUrl: "https://evs/m.m3u8", thumbnailsUrl: null, posterUrl: "p", watermark: "w", expiresAt: "2026-01-01T00:00:00Z", resumeAt: 5 })).toMatchObject({ type: "hls", url: "https://evs/m.m3u8", watermark: "w", expiresAt: "2026-01-01T00:00:00Z" });
    expect(sourceFromPlayback({ provider: "MP4", url: "https://cdn/v.mp4", posterUrl: null, watermark: null, resumeAt: 0, expiresAt: null })).toMatchObject({ type: "mp4" });
    expect(sourceFromPlayback({ provider: "YOUTUBE", embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0", resumeAt: 3, watermark: null, expiresAt: null })).toMatchObject({ type: "youtube", videoId: "dQw4w9WgXcQ" });
    expect(youtubeId("https://example.com/video")).toBeNull();
  });

  it("knows when a signed source is about to expire", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(isExpiring(null, now)).toBe(false);
    expect(isExpiring("2026-01-01T00:00:20Z", now)).toBe(true);
    expect(isExpiring("2026-01-01T00:10:00Z", now)).toBe(false);
  });

  it("honours the resume point only away from the ends", () => {
    expect(resumePoint(3, 600)).toBe(0);
    expect(resumePoint(120, 600)).toBe(120);
    expect(resumePoint(595, 600)).toBe(0);
  });

  it("lists one quality per height, highest first", () => {
    expect(qualityOptions([{ height: 360 }, { height: 720 }, { height: 720 }, { height: 1080 }, {}])).toEqual([1080, 720, 360]);
  });
});

describe("the debug capture switch", () => {
  it("turns protection off only when the guard is off (debug builds with CAPTURE_GUARD=off)", () => {
    expect(shouldProtect({ offline: true, isPreview: false, accessMode: "PAID" }, false)).toBe(false);
    expect(shouldProtect({ offline: true, isPreview: false, accessMode: "PAID" }, true)).toBe(true);
  });
});
