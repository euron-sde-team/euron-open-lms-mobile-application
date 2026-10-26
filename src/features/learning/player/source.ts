/**
 * What the player can load, built only from the server's answer: the playback endpoint
 * (`Playback`) or a downloaded copy on the loopback server. URLs are never assembled on
 * the client; the YouTube id is read from the embed URL the server sends.
 */
import type { Playback } from "../../../api/vendor/types";

export type PlayerSource =
  | { type: "hls" | "mp4"; url: string; posterUrl: string | null; watermark: string | null; resumeAt: number; expiresAt: string | null; offline: boolean }
  | { type: "youtube"; videoId: string; resumeAt: number; watermark: null; posterUrl: null; expiresAt: null; offline: false };

export function sourceFromPlayback(p: Playback): PlayerSource | null {
  switch (p.provider) {
    case "EVS":
      return { type: "hls", url: p.manifestUrl, posterUrl: p.posterUrl, watermark: p.watermark, resumeAt: p.resumeAt, expiresAt: p.expiresAt, offline: false };
    case "HLS":
      return { type: "hls", url: p.url, posterUrl: p.posterUrl, watermark: p.watermark, resumeAt: p.resumeAt, expiresAt: null, offline: false };
    case "MP4":
      return { type: "mp4", url: p.url, posterUrl: p.posterUrl, watermark: p.watermark, resumeAt: p.resumeAt, expiresAt: null, offline: false };
    case "YOUTUBE": {
      const videoId = youtubeId(p.embedUrl);
      return videoId ? { type: "youtube", videoId, resumeAt: p.resumeAt, watermark: null, posterUrl: null, expiresAt: null, offline: false } : null;
    }
    default:
      return null;
  }
}

/** The id from a YouTube embed or watch URL; null when it is not one. */
export function youtubeId(url: string): string | null {
  const m = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/.exec(url);
  return m ? m[1] : null;
}

/** True when a signed source is within `marginMs` of its expiry (refresh before playing on). */
export function isExpiring(expiresAt: string | null, now = Date.now(), marginMs = 30_000): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t - now < marginMs;
}

/** Where the resume point is worth honouring: not in the first 5 s and not in the last 10 s. */
export function resumePoint(resumeAt: number, duration: number): number {
  if (!Number.isFinite(resumeAt) || resumeAt < 5) return 0;
  if (Number.isFinite(duration) && duration > 0 && resumeAt > duration - 10) return 0;
  return resumeAt;
}

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export function speedLabel(s: number): string {
  return s === 1 ? "Normal" : `${s}x`;
}

/** Quality rows from the tracks the player reports: one per height, highest first. */
export function qualityOptions(tracks: ReadonlyArray<{ height?: number; width?: number }>): number[] {
  const heights = new Set<number>();
  for (const t of tracks) if (t.height && t.height > 0) heights.add(t.height);
  return [...heights].sort((a, b) => b - a);
}
