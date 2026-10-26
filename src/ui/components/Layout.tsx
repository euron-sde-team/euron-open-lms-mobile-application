/**
 * Screen scaffolding: the safe-area screen, the flat header with a hairline, sections set
 * as type on hairlines (no boxes inside boxes), list rows and dividers.
 */
import type { ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, type ScrollViewProps, type StyleProp, type ViewStyle } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { space } from "../theme/tokens";
import { IconButton } from "./Button";
import { Text } from "./Text";

const CLEAR = "transparent";

export function Screen({ children, scroll = true, padded = true, refreshing, onRefresh, footer, style, testID, ...rest }: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
} & Omit<ScrollViewProps, "style" | "children" | "refreshControl">) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = padded ? { paddingHorizontal: space[4] } : null;
  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]} testID={testID}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[pad, { paddingBottom: space[8] + (footer ? 0 : insets.bottom) }, style]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.brand} /> : undefined}
          {...rest}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, pad, style]}>{children}</View>
      )}
      {footer ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space[3]), borderTopColor: colors.border, backgroundColor: colors.card }]}>{footer}</View> : null}
    </View>
  );
}

export function Header({ title, onBack, right, transparent }: { title?: string; onBack?: () => void; right?: ReactNode; transparent?: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top, backgroundColor: transparent ? CLEAR : colors.background, borderBottomColor: transparent ? CLEAR : colors.border }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerSide}>{onBack ? <IconButton label="Back" onPress={onBack} icon={<ChevronLeft size={26} color={colors.foreground} />} /> : null}</View>
        <Text variant="subheading" numberOfLines={1} style={styles.headerTitle}>{title ?? ""}</Text>
        <View style={[styles.headerSide, styles.headerRight]}>{right}</View>
      </View>
    </View>
  );
}

/** A section: an eyebrow or heading, an optional action, then content. Separated by space, not boxes. */
export function Section({ title, eyebrow, action, children, style }: { title?: string; eyebrow?: string; action?: { label: string; onPress: () => void }; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginTop: space[8] }, style]}>
      {(title || eyebrow || action) && (
        <View style={styles.sectionHead}>
          <View style={styles.grow}>
            {eyebrow ? <Text variant="eyebrow" tone="primary">{eyebrow}</Text> : null}
            {title ? <Text variant="heading" style={eyebrow ? styles.titleAfterEyebrow : null}>{title}</Text> : null}
          </View>
          {action ? (
            <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={8}>
              <Text variant="smallStrong" tone="link">{action.label}</Text>
            </Pressable>
          ) : null}
        </View>
      )}
      {children}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: inset }} />;
}

/** A row on a hairline: label, optional detail, chevron when it navigates. */
export function Row({ label, detail, value, left, onPress, destructive, testID, last }: {
  label: string;
  detail?: string;
  value?: string;
  left?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  testID?: string;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const body = (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      {left ? <View style={styles.rowLeft}>{left}</View> : null}
      <View style={styles.grow}>
        <Text variant="bodyStrong" tone={destructive ? "danger" : "default"}>{label}</Text>
        {detail ? <Text variant="small" tone="muted" style={styles.detail}>{detail}</Text> : null}
      </View>
      {value ? <Text variant="small" tone="muted" style={{ marginLeft: space[3] }}>{value}</Text> : null}
      {onPress ? <ChevronRight size={18} color={colors.subtleForeground} style={{ marginLeft: space[2] }} /> : null}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} testID={testID} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {body}
    </Pressable>
  ) : (
    <View testID={testID}>{body}</View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  titleAfterEyebrow: { marginTop: 4 },
  detail: { marginTop: 2 },
  footer: { paddingHorizontal: space[4], paddingTop: space[3], borderTopWidth: StyleSheet.hairlineWidth },
  header: { borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: { height: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: space[1] },
  // Equal sides keep the title centred; a wider action (Delete all) grows its side.
  headerSide: { minWidth: 88, flexDirection: "row", alignItems: "center" },
  headerRight: { justifyContent: "flex-end", paddingRight: space[3] },
  headerTitle: { flex: 1, textAlign: "center" },
  sectionHead: { flexDirection: "row", alignItems: "flex-end", marginBottom: space[3] },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: space[4] },
  rowLeft: { marginRight: space[3] },
});
