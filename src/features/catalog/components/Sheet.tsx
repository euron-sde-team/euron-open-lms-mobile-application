/**
 * A bottom sheet on the system Modal: a scrim, a flat panel with a title row and an
 * optional footer action. Used for Explore's filters and the report reasons. Keeps the
 * keyboard clear of fields and respects the bottom safe area.
 */
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton } from "../../../ui/components/Button";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { radius, space } from "../../../ui/theme/tokens";

export function Sheet({ visible, title, onClose, children, footer, testID }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; testID?: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.fill}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={[styles.scrim, { backgroundColor: colors.overlay }]} />
        <View style={[styles.panel, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, space[4]) }]} testID={testID}>
          <View style={[styles.head, { borderBottomColor: colors.border }]}>
            <Text variant="heading" style={styles.title} accessibilityRole="header">{title}</Text>
            <IconButton label="Close" onPress={onClose} icon={<X size={22} color={colors.foreground} />} size={44} />
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer ? <View style={[styles.foot, { borderTopColor: colors.border }]}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: "flex-end" },
  scrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  panel: { maxHeight: "88%", borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card },
  head: { flexDirection: "row", alignItems: "center", paddingLeft: space[4], paddingRight: space[1], paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1 },
  body: { paddingHorizontal: space[4], paddingBottom: space[4] },
  foot: { paddingHorizontal: space[4], paddingTop: space[3], borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: space[3] },
});
