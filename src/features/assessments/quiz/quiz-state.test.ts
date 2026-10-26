import type { AttemptQuestion, QuizAttempt } from "../../../api/vendor/types";
import {
  answerAfterSelect,
  attemptsLeft,
  countdownLabel,
  countdownSpoken,
  initQuizState,
  paletteStatus,
  pendingAnswers,
  pendingKey,
  quizFlow,
  quizReducer,
  secondsLeft,
  serverNow,
  shouldAutoSubmit,
  unansweredIds,
} from "./quiz-state";

const q = (id: string, kind: AttemptQuestion["kind"]): AttemptQuestion => ({ id, kind, promptHtml: `<p>${id}</p>`, points: 1, options: kind === "SHORT_TEXT" ? [] : [{ id: `${id}a`, text: "A" }, { id: `${id}b`, text: "B" }] });
const questions = [q("s", "SINGLE"), q("m", "MULTI"), q("t", "TRUE_FALSE"), q("x", "SHORT_TEXT")];
const attempt = (over: Partial<QuizAttempt> = {}): QuizAttempt => ({ id: "at1", quizItemId: "qz", number: 1, status: "IN_PROGRESS", startedAt: "2026-01-01T10:00:00Z", deadlineAt: null, questions, answers: {}, result: null, ...over });

describe("countdown from the server deadline", () => {
  const deadline = "2026-01-01T10:10:00.000Z";
  const deadlineMs = Date.parse(deadline);

  it("counts down on the server clock, corrected by the measured offset", () => {
    // The device clock runs 2 minutes behind the server: offset +120 s.
    const device = deadlineMs - 5 * 60_000 - 120_000;
    expect(secondsLeft(deadline, serverNow(120_000, device))).toBe(300);
    // Ignoring the offset would show 7 minutes, which the server would not honour.
    expect(secondsLeft(deadline, device)).toBe(420);
  });

  it("handles a device clock that runs ahead", () => {
    const device = deadlineMs - 60_000 + 30_000;
    expect(secondsLeft(deadline, serverNow(-30_000, device))).toBe(60);
  });

  it("never goes below zero, and is null without a time limit or with a bad date", () => {
    expect(secondsLeft(deadline, deadlineMs + 5000)).toBe(0);
    expect(secondsLeft(null, deadlineMs)).toBeNull();
    expect(secondsLeft("not a date", deadlineMs)).toBeNull();
  });

  it("rounds partial seconds up so zero means the time is really up", () => {
    expect(secondsLeft(deadline, deadlineMs - 1)).toBe(1);
  });

  it("auto-submits once at the deadline, never while submitting or after", () => {
    expect(shouldAutoSubmit(deadline, deadlineMs - 1000, { submitting: false, submitted: false })).toBe(false);
    expect(shouldAutoSubmit(deadline, deadlineMs, { submitting: false, submitted: false })).toBe(true);
    expect(shouldAutoSubmit(deadline, deadlineMs, { submitting: true, submitted: false })).toBe(false);
    expect(shouldAutoSubmit(deadline, deadlineMs, { submitting: false, submitted: true })).toBe(false);
    expect(shouldAutoSubmit(null, deadlineMs, { submitting: false, submitted: false })).toBe(false);
  });

  it("formats the label and the spoken form", () => {
    expect(countdownLabel(245)).toBe("4:05");
    expect(countdownLabel(3723)).toBe("1:02:03");
    expect(countdownLabel(-3)).toBe("0:00");
    expect(countdownSpoken(245)).toBe("4 minutes 5 seconds left");
    expect(countdownSpoken(3660)).toBe("1 hour 1 minute left");
    expect(countdownSpoken(0)).toBe("No time left");
  });
});

describe("answer serialisation per question type", () => {
  it("SINGLE and TRUE_FALSE hold exactly one option", () => {
    expect(answerAfterSelect({ kind: "SINGLE" }, undefined, "a")).toEqual({ optionIds: ["a"] });
    expect(answerAfterSelect({ kind: "SINGLE" }, { optionIds: ["a"] }, "b")).toEqual({ optionIds: ["b"] });
    expect(answerAfterSelect({ kind: "TRUE_FALSE" }, { optionIds: ["t"] }, "f")).toEqual({ optionIds: ["f"] });
  });

  it("MULTI toggles options in and out", () => {
    const one = answerAfterSelect({ kind: "MULTI" }, undefined, "a");
    const two = answerAfterSelect({ kind: "MULTI" }, one, "b");
    expect(two).toEqual({ optionIds: ["a", "b"] });
    expect(answerAfterSelect({ kind: "MULTI" }, two, "a")).toEqual({ optionIds: ["b"] });
  });

  it("SHORT_TEXT is sent as { text }, and a cleared answer as an empty selection", () => {
    let s = initQuizState(attempt());
    s = quizReducer(s, { type: "text", questionId: "x", text: "photosynthesis" });
    s = quizReducer(s, { type: "select", question: questions[0]!, optionId: "sa" });
    expect(pendingAnswers(s)).toEqual({ x: { text: "photosynthesis" }, s: { optionIds: ["sa"] } });
    s = quizReducer(s, { type: "clear", questionId: "s" });
    expect(pendingAnswers(s)).toEqual({ x: { text: "photosynthesis" }, s: { optionIds: [] } });
  });

  it("is clean after a save that matches, and stays dirty for later edits", () => {
    let s = initQuizState(attempt());
    s = quizReducer(s, { type: "text", questionId: "x", text: "ab" });
    const batch = pendingAnswers(s)!;
    s = quizReducer(s, { type: "text", questionId: "x", text: "abc" });
    s = quizReducer(s, { type: "saved", saved: batch });
    expect(pendingAnswers(s)).toEqual({ x: { text: "abc" } });
    s = quizReducer(s, { type: "saved", saved: pendingAnswers(s)! });
    expect(pendingAnswers(s)).toBeNull();
    expect(pendingKey(s)).toBe("");
  });

  it("treats a saved clear as clean", () => {
    let s = initQuizState(attempt({ answers: { s: { optionIds: ["sa"] } } }));
    s = quizReducer(s, { type: "clear", questionId: "s" });
    s = quizReducer(s, { type: "saved", saved: pendingAnswers(s)! });
    expect(pendingAnswers(s)).toBeNull();
  });

  it("gives the same pending key for the same answers in any order", () => {
    let a = initQuizState(attempt());
    a = quizReducer(a, { type: "text", questionId: "x", text: "1" });
    a = quizReducer(a, { type: "select", question: questions[0]!, optionId: "sa" });
    let b = initQuizState(attempt());
    b = quizReducer(b, { type: "select", question: questions[0]!, optionId: "sa" });
    b = quizReducer(b, { type: "text", questionId: "x", text: "1" });
    expect(pendingKey(a)).toBe(pendingKey(b));
  });
});

describe("runner navigation and palette", () => {
  it("moves through questions into the review step and back", () => {
    let s = initQuizState(attempt());
    s = quizReducer(s, { type: "prev" });
    expect(s.index).toBe(0);
    for (let i = 0; i < 3; i++) s = quizReducer(s, { type: "next" });
    expect(s.index).toBe(3);
    s = quizReducer(s, { type: "next" });
    expect(s.screen).toBe("review");
    s = quizReducer(s, { type: "goto", index: 1 });
    expect(s).toMatchObject({ screen: "answering", index: 1 });
    s = quizReducer(s, { type: "goto", index: 99 });
    expect(s.index).toBe(3);
  });

  it("marks flagged over answered and counts unanswered", () => {
    let s = initQuizState(attempt({ answers: { s: { optionIds: ["sa"] } } }));
    expect(paletteStatus(s, "s")).toBe("answered");
    expect(paletteStatus(s, "m")).toBe("unanswered");
    s = quizReducer(s, { type: "toggleFlag", questionId: "s" });
    expect(paletteStatus(s, "s")).toBe("flagged");
    s = quizReducer(s, { type: "text", questionId: "x", text: "   " });
    expect(unansweredIds(s)).toEqual(["m", "t", "x"]);
    s = quizReducer(s, { type: "toggleFlag", questionId: "s" });
    expect(paletteStatus(s, "s")).toBe("answered");
  });
});

describe("attempt state transitions", () => {
  const result = { scorePoints: 3, maxPoints: 4, percent: 75, passed: true, submittedAt: "2026-01-01T10:05:00Z", questions: [], revealed: false };

  it("opens the runner for an open attempt and the result for a finished one", () => {
    expect(quizFlow({ screen: "intro" }, { type: "opened", attempt: attempt(), offsetMs: 42 })).toEqual({ screen: "running", attempt: attempt(), offsetMs: 42 });
    const done = attempt({ status: "SUBMITTED", result });
    expect(quizFlow({ screen: "intro" }, { type: "opened", attempt: done, offsetMs: 0 })).toEqual({ screen: "result", attempt: done });
  });

  it("shows the result after submit, and after the server closed the attempt with a score", () => {
    const running = quizFlow({ screen: "intro" }, { type: "opened", attempt: attempt(), offsetMs: 0 });
    const done = attempt({ status: "SUBMITTED", result });
    expect(quizFlow(running, { type: "submitted", attempt: done })).toEqual({ screen: "result", attempt: done });
    expect(quizFlow(running, { type: "closed", attempt: attempt({ status: "EXPIRED", result }) }).screen).toBe("result");
    expect(quizFlow(running, { type: "closed", attempt: attempt({ status: "EXPIRED" }) })).toEqual({ screen: "intro" });
    expect(quizFlow(running, { type: "closed", attempt: null })).toEqual({ screen: "intro" });
  });

  it("goes back to the intro", () => {
    const view = { screen: "intro" } as const;
    expect(quizFlow(view, { type: "intro" })).toBe(view);
    expect(quizFlow({ screen: "result", attempt: attempt() }, { type: "intro" })).toEqual({ screen: "intro" });
  });

  it("counts attempts left, including the one just finished before the overview refetches", () => {
    expect(attemptsLeft({ maxAttempts: null, attemptsUsed: 4 })).toBeNull();
    expect(attemptsLeft({ maxAttempts: 3, attemptsUsed: 1 })).toBe(2);
    expect(attemptsLeft({ maxAttempts: 3, attemptsUsed: 1 }, 2)).toBe(1);
    expect(attemptsLeft({ maxAttempts: 2, attemptsUsed: 3 })).toBe(0);
  });
});
