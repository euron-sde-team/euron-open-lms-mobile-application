import { StyleSheet, Text as RNText, type TextProps as RNTextProps } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { type, type TypeVariant } from "../theme/tokens";
import type { Palette } from "../theme/tokens";

type Tone = "default" | "muted" | "subtle" | "primary" | "link" | "success" | "warning" | "danger" | "inverse";

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  tone?: Tone;
  center?: boolean;
}

const toneColor = (c: Palette, t: Tone): string =>
  ({
    default: c.foreground,
    muted: c.mutedForeground,
    subtle: c.subtleForeground,
    primary: c.primary,
    link: c.link,
    success: c.success,
    warning: c.warning,
    danger: c.danger,
    inverse: c.inkForeground,
  })[t];

/** Every string on screen goes through this, so the type scale and colours stay consistent. */
export function Text({ variant = "body", tone = "default", center, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  return <RNText {...rest} style={[type[variant], { color: toneColor(colors, tone) }, center && styles.center, style]} />;
}

const styles = StyleSheet.create({ center: { textAlign: "center" } });
