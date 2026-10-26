import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";
import { FakeSession, fakeMe } from "../../../../test/render";
import { AccountScreen } from "../AccountScreen";
import { CheckoutResultScreen } from "../CheckoutResultScreen";
import { CheckoutScreen } from "../CheckoutScreen";
import { NotificationsScreen } from "../NotificationsScreen";
import { OrdersScreen } from "../OrdersScreen";
import { fakeMeta, fakeOrder, fakeQuote, renderAccount, usd } from "./utils";

// The shared Jest config does not transform lucide's ESM build; icons render as plain views here.
jest.mock("lucide-react-native", () => {
  const { View } = jest.requireActual("react-native");
  const icon = (props: object) => jest.requireActual("react").createElement(View, props);
  return new Proxy({}, { get: (_t, name) => (name === "__esModule" ? true : icon) });
});

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), canGoBack: () => true, getState: () => ({ routes: [{ name: "Checkout" }] }) };
jest.mock("@react-navigation/native", () => ({ ...jest.requireActual("@react-navigation/native"), useNavigation: () => mockNav }));

const mockOpenPath = jest.fn((_p: string) => true);
jest.mock("../lib/links", () => ({ ...jest.requireActual("../lib/links"), openPath: (p: string) => mockOpenPath(p) }));

const meta = { get: jest.fn(async () => fakeMeta()) };
const route = <T,>(params: T) => ({ key: "k", name: "x", params }) as never;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("AccountScreen", () => {
  it("shows a guest the academy, sign in and create account, and the settings that need no account", async () => {
    await renderAccount(
      <FakeSession status="signedOut" api={({ meta })}>
        <AccountScreen />
      </FakeSession>
    );
    expect(await screen.findByText("Northwind Academy")).toBeTruthy();
    expect(screen.getByTestId("account-sign-in")).toBeTruthy();
    expect(screen.getByTestId("account-sign-up")).toBeTruthy();
    expect(screen.getByTestId("account-appearance")).toBeTruthy();
    expect(screen.queryByTestId("account-orders")).toBeNull();
    await fireEvent.press(screen.getByTestId("account-sign-in"));
    expect(mockNav.navigate).toHaveBeenCalledWith("SignIn");
  });

  it("shows a learner who they are and their grouped settings", async () => {
    await renderAccount(
      <FakeSession api={({ meta })} me={fakeMe()}>
        <AccountScreen />
      </FakeSession>
    );
    expect(await screen.findByText("Juniper Vale")).toBeTruthy();
    expect(screen.getByText("juniper.vale@example.com")).toBeTruthy();
    for (const id of ["certificates", "downloads", "orders", "subscription", "profile", "security", "sessions", "notification-settings", "privacy", "about", "sign-out", "sign-out-all"]) {
      expect(screen.getByTestId(`account-${id}`)).toBeTruthy();
    }
    await fireEvent.press(screen.getByTestId("account-certificates"));
    expect(mockNav.navigate).toHaveBeenCalledWith("Tabs", { screen: "Learning", params: { tab: "certificates" } });
  });
});

describe("OrdersScreen", () => {
  it("lists orders with title, number, total and status, and opens one", async () => {
    const billing = { orders: jest.fn(async () => ({ items: [fakeOrder(), fakeOrder({ id: "o_2", number: "ORD-0002", status: "REFUNDED", refunded: usd(4900) })], nextCursor: null })) };
    await renderAccount(
      <FakeSession api={({ meta, billing })}>
        <OrdersScreen />
      </FakeSession>
    );
    expect((await screen.findAllByTestId("account-order-row")).length).toBe(2);
    expect(screen.getByText("Refunded")).toBeTruthy();
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(screen.getAllByText(/ORD-0001/).length).toBe(1);
    await fireEvent.press(screen.getAllByTestId("account-order-row")[0]);
    expect(mockNav.navigate).toHaveBeenCalledWith("Order", { id: "o_1" });
  });

  it("says so when there are no orders", async () => {
    await renderAccount(
      <FakeSession api={({ meta, billing: { orders: jest.fn(async () => ({ items: [], nextCursor: null })) } })}>
        <OrdersScreen />
      </FakeSession>
    );
    expect(await screen.findByTestId("account-orders-empty")).toBeTruthy();
  });
});

describe("NotificationsScreen", () => {
  it("marks a notification read and opens its path", async () => {
    const notifications = {
      list: jest.fn(async () => ({ items: [{ id: "n_1", type: "QA_REPLY", actor: null, entityType: "QA_THREAD", entityId: "t_1", snippet: "Intro to SQL", href: "/learn/intro-to-sql/it_1", readAt: null, createdAt: new Date().toISOString() }], nextCursor: null })),
      read: jest.fn(async () => undefined),
      readAll: jest.fn(async () => undefined),
      counts: jest.fn(async () => ({ notifications: 1 })),
    };
    await renderAccount(
      <FakeSession api={({ meta, notifications })}>
        <NotificationsScreen />
      </FakeSession>
    );
    await fireEvent.press(await screen.findByTestId("account-notification-row"));
    expect(notifications.read).toHaveBeenCalledWith("n_1");
    expect(mockOpenPath).toHaveBeenCalledWith("/learn/intro-to-sql/it_1");
    // Nothing is unread any more, so "Mark all read" goes away.
    await waitFor(() => expect(screen.queryByTestId("account-notifications-read-all")).toBeNull());
  });

  it("marks all read", async () => {
    const notifications = {
      list: jest.fn(async () => ({ items: [{ id: "n_2", type: "CERTIFICATE_ISSUED", actor: null, entityType: "CERTIFICATE", entityId: "c", snippet: null, href: "/certificates/C-1", readAt: null, createdAt: new Date().toISOString() }], nextCursor: null })),
      readAll: jest.fn(async () => undefined),
    };
    await renderAccount(
      <FakeSession api={({ meta, notifications })}>
        <NotificationsScreen />
      </FakeSession>
    );
    await fireEvent.press(await screen.findByTestId("account-notifications-read-all"));
    expect(notifications.readAll).toHaveBeenCalled();
  });
});

describe("CheckoutScreen", () => {
  const original = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, "OS", { value: original, configurable: true });
  });

  it("on Android quotes the item and shows the server's total, tax and pay label", async () => {
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    const checkout = { quote: jest.fn(async () => fakeQuote({ tax: usd(882), taxLabel: "GST", total: usd(5782) })), plans: jest.fn(async () => []), start: jest.fn() };
    await renderAccount(
      <FakeSession api={({ meta, checkout })} me={fakeMe({ preferredCurrency: null } as never)}>
        <CheckoutScreen navigation={mockNav as never} route={route({ type: "COURSE", id: "c_1", coupon: "save10" })} />
      </FakeSession>
    );
    expect(await screen.findByTestId("account-checkout-summary")).toBeTruthy();
    expect(screen.getByText("Intro to SQL")).toBeTruthy();
    expect(screen.getByText("GST (18%)")).toBeTruthy();
    expect(screen.getByTestId("account-checkout-total").props.children).toContain("57.82");
    expect(checkout.quote).toHaveBeenCalledWith(expect.objectContaining({ item: { type: "COURSE", id: "c_1" }, currency: "USD", couponCode: "SAVE10" }));
    expect(screen.getByTestId("account-checkout-gateway").props.children).toBe("Pay securely with Stripe");
  });

  it("on iOS shows nothing purchasable and goes back", async () => {
    Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
    const checkout = { quote: jest.fn() };
    await renderAccount(
      <FakeSession api={({ meta, checkout })}>
        <CheckoutScreen navigation={mockNav as never} route={route({ type: "COURSE", id: "c_1" })} />
      </FakeSession>
    );
    await waitFor(() => expect(mockNav.goBack).toHaveBeenCalled());
    expect(screen.queryByTestId("account-checkout-pay")).toBeNull();
    expect(checkout.quote).not.toHaveBeenCalled();
  });
});

describe("CheckoutResultScreen", () => {
  it("polls until the order is paid, then offers to start learning in the classroom", async () => {
    const order = jest.fn().mockResolvedValueOnce(fakeOrder({ status: "PENDING", paidAt: null })).mockResolvedValue(fakeOrder());
    const users = { me: jest.fn(async () => fakeMe()) };
    await renderAccount(
      <FakeSession api={{ meta, users, checkout: { order } }}>
        <CheckoutResultScreen navigation={mockNav as never} route={route({ orderId: "o_1" })} />
      </FakeSession>
    );
    expect(await screen.findByTestId("account-checkout-pending")).toBeTruthy();
    expect(order).toHaveBeenCalledWith("o_1", { sync: true });
    // The next poll is 2 s later.
    expect(await screen.findByTestId("account-checkout-paid", {}, { timeout: 4000 })).toBeTruthy();
    expect(order).toHaveBeenLastCalledWith("o_1", { sync: false });
    expect(users.me).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("account-checkout-start"));
    expect(mockNav.navigate).toHaveBeenCalledWith("Classroom", { courseSlug: "intro-to-sql" });
  });

  it("closes the order when the buyer canceled on the gateway", async () => {
    const order = jest.fn(async () => fakeOrder({ status: "PENDING", paidAt: null }));
    const cancelOrder = jest.fn(async () => fakeOrder({ status: "CANCELED", paidAt: null }));
    await renderAccount(
      <FakeSession api={{ meta, checkout: { order, cancelOrder } }}>
        <CheckoutResultScreen navigation={mockNav as never} route={route({ orderId: "o_1", canceled: "1" })} />
      </FakeSession>
    );
    expect(await screen.findByTestId("account-checkout-canceled")).toBeTruthy();
    expect(cancelOrder).toHaveBeenCalledWith("o_1");
  });
});
