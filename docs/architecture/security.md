# Security

The security controls of the app, what each one protects and where it lives. The server
enforces every access, price and grading rule; the app's job is to keep the session and
downloaded keys on the device, keep the network honest, refuse links that are not the
academy's, and not leak anything to other apps. Server controls:
[security.md in euron-open-lms](https://github.com/euron-sde-team/euron-open-lms/blob/main/docs/architecture/security.md).
The STRIDE table is in [threat-model.md](threat-model.md). Reporting: [SECURITY.md](../../SECURITY.md).

## 1. The client is not trusted

The app never decides access, price, completion or grades. It renders the server's
decisions (`access.state`, quotes, `ProgressResult`, attempt results), and every endpoint
re-checks on the server. Removing a check from the app, or patching the app, gains nothing
the API would not give to a hand-written HTTP client with the same session.

## 2. Storage on the device

| Data | Where | Protection |
| --- | --- | --- |
| Refresh token, its expiry, user id | Keychain / Keystore (`react-native-keychain`, service `open-lms.session`) | `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`: not synced, not restored to another device |
| Access token | Memory only | Gone when the process ends |
| AES-128 keys of downloaded lectures | Keychain / Keystore (`open-lms.download.<itemId>`), then loopback server memory while playing | Same accessibility; never written to a file |
| Downloaded segments and MP4 files | `DocumentDir/downloads/<itemId>/` | App sandbox; excluded from iCloud backup; Android `allowBackup="false"` |
| Preferences (theme, downloads index, installation id, push token, checkout idempotency keys, cached `/api/meta`) | MMKV | Not secret by design |
| Certificate and invoice PDFs, data export | Cache directory | Fetched for the owner only, through authenticated calls |

Nothing secret is written to MMKV or logged; there is no `console` logging in `src/`.

## 3. Transport

- **HTTPS only in release builds.** iOS App Transport Security keeps
  `NSAllowsArbitraryLoads` false and sets only `NSAllowsLocalNetworking`, which permits
  plain HTTP to local addresses (the loopback server, and a local stack on the simulator).
  Android release builds use
  [`src/main/res/xml/network_security_config.xml`](../../android/app/src/main/res/xml/network_security_config.xml):
  cleartext is refused everywhere except `127.0.0.1`.
- **Cleartext for development is debug only.** Android debug builds override the config
  ([`src/debug/res/xml/network_security_config.xml`](../../android/app/src/debug/res/xml/network_security_config.xml))
  and the React Native Gradle plugin sets `usesCleartextTraffic` for debug, so a debug build
  reaches `http://localhost:5026` through `adb reverse` or a LAN address.
- **No cookies.** Requests send `credentials: "omit"` and `X-Client: native`; the refresh
  token travels only in the bodies of `/auth/refresh` and `/auth/logout`.
- **Release configuration is checked at start.** A release build throws if `API_BASE_URL`
  or `WEB_BASE_URL` is missing instead of silently pointing at localhost
  ([`src/config.ts`](../../src/config.ts)). Use `https://` URLs for release.
- There is no certificate pinning (see limitations).

## 4. Sessions

Rotating refresh tokens with single-flight refresh, the rotated token stored before use,
reuse detection and family revocation on the server, local sign-out that always succeeds,
"Sign out everywhere", and a per-session list where any other device can be signed out.
Details: [sessions-and-native-tokens.md](sessions-and-native-tokens.md).

## 5. Links in and out

- **Inbound links** (the `openlms://` scheme, app links when `APP_LINK_HOST` is set, push
  `data.url`, notification rows, an order's `continueTo`) are parsed by React Navigation's
  own parser against the route table in [`linking.ts`](../../src/app/linking.ts) or by
  `routeForPath()` in [`account/lib/links.ts`](../../src/features/account/lib/links.ts).
  Only paths the app knows open a screen; `toAppUrl()` accepts only the app's prefixes and
  links on the academy website's host; anything else is ignored. A link carries only ids and
  slugs: the screen it opens loads its data through the API, which checks access, so a
  crafted link can at most open a screen the learner could open anyway.
- **Outbound links** go through `safeExternalUrl()` ([`urls.ts`](../../src/lib/urls.ts)):
  only `http` and `https` leave the app; `javascript:`, `file:`, `intent:` and anything
  unparsable are dropped. This covers links in server HTML, course and bundle resources,
  instructor websites, the iOS website link and the certificate PDF URL.
- `openAppLink()` and `openPath()` navigate (never reset), so Back returns to where the
  learner was.

## 6. WebViews and browsers

- **No session in a web view.** The app never injects a token or a cookie into a WebView,
  Custom Tab or browser.
- The only in-app WebViews are the YouTube iframe player and, against a local stack only,
  the Razorpay stub page. The stub WebView is `incognito`, has `sharedCookiesEnabled`
  false, allows only `http`, `https` and the app's own scheme in `originWhitelist`, loads
  only `http(s)` navigations and intercepts `<scheme>://checkout/razorpay` itself.
- Stripe Checkout opens in a Custom Tab, isolated from the app.
- Server HTML (articles, descriptions, quiz prompts, feedback) is sanitised by the server
  and rendered as native text by `react-native-render-html`, not in a WebView; links open in
  the system browser.

## 7. Paid video

Playback URLs come only from the server after its access check, are short lived and are
re-minted on expiry. While paid video plays the app sets screen capture protection
(`FLAG_SECURE` on Android, the screenguard overlay on iOS) and draws a drifting watermark
with the learner's identity. Offline copies are licences revalidated against access and
deleted when revoked. Details: [video-playback.md](video-playback.md),
[offline-downloads.md](offline-downloads.md).

`CAPTURE_GUARD=off` turns capture protection off in **debug** builds only; release builds
ignore the variable.

## 8. The loopback server

Bound to `127.0.0.1` on a random port; every path must start with a 128-bit random token
compared in constant time; `GET`/`HEAD` only; path segments restricted to
`[A-Za-z0-9._-]`, no `.` or `..`, resolved path confined to the downloads root; keys
served from memory with `Cache-Control: no-store`. Another app on the same phone that scans
loopback ports finds a server that answers `404` to everything without the token.

## 9. Payments

The app never sends an amount; the server prices from its price book and fulfils only after
the gateway's confirmation and an amount check. Razorpay confirmations are verified on the
server (signature in constant time, then the payment fetched from Razorpay). The Stripe
return goes through an https page on the academy's origin that only hands off to schemes
in `MOBILE_RETURN_SCHEMES`. Idempotency keys make a retried Pay tap return the same order.
iOS has no purchase path at all. Details: [payments.md](payments.md).

## 10. Release signing and secrets

- **Nothing that identifies a real project is committed.** `.env`, `google-services.json`,
  `GoogleService-Info.plist`, `android/keystore.properties` and every keystore except the
  React Native debug keystore are git-ignored.
- **The sanitization scan** ([`scripts/check-sanitization.sh`](../../scripts/check-sanitization.sh),
  `pnpm sanitize`, run in CI on every push) fails on cloud keys, private keys, Stripe and
  Razorpay live credentials, Google and Firebase API keys, an Apple team id in a signing
  setting, Firebase config or signing material in the tree, committed env files, real email
  addresses and public IP addresses.
- **gitleaks** scans the full history with the repository's
  [`.gitleaks.toml`](../../.gitleaks.toml) in the opt-in
  [security workflow](../../.github/workflows-full/security.yml), alongside CodeQL and
  `pnpm audit`.
- **Release signing** uses the academy's own Apple team (set in Xcode) and an Android
  upload keystore described by `android/keystore.properties`; without that file a release
  build is unsigned. See the [release guide](../guides/release.md).

## 11. Known limitations

| Limitation | Why it is acceptable, or what would fix it |
| --- | --- |
| No certificate pinning | Relies on the platform trust store. A device with a user-installed root CA (a corporate proxy, an attacker with physical access) can read traffic. Pinning would need a rotation story per academy |
| Capture protection is a deterrent | An external camera, or a rooted or jailbroken device, can still capture. The watermark ties a leak to an account |
| Offline copies are not DRM | Keys are in the Keychain and segments on disk; a jailbroken or rooted device can extract both. MP4 and unencrypted HLS copies are plain files in the sandbox. FairPlay/Widevine offline licences would need DRM packaging in EVS |
| Offline expiry uses the device clock | Moving the clock back extends offline playback until the next online check |
| Custom URL schemes can be claimed by other apps | A malicious app registering `openlms://` could receive return links. They carry only an order id (harmless) or, against the local stubs, Razorpay stub fields. Universal links / App Links on `APP_LINK_HOST` avoid this but need per-academy setup |
| `openlms://verify-email?token=` adopts the session it returns | A crafted link with an attacker's own unused verification token would sign the phone into the attacker's account (a login CSRF). Tracked as open in the [threat model](threat-model.md) |
| `mobile.minSupportedVersion` is not enforced | The app reads it from `/api/meta` but shows no update prompt yet |
| Code shrinking is off for release Android builds | `enableProguardInReleaseBuilds = false` in `android/app/build.gradle`; the JavaScript bundle is Hermes bytecode either way. Turning R8 on needs keep rules for the native modules |
