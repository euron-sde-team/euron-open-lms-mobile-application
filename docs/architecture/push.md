# Push notifications

The app hears about the same things as the inbox and email: a reviewed assignment, a Q&A
reply, a certificate, a receipt. The server sends through Firebase Cloud Messaging HTTP v1
(Android directly, iOS through APNs, which FCM fronts once the APNs key is uploaded to the
Firebase project); see
[ADR 0021 in euron-open-lms](https://github.com/euron-sde-team/euron-open-lms/blob/main/docs/architecture/adr/0021-push-through-fcm-http-v1.md).
This page is the app side. Setup: [push guide](../guides/push.md).

Code: [`src/lib/push.ts`](../../src/lib/push.ts),
[`account/push/usePushRegistration.ts`](../../src/features/account/push/usePushRegistration.ts),
[`account/push/PushBridge.tsx`](../../src/features/account/push/PushBridge.tsx),
[`account/NotificationSettingsScreen.tsx`](../../src/features/account/NotificationSettingsScreen.tsx),
[`account/lib/links.ts`](../../src/features/account/lib/links.ts).

## 1. When push is on

Push runs only when all of these hold, decided by the pure `pushDecision()` (unit tested):

| Condition | Source |
| --- | --- |
| The server can send | `mobile.pushEnabled` in `/api/meta` (the server's `PUSH_PROVIDER` is not `none`) |
| This build has a Firebase app | `getMessaging(getApp())` succeeds, which needs the platform config file (`google-services.json` on Android, `GoogleService-Info.plist` on iOS) |
| A learner is signed in | session status |
| The OS permission is granted, or not asked yet | see below |

A build without Firebase config files has no push and shows no error: `getPushMessaging()`
returns null and every path stays inert. The Notification settings screen then shows the
same line as when the server sends no push ("This academy does not send push notifications
yet. You still get them in the app and by email.") instead of the push switches. This is how the open-source checkout runs: the config files carry
a real Firebase project's identity, so they are never in the repository (the sanitization
scan fails if one is added).

## 2. Registration

[`PushBridge`](../../src/features/account/push/PushBridge.tsx) is mounted once inside the
navigation container and runs `usePushRegistration()`:

1. **Never at launch.** The permission prompt is not shown when the app opens. After a
   learner signs in, if the permission is undetermined and the app has never asked, it waits
   1.5 s (so the prompt does not cover the screen that just opened) and asks once. The time
   of asking is stored in MMKV (`push.asked`), so a refusal is never asked again; the
   settings screen links to the system settings instead.
2. **Android 13+** asks for the `POST_NOTIFICATIONS` runtime permission (declared in the
   manifest); older Android needs no prompt. iOS shows the system alert through
   `requestPermission`; provisional and ephemeral grants count as granted.
3. With permission, the app gets the FCM token and registers it:
   `PUT /api/my/devices { platform: IOS | ANDROID, token, appVersion, locale }`. The server
   upserts by token and moves a token to whoever is signed in now. The token is kept in MMKV
   (`push.token`) so sign-out can name this device. Each account is registered once per
   app run.
4. **Token refresh.** `onTokenRefresh` re-registers the new token while signed in.

## 3. Receiving

| App state | Behaviour |
| --- | --- |
| Foreground | `onMessage` refreshes the notifications query and shows an in-app banner over every screen (title and body, `account-push-banner`), which leaves after 4 s. Tapping it opens the message's link |
| Background, tapped | `onNotificationOpenedApp` opens the link |
| Not running, tapped | `getInitialNotification` opens the link once navigation is ready (it retries for up to 5 s) |

Each message carries `data.url`, the same inbox link the email uses (an app path such as
`/learn/<course>/<item>` or `/account/orders/<id>`). `openPath()` maps it to a screen;
anything that is not the academy's is ignored. iOS declares the `remote-notification`
background mode in `Info.plist`.

## 4. Preferences

The Notification settings screen has per-category switches for email and for push
(`emailPreferences` and `pushPreferences` on the account, saved at once with an optimistic
update): Learning, Questions and reviews, Billing reminders, News and new courses. Receipts,
refunds, access changes and security messages have no category and always send; they show
as on and locked. The server applies the preferences before sending
(`PUSH_DEFAULTS`: everything on except product updates). The push section also shows this
phone's permission state with a button to ask or to open the system settings.

## 5. Sign out

Signing out of this device first deletes the device on the server
(`DELETE /api/my/devices/:token`) while the session still works, then names it again in
`POST /api/auth/logout { deviceToken }`, then deletes the FCM token locally so the next
person on the phone gets a fresh one. "Sign out everywhere" removes every device of the
account on the server. See [sessions](sessions-and-native-tokens.md#6-sign-out).

## 6. Known gaps

- **iOS Firebase initialisation.** [`ios/OpenLms/AppDelegate.swift`](../../ios/OpenLms/AppDelegate.swift)
  does not call `FirebaseApp.configure()`, and the iOS project has no entitlements file with
  the Push Notifications capability. React Native Firebase needs both on iOS, so adding
  `GoogleService-Info.plist` alone is not expected to turn push on there; the
  [push guide](../guides/push.md#3-ios) lists the steps. Android needs only
  `google-services.json`: the Gradle build applies the Google services plugin when the file
  exists.
- Pushes are best effort on the server (a failed send is not retried for that device).
