/**
 * Test helpers for the account area: render inside the app's providers (Testing Library
 * 14's render is async), and plain fixtures for orders, quotes and the academy meta.
 */
import { NavigationContainer } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { testQueryClient } from "../../../../test/render";
import type { AcademyMeta, CheckoutQuote, Money, Order } from "../../../api/vendor/types";
import { ThemeProvider } from "../../../ui/theme/ThemeProvider";

export async function renderAccount(ui: ReactElement) {
  const client = testQueryClient();
  const utils = await render(
    <ThemeProvider initialMode="light">
      <QueryClientProvider client={client}>
        <NavigationContainer>{ui}</NavigationContainer>
      </QueryClientProvider>
    </ThemeProvider>
  );
  return { client, ...utils };
}

export const usd = (amountMinor: number): Money => ({ amountMinor, currency: "USD" });

export function fakeMeta(over: Partial<AcademyMeta> = {}): AcademyMeta {
  return {
    academyName: "Northwind Academy",
    tagline: "Learn data, one lesson at a time",
    logoUrl: null,
    registration: "OPEN",
    currencies: ["USD", "INR"],
    defaultCurrency: "USD",
    payments: { stripe: { enabled: true, publishableKey: null }, razorpay: { enabled: true, keyId: "rzp_test", checkoutScriptUrl: "" }, routing: { USD: "STRIPE", INR: "RAZORPAY" } },
    subscriptions: true,
    ai: { quizGeneration: false, gradingAssist: false, polish: false },
    support: { email: "help@example.com" },
    mobile: { iosWebPurchaseLink: false, minSupportedVersion: null, downloadsEnabled: false, pushEnabled: false, appReturnSchemes: ["openlms"] },
    ...over,
  } as AcademyMeta;
}

export function fakeOrder(over: Partial<Order> = {}): Order {
  return {
    id: "o_1",
    number: "ORD-0001",
    kind: "ONE_TIME",
    status: "PAID",
    gateway: "STRIPE",
    lines: [{ type: "COURSE", id: "c_1", title: "Intro to SQL", slug: "intro-to-sql", unit: usd(4900), discount: usd(0), tax: usd(0), total: usd(4900) }],
    subtotal: usd(4900),
    discount: usd(0),
    tax: usd(0),
    total: usd(4900),
    refunded: usd(0),
    couponCode: null,
    taxLabel: null,
    failureReason: null,
    paidAt: "2026-10-01T10:00:00.000Z",
    createdAt: "2026-10-01T09:59:00.000Z",
    invoice: { id: "inv_1", number: "INV-0001", ready: true },
    continueTo: "/learn/intro-to-sql",
    ...over,
  };
}

export function fakeQuote(over: Partial<CheckoutQuote> = {}): CheckoutQuote {
  return {
    currency: "USD",
    lines: [{ type: "COURSE", id: "c_1", title: "Intro to SQL", unit: usd(4900), discount: usd(0), tax: usd(0), total: usd(4900) }],
    subtotal: usd(4900),
    discount: usd(0),
    tax: usd(0),
    total: usd(4900),
    taxLabel: null,
    taxMode: "EXCLUSIVE",
    coupon: null,
    couponError: null,
    gateway: "STRIPE",
    kind: "ONE_TIME",
    recurring: null,
    alreadyOwned: false,
    ...over,
  };
}
