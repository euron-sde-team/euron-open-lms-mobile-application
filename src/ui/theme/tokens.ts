/**
 * Design tokens, the same palette as the Euron Open LMS web app
 * (euron-open-lms packages/ui/src/styles/tokens.css): one teal brand, ink for text and
 * solid calls to action, cool grey grounds and hairlines. `primary` is the brand darkened
 * until white text on it passes WCAG AA; `brand` is the brighter accent for rings and
 * progress. Values are kept as HSL so they can be compared with the web file line by line.
 */
const hsl = (h: number, s: number, l: number) => `hsl(${h}, ${s}%, ${l}%)`;
const hsla = (h: number, s: number, l: number, a: number) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

export interface Palette {
  background: string;
  foreground: string;
  card: string;
  popover: string;
  muted: string;
  mutedForeground: string;
  subtleForeground: string;
  border: string;
  input: string;
  ring: string;
  primary: string;
  primaryForeground: string;
  primarySoft: string;
  primarySoftForeground: string;
  link: string;
  brand: string;
  ink: string;
  inkForeground: string;
  ground2: string;
  success: string;
  successForeground: string;
  successSoft: string;
  successSoftForeground: string;
  warning: string;
  warningForeground: string;
  warningSoft: string;
  warningSoftForeground: string;
  danger: string;
  dangerForeground: string;
  dangerSoft: string;
  dangerSoftForeground: string;
  star: string;
  overlay: string;
  /** A translucent scrim over video and imagery. */
  scrim: string;
  /** Hairline shadow colour for cards. */
  shadow: string;
}

export const light: Palette = {
  background: hsl(216, 33, 97),
  foreground: hsl(222, 49, 8),
  card: hsl(0, 0, 100),
  popover: hsl(0, 0, 100),
  muted: hsl(216, 28, 95),
  mutedForeground: hsl(220, 13, 35),
  subtleForeground: hsl(220, 10, 46),
  border: hsl(216, 25, 91),
  input: hsl(216, 18, 82),
  ring: hsl(188, 86, 36),
  primary: hsl(188, 87, 29),
  primaryForeground: hsl(0, 0, 100),
  primarySoft: hsl(186, 60, 94),
  primarySoftForeground: hsl(189, 86, 24),
  link: hsl(189, 86, 27),
  brand: hsl(188, 85, 37),
  ink: hsl(222, 49, 8),
  inkForeground: hsl(0, 0, 100),
  ground2: hsl(216, 30, 94),
  success: hsl(157, 70, 28),
  successForeground: hsl(0, 0, 100),
  successSoft: hsl(152, 55, 94),
  successSoftForeground: hsl(157, 75, 22),
  warning: hsl(32, 90, 32),
  warningForeground: hsl(0, 0, 100),
  warningSoft: hsl(42, 95, 92),
  warningSoftForeground: hsl(30, 90, 27),
  danger: hsl(350, 72, 45),
  dangerForeground: hsl(0, 0, 100),
  dangerSoft: hsl(350, 85, 96),
  dangerSoftForeground: hsl(350, 72, 36),
  star: hsl(38, 92, 50),
  overlay: hsla(222, 49, 6, 0.5),
  scrim: hsla(222, 49, 6, 0.55),
  shadow: hsl(222, 49, 8),
};

export const dark: Palette = {
  background: hsl(215, 28, 7),
  foreground: hsl(210, 33, 93),
  card: hsl(215, 21, 11),
  popover: hsl(215, 19, 14),
  muted: hsl(215, 16, 17),
  mutedForeground: hsl(212, 14, 70),
  subtleForeground: hsl(212, 10, 58),
  border: hsl(212, 12, 21),
  input: hsl(212, 11, 29),
  ring: hsl(186, 70, 52),
  primary: hsl(186, 72, 45),
  primaryForeground: hsl(215, 28, 7),
  primarySoft: hsl(188, 45, 15),
  primarySoftForeground: hsl(185, 70, 70),
  link: hsl(185, 72, 62),
  brand: hsl(186, 72, 48),
  ink: hsl(210, 33, 93),
  inkForeground: hsl(215, 28, 7),
  ground2: hsl(215, 18, 13),
  success: hsl(152, 55, 40),
  successForeground: hsl(215, 28, 7),
  successSoft: hsl(152, 35, 15),
  successSoftForeground: hsl(150, 55, 70),
  warning: hsl(36, 85, 50),
  warningForeground: hsl(215, 28, 7),
  warningSoft: hsl(35, 45, 15),
  warningSoftForeground: hsl(40, 90, 70),
  danger: hsl(350, 70, 58),
  dangerForeground: hsl(215, 28, 7),
  dangerSoft: hsl(350, 40, 16),
  dangerSoftForeground: hsl(350, 85, 78),
  star: hsl(40, 92, 56),
  overlay: hsla(215, 40, 3, 0.6),
  scrim: hsla(215, 40, 3, 0.6),
  shadow: hsl(0, 0, 0),
};

/** Radii in points. Buttons are 10 like the web; cards 20; nothing is a capsule. */
export const radius = { sm: 8, md: 10, lg: 14, card: 20 } as const;

/** A 4-point spacing scale. */
export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;

/** Each weight is its own font file (React Native cannot select weights of a family on Android). */
export const fonts = {
  display: { semibold: "BricolageGrotesque-SemiBold", bold: "BricolageGrotesque-Bold", extrabold: "BricolageGrotesque-ExtraBold" },
  body: { regular: "HankenGrotesk-Regular", medium: "HankenGrotesk-Medium", semibold: "HankenGrotesk-SemiBold", bold: "HankenGrotesk-Bold" },
} as const;

/** The type scale: size, line height, font. Display sizes use Bricolage, the rest Hanken. */
export const type = {
  hero: { fontSize: 32, lineHeight: 38, fontFamily: fonts.display.extrabold, letterSpacing: -0.6 },
  title: { fontSize: 24, lineHeight: 30, fontFamily: fonts.display.bold, letterSpacing: -0.4 },
  heading: { fontSize: 19, lineHeight: 25, fontFamily: fonts.display.bold, letterSpacing: -0.2 },
  subheading: { fontSize: 16, lineHeight: 22, fontFamily: fonts.body.semibold },
  body: { fontSize: 15, lineHeight: 22, fontFamily: fonts.body.regular },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontFamily: fonts.body.semibold },
  small: { fontSize: 13, lineHeight: 18, fontFamily: fonts.body.regular },
  smallStrong: { fontSize: 13, lineHeight: 18, fontFamily: fonts.body.semibold },
  caption: { fontSize: 12, lineHeight: 16, fontFamily: fonts.body.medium },
  eyebrow: { fontSize: 11, lineHeight: 14, fontFamily: fonts.body.bold, letterSpacing: 1.1, textTransform: "uppercase" as const },
} as const;

export type TypeVariant = keyof typeof type;
