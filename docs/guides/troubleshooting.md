# Troubleshooting

## Metro

**"Unable to load script" or a red screen about the bundle.** Metro is not running or the
device cannot reach it. Run `pnpm start` in its own terminal. On Android, run
`pnpm android:reverse` (it forwards 8081 too). On a physical device, keep the phone on the
same network as the Mac.

**Stale code or odd module errors after switching branches.**

```bash
pnpm start --reset-cache
```

**`.env` changes have no effect.** `react-native-config` bakes `.env` into the native build.
Rebuild (`pnpm ios` / `pnpm android`); reloading JavaScript is not enough.

## CocoaPods and iOS builds

**`pod install` fails or uses the wrong CocoaPods.** Install through the `Gemfile`:
`bundle install`, then `pnpm pods` (which runs `bundle exec pod install`).

**Build errors after `pnpm install` added a native package.** Run `pnpm pods` again, then
build.

**Link errors such as undefined `UTType` or `_OBJC_CLASS_$_UTType` symbols.** The pods are
dynamic frameworks ([ADR 0006](../architecture/adr/0006-dynamic-frameworks-on-ios.md)); a
pod that uses system type identifier APIs without declaring the frameworks fails to link.
The Podfile fixes `RNCClipboard`; add any other failing pod's target name to the list in the
`post_install` hook, then `pnpm pods`.

**Everything else on iOS.** Clean and rebuild:

```bash
rm -rf ios/build ~/Library/Developer/Xcode/DerivedData/OpenLms-*
pnpm pods && pnpm ios
```

## Android connections

**The app on the emulator shows "Cannot reach the academy".** The emulator's `localhost` is
not your Mac's. Run `pnpm android:reverse` (again after every emulator restart) and check
`curl -s localhost:5026/api/ready` answers on the Mac.

**`adb: no devices/emulators found`.** Start the emulator first, or check `adb devices` for a
USB device that has not authorised debugging.

**A physical device on Wi-Fi cannot connect.** Use the Mac's LAN address in `.env`, rebuild,
and make sure the stack listens on that interface and the media URLs it returns are reachable
too ([Android guide](android.md#run-on-a-device)). Or use USB with `pnpm android:reverse`.

**`CLEARTEXT communication ... not permitted` in a release build.** Release builds allow
HTTPS only (and `127.0.0.1`). Point `API_BASE_URL` and `WEB_BASE_URL` at HTTPS, or test
against a local stack with a debug build.

**Gradle uses the wrong Java.** The project needs JDK 17: set `JAVA_HOME`, then
`cd android && ./gradlew --stop && ./gradlew clean`.

## Signing in

**"The server did not return a native session. Update euron-open-lms."** The server is older
than native token mode ([ADR 0020 there](https://github.com/euron-sde-team/euron-open-lms/blob/main/docs/architecture/adr/0020-native-token-mode.md)).
Update it.

**Signed out on every launch.** The refresh is being rejected: the server's refresh secret
changed (a fresh `make env`), or the database was reset. Sign in again.

### Keychain on the simulator

The iOS Keychain survives deleting the app on the simulator, so a reinstalled build may start
signed in as the previous account (or try to refresh a session from a database you reset).
Sign out in the app, or erase the simulator (Device, Erase All Content and Settings). The
Maestro flows clear it with `clearKeychain`.

## Video

**Black screenshots or recordings of a lesson.** That is capture protection (`FLAG_SECURE` on
Android, the overlay on iOS) for paid video. For QA screenshots set `CAPTURE_GUARD=off` in
`.env` and rebuild a **debug** build; release builds always protect.

**"This video is still processing".** The LMS has not received the EVS ready event yet. Wait,
or check the server's video setup ([video guide](video-with-euron-video-system.md)).

**Video plays on the iOS simulator but not on the Android emulator.** Port 5119 (the video
stub) or 4597 (the S3 emulator) is not forwarded: `pnpm android:reverse`.

## Downloads

**No download button.** Every switch must be on: the academy's offline setting
(`mobile.downloadsEnabled`), the course's Allow downloads, a signed-in learner (not a
preview), and the native loopback module linked (rebuild after `pnpm install`).

**"This video's format cannot be saved for offline viewing".** The stream has a separate
audio rendition, rotating keys, `SAMPLE-AES` or DRM
([limitations](../architecture/offline-downloads.md#9-limitations)).

**A saved video says it expired.** It has not been revalidated within the academy's
`learning.offline.days`. Open the app online; a valid licence comes back.

## Push is off

Check in order:

1. `GET /api/meta` reports `mobile.pushEnabled: true` (the server's `PUSH_PROVIDER` is `fcm`
   with a service account key, or `stub` locally, which records but never delivers).
2. The build has the Firebase config file (`android/app/google-services.json`, or on iOS
   the plist added to the target plus the steps in the [push guide](push.md#3-ios)).
3. The permission was granted. The app asks once, after sign-in; after a refusal it never
   asks again. Use Notification settings, Open settings, or reinstall the app.
4. On iOS, test on a device with the APNs key uploaded to Firebase.

## Payments

**Stripe returns to the browser instead of the app.** The server's `MOBILE_RETURN_SCHEMES`
does not include the app's scheme, or `WEB_BASE_URL` is not the academy's website
([payments guide](payments.md)).

**"Another checkout is open".** A payment for the same item was started a moment ago. Finish
or close it, or wait for the order to expire.

**No buy button on iOS.** By design ([ADR 0004](../architecture/adr/0004-no-in-app-purchase-on-ios-razorpay-on-android.md)).
