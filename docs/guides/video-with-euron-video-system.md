# Video with euron-video-system

Lecture video is hosted, transcoded and signed by
[euron-video-system](https://github.com/euron-sde-team/euron-video-system) (EVS), and
**the app never talks to EVS directly**. It has no EVS URL, key or setting. The flow is:

1. The app asks the LMS for playback: `POST /api/learn/items/:itemId/playback`.
2. The LMS checks the learner's access and mints an EVS playback session bound to that
   viewer, then answers with the HLS manifest URL, its expiry, a poster and the watermark
   text.
3. The player fetches the manifest, keys and segments from the URLs in that answer.

Downloads work the same way: the licence answer carries an EVS session the app downloads
within. So everything you configure for video is configured **on the LMS**, and the app
picks it up. How the app plays, refreshes and protects video:
[video-playback.md](../architecture/video-playback.md).

## Locally

`make up` in euron-open-lms points the LMS at the video stand-in in its stubs
(`http://localhost:5119`), which plays a test stream, so the demo courses play in the app
with nothing else to set up. On Android, `pnpm android:reverse` forwards port 5119 so the
emulator can fetch the stub's segments.

To run a real EVS next to the LMS instead, follow the server's guide:
[video-with-evs.md](https://github.com/euron-sde-team/euron-open-lms/blob/main/docs/guides/video-with-evs.md).

## In production

Configure EVS on the LMS (its base URL and keys; see the guide above). Then check, on a
device:

| Check | Where it goes wrong |
| --- | --- |
| The manifest and segment URLs the LMS returns are HTTPS | Android release builds refuse cleartext; iOS allows HTTP only to local addresses |
| They are reachable from phones on the internet, not only from the LMS's network | A private EVS host plays on the web inside the office and not on a phone |
| EVS answers `401`/`403` for an expired session | The app re-mints playback on a player error (up to three times) and resumes |
| Offline downloads: the stream is HLS with a single AES-128 key, no separate audio rendition | Other shapes are refused as "This video's format cannot be saved for offline viewing" |

## Other providers

The LMS can also serve a lecture as a plain `HLS` or `MP4` URL or a `YOUTUBE` embed; the app
plays each (YouTube in an iframe player, which is never downloaded and is not capture protected). See the table in [video-playback.md](../architecture/video-playback.md#1-getting-something-to-play).
