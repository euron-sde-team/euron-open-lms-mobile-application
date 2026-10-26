# Payments setup

What the app needs from you to sell, per platform. The rules and the flow are in
[payments.md](../architecture/payments.md); gateway accounts, webhooks, test cards,
currencies and tax are configured on the server
([euron-open-lms payments guide](https://github.com/euron-sde-team/euron-open-lms/blob/main/docs/guides/payments.md)).

## Keys live on the server

The app holds no payment secret and no live key. The Razorpay key id it opens the SDK with
arrives in each checkout handoff from the server; Stripe Checkout is a hosted page the server
created. Switching from test to live is a server change (its Stripe and Razorpay keys and
webhook secrets); the same app build works with both.

## Android

**Razorpay.** Nothing to configure in the app: `react-native-razorpay` is linked on Android
and opens with the order the server created. Against a local stack the server answers
`mode: stub` (its `RAZORPAY_CHECKOUT_SCRIPT_URL` points at the stubs) and the app opens the
stub page in a WebView instead; press **Pay** there. In Razorpay test mode the server guide
lists test cards and UPI ids (`success@razorpay`).

**Stripe.** The app starts Stripe checkout with
`returnUrl = <WEB_BASE_URL>/checkout/app-return?app=<APP_SCHEME>`. For that to come back
into the app:

1. `WEB_BASE_URL` in `.env` is the academy's website, served by euron-open-lms's web app
   (which hosts `/checkout/app-return`).
2. The server's `MOBILE_RETURN_SCHEMES` includes your `APP_SCHEME` (`openlms` by default; add
   yours after renaming the app). Otherwise the page shows its fallback with no app link.
3. The scheme is registered in the Android manifest (`rename-app.sh` does it).

Stripe opens in a Custom Tab; a learner who closes it after paying is still caught (the app
asks the server about the order once).

## iOS

There is no checkout on iOS. Two choices, both server settings:

| `mobile.iosWebPurchaseLink` | Paid items on iOS show |
| --- | --- |
| off (default) | No price, no purchase wording; "Not enrolled yet", and "Sign in" for guests |
| on | "Available on <academy>'s website" and **Continue on the website**, opening the course, bundle or plans page in the browser |

Turn it on only if your App Store storefront and entitlements allow linking out for digital
purchases; check Apple's current App Review Guidelines (3.1.1 and 3.1.3) for your storefront.
Either way, learners who bought on the website sign in on iOS and learn.

For review notes and reader-app wording see [release.md](release.md#7-app-store-review).

## Try it locally

1. `make up && make demo` in euron-open-lms, the app running on an Android emulator with
   `pnpm android:reverse`.
2. Sign in as `rohan.mehta@example.com` (pays in INR, routed to Razorpay), or sign up a fresh
   learner with an address on a reserved domain (for example `you@example.test`).
3. Open a paid course you do not own, **Buy now**, check the quote (GST for India), **Pay**,
   then **Pay** on the stub page. The result screen shows "You are enrolled".
4. A USD buyer goes to the Stripe stand-in instead, through the website's return page.
