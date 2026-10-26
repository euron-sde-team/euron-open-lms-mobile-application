/**
 * Build-time configuration from .env (react-native-config). Only what the app needs before
 * it can reach the server lives here; everything else (the academy's name, currencies,
 * whether downloads or push are on, the iOS purchase link) comes from GET /api/meta.
 *
 * Local development: the iOS simulator shares the Mac's localhost. For the Android
 * emulator or a USB device run `pnpm android:reverse`, which forwards the local stack's
 * ports, so the same localhost URLs work there too (docs/guides/android.md).
 */
import Config from "react-native-config";
import { Platform } from "react-native";

function required(name: string, value: string | undefined, fallback: string): string {
  const v = (value ?? "").trim();
  if (v) return v;
  if (__DEV__) return fallback;
  throw new Error(`${name} is not set. Copy .env.example to .env and set it before building a release.`);
}

export const config = {
  /** The euron-open-lms API, including /api. */
  apiBaseUrl: required("API_BASE_URL", Config.API_BASE_URL, "http://localhost:5026/api").replace(/\/+$/, ""),
  /** The academy's website (public certificate pages, the iOS "continue on the web" link). */
  webBaseUrl: required("WEB_BASE_URL", Config.WEB_BASE_URL, "http://localhost:3530").replace(/\/+$/, ""),
  /** The app's URL scheme for deep links and payment returns. */
  scheme: (Config.APP_SCHEME ?? "openlms").trim() || "openlms",
  /** Host for https app links (universal links / Android App Links), when configured. */
  appLinkHost: (Config.APP_LINK_HOST ?? "").trim() || null,
  platform: Platform.OS as "ios" | "android",
  /**
   * Debug builds only: CAPTURE_GUARD=off lets screenshots and screen recordings of paid
   * video work, for QA and documentation. Release builds always protect.
   */
  captureGuard: !(__DEV__ && (Config.CAPTURE_GUARD ?? "").trim().toLowerCase() === "off"),
} as const;
