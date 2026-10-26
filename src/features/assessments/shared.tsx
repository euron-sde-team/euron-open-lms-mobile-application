/**
 * Pieces shared by the quiz, assignment and certificate screens: the item query (the same
 * cache entry the classroom uses), error text by API code, date formats, the sign-in
 * prompt and the skeleton for a page whose layout is known.
 */
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { View } from "react-native";
import { isApiError } from "../../api/vendor/client/errors";
import type { ItemContent } from "../../api/vendor/types";
import { qk } from "../../app/query";
import { useApi } from "../../app/session";
import { EmptyState, Skeleton } from "../../ui/components/Feedback";
import { Text } from "../../ui/components/Text";
import { space } from "../../ui/theme/tokens";

export type QuizContent = Extract<ItemContent, { kind: "QUIZ" }>;
export type AssignmentContent = Extract<ItemContent, { kind: "ASSIGNMENT" }>;

/** GET /learn/items/:itemId, shared with the classroom through qk.item. */
export function useItemContent(itemId: string, enabled: boolean) {
  const api = useApi();
  return useQuery({ queryKey: qk.item(itemId), queryFn: () => api.learn.item(itemId), enabled });
}

/** A message for a failed call. Server messages are written for learners; transport failures get our own copy. */
export function errorText(e: unknown): string {
  if (isApiError(e)) {
    switch (e.code) {
      case "NETWORK_ERROR":
        return "Cannot reach the academy. Check your connection and try again.";
      case "RATE_LIMITED":
        return "Too many requests. Wait a minute and try again.";
      case "NOT_ENROLLED":
      case "FORBIDDEN":
        return "You do not have access to this course.";
      default:
        return e.message;
    }
  }
  return e instanceof Error && e.message ? e.message : "Something went wrong.";
}

export const isNotFound = (e: unknown) => isApiError(e) && e.status === 404;

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function formatLongDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(iso));
}

/** "45 min", "1 h 30 m". */
export function formatLimit(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} m` : `${h} h`;
}

export function formatBytes(n: number | null | undefined): string {
  if (!n || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A prompt as plain text for one-line previews (rendered as text, never as HTML). */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function SignInPrompt({ title, body, onSignIn, testID }: { title: string; body: string; onSignIn: () => void; testID?: string }) {
  return <EmptyState title={title} body={body} action={{ label: "Sign in", onPress: onSignIn }} testID={testID} />;
}

/** The eyebrow, title and facts line every assessment page opens with. */
export function PageHead({ eyebrow, title, facts, children }: { eyebrow: string; title: string; facts?: string; children?: ReactNode }) {
  return (
    <View style={{ marginTop: space[5] }}>
      <Text variant="eyebrow" tone="primary">{eyebrow}</Text>
      <Text variant="title" style={{ marginTop: space[2] }} accessibilityRole="header">{title}</Text>
      {facts ? <Text variant="small" tone="muted" style={{ marginTop: space[2] }}>{facts}</Text> : null}
      {children}
    </View>
  );
}

/** Skeleton for an eyebrow, a title, a facts line and a few paragraphs. */
export function PageSkeleton({ testID }: { testID?: string }) {
  return (
    <View style={{ marginTop: space[5] }} testID={testID} accessibilityLabel="Loading">
      <Skeleton width={80} height={11} />
      <Skeleton width="80%" height={26} style={{ marginTop: space[3] }} />
      <Skeleton width="60%" height={13} style={{ marginTop: space[3] }} />
      <View style={{ marginTop: space[8], gap: space[3] }}>
        <Skeleton height={14} />
        <Skeleton height={14} />
        <Skeleton width="90%" height={14} />
        <Skeleton width="70%" height={14} />
      </View>
      <Skeleton width={140} height={44} rounded={10} style={{ marginTop: space[8] }} />
    </View>
  );
}

/** An inline error line under a form or a button, read out when it appears. */
export function InlineError({ message, testID }: { message: string | null; testID?: string }) {
  if (!message) return null;
  return (
    <Text variant="smallStrong" tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ marginTop: space[3] }} testID={testID}>
      {message}
    </Text>
  );
}
