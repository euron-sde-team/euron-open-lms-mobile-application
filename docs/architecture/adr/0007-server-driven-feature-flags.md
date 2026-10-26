# ADR 0007: Feature switches come from the server

## Status

Accepted.

## Context

An academy decides things the app must follow: whether downloads are allowed, whether the
server can send push, whether the iOS app may link to the website for purchases, its name,
logo, currencies and payment routing. A setting baked into the binary needs a store release
to change, and an academy that turns downloads off must see that reach every installed app
at once.

## Decision

- Build-time settings are only what the app needs before it can reach the server:
  `API_BASE_URL`, `WEB_BASE_URL`, `APP_SCHEME`, `APP_LINK_HOST` and the debug-only
  `CAPTURE_GUARD` ([`.env.example`](../../../.env.example), [`src/config.ts`](../../../src/config.ts)).
- Everything else comes from `GET /api/meta` through `useMeta()`
  ([`src/app/meta.tsx`](../../../src/app/meta.tsx)), cached in MMKV between launches so the
  academy's name shows before the network answers, and refreshed every five minutes while
  in use.
- The mobile switches are read by `mobileFlags()`: `iosWebPurchaseLink`,
  `downloadsEnabled`, `pushEnabled`, `minSupportedVersion`. An older server that does not
  send `mobile` gets everything off.
- Per-course switches (`allowDownloads`) come with the course or classroom.
- The server enforces each switch again on its own endpoints; the app's copy only decides
  what to show.

## Consequences

Positive:

- Operators change behaviour from the admin settings with no app release.
- One binary works against any academy's server version: missing switches read as off.

Trade-offs:

- A cached `/api/meta` can be stale for a few minutes after a change; the server's checks
  cover that window.
- `minSupportedVersion` is read but not yet acted on (no update prompt).

## Alternatives considered

- **Build flavours per feature.** Every change becomes a store release.
- **A remote config service.** A second source of truth next to the LMS settings, and
  another vendor for every academy.
