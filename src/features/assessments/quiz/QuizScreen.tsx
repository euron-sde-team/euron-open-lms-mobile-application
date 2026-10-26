/**
 * The quiz screen: the intro (facts, best score, previous attempts, Start / Resume /
 * Retake), the runner while an attempt is open, and the result. Which one shows is the
 * pure `quizFlow` reducer. Every attempt fetch measures the server clock offset so the
 * countdown follows the server's deadline. Submitting refreshes the item, the classroom
 * and My Learning so progress and certificates appear everywhere at once.
 */
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useCallback, useReducer, useState } from "react";
import { StyleSheet, View } from "react-native";
import { isApiError } from "../../../api/vendor/client/errors";
import type { QuizAttemptSummary } from "../../../api/vendor/types";
import { qk } from "../../../app/query";
import type { RootScreen } from "../../../app/routes";
import { useApi, useSession } from "../../../app/session";
import { Button } from "../../../ui/components/Button";
import { EmptyState, ErrorState } from "../../../ui/components/Feedback";
import { Html } from "../../../ui/components/Html";
import { Header, Row, Screen, Section } from "../../../ui/components/Layout";
import { Text } from "../../../ui/components/Text";
import { space } from "../../../ui/theme/tokens";
import { errorText, formatDateTime, formatLimit, InlineError, PageHead, PageSkeleton, plural, SignInPrompt, useItemContent, type QuizContent } from "../shared";
import { attemptsLeft, quizFlow, type QuizView } from "./quiz-state";
import { QuizResultView } from "./QuizResult";
import { QuizRunner } from "./QuizRunner";
import { fetchAttempt, startAttempt } from "./server-clock";

const INTRO: QuizView = { screen: "intro" };

export function QuizScreen({ route, navigation }: RootScreen<"Quiz">) {
  const { courseSlug, itemId } = route.params;
  const { status } = useSession();
  const api = useApi();
  const qc = useQueryClient();
  const signedIn = status === "signedIn";
  const item = useItemContent(itemId, signedIn);
  const [view, dispatch] = useReducer(quizFlow, INTRO);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [certificate, setCertificate] = useState<string | null>(null);

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: qk.item(itemId) });
    qc.invalidateQueries({ queryKey: qk.classroom(courseSlug) });
    qc.invalidateQueries({ queryKey: ["my"] });
  }, [qc, itemId, courseSlug]);

  /** Start (or resume) without an id; open a previous attempt with one. */
  const open = useMutation({
    mutationFn: (attemptId?: string) => (attemptId ? fetchAttempt(api, attemptId) : startAttempt(api, itemId)),
    onSuccess: (r) => {
      setError(null);
      setNotice(null);
      dispatch({ type: "opened", attempt: r.data, offsetMs: r.offsetMs });
    },
    onError: (e) => {
      setError(errorText(e));
      if (isApiError(e) && e.code === "NO_ATTEMPTS_LEFT") refresh();
    },
  });

  const backToCourse = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate("Classroom", { courseSlug, itemId });
  }, [navigation, courseSlug, itemId]);

  if (!signedIn) {
    return (
      <View style={styles.fill}>
        <Header title="Quiz" onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined} />
        <Screen>
          <SignInPrompt title="Sign in to take this quiz" body="Your answers and scores are saved to your account." onSignIn={() => navigation.navigate("SignIn")} testID="quiz-signin" />
        </Screen>
      </View>
    );
  }

  if (item.isPending) {
    return (
      <View style={styles.fill}>
        <Header title="Quiz" onBack={() => navigation.goBack()} />
        <Screen>
          <PageSkeleton testID="quiz-loading" />
        </Screen>
      </View>
    );
  }
  if (item.isError || !item.data) {
    return (
      <View style={styles.fill}>
        <Header title="Quiz" onBack={() => navigation.goBack()} />
        <ErrorState message={errorText(item.error)} onRetry={() => item.refetch()} />
      </View>
    );
  }
  if (item.data.kind !== "QUIZ") {
    return (
      <View style={styles.fill}>
        <Header title="Quiz" onBack={() => navigation.goBack()} />
        <EmptyState title="This lesson is not a quiz" action={{ label: "Back to course", onPress: backToCourse }} />
      </View>
    );
  }
  const content: QuizContent = item.data;
  const quiz = content.quiz;

  if (view.screen === "running") {
    return (
      <QuizRunner
        key={view.attempt.id}
        attempt={view.attempt}
        offsetMs={view.offsetMs}
        navigation={navigation}
        onSubmitted={(r, auto) => {
          refresh();
          setNotice(auto ? "Time is up. Your answers were submitted." : null);
          if (r.progress?.certificate) setCertificate(r.progress.certificate.serial);
          dispatch({ type: "submitted", attempt: r.attempt });
        }}
        onClosed={async (attemptId, e) => {
          refresh();
          try {
            const r = await fetchAttempt(api, attemptId);
            setNotice(errorText(e));
            dispatch({ type: "closed", attempt: r.data });
          } catch {
            setError(errorText(e));
            dispatch({ type: "closed", attempt: null });
          }
        }}
      />
    );
  }

  if (view.screen === "result") {
    const left = attemptsLeft(quiz, view.attempt.number);
    const openElsewhere = !!quiz.openAttemptId && quiz.openAttemptId !== view.attempt.id;
    return (
      <View style={styles.fill}>
        <Header title={content.item.title} onBack={() => navigation.goBack()} />
        <Screen>
          <QuizResultView
            attempt={view.attempt}
            quiz={quiz}
            left={left}
            canRetake={(left === null || left > 0) && !openElsewhere}
            retaking={open.isPending}
            notice={notice}
            certificateSerial={certificate}
            onRetake={() => open.mutate(undefined)}
            onBackToCourse={backToCourse}
            onBackToQuiz={() => dispatch({ type: "intro" })}
            onOpenCertificate={(serial) => navigation.navigate("Certificate", { serial })}
          />
          <InlineError message={error} />
        </Screen>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <Header title={content.item.title} onBack={() => navigation.goBack()} />
      <QuizIntro content={content} starting={open.isPending} error={error} refreshing={item.isRefetching} onRefresh={() => item.refetch()} onStart={() => open.mutate(undefined)} onOpenAttempt={(id) => open.mutate(id)} />
    </View>
  );
}

function QuizIntro({ content, starting, error, refreshing, onRefresh, onStart, onOpenAttempt }: {
  content: QuizContent;
  starting: boolean;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onStart: () => void;
  onOpenAttempt: (attemptId: string) => void;
}) {
  const quiz = content.quiz;
  const left = attemptsLeft(quiz);
  const facts = [
    plural(quiz.questionCount, "question", "questions"),
    plural(quiz.totalPoints, "point", "points"),
    `Pass mark ${quiz.passPercent}%`,
    quiz.timeLimitSeconds ? `${formatLimit(quiz.timeLimitSeconds)} time limit` : "No time limit",
    quiz.maxAttempts ? `${quiz.attemptsUsed} of ${quiz.maxAttempts} attempts used` : quiz.attemptsUsed ? `${plural(quiz.attemptsUsed, "attempt", "attempts")} so far` : null,
  ].filter(Boolean).join(" · ");

  const action = quiz.openAttemptId ? (
    <Button label="Resume attempt" onPress={onStart} loading={starting} block testID="quiz-resume" />
  ) : left === 0 ? null : (
    <Button label={quiz.attemptsUsed ? "Retake quiz" : "Start quiz"} onPress={onStart} loading={starting} block testID="quiz-start" />
  );

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} footer={action} testID="quiz-intro">
      <PageHead eyebrow="Quiz" title={content.item.title} facts={facts} />
      {quiz.bestPercent !== null ? (
        <View style={styles.best}>
          <Text variant="title" style={styles.tabular}>{`${Math.round(quiz.bestPercent)}%`}</Text>
          <Text variant="small" tone="muted">best score</Text>
          {quiz.passed ? <Text variant="smallStrong" tone="success">Passed</Text> : null}
        </View>
      ) : null}
      {quiz.instructionsHtml ? (
        <View style={{ marginTop: space[5] }}>
          <Html html={quiz.instructionsHtml} />
        </View>
      ) : null}
      {quiz.timeLimitSeconds ? (
        <Text variant="small" tone="muted" style={{ marginTop: space[4] }}>
          The timer starts when you begin and keeps running if you leave. Answers save as you go and are submitted when time runs out.
        </Text>
      ) : null}
      {left === 0 && !quiz.openAttemptId ? (
        <Text variant="bodyStrong" tone="muted" style={{ marginTop: space[5] }} testID="quiz-no-attempts">You have used every attempt for this quiz.</Text>
      ) : left !== null ? (
        <Text variant="small" tone="muted" style={{ marginTop: space[5] }}>{`${plural(left, "attempt", "attempts")} left`}</Text>
      ) : null}
      <InlineError message={error} testID="quiz-error" />

      {quiz.attempts.length ? (
        <Section title="Previous attempts">
          {quiz.attempts.map((a, i) => (
            <AttemptRow key={a.id} attempt={a} last={i === quiz.attempts.length - 1} onPress={onOpenAttempt} />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

function attemptValue(a: QuizAttemptSummary): string {
  if (a.status === "IN_PROGRESS") return "In progress";
  if (a.percent === null) return a.status === "EXPIRED" ? "Expired" : "";
  const pct = `${Math.round(a.percent)}%`;
  return a.passed ? `${pct} · Passed` : a.passed === false ? `${pct} · Not passed` : pct;
}

function AttemptRow({ attempt: a, last, onPress }: { attempt: QuizAttemptSummary; last: boolean; onPress: (id: string) => void }) {
  return (
    <Row
      label={`Attempt ${a.number}`}
      detail={formatDateTime(a.submittedAt ?? a.startedAt)}
      value={attemptValue(a)}
      onPress={a.status === "IN_PROGRESS" ? undefined : () => onPress(a.id)}
      testID={`quiz-attempt-${a.number}`}
      last={last}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  best: { flexDirection: "row", alignItems: "baseline", gap: space[2], marginTop: space[5] },
  tabular: { fontVariant: ["tabular-nums"] },
});
