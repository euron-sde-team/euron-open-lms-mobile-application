# Full CI pipeline (opt-in)

These workflows are the complete quality pipeline for Euron Open LMS Mobile. They are
kept here, outside `.github/workflows/`, so they do **not** run on the upstream
repository. Only the fast [`checks`](../workflows/checks.yml) workflow (lint, typecheck,
unit and component tests, the sanitization scan, the API contract check) runs there.

| Workflow | What it runs |
| --- | --- |
| [`android.yml`](android.yml) | `assembleDebug`, an unsigned `assembleRelease` and Android lint; the APKs as artifacts |
| [`ios.yml`](ios.yml) | `pod install` and an unsigned simulator build with `xcodebuild` |
| [`security.yml`](security.yml) | gitleaks (full history), CodeQL (JavaScript/TypeScript), `pnpm audit` |
| [`e2e.yml`](e2e.yml) | A real euron-open-lms stack (`make up`, `make demo`), the debug app on an Android emulator, every Maestro flow in `e2e/flows` |

To enable them in your fork, move them into `.github/workflows/`:

```bash
git mv .github/workflows-full/*.yml .github/workflows/
```

Every gate also runs locally: `pnpm lint typecheck test sanitize sync-types:check`,
`pnpm e2e:ios`, `pnpm e2e:android` (docs/guides/testing.md).
