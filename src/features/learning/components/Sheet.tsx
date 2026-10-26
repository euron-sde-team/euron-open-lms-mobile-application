/**
 * A bottom sheet for short lists of choices (player settings, report reasons, note
 * actions): a Modal sliding up over a scrim, a title on a hairline and the content. Not a
 * box inside a box: rows sit directly on the sheet.
 */
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton } from "../../../ui/components/Button";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { radius, space } from "../../../ui/theme/tokens";
import { u } from "../styles";

export function Sheet({ visible, title, onClose, children, testID }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; testID?: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent supportedOrientations={["portrait", "landscape"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.fill}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={[styles.fill, { backgroundColor: colors.overlay }]} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.popover, paddingBottom: Math.max(insets.bottom, space[4]) }]} testID={testID}>
          <View style={[styles.head, { borderBottomColor: colors.border }]}>
            <Text variant="subheading" style={u.flex1} accessibilityRole="header">{title}</Text>
            <IconButton label="Close" onPress={onClose} icon={<X size={22} color={colors.foreground} />} />
          </View>
          <ScrollView style={u.sheetScroll} contentContainerStyle={{ paddingHorizontal: space[4] }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A label above a group of rows inside a sheet. */
export function SheetLabel({ children }: { children: string }) {
  return (
    <Text variant="eyebrow" tone="subtle" style={{ marginTop: space[5], marginBottom: space[1] }}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  sheet: { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card },
  head: { flexDirection: "row", alignItems: "center", paddingLeft: space[4], paddingRight: space[2], paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth },
});
