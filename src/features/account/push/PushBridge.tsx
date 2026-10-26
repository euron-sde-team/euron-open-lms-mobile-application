/**
 * Mount once inside NavigationContainer (app/Navigator.tsx), after the stack: runs
 * usePushRegistration() and draws the foreground banner over every screen. Renders
 * nothing while there is no banner.
 */
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { Bell } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { radius, space } from "../../../ui/theme/tokens";
import { usePushRegistration, type PushBanner as Banner } from "./usePushRegistration";
import { u } from "../styles";

export function PushBridge() {
  const { banner, openBanner, dismiss } = usePushRegistration();
  return banner ? <PushBanner banner={banner} onPress={openBanner} onDismiss={dismiss} /> : null;
}

export function PushBanner({ banner, onPress, onDismiss }: { banner: Banner; onPress: () => void; onDismiss: () => void}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(-24)).current;
  const o = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    y.setValue(-24);
    o.setValue(0);
    Animated.parallel([Animated.timing(y, { toValue: 0, duration: 220, useNativeDriver: true }), Animated.timing(o, { toValue: 1, duration: 220, useNativeDriver: true })]).start();
  }, [banner.id, y, o]);
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { paddingTop: insets.top + space[2], paddingHorizontal: space[3] }]}>
      <Animated.View style={{ transform: [{ translateY: y }], opacity: o }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={banner.body ? `${banner.title}. ${banner.body}` : banner.title}
          accessibilityHint={banner.url ? "Opens it" : "Dismisses it"}
          accessibilityLiveRegion="polite"
          onPress={banner.url ? onPress : onDismiss}
          testID="account-push-banner"
          style={[styles.card, { backgroundColor: colors.popover, borderColor: colors.border, shadowColor: colors.shadow }]}
        >
          <Bell size={18} color={colors.primary} style={u.mt2} />
          <View style={u.flex}>
            <Text variant="bodyStrong" numberOfLines={1}>{banner.title}</Text>
            {banner.body ? <Text variant="small" tone="muted" numberOfLines={2}>{banner.body}</Text> : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", gap: space[3], padding: space[4], borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
});
