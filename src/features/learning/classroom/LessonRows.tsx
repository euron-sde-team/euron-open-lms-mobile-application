/**
 * The curriculum as list rows for the Lessons tab: a section header (number, title,
 * "3 of 8 · 42 min", folds) and item rows (progress ring or check, type icon, title,
 * "Video · 12 min · Best 80%"). The open item sits on the primary-soft ground; locked
 * items are dimmed with a lock. Row components are memoised; the screen's FlatList
 * renders them from `curriculumRows`.
 */
import { memo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Bookmark, CheckCircle2, ChevronDown, ClipboardList, Download, File as FileIcon, FileText, ListChecks, Lock, PlayCircle } from "lucide-react-native";
import type { ClassroomItem, ClassroomSection } from "../../../api/vendor/types";
import { ProgressRing } from "../../../ui/components/Feedback";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { space } from "../../../ui/theme/tokens";
import { formatDuration } from "../format";
import { itemKindLabel, itemStatusLabel, ringPercent } from "../curriculum";
import type { DownloadState } from "../downloads/state";
import { u } from "../styles";

export type CurriculumRow =
  | { type: "section"; key: string; section: ClassroomSection; number: number; open: boolean }
  | { type: "item"; key: string; item: ClassroomItem; sectionId: string };

/** Rows for the open sections only. Pure. */
export function curriculumRows(sections: ClassroomSection[], open: Record<string, boolean>): CurriculumRow[] {
  const rows: CurriculumRow[] = [];
  sections.forEach((section, i) => {
    const isOpen = !!open[section.id];
    rows.push({ type: "section", key: `s:${section.id}`, section, number: i + 1, open: isOpen });
    if (isOpen) for (const item of section.items) rows.push({ type: "item", key: `i:${item.id}`, item, sectionId: section.id });
  });
  return rows;
}

export function KindIcon({ item, size = 14, color }: { item: Pick<ClassroomItem, "kind" | "lectureKind">; size?: number; color: string }) {
  const Icon = item.kind === "QUIZ" ? ListChecks : item.kind === "ASSIGNMENT" ? ClipboardList : item.lectureKind === "ARTICLE" ? FileText : item.lectureKind === "PDF" ? FileIcon : PlayCircle;
  return <Icon size={size} color={color} />;
}

export const SectionRow = memo(function SectionRowImpl({ section, number, open, onToggle }: { section: ClassroomSection; number: number; open: boolean; onToggle: (id: string) => void }) {
  const { colors } = useTheme();
  const duration = section.items.reduce((n, i) => n + i.durationSeconds, 0);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`Section ${number}: ${section.title}, ${section.completedCount} of ${section.items.length} done`}
      onPress={() => onToggle(section.id)}
      style={({ pressed }) => [styles.section, { borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
      testID="learning-curriculum-section"
    >
      <View style={u.flex1}>
        <Text variant="bodyStrong">{`${number}. ${section.title}`}</Text>
        <Text variant="small" tone="muted" style={u.mt2}>
          {`${section.completedCount} of ${section.items.length}${duration > 0 ? ` · ${formatDuration(duration)}` : ""}`}
        </Text>
      </View>
      <ChevronDown size={18} color={colors.subtleForeground} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
    </Pressable>
  );
});

export interface ItemRowProps {
  item: ClassroomItem;
  active: boolean;
  openable: boolean;
  onOpen: (item: ClassroomItem) => void;
  /** Shown when bookmarks apply (not for previews). */
  onBookmark?: (item: ClassroomItem) => void;
  /** Shown on video rows when downloads are offered. */
  download?: { state: DownloadState | null; progress: number; onPress: (item: ClassroomItem) => void } | null;
}

export const ItemRow = memo(function ItemRowImpl({ item, active, openable, onOpen, onBookmark, download }: ItemRowProps) {
  const { colors } = useTheme();
  const status = itemStatusLabel(item);
  const meta = [itemKindLabel(item), item.durationSeconds > 0 ? formatDuration(item.durationSeconds) : null, !openable ? null : item.isPreview ? "Preview" : null, status].filter(Boolean).join(" · ");
  return (
    <View style={[styles.itemWrap, active && { backgroundColor: colors.primarySoft }]}>
      {active ? <View style={[styles.activeBar, { backgroundColor: colors.brand }]} /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !openable, selected: active }}
        accessibilityLabel={`${item.title}, ${meta}${openable ? "" : ", locked"}${item.progress.completed ? ", completed" : ""}`}
        disabled={!openable}
        onPress={() => onOpen(item)}
        style={({ pressed }) => [styles.item, { opacity: !openable ? 0.5 : pressed ? 0.7 : 1 }]}
        testID={active ? "learning-curriculum-item-active" : "learning-curriculum-item"}
      >
        <View style={styles.ring}>
          {!openable ? <Lock size={18} color={colors.subtleForeground} /> : item.progress.completed ? <CheckCircle2 size={22} color={colors.brand} /> : <ProgressRing value={ringPercent(item)} />}
        </View>
        <View style={u.flex1}>
          <Text variant={active ? "bodyStrong" : "body"}>{item.title}</Text>
          <View style={styles.meta}>
            <KindIcon item={item} color={colors.mutedForeground} />
            <Text variant="small" tone="muted" style={u.shrink}>{meta}</Text>
          </View>
        </View>
      </Pressable>
      {download && openable ? <DownloadGlyph state={download.state} progress={download.progress} onPress={() => download.onPress(item)} title={item.title} /> : null}
      {onBookmark && openable ? (
        <Pressable accessibilityRole="button" accessibilityState={{ checked: item.bookmarked }} accessibilityLabel={item.bookmarked ? `Remove bookmark: ${item.title}` : `Bookmark: ${item.title}`} onPress={() => onBookmark(item)} hitSlop={6} style={styles.action} testID="learning-curriculum-bookmark">
          <Bookmark size={18} color={item.bookmarked ? colors.primary : colors.subtleForeground} fill={item.bookmarked ? colors.primary : "transparent"} />
        </Pressable>
      ) : null}
    </View>
  );
});

/** The download state as one unboxed glyph: arrow, a ring while saving, a check when saved. */
export function DownloadGlyph({ state, progress, onPress, title }: { state: DownloadState | null; progress: number; onPress: () => void; title: string }) {
  const { colors } = useTheme();
  const label =
    state === "done" ? `Downloaded: ${title}` : state === "downloading" ? `Downloading ${Math.round(progress * 100)}%: ${title}` : state === "queued" ? `Waiting to download: ${title}` : state === "paused" ? `Download paused: ${title}` : state === "failed" ? `Download failed: ${title}` : state === "expired" ? `Download expired: ${title}` : `Download: ${title}`;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={styles.action} testID="learning-curriculum-download">
      {state === "done" ? (
        <CheckCircle2 size={18} color={colors.success} />
      ) : state === "downloading" ? (
        <ProgressRing value={progress * 100} size={18} stroke={2} />
      ) : state === "queued" ? (
        <ActivityIndicator size="small" color={colors.subtleForeground} />
      ) : (
        <Download size={18} color={state === "failed" || state === "expired" ? colors.danger : colors.subtleForeground} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { flexDirection: "row", alignItems: "center", paddingVertical: space[4], paddingHorizontal: space[4], borderTopWidth: StyleSheet.hairlineWidth },
  itemWrap: { flexDirection: "row", alignItems: "center", paddingRight: space[2] },
  activeBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  item: { flex: 1, flexDirection: "row", alignItems: "flex-start", paddingVertical: space[3], paddingLeft: space[4], gap: space[3], minHeight: 56 },
  ring: { width: 24, alignItems: "center", paddingTop: 1 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  action: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
