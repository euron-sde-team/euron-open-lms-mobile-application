/**
 * The Account tab. Guests see the academy, sign in and create account, plus the settings
 * that work without an account (appearance, about). Learners see who they are and their
 * settings as grouped rows on hairlines.
 */
import { useNavigation } from "@react-navigation/native";
import { Alert, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMeta } from "../../app/meta";
import { useSession } from "../../app/session";
import { Button } from "../../ui/components/Button";
import { Row, Screen } from "../../ui/components/Layout";
import { Avatar } from "../../ui/components/Media";
import { Text } from "../../ui/components/Text";
import { useTheme } from "../../ui/theme/ThemeProvider";
import { space } from "../../ui/theme/tokens";
import { GroupLabel } from "./components";
import { signOutDevice } from "./lib/signout";
import { u } from "./styles";

const MODE_WORD = { system: "System", light: "Light", dark: "Dark" } as const;

export function AccountScreen() {
  const session = useSession();
  const { status, me } = session;
  const meta = useMeta();
  const { mode } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const top = { paddingTop: insets.top + space[8] };
  const academy = meta.data?.academyName ?? "Your academy";
  const signedIn = status === "signedIn" && !!me;

  if (!signedIn) {
    return (
      <Screen testID="account-guest" style={top}>
        <Text variant="title">{academy}</Text>
        <Text tone="muted" style={{ marginTop: space[2] }}>Sign in to keep your progress, certificates and purchases on this phone.</Text>
        <View style={{ gap: space[3], marginTop: space[6] }}>
          <Button label="Sign in" block onPress={() => navigation.navigate("SignIn")} testID="account-sign-in" />
          {meta.data?.registration !== "CLOSED" ? <Button label="Create account" variant="outline" block onPress={() => navigation.navigate("SignUp")} testID="account-sign-up" /> : null}
        </View>
        <GroupLabel>Settings</GroupLabel>
        <Row label="Appearance" value={MODE_WORD[mode]} onPress={() => navigation.navigate("Appearance")} testID="account-appearance" />
        <Row label="About" onPress={() => navigation.navigate("About")} testID="account-about" last />
      </Screen>
    );
  }

  const confirmSignOut = (everywhere: boolean) =>
    Alert.alert(everywhere ? "Sign out of all devices?" : "Sign out?", everywhere ? "Every device, including this one, is signed out." : "Downloads stay on this phone until they expire.", [
      { text: "Cancel", style: "cancel" },
      { text: everywhere ? "Sign out everywhere" : "Sign out", style: "destructive", onPress: () => { signOutDevice(session, { everywhere }); } },
    ]);

  return (
    <Screen testID="account-signed-in" style={top}>
      <View style={[u.rowCenter, { gap: space[4] }]}>
        <Avatar uri={me.avatarUrl} name={me.displayName} size={64} />
        <View style={u.flex}>
          <Text variant="title" numberOfLines={2}>{me.displayName}</Text>
          <Text tone="muted" numberOfLines={1}>{me.email}</Text>
        </View>
      </View>

      <GroupLabel>Learning</GroupLabel>
      <Row label="My certificates" onPress={() => navigation.navigate("Tabs", { screen: "Learning", params: { tab: "certificates" } })} testID="account-certificates" />
      <Row label="Downloads" onPress={() => navigation.navigate("Downloads")} testID="account-downloads" last />

      <GroupLabel>Purchases</GroupLabel>
      <Row label="Orders" onPress={() => navigation.navigate("Orders")} testID="account-orders" />
      <Row label="Subscription" value={me.subscription?.plan.name} onPress={() => navigation.navigate("Subscription")} testID="account-subscription" last />

      <GroupLabel>Settings</GroupLabel>
      <Row label="Profile" onPress={() => navigation.navigate("Profile")} testID="account-profile" />
      <Row label="Security" value={me.totpEnabled ? "Two-factor on" : undefined} onPress={() => navigation.navigate("Security")} testID="account-security" />
      <Row label="Sessions" onPress={() => navigation.navigate("Sessions")} testID="account-sessions" />
      <Row label="Notifications" onPress={() => navigation.navigate("NotificationSettings")} testID="account-notification-settings" />
      <Row label="Appearance" value={MODE_WORD[mode]} onPress={() => navigation.navigate("Appearance")} testID="account-appearance" />
      <Row label="Privacy and data" onPress={() => navigation.navigate("Privacy")} testID="account-privacy" last />

      <GroupLabel>{academy}</GroupLabel>
      <Row label="About" onPress={() => navigation.navigate("About")} testID="account-about" />
      <Row label="Sign out" destructive onPress={() => confirmSignOut(false)} testID="account-sign-out" />
      <Row label="Sign out of all devices" destructive onPress={() => confirmSignOut(true)} testID="account-sign-out-all" last />
    </Screen>
  );
}
