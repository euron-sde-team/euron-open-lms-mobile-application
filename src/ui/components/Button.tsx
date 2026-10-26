/**
 * Buttons follow the web app: one lit action per screen in ink, flat secondary actions,
 * 10 point corners. Never a capsule.
 */
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radius, type as typeScale } from "../theme/tokens";
import { Text } from "./Text";

type Variant = "primary" | "brand" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<PressableProps, "style" | "children"> {
  label: string;
  variant?: Variant;
  size?: Size;
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  /** An icon after the label (a forward chevron). */
  trailingIcon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

const HEIGHT: Record<Size, number> = { sm: 34, md: 44, lg: 52 };

export function Button({ label, variant = "primary", size = "md", block, loading, icon, trailingIcon, disabled, style, ...rest }: ButtonProps) {
  const { colors } = useTheme();
  const palette: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.ink, fg: colors.inkForeground },
    brand: { bg: colors.primary, fg: colors.primaryForeground },
    secondary: { bg: colors.muted, fg: colors.foreground },
    outline: { bg: colors.card, fg: colors.foreground, border: colors.input },
    ghost: { bg: "transparent", fg: colors.foreground },
    danger: { bg: colors.danger, fg: colors.dangerForeground },
  };
  const p = palette[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      accessibilityLabel={label}
      disabled={off}
      hitSlop={size === "sm" ? 6 : 0}
      style={({ pressed }) => [
        styles.base,
        { height: HEIGHT[size], paddingHorizontal: size === "sm" ? 12 : size === "md" ? 16 : 22, backgroundColor: p.bg },
        p.border ? { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: p.border } : null,
        block && styles.block,
        off && styles.disabled,
        pressed && { opacity: 0.86, transform: [{ scale: 0.985 }] },
        style,
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={p.fg} /> : icon ? <View style={styles.icon}>{icon}</View> : null}
      {!loading ? <Text style={[size === "sm" ? typeScale.smallStrong : typeScale.bodyStrong, { color: p.fg }]} numberOfLines={1}>{label}</Text> : null}
      {!loading && trailingIcon ? <View style={styles.trailing}>{trailingIcon}</View> : null}
    </Pressable>
  );
}

/** A tappable icon without a box around it (back, more, close). */
export function IconButton({ icon, label, onPress, size = 40 }: { icon: ReactNode; label: string; onPress: () => void; size?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={({ pressed }) => [{ width: size, height: size, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 }]}>
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  block: { alignSelf: "stretch" },
  disabled: { opacity: 0.5 },
  icon: { marginRight: -2 },
  trailing: { marginLeft: -2 },
});
