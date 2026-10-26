# End-to-end flows

[Maestro](https://maestro.mobile.dev) flows that drive the debug app on a simulator or
emulator against a real, local euron-open-lms stack. They tap through the app the way a
learner does, using the `testID`s on the screens (named `<area>-<thing>`), so a renamed id
breaks a flow, not a user.

The flows cannot run without a server: every one of them talks to the API, the video
stand-in and (for checkout) the Razorpay stand-in that `make up` starts in euron-open-lms.

## What they cover

| Flow | Journey | Platform | Account and demo data |
| --- | --- | --- | --- |
| [`01-browse-guest`](flows/01-browse-guest.yaml) | Home, search on Explore, a paid and a free course page, My Learning asks to sign in | both | guest; `practical-sql`, `git-and-code-review` |
| [`02-sign-in`](flows/02-sign-in.yaml) | Wrong password shows an error, sign in, session restored after a restart | both | `juniper.vale@example.com` |
| [`03-classroom-video`](flows/03-classroom-video.yaml) | Classroom, a video lesson with the app's controls, the settings sheet, Next | both | juniper (All-Access plan); `practical-sql`, "Your first SELECT" |
| [`04-quiz`](flows/04-quiz.yaml) | Start or resume an attempt, answer, review, submit, the result | both | juniper; `practical-sql`, "Quiz: joins and aggregation" |
| [`05-assignment-submit`](flows/05-assignment-submit.yaml) | Write and submit a project answer, see it waiting for review | both | juniper; `building-reliable-apis`, "Harden a checkout endpoint" |
| [`06-certificate`](flows/06-certificate.yaml) | My Learning, Certificates, one certificate with its serial and share actions | both | juniper (has a certificate) |
| [`07-android-purchase-razorpay-stub`](flows/07-android-purchase-razorpay-stub.yaml) | Buy a course in INR: quote with GST, the stub Razorpay page in a WebView, the result screen, start learning | Android | `rohan.mehta@example.com` (pays in INR); `practical-sql` |
| [`08-ios-no-checkout`](flows/08-ios-no-checkout.yaml) | A paid course the learner does not own shows no price, no "Buy now", no coupon; the plans page has no subscribe action | iOS | guest, then rohan; `product-discovery` |
| [`09-download-offline`](flows/09-download-offline.yaml) | Download a video lesson, play it from Downloads (in airplane mode on Android), delete it | both | juniper; `practical-sql`, "Your first SELECT" |
| [`10-notes-and-qa`](flows/10-notes-and-qa.yaml) | Add a note to a video lesson, ask a question in Q&A | both | juniper; `practical-sql`, "Your first SELECT" |
| [`11-account-sessions-sign-out`](flows/11-account-sessions-sign-out.yaml) | Sessions list shows this device, sign out, still signed out after a restart | both | juniper |

Shared steps live in [`flows/common/`](flows/common): `fresh-start.yaml` (clear the app's
data, and the Keychain on iOS, where the refresh token survives a reinstall),
`sign-in.yaml` and `open-lesson.yaml`. Maestro runs only the top-level files of
`e2e/flows`, so these never run on their own. [`flows/config.yaml`](flows/config.yaml)
fixes the order.

Platform-specific flows wrap their steps in `runFlow` with `when: platform:`, so the
whole folder can run on either platform: `07` does nothing on iOS and `08` does nothing
on Android.

## Prerequisites

1. **The server.** In a euron-open-lms checkout:

   ```bash
   make up
   make demo        # prints the demo logins and the shared password
   ```

   `make demo` prints a line like `password     <value>`. Every demo account uses it.
   It is also `LMS_DEMO_PASSWORD` in the stack's `.env`.
2. **The Maestro CLI**: `curl -fsSL "https://get.maestro.mobile.dev" | bash` (see the
   Maestro docs). It needs Java 17 or newer.
3. **The app**, a debug build from this repository with the default `.env` (copied from
   `.env.example`), installed on a booted iOS Simulator or Android emulator, with Metro
   running (`pnpm start`). The flows use the placeholder app id `com.example.openlms`;
   after `scripts/rename-app.sh` change `appId` in every flow.
4. **Android only:** `pnpm android:reverse`, so the emulator's localhost reaches the
   stack (API, website, storage emulator, stubs, Metro). Run it again after the emulator
   restarts.

## Running

```bash
pnpm e2e:ios     -e DEMO_PASSWORD=<password from make demo>
pnpm e2e:android -e DEMO_PASSWORD=<password from make demo>

# One flow
maestro test --platform android -e DEMO_PASSWORD=<password> e2e/flows/04-quiz.yaml

# By tag
maestro test --platform ios -e DEMO_PASSWORD=<password> --include-tags=learning e2e/flows
```

`pnpm e2e:ios` and `pnpm e2e:android` are `maestro test --platform <os> e2e/flows`; extra
arguments are passed through.

## What the flows assume

- **A freshly seeded stack.** The seed is deterministic about who owns what: juniper has
  the All-Access plan (so every course opens for her), rohan pays in INR and owns the
  `production-ready-engineer` bundle but not `practical-sql` or `product-discovery`.
  Flows that change state allow for an earlier run: the quiz resumes an open attempt,
  the assignment flow accepts an existing submission, the download flow deletes its copy.
  `07` buys `practical-sql` once; on a second run against the same stack it only checks
  that the course opens. Run `make down && make up && make demo` in euron-open-lms for a
  clean slate.
- **Juniper's certificate** (`06`): the seed's login list says the first learner has a
  certificate; which course it is for is decided by the seed, so the flow opens the first
  one listed.
- **Downloads** (`09`) need the academy setting `learning.offline.enabled` (on by default,
  sent to the app as `mobile.downloadsEnabled` in `GET /api/meta`) and the course's
  `allow_downloads` (true by default). iOS simulators have no airplane mode, so on iOS the
  copy plays with the network up; it still goes through the loopback server.
- **Payments** (`07`) use the local Razorpay stand-in, which answers checkout with a stub
  page instead of the native Razorpay sheet. Against real Razorpay keys the native sheet
  opens and this flow does not apply.
- **iOS purchase link** (`08`): the admin switch `mobile.iosWebPurchaseLink` is off (the
  default). With it on, a "Continue on the website" link replaces the note, and the flow's
  "Not enrolled yet" assertion fails while the no-purchase assertions still hold.
- **No push prompt.** A debug build without Firebase config files has no push, so no
  permission dialog appears after sign-in. If you added `google-services.json` or
  `GoogleService-Info.plist`, dismiss the prompt once by hand or add a step for it.
- **Screen capture.** Paid lessons turn on capture protection, which makes Maestro's
  screenshots of the player black. The video flows use a free preview lesson; for paid
  ones build with `CAPTURE_GUARD=off` (debug builds only).

## In CI

[`.github/workflows-full/e2e.yml`](../.github/workflows-full/e2e.yml) runs every flow on an
Android emulator against a real euron-open-lms stack (`make up`, `make demo`), nightly and
on demand. It is opt-in: move it into `.github/workflows/` in your fork. See
[docs/guides/testing.md](../docs/guides/testing.md) for the rest of the test suite.
