# Testing

Every gate runs locally and in CI. The fast ones run on every push; the native builds and
the end-to-end flows are an opt-in pipeline for forks.

| Gate | Command | Needs |
| --- | --- | --- |
| Lint | `pnpm lint` | Node |
| Types | `pnpm typecheck` | Node |
| Unit and component tests | `pnpm test` | Node |
| Sanitization scan | `pnpm sanitize` | bash, git |
| API contract | `pnpm sync-types:check` | a euron-open-lms checkout |
| End to end | `pnpm e2e:ios` / `pnpm e2e:android` | Maestro, a simulator or emulator, a running euron-open-lms stack |

## Unit and component tests

```bash
pnpm test                         # everything (35 suites at the time of writing)
pnpm test src/features/learning   # one area
pnpm test --watch
```

Jest with the React Native preset and React Native Testing Library
([`jest.config.js`](../../jest.config.js)). Tests live next to the code as `*.test.ts(x)`.

- **Pure rules** are tested on their own: purchase views per access state and platform
  ([`purchase.test.ts`](../../src/features/catalog/purchase.test.ts)), heartbeats, capture
  protection, HLS parsing and rewriting, the download state machine and engine (with
  injected file system and network), checkout idempotency keys and handoff routes, link
  routing, quiz state, autosave timing, the server clock, push decisions, the transport's
  single-flight refresh ([`http.test.ts`](../../src/api/http.test.ts)).
- **Screens** render inside the app's providers with a fake session:
  `renderWithProviders()` and `FakeSession` from [`test/render.tsx`](../../test/render.tsx),
  with `api` replaced by the calls the test needs.
- **Native modules** are mocked once in [`test/setup.ts`](../../test/setup.ts) (Keychain,
  MMKV, NetInfo, device info, video, Firebase, ...). Do not edit it for one test: put a
  `jest.mock(...)` at the top of your test file instead.
- After each test, [`test/after-each.ts`](../../test/after-each.ts) lets pending queries
  settle inside `act()` and forgets the query clients.

Coverage: `pnpm test --coverage` (the vendored contract is excluded).

## API contract

```bash
pnpm sync-types:check              # compares src/api/vendor with ../euron-open-lms
node scripts/sync-types.mjs --check /path/to/euron-open-lms
pnpm sync-types                    # copy (after a server change), then fix the app
```

The check fails with the list of drifted files and "Run: pnpm sync-types". With no
euron-open-lms checkout at the path it prints a notice and passes, so run it with a
checkout before you rely on it. CI checks against the server's main branch.

## Sanitization

```bash
pnpm sanitize
```

[`scripts/check-sanitization.sh`](../../scripts/check-sanitization.sh) scans the files git
would commit for credentials, private keys, live payment keys, Google and Firebase API keys,
Apple team ids in signing settings, Firebase config and signing files, committed env files,
email addresses outside the reserved example domains and public IP addresses. Use
`example.com` addresses and private or documentation IP ranges in docs and tests.

## End-to-end flows (Maestro)

The flows in [`e2e/flows`](../../e2e/flows/) drive the debug app against a real local
euron-open-lms stack and its demo academy. Setup, what each flow covers and what it assumes
about the demo data: [e2e/README.md](../../e2e/README.md).

```bash
# euron-open-lms
make up && make demo                # note the password it prints

# this repository
pnpm start                          # Metro
pnpm ios                            # or: pnpm android:reverse && pnpm android
pnpm e2e:ios -e DEMO_PASSWORD=<password>
pnpm e2e:android -e DEMO_PASSWORD=<password>
```

Some flows are platform specific: the Razorpay stub purchase runs on Android only, the "no
checkout on iOS" check on iOS only.

## Continuous integration

| Workflow | Runs | Where |
| --- | --- | --- |
| [`checks`](../../.github/workflows/checks.yml) | lint, typecheck, `jest --ci`, the sanitization scan; the contract check against euron-open-lms main | every push and pull request |
| [`android`](../../.github/workflows-full/android.yml) | `assembleDebug`, an unsigned `assembleRelease`, Android lint; APKs as artifacts | opt-in |
| [`ios`](../../.github/workflows-full/ios.yml) | `pod install` and an unsigned simulator build | opt-in |
| [`security`](../../.github/workflows-full/security.yml) | gitleaks on the full history, CodeQL, `pnpm audit --prod` | opt-in |
| [`e2e`](../../.github/workflows-full/e2e.yml) | `make up` and `make demo` of euron-open-lms, the debug app on an API 35 Android emulator, every Maestro flow | opt-in, nightly and by hand |

The opt-in workflows live in `.github/workflows-full/` so they do not run upstream; move
them into `.github/workflows/` in your fork
([README there](../../.github/workflows-full/README.md)).

## By hand on devices

Automated tests cannot see everything. Before a release, on a real iPhone and a real Android
phone: capture protection (a screenshot of a paid lesson is black or blanked), a download
played in airplane mode, push delivery and tap, an Android purchase with the gateway's test
mode, light and dark mode, the largest text size.
