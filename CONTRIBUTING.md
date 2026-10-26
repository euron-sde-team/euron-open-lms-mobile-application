# Contributing

Thanks for helping improve Euron Open LMS Mobile. This guide covers the workflow, the bar a
change has to clear, and the conventions the codebase follows.

## Ground rules

- **Open an issue first** for anything larger than a bug fix or a docs tweak.
- **One concern per pull request.** A refactor and a feature are two PRs.
- **Security issues go through private reporting**, never a public issue. See
  [SECURITY.md](SECURITY.md).
- By contributing you agree your work is released under the [MIT License](LICENSE).

## Development setup

Run a local euron-open-lms first (`make up && make demo` there), then:

```bash
cp .env.example .env
pnpm install
bundle install && pnpm pods      # iOS
pnpm start                       # Metro
pnpm ios                         # or: pnpm android:reverse && pnpm android
```

Requirements and details: [docs/guides/quickstart.md](docs/guides/quickstart.md).

## Before you open a pull request

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm sanitize                    # no credentials, real emails, IPs or Firebase/signing files
pnpm sync-types:check            # the vendored API contract matches euron-open-lms
pnpm e2e:ios / pnpm e2e:android  # when you touched a user flow (e2e/README.md)
pnpm pods && a native build      # when you added or upgraded a native dependency
```

## Branches and commits

Branch from `main` (`fix/...`, `feat/...`, `docs/...`). Commit messages use the imperative
mood with an optional scope: `downloads: resume after a dropped connection`,
`checkout: keep the quote when the sheet is closed`. Explain the why in the body when it is
not obvious.

## Conventions

- **The server decides.** Access, prices, completion and grades come from the API; the app
  renders them. Never add a client-side access or pricing rule.
- **Pure rules next to screens.** Logic lives in plain TypeScript files with unit tests
  (`purchase.ts`, `heartbeat.ts`, `hls.ts`, `checkout.ts`); screens draw what they return.
  Main screens get a render test with `renderWithProviders()` from `test/render.tsx`.
- **Errors by code.** Switch on `ApiError.code`, never on message text.
- **Server state in TanStack Query** with keys from `qk` (`src/app/query.ts`). Secrets only
  in `src/lib/secure-store.ts`; MMKV (`src/lib/storage.ts`) is for non-secret prefs.
- **Theme colours only** through `useTheme()`; no pill buttons, no box inside a box,
  `testID` on key elements (`<area>-<thing>`), 44 pt touch targets.
- **Comments explain why**: a short header per file and the constraint behind non-obvious
  code. No em dashes.

## Changing the API contract

`src/api/vendor/` is copied from euron-open-lms and never edited here.

1. Change the types or endpoints in euron-open-lms (`packages/types`,
   `packages/api-client`) and land that first.
2. Here, run `pnpm sync-types` (reads `../euron-open-lms` by default, or pass its path).
3. Adapt the app until `pnpm typecheck` and `pnpm test` pass, and commit the vendored files
   with `src/api/vendor/SOURCE`.

See [ADR 0002](docs/architecture/adr/0002-vendored-api-contract-with-a-drift-check.md).

## Architecture decisions

A change to a documented decision (session storage, purchase rules per platform, offline
downloads, native module boundaries) needs a new ADR in `docs/architecture/adr/`, linked
from the pull request.
