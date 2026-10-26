/** Layout atoms shared by the account screens, so markup stays free of inline style objects. */
import { StyleSheet } from "react-native";

export const u = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  row: { flexDirection: "row" },
  rowCenter: { flexDirection: "row", alignItems: "center" },
  center: { alignItems: "center" },
  end: { alignItems: "flex-end" },
  start: { alignSelf: "flex-start" },
  mt2: { marginTop: 2 },
  mt4: { marginTop: 4 },
  mb6: { marginBottom: 6 },
  target: { minHeight: 44, justifyContent: "center" },
  dim: { opacity: 0.6 },
  soft: { opacity: 0.7 },
  opaque: { opacity: 1 },
});
