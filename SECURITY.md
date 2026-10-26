# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.x (latest minor) | Yes |
| Older minors | No |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub's private vulnerability reporting on this repository
("Security" tab, "Report a vulnerability"):
https://github.com/euron-sde-team/euron-open-lms-mobile-application/security/advisories/new

A flaw in the server (access rules, payments, webhooks) belongs to
[euron-open-lms](https://github.com/euron-sde-team/euron-open-lms/security/advisories/new);
if unsure, report here and we will move it.

Please include the app version and build (Account, About), the platform and OS version,
the server version, steps to reproduce or a proof of concept, and the impact.

| Stage | Target |
| ----- | ------ |
| Acknowledgement | within 3 business days |
| Initial assessment and severity | within 7 business days |
| Fix or mitigation for critical / high issues | within 30 days |
| Coordinated public disclosure | after a fix is released, credited to you unless you prefer otherwise |

## Scope

In scope, the code in this repository with its default settings:

- **Session storage.** Reading or reusing the refresh token or access token from outside
  the app, tokens reaching logs, MMKV, a WebView or a share sheet, sign-out that leaves a
  usable session behind.
- **Deep links.** Links that open screens or URLs they should not, or act on the learner's
  behalf (including `openlms://` scheme handling and `data.url` in pushes).
- **Offline downloads.** Reading another learner's copies, keys written to disk, the
  loopback server answering without its token or outside its root, copies that keep
  playing after revocation once the app is online.
- **Payments.** Anything that makes the Android app pay a different amount or for a
  different item than the server quoted, or a purchase path on iOS.
- **Transport.** Cleartext traffic in release builds beyond `127.0.0.1`.
- **Secrets in the repository** (keys, Firebase config, signing material).

Out of scope:

- Capture protection and offline copies on rooted or jailbroken devices, and recording with
  an external camera: documented limits, see
  [docs/architecture/security.md](docs/architecture/security.md).
- Debug-build behaviour (`CAPTURE_GUARD=off`, cleartext to a local stack).
- Lack of certificate pinning (documented).
- Findings that need a compromised device account or leaked deployment secrets.
