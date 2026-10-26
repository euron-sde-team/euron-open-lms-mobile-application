import type { CheckoutHandoff } from "../../../api/vendor/types";
import { fakeOrder, fakeQuote, usd } from "../test/utils";
import {
  billingFor,
  checkoutCurrency,
  clearIdempotencyKey,
  couponView,
  guessCountry,
  handoffRoute,
  idempotencyKeyFor,
  parseRazorpayReturn,
  parseStripeReturn,
  payLabel,
  razorpayFailure,
  requestFingerprint,
  runHandoff,
  stripeReturnUrl,
  taxLineLabel,
  type HandoffDeps,
  type KeyStore,
} from "./checkout";

const razorpay = (over: Partial<Extract<CheckoutHandoff, { type: "RAZORPAY_MODAL" }>> = {}): CheckoutHandoff => ({
  type: "RAZORPAY_MODAL",
  orderId: "o_1",
  orderNumber: "ORD-1",
  keyId: "rzp_test",
  scriptUrl: "",
  razorpayOrderId: "order_R1",
  subscriptionId: null,
  amountMinor: 49900,
  currency: "INR",
  name: "Northwind",
  description: "Intro to SQL",
  prefill: { name: "Juniper", email: "j@example.com" },
  mode: "native",
  checkoutPageUrl: null,
  ...over,
});

const success = { razorpay_payment_id: "pay_1", razorpay_order_id: "order_R1", razorpay_signature: "abcdef0123456789" };

function deps(over: Partial<HandoffDeps> = {}): HandoffDeps {
  return {
    openRazorpay: jest.fn(async () => success),
    openStubPage: jest.fn(async () => ({ kind: "success" as const, payload: success })),
    openRedirect: jest.fn(async () => "openlms://checkout/return?orderId=o_9&session_id=cs_1"),
    confirm: jest.fn(async () => fakeOrder()),
    syncOrder: jest.fn(async () => fakeOrder({ status: "PENDING" })),
    cancelOrder: jest.fn(async () => undefined),
    scheme: "openlms",
    academyName: "Northwind Academy",
    brandHex: "#0e7c8c",
    ...over,
  };
}

describe("handoff routing", () => {
  it("picks the route for each handoff", () => {
    expect(handoffRoute({ type: "FULFILLED", orderId: "o", orderNumber: "n" })).toBe("FULFILLED");
    expect(handoffRoute({ type: "REDIRECT", orderId: "o", orderNumber: "n", url: "https://stripe.test" })).toBe("REDIRECT");
    expect(handoffRoute(razorpay())).toBe("RAZORPAY_NATIVE");
    expect(handoffRoute(razorpay({ mode: "stub", checkoutPageUrl: "http://stubs.test/page?x=1" }))).toBe("RAZORPAY_STUB");
    // A stub handoff without a page falls back to the SDK.
    expect(handoffRoute(razorpay({ mode: "stub", checkoutPageUrl: null }))).toBe("RAZORPAY_NATIVE");
  });

  it("FREE: goes straight to the result without any gateway", async () => {
    const d = deps();
    expect(await runHandoff({ type: "FULFILLED", orderId: "o_1", orderNumber: "n" }, d)).toEqual({ kind: "result", orderId: "o_1" });
    expect(d.openRazorpay).not.toHaveBeenCalled();
    expect(d.openRedirect).not.toHaveBeenCalled();
  });

  it("Razorpay native: opens the SDK with the order, the academy name and brand colour, then confirms", async () => {
    const d = deps();
    expect(await runHandoff(razorpay(), d)).toEqual({ kind: "result", orderId: "o_1" });
    expect(d.openRazorpay).toHaveBeenCalledWith(expect.objectContaining({ key: "rzp_test", order_id: "order_R1", name: "Northwind Academy", theme: { color: "#0e7c8c" }, prefill: { name: "Juniper", email: "j@example.com" } }));
    expect(d.confirm).toHaveBeenCalledWith({ orderId: "o_1", ...success });
  });

  it("Razorpay native: subscriptions pass subscription_id, not an order", async () => {
    const d = deps();
    await runHandoff(razorpay({ razorpayOrderId: null, subscriptionId: "sub_1" }), d);
    const opts = (d.openRazorpay as jest.Mock).mock.calls[0][0];
    expect(opts.subscription_id).toBe("sub_1");
    expect(opts.order_id).toBeUndefined();
  });

  it("Razorpay native: closing the sheet is a calm dismissal; a real failure says why", async () => {
    expect(await runHandoff(razorpay(), deps({ openRazorpay: jest.fn(async () => Promise.reject({ code: 0, description: "Payment Cancelled" })) }))).toEqual({ kind: "dismissed", orderId: "o_1" });
    const failed = await runHandoff(razorpay(), deps({ openRazorpay: jest.fn(async () => Promise.reject({ code: 2, description: JSON.stringify({ error: { description: "Card declined.", reason: "payment_failed" } }) })) }));
    expect(failed).toEqual({ kind: "failed", orderId: "o_1", message: "Card declined. You were not charged." });
  });

  it("Razorpay: a failed confirm after paying goes to the result screen, which polls", async () => {
    expect(await runHandoff(razorpay(), deps({ confirm: jest.fn(async () => Promise.reject(new Error("offline"))) }))).toEqual({ kind: "confirm-error", orderId: "o_1" });
  });

  it("Razorpay stub: opens the stub page with the app's return link and confirms its payload", async () => {
    const d = deps();
    expect(await runHandoff(razorpay({ mode: "stub", checkoutPageUrl: "http://stubs.test/page?key=k" }), d)).toEqual({ kind: "result", orderId: "o_1" });
    expect(d.openStubPage).toHaveBeenCalledWith(`http://stubs.test/page?key=k&redirect=${encodeURIComponent("openlms://checkout/razorpay")}`);
    expect(d.confirm).toHaveBeenCalledWith({ orderId: "o_1", ...success });
    expect(await runHandoff(razorpay({ mode: "stub", checkoutPageUrl: "http://s" }), deps({ openStubPage: jest.fn(async () => ({ kind: "canceled" as const })) }))).toEqual({ kind: "dismissed", orderId: "o_1" });
  });

  it("Stripe: opens the Custom Tab on the return link and follows the returned order", async () => {
    const d = deps();
    expect(await runHandoff({ type: "REDIRECT", orderId: "o_9", orderNumber: "n", url: "https://checkout.stripe.test/cs_1" }, d)).toEqual({ kind: "result", orderId: "o_9" });
    expect(d.openRedirect).toHaveBeenCalledWith("https://checkout.stripe.test/cs_1", "openlms://checkout/return");
  });

  it("Stripe: a cancel closes the unpaid order and returns to the quote", async () => {
    const d = deps({ openRedirect: jest.fn(async () => "openlms://checkout/return?orderId=o_9&canceled=1") });
    expect(await runHandoff({ type: "REDIRECT", orderId: "o_9", orderNumber: "n", url: "https://s" }, d)).toEqual({ kind: "dismissed", orderId: "o_9" });
    expect(d.cancelOrder).toHaveBeenCalledWith("o_9");
  });

  it("Stripe: a tab closed by hand asks the server once; paid means the result", async () => {
    expect(await runHandoff({ type: "REDIRECT", orderId: "o_9", orderNumber: "n", url: "https://s" }, deps({ openRedirect: jest.fn(async () => null) }))).toEqual({ kind: "dismissed", orderId: "o_9" });
    expect(await runHandoff({ type: "REDIRECT", orderId: "o_9", orderNumber: "n", url: "https://s" }, deps({ openRedirect: jest.fn(async () => null), syncOrder: jest.fn(async () => fakeOrder()) }))).toEqual({ kind: "result", orderId: "o_9" });
  });

  it("parses the return links", () => {
    expect(parseRazorpayReturn("openlms://checkout/razorpay?razorpay_payment_id=pay_1&razorpay_subscription_id=sub_1&razorpay_signature=ab12")).toEqual({ kind: "success", payload: { razorpay_payment_id: "pay_1", razorpay_subscription_id: "sub_1", razorpay_signature: "ab12" } });
    expect(parseRazorpayReturn("openlms://checkout/razorpay?canceled=1")).toEqual({ kind: "canceled" });
    expect(parseRazorpayReturn("openlms://checkout/razorpay?error=payment_failed&payment_id=p")).toEqual({ kind: "failed" });
    expect(parseStripeReturn("openlms://checkout/return?orderId=o_1&canceled=1")).toEqual({ orderId: "o_1", canceled: true });
    expect(stripeReturnUrl("http://web.test/", "openlms")).toBe("http://web.test/checkout/app-return?app=openlms");
    expect(razorpayFailure({ description: "Payment processing cancelled by user" })).toBeNull();
  });
});

describe("idempotency key", () => {
  const memory = (): KeyStore & { map: Map<string, string> } => {
    const map = new Map<string, string>();
    return { map, get: (k) => map.get(k), set: (k, v) => {
      map.set(k, v);
    }, remove: (k) => {
      map.delete(k);
    } };
  };
  const item = { type: "COURSE" as const, id: "c_1" };
  const req = { item: { type: "COURSE" as const, id: "c_1" }, currency: "USD", billing: { name: "J", country: "US" } };

  it("reuses the key for the same request and makes a new one when the request changes", () => {
    const store = memory();
    let n = 0;
    const gen = () => `key_${++n}aaaaaa`;
    const fp = requestFingerprint(req);
    const k1 = idempotencyKeyFor(item, fp, store, gen);
    expect(idempotencyKeyFor(item, fp, store, gen)).toBe(k1);
    const k2 = idempotencyKeyFor(item, requestFingerprint({ ...req, couponCode: "SAVE10" }), store, gen);
    expect(k2).not.toBe(k1);
    clearIdempotencyKey(item, store);
    expect(idempotencyKeyFor(item, fp, store, gen)).not.toBe(k2);
  });

  it("makes keys the server accepts", () => {
    const k = idempotencyKeyFor(item, "fp", memory());
    expect(k).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
  });
});

describe("quote copy", () => {
  it("labels pay, tax and coupons", () => {
    expect(payLabel(fakeQuote())).toContain("49.00");
    expect(payLabel(fakeQuote({ gateway: "FREE", total: usd(0) }))).toBe("Get access");
    expect(payLabel(fakeQuote({ recurring: { price: usd(1900), interval: "MONTH", trialDays: 7 } }))).toBe("Start free trial");
    expect(taxLineLabel(fakeQuote({ tax: usd(882), taxLabel: "GST", subtotal: usd(4900), total: usd(5782) }))).toBe("GST (18%)");
    expect(couponView(fakeQuote({ couponError: "EXPIRED" }), "OLD")).toEqual({ state: "error", code: "OLD", message: "This code has expired." });
    expect(couponView(fakeQuote({ coupon: { code: "SAVE10", description: null, kind: "PERCENT", percentOff: 10, amountOff: null } }), "SAVE10")).toEqual({ state: "applied", code: "SAVE10", label: "SAVE10 · 10% off" });
  });
  it("chooses the currency and billing defaults", () => {
    expect(checkoutCurrency({ currencies: ["USD", "INR"], defaultCurrency: "USD" }, { preferredCurrency: "INR" })).toBe("INR");
    expect(checkoutCurrency({ currencies: ["USD"], defaultCurrency: "USD" }, { preferredCurrency: "EUR" })).toBe("USD");
    expect(guessCountry("INR", "en-US")).toBe("IN");
    expect(guessCountry("USD", "en-GB")).toBe("GB");
    expect(guessCountry("USD", "en")).toBe("");
    expect(billingFor({ name: " J ", country: "", taxId: "" })).toBeUndefined();
    expect(billingFor({ name: " J ", country: "IN", taxId: " 29ABC " })).toEqual({ name: "J", country: "IN", taxId: "29ABC" });
  });
});
