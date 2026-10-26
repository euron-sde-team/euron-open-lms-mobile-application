/**
 * Orders, subscriptions and the order-status poll in words, the same rules as the web app
 * (euron-open-lms apps/web/src/lib/billing.ts). Pure, so each status has a test.
 */
import type { Order, OrderLine, OrderStatus, SubscriptionSummary } from "../../../api/vendor/types";
import { dateOnly, money } from "./format";
import type { AppRoute } from "./links";

export type Tone = "default" | "muted" | "success" | "warning" | "danger" | "primary";

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Awaiting payment", tone: "primary" },
  PAID: { label: "Paid", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "muted" },
  CANCELED: { label: "Canceled", tone: "muted" },
  PARTIALLY_REFUNDED: { label: "Partly refunded", tone: "warning" },
  REFUNDED: { label: "Refunded", tone: "muted" },
};

export const isPaidStatus = (s: OrderStatus) => s === "PAID" || s === "PARTIALLY_REFUNDED" || s === "REFUNDED";

/** "Course title", or "Course title and 2 more". */
export function orderTitle(o: Pick<Order, "lines" | "number">): string {
  const first = o.lines[0]?.title;
  if (!first) return o.number;
  return o.lines.length > 1 ? `${first} and ${o.lines.length - 1} more` : first;
}

export const gatewayName = (g: Order["gateway"]) => (g === "STRIPE" ? "Stripe" : g === "RAZORPAY" ? "Razorpay" : "No payment");

/** The screen an order line opens: the course or bundle page, or Plans. */
export function routeForLine(line: Pick<OrderLine, "type" | "slug"> | undefined): AppRoute | null {
  if (!line) return null;
  if (line.type === "PLAN") return { name: "Plans" };
  if (!line.slug) return null;
  return { name: line.type === "BUNDLE" ? "Bundle" : "Course", params: { slug: line.slug } };
}

/** Where "Start learning" goes after a purchase: the course's classroom, else My Learning. */
export function startLearningRoute(order: Pick<Order, "lines">): AppRoute {
  const first = order.lines[0];
  if (order.lines.length === 1 && first?.type === "COURSE" && first.slug) return { name: "Classroom", params: { courseSlug: first.slug } };
  return { name: "Tabs", params: { screen: "Learning" } };
}

export interface TimelineStep {
  label: string;
  at: string | null;
  tone: Tone;
}

/** The order's history as steps: placed, then paid / failed / canceled, then refunds. */
export function orderTimeline(o: Pick<Order, "status" | "createdAt" | "paidAt" | "refunded">): TimelineStep[] {
  const steps: TimelineStep[] = [{ label: "Placed", at: o.createdAt, tone: "default" }];
  if (o.paidAt) steps.push({ label: "Paid", at: o.paidAt, tone: "success" });
  if (o.status === "PENDING") steps.push({ label: "Waiting for payment", at: null, tone: "primary" });
  if (o.status === "FAILED") steps.push({ label: "Payment failed", at: null, tone: "danger" });
  if (o.status === "EXPIRED") steps.push({ label: "Expired before payment", at: null, tone: "muted" });
  if (o.status === "CANCELED") steps.push({ label: "Canceled", at: null, tone: "muted" });
  if (o.refunded.amountMinor > 0) steps.push({ label: o.status === "REFUNDED" ? `Refunded ${money(o.refunded)}` : `Partly refunded, ${money(o.refunded)}`, at: null, tone: "warning" });
  return steps;
}

// ─── The order (return) screen ──────────────────────────────────────────────

export type OrderPhase = "loading" | "paid" | "failed" | "canceled" | "pending" | "timeout";

export const POLL_INTERVAL_MS = 2_000;
export const POLL_TIMEOUT_MS = 60_000;

/** The result screen's state from the latest order and how long it has been polling. */
export function orderPhase(order: Pick<Order, "status"> | null | undefined, elapsedMs: number): OrderPhase {
  if (!order) return "loading";
  if (isPaidStatus(order.status)) return "paid";
  if (order.status === "FAILED" || order.status === "EXPIRED") return "failed";
  if (order.status === "CANCELED") return "canceled";
  return elapsedMs >= POLL_TIMEOUT_MS ? "timeout" : "pending";
}

/** The refetch interval: every 2 s while pending, then stop. */
export function pollInterval(order: Pick<Order, "status"> | null | undefined, elapsedMs: number): number | false {
  const phase = orderPhase(order, elapsedMs);
  return phase === "pending" || phase === "loading" ? POLL_INTERVAL_MS : false;
}

/** Failure reasons the API records, in words. */
export function failureCopy(reason: string | null | undefined): string {
  switch (reason) {
    case "GATEWAY_ERROR":
      return "The payment provider could not start the payment.";
    case "EXPIRED":
    case "CHECKOUT_EXPIRED":
      return "The checkout timed out before the payment finished.";
    case "CANCELED_BY_BUYER":
      return "You canceled the payment.";
    case "SUPERSEDED":
      return "A newer checkout replaced this one.";
    case null:
    case undefined:
    case "":
      return "The payment did not go through. You were not charged.";
    default:
      return /^[A-Z_]+$/.test(reason) ? "The payment did not go through. You were not charged." : reason;
  }
}

// ─── Subscription ───────────────────────────────────────────────────────────

export interface SubscriptionCopy {
  status: string;
  tone: Tone;
  dateLine: string | null;
  warning: string | null;
  canCancel: boolean;
  canResume: boolean;
  live: boolean;
}

export function subscriptionCopy(s: SubscriptionSummary, now: number = Date.now()): SubscriptionCopy {
  const end = s.currentPeriodEnd ? dateOnly(s.currentPeriodEnd) : null;
  const trialEnd = s.trialEnd ? dateOnly(s.trialEnd) : end;
  const price = `${money(s.price)} a ${s.interval === "YEAR" ? "year" : "month"}`;
  const future = !!s.currentPeriodEnd && new Date(s.currentPeriodEnd).getTime() > now;
  const base = { warning: null, canCancel: false, canResume: false, live: s.grantsAccess };
  switch (s.status) {
    case "TRIALING":
      return s.cancelAtPeriodEnd
        ? { ...base, status: "Free trial", tone: "primary", dateLine: trialEnd ? `Trial ends on ${trialEnd} and will not renew` : "Trial will not renew", canResume: true }
        : { ...base, status: "Free trial", tone: "primary", dateLine: trialEnd ? `Trial ends on ${trialEnd}, then ${price}` : `Then ${price}`, canCancel: true };
    case "ACTIVE":
      return s.cancelAtPeriodEnd
        ? { ...base, status: "Ending", tone: "warning", dateLine: end ? `Ends on ${end}` : null, canResume: true }
        : { ...base, status: "Active", tone: "success", dateLine: end ? `Renews on ${end} at ${price}` : `Renews at ${price}`, canCancel: true };
    case "PAST_DUE":
      return {
        ...base,
        status: "Payment overdue",
        tone: "danger",
        dateLine: end ? `The renewal on ${end} did not go through` : null,
        warning: "We could not take your last payment. Your courses stay open for a short grace period while we try again. Check that your card or bank account can pay, or pay from the reminder email we sent.",
        canCancel: !s.cancelAtPeriodEnd,
        canResume: s.cancelAtPeriodEnd,
      };
    case "INCOMPLETE":
      return { ...base, status: "Waiting for payment", tone: "muted", dateLine: null, warning: "The first payment has not finished. If you closed the payment window, start again from Plans." };
    case "CANCELED":
      if (s.cancelAtPeriodEnd && future) return { ...base, status: "Ending", tone: "warning", dateLine: `Ends on ${end}`, canResume: true };
      return { ...base, status: future && s.grantsAccess ? "Canceled" : "Ended", tone: "muted", dateLine: future && s.grantsAccess ? `Access until ${end}` : end ? `Ended on ${end}` : null };
    case "EXPIRED":
      return { ...base, status: "Ended", tone: "muted", dateLine: end ? `Ended on ${end}` : null };
  }
}

/** What the cancel confirmation says will happen. */
export function cancelExplainer(s: SubscriptionSummary): string {
  const end = s.status === "TRIALING" ? dateOnly(s.trialEnd ?? s.currentPeriodEnd) : dateOnly(s.currentPeriodEnd);
  if (s.status === "TRIALING") return `Your trial continues until ${end || "it ends"} and you will not be charged. After that, the courses in ${s.plan.name} lock. Your progress and certificates stay.`;
  return `You keep ${s.plan.name} until ${end || "the end of this billing period"} and will not be charged again. After that, its courses lock. Your progress and certificates stay, and you can resume before then.`;
}

/** A subscription that still renews blocks account deletion (409 SUBSCRIPTION_ACTIVE). */
export function blocksDeletion(sub: Pick<SubscriptionSummary, "status" | "cancelAtPeriodEnd"> | null | undefined): boolean {
  return !!sub && ["INCOMPLETE", "TRIALING", "ACTIVE", "PAST_DUE"].includes(sub.status) && !sub.cancelAtPeriodEnd;
}
