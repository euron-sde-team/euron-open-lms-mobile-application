# ADR 0005: Offline downloads inside a playback session, with a loopback server

## Status

Accepted. The app side of
[ADR 0022 in euron-open-lms](https://github.com/euron-sde-team/euron-open-lms/blob/main/docs/architecture/adr/0022-offline-downloads-inside-a-playback-session.md).

## Context

Learners want to watch lectures without a network. The server issues a licence for an item
and device, with a window that slides forward on every online check and revocation when
access ends. The stream is an EVS HLS session (usually AES-128 encrypted) or a plain HLS or
MP4 URL. The platform players (AVPlayer, ExoPlayer through `react-native-video`) play HLS
from a URL; they cannot be handed a key from JavaScript, and the key must not be written to
a file next to the segments.

## Decision

- **Licence first.** `POST /api/learn/items/:itemId/downloads { deviceId }` with a random
  installation id; the engine only fetches what that answer points at.
- **One rendition.** The highest variant at most 720p (or at most 2.5 Mbps without
  heights), a single AES-128 key, no separate audio groups; anything else is refused as
  unsupported.
- **Key in the keystore.** The key is fetched once and stored in the Keychain/Keystore; the
  files on disk are the segments as delivered, an init map and a rewritten local playlist
  whose key URI is the relative `key`.
- **A loopback server for playback.** The native module `open-lms-loopback` serves
  `http://127.0.0.1:<random port>/<random token>/<itemId>/...`: `GET`/`HEAD` with single
  ranges, files confined to the downloads root, and the key route answered from memory
  after `setKey()`. The same rules in Swift (Network.framework) and Kotlin (plain JVM).
- **Revalidation** on sign-in, on return to the foreground (at most every 10 minutes) and
  on reconnect; revoked copies are deleted with their key; copies past their window do not
  play.
- **Per account.** Entries are stamped with the user id; another account signing in
  deletes them.

Details: [offline-downloads.md](../offline-downloads.md).

## Consequences

Positive:

- No second access rule: the server decides downloads with the same check as playback, and
  can take copies back.
- The key never touches the file system, and other apps cannot read the server without the
  token.
- Downloads resume per segment after a crash or a dropped connection.

Trade-offs:

- Not DRM: a rooted or jailbroken device can extract keys and segments; MP4 copies are plain
  files in the sandbox. The watermark is the deterrent.
- A small HTTP server to maintain on two platforms, and release Android builds must permit
  cleartext to `127.0.0.1`.
- Offline expiry depends on the device clock until the next online check.

## Alternatives considered

- **FairPlay and Widevine offline licences.** Strongest, but need DRM packaging in EVS and
  a licence server.
- **Decrypting to plain files.** Simple to play, but leaves clear video on disk.
- **A custom resource loader per platform** (`AVAssetResourceLoaderDelegate`, an ExoPlayer
  data source). Avoids the socket, but means two player integrations inside
  `react-native-video` instead of one small server with shared rules.
