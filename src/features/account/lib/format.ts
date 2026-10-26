/**
 * Money, dates and small text helpers for the account area. Money arrives as integer minor
 * units with its currency; the currency's own decimals come from Intl (JPY has none, KWD
 * has three), with a small fallback table for engines whose Intl is partial. Nothing here
 * divides by 100.
 */
import type { Money } from "../../../api/vendor/types";

const FALLBACK_EXPONENT: Record<string, number> = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, UGX: 0, XAF: 0, XOF: 0, KWD: 3, BHD: 3, OMR: 3, JOD: 3, TND: 3, IQD: 3, LYD: 3 };

/** Minor-unit exponent of a currency (2 for USD, 0 for JPY, 3 for KWD). */
export function exponentOf(currency: string): number {
  try {
    const d = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
    if (typeof d === "number") return d;
  } catch {
    /* unknown currency or a partial Intl */
  }
  return FALLBACK_EXPONENT[currency.toUpperCase()] ?? 2;
}

const formatters = new Map<string, Intl.NumberFormat>();

/** "$49.00", "₹4,999.00". The price shown is exactly what the server quoted. */
export function formatMoney(amountMinor: number, currency: string): string {
  const exp = exponentOf(currency);
  const value = amountMinor / 10 ** exp;
  try {
    let f = formatters.get(currency);
    if (!f) {
      f = new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: exp, maximumFractionDigits: exp });
      formatters.set(currency, f);
    }
    return f.format(value);
  } catch {
    return `${currency.toUpperCase()} ${value.toFixed(exp)}`;
  }
}

export const money = (m: Money | null | undefined): string => (m ? formatMoney(m.amountMinor, m.currency) : "");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Nov 2026". Built by hand so it reads the same on every engine. */
export function dateOnly(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Just now", "5 min ago", "3 h ago", "Yesterday", "4 d ago", then the date. */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} d ago`;
  return dateOnly(iso);
}

/** A readable device name from a session's user agent. The app itself shows as "iOS app" or "Android app". */
export function summarizeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  if (/CFNetwork|Darwin\//.test(ua) && !/Mozilla/.test(ua)) return "iOS app";
  if (/okhttp/i.test(ua)) return "Android app";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\/|CriOS/.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /curl|node|axios/i.test(ua) ? "App or script" : "Browser";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : null;
  return os ? `${browser} on ${os}` : browser;
}

/** A TOTP secret in groups of four ("JBSW Y3DP EHPK 3PXP"), easier to type into an authenticator. */
export function groupSecret(secret: string): string {
  const clean = secret.replace(/[\s-]+/g, "").toUpperCase();
  return clean.replace(/(.{4})(?=.)/g, "$1 ");
}

/** Six digits only, for code fields. */
export const digits6 = (s: string): string => s.replace(/\D/g, "").slice(0, 6);

/** The text a learner saves with their recovery codes. */
export function recoveryCodesText(codes: string[], academy: string): string {
  return [`${academy} recovery codes`, "Each code signs you in once if you lose your authenticator app.", "", ...codes, ""].join("\n");
}

/** Converts a theme colour ("hsl(188, 87%, 29%)" or "#0e7c8c") to hex for native SDKs that only take hex. */
export function toHex(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  const m = color.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/i);
  if (!m) return "#000000";
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const hue = (p: number, q: number, t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  let r = l;
  let g = l;
  let b = l;
  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3);
    g = hue(p, q, h);
    b = hue(p, q, h - 1 / 3);
  }
  const hex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
