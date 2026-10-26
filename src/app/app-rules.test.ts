import type { AcademyMeta } from "../api/vendor/types";
import { safeExternalUrl, joinUrl } from "../lib/urls";
import { toAppUrl } from "./linking";
import { mobileFlags, purchaseMode } from "./meta";

const meta = (mobile?: object) => ({ academyName: "Test", ...(mobile ? { mobile } : {}) }) as unknown as AcademyMeta;

describe("purchase mode per platform", () => {
  it("checks out in the app on Android", () => {
    expect(purchaseMode(meta(), "android")).toBe("in-app");
    expect(purchaseMode(meta({ iosWebPurchaseLink: false }), "android")).toBe("in-app");
  });
  it("never offers an in-app purchase on iOS, and links to the web only when the admin allows it", () => {
    expect(purchaseMode(meta(), "ios")).toBe("none");
    expect(purchaseMode(meta({ iosWebPurchaseLink: false }), "ios")).toBe("none");
    expect(purchaseMode(meta({ iosWebPurchaseLink: true }), "ios")).toBe("web-link");
  });
  it("treats an older server without mobile flags as everything off", () => {
    expect(mobileFlags(undefined)).toEqual({ iosWebPurchaseLink: false, downloadsEnabled: false, pushEnabled: false, minSupportedVersion: null });
  });
});

describe("app links", () => {
  it("maps server paths and website links onto the app scheme", () => {
    expect(toAppUrl("/courses/intro-to-sql")).toBe("openlms://courses/intro-to-sql");
    expect(toAppUrl("http://web.test/learn/sql/01J?x=1")).toBe("openlms://learn/sql/01J?x=1");
    expect(toAppUrl("openlms://my-learning")).toBe("openlms://my-learning");
  });
  it("ignores links that are not the academy's", () => {
    expect(toAppUrl("https://elsewhere.example/courses/x")).toBeNull();
    expect(toAppUrl("")).toBeNull();
    expect(toAppUrl(null)).toBeNull();
  });
});

describe("external URLs", () => {
  it("lets only http and https leave the app", () => {
    expect(safeExternalUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeExternalUrl(["javascript", "alert(1)"].join(":"))).toBeNull();
    expect(safeExternalUrl("intent://scan#Intent;end")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
  });
  it("joins without doubled slashes", () => {
    expect(joinUrl("http://a.test/", "/courses/x")).toBe("http://a.test/courses/x");
  });
});
