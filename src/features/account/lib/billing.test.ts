import type { SubscriptionSummary } from "../../../api/vendor/types";
import { fakeOrder, usd } from "../test/utils";
import { POLL_TIMEOUT_MS, blocksDeletion, failureCopy, orderPhase, orderTimeline, pollInterval, startLearningRoute, subscriptionCopy } from "./billing";

describe("order polling", () => {
  it("polls every 2 s while pending, then stops at a final state or after a minute", () => {
    expect(orderPhase(undefined, 0)).toBe("loading");
    expect(pollInterval(undefined, 0)).toBe(2000);
    expect(orderPhase({ status: "PENDING" }, 10_000)).toBe("pending");
    expect(pollInterval({ status: "PENDING" }, 10_000)).toBe(2000);
    expect(orderPhase({ status: "PENDING" }, POLL_TIMEOUT_MS)).toBe("timeout");
    expect(pollInterval({ status: "PENDING" }, POLL_TIMEOUT_MS)).toBe(false);
    expect(orderPhase({ status: "PAID" }, 0)).toBe("paid");
    expect(orderPhase({ status: "PARTIALLY_REFUNDED" }, 0)).toBe("paid");
    expect(orderPhase({ status: "FAILED" }, 0)).toBe("failed");
    expect(orderPhase({ status: "EXPIRED" }, 0)).toBe("failed");
    expect(orderPhase({ status: "CANCELED" }, 0)).toBe("canceled");
    expect(pollInterval({ status: "PAID" }, 0)).toBe(false);
  });
  it("words failure reasons and never shows a raw code", () => {
    expect(failureCopy("CANCELED_BY_BUYER")).toBe("You canceled the payment.");
    expect(failureCopy("SOME_NEW_CODE")).toBe("The payment did not go through. You were not charged.");
    expect(failureCopy("Card declined by bank")).toBe("Card declined by bank");
  });
});

describe("after a purchase", () => {
  it("opens the classroom for one course, else My Learning", () => {
    expect(startLearningRoute(fakeOrder())).toEqual({ name: "Classroom", params: { courseSlug: "intro-to-sql" } });
    expect(startLearningRoute(fakeOrder({ lines: [{ ...fakeOrder().lines[0], type: "BUNDLE" }] }))).toEqual({ name: "Tabs", params: { screen: "Learning" } });
  });
  it("lists the order history", () => {
    expect(orderTimeline(fakeOrder({ status: "PARTIALLY_REFUNDED", refunded: usd(1000) })).map((s) => s.label)).toEqual(["Placed", "Paid", expect.stringContaining("Partly refunded")]);
    expect(orderTimeline(fakeOrder({ status: "PENDING", paidAt: null })).map((s) => s.label)).toEqual(["Placed", "Waiting for payment"]);
  });
});

describe("subscription", () => {
  const base: SubscriptionSummary = { id: "s_1", plan: { id: "p_1", slug: "all", name: "All access" }, status: "ACTIVE", interval: "MONTH", price: usd(1900), currentPeriodEnd: "2099-01-10T00:00:00Z", trialEnd: null, cancelAtPeriodEnd: false, gateway: "STRIPE", grantsAccess: true };
  it("offers cancel when renewing and resume when ending", () => {
    expect(subscriptionCopy(base)).toMatchObject({ status: "Active", canCancel: true, canResume: false });
    expect(subscriptionCopy({ ...base, cancelAtPeriodEnd: true })).toMatchObject({ status: "Ending", canCancel: false, canResume: true });
    expect(subscriptionCopy({ ...base, status: "TRIALING" })).toMatchObject({ status: "Free trial", canCancel: true });
    expect(subscriptionCopy({ ...base, status: "PAST_DUE" }).warning).toBeTruthy();
    expect(subscriptionCopy({ ...base, status: "CANCELED", currentPeriodEnd: "2000-01-01T00:00:00Z", grantsAccess: false })).toMatchObject({ status: "Ended", canCancel: false, canResume: false });
  });
  it("blocks deletion only while it still renews", () => {
    expect(blocksDeletion(base)).toBe(true);
    expect(blocksDeletion({ ...base, cancelAtPeriodEnd: true })).toBe(false);
    expect(blocksDeletion(null)).toBe(false);
  });
});
