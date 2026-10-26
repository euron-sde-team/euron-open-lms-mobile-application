/**
 * The Resources and Overview tabs. Resources are the lecture's files and links: open in the
 * system browser (only http and https leave the app) or share. Overview is the course, the
 * lesson's notes from the instructor and who teaches it.
 */
import { Linking, Pressable, Share, StyleSheet, View } from "react-native";
import { ExternalLink, FileText, Share2 } from "lucide-react-native";
import type { CourseDetail, ItemContent, LectureResource } from "../../../api/vendor/types";
import { IconButton } from "../../../ui/components/Button";
import { EmptyState } from "../../../ui/components/Feedback";
import { Html } from "../../../ui/components/Html";
import { Avatar } from "../../../ui/components/Media";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { space } from "../../../ui/theme/tokens";
import { safeExternalUrl } from "../../../lib/urls";
import { formatBytes } from "../format";
import { u } from "../styles";

export function resourceDetail(r: LectureResource): string {
  if (r.external) {
    const m = /^https?:\/\/([^/?#]+)/i.exec(r.url);
    return m ? m[1] : "Link";
  }
  return [r.fileName, formatBytes(r.sizeBytes)].filter(Boolean).join(" · ") || "File";
}

export function ResourcesTab({ resources }: { resources: LectureResource[] }) {
  const { colors } = useTheme();
  if (!resources.length) return <EmptyState title="No resources for this lesson" body="Files and links the instructor adds appear here." />;
  return (
    <View testID="learning-resources">
      {resources.map((r, i) => {
        const url = safeExternalUrl(r.url);
        return (
          <View key={r.id} style={[styles.row, i < resources.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Open ${r.title}`}
              disabled={!url}
              onPress={() => url && Linking.openURL(url).catch(() => undefined)}
              style={({ pressed }) => [styles.main, { opacity: pressed ? 0.7 : 1 }]}
              testID="learning-resource"
            >
              {r.external ? <ExternalLink size={18} color={colors.mutedForeground} /> : <FileText size={18} color={colors.mutedForeground} />}
              <View style={u.flex1}>
                <Text variant="bodyStrong" numberOfLines={2}>{r.title}</Text>
                <Text variant="small" tone="muted" numberOfLines={1}>{resourceDetail(r)}</Text>
              </View>
            </Pressable>
            {url ? <IconButton label={`Share ${r.title}`} onPress={() => Share.share({ url, message: url, title: r.title }).catch(() => undefined)} icon={<Share2 size={18} color={colors.subtleForeground} />} /> : null}
          </View>
        );
      })}
    </View>
  );
}

export function OverviewTab({ content, courseTitle, course, onCourse, onInstructor }: { content: ItemContent; courseTitle: string; course: CourseDetail | undefined; onCourse: () => void; onInstructor: (username: string) => void }) {
  const { colors } = useTheme();
  const notesHtml = content.kind === "LECTURE" && content.lecture.lectureKind !== "ARTICLE" ? content.lecture.notesHtml : null;
  return (
    <View style={{ paddingTop: space[4] }} testID="learning-overview">
      <Text variant="eyebrow" tone="subtle">Course</Text>
      <Text variant="heading" style={{ marginTop: space[1] }}>{courseTitle}</Text>
      {course?.subtitle ? <Text tone="muted" style={{ marginTop: space[1] }}>{course.subtitle}</Text> : null}
      <Pressable accessibilityRole="link" onPress={onCourse} hitSlop={8} style={[u.linkHit, { marginTop: space[2] }]} testID="learning-overview-course">
        <Text variant="smallStrong" tone="link">About this course</Text>
      </Pressable>
      {notesHtml ? (
        <View style={[styles.block, { borderTopColor: colors.border }]}>
          <Text variant="eyebrow" tone="subtle" style={{ marginBottom: space[2] }}>About this lesson</Text>
          <Html html={notesHtml} compact />
        </View>
      ) : null}
      {course?.instructors.length ? (
        <View style={[styles.block, { borderTopColor: colors.border }]}>
          <Text variant="eyebrow" tone="subtle" style={{ marginBottom: space[1] }}>{course.instructors.length === 1 ? "Instructor" : "Instructors"}</Text>
          {course.instructors.map((p) => (
            <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={p.displayName} onPress={() => onInstructor(p.username)} style={styles.person}>
              <Avatar uri={p.avatarUrl} name={p.displayName} size={40} />
              <View style={u.flex1}>
                <Text variant="bodyStrong">{p.displayName}</Text>
                {p.headline ? <Text variant="small" tone="muted">{p.headline}</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[3], minHeight: 56 },
  block: { marginTop: space[6], paddingTop: space[5], borderTopWidth: StyleSheet.hairlineWidth },
  person: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[2], minHeight: 52 },
});
