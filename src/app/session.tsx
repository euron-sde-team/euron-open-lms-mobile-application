/**
 * The signed-in session. On launch it reads the refresh token from the Keychain and
 * refreshes once; the access token then lives only in memory and is refreshed on demand
 * by the transport when the API says it is stale. Every rotation is written back to the
 * Keychain before the new token is used, so a crash cannot leave a spent token stored.
 */
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import DeviceInfo from "react-native-device-info";
import { createApiClient, type ApiClient, type NativeAuthResult } from "../api/client";
import type { LoginInput, SignupInput } from "../api/vendor/client/endpoints/core";
import type { Me } from "../api/vendor/types";
import { config } from "../config";
import { secureStore } from "../lib/secure-store";
import { PREF, prefs } from "../lib/storage";

/** `offline`: a stored session the server could not be reached to confirm (downloads still play). */
type Status = "booting" | "signedOut" | "signedIn" | "offline";

export type SignInOutcome = { ok: true } | { ok: false; totpRequired: true } | { ok: false; verificationRequired: true; email: string };

export interface SessionValue {
  status: Status;
  me: Me | null;
  api: ApiClient;
  signIn: (input: LoginInput) => Promise<SignInOutcome>;
  signUp: (input: SignupInput) => Promise<SignInOutcome>;
  /** Completes a session issued by another flow (email verification by link). */
  adopt: (result: NativeAuthResult) => Promise<void>;
  signOut: (opts?: { everywhere?: boolean }) => Promise<void>;
  setMe: (me: Me) => void;
  /** Try the stored session again (after coming back online). */
  retry: () => void;
}

/** Exported for tests (test/render.tsx), which provide a fake session. */
export const SessionContext = createContext<SessionValue | null>(null);

function isNativeSession(r: unknown): r is NativeAuthResult {
  return !!r && typeof r === "object" && "accessToken" in r && "refreshToken" in r;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("booting");
  const [me, setMe] = useState<Me | null>(null);
  const access = useRef<string | null>(null);
  const refresh = useRef<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const persist = useCallback(async (r: NativeAuthResult) => {
    await secureStore.writeSession({ refreshToken: r.refreshToken, refreshExpiresAt: r.refreshExpiresAt, userId: r.user.id });
    refresh.current = r.refreshToken;
    access.current = r.accessToken;
    prefs.setString(PREF.lastUser, r.user.id);
  }, []);

  const endLocally = useCallback(async () => {
    access.current = null;
    refresh.current = null;
    await secureStore.clearSession();
    queryClient.clear();
    setMe(null);
    setStatus("signedOut");
  }, [queryClient]);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: config.apiBaseUrl,
        appVersion: `${DeviceInfo.getVersion()} (${DeviceInfo.getBuildNumber()})`,
        getAccessToken: () => access.current,
        getRefreshToken: async () => refresh.current ?? (await secureStore.readSession())?.refreshToken ?? null,
        onRefresh: async (r) => {
          await persist(r);
          setMe(r.user);
        },
        onSignedOut: () => {
          endLocally().catch(() => undefined);
        },
      }),
    [persist, endLocally]
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = await secureStore.readSession();
      if (!stored || Date.parse(stored.refreshExpiresAt) <= Date.now()) {
        if (stored) await secureStore.clearSession();
        if (alive) setStatus("signedOut");
        return;
      }
      refresh.current = stored.refreshToken;
      try {
        const r = await api.http.refreshSession();
        if (!alive) return;
        if (r) {
          setMe(r.user);
          setStatus("signedIn");
        } else await endLocally();
      } catch {
        // Offline at launch: keep the stored session and let the app open on downloads.
        if (alive) setStatus("offline");
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, endLocally, attempt]);

  const adopt = useCallback(
    async (r: NativeAuthResult) => {
      await persist(r);
      setMe(r.user);
      setStatus("signedIn");
    },
    [persist]
  );

  const signIn = useCallback(
    async (input: LoginInput): Promise<SignInOutcome> => {
      const r = await api.auth.login(input);
      if ("totpRequired" in r) return { ok: false, totpRequired: true };
      if (!isNativeSession(r)) throw new Error("The server did not return a native session. Update euron-open-lms.");
      await adopt(r);
      return { ok: true };
    },
    [api, adopt]
  );

  const signUp = useCallback(
    async (input: SignupInput): Promise<SignInOutcome> => {
      const r = await api.auth.signup(input);
      if ("verificationRequired" in r) return { ok: false, verificationRequired: true, email: r.email };
      if (!isNativeSession(r)) throw new Error("The server did not return a native session. Update euron-open-lms.");
      await adopt(r);
      return { ok: true };
    },
    [api, adopt]
  );

  const signOut = useCallback(
    async (opts?: { everywhere?: boolean }) => {
      const token = refresh.current ?? (await secureStore.readSession())?.refreshToken ?? null;
      try {
        if (opts?.everywhere) await api.session.logoutAll();
        else if (token) await api.session.logout(token, prefs.getString(PREF.pushToken) ?? null);
      } catch {
        // Signing out must always work locally, even offline or with a revoked session.
      }
      await endLocally();
    },
    [api, endLocally]
  );

  const retry = useCallback(() => {
    setStatus("booting");
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo<SessionValue>(() => ({ status, me, api, signIn, signUp, adopt, signOut, setMe, retry }), [status, me, api, signIn, signUp, adopt, signOut, retry]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}

/** The API client, for hooks and screens. */
export function useApi(): ApiClient {
  return useSession().api;
}
