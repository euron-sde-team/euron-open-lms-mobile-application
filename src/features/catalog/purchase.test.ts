import type { CourseAccess } from "../../api/vendor/types";
import type { PurchaseMode } from "../../app/meta";
import { NOT_ENROLLED, availableIntervals, bundlePurchase, coursePurchase, planOffer, yearlyNote, type PurchaseContext, type PurchaseView } from "./purchase";

const usd = (amountMinor: number) => ({ amountMinor, currency: "USD" });
const ctx = (mode: PurchaseMode): PurchaseContext => ({ mode, academyName: "Northwind Academy", webBaseUrl: "https://learn.example.com" });
const course = (access: CourseAccess) => ({ slug: "intro-to-sql", access });
const MODES: PurchaseMode[] = ["in-app", "web-link", "none"];

/** iOS must never show a price, a coupon, a checkout or plans action. */
function expectNoSelling(v: PurchaseView) {
  expect(v.price).toBeNull();
  expect(v.compareAt).toBeNull();
  expect(v.allowCoupon).toBe(false);
  for (const a of [v.primary, v.secondary]) {
    if (a) expect(["checkout", "plans"]).not.toContain(a.kind);
  }
}

function expectIosRule(v: PurchaseView, mode: "web-link" | "none") {
  expectNoSelling(v);
  if (mode === "web-link") {
    expect(v.primary).toMatchObject({ kind: "web", label: "Continue on the website", url: "https://learn.example.com/courses/intro-to-sql" });
    expect(v.note).toBe("Available on Northwind Academy's website");
  } else {
    expect(v.primary).toBeNull();
    expect(v.note).toBe(NOT_ENROLLED);
  }
}

describe("coursePurchase: access the learner already has", () => {
  it.each(MODES)("enrolled opens the classroom at the resume item (%s)", (mode) => {
    const v = coursePurchase(course({ state: "ENROLLED", enrollmentId: "e1", progressPercent: 42, completedAt: null, validUntil: null, resumeItemId: "item9" }), ctx(mode));
    expect(v.primary).toMatchObject({ kind: "classroom", label: "Continue learning", itemId: "item9" });
    expect(v.progressPercent).toBe(42);
    expect(v.hasAccess).toBe(true);
    expectNoSelling(v);
  });
  it("says Start learning before any progress", () => {
    const v = coursePurchase(course({ state: "ENROLLED", enrollmentId: "e1", progressPercent: 0, completedAt: null, validUntil: null, resumeItemId: null }), ctx("in-app"));
    expect(v.primary?.label).toBe("Start learning");
  });
  it.each(MODES)("staff and plan access open the classroom (%s)", (mode) => {
    expect(coursePurchase(course({ state: "STAFF" }), ctx(mode)).primary).toMatchObject({ kind: "classroom", label: "Open classroom" });
    expect(coursePurchase(course({ state: "INCLUDED_IN_PLAN" }), ctx(mode)).primary).toMatchObject({ kind: "classroom", label: "Start learning" });
  });
});

describe("coursePurchase: free", () => {
  it.each(MODES)("enrolls for free on every platform (%s)", (mode) => {
    const v = coursePurchase(course({ state: "FREE" }), ctx(mode));
    expect(v.primary).toMatchObject({ kind: "enroll", label: "Enroll for free" });
    expectNoSelling(v);
  });
  it.each(MODES)("asks a guest to sign in for a free course (%s)", (mode) => {
    expect(coursePurchase(course({ state: "SIGNED_OUT", free: true, price: null }), ctx(mode)).primary).toMatchObject({ kind: "signIn", label: "Sign in to enroll for free" });
  });
});

describe("coursePurchase: paid", () => {
  const paid: CourseAccess = { state: "PURCHASABLE", price: usd(4900), compareAt: usd(9900), subscriptionAlso: true };
  it("Android buys in the app with price, compare-at, coupon and the plan alternative", () => {
    const v = coursePurchase(course(paid), ctx("in-app"));
    expect(v.primary).toMatchObject({ kind: "checkout", label: "Buy now" });
    expect(v.price).toEqual(usd(4900));
    expect(v.compareAt).toEqual(usd(9900));
    expect(v.allowCoupon).toBe(true);
    expect(v.secondary).toMatchObject({ kind: "plans" });
  });
  it("iOS web-link links to the website without a price", () => expectIosRule(coursePurchase(course(paid), ctx("web-link")), "web-link"));
  it("iOS none shows nothing to tap and no purchase wording", () => {
    const v = coursePurchase(course(paid), ctx("none"));
    expectIosRule(v, "none");
    expect(v.secondary).toBeNull();
  });
  it("a guest on Android sees the price and signs in to buy", () => {
    const v = coursePurchase(course({ state: "SIGNED_OUT", free: false, price: usd(4900) }), ctx("in-app"));
    expect(v.primary).toMatchObject({ kind: "signIn" });
    expect(v.price).toEqual(usd(4900));
  });
  it("a guest on iOS never sees the price", () => {
    const guest: CourseAccess = { state: "SIGNED_OUT", free: false, price: usd(4900) };
    const web = coursePurchase(course(guest), ctx("web-link"));
    expectIosRule(web, "web-link");
    expect(web.secondary).toMatchObject({ kind: "signIn" });
    const none = coursePurchase(course(guest), ctx("none"));
    expectNoSelling(none);
    expect(none.note).toBe(NOT_ENROLLED);
    expect(none.primary).toMatchObject({ kind: "signIn", label: "Sign in" });
  });
});

describe("coursePurchase: plan only, lapsed, unavailable", () => {
  it("plan-only: Android sees plans, iOS follows the paid rule", () => {
    expect(coursePurchase(course({ state: "SUBSCRIPTION_REQUIRED" }), ctx("in-app")).primary).toMatchObject({ kind: "plans", label: "See plans" });
    expectIosRule(coursePurchase(course({ state: "SUBSCRIPTION_REQUIRED" }), ctx("web-link")), "web-link");
    expectIosRule(coursePurchase(course({ state: "SUBSCRIPTION_REQUIRED" }), ctx("none")), "none");
  });
  it("lapsed with a price buys again on Android only, keeping the reason", () => {
    const lapsed: CourseAccess = { state: "LAPSED", reason: "SUBSCRIPTION_ENDED", price: usd(4900) };
    const a = coursePurchase(course(lapsed), ctx("in-app"));
    expect(a.primary).toMatchObject({ kind: "checkout", label: "Buy again" });
    expect(a.secondary).toMatchObject({ kind: "plans" });
    expect(a.note).toMatch(/plan has ended/);
    const i = coursePurchase(course(lapsed), ctx("none"));
    expectNoSelling(i);
    expect(i.primary).toBeNull();
    expect(i.note).toMatch(/plan has ended/);
  });
  it("lapsed without a price after a plan ended points to plans on Android", () => {
    expect(coursePurchase(course({ state: "LAPSED", reason: "SUBSCRIPTION_ENDED", price: null }), ctx("in-app")).primary).toMatchObject({ kind: "plans" });
    expect(coursePurchase(course({ state: "LAPSED", reason: "REVOKED", price: null }), ctx("in-app")).primary).toBeNull();
  });
  it("unavailable explains on Android and stays neutral on iOS", () => {
    expect(coursePurchase(course({ state: "UNAVAILABLE" }), ctx("in-app")).note).toMatch(/not on sale/);
    expect(coursePurchase(course({ state: "UNAVAILABLE" }), ctx("none")).note).toBe(NOT_ENROLLED);
  });
});

describe("bundlePurchase", () => {
  const b = { slug: "data-pack", price: usd(9900), separately: usd(14900), viewerOwnsAll: false };
  it("owners go to their learning on every platform", () => {
    for (const mode of MODES) expect(bundlePurchase({ ...b, viewerOwnsAll: true }, { ...ctx(mode), signedIn: true }).primary).toMatchObject({ kind: "learning" });
  });
  it("Android buys signed in, signs in otherwise", () => {
    const v = bundlePurchase(b, { ...ctx("in-app"), signedIn: true });
    expect(v.primary).toMatchObject({ kind: "checkout", label: "Buy bundle" });
    expect(v.compareAt).toEqual(usd(14900));
    expect(bundlePurchase(b, { ...ctx("in-app"), signedIn: false }).primary).toMatchObject({ kind: "signIn" });
  });
  it("iOS links to the bundle page or shows nothing", () => {
    const web = bundlePurchase(b, { ...ctx("web-link"), signedIn: true });
    expectNoSelling(web);
    expect(web.primary).toMatchObject({ kind: "web", url: "https://learn.example.com/bundles/data-pack" });
    const none = bundlePurchase(b, { ...ctx("none"), signedIn: true });
    expectNoSelling(none);
    expect(none.primary).toBeNull();
  });
});

describe("plans", () => {
  const plan = { id: "p1", trialDays: 0, prices: [{ id: "m", interval: "MONTH" as const, price: usd(1500) }, { id: "y", interval: "YEAR" as const, price: usd(15000) }] };
  const base = (mode: PurchaseMode) => ({ ...ctx(mode), signedIn: true, subscription: null });
  it("subscribes on Android, with the trial wording when there is one", () => {
    expect(planOffer(plan, "MONTH", base("in-app"))).toEqual({ kind: "subscribe", label: "Subscribe", interval: "MONTH" });
    expect(planOffer({ ...plan, trialDays: 7 }, "YEAR", base("in-app"))).toMatchObject({ label: "Start free trial", interval: "YEAR" });
    expect(planOffer(plan, "MONTH", { ...base("in-app"), signedIn: false })).toEqual({ kind: "signIn" });
  });
  it("marks the current plan and blocks a second one", () => {
    expect(planOffer(plan, "MONTH", { ...base("in-app"), subscription: { plan: { id: "p1" } } })).toEqual({ kind: "current" });
    expect(planOffer(plan, "MONTH", { ...base("in-app"), subscription: { plan: { id: "p2" } } })).toEqual({ kind: "hasOther" });
  });
  it("iOS links to the plans page or offers nothing", () => {
    expect(planOffer(plan, "MONTH", base("web-link"))).toEqual({ kind: "web", url: "https://learn.example.com/plans" });
    expect(planOffer(plan, "MONTH", base("none"))).toEqual({ kind: "none" });
  });
  it("knows the billing periods and the yearly saving", () => {
    expect(availableIntervals([plan])).toEqual(["MONTH", "YEAR"]);
    expect(availableIntervals([{ prices: [plan.prices[1]] }])).toEqual(["YEAR"]);
    expect(yearlyNote(plan)).toEqual({ perMonth: usd(1250), savingPercent: 16 });
    expect(planOffer({ ...plan, prices: [plan.prices[0]] }, "YEAR", base("in-app"))).toEqual({ kind: "notSold" });
  });
});
