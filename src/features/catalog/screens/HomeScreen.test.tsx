import { fireEvent, screen } from "@testing-library/react-native";
import { FakeSession, renderWithProviders } from "../../../../test/render";
import { emptyPage, fakeCard, fakeEntry, fakeMeta } from "../test-fixtures";
import { HomeScreen } from "./HomeScreen";


const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), canGoBack: () => true }),
}));

function api(over: Record<string, unknown> = {}) {
  return {
    meta: { get: jest.fn(async () => fakeMeta()) },
    catalog: {
      featured: jest.fn(async () => ({ featured: [fakeCard()], popular: [fakeCard({ id: "c_3", slug: "stats", title: "Statistics" })], newest: [], free: [] })),
      categories: jest.fn(async () => [{ id: "cat1", slug: "data", name: "Data", description: null, courseCount: 4 }]),
    },
    my: { learning: jest.fn(async () => ({ items: [fakeEntry()], nextCursor: null })) },
    notifications: { counts: jest.fn(async () => ({ notifications: 0 })) },
    ...over,
  };
}

beforeEach(() => mockNavigate.mockClear());

describe("HomeScreen", () => {
  it("shows a guest the academy, shelves and topics with a quiet sign-in line, and no personal rows", async () => {
    const a = api();
    await renderWithProviders(
      <FakeSession status="signedOut" api={a}>
        <HomeScreen />
      </FakeSession>
    );
    expect(await screen.findByText("Northwind Academy")).toBeTruthy();
    expect(await screen.findByText("Intro to SQL")).toBeTruthy();
    expect(screen.getByText("Statistics")).toBeTruthy();
    expect(screen.getByTestId("catalog-home-sign-in")).toBeTruthy();
    expect(screen.queryByText("Continue learning")).toBeNull();
    expect(a.my.learning).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("catalog-category-data"));
    expect(mockNavigate).toHaveBeenCalledWith("Tabs", { screen: "Explore", params: { category: "data" } });
  });

  it("shows a learner the course to continue and opens the classroom at the resume item", async () => {
    const a = api();
    await renderWithProviders(
      <FakeSession api={a}>
        <HomeScreen />
      </FakeSession>
    );
    const card = await screen.findByTestId("catalog-continue-card");
    expect(screen.getByText("Python Basics")).toBeTruthy();
    expect(screen.getByText("Next: Loops")).toBeTruthy();
    expect(screen.getByText("42% · 8 of 19")).toBeTruthy();
    expect(screen.queryByTestId("catalog-home-sign-in")).toBeNull();
    await fireEvent.press(card);
    expect(mockNavigate).toHaveBeenCalledWith("Classroom", { courseSlug: "python-basics", itemId: "item_8" });
  });

  it("says so when the academy has no courses yet", async () => {
    const a = api({ catalog: { featured: jest.fn(async () => ({ featured: [], popular: [], newest: [], free: [] })), categories: jest.fn(async () => []) }, my: { learning: jest.fn(async () => emptyPage) } });
    await renderWithProviders(
      <FakeSession status="signedOut" api={a}>
        <HomeScreen />
      </FakeSession>
    );
    expect(await screen.findByTestId("catalog-home-empty")).toBeTruthy();
  });
});
