/**
 * Euron Open LMS Mobile: the iOS and Android learner app for a Euron Open LMS academy.
 * The server is euron-open-lms (run it first); lecture video streams from
 * euron-video-system through the LMS. Providers, outermost first: safe area, theme,
 * server state, session, then navigation.
 */
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Navigator } from "./src/app/Navigator";
import { createQueryClient, wireQueryLifecycle } from "./src/app/query";
import { SessionProvider } from "./src/app/session";
import { ThemeProvider, useTheme } from "./src/ui/theme/ThemeProvider";

function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar barStyle={scheme === "dark" ? "light-content" : "dark-content"} />;
}

export default function App() {
  const [queryClient] = useState(createQueryClient);
  useEffect(() => wireQueryLifecycle(), []);
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedStatusBar />
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <Navigator />
          </SessionProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
