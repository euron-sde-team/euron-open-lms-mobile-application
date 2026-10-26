/**
 * One order: its lines, totals with discount and tax, the status timeline, the gateway,
 * refunds with their credit notes, and the invoice PDF (downloaded with the session, shown
 * in a viewer with Share).
 */
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { isApiError } from "../../api/vendor/client/errors";
import type { Invoice, Money, Order } from "../../api/vendor/types";
import { qk } from "../../app/query";
import type { RootScreen } from "../../app/routes";
import { useSession } from "../../app/session";
import { Button } from "../../ui/components/Button";
import { ErrorState, Skeleton } from "../../ui/components/Feedback";
import { Text } from "../../ui/components/Text";
import { useTheme } from "../../ui/theme/ThemeProvider";
import { space } from "../../ui/theme/tokens";
import { GroupLabel, Notice, Page, PdfSheet, SignInPrompt, errorMessage } from "./components";
import { ORDER_STATUS, failureCopy, gatewayName, isPaidStatus, orderTimeline, routeForLine } from "./lib/billing";
import { dateOnly, money } from "./lib/format";
import { downloadInvoice } from "./lib/files";
import { akq } from "./lib/keys";
import { u } from "./styles";

/** Credit notes issued against an order (the invoices list carries the order number). */
export const creditNotesFor = (invoices: Invoice[], order: Pick<Order, "number">) => invoices.filter((i) => i.kind === "CREDIT_NOTE" && i.orderNumber === order.number);

function Line({ label, value, negative, strong }: { label: string; value: Money; negative?: boolean; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <Text variant={strong ? "bodyStrong" : "body"} tone={strong ? "default" : "muted"}>{label}</Text>
      <Text variant={strong ? "bodyStrong" : "body"}>{negative ? `-${money(value)}` : money(value)}</Text>
    </View>
  );
}

export function OrderScreen({ route }: RootScreen<"Order">) {
  const { id } = route.params;
  const { api, status } = useSession();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const signedIn = status === "signedIn";
  const q = useQuery({ queryKey: qk.order(id), queryFn: () => api.checkout.order(id), enabled: signedIn });
  const refunded = (q.data?.refunded.amountMinor ?? 0) > 0;
  const invoices = useQuery({ queryKey: akq.invoices, queryFn: () => api.billing.invoices({ limit: 50 }), enabled: signedIn && refunded });
  const [pdf, setPdf] = useState<{ path: string; title: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  const download = async (inv: { id: string; number: string }) => {
    setBusy(inv.id);
    setDocError(null);
    try {
      setPdf({ path: await downloadInvoice(api, inv), title: `${inv.number}.pdf` });
    } catch (e) {
      setDocError(isApiError(e) && e.code === "INVOICE_RENDERING" ? "The PDF is still being prepared. Try again in a minute." : errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (!signedIn) {
    return (
      <Page title="Order">
        <SignInPrompt title="Sign in to see this order" body="Your receipts and invoices are in your account." />
      </Page>
    );
  }

  if (q.isPending) {
    return (
      <Page title="Order">
        <View style={{ marginTop: space[6], gap: space[3] }} testID="account-order-loading">
          <Skeleton width="50%" height={24} />
          <Skeleton width="70%" />
          <Skeleton height={80} />
        </View>
      </Page>
    );
  }
  if (q.isError) {
    return (
      <Page title="Order">
        <ErrorState message={errorMessage(q.error)} onRetry={() => { q.refetch(); }} />
      </Page>
    );
  }

  const o = q.data;
  const st = ORDER_STATUS[o.status];
  const notes = invoices.data ? creditNotesFor(invoices.data.items, o) : [];
  return (
    <Page title={`Order ${o.number}`} refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} testID="account-order-screen">
      <Text variant="title" style={{ marginTop: space[6] }}>{`Order ${o.number}`}</Text>
      <Text variant="bodyStrong" tone={st.tone === "default" ? "default" : st.tone === "muted" ? "muted" : st.tone} style={u.mt4} testID="account-order-status">{st.label}</Text>
      <Text variant="small" tone="muted" style={u.mt2}>
        {[o.kind === "SUBSCRIPTION" ? "Subscription" : null, o.gateway !== "FREE" ? `via ${gatewayName(o.gateway)}` : "No payment needed"].filter(Boolean).join(" · ")}
      </Text>
      {o.status === "FAILED" || o.status === "EXPIRED" ? <Notice tone="danger" body={failureCopy(o.failureReason)} /> : null}
      {o.status === "PENDING" ? (
        <Notice body="This order is waiting for payment.">
          <Button label="Check its status" variant="ghost" size="sm" style={[u.start, { marginTop: space[2] }]} onPress={() => navigation.navigate("CheckoutResult", { orderId: o.id })} />
        </Notice>
      ) : null}

      <GroupLabel>Items</GroupLabel>
      {o.lines.map((l, i) => {
        const r = routeForLine(l);
        return (
          <Pressable
            key={`${l.type}:${l.id}`}
            disabled={!r}
            accessibilityRole={r ? "link" : undefined}
            onPress={() => r && (navigation.navigate as (n: string, p?: object) => void)(r.name, r.params)}
            style={[styles.item, i < o.lines.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
          >
            <View style={u.flex}>
              <Text variant="bodyStrong">{l.title}</Text>
              <Text variant="small" tone="muted">{l.type === "COURSE" ? "Course" : l.type === "BUNDLE" ? "Bundle" : "Plan"}</Text>
            </View>
            <Text>{money(l.unit)}</Text>
          </Pressable>
        );
      })}

      <View style={{ marginTop: space[4], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: space[3] }}>
        <Line label="Subtotal" value={o.subtotal} />
        {o.discount.amountMinor > 0 ? <Line label={o.couponCode ? `Discount (${o.couponCode})` : "Discount"} value={o.discount} negative /> : null}
        {o.tax.amountMinor > 0 ? <Line label={o.taxLabel ?? "Tax"} value={o.tax} /> : null}
        <Line label="Total" value={o.total} strong />
        {refunded ? <Line label="Refunded" value={o.refunded} negative /> : null}
      </View>

      <GroupLabel>History</GroupLabel>
      {orderTimeline(o).map((s, i) => (
        <View key={`${s.label}:${i}`} style={styles.step} testID="account-order-step">
          <View style={[styles.stepDot, { backgroundColor: s.tone === "success" ? colors.success : s.tone === "danger" ? colors.danger : s.tone === "warning" ? colors.warning : s.tone === "primary" ? colors.primary : colors.subtleForeground }]} />
          <Text style={u.flex}>{s.label}</Text>
          {s.at ? <Text variant="small" tone="muted">{dateOnly(s.at)}</Text> : null}
        </View>
      ))}

      {isPaidStatus(o.status) ? (
        <>
          <GroupLabel>Documents</GroupLabel>
          {docError ? <Notice tone="warning" body={docError} /> : null}
          {o.invoice ? (
            <View style={styles.item}>
              <Text style={u.flex}>{`Invoice ${o.invoice.number}`}</Text>
              {o.invoice.ready ? (
                <Button label="View PDF" variant="ghost" size="sm" loading={busy === o.invoice.id} onPress={() => { download(o.invoice!); }} testID="account-order-invoice" />
              ) : (
                <Text variant="small" tone="muted">Being prepared</Text>
              )}
            </View>
          ) : (
            <Text tone="muted" style={{ paddingVertical: space[3] }}>No invoice for this order.</Text>
          )}
          {notes.map((n) => (
            <View key={n.id} style={styles.item}>
              <Text style={u.flex}>{`Credit note ${n.number} · ${money(n.total)} · ${dateOnly(n.issuedAt)}`}</Text>
              {n.ready ? <Button label="View PDF" variant="ghost" size="sm" loading={busy === n.id} onPress={() => { download(n); }} /> : <Text variant="small" tone="muted">Being prepared</Text>}
            </View>
          ))}
        </>
      ) : null}
      <PdfSheet path={pdf?.path ?? null} title={pdf?.title ?? "Invoice"} onClose={() => setPdf(null)} />
    </Page>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  item: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[3], minHeight: 52 },
  step: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[2] },
  stepDot: { width: 8, height: 8, borderRadius: 4 },
});
