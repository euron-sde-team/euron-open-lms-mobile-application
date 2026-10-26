/**
 * The question palette: a bottom sheet with one numbered tile per question, showing which
 * are answered, still open or flagged, and which one is on screen. Tiles are squares with
 * 10 point corners (a grid of positions, not a row of choice chips).
 */
import { memo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Flag } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../../ui/components/Button";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { radius, space } from "../../../ui/theme/tokens";
import { paletteStatus, type PaletteStatus, type QuizRunState } from "./quiz-state";

const STATUS_LABEL: Record<PaletteStatus, string> = { answered: "answered", unanswered: "not answered", flagged: "flagged" };

const Tile = memo(function PaletteTile({ n, status, current, onPress }: { n: number; status: PaletteStatus; current: boolean; onPress: (i: number) => void }) {
  const { colors } = useTheme();
  const look =
    status === "answered"
      ? { backgroundColor: colors.ink, borderColor: colors.ink, color: colors.inkForeground }
      : status === "flagged"
        ? { backgroundColor: colors.warningSoft, borderColor: colors.warning, color: colors.warningSoftForeground }
        : { backgroundColor: "transparent", borderColor: colors.input, color: colors.foreground };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Question ${n}, ${STATUS_LABEL[status]}${current ? ", current" : ""}`}
      accessibilityState={{ selected: current }}
      onPress={() => onPress(n - 1)}
      testID={`quiz-palette-${n}`}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: look.backgroundColor, borderColor: current ? colors.ring : look.borderColor, borderWidth: current ? 2 : 1 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text variant="smallStrong" style={{ color: look.color }}>{String(n)}</Text>
      {status === "flagged" ? <Flag size={11} color={colors.warning} fill={colors.warning} style={styles.flag} /> : null}
    </Pressable>
  );
});

export function QuizPalette({ visible, state, onClose, onJump, onReview }: { visible: boolean; state: QuizRunState; onClose: () => void; onJump: (index: number) => void; onReview: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.fill}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} accessibilityRole="button" accessibilityLabel="Close questions" onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, space[4]) }]} testID="quiz-palette" accessibilityViewIsModal>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text variant="heading">Questions</Text>
          <Text variant="small" tone="muted" style={{ marginTop: space[1] }}>Dark: answered. Outlined: not yet. Amber: flagged.</Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.grid}>
            {state.questionIds.map((id, i) => (
              <Tile key={id} n={i + 1} status={paletteStatus(state, id)} current={state.screen === "answering" && state.index === i} onPress={onJump} />
            ))}
          </ScrollView>
          <Button label="Review and submit" variant="outline" block onPress={onReview} testID="quiz-palette-review" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, paddingHorizontal: space[5], paddingTop: space[3], maxHeight: "80%" },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, marginBottom: space[4] },
  scroll: { flexGrow: 0 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[5], marginBottom: space[6] },
  tile: { width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  flag: { position: "absolute", top: 4, right: 4 },
});
