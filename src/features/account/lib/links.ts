/**
 * Where a server-sent path opens in the app. Notifications (`Notification.href`), push
 * messages (`data.url`) and an order's `continueTo` all carry the web app's paths; this maps
 * each one the web knows to a screen, including the account pages the deep-link table in
 * app/linking.ts does not list. Unknown paths fall back to the shared link parser.
 */
import { navigationRef, openAppLink } from "../../../app/navigation-ref";
import { prefixes, toAppUrl } from "../../../app/linking";

export interface AppRoute {
  name: string;
  params?: Record<string, unknown>;
}

/** Splits "a=1&b=two" without URLSearchParams (React Native's is incomplete). */
export function parseQuery(qs: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of qs.replace(/^\?/, "").split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    const k = decodeURIComponent((i < 0 ? part : part.slice(0, i)).replace(/\+/g, " "));
    const v = i < 0 ? "" : decodeURIComponent(part.slice(i + 1).replace(/\+/g, " "));
    if (k && !(k in out)) out[k] = v;
  }
  return out;
}

/** "/courses/x?y=1" from an app path, an app link or a link on the academy's website; null when not ours. */
export function toPath(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("/")) return pathOrUrl;
  const url = toAppUrl(pathOrUrl);
  if (!url) return null;
  const prefix = prefixes.find((p) => url.startsWith(p)) ?? "";
  return `/${url.slice(prefix.length).replace(/^\/+/, "")}`;
}

const tab = (screen: string, params?: Record<string, unknown>): AppRoute => ({ name: "Tabs", params: { screen, ...(params ? { params } : {}) } });

/** The screen for a web path, or null when the app has no screen for it. */
export function routeForPath(path: string | null | undefined): AppRoute | null {
  if (!path) return null;
  const [rawPath, rawQuery = ""] = path.split("?");
  const q = parseQuery(rawQuery.split("#")[0]);
  const seg = rawPath.split("#")[0].split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  const [a, b, c] = seg;
  switch (a) {
    case undefined:
      return tab("Home");
    case "courses":
      return b ? { name: "Course", params: { slug: b, ...(q.coupon ? { coupon: q.coupon } : {}) } } : tab("Explore", q.q || q.category ? { ...(q.q ? { q: q.q } : {}), ...(q.category ? { category: q.category } : {}) } : undefined);
    case "bundles":
      return b ? { name: "Bundle", params: { slug: b } } : tab("Explore");
    case "plans":
      return { name: "Plans" };
    case "learn":
      return b ? { name: "Classroom", params: { courseSlug: b, ...(c ? { itemId: c } : {}) } } : tab("Learning");
    case "certificates":
    case "verify":
      return b ? { name: "Certificate", params: { serial: b } } : tab("Learning", { tab: "certificates" });
    case "my-learning": {
      const t = b ?? q.tab;
      return tab("Learning", t === "progress" || t === "completed" || t === "saved" || t === "certificates" ? { tab: t } : undefined);
    }
    case "notifications":
      return { name: "Notifications" };
    case "downloads":
      return { name: "Downloads" };
    case "checkout":
      if (b === "orders" && c) return { name: "Order", params: { id: c } };
      if ((b === "return" || b === "success") && (q.orderId || q.order)) return { name: "CheckoutResult", params: { orderId: q.orderId || q.order } };
      return null;
    case "account":
      if (b === "orders") return c ? { name: "Order", params: { id: c } } : { name: "Orders" };
      if (b === "subscription") return { name: "Subscription" };
      if (b === "security") return { name: "Security" };
      if (b === "notifications") return { name: "NotificationSettings" };
      if (b === "privacy") return { name: "Privacy" };
      if (b === "profile") return { name: "Profile" };
      return tab("Account");
    default:
      return null;
  }
}

/**
 * Opens a server path (a notification, a push, an order's continueTo). Returns false when
 * nothing in the app matches, so the caller can stay where it is.
 */
export function openPath(pathOrUrl: string | null | undefined): boolean {
  const route = routeForPath(toPath(pathOrUrl));
  if (route && navigationRef.isReady()) {
    (navigationRef.navigate as (name: string, params?: object) => void)(route.name, route.params);
    return true;
  }
  return openAppLink(pathOrUrl);
}
