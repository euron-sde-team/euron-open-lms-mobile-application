/**
 * The quiz runner's rules, kept pure so they are unit tested: the answers being edited,
 * flags for review (client only), the current question, what still needs saving, the
 * countdown from the server deadline, and which screen the quiz shows. Mirrors the web
 * runner (euron-open-lms apps/web/src/lib/classroom/quiz-state.ts) so both apps behave alike.
 */
import type { AnswerValue, AttemptQuestion, QuizAttempt, QuizOverview } from "../../../api/vendor/types";

export interface QuizRunState {
  attemptId: string;
  questionIds: string[];
  answers: Record<string, AnswerValue>;
  flagged: Record<string, true>;
  /** Question ids changed since the last successful save. */
  dirty: Record<string, true>;
  index: number;
  /** "answering" one question at a time, or the review step before submitting. */
  screen: "answering" | "review";
}

export type QuizAction =
  | { type: "select"; question: Pick<AttemptQuestion, "id" | "kind">; optionId: string }
  | { type: "text"; questionId: string; text: string }
  | { type: "clear"; questionId: string }
  | { type: "toggleFlag"; questionId: string }
  | { type: "goto"; index: number }
  | { type: "next" }
  | { type: "prev" }
  | { type: "review" }
  | { type: "back" }
  /** The answers in `saved` reached the server; anything changed since stays dirty. */
  | { type: "saved"; saved: Record<string, AnswerValue> };

export function initQuizState(attempt: Pick<QuizAttempt, "id" | "questions" | "answers">): QuizRunState {
  return { attemptId: attempt.id, questionIds: attempt.questions.map((q) => q.id), answers: { ...attempt.answers }, flagged: {}, dirty: {}, index: 0, screen: "answering" };
}

const clampIndex = (s: QuizRunState, i: number) => Math.max(0, Math.min(s.questionIds.length - 1, i));

/**
 * The answer a tap produces, per question type. SINGLE and TRUE_FALSE hold exactly one
 * option; MULTI toggles the option in or out of the selection.
 */
export function answerAfterSelect(question: Pick<AttemptQuestion, "kind">, current: AnswerValue | undefined, optionId: string): AnswerValue {
  const prev = current && "optionIds" in current ? current.optionIds : [];
  if (question.kind === "MULTI") return { optionIds: prev.includes(optionId) ? prev.filter((o) => o !== optionId) : [...prev, optionId] };
  return { optionIds: [optionId] };
}

export function quizReducer(state: QuizRunState, action: QuizAction): QuizRunState {
  switch (action.type) {
    case "select":
      return setAnswer(state, action.question.id, answerAfterSelect(action.question, state.answers[action.question.id], action.optionId));
    case "text":
      return setAnswer(state, action.questionId, { text: action.text });
    case "clear": {
      const answers = { ...state.answers };
      delete answers[action.questionId];
      return { ...state, answers, dirty: { ...state.dirty, [action.questionId]: true } };
    }
    case "toggleFlag": {
      const flagged = { ...state.flagged };
      if (flagged[action.questionId]) delete flagged[action.questionId];
      else flagged[action.questionId] = true;
      return { ...state, flagged };
    }
    case "goto":
      return { ...state, index: clampIndex(state, action.index), screen: "answering" };
    case "next":
      if (state.index >= state.questionIds.length - 1) return { ...state, screen: "review" };
      return { ...state, index: state.index + 1 };
    case "prev":
      return { ...state, index: clampIndex(state, state.index - 1) };
    case "review":
      return { ...state, screen: "review" };
    case "back":
      return { ...state, screen: "answering" };
    case "saved": {
      const dirty = { ...state.dirty };
      for (const [id, value] of Object.entries(action.saved)) {
        if (sameAnswer(state.answers[id], value)) delete dirty[id];
        // A cleared answer goes up as an empty selection; it is clean once that is saved.
        else if (!state.answers[id] && isEmptyAnswer(value)) delete dirty[id];
      }
      return { ...state, dirty };
    }
  }
}

function setAnswer(state: QuizRunState, id: string, value: AnswerValue): QuizRunState {
  return { ...state, answers: { ...state.answers, [id]: value }, dirty: { ...state.dirty, [id]: true } };
}

export function isEmptyAnswer(v: AnswerValue | undefined): boolean {
  if (!v) return true;
  if ("optionIds" in v) return v.optionIds.length === 0;
  return v.text.trim() === "";
}

export function sameAnswer(a: AnswerValue | undefined, b: AnswerValue | undefined): boolean {
  if (!a || !b) return a === b;
  if ("optionIds" in a && "optionIds" in b) return a.optionIds.length === b.optionIds.length && a.optionIds.every((o) => b.optionIds.includes(o));
  if ("text" in a && "text" in b) return a.text === b.text;
  return false;
}

export type PaletteStatus = "answered" | "unanswered" | "flagged";

/** Flagged wins over answered: the learner asked to come back to it. */
export function paletteStatus(state: QuizRunState, questionId: string): PaletteStatus {
  if (state.flagged[questionId]) return "flagged";
  return isEmptyAnswer(state.answers[questionId]) ? "unanswered" : "answered";
}

export function unansweredIds(state: QuizRunState): string[] {
  return state.questionIds.filter((id) => isEmptyAnswer(state.answers[id]));
}

export function flaggedIds(state: QuizRunState): string[] {
  return state.questionIds.filter((id) => state.flagged[id]);
}

/** What the next autosave sends: every dirty answer, cleared ones as an empty selection. Null when nothing is dirty. */
export function pendingAnswers(state: QuizRunState): Record<string, AnswerValue> | null {
  const ids = Object.keys(state.dirty);
  if (!ids.length) return null;
  const out: Record<string, AnswerValue> = {};
  for (const id of ids) out[id] = state.answers[id] ?? { optionIds: [] };
  return out;
}

/** A stable key for "what would be saved now", so the autosave effect reruns only on real changes. */
export function pendingKey(state: QuizRunState): string {
  const p = pendingAnswers(state);
  return p ? JSON.stringify(Object.keys(p).sort().map((id) => [id, p[id]])) : "";
}

// Countdown ------------------------------------------------------------------

/** The server's clock: the device clock corrected by the offset measured on the last attempt response. */
export function serverNow(offsetMs: number, deviceNowMs: number = Date.now()): number {
  return deviceNowMs + offsetMs;
}

/**
 * Seconds left before the server deadline (null without a time limit), never below zero.
 * `serverNowMs` must already be on the server's clock (see serverNow); a local start
 * time is never used.
 */
export function secondsLeft(deadlineAt: string | null, serverNowMs: number): number | null {
  if (!deadlineAt) return null;
  const t = Date.parse(deadlineAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.ceil((t - serverNowMs) / 1000));
}

/** Submit on the learner's behalf once the deadline passes, exactly once. */
export function shouldAutoSubmit(deadlineAt: string | null, serverNowMs: number, opts: { submitting: boolean; submitted: boolean }): boolean {
  if (opts.submitting || opts.submitted) return false;
  const left = secondsLeft(deadlineAt, serverNowMs);
  return left !== null && left <= 0;
}

/** "4:05" or "1:02:03". */
export function countdownLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

/** Spoken form for screen readers: "4 minutes 5 seconds left". */
export function countdownSpoken(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const parts = [h ? `${h} ${h === 1 ? "hour" : "hours"}` : "", m ? `${m} ${m === 1 ? "minute" : "minutes"}` : "", !h && r ? `${r} ${r === 1 ? "second" : "seconds"}` : ""].filter(Boolean);
  return `${parts.join(" ") || "No time"} left`;
}

// Attempts and the screen flow -------------------------------------------------

/**
 * Attempts left (null when unlimited). The attempt just finished counts even before the
 * overview is refetched, so a stale cache never offers one retake too many.
 */
export function attemptsLeft(quiz: Pick<QuizOverview, "maxAttempts" | "attemptsUsed">, latestAttemptNumber = 0): number | null {
  if (quiz.maxAttempts === null) return null;
  return Math.max(0, quiz.maxAttempts - Math.max(quiz.attemptsUsed, latestAttemptNumber));
}

export type QuizView = { screen: "intro" } | { screen: "running"; attempt: QuizAttempt; offsetMs: number } | { screen: "result"; attempt: QuizAttempt };

export type QuizFlowAction =
  /** An attempt came back from start, resume or a tap on a previous attempt. */
  | { type: "opened"; attempt: QuizAttempt; offsetMs: number }
  | { type: "submitted"; attempt: QuizAttempt }
  /** The server says the attempt is over (submitted elsewhere or overdue): show what it became. */
  | { type: "closed"; attempt: QuizAttempt | null }
  | { type: "intro" };

export function quizFlow(view: QuizView, action: QuizFlowAction): QuizView {
  switch (action.type) {
    case "opened":
      return action.attempt.status === "IN_PROGRESS" ? { screen: "running", attempt: action.attempt, offsetMs: action.offsetMs } : { screen: "result", attempt: action.attempt };
    case "submitted":
      return { screen: "result", attempt: action.attempt };
    case "closed":
      return action.attempt?.result ? { screen: "result", attempt: action.attempt } : { screen: "intro" };
    case "intro":
      return view.screen === "intro" ? view : { screen: "intro" };
  }
}
