# ADR 0003: Native token mode and the Keychain

## Status

Accepted. The app side of
[ADR 0020 in euron-open-lms](https://github.com/euron-sde-team/euron-open-lms/blob/main/docs/architecture/adr/0020-native-token-mode.md).

## Context

The web app keeps a short-lived access token in memory and the rotating refresh token in an
httpOnly cookie. A React Native app has no cookie jar it controls well, and has a much
better home for a long-lived secret: the iOS Keychain and the Android Keystore. The
session semantics must stay the same: rotation on every refresh, and family revocation when
a rotated token is replayed.

## Decision

- Every request sends `X-Client: native` and `credentials: "omit"`; session-issuing
  endpoints then return the refresh token and its expiry in the body.
- The refresh token, its expiry and the user id are stored with `react-native-keychain`
  under service `open-lms.session` with `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`. The access
  token stays in a ref in memory.
- Refresh is single flight: concurrent `401`s share one `POST /auth/refresh`, and the
  rotated token is written to the Keychain before the new access token is used.
- Only a `401`/`403` from refresh ends the session; a network error never does. At launch a
  stored session that cannot be confirmed for lack of network becomes status `offline`.
- Sign-out always succeeds locally and names the push device to the server.

Details: [sessions-and-native-tokens.md](../sessions-and-native-tokens.md).

## Consequences

Positive:

- One session model on the server for both clients; reuse detection protects the app the
  same way it protects the web.
- The token never sits in JavaScript-readable persistent storage, never syncs to other
  devices and is not restored from a backup.

Trade-offs:

- The refresh token passes through JavaScript memory; the app must never log it or hand it
  to a web view (it does neither).
- `AFTER_FIRST_UNLOCK` (rather than `WHEN_UNLOCKED`) lets refreshes run while the phone is
  locked after its first unlock, at the cost of the token being readable in that state.

## Alternatives considered

- **Cookies through the native HTTP stack.** Ties token storage to platform cookie quirks
  and leaves the token outside the keystore.
- **Long-lived access tokens without refresh.** Simpler, but a stolen token would stay
  valid and there would be no reuse detection.
- **Biometric-gated Keychain access.** Stronger against a borrowed phone, but would block
  background refreshes and every launch; can be added per academy later.
