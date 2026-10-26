/**
 * The all-access plans: name, what each includes, and the price per billing period in the
 * currency the server quotes, with the current plan marked. Android subscribes in the app
 * (Checkout type "PLAN"); iOS follows the same rule as paid courses: a website link when
 * the admin allows it, otherwise no prices and nothing to tap (`planOffer()`).
 */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { Check } from "lucide-react-native";
import type { BillingInterval, Plan } from "../../../api/vendor/types";
import { qk } from "../../../app/query";
import type { RootScreen } from "../../../app/routes";
import { useSession } from "../../../app/session";
import { safeExternalUrl } from "../../../lib/urls";
import { Button } from "../../../ui/components/Button";
import { EmptyState, ErrorState, Skeleton } from "../../../ui/components/Feedback";
import { Tabs } from "../../../ui/components/Inputs";
import { Header, Screen } from "../../../ui/components/Layout";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { space } from "../../../ui/theme/tokens";
import { money, plural } from "../format";
import { usePurchaseContext, useSignedIn, useViewerKey } from "../hooks";
import { availableIntervals, planOffer, yearlyNote, type PurchaseContext } from "../purchase";
import { u } from "../styles";

export function PlansScreen({ navigation }: RootScreen<"Plans">) {
  const { api, me } = useSession();
  const viewer = useViewerKey();
  const signedIn = useSignedIn();
  const ctx = usePurchaseContext();
  const { colors } = useTheme();
  const q = useQuery({ queryKey: [...qk.plans, viewer], queryFn: () => api.checkout.plans() });
  const plans = q.data ?? [];
  const intervals = availableIntervals(plans);
  const [wanted, setWanted] = useState<BillingInterval>("MONTH");
  const interval: BillingInterval = intervals.includes(wanted) ? wanted : (intervals[0] ?? "MONTH");
  const sub = me?.subscription ?? null;
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Tabs", { screen: "Home" }));

  const subscribe = (plan: Plan, i: BillingInterval) => {
    navigation.navigate("Checkout", { type: "PLAN", id: plan.id, interval: i });
  };

  return (
    <View style={u.flex} testID="catalog-plans">
      <Header title="Plans" onBack={back} />
      <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        <Text tone="muted" style={{ marginTop: space[5] }}>{ctx.mode === "none" ? "What each plan includes." : "One subscription opens every course included in the plan. Cancel any time; your progress and certificates stay yours."}</Text>
        {sub ? (
          <View style={[styles.current, { borderColor: colors.border }]} testID="catalog-plans-current">
            <Text style={u.flex}>
              {"You are on "}
              <Text variant="bodyStrong">{sub.plan.name}</Text>
            </Text>
            <Button label="Manage" variant="ghost" size="sm" onPress={() => navigation.navigate("Subscription")} testID="catalog-plans-manage" />
          </View>
        ) : null}
        {q.isPending ? (
          <PlansSkeleton />
        ) : q.isError ? (
          <ErrorState message="The plans did not load." onRetry={() => q.refetch()} />
        ) : plans.length === 0 ? (
          <EmptyState title="No plans on sale right now" body="Courses are still available one at a time." action={{ label: "Browse courses", onPress: () => navigation.navigate("Tabs", { screen: "Explore" }) }} testID="catalog-plans-empty" />
        ) : (
          <>
            {intervals.length > 1 && ctx.mode === "in-app" ? (
              <View style={{ marginTop: space[6] }}>
                <Tabs<BillingInterval> value={interval} onChange={setWanted} items={[{ value: "MONTH", label: "Monthly" }, { value: "YEAR", label: "Yearly" }]} testID="catalog-plans-interval" />
              </View>
            ) : null}
            {plans.map((p, i) => (
              <PlanBlock key={p.id} plan={p} interval={interval} ctx={ctx} signedIn={signedIn} sub={sub} first={i === 0} onSubscribe={subscribe} onSignIn={() => navigation.navigate("SignIn", { next: "/plans" })} onManage={() => navigation.navigate("Subscription")} />
            ))}
          </>
        )}
      </Screen>
    </View>
  );
}

function PlanBlock({ plan, interval, ctx, signedIn, sub, first, onSubscribe, onSignIn, onManage }: {
  plan: Plan;
  interval: BillingInterval;
  ctx: PurchaseContext;
  signedIn: boolean;
  sub: { plan: { id: string; name: string } } | null;
  first: boolean;
  onSubscribe: (p: Plan, i: BillingInterval) => void;
  onSignIn: () => void;
  onManage: () => void;
}) {
  const { colors } = useTheme();
  const offer = planOffer(plan, interval, { ...ctx, signedIn, subscription: sub });
  const showPrice = ctx.mode === "in-app";
  const price = plan.prices.find((p) => p.interval === interval) ?? null;
  const yearly = interval === "YEAR" ? yearlyNote(plan) : null;
  return (
    <View style={[styles.plan, { borderTopColor: colors.border }]} testID={`catalog-plan-${plan.slug}`}>
      <View style={styles.planHead}>
        <Text variant="title" style={u.flex}>{plan.name}</Text>
        {offer.kind === "current" ? <Text variant="smallStrong" tone="success">Your plan</Text> : null}
      </View>
      {plan.description ? <Text tone="muted" style={{ marginTop: space[2] }}>{plan.description}</Text> : null}
      {showPrice ? (
        price ? (
          <View style={{ marginTop: space[4] }}>
            <Text>
              <Text variant="title">{money(price.price, { compact: true })}</Text>
              <Text tone="muted">{interval === "YEAR" ? " a year" : " a month"}</Text>
            </Text>
            {yearly ? <Text variant="small" tone="muted" style={{ marginTop: space[1] }}>{`About ${money(yearly.perMonth)} a month${yearly.savingPercent ? `, ${yearly.savingPercent}% less than monthly` : ""}`}</Text> : null}
          </View>
        ) : (
          <Text variant="small" tone="muted" style={{ marginTop: space[4] }}>{`Not sold ${interval === "YEAR" ? "yearly" : "monthly"} right now.`}</Text>
        )
      ) : null}
      {showPrice && plan.trialDays > 0 && !sub ? <Text variant="smallStrong" tone="primary" style={{ marginTop: space[2] }}>{`${plan.trialDays}-day free trial. You are not charged until it ends.`}</Text> : null}

      <View style={{ marginTop: space[4] }}>
        {offer.kind === "current" ? (
          <Button label="Manage your plan" variant="outline" block onPress={onManage} testID="catalog-plan-manage" />
        ) : offer.kind === "hasOther" ? (
          <Text variant="small" tone="muted">You already have a plan. Cancel it first to switch.</Text>
        ) : offer.kind === "subscribe" ? (
          <Button label={offer.label} variant={first ? "primary" : "outline"} size="lg" block onPress={() => onSubscribe(plan, offer.interval)} testID="catalog-plan-subscribe" />
        ) : offer.kind === "signIn" ? (
          <Button label="Sign in to subscribe" variant={first ? "primary" : "outline"} size="lg" block onPress={onSignIn} testID="catalog-plan-signin" />
        ) : offer.kind === "web" ? (
          <>
            <Text variant="small" tone="muted" style={{ marginBottom: space[2] }}>{`Available on ${ctx.academyName}'s website`}</Text>
            <Button label="Continue on the website" variant="outline" block onPress={() => { const link = safeExternalUrl(offer.url); if (link) Linking.openURL(link).catch(() => undefined); }} testID="catalog-cta-web" />
          </>
        ) : null}
      </View>

      {plan.includedCourseCount > 0 || plan.features.length ? (
        <View style={{ marginTop: space[5], gap: space[3] }}>
          {plan.includedCourseCount > 0 ? <Feature text={`${plural(plan.includedCourseCount, "course", "courses")} included`} /> : null}
          {plan.features.map((f) => (
            <Feature key={f} text={f} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Feature({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.feature}>
      <Check size={18} color={colors.primary} style={u.mt2} />
      <Text style={u.flex}>{text}</Text>
    </View>
  );
}

function PlansSkeleton() {
  return (
    <View style={{ marginTop: space[8], gap: space[3] }} accessibilityElementsHidden>
      <Skeleton width="45%" height={26} />
      <Skeleton width="80%" />
      <Skeleton width="35%" height={30} style={{ marginTop: space[2] }} />
      <Skeleton height={52} rounded={10} style={{ marginTop: space[2] }} />
      <Skeleton width="70%" />
      <Skeleton width="60%" />
    </View>
  );
}

const styles = StyleSheet.create({
  current: { flexDirection: "row", alignItems: "center", marginTop: space[5], paddingVertical: space[2], borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  plan: { marginTop: space[8], paddingTop: space[6], borderTopWidth: StyleSheet.hairlineWidth },
  planHead: { flexDirection: "row", alignItems: "center", gap: space[3] },
  feature: { flexDirection: "row", gap: space[3] },
});
