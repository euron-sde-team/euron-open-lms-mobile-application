/**
 * Notes: private to the learner. Write a note pinned to the current video time (shown as
 * 03:42; tapping the stamp seeks the player), edit and delete your own. "This lesson"
 * lists the open item's notes in playback order; "Whole course" pages through every note
 * (keyset) and opens the lesson a note belongs to.
 */
import { memo, useState, type RefObject } from "react";
import { Alert, Pressable, StyleSheet, Switch, View } from "react-native";
import { MoreHorizontal } from "lucide-react-native";
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { qk } from "../../../app/query";
import { useSession } from "../../../app/session";
import { flattenPages, nextCursor } from "../../../api/vendor/client/pagination";
import type { Note, Page } from "../../../api/vendor/types";
import { Button, IconButton } from "../../../ui/components/Button";
import { EmptyState, ErrorState, Skeleton } from "../../../ui/components/Feedback";
import { Field, Tabs } from "../../../ui/components/Inputs";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { space } from "../../../ui/theme/tokens";
import { clock, timeAgo } from "../format";
import type { PlayerHandle } from "../player/Player";
import { u } from "../styles";

/** Notes at a video time read in playback order; the rest keep newest first. Pure. */
export function sortForItem(list: Note[]): Note[] {
  const timed = list.filter((n) => n.atSeconds !== null).sort((a, b) => (a.atSeconds ?? 0) - (b.atSeconds ?? 0));
  return [...timed, ...list.filter((n) => n.atSeconds === null)];
}

type Data = InfiniteData<Page<Note>>;

export function NotesTab({ slug, itemId, isVideo, player, onOpenItem }: { slug: string; itemId: string; isVideo: boolean; player: RefObject<PlayerHandle | null>; onOpenItem: (itemId: string) => void }) {
  const [scope, setScope] = useState<"item" | "course">("item");
  return (
    <View testID="learning-notes">
      <Tabs value={scope} onChange={setScope} items={[{ value: "item", label: "This lesson" }, { value: "course", label: "Whole course" }]} testID="learning-notes-scope" />
      {scope === "item" ? <ItemNotes slug={slug} itemId={itemId} isVideo={isVideo} player={player} /> : <CourseNotes slug={slug} onOpenItem={onOpenItem} />}
    </View>
  );
}

function ItemNotes({ slug, itemId, isVideo, player }: { slug: string; itemId: string; isVideo: boolean; player: RefObject<PlayerHandle | null> }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const key = [...qk.notes(slug), itemId] as const;
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api.learn.notes(slug, { itemId, cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  });
  const [body, setBody] = useState("");
  const [stamp, setStamp] = useState(true);
  const [at, setAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Applies `fn` to every page; `prepend` lands on the first page only. */
  const patch = (fn: (list: Note[]) => Note[], prepend?: Note) =>
    qc.setQueryData<Data>(key, (d) => (d ? { ...d, pages: d.pages.map((p, i) => ({ ...p, items: i === 0 && prepend ? [prepend, ...fn(p.items)] : fn(p.items) })) } : d));
  const settle = () => qc.invalidateQueries({ queryKey: qk.notes(slug) });

  const add = useMutation({
    mutationFn: (v: { body: string; atSeconds: number | null }) => api.learn.addNote(itemId, v),
    onSuccess: (note) => {
      patch((list) => list.filter((n) => n.id !== note.id), note);
      setBody("");
      setAt(null);
      setError(null);
    },
    onError: () => setError("The note did not save. Try again."),
    onSettled: settle,
  });
  const edit = useMutation({
    mutationFn: (v: { id: string; body: string }) => api.learn.editNote(v.id, { body: v.body }),
    onSuccess: (note) => patch((list) => list.map((n) => (n.id === note.id ? note : n))),
    onSettled: settle,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.learn.deleteNote(id),
    onMutate: (id) => patch((list) => list.filter((n) => n.id !== id)),
    onSettled: settle,
  });

  const capture = () => {
    if (!isVideo) return;
    const t = player.current?.currentTime();
    setAt(typeof t === "number" && Number.isFinite(t) ? Math.floor(t) : null);
  };
  const submit = () => {
    const text = body.trim();
    if (!text || add.isPending) return;
    const atSeconds = isVideo && stamp ? (at ?? Math.floor(player.current?.currentTime() ?? 0)) : null;
    add.mutate({ body: text, atSeconds });
  };

  const notes = sortForItem(flattenPages(q.data?.pages));

  return (
    <View style={{ paddingTop: space[4] }}>
      <Field
        label="New note"
        multiline
        value={body}
        onFocus={capture}
        onChangeText={setBody}
        maxLength={5000}
        placeholder={isVideo ? "Pinned to the moment in the video" : "A note for this lesson"}
        error={error}
        style={u.note90}
        testID="learning-note-body"
      />
      <View style={styles.composerRow}>
        {isVideo ? (
          <View style={styles.stamp}>
            <Switch value={stamp} onValueChange={setStamp} accessibilityLabel="Pin the note to the video time" testID="learning-note-stamp" />
            <Text variant="small" tone="muted">{at !== null ? `At ${clock(at)}` : "At the current time"}</Text>
          </View>
        ) : (
          <View style={u.flex1} />
        )}
        <Button label="Add note" size="sm" disabled={!body.trim()} loading={add.isPending} onPress={submit} testID="learning-note-add" />
      </View>

      <View style={{ marginTop: space[5] }}>
        {q.isPending ? (
          <View style={{ gap: space[3] }}>
            <Skeleton height={44} />
            <Skeleton height={44} />
          </View>
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : notes.length === 0 ? (
          <EmptyState title="No notes on this lesson yet" body="Notes are private to you." />
        ) : (
          notes.map((n, i) => (
            <NoteRow
              key={n.id}
              note={n}
              last={i === notes.length - 1}
              onSeek={isVideo && n.atSeconds !== null ? () => player.current?.seek(n.atSeconds as number) : undefined}
              onSave={(text) => edit.mutate({ id: n.id, body: text })}
              onDelete={() => remove.mutate(n.id)}
            />
          ))
        )}
        {q.hasNextPage ? <Button label="Show more notes" variant="ghost" size="sm" onPress={() => q.fetchNextPage()} loading={q.isFetchingNextPage} /> : null}
      </View>
    </View>
  );
}

const NoteRow = memo(function NoteRowImpl({ note, last, onSeek, onSave, onDelete }: { note: Note; last: boolean; onSeek?: () => void; onSave: (body: string) => void; onDelete: () => void }) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const menu = () =>
    Alert.alert("Note", undefined, [
      {
        text: "Edit",
        onPress: () => {
          setDraft(note.body);
          setEditing(true);
        },
      },
      { text: "Delete", style: "destructive", onPress: () => Alert.alert("Delete this note?", "It will be removed.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: onDelete }]) },
      { text: "Cancel", style: "cancel" },
    ]);
  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]} testID="learning-note-row">
      {note.atSeconds !== null ? (
        onSeek ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Play from ${clock(note.atSeconds)}`} onPress={onSeek} hitSlop={8} style={styles.stampHit} testID="learning-note-seek">
            <Text variant="smallStrong" tone="link" style={styles.mono}>{clock(note.atSeconds)}</Text>
          </Pressable>
        ) : (
          <Text variant="smallStrong" tone="muted" style={[styles.mono, styles.stampHit]}>{clock(note.atSeconds)}</Text>
        )
      ) : null}
      <View style={u.flex1}>
        {editing ? (
          <View>
            <Field label="Edit note" multiline value={draft} onChangeText={setDraft} maxLength={5000} style={u.note80} autoFocus />
            <View style={styles.inline}>
              <Button
                label="Save"
                size="sm"
                onPress={() => {
                  const t = draft.trim();
                  if (t && t !== note.body) onSave(t);
                  setEditing(false);
                }}
              />
              <Button label="Cancel" size="sm" variant="ghost" onPress={() => setEditing(false)} />
            </View>
          </View>
        ) : (
          <>
            <Text>{note.body}</Text>
            <Text variant="caption" tone="subtle" style={u.mt2}>{`${timeAgo(note.createdAt)}${note.updatedAt !== note.createdAt ? " · edited" : ""}`}</Text>
          </>
        )}
      </View>
      {!editing ? <IconButton label="Note actions" onPress={menu} icon={<MoreHorizontal size={18} color={colors.subtleForeground} />} /> : null}
    </View>
  );
});

function CourseNotes({ slug, onOpenItem }: { slug: string; onOpenItem: (itemId: string) => void }) {
  const { api } = useSession();
  const { colors } = useTheme();
  const q = useInfiniteQuery({
    queryKey: [...qk.notes(slug), "all"],
    queryFn: ({ pageParam }) => api.learn.notes(slug, { cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  });
  const notes = flattenPages(q.data?.pages);
  if (q.isPending) return <View style={{ paddingTop: space[4] }}><Skeleton height={64} /></View>;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!notes.length) return <EmptyState title="No notes in this course yet" body="Add notes from any lesson; they collect here." />;
  return (
    <View style={{ paddingTop: space[2] }}>
      {notes.map((n, i) => (
        <Pressable key={n.id} accessibilityRole="button" accessibilityLabel={`Open ${n.itemTitle}`} onPress={() => onOpenItem(n.itemId)} style={[styles.courseRow, i < notes.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
          <Text variant="smallStrong" tone="link">{`${n.itemTitle}${n.atSeconds !== null ? ` · ${clock(n.atSeconds)}` : ""}`}</Text>
          <Text style={u.mt2}>{n.body}</Text>
        </Pressable>
      ))}
      {q.hasNextPage ? <Button label="Show more notes" variant="ghost" size="sm" onPress={() => q.fetchNextPage()} loading={q.isFetchingNextPage} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  composerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: -space[1] },
  stamp: { flexDirection: "row", alignItems: "center", gap: space[2], flex: 1 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: space[2], paddingVertical: space[3] },
  stampHit: { minWidth: 52, minHeight: 32, justifyContent: "center", paddingTop: 2 },
  mono: { fontVariant: ["tabular-nums"] },
  inline: { flexDirection: "row", gap: space[2] },
  courseRow: { paddingVertical: space[3] },
});
