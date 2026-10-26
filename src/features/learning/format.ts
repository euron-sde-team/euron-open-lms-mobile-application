/**
 * Small, pure formatters for the learning area: lesson lengths, the player clock, file
 * sizes, progress lines and relative times. Copy matches the web app (lib/duration.ts,
 * lib/time.ts) so the two read the same.
 */

/** Course and lesson lengths: "6 h 20 min", "45 min". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return m === 0 ? (s > 0 ? "1 min" : "0 min") : `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Player clock and note stamps: "03:42", "1:02:09". Non-finite reads "00:00". */
export function clock(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}

/** Spoken form for screen readers: "3 minutes 5 seconds". */
export function spokenTime(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const part = (n: number, unit: string) => (n ? `${n} ${unit}${n === 1 ? "" : "s"}` : "");
  return [part(h, "hour"), part(m, "minute"), part(r, "second")].filter(Boolean).join(" ") || "0 seconds";
}

/** "820 KB", "1.4 MB", "2.1 GB"; null for unknown sizes. */
export function formatBytes(n: number | null | undefined): string | null {
  if (!n || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** The progress line under a course row: "42% · 8 of 19", or "Completed". */
export function progressLine(percent: number, completed: number, total: number): string {
  const p = Math.max(0, Math.min(100, Math.floor(percent)));
  if (p >= 100) return "Completed";
  return total > 0 ? `${p}% · ${completed} of ${total}` : `${p}%`;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Compact relative time for lists: "Just now", "5 min ago", "3 h ago", "Yesterday", "4 days ago", "12 Mar". */
export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = now - t;
  if (diff < 45_000) return "Just now";
  if (diff < HOUR) return `${Math.max(1, Math.round(diff / MIN))} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  if (diff < 2 * DAY) return "Yesterday";
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} days ago`;
  return shortDate(iso, now);
}

/** "12 Mar" this year, "12 Mar 2025" otherwise. */
export function shortDate(iso: string, now: number = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  try {
    return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(d);
  } catch {
    return d.toDateString();
  }
}

/** "12 Mar 2026". */
export function longDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(d);
  } catch {
    return d.toDateString();
  }
}

/** "Expires in 12 days", "Expires today", "Expired". For downloaded copies. */
export function expiryLine(iso: string, now: number = Date.now()): string {
  const left = Date.parse(iso) - now;
  if (!Number.isFinite(left) || left <= 0) return "Expired";
  const days = Math.floor(left / DAY);
  if (days === 0) return "Expires today";
  return `Expires in ${days} ${days === 1 ? "day" : "days"}`;
}
