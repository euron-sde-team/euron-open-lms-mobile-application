/**
 * Checkout rules for the Android app, matching the web checkout
 * (euron-open-lms apps/web/src/lib/checkout.ts): the idempotency key, coupon and tax copy,
 * billing details, the problems a quote or start can hit, and the gateway handoff. The
 * handoff runner takes its native pieces (Razorpay SDK, the stub page, the Custom Tab) as
 * dependencies, so each route is unit-tested. The app never sends an amount: the server
 * prices everything.
 */
import { isApiError } from "../../../api/vendor/client/errors";
import type { AcademyMeta, BillingDetails, BillingInterval, CheckoutHandoff, CheckoutQuote, CheckoutQuoteRequest, Me, Order, RazorpayConfirm, SellableType } from "../../../api/vendor/types";
import { prefs } from "../../../lib/storage";
import { money } from "./format";
import { parseQuery } from "./links";

export interface CheckoutItem {
  type: SellableType;
  id: string;
  interval?: BillingInterval;
}

// ─── Currency ───────────────────────────────────────────────────────────────

/** The account's preferred currency when the academy sells in it, else the academy default. No picker. */
export function checkoutCurrency(meta: Pick<AcademyMeta, "currencies" | "defaultCurrency"> | null | undefined, me: Pick<Me, "preferredCurrency"> | null | undefined): string | null {
  if (!meta) return me?.preferredCurrency ?? null;
  const pref = me?.preferredCurrency?.toUpperCase();
  return pref && meta.currencies.map((c) => c.toUpperCase()).includes(pref) ? pref : meta.defaultCurrency;
}

// ─── Idempotency key ────────────────────────────────────────────────────────

export interface KeyStore {
  get(k: string): string | undefined;
  set(k: string, v: string): void;
  remove(k: string): void;
}

const prefsStore: KeyStore = { get: (k) => prefs.getString(k), set: (k, v) => prefs.setString(k, v), remove: (k) => prefs.remove(k) };

export const keyStorageKey = (item: CheckoutItem) => `checkout.key:${item.type}:${item.id}:${item.interval ?? "-"}`;

interface StoredKey {
  key: string;
  fp: string | null;
}

function readKey(store: KeyStore, item: CheckoutItem): StoredKey | null {
  try {
    const raw = store.get(keyStorageKey(item));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredKey>;
    return typeof v.key === "string" && v.key ? { key: v.key, fp: typeof v.fp === "string" ? v.fp : null } : null;
  } catch {
    return null;
  }
}

/** A random key the server accepts (8 to 100 of A-Z a-z 0-9 _ -). Not a secret, only a dedupe token. */
export function newKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "m_";
  for (let i = 0; i < 30; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** What makes two starts "the same purchase": everything the server prices from. */
export function requestFingerprint(req: CheckoutQuoteRequest): string {
  const b = req.billing;
  return JSON.stringify([req.item.type, req.item.id, req.item.interval ?? null, req.currency, req.couponCode ?? null, b ? [b.name, b.country, b.taxId ?? null] : null]);
}

/**
 * The key for a Pay tap. The same request reuses the stored key (a retried tap, or a return
 * after the app was killed, gets the same order back); a changed request (another coupon or
 * country) gets a fresh key, since the server would otherwise return the earlier order.
 */
export function idempotencyKeyFor(item: CheckoutItem, fp: string, store: KeyStore = prefsStore, gen: () => string = newKey): string {
  const existing = readKey(store, item);
  if (existing && (existing.fp === null || existing.fp === fp)) {
    if (existing.fp === null) store.set(keyStorageKey(item), JSON.stringify({ key: existing.key, fp }));
    return existing.key;
  }
  const key = gen();
  store.set(keyStorageKey(item), JSON.stringify({ key, fp }));
  return key;
}

/** Forget the key (its order closed, or the purchase finished). */
export function clearIdempotencyKey(item: CheckoutItem, store: KeyStore = prefsStore): void {
  try {
    store.remove(keyStorageKey(item));
  } catch {
    /* ignore */
  }
}

// ─── Quote copy ─────────────────────────────────────────────────────────────

export type CouponError = NonNullable<CheckoutQuote["couponError"]>;

export const COUPON_ERROR_COPY: Record<CouponError, string> = {
  NOT_FOUND: "We could not find that code. Check the spelling.",
  EXPIRED: "This code has expired.",
  NOT_STARTED: "This code is not active yet.",
  EXHAUSTED: "This code has been used up.",
  NOT_APPLICABLE: "This code does not apply to this purchase.",
  CURRENCY_MISMATCH: "This code works in another currency.",
  ALREADY_USED: "You have already used this code.",
};

export type CouponView = { state: "none" } | { state: "applied"; code: string; label: string } | { state: "error"; code: string; message: string };

export function couponView(quote: Pick<CheckoutQuote, "coupon" | "couponError" | "discount"> | null | undefined, requested: string | null | undefined): CouponView {
  if (!requested || !quote) return { state: "none" };
  if (quote.couponError) return { state: "error", code: requested, message: COUPON_ERROR_COPY[quote.couponError] ?? "This code cannot be used." };
  if (!quote.coupon) return { state: "none" };
  const c = quote.coupon;
  const off = c.kind === "PERCENT" && c.percentOff != null ? `${c.percentOff}% off` : c.amountOff ? `${money(c.amountOff)} off` : quote.discount.amountMinor > 0 ? `${money(quote.discount)} off` : "applied";
  return { state: "applied", code: c.code, label: `${c.code} · ${off}` };
}

export const normaliseCoupon = (s: string | null | undefined) => (s ?? "").trim().toUpperCase().replace(/\s+/g, "");

/** "GST (18%)" or "VAT (20%, included)", the rate read back from the amounts. */
export function taxLineLabel(q: Pick<CheckoutQuote, "tax" | "subtotal" | "discount" | "total" | "taxLabel" | "taxMode">): string | null {
  if (!q.tax.amountMinor) return null;
  const base = q.taxMode === "INCLUSIVE" ? q.total.amountMinor - q.tax.amountMinor : q.subtotal.amountMinor - q.discount.amountMinor;
  const label = q.taxLabel?.trim() || "Tax";
  if (base <= 0) return label;
  const pct = Math.round((q.tax.amountMinor * 10000) / base) / 100;
  const rate = pct.toFixed(2).replace(/\.?0+$/, "");
  return `${label} (${rate}%${q.taxMode === "INCLUSIVE" ? ", included" : ""})`;
}

export const intervalWord = (i: BillingInterval) => (i === "YEAR" ? "year" : "month");

export function recurringNote(q: Pick<CheckoutQuote, "recurring" | "total">): string | null {
  const r = q.recurring;
  if (!r) return null;
  const price = `${money(r.price)} a ${intervalWord(r.interval)}`;
  if (r.trialDays > 0) return `Free for ${r.trialDays} days, then ${price}. Cancel before the trial ends and you pay nothing.`;
  if (r.price.amountMinor !== q.total.amountMinor) return `Then ${price}. Cancel any time from your account.`;
  return `Renews at ${price}. Cancel any time from your account.`;
}

export function gatewayLine(g: CheckoutQuote["gateway"]): string {
  if (g === "STRIPE") return "Pay securely with Stripe";
  if (g === "RAZORPAY") return "Razorpay: UPI, cards, netbanking";
  return "No payment needed";
}

export function payLabel(q: Pick<CheckoutQuote, "total" | "recurring" | "gateway">): string {
  if (q.recurring && q.recurring.trialDays > 0) return "Start free trial";
  if (q.gateway === "FREE" || q.total.amountMinor === 0) return "Get access";
  return `Pay ${money(q.total)}`;
}

// ─── Problems ───────────────────────────────────────────────────────────────

export interface CheckoutProblem {
  code: string;
  title: string;
  body: string;
  /** A screen that helps (by route name). */
  link: { route: "Learning" | "Subscription" | "Orders" | "Back"; label: string } | null;
}

export function checkoutProblem(e: unknown): CheckoutProblem | null {
  const code = isApiError(e) ? e.code : e === "ALREADY_OWNED" ? "ALREADY_OWNED" : null;
  if (!code) return null;
  const back = { route: "Back" as const, label: "Go back" };
  switch (code) {
    case "ALREADY_OWNED":
      return { code, title: "You already have this", body: "Everything in this order is already in your library, so there is nothing to pay.", link: { route: "Learning", label: "Go to My learning" } };
    case "SUBSCRIPTION_EXISTS":
      return { code, title: "You already have a plan", body: "One plan at a time. To switch, cancel your current plan and subscribe again when it ends.", link: { route: "Subscription", label: "Manage your subscription" } };
    case "PAYMENT_NOT_CONFIGURED":
    case "CURRENCY_NOT_PAYABLE":
    case "CURRENCY_NOT_SUPPORTED":
    case "PRICE_NOT_AVAILABLE":
      return { code, title: "Not available to buy in the app right now", body: "This academy cannot take this payment in your currency at the moment. Try again later.", link: back };
    case "NOT_FOR_SALE":
      return { code, title: "This is not for sale", body: "It is free or only available with a plan. Open its page to see how to get it.", link: back };
    case "BUNDLE_EMPTY":
      return { code, title: "This bundle is empty", body: "It has no courses yet, so it cannot be bought.", link: back };
    case "NOT_FOUND":
      return { code, title: "This item is not available", body: "It may have been removed or taken off sale.", link: back };
    case "CHECKOUT_IN_PROGRESS":
      return { code, title: "Another checkout is open", body: "You started paying for this a moment ago. Finish or close that payment, then try again.", link: { route: "Orders", label: "See your orders" } };
    default:
      return null;
  }
}

// ─── Billing details ────────────────────────────────────────────────────────

/** ISO 3166-1 alpha-2 codes with English names (Hermes has no Intl.DisplayNames). */
export const COUNTRIES: ReadonlyArray<readonly [string, string]> = ([
  ["AE", "United Arab Emirates"], ["AR", "Argentina"], ["AT", "Austria"], ["AU", "Australia"], ["BD", "Bangladesh"], ["BE", "Belgium"], ["BR", "Brazil"], ["CA", "Canada"],
  ["CH", "Switzerland"], ["CL", "Chile"], ["CN", "China"], ["CO", "Colombia"], ["CZ", "Czechia"], ["DE", "Germany"], ["DK", "Denmark"], ["EG", "Egypt"], ["ES", "Spain"],
  ["FI", "Finland"], ["FR", "France"], ["GB", "United Kingdom"], ["GH", "Ghana"], ["GR", "Greece"], ["HK", "Hong Kong"], ["ID", "Indonesia"], ["IE", "Ireland"], ["IL", "Israel"],
  ["IN", "India"], ["IT", "Italy"], ["JP", "Japan"], ["KE", "Kenya"], ["KR", "South Korea"], ["LK", "Sri Lanka"], ["MX", "Mexico"], ["MY", "Malaysia"], ["NG", "Nigeria"],
  ["NL", "Netherlands"], ["NO", "Norway"], ["NP", "Nepal"], ["NZ", "New Zealand"], ["PH", "Philippines"], ["PK", "Pakistan"], ["PL", "Poland"], ["PT", "Portugal"], ["QA", "Qatar"],
  ["RO", "Romania"], ["SA", "Saudi Arabia"], ["SE", "Sweden"], ["SG", "Singapore"], ["TH", "Thailand"], ["TR", "Turkey"], ["TW", "Taiwan"], ["UA", "Ukraine"], ["US", "United States"],
  ["VN", "Vietnam"], ["ZA", "South Africa"],
] as Array<[string, string]>).sort((a, b) => a[1].localeCompare(b[1]));

export const countryName = (code: string) => COUNTRIES.find((c) => c[0] === code)?.[1] ?? code;

const CURRENCY_COUNTRY: Record<string, string> = { INR: "IN", JPY: "JP", GBP: "GB", AUD: "AU", CAD: "CA", SGD: "SG", BRL: "BR", MXN: "MX", ZAR: "ZA", AED: "AE", NZD: "NZ", KRW: "KR", IDR: "ID", MYR: "MY", PHP: "PH", THB: "TH", CHF: "CH", SEK: "SE", NOK: "NO", DKK: "DK", PLN: "PL" };

/** A first guess at the billing country: a single-country currency, else the device locale's region. */
export function guessCountry(currency: string | null | undefined, locale: string | null | undefined): string {
  const known = (c: string | undefined) => !!c && COUNTRIES.some((x) => x[0] === c);
  const byCurrency = currency ? CURRENCY_COUNTRY[currency.toUpperCase()] : undefined;
  if (known(byCurrency)) return byCurrency!;
  const region = locale?.split(/[-_]/)[1]?.toUpperCase();
  return known(region) ? region! : "";
}

export function billingFor(b: { name: string; country: string; taxId: string }): BillingDetails | undefined {
  if (!b.country || !b.name.trim()) return undefined;
  return { name: b.name.trim(), country: b.country, ...(b.taxId.trim() ? { taxId: b.taxId.trim() } : {}) };
}

// ─── Handoff ────────────────────────────────────────────────────────────────

export type HandoffRoute = "FULFILLED" | "RAZORPAY_NATIVE" | "RAZORPAY_STUB" | "REDIRECT";

/** Which way a handoff goes on this device. */
export function handoffRoute(h: CheckoutHandoff): HandoffRoute {
  if (h.type === "FULFILLED") return "FULFILLED";
  if (h.type === "REDIRECT") return "REDIRECT";
  return h.mode === "stub" && h.checkoutPageUrl ? "RAZORPAY_STUB" : "RAZORPAY_NATIVE";
}

export interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_subscription_id?: string;
  razorpay_signature: string;
}

/** The query of the stub page's return link: a success payload, a cancel or a failure. */
export type StubReturn = { kind: "success"; payload: RazorpaySuccess } | { kind: "canceled" } | { kind: "failed" };

export function parseRazorpayReturn(url: string): StubReturn {
  const q = parseQuery(url.split("?")[1] ?? "");
  if (q.razorpay_payment_id && q.razorpay_signature && (q.razorpay_order_id || q.razorpay_subscription_id)) {
    return {
      kind: "success",
      payload: {
        razorpay_payment_id: q.razorpay_payment_id,
        razorpay_signature: q.razorpay_signature,
        ...(q.razorpay_order_id ? { razorpay_order_id: q.razorpay_order_id } : {}),
        ...(q.razorpay_subscription_id ? { razorpay_subscription_id: q.razorpay_subscription_id } : {}),
      },
    };
  }
  if (q.error) return { kind: "failed" };
  return { kind: "canceled" };
}

/** `<scheme>://checkout/return?orderId=...` (or `&canceled=1`), from the Stripe hand-back page. */
export function parseStripeReturn(url: string): { orderId: string | null; canceled: boolean } {
  const q = parseQuery(url.split("?")[1] ?? "");
  return { orderId: q.orderId || q.order || null, canceled: q.canceled === "1" };
}

/** The https page Stripe returns to; it hands the buyer back to the app's scheme. */
export const stripeReturnUrl = (webBaseUrl: string, scheme: string) => `${webBaseUrl.replace(/\/+$/, "")}/checkout/app-return?app=${encodeURIComponent(scheme)}`;

/** The stub page's Pay link back into the app, for an app whose scheme was renamed. */
export function withStubRedirect(checkoutPageUrl: string, scheme: string): string {
  return `${checkoutPageUrl}${checkoutPageUrl.includes("?") ? "&" : "?"}redirect=${encodeURIComponent(`${scheme}://checkout/razorpay`)}`;
}

export type HandoffOutcome =
  /** Go to CheckoutResult for this order. */
  | { kind: "result"; orderId: string }
  /** Back on the quote: the buyer closed the payment (nothing charged). */
  | { kind: "dismissed"; orderId: string }
  | { kind: "failed"; orderId: string; message: string }
  /** Paid, but the confirm call failed: the result screen polls the order. */
  | { kind: "confirm-error"; orderId: string };

export interface HandoffDeps {
  /** react-native-razorpay `open`: resolves with the success payload, rejects on cancel or failure. */
  openRazorpay: (options: Record<string, unknown>) => Promise<RazorpaySuccess>;
  /** Opens the stub checkout page in a WebView and resolves with its return link. */
  openStubPage: (url: string) => Promise<StubReturn>;
  /** Custom Tab auth session: resolves with the URL it closed on, or null when the buyer closed it. */
  openRedirect: (url: string, returnPrefix: string) => Promise<string | null>;
  confirm: (body: RazorpayConfirm) => Promise<Order>;
  /** Asks the server about an order once (Stripe sync), for a Custom Tab closed by hand. */
  syncOrder: (orderId: string) => Promise<Order>;
  cancelOrder: (orderId: string) => Promise<unknown>;
  scheme: string;
  academyName: string;
  brandHex: string;
  onConfirming?: () => void;
}

/** Razorpay's failure description, when it is not just "you closed the sheet". */
export function razorpayFailure(e: unknown): string | null {
  const d = (e as { description?: unknown } | null)?.description;
  if (typeof d !== "string" || !d) return null;
  try {
    const parsed = JSON.parse(d) as { error?: { description?: string; reason?: string } };
    if (parsed.error?.reason === "payment_cancelled" || /cancel/i.test(parsed.error?.description ?? "")) return null;
    return parsed.error?.description ?? null;
  } catch {
    return /cancel/i.test(d) ? null : d;
  }
}

/** Runs a handoff to its outcome. */
export async function runHandoff(h: CheckoutHandoff, deps: HandoffDeps): Promise<HandoffOutcome> {
  const route = handoffRoute(h);
  if (h.type === "FULFILLED") return { kind: "result", orderId: h.orderId };

  if (h.type === "REDIRECT") {
    const back = await deps.openRedirect(h.url, `${deps.scheme}://checkout/return`);
    if (back) {
      const r = parseStripeReturn(back);
      if (r.canceled) {
        await deps.cancelOrder(h.orderId).catch(() => undefined);
        return { kind: "dismissed", orderId: h.orderId };
      }
      return { kind: "result", orderId: r.orderId ?? h.orderId };
    }
    // Closed by hand: maybe after paying, before the redirect. Ask once.
    const o = await deps.syncOrder(h.orderId).catch(() => null);
    return o && o.status !== "PENDING" ? { kind: "result", orderId: h.orderId } : { kind: "dismissed", orderId: h.orderId };
  }

  const confirm = async (payload: RazorpaySuccess): Promise<HandoffOutcome> => {
    deps.onConfirming?.();
    try {
      await deps.confirm({ orderId: h.orderId, ...payload });
      return { kind: "result", orderId: h.orderId };
    } catch {
      return { kind: "confirm-error", orderId: h.orderId };
    }
  };

  if (route === "RAZORPAY_STUB") {
    const r = await deps.openStubPage(withStubRedirect(h.checkoutPageUrl!, deps.scheme));
    if (r.kind === "success") return confirm(r.payload);
    if (r.kind === "failed") return { kind: "failed", orderId: h.orderId, message: "The payment did not go through. You were not charged." };
    return { kind: "dismissed", orderId: h.orderId };
  }

  let payload: RazorpaySuccess;
  try {
    payload = await deps.openRazorpay({
      key: h.keyId,
      ...(h.subscriptionId ? { subscription_id: h.subscriptionId } : { order_id: h.razorpayOrderId ?? undefined, amount: h.amountMinor, currency: h.currency }),
      name: deps.academyName || h.name,
      description: h.description,
      prefill: h.prefill,
      notes: { order_number: h.orderNumber },
      theme: { color: deps.brandHex },
    });
  } catch (e) {
    const reason = razorpayFailure(e);
    return reason ? { kind: "failed", orderId: h.orderId, message: `${reason} You were not charged.` } : { kind: "dismissed", orderId: h.orderId };
  }
  return confirm(payload);
}
