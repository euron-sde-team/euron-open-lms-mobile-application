/**
 * Deep links. The app understands the same paths as the academy's website, so a link in
 * an email, a push notification (`data.url`) or the app's own scheme opens the matching
 * screen:
 *
 *   /courses/:slug              Course          /learn/:courseSlug/:itemId?  Classroom
 *   /bundles/:slug              Bundle          /verify/:serial              Certificate
 *   /certificates/:serial       Certificate     /my-learning                 Learning tab
 *   /account/orders/:id         Order           /notifications               Notifications
 *   /verify-email?token=        VerifyEmail     /checkout/return?orderId=    CheckoutResult
 *   /account/subscription       Subscription    /account/{profile,security,sessions,notifications}
 *
 * Prefixes: `<scheme>://` always, plus `https://<APP_LINK_HOST>` when universal links or
 * Android App Links are configured for the academy's domain.
 */
import type { LinkingOptions } from "@react-navigation/native";
import { config } from "../config";
import type { RootParams } from "./routes";

export const prefixes = [`${config.scheme}://`, ...(config.appLinkHost ? [`https://${config.appLinkHost}`] : [])];

export const linking: LinkingOptions<RootParams> = {
  prefixes,
  config: {
    screens: {
      Tabs: {
        screens: {
          Home: "",
          Explore: "courses",
          Learning: "my-learning/:tab?",
          Account: "account",
        },
      },
      Course: "courses/:slug",
      Bundle: "bundles/:slug",
      Plans: "plans",
      Classroom: "learn/:courseSlug/:itemId?",
      Certificate: { path: "verify/:serial", alias: ["certificates/:serial"] },
      Order: "account/orders/:id",
      Orders: "account/orders",
      Subscription: "account/subscription",
      Sessions: "account/sessions",
      Security: "account/security",
      NotificationSettings: "account/notifications",
      Profile: "account/profile",
      Notifications: "notifications",
      VerifyEmail: "verify-email",
      CheckoutResult: { path: "checkout/return", parse: { orderId: (v: string) => v }, alias: ["checkout/success"] },
      SignIn: "login",
      SignUp: "signup",
      Downloads: "downloads",
    },
  },
};

/**
 * Turns a server-sent app path ("/courses/intro-to-sql") or a full link on one of the
 * prefixes into a URL React Navigation can open, or null when it is not ours.
 */
export function toAppUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("/")) return `${config.scheme}:/${pathOrUrl}`;
  if (prefixes.some((p) => pathOrUrl.startsWith(p))) return pathOrUrl;
  try {
    const u = new URL(pathOrUrl);
    const web = new URL(config.webBaseUrl);
    if (u.host === web.host) return `${config.scheme}:/${u.pathname}${u.search}`;
  } catch {
    /* not a URL */
  }
  return null;
}
