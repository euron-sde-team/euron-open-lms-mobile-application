# Quickstart

Run a demo academy on your machine with euron-open-lms, then run the app against it on the
iOS simulator or an Android emulator. No cloud account, payment account or Firebase project
is needed.

## 1. Run euron-open-lms

The app is a client of the academy's API, so the server comes first. It needs Docker with
Compose v2 and about 4 GB of memory for the containers.

```bash
git clone https://github.com/euron-sde-team/euron-open-lms.git
cd euron-open-lms
make up      # Postgres, Redis, the AWS emulator, Mailpit, the stubs, migrate, api, worker, web
make demo    # seeds Northwind Academy and prints the demo password
```

When `make up` is done it prints the local addresses. The app uses these:

| Service | Address |
| --- | --- |
| API | http://localhost:5026/api (`/api/ready` answers `{"ok":true}`) |
| Website | http://localhost:3530 |
| S3 emulator (media, PDFs) | http://localhost:4597 |
| Stubs (Stripe, Razorpay, AI, video) | http://localhost:5119 |
| Mail (verification links, receipts) | http://localhost:8046 |

Every demo account signs in with the password `make demo` prints. Two learners are worth
starting with:

| Email | What to look at |
| --- | --- |
| `juniper.vale@example.com` | Has a plan: My Learning, the classroom, a quiz, a certificate |
| `rohan.mehta@example.com` | Pays in INR: Android checkout through Razorpay (the stub locally) |

The server's own guide has the details:
[quickstart-local.md](https://github.com/euron-sde-team/euron-open-lms/blob/main/docs/guides/quickstart-local.md).

## 2. Prerequisites for the app

| Tool | Version |
| --- | --- |
| Node | 22.11 or newer (`.nvmrc` says 22) |
| pnpm | 9 (`corepack enable`; the repository pins `pnpm@9.15.0`) |
| Xcode | 26 or newer, with an iOS simulator (iOS builds, macOS only) |
| Ruby and Bundler | for CocoaPods through the `Gemfile` (`bundle install` once) |
| Android Studio | with Android SDK Platform 36 and 37 (the project compiles against 37 and targets 36), an emulator image |
| JDK | 17 |

## 3. Run the app

```bash
git clone https://github.com/euron-sde-team/euron-open-lms-mobile-application.git
cd euron-open-lms-mobile-application
cp .env.example .env     # localhost defaults that match the stack above
pnpm install
bundle install           # first time only: CocoaPods and friends into vendor/bundle
pnpm pods                # iOS: bundle exec pod install in ios/
pnpm start               # Metro, in its own terminal
```

Then, in another terminal:

```bash
pnpm ios                 # builds and opens the iOS simulator

# or
pnpm android:reverse     # forwards 5026, 3530, 4597, 5119, 8046 and 8081 into the emulator
pnpm android
```

The iOS simulator shares your Mac's `localhost`, so nothing else is needed. The Android
emulator has its own `localhost`; `pnpm android:reverse` forwards the stack's ports so the
same URLs work. Run it again whenever the emulator restarts.

## 4. Try it

1. Browse **Home** and **Explore** as a guest; open a course page and play a free preview.
2. **Account, Sign in** as `juniper.vale@example.com` with the demo password.
3. **My Learning**: continue a course; the classroom plays EVS video (the stub's test
   stream), records progress, and has Notes and Q&A.
4. Open a quiz, answer, submit; open a certificate and its PDF.
5. On Android, sign in as `rohan.mehta@example.com`, open a paid course, **Buy now**, and pay
   on the stub page; the result screen confirms the order.
6. Open a video lesson's settings and download it; the **Downloads** screen plays it with
   the network off.

The [walkthrough](walkthrough.md) follows a learner from install to a certificate and
names the files involved at each step.

## Next

- Platform details: [iOS](ios.md), [Android](android.md)
- Every setting the app reads: [configuration.md](configuration.md)
- Tests and end-to-end flows: [testing.md](testing.md)
- Something did not work: [troubleshooting.md](troubleshooting.md)
