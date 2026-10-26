/**
 * Wires push for the whole app: registers this device after sign-in (asking for permission
 * once, right after the first sign-in rather than at launch), re-registers on token
 * refresh, forgets the token after sign-out, turns foreground messages into an in-app
 * banner and opens the right screen when a notification is tapped from the background or
 * from a cold start. Mount it once (PushBridge); a second mount stays inert.
 */
import { getInitialNotification, onMessage, onNotificationOpenedApp, onTokenRefresh, type RemoteMessage } from "@react-native-firebase/messaging";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { mobileFlags, useMeta } from "../../../app/meta";
import { navigationRef } from "../../../app/navigation-ref";
import { qk } from "../../../app/query";
import { useSession } from "../../../app/session";
import { PUSH_ASKED_KEY, askPushPermission, forgetThisDevice, getPushMessaging, pushDecision, pushUrlOf, readPushPermission, registerPushToken, registerThisDevice } from "../../../lib/push";
import { prefs } from "../../../lib/storage";
import { openPath } from "../lib/links";

export interface PushBanner {
  id: string;
  title: string;
  body: string | null;
  url: string | null;
}

let owner: object | null = null;

/** Opens a push's app path once navigation is ready (a cold start may tap before it is). */
function openWhenReady(url: string | null, tries = 0) {
  if (!url) return;
  if (navigationRef.isReady()) {
    openPath(url);
    return;
  }
  if (tries < 50) setTimeout(() => openWhenReady(url, tries + 1), 100);
}

export function bannerOf(m: RemoteMessage): PushBanner | null {
  const title = m.notification?.title ?? null;
  if (!title) return null;
  return { id: m.messageId ?? String(Date.now()), title, body: m.notification?.body ?? null, url: pushUrlOf(m) };
}

/** Delay before the permission prompt after sign-in, so it does not cover the screen that just opened. */
const ASK_DELAY_MS = 1500;

export function usePushRegistration() {
  const { status, me, api } = useSession();
  const meta = useMeta();
  const qc = useQueryClient();
  const pushEnabled = mobileFlags(meta.data).pushEnabled;
  const self = useRef({});
  const [active, setActive] = useState(false);
  const [banner, setBanner] = useState<PushBanner | null>(null);
  const registeredFor = useRef<string | null>(null);
  const wasSignedIn = useRef(false);

  useEffect(() => {
    const mine = self.current;
    if (owner) return;
    owner = mine;
    setActive(true);
    return () => {
      if (owner === mine) owner = null;
    };
  }, []);

  const messaging = active ? getPushMessaging() : null;

  // Register (or ask first) for each signed-in account.
  useEffect(() => {
    if (!active) return;
    const signedIn = status === "signedIn" && !!me;
    if (!signedIn) {
      if (wasSignedIn.current && status === "signedOut") {
        registeredFor.current = null;
        forgetThisDevice(messaging);
      }
      wasSignedIn.current = false;
      return;
    }
    wasSignedIn.current = true;
    if (!messaging || registeredFor.current === me.id) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      const permission = await readPushPermission(messaging);
      const decision = pushDecision({ pushEnabled, hasFirebase: true, signedIn, permission, asked: !!prefs.getString(PUSH_ASKED_KEY) });
      if (!alive || decision === "off") return;
      if (decision === "ask") {
        await new Promise<void>((r) => (timer = setTimeout(r, ASK_DELAY_MS)));
        if (!alive || (await askPushPermission(messaging)) !== "granted") return;
      }
      await registerThisDevice(api, messaging);
      if (alive) registeredFor.current = me.id;
    })().catch(() => undefined);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [active, status, me, api, messaging, pushEnabled]);

  // Token rotation and foreground messages while signed in.
  const signedInId = status === "signedIn" ? me?.id ?? null : null;
  useEffect(() => {
    if (!messaging || !signedInId || !pushEnabled) return;
    const offRefresh = onTokenRefresh(messaging, (token) => {
      if (registeredFor.current) registerPushToken(api, token).catch(() => undefined);
    });
    const offMessage = onMessage(messaging, (m) => {
      qc.invalidateQueries({ queryKey: qk.notifications });
      const b = bannerOf(m);
      if (b) setBanner(b);
    });
    return () => {
      offRefresh();
      offMessage();
    };
  }, [messaging, signedInId, pushEnabled, api, qc]);

  // Taps on a notification: from the background, and the one that cold-started the app.
  useEffect(() => {
    if (!messaging) return;
    const off = onNotificationOpenedApp(messaging, (m) => openWhenReady(pushUrlOf(m)));
    getInitialNotification(messaging)
      .then((m) => openWhenReady(pushUrlOf(m)))
      .catch(() => undefined);
    return off;
  }, [messaging]);

  // The banner leaves on its own after 4 s.
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 4000);
    return () => clearTimeout(t);
  }, [banner]);

  const dismiss = useCallback(() => setBanner(null), []);
  const openBanner = useCallback(() => {
    const url = banner?.url ?? null;
    setBanner(null);
    if (url) openPath(url);
  }, [banner]);

  return { banner, dismiss, openBanner };
}
