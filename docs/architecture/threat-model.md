# Threat model

A STRIDE analysis of the mobile app as built, against an euron-open-lms server deployed with
its production defaults. Server-side threats (webhooks, pricing, access rules, the admin
plane) are analysed in
[threat-model.md in euron-open-lms](https://github.com/euron-sde-team/euron-open-lms/blob/main/docs/architecture/threat-model.md);
this page covers what the app adds. Controls are described in [security.md](security.md).
**Accepted** means a design choice; **open** means a known gap that should be fixed; the
rating (low, medium, high) is the impact on a typical academy if exploited.

## Scope and trust boundaries

| Boundary | Crossing |
| --- | --- |
| TB1 | The app to the euron-open-lms API over the internet (TLS, `X-Client: native`, bearer token) |
| TB2 | The app to third parties on URLs the API handed out: EVS manifests, keys and segments; Stripe's hosted page in a Custom Tab; the Razorpay SDK; FCM |
| TB3 | Other apps on the same phone: URL schemes and app links into the app, the share sheet out, the loopback port |
| TB4 | The device itself: the Keychain/Keystore, the app sandbox, backups, screen capture, the clock |

| Principal | Holds |
| --- | --- |
| Guest | Nothing; reads the public catalog and free previews |
| Learner | A refresh token in the keystore, an access token in memory, download keys, downloaded segments |
| Another app on the phone | Can send links to the app's scheme, scan loopback ports, read shared files |
| Someone holding the unlocked phone | Everything the learner can do in the app |
| A network attacker | Can observe and modify traffic it can intercept |

## Spoofing

| Threat | Control | Status |
| --- | --- | --- |
| Replaying a stolen refresh token | Rotation on every use; reuse after the grace revokes the family on the server; the app single-flights refresh so it never trips this itself | Accepted, low |
| Reading the refresh token from storage | Keychain/Keystore, `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, never in MMKV or logs | Accepted, low |
| Another app registering `openlms://` and receiving return links | Return links carry only an order id; the order is read with the learner's session, never the link's. Custom schemes are first come; app links on `APP_LINK_HOST` close this | Accepted, low |
| A crafted `openlms://verify-email?token=<attacker's token>` signing the phone into the attacker's account | None in the app: `VerifyEmailScreen` adopts any session the server returns for the token | **Open, medium.** Fix: only adopt when signed out, or ask for confirmation showing the account's email |
| A man-in-the-middle presenting a certificate from a user-installed root CA | Platform trust store only | Accepted (no pinning), medium |

## Tampering

| Threat | Control | Status |
| --- | --- | --- |
| Patching the app to unlock content or change prices | The server decides access and price on every request; the app only renders | Accepted, low |
| Forging progress or completion | The server counts watched time from beats against its own clock and keeps the furthest mark; completion is computed on the server | Accepted, low (server rules) |
| Changing the device clock to extend a quiz | The countdown follows the server's clock offset; the server enforces the deadline | Accepted, low |
| Changing the device clock to extend offline playback | Expiry uses the device clock offline; the next online check applies the server's answer and deletes revoked copies | Accepted, low |
| A path traversal into the loopback server's files | Token prefix, segment allow-list, no `.` or `..`, canonical path confined to the root, regular files only | Accepted, low |
| Injecting links that open screens or external URLs | Inbound paths only match known routes; outbound URLs only `http(s)` through `safeExternalUrl()` | Accepted, low |
| A crafted `openlms://checkout/return?orderId=<own order>&canceled=1` | Cancels only the learner's own still-pending order (server checks ownership) | Accepted, low |

## Repudiation

| Threat | Control | Status |
| --- | --- | --- |
| Denying a purchase made in the app | Orders, gateway references and invoices are recorded on the server; idempotency keys tie retries to one order | Accepted, low |
| Denying a session reuse | The server audits `session.reuse_detected`; the Sessions screen shows every device | Accepted, low |

## Information disclosure

| Threat | Control | Status |
| --- | --- | --- |
| Screenshots or recordings of paid video | `FLAG_SECURE` / iOS capture overlay while paid video plays; release builds ignore `CAPTURE_GUARD=off` | Accepted, medium (deterrent only) |
| Recording with an external camera, or capture on a rooted device | The drifting watermark with the learner's identity | Accepted, medium |
| Extracting downloaded lectures from a rooted or jailbroken phone | Keys only in the Keychain and loopback memory; segments as delivered (AES-128 for encrypted EVS streams); not DRM | Accepted, medium |
| MP4 and unencrypted HLS copies as plain files | App sandbox, excluded from backup | Accepted, medium |
| Another app reading downloads through the loopback port | 128-bit random path token, constant-time compare, `127.0.0.1` only | Accepted, low |
| Backups carrying tokens or files to another device | `THIS_DEVICE_ONLY` keychain items; download folders excluded from iCloud backup; Android `allowBackup="false"` | Accepted, low |
| Another account on a shared phone seeing the previous learner's data | Sign-out clears the query cache and the keystore entry; a different account signing in deletes the previous learner's downloads and keys | Accepted, low |
| Downloads left on the phone after sign-out | They stay until expiry, another account signs in, or the learner deletes them (the Account tab says so); they still need the device to be unlocked to read the key | Accepted, low |
| Tokens leaking into a WebView or browser | No token is ever passed to a WebView, Custom Tab or share sheet; the stub WebView is incognito without shared cookies | Accepted, low |
| Push payloads on the lock screen | The notification shows the same title and body as the email; per-category preferences let learners turn categories off | Accepted, low |
| Credentials in the public repository | Sanitization scan on every push, gitleaks on the full history, config files git-ignored | Accepted, low |

## Denial of service

| Threat | Control | Status |
| --- | --- | --- |
| A flaky network signing the learner out | A network error during refresh never signs out; only a `401`/`403` from `/auth/refresh` does | Accepted, low |
| Starting with no network | `offline` status opens Downloads, retries when the connection returns | Accepted, low |
| Large downloads filling the phone | One rendition at most 720p; a per-learner licence cap on the server; the Downloads screen shows the storage used and deletes all at once. The app does not check free space before starting | Accepted, low |
| Polling storms | Order polling stops after a minute; queries do not retry `4xx`; refetch on focus only | Accepted, low |

## Elevation of privilege

| Threat | Control | Status |
| --- | --- | --- |
| Reaching staff features from the app | The app has no admin screens; staff use `/admin` on the web; the API checks roles | Accepted, low |
| Buying on iOS around store rules | No purchase path on iOS; the website link only when the operator enables it | Accepted (policy) |
| Using an old app version with known flaws | `mobile.minSupportedVersion` exists on the server but the app does not enforce it | **Open, low.** Fix: compare with `DeviceInfo.getVersion()` at start and show an update screen |
