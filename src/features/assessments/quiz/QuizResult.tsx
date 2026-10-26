/**
 * An attempt's result: score, pass or not, attempts left, and the per-question review
 * only when the quiz's reveal policy allows it (the API decides and says `revealed`).
 */
import { StyleSheet, View } from "react-native";
import { Check, X } from "lucide-react-native";
import type { AttemptQuestion, QuizAttempt, QuizOverview, QuizResult as Result } from "../../../api/vendor/types";
import { Button } from "../../../ui/components/Button";
import { Html } from "../../../ui/components/Html";
import { Row } from "../../../ui/components/Layout";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { fonts, space } from "../../../ui/theme/tokens";
import { plural } from "../shared";

export interface QuizResultProps {
  attempt: QuizAttempt;
  quiz: QuizOverview;
  /** Attempts left after this one (null = unlimited). */
  left: number | null;
  canRetake: boolean;
  retaking: boolean;
  notice: string | null;
  certificateSerial: string | null;
  onRetake: () => void;
  onBackToCourse: () => void;
  onBackToQuiz: () => void;
  onOpenCertificate: (serial: string) => void;
}

export function QuizResultView({ attempt, quiz, left, canRetake, retaking, notice, certificateSerial, onRetake, onBackToCourse, onBackToQuiz, onOpenCertificate }: QuizResultProps) {
  const r = attempt.result;
  return (
    <View testID="quiz-result" accessibilityLiveRegion="polite" style={{ marginTop: space[5] }}>
      {notice ? <Text variant="small" tone="muted" style={{ marginBottom: space[3] }} testID="quiz-notice">{notice}</Text> : null}
      <Text variant="eyebrow" tone="primary">{`Attempt ${attempt.number} result`}</Text>
      {r ? (
        <>
          <View style={styles.score}>
            <Text variant="hero" style={styles.big}>{`${Math.round(r.percent)}%`}</Text>
            <Text variant="subheading" tone={r.passed ? "success" : "muted"} testID="quiz-result-status">{r.passed ? "Passed" : "Not passed"}</Text>
          </View>
          <Text variant="small" tone="muted" style={{ marginTop: space[2] }}>
            {`${r.scorePoints} of ${plural(r.maxPoints, "point", "points")} · Pass mark ${quiz.passPercent}%`}
            {left !== null ? ` · ${left === 0 ? "No attempts left" : plural(left, "attempt", "attempts") + " left"}` : ""}
          </Text>
        </>
      ) : (
        <Text variant="bodyStrong" style={{ marginTop: space[3] }}>This attempt ended without a score.</Text>
      )}

      {certificateSerial ? (
        <View style={{ marginTop: space[5] }}>
          <Row label="Your certificate is ready" detail="You finished the course." onPress={() => onOpenCertificate(certificateSerial)} testID="quiz-certificate" last />
        </View>
      ) : null}

      {/* One lit action: back to the course after a pass, another try after a fail. */}
      <View style={styles.actions}>
        {canRetake && !r?.passed ? (
          <Button label="Retake quiz" size="lg" block onPress={onRetake} loading={retaking} testID="quiz-retake" />
        ) : (
          <Button label="Back to course" size="lg" block onPress={onBackToCourse} testID="quiz-back-to-course" />
        )}
        <View style={styles.secondary}>
          {canRetake && !r?.passed ? <Button label="Back to course" variant="ghost" onPress={onBackToCourse} testID="quiz-back-to-course" /> : null}
          {canRetake && r?.passed ? <Button label="Retake quiz" variant="ghost" onPress={onRetake} loading={retaking} testID="quiz-retake" /> : null}
          <Button label="Quiz details" variant="ghost" onPress={onBackToQuiz} testID="quiz-details" />
        </View>
      </View>

      {r ? r.revealed ? <Review attempt={attempt} result={r} /> : (
        <Text variant="small" tone="muted" style={styles.hidden}>
          {quiz.reveal === "AFTER_PASS" && !r.passed ? "Answers and explanations appear once you pass." : "The instructor keeps the answers to this quiz hidden."}
        </Text>
      ) : null}
    </View>
  );
}

function Review({ attempt, result }: { attempt: QuizAttempt; result: Result }) {
  const { colors } = useTheme();
  const byId = new Map(result.questions.map((x) => [x.id, x]));
  return (
    <View style={[styles.review, { borderTopColor: colors.border }]} testID="quiz-result-review">
      {attempt.questions.map((q, i) => (
        <ReviewItem key={q.id} index={i} question={q} answer={attempt.answers[q.id]} res={byId.get(q.id)} last={i === attempt.questions.length - 1} />
      ))}
    </View>
  );
}

function ReviewItem({ index, question: q, answer, res, last }: { index: number; question: AttemptQuestion; answer: QuizAttempt["answers"][string] | undefined; res: Result["questions"][number] | undefined; last: boolean }) {
  const { colors } = useTheme();
  const mine = answer && "optionIds" in answer ? answer.optionIds : [];
  return (
    <View style={[styles.item, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]} testID={`quiz-result-q-${index + 1}`}>
      <View style={styles.itemHead}>
        {res?.correct ? <Check size={16} color={colors.success} accessibilityLabel="Correct" /> : <X size={16} color={colors.danger} accessibilityLabel="Incorrect" />}
        <Text variant="caption" tone="muted">{`Question ${index + 1} · ${res?.earnedPoints ?? 0} of ${plural(q.points, "point", "points")}`}</Text>
      </View>
      <View style={{ marginTop: space[1] }}>
        <Html html={q.promptHtml} compact />
      </View>
      {q.kind === "SHORT_TEXT" ? (
        <View>
          <Text variant="small">
            <Text variant="small" tone="muted">Your answer: </Text>
            {answer && "text" in answer && answer.text ? answer.text : "No answer"}
          </Text>
          {res?.acceptedAnswers?.length ? <Text variant="small" tone="muted" style={styles.mt2}>{`Accepted: ${res.acceptedAnswers.join(", ")}`}</Text> : null}
        </View>
      ) : (
        <View style={{ gap: space[1] }}>
          {q.options.map((o) => {
            const correct = !!res?.correctOptionIds?.includes(o.id);
            const picked = mine.includes(o.id);
            const note = correct && picked ? "Your answer, correct" : correct ? "Correct answer" : picked ? "Your answer" : "";
            return (
              <View key={o.id} style={styles.option}>
                <Text variant="small" tone={correct ? "success" : picked ? "danger" : "muted"} style={correct ? styles.strong : undefined}>{o.text}</Text>
                {note ? <Text variant="caption" tone={correct ? "success" : "danger"}>{note}</Text> : null}
              </View>
            );
          })}
        </View>
      )}
      {res?.explanationHtml ? (
        <View style={[styles.explanation, { borderLeftColor: colors.brand }]}>
          <Html html={res.explanationHtml} compact />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mt2: { marginTop: 2 },
  score: { flexDirection: "row", alignItems: "baseline", gap: space[3], marginTop: space[3], flexWrap: "wrap" },
  big: { fontSize: 48, lineHeight: 54, fontVariant: ["tabular-nums"] },
  actions: { marginTop: space[6], gap: space[2] },
  secondary: { flexDirection: "row", flexWrap: "wrap", marginLeft: -space[4] },
  hidden: { marginTop: space[8] },
  review: { marginTop: space[8], borderTopWidth: StyleSheet.hairlineWidth },
  item: { paddingVertical: space[5] },
  itemHead: { flexDirection: "row", alignItems: "center", gap: space[2] },
  option: { paddingVertical: 2 },
  strong: { fontFamily: fonts.body.semibold },
  explanation: { marginTop: space[3], borderLeftWidth: 2, paddingLeft: space[3] },
});
