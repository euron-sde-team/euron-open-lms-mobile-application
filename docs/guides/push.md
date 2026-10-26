# Push notifications setup

Push needs three things: a Firebase project with your app registered in it, the platform
config files in your build, and the euron-open-lms server sending through FCM. Until all
three are in place the app runs without push, and the Notification settings screen shows
"This academy does not send push notifications yet" instead of the push switches. How push behaves in the app: [push.md](../architecture/push.md).

## 1. Firebase project

1. Create a Firebase project (or use your academy's).
2. Add an **Android app** with your application id (`com.example.openlms` until you run
   [`scripts/rename-app.sh`](../../scripts/rename-app.sh)) and download
   `google-services.json`.
3. Add an **iOS app** with your bundle id and download `GoogleService-Info.plist`.
4. For iOS delivery: in the Apple Developer account create an APNs authentication key
   (`.p8`), then upload it in the Firebase console under Project settings, Cloud Messaging,
   Apple app configuration. FCM fronts APNs from then on; the server needs no Apple key.

These files identify a real project. They are git-ignored and the sanitization scan fails if
one is committed; keep them in your CI secrets or a private overlay.

## 2. Android

Put the file at `android/app/google-services.json`. The Gradle build applies the Google
services plugin only when that file exists
([`android/app/build.gradle`](../../android/app/build.gradle)), so nothing else changes.
Rebuild with `pnpm android`. The manifest already declares `POST_NOTIFICATIONS` for Android
13+.

## 3. iOS

The repository is not wired for Firebase on iOS beyond the pods, so these steps are needed:

1. Put the file at `ios/OpenLms/GoogleService-Info.plist` and add it to the `OpenLms`
   target in Xcode (drag it into the project, "Copy items if needed", target checked).
2. In **Signing & Capabilities**, add **Push Notifications** (Xcode creates the
   entitlements file) and check that **Background Modes, Remote notifications** is on
   (`UIBackgroundModes` already lists `remote-notification` in `Info.plist`).
3. Initialise Firebase at launch. [`AppDelegate.swift`](../../ios/OpenLms/AppDelegate.swift)
   does not call `FirebaseApp.configure()` today; React Native Firebase needs it on iOS. Add
   `import FirebaseCore` and call `FirebaseApp.configure()` at the start of
   `application(_:didFinishLaunchingWithOptions:)`.
4. `pnpm pods`, then build on a **device** (the simulator's push support is limited; test
   delivery on hardware).

Without these steps the iOS build has no Firebase app, `getPushMessaging()` returns null and
push is off without errors.

## 4. The server

On euron-open-lms set:

```bash
PUSH_PROVIDER=fcm
FCM_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","client_email":"...","private_key":"..."}'
```

The service account key comes from the same Firebase project (Project settings, Service
accounts, Generate new private key). It is a secret: store it like the payment keys (on AWS
the server's Terraform creates `<prefix>/push`). `GET /api/meta` then reports
`mobile.pushEnabled: true` and the app starts registering devices. Server reference:
[configuration.md, push](https://github.com/euron-sde-team/euron-open-lms/blob/main/docs/guides/configuration.md)
and [ADR 0021](https://github.com/euron-sde-team/euron-open-lms/blob/main/docs/architecture/adr/0021-push-through-fcm-http-v1.md).

## 5. Locally

The local stack runs `PUSH_PROVIDER=stub`: the server sends to the stubs, which record
messages at `http://localhost:5119/fcm/messages` instead of delivering them. That exercises
the server path (which notifications are pushed, the payload and its `data.url`) without
Firebase. Delivery to a phone needs a real Firebase project, the config files above and
`PUSH_PROVIDER=fcm` with a service account key on the server you run.

## 6. Check it works

1. Sign in on a device. After about 1.5 s the app asks for notification permission (once).
2. Notification settings shows the push category switches without an "Allow
   notifications" button; the server has a row for the device (`PUT /api/my/devices`).
3. Trigger a notification (reply to the learner's Q&A question from another account, or
   grade an assignment). With the app open a banner slides in; with the app in the
   background the system notification opens the matching screen when tapped.
4. Sign out: the device row is deleted and the token is dropped.

If nothing arrives, see [troubleshooting](troubleshooting.md#push-is-off).
