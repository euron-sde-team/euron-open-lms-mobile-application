import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { CatalogFacets } from "../../../api/vendor/types";
import { FakeSession, renderWithProviders } from "../../../../test/render";
import { fakeCard, fakeMeta } from "../test-fixtures";
import { ExploreScreen } from "./ExploreScreen";

jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true }),
  useRoute: () => ({ key: "Explore-1", name: "Explore", params: undefined }),
}));

const facets: CatalogFacets = {
  categories: [],
  levels: { BEGINNER: 30, INTERMEDIATE: 12, ADVANCED: 0, ALL_LEVELS: 0 },
  languages: [{ code: "en", count: 42 }],
  price: { free: 10, paid: 32, subscription: 0 },
  rating: { "3": 40, "3.5": 33, "4": 25, "4.5": 9 },
  length: { short: 20, medium: 15, long: 7 },
};

function api() {
  return {
    meta: { get: jest.fn(async () => fakeMeta()) },
    notifications: { counts: jest.fn(async () => ({ notifications: 0 })) },
    catalog: {
      // One page with more behind it: a filtered list never fetches ahead on its own.
      courses: jest.fn(async (_q: { cursor?: string }) => ({ items: [fakeCard()], nextCursor: "next" })),
      facets: jest.fn(async (q: Record<string, unknown>) => (q.minRating ? { ...facets, levels: { BEGINNER: 3, INTERMEDIATE: 1, ADVANCED: 0, ALL_LEVELS: 0 } } : facets)),
      categories: jest.fn(async () => []),
    },
  };
}

describe("ExploreScreen", () => {
  it("sends rating and length to the server and counts from the server total", async () => {
    const a = api();
    await renderWithProviders(
      <FakeSession status="signedOut" api={a}>
        <ExploreScreen />
      </FakeSession>
    );
    expect(await screen.findByText("42 courses")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("catalog-explore-filters"));
    // The sheet counts each rating and length from the facets.
    expect(screen.getByText("9")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    await fireEvent.press(screen.getByText("4.5 and up"));
    await fireEvent.press(screen.getByText("Under 2 hours"));
    await fireEvent.press(screen.getByTestId("catalog-filter-apply"));

    await waitFor(() => expect(a.catalog.courses).toHaveBeenLastCalledWith(expect.objectContaining({ minRating: 4.5, length: "short", limit: 20, sort: "popular" })));
    expect(a.catalog.facets).toHaveBeenLastCalledWith({ minRating: 4.5, length: "short" });
    expect(await screen.findByText("4 courses")).toBeTruthy();
    expect(screen.getByTestId("catalog-explore-summary").props.children).toBe("4.5 and up · Under 2 hours");
    expect(screen.queryByText(/shown so far/)).toBeNull();
    // Only the first page per query: no device-side fetching ahead to fill a filtered list.
    expect(a.catalog.courses.mock.calls.every(([q]) => !q.cursor)).toBe(true);
  });
});
