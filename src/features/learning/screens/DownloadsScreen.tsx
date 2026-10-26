/**
 * Downloads: the videos saved on this phone, grouped by course, with storage used, each
 * one's state (downloading, paused, failed, expiry), pause / resume / delete, and delete
 * all. Tapping a saved video plays it offline in a full-screen player (through the
 * loopback server for HLS), with the watermark and capture protection. Also the screen the
 * app opens on when it starts offline (app/OfflineScreen.tsx), so it needs nothing but
 * the engine and works without the server.
 */
import { useCallback, useMemo, useState } from "react";
import { Alert, Modal, Pressable, SectionList, StyleSheet, View } from "react-native";
import { MoreHorizontal, Pause, Play, RotateCw, X } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../../../app/session";
import { Button, IconButton } from "../../../ui/components/Button";
import { EmptyState, ProgressBar } from "../../../ui/components/Feedback";
import { Header } from "../../../ui/components/Layout";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { space } from "../../../ui/theme/tokens";
import { downloadManager } from "../downloads/engine";
import { isLoopbackAvailable } from "../downloads/loopback";
import { effectiveState, groupByCourse, totalBytes, type DownloadEntry } from "../downloads/state";
import { useDownloads } from "../downloads/useDownloads";
import { expiryLine, formatBytes, formatDuration } from "../format";
import { Player } from "../player/Player";
import { shouldProtect } from "../player/protect";
import type { PlayerSource } from "../player/source";
import { u } from "../styles";

/** The status line under a saved video. Pure. */
export function downloadStatus(d: DownloadEntry, now: number = Date.now()): string {
  const size = formatBytes(d.bytes);
  switch (effectiveState(d, now)) {
    case "done":
      return [size, d.offlineExpiresAt ? expiryLine(d.offlineExpiresAt, now) : null].filter(Boolean).join(" · ");
    case "downloading":
      return `Downloading ${Math.round(d.progress * 100)}%${size ? ` · ${size}` : ""}`;
    case "queued":
      return "Waiting to download";
    case "paused":
      return d.error ?? `Paused at ${Math.round(d.progress * 100)}%`;
    case "failed":
      return d.error ?? "The download stopped";
    case "expired":
      return "Expired. Connect to the internet to renew";
  }
}

export function DownloadsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { status } = useSession();
  const entries = useDownloads();
  const [playing, setPlaying] = useState<{ entry: DownloadEntry; source: PlayerSource } | null>(null);
  const sections = useMemo(() => groupByCourse(entries).map((g) => ({ title: g.courseTitle, key: g.courseSlug, data: g.entries })), [entries]);
  const used = totalBytes(entries);
  const m = downloadManager();

  const play = useCallback(async (d: DownloadEntry) => {
    try {
      const src = await downloadManager().offlineSource(d.itemId);
      if (!src) {
        Alert.alert("This download cannot play", effectiveState(d) === "expired" ? "Its licence expired. Connect to the internet to renew it." : "Download it again from the course.");
        return;
      }
      setPlaying({ entry: d, source: { type: src.kind, url: src.uri, posterUrl: null, watermark: src.watermark, resumeAt: 0, expiresAt: null, offline: true } });
    } catch {
      Alert.alert("This download cannot play", "Restart the app and try again.");
    }
  }, []);

  const menu = useCallback(
    (d: DownloadEntry) => {
      const s = effectiveState(d);
      const buttons: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [];
      if (s === "downloading" || s === "queued") buttons.push({ text: "Pause", onPress: () => m.pause(d.itemId) });
      if (s === "paused" || s === "failed") buttons.push({ text: "Resume", onPress: () => m.resume(d.itemId) });
      buttons.push({ text: "Delete", style: "destructive", onPress: () => m.remove(d.itemId) });
      buttons.push({ text: "Cancel", style: "cancel" });
      Alert.alert(d.title, downloadStatus(d), buttons);
    },
    [m]
  );

  const deleteAll = () =>
    Alert.alert("Delete every download?", "The videos are removed from this phone. You can download them again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete all", style: "destructive", onPress: () => m.removeAll() },
    ]);

  const canGoBack = navigation.canGoBack();
  const summary = entries.length ? `${entries.length} ${entries.length === 1 ? "video" : "videos"}${used ? ` · ${formatBytes(used)} used` : ""}` : null;

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]} testID="learning-downloads">
      <Header title="Downloads" onBack={canGoBack ? () => navigation.goBack() : undefined} right={entries.length ? <Pressable accessibilityRole="button" onPress={deleteAll} hitSlop={8} testID="learning-downloads-delete-all"><Text variant="smallStrong" tone="danger">Delete all</Text></Pressable> : undefined} />
      {status === "offline" ? <Text variant="small" tone="muted" style={styles.banner}>You are offline. Saved videos still play.</Text> : null}
      {!isLoopbackAvailable() ? (
        <EmptyState title="Downloads are not available" body="This build of the app cannot save videos for offline viewing." testID="learning-downloads-unavailable" />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(d) => d.itemId}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[u.grow, { paddingHorizontal: space[4], paddingBottom: space[10] + insets.bottom }]}
          ListHeaderComponent={summary ? <Text variant="small" tone="muted" style={{ marginTop: space[4] }} testID="learning-downloads-summary">{summary}</Text> : undefined}
          ListEmptyComponent={<EmptyState title="No downloads yet" body="Save video lessons from a course to watch them without a connection." testID="learning-downloads-empty" />}
          renderSectionHeader={({ section }) => <Text variant="eyebrow" tone="subtle" style={styles.sectionHead}>{section.title}</Text>}
          renderItem={({ item, index, section }) => <DownloadRow entry={item} last={index === section.data.length - 1} onPlay={play} onMenu={menu} />}
        />
      )}
      <OfflinePlayer playing={playing} onClose={() => setPlaying(null)} />
    </View>
  );
}

function DownloadRow({ entry: d, last, onPlay, onMenu }: { entry: DownloadEntry; last: boolean; onPlay: (d: DownloadEntry) => void; onMenu: (d: DownloadEntry) => void }) {
  const { colors } = useTheme();
  const s = effectiveState(d);
  const m = downloadManager();
  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]} testID="learning-download-row">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={s === "done" ? `Play ${d.title} offline` : `${d.title}, ${downloadStatus(d)}`}
        onPress={() => (s === "done" ? onPlay(d) : onMenu(d))}
        style={({ pressed }) => [styles.main, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={styles.glyph}>
          {s === "done" ? <Play size={20} color={colors.foreground} fill={colors.foreground} /> : s === "downloading" || s === "queued" ? <Pause size={20} color={colors.mutedForeground} /> : <RotateCw size={20} color={s === "failed" || s === "expired" ? colors.danger : colors.mutedForeground} />}
        </View>
        <View style={u.flex1}>
          <Text variant="bodyStrong" numberOfLines={2}>{d.title}</Text>
          <Text variant="small" tone={s === "failed" || s === "expired" ? "danger" : "muted"} style={u.mt2}>
            {[d.durationSeconds && s === "done" ? formatDuration(d.durationSeconds) : null, downloadStatus(d)].filter(Boolean).join(" · ")}
          </Text>
          {s === "downloading" || s === "paused" ? <ProgressBar value={d.progress * 100} style={{ marginTop: space[2] }} /> : null}
        </View>
      </Pressable>
      {s === "downloading" || s === "queued" ? (
        <IconButton label={`Pause ${d.title}`} onPress={() => m.pause(d.itemId)} icon={<Pause size={18} color={colors.subtleForeground} />} />
      ) : s === "paused" || s === "failed" ? (
        <IconButton label={`Resume ${d.title}`} onPress={() => m.resume(d.itemId)} icon={<RotateCw size={18} color={colors.subtleForeground} />} />
      ) : null}
      <IconButton label={`More for ${d.title}`} onPress={() => onMenu(d)} icon={<MoreHorizontal size={18} color={colors.subtleForeground} />} />
    </View>
  );
}

function OfflinePlayer({ playing, onClose }: { playing: { entry: DownloadEntry; source: PlayerSource } | null; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [fullscreen, setFullscreen] = useState(false);
  const close = () => {
    setFullscreen(false);
    onClose();
  };
  return (
    <Modal visible={!!playing} animationType="fade" onRequestClose={close} supportedOrientations={["portrait", "landscape"]}>
      <View style={[styles.fill, { backgroundColor: colors.background, paddingTop: fullscreen ? space[0] : insets.top }]}>
        {!fullscreen ? (
          <View style={styles.playerHead}>
            <Text variant="subheading" numberOfLines={1} style={u.flex1}>{playing?.entry.title ?? ""}</Text>
            <IconButton label="Close" onPress={close} icon={<X size={22} color={colors.foreground} />} />
          </View>
        ) : null}
        {playing ? <Player source={playing.source} title={playing.entry.title} protect={shouldProtect({ offline: true, isPreview: false, accessMode: null })} fullscreen={fullscreen} onFullscreenChange={setFullscreen} /> : null}
        {!fullscreen && playing ? (
          <View style={{ padding: space[4] }}>
            <Text variant="small" tone="muted">{playing.entry.courseTitle}</Text>
            <Text variant="small" tone="muted" style={{ marginTop: space[1] }}>Progress is not recorded while you watch offline.</Text>
            <Button label="Close" variant="outline" onPress={close} style={[u.selfStart, { marginTop: space[5] }]} />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  banner: { paddingHorizontal: space[4], paddingTop: space[3] },
  sectionHead: { marginTop: space[6], marginBottom: space[1] },
  row: { flexDirection: "row", alignItems: "center" },
  main: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: space[3], paddingVertical: space[3], minHeight: 60 },
  glyph: { width: 28, alignItems: "center", paddingTop: 2 },
  playerHead: { flexDirection: "row", alignItems: "center", paddingLeft: space[4], paddingRight: space[2], height: 52 },
});
