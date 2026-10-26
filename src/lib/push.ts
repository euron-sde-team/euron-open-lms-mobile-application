/**
 * Push notifications through Firebase Cloud Messaging (the RN Firebase modular API). Push
 * is on only when the academy's server can send it (meta.mobile.pushEnabled) AND this
 * build has a Firebase app configured; a build without GoogleService files simply has no
 * push, silently. The permission prompt is never shown at launch: the account area asks
 * once, after the first sign-in (features/account/push). The FCM token is registered with
 * PUT /api/my/devices and kept in prefs so sign-out can name this device.
 */
import { getApp } from "@react-native-firebase/app";
import { AuthorizationStatus, deleteToken, getMessaging, getToken, hasPermission, requestPermission, type Messaging, type RemoteMessage } from "@react-native-firebase/messaging";
import { PermissionsAndroid, Platform } from "react-native";
import DeviceInfo from "react-native-device-info";
import type { ApiClient } from "../api/client";
import { PREF, prefs } from "./storage";

/** Set once the app has shown the system prompt, so a refusal is never asked again. */
export const PUSH_ASKED_KEY = PREF.pushAsked;

export type PushPermission = "granted" | "denied" | "undetermined" | "unavailable";

/** The messaging instance, or null when this build has no Firebase app (push off, no error). */
export function getPushMessaging(): Messaging | null {
  try {
    return getMessaging(getApp());
  } catch {
    return null;
  }
}

export type PushDecision = "off" | "ask" | "register";

/**
 * What to do for a session: nothing, ask for permission, or register the token. Pure, so
 * every guard (no Firebase, push switched off, permission refused) has a test.
 */
export function pushDecision(input: { pushEnabled: boolean; hasFirebase: boolean; signedIn: boolean; permission: PushPermission; asked: boolean }): PushDecision {
  if (!input.signedIn || !input.pushEnabled || !input.hasFirebase) return "off";
  if (input.permission === "granted") return "register";
  if (input.permission === "undetermined" && !input.asked) return "ask";
  return "off";
}

const androidNeedsRuntimePermission = () => Platform.OS === "android" && Number(Platform.Version) >= 33;

function fromAuthStatus(s: number): PushPermission {
  if (s === AuthorizationStatus.AUTHORIZED || s === AuthorizationStatus.PROVISIONAL || s === AuthorizationStatus.EPHEMERAL) return "granted";
  if (s === AuthorizationStatus.DENIED) return "denied";
  return "undetermined";
}

/** The current permission without prompting. */
export async function readPushPermission(m: Messaging | null): Promise<PushPermission> {
  if (!m) return "unavailable";
  try {
    if (androidNeedsRuntimePermission()) {
      const ok = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (ok) return "granted";
      return prefs.getString(PUSH_ASKED_KEY) ? "denied" : "undetermined";
    }
    return fromAuthStatus(await hasPermission(m));
  } catch {
    return "unavailable";
  }
}

/** Shows the system prompt (Android 13+ POST_NOTIFICATIONS, or the iOS alert). */
export async function askPushPermission(m: Messaging | null): Promise<PushPermission> {
  if (!m) return "unavailable";
  prefs.setString(PUSH_ASKED_KEY, new Date().toISOString());
  try {
    if (androidNeedsRuntimePermission()) {
      const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      return r === PermissionsAndroid.RESULTS.GRANTED ? "granted" : "denied";
    }
    return fromAuthStatus(await requestPermission(m));
  } catch {
    return "denied";
  }
}

/** "en-IN" style locale the server accepts, or undefined. */
export function deviceLocale(): string | undefined {
  try {
    const l = Intl.DateTimeFormat().resolvedOptions().locale;
    return /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/.test(l) && l.length <= 35 ? l : undefined;
  } catch {
    return undefined;
  }
}

/** Registers a token for the signed-in account and remembers it on the device. */
export async function registerPushToken(api: ApiClient, token: string): Promise<void> {
  await api.devices.register({ platform: Platform.OS === "ios" ? "IOS" : "ANDROID", token, appVersion: DeviceInfo.getVersion().slice(0, 40), locale: deviceLocale() });
  prefs.setString(PREF.pushToken, token);
}

/** Fetches this device's FCM token and registers it. */
export async function registerThisDevice(api: ApiClient, m: Messaging): Promise<string> {
  const token = await getToken(m);
  await registerPushToken(api, token);
  return token;
}

/**
 * Before signing out: tell the server to stop pushing to this device while the session
 * still works. Best effort; logout also sends the token, and logout-all removes every device.
 */
export async function unregisterThisDevice(api: ApiClient): Promise<void> {
  const token = prefs.getString(PREF.pushToken);
  if (!token) return;
  await api.devices.remove(token).catch(() => undefined);
}

/** After signing out: forget the token so the next person on this phone gets a fresh one. */
export async function forgetThisDevice(m: Messaging | null = getPushMessaging()): Promise<void> {
  prefs.remove(PREF.pushToken);
  if (m) await deleteToken(m).catch(() => undefined);
}

/** The app path a push opens (`data.url`, see PushData in the API types). */
export function pushUrlOf(message: Pick<RemoteMessage, "data"> | null | undefined): string | null {
  const url = message?.data?.url;
  return typeof url === "string" && url ? url : null;
}
