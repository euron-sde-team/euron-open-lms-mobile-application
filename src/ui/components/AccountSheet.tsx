/**
 * A bottom sheet: a modal card rising from the bottom edge over a scrim, with a title and
 * a close action. Used for choices that need a list (the billing country) and for full
 * screen viewers. One surface, no nested boxes.
 */
import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { radius, space } from "../theme/tokens";
import { IconButton } from "./Button";
import { Text } from "./Text";

export function AccountSheet({ visible, title, onClose, children, scroll = true, full, testID }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; scroll?: boolean; full?: boolean; testID?: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.fill, { backgroundColor: colors.overlay }]}>
        <Pressable style={styles.fill} accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} />
        <View testID={testID} style={[styles.card, full ? styles.full : styles.part, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, space[4]) }]}>
          <View style={[styles.head, { borderBottomColor: colors.border }]}>
            <Text variant="subheading" style={styles.fill} numberOfLines={1}>{title}</Text>
            <IconButton label="Close" onPress={onClose} icon={<X size={22} color={colors.foreground} />} size={44} />
          </View>
          {scroll ? <ScrollView contentContainerStyle={{ paddingHorizontal: space[4] }} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={styles.fill}>{children}</View>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  full: { height: "92%" },
  part: { maxHeight: "85%" },
  card: { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", paddingLeft: space[4], paddingRight: space[1], paddingVertical: space[1], borderBottomWidth: StyleSheet.hairlineWidth },
});
