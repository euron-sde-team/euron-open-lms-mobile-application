# Architecture decision records

Short records of the decisions that shape Euron Open LMS Mobile: the context, what was
decided, and what it costs. The app as built is described in [HLD.md](../HLD.md) and
[app-architecture.md](../app-architecture.md). Decisions on the server side live in
[euron-open-lms](https://github.com/euron-sde-team/euron-open-lms/blob/main/docs/architecture/adr/README.md),
in particular ADR 0020 (native token mode), 0021 (push through FCM HTTP v1) and 0022
(offline downloads inside a playback session).

| ADR | Decision |
| --- | --- |
| [0001](0001-bare-react-native-cli.md) | A bare React Native CLI app, not Expo |
| [0002](0002-vendored-api-contract-with-a-drift-check.md) | The API contract is vendored from euron-open-lms and checked for drift in CI |
| [0003](0003-native-token-mode-and-keychain.md) | Native token mode: refresh token in the Keychain/Keystore, access token in memory |
| [0004](0004-no-in-app-purchase-on-ios-razorpay-on-android.md) | No purchases inside the iOS app; Android checks out with Razorpay or Stripe |
| [0005](0005-offline-downloads-with-a-loopback-server.md) | Offline downloads inside a playback session, played through a loopback server |
| [0006](0006-dynamic-frameworks-on-ios.md) | Dynamic frameworks on iOS for React Native Firebase, with a link fix in the Podfile |
| [0007](0007-server-driven-feature-flags.md) | Feature switches come from the server (`/api/meta`), not from the build |
| [0008](0008-design-tokens-mirrored-from-the-web.md) | Design tokens mirrored from the web app |

A change that alters one of these decisions needs a new ADR (or an amendment with its
reasoning) in the same pull request.
