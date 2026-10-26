# Walkthrough: a learner from install to a certificate

Follow one learner through the app and see which files run at each step. Paths are
relative to the repository root. To follow along, run the [quickstart](quickstart.md) and
use `juniper.vale@example.com` (or a fresh account for the purchase step).

## 1. First launch

- [`index.js`](../../index.js) registers [`App.tsx`](../../App.tsx), which stacks the
  providers: safe area, theme, the TanStack Query client, the session, the navigator.
- [`src/config.ts`](../../src/config.ts) reads `.env` (`API_BASE_URL`, `WEB_BASE_URL`,
  `APP_SCHEME`).
- [`src/app/session.tsx`](../../src/app/session.tsx) looks for a refresh token in the
  Keychain ([`src/lib/secure-store.ts`](../../src/lib/secure-store.ts)). There is none, so
  the status becomes `signedOut` and the learner is a guest.
- [`src/app/meta.tsx`](../../src/app/meta.tsx) fetches `GET /api/meta`: the academy's name,
  currencies and the mobile switches. It is cached in MMKV for the next launch.

## 2. Browsing as a guest

- **Home** ([`catalog/screens/HomeScreen.tsx`](../../src/features/catalog/screens/HomeScreen.tsx))
  shows topics and the featured, popular, new and free shelves
  ([`Rail.tsx`](../../src/features/catalog/components/Rail.tsx),
  [`CourseCard.tsx`](../../src/features/catalog/components/CourseCard.tsx)), with data from
  [`catalog/hooks.ts`](../../src/features/catalog/hooks.ts).
- **Explore** ([`ExploreScreen.tsx`](../../src/features/catalog/screens/ExploreScreen.tsx))
  searches and filters on the server ([`filters.ts`](../../src/features/catalog/filters.ts)),
  in keyset pages.
- A **course page** ([`CourseScreen.tsx`](../../src/features/catalog/screens/CourseScreen.tsx))
  shows the curriculum, reviews and the purchase bar. What the bar offers is
  `coursePurchase()` in [`purchase.ts`](../../src/features/catalog/purchase.ts), from the
  server's `access.state` and the platform's purchase mode. As a guest on a paid course it
  says "Sign in to get this course" on Android and only "Sign in" on iOS.
- A free preview lesson opens in the classroom without an account.

## 3. Signing in

- "Sign in" opens the modal from [`auth/AuthScreens.tsx`](../../src/features/auth/AuthScreens.tsx).
- `signIn()` posts the login through [`src/api/http.ts`](../../src/api/http.ts) with
  `X-Client: native`. The answer carries a refresh token, which `persist()` writes to the
  Keychain before anything else; the access token stays in memory. Two-step accounts get
  the code field first.
- The modal closes and the learner is back on the course page. Catalog query keys include
  the viewer, so the page refetches and now shows the learner's own access state.
- About 1.5 s later, the first time, the app asks for notification permission
  ([`account/push/usePushRegistration.ts`](../../src/features/account/push/usePushRegistration.ts),
  [`src/lib/push.ts`](../../src/lib/push.ts)) and registers the device when Firebase is
  configured.

## 4. Getting access

Depending on the course:

| Course | What happens | Files |
| --- | --- | --- |
| Free | "Enroll for free" posts the enrollment and opens the classroom | `CourseScreen.tsx` |
| Included in the learner's plan | "Start learning" opens the classroom | `purchase.ts` |
| Paid, Android | "Buy now" opens checkout: quote, coupon, billing, Pay with an idempotency key, Razorpay or Stripe, then the result screen polls the order | [`CheckoutScreen.tsx`](../../src/features/account/CheckoutScreen.tsx), [`lib/checkout.ts`](../../src/features/account/lib/checkout.ts), [`CheckoutResultScreen.tsx`](../../src/features/account/CheckoutResultScreen.tsx) |
| Paid, iOS | No price; with the admin setting on, "Continue on the website". After buying there the learner comes back and the course shows "Start learning" | `purchase.ts`, [`app/meta.tsx`](../../src/app/meta.tsx) |

## 5. The classroom

- [`learning/screens/ClassroomScreen.tsx`](../../src/features/learning/screens/ClassroomScreen.tsx)
  loads the curriculum with per-item progress
  ([`classroom/hooks.ts`](../../src/features/learning/classroom/hooks.ts)) and opens the item
  where the learner left off. Moving between lessons follows
  [`curriculum.ts`](../../src/features/learning/curriculum.ts), the same rules as the web.
- A **video** ([`classroom/VideoLesson.tsx`](../../src/features/learning/classroom/VideoLesson.tsx))
  mints playback from the LMS, plays it in
  [`player/Player.tsx`](../../src/features/learning/player/Player.tsx) with the watermark
  and capture protection ([`protect.ts`](../../src/features/learning/player/protect.ts)),
  and sends heartbeats every 15 s ([`heartbeat.ts`](../../src/features/learning/player/heartbeat.ts)).
  The server computes completion from watched time and the ring fills.
- **Articles and PDFs** ([`classroom/ItemPanels.tsx`](../../src/features/learning/classroom/ItemPanels.tsx))
  complete with "Mark as done".
- The tabs under the lesson: **Notes** pinned to the video time
  ([`NotesTab.tsx`](../../src/features/learning/classroom/NotesTab.tsx)), **Q&A**
  ([`QaTab.tsx`](../../src/features/learning/classroom/QaTab.tsx)), Resources and Overview
  ([`InfoTabs.tsx`](../../src/features/learning/classroom/InfoTabs.tsx)).

## 6. Saving a lecture for the train

- The player's settings (or the lesson row) offer **Download** when the academy and the
  course allow it ([`downloads/useDownloads.ts`](../../src/features/learning/downloads/useDownloads.ts)).
- [`downloads/engine.ts`](../../src/features/learning/downloads/engine.ts) takes a licence,
  keeps one rendition ([`hls.ts`](../../src/features/learning/downloads/hls.ts)), puts the
  key in the Keychain and the segments on disk.
- On the train, **Account, Downloads**
  ([`screens/DownloadsScreen.tsx`](../../src/features/learning/screens/DownloadsScreen.tsx))
  plays it through the loopback server
  ([`modules/loopback-server`](../../modules/loopback-server/)). If the app is started with
  no network at all it opens straight on this screen
  ([`src/app/OfflineScreen.tsx`](../../src/app/OfflineScreen.tsx)).
- Back online, licences are revalidated; a revoked one is deleted.

## 7. The quiz

- The quiz intro panel opens [`assessments/quiz/QuizScreen.tsx`](../../src/features/assessments/quiz/QuizScreen.tsx):
  intro, runner, result, chosen by the reducer in
  [`quiz-state.ts`](../../src/features/assessments/quiz/quiz-state.ts).
- Answers autosave in debounced batches that never overlap
  ([`autosave.ts`](../../src/features/assessments/quiz/autosave.ts)) and flush when the app
  goes to the background.
- A timed quiz counts down on the server's clock
  ([`server-clock.ts`](../../src/features/assessments/quiz/server-clock.ts)), so changing
  the phone's clock does not help.
- Submitting shows the score and, as the quiz's reveal policy allows, the review. The item,
  the classroom and My Learning refresh together.

## 8. The assignment

- [`assessments/assignment/AssignmentScreen.tsx`](../../src/features/assessments/assignment/AssignmentScreen.tsx)
  shows the brief, rubric, due date and every submitted version with feedback.
- The composer takes text, a link and files. Files upload straight to storage in three
  steps (ticket, presigned PUT streamed from disk, complete)
  ([`upload.ts`](../../src/features/assessments/assignment/upload.ts),
  [`use-uploads.ts`](../../src/features/assessments/assignment/use-uploads.ts)).
- When an instructor grades it on the web, the learner gets a notification and a push whose
  link opens this screen ([`account/lib/links.ts`](../../src/features/account/lib/links.ts)).

## 9. The certificate

- When the server finds every required item complete, it issues the certificate. The
  classroom shows the completion line, and a notification arrives.
- [`assessments/certificate/CertificateScreen.tsx`](../../src/features/assessments/certificate/CertificateScreen.tsx)
  shows the learner, course, date, serial and validity. The owner downloads the PDF
  ([`certificate-pdf.ts`](../../src/features/assessments/certificate/certificate-pdf.ts))
  into the in-app viewer and shares the file or the public link
  `<WEB_BASE_URL>/verify/<serial>`.
- My Learning's **Certificates** tab
  ([`LearningScreen.tsx`](../../src/features/learning/screens/LearningScreen.tsx)) lists it
  from now on.

## 10. Signing out

**Account, Sign out** ([`account/AccountScreen.tsx`](../../src/features/account/AccountScreen.tsx),
[`lib/signout.ts`](../../src/features/account/lib/signout.ts)) removes this device's push
registration, ends the session on the server, clears the Keychain entry and the query
cache, and forgets the push token. Downloads stay on the phone until they expire, the
learner deletes them, or another account signs in.
