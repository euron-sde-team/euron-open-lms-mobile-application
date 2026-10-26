/** Fixtures for the catalog's screen tests: an academy, course cards and a course page. */
import type { AcademyMeta, CourseAccess, CourseCard, CourseDetail, LearningEntry } from "../../api/vendor/types";

export function fakeMeta(over: { iosWebPurchaseLink?: boolean; subscriptions?: boolean } = {}): AcademyMeta {
  return {
    academyName: "Northwind Academy",
    tagline: "Learn data, one project at a time.",
    logoUrl: null,
    registration: "OPEN",
    currencies: ["USD"],
    defaultCurrency: "USD",
    payments: { stripe: { enabled: true, publishableKey: null }, razorpay: { enabled: false, keyId: null, checkoutScriptUrl: "" }, routing: {} },
    subscriptions: over.subscriptions ?? true,
    ai: { quizGeneration: false, gradingAssist: false, polish: false },
    support: { email: null },
    mobile: { iosWebPurchaseLink: !!over.iosWebPurchaseLink, minSupportedVersion: null, downloadsEnabled: false, pushEnabled: false, appReturnSchemes: ["openlms"] },
  };
}

export function fakeCard(over: Partial<CourseCard> = {}): CourseCard {
  return {
    id: "c_1",
    slug: "intro-to-sql",
    title: "Intro to SQL",
    subtitle: "Query real data from day one",
    coverUrl: null,
    level: "BEGINNER",
    language: "en",
    accessMode: "PAID",
    includedInSubscription: false,
    instructors: [{ id: "u_9", username: "ada", displayName: "Ada Moreno", avatarUrl: null, headline: "Data engineer", role: "INSTRUCTOR" }],
    categories: [{ slug: "data", name: "Data" }],
    itemCount: 12,
    durationSeconds: 12000,
    enrollmentCount: 340,
    rating: { average: 4.6, count: 52 },
    price: { amountMinor: 4900, currency: "USD" },
    compareAt: null,
    featured: true,
    publishedAt: "2026-01-10T00:00:00Z",
    viewer: null,
    ...over,
  };
}

export function fakeCourse(access: CourseAccess, over: Partial<CourseDetail> = {}): CourseDetail {
  const card = fakeCard();
  return {
    ...card,
    status: "PUBLISHED",
    descriptionHtml: "<p>Learn SQL by querying a real shop database.</p>",
    outcomes: ["Write SELECT queries with joins"],
    prerequisites: ["Basic spreadsheet skills"],
    certificateEnabled: true,
    allowDownloads: false,
    instructors: [{ ...card.instructors[0], bio: null, website: null }],
    sections: [
      {
        id: "s1",
        title: "Getting started",
        durationSeconds: 900,
        items: [
          { id: "i1", kind: "LECTURE", title: "Why SQL", lectureKind: "VIDEO", durationSeconds: 300, isPreview: true },
          { id: "i2", kind: "QUIZ", title: "Check your basics", lectureKind: null, durationSeconds: 0, isPreview: false },
        ],
      },
    ],
    counts: { lectures: 10, quizzes: 1, assignments: 1, articles: 0, pdfs: 0 },
    ratingBreakdown: { "1": 1, "2": 1, "3": 5, "4": 15, "5": 30 },
    access,
    bundles: [],
    updatedAt: "2026-09-01T00:00:00Z",
    ...over,
  };
}

export function fakeEntry(): LearningEntry {
  return {
    course: fakeCard({ id: "c_2", slug: "python-basics", title: "Python Basics" }),
    enrollmentId: "e_1",
    source: "PURCHASE",
    progressPercent: 42,
    completedItems: 8,
    totalItems: 19,
    completedAt: null,
    lastActivityAt: "2026-10-25T10:00:00Z",
    resumeItem: { id: "item_8", title: "Loops", kind: "LECTURE" },
    validUntil: null,
    active: true,
    certificate: null,
  };
}

export const emptyPage = { items: [], nextCursor: null };
