/** Orders: everything bought, newest first, as a keyset list of title, number, date, status and total. */
import { useNavigation } from "@react-navigation/native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { memo } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { flattenPages, nextCursor } from "../../api/vendor/client/pagination";
import type { Order } from "../../api/vendor/types";
import { qk } from "../../app/query";
import { useSession } from "../../app/session";
import { EmptyState, ErrorState, Spinner } from "../../ui/components/Feedback";
import { Screen } from "../../ui/components/Layout";
import { Text } from "../../ui/components/Text";
import { useTheme } from "../../ui/theme/ThemeProvider";
import { space } from "../../ui/theme/tokens";
import { BackHeader, ListSkeleton, SignInPrompt } from "./components";
import { ORDER_STATUS, orderTitle } from "./lib/billing";
import { dateOnly, money } from "./lib/format";
import { u } from "./styles";

const OrderRow = memo(function Row({ o, onPress }: { o: Order; onPress: (id: string) => void}) {
  const { colors } = useTheme();
  const status = ORDER_STATUS[o.status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${orderTitle(o)}, ${status.label}, ${money(o.total)}`}
      onPress={() => onPress(o.id)}
      testID="account-order-row"
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={u.flex}>
        <Text variant="bodyStrong" numberOfLines={2}>{orderTitle(o)}</Text>
        <Text variant="small" tone="muted" style={u.mt2}>{`${o.number} · ${dateOnly(o.paidAt ?? o.createdAt)}`}</Text>
      </View>
      <View style={u.end}>
        <Text variant="bodyStrong">{money(o.total)}</Text>
        <Text variant="small" tone={status.tone === "default" ? "muted" : status.tone === "muted" ? "subtle" : status.tone}>{status.label}</Text>
      </View>
    </Pressable>
  );
});

export function OrdersScreen() {
  const { api, status } = useSession();
  const navigation = useNavigation();
  const signedIn = status === "signedIn";
  const q = useInfiniteQuery({
    queryKey: qk.orders,
    queryFn: ({ pageParam }) => api.billing.orders({ cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled: signedIn,
  });
  const items = flattenPages(q.data?.pages);
  const open = (id: string) => navigation.navigate("Order", { id });

  return (
    <Screen scroll={false} padded={false} testID="account-orders-screen">
      <BackHeader title="Orders" />
      {!signedIn ? (
        <SignInPrompt title="Sign in to see your orders" body="Courses, bundles and plans you buy show up here with their receipts." />
      ) : q.isPending ? (
        <View style={{ paddingHorizontal: space[4] }}>
          <ListSkeleton rows={5} testID="account-orders-loading" />
        </View>
      ) : q.isError && !items.length ? (
        <ErrorState onRetry={() => { q.refetch(); }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => <OrderRow o={item} onPress={open} />}
          contentContainerStyle={[u.grow, { paddingHorizontal: space[4], paddingBottom: space[8] }]}
          refreshing={q.isRefetching && !q.isFetchingNextPage}
          onRefresh={() => { q.refetch(); }}
          onEndReached={() => {
            if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={q.isFetchingNextPage ? <Spinner /> : undefined}
          ListEmptyComponent={
            <EmptyState title="No orders yet" body="Courses, bundles and plans you buy show up here with their receipts." action={{ label: "Browse courses", onPress: () => navigation.navigate("Tabs", { screen: "Explore" }) }} testID="account-orders-empty" />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space[4], paddingVertical: space[4], borderBottomWidth: StyleSheet.hairlineWidth },
});
