# Release

Turning the open-source app into your academy's app in the stores: identity, icons,
configuration, signing, versions, and what to tell App Review. Do these on a fresh clone,
before your first store build.

## 1. Identity

```bash
scripts/rename-app.sh --id org.example.academy --name "Example Academy" --scheme exampleacademy
```

[`scripts/rename-app.sh`](../../scripts/rename-app.sh) edits files in place:

| What | Where |
| --- | --- |
| iOS bundle id | `PRODUCT_BUNDLE_IDENTIFIER` in `ios/OpenLms.xcodeproj/project.pbxproj` |
| iOS display name and URL scheme | `ios/OpenLms/Info.plist` |
| Android application id and namespace | `android/app/build.gradle` |
| Android package directory and `package` lines | `android/app/src/main/java/...` |
| Android app name | `android/app/src/main/res/values/strings.xml` |
| Android URL scheme | `android/app/src/main/AndroidManifest.xml` |
| `APP_SCHEME` | `.env` and `.env.example` |

It validates the id (lowercase reverse DNS) and the scheme. Review the diff, then run
`pnpm pods` and rebuild. The Xcode project, target and scheme stay named `OpenLms`; only
what users and stores see changes.

On the server, add the new scheme to `MOBILE_RETURN_SCHEMES` (for example
`openlms,exampleacademy`), or Stripe purchases will not return to the app
([payments guide](payments.md)). If you use push, register the new ids in Firebase
([push guide](push.md)).

## 2. Icons and launch screen

- iOS: replace the images in `ios/OpenLms/Images.xcassets/AppIcon.appiconset` (Xcode's
  single 1024 pt icon or the full set) and adjust `ios/OpenLms/LaunchScreen.storyboard`.
- Android: replace `ic_launcher` and `ic_launcher_round` in
  `android/app/src/main/res/mipmap-*` (Android Studio's Image Asset tool generates every
  density, including adaptive icons).

## 3. Release configuration

Create the `.env` your release builds use (CI can write it from secrets):

```bash
API_BASE_URL=https://academy.example.com/api
WEB_BASE_URL=https://academy.example.com
APP_SCHEME=exampleacademy
APP_LINK_HOST=
CAPTURE_GUARD=
```

Both URLs must be HTTPS. A release build throws at start if either is empty.
`CAPTURE_GUARD` is ignored in release builds. See [configuration.md](configuration.md).

### App links

`APP_LINK_HOST` makes the app accept `https://<host>/...` links as deep links in JavaScript.
The native side is not in the repository; to have the OS open those links in the app you
need, per platform:

- iOS: the Associated Domains capability with `applinks:<host>` in Xcode, and an
  `apple-app-site-association` file served by the website;
- Android: an `intent-filter` with `android:autoVerify="true"` for `https://<host>` in
  `AndroidManifest.xml`, and `/.well-known/assetlinks.json` on the website.

The euron-open-lms web app does not serve those two files today; host them in front of it.
Without app links, everything works through the custom scheme.

## 4. Signing

**iOS.** Open `ios/OpenLms.xcworkspace`, target `OpenLms`, **Signing & Capabilities**, set
your team (the repository ships with no team, and the sanitization scan rejects a committed
team id). Add capabilities you use (Push Notifications, Associated Domains). Archive with
Product, Archive (scheme `OpenLms`, configuration Release), then distribute through the
Organizer.

**Android.** Create an upload keystore once:

```bash
keytool -genkeypair -v -keystore android/app/upload.keystore -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

and `android/keystore.properties` (git-ignored):

```properties
storeFile=upload.keystore
storePassword=...
keyAlias=upload
keyPassword=...
```

`storeFile` is resolved relative to `android/app`. When the file exists the release build
type signs with it; without it a release build is unsigned. Keystores other than the React
Native debug keystore are git-ignored. Build the bundle for Play:

```bash
cd android && ./gradlew bundleRelease     # android/app/build/outputs/bundle/release/app-release.aab
```

Use Play App Signing so the upload key can be replaced if lost.

## 5. Versions

| | Marketing version | Build number |
| --- | --- | --- |
| iOS | `MARKETING_VERSION` (Xcode: Version) | `CURRENT_PROJECT_VERSION` (Xcode: Build) |
| Android | `versionName` in `android/app/build.gradle` | `versionCode` in the same file |

Both start at `1.0` / `1`. Every store upload needs a higher build number. The app sends
`<version> (<build>)` as `X-App-Version` with every request, and About shows it.
`mobile.minSupportedVersion` on the server is meant for forced updates but the app does not
act on it yet.

## 6. Server contract

The app targets the euron-open-lms version recorded in `src/api/vendor/SOURCE`. Before a
release, run `pnpm sync-types:check` against the server version you deploy; a drift means
the app and server disagree on a shape ([testing](testing.md#api-contract)).

## 7. App Store review

The iOS app is a **reader-style** app: learners sign in to use courses they got on the
academy's website (bought, included in a plan, or free), and the app sells nothing.
Suggested notes for App Review (adapt to your academy):

- "Courses are purchased on our website. The app has no in-app purchases and, with the
  default setting, no links or prices that point to other ways of paying
  (guideline 3.1.3)."
- If you enabled `mobile.iosWebPurchaseLink`: explain which storefront rule or entitlement
  allows the link, since by default guideline 3.1.1 does not.
- Provide a demo account that already has access to a course, so the reviewer can open
  the classroom.
- Account deletion is in the app (Account, Privacy and data, Delete account), as guideline
  5.1.1(v) requires.
- Paid video blocks screenshots and screen recording; mention it so a black recording is
  not reported as a bug.

Fill in the App Privacy questionnaire for what your academy collects (account data, course
activity, purchases, the push token, crash data if you add a crash reporter). The required
reason API declarations are in `ios/OpenLms/PrivacyInfo.xcprivacy`.

## 8. Google Play

Declare in the Data safety form the same data as above, and in the Payments declarations
that digital purchases use the academy's own billing (Razorpay or Stripe). Check Google
Play's current payments policy for your countries before launch. Android release builds
allow cleartext only to `127.0.0.1` (offline video); shrinking is off
(`enableProguardInReleaseBuilds = false`).

## Checklist

- [ ] `rename-app.sh` run, diff reviewed, pods reinstalled
- [ ] Icons and launch screen replaced
- [ ] Release `.env` with HTTPS URLs and your scheme
- [ ] Server: `MOBILE_RETURN_SCHEMES` includes your scheme; push and payments configured
- [ ] Signing: Xcode team; `android/keystore.properties` and the upload keystore kept safe
- [ ] Version and build numbers bumped
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm sanitize && pnpm sync-types:check`
- [ ] Maestro flows pass against a staging server ([testing](testing.md))
- [ ] Tested on a real iPhone and a real Android phone: sign in, video, a download played
      offline, push, an Android purchase
