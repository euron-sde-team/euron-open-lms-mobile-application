/**
 * The non-video item viewers: an article (server HTML), a PDF (react-native-pdf on the
 * signed URL), the quiz and assignment intro panels that open the assessment screens, the
 * locked state for items the viewer cannot open, and the quiet completion line when the
 * course reaches 100%. "Mark as done" exists because articles and PDFs complete only when
 * the learner says so (the server answers ITEM_COMPLETES_ITSELF for everything else).
 */
import { useState } from "react";
import { Modal, StyleSheet, View, useWindowDimensions } from "react-native";
import { Award, CheckCircle2, Expand, Lock, X } from "lucide-react-native";
import Pdf from "react-native-pdf";
import { useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../../../app/session";
import type { Classroom, ItemContent, ProgressResult } from "../../../api/vendor/types";
import { Button, IconButton } from "../../../ui/components/Button";
import { Html } from "../../../ui/components/Html";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { space } from "../../../ui/theme/tokens";
import { formatBytes, formatDuration, longDate } from "../format";
import { u } from "../styles";

type LectureContent = Extract<ItemContent, { kind: "LECTURE" }>;
type QuizContent = Extract<ItemContent, { kind: "QUIZ" }>;
type AssignmentContent = Extract<ItemContent, { kind: "ASSIGNMENT" }>;

export function MarkDone({ content, role, onProgress }: { content: LectureContent; role: Classroom["role"]; onProgress: (itemId: string, r: ProgressResult) => void }) {
  const { api } = useSession();
  const itemId = content.item.id;
  const done = useMutation({ mutationFn: () => api.learn.complete(itemId), onSuccess: (r) => onProgress(itemId, r) });
  if (role !== "LEARNER") {
    return <Text variant="small" tone="muted">{role === "STAFF" ? "Staff view: progress is not recorded." : "Enroll to keep your progress."}</Text>;
  }
  if (content.progress.completed || done.isSuccess) {
    return <CompletedLine />;
  }
  return (
    <View>
      <Button label="Mark as done" onPress={() => done.mutate()} loading={done.isPending} testID="learning-mark-done" />
      {done.isError ? <Text variant="small" tone="danger" style={{ marginTop: space[2] }}>That did not save. Try again.</Text> : null}
    </View>
  );
}

function CompletedLine() {
  const { colors } = useTheme();
  return (
    <View style={styles.inline} accessibilityRole="text" testID="learning-completed">
      <CheckCircle2 size={18} color={colors.success} />
      <Text variant="bodyStrong" tone="success">Completed</Text>
    </View>
  );
}

export function ArticleLesson({ content, html, role, onProgress }: { content: LectureContent; html: string; role: Classroom["role"]; onProgress: (itemId: string, r: ProgressResult) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.pad} testID="learning-article">
      <Html html={html} />
      <View style={[styles.doneRow, { borderTopColor: colors.border }]}>
        <MarkDone content={content} role={role} onProgress={onProgress} />
      </View>
    </View>
  );
}

export function PdfLesson({ content, pdf, role, onProgress }: { content: LectureContent; pdf: { url: string; fileName: string; sizeBytes: number | null } | null; role: Classroom["role"]; onProgress: (itemId: string, r: ProgressResult) => void }) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [full, setFull] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!pdf) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.ground2 }]}>
        <Text variant="bodyStrong">This PDF is not available yet</Text>
      </View>
    );
  }
  const size = formatBytes(pdf.sizeBytes);
  const doc = (h: number | undefined) =>
    failed ? (
      <View style={[styles.empty, { backgroundColor: colors.ground2 }]}>
        <Text variant="bodyStrong">The PDF did not open</Text>
        <Button label="Try again" variant="ghost" size="sm" onPress={() => setFailed(false)} />
      </View>
    ) : (
      <View style={h ? { height: h } : u.flex1} testID="learning-pdf">
        <Pdf source={{ uri: pdf.url, cache: true }} style={[u.flex1, { backgroundColor: colors.ground2 }]} trustAllCerts={false} onError={() => setFailed(true)} />
      </View>
    );
  return (
    <View>
      <View>
        {doc(Math.round(height * 0.62))}
        <View style={styles.expand}>
          <IconButton label="Open the PDF full screen" onPress={() => setFull(true)} icon={<Expand size={20} color={colors.foreground} />} />
        </View>
      </View>
      <View style={[styles.pad, styles.pdfMeta]}>
        <Text variant="small" tone="muted" style={u.flex1} numberOfLines={1}>{`${pdf.fileName}${size ? ` · ${size}` : ""}`}</Text>
      </View>
      <View style={styles.pad}>
        <MarkDone content={content} role={role} onProgress={onProgress} />
      </View>
      <Modal visible={full} animationType="slide" onRequestClose={() => setFull(false)} supportedOrientations={["portrait", "landscape"]}>
        <View style={[u.flex1, { backgroundColor: colors.background, paddingTop: insets.top }]}>
          <View style={[styles.modalHead, { borderBottomColor: colors.border }]}>
            <Text variant="subheading" numberOfLines={1} style={u.flex1}>{pdf.fileName}</Text>
            <IconButton label="Close" onPress={() => setFull(false)} icon={<X size={22} color={colors.foreground} />} />
          </View>
          {doc(undefined)}
        </View>
      </Modal>
    </View>
  );
}

/** "10 questions · 20 min limit · Pass 70%" and where the learner stands. */
export function quizFacts(q: QuizContent["quiz"]): string {
  return [
    `${q.questionCount} ${q.questionCount === 1 ? "question" : "questions"}`,
    q.timeLimitSeconds ? `${formatDuration(q.timeLimitSeconds)} limit` : null,
    `Pass ${q.passPercent}%`,
    q.maxAttempts ? `${q.attemptsUsed} of ${q.maxAttempts} attempts used` : q.attemptsUsed ? `${q.attemptsUsed} ${q.attemptsUsed === 1 ? "attempt" : "attempts"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function quizAction(q: QuizContent["quiz"]): string | null {
  if (q.openAttemptId) return "Resume quiz";
  const left = q.maxAttempts === null ? Infinity : q.maxAttempts - q.attemptsUsed;
  if (q.attemptsUsed === 0) return "Start quiz";
  if (left > 0 && !q.passed) return "Retake quiz";
  return "See results";
}

export function QuizIntro({ content, onOpen, role }: { content: QuizContent; onOpen: () => void; role: Classroom["role"] }) {
  const q = content.quiz;
  const action = quizAction(q);
  return (
    <View style={styles.pad} testID="learning-quiz-intro">
      <Text variant="eyebrow" tone="primary">Quiz</Text>
      <Text variant="title" style={{ marginTop: space[1] }}>{content.item.title}</Text>
      <Text tone="muted" style={{ marginTop: space[2] }}>{quizFacts(q)}</Text>
      {q.bestPercent !== null ? <Text variant="bodyStrong" tone={q.passed ? "success" : "default"} style={{ marginTop: space[2] }}>{`${q.passed ? "Passed" : "Best score"} ${Math.round(q.bestPercent)}%`}</Text> : null}
      {q.instructionsHtml ? <View style={{ marginTop: space[4] }}><Html html={q.instructionsHtml} compact /></View> : null}
      {role === "PREVIEW" ? null : action ? <Button label={action} onPress={onOpen} style={{ marginTop: space[5] }} testID="learning-quiz-open" /> : null}
    </View>
  );
}

const SUBMISSION_LABEL: Record<string, string> = { SUBMITTED: "Waiting for review", CHANGES_REQUESTED: "Changes requested", APPROVED: "Approved", REJECTED: "Not approved" };

export function AssignmentIntro({ content, onOpen, role }: { content: AssignmentContent; onOpen: () => void; role: Classroom["role"] }) {
  const a = content.assignment;
  const latest = a.submissions.length ? [...a.submissions].sort((x, y) => y.version - x.version)[0] : null;
  const facts = [`${a.maxPoints} points`, a.dueAt ? `Due ${longDate(a.dueAt)}` : null, a.dueAt ? (a.allowLate ? "Late work accepted" : "No late work") : null].filter(Boolean).join(" · ");
  return (
    <View style={styles.pad} testID="learning-assignment-intro">
      <Text variant="eyebrow" tone="primary">Assignment</Text>
      <Text variant="title" style={{ marginTop: space[1] }}>{content.item.title}</Text>
      <Text tone="muted" style={{ marginTop: space[2] }}>{facts}</Text>
      <Text variant="bodyStrong" style={{ marginTop: space[2] }}>{latest ? `Version ${latest.version}: ${SUBMISSION_LABEL[latest.status] ?? latest.status}` : "Not submitted yet"}</Text>
      {role === "PREVIEW" ? null : <Button label={latest ? "Open assignment" : "Start assignment"} onPress={onOpen} style={{ marginTop: space[5] }} testID="learning-assignment-open" />}
    </View>
  );
}

export function LockedPanel({ title, body, onCourse, onSignIn }: { title: string; body: string; onCourse: () => void; onSignIn?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.locked, { backgroundColor: colors.ground2 }]} testID="learning-locked">
      <Lock size={22} color={colors.mutedForeground} />
      <Text variant="heading" center style={{ marginTop: space[3] }}>{title}</Text>
      <Text tone="muted" center style={{ marginTop: space[1] }}>{body}</Text>
      <View style={styles.lockedRow}>
        <Button label="Go to the course page" onPress={onCourse} testID="learning-locked-course" />
        {onSignIn ? <Button label="Sign in" variant="ghost" onPress={onSignIn} style={{ marginLeft: space[2] }} testID="learning-locked-sign-in" /> : null}
      </View>
    </View>
  );
}

export function CompletionLine({ courseTitle, serial, certificateEnabled, onCertificate, onCertificates, onDismiss }: { courseTitle: string; serial: string | null; certificateEnabled: boolean; onCertificate: (serial: string) => void; onCertificates: () => void; onDismiss: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.complete, { backgroundColor: colors.successSoft }]} accessibilityLiveRegion="polite" testID="learning-course-complete">
      <Award size={20} color={colors.successSoftForeground} />
      <View style={u.flex1}>
        <Text variant="bodyStrong" style={{ color: colors.successSoftForeground }}>{`You finished ${courseTitle}.`}</Text>
        <Text variant="small" style={{ color: colors.successSoftForeground }}>{serial ? "Your certificate is ready." : certificateEnabled ? "Your certificate is being prepared." : "Every lesson is complete."}</Text>
        {serial ? <Button label="View certificate" size="sm" style={[u.selfStart, { marginTop: space[2] }]} onPress={() => onCertificate(serial)} testID="learning-certificate-link" /> : certificateEnabled ? <Button label="My certificates" size="sm" variant="outline" style={[u.selfStart, { marginTop: space[2] }]} onPress={onCertificates} /> : null}
      </View>
      <IconButton label="Dismiss" onPress={onDismiss} size={36} icon={<X size={18} color={colors.successSoftForeground} />} />
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: space[4], paddingTop: space[4] },
  inline: { flexDirection: "row", alignItems: "center", gap: space[2] },
  doneRow: { marginTop: space[6], paddingTop: space[5], borderTopWidth: StyleSheet.hairlineWidth },
  empty: { minHeight: 220, alignItems: "center", justifyContent: "center", padding: space[6] },
  expand: { position: "absolute", top: space[2], right: space[2] },
  pdfMeta: { flexDirection: "row", alignItems: "center", paddingTop: space[2] },
  modalHead: { flexDirection: "row", alignItems: "center", paddingLeft: space[4], paddingRight: space[2], height: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  locked: { alignItems: "center", paddingVertical: space[10], paddingHorizontal: space[6] },
  lockedRow: { flexDirection: "row", marginTop: space[5], flexWrap: "wrap", justifyContent: "center" },
  complete: { flexDirection: "row", alignItems: "flex-start", gap: space[3], paddingVertical: space[3], paddingLeft: space[4], paddingRight: space[2] },
});
