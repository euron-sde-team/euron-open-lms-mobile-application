/**
 * The course card: a tile for carousels and a compact row for Explore results. The 16:9
 * cover (14 pt corners) is the only surface; the rest is type on the background:
 * title, instructors, rating, the facts line, then the price, "Free", the plan that
 * includes it, or progress when enrolled. Prices show only where the app may sell
 * (purchase mode "in-app"); iOS cards never carry a price.
 */
import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { CourseCard as Course, Money } from "../../../api/vendor/types";
import type { PurchaseMode } from "../../../app/meta";
import { ProgressBar, Skeleton } from "../../../ui/components/Feedback";
import { Cover, Rating } from "../../../ui/components/Media";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { radius, space } from "../../../ui/theme/tokens";
import { factsLine, money, savingPercent } from "../format";
import { u } from "../styles";

/** The bottom line of a card when it is not a price. */
export function cardAccessLine(c: Pick<Course, "accessMode" | "includedInSubscription" | "price" | "viewer">, mode: PurchaseMode, planName: string | null): { text: string; tone: "success" | "default" | "muted" } | null {
  if (c.viewer?.enrolled) return null;
  if (c.accessMode === "FREE") return { text: "Free", tone: "success" };
  if (planName && c.includedInSubscription) return { text: `Included in ${planName}`, tone: "default" };
  if (c.accessMode === "SUBSCRIPTION_ONLY") return mode === "none" ? null : { text: "Included in a plan", tone: "default" };
  if (mode !== "in-app") return null;
  return c.price ? null : { text: "Not on sale in your currency", tone: "muted" };
}

export function PriceTag({ price, compareAt, size = "sm" }: { price: Money | null; compareAt?: Money | null; size?: "sm" | "md" | "lg" }) {
  if (!price) return null;
  const saving = savingPercent(price, compareAt);
  return (
    <View style={styles.price} accessibilityLabel={`Price ${money(price)}${saving && compareAt ? `, was ${money(compareAt)}` : ""}`}>
      <Text variant={size === "lg" ? "title" : size === "md" ? "heading" : "bodyStrong"}>{money(price, { compact: true })}</Text>
      {saving && compareAt ? (
        <>
          <Text variant="small" tone="subtle" style={styles.strike}>{money(compareAt, { compact: true })}</Text>
          <Text variant="caption" tone="success">{`${saving}% off`}</Text>
        </>
      ) : null}
    </View>
  );
}

function BottomLine({ course, mode, planName }: { course: Course; mode: PurchaseMode; planName: string | null }) {
  if (course.viewer?.enrolled) {
    const pct = Math.round(course.viewer.progressPercent ?? 0);
    return (
      <View style={u.gap6}>
        <ProgressBar value={pct} />
        <Text variant="caption" tone="muted">{pct >= 100 ? "Completed" : `${pct}% complete`}</Text>
      </View>
    );
  }
  const line = cardAccessLine(course, mode, planName);
  if (line) return <Text variant="smallStrong" tone={line.tone}>{line.text}</Text>;
  return mode === "in-app" ? <PriceTag price={course.price} compareAt={course.compareAt} /> : null;
}

interface CardProps {
  course: Course;
  mode: PurchaseMode;
  planName: string | null;
  onPress: (c: Course) => void;
  testID?: string;
}

export const CourseTile = memo(function CourseTileImpl({ course, mode, planName, onPress, width, testID }: CardProps & { width?: number }) {
  const instructors = course.instructors.map((i) => i.displayName).join(", ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={course.title}
      onPress={() => onPress(course)}
      testID={testID ?? "catalog-course-card"}
      style={({ pressed }) => [styles.tile, { width, opacity: pressed ? 0.85 : 1 }]}
    >
      <Cover uri={course.coverUrl} rounded={radius.lg} seed={course.slug} title={course.title} kicker={course.categories[0]?.name} />
      <View style={styles.tileBody}>
        <Text variant="subheading" numberOfLines={2}>{course.title}</Text>
        {instructors ? <Text variant="small" tone="muted" numberOfLines={1}>{instructors}</Text> : null}
        {course.rating ? <Rating value={course.rating.average} count={course.rating.count} /> : null}
        <Text variant="caption" tone="subtle" numberOfLines={1}>{factsLine(course)}</Text>
        <View style={styles.tileFoot}>
          <BottomLine course={course} mode={mode} planName={planName} />
        </View>
      </View>
    </Pressable>
  );
});

export const CourseRow = memo(function CourseRowImpl({ course, mode, planName, onPress, testID }: CardProps) {
  const { colors } = useTheme();
  const instructors = course.instructors.map((i) => i.displayName).join(", ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={course.title}
      onPress={() => onPress(course)}
      testID={testID ?? "catalog-course-row"}
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={styles.rowCover}>
        <Cover uri={course.coverUrl} rounded={radius.sm + 2} seed={course.slug} />
      </View>
      <View style={styles.rowBody}>
        <Text variant="bodyStrong" numberOfLines={2}>{course.title}</Text>
        {instructors ? <Text variant="small" tone="muted" numberOfLines={1}>{instructors}</Text> : null}
        <View style={styles.rowMeta}>
          {course.rating ? <Rating value={course.rating.average} count={course.rating.count} size={12} /> : null}
          <Text variant="caption" tone="subtle" numberOfLines={1} style={u.shrink}>{factsLine(course)}</Text>
        </View>
        <BottomLine course={course} mode={mode} planName={planName} />
      </View>
    </Pressable>
  );
});

export function CourseTileSkeleton({ width }: { width?: number }) {
  return (
    <View style={[styles.tile, { width }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Skeleton rounded={radius.lg} style={styles.coverShape} />
      <View style={[styles.tileBody, u.gap8]}>
        <Skeleton width="85%" height={16} />
        <Skeleton width="55%" height={12} />
        <Skeleton width="70%" height={12} />
        <Skeleton width="30%" height={14} style={u.mt6} />
      </View>
    </View>
  );
}

export function CourseRowSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.rowCover}>
        <Skeleton rounded={radius.sm + 2} style={styles.coverShape} />
      </View>
      <View style={[styles.rowBody, u.gap8]}>
        <Skeleton width="90%" height={15} />
        <Skeleton width="50%" height={12} />
        <Skeleton width="35%" height={12} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {},
  coverShape: { aspectRatio: 16 / 9, height: undefined },
  tileBody: { paddingTop: space[3], gap: 4, flexGrow: 1 },
  tileFoot: { marginTop: space[2] },
  price: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 6 },
  strike: { textDecorationLine: "line-through" },
  row: { flexDirection: "row", gap: space[3], paddingVertical: space[4], borderBottomWidth: StyleSheet.hairlineWidth },
  rowCover: { width: 112 },
  rowBody: { flex: 1, gap: 3 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: space[2] },
});
