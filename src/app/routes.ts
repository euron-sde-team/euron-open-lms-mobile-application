/**
 * Every screen and its params, in one place. Screens navigate with these names only, so a
 * renamed route fails the typecheck instead of a tap.
 */
import type { NavigatorScreenParams } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

export type TabParams = {
  Home: undefined;
  Explore: { q?: string; category?: string; sort?: "popular" | "newest" | "rating"; price?: "free" | "paid" } | undefined;
  Learning: { tab?: "progress" | "completed" | "saved" | "certificates" } | undefined;
  Account: undefined;
};

export type RootParams = {
  Tabs: NavigatorScreenParams<TabParams> | undefined;
  // Auth (presented modally)
  SignIn: { next?: string } | undefined;
  SignUp: undefined;
  CheckEmail: { email: string };
  ForgotPassword: undefined;
  VerifyEmail: { token: string };
  // Catalog
  Course: { slug: string; coupon?: string };
  Bundle: { slug: string };
  Plans: undefined;
  Instructor: { id: string };
  Reviews: { slug: string };
  // Learning
  Classroom: { courseSlug: string; itemId?: string };
  Quiz: { courseSlug: string; itemId: string };
  Assignment: { courseSlug: string; itemId: string };
  Certificate: { serial: string };
  Downloads: undefined;
  // Commerce (Android checkout; iOS never opens it)
  Checkout: { type: "COURSE" | "BUNDLE" | "PLAN"; id: string; coupon?: string; interval?: "MONTH" | "YEAR" };
  CheckoutResult: { orderId: string };
  Orders: undefined;
  Order: { id: string };
  Subscription: undefined;
  // Account
  Notifications: undefined;
  Profile: undefined;
  Security: undefined;
  Sessions: undefined;
  NotificationSettings: undefined;
  Appearance: undefined;
  Privacy: undefined;
  About: undefined;
};

export type RootScreen<K extends keyof RootParams> = NativeStackScreenProps<RootParams, K>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootParams {}
  }
}
