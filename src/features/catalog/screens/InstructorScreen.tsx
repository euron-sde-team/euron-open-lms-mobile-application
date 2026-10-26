/**
 * An instructor: avatar, name, headline, website, bio, then their published courses.
 * The route's `id` is the instructor's username (GET /catalog/instructors/:username),
 * which is what every course page links with.
 */
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { Globe } from "lucide-react-native";
import { isApiError } from "../../../api/vendor/client/errors";
import type { CourseCard as Course } from "../../../api/vendor/types";
import { qk } from "../../../app/query";
import type { RootScreen } from "../../../app/routes";
import { useSession } from "../../../app/session";
import { safeExternalUrl } from "../../../lib/urls";
import { EmptyState, ErrorState, Skeleton } from "../../../ui/components/Feedback";
import { Html } from "../../../ui/components/Html";
import { Header } from "../../../ui/components/Layout";
import { Avatar } from "../../../ui/components/Media";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { space } from "../../../ui/theme/tokens";
import { CourseRow, CourseRowSkeleton } from "../components/CourseCard";
import { usePurchaseContext, useViewerKey } from "../hooks";
import { u } from "../styles";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The bio is plain text with line breaks; as paragraphs for the Html renderer. */
export function bioHtml(bio: string): string {
  return bio
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escape(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export function InstructorScreen({ route, navigation }: RootScreen<"Instructor">) {
  const username = route.params.id;
  const { api, me } = useSession();
  const viewer = useViewerKey();
  const ctx = usePurchaseContext();
  const { colors } = useTheme();
  const q = useQuery({ queryKey: [...qk.instructor(username), viewer], queryFn: () => api.catalog.instructor(username) });
  const planName = me?.subscription?.grantsAccess ? me.subscription.plan.name : null;
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Tabs", { screen: "Home" }));
  const open = useCallback((c: Course) => navigation.navigate("Course", { slug: c.slug }), [navigation]);
  const renderItem = useCallback(({ item }: { item: Course }) => <CourseRow course={item} mode={ctx.mode} planName={planName} onPress={open} />, [ctx.mode, planName, open]);

  if (q.isError && !q.data) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <Header onBack={back} />
        {isApiError(q.error) && q.error.status === 404 ? <EmptyState title="This instructor is not listed" body="They may not have a published course yet." testID="catalog-instructor-missing" /> : <ErrorState onRetry={() => q.refetch()} />}
      </View>
    );
  }

  const data = q.data;
  const site = data?.instructor.website ? safeExternalUrl(data.instructor.website) : null;
  const head = data ? (
    <View style={styles.head}>
      <View style={styles.identity}>
        <Avatar uri={data.instructor.avatarUrl} name={data.instructor.displayName} size={72} />
        <View style={u.flex}>
          <Text variant="eyebrow" tone="primary">Instructor</Text>
          <Text variant="title" accessibilityRole="header" testID="catalog-instructor-name">{data.instructor.displayName}</Text>
          {data.instructor.headline ? <Text tone="muted">{data.instructor.headline}</Text> : null}
        </View>
      </View>
      {site ? (
        <Pressable accessibilityRole="link" accessibilityLabel={`Website ${site}`} onPress={() => Linking.openURL(site).catch(() => undefined)} style={styles.site} hitSlop={8}>
          <Globe size={16} color={colors.link} />
          <Text variant="smallStrong" tone="link">{site.replace(/^https?:\/\//, "").replace(/\/$/, "")}</Text>
        </Pressable>
      ) : null}
      {data.instructor.bio ? (
        <View style={{ marginTop: space[5] }}>
          <Html html={bioHtml(data.instructor.bio)} />
        </View>
      ) : null}
      <Text variant="heading" style={{ marginTop: space[6] }}>
        {"Courses"}
        {data.courses.length ? <Text variant="small" tone="subtle">{`  ${data.courses.length}`}</Text> : null}
      </Text>
    </View>
  ) : (
    <View style={[styles.head, { gap: space[3] }]} accessibilityElementsHidden>
      <View style={styles.identity}>
        <Skeleton width={72} height={72} rounded={36} />
        <View style={u.flexGap8}>
          <Skeleton width="30%" height={10} />
          <Skeleton width="70%" height={24} />
          <Skeleton width="50%" />
        </View>
      </View>
      <Skeleton style={{ marginTop: space[4] }} />
      <Skeleton width="85%" />
    </View>
  );

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]} testID="catalog-instructor">
      <Header onBack={back} title={data?.instructor.displayName} />
      <FlatList
        data={data?.courses ?? []}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        ListHeaderComponent={head}
        ListEmptyComponent={data ? <Text tone="muted">No published courses yet.</Text> : <View>{[0, 1, 2].map((i) => <CourseRowSkeleton key={i} />)}</View>}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={colors.brand} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { paddingHorizontal: space[4], paddingBottom: space[8] },
  head: { paddingTop: space[5], paddingBottom: space[2] },
  identity: { flexDirection: "row", alignItems: "center", gap: space[4] },
  site: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: space[4], minHeight: 32, alignSelf: "flex-start" },
});
