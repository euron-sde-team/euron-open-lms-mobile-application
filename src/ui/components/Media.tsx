/**
 * Images and identity: course covers with a quiet placeholder, avatars with initials, the
 * star rating and the price line.
 */
import { useState } from "react";
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { Star } from "lucide-react-native";
import { useTheme } from "../theme/ThemeProvider";
import { fonts, radius } from "../theme/tokens";
import { Text } from "./Text";

/** Ten duotones that all carry white type at AA (the same set as the web app's generated covers). */
const COVER_PALETTES = [
  { from: "#0A6B78", to: "#0E99AD", line: "#BFF3FA" },
  { from: "#1E3A8A", to: "#2563EB", line: "#C7D7FE" },
  { from: "#3B1C7A", to: "#6D28D9", line: "#DDD6FE" },
  { from: "#064E3B", to: "#059669", line: "#A7F3D0" },
  { from: "#7C2D12", to: "#C2410C", line: "#FED7AA" },
  { from: "#881337", to: "#BE123C", line: "#FECDD3" },
  { from: "#0F172A", to: "#334155", line: "#CBD5E1" },
  { from: "#075985", to: "#0284C7", line: "#BAE6FD" },
  { from: "#78350F", to: "#B45309", line: "#FDE68A" },
  { from: "#18181B", to: "#0B7F90", line: "#A5F3FC" },
] as const;

/** FNV-1a, the same hash the web uses, so a course has the same cover on both. */
/* eslint-disable no-bitwise -- a hash is bitwise by nature */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/* eslint-enable no-bitwise */

/**
 * A generated cover for a course without an uploaded one: a duotone and a quiet line motif
 * picked from the seed (the course slug), with the title in the display face. It paints
 * instantly and needs no network.
 */
export function GeneratedCover({ title, seed, kicker, size = "md" }: { title?: string; seed: string; kicker?: string | null; size?: "sm" | "md" | "lg" }) {
  const p = COVER_PALETTES[hashString(seed) % COVER_PALETTES.length];
  const variant = hashString(`${seed}:v`) % 3;
  const gid = `g${hashString(seed).toString(36)}`;
  const pad = size === "lg" ? 22 : size === "sm" ? 10 : 14;
  // Decorative, like the web's aria-hidden cover: the title is read from the card itself.
  return (
    <View style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={p.from} />
            <Stop offset="1" stopColor={p.to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="160" height="90" fill={`url(#${gid})`} />
        <G opacity={0.22}>
          {variant === 0
            ? [18, 30, 42, 54, 66].map((r) => <Circle key={r} cx="136" cy="14" r={r} fill="none" stroke={p.line} strokeWidth="0.8" />)
            : variant === 1
              ? [0, 1, 2, 3, 4, 5].map((i) => <Path key={i} d={`M ${-10 + i * 14} 100 Q ${60 + i * 6} ${30 - i * 3} 170 ${8 + i * 9}`} fill="none" stroke={p.line} strokeWidth="0.8" />)
              : [0, 1, 2, 3, 4].map((i) => <Rect key={i} x={102 - i * 9} y={-8 + i * 9} width={70} height={70} rx={14} fill="none" stroke={p.line} strokeWidth="0.8" transform={`rotate(${12 + i * 3} 130 30)`} />)}
        </G>
      </Svg>
      {title ? (
        <View style={[styles.coverText, { padding: pad }]}>
          {kicker ? <Text style={[styles.kicker, size === "sm" && styles.kickerSm]} numberOfLines={1}>{kicker.toUpperCase()}</Text> : null}
          <Text style={[styles.coverTitle, size === "lg" ? styles.coverTitleLg : size === "sm" ? styles.coverTitleSm : null]} numberOfLines={3}>{title}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * A course or bundle cover: the uploaded image, or the generated cover when there is none
 * or it fails to load. Pass `seed` (the slug) and `title` so the fallback matches the web.
 */
export function Cover({ uri, aspect = 16 / 9, rounded = radius.lg, style, label, seed, title, kicker, size }: {
  uri?: string | null;
  aspect?: number;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
  label?: string;
  seed?: string;
  title?: string;
  kicker?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const frame = [styles.cover, { aspectRatio: aspect, borderRadius: rounded, backgroundColor: colors.muted }, style];
  if (uri && !failed) {
    return (
      <View style={frame} accessibilityLabel={label}>
        <Image source={{ uri }} onError={() => setFailed(true)} style={StyleSheet.absoluteFill} resizeMode="cover" />
      </View>
    );
  }
  return (
    <View style={frame} accessibilityLabel={label}>
      {seed ? <GeneratedCover seed={seed} title={title} kicker={kicker} size={size} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.primarySoft }]} />}
    </View>
  );
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "")).toUpperCase();
}

export function Avatar({ uri, name, size = 36 }: { uri?: string | null; name?: string | null; size?: number }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  if (uri && !failed) return <Image source={{ uri }} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.muted }} accessibilityLabel={name ?? undefined} />;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primarySoft }]} accessibilityLabel={name ?? undefined}>
      <Text style={{ fontFamily: fonts.body.bold, fontSize: size * 0.38, color: colors.primarySoftForeground }}>{initials(name)}</Text>
    </View>
  );
}

export function Rating({ value, count, size = 13 }: { value: number | null; count?: number; size?: number }) {
  const { colors } = useTheme();
  if (value === null || value === undefined) return null;
  return (
    <View style={styles.rating} accessibilityLabel={`Rated ${value.toFixed(1)} out of 5${count ? ` from ${count} reviews` : ""}`}>
      <Star size={size} color={colors.star} fill={colors.star} />
      <Text variant="smallStrong">{value.toFixed(1)}</Text>
      {count !== undefined ? <Text variant="small" tone="subtle">{`(${count.toLocaleString()})`}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { overflow: "hidden" },
  coverText: { flex: 1, justifyContent: "flex-end" },
  kicker: { color: "rgba(255,255,255,0.8)", fontFamily: fonts.body.semibold, fontSize: 10.5, letterSpacing: 1.2, marginBottom: 4 },
  kickerSm: { fontSize: 9 },
  coverTitle: { color: "#FFFFFF", fontFamily: fonts.display.semibold, fontSize: 20, lineHeight: 22, letterSpacing: -0.4 },
  coverTitleLg: { fontSize: 30, lineHeight: 32 },
  coverTitleSm: { fontSize: 14, lineHeight: 16 },
  avatar: { alignItems: "center", justifyContent: "center" },
  rating: { flexDirection: "row", alignItems: "center", gap: 4 },
});
