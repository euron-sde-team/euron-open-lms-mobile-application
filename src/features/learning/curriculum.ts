/**
 * Pure helpers over the classroom curriculum: order, neighbours (skipping what the viewer
 * cannot open), ring values, labels and cache surgery for progress. Mirrors the web's
 * lib/classroom/curriculum.ts so both apps move through a course the same way.
 */
import type { Classroom, ClassroomItem, ClassroomSection, CourseDetail, ProgressResult } from "../../api/vendor/types";

export interface FlatItem {
  item: ClassroomItem;
  section: ClassroomSection;
  index: number;
}

export function flattenItems(sections: ClassroomSection[]): FlatItem[] {
  const out: FlatItem[] = [];
  for (const section of sections) for (const item of section.items) out.push({ item, section, index: out.length });
  return out;
}

/** Whether the viewer may open this item (a PREVIEW viewer only gets free previews). */
export function canOpen(role: Classroom["role"], item: Pick<ClassroomItem, "isPreview">): boolean {
  return role !== "PREVIEW" || item.isPreview;
}

/** Previous and next openable items around `itemId`, across sections. Locked items are skipped. */
export function neighbours(classroom: Pick<Classroom, "sections" | "role">, itemId: string | null | undefined): { prev: ClassroomItem | null; next: ClassroomItem | null } {
  const flat = flattenItems(classroom.sections).filter((f) => canOpen(classroom.role, f.item));
  const at = flat.findIndex((f) => f.item.id === itemId);
  if (at < 0) return { prev: null, next: null };
  return { prev: flat[at - 1]?.item ?? null, next: flat[at + 1]?.item ?? null };
}

export function findItem(sections: ClassroomSection[], itemId: string | null | undefined): FlatItem | null {
  if (!itemId) return null;
  return flattenItems(sections).find((f) => f.item.id === itemId) ?? null;
}

/**
 * Which item the classroom opens: the requested one when it exists, else where the learner
 * left off, else the first item they can open.
 */
export function initialItemId(classroom: Pick<Classroom, "sections" | "role" | "resumeItemId">, requested?: string | null): string | null {
  if (requested && findItem(classroom.sections, requested)) return requested;
  const resume = classroom.resumeItemId ? findItem(classroom.sections, classroom.resumeItemId) : null;
  if (resume && canOpen(classroom.role, resume.item)) return resume.item.id;
  return flattenItems(classroom.sections).find((f) => canOpen(classroom.role, f.item))?.item.id ?? null;
}

/** The ring value for a curriculum row: completed is full; a video shows what was watched. */
export function ringPercent(item: ClassroomItem): number {
  if (item.progress.completed) return 100;
  if (item.kind === "LECTURE" && item.lectureKind === "VIDEO") return item.progress.watchedPercent;
  return 0;
}

/** "Best 80%", "Passed 90%", "Waiting for review". */
export function itemStatusLabel(item: ClassroomItem): string | null {
  const s = item.status;
  if (!s) return null;
  if (s.kind === "QUIZ") {
    if (s.bestPercent === null) return null;
    return `${s.passed ? "Passed" : "Best"} ${Math.round(s.bestPercent)}%`;
  }
  switch (s.submission) {
    case "SUBMITTED":
      return "Waiting for review";
    case "CHANGES_REQUESTED":
      return "Changes requested";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Not approved";
    default:
      return null;
  }
}

export function itemKindLabel(item: Pick<ClassroomItem, "kind" | "lectureKind">): string {
  if (item.kind === "QUIZ") return "Quiz";
  if (item.kind === "ASSIGNMENT") return "Assignment";
  if (item.lectureKind === "ARTICLE") return "Article";
  if (item.lectureKind === "PDF") return "PDF";
  return "Video";
}

export function isVideo(item: Pick<ClassroomItem, "kind" | "lectureKind">): boolean {
  return item.kind === "LECTURE" && item.lectureKind === "VIDEO";
}

/** Updates one item inside the classroom (bookmarks and progress), keeping section counts right. */
export function patchItem(classroom: Classroom, itemId: string, patch: (item: ClassroomItem) => ClassroomItem): Classroom {
  let touched = false;
  const sections = classroom.sections.map((s) => {
    if (!s.items.some((i) => i.id === itemId)) return s;
    touched = true;
    const items = s.items.map((i) => (i.id === itemId ? patch(i) : i));
    return { ...s, items, completedCount: items.filter((i) => i.progress.completed).length };
  });
  return touched ? { ...classroom, sections } : classroom;
}

/** Folds a ProgressResult into the cached classroom: the item's ring, the course line, the certificate. */
export function applyProgress(classroom: Classroom, itemId: string, result: Pick<ProgressResult, "progress" | "course" | "certificate">): Classroom {
  const next = patchItem(classroom, itemId, (i) => ({ ...i, progress: result.progress }));
  const completedItems = next.sections.reduce((n, s) => n + s.completedCount, 0);
  return {
    ...next,
    enrollment: next.enrollment ? { ...next.enrollment, progressPercent: result.course.progressPercent, completedAt: result.course.completedAt, completedItems } : null,
    certificate: next.certificate ?? (result.certificate ? { serial: result.certificate.serial, issuedAt: new Date().toISOString() } : null),
  };
}

/** True when this result is the one that finished the course (it was not finished before). */
export function finishesCourse(before: Pick<Classroom, "enrollment"> | undefined, result: { course: { completedAt: string | null } }): boolean {
  return !!before?.enrollment && !before.enrollment.completedAt && !!result.course.completedAt;
}

/**
 * A read-only classroom for someone without access (a guest, or a learner not enrolled),
 * built from the public course page: every item at zero progress and role PREVIEW, so
 * only free previews open. The server still decides access for each item.
 */
export function previewClassroom(course: CourseDetail): Classroom {
  const zero = { completed: false, completedAt: null, positionSeconds: 0, watchedPercent: 0 };
  return {
    course: { id: course.id, slug: course.slug, title: course.title, coverUrl: course.coverUrl, certificateEnabled: course.certificateEnabled, allowDownloads: false },
    role: "PREVIEW",
    enrollment: null,
    sections: course.sections.map((s) => ({ id: s.id, title: s.title, completedCount: 0, items: s.items.map((i) => ({ ...i, progress: zero, status: null, bookmarked: false })) })),
    resumeItemId: null,
    certificate: null,
    settings: { videoCompletePercent: 90 },
  };
}
