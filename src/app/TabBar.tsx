/**
 * The bottom bar: four destinations on a hairline, the active one in ink with a filled
 * glyph, the rest in muted. No floating capsule, no background pill behind the icon.
 */
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet, View } from "react-native";
import { BookOpen, Compass, House, UserRound } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../ui/components/Text";
import { useTheme } from "../ui/theme/ThemeProvider";

const ICONS = { Home: House, Explore: Compass, Learning: BookOpen, Account: UserRound } as const;
const LABELS = { Home: "Home", Explore: "Explore", Learning: "My Learning", Account: "Account" } as const;

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8), backgroundColor: colors.card, borderTopColor: colors.border }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const name = route.name as keyof typeof ICONS;
        const Icon = ICONS[name];
        const color = focused ? colors.foreground : colors.subtleForeground;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={LABELS[name]}
            testID={`tab-${name.toLowerCase()}`}
            onPress={() => {
              const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !e.defaultPrevented) navigation.navigate(route.name, route.params);
            }}
            style={styles.item}
          >
            <Icon size={23} color={color} strokeWidth={focused ? 2.3 : 1.8} fill={focused && name !== "Explore" ? colors.primarySoft : "transparent"} />
            <Text variant="caption" style={[styles.label, { color }]}>{LABELS[name]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  item: { flex: 1, alignItems: "center", justifyContent: "center" },
  label: { marginTop: 3 },
});
