/**
 * The course page: cover, title, rating and facts, instructors, outcomes, description,
 * prerequisites, the curriculum accordion, a reviews summary and the bundles that include
 * it, over a sticky purchase bar. What the bar offers comes from `coursePurchase()` (the
 * API's access state plus this device's purchase mode); the page refetches on focus so a
 * purchase or enrollment made elsewhere shows access on return.
 */
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Linking, Pressable, Share, StyleSheet, View } from "react-native";
import { Check, Share2 } from "lucide-react-native";
import { isApiError } from "../../../api/vendor/client/errors";
import type { CourseDetail, CurriculumItemPublic } from "../../../api/vendor/types";
import { qk } from "../../../app/query";
import type { RootScreen } from "../../../app/routes";
import { useSession } from "../../../app/session";
import { config } from "../../../config";
import { joinUrl, safeExternalUrl } from "../../../lib/urls";
import { IconButton } from "../../../ui/components/Button";
import { EmptyState, ErrorState, Skeleton } from "../../../ui/components/Feedback";
import { Html } from "../../../ui/components/Html";
import { Header, Row, Screen, Section } from "../../../ui/components/Layout";
import { Avatar, Cover, Rating } from "../../../ui/components/Media";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { space } from "../../../ui/theme/tokens";
import { Curriculum } from "../components/Curriculum";
import { PurchaseBar } from "../components/PurchaseBar";
import { RatingSummary, ReviewItem } from "../components/Reviews";
import { formatDuration, languageName, levelLabel, money, plural, updatedLine } from "../format";
import { useCourse, useEnrollFree, usePurchaseContext, useRefetchOnFocus, useViewerKey } from "../hooks";
import { coursePurchase, type PurchaseAction } from "../purchase";
import { u } from "../styles";

export function CourseScreen({ route, navigation }: RootScreen<"Course">) {
  const { slug } = route.params;
  const q = useCourse(slug);
  const ctx = usePurchaseContext();
  const [coupon, setCoupon] = useState(route.params.coupon ?? "");
  const enroll = useEnrollFree(slug);
  const { colors } = useTheme();
  const refetch = q.refetch;
  useRefetchOnFocus(refetch);

  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Tabs", { screen: "Home" }));
  const share = () => {
    const url = joinUrl(config.webBaseUrl, `courses/${encodeURIComponent(slug)}`);
    Share.share({ message: q.data ? `${q.data.title} ${url}` : url, url, title: q.data?.title }).catch(() => undefined);
  };
  const header = <Header onBack={back} right={<IconButton label="Share" onPress={share} icon={<Share2 size={21} color={colors.foreground} />} size={44} />} />;

  const c = q.data;
  const view = useMemo(() => (c ? coursePurchase(c, ctx) : null), [c, ctx]);

  const run = useCallback(
    (a: PurchaseAction) => {
      if (!c) return;
      switch (a.kind) {
        case "classroom":
          navigation.navigate("Classroom", { courseSlug: c.slug, itemId: a.itemId ?? undefined });
          return;
        case "enroll":
          enroll.mutate(undefined, { onSuccess: (r) => navigation.navigate("Classroom", { courseSlug: c.slug, itemId: r.resumeItemId ?? undefined }) });
          return;
        case "signIn":
          navigation.navigate("SignIn", { next: `/courses/${c.slug}` });
          return;
        case "plans":
          navigation.navigate("Plans");
          return;
        case "checkout":
          navigation.navigate("Checkout", { type: "COURSE", id: c.id, ...(coupon.trim() ? { coupon: coupon.trim() } : {}) });
          return;
        case "web": {
          const url = safeExternalUrl(a.url);
          if (url) Linking.openURL(url).catch(() => undefined);
          return;
        }
        case "learning":
          navigation.navigate("Tabs", { screen: "Learning" });
      }
    },
    [c, coupon, enroll, navigation]
  );

  const enrollError = enroll.error ? (isApiError(enroll.error) && enroll.error.code === "ACCOUNT_RESTRICTED" ? "Your account is restricted, so you cannot enroll right now." : isApiError(enroll.error) && enroll.error.code === "NOT_FREE" ? "This course is no longer free. Pull down to refresh." : "Enrolling did not work. Try again.") : null;

  if (q.isError && !c) {
    return (
      <Screen scroll={false} padded={false}>
        {header}
        {isApiError(q.error) && q.error.status === 404 ? (
          <EmptyState title="This course is not available" body="It may have been unpublished, or the link may be wrong." action={{ label: "Browse courses", onPress: () => navigation.navigate("Tabs", { screen: "Explore" }) }} testID="catalog-course-missing" />
        ) : (
          <ErrorState onRetry={() => q.refetch()} />
        )}
      </Screen>
    );
  }
  if (!c || !view) {
    return (
      <Screen scroll={false} padded={false}>
        {header}
        <CourseSkeleton />
      </Screen>
    );
  }

  const locked = !view.hasAccess;
  const openPreview = (item: CurriculumItemPublic) => navigation.navigate("Classroom", { courseSlug: c.slug, itemId: item.id });
  return (
    <View style={styles.fill} testID="catalog-course">
      {header}
      <Screen
        refreshing={q.isRefetching}
        onRefresh={() => q.refetch()}
        footer={<PurchaseBar view={view} onAction={run} busy={enroll.isPending} error={enrollError} coupon={coupon} onCouponChange={setCoupon} />}
      >
        <Hero course={c} onInstructor={(username) => navigation.navigate("Instructor", { id: username })} />

        {c.access.state === "STAFF" && c.status !== "PUBLISHED" ? (
          <Text variant="small" tone="warning" style={{ marginTop: space[4] }}>{`Staff preview. This course is ${c.status === "ARCHIVED" ? "archived" : "not published"}, so only its team and admins can see it.`}</Text>
        ) : null}

        {c.outcomes.length ? (
          <Section title="What you'll learn">
            <View style={{ gap: space[3] }} testID="catalog-course-outcomes">
              {c.outcomes.map((o) => (
                <View key={o} style={styles.bullet}>
                  <Check size={18} color={colors.primary} style={u.mt2} />
                  <Text style={u.flex}>{o}</Text>
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        {c.descriptionHtml ? (
          <Section title="About this course">
            <Html html={c.descriptionHtml} />
          </Section>
        ) : null}

        {c.prerequisites.length ? (
          <Section title="Before you start">
            <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              {c.prerequisites.map((p, i) => (
                <View key={p} style={[styles.prereq, i < c.prerequisites.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                  <Text>{p}</Text>
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        <Section title="Curriculum">
          <Curriculum sections={c.sections} locked={locked} onPreview={openPreview} />
        </Section>

        {c.instructors.length ? (
          <Section title={c.instructors.length === 1 ? "Your instructor" : "Your instructors"}>
            {c.instructors.map((i, n) => (
              <Row
                key={i.id}
                left={<Avatar uri={i.avatarUrl} name={i.displayName} size={44} />}
                label={i.displayName}
                detail={i.headline ?? undefined}
                onPress={() => navigation.navigate("Instructor", { id: i.username })}
                last={n === c.instructors.length - 1}
                testID="catalog-course-instructor"
              />
            ))}
          </Section>
        ) : null}

        <ReviewsPreview course={c} onSeeAll={() => navigation.navigate("Reviews", { slug: c.slug })} />

        {c.bundles.length && !view.hasAccess ? (
          <Section title={c.bundles.length === 1 ? "Also in a bundle" : "Also in bundles"}>
            {c.bundles.map((b, i) => (
              <Row
                key={b.id}
                label={b.title}
                detail={[plural(b.courseCount, "course", "courses"), ctx.mode === "in-app" && b.price ? money(b.price, { compact: true }) : null].filter(Boolean).join(" · ")}
                onPress={() => navigation.navigate("Bundle", { slug: b.slug })}
                last={i === c.bundles.length - 1}
                testID="catalog-course-bundle"
              />
            ))}
          </Section>
        ) : null}
      </Screen>
    </View>
  );
}

function Hero({ course: c, onInstructor }: { course: CourseDetail; onInstructor: (username: string) => void }) {
  const facts = [levelLabel(c.level), c.durationSeconds > 0 ? formatDuration(c.durationSeconds) : null, plural(c.itemCount, "lesson", "lessons"), languageName(c.language)].filter(Boolean).join(" · ");
  const updated = updatedLine(c.updatedAt);
  return (
    <View style={{ paddingTop: space[3] }}>
      <Cover uri={c.coverUrl} label={c.title} seed={c.slug} />
      {c.categories[0] ? <Text variant="eyebrow" tone="primary" style={{ marginTop: space[5] }}>{c.categories[0].name}</Text> : null}
      <Text variant="title" accessibilityRole="header" style={{ marginTop: c.categories[0] ? space[1] : space[5] }} testID="catalog-course-title">{c.title}</Text>
      {c.subtitle ? <Text tone="muted" style={{ marginTop: space[2] }}>{c.subtitle}</Text> : null}
      <View style={styles.ratingRow}>
        {c.rating ? <Rating value={c.rating.average} count={c.rating.count} /> : null}
        {c.enrollmentCount > 0 ? <Text variant="small" tone="muted">{plural(c.enrollmentCount, "learner", "learners")}</Text> : null}
      </View>
      <Text variant="small" tone="muted" style={{ marginTop: space[2] }} testID="catalog-course-facts">{facts}</Text>
      {c.instructors.length ? (
        <Text variant="small" tone="muted" style={{ marginTop: space[2] }}>
          {"By "}
          {c.instructors.map((i, n) => (
            <Text key={i.id} variant="smallStrong" onPress={() => onInstructor(i.username)} accessibilityRole="link">
              {`${n > 0 ? ", " : ""}${i.displayName}`}
            </Text>
          ))}
        </Text>
      ) : null}
      {updated ? <Text variant="caption" tone="subtle" style={{ marginTop: space[2] }}>{updated}</Text> : null}
    </View>
  );
}

function ReviewsPreview({ course, onSeeAll }: { course: CourseDetail; onSeeAll: () => void }) {
  const { api } = useSession();
  const viewer = useViewerKey();
  const has = !!course.rating && course.rating.count > 0;
  const latest = useQuery({ queryKey: [...qk.reviews(course.slug), "latest", viewer], queryFn: () => api.catalog.reviews(course.slug, { limit: 3 }), enabled: has });
  if (!has || !course.rating) {
    return (
      <Section title="Reviews">
        <Text tone="muted">No reviews yet. Learners can review the course once they have made some progress.</Text>
      </Section>
    );
  }
  const items = latest.data?.items ?? [];
  return (
    <Section title="Reviews" action={{ label: "See all", onPress: onSeeAll }}>
      <RatingSummary rating={course.rating} breakdown={course.ratingBreakdown} />
      <View style={{ marginTop: space[4] }}>
        {latest.isPending ? (
          <View style={[u.gap8, { paddingVertical: space[4] }]}>
            <Skeleton width="40%" />
            <Skeleton />
            <Skeleton width="80%" />
          </View>
        ) : (
          items.map((r, i) => <ReviewItem key={r.id} review={r} canReport={false} last={i === items.length - 1} />)
        )}
      </View>
      <Pressable accessibilityRole="button" onPress={onSeeAll} hitSlop={8} style={styles.seeAll} testID="catalog-course-reviews-all">
        <Text variant="smallStrong" tone="link">{`See all ${plural(course.rating.count, "rating", "ratings")}`}</Text>
      </Pressable>
    </Section>
  );
}

function CourseSkeleton() {
  return (
    <View style={{ padding: space[4], gap: space[3] }} accessibilityElementsHidden>
      <Skeleton style={{ aspectRatio: 16 / 9, height: undefined }} rounded={14} />
      <Skeleton width="30%" height={12} style={{ marginTop: space[3] }} />
      <Skeleton width="85%" height={26} />
      <Skeleton width="60%" height={16} />
      <Skeleton width="50%" height={12} />
      <Skeleton height={14} style={{ marginTop: space[6] }} />
      <Skeleton width="90%" height={14} />
      <Skeleton width="70%" height={14} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: space[3], marginTop: space[3] },
  bullet: { flexDirection: "row", gap: space[3] },
  prereq: { paddingVertical: space[3] },
  seeAll: { marginTop: space[3], minHeight: 44, justifyContent: "center" },
});
