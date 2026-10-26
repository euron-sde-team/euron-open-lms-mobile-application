/**
 * The public curriculum as an accordion: sections on hairlines that open and close, each
 * item with its type icon, title and length, and a lock or "Preview". Tapping a preview
 * opens the classroom at that item (the classroom handles preview access).
 */
import { memo, useState } from "react";
import { LayoutAnimation, Pressable, StyleSheet, View } from "react-native";
import { ChevronDown, ClipboardCheck, FileText, FileType2, ListChecks, Lock, PlayCircle } from "lucide-react-native";
import type { CurriculumItemPublic, CurriculumSectionPublic } from "../../../api/vendor/types";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { space } from "../../../ui/theme/tokens";
import { clock, formatDuration, plural } from "../format";
import { u } from "../styles";

export function kindLabel(item: Pick<CurriculumItemPublic, "kind" | "lectureKind">): string {
  if (item.kind === "QUIZ") return "Quiz";
  if (item.kind === "ASSIGNMENT") return "Project";
  if (item.lectureKind === "ARTICLE") return "Article";
  if (item.lectureKind === "PDF") return "PDF";
  return "Video";
}

function ItemIcon({ item, color }: { item: CurriculumItemPublic; color: string }) {
  const p = { size: 18, color };
  if (item.kind === "QUIZ") return <ListChecks {...p} />;
  if (item.kind === "ASSIGNMENT") return <ClipboardCheck {...p} />;
  if (item.lectureKind === "ARTICLE") return <FileText {...p} />;
  if (item.lectureKind === "PDF") return <FileType2 {...p} />;
  return <PlayCircle {...p} />;
}

const ItemRow = memo(function ItemRowImpl({ item, locked, onPreview }: { item: CurriculumItemPublic; locked: boolean; onPreview: (item: CurriculumItemPublic) => void }) {
  const { colors } = useTheme();
  const body = (
    <View style={styles.item}>
      <ItemIcon item={item} color={colors.subtleForeground} />
      <Text variant="body" tone={item.isPreview ? "link" : "default"} style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
      {item.isPreview ? <Text variant="caption" tone="primary">Preview</Text> : locked ? <Lock size={14} color={colors.subtleForeground} accessibilityLabel="Locked" /> : null}
      {item.durationSeconds > 0 ? <Text variant="caption" tone="subtle" style={styles.len}>{clock(item.durationSeconds)}</Text> : null}
    </View>
  );
  if (!item.isPreview) return <View accessible accessibilityLabel={`${kindLabel(item)}: ${item.title}${locked ? ", locked" : ""}`}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Preview ${kindLabel(item).toLowerCase()}: ${item.title}`} onPress={() => onPreview(item)} testID="catalog-curriculum-preview" style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {body}
    </Pressable>
  );
});

export function Curriculum({ sections, locked, onPreview }: { sections: CurriculumSectionPublic[]; locked: boolean; onPreview: (item: CurriculumItemPublic) => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState<Set<string>>(() => new Set(sections.slice(0, 1).map((s) => s.id)));
  if (!sections.length) return <Text tone="muted">The curriculum is being prepared.</Text>;
  const items = sections.reduce((n, s) => n + s.items.length, 0);
  const total = sections.reduce((n, s) => n + s.durationSeconds, 0);
  const allOpen = sections.every((s) => open.has(s.id));
  const animate = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  const toggle = (id: string) => {
    animate();
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <View testID="catalog-curriculum">
      <View style={styles.summary}>
        <Text variant="small" tone="muted" style={u.flex}>{[plural(sections.length, "section", "sections"), plural(items, "item", "items"), total > 0 ? formatDuration(total) : null].filter(Boolean).join(" · ")}</Text>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={() => { animate(); setOpen(allOpen ? new Set() : new Set(sections.map((s) => s.id))); }} testID="catalog-curriculum-expand">
          <Text variant="smallStrong" tone="link">{allOpen ? "Collapse all" : "Expand all"}</Text>
        </Pressable>
      </View>
      <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
        {sections.map((s, i) => {
          const isOpen = open.has(s.id);
          return (
            <View key={s.id} style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} accessibilityLabel={`Section ${i + 1}: ${s.title}, ${plural(s.items.length, "item", "items")}`} onPress={() => toggle(s.id)} style={styles.sectionHead} testID="catalog-curriculum-section">
                <View style={u.flex}>
                  <Text variant="eyebrow" tone="subtle">{`Section ${i + 1}`}</Text>
                  <Text variant="subheading" style={u.mt2}>{s.title}</Text>
                  <Text variant="caption" tone="muted" style={u.mt2}>{[plural(s.items.length, "item", "items"), s.durationSeconds > 0 ? formatDuration(s.durationSeconds) : null].filter(Boolean).join(" · ")}</Text>
                </View>
                <ChevronDown size={20} color={colors.mutedForeground} style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }} />
              </Pressable>
              {isOpen ? (
                <View style={styles.items}>
                  {s.items.map((it) => (
                    <ItemRow key={it.id} item={it} locked={locked} onPreview={onPreview} />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "center", marginBottom: space[3], gap: space[3] },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[4], minHeight: 44 },
  items: { paddingBottom: space[3] },
  item: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 44, paddingVertical: space[2] },
  itemTitle: { flex: 1 },
  len: { minWidth: 44, textAlign: "right" },
});
