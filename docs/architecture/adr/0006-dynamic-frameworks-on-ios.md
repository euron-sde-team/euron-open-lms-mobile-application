# ADR 0006: Dynamic frameworks on iOS, and the UTType link fix

## Status

Accepted.

## Context

Push uses React Native Firebase (`@react-native-firebase/app` and `messaging`, v27), whose
iOS side resolves the Firebase SDK through Swift Package Manager. That requires the pods to
be built as dynamically linked frameworks. With dynamic frameworks every pod links on its
own, and a pod that calls system APIs without declaring the frameworks that provide them
fails to link, where a static build would have picked the symbols up from the app.
`@react-native-clipboard/clipboard` (the `RNCClipboard` pod) calls the type identifier APIs
(`UTType*`) without declaring `MobileCoreServices` and `UniformTypeIdentifiers`.

## Decision

- [`ios/Podfile`](../../../ios/Podfile) sets `use_frameworks! :linkage => :dynamic`.
- Its `post_install` hook appends
  `-framework MobileCoreServices -framework UniformTypeIdentifiers` to `OTHER_LDFLAGS` of
  the `RNCClipboard` target only, keeping every other pod's settings untouched.
- `react_native_post_install` runs after it, as in the template.

## Consequences

Positive:

- React Native Firebase installs the supported way, and the clipboard pod links.
- The fix is a named list in one place; another pod with the same problem is added to the
  list.

Trade-offs:

- Dynamic frameworks lengthen launch slightly and can surface link errors in pods that
  only ever built statically; a new native dependency should be tried with `pnpm pods` and
  a clean build before it is merged.
- After changing the Podfile, `pnpm pods` must be run again (the troubleshooting guide
  covers stale pods).

## Alternatives considered

- **Static frameworks with Firebase through CocoaPods.** Not the path React Native Firebase
  v27 supports.
- **Patching the clipboard package** (`pnpm patch`). Works, but a patch to a third-party
  package is harder to see and to drop than a two-line Podfile hook.
- **Dropping the clipboard package.** It is used to copy two-step setup keys and recovery
  codes.
