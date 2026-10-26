/**
 * Home tab: the academy's name, the course to continue (signed in), topics, the catalog
 * shelves from GET /catalog/featured (featured, popular, new, free, like the web home)
 * and a plan teaser when plans are on sale and this device may point to them. Guests see
 * the same without personal rows, plus a quiet sign-in line.
 */
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState, type ReactNode } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import type { CourseCard as Course, LearningEntry } from "../../../api/vendor/types";
import { useMeta } from "../../../app/meta";
import { qk } from "../../../app/query";
import { useSession } from "../../../app/session";
import { HeaderActions } from "../../account/HeaderActions";
import { EmptyState, ErrorState, ProgressBar, Skeleton } from "../../../ui/components/Feedback";
import { Screen, Section } from "../../../ui/components/Layout";
import { Cover } from "../../../ui/components/Media";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { radius, space } from "../../../ui/theme/tokens";
import { CourseRail, TabTitle } from "../components/Rail";
import { usePurchaseContext, useSignedIn, useViewerKey } from "../hooks";
import { u } from "../styles";

export function HomeScreen() {
  const navigation = useNavigation();
  const { api, me } = useSession();
  const signedIn = useSignedIn();
  const viewer = useViewerKey();
  const meta = useMeta();
  const ctx = usePurchaseContext();
  const planName = me?.subscription?.grantsAccess ? me.subscription.plan.name : null;

  const shelves = useQuery({ queryKey: [...qk.home, viewer], queryFn: () => api.catalog.featured() });
  const categories = useQuery({ queryKey: qk.categories, queryFn: () => api.catalog.categories(), staleTime: 5 * 60_000 });
  const resume = useQuery({ queryKey: [...qk.learning("in_progress"), "home"], queryFn: () => api.my.learning({ status: "in_progress", limit: 4 }), enabled: signedIn });

  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([shelves.refetch(), categories.refetch(), meta.refetch(), signedIn ? resume.refetch() : Promise.resolve()]);
    setRefreshing(false);
  }, [shelves, categories, meta, resume, signedIn]);

  const open = useCallback((c: Course) => navigation.navigate("Course", { slug: c.slug }), [navigation]);
  const s = shelves.data;
  const loading = shelves.isPending;
  const nothing = s && !s.featured.length && !s.popular.length && !s.newest.length && !s.free.length;
  const current = resume.data?.items.find((e) => e.active) ?? null;
  const cats = (categories.data ?? []).filter((c) => c.courseCount > 0);
  const showPlans = !!meta.data?.subscriptions && ctx.mode !== "none" && !me?.subscription;

  return (
    <Screen padded={false} refreshing={refreshing} onRefresh={refresh} testID="catalog-home">
      <TabTitle title={meta.data?.academyName ?? ""} loading={!meta.data} subtitle={meta.data?.tagline?.trim() || null} right={<HeaderActions />} />

      {!signedIn ? (
        <View style={styles.pad}>
          <Pressable accessibilityRole="button" onPress={() => navigation.navigate("SignIn")} hitSlop={8} testID="catalog-home-sign-in" style={styles.signIn}>
            <Text variant="small" tone="muted">
              {"Pick up where you left off. "}
              <Text variant="smallStrong" tone="link">Sign in</Text>
            </Text>
          </Pressable>
        </View>
      ) : null}

      {signedIn && (resume.isPending || current) ? (
        <Section title="Continue learning" action={{ label: "My learning", onPress: () => navigation.navigate("Tabs", { screen: "Learning" }) }} style={styles.pad}>
          {current ? <ResumeCard entry={current} onPress={() => navigation.navigate("Classroom", { courseSlug: current.course.slug, itemId: current.resumeItem?.id })} /> : <ResumeSkeleton />}
        </Section>
      ) : null}

      {shelves.isError && !s ? (
        <ErrorState message="The course list did not load." onRetry={() => shelves.refetch()} />
      ) : nothing ? (
        <EmptyState title="No courses yet" body="This academy has not published a course yet. Check back soon." testID="catalog-home-empty" />
      ) : (
        <>
          {loading || s?.featured.length ? (
            <Shelf title="Featured" action={{ label: "See all", onPress: () => navigation.navigate("Tabs", { screen: "Explore" }) }}>
              <CourseRail courses={s?.featured} loading={loading} mode={ctx.mode} planName={planName} onOpen={open} testID="catalog-rail-featured" />
            </Shelf>
          ) : null}

          {cats.length ? (
            <View style={styles.topics}>
              <Text variant="eyebrow" tone="subtle" style={styles.pad}>Browse by topic</Text>
              <FlatList
                horizontal
                data={cats}
                keyExtractor={(c) => c.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.catRow}
                testID="catalog-home-categories"
                renderItem={({ item }) => (
                  <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.courseCount} courses`} onPress={() => navigation.navigate("Tabs", { screen: "Explore", params: { category: item.slug } })} style={({ pressed }) => [styles.cat, { opacity: pressed ? 0.6 : 1 }]} testID={`catalog-category-${item.slug}`}>
                    <Text variant="heading">{item.name}</Text>
                    <Text variant="caption" tone="subtle">{`${item.courseCount}`}</Text>
                  </Pressable>
                )}
              />
            </View>
          ) : null}

          {loading || s?.popular.length ? (
            <Shelf title="Popular" action={{ label: "See all", onPress: () => navigation.navigate("Tabs", { screen: "Explore", params: { sort: "popular" } }) }}>
              <CourseRail courses={s?.popular} loading={loading} mode={ctx.mode} planName={planName} onOpen={open} testID="catalog-rail-popular" />
            </Shelf>
          ) : null}
          {s?.newest.length ? (
            <Shelf title="New" action={{ label: "See all", onPress: () => navigation.navigate("Tabs", { screen: "Explore", params: { sort: "newest" } }) }}>
              <CourseRail courses={s.newest} loading={false} mode={ctx.mode} planName={planName} onOpen={open} testID="catalog-rail-new" />
            </Shelf>
          ) : null}
          {s?.free.length ? (
            <Shelf title="Free" action={{ label: "See all", onPress: () => navigation.navigate("Tabs", { screen: "Explore", params: { price: "free" } }) }}>
              <CourseRail courses={s.free} loading={false} mode={ctx.mode} planName={planName} onOpen={open} testID="catalog-rail-free" />
            </Shelf>
          ) : null}
        </>
      )}

      {showPlans ? <PlanTeaser onPress={() => navigation.navigate("Plans")} /> : null}
    </Screen>
  );
}

function Shelf({ title, action, children }: { title: string; action?: { label: string; onPress: () => void }; children: ReactNode }) {
  return (
    <View style={{ marginTop: space[8] }}>
      <View style={[styles.pad, styles.shelfHead]}>
        <Text variant="heading" accessibilityRole="header" style={u.flex}>{title}</Text>
        {action ? (
          <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={12}>
            <Text variant="smallStrong" tone="link">{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function ResumeCard({ entry, onPress }: { entry: LearningEntry; onPress: () => void }) {
  const { colors } = useTheme();
  const c = entry.course;
  const pct = Math.round(entry.progressPercent);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Continue ${c.title}, ${pct}% complete`} onPress={onPress} testID="catalog-continue-card" style={({ pressed }) => [styles.resume, { backgroundColor: colors.card, shadowColor: colors.shadow, opacity: pressed ? 0.9 : 1 }]}>
      <View style={styles.resumeCover}>
        <Cover uri={c.coverUrl} rounded={radius.lg} seed={c.slug} title={c.title} size="sm" />
      </View>
      <View style={styles.resumeBody}>
        <Text variant="subheading" numberOfLines={2}>{c.title}</Text>
        {entry.resumeItem ? <Text variant="small" tone="muted" numberOfLines={1}>{`Next: ${entry.resumeItem.title}`}</Text> : null}
        <View style={u.pushDown}>
          <ProgressBar value={pct} />
          <Text variant="caption" tone="muted">{`${pct}% · ${entry.completedItems} of ${entry.totalItems}`}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ResumeSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.resume, { backgroundColor: colors.card }]} accessibilityElementsHidden>
      <View style={styles.resumeCover}>
        <Skeleton rounded={radius.lg} style={{ aspectRatio: 16 / 9, height: undefined }} />
      </View>
      <View style={[styles.resumeBody, u.gap8]}>
        <Skeleton width="85%" height={16} />
        <Skeleton width="60%" height={12} />
        <Skeleton height={4} style={{ marginTop: space[3] }} />
      </View>
    </View>
  );
}

function PlanTeaser({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="See plans" onPress={onPress} testID="catalog-home-plans" style={({ pressed }) => [styles.teaser, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
      <Text variant="eyebrow" tone="primary">Plans</Text>
      <Text variant="heading" style={{ marginTop: space[1] }}>Every included course, one subscription</Text>
      <Text tone="muted" style={{ marginTop: space[1] }}>Cancel any time. Your progress and certificates stay yours.</Text>
      <Text variant="smallStrong" tone="link" style={{ marginTop: space[3] }}>See plans</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: space[4] },
  signIn: { paddingVertical: space[2], minHeight: 44, justifyContent: "center" },
  topics: { marginTop: space[8] },
  shelfHead: { flexDirection: "row", alignItems: "flex-end", marginBottom: space[3] },
  catRow: { paddingHorizontal: space[4], gap: space[6], paddingTop: space[1] },
  cat: { minHeight: 44, flexDirection: "row", alignItems: "baseline", gap: 6, paddingVertical: space[2] },
  resume: { flexDirection: "row", gap: space[3], padding: space[3], borderRadius: radius.card, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  resumeCover: { width: "42%" },
  resumeBody: { flex: 1 },
  teaser: { marginTop: space[10], paddingVertical: space[6], borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, marginHorizontal: space[4] },
});
