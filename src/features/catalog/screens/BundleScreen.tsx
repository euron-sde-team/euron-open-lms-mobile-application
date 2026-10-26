/**
 * A bundle: its cover, title and description, the courses inside, and the same sticky
 * purchase bar as a course, driven by `bundlePurchase()` (type "BUNDLE" at checkout).
 * Refetches on focus so a purchase made elsewhere shows ownership on return.
 */
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Linking, Share, View } from "react-native";
import { Share2 } from "lucide-react-native";
import { isApiError } from "../../../api/vendor/client/errors";
import type { CourseCard as Course } from "../../../api/vendor/types";
import { qk } from "../../../app/query";
import type { RootScreen } from "../../../app/routes";
import { useSession } from "../../../app/session";
import { config } from "../../../config";
import { joinUrl, safeExternalUrl } from "../../../lib/urls";
import { IconButton } from "../../../ui/components/Button";
import { EmptyState, ErrorState, Skeleton } from "../../../ui/components/Feedback";
import { Header, Screen, Section } from "../../../ui/components/Layout";
import { Cover } from "../../../ui/components/Media";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { space } from "../../../ui/theme/tokens";
import { CourseRow, CourseRowSkeleton } from "../components/CourseCard";
import { PurchaseBar } from "../components/PurchaseBar";
import { money, plural, savingPercent } from "../format";
import { usePurchaseContext, useRefetchOnFocus, useSignedIn, useViewerKey } from "../hooks";
import { bundlePurchase, type PurchaseAction } from "../purchase";
import { u } from "../styles";

export function BundleScreen({ route, navigation }: RootScreen<"Bundle">) {
  const { slug } = route.params;
  const { api, me } = useSession();
  const viewer = useViewerKey();
  const signedIn = useSignedIn();
  const ctx = usePurchaseContext();
  const { colors } = useTheme();
  const [coupon, setCoupon] = useState("");
  const q = useQuery({ queryKey: [...qk.bundle(slug), viewer], queryFn: () => api.catalog.bundle(slug) });
  useRefetchOnFocus(q.refetch);
  const planName = me?.subscription?.grantsAccess ? me.subscription.plan.name : null;

  const b = q.data;
  const view = useMemo(() => (b ? bundlePurchase(b, { ...ctx, signedIn }) : null), [b, ctx, signedIn]);
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Tabs", { screen: "Home" }));
  const share = () => {
    const url = joinUrl(config.webBaseUrl, `bundles/${encodeURIComponent(slug)}`);
    Share.share({ message: b ? `${b.title} ${url}` : url, url, title: b?.title }).catch(() => undefined);
  };
  const header = <Header onBack={back} right={<IconButton label="Share" onPress={share} icon={<Share2 size={21} color={colors.foreground} />} size={44} />} />;
  const open = useCallback((c: Course) => navigation.navigate("Course", { slug: c.slug }), [navigation]);

  const run = (a: PurchaseAction) => {
    if (!b) return;
    if (a.kind === "checkout") navigation.navigate("Checkout", { type: "BUNDLE", id: b.id, ...(coupon.trim() ? { coupon: coupon.trim() } : {}) });
    else if (a.kind === "signIn") navigation.navigate("SignIn", { next: `/bundles/${b.slug}` });
    else if (a.kind === "learning") navigation.navigate("Tabs", { screen: "Learning" });
    else if (a.kind === "plans") navigation.navigate("Plans");
    else if (a.kind === "web") {
      const url = safeExternalUrl(a.url);
      if (url) Linking.openURL(url).catch(() => undefined);
    }
  };

  if (q.isError && !b) {
    return (
      <Screen scroll={false} padded={false}>
        {header}
        {isApiError(q.error) && q.error.status === 404 ? (
          <EmptyState title="This bundle is not available" body="It may have been taken off sale, or the link may be wrong." action={{ label: "Browse courses", onPress: () => navigation.navigate("Tabs", { screen: "Explore" }) }} testID="catalog-bundle-missing" />
        ) : (
          <ErrorState onRetry={() => q.refetch()} />
        )}
      </Screen>
    );
  }
  if (!b || !view) {
    return (
      <Screen scroll={false} padded={false}>
        {header}
        <View style={{ padding: space[4], gap: space[3] }} accessibilityElementsHidden>
          <Skeleton rounded={14} style={{ aspectRatio: 16 / 9, height: undefined }} />
          <Skeleton width="80%" height={26} style={{ marginTop: space[3] }} />
          <Skeleton width="60%" />
          {[0, 1, 2].map((i) => (
            <CourseRowSkeleton key={i} />
          ))}
        </View>
      </Screen>
    );
  }

  const pct = ctx.mode === "in-app" ? savingPercent(b.price, b.separately) : null;
  return (
    <View style={u.flex} testID="catalog-bundle">
      {header}
      <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()} footer={<PurchaseBar view={view} onAction={run} coupon={coupon} onCouponChange={setCoupon} />}>
        <View style={{ paddingTop: space[3] }}>
          <Cover uri={b.coverUrl} label={b.title} seed={b.slug} />
          <Text variant="eyebrow" tone="primary" style={{ marginTop: space[5] }}>Bundle</Text>
          <Text variant="title" accessibilityRole="header" style={{ marginTop: space[1] }} testID="catalog-bundle-title">{b.title}</Text>
          {b.description ? <Text tone="muted" style={{ marginTop: space[2] }}>{b.description}</Text> : null}
          <Text variant="small" tone="muted" style={{ marginTop: space[3] }}>{`${plural(b.courseCount, "course", "courses")}, yours to keep`}</Text>
          {pct && b.separately ? <Text variant="small" tone="success" style={{ marginTop: space[1] }}>{`${money(b.separately, { compact: true })} separately, you save ${pct}%`}</Text> : null}
        </View>
        <Section title="What is included">
          {b.courses.map((c) => (
            <CourseRow key={c.id} course={c} mode={ctx.mode} planName={planName} onPress={open} />
          ))}
        </Section>
      </Screen>
    </View>
  );
}
