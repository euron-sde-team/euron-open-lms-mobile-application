/**
 * My Learning (tab): the summary line, then underline tabs In progress, Completed, Saved
 * and Certificates. Rows are a cover thumb, the title, "42% · 8 of 19" over a thin bar and
 * the last activity; tapping resumes in the classroom (or opens the course page when the
 * access lapsed). Saved is saved courses plus bookmarked lessons. Certificates open the
 * certificate screen. Guests are asked to sign in. Keyset pages throughout.
 */
import { memo, useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, SectionList, StyleSheet, View } from "react-native";
import { Download } from "lucide-react-native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HeaderActions } from "../../account/HeaderActions";
import { qk } from "../../../app/query";
import type { TabParams } from "../../../app/routes";
import { useSession } from "../../../app/session";
import { flattenAll, flattenPages, nextCursor } from "../../../api/vendor/client/pagination";
import type { BookmarkEntry } from "../../../api/vendor/client/endpoints/learning";
import type { Certificate, CourseCard, LearningEntry, LearningSummary } from "../../../api/vendor/types";
import { IconButton } from "../../../ui/components/Button";
import { EmptyState, ErrorState, ProgressBar, Skeleton } from "../../../ui/components/Feedback";
import { Tabs } from "../../../ui/components/Inputs";
import { Cover } from "../../../ui/components/Media";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { space } from "../../../ui/theme/tokens";
import { useDownloadsEnabled } from "../downloads/useDownloads";
import { longDate, progressLine, timeAgo } from "../format";
import { itemKindLabel } from "../curriculum";
import { u } from "../styles";

type Tab = "progress" | "completed" | "saved" | "certificates";
const TABS: { value: Tab; label: string }[] = [
  { value: "progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "saved", label: "Saved" },
  { value: "certificates", label: "Certificates" },
];

/** "3 in progress · 2 completed · 1 certificate · 45 min this week · 4 day streak", only the real parts. Pure. */
export function summaryLine(s: LearningSummary): string {
  const minutes = s.minutesThisWeek >= 60 ? `${Math.floor(s.minutesThisWeek / 60)} h ${s.minutesThisWeek % 60} min` : `${s.minutesThisWeek} min`;
  return [
    `${s.inProgress} in progress`,
    `${s.completed} completed`,
    `${s.certificates} ${s.certificates === 1 ? "certificate" : "certificates"}`,
    s.minutesThisWeek > 0 ? `${minutes} this week` : null,
    s.streakDays > 1 ? `${s.streakDays} day streak` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function LearningScreen({ route }: BottomTabScreenProps<TabParams, "Learning">) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { status, api } = useSession();
  const signedIn = status === "signedIn";
  const downloads = useDownloadsEnabled();
  const [tab, setTab] = useState<Tab>(route.params?.tab ?? "progress");
  useEffect(() => {
    if (route.params?.tab) setTab(route.params.tab);
  }, [route.params?.tab]);
  const summary = useQuery({ queryKey: qk.summary, queryFn: () => api.my.summary(), enabled: signedIn });

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]} testID="learning-screen">
      <View style={[styles.header, { paddingTop: insets.top + space[2] }]}>
        <View style={styles.titleRow}>
          <Text variant="hero" style={u.flex1} accessibilityRole="header">My Learning</Text>
          {downloads ? <IconButton label="Downloads" onPress={() => navigation.navigate("Downloads")} icon={<Download size={22} color={colors.foreground} />} /> : null}
          <HeaderActions />
        </View>
        {signedIn ? summary.data ? <Text variant="small" tone="muted" style={{ marginTop: space[1] }} testID="learning-summary">{summaryLine(summary.data)}</Text> : <Skeleton height={14} width="70%" style={{ marginTop: space[2] }} /> : null}
        {signedIn ? (
          <View style={{ marginTop: space[3] }}>
            <Tabs value={tab} onChange={setTab} items={TABS} testID="learning-tabs" />
          </View>
        ) : null}
      </View>
      {!signedIn ? (
        <EmptyState title="Your learning lives here" body="Sign in to pick up your courses, saved lessons and certificates." action={{ label: "Sign in", onPress: () => navigation.navigate("SignIn") }} testID="learning-guest" />
      ) : tab === "progress" ? (
        <EntryList status="in_progress" />
      ) : tab === "completed" ? (
        <EntryList status="completed" />
      ) : tab === "saved" ? (
        <SavedList />
      ) : (
        <CertificateList />
      )}
    </View>
  );
}

function Separator() {
  const { colors } = useTheme();
  return <View style={[styles.sep, { backgroundColor: colors.border }]} />;
}

function ListSkeleton() {
  return (
    <View style={{ paddingHorizontal: space[4], paddingTop: space[4], gap: space[5] }} testID="learning-list-loading">
      {Array.from({ length: 3 }, (_, i) => (
        <View key={i} style={[u.row, { gap: space[3] }]}>
          <Skeleton width={112} height={63} rounded={10} />
          <View style={[u.flex1, { gap: space[2] }]}>
            <Skeleton height={16} width="85%" />
            <Skeleton height={12} width="50%" />
            <Skeleton height={4} />
          </View>
        </View>
      ))}
    </View>
  );
}

function EntryList({ status }: { status: "in_progress" | "completed" }) {
  const { api } = useSession();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const q = useInfiniteQuery({
    queryKey: qk.learning(status),
    queryFn: ({ pageParam }) => api.my.learning({ status, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  });
  const items = flattenAll(q.data?.pages);
  const onOpen = useCallback(
    (e: LearningEntry) => (e.active ? navigation.navigate("Classroom", { courseSlug: e.course.slug, itemId: e.resumeItem?.id }) : navigation.navigate("Course", { slug: e.course.slug })),
    [navigation]
  );
  const onCertificate = useCallback((serial: string) => navigation.navigate("Certificate", { serial }), [navigation]);
  if (q.isPending) return <ListSkeleton />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  return (
    <FlatList
      data={items}
      keyExtractor={(e) => e.enrollmentId}
      renderItem={({ item }) => <EntryRow entry={item} onOpen={onOpen} onCertificate={onCertificate} />}
      ItemSeparatorComponent={Separator}
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
      onEndReachedThreshold={0.5}
      refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => {
        q.refetch();
      }} tintColor={colors.brand} />}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        status === "in_progress" ? (
          <EmptyState title="Nothing in progress" body="Courses you start show up here with your progress." action={{ label: "Browse courses", onPress: () => navigation.navigate("Tabs", { screen: "Explore" }) }} testID="learning-empty" />
        ) : (
          <EmptyState title="No completed courses yet" body="Finish every lesson in a course and it moves here." testID="learning-empty" />
        )
      }
      testID="learning-list"
    />
  );
}

const EntryRow = memo(function EntryRowImpl({ entry: e, onOpen, onCertificate }: { entry: LearningEntry; onOpen: (e: LearningEntry) => void; onCertificate: (serial: string) => void }) {
  const c = e.course;
  const activity = e.completedAt ? `Completed ${longDate(e.completedAt)}` : e.lastActivityAt ? `Last studied ${timeAgo(e.lastActivityAt).toLowerCase()}` : "Not started";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${c.title}, ${progressLine(e.progressPercent, e.completedItems, e.totalItems)}`}
      onPress={() => onOpen(e)}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.75 : 1 }]}
      testID="learning-entry"
    >
      <Cover uri={c.coverUrl} rounded={10} style={styles.thumb} label="" seed={c.slug} />
      <View style={u.flex1}>
        <Text variant="bodyStrong" numberOfLines={2}>{c.title}</Text>
        {e.active ? (
          <>
            <Text variant="small" tone="muted" style={u.mt2}>{progressLine(e.progressPercent, e.completedItems, e.totalItems)}</Text>
            <ProgressBar value={e.progressPercent} style={{ marginTop: space[2] }} />
            <Text variant="caption" tone="subtle" style={{ marginTop: space[2] }} numberOfLines={1}>
              {e.resumeItem && !e.completedAt ? `Resume: ${e.resumeItem.title}` : activity}
            </Text>
            {e.certificate ? (
              <Pressable accessibilityRole="link" onPress={() => onCertificate(e.certificate!.serial)} hitSlop={8} style={styles.link}>
                <Text variant="smallStrong" tone="link">View certificate</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <Text variant="small" tone="muted" style={u.mt2} testID="learning-lapsed">{`Access ended. Your progress (${e.progressPercent}%) is kept.`}</Text>
        )}
      </View>
    </Pressable>
  );
});

type SavedRow = { kind: "course"; course: CourseCard } | { kind: "bookmark"; bookmark: BookmarkEntry };

function SavedList() {
  const { api } = useSession();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const saved = useInfiniteQuery({
    queryKey: qk.learning("saved"),
    queryFn: ({ pageParam }) => api.my.saved({ cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  });
  const marks = useInfiniteQuery({
    queryKey: qk.learning("bookmarks"),
    queryFn: ({ pageParam }) => api.my.bookmarks({ cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  });
  const refetchBoth = () => {
    saved.refetch();
    marks.refetch();
  };
  if (saved.isPending || marks.isPending) return <ListSkeleton />;
  if (saved.isError || marks.isError) return <ErrorState onRetry={refetchBoth} />;
  const courses = flattenPages(saved.data.pages);
  const bookmarks = flattenAll(marks.data.pages);
  if (!courses.length && !bookmarks.length) {
    return <EmptyState title="Nothing saved yet" body="Save courses from their page and bookmark lessons in the classroom to find them here." testID="learning-empty" />;
  }
  const sections: { title: string; key: string; data: SavedRow[] }[] = [
    ...(courses.length ? [{ title: "Saved courses", key: "courses", data: courses.map((c): SavedRow => ({ kind: "course", course: c })) }] : []),
    ...(bookmarks.length ? [{ title: "Bookmarked lessons", key: "bookmarks", data: bookmarks.map((b): SavedRow => ({ kind: "bookmark", bookmark: b })) }] : []),
  ];
  const more = () => {
    if (saved.hasNextPage && !saved.isFetchingNextPage) saved.fetchNextPage();
    else if (!saved.hasNextPage && marks.hasNextPage && !marks.isFetchingNextPage) marks.fetchNextPage();
  };
  return (
    <SectionList
      sections={sections}
      keyExtractor={(r) => (r.kind === "course" ? `c:${r.course.id}` : `b:${r.bookmark.item.id}`)}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => <Text variant="eyebrow" tone="subtle" style={styles.sectionHead}>{section.title}</Text>}
      renderItem={({ item: r }) =>
        r.kind === "course" ? (
          <Pressable accessibilityRole="button" accessibilityLabel={r.course.title} onPress={() => navigation.navigate("Course", { slug: r.course.slug })} style={styles.row} testID="learning-saved-course">
            <Cover uri={r.course.coverUrl} rounded={10} style={styles.thumb} label="" seed={r.course.slug} />
            <View style={u.flex1}>
              <Text variant="bodyStrong" numberOfLines={2}>{r.course.title}</Text>
              <Text variant="small" tone="muted" numberOfLines={1} style={u.mt2}>{r.course.instructors.map((i) => i.displayName).join(", ")}</Text>
            </View>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${r.bookmark.item.title}, ${r.bookmark.course.title}`}
            onPress={() => navigation.navigate("Classroom", { courseSlug: r.bookmark.course.slug, itemId: r.bookmark.item.id })}
            style={[styles.bookmark, { borderBottomColor: colors.border }]}
            testID="learning-bookmark"
          >
            <Text variant="bodyStrong" numberOfLines={2}>{r.bookmark.item.title}</Text>
            <Text variant="small" tone="muted" numberOfLines={1} style={u.mt2}>{`${itemKindLabel({ kind: r.bookmark.item.kind, lectureKind: null })} · ${r.bookmark.course.title}`}</Text>
          </Pressable>
        )
      }
      onEndReached={more}
      onEndReachedThreshold={0.5}
      refreshControl={<RefreshControl refreshing={(saved.isRefetching || marks.isRefetching) && !saved.isFetchingNextPage && !marks.isFetchingNextPage} onRefresh={refetchBoth} tintColor={colors.brand} />}
      contentContainerStyle={styles.list}
      testID="learning-saved"
    />
  );
}

function CertificateList() {
  const { api } = useSession();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const q = useQuery({ queryKey: qk.certificates, queryFn: () => api.my.certificates() });
  if (q.isPending) return <ListSkeleton />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  return (
    <FlatList
      data={q.data}
      keyExtractor={(c: Certificate) => c.serial}
      renderItem={({ item: c }) => (
        <Pressable accessibilityRole="button" accessibilityLabel={`Certificate for ${c.courseTitle}`} onPress={() => navigation.navigate("Certificate", { serial: c.serial })} style={styles.cert} testID="learning-certificate">
          <Text variant="bodyStrong">{c.courseTitle}</Text>
          <Text variant="small" tone={c.revoked ? "danger" : "muted"} style={u.mt2}>{[`Issued ${longDate(c.issuedAt)}`, `Serial ${c.serial}`, c.revoked ? "Revoked" : null].filter(Boolean).join(" · ")}</Text>
        </Pressable>
      )}
      ItemSeparatorComponent={Separator}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => {
        q.refetch();
      }} tintColor={colors.brand} />}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<EmptyState title="No certificates yet" body="Finish a course that awards one and it appears here." testID="learning-empty" />}
      testID="learning-certificates"
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: space[4] },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  list: { paddingHorizontal: space[4], paddingBottom: space[10], flexGrow: 1 },
  row: { flexDirection: "row", gap: space[3], paddingVertical: space[4] },
  thumb: { width: 112 },
  sep: { height: StyleSheet.hairlineWidth },
  link: { alignSelf: "flex-start", minHeight: 32, justifyContent: "center" },
  sectionHead: { marginTop: space[5], marginBottom: space[1] },
  bookmark: { paddingVertical: space[3], borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 56 },
  cert: { paddingVertical: space[4] },
});
