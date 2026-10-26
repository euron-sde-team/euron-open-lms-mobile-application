/**
 * An assignment: instructions, how it is graded, the due date and late policy, the
 * latest status, every version with the reviewer's feedback and rubric scores, and a
 * composer for a new version when the rules allow one (text, files, a link).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { memo, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { ChevronDown, ChevronUp, FileText, Paperclip, RotateCw, X } from "lucide-react-native";
import { isApiError } from "../../../api/vendor/client/errors";
import type { AssignmentView, Submission } from "../../../api/vendor/types";
import { qk } from "../../../app/query";
import type { RootScreen } from "../../../app/routes";
import { useApi, useSession } from "../../../app/session";
import { safeExternalUrl } from "../../../lib/urls";
import { Button, IconButton } from "../../../ui/components/Button";
import { EmptyState, ErrorState, ProgressBar } from "../../../ui/components/Feedback";
import { Html } from "../../../ui/components/Html";
import { Field } from "../../../ui/components/Inputs";
import { Header, Screen, Section } from "../../../ui/components/Layout";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { space } from "../../../ui/theme/tokens";
import { errorText, formatBytes, formatDateTime, InlineError, PageHead, PageSkeleton, plural, SignInPrompt, useItemContent, type AssignmentContent } from "../shared";
import { buildSubmission, CLOSED_COPY, isEmptySubmission, latePolicy, sortSubmissions, STATUS_LABEL, STATUS_TONE, submitState, validateRepoUrl } from "./assignment-state";
import { useSubmissionUploads, type UploadItem } from "./use-uploads";

const STALE_CODES = new Set(["SUBMISSION_PENDING", "ALREADY_APPROVED", "PAST_DUE"]);

export function AssignmentScreen({ route, navigation }: RootScreen<"Assignment">) {
  const { courseSlug, itemId } = route.params;
  const { status } = useSession();
  const signedIn = status === "signedIn";
  const item = useItemContent(itemId, signedIn);
  const back = navigation.canGoBack() ? () => navigation.goBack() : undefined;

  if (!signedIn) {
    return (
      <View style={styles.fill}>
        <Header title="Assignment" onBack={back} />
        <Screen>
          <SignInPrompt title="Sign in to see this assignment" body="Your submissions and feedback are saved to your account." onSignIn={() => navigation.navigate("SignIn")} testID="assignment-signin" />
        </Screen>
      </View>
    );
  }
  if (item.isPending) {
    return (
      <View style={styles.fill}>
        <Header title="Assignment" onBack={back} />
        <Screen>
          <PageSkeleton testID="assignment-loading" />
        </Screen>
      </View>
    );
  }
  if (item.isError || !item.data) {
    return (
      <View style={styles.fill}>
        <Header title="Assignment" onBack={back} />
        <ErrorState message={errorText(item.error)} onRetry={() => item.refetch()} />
      </View>
    );
  }
  if (item.data.kind !== "ASSIGNMENT") {
    return (
      <View style={styles.fill}>
        <Header title="Assignment" onBack={back} />
        <EmptyState title="This lesson is not an assignment" action={{ label: "Back to course", onPress: () => navigation.navigate("Classroom", { courseSlug, itemId }) }} />
      </View>
    );
  }
  const content: AssignmentContent = item.data;
  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Header title={content.item.title} onBack={back} />
      <AssignmentBody content={content} courseSlug={courseSlug} refreshing={item.isRefetching} onRefresh={() => item.refetch()} />
    </KeyboardAvoidingView>
  );
}

function AssignmentBody({ content, courseSlug, refreshing, onRefresh }: { content: AssignmentContent; courseSlug: string; refreshing: boolean; onRefresh: () => void }) {
  const a = content.assignment;
  const submissions = sortSubmissions(a.submissions);
  const latest = submissions[0];
  const state = submitState({ ...a, submissions });
  const [justSubmitted, setJustSubmitted] = useState(false);
  const facts = [
    plural(a.maxPoints, "point", "points"),
    a.passPoints !== null ? `Pass at ${a.passPoints}` : null,
    a.dueAt ? `Due ${formatDateTime(a.dueAt)}` : "No due date",
    latePolicy(a),
  ].filter(Boolean).join(" · ");

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} testID="assignment">
      <PageHead eyebrow="Assignment" title={content.item.title} facts={facts}>
        {latest ? (
          <Text variant="smallStrong" tone={STATUS_TONE[latest.status]} style={{ marginTop: space[3] }} testID="assignment-status">
            {`Version ${latest.version} · ${STATUS_LABEL[latest.status]}${latest.review ? ` · ${latest.review.totalPoints} of ${a.maxPoints}` : ""}`}
          </Text>
        ) : null}
      </PageHead>

      <View style={{ marginTop: space[6] }}>
        <Html html={a.instructionsHtml} />
      </View>

      {a.rubric.length ? <Rubric rubric={a.rubric} maxPoints={a.maxPoints} /> : null}

      <Section title={state.open ? (submissions.length ? "Submit a new version" : "Your submission") : "Submission"}>
        {justSubmitted && !state.open ? (
          <Text tone="muted" testID="assignment-submitted">Submitted. Waiting for review. You will get a notification when it is reviewed.</Text>
        ) : state.open ? (
          <Composer content={content} courseSlug={courseSlug} late={state.late} onSubmitted={() => setJustSubmitted(true)} />
        ) : (
          <Text tone="muted" accessibilityRole="text" testID="assignment-closed">{CLOSED_COPY[state.reason]}</Text>
        )}
      </Section>

      {submissions.length ? (
        <Section title="Your submissions">
          {submissions.map((s, i) => (
            <SubmissionRow key={s.id} submission={s} assignment={a} initiallyOpen={i === 0} last={i === submissions.length - 1} />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

function Rubric({ rubric, maxPoints }: { rubric: AssignmentView["rubric"]; maxPoints: number }) {
  const { colors } = useTheme();
  const line = { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border };
  return (
    <Section title="How it is graded">
      <View testID="assignment-rubric">
        {rubric.map((c) => (
          <View key={c.id} style={[styles.rubricRow, line]}>
            <View style={styles.flex1}>
              <Text variant="bodyStrong">{c.title}</Text>
              {c.description ? <Text variant="small" tone="muted" style={styles.mt2}>{c.description}</Text> : null}
            </View>
            <Text variant="bodyStrong" style={styles.points}>{String(c.maxPoints)}</Text>
          </View>
        ))}
        <View style={styles.rubricRow}>
          <Text variant="bodyStrong" style={styles.flex1}>Total</Text>
          <Text variant="bodyStrong" style={styles.points}>{String(maxPoints)}</Text>
        </View>
      </View>
    </Section>
  );
}

function Composer({ content, courseSlug, late, onSubmitted }: { content: AssignmentContent; courseSlug: string; late: boolean; onSubmitted: () => void }) {
  const a = content.assignment;
  const itemId = content.item.id;
  const api = useApi();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [urlTouched, setUrlTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickNote, setPickNote] = useState<string | null>(null);
  const uploads = useSubmissionUploads(Math.max(1, a.accepts.maxFiles));
  const urlProblem = validateRepoUrl(url);

  const submit = useMutation({
    mutationFn: () => api.assignments.submit(itemId, buildSubmission(a.accepts, { body, url, uploadIds: uploads.mediaIds })),
    onSuccess: () => {
      setBody("");
      setUrl("");
      uploads.reset();
      onSubmitted();
      qc.invalidateQueries({ queryKey: qk.item(itemId) });
      qc.invalidateQueries({ queryKey: qk.assignment(itemId) });
      qc.invalidateQueries({ queryKey: qk.classroom(courseSlug) });
    },
    onError: (e) => {
      setError(errorText(e));
      if (isApiError(e) && STALE_CODES.has(e.code)) qc.invalidateQueries({ queryKey: qk.item(itemId) });
    },
  });

  const onSubmit = () => {
    setError(null);
    setUrlTouched(true);
    if (urlProblem) return;
    if (uploads.busy) return;
    if (isEmptySubmission(buildSubmission(a.accepts, { body, url, uploadIds: uploads.mediaIds }))) {
      setError("Add your work before submitting: text, a link or a file.");
      return;
    }
    submit.mutate();
  };

  const serverUrlError = submit.error && isApiError(submit.error) ? (submit.error.code === "URL_INVALID" ? submit.error.message : submit.error.fieldErrors.url) : undefined;

  return (
    <View testID="assignment-composer">
      {late ? <Text variant="small" tone="warning" style={{ marginBottom: space[4] }}>The due date has passed. This submission will be marked late.</Text> : null}
      {a.accepts.text ? (
        <Field label="Your answer" value={body} onChangeText={setBody} multiline placeholder="Write your answer. Markdown works: **bold**, lists, `code`." hint="Shown to the reviewer as formatted text." testID="assignment-body" />
      ) : null}
      {a.accepts.url ? (
        <Field
          label={a.accepts.text || a.accepts.files ? "Link (optional)" : "Link"}
          value={url}
          onChangeText={setUrl}
          onBlur={() => setUrlTouched(true)}
          placeholder="https://"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="URL"
          hint="A repository, a document or a hosted demo."
          error={(urlTouched && urlProblem) || serverUrlError || null}
          testID="assignment-url"
        />
      ) : null}
      {a.accepts.files ? (
        <View style={{ marginBottom: space[4] }}>
          <Text variant="smallStrong">Files</Text>
          <Text variant="small" tone="subtle" style={styles.mt2}>{`Up to ${plural(a.accepts.maxFiles, "file", "files")}: PDF, images, documents, zip, audio or video.`}</Text>
          {uploads.items.length ? (
            <View style={[styles.files, { borderTopColor: colors.border }]}>
              {uploads.items.map((u) => (
                <FileRow key={u.localId} item={u} onRetry={uploads.retry} onRemove={uploads.remove} />
              ))}
            </View>
          ) : null}
          {uploads.items.length < a.accepts.maxFiles ? (
            <Button
              label="Attach files"
              variant="outline"
              size="sm"
              icon={<Paperclip size={16} color={colors.foreground} />}
              onPress={() => {
                setPickNote(null);
                uploads.pickFiles().then(setPickNote);
              }}
              style={styles.attach}
              testID="assignment-attach"
            />
          ) : null}
          {pickNote ? <Text variant="small" tone="warning" style={{ marginTop: space[2] }}>{pickNote}</Text> : null}
        </View>
      ) : null}
      <InlineError message={error} testID="assignment-error" />
      <Button
        label={uploads.busy ? "Uploading" : content.assignment.submissions.length ? "Submit new version" : "Submit"}
        onPress={onSubmit}
        loading={submit.isPending}
        disabled={uploads.busy}
        block
        style={{ marginTop: space[4] }}
        testID="assignment-submit"
      />
    </View>
  );
}

const FileRow = memo(function FileRowView({ item: u, onRetry, onRemove }: { item: UploadItem; onRetry: (id: string) => void; onRemove: (id: string) => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.fileRow, { borderBottomColor: colors.border }]} testID="assignment-file">
      <FileText size={18} color={colors.mutedForeground} />
      <View style={styles.flex1}>
        <Text variant="small" numberOfLines={1}>{u.file.name}</Text>
        {u.status === "uploading" ? (
          <ProgressBar value={u.progress * 100} style={styles.mt6} />
        ) : u.status === "error" ? (
          <Text variant="caption" tone="danger" style={styles.mt2}>{u.error ?? "Upload failed."}</Text>
        ) : (
          <Text variant="caption" tone="muted" style={styles.mt2}>{formatBytes(u.file.size) || "Uploaded"}</Text>
        )}
      </View>
      {u.status === "error" && u.retryable ? <IconButton label={`Retry ${u.file.name}`} onPress={() => onRetry(u.localId)} icon={<RotateCw size={18} color={colors.foreground} />} size={44} /> : null}
      <IconButton label={`Remove ${u.file.name}`} onPress={() => onRemove(u.localId)} icon={<X size={18} color={colors.foreground} />} size={44} />
    </View>
  );
});

function openLink(raw: string | null | undefined) {
  const safe = safeExternalUrl(raw);
  if (safe) Linking.openURL(safe).catch(() => undefined);
}

const SubmissionRow = memo(function SubmissionRowView({ submission: s, assignment: a, initiallyOpen, last }: { submission: Submission; assignment: AssignmentView; initiallyOpen: boolean; last: boolean }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <View style={[styles.subRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]} testID={`assignment-version-${s.version}`}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`Version ${s.version}, ${STATUS_LABEL[s.status]}`} onPress={() => setOpen((o) => !o)} style={styles.subHead}>
        <View style={styles.flex1}>
          <Text variant="bodyStrong">{`Version ${s.version}`}</Text>
          <Text variant="small" tone="muted" style={styles.mt2}>{`${formatDateTime(s.submittedAt)}${s.isLate ? " · Late" : ""}`}</Text>
          <Text variant="smallStrong" tone={STATUS_TONE[s.status]} style={styles.mt2}>{STATUS_LABEL[s.status]}</Text>
        </View>
        {s.review ? <Text variant="bodyStrong" style={styles.points}>{`${s.review.totalPoints} / ${a.maxPoints}`}</Text> : null}
        <Chevron size={18} color={colors.subtleForeground} />
      </Pressable>
      {open ? (
        <View style={{ marginTop: space[3], gap: space[3] }}>
          {s.bodyHtml ? <Html html={s.bodyHtml} compact /> : s.body ? <Text variant="small">{s.body}</Text> : null}
          {s.url ? (
            <Pressable accessibilityRole="link" onPress={() => openLink(s.url)} hitSlop={8}>
              <Text variant="small" tone="link">{s.url}</Text>
            </Pressable>
          ) : null}
          {s.files.map((f) => (
            <Pressable key={f.id} accessibilityRole="link" accessibilityLabel={`Open ${f.fileName}`} onPress={() => openLink(f.url)} style={styles.subFile}>
              <FileText size={16} color={colors.link} />
              <Text variant="small" tone="link" numberOfLines={1} style={styles.flex1}>{f.fileName}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {s.review ? (
        <View style={[styles.review, { borderLeftColor: colors.brand }]} testID={`assignment-review-${s.version}`}>
          <Text variant="caption" tone="muted">{`Reviewed${s.review.reviewer ? ` by ${s.review.reviewer.displayName}` : ""} · ${formatDateTime(s.review.reviewedAt)}`}</Text>
          {a.rubric.map((c) => (
            <View key={c.id} style={styles.scoreRow}>
              <Text variant="small" style={styles.flex1}>{c.title}</Text>
              <Text variant="small" style={styles.points}>{`${s.review!.scores[c.id] ?? 0} / ${c.maxPoints}`}</Text>
            </View>
          ))}
          {s.review.feedbackHtml ? (
            <View style={{ marginTop: space[2] }}>
              <Html html={s.review.feedbackHtml} compact />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  attach: { alignSelf: "flex-start", marginTop: space[3] },
  mt6: { marginTop: 6 },
  mt2: { marginTop: 2 },
  flex1: { flex: 1 },
  fill: { flex: 1 },
  rubricRow: { flexDirection: "row", alignItems: "flex-start", gap: space[3], paddingVertical: space[3] },
  points: { fontVariant: ["tabular-nums"] },
  files: { marginTop: space[3], borderTopWidth: StyleSheet.hairlineWidth },
  fileRow: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  subRow: { paddingVertical: space[4] },
  subHead: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 44 },
  subFile: { flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 44 },
  review: { marginTop: space[4], borderLeftWidth: 2, paddingLeft: space[3] },
  scoreRow: { flexDirection: "row", paddingVertical: 4, marginTop: 2 },
});
