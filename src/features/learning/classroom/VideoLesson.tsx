/**
 * A video lecture in the classroom: mints playback (POST /api/learn/items/:itemId/playback,
 * never cached, a session is single use), hands it to the Player, sends heartbeats for
 * learners, protects paid video from capture, and shows "Up next" with a 5 second
 * cancellable countdown when autoplay is on.
 */
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Switch, View, useWindowDimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../../app/session";
import { isApiError } from "../../../api/vendor/client/errors";
import type { AccessMode, Classroom, ClassroomItem, ItemContent } from "../../../api/vendor/types";
import { prefs } from "../../../lib/storage";
import { Button } from "../../../ui/components/Button";
import { Skeleton } from "../../../ui/components/Feedback";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { space } from "../../../ui/theme/tokens";
import { STOP_CODES } from "../player/heartbeat";
import { Player, type PlayerHandle } from "../player/Player";
import { shouldProtect } from "../player/protect";
import { sourceFromPlayback, type PlayerSource } from "../player/source";
import { playbackKey } from "./hooks";
import { SheetLabel } from "../components/Sheet";
import { u } from "../styles";

type LectureContent = Extract<ItemContent, { kind: "LECTURE" }>;
type VideoLecture = Extract<LectureContent["lecture"], { lectureKind: "VIDEO" }>;

const AUTOPLAY_KEY = "learning.autoplay";
export const COUNTDOWN_SECONDS = 5;

export function readAutoplay(): boolean {
  return prefs.getString(AUTOPLAY_KEY) !== "off";
}

export interface VideoLessonProps {
  content: LectureContent;
  lecture: VideoLecture;
  role: Classroom["role"];
  accessMode: AccessMode | null;
  nextItem: ClassroomItem | null;
  fullscreen: boolean;
  onFullscreenChange: (on: boolean) => void;
  onProgress: (itemId: string, result: import("../../../api/vendor/types").ProgressResult) => void;
  onNext: (item: ClassroomItem) => void;
  /** The download row for the settings sheet, when downloads are offered. */
  downloadRow?: React.ReactNode;
}

export const VideoLesson = forwardRef<PlayerHandle, VideoLessonProps>(function VideoLessonImpl({ content, lecture, role, accessMode, nextItem, fullscreen, onFullscreenChange, onProgress, onNext, downloadRow }, ref) {
  const { api } = useSession();
  const itemId = content.item.id;
  const ready = lecture.videoStatus === "READY";
  const playback = useQuery({ queryKey: playbackKey(itemId), queryFn: () => api.learn.playback(itemId), enabled: ready, staleTime: Infinity, gcTime: 0, retry: false });
  const [autoplay, setAutoplay] = useState(readAutoplay);
  const [ended, setEnded] = useState(false);
  const tracking = useRef(role === "LEARNER");
  useEffect(() => {
    tracking.current = role === "LEARNER";
    setEnded(false);
  }, [role, itemId]);

  const onBeat = useCallback(
    (beat: import("../../../api/vendor/types").ProgressBeat) => {
      if (!tracking.current) return;
      api.learn
        .progress(itemId, beat, { keepalive: true })
        .then((r) => onProgress(itemId, r))
        .catch((e: unknown) => {
          if (isApiError(e) && STOP_CODES.has(e.code)) tracking.current = false;
        });
    },
    [api, itemId, onProgress]
  );

  const onRefresh = useCallback(async (): Promise<PlayerSource | null> => sourceFromPlayback(await api.learn.playback(itemId)), [api, itemId]);
  // One source object per minted session: the player starts over whenever it changes.
  const source = useMemo(() => (playback.data ? sourceFromPlayback(playback.data) : null), [playback.data]);

  if (!ready) {
    return <VideoNotice title={lecture.videoStatus === "FAILED" ? "This video could not be processed" : "This video is still processing"} body={lecture.videoStatus === "FAILED" ? "The instructor has been told. Try another lesson for now." : "It will be ready in a few minutes."} />;
  }
  if (playback.isPending) return <VideoSkeleton />;
  if (playback.isError) {
    const code = isApiError(playback.error) ? playback.error.code : null;
    return <VideoNotice title="The video did not start" body={code === "VIDEO_NOT_READY" ? "It is still processing. Try again shortly." : "Check your connection and try again."} onRetry={() => playback.refetch()} />;
  }
  if (!source) return <VideoNotice title="This video cannot play in the app" body="Open the lesson on the website instead." />;
  const startAt = content.progress.completed ? source.resumeAt || 0 : source.resumeAt || content.progress.positionSeconds;

  return (
    <Player
      ref={ref}
      source={source}
      title={content.item.title}
      startAt={startAt}
      protect={shouldProtect({ offline: false, isPreview: content.item.isPreview, accessMode })}
      fullscreen={fullscreen}
      onFullscreenChange={onFullscreenChange}
      onBeat={onBeat}
      onEnded={() => setEnded(true)}
      onRefresh={onRefresh}
      overlay={ended && nextItem ? <UpNext title={nextItem.title} countdown={autoplay} onGo={() => onNext(nextItem)} onCancel={() => setEnded(false)} /> : null}
      menuExtra={
        <>
          {nextItem ? (
            <>
              <SheetLabel>Lessons</SheetLabel>
              <View style={styles.switchRow}>
                <Text style={u.flex1}>Autoplay the next lesson</Text>
                <Switch
                  value={autoplay}
                  accessibilityLabel="Autoplay the next lesson"
                  onValueChange={(v) => {
                    setAutoplay(v);
                    prefs.setString(AUTOPLAY_KEY, v ? "on" : "off");
                  }}
                  testID="learning-autoplay"
                />
              </View>
            </>
          ) : null}
          {downloadRow}
        </>
      }
    />
  );
});

/** "Up next" over the end of the video, with a countdown when autoplay is on. */
export function UpNext({ title, countdown, onGo, onCancel }: { title: string; countdown: boolean; onGo: () => void; onCancel: () => void }) {
  const { colors, scheme } = useTheme();
  const onVideo = scheme === "dark" ? colors.foreground : colors.card;
  const [left, setLeft] = useState(COUNTDOWN_SECONDS);
  const [running, setRunning] = useState(countdown);
  const go = useRef(onGo);
  go.current = onGo;
  useEffect(() => {
    if (!running) return;
    if (left <= 0) {
      go.current();
      return;
    }
    const id = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(id);
  }, [left, running]);
  return (
    <View style={[StyleSheet.absoluteFill, styles.upNext, styles.upNextScrim]} accessibilityViewIsModal testID="learning-up-next">
      <Text variant="eyebrow" style={[u.dim, { color: onVideo }]}>Up next</Text>
      <Text variant="heading" center style={{ color: onVideo, marginTop: space[1] }} numberOfLines={2}>{title}</Text>
      {running ? <Text variant="small" style={{ color: onVideo, marginTop: space[2] }} accessibilityLiveRegion="polite">{`Starting in ${left} ${left === 1 ? "second" : "seconds"}`}</Text> : null}
      <View style={styles.upNextRow}>
        <Button label="Play now" variant="outline" size="sm" onPress={onGo} testID="learning-up-next-play" />
        <Pressable accessibilityRole="button" onPress={() => (running ? setRunning(false) : onCancel())} hitSlop={8} style={styles.upNextCancel} testID="learning-up-next-cancel">
          <Text variant="smallStrong" style={{ color: onVideo }}>{running ? "Cancel" : "Close"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function VideoSkeleton() {
  const { width } = useWindowDimensions();
  return <Skeleton height={Math.round((width * 9) / 16)} rounded={0} />;
}

export function VideoNotice({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.notice, { backgroundColor: colors.ground2 }]} accessibilityRole="summary" testID="learning-video-notice">
      <Text variant="bodyStrong" center>{title}</Text>
      <Text variant="small" tone="muted" center style={{ marginTop: space[1] }}>{body}</Text>
      {onRetry ? <Button label="Try again" variant="ghost" size="sm" onPress={onRetry} style={{ marginTop: space[2] }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: "row", alignItems: "center", paddingVertical: space[3] },
  upNext: { alignItems: "center", justifyContent: "center", padding: space[6] },
  // Over moving video the text needs a near-opaque ground, in both themes.
  upNextScrim: { backgroundColor: "rgba(8, 12, 22, 0.88)" },
  upNextCancel: { minHeight: 34, justifyContent: "center", paddingHorizontal: space[4], marginLeft: space[2] },
  upNextRow: { flexDirection: "row", marginTop: space[4] },
  notice: { aspectRatio: 16 / 9, alignItems: "center", justifyContent: "center", paddingHorizontal: space[6] },
});
