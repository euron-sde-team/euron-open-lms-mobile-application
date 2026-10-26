# ADR 0004: No purchases inside the iOS app; Razorpay and Stripe on Android

## Status

Accepted.

## Context

Euron Open LMS sells courses, bundles and plans through Stripe and Razorpay, priced from a
server price book with coupons, tax, invoices, refunds and credit notes. The App Store
requires In-App Purchase for digital content unlocked inside an app and restricts buttons or
links to other ways of paying, except where a storefront rule or entitlement allows them.
In-App Purchase would bring a second price list, Apple's own receipts and refunds, and a
revenue share, none of which the LMS models. Google Play allows the alternative billing
these purchases need.

## Decision

- `purchaseMode()` ([`src/app/meta.tsx`](../../../src/app/meta.tsx)) is `in-app` on
  Android, and on iOS `web-link` when the operator has enabled
  `mobile.iosWebPurchaseLink`, else `none`.
- **iOS** never shows a price, a buy button, a coupon field or the checkout screen. With
  `web-link` a paid item shows "Continue on the website", opening the academy's page in the
  system browser; with `none` there is no purchase wording at all. Learners who bought on
  the web sign in and learn (the app is a reader of content bought elsewhere). Managing an
  existing subscription (cancel, resume) is allowed.
- **Android** checks out in the app: the server's quote, an idempotency key per request,
  then the handoff the server chose: Razorpay through its native SDK (or the stub page in a
  WebView against a local stack), or Stripe's hosted page in a Custom Tab that returns
  through the academy's https `/checkout/app-return` page to `openlms://checkout/return`.
- The Razorpay SDK is not linked on iOS at all
  ([`react-native.config.js`](../../../react-native.config.js)).
- The view for every access state and mode is a pure function
  ([`purchase.ts`](../../../src/features/catalog/purchase.ts)) with a test per
  combination.

Details: [payments.md](../payments.md).

## Consequences

Positive:

- One price book, one fulfilment path and one set of receipts for web and Android.
- The iOS build carries no purchase path that review could reject, and the operator, not
  the code, decides whether their storefront allows the website link.

Trade-offs:

- iOS learners cannot buy in the app; academies must explain on their website that iOS
  learners sign in with the account they bought with.
- The operator is responsible for checking App Store rules for their storefront before
  enabling `mobile.iosWebPurchaseLink`.

## Alternatives considered

- **StoreKit In-App Purchase on iOS.** Would need App Store products mirroring the price
  book, receipt validation and Apple-side refunds on the server.
- **Web checkout in a WebView on iOS.** Against the guidelines, and would put a web session
  inside the app.
- **No checkout on Android either.** Simpler, but gives up a purchase path the platform
  allows.
