# ADR 0002: The API contract is vendored, with a drift check

## Status

Accepted.

## Context

The app calls the same API as the web app in euron-open-lms, whose types
(`packages/types`) and typed endpoint groups (`packages/api-client`) are the contract. The
app lives in its own repository, so it cannot import those workspace packages, and a hand
copy of request and response shapes drifts silently: a renamed field becomes `undefined` at
runtime instead of a type error.

## Decision

- [`scripts/sync-types.mjs`](../../../scripts/sync-types.mjs) (`pnpm sync-types`) copies
  from a euron-open-lms checkout (default `../euron-open-lms`) into
  [`src/api/vendor/`](../../../src/api/vendor/): every file of `packages/types/src`, the
  client's `errors`, `pagination` and `upload` helpers, and the learner endpoint groups
  (`helpers`, `core`, `catalog`, `learning`, `assessments`, `commerce`). The admin and
  authoring groups are left out.
- Imports are rewritten: the package name to the vendored path, the web transport `./http`
  to the app's native transport ([`src/api/http.ts`](../../../src/api/http.ts)), which
  implements the same contract in native token mode.
- Every copied file starts with a "do not edit" header, and the source commit is written to
  `src/api/vendor/SOURCE`. ESLint ignores the folder (it is linted upstream).
- `pnpm sync-types:check` fails when any copied file differs from the server's. The fast
  CI workflow runs it against the server's main branch on every push.
- A change to the contract is made in euron-open-lms first, then synced here
  ([CONTRIBUTING.md](../../../CONTRIBUTING.md#changing-the-api-contract)).

## Consequences

Positive:

- The app and the web use byte-identical types and endpoint code; a server change that
  breaks the app breaks its typecheck after a sync, and CI says when a sync is due.
- Reviewers can see which server version the app targets (`SOURCE`).

Trade-offs:

- The app depends on the server's main branch for its CI check; a server change lands as a
  red contract job here until someone runs `pnpm sync-types` and adapts the app.
- Endpoints the vendored groups do not cover are called with `api.http.request(...)`.

## Alternatives considered

- **Publishing the packages to npm.** Versioned, but adds a release process for internal
  packages and still needs a bump in the app for every change.
- **Generating a client from OpenAPI.** The server's OpenAPI file is generated from routes
  and is thinner than the TypeScript types (discriminated unions, error codes).
- **A git submodule of the server.** Pulls the whole server into the app and its tooling.
