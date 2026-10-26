# Android

Building and running on an emulator and on a device. Release builds are in
[release.md](release.md).

## Requirements

- Android Studio with the Android SDK: platform 37 (compile) and 36 (target), build tools
  37, NDK 27.1, an emulator image (a Google APIs image if you want to try push).
- JDK 17 (`JAVA_HOME` pointing at it).
- Node 22.11+ and pnpm 9, then `pnpm install`.

Minimum SDK is 24 (Android 7.0). The application id is `com.example.openlms` until you
rename it.

## Run on an emulator

```bash
pnpm start             # Metro
pnpm android:reverse   # forward the local stack's ports into the emulator
pnpm android           # react-native run-android: build, install, launch
```

The emulator has its own `localhost`. [`scripts/android-reverse.sh`](../../scripts/android-reverse.sh)
runs `adb reverse` for every connected device on ports 5026 (API), 3530 (website), 4597
(S3 emulator), 5119 (stubs), 8046 (mail) and 8081 (Metro), so the default `.env`
(`http://localhost:5026/api`) works unchanged. Forwarding is lost when the emulator
restarts: run `pnpm android:reverse` again.

## Run on a device

**USB:** enable USB debugging, connect, check `adb devices`, then `pnpm android:reverse`
and `pnpm android`, exactly as with an emulator.

**Wi-Fi without `adb reverse`:** put your machine's LAN address in `.env` and rebuild
(`react-native-config` reads `.env` at build time):

```bash
API_BASE_URL=http://192.168.1.20:5026/api
WEB_BASE_URL=http://192.168.1.20:3530
```

Media URLs the API returns (the S3 emulator, the video stub) also have to be reachable from
the phone; with a LAN setup that means configuring the euron-open-lms stack's public URLs on
the same address, or using `adb reverse` over USB instead.

## Cleartext HTTP in debug builds

A local stack speaks plain HTTP. Debug builds allow it:

- [`android/app/src/debug/res/xml/network_security_config.xml`](../../android/app/src/debug/res/xml/network_security_config.xml)
  permits cleartext everywhere, overriding the main config for the debug build type only;
- the React Native Gradle plugin sets `usesCleartextTraffic` to true for debug.

Release builds use [`src/main/res/xml/network_security_config.xml`](../../android/app/src/main/res/xml/network_security_config.xml):
HTTPS everywhere, cleartext only to `127.0.0.1` for the offline video loopback server. A
release build pointed at an `http://` API will fail every request: use HTTPS.

## What is Android specific

- **Checkout in the app**: Razorpay through its native SDK (the stub page in a WebView
  against a local stack) and Stripe in a Custom Tab
  ([payments](../architecture/payments.md)).
- **Capture protection** sets `FLAG_SECURE` while paid video plays: screenshots and
  recordings are black and the app is blanked in the recent apps view. For screenshots in
  debug builds set `CAPTURE_GUARD=off` and rebuild.
- **Notifications permission**: Android 13+ asks for `POST_NOTIFICATIONS` once, after the
  first sign-in, never at launch ([push](../architecture/push.md)).
- **Backups** are off (`android:allowBackup="false"`).
- **Back** leaves fullscreen video before it leaves the screen.

## Clean build

```bash
cd android && ./gradlew clean && cd ..
pnpm android
```
