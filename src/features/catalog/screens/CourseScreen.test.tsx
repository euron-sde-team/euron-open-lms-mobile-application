import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";
import type { CourseAccess } from "../../../api/vendor/types";
import type { RootScreen } from "../../../app/routes";
import { FakeSession, renderWithProviders } from "../../../../test/render";
import { fakeCourse, fakeMeta } from "../test-fixtures";
import { CourseScreen } from "./CourseScreen";

jest.mock("@react-navigation/native", () => ({ ...jest.requireActual("@react-navigation/native"), useFocusEffect: jest.fn() }));

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
const props = (coupon?: string) => ({ route: { key: "Course-1", name: "Course", params: { slug: "intro-to-sql", coupon } }, navigation }) as unknown as RootScreen<"Course">;

function setOS(os: "ios" | "android") {
  Object.defineProperty(Platform, "OS", { get: () => os, configurable: true });
}

function api(access: CourseAccess, meta = fakeMeta()) {
  return {
    meta: { get: jest.fn(async () => meta) },
    catalog: {
      course: jest.fn(async () => fakeCourse(access)),
      reviews: jest.fn(async () => ({ items: [], nextCursor: null })),
      enrollFree: jest.fn(async () => ({ enrollmentId: "e1", resumeItemId: "i1" })),
    },
  };
}

async function show(access: CourseAccess, opts: { status?: "signedIn" | "signedOut"; coupon?: string; meta?: ReturnType<typeof fakeMeta> } = {}) {
  const a = api(access, opts.meta);
  await renderWithProviders(
    <FakeSession status={opts.status ?? "signedIn"} api={a}>
      <CourseScreen {...props(opts.coupon)} />
    </FakeSession>
  );
  await screen.findByTestId("catalog-course-title");
  return a;
}

beforeEach(() => {
  navigation.navigate.mockClear();
  setOS("ios");
});

describe("CourseScreen", () => {
  it("renders the page: facts, outcomes, curriculum with a preview, reviews", async () => {
    await show({ state: "FREE" });
    expect(screen.getByText("Intro to SQL")).toBeTruthy();
    expect(screen.getByTestId("catalog-course-facts").props.children).toMatch(/Beginner · 3 h 20 min · 12 lessons/);
    expect(screen.getByText("Write SELECT queries with joins")).toBeTruthy();
    expect(screen.getByText("Why SQL")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("catalog-curriculum-preview"));
    expect(navigation.navigate).toHaveBeenCalledWith("Classroom", { courseSlug: "intro-to-sql", itemId: "i1" });
    expect(screen.getByTestId("catalog-rating-summary")).toBeTruthy();
  });

  it("free: enrolls and opens the classroom", async () => {
    const a = await show({ state: "FREE" });
    await fireEvent.press(screen.getByTestId("catalog-cta-enroll"));
    await waitFor(() => expect(a.catalog.enrollFree).toHaveBeenCalled());
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith("Classroom", { courseSlug: "intro-to-sql", itemId: "i1" }));
    // The enrollment invalidates the page; let that refetch settle before the test ends.
    await waitFor(() => expect(a.catalog.course).toHaveBeenCalledTimes(2));
  });

  it("paid on Android: shows the price and buys in the app with the coupon", async () => {
    setOS("android");
    await show({ state: "PURCHASABLE", price: { amountMinor: 4900, currency: "USD" }, compareAt: { amountMinor: 9900, currency: "USD" }, subscriptionAlso: false }, { coupon: "SAVE10" });
    expect(screen.getAllByText("$49").length).toBeGreaterThan(0);
    expect(screen.getByText("51% off")).toBeTruthy();
    expect(screen.getByTestId("catalog-coupon-field").props.value).toBe("SAVE10");
    await fireEvent.press(screen.getByTestId("catalog-cta-buy"));
    expect(navigation.navigate).toHaveBeenCalledWith("Checkout", { type: "COURSE", id: "c_1", coupon: "SAVE10" });
  });

  it("paid on iOS with no web link: no price, no purchase wording, nothing to tap", async () => {
    setOS("ios");
    await show({ state: "PURCHASABLE", price: { amountMinor: 4900, currency: "USD" }, compareAt: null, subscriptionAlso: true });
    expect(screen.getByTestId("catalog-cta-note").props.children).toBe("Not enrolled yet");
    expect(screen.queryByText("$49")).toBeNull();
    expect(screen.queryByText(/Buy|plan|coupon/i)).toBeNull();
    expect(screen.queryByTestId("catalog-cta-buy")).toBeNull();
    expect(screen.queryByTestId("catalog-cta-web")).toBeNull();
  });

  it("paid on iOS with the web link: points to the website without a price", async () => {
    setOS("ios");
    await show({ state: "PURCHASABLE", price: { amountMinor: 4900, currency: "USD" }, compareAt: null, subscriptionAlso: false }, { meta: fakeMeta({ iosWebPurchaseLink: true }) });
    await waitFor(() => expect(screen.getByTestId("catalog-cta-web")).toBeTruthy());
    expect(screen.getByText("Available on Northwind Academy's website")).toBeTruthy();
    expect(screen.queryByText("$49")).toBeNull();
  });

  it("enrolled: continues learning at the resume item", async () => {
    await show({ state: "ENROLLED", enrollmentId: "e1", progressPercent: 42, completedAt: null, validUntil: null, resumeItemId: "i2" });
    expect(screen.getByText("42% complete")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("catalog-cta-continue"));
    expect(navigation.navigate).toHaveBeenCalledWith("Classroom", { courseSlug: "intro-to-sql", itemId: "i2" });
  });

  it("a guest signs in from the purchase bar", async () => {
    setOS("android");
    await show({ state: "SIGNED_OUT", free: true, price: null }, { status: "signedOut" });
    await fireEvent.press(screen.getByTestId("catalog-cta-signin"));
    expect(navigation.navigate).toHaveBeenCalledWith("SignIn", { next: "/courses/intro-to-sql" });
  });
});
