/**
 * The quiz countdown runs on the server's clock, never on a local start time: a phone
 * with a wrong clock (or a learner who changes it) must see the same deadline the server
 * enforces. Attempt responses are read raw so their `Date` header gives the offset
 * between the device and the server, measured at the midpoint of the round trip.
 */
import type { ApiClient } from "../../../api/client";
import type { QuizAttempt } from "../../../api/vendor/types";

/** Below this the measurement is noise (the Date header has whole-second resolution). */
const NOISE_MS = 1000;

/**
 * Device-to-server offset in ms (add it to Date.now() to get server time), or null when
 * the header is missing or unreadable.
 */
export function clockOffsetFromDate(dateHeader: string | null | undefined, sentAtMs: number, receivedAtMs: number): number | null {
  if (!dateHeader) return null;
  const server = Date.parse(dateHeader);
  if (Number.isNaN(server)) return null;
  // The header truncates to the second, so the server's true time is half a second later on average.
  const offset = server + 500 - (sentAtMs + receivedAtMs) / 2;
  return Math.abs(offset) < NOISE_MS ? 0 : Math.round(offset);
}

export interface Clocked<T> {
  data: T;
  offsetMs: number;
}

/** A JSON call that also measures the clock offset. Errors reject exactly like the typed client. */
export async function requestWithClock<T>(api: ApiClient, method: "GET" | "POST", path: string, now: () => number = Date.now): Promise<Clocked<T>> {
  const sent = now();
  const res = await api.http.request<Response>(method, path, { raw: true, ...(method === "POST" ? { body: {} } : {}) });
  const received = now();
  const data = (await res.json()) as T;
  return { data, offsetMs: clockOffsetFromDate(res.headers?.get?.("date"), sent, received) ?? 0 };
}

/** POST /assessments/quizzes/:itemId/attempts (starts, or resumes the open attempt). */
export function startAttempt(api: ApiClient, itemId: string): Promise<Clocked<QuizAttempt>> {
  return requestWithClock<QuizAttempt>(api, "POST", `/assessments/quizzes/${encodeURIComponent(itemId)}/attempts`);
}

/** GET /assessments/attempts/:attemptId. */
export function fetchAttempt(api: ApiClient, attemptId: string): Promise<Clocked<QuizAttempt>> {
  return requestWithClock<QuizAttempt>(api, "GET", `/assessments/attempts/${encodeURIComponent(attemptId)}`);
}
