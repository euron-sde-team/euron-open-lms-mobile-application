/**
 * Tab screen title and the horizontal course carousel. The title is large type under the
 * safe area with the account actions on the right; the rail is a horizontal FlatList of
 * course tiles with matching skeletons while it loads.
 */
import { memo, useCallback, type ReactNode } from "react";
import { FlatList, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CourseCard as Course } from "../../../api/vendor/types";
import type { PurchaseMode } from "../../../app/meta";
import { Skeleton } from "../../../ui/components/Feedback";
import { Text } from "../../../ui/components/Text";
import { space } from "../../../ui/theme/tokens";
import { CourseTile, CourseTileSkeleton } from "./CourseCard";
import { u } from "../styles";

export function TabTitle({ title, loading, subtitle, right }: { title: string; loading?: boolean; subtitle?: string | null; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.title, { paddingTop: insets.top + space[3] }]}>
      <View style={styles.titleRow}>
        <View style={u.flex}>
          {loading ? <Skeleton width="60%" height={30} /> : <Text variant="hero" accessibilityRole="header" numberOfLines={2}>{title}</Text>}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
      {subtitle ? <Text tone="muted" style={{ marginTop: space[1] }}>{subtitle}</Text> : null}
    </View>
  );
}

export function useTileWidth(): number {
  const { width } = useWindowDimensions();
  return Math.round(Math.min(width * 0.72, 300));
}

export const CourseRail = memo(function CourseRailImpl({ courses, loading, mode, planName, onOpen, testID }: { courses: Course[] | undefined; loading: boolean; mode: PurchaseMode; planName: string | null; onOpen: (c: Course) => void; testID?: string }) {
  const w = useTileWidth();
  const renderItem = useCallback(({ item }: { item: Course }) => <CourseTile course={item} width={w} mode={mode} planName={planName} onPress={onOpen} />, [w, mode, planName, onOpen]);
  if (loading) {
    return (
      <View style={styles.skeletonRow}>
        <CourseTileSkeleton width={w} />
        <CourseTileSkeleton width={w} />
      </View>
    );
  }
  return (
    <FlatList
      horizontal
      data={courses ?? []}
      keyExtractor={(c) => c.id}
      renderItem={renderItem}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      ItemSeparatorComponent={Gap}
      decelerationRate="fast"
      snapToInterval={w + space[4]}
      snapToAlignment="start"
      testID={testID}
    />
  );
});

function Gap() {
  return <View style={{ width: space[4] }} />;
}

const styles = StyleSheet.create({
  title: { paddingHorizontal: space[4], paddingBottom: space[2] },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space[3] },
  right: { minHeight: 44, justifyContent: "center" },
  rail: { paddingHorizontal: space[4] },
  skeletonRow: { flexDirection: "row", gap: space[4], paddingHorizontal: space[4], overflow: "hidden" },
});
