/**
 * Notifications: the keyset list with an icon by type, the text, a relative time and an
 * unread dot. Tapping one marks it read (optimistically, the bell's count too) and opens
 * the screen its path points to. "Mark all read" clears the lot.
 */
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { memo, useCallback } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { Award, BadgeCheck, CircleAlert, CreditCard, GraduationCap, MessageCircle, MessageSquareReply, Receipt, RotateCcw, Sparkles, Star, type LucideIcon } from "lucide-react-native";
import { flattenPages, mapPages, nextCursor } from "../../api/vendor/client/pagination";
import type { Notification, NotificationCounts, NotificationType, Page as ApiPage } from "../../api/vendor/types";
import { qk } from "../../app/query";
import { useSession } from "../../app/session";
import { EmptyState, ErrorState, Spinner } from "../../ui/components/Feedback";
import { Header, Screen } from "../../ui/components/Layout";
import { Text } from "../../ui/components/Text";
import { useTheme } from "../../ui/theme/ThemeProvider";
import type { Palette } from "../../ui/theme/tokens";
import { space } from "../../ui/theme/tokens";
import { useNavigation } from "@react-navigation/native";
import { ListSkeleton, SignInPrompt } from "./components";
import { relativeTime } from "./lib/format";
import { akq } from "./lib/keys";
import { openPath } from "./lib/links";
import { u } from "./styles";

type ToneKey = "primary" | "success" | "warning" | "danger";

export const NOTIFICATION_COPY: Record<NotificationType, { text: string; icon: LucideIcon; tone: ToneKey }> = {
  ORDER_PAID: { text: "Payment received. You're enrolled", icon: Receipt, tone: "success" },
  ORDER_FAILED: { text: "Your payment did not go through", icon: CircleAlert, tone: "danger" },
  REFUND_ISSUED: { text: "Your refund was issued", icon: RotateCcw, tone: "primary" },
  ENROLLMENT_GRANTED: { text: "You were given access to a course", icon: GraduationCap, tone: "success" },
  ENROLLMENT_REVOKED: { text: "Your access to a course ended", icon: CircleAlert, tone: "warning" },
  SUBMISSION_REVIEWED: { text: "Your assignment was reviewed", icon: BadgeCheck, tone: "primary" },
  CERTIFICATE_ISSUED: { text: "You earned a certificate", icon: Award, tone: "success" },
  SUBSCRIPTION_RENEWED: { text: "Your subscription renewed", icon: CreditCard, tone: "primary" },
  SUBSCRIPTION_PAYMENT_FAILED: { text: "We could not renew your subscription", icon: CircleAlert, tone: "danger" },
  SUBSCRIPTION_CANCELED: { text: "Your subscription was cancelled", icon: CreditCard, tone: "warning" },
  QA_REPLY: { text: "New answer to your question", icon: MessageCircle, tone: "primary" },
  QA_ACCEPTED: { text: "Your answer was marked as accepted", icon: MessageSquareReply, tone: "success" },
  REVIEW_REPLY: { text: "The instructor replied to your review", icon: Star, tone: "primary" },
  COURSE_UPDATED: { text: "A course you take has new content", icon: Sparkles, tone: "primary" },
};

const toneColor = (c: Palette, t: ToneKey) => ({ primary: c.primary, success: c.success, warning: c.warning, danger: c.danger })[t];

type Pages = InfiniteData<ApiPage<Notification>, string | undefined>;

const NotificationRow = memo(function Row({ n, onPress }: { n: Notification; onPress: (n: Notification) => void}) {
  const { colors } = useTheme();
  const copy = NOTIFICATION_COPY[n.type] ?? { text: "Something happened", icon: Sparkles, tone: "primary" as const };
  const Icon = copy.icon;
  const unread = !n.readAt;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? "Unread. " : ""}${copy.text}${n.snippet ? `, ${n.snippet}` : ""}`}
      onPress={() => onPress(n)}
      testID="account-notification-row"
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
    >
      <Icon size={20} color={toneColor(colors, copy.tone)} style={u.mt2} />
      <View style={u.flex}>
        <Text variant={unread ? "bodyStrong" : "body"} tone={unread ? "default" : "muted"}>
          {copy.text}
          {n.snippet ? <Text tone="muted">{` · ${n.snippet}`}</Text> : null}
        </Text>
        <Text variant="caption" tone="subtle" style={u.mt2}>{relativeTime(n.createdAt)}</Text>
      </View>
      {unread ? <View accessibilityLabel="Unread" style={[styles.dot, { backgroundColor: colors.brand }]} /> : null}
    </Pressable>
  );
});

export function NotificationsScreen() {
  const { api, status } = useSession();
  const navigation = useNavigation();
  const qc = useQueryClient();
  const signedIn = status === "signedIn";
  const q = useInfiniteQuery({
    queryKey: akq.notificationList,
    queryFn: ({ pageParam }) => api.notifications.list({ cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled: signedIn,
  });
  const items = flattenPages(q.data?.pages);
  const anyUnread = items.some((n) => !n.readAt);

  const markLocal = useCallback(
    (pred: (n: Notification) => boolean) => {
      const now = new Date().toISOString();
      qc.setQueryData<Pages>(akq.notificationList, (d) => (d ? { ...d, pages: mapPages(d.pages, (n) => (pred(n) && !n.readAt ? { ...n, readAt: now } : n)) } : d));
    },
    [qc]
  );

  const read = useMutation({
    mutationFn: (id: string) => api.notifications.read(id),
    onMutate: (id) => {
      markLocal((n) => n.id === id);
      qc.setQueryData<NotificationCounts>(qk.notificationCounts, (c) => (c ? { notifications: Math.max(0, c.notifications - 1) } : c));
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: qk.notificationCounts }); },
  });
  const readAll = useMutation({
    mutationFn: () => api.notifications.readAll(),
    onMutate: () => {
      markLocal(() => true);
      qc.setQueryData<NotificationCounts>(qk.notificationCounts, { notifications: 0 });
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: qk.notifications }); },
  });

  const onPress = useCallback(
    (n: Notification) => {
      if (!n.readAt) read.mutate(n.id);
      openPath(n.href);
    },
    [read]
  );

  const header = (
    <Header
      title="Notifications"
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      right={
        signedIn && anyUnread ? (
          <Pressable accessibilityRole="button" onPress={() => readAll.mutate()} hitSlop={8} style={[u.target, { paddingRight: space[3] }]} testID="account-notifications-read-all">
            <Text variant="smallStrong" tone="link">Mark all read</Text>
          </Pressable>
        ) : undefined
      }
    />
  );

  if (!signedIn) {
    return (
      <Screen scroll={false} padded={false}>
        {header}
        <SignInPrompt title="Sign in to see notifications" body="Replies, grades, certificates and receipts show up here." />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false} testID="account-notifications-screen">
      {header}
      {q.isPending ? (
        <View style={{ paddingHorizontal: space[4] }}>
          <ListSkeleton rows={6} testID="account-notifications-loading" />
        </View>
      ) : q.isError && !items.length ? (
        <ErrorState onRetry={() => { q.refetch(); }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => <NotificationRow n={item} onPress={onPress} />}
          contentContainerStyle={[u.grow, { paddingHorizontal: space[4], paddingBottom: space[8] }]}
          refreshing={q.isRefetching && !q.isFetchingNextPage}
          onRefresh={() => { q.refetch(); }}
          onEndReached={() => {
            if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={q.isFetchingNextPage ? <Spinner /> : undefined}
          ListEmptyComponent={<EmptyState title="You are all caught up" body="Replies to your questions, graded work, certificates and receipts show up here." testID="account-notifications-empty" />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: space[3], paddingVertical: space[4], borderBottomWidth: StyleSheet.hairlineWidth },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 8 },
});
