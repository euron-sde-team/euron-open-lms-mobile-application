/**
 * Catalog data hooks. Query keys come from app/query.ts (`qk`) and add the viewer as the
 * last part, so a page cached for a guest is never shown after signing in, while a prefix
 * invalidation of `qk.course(slug)` (after a purchase elsewhere) still reaches it.
 */
import { useFocusEffect } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { purchaseMode, useMeta } from "../../app/meta";
import { qk } from "../../app/query";
import { useSession } from "../../app/session";
import { config } from "../../config";
import type { PurchaseContext } from "./purchase";

/** "guest" or the signed-in user's id. */
export function useViewerKey(): string {
  const { status, me } = useSession();
  return status === "signedIn" && me ? me.id : "guest";
}

export function useSignedIn(): boolean {
  const { status, me } = useSession();
  return status === "signedIn" && !!me;
}

export function usePurchaseContext(): PurchaseContext {
  const meta = useMeta();
  return { mode: purchaseMode(meta.data), academyName: meta.data?.academyName?.trim() || "the academy", webBaseUrl: config.webBaseUrl };
}

export function useCourse(slug: string) {
  const { api } = useSession();
  const viewer = useViewerKey();
  return useQuery({ queryKey: [...qk.course(slug), viewer], queryFn: () => api.catalog.course(slug) });
}

/** Refetches when the screen comes back into focus (not on the first focus). */
export function useRefetchOnFocus(refetch: () => unknown): void {
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      refetch();
    }, [refetch])
  );
}

/** Free enrollment. The caller opens the classroom with the returned resume item. */
export function useEnrollFree(slug: string) {
  const { api } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.catalog.enrollFree(slug),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.course(slug) });
      qc.invalidateQueries({ queryKey: ["my"] });
      qc.invalidateQueries({ queryKey: qk.home });
    },
  });
}
