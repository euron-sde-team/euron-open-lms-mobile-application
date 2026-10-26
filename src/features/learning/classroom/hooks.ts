/**
 * Server state for the classroom: the classroom shell (or a preview built from the public
 * course page when the viewer has no access), the open item, the course page, playback,
 * and the one place a ProgressResult is folded into every cache that shows it.
 */
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "../../../app/query";
import { useSession } from "../../../app/session";
import { isApiError } from "../../../api/vendor/client/errors";
import type { Classroom, ItemContent, ProgressResult } from "../../../api/vendor/types";
import { applyProgress, finishesCourse, previewClassroom } from "../curriculum";

export type ClassroomLoad =
  | { state: "loading" }
  | { state: "ready"; classroom: Classroom; preview: boolean }
  | { state: "blocked"; lapsed: boolean }
  | { state: "error"; error: unknown; retry: () => void };

/**
 * Signed in: GET /api/learn/:slug. A guest, or a learner the server refuses
 * (COURSE_ACCESS_REQUIRED), gets the public curriculum as a PREVIEW classroom, so free
 * previews still open and everything else shows as locked.
 */
export function useClassroomLoad(slug: string): ClassroomLoad {
  const { status, api } = useSession();
  const signedIn = status === "signedIn";
  const shell = useQuery({ queryKey: qk.classroom(slug), queryFn: () => api.learn.classroom(slug), enabled: signedIn, staleTime: 60_000 });
  const refused = !signedIn || (isApiError(shell.error) && shell.error.code === "COURSE_ACCESS_REQUIRED");
  const course = useQuery({ queryKey: qk.course(slug), queryFn: () => api.catalog.course(slug), enabled: refused });

  if (signedIn && shell.data) return { state: "ready", classroom: shell.data, preview: false };
  if (signedIn && shell.isPending) return { state: "loading" };
  if (signedIn && shell.isError && !refused) return { state: "error", error: shell.error, retry: () => shell.refetch() };
  if (course.data) {
    const hasPreview = course.data.sections.some((s) => s.items.some((i) => i.isPreview));
    if (!hasPreview && signedIn) {
      const reason = isApiError(shell.error) ? shell.error.reason : null;
      return { state: "blocked", lapsed: !!reason && reason !== "NOT_ENROLLED" };
    }
    return { state: "ready", classroom: previewClassroom(course.data), preview: true };
  }
  if (course.isError) return { state: "error", error: course.error, retry: () => course.refetch() };
  return { state: "loading" };
}

/** The public course page (instructors, access mode for capture protection). */
export function useCourseDetail(slug: string) {
  const { api } = useSession();
  return useQuery({ queryKey: qk.course(slug), queryFn: () => api.catalog.course(slug), staleTime: 5 * 60_000 });
}

export function useItem(itemId: string | null) {
  const { api } = useSession();
  return useQuery({ queryKey: qk.item(itemId ?? ""), queryFn: () => api.learn.item(itemId as string), enabled: !!itemId });
}

export const playbackKey = (itemId: string) => ["learn", "playback", itemId] as const;

/**
 * Folds a ProgressResult into the classroom and the item, refreshes My Learning when an
 * item completed, and reports when this result finished the course.
 */
export function useApplyProgress(slug: string, onFinished: (serial: string | null) => void) {
  const qc = useQueryClient();
  return useCallback(
    (itemId: string, result: ProgressResult) => {
      const before = qc.getQueryData<Classroom>(qk.classroom(slug));
      qc.setQueryData<Classroom>(qk.classroom(slug), (c) => (c ? applyProgress(c, itemId, result) : c));
      qc.setQueryData<ItemContent>(qk.item(itemId), (it) => (it ? ({ ...it, progress: result.progress } as ItemContent) : it));
      if (result.justCompleted) {
        qc.invalidateQueries({ queryKey: ["my"] });
      }
      if (finishesCourse(before, result)) {
        onFinished(result.certificate?.serial ?? null);
        qc.invalidateQueries({ queryKey: qk.certificates });
      }
    },
    [qc, slug, onFinished]
  );
}
