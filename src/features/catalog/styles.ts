/** Small layout atoms shared by the catalog screens, so no style object is rebuilt per render. */
import { StyleSheet } from "react-native";

export const u = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  gap6: { gap: 6 },
  gap8: { gap: 8 },
  flexGap6: { flex: 1, gap: 6 },
  flexGap8: { flex: 1, gap: 8 },
  mt2: { marginTop: 2 },
  mt4: { marginTop: 4 },
  mt6: { marginTop: 6 },
  fullHeight: { height: "100%" },
  pushDown: { marginTop: "auto", gap: 6, paddingTop: 8 },
});
