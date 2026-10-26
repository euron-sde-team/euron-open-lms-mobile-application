import { fireEvent, screen } from "@testing-library/react-native";
import type { LearningEntry, LearningSummary } from "../../../api/vendor/types";
import { FakeSession, renderWithProviders } from "../../../../test/render";
import { LearningScreen, summaryLine } from "./LearningScreen";

const summary: LearningSummary = { inProgress: 2, completed: 1, certificates: 1, minutesThisWeek: 75, streakDays: 3 };

function entry(over: Partial<LearningEntry> = {}): LearningEntry {
  return {
    course: { id: "c1", slug: "botany", title: "Botany basics", subtitle: null, coverUrl: null, level: "BEGINNER", language: "en", accessMode: "PAID", includedInSubscription: false, instructors: [], categories: [], itemCount: 19, durationSeconds: 3600, enrollmentCount: 10, rating: null, price: null, compareAt: null, featured: false, publishedAt: null, viewer: null },
    enrollmentId: "e1",
    source: "PURCHASE",
    progressPercent: 42,
    completedItems: 8,
    totalItems: 19,
    completedAt: null,
    lastActivityAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    resumeItem: { id: "it8", title: "Leaf anatomy", kind: "LECTURE" },
    validUntil: null,
    active: true,
    certificate: null,
    ...over,
  };
}

const api = () => ({
  meta: { get: jest.fn(async () => ({ academyName: "Test Academy", mobile: { downloadsEnabled: false } })) },
  notifications: { counts: jest.fn(async () => ({ notifications: 0 })) },
  my: {
    summary: jest.fn(async () => summary),
    learning: jest.fn(async () => ({ items: [entry(), entry({ enrollmentId: "e2", active: false, course: { ...entry().course, id: "c2", slug: "chem", title: "Chemistry" } })], nextCursor: null })),
    saved: jest.fn(async () => ({ items: [], nextCursor: null })),
    bookmarks: jest.fn(async () => ({ items: [{ item: { id: "b1", title: "Photosynthesis", kind: "LECTURE" }, course: { slug: "botany", title: "Botany basics" }, createdAt: "2026-01-01T00:00:00Z" }], nextCursor: null })),
    certificates: jest.fn(async () => [{ serial: "OLMS-7", learnerName: "J", courseTitle: "Botany basics", courseSlug: "botany", instructorNames: [], issuedAt: "2026-02-03T00:00:00Z", revoked: false, revokedAt: null, pdfUrl: null, verifyUrl: "", academyName: "A" }]),
  },
});

const route = (tab?: string) => ({ key: "Learning-1", name: "Learning", params: tab ? { tab } : undefined });

describe("LearningScreen", () => {
  it("asks a guest to sign in", async () => {
    await renderWithProviders(
      <FakeSession api={api()} status="signedOut">
        <LearningScreen route={route() as never} navigation={{} as never} />
      </FakeSession>
    );
    expect(await screen.findByTestId("learning-guest")).toBeTruthy();
    expect(screen.getByText("Your learning lives here")).toBeTruthy();
  });

  it("lists courses in progress with the progress line and a lapsed course", async () => {
    const a = api();
    await renderWithProviders(
      <FakeSession api={a}>
        <LearningScreen route={route() as never} navigation={{} as never} />
      </FakeSession>
    );
    expect(await screen.findByText("Botany basics")).toBeTruthy();
    expect(screen.getByText("42% · 8 of 19")).toBeTruthy();
    expect(screen.getByText("Resume: Leaf anatomy")).toBeTruthy();
    expect(screen.getByTestId("learning-lapsed")).toBeTruthy();
    expect(await screen.findByText(summaryLine(summary))).toBeTruthy();
    expect(a.my.learning).toHaveBeenCalledWith(expect.objectContaining({ status: "in_progress" }));
  });

  it("opens on the tab from the route and shows certificates and bookmarks", async () => {
    await renderWithProviders(
      <FakeSession api={api()}>
        <LearningScreen route={route("certificates") as never} navigation={{} as never} />
      </FakeSession>
    );
    expect(await screen.findByText(/Serial OLMS-7/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("learning-tabs-saved"));
    expect(await screen.findByText("Photosynthesis")).toBeTruthy();
    expect(screen.getByText("Bookmarked lessons")).toBeTruthy();
  });

  it("summarises only the real parts", () => {
    expect(summaryLine(summary)).toBe("2 in progress · 1 completed · 1 certificate · 1 h 15 min this week · 3 day streak");
    expect(summaryLine({ inProgress: 0, completed: 0, certificates: 2, minutesThisWeek: 0, streakDays: 1 })).toBe("0 in progress · 0 completed · 2 certificates");
  });
});
