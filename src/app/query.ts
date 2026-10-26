/**
 * Server state lives in TanStack Query. Defaults tuned for a phone: no refetch storms on
 * every focus, retry once for flaky networks, never retry 4xx (they will not change).
 * Query keys are built here so invalidations always match.
 */
import { QueryClient, focusManager, onlineManager } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import { AppState, Platform } from "react-native";
import { isApiError } from "../api/vendor/client/errors";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        retry: (count, err) => !(isApiError(err) && err.status >= 400 && err.status < 500) && count < 1,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}

/** Online and focus signals from the OS, so queries pause offline and refresh on return. */
export function wireQueryLifecycle(): () => void {
  onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(!!s.isConnected)));
  const sub = AppState.addEventListener("change", (s) => {
    if (Platform.OS !== "web") focusManager.setFocused(s === "active");
  });
  return () => sub.remove();
}

export const qk = {
  meta: ["meta"] as const,
  me: ["me"] as const,
  home: ["catalog", "home"] as const,
  catalog: (q: object) => ["catalog", "list", q] as const,
  facets: ["catalog", "facets"] as const,
  categories: ["catalog", "categories"] as const,
  course: (slug: string) => ["catalog", "course", slug] as const,
  bundle: (slug: string) => ["catalog", "bundle", slug] as const,
  reviews: (slug: string) => ["catalog", "reviews", slug] as const,
  instructor: (id: string) => ["catalog", "instructor", id] as const,
  plans: ["billing", "plans"] as const,
  learning: (tab: string) => ["my", "learning", tab] as const,
  summary: ["my", "summary"] as const,
  classroom: (slug: string) => ["learn", "classroom", slug] as const,
  item: (itemId: string) => ["learn", "item", itemId] as const,
  notes: (slug: string) => ["learn", "notes", slug] as const,
  qa: (itemId: string) => ["community", "qa", itemId] as const,
  quiz: (itemId: string) => ["quiz", itemId] as const,
  assignment: (itemId: string) => ["assignment", itemId] as const,
  certificates: ["certificates"] as const,
  certificate: (serial: string) => ["certificates", serial] as const,
  notifications: ["notifications"] as const,
  notificationCounts: ["notifications", "counts"] as const,
  orders: ["billing", "orders"] as const,
  order: (id: string) => ["billing", "order", id] as const,
  subscription: ["billing", "subscription"] as const,
  sessions: ["account", "sessions"] as const,
};
