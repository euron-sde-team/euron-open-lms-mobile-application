/**
 * The result of a checkout {orderId}: polls the order every 2 s for up to a minute until it
 * is paid or failed (the first read asks the server to sync with the gateway once). Paid:
 * a quiet success with "Start learning", and the catalog, learning and account caches are
 * refreshed so access shows everywhere. Still pending after a minute: "Still confirming"
 * with a refresh. Arriving from a canceled Stripe return closes the unpaid order.
 */
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { CheckCircle2 } from "lucide-react-native";
import type { Order } from "../../api/vendor/types";
import { qk } from "../../app/query";
import type { RootScreen } from "../../app/routes";
import { useSession } from "../../app/session";
import { Button } from "../../ui/components/Button";
import { ErrorState, Spinner } from "../../ui/components/Feedback";
import { Text } from "../../ui/components/Text";
import { useTheme } from "../../ui/theme/ThemeProvider";
import { space } from "../../ui/theme/tokens";
import { Page, SignInPrompt, errorMessage } from "./components";
import { failureCopy, orderPhase, orderTitle, pollInterval, routeForLine, startLearningRoute, type OrderPhase } from "./lib/billing";
import { money } from "./lib/format";
import { routeForPath, toPath, type AppRoute } from "./lib/links";
import { u } from "./styles";

/** Polls the order; exported for tests. */
export function useOrderPolling(orderId: string, opts: { cancel?: boolean; enabled?: boolean } = {}) {
  const { api } = useSession();
  const startedAt = useRef(Date.now());
  const calls = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const q = useQuery({
    queryKey: qk.order(orderId),
    queryFn: async (): Promise<Order> => {
      const first = calls.current === 0;
      calls.current += 1;
      if (first && opts.cancel) {
        const o = await api.checkout.order(orderId, { sync: true });
        if (o.status !== "PENDING") return o;
        return api.checkout.cancelOrder(orderId).catch(() => api.checkout.order(orderId));
      }
      return api.checkout.order(orderId, { sync: first });
    },
    refetchInterval: (query) => pollInterval(query.state.data, Date.now() - startedAt.current),
    staleTime: 0,
    retry: 2,
    enabled: opts.enabled !== false,
  });
  const phase = orderPhase(q.data, now - startedAt.current);
  useEffect(() => {
    if (phase !== "pending") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);
  const restart = () => {
    startedAt.current = Date.now();
    setNow(Date.now());
    q.refetch();
  };
  return { ...q, phase, restart };
}

export function CheckoutResultScreen({ route }: RootScreen<"CheckoutResult">) {
  const { status } = useSession();
  const params = route.params as typeof route.params & { canceled?: string };
  if (status !== "signedIn") {
    return (
      <Page title="Your order">
        <SignInPrompt title="Sign in to see your order" body="Sign in with the account you paid with." />
      </Page>
    );
  }
  return <Result orderId={params.orderId} canceled={params.canceled === "1"} />;
}

function Result({ orderId, canceled }: { orderId: string; canceled: boolean }) {
  const { api, setMe } = useSession();
  const qc = useQueryClient();
  const navigation = useNavigation();
  const q = useOrderPolling(orderId, { cancel: canceled });
  const refreshed = useRef(false);

  useEffect(() => {
    if (q.phase !== "paid" || refreshed.current) return;
    refreshed.current = true;
    api.users.me().then(setMe).catch(() => undefined);
    for (const key of [["catalog"], ["my"], ["learn"], qk.orders, qk.subscription, qk.certificates]) qc.invalidateQueries({ queryKey: key });
  }, [q.phase, qc, api, setMe]);

  const go = (r: AppRoute | null) => {
    if (!r) return navigation.goBack();
    (navigation.navigate as (n: string, p?: object) => void)(r.name, r.params);
  };

  let body;
  if (q.isError && !q.data) body = <ErrorState message={errorMessage(q.error)} onRetry={() => { q.refetch(); }} />;
  else if (!q.data) body = <Pending />;
  else body = <Outcome order={q.data} phase={q.phase} onRefresh={q.restart} go={go} />;

  return (
    <Page title="Your order" testID="account-checkout-result">
      {body}
    </Page>
  );
}

function Pending() {
  return (
    <View style={[u.center, { paddingVertical: space[12] }]} testID="account-checkout-pending" accessibilityLiveRegion="polite">
      <Spinner />
      <Text variant="heading" center>Confirming your payment</Text>
      <Text tone="muted" center style={{ marginTop: space[2] }}>This usually takes a few seconds.</Text>
    </View>
  );
}

function Outcome({ order, phase, onRefresh, go }: { order: Order; phase: OrderPhase; onRefresh: () => void; go: (r: AppRoute | null) => void}) {
  const { colors } = useTheme();
  const back = routeForLine(order.lines[0]);
  if (phase === "paid") {
    const plan = order.lines[0]?.type === "PLAN";
    const trial = plan && order.total.amountMinor === 0;
    const start = routeForPath(toPath(order.continueTo)) ?? startLearningRoute(order);
    return (
      <View style={{ paddingTop: space[10] }} testID="account-checkout-paid" accessibilityLiveRegion="polite">
        <CheckCircle2 size={32} color={colors.success} />
        <Text variant="hero" style={{ marginTop: space[4] }}>{plan ? (trial ? "Your free trial has started" : "Your plan is active") : "You are enrolled"}</Text>
        <Text tone="muted" style={{ marginTop: space[3] }}>
          {`${trial ? "You are not charged until the trial ends." : order.total.amountMinor > 0 ? `Payment of ${money(order.total)} received.` : "No payment was needed."} A receipt is on its way to your inbox.`}
        </Text>
        <Text variant="small" tone="muted" style={{ marginTop: space[3] }}>{`${orderTitle(order)} · Receipt ${order.number}`}</Text>
        <Button label="Start learning" size="lg" block style={{ marginTop: space[8] }} onPress={() => go(start)} testID="account-checkout-start" />
        <Button label="View order" variant="ghost" block style={{ marginTop: space[2] }} onPress={() => go({ name: "Order", params: { id: order.id } })} />
      </View>
    );
  }
  if (phase === "failed") {
    return (
      <View style={{ paddingTop: space[10] }} testID="account-checkout-failed-result">
        <Text variant="title">The payment did not go through</Text>
        <Text tone="muted" style={{ marginTop: space[3] }}>{failureCopy(order.failureReason)}</Text>
        <Button label="Try again" size="lg" block style={{ marginTop: space[8] }} onPress={() => go(back)} testID="account-checkout-retry" />
      </View>
    );
  }
  if (phase === "canceled") {
    return (
      <View style={{ paddingTop: space[10] }} testID="account-checkout-canceled">
        <Text variant="title">Checkout canceled</Text>
        <Text tone="muted" style={{ marginTop: space[3] }}>{`You were not charged for ${orderTitle(order)}. You can come back to it any time.`}</Text>
        <Button label="Go back" variant="outline" block style={{ marginTop: space[8] }} onPress={() => go(back)} />
      </View>
    );
  }
  if (phase === "timeout") {
    return (
      <View style={{ paddingTop: space[10] }} testID="account-checkout-timeout">
        <Text variant="title">Still confirming</Text>
        <Text tone="muted" style={{ marginTop: space[3] }}>Some payments take a few minutes to clear. We will email you when it does, and the course opens on its own.</Text>
        <Button label="Refresh" size="lg" block style={{ marginTop: space[8] }} onPress={onRefresh} testID="account-checkout-refresh" />
        <Button label="See your orders" variant="ghost" block style={{ marginTop: space[2] }} onPress={() => go({ name: "Orders" })} />
      </View>
    );
  }
  return <Pending />;
}
