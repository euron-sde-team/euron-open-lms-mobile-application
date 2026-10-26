/**
 * Loading, empty and error states, and the small progress primitives used across the
 * catalog, My Learning and the classroom.
 */
import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "../theme/ThemeProvider";
import { radius, space } from "../theme/tokens";
import { Button } from "./Button";
import { Text } from "./Text";

export function Spinner({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.spinner, style]}>
      <ActivityIndicator color={colors.brand} />
    </View>
  );
}

/** A shimmer-free skeleton block: a calm pulse, honouring reduced motion through the native driver. */
export function Skeleton({ width = "100%", height = 14, rounded = radius.sm, style }: { width?: DimensionValue; height?: number; rounded?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const v = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(v, { toValue: 0.55, duration: 700, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[{ width, height, borderRadius: rounded, backgroundColor: colors.muted, opacity: v }, style]} />;
}

export function EmptyState({ title, body, action, testID }: { title: string; body?: string; action?: { label: string; onPress: () => void }; testID?: string }) {
  return (
    <View style={styles.empty} testID={testID}>
      <Text variant="heading" center>{title}</Text>
      {body ? <Text tone="muted" center style={{ marginTop: space[2] }}>{body}</Text> : null}
      {action ? <Button label={action.label} variant="outline" onPress={action.onPress} style={{ marginTop: space[5] }} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return <EmptyState title="Something went wrong" body={message ?? "Check your connection and try again."} action={onRetry ? { label: "Try again", onPress: onRetry } : undefined} testID="error-state" />;
}

/** The thin bar used under course cards: track in muted, fill in brand. */
export function ProgressBar({ value, height = 4, style }: { value: number; height?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }} style={[styles.track, { height, borderRadius: height, backgroundColor: colors.muted }, style]}>
      <View style={{ width: `${pct}%`, height, backgroundColor: colors.brand }} />
    </View>
  );
}

/** A ring for curriculum items and the course header. */
export function ProgressRing({ value, size = 22, stroke = 2.5, done }: { value: number; size?: number; stroke?: number; done?: boolean }) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = done ? 100 : Math.max(0, Math.min(100, value));
  return (
    <Svg width={size} height={size} accessibilityLabel={`${Math.round(pct)}% complete`}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={stroke} fill={done ? colors.brand : "none"} />
      {!done && pct > 0 ? (
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.brand} strokeWidth={stroke} fill="none" strokeDasharray={`${c} ${c}`} strokeDashoffset={c - (pct / 100) * c} strokeLinecap="round" rotation={-90} origin={`${size / 2}, ${size / 2}`} />
      ) : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  empty: { paddingVertical: space[12], paddingHorizontal: space[6], alignItems: "center" },
  spinner: { padding: space[8], alignItems: "center" },
  track: { overflow: "hidden" },
});
