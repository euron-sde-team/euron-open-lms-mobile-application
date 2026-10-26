/**
 * Review pieces shared by the course page and the Reviews screen: the rating summary
 * (average, stars, distribution bars), one review row with the instructor's reply, the
 * five-star input and the report sheet. Reasons and copy match the web app.
 */
import { useMutation } from "@tanstack/react-query";
import { memo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Star } from "lucide-react-native";
import type { CourseDetail, ReportReason, Review } from "../../../api/vendor/types";
import { isApiError } from "../../../api/vendor/client/errors";
import { useApi } from "../../../app/session";
import { Button } from "../../../ui/components/Button";
import { ChoiceList, Field } from "../../../ui/components/Inputs";
import { Avatar } from "../../../ui/components/Media";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { space } from "../../../ui/theme/tokens";
import { breakdownPercents, plural, timeAgo } from "../format";
import { Sheet } from "./Sheet";
import { u } from "../styles";

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stars} accessibilityLabel={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value >= n - 0.25;
        return <Star key={n} size={size} color={on ? colors.star : colors.input} fill={on ? colors.star : "transparent"} />;
      })}
    </View>
  );
}

export function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.starInput} accessibilityRole="adjustable" accessibilityLabel="Your rating" accessibilityValue={{ min: 0, max: 5, now: value }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value >= n;
        return (
          <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} ${n === 1 ? "star" : "stars"}`} accessibilityState={{ selected: on }} onPress={() => onChange(n)} hitSlop={4} style={styles.starBtn} testID={`catalog-review-star-${n}`}>
            <Star size={30} color={on ? colors.star : colors.input} fill={on ? colors.star : "transparent"} />
          </Pressable>
        );
      })}
    </View>
  );
}

export function RatingSummary({ rating, breakdown }: { rating: NonNullable<CourseDetail["rating"]>; breakdown: CourseDetail["ratingBreakdown"] }) {
  const { colors } = useTheme();
  return (
    <View style={styles.summary} testID="catalog-rating-summary">
      <View style={styles.avg}>
        <Text variant="hero">{rating.average.toFixed(1)}</Text>
        <Stars value={rating.average} />
        <Text variant="caption" tone="muted" style={u.mt4}>{plural(rating.count, "rating", "ratings")}</Text>
      </View>
      <View style={u.flexGap6}>
        {breakdownPercents(breakdown).map((r) => (
          <View key={r.stars} style={styles.barRow} accessible accessibilityLabel={`${r.stars} stars: ${r.percent}%`}>
            <Text variant="caption" tone="muted" style={styles.barLabel}>{`${r.stars} star`}</Text>
            <View style={[styles.track, { backgroundColor: colors.muted }]}>
              <View style={[u.fullHeight, { width: `${r.percent}%`, backgroundColor: colors.star }]} />
            </View>
            <Text variant="caption" tone="muted" style={styles.barPct}>{`${r.percent}%`}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export const ReviewItem = memo(function ReviewItemImpl({ review, canReport, onReport, last }: { review: Review; canReport: boolean; onReport?: (r: Review) => void; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.review, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]} testID="catalog-review">
      <View style={styles.author}>
        <Avatar uri={review.author.avatarUrl} name={review.author.displayName} size={36} />
        <View style={u.flex}>
          <Text variant="smallStrong" numberOfLines={1}>{review.author.displayName}</Text>
          <View style={styles.authorMeta}>
            <Stars value={review.rating} size={12} />
            <Text variant="caption" tone="subtle">{timeAgo(review.createdAt)}</Text>
          </View>
        </View>
      </View>
      {review.body ? <Text style={{ marginTop: space[3] }}>{review.body}</Text> : null}
      {review.reply ? (
        <View style={[styles.reply, { borderLeftColor: colors.border }]}>
          <Text variant="smallStrong">{`${review.reply.by?.displayName ?? "The instructor"} replied`}</Text>
          <Text variant="small" tone="muted" style={u.mt2}>{review.reply.body}</Text>
        </View>
      ) : null}
      {canReport && !review.mine && onReport ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Report review by ${review.author.displayName}`} hitSlop={12} onPress={() => onReport(review)} style={styles.report} testID="catalog-review-report">
          <Text variant="caption" tone="subtle">Report</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "SPAM", label: "Spam or advertising" },
  { value: "HARASSMENT", label: "Harassment" },
  { value: "OFF_TOPIC", label: "Off topic" },
  { value: "SPOILER", label: "Gives away quiz or assignment answers" },
  { value: "INAPPROPRIATE", label: "Inappropriate" },
  { value: "OTHER", label: "Something else" },
];

export function ReportSheet({ review, onClose }: { review: Review | null; onClose: () => void }) {
  const api = useApi();
  const [reason, setReason] = useState<ReportReason>("SPAM");
  const [note, setNote] = useState("");
  const report = useMutation({
    mutationFn: (r: Review) => api.community.report({ targetType: "REVIEW", targetId: r.id, reason, note: note.trim() || null }),
    onSuccess: () => {
      setNote("");
      onClose();
      Alert.alert("Report sent", "Thanks. A moderator will take a look.");
    },
  });
  const error = report.error ? (isApiError(report.error) && report.error.code === "TARGET_NOT_FOUND" ? "This review was already removed." : isApiError(report.error) && report.error.code === "CANNOT_REPORT_OWN" ? "You cannot report your own review." : "The report did not send. Try again.") : null;
  return (
    <Sheet
      visible={!!review}
      title="Report this review"
      onClose={onClose}
      testID="catalog-report-sheet"
      footer={
        <>
          <Button label="Cancel" variant="ghost" onPress={onClose} style={u.flex} />
          <Button label="Send report" onPress={() => review && report.mutate(review)} loading={report.isPending} style={u.flex} testID="catalog-report-submit" />
        </>
      }
    >
      <ChoiceList options={REPORT_REASONS} selected={[reason]} onToggle={setReason} />
      <View style={{ marginTop: space[4] }}>
        <Field label="Anything else (optional)" value={note} onChangeText={setNote} multiline maxLength={1000} />
      </View>
      {error ? <Text variant="small" tone="danger">{error}</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: "row", gap: 2 },
  starInput: { flexDirection: "row", gap: space[1] },
  starBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  summary: { flexDirection: "row", gap: space[6], alignItems: "center" },
  avg: { alignItems: "flex-start" },
  barRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  barLabel: { width: 42 },
  barPct: { width: 36, textAlign: "right" },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  review: { paddingVertical: space[5] },
  author: { flexDirection: "row", alignItems: "center", gap: space[3] },
  authorMeta: { flexDirection: "row", alignItems: "center", gap: space[2], marginTop: 2 },
  reply: { marginTop: space[3], marginLeft: space[2], paddingLeft: space[3], borderLeftWidth: 2 },
  report: { marginTop: space[3], alignSelf: "flex-start", minHeight: 24, justifyContent: "center" },
});
