/**
 * React bindings for the download engine: the live index, one item's entry, whether
 * downloads may be offered at all, and the lifecycle hook that connects the engine to the
 * session, revalidates on start and resumes when the phone comes back online.
 */
import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { mobileFlags, useMeta } from "../../../app/meta";
import { useSession } from "../../../app/session";
import { PREF, prefs } from "../../../lib/storage";
import { downloadManager } from "./engine";
import { isLoopbackAvailable } from "./loopback";
import type { DownloadEntry } from "./state";

export function useDownloads(): DownloadEntry[] {
  const m = downloadManager();
  return useSyncExternalStore(m.subscribe, m.getSnapshot, m.getSnapshot);
}

export function useDownload(itemId: string | null | undefined): DownloadEntry | undefined {
  const entries = useDownloads();
  return itemId ? entries.find((e) => e.itemId === itemId) : undefined;
}

/** Pure: the download button shows only when every switch is on. */
export function downloadsOffered(input: { academyEnabled: boolean; courseAllows: boolean; nativeReady: boolean; signedIn: boolean; previewOnly: boolean }): boolean {
  return input.academyEnabled && input.courseAllows && input.nativeReady && input.signedIn && !input.previewOnly;
}

/** Academy switch plus the native server; the course flag is checked by the caller. */
export function useDownloadsEnabled(): boolean {
  const meta = useMeta();
  const { status } = useSession();
  return mobileFlags(meta.data).downloadsEnabled && isLoopbackAvailable() && status === "signedIn";
}

/**
 * Mounted once, at the top of app/Navigator.tsx, for the whole life of the app.
 * Signed in: attach and revalidate. Offline with a stored session: keep the last user's
 * copies, which still play until their licence window ends.
 */
export function useDownloadsLifecycle(): void {
  const { status, me, api } = useSession();
  useEffect(() => {
    const m = downloadManager();
    if (status === "signedIn" && me) {
      m.attach(api, me.id).then(() => m.revalidate());
    } else if (status === "offline") {
      m.attach(null, prefs.getString(PREF.lastUser) ?? null);
    } else if (status === "signedOut") {
      m.detach();
    }
  }, [status, me, api]);

  useEffect(() => {
    if (status !== "signedIn") return;
    let wasOnline = true;
    const unNet = NetInfo.addEventListener((s) => {
      const on = !!s.isConnected && s.isInternetReachable !== false;
      if (on && !wasOnline) downloadManager().online();
      wasOnline = on;
    });
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") downloadManager().revalidate();
    });
    return () => {
      unNet();
      sub.remove();
    };
  }, [status]);
}
