/** Small layout utilities shared by the learning area's screens, so no style is an inline literal. */
import { StyleSheet } from "react-native";

export const u = StyleSheet.create({
  flex1: { flex: 1 },
  grow: { flexGrow: 1 },
  shrink: { flexShrink: 1 },
  row: { flexDirection: "row" },
  mt2: { marginTop: 2 },
  selfStart: { alignSelf: "flex-start" },
  selfEnd: { alignSelf: "flex-end" },
  linkHit: { alignSelf: "flex-start", minHeight: 32, justifyContent: "center" },
  full: { width: "100%" },
  dim: { opacity: 0.8 },
  faint: { opacity: 0.22 },
  sheetScroll: { maxHeight: 520 },
  note90: { minHeight: 90 },
  note80: { minHeight: 80 },
  field72: { minHeight: 72 },
  field64: { minHeight: 64 },
});
