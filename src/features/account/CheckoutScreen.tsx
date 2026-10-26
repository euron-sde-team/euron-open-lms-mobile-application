/**
 * Checkout, Android only (iOS never sells in the app: opened there it shows nothing
 * purchasable and goes back). The server prices everything: the screen asks for a quote
 * (lines, discount, tax, total in the currency the server will charge), lets the buyer
 * add a coupon and billing details, then starts checkout with an idempotency key reused
 * for the same request and hands off to the gateway: free orders go straight to the
 * result, Razorpay opens its native sheet (or, against the local stubs, the stub page in a
 * WebView), Stripe opens in a Custom Tab that closes on the app's return link.
 */
import { useNavigation } from "@react-navigation/native";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { InAppBrowser } from "react-native-inappbrowser-reborn";
import { WebView } from "react-native-webview";
import { Lock } from "lucide-react-native";
import { isApiError } from "../../api/vendor/client/errors";
import type { BillingInterval, CheckoutQuote, CheckoutQuoteRequest } from "../../api/vendor/types";
import { purchaseMode, useMeta } from "../../app/meta";
import type { RootParams, RootScreen } from "../../app/routes";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSession } from "../../app/session";
import { config } from "../../config";
import { deviceLocale } from "../../lib/push";
import { AccountSheet } from "../../ui/components/AccountSheet";
import { Button } from "../../ui/components/Button";
import { Skeleton } from "../../ui/components/Feedback";
import { ChoiceList, Field, Tabs } from "../../ui/components/Inputs";
import { Text } from "../../ui/components/Text";
import { useTheme } from "../../ui/theme/ThemeProvider";
import { space } from "../../ui/theme/tokens";
import { GroupLabel, Notice, Page, SignInPrompt, errorMessage } from "./components";
import {
  COUNTRIES,
  billingFor,
  checkoutCurrency,
  checkoutProblem,
  clearIdempotencyKey,
  countryName,
  couponView,
  gatewayLine,
  guessCountry,
  idempotencyKeyFor,
  normaliseCoupon,
  payLabel,
  recurringNote,
  requestFingerprint,
  runHandoff,
  stripeReturnUrl,
  taxLineLabel,
  type CheckoutItem,
  type CheckoutProblem,
  type RazorpaySuccess,
  type StubReturn,
  parseRazorpayReturn,
} from "./lib/checkout";
import { money, toHex } from "./lib/format";
import { akq } from "./lib/keys";
import { u } from "./styles";

/**
 * The Razorpay SDK is linked on Android only (react-native.config.js), and the package
 * creates a native event emitter as soon as it is imported, so it is loaded at the moment
 * of payment, never at module load: importing it on iOS would crash the app.
 */
function loadRazorpay(): { open: (options: object) => Promise<unknown> } {
  return require("react-native-razorpay").default;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

type PayState = { kind: "idle" } | { kind: "starting" } | { kind: "confirming" } | { kind: "dismissed" } | { kind: "failed"; message: string };

export function CheckoutScreen({ route }: RootScreen<"Checkout">) {
  const meta = useMeta();
  const navigation = useNavigation();
  const { status, me } = useSession();
  const inApp = purchaseMode(meta.data) === "in-app";

  useEffect(() => {
    if (!inApp && navigation.canGoBack()) navigation.goBack();
  }, [inApp, navigation]);

  if (!inApp) return <Page title="Checkout"><View /></Page>;
  if (status !== "signedIn" || !me) {
    return (
      <Page title="Checkout">
        <SignInPrompt title="Sign in to continue" body="Your purchase is added to your account, so you can learn on any device." />
      </Page>
    );
  }
  const currency = checkoutCurrency(meta.data, me);
  if (!currency) return <Page title="Checkout"><SummarySkeleton /></Page>;
  const params = route.params as typeof route.params & { interval?: BillingInterval };
  const item: CheckoutItem = { type: params.type, id: params.id, ...(params.type === "PLAN" ? { interval: params.interval === "YEAR" ? "YEAR" : "MONTH" } : {}) };
  return <Checkout key={`${item.type}:${item.id}`} item={item} currency={currency} initialCoupon={normaliseCoupon(params.coupon) || null} />;
}

export function Checkout({ item: initialItem, currency, initialCoupon }: { item: CheckoutItem; currency: string; initialCoupon: string | null }) {
  const { api, me } = useSession();
  const meta = useMeta();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootParams>>();
  const [item, setItem] = useState(initialItem);
  const [name, setName] = useState(me?.certificateName || me?.displayName || "");
  const [country, setCountry] = useState(() => guessCountry(currency, deviceLocale()));
  const [taxId, setTaxId] = useState("");
  const [couponCode, setCouponCode] = useState<string | null>(initialCoupon);
  const [pay, setPay] = useState<PayState>({ kind: "idle" });
  const [startProblem, setStartProblem] = useState<CheckoutProblem | null>(null);
  const [countryOpen, setCountryOpen] = useState(false);
  const [stub, setStub] = useState<{ url: string; resolve: (r: StubReturn) => void} | null>(null);

  const billing = billingFor({ name, country, taxId });
  const billingKey = JSON.stringify(billing ?? null);
  const settledKey = useDebounced(billingKey, 400);
  const settledBilling = useMemo(() => JSON.parse(settledKey) as CheckoutQuoteRequest["billing"] | null, [settledKey]);

  const request: CheckoutQuoteRequest = useMemo(
    () => ({ item: { type: item.type, id: item.id, ...(item.interval ? { interval: item.interval } : {}) }, currency, ...(couponCode ? { couponCode } : {}), ...(settledBilling ? { billing: settledBilling } : {}) }),
    [item, currency, couponCode, settledBilling]
  );
  const quote = useQuery({ queryKey: akq.quote(request), queryFn: () => api.checkout.quote(request), placeholderData: keepPreviousData, retry: false });
  const plans = useQuery({ queryKey: ["billing", "plans", currency], queryFn: () => api.checkout.plans(currency), enabled: item.type === "PLAN" });
  const intervals = useMemo(() => {
    const plan = plans.data?.find((p) => p.id === item.id);
    const set = new Set(plan?.prices.map((p) => p.interval) ?? []);
    return (["MONTH", "YEAR"] as const).filter((i) => set.has(i));
  }, [plans.data, item.id]);

  const q: CheckoutQuote | undefined = quote.data;
  const quoteProblem = quote.isError ? checkoutProblem(quote.error) : q?.alreadyOwned ? checkoutProblem("ALREADY_OWNED") : null;
  const problem = startProblem ?? quoteProblem;
  const settling = billingKey !== settledKey || quote.isFetching;
  const busy = pay.kind === "starting" || pay.kind === "confirming";

  const openStubPage = (url: string) => new Promise<StubReturn>((resolve) => setStub({ url, resolve }));
  const closeStub = (r: StubReturn) => {
    stub?.resolve(r);
    setStub(null);
  };

  const onPay = async () => {
    if (!q || !billing) return;
    setStartProblem(null);
    setPay({ kind: "starting" });
    const body: CheckoutQuoteRequest = { ...request, billing };
    if (!(q.coupon && couponCode)) delete body.couponCode;
    const fp = requestFingerprint(body);
    const extra = q.gateway === "STRIPE" ? { returnUrl: stripeReturnUrl(config.webBaseUrl, config.scheme) } : {};
    const start = (key: string) => api.checkout.start({ ...body, ...extra, idempotencyKey: key });
    try {
      let handoff;
      try {
        handoff = await start(idempotencyKeyFor(item, fp));
      } catch (e) {
        // The order this key made has closed: start a new one, once.
        if (isApiError(e) && (e.code === "CHECKOUT_CLOSED" || e.code === "CHECKOUT_EXPIRED")) {
          clearIdempotencyKey(item);
          handoff = await start(idempotencyKeyFor(item, fp));
        } else throw e;
      }
      const outcome = await runHandoff(handoff, {
        openRazorpay: (options) => loadRazorpay().open(options) as unknown as Promise<RazorpaySuccess>,
        openStubPage,
        openRedirect: async (url, returnPrefix) => {
          const r = await InAppBrowser.openAuth(url, returnPrefix, { showTitle: true, toolbarColor: toHex(colors.background), enableUrlBarHiding: true, enableDefaultShare: false, ephemeralWebSession: false });
          return r.type === "success" ? r.url : null;
        },
        confirm: (b) => api.checkout.razorpayConfirm(b),
        syncOrder: (id) => api.checkout.order(id, { sync: true }),
        cancelOrder: (id) => api.checkout.cancelOrder(id),
        scheme: config.scheme,
        academyName: meta.data?.academyName ?? "",
        brandHex: toHex(colors.primary),
        onConfirming: () => setPay({ kind: "confirming" }),
      });
      if (outcome.kind === "result" || outcome.kind === "confirm-error") {
        clearIdempotencyKey(item);
        setPay({ kind: "idle" });
        // A Stripe return link may also have arrived through the deep-link path; do not stack two results.
        const state = navigation.getState();
        const top = state?.routes[state.routes.length - 1];
        if (top?.name === "CheckoutResult") return;
        navigation.replace("CheckoutResult", { orderId: outcome.orderId });
      } else if (outcome.kind === "dismissed") setPay({ kind: "dismissed" });
      else setPay({ kind: "failed", message: outcome.message });
    } catch (e) {
      const p = checkoutProblem(e);
      if (p) {
        setStartProblem(p);
        setPay({ kind: "idle" });
      } else setPay({ kind: "failed", message: errorMessage(e) });
    }
  };

  const followProblem = (p: CheckoutProblem) => {
    if (!p.link) return;
    if (p.link.route === "Back") navigation.goBack();
    else if (p.link.route === "Learning") navigation.navigate("Tabs", { screen: "Learning" });
    else navigation.navigate(p.link.route);
  };

  return (
    <Page
      title="Checkout"
      testID="account-checkout-screen"
      footer={
        <View>
          {pay.kind === "dismissed" ? <Text variant="small" tone="muted" style={styles.payNote} testID="account-checkout-dismissed">Payment not completed. You were not charged.</Text> : null}
          {pay.kind === "failed" ? <Text variant="small" tone="danger" style={styles.payNote} testID="account-checkout-failed">{pay.message}</Text> : null}
          {pay.kind === "confirming" ? <Text variant="small" tone="muted" style={styles.payNote}>Confirming your payment</Text> : null}
          <Button label={q ? payLabel(q) : "Pay"} size="lg" block loading={busy} disabled={!q || !billing || settling || !!quoteProblem || q.alreadyOwned} onPress={() => { onPay(); }} testID="account-checkout-pay" />
          {!billing ? <Text variant="caption" tone="muted" style={{ marginTop: space[2] }}>Add your name and country to continue.</Text> : null}
        </View>
      }
    >
      {problem ? (
        <Notice title={problem.title} body={problem.body} testID={`account-checkout-problem-${problem.code}`}>
          {problem.link ? <Button label={problem.link.label} variant="ghost" size="sm" style={[u.start, { marginTop: space[2] }]} onPress={() => followProblem(problem)} /> : null}
        </Notice>
      ) : null}

      {item.type === "PLAN" && intervals.length > 1 ? (
        <View style={{ marginTop: space[4] }}>
          <Tabs value={item.interval ?? "MONTH"} onChange={(v) => setItem((x) => ({ ...x, interval: v }))} items={[{ value: "MONTH", label: "Monthly" }, { value: "YEAR", label: "Yearly" }]} testID="account-checkout-interval" />
        </View>
      ) : null}

      {q ? <Summary quote={q} item={item} couponCode={couponCode} onCoupon={setCouponCode} updating={quote.isFetching} /> : quote.isError ? <Text tone="muted" style={{ marginTop: space[6] }}>The summary appears once this item can be priced.</Text> : <SummarySkeleton />}

      <GroupLabel>Billing details</GroupLabel>
      <Text variant="small" tone="muted" style={{ marginBottom: space[3] }}>Printed on your receipt. Your country decides the tax.</Text>
      <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" maxLength={120} testID="account-checkout-name" />
      <Text variant="smallStrong" style={u.mb6}>Country</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Country, ${country ? countryName(country) : "not chosen"}`}
        onPress={() => setCountryOpen(true)}
        testID="account-checkout-country"
        style={[styles.select, { borderColor: colors.input, backgroundColor: colors.card }]}
      >
        <Text tone={country ? "default" : "subtle"}>{country ? countryName(country) : "Choose a country"}</Text>
      </Pressable>
      <Field label="Tax ID (optional)" value={taxId} onChangeText={setTaxId} hint="GSTIN, VAT or similar, for a business receipt" autoCapitalize="characters" autoCorrect={false} maxLength={40} testID="account-checkout-tax-id" />

      <View style={styles.gateway}>
        <Lock size={15} color={colors.mutedForeground} />
        <Text variant="small" tone="muted" testID="account-checkout-gateway">{q ? gatewayLine(q.gateway) : "Secure payment"}</Text>
      </View>
      <Text variant="caption" tone="subtle" style={{ marginTop: space[2] }}>
        {`Prices are set by ${meta.data?.academyName ?? "the academy"} and cannot change on the payment page. ${item.type === "PLAN" ? "You can cancel the plan any time from your account." : "Your receipt arrives by email and stays in your orders."}`}
      </Text>

      <AccountSheet visible={countryOpen} title="Country" onClose={() => setCountryOpen(false)}>
        <ChoiceList
          options={COUNTRIES.map(([value, label]) => ({ value, label }))}
          selected={country ? [country] : []}
          onToggle={(c) => {
            setCountry(c);
            setCountryOpen(false);
          }}
        />
      </AccountSheet>

      <AccountSheet visible={!!stub} title="Test payment" onClose={() => closeStub({ kind: "canceled" })} scroll={false} full testID="account-checkout-stub">
        {stub ? (
          <WebView
            source={{ uri: stub.url }}
            originWhitelist={["http://*", "https://*", `${config.scheme}://*`]}
            onShouldStartLoadWithRequest={(req) => {
              if (req.url.startsWith(`${config.scheme}://checkout/razorpay`)) {
                closeStub(parseRazorpayReturn(req.url));
                return false;
              }
              return /^https?:\/\//.test(req.url);
            }}
            incognito
            sharedCookiesEnabled={false}
          />
        ) : null}
      </AccountSheet>
    </Page>
  );
}

function Summary({ quote, item, couponCode, onCoupon, updating }: { quote: CheckoutQuote; item: CheckoutItem; couponCode: string | null; onCoupon: (c: string | null) => void; updating: boolean }) {
  const { colors } = useTheme();
  const title = quote.lines[0]?.title ?? (item.type === "PLAN" ? "Plan" : item.type === "BUNDLE" ? "Bundle" : "Course");
  const kind = item.type === "PLAN" ? `Plan, billed ${item.interval === "YEAR" ? "yearly" : "monthly"}` : item.type === "BUNDLE" ? "Bundle" : "Course";
  const tax = taxLineLabel(quote);
  const note = recurringNote(quote);
  const hair = { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border };
  return (
    <View style={[{ marginTop: space[6] }, updating ? u.soft : u.opaque]} testID="account-checkout-summary" accessibilityState={{ busy: updating }}>
      <Text variant="eyebrow" tone="muted">Order summary</Text>
      <Text variant="heading" style={{ marginTop: space[2] }} testID="account-checkout-title">{title}</Text>
      <Text variant="small" tone="muted">{kind}</Text>
      {quote.lines.length > 1 ? (
        <View style={[{ marginTop: space[3] }, hair]}>
          {quote.lines.map((l) => (
            <View key={`${l.type}:${l.id}`} style={styles.line}>
              <Text style={u.flex} numberOfLines={1}>{l.title}</Text>
              <Text>{money(l.unit)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={[{ marginTop: space[3], paddingTop: space[2] }, hair]}>
        <View style={styles.line}>
          <Text tone="muted">Subtotal</Text>
          <Text testID="account-checkout-subtotal">{money(quote.subtotal)}</Text>
        </View>
        {quote.discount.amountMinor > 0 ? (
          <View style={styles.line}>
            <Text tone="muted">{quote.coupon ? `Discount (${quote.coupon.code})` : "Discount"}</Text>
            <Text testID="account-checkout-discount">{`-${money(quote.discount)}`}</Text>
          </View>
        ) : null}
        {tax ? (
          <View style={styles.line}>
            <Text tone="muted">{tax}</Text>
            <Text testID="account-checkout-tax">{money(quote.tax)}</Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.line, { marginTop: space[2], paddingTop: space[3] }, hair]}>
        <Text variant="bodyStrong">{quote.recurring?.trialDays ? "Total today" : "Total"}</Text>
        <Text variant="title" testID="account-checkout-total" accessibilityLiveRegion="polite">{money(quote.total)}</Text>
      </View>
      {note ? <Text variant="small" tone="muted" style={{ marginTop: space[2] }}>{note}</Text> : null}
      <CouponRow quote={quote} couponCode={couponCode} onCoupon={onCoupon} updating={updating} />
    </View>
  );
}

/** "Have a coupon?" opens a field; an applied code reads "CODE · 20% off · Remove". */
function CouponRow({ quote, couponCode, onCoupon, updating }: { quote: CheckoutQuote; couponCode: string | null; onCoupon: (c: string | null) => void; updating: boolean }) {
  const view = couponView(quote, couponCode);
  const [open, setOpen] = useState(!!couponCode);
  const [text, setText] = useState(couponCode ?? "");
  if (view.state === "applied") {
    return (
      <View style={[styles.couponRow]} testID="account-checkout-coupon-applied">
        <Text variant="bodyStrong" style={u.flex}>{view.label}</Text>
        <Pressable accessibilityRole="button" onPress={() => { onCoupon(null); setText(""); setOpen(false); }} hitSlop={8} style={styles.link} testID="account-checkout-coupon-remove">
          <Text variant="smallStrong" tone="link">Remove</Text>
        </Pressable>
      </View>
    );
  }
  if (!open) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={[styles.couponRow, styles.link]} testID="account-checkout-coupon-open">
        <Text variant="smallStrong" tone="link">Have a coupon?</Text>
      </Pressable>
    );
  }
  const code = normaliseCoupon(text);
  const apply = () => {
    if (!code) return;
    onCoupon(code);
  };
  return (
    <View style={{ marginTop: space[4] }}>
      <Field
        label="Coupon code"
        value={text}
        onChangeText={setText}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={40}
        returnKeyType="done"
        onSubmitEditing={apply}
        error={view.state === "error" && view.code === code ? view.message : null}
        testID="account-checkout-coupon-input"
      />
      <View style={[u.row, { gap: space[3] }]}>
        <Button label="Apply" variant="outline" size="sm" disabled={!code} loading={updating && couponCode === code} onPress={apply} testID="account-checkout-coupon-apply" />
        <Button label="Cancel" variant="ghost" size="sm" onPress={() => { setOpen(false); setText(""); if (couponCode) onCoupon(null); }} />
      </View>
    </View>
  );
}

function SummarySkeleton() {
  return (
    <View style={{ marginTop: space[6], gap: space[3] }} testID="account-checkout-loading">
      <Skeleton width="40%" height={12} />
      <Skeleton width="80%" height={22} />
      <Skeleton height={14} />
      <Skeleton height={14} />
      <Skeleton width="50%" height={28} />
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space[3], paddingVertical: 4 },
  couponRow: { flexDirection: "row", alignItems: "center", marginTop: space[4] },
  link: { minHeight: 44, justifyContent: "center" },
  select: { minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, justifyContent: "center", marginBottom: space[4] },
  gateway: { flexDirection: "row", alignItems: "center", gap: space[2], marginTop: space[6] },
  payNote: { marginBottom: space[2] },
});
