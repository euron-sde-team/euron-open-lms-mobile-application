/**
 * Catalog facts in words: money, lengths, levels, languages and the one-line facts under a
 * title. Money arrives as integer minor units with its currency; Intl knows each
 * currency's decimals (JPY has none, KWD has three), so nothing here divides by 100.
 * Pure, so every case has a unit test.
 */
import type { CourseCard, Money } from "../../api/vendor/types";

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, compact: boolean): Intl.NumberFormat {
  const key = `${currency}:${compact}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(undefined, { style: "currency", currency, ...(compact ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}) });
    formatters.set(key, f);
  }
  return f;
}

/** Minor-unit exponent of a currency (2 for USD, 0 for JPY, 3 for KWD). */
export function exponentOf(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/**
 * "$49.00", "¥4,900", "KWD 1.250". `compact` drops the decimals on whole amounts only
 * (cards and plan prices), never rounding a real fraction away.
 */
export function formatMoney(amountMinor: number, currency: string, opts: { compact?: boolean } = {}): string {
  const value = amountMinor / 10 ** exponentOf(currency);
  const compact = !!opts.compact && Number.isInteger(value);
  try {
    return formatter(currency, compact).format(value);
  } catch {
    return `${currency} ${value}`;
  }
}

export const money = (m: Money | null | undefined, opts?: { compact?: boolean }): string => (m ? formatMoney(m.amountMinor, m.currency, opts) : "");

/** Whole percent saved against a struck-through price, or null when there is no real saving. */
export function savingPercent(price: Money | null | undefined, compareAt: Money | null | undefined): number | null {
  if (!price || !compareAt || compareAt.currency !== price.currency || compareAt.amountMinor <= price.amountMinor) return null;
  return Math.round(((compareAt.amountMinor - price.amountMinor) * 100) / compareAt.amountMinor);
}

/** "6 h 20 min", "45 min"; `short` gives "6h 20m" for tight rows. */
export function formatDuration(seconds: number, opts: { short?: boolean } = {}): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return m === 0 ? (s > 0 ? "1 min" : "0 min") : `${m} min`;
  if (opts.short) return m ? `${h}h ${m}m` : `${h}h`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** A lesson length as a clock: "3:05", "1:02:09". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

/** "BEGINNER" to "Beginner", "ALL_LEVELS" to "All levels". */
export function levelLabel(level: string): string {
  const t = level.toLowerCase().replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "en" to "English" where the runtime knows language names, else the code in capitals. */
export function languageName(code: string): string {
  try {
    const DN = (Intl as unknown as { DisplayNames?: new (l: string[] | undefined, o: { type: string }) => { of(c: string): string | undefined } }).DisplayNames;
    if (DN) return new DN(undefined, { type: "language" }).of(code) ?? code.toUpperCase();
  } catch {
    /* unknown code */
  }
  return code.toUpperCase();
}

export const plural = (n: number, one: string, many: string): string => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** "Beginner · 3 h 20 min · 12 lessons", the facts line on cards. */
export function factsLine(c: Pick<CourseCard, "level" | "durationSeconds" | "itemCount">): string {
  return [levelLabel(c.level), c.durationSeconds > 0 ? formatDuration(c.durationSeconds) : null, plural(c.itemCount, "lesson", "lessons")].filter(Boolean).join(" · ");
}

/** "Updated March 2026". */
export function updatedLine(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `Updated ${d.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`;
}

/** "3 days ago" style, coarse, for review rows. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - Date.parse(iso));
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return d === 1 ? "Yesterday" : `${d} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** Share of each star rating, 0..100, from the breakdown counts. */
export function breakdownPercents(b: Record<"1" | "2" | "3" | "4" | "5", number>): { stars: 5 | 4 | 3 | 2 | 1; count: number; percent: number }[] {
  const total = Object.values(b).reduce((a, n) => a + n, 0);
  return ([5, 4, 3, 2, 1] as const).map((s) => {
    const count = b[String(s) as keyof typeof b] ?? 0;
    return { stars: s, count, percent: total ? Math.round((count * 100) / total) : 0 };
  });
}
