# iOS

Building and running on the simulator and on a device. Release builds are in
[release.md](release.md).

## Requirements

- macOS with Xcode 26 or newer and an iOS simulator runtime.
- Ruby with Bundler. The repository's `Gemfile` pins CocoaPods; `bundle install` installs it
  into `vendor/bundle` (see `.bundle/config`).
- Node 22.11+ and pnpm 9, then `pnpm install`.

The deployment target is iOS 15.1. The project is `ios/OpenLms.xcworkspace` (always open
the workspace, not the `.xcodeproj`), scheme `OpenLms`, bundle id `com.example.openlms`
until you rename it.

## Pods

```bash
bundle install     # once
pnpm pods          # cd ios && bundle exec pod install
```

Run `pnpm pods` again after `pnpm install` adds or upgrades a native dependency, and after
any change to `ios/Podfile`. The Podfile builds dynamic frameworks (React Native Firebase
needs them) and adds a link fix for the clipboard pod
([ADR 0006](../architecture/adr/0006-dynamic-frameworks-on-ios.md)).

## Run on the simulator

```bash
pnpm start         # Metro
pnpm ios           # react-native run-ios: build, install, launch
```

To pick a simulator: `pnpm ios --simulator "iPhone 17"`. The simulator shares the Mac's
network, so the default `.env` (`http://localhost:5026/api`) reaches a local
euron-open-lms stack directly.

## Run on a device

1. Open `ios/OpenLms.xcworkspace` in Xcode, select the `OpenLms` target, **Signing &
   Capabilities**, and choose your team. The repository ships with no team set.
2. A device cannot reach your Mac's `localhost`. Put your Mac's LAN address in `.env`:

   ```bash
   API_BASE_URL=http://192.168.1.20:5026/api
   WEB_BASE_URL=http://192.168.1.20:3530
   ```

   and make sure the euron-open-lms stack is reachable from the phone on that address.
   `NSAllowsLocalNetworking` in `Info.plist` lets debug and release builds use plain HTTP to
   local network addresses; public hosts must be HTTPS.
3. `react-native-config` bakes `.env` into the build, so rebuild after changing it
   (`pnpm ios --device` or Run in Xcode). Metro must be reachable from the phone too (same
   network; the debug build finds it automatically).

## What is iOS specific

- **No purchases in the app.** Paid items show no price and no buy button; with the admin
  setting `mobile.iosWebPurchaseLink` on, a "Continue on the website" link appears
  ([payments](../architecture/payments.md)). The Razorpay SDK is not linked on iOS.
- **Capture protection** uses the screenguard overlay while paid video plays. For
  screenshots in debug builds set `CAPTURE_GUARD=off` in `.env` and rebuild.
- **Push** needs a Firebase app and APNs; see [push.md](push.md#3-ios). Without
  `GoogleService-Info.plist` the build simply has no push.
- **Keychain on the simulator** persists across app reinstalls; see
  [troubleshooting](troubleshooting.md#keychain-on-the-simulator).
- **Orientation**: the app is portrait except fullscreen video, which locks landscape.

## Clean build

```bash
rm -rf ios/build ~/Library/Developer/Xcode/DerivedData/OpenLms-*
pnpm pods
pnpm ios
```
