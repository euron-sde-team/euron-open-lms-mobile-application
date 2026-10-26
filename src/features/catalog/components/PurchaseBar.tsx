/**
 * The sticky bar at the foot of the course and bundle pages, rendered from a PurchaseView
 * (purchase.ts): the price, progress or a one-line note on the left, the one action on
 * the right, a quiet secondary link and the "Have a coupon?" field under it. It never
 * decides what to offer; it only draws what the pure function returned.
 */
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button } from "../../../ui/components/Button";
import { Field } from "../../../ui/components/Inputs";
import { Text } from "../../../ui/components/Text";
import { space } from "../../../ui/theme/tokens";
import type { PurchaseAction, PurchaseView } from "../purchase";
import { PriceTag } from "./CourseCard";

export function PurchaseBar({ view, onAction, busy, error, coupon, onCouponChange }: {
  view: PurchaseView;
  onAction: (a: PurchaseAction) => void;
  busy?: boolean;
  error?: string | null;
  coupon: string;
  onCouponChange: (v: string) => void;
}) {
  const [couponOpen, setCouponOpen] = useState(!!coupon);
  const p = view.primary;
  const left = view.progressPercent !== null ? (
    <Text variant="bodyStrong">{view.progressPercent >= 100 ? "Completed" : `${Math.round(view.progressPercent)}% complete`}</Text>
  ) : view.price ? (
    <PriceTag price={view.price} compareAt={view.compareAt} size="md" />
  ) : view.note ? (
    <Text variant="small" tone="muted" numberOfLines={3} testID="catalog-cta-note">{view.note}</Text>
  ) : null;
  const wide = !view.price && view.progressPercent === null;

  return (
    <View testID="catalog-purchase-bar">
      <View style={[styles.row, wide && p ? styles.stack : null]}>
        {left ? <View style={wide && p ? null : styles.left}>{left}</View> : null}
        {p ? (
          <Button
            label={p.label}
            variant={p.kind === "web" ? "outline" : "primary"}
            onPress={() => onAction(p)}
            loading={busy}
            block={wide}
            testID={p.testID}
            style={wide ? undefined : styles.action}
          />
        ) : null}
      </View>
      {view.price && view.note ? <Text variant="caption" tone="muted" style={{ marginTop: space[2] }}>{view.note}</Text> : null}
      {view.secondary || view.allowCoupon ? (
        <View style={styles.links}>
          {view.secondary ? (
            <Pressable accessibilityRole="link" hitSlop={10} onPress={() => onAction(view.secondary!)} testID={view.secondary.testID}>
              <Text variant="smallStrong" tone="link">{view.secondary.label}</Text>
            </Pressable>
          ) : <View />}
          {view.allowCoupon && !couponOpen ? (
            <Pressable accessibilityRole="button" hitSlop={10} onPress={() => setCouponOpen(true)} testID="catalog-coupon-toggle">
              <Text variant="smallStrong" tone="link">Have a coupon?</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {view.allowCoupon && couponOpen ? (
        <View style={{ marginTop: space[3] }}>
          <Field label="Coupon code" value={coupon} onChangeText={(t) => onCouponChange(t.toUpperCase().replace(/\s+/g, ""))} autoCapitalize="characters" autoCorrect={false} maxLength={40} hint="Applied at checkout." testID="catalog-coupon-field" />
        </View>
      ) : null}
      {error ? <Text variant="small" tone="danger" style={{ marginTop: space[2] }} accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space[4] },
  stack: { flexDirection: "column", alignItems: "stretch", gap: space[2] },
  left: { flex: 1 },
  action: { flexShrink: 0, minWidth: 140 },
  links: { flexDirection: "row", justifyContent: "space-between", marginTop: space[2], minHeight: 24, alignItems: "center" },
});
