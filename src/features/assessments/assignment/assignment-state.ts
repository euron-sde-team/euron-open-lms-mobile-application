/**
 * Assignment rules, pure for tests: whether a new version may be submitted now (and why
 * not), the status words, the facts line, the link check and what the submit body holds.
 * The server enforces all of this; the app only explains it before the learner tries.
 */
import type { SubmissionInput } from "../../../api/vendor/client/endpoints/assessments";
import type { AssignmentView, Submission, SubmissionStatus } from "../../../api/vendor/types";

export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  SUBMITTED: "Waiting for review",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  REJECTED: "Not approved",
};

export const STATUS_TONE: Record<SubmissionStatus, "primary" | "warning" | "success" | "danger"> = {
  SUBMITTED: "primary",
  CHANGES_REQUESTED: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

export type SubmitState = { open: true; late: boolean } | { open: false; reason: "PENDING" | "APPROVED" | "PAST_DUE" };

/** Newest version first, whatever order the API used. */
export function sortSubmissions(list: Submission[]): Submission[] {
  return [...list].sort((a, b) => b.version - a.version);
}

/** Whether the learner may submit a new version now, and if not, why. Same rule as the server. */
export function submitState(a: Pick<AssignmentView, "submissions" | "dueAt" | "allowLate">, now = Date.now()): SubmitState {
  const latest = sortSubmissions(a.submissions)[0];
  if (latest?.status === "SUBMITTED") return { open: false, reason: "PENDING" };
  if (latest?.status === "APPROVED") return { open: false, reason: "APPROVED" };
  const late = !!a.dueAt && Date.parse(a.dueAt) < now;
  if (late && !a.allowLate) return { open: false, reason: "PAST_DUE" };
  return { open: true, late };
}

export const CLOSED_COPY: Record<"PENDING" | "APPROVED" | "PAST_DUE", string> = {
  PENDING: "Your submission is waiting for review. You can submit again if the reviewer asks for changes.",
  APPROVED: "Your work is approved. Nothing more to do here.",
  PAST_DUE: "The due date has passed and this assignment does not accept late work.",
};

/** The late policy in words, or null without a due date. */
export function latePolicy(a: Pick<AssignmentView, "dueAt" | "allowLate">): string | null {
  if (!a.dueAt) return null;
  return a.allowLate ? "Late work accepted and marked late" : "No late submissions";
}

/** Null when the link is fine (or empty), else what to fix. The server takes https links only. */
export function validateRepoUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return "Enter a full link, starting with https://";
  }
  if (u.protocol !== "https:") return "Use a secure link that starts with https://";
  if (!u.hostname || !u.hostname.includes(".")) return "Enter a full link, starting with https://";
  return null;
}

/** The submit body: only what the assignment accepts, nothing empty. */
export function buildSubmission(accepts: AssignmentView["accepts"], input: { body: string; url: string; uploadIds: string[] }): SubmissionInput {
  const out: SubmissionInput = {};
  if (accepts.text && input.body.trim()) out.body = input.body;
  if (accepts.url && input.url.trim()) out.url = input.url.trim();
  if (accepts.files && input.uploadIds.length) out.uploadIds = input.uploadIds;
  return out;
}

export function isEmptySubmission(s: SubmissionInput): boolean {
  return !s.body && !s.url && !(s.uploadIds && s.uploadIds.length);
}
