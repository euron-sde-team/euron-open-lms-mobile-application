/**
 * Shown when the app starts without a connection but with a stored session: downloaded
 * lectures still play, everything else waits for the network.
 */
import { useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { DownloadsScreen } from "../features/learning";
import { useSession } from "./session";
import type { RootParams } from "./routes";

const Stack = createNativeStackNavigator<Pick<RootParams, "Downloads">>();

export function OfflineScreen() {
  const { retry } = useSession();
  useEffect(() => NetInfo.addEventListener((s) => { if (s.isConnected && s.isInternetReachable !== false) retry(); }), [retry]);
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Downloads" component={DownloadsScreen as never} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
