# ADR 0008: Design tokens mirrored from the web app

## Status

Accepted.

## Context

Learners move between the academy's website and the app. They should look like one product:
the same teal brand, ink for text and solid calls to action, cool grey grounds, the same
type families, light and dark. The web's tokens are CSS custom properties in
euron-open-lms (`packages/ui/src/styles/tokens.css`); React Native has no CSS variables and
needs values as strings or numbers.

## Decision

- [`src/ui/theme/tokens.ts`](../../../src/ui/theme/tokens.ts) holds the web palette as HSL
  values in the same order and with the same names (light and dark), so the two files can
  be compared line by line, plus the radii, the 4 pt spacing scale, the type scale and the
  fonts (Bricolage Grotesque for display, Hanken Grotesk for body, bundled under the SIL
  Open Font License).
- `primary` is the brand darkened until white text on it passes WCAG AA; `brand` is the
  brighter accent for rings and progress, as on the web.
- [`ThemeProvider`](../../../src/ui/theme/ThemeProvider.tsx) resolves light, dark or system;
  components read colours through `useTheme()` and never hardcode one.
- Changes to the palette are made on the web first and copied here in the same terms.

## Consequences

Positive:

- One brand across web and app with no shared runtime dependency.
- Dark mode is a palette swap, not per-screen work.

Trade-offs:

- The copy is manual: nothing fails when the web palette changes. Reviewers compare the two
  files when either changes.
- Academy branding beyond the name and logo (a custom brand colour) would need the palette
  to come from the server.

## Alternatives considered

- **A shared tokens package consumed by both.** Would need publishing and a build step that
  emits both CSS and TypeScript.
- **A component library with its own theme.** Its look would not match the web.
