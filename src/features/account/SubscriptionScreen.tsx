/**
 * Subscription: the plan, its status and renewal date, and cancel at period end or resume.
 * Managing an existing plan is allowed on both platforms; changing or buying a plan is
 * offered only where the app may sell (Android), never on iOS.
 */
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, View } from "react-native";
import type { SubscriptionSummary } from "../../api/vendor/types";
import { purchaseMode, useMeta } from "../../app/meta";
import { qk } from "../../app/query";
import { useSession } from "../../app/session";
import { Button } from "../../ui/components/Button";
import { EmptyState, ErrorState, Skeleton } from "../../ui/components/Feedback";
import { Text } from "../../ui/components/Text";
import { space } from "../../ui/theme/tokens";
import { Notice, Page, SignInPrompt, errorMessage } from "./components";
import { cancelExplainer, gatewayName, subscriptionCopy } from "./lib/billing";
import { money } from "./lib/format";
import { u } from "./styles";

export function SubscriptionScreen() {
  const { api, status, setMe } = useSession();
  const meta = useMeta();
  const navigation = useNavigation();
  const qc = useQueryClient();
  const canSell = purchaseMode(meta.data) === "in-app";
  const signedIn = status === "signedIn";
  const q = useQuery({ queryKey: qk.subscription, queryFn: () => api.billing.subscription(), enabled: signedIn });

  const applied = (s: SubscriptionSummary) => {
    qc.setQueryData(qk.subscription, s);
    api.users.me().then(setMe).catch(() => undefined);
    qc.invalidateQueries({ queryKey: ["catalog"] });
  };
  const cancel = useMutation({ mutationFn: () => api.billing.cancelSubscription(), onSuccess: applied });
  const resume = useMutation({ mutationFn: () => api.billing.resumeSubscription(), onSuccess: applied });

  if (!signedIn) {
    return (
      <Page title="Subscription">
        <SignInPrompt title="Sign in to see your plan" body="Your plan, when it renews and what it costs." />
      </Page>
    );
  }

  let body;
  if (q.isPending) {
    body = (
      <View style={{ marginTop: space[6], gap: space[3] }} testID="account-subscription-loading">
        <Skeleton width="50%" height={24} />
        <Skeleton width="80%" />
      </View>
    );
  } else if (q.isError) {
    body = <ErrorState message={errorMessage(q.error)} onRetry={() => { q.refetch(); }} />;
  } else if (!q.data) {
    body = (
      <EmptyState
        title="You do not have a plan"
        body={canSell ? "A plan opens every course it includes for as long as it runs." : undefined}
        action={canSell ? { label: "See plans", onPress: () => navigation.navigate("Plans") } : undefined}
        testID="account-subscription-empty"
      />
    );
  } else {
    const sub = q.data;
    const copy = subscriptionCopy(sub);
    const priceLine = copy.dateLine?.includes(money(sub.price)) ? null : `${money(sub.price)} a ${sub.interval === "YEAR" ? "year" : "month"}`;
    const confirmCancel = () =>
      Alert.alert(`Cancel ${sub.plan.name}?`, cancelExplainer(sub), [
        { text: "Keep my plan", style: "cancel" },
        { text: "Cancel plan", style: "destructive", onPress: () => cancel.mutate() },
      ]);
    body = (
      <View testID="account-subscription">
        <Text variant="title" style={{ marginTop: space[6] }}>{sub.plan.name}</Text>
        <Text variant="bodyStrong" tone={copy.tone === "default" ? "default" : copy.tone} style={u.mt4} testID="account-subscription-status">{copy.status}</Text>
        <Text tone="muted" style={u.mt4} testID="account-subscription-date">{[priceLine, copy.dateLine].filter(Boolean).join(" · ")}</Text>
        {copy.warning ? <Notice tone="danger" body={copy.warning} /> : <Text variant="small" tone="muted" style={{ marginTop: space[4] }}>{copy.live ? "Courses in this plan are open to you now." : "Courses in this plan are locked. Your progress is kept."}</Text>}
        {cancel.isError || resume.isError ? <Notice tone="danger" body={errorMessage(cancel.error ?? resume.error)} /> : null}
        <View style={{ gap: space[3], marginTop: space[6] }}>
          {copy.canResume ? <Button label="Keep my plan" loading={resume.isPending} onPress={() => resume.mutate()} testID="account-subscription-resume" /> : null}
          {copy.canCancel ? <Button label="Cancel at period end" variant="outline" loading={cancel.isPending} onPress={confirmCancel} testID="account-subscription-cancel" /> : null}
          {canSell ? <Button label={copy.live ? "Change plan" : "See plans"} variant={copy.live ? "ghost" : "primary"} onPress={() => navigation.navigate("Plans")} testID="account-subscription-change" /> : null}
        </View>
        <Text variant="small" tone="muted" style={{ marginTop: space[6] }}>{`Billed through ${sub.gateway === "FREE" ? "the academy" : gatewayName(sub.gateway)}. Receipts for every payment are in Orders.`}</Text>
      </View>
    );
  }

  return (
    <Page title="Subscription" refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} testID="account-subscription-screen">
      {body}
    </Page>
  );
}
