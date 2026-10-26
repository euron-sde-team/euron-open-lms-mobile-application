# Configuration

The app has two kinds of settings: a handful of build-time values in `.env`, and
everything else, which the academy's server sends at runtime from `GET /api/meta`
([ADR 0007](../architecture/adr/0007-server-driven-feature-flags.md)). A change to `.env`
needs a rebuild; a change on the server reaches installed apps within minutes.

## Build time: `.env`

Copy [`.env.example`](../../.env.example) to `.env`. `react-native-config` reads it when the
native app is built (Gradle and Xcode), and [`src/config.ts`](../../src/config.ts) is the
only place that reads `Config`. `.env` is git-ignored.

| Key | Default in `.env.example` | Meaning |
| --- | --- | --- |
| `API_BASE_URL` | `http://localhost:5026/api` | The euron-open-lms API, **including** `/api`. Trailing slashes are trimmed. Required in release builds (the app throws at start without it); debug builds fall back to the localhost default |
| `WEB_BASE_URL` | `http://localhost:3530` | The academy's website: the Stripe return page (`/checkout/app-return`), public certificate pages (`/verify/<serial>`), the iOS "Continue on the website" link, deep links from the website's host. Required in release builds |
| `APP_SCHEME` | `openlms` | The URL scheme for deep links and payment returns. Must match `ios/OpenLms/Info.plist` and `android/app/src/main/AndroidManifest.xml`; [`scripts/rename-app.sh`](../../scripts/rename-app.sh) changes all three. The server must allow it in `MOBILE_RETURN_SCHEMES` |
| `APP_LINK_HOST` | empty | Optional: the academy's domain (no scheme) for universal links and Android App Links. When set, `https://<host>/...` links are also accepted as deep links. The native associated-domains and intent-filter setup is not in the repository; see [release.md](release.md#app-links) |
| `CAPTURE_GUARD` | empty | Debug builds only: `off` lets screenshots and screen recordings of paid video work, for QA and documentation. Release builds ignore it and always protect |

Use `https://` URLs for release builds: Android release builds refuse cleartext to anything
but `127.0.0.1`, and iOS allows plain HTTP only to local network addresses.

For a physical device on Wi-Fi, use your machine's LAN address instead of `localhost`
([iOS](ios.md#run-on-a-device), [Android](android.md#run-on-a-device)).

## Runtime: what the app reads from `/api/meta`

[`src/app/meta.tsx`](../../src/app/meta.tsx) fetches `GET /api/meta`, caches it in MMKV
across launches and refreshes it after five minutes. An older server that sends no `mobile`
block is read as every mobile switch off.

| Field | Used for |
| --- | --- |
| `academyName`, `tagline` | Home, the auth screens, About, the Razorpay sheet title, copy such as "Available on <academy>'s website" |
| `registration` | `CLOSED` replaces sign-up with "Registration is closed" |
| `currencies`, `defaultCurrency` | The checkout currency: the account's preferred currency when the academy sells in it, else the default (no picker) |
| `subscriptions` | Whether the Home tab shows the plan teaser (only where this device may point to plans) |
| `support.email` | The Support row on About |
| `mobile.iosWebPurchaseLink` | iOS only: show "Continue on the website" on paid items. Off means no purchase wording on iOS at all |
| `mobile.downloadsEnabled` | Offer offline downloads (the academy's `learning.offline.enabled`) |
| `mobile.pushEnabled` | The server can send push (`PUSH_PROVIDER` is not `none`) |
| `mobile.minSupportedVersion` | Read, but not acted on yet: the app shows no update prompt |
| `mobile.appReturnSchemes` | Not read by the app; the website's return page uses it |

## Server settings that change the app

Set these on the euron-open-lms side. The full reference is the server's
[configuration guide](https://github.com/euron-sde-team/euron-open-lms/blob/main/docs/guides/configuration.md).

**Admin settings** (`/admin`, Settings):

| Setting | Default | Effect in the app |
| --- | --- | --- |
| `mobile.iosWebPurchaseLink` | false | The iOS website link above. Check your App Store storefront's rules first ([payments](../architecture/payments.md#why-ios-sells-nothing-in-the-app)) |
| `mobile.minSupportedVersion` | null | Reserved for an update prompt (not enforced by the app yet) |
| `learning.offline.enabled` | true | Downloads offered at all |
| `learning.offline.days` | 30 | How long a saved video plays without the app checking in |
| `learning.offline.maxPerUser` | 25 | Active downloads per learner across devices (`DOWNLOAD_LIMIT_REACHED` beyond it) |
| A course's **Allow downloads** (`allowDownloads`) | on | Downloads offered for that course |
| `learning.videoCompletePercent` | 90 | Watched share after which a video counts as complete (computed on the server from heartbeats) |
| Currencies and gateway routing | USD on Stripe, INR on Razorpay | Which Android handoff a purchase gets |

**Server environment:**

| Variable | Effect in the app |
| --- | --- |
| `MOBILE_RETURN_SCHEMES` (default `openlms`) | Schemes the Stripe return page may open. Add your scheme after renaming the app |
| `PUSH_PROVIDER` (`none`, `fcm`, `stub`) and `FCM_SERVICE_ACCOUNT_JSON` | Whether pushes are sent ([push guide](push.md)) |
| `RAZORPAY_CHECKOUT_SCRIPT_URL` | Pointing at the stubs makes the Razorpay handoff `mode: stub`, so Android opens the stub page in a WebView instead of the SDK |
| Stripe and Razorpay keys | Live keys live only on the server ([payments guide](payments.md)) |
| EVS settings | Video playback ([video guide](video-with-euron-video-system.md)) |

## Per-device preferences

Stored in MMKV on the phone, never sent to the server: the theme (system, light, dark; the
Appearance screen), autoplay of the next lesson (the player's settings), whether the push
permission was asked, the installation id used for download licences. Notification
categories are account settings stored on the server (the Notification settings screen).
