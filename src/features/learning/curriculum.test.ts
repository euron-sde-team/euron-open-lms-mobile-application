import type { CourseDetail } from "../../api/vendor/types";
import { applyProgress, canOpen, finishesCourse, initialItemId, itemStatusLabel, neighbours, previewClassroom, ringPercent } from "./curriculum";
import { citem, classroom } from "./test/fixtures";

describe("curriculum navigation", () => {
  it("moves across sections in order", () => {
    const c = classroom();
    expect(neighbours(c, "b")).toEqual({ prev: expect.objectContaining({ id: "a" }), next: expect.objectContaining({ id: "c" }) });
    expect(neighbours(c, "a").prev).toBeNull();
    expect(neighbours(c, "d").next).toBeNull();
    expect(neighbours(c, "zzz")).toEqual({ prev: null, next: null });
  });

  it("skips locked items for a preview viewer", () => {
    const c = classroom({ role: "PREVIEW" });
    expect(canOpen("PREVIEW", c.sections[1].items[0])).toBe(false);
    // b and d are the free previews; a and c are locked and skipped.
    expect(neighbours(c, "b")).toEqual({ prev: null, next: expect.objectContaining({ id: "d" }) });
    expect(neighbours(c, "d").prev?.id).toBe("b");
  });

  it("opens the requested item, else the resume item, else the first openable one", () => {
    const c = classroom();
    expect(initialItemId(c, "b")).toBe("b");
    expect(initialItemId(c, "missing")).toBe("c");
    expect(initialItemId({ ...c, resumeItemId: null })).toBe("a");
    expect(initialItemId(classroom({ role: "PREVIEW" }))).toBe("b");
  });

  it("labels rings and statuses", () => {
    expect(ringPercent(citem("x", { progress: { completed: false, completedAt: null, positionSeconds: 10, watchedPercent: 40 } }))).toBe(40);
    expect(ringPercent(citem("x", { lectureKind: "ARTICLE", progress: { completed: false, completedAt: null, positionSeconds: 0, watchedPercent: 40 } }))).toBe(0);
    expect(itemStatusLabel(citem("q", { kind: "QUIZ", status: { kind: "QUIZ", bestPercent: 80.4, passed: true } }))).toBe("Passed 80%");
    expect(itemStatusLabel(citem("q", { kind: "ASSIGNMENT", status: { kind: "ASSIGNMENT", submission: "SUBMITTED" } }))).toBe("Waiting for review");
  });
});

describe("progress folding", () => {
  it("updates the item, the section count, the course line and the certificate", () => {
    const before = classroom();
    const done = { completed: true, completedAt: "2026-02-01T00:00:00Z", positionSeconds: 290, watchedPercent: 95 };
    const after = applyProgress(before, "c", { progress: done, course: { progressPercent: 100, completedAt: "2026-02-01T00:00:00Z" }, certificate: { serial: "OLMS-1" } });
    expect(after.sections[1].completedCount).toBe(1);
    expect(after.enrollment).toMatchObject({ progressPercent: 100, completedItems: 2 });
    expect(after.certificate?.serial).toBe("OLMS-1");
    expect(finishesCourse(before, { course: { completedAt: "2026-02-01T00:00:00Z" } })).toBe(true);
    expect(finishesCourse(after, { course: { completedAt: "2026-02-01T00:00:00Z" } })).toBe(false);
  });

  it("builds a locked preview classroom from the public course page", () => {
    const course = {
      id: "c1", slug: "botany", title: "Botany", coverUrl: null, certificateEnabled: false, allowDownloads: true,
      sections: [{ id: "s1", title: "Intro", durationSeconds: 60, items: [{ id: "p", kind: "LECTURE", title: "Welcome", lectureKind: "VIDEO", durationSeconds: 60, isPreview: true }, { id: "q", kind: "LECTURE", title: "Deep dive", lectureKind: "VIDEO", durationSeconds: 60, isPreview: false }] }],
    } as unknown as CourseDetail;
    const c = previewClassroom(course);
    expect(c.role).toBe("PREVIEW");
    expect(c.course.allowDownloads).toBe(false);
    expect(initialItemId(c)).toBe("p");
    expect(canOpen(c.role, c.sections[0].items[1])).toBe(false);
  });
});
