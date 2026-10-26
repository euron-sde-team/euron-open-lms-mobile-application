/**
 * What the purchase bar offers, from the access state the API computed and the device's
 * purchase mode (app/meta.tsx). The app never decides access itself, and it follows the
 * store rules: Android checks out in the app; iOS never shows a price or a buy button,
 * and at most links to the academy's website when the admin allows it ("web-link"). With
 * "none" there is no purchase wording and nothing to tap. Pure, so every combination is
 * unit-tested (purchase.test.ts).
 */
import type { BillingInterval, CourseAccess, Money, Plan } from "../../api/vendor/types";
import type { PurchaseMode } from "../../app/meta";
import { joinUrl } from "../../lib/urls";

export type PurchaseAction =
  /** Open the classroom, at `itemId` when the API says where to resume. */
  | { kind: "classroom"; label: string; itemId: string | null; testID: string }
  /** POST the free enrollment, then open the classroom. */
  | { kind: "enroll"; label: string; testID: string }
  | { kind: "signIn"; label: string; testID: string }
  | { kind: "plans"; label: string; testID: string }
  | { kind: "checkout"; label: string; testID: string }
  /** iOS web-link: open the academy's website in the browser. */
  | { kind: "web"; label: string; url: string; testID: string }
  | { kind: "learning"; label: string; testID: string };

export interface PurchaseView {
  /** The one action; null when nothing can be done here. */
  primary: PurchaseAction | null;
  /** A quiet text link under the action (Android only: "or get it with a plan"). */
  secondary: PurchaseAction | null;
  /** One plain line (why it is locked, what is included). */
  note: string | null;
  /** Shown only where the app may sell (in-app). */
  price: Money | null;
  compareAt: Money | null;
  /** Progress replaces the price for an enrolled learner. */
  progressPercent: number | null;
  hasAccess: boolean;
  /** The "Have a coupon?" link (in-app checkout only). */
  allowCoupon: boolean;
}

export const LAPSED_COPY: Record<Extract<CourseAccess, { state: "LAPSED" }>["reason"], string> = {
  EXPIRED: "Your access to this course has ended. Your progress is saved.",
  REVOKED: "Your access to this course was removed. Your progress is saved.",
  SUBSCRIPTION_ENDED: "Your plan has ended, so this course is locked. Your progress is saved.",
  REFUNDED: "This purchase was refunded, so the course is locked. Your progress is saved.",
};

export const NOT_ENROLLED = "Not enrolled yet";

const empty: PurchaseView = { primary: null, secondary: null, note: null, price: null, compareAt: null, progressPercent: null, hasAccess: false, allowCoupon: false };

export interface PurchaseContext {
  mode: PurchaseMode;
  academyName: string;
  webBaseUrl: string;
}

/** The iOS answer for anything that would be bought: a website link, or nothing at all. */
function iosOffer(ctx: PurchaseContext, path: string, extra: Partial<PurchaseView> = {}): PurchaseView {
  if (ctx.mode === "web-link") {
    return {
      ...empty,
      ...extra,
      note: extra.note ?? `Available on ${ctx.academyName}'s website`,
      primary: { kind: "web", label: "Continue on the website", url: joinUrl(ctx.webBaseUrl, path), testID: "catalog-cta-web" },
    };
  }
  return { ...empty, ...extra, note: extra.note ?? NOT_ENROLLED };
}

export function coursePurchase(course: { slug: string; access: CourseAccess }, ctx: PurchaseContext): PurchaseView {
  const { access } = course;
  const path = `courses/${encodeURIComponent(course.slug)}`;
  const inApp = ctx.mode === "in-app";
  switch (access.state) {
    case "ENROLLED":
      return {
        ...empty,
        hasAccess: true,
        progressPercent: access.progressPercent,
        note: access.completedAt ? "You completed this course." : null,
        primary: { kind: "classroom", itemId: access.resumeItemId, label: access.progressPercent > 0 || access.completedAt ? "Continue learning" : "Start learning", testID: "catalog-cta-continue" },
      };
    case "STAFF":
      return { ...empty, hasAccess: true, note: "You are on this course's team, so progress is not recorded.", primary: { kind: "classroom", itemId: null, label: "Open classroom", testID: "catalog-cta-staff" } };
    case "INCLUDED_IN_PLAN":
      return { ...empty, hasAccess: true, note: "Included in your plan.", primary: { kind: "classroom", itemId: null, label: "Start learning", testID: "catalog-cta-start" } };
    case "FREE":
      return { ...empty, note: "Free. Your progress and certificate are kept.", primary: { kind: "enroll", label: "Enroll for free", testID: "catalog-cta-enroll" } };
    case "PURCHASABLE":
      if (!inApp) return iosOffer(ctx, path);
      return {
        ...empty,
        price: access.price,
        compareAt: access.compareAt,
        allowCoupon: true,
        primary: { kind: "checkout", label: "Buy now", testID: "catalog-cta-buy" },
        secondary: access.subscriptionAlso ? { kind: "plans", label: "or get it with a plan", testID: "catalog-cta-plans-alt" } : null,
      };
    case "SUBSCRIPTION_REQUIRED":
      if (!inApp) return iosOffer(ctx, path);
      return { ...empty, note: "This course is available with a plan.", primary: { kind: "plans", label: "See plans", testID: "catalog-cta-plans" } };
    case "LAPSED": {
      const note = LAPSED_COPY[access.reason];
      if (!inApp) return iosOffer(ctx, path, { note });
      if (access.price) {
        return {
          ...empty,
          note,
          price: access.price,
          allowCoupon: true,
          primary: { kind: "checkout", label: "Buy again", testID: "catalog-cta-buy-again" },
          secondary: access.reason === "SUBSCRIPTION_ENDED" ? { kind: "plans", label: "or renew a plan", testID: "catalog-cta-plans-alt" } : null,
        };
      }
      if (access.reason === "SUBSCRIPTION_ENDED") return { ...empty, note, primary: { kind: "plans", label: "See plans", testID: "catalog-cta-plans" } };
      return { ...empty, note };
    }
    case "UNAVAILABLE":
      return inApp ? { ...empty, note: "This course is not on sale in your currency right now." } : { ...empty, note: NOT_ENROLLED };
    case "SIGNED_OUT":
      if (access.free) return { ...empty, note: "Free with an account.", primary: { kind: "signIn", label: "Sign in to enroll for free", testID: "catalog-cta-signin" } };
      if (inApp) return { ...empty, price: access.price, primary: { kind: "signIn", label: "Sign in to get this course", testID: "catalog-cta-signin" } };
      // iOS: someone who bought on the website signs in to learn; nothing here sells.
      return ctx.mode === "web-link"
        ? { ...iosOffer(ctx, path), secondary: { kind: "signIn", label: "Already enrolled? Sign in", testID: "catalog-cta-signin" } }
        : { ...empty, note: NOT_ENROLLED, primary: { kind: "signIn", label: "Sign in", testID: "catalog-cta-signin" } };
  }
}

export function bundlePurchase(bundle: { slug: string; price: Money | null; separately: Money | null; viewerOwnsAll: boolean }, ctx: PurchaseContext & { signedIn: boolean }): PurchaseView {
  if (bundle.viewerOwnsAll) return { ...empty, hasAccess: true, note: "You already have every course in this bundle.", primary: { kind: "learning", label: "Go to my learning", testID: "catalog-cta-learning" } };
  const path = `bundles/${encodeURIComponent(bundle.slug)}`;
  if (ctx.mode !== "in-app") {
    const offer = iosOffer(ctx, path);
    return !ctx.signedIn && ctx.mode === "web-link" ? { ...offer, secondary: { kind: "signIn", label: "Already bought it? Sign in", testID: "catalog-cta-signin" } } : offer;
  }
  if (!bundle.price) return { ...empty, note: "This bundle is not on sale in your currency right now." };
  return {
    ...empty,
    price: bundle.price,
    compareAt: bundle.separately,
    allowCoupon: ctx.signedIn,
    primary: ctx.signedIn ? { kind: "checkout", label: "Buy bundle", testID: "catalog-cta-buy" } : { kind: "signIn", label: "Sign in to buy", testID: "catalog-cta-signin" },
  };
}

export type PlanOffer =
  | { kind: "current" }
  | { kind: "hasOther" }
  | { kind: "subscribe"; label: string; interval: BillingInterval }
  | { kind: "signIn" }
  | { kind: "web"; url: string }
  | { kind: "notSold" }
  | { kind: "none" };

/** What one plan column offers on this device. */
export function planOffer(plan: Pick<Plan, "id" | "trialDays" | "prices">, interval: BillingInterval, ctx: PurchaseContext & { signedIn: boolean; subscription: { plan: { id: string } } | null }): PlanOffer {
  if (ctx.subscription?.plan.id === plan.id) return { kind: "current" };
  if (ctx.subscription) return { kind: "hasOther" };
  if (ctx.mode === "web-link") return { kind: "web", url: joinUrl(ctx.webBaseUrl, "plans") };
  if (ctx.mode === "none") return { kind: "none" };
  if (!plan.prices.some((p) => p.interval === interval)) return { kind: "notSold" };
  if (!ctx.signedIn) return { kind: "signIn" };
  return { kind: "subscribe", interval, label: plan.trialDays > 0 ? "Start free trial" : "Subscribe" };
}

/** The billing periods a plan list sells in, monthly first (for the period tabs). */
export function availableIntervals(plans: Pick<Plan, "prices">[]): BillingInterval[] {
  const set = new Set(plans.flatMap((p) => p.prices.map((x) => x.interval)));
  return (["MONTH", "YEAR"] as const).filter((i) => set.has(i));
}

/** A yearly price as "about X a month" and the saving against twelve monthly payments. */
export function yearlyNote(plan: Pick<Plan, "prices">): { perMonth: Money; savingPercent: number | null } | null {
  const year = plan.prices.find((p) => p.interval === "YEAR");
  if (!year) return null;
  const perMonth = { amountMinor: Math.round(year.price.amountMinor / 12), currency: year.price.currency };
  const month = plan.prices.find((p) => p.interval === "MONTH" && p.price.currency === year.price.currency);
  if (!month) return { perMonth, savingPercent: null };
  const twelve = month.price.amountMinor * 12;
  const pct = twelve > 0 ? Math.floor(((twelve - year.price.amountMinor) * 100) / twelve) : 0;
  return { perMonth, savingPercent: pct >= 1 ? pct : null };
}
