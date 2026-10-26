# App architecture

How the code is organised and the rules each part follows. The system around the app is in
[HLD.md](HLD.md).

## 1. Folders

```
App.tsx                      providers: safe area, theme, query client, session, navigator
index.js                     registers the root component
src/
  config.ts                  build-time settings from .env (react-native-config)
  app/
    Navigator.tsx            every route; tabs + pushed screens + the modal auth group
    routes.ts                RootParams and TabParams: the only route names screens may use
    linking.ts               deep-link table and toAppUrl()
    navigation-ref.ts        openAppLink(), requireSignIn() for code outside screens
    session.tsx              SessionProvider, useSession(), useApi()
    meta.tsx                 useMeta(), mobileFlags(), purchaseMode()
    query.ts                 QueryClient defaults, online/focus wiring, the qk key factory
    TabBar.tsx               the bottom bar
    OfflineScreen.tsx        launch without a network: Downloads only
  api/
    http.ts                  native transport (X-Client: native, single-flight refresh)
    client.ts                createApiClient(): vendored endpoint groups + session calls
    vendor/                  COPIED from euron-open-lms by `pnpm sync-types`; never edited
  features/
    auth/                    sign in, sign up, two-step code, forgot password, verify email
    catalog/                 Home, Explore, Course, Bundle, Plans, Instructor, Reviews
    learning/                My Learning, Classroom, Downloads
      classroom/             video lesson, article/PDF panels, lesson rows, notes, Q&A
      player/                Player, Scrubber, Watermark, heartbeat, protect, source
      downloads/             engine, hls, loopback, state, useDownloads
    assessments/             quiz/, assignment/, certificate/
    account/                 Account tab, profile, security, sessions, notifications,
                             orders, subscription, checkout, privacy, about
      push/                  PushBridge and usePushRegistration
      lib/                   checkout, billing, links, signout, format (pure, tested)
  lib/
    secure-store.ts          Keychain / Keystore: refresh token, download keys
    storage.ts               MMKV prefs and the PREF key list
    urls.ts                  safeExternalUrl(), joinUrl()
    push.ts                  FCM permission, token registration, pushDecision()
  ui/
    theme/                   tokens.ts (palette, type, radii, spacing), ThemeProvider.tsx
    components/              Text, Button, Layout, Feedback, Inputs, Html, Media, sheets
modules/loopback-server/     native module "open-lms-loopback" (iOS Swift, Android Kotlin)
scripts/                     sync-types, sanitization scan, rename-app, android-reverse
test/                        Jest setup (native mocks), render helpers
ios/  android/               native projects (bundle id com.example.openlms)
```

Each feature exports its screens from `src/features/<area>/index.ts`, and
[`Navigator.tsx`](../../src/app/Navigator.tsx) registers them. Pure rules sit next to the
screens that use them as plain TypeScript (`purchase.ts`, `heartbeat.ts`, `hls.ts`,
`state.ts`, `checkout.ts`, `quiz-state.ts`) so they are unit tested without rendering.

## 2. Navigation

React Navigation 7: a native stack whose first route is a bottom tab navigator with four
tabs (Home, Explore, My Learning, Account), then every pushed screen, then a group presented
as a modal: `SignIn`, `SignUp`, `CheckEmail`, `ForgotPassword`, `VerifyEmail`.

- **One tree for guests and learners.** There is no separate signed-out navigator. A guest
  browses the catalog, opens course pages, reads the public curriculum and plays free
  previews. A screen that needs a session checks `useSession().status` itself and shows a
  sign-in prompt, so a deep link into a lesson while signed out asks to sign in instead of
  losing the link.
- **Sign-in is a modal.** Signing in dismisses the modal (`navigation.goBack()`), so the
  learner lands back on the course they were looking at. Code outside screens calls
  `requireSignIn()` from [`navigation-ref.ts`](../../src/app/navigation-ref.ts).
- **Typed routes.** [`routes.ts`](../../src/app/routes.ts) declares every route and its
  params, and registers them as React Navigation's global `RootParamList`, so a renamed
  route fails the typecheck.
- **Boot gate.** While the session is `booting` the navigator shows a spinner; when it is
  `offline` it renders [`OfflineScreen`](../../src/app/OfflineScreen.tsx) instead of the
  tree ([sessions](sessions-and-native-tokens.md)).

### Deep links

[`linking.ts`](../../src/app/linking.ts) maps the website's paths onto screens, so a link in
an email, a push (`data.url`) or the app's own scheme opens the same thing the website
would:

| Path | Screen |
| --- | --- |
| `/` , `/courses`, `/my-learning/:tab?`, `/account` | the tabs |
| `/courses/:slug`, `/bundles/:slug`, `/plans` | Course, Bundle, Plans |
| `/learn/:courseSlug/:itemId?` | Classroom |
| `/verify/:serial`, `/certificates/:serial` | Certificate |
| `/account/orders`, `/account/orders/:id`, `/account/subscription` | Orders, Order, Subscription |
| `/account/{sessions,security,notifications,profile}` | the account screens |
| `/notifications`, `/downloads` | Notifications, Downloads |
| `/verify-email?token=` | VerifyEmail |
| `/checkout/return?orderId=` (alias `/checkout/success`) | CheckoutResult |
| `/login`, `/signup` | the auth modal |

Prefixes: `<APP_SCHEME>://` always, and `https://<APP_LINK_HOST>` when an app link host is
configured. `toAppUrl()` also accepts a link on the academy website's host and rewrites it
onto the scheme. Server-sent paths (notification `href`, push `data.url`, an order's
`continueTo`) go through `openPath()` in
[`features/account/lib/links.ts`](../../src/features/account/lib/links.ts), which knows a
few more account paths than the linking table and falls back to it; anything that is not
the academy's is ignored.

## 3. Server state

TanStack Query v5 holds every server answer. Defaults in
[`query.ts`](../../src/app/query.ts): `staleTime` 30 s, `gcTime` 10 minutes, one retry for
network failures and none for `4xx`, no retry for mutations, refetch on focus. NetInfo
drives `onlineManager` and `AppState` drives `focusManager`, so queries pause offline and
refresh when the app returns to the foreground.

Query keys come from the `qk` factory in the same file (`qk.course(slug)`,
`qk.classroom(slug)`, `qk.order(id)`, ...). Features that add keys build them under a `qk`
prefix (for example [`account/lib/keys.ts`](../../src/features/account/lib/keys.ts)), so
invalidating the shared key also refreshes them. Catalog hooks append the viewer to the key
([`catalog/hooks.ts`](../../src/features/catalog/hooks.ts)): a page cached for a guest is
never shown after signing in, while a prefix invalidation still reaches it.

Lists use keyset pages (`nextCursor`) with `useInfiniteQuery` and `FlatList`. Playback is
never cached (`staleTime: Infinity`, `gcTime: 0`): a minted session is single use.

`/api/meta` is cached in MMKV between launches ([`meta.tsx`](../../src/app/meta.tsx)) so the
academy's name shows before the network answers; `mobileFlags()` reads the mobile switches
with everything off for an older server that does not send them.

Small non-secret state lives in MMKV through [`lib/storage.ts`](../../src/lib/storage.ts)
(theme, the downloads index, the installation id, the push token, checkout idempotency
keys, autoplay). Secrets never go there.

## 4. Session

[`session.tsx`](../../src/app/session.tsx) owns the session: status (`booting`,
`signedOut`, `signedIn`, `offline`), the signed-in `me`, and the API client. The access
token lives in a ref (memory only); the refresh token lives in the Keychain or Keystore.
The transport refreshes once for all concurrent `401`s. Signing out always succeeds
locally. Details: [sessions-and-native-tokens.md](sessions-and-native-tokens.md).

## 5. Theming and design tokens

[`src/ui/theme/tokens.ts`](../../src/ui/theme/tokens.ts) holds the same palette as the
web app's `packages/ui/src/styles/tokens.css` in euron-open-lms, kept as HSL so the two
files compare line by line ([ADR 0008](adr/0008-design-tokens-mirrored-from-the-web.md)):
one teal brand, ink for text and solid calls to action, cool grey grounds and hairlines,
light and dark palettes. It also defines radii (10 pt buttons, 20 pt course cards), a 4 pt
spacing scale, the type scale, and the fonts (Bricolage Grotesque for display, Hanken
Grotesk for body, bundled under the SIL Open Font License in `src/assets/fonts`).

[`ThemeProvider`](../../src/ui/theme/ThemeProvider.tsx) resolves light, dark or the system
setting (remembered in MMKV). Screens read colours with `useTheme()` and never hardcode
one. Visual rules the components enforce: no pill buttons or chips (choices are underline
`Tabs` or `ChoiceList` rows), no box inside a box (sections are type on hairlines), facts
as text rather than badges, unboxed icon actions, 44 pt touch targets.

## 6. Testing approach

- **Unit tests** for every pure rule, next to the code (`*.test.ts`): purchase views,
  heartbeats, capture protection, HLS parsing and rewriting, the download state machine,
  the download engine with injected platform dependencies, checkout idempotency and
  handoff routes, links, quiz state, autosave, the server clock, push decisions, the
  transport's refresh.
- **Render tests** for main screens with React Native Testing Library and a fake session
  (`renderWithProviders()` and `FakeSession` in [`test/render.tsx`](../../test/render.tsx)).
- **Native modules are mocked once** in [`test/setup.ts`](../../test/setup.ts), so no test
  needs a device.
- **Contract drift** is a CI job: `pnpm sync-types:check` compares `src/api/vendor` with the
  server ([ADR 0002](adr/0002-vendored-api-contract-with-a-drift-check.md)).
- **End to end**: Maestro flows in [`e2e/flows`](../../e2e/README.md) against a local
  euron-open-lms stack.

How to run each: [testing guide](../guides/testing.md).
