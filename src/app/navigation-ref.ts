/**
 * A navigation handle for code outside screens (push notification taps, the sign-in
 * guard). Links go through React Navigation's own parser so they match app/linking.ts.
 */
import { createNavigationContainerRef, getStateFromPath } from "@react-navigation/native";
import { linking, toAppUrl, prefixes } from "./linking";
import type { RootParams } from "./routes";

export const navigationRef = createNavigationContainerRef<RootParams>();

/** Opens an app path or link (from a push or a notification row). Returns false when it is not ours. */
export function openAppLink(pathOrUrl: string | null | undefined): boolean {
  const url = toAppUrl(pathOrUrl);
  if (!url || !navigationRef.isReady()) return false;
  const prefix = prefixes.find((p) => url.startsWith(p)) ?? "";
  const path = url.slice(prefix.length).replace(/^\/*/, "");
  const state = getStateFromPath(path, linking.config);
  if (!state) return false;
  const route = state.routes[state.routes.length - 1];
  // Navigate (not reset) so Back returns to where the person was.
  (navigationRef.navigate as (name: string, params?: object) => void)(route.name, route.params);
  return true;
}

/** Sends a guest to sign in. */
export function requireSignIn(): void {
  if (navigationRef.isReady()) navigationRef.navigate("SignIn");
}
