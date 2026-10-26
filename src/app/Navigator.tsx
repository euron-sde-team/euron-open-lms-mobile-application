/**
 * Navigation. Guests and learners share one tree: the four tabs plus pushed screens, with
 * sign-in presented as a modal so a guest returns to the course they were on. Screens
 * that need a session check it themselves (features/*), so a deep link into a lesson
 * while signed out asks to sign in rather than dropping the link.
 */
import { createBottomTabNavigator, type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import * as Account from "../features/account";
import * as Assessments from "../features/assessments";
import { CheckEmailScreen, ForgotPasswordScreen, SignInScreen, SignUpScreen, VerifyEmailScreen } from "../features/auth/AuthScreens";
import * as Catalog from "../features/catalog";
import * as Learning from "../features/learning";
import { Spinner } from "../ui/components/Feedback";
import { useTheme } from "../ui/theme/ThemeProvider";
import { navigationRef } from "./navigation-ref";
import { linking } from "./linking";
import type { RootParams, TabParams } from "./routes";
import { useSession } from "./session";
import { TabBar } from "./TabBar";
import { OfflineScreen } from "./OfflineScreen";

const Stack = createNativeStackNavigator<RootParams>();
const Tab = createBottomTabNavigator<TabParams>();

const renderTabBar = (p: BottomTabBarProps) => <TabBar {...p} />;

function Tabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={renderTabBar}>
      <Tab.Screen name="Home" component={Catalog.HomeScreen} />
      <Tab.Screen name="Explore" component={Catalog.ExploreScreen} />
      <Tab.Screen name="Learning" component={Learning.LearningScreen} />
      <Tab.Screen name="Account" component={Account.AccountScreen} />
    </Tab.Navigator>
  );
}

export function Navigator() {
  const { colors, scheme } = useTheme();
  const { status } = useSession();
  // Downloaded lectures: attach to the signed-in learner, revalidate licences on start,
  // on return to the foreground and on reconnect (features/learning/downloads).
  Learning.useDownloadsLifecycle();
  const navTheme = useMemo<Theme>(() => {
    const base = scheme === "dark" ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, background: colors.background, card: colors.card, text: colors.foreground, border: colors.border, primary: colors.primary, notification: colors.danger } };
  }, [colors, scheme]);

  if (status === "booting") {
    return (
      <View style={[styles.boot, { backgroundColor: colors.background }]}>
        <Spinner />
      </View>
    );
  }
  if (status === "offline") return <OfflineScreen />;

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme} linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="Course" component={Catalog.CourseScreen} />
        <Stack.Screen name="Bundle" component={Catalog.BundleScreen} />
        <Stack.Screen name="Plans" component={Catalog.PlansScreen} />
        <Stack.Screen name="Instructor" component={Catalog.InstructorScreen} />
        <Stack.Screen name="Reviews" component={Catalog.ReviewsScreen} />
        <Stack.Screen name="Classroom" component={Learning.ClassroomScreen} options={{ animation: "fade_from_bottom" }} />
        <Stack.Screen name="Downloads" component={Learning.DownloadsScreen} />
        <Stack.Screen name="Quiz" component={Assessments.QuizScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="Assignment" component={Assessments.AssignmentScreen} />
        <Stack.Screen name="Certificate" component={Assessments.CertificateScreen} />
        <Stack.Screen name="Checkout" component={Account.CheckoutScreen} />
        <Stack.Screen name="CheckoutResult" component={Account.CheckoutResultScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="Orders" component={Account.OrdersScreen} />
        <Stack.Screen name="Order" component={Account.OrderScreen} />
        <Stack.Screen name="Subscription" component={Account.SubscriptionScreen} />
        <Stack.Screen name="Notifications" component={Account.NotificationsScreen} />
        <Stack.Screen name="Profile" component={Account.ProfileScreen} />
        <Stack.Screen name="Security" component={Account.SecurityScreen} />
        <Stack.Screen name="Sessions" component={Account.SessionsScreen} />
        <Stack.Screen name="NotificationSettings" component={Account.NotificationSettingsScreen} />
        <Stack.Screen name="Appearance" component={Account.AppearanceScreen} />
        <Stack.Screen name="Privacy" component={Account.PrivacyScreen} />
        <Stack.Screen name="About" component={Account.AboutScreen} />
        <Stack.Group screenOptions={{ presentation: "modal", animation: "slide_from_bottom" }}>
          <Stack.Screen name="SignIn" component={SignInScreen} />
          <Stack.Screen name="SignUp" component={SignUpScreen} />
          <Stack.Screen name="CheckEmail" component={CheckEmailScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
        </Stack.Group>
      </Stack.Navigator>
      {/* Push registration, the foreground banner and notification taps (features/account/push). */}
      <Account.PushBridge />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({ boot: { flex: 1, justifyContent: "center" } });
