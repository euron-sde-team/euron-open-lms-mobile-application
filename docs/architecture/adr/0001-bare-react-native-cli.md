# ADR 0001: A bare React Native CLI app, not Expo

## Status

Accepted.

## Context

The app needs native code of its own and close control over the native projects:

- a local HTTP server for offline HLS, written in Swift and Kotlin
  ([`modules/loopback-server`](../../../modules/loopback-server/));
- a payment SDK linked on Android only (`react-native-razorpay`, unlinked on iOS in
  [`react-native.config.js`](../../../react-native.config.js)) so the iOS binary carries no
  payment code;
- React Native Firebase, which resolves the Firebase SDK through Swift Package Manager and
  needs dynamic frameworks ([ADR 0006](0006-dynamic-frameworks-on-ios.md));
- screen capture protection (`react-native-screenguard`), Keychain access with explicit
  accessibility classes, orientation locking for fullscreen video;
- hand-written platform security settings: App Transport Security, Android network
  security configs per build type, `allowBackup="false"`, the URL scheme.

Each academy also renames the app (bundle id, name, scheme) and signs it with its own
accounts.

## Decision

A bare React Native app created with `@react-native-community/cli` (React Native 0.87, New
Architecture, Hermes), with the `ios/` and `android/` projects committed and edited
directly. Native dependencies autolink; the loopback server is a local package
(`"open-lms-loopback": "file:./modules/loopback-server"`). Renaming is a script
([`scripts/rename-app.sh`](../../../scripts/rename-app.sh)) that edits the projects in
place.

## Consequences

Positive:

- Every native setting is a reviewed file in the repository, readable in a pull request,
  and the security-relevant ones (ATS, network security config, backups) are visible.
- Native modules are ordinary Swift and Kotlin with no plugin layer in between.
- CI builds with stock `xcodebuild` and Gradle.

Trade-offs:

- React Native upgrades are done by hand against the upgrade helper, including the native
  templates.
- No hosted build service or over-the-air update channel comes with it; releases go through
  the stores.
- Contributors need Xcode, CocoaPods, Android Studio and a JDK locally.

## Alternatives considered

- **Expo (managed, with config plugins and prebuild).** Good for apps that fit its modules;
  here the custom native server, the per-platform linking and the hand-tuned security files
  would all become config plugins that generate what is now plain source.
- **Separate native apps.** Two codebases for one learner client; the web and the app
  already share the API contract in TypeScript.
