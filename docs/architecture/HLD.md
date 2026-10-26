# High-level design

Euron Open LMS Mobile is the iOS and Android learner app for one Euron Open LMS academy. It
is a bare React Native 0.87 app (TypeScript strict, New Architecture, Hermes) that talks to
exactly one server: the academy's euron-open-lms API. Learners browse the catalog as guests,
sign in, learn in the classroom (video, articles, PDFs, quizzes, assignments, notes, Q&A),
earn certificates, save lectures for offline viewing, get push notifications and, on
Android, buy courses, bundles and plans.

This page describes the app as it is built. Deeper topics have their own pages:

| Topic | Page |
| --- | --- |
| Folders, navigation, server state, theming, tests | [app-architecture.md](app-architecture.md) |
| Native token mode, Keychain, refresh, sign out, offline start | [sessions-and-native-tokens.md](sessions-and-native-tokens.md) |
| Playback through the LMS, heartbeats, capture protection | [video-playback.md](video-playback.md) |
| Offline downloads and the loopback server | [offline-downloads.md](offline-downloads.md) |
| Purchases per platform, checkout handoff, order polling | [payments.md](payments.md) |
| Push registration, banners, deep links, preferences | [push.md](push.md) |
| Security controls and known limitations | [security.md](security.md) |
| STRIDE analysis | [threat-model.md](threat-model.md) |
| Decisions and their trade-offs | [adr/](adr/README.md) |

Server behaviour (access rules, pricing, fulfilment, licences) is documented in
[euron-open-lms](https://github.com/euron-sde-team/euron-open-lms/tree/main/docs/architecture);
this repository documents what the app does with it. Code paths are relative to the
repository root.

## 1. System context

![System context: the app talks to the euron-open-lms API and the academy website; video streams from euron-video-system on URLs the LMS minted; payments go to Stripe or Razorpay; push arrives through FCM and APNs](../assets/diagrams/context.svg)

| Party | What the app exchanges with it | Code |
| --- | --- | --- |
| euron-open-lms API (`API_BASE_URL`, including `/api`) | Every read and write: catalog, classroom, progress, quizzes, assignments, certificates, checkout, account, notifications, push devices, download licences. JSON over HTTPS with `X-Client: native` | [`src/api/`](../../src/api/) |
| The academy website (`WEB_BASE_URL`) | The Stripe return page `/checkout/app-return`, public certificate pages `/verify/<serial>`, the iOS "Continue on the website" link, links shared from the app | [`src/config.ts`](../../src/config.ts) |
| euron-video-system (EVS) | Never called by name. The player and the download engine fetch HLS manifests, keys and segments from URLs the LMS returned after its access check | [`src/features/learning/player/source.ts`](../../src/features/learning/player/source.ts) |
| Stripe | Android only: the hosted Checkout page in a Custom Tab, returning through the website to `openlms://checkout/return` | [`src/features/account/CheckoutScreen.tsx`](../../src/features/account/CheckoutScreen.tsx) |
| Razorpay | Android only: the native SDK (`react-native-razorpay`), or the stub page in a WebView against a local stack | same |
| FCM and APNs | Push tokens (`@react-native-firebase/messaging`) registered with the API; messages carry `data.url` | [`src/lib/push.ts`](../../src/lib/push.ts) |
| App Store and Google Play | Distribution. The iOS build never sells inside the app ([ADR 0004](adr/0004-no-in-app-purchase-on-ios-razorpay-on-android.md)) | |

The app holds no server secret. Everything an academy configures at runtime (its name and
logo, currencies, payment routing, whether downloads or push are on, the iOS web purchase
link) comes from `GET /api/meta` ([ADR 0007](adr/0007-server-driven-feature-flags.md)).
Build-time settings are only what the app needs before it can reach the server
([configuration guide](../guides/configuration.md)).

## 2. Layers

| Layer | Folder | Holds | May import |
| --- | --- | --- | --- |
| App shell | [`App.tsx`](../../App.tsx), [`src/app/`](../../src/app/) | Providers, the navigator and route table, deep links, the session, `/api/meta`, query client and keys | everything |
| Features | [`src/features/<area>/`](../../src/features/) | Screens and their pure rules: `catalog`, `learning` (classroom, `player/`, `downloads/`), `assessments` (quiz, assignment, certificate), `account` (profile, security, orders, checkout, `push/`), `auth` | app shell hooks, api, ui, lib |
| API | [`src/api/`](../../src/api/) | The native transport (`http.ts`), the client (`client.ts`) and the vendored contract (`vendor/`: types and endpoint groups copied from euron-open-lms) | nothing app-specific |
| UI kit | [`src/ui/`](../../src/ui/) | Design tokens mirrored from the web, `ThemeProvider`, Text, Button, Layout, Feedback, Inputs, Html, Media | lib |
| Lib | [`src/lib/`](../../src/lib/) | `secure-store.ts` (Keychain/Keystore), `storage.ts` (MMKV prefs), `urls.ts`, `push.ts` | api types |
| Native modules | [`modules/loopback-server/`](../../modules/loopback-server/) | The 127.0.0.1 HTTP server for offline HLS (Swift and Kotlin) | |

Providers in [`App.tsx`](../../App.tsx), outermost first: safe area, theme, TanStack Query,
session, navigation. The navigator mounts two app-wide effects: the downloads lifecycle
(`useDownloadsLifecycle`) and the push bridge (`PushBridge`).

## 3. How a screen gets its data

1. A screen calls a hook (`useQuery` with a key from `qk` in
   [`src/app/query.ts`](../../src/app/query.ts)) whose query function calls the typed client
   from `useApi()`.
2. The client's endpoint group (vendored, identical to the web client) calls
   `HttpClient.request` in [`src/api/http.ts`](../../src/api/http.ts), which adds
   `X-Client: native`, `X-App-Version` and the in-memory access token.
3. A `401` with a refreshable code triggers one shared `POST /auth/refresh`; the rotated
   refresh token is written to the Keychain before the request is retried
   ([sessions](sessions-and-native-tokens.md)).
4. Errors arrive as `ApiError` with a stable `code`; screens switch on the code, never on
   message text, and show an error state with retry.

The app never decides access, price or completion. It renders the server's answer: a
course's `access.state` becomes the purchase bar ([`purchase.ts`](../../src/features/catalog/purchase.ts)),
a quiz countdown follows the server's clock ([`server-clock.ts`](../../src/features/assessments/quiz/server-clock.ts)),
progress is what the server computed from heartbeats.

## 4. Offline

Two things work without a network:

- **Start offline.** When the app launches with a stored session and cannot reach the
  server, the session status is `offline` and the app opens on the Downloads screen only
  ([`src/app/OfflineScreen.tsx`](../../src/app/OfflineScreen.tsx)). It retries when the
  connection returns.
- **Downloaded lectures.** A saved video plays from local files until its licence window
  ends ([offline downloads](offline-downloads.md)).

Everything else waits for the network: TanStack Query pauses queries while offline
(`onlineManager` wired to NetInfo) and refreshes them on return.

## 5. Failure behaviour

| Failure | What the learner sees |
| --- | --- |
| API unreachable at launch, session stored | Downloads only, then the full app once online |
| API unreachable later | Error states with retry on each screen; queries resume on reconnect |
| Refresh token rejected (expired, revoked, reused) | Signed out locally, guest view |
| Network error during refresh | Stays signed in; the request fails and can be retried |
| Signed video URL expires mid-lesson | The player re-mints playback (up to three times) and resumes at the same position |
| Payment confirmation slow | The result screen polls the order for a minute, then offers Refresh |
| No Firebase config in the build | No push, silently |
| Loopback module not linked | Download buttons hidden |
