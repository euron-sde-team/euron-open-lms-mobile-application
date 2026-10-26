import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";
import type { ItemContent, QuizAttempt, QuizOverview } from "../../../api/vendor/types";
import { FakeSession } from "../../../../test/render";
import { fakeNavigation, renderScreen } from "../test-render";
import { QuizScreen } from "./QuizScreen";

// lucide's react-native entry is untransformed ESM under Jest; icons are not under test here.
jest.mock("lucide-react-native", () => new Proxy({ __esModule: true }, { get: (t: Record<string | symbol, unknown>, k) => (k in t ? t[k] : () => null) }));

const overview = (over: Partial<QuizOverview> = {}): QuizOverview => ({
  instructionsHtml: "<p>Answer from memory.</p>",
  questionCount: 4,
  totalPoints: 4,
  passPercent: 70,
  timeLimitSeconds: 600,
  maxAttempts: 3,
  attemptsUsed: 1,
  reveal: "AFTER_SUBMIT",
  bestPercent: 50,
  passed: false,
  openAttemptId: null,
  attempts: [{ id: "old", number: 1, status: "SUBMITTED", percent: 50, passed: false, startedAt: "2026-01-02T10:00:00Z", submittedAt: "2026-01-02T10:08:00Z" }],
  ...over,
});

const content = (quiz = overview()): ItemContent =>
  ({ kind: "QUIZ", item: { id: "qz1", kind: "QUIZ", title: "Plant cells check", lectureKind: null, durationSeconds: 0, isPreview: false, sectionId: "sec1" }, quiz, progress: {}, prevItemId: null, nextItemId: null }) as unknown as ItemContent;

const questions: QuizAttempt["questions"] = [
  { id: "q1", kind: "SINGLE", promptHtml: "<p>Which organelle makes energy?</p>", points: 1, options: [{ id: "q1a", text: "Mitochondria" }, { id: "q1b", text: "Ribosome" }] },
  { id: "q2", kind: "MULTI", promptHtml: "<p>Which are found in plant cells?</p>", points: 1, options: [{ id: "q2a", text: "Cell wall" }, { id: "q2b", text: "Chloroplast" }, { id: "q2c", text: "Centriole" }] },
  { id: "q3", kind: "TRUE_FALSE", promptHtml: "<p>Plant cells have a nucleus.</p>", points: 1, options: [{ id: "q3t", text: "True" }, { id: "q3f", text: "False" }] },
  { id: "q4", kind: "SHORT_TEXT", promptHtml: "<p>Name the green pigment.</p>", points: 1, options: [] },
];

const runningAttempt = (deadlineAt: string | null): QuizAttempt => ({ id: "at2", quizItemId: "qz1", number: 2, status: "IN_PROGRESS", startedAt: "2026-01-03T10:00:00Z", deadlineAt, questions, answers: {}, result: null });

const raw = (data: unknown, date: Date | null) => ({ json: async () => data, headers: { get: (k: string) => (k.toLowerCase() === "date" && date ? date.toUTCString() : null) } });

async function setup(opts: { quiz?: QuizOverview; request?: jest.Mock; submit?: jest.Mock; status?: "signedIn" | "signedOut" } = {}) {
  const nav = fakeNavigation();
  const api = {
    learn: { item: jest.fn(async () => content(opts.quiz)) },
    quizzes: { saveAnswers: jest.fn(async () => undefined), submit: opts.submit ?? jest.fn() },
    http: { request: opts.request ?? jest.fn() },
  };
  const route = { key: "Quiz-1", name: "Quiz", params: { courseSlug: "botany", itemId: "qz1" } };
  const utils = await renderScreen(
    <FakeSession api={api as never} status={opts.status ?? "signedIn"}>
      <QuizScreen route={route as never} navigation={nav as never} />
    </FakeSession>
  );
  return { ...utils, nav, api };
}

afterEach(() => jest.restoreAllMocks());

describe("QuizScreen intro", () => {
  it("shows the facts, the best score, attempts left and previous attempts", async () => {
    await setup();
    expect(await screen.findByTestId("quiz-intro")).toBeTruthy();
    expect(screen.getByText("4 questions · 4 points · Pass mark 70% · 10 min time limit · 1 of 3 attempts used")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText("2 attempts left")).toBeTruthy();
    expect(screen.getByText("Answer from memory.")).toBeTruthy();
    expect(screen.getByTestId("quiz-attempt-1")).toBeTruthy();
    expect(screen.getByTestId("quiz-start")).toBeTruthy();
    expect(screen.getByText("Retake quiz")).toBeTruthy();
  });

  it("offers Resume for an open attempt and nothing when attempts are used up", async () => {
    const first = await setup({ quiz: overview({ openAttemptId: "at9" }) });
    expect(await screen.findByTestId("quiz-resume")).toBeTruthy();
    await first.unmount();
    await setup({ quiz: overview({ attemptsUsed: 3 }) });
    expect(await screen.findByTestId("quiz-no-attempts")).toBeTruthy();
    expect(screen.queryByTestId("quiz-start")).toBeNull();
  });

  it("asks guests to sign in", async () => {
    const { nav, api } = await setup({ status: "signedOut" });
    await fireEvent.press(screen.getByText("Sign in"));
    expect(nav.navigate).toHaveBeenCalledWith("SignIn");
    expect(api.learn.item).not.toHaveBeenCalled();
  });

  it("shows an error with retry when the quiz fails to load", async () => {
    const nav = fakeNavigation();
    const item = jest.fn(async () => Promise.reject(new Error("Server unavailable")));
    await renderScreen(
      <FakeSession api={{ learn: { item } } as never}>
        <QuizScreen route={{ key: "q", name: "Quiz", params: { courseSlug: "b", itemId: "qz1" } } as never} navigation={nav as never} />
      </FakeSession>
    );
    expect(await screen.findByTestId("error-state")).toBeTruthy();
    await fireEvent.press(screen.getByText("Try again"));
    await waitFor(() => expect(item).toHaveBeenCalledTimes(2));
  });
});

describe("QuizScreen runner", () => {
  it("runs every question type, autosaves, follows the server clock and submits", async () => {
    // The server's clock is an hour ahead of the device; its deadline is 5 minutes away on its clock.
    const serverDate = new Date(Math.floor((Date.now() + 3_600_000) / 1000) * 1000);
    const deadline = new Date(serverDate.getTime() + 300_000).toISOString();
    const request = jest.fn(async () => raw(runningAttempt(deadline), serverDate));
    const done: QuizAttempt = {
      ...runningAttempt(deadline),
      status: "SUBMITTED",
      answers: { q1: { optionIds: ["q1a"] }, q2: { optionIds: ["q2a", "q2b"] }, q3: { optionIds: ["q3t"] }, q4: { text: "chlorophyll" } },
      result: {
        scorePoints: 3,
        maxPoints: 4,
        percent: 75,
        passed: true,
        submittedAt: "2026-01-03T10:04:00Z",
        revealed: true,
        questions: [
          { id: "q1", earnedPoints: 1, correct: true, correctOptionIds: ["q1a"], acceptedAnswers: null, explanationHtml: "<p>The powerhouse.</p>" },
          { id: "q2", earnedPoints: 1, correct: true, correctOptionIds: ["q2a", "q2b"], acceptedAnswers: null, explanationHtml: null },
          { id: "q3", earnedPoints: 1, correct: true, correctOptionIds: ["q3t"], acceptedAnswers: null, explanationHtml: null },
          { id: "q4", earnedPoints: 0, correct: false, correctOptionIds: null, acceptedAnswers: ["chlorophyll a"], explanationHtml: null },
        ],
      },
    };
    const submit = jest.fn(async () => ({ attempt: done, progress: { progress: {}, justCompleted: true, course: { progressPercent: 100, completedAt: "2026-01-03T10:04:00Z" }, certificate: { serial: "OLMS-1" } } }));
    const { api, nav, client } = await setup({ request, submit });
    const invalidate = jest.spyOn(client, "invalidateQueries");

    await fireEvent.press(await screen.findByTestId("quiz-start"));
    expect(await screen.findByTestId("quiz-runner")).toBeTruthy();
    expect(request).toHaveBeenCalledWith("POST", "/assessments/quizzes/qz1/attempts", { raw: true, body: {} });
    // Five minutes on the server's clock, not 65 on the device's.
    expect(screen.getByTestId("quiz-timer").props.accessibilityLabel).toMatch(/^(5 minutes|4 minutes 59 seconds) left$/);
    expect(screen.getByText("Question 1 of 4")).toBeTruthy();

    // SINGLE
    await fireEvent.press(screen.getByText("Mitochondria"));
    await waitFor(() => expect(api.quizzes.saveAnswers).toHaveBeenCalledWith("at2", { q1: { optionIds: ["q1a"] } }), { timeout: 2000 });
    expect(await screen.findByText("Saved")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("quiz-flag"));
    expect(screen.getByText("Flagged")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("quiz-next"));

    // MULTI
    expect(screen.getByText("Question 2 · 1 point · Choose all that apply")).toBeTruthy();
    expect(screen.getByTestId("quiz-options-multi")).toBeTruthy();
    await fireEvent.press(screen.getByText("Cell wall"));
    await fireEvent.press(screen.getByText("Chloroplast"));
    await fireEvent.press(screen.getByTestId("quiz-next"));

    // TRUE_FALSE
    expect(screen.getByTestId("quiz-options-true_false")).toBeTruthy();
    await fireEvent.press(screen.getByText("True"));
    await fireEvent.press(screen.getByTestId("quiz-next"));

    // SHORT_TEXT
    await fireEvent.changeText(screen.getByTestId("quiz-text-answer"), "chlorophyll");
    await waitFor(() => expect(api.quizzes.saveAnswers).toHaveBeenLastCalledWith("at2", expect.objectContaining({ q4: { text: "chlorophyll" } })), { timeout: 2000 });
    expect(screen.getByText("Review")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("quiz-next"));

    // Review step
    expect(screen.getByTestId("quiz-review")).toBeTruthy();
    expect(screen.getByText(/Every question has an answer\. 1 question is flagged\./)).toBeTruthy();
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons?: AlertButton[]) => buttons?.find((b) => b.text === "Submit")?.onPress?.());
    await fireEvent.press(screen.getByTestId("quiz-submit"));
    expect(alert).toHaveBeenCalledWith("Submit your answers?", expect.any(String), expect.any(Array));
    expect(await screen.findByTestId("quiz-result")).toBeTruthy();
    expect(submit).toHaveBeenCalledWith("at2", { q1: { optionIds: ["q1a"] }, q2: { optionIds: ["q2a", "q2b"] }, q3: { optionIds: ["q3t"] }, q4: { text: "chlorophyll" } });

    // Result with the revealed review and the certificate this pass issued.
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByTestId("quiz-result-status").props.children).toBe("Passed");
    expect(screen.getByText("3 of 4 points · Pass mark 70% · 1 attempt left")).toBeTruthy();
    expect(screen.getByTestId("quiz-result-review")).toBeTruthy();
    expect(screen.getByText("The powerhouse.")).toBeTruthy();
    expect(screen.getByText("Accepted: chlorophyll a")).toBeTruthy();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["learn", "classroom", "botany"] });
    await fireEvent.press(screen.getByTestId("quiz-certificate"));
    expect(nav.navigate).toHaveBeenCalledWith("Certificate", { serial: "OLMS-1" });
  });

  it("asks before leaving mid-attempt and saves first", async () => {
    const request = jest.fn(async () => raw(runningAttempt(null), new Date()));
    const { nav } = await setup({ request });
    await fireEvent.press(await screen.findByTestId("quiz-start"));
    await screen.findByTestId("quiz-runner");
    expect(screen.queryByTestId("quiz-timer")).toBeNull();
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons?: AlertButton[]) => buttons?.find((b) => b.text === "Leave")?.onPress?.());
    const preventDefault = jest.fn();
    const action = { type: "GO_BACK" };
    await act(async () => {
      nav.listeners.beforeRemove?.({ preventDefault, data: { action } });
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith("Leave the quiz?", "Your answers are saved. You can resume this attempt later.", expect.any(Array));
    await waitFor(() => expect(nav.dispatch).toHaveBeenCalledWith(action));
  });

  it("opens the palette and jumps to a question", async () => {
    const request = jest.fn(async () => raw(runningAttempt(null), null));
    await setup({ request });
    await fireEvent.press(await screen.findByTestId("quiz-start"));
    await screen.findByTestId("quiz-runner");
    await fireEvent.press(screen.getByLabelText("Question palette"));
    expect(screen.getByLabelText("Question 1, not answered, current")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("quiz-palette-3"));
    expect(screen.getByText("Question 3 of 4")).toBeTruthy();
  });

  it("shows a past result with the answers hidden when the policy says so", async () => {
    const past: QuizAttempt = { ...runningAttempt(null), id: "old", number: 1, status: "SUBMITTED", result: { scorePoints: 2, maxPoints: 4, percent: 50, passed: false, submittedAt: "2026-01-02T10:08:00Z", revealed: false, questions: [] } };
    const request = jest.fn(async () => raw(past, null));
    await setup({ request, quiz: overview({ reveal: "AFTER_PASS" }) });
    await fireEvent.press(await screen.findByTestId("quiz-attempt-1"));
    expect(await screen.findByTestId("quiz-result")).toBeTruthy();
    expect(request).toHaveBeenCalledWith("GET", "/assessments/attempts/old", { raw: true });
    expect(screen.getByText("Not passed")).toBeTruthy();
    expect(screen.getByText("Answers and explanations appear once you pass.")).toBeTruthy();
    expect(screen.getByTestId("quiz-retake")).toBeTruthy();
    expect(screen.queryByTestId("quiz-result-review")).toBeNull();
  });
});
