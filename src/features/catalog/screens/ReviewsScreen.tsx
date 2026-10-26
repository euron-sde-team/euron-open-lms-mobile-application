/**
 * All reviews of a course: the rating summary, a star filter, a keyset list, and the
 * learner's own review. Whether the learner may write one comes from the API's review
 * eligibility (enrolled with enough progress); the composer edits and deletes their own,
 * and "Report" on someone else's opens the reason sheet.
 */
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { isApiError } from "../../../api/vendor/client/errors";
import { flattenPages, nextCursor } from "../../../api/vendor/client/pagination";
import type { Review, ReviewEligibility } from "../../../api/vendor/types";
import { qk } from "../../../app/query";
import type { RootScreen } from "../../../app/routes";
import { useSession } from "../../../app/session";
import { Button } from "../../../ui/components/Button";
import { EmptyState, ErrorState, Skeleton, Spinner } from "../../../ui/components/Feedback";
import { Field, Tabs } from "../../../ui/components/Inputs";
import { Header } from "../../../ui/components/Layout";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { space } from "../../../ui/theme/tokens";
import { RatingSummary, ReportSheet, ReviewItem, StarInput, Stars } from "../components/Reviews";
import { useCourse, useSignedIn, useViewerKey } from "../hooks";
import { u } from "../styles";

type StarFilter = "all" | "5" | "4" | "3" | "2" | "1";

const eligibilityKey = (courseId: string) => ["community", "review-eligibility", courseId] as const;

/** Why the composer is not offered, in words; null when there is nothing to say. */
export function eligibilityNote(e: Pick<ReviewEligibility, "canReview" | "reason" | "minProgressPercent" | "mine">): string | null {
  if (e.canReview || e.mine) return null;
  if (e.reason === "TOO_EARLY") return `You can review this course after ${e.minProgressPercent}% of it.`;
  return null;
}

export function ReviewsScreen({ route, navigation }: RootScreen<"Reviews">) {
  const { slug } = route.params;
  const { api } = useSession();
  const signedIn = useSignedIn();
  const viewer = useViewerKey();
  const { colors } = useTheme();
  const course = useCourse(slug);
  const courseId = course.data?.id;
  const [stars, setStars] = useState<StarFilter>("all");
  const [reporting, setReporting] = useState<Review | null>(null);

  const list = useInfiniteQuery({
    queryKey: [...qk.reviews(slug), "list", stars, viewer],
    queryFn: ({ pageParam }) => api.catalog.reviews(slug, { cursor: pageParam, limit: 20, ...(stars !== "all" ? { rating: Number(stars) } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    placeholderData: keepPreviousData,
  });
  const eligibility = useQuery({ queryKey: eligibilityKey(courseId ?? ""), queryFn: () => api.community.reviewEligibility(courseId!), enabled: signedIn && !!courseId });
  const items = useMemo(() => flattenPages(list.data?.pages), [list.data]);
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Course", { slug }));

  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([list.refetch(), course.refetch(), signedIn && courseId ? eligibility.refetch() : Promise.resolve()]);
    setRefreshing(false);
  }, [list, course, eligibility, signedIn, courseId]);

  const renderItem = useCallback(({ item, index }: { item: Review; index: number }) => <ReviewItem review={item} canReport={signedIn} onReport={setReporting} last={index === items.length - 1} />, [signedIn, items.length]);

  if (course.isError && !course.data) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <Header title="Reviews" onBack={back} />
        <ErrorState onRetry={() => course.refetch()} />
      </View>
    );
  }

  const c = course.data;
  const breakdown = c?.ratingBreakdown;
  const head = (
    <View style={{ paddingTop: space[5] }}>
      {c ? <Text variant="small" tone="muted" numberOfLines={2}>{c.title}</Text> : <Skeleton width="60%" />}
      {c?.rating && c.rating.count > 0 && breakdown ? (
        <View style={{ marginTop: space[4] }}>
          <RatingSummary rating={c.rating} breakdown={breakdown} />
        </View>
      ) : !c ? (
        <Skeleton height={90} style={{ marginTop: space[4] }} />
      ) : null}
      {signedIn && c && eligibility.data ? <Composer courseId={c.id} slug={slug} eligibility={eligibility.data} /> : null}
      {c?.rating && c.rating.count > 0 && breakdown ? (
        <View style={{ marginTop: space[6] }}>
          <Tabs<StarFilter>
            value={stars}
            onChange={setStars}
            testID="catalog-reviews-filter"
            items={[{ value: "all", label: "All" }, ...(["5", "4", "3", "2", "1"] as const).map((s) => ({ value: s, label: `${s} star`, count: breakdown[s] }))]}
          />
        </View>
      ) : null}
    </View>
  );

  const empty = list.isPending ? (
    <View style={[u.gap8, { paddingVertical: space[5] }]}>
      <Skeleton width="40%" />
      <Skeleton />
      <Skeleton width="80%" />
    </View>
  ) : list.isError ? (
    <ErrorState message="The reviews did not load." onRetry={() => list.refetch()} />
  ) : (
    <EmptyState title={stars === "all" ? "No written reviews yet" : `No ${stars} star reviews`} body={stars === "all" ? "Learners can review the course once they have made some progress." : "Try another rating."} testID="catalog-reviews-empty" />
  );

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]} testID="catalog-reviews">
      <Header title="Reviews" onBack={back} />
      <FlatList
        data={items}
        keyExtractor={(r) => r.id}
        renderItem={renderItem}
        ListHeaderComponent={head}
        ListEmptyComponent={empty}
        ListFooterComponent={list.isFetchingNextPage ? <Spinner /> : undefined}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
        }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />}
      />
      <ReportSheet review={reporting} onClose={() => setReporting(null)} />
    </View>
  );
}

function Composer({ courseId, slug, eligibility }: { courseId: string; slug: string; eligibility: ReviewEligibility }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const mine = eligibility.mine;
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [body, setBody] = useState(mine?.body ?? "");
  useEffect(() => {
    setRating(mine?.rating ?? 0);
    setBody(mine?.body ?? "");
  }, [mine]);

  const after = () => {
    qc.invalidateQueries({ queryKey: qk.reviews(slug) });
    qc.invalidateQueries({ queryKey: qk.course(slug) });
  };
  const save = useMutation({
    mutationFn: () => api.community.saveReview(courseId, { rating, body: body.trim() || null }),
    onSuccess: (review) => {
      qc.setQueryData<ReviewEligibility>(eligibilityKey(courseId), (old) => (old ? { ...old, canReview: false, reason: "ALREADY_REVIEWED", mine: review } : old));
      setEditing(false);
      after();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.community.deleteReview(courseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: eligibilityKey(courseId) });
      setEditing(false);
      after();
    },
  });
  const confirmDelete = () =>
    Alert.alert("Delete your review?", "Your rating and text are removed from the course.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate() },
    ]);

  const note = eligibilityNote(eligibility);
  if (note) return <Text variant="small" tone="muted" style={{ marginTop: space[5] }} testID="catalog-review-note">{note}</Text>;
  if (!eligibility.canReview && !mine) return null;

  const wrap = [styles.composer, { borderTopColor: colors.border, borderBottomColor: colors.border }];
  if (mine && !editing) {
    return (
      <View style={wrap} testID="catalog-review-mine">
        <Text variant="subheading">Your review</Text>
        <View style={{ marginTop: space[2] }}>
          <Stars value={mine.rating} size={16} />
        </View>
        {mine.body ? <Text tone="muted" style={{ marginTop: space[2] }}>{mine.body}</Text> : null}
        <View style={styles.actions}>
          <Button label="Edit" variant="outline" size="sm" onPress={() => setEditing(true)} testID="catalog-review-edit" />
          <Button label="Delete" variant="ghost" size="sm" onPress={confirmDelete} loading={remove.isPending} testID="catalog-review-delete" />
        </View>
      </View>
    );
  }

  const error = save.error
    ? isApiError(save.error) && save.error.code === "REVIEW_NOT_ALLOWED"
      ? "You cannot review this course yet."
      : isApiError(save.error) && save.error.code === "VALIDATION_FAILED"
        ? save.error.fieldErrors.body ?? "Check the review and try again."
        : "The review did not save. Try again."
    : null;
  return (
    <View style={wrap} testID="catalog-review-composer">
      <Text variant="subheading">{mine ? "Edit your review" : "How is the course going?"}</Text>
      <View style={{ marginTop: space[2] }}>
        <StarInput value={rating} onChange={setRating} />
      </View>
      <View style={{ marginTop: space[3] }}>
        <Field label="Your review (optional)" value={body} onChangeText={setBody} multiline maxLength={4000} placeholder="What worked, and what could be better?" testID="catalog-review-body" />
      </View>
      {error ? <Text variant="small" tone="danger" style={{ marginBottom: space[2] }}>{error}</Text> : null}
      <View style={styles.actions}>
        <Button label={mine ? "Save review" : "Post review"} onPress={() => save.mutate()} disabled={rating < 1} loading={save.isPending} testID="catalog-review-save" />
        {mine ? <Button label="Cancel" variant="ghost" onPress={() => setEditing(false)} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { paddingHorizontal: space[4], paddingBottom: space[8] },
  composer: { marginTop: space[6], paddingVertical: space[5], borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: "row", gap: space[3], marginTop: space[3] },
});
