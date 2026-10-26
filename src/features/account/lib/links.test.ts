import { parseQuery, routeForPath, toPath } from "./links";

describe("notification and push paths", () => {
  it("maps every path the server sends to a screen", () => {
    expect(routeForPath("/account/orders/o_1")).toEqual({ name: "Order", params: { id: "o_1" } });
    expect(routeForPath("/learn/intro-to-sql")).toEqual({ name: "Classroom", params: { courseSlug: "intro-to-sql" } });
    expect(routeForPath("/learn/intro-to-sql/it_9?tab=qa&thread=t_1")).toEqual({ name: "Classroom", params: { courseSlug: "intro-to-sql", itemId: "it_9" } });
    expect(routeForPath("/courses/intro-to-sql")).toEqual({ name: "Course", params: { slug: "intro-to-sql" } });
    expect(routeForPath("/certificates/CERT-1")).toEqual({ name: "Certificate", params: { serial: "CERT-1" } });
    expect(routeForPath("/my-learning?tab=certificates")).toEqual({ name: "Tabs", params: { screen: "Learning", params: { tab: "certificates" } } });
    expect(routeForPath("/my-learning")).toEqual({ name: "Tabs", params: { screen: "Learning" } });
    expect(routeForPath("/account/subscription")).toEqual({ name: "Subscription" });
    expect(routeForPath("/notifications")).toEqual({ name: "Notifications" });
    expect(routeForPath("/checkout/orders/o_2")).toEqual({ name: "Order", params: { id: "o_2" } });
    expect(routeForPath("/checkout/return?orderId=o_3&session_id=cs")).toEqual({ name: "CheckoutResult", params: { orderId: "o_3" } });
    expect(routeForPath("/")).toEqual({ name: "Tabs", params: { screen: "Home" } });
  });
  it("returns null for paths the app has no screen for", () => {
    expect(routeForPath("/admin/courses")).toBeNull();
    expect(routeForPath(null)).toBeNull();
  });
  it("normalises app links and website links to paths", () => {
    expect(toPath("/courses/x")).toBe("/courses/x");
    expect(toPath("openlms://account/orders/o_1")).toBe("/account/orders/o_1");
    expect(toPath("http://web.test/courses/x?coupon=A")).toBe("/courses/x?coupon=A");
    expect(toPath("https://elsewhere.example/courses/x")).toBeNull();
  });
  it("parses query strings without URLSearchParams", () => {
    expect(parseQuery("?a=1&b=two%20words&c")).toEqual({ a: "1", b: "two words", c: "" });
  });
});
