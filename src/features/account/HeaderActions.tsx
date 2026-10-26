/**
 * The right side of a tab screen's header: the notifications bell with an unread dot and
 * the person's avatar (or "Sign in" for a guest). Owned by the account area; every tab
 * screen imports it. Every target is at least 44 points.
 */
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Pressable, StyleSheet, View } from "react-native";
import { Bell } from "lucide-react-native";
import { qk } from "../../app/query";
import { useSession } from "../../app/session";
import { Avatar } from "../../ui/components/Media";
import { Text } from "../../ui/components/Text";
import { useTheme } from "../../ui/theme/ThemeProvider";

export function HeaderActions() {
  const { colors } = useTheme();
  const { status, me, api } = useSession();
  const navigation = useNavigation();
  const signedIn = status === "signedIn" && !!me;
  // Polled while the app is open; a push or opening Notifications refreshes it sooner.
  const counts = useQuery({ queryKey: qk.notificationCounts, queryFn: () => api.notifications.counts(), enabled: signedIn, refetchInterval: 60_000, refetchIntervalInBackground: false });
  const unread = counts.data?.notifications ?? 0;

  if (!signedIn) {
    return (
      <Pressable accessibilityRole="button" onPress={() => navigation.navigate("SignIn")} hitSlop={8} style={styles.target} testID="header-sign-in">
        <Text variant="smallStrong" tone="link">Sign in</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={unread ? `Notifications, ${unread} unread` : "Notifications"} onPress={() => navigation.navigate("Notifications")} style={styles.target} testID="header-notifications">
        <View>
          <Bell size={22} color={colors.foreground} />
          {unread > 0 ? <View style={[styles.dot, { backgroundColor: colors.danger, borderColor: colors.background }]} /> : null}
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Account" onPress={() => navigation.navigate("Tabs", { screen: "Account" })} style={styles.target} testID="header-avatar">
        <Avatar uri={me.avatarUrl} name={me.displayName} size={30} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  target: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: -1, right: -1, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5 },
});
