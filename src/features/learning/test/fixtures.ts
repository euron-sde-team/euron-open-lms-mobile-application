/** Classroom fixtures shared by the learning area's tests. */
import type { Classroom, ClassroomItem, ClassroomSection } from "../../../api/vendor/types";

export function citem(id: string, over: Partial<ClassroomItem> = {}): ClassroomItem {
  return {
    id,
    kind: "LECTURE",
    title: `Lesson ${id}`,
    lectureKind: "VIDEO",
    durationSeconds: 300,
    isPreview: false,
    progress: { completed: false, completedAt: null, positionSeconds: 0, watchedPercent: 0 },
    status: null,
    bookmarked: false,
    ...over,
  };
}

export function csection(id: string, items: ClassroomItem[]): ClassroomSection {
  return { id, title: `Section ${id}`, items, completedCount: items.filter((i) => i.progress.completed).length };
}

export function classroom(over: Partial<Classroom> = {}): Classroom {
  return {
    course: { id: "c1", slug: "botany", title: "Botany basics", coverUrl: null, certificateEnabled: true, allowDownloads: true },
    role: "LEARNER",
    enrollment: { id: "e1", progressPercent: 25, completedItems: 1, totalItems: 4, completedAt: null, validUntil: null },
    sections: [
      csection("s1", [citem("a", { progress: { completed: true, completedAt: "2026-01-01T00:00:00Z", positionSeconds: 300, watchedPercent: 100 } }), citem("b", { lectureKind: "ARTICLE", isPreview: true })]),
      csection("s2", [citem("c"), citem("d", { kind: "QUIZ", lectureKind: null, isPreview: true })]),
    ],
    resumeItemId: "c",
    certificate: null,
    settings: { videoCompletePercent: 90 },
    ...over,
  };
}
