/**
 * Q&A for the open lesson: threads (keyset, "Recent" or "Unanswered"), ask a question,
 * open a thread to read replies, reply, mark the accepted answer (thread author or course
 * staff, per `canAccept`), delete your own posts and report others' (reason sheet). Copy
 * and report reasons match the web's qa-panel.
 */
import { memo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View, KeyboardAvoidingView, Platform } from "react-native";
import { CheckCircle2, MoreHorizontal, X } from "lucide-react-native";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { qk } from "../../../app/query";
import { useSession } from "../../../app/session";
import { flattenPages, nextCursor } from "../../../api/vendor/client/pagination";
import type { QaReply, QaThread, QaThreadDetail, ReportReason, ReportTarget } from "../../../api/vendor/types";
import { Button, IconButton } from "../../../ui/components/Button";
import { EmptyState, ErrorState, Skeleton } from "../../../ui/components/Feedback";
import { Html } from "../../../ui/components/Html";
import { ChoiceList, Field, Tabs } from "../../../ui/components/Inputs";
import { Avatar } from "../../../ui/components/Media";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { space } from "../../../ui/theme/tokens";
import { Sheet } from "../components/Sheet";
import { timeAgo } from "../format";
import { u } from "../styles";

type Sort = "recent" | "unanswered";

export function QaTab({ courseId, itemId }: { courseId: string; itemId: string }) {
  const { api } = useSession();
  const { colors } = useTheme();
  const [sort, setSort] = useState<Sort>("recent");
  const [asking, setAsking] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey: [...qk.qa(itemId), sort],
    queryFn: ({ pageParam }) => api.community.questions(courseId, { itemId, sort, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  });
  const threads = flattenPages(q.data?.pages);

  return (
    <View testID="learning-qa">
      <View style={styles.headRow}>
        <View style={u.flex1}>
          <Tabs value={sort} onChange={setSort} items={[{ value: "recent", label: "Recent" }, { value: "unanswered", label: "Unanswered" }]} testID="learning-qa-sort" />
        </View>
      </View>
      {asking ? (
        <AskForm courseId={courseId} itemId={itemId} onDone={(t) => {
            setAsking(false);
            if (t) setOpen(t.id);
          }} />
      ) : (
        <Button label="Ask a question" variant="outline" onPress={() => setAsking(true)} style={[u.selfStart, { marginTop: space[4] }]} testID="learning-qa-ask" />
      )}
      <View style={{ marginTop: space[3] }}>
        {q.isPending ? (
          <View style={{ gap: space[3] }}>
            <Skeleton height={52} />
            <Skeleton height={52} />
          </View>
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : !threads.length ? (
          <EmptyState title={sort === "unanswered" ? "Every question has an answer" : "No questions on this lesson yet"} body={sort === "unanswered" ? undefined : "Stuck on something? Ask, and the instructor or other learners can answer."} />
        ) : (
          threads.map((t, i) => <ThreadRow key={t.id} thread={t} last={i === threads.length - 1} onOpen={setOpen} borderColor={colors.border} />)
        )}
        {q.hasNextPage ? <Button label="Show more questions" variant="ghost" size="sm" onPress={() => q.fetchNextPage()} loading={q.isFetchingNextPage} /> : null}
      </View>
      <ThreadModal threadId={open} onClose={() => setOpen(null)} itemId={itemId} />
    </View>
  );
}

const ThreadRow = memo(function ThreadRowImpl({ thread: t, last, onOpen, borderColor }: { thread: QaThread; last: boolean; onOpen: (id: string) => void; borderColor: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.title}, ${t.replyCount} ${t.replyCount === 1 ? "reply" : "replies"}${t.answered ? ", answered" : ""}`}
      onPress={() => onOpen(t.id)}
      style={({ pressed }) => [styles.thread, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: borderColor }, { opacity: pressed ? 0.7 : 1 }]}
      testID="learning-qa-thread"
    >
      <Avatar uri={t.author.avatarUrl} name={t.author.displayName} size={32} />
      <View style={u.flex1}>
        <Text variant="bodyStrong">{t.title}</Text>
        <Text variant="small" tone="muted" style={u.mt2}>{`${t.author.displayName} · ${timeAgo(t.lastActivityAt)} · ${t.replyCount} ${t.replyCount === 1 ? "reply" : "replies"}`}</Text>
      </View>
      {t.answered ? <CheckCircle2 size={18} color={colors.success} accessibilityLabel="Answered" /> : null}
    </Pressable>
  );
});

function AskForm({ courseId, itemId, onDone }: { courseId: string; itemId: string; onDone: (t: QaThread | null) => void }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const ask = useMutation({
    mutationFn: () => api.community.ask(courseId, { title: title.trim(), body: body.trim(), itemId }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: qk.qa(itemId) });
      onDone(t);
    },
  });
  return (
    <View style={{ marginTop: space[4] }} testID="learning-qa-ask-form">
      <Field label="Your question" value={title} onChangeText={setTitle} maxLength={200} placeholder="One line that sums it up" autoFocus />
      <Field label="Details" hint="What did you try? Mention the time in the video if it helps." value={body} onChangeText={setBody} maxLength={10000} multiline />
      {ask.isError ? <Text variant="small" tone="danger" style={{ marginBottom: space[2] }}>The question did not post. Try again.</Text> : null}
      <View style={styles.inline}>
        <Button label="Post question" onPress={() => ask.mutate()} loading={ask.isPending} disabled={!title.trim() || !body.trim()} testID="learning-qa-post" />
        <Button label="Cancel" variant="ghost" onPress={() => onDone(null)} />
      </View>
    </View>
  );
}

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "SPAM", label: "Spam or advertising" },
  { value: "HARASSMENT", label: "Harassment" },
  { value: "OFF_TOPIC", label: "Off topic" },
  { value: "SPOILER", label: "Gives away quiz or assignment answers" },
  { value: "INAPPROPRIATE", label: "Inappropriate" },
  { value: "OTHER", label: "Something else" },
];

function ThreadModal({ threadId, onClose, itemId }: { threadId: string | null; onClose: () => void; itemId: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!threadId} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[u.flex1, { backgroundColor: colors.background, paddingTop: Platform.OS === "android" ? insets.top : space[0] }]}>
        <View style={[styles.modalHead, { borderBottomColor: colors.border }]}>
          <Text variant="subheading" style={u.flex1}>Question</Text>
          <IconButton label="Close" onPress={onClose} icon={<X size={22} color={colors.foreground} />} />
        </View>
        {threadId ? <ThreadView threadId={threadId} onDeleted={onClose} itemId={itemId} /> : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ThreadView({ threadId, onDeleted, itemId }: { threadId: string; onDeleted: () => void; itemId: string }) {
  const { api } = useSession();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const key = ["community", "thread", threadId] as const;
  const q = useQuery({ queryKey: key, queryFn: () => api.community.question(threadId) });
  const [reply, setReply] = useState("");
  const [report, setReport] = useState<{ type: ReportTarget; id: string } | null>(null);
  const setThread = (fn: (t: QaThreadDetail) => QaThreadDetail) => qc.setQueryData<QaThreadDetail>(key, (t) => (t ? fn(t) : t));
  const touchList = () => qc.invalidateQueries({ queryKey: qk.qa(itemId) });

  const send = useMutation({
    mutationFn: (body: string) => api.community.reply(threadId, body),
    onSuccess: (r) => {
      setThread((t) => ({ ...t, replies: [...t.replies, r], replyCount: t.replyCount + 1 }));
      setReply("");
      touchList();
    },
  });
  const accept = useMutation({
    mutationFn: (replyId: string | null) => api.community.accept(threadId, replyId),
    onMutate: (replyId) => setThread((t) => ({ ...t, answered: replyId !== null, replies: t.replies.map((r) => ({ ...r, accepted: r.id === replyId })) })),
    onSuccess: (t) => {
      qc.setQueryData(key, t);
      touchList();
    },
    onError: () => q.refetch(),
  });

  if (q.isPending) return <View style={{ padding: space[4], gap: space[3] }}><Skeleton height={24} width="70%" /><Skeleton height={80} /></View>;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  const t = q.data;

  const postMenu = (mine: boolean, onDelete: () => void, target: { type: ReportTarget; id: string }) =>
    mine
      ? Alert.alert("Delete this post?", "It will be removed from the thread.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: onDelete }])
      : setReport(target);

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: space[4] }} keyboardShouldPersistTaps="handled" testID="learning-qa-thread-view">
        <View style={styles.postHead}>
          <Avatar uri={t.author.avatarUrl} name={t.author.displayName} size={36} />
          <View style={u.flex1}>
            <Text variant="heading">{t.title}</Text>
            <Text variant="small" tone="muted" style={u.mt2}>{`${t.author.displayName} · ${timeAgo(t.createdAt)}${t.item ? ` · ${t.item.title}` : ""}`}</Text>
          </View>
          <IconButton
            label={t.mine ? "Delete question" : "Report question"}
            onPress={() =>
              postMenu(t.mine, async () => {
                await api.community.deleteQuestion(threadId).catch(() => undefined);
                touchList();
                onDeleted();
              }, { type: "QA_THREAD", id: t.id })
            }
            icon={<MoreHorizontal size={18} color={colors.subtleForeground} />}
          />
        </View>
        <View style={{ marginTop: space[3] }}>
          <Html html={t.bodyHtml} compact />
        </View>
        <Text variant="smallStrong" tone="muted" style={{ marginTop: space[6], marginBottom: space[1] }}>{`${t.replies.length} ${t.replies.length === 1 ? "reply" : "replies"}`}</Text>
        {t.replies.map((r, i) => (
          <ReplyRow
            key={r.id}
            reply={r}
            last={i === t.replies.length - 1}
            canAccept={t.canAccept}
            onAccept={() => accept.mutate(r.accepted ? null : r.id)}
            onMenu={() =>
              postMenu(r.mine, async () => {
                await api.community.deleteReply(r.id).catch(() => undefined);
                setThread((d) => ({ ...d, replies: d.replies.filter((x) => x.id !== r.id), replyCount: Math.max(0, d.replyCount - 1) }));
              }, { type: "QA_REPLY", id: r.id })
            }
          />
        ))}
      </ScrollView>
      <View style={[styles.replyBar, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, space[3]), backgroundColor: colors.card }]}>
        <Field label="Your reply" value={reply} onChangeText={setReply} maxLength={10000} multiline style={u.field64} testID="learning-qa-reply-body" />
        <Button label="Reply" size="sm" onPress={() => reply.trim() && send.mutate(reply.trim())} loading={send.isPending} disabled={!reply.trim()} style={[u.selfEnd, { marginTop: -space[2] }]} testID="learning-qa-reply-send" />
      </View>
      <ReportSheet target={report} onClose={() => setReport(null)} />
    </>
  );
}

const ReplyRow = memo(function ReplyRowImpl({ reply: r, last, canAccept, onAccept, onMenu }: { reply: QaReply; last: boolean; canAccept: boolean; onAccept: () => void; onMenu: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.reply, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]} testID="learning-qa-reply">
      <Avatar uri={r.author.avatarUrl} name={r.author.displayName} size={28} />
      <View style={u.flex1}>
        <Text variant="smallStrong">
          {r.author.displayName}
          <Text variant="small" tone="muted">{`${r.isStaff ? " · Staff" : ""} · ${timeAgo(r.createdAt)}`}</Text>
        </Text>
        {r.accepted ? (
          <View style={styles.accepted} testID="learning-qa-accepted">
            <CheckCircle2 size={15} color={colors.success} />
            <Text variant="smallStrong" tone="success">Accepted answer</Text>
          </View>
        ) : null}
        <View style={{ marginTop: space[1] }}>
          <Html html={r.bodyHtml} compact />
        </View>
        {canAccept ? (
          <Pressable accessibilityRole="button" onPress={onAccept} hitSlop={8} style={u.linkHit} testID="learning-qa-accept">
            <Text variant="smallStrong" tone="link">{r.accepted ? "Unmark as the answer" : "Mark as the answer"}</Text>
          </Pressable>
        ) : null}
      </View>
      <IconButton label={r.mine ? "Delete reply" : "Report reply"} onPress={onMenu} icon={<MoreHorizontal size={18} color={colors.subtleForeground} />} />
    </View>
  );
});

function ReportSheet({ target, onClose }: { target: { type: ReportTarget; id: string } | null; onClose: () => void }) {
  const { api } = useSession();
  const [reason, setReason] = useState<ReportReason>("SPAM");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const report = useMutation({
    mutationFn: () => api.community.report({ targetType: target!.type, targetId: target!.id, reason, note: note.trim() || null }),
    onSuccess: () => {
      setSent(true);
      setNote("");
    },
  });
  const close = () => {
    setSent(false);
    report.reset();
    onClose();
  };
  return (
    <Sheet visible={!!target} title="Report this post" onClose={close} testID="learning-report-sheet">
      {sent ? (
        <View style={{ paddingVertical: space[6] }}>
          <Text>Thanks. A moderator will take a look.</Text>
          <Button label="Done" variant="outline" onPress={close} style={{ marginTop: space[4] }} />
        </View>
      ) : (
        <>
          <ChoiceList options={REASONS} selected={[reason]} onToggle={setReason} />
          <Field label="Anything else (optional)" value={note} onChangeText={setNote} maxLength={1000} multiline style={u.field72} />
          {report.isError ? <Text variant="small" tone="danger" style={{ marginBottom: space[2] }}>The report did not send. Try again.</Text> : null}
          <Button label="Send report" onPress={() => report.mutate()} loading={report.isPending} testID="learning-report-submit" />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: "row", alignItems: "center" },
  inline: { flexDirection: "row", gap: space[2] },
  thread: { flexDirection: "row", alignItems: "flex-start", gap: space[3], paddingVertical: space[3] },
  modalHead: { flexDirection: "row", alignItems: "center", paddingLeft: space[4], paddingRight: space[2], height: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  postHead: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  reply: { flexDirection: "row", alignItems: "flex-start", gap: space[3], paddingVertical: space[3] },
  accepted: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  replyBar: { paddingHorizontal: space[4], paddingTop: space[3], borderTopWidth: StyleSheet.hairlineWidth },
});
