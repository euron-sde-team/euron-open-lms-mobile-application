/**
 * One quiz attempt in progress: a question per screen, a countdown on the server's clock,
 * debounced autosave, flags, the palette, a review step and submit. The server owns the
 * attempt: leaving asks to confirm and the attempt (and its timer) keeps running there;
 * at the deadline the app submits what was answered, exactly once.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Alert, AppState, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ChevronLeft, ChevronRight, Flag, Grid3x3, Timer } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SubmitAttemptResult } from "../../../api/vendor/client/endpoints/assessments";
import { isApiError } from "../../../api/vendor/client/errors";
import type { AnswerValue, AttemptQuestion, QuizAttempt } from "../../../api/vendor/types";
import type { RootScreen } from "../../../app/routes";
import { useApi } from "../../../app/session";
import { Button, IconButton } from "../../../ui/components/Button";
import { Html } from "../../../ui/components/Html";
import { ChoiceList, Field } from "../../../ui/components/Inputs";
import { Header } from "../../../ui/components/Layout";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { space } from "../../../ui/theme/tokens";
import { errorText, InlineError, plainText, plural } from "../shared";
import { createAutosaver } from "./autosave";
import { QuizPalette } from "./QuizPalette";
import {
  countdownLabel,
  countdownSpoken,
  flaggedIds,
  initQuizState,
  isEmptyAnswer,
  paletteStatus,
  pendingAnswers,
  pendingKey,
  quizReducer,
  secondsLeft,
  serverNow,
  shouldAutoSubmit,
  unansweredIds,
  type QuizAction,
  type QuizRunState,
} from "./quiz-state";

/** Debounce for autosave, the same as the web runner. */
export const SAVE_DELAY_MS = 700;
const CLOSED_CODES = new Set(["ATTEMPT_CLOSED", "ATTEMPT_OVERDUE"]);

type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface QuizRunnerProps {
  attempt: QuizAttempt;
  /** Device-to-server clock offset, measured when the attempt was fetched. */
  offsetMs: number;
  navigation: RootScreen<"Quiz">["navigation"];
  onSubmitted: (result: SubmitAttemptResult, auto: boolean) => void;
  /** The server ended the attempt (submitted elsewhere, or past the deadline). */
  onClosed: (attemptId: string, error: unknown) => void;
}

export function QuizRunner({ attempt, offsetMs, navigation, onSubmitted, onClosed }: QuizRunnerProps) {
  const api = useApi();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [state, dispatch] = useReducer(quizReducer, attempt, initQuizState);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  /** Set once the attempt is submitted or closed: no more saves, no leave prompt. */
  const finished = useRef(false);
  const questions = attempt.questions;
  const q = questions[state.index];

  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const close = useCallback(
    (e: unknown) => {
      if (finished.current) return;
      finished.current = true;
      onClosedRef.current(attempt.id, e);
    },
    [attempt.id]
  );

  const saver = useMemo(
    () =>
      createAutosaver<Record<string, AnswerValue>>({
        delay: SAVE_DELAY_MS,
        save: async (batch) => {
          if (finished.current) return;
          await api.quizzes.saveAnswers(attempt.id, batch);
        },
        onStart: () => setSaveStatus("saving"),
        onSaved: (batch) => {
          dispatch({ type: "saved", saved: batch });
          setSaveStatus("saved");
        },
        onError: (e) => {
          if (isApiError(e) && CLOSED_CODES.has(e.code)) close(e);
          else setSaveStatus("error");
        },
      }),
    [api, attempt.id, close]
  );

  // Autosave whenever what would be saved changes.
  const key = pendingKey(state);
  useEffect(() => {
    if (key) saver.schedule(() => pendingAnswers(stateRef.current));
  }, [key, saver]);

  // Save right away when the app goes to the background; save what is left on unmount.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") saver.flush();
    });
    return () => {
      sub.remove();
      saver.flush().finally(() => saver.stop());
    };
  }, [saver]);

  const submit = useCallback(
    async (auto: boolean) => {
      if (finished.current) return;
      finished.current = true;
      setSubmitting(true);
      setSubmitError(null);
      try {
        const r = await api.quizzes.submit(attempt.id, stateRef.current.answers);
        onSubmitted(r, auto);
      } catch (e) {
        if (isApiError(e) && CLOSED_CODES.has(e.code)) {
          onClosedRef.current(attempt.id, e);
          return;
        }
        finished.current = false;
        setSubmitting(false);
        setSubmitError(errorText(e));
      }
    },
    [api, attempt.id, onSubmitted]
  );

  // The countdown, on the server's clock.
  const [now, setNow] = useState(() => serverNow(offsetMs));
  useEffect(() => {
    if (!attempt.deadlineAt) return;
    const tick = () => setNow(serverNow(offsetMs));
    const id = setInterval(tick, 1000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && tick());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [attempt.deadlineAt, offsetMs]);
  useEffect(() => {
    if (shouldAutoSubmit(attempt.deadlineAt, now, { submitting, submitted: finished.current })) submit(true);
  }, [now, attempt.deadlineAt, submitting, submit]);
  const left = secondsLeft(attempt.deadlineAt, now);

  // Leaving mid-attempt asks first; the attempt stays open on the server.
  useEffect(() => {
    return navigation.addListener("beforeRemove", (e) => {
      if (finished.current) return;
      e.preventDefault();
      Alert.alert(
        "Leave the quiz?",
        attempt.deadlineAt ? "Your answers are saved. The attempt stays open and the timer keeps running." : "Your answers are saved. You can resume this attempt later.",
        [
          { text: "Keep going", style: "cancel" },
          {
            text: "Leave",
            style: "destructive",
            onPress: () => {
              saver.flush().finally(() => {
                finished.current = true;
                navigation.dispatch(e.data.action);
              });
            },
          },
        ]
      );
    });
  }, [navigation, saver, attempt.deadlineAt]);

  const confirmSubmit = useCallback(() => {
    const open = unansweredIds(stateRef.current).length;
    Alert.alert("Submit your answers?", open ? `${plural(open, "question is", "questions are")} unanswered and will score zero.` : "You cannot change them after this.", [
      { text: "Keep answering", style: "cancel" },
      { text: "Submit", onPress: () => submit(false) },
    ]);
  }, [submit]);

  const reviewing = state.screen === "review";
  const title = reviewing ? "Review" : `Question ${state.index + 1} of ${questions.length}`;
  const last = state.index === questions.length - 1;

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]} testID="quiz-runner">
      <Header
        title={title}
        onBack={() => navigation.goBack()}
        right={
          left !== null ? (
            <View style={styles.timer} accessibilityRole="timer" accessibilityLabel={countdownSpoken(left)} testID="quiz-timer">
              <Timer size={16} color={left <= 60 ? colors.danger : colors.foreground} />
              <Text variant="smallStrong" tone={left <= 60 ? "danger" : "default"} style={styles.tabular}>{countdownLabel(left)}</Text>
            </View>
          ) : null
        }
      />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.statusRow}>
          <Text variant="caption" tone="subtle" accessibilityLiveRegion="polite" testID="quiz-save-status" style={styles.flex1}>
            {saveStatus === "saving" ? "Saving" : saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Not saved yet. Retrying on the next change." : `Attempt ${attempt.number}`}
          </Text>
          {!reviewing && q ? <FlagAction flagged={!!state.flagged[q.id]} onPress={() => dispatch({ type: "toggleFlag", questionId: q.id })} /> : null}
        </View>
        {reviewing ? (
          <ReviewStep questions={questions} state={state} onJump={(i) => dispatch({ type: "goto", index: i })} />
        ) : q ? (
          <QuestionView key={q.id} question={q} index={state.index} answer={state.answers[q.id]} dispatch={dispatch} />
        ) : null}
        <InlineError message={submitError} testID="quiz-submit-error" />
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, space[3]) }]}>
        {reviewing ? (
          <>
            <Button label="Keep answering" variant="ghost" onPress={() => dispatch({ type: "back" })} />
            <View style={styles.spacer} />
            <Button label="Submit answers" onPress={confirmSubmit} loading={submitting} testID="quiz-submit" />
          </>
        ) : (
          <>
            <Button label="Previous" variant="outline" icon={<ChevronLeft size={18} color={colors.foreground} />} onPress={() => dispatch({ type: "prev" })} disabled={state.index === 0} testID="quiz-prev" />
            <View style={styles.spacer} />
            <IconButton label="Question palette" onPress={() => setPaletteOpen(true)} icon={<Grid3x3 size={22} color={colors.foreground} />} size={44} />
            <View style={styles.spacer} />
            <Button label={last ? "Review" : "Next"} variant={last ? "primary" : "outline"} trailingIcon={last ? undefined : <ChevronRight size={18} color={colors.foreground} />} onPress={() => dispatch({ type: "next" })} testID="quiz-next" />
          </>
        )}
      </View>
      <QuizPalette
        visible={paletteOpen}
        state={state}
        onClose={() => setPaletteOpen(false)}
        onJump={(i) => {
          setPaletteOpen(false);
          dispatch({ type: "goto", index: i });
        }}
        onReview={() => {
          setPaletteOpen(false);
          dispatch({ type: "review" });
        }}
      />
    </View>
  );
}

function FlagAction({ flagged, onPress }: { flagged: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: flagged }} accessibilityLabel={flagged ? "Flagged for review, tap to unflag" : "Flag for review"} onPress={onPress} hitSlop={10} testID="quiz-flag" style={({ pressed }) => [styles.flag, pressed && { opacity: 0.6 }]}>
      <Flag size={16} color={flagged ? colors.warning : colors.mutedForeground} fill={flagged ? colors.warning : "transparent"} />
      <Text variant="smallStrong" tone={flagged ? "warning" : "muted"}>{flagged ? "Flagged" : "Flag for review"}</Text>
    </Pressable>
  );
}

/** The prompt and the answer input for one question, by type. */
export function QuestionView({ question, index, answer, dispatch }: { question: AttemptQuestion; index: number; answer: AnswerValue | undefined; dispatch: (a: QuizAction) => void }) {
  const multi = question.kind === "MULTI";
  const selected = answer && "optionIds" in answer ? answer.optionIds : [];
  const options = useMemo(() => question.options.map((o) => ({ value: o.id, label: o.text })), [question.options]);
  return (
    <View testID="quiz-question">
      <Text variant="caption" tone="muted">
        {`Question ${index + 1} · ${plural(question.points, "point", "points")}${multi ? " · Choose all that apply" : ""}`}
      </Text>
      <View style={{ marginTop: space[2] }}>
        <Html html={question.promptHtml} />
      </View>
      <View style={{ marginTop: space[4] }}>
        {question.kind === "SHORT_TEXT" ? (
          <Field
            label="Your answer"
            value={answer && "text" in answer ? answer.text : ""}
            onChangeText={(text) => dispatch({ type: "text", questionId: question.id, text })}
            placeholder="Type your answer"
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="done"
            testID="quiz-text-answer"
          />
        ) : (
          <View testID={`quiz-options-${question.kind.toLowerCase()}`}>
            <ChoiceList options={options} selected={selected} multiple={multi} onToggle={(optionId) => dispatch({ type: "select", question, optionId })} />
          </View>
        )}
      </View>
      {!isEmptyAnswer(answer) ? (
        <Pressable accessibilityRole="button" onPress={() => dispatch({ type: "clear", questionId: question.id })} hitSlop={10} style={styles.clear} testID="quiz-clear">
          <Text variant="smallStrong" tone="link">Clear answer</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ReviewStep({ questions, state, onJump }: { questions: AttemptQuestion[]; state: QuizRunState; onJump: (i: number) => void }) {
  const { colors } = useTheme();
  const open = unansweredIds(state).length;
  const flagged = flaggedIds(state).length;
  return (
    <View testID="quiz-review">
      <Text variant="heading">Review your answers</Text>
      <Text variant="small" tone={open ? "warning" : "muted"} style={{ marginTop: space[2] }} accessibilityRole={open ? "alert" : undefined}>
        {open ? `${plural(open, "question is", "questions are")} unanswered. Unanswered questions score zero.` : "Every question has an answer."}
        {flagged ? ` ${plural(flagged, "question is", "questions are")} flagged.` : ""}
      </Text>
      <View style={{ marginTop: space[4], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
        {questions.map((qq, i) => {
          const s = paletteStatus(state, qq.id);
          const label = s === "answered" ? "Answered" : s === "flagged" ? (isEmptyAnswer(state.answers[qq.id]) ? "Flagged, unanswered" : "Flagged") : "Unanswered";
          return (
            <Pressable
              key={qq.id}
              accessibilityRole="button"
              accessibilityLabel={`Question ${i + 1}, ${label}`}
              onPress={() => onJump(i)}
              testID={`quiz-review-${i + 1}`}
              style={({ pressed }) => [styles.reviewRow, { borderBottomColor: colors.border }, pressed && { opacity: 0.6 }]}
            >
              <Text variant="smallStrong" tone="muted" style={styles.reviewNum}>{String(i + 1)}</Text>
              <Text variant="small" numberOfLines={1} style={styles.flex1}>{plainText(qq.promptHtml)}</Text>
              <Text variant="caption" tone={s === "answered" ? "muted" : "warning"}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  fill: { flex: 1 },
  body: { paddingHorizontal: space[4], paddingBottom: space[8] },
  statusRow: { flexDirection: "row", alignItems: "center", minHeight: 44 },
  flag: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },
  timer: { flexDirection: "row", alignItems: "center", gap: 4, paddingRight: space[3] },
  tabular: { fontVariant: ["tabular-nums"] },
  footer: { flexDirection: "row", alignItems: "center", paddingHorizontal: space[4], paddingTop: space[3], borderTopWidth: StyleSheet.hairlineWidth },
  spacer: { flex: 1 },
  clear: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", marginTop: space[2] },
  reviewRow: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 48, paddingVertical: space[3], borderBottomWidth: StyleSheet.hairlineWidth },
  reviewNum: { width: 24 },
});
