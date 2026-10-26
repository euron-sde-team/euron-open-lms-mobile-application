/**
 * Small, non-secret preferences that should survive a restart (theme, the downloads
 * index, the last seen notification). Secrets never go here: the refresh token lives in
 * the Keychain or Keystore (lib/secure-store.ts).
 */
import { createMMKV, type MMKV } from "react-native-mmkv";

let instance: MMKV | null = null;

function store(): MMKV {
  if (!instance) instance = createMMKV({ id: "open-lms" });
  return instance;
}

export const prefs = {
  getString(key: string): string | undefined {
    return store().getString(key);
  },
  setString(key: string, value: string): void {
    store().set(key, value);
  },
  getJson<T>(key: string): T | undefined {
    const raw = store().getString(key);
    if (raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  },
  setJson(key: string, value: unknown): void {
    store().set(key, JSON.stringify(value));
  },
  remove(key: string): void {
    store().remove(key);
  },
};

/** Keys in one place so nothing collides. */
export const PREF = {
  theme: "theme",
  downloads: "downloads.v1",
  deviceId: "device.id",
  pushToken: "push.token",
  /** Set once the app has asked for notification permission, so it never asks twice. */
  pushAsked: "push.asked",
  lastUser: "session.lastUser",
} as const;
