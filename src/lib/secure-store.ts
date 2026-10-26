/**
 * Secrets in the iOS Keychain or the Android Keystore: the refresh token and the keys
 * that decrypt downloaded lectures. Readable after the first unlock (so background
 * refreshes and downloads work), never synced to other devices or backups.
 */
import * as Keychain from "react-native-keychain";

const OPTIONS = { accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY } as const;
const SERVICE = { session: "open-lms.session", downloadKey: (itemId: string) => `open-lms.download.${itemId}` };

export interface StoredSession {
  refreshToken: string;
  refreshExpiresAt: string;
  userId: string;
}

export const secureStore = {
  async readSession(): Promise<StoredSession | null> {
    try {
      const c = await Keychain.getGenericPassword({ service: SERVICE.session });
      if (!c) return null;
      const parsed = JSON.parse(c.password) as Partial<StoredSession>;
      return parsed.refreshToken && parsed.userId && parsed.refreshExpiresAt ? (parsed as StoredSession) : null;
    } catch {
      return null;
    }
  },
  async writeSession(s: StoredSession): Promise<void> {
    await Keychain.setGenericPassword(s.userId, JSON.stringify(s), { ...OPTIONS, service: SERVICE.session });
  },
  async clearSession(): Promise<void> {
    await Keychain.resetGenericPassword({ service: SERVICE.session }).catch(() => undefined);
  },
  /** The AES key of a downloaded lecture, base64. */
  async readDownloadKey(itemId: string): Promise<string | null> {
    const c = await Keychain.getGenericPassword({ service: SERVICE.downloadKey(itemId) }).catch(() => false as const);
    return c ? c.password : null;
  },
  async writeDownloadKey(itemId: string, keyB64: string): Promise<void> {
    await Keychain.setGenericPassword("key", keyB64, { ...OPTIONS, service: SERVICE.downloadKey(itemId) });
  },
  async clearDownloadKey(itemId: string): Promise<void> {
    await Keychain.resetGenericPassword({ service: SERVICE.downloadKey(itemId) }).catch(() => undefined);
  },
};
