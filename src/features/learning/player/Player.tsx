/**
 * The lesson video player: react-native-video v6 with our own controls (never the native
 * ones). Tap to show or hide the controls (they hide after 3 s while playing), centre
 * play/pause, 10 s back and forward, a scrubber with the buffered track, elapsed and
 * remaining time, a settings sheet (speed, quality, captions, plus what the classroom adds
 * such as the download row), fullscreen locked to landscape with the status bar hidden,
 * the drifting watermark, the poster, a buffering spinner and an error state with retry.
 *
 * Heartbeats (heartbeat.ts) go out every 15 s while playing and on pause, end, background
 * and unmount. A signed source is re-requested through `onRefresh` when it is about to
 * expire or the player fails (an expired session answers 401/403), resuming at the same
 * position. YouTube lessons play in react-native-youtube-iframe with the id from the
 * server's embed URL.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, BackHandler, Image, Pressable, StatusBar, StyleSheet, View, useWindowDimensions } from "react-native";
import { Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, Settings2 } from "lucide-react-native";
import Video, { type OnLoadData, type OnProgressData, type SelectedTrack, type SelectedVideoTrack, type VideoRef } from "react-native-video";
import YoutubePlayer, { type YoutubeIframeRef } from "react-native-youtube-iframe";
import OrientationDirector, { Orientation } from "react-native-orientation-director";
import type { ProgressBeat } from "../../../api/vendor/types";
import { Button } from "../../../ui/components/Button";
import { ChoiceList } from "../../../ui/components/Inputs";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { space } from "../../../ui/theme/tokens";
import { Sheet, SheetLabel } from "../components/Sheet";
import { clock } from "../format";
import { BEAT_INTERVAL_MS, createHeartbeat } from "./heartbeat";
import { useScreenProtection } from "./protect";
import { Scrubber } from "./Scrubber";
import { isExpiring, qualityOptions, resumePoint, SPEEDS, speedLabel, type PlayerSource } from "./source";
import { Watermark } from "./Watermark";
import { u } from "../styles";

export type BeatReason = "interval" | "pause" | "ended" | "background" | "unmount";

export interface PlayerHandle {
  seek(seconds: number): void;
  currentTime(): number;
  pause(): void;
}

export interface PlayerProps {
  source: PlayerSource;
  title: string;
  /** Where to start when the source has no better resume point. */
  startAt?: number;
  /** Screen capture protection while this player is mounted. */
  protect: boolean;
  fullscreen: boolean;
  onFullscreenChange: (on: boolean) => void;
  onBeat?: (beat: ProgressBeat, reason: BeatReason) => void;
  onEnded?: () => void;
  /** Re-request the signed source (expired session, 401/403). */
  onRefresh?: () => Promise<PlayerSource | null>;
  /** Drawn over the video (the "Up next" panel). */
  overlay?: ReactNode;
  /** Extra rows at the end of the settings sheet. */
  menuExtra?: ReactNode;
  autoPlay?: boolean;
}

const HIDE_MS = 3000;
const MAX_REFRESHES = 3;

type Track = { index: number; title?: string; language?: string; height?: number; width?: number };

export const Player = forwardRef<PlayerHandle, PlayerProps>(function PlayerImpl(props, ref) {
  if (props.source.type === "youtube") return <YouTubeLesson {...props} source={props.source} ref={ref} />;
  return <NativePlayer {...props} ref={ref} />;
});

const NativePlayer = forwardRef<PlayerHandle, PlayerProps>(function NativePlayerImpl({ source: initial, title, startAt, protect, fullscreen, onFullscreenChange, onBeat, onEnded, onRefresh, overlay, menuExtra, autoPlay = true }, ref) {
  const { colors, scheme } = useTheme();
  const onVideo = scheme === "dark" ? colors.foreground : colors.card;
  const { width, height } = useWindowDimensions();
  const video = useRef<VideoRef>(null);
  const [source, setSource] = useState<PlayerSource>(initial);
  const [paused, setPaused] = useState(!autoPlay);
  const [position, setPosition] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [rate, setRate] = useState(1);
  const [quality, setQuality] = useState<number | null>(null);
  const [caption, setCaption] = useState<number | null>(null);
  const [videoTracks, setVideoTracks] = useState<Track[]>([]);
  const [textTracks, setTextTracks] = useState<Track[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const hb = useRef(createHeartbeat());
  const pos = useRef(0);
  const dur = useRef(0);
  const playing = useRef(false);
  const pendingSeek = useRef<number | null>(null);
  const refreshes = useRef(0);
  const cbs = useRef({ onBeat, onEnded, onRefresh });
  cbs.current = { onBeat, onEnded, onRefresh };

  useScreenProtection(protect, colors.background);

  // A new lesson (a new source from the parent) starts over.
  useEffect(() => {
    setSource(initial);
    setLoaded(false);
    setError(null);
    pendingSeek.current = initial.resumeAt || startAt || null;
    hb.current = createHeartbeat();
    hb.current.seed(initial.resumeAt || startAt || 0);
    refreshes.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const emit = useCallback((reason: BeatReason) => {
    const beat = hb.current.take(dur.current);
    if (beat) cbs.current.onBeat?.(beat, reason);
  }, []);

  // Heartbeats while playing, on background and on unmount.
  useEffect(() => {
    if (paused || !loaded) return;
    const id = setInterval(() => emit("interval"), BEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [paused, loaded, emit]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") {
        hb.current.pause();
        emit("background");
        setPaused(true);
      }
    });
    return () => {
      sub.remove();
      emit("unmount");
    };
  }, [emit]);

  // Controls hide while playing after a moment without a touch.
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const poke = useCallback(() => {
    setChrome(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChrome(false), HIDE_MS);
  }, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  useEffect(() => {
    if (paused) {
      clearTimeout(hideTimer.current);
      setChrome(true);
    } else poke();
  }, [paused, poke]);

  // Fullscreen: landscape with the status bar hidden; portrait otherwise. Back leaves fullscreen.
  useEffect(() => {
    try {
      if (fullscreen) OrientationDirector.lockTo(Orientation.landscape ?? Orientation.landscapeLeft);
      else OrientationDirector.lockTo(Orientation.portrait);
    } catch {
      /* orientation locking unavailable: the layout still works */
    }
    StatusBar.setHidden(fullscreen, "fade");
    if (!fullscreen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onFullscreenChange(false);
      return true;
    });
    return () => sub.remove();
  }, [fullscreen, onFullscreenChange]);
  useEffect(
    () => () => {
      StatusBar.setHidden(false, "fade");
      try {
        OrientationDirector.lockTo(Orientation.portrait);
      } catch {
        /* nothing to restore */
      }
    },
    []
  );

  const seekTo = useCallback((t: number) => {
    const d = dur.current;
    const target = Math.max(0, d > 0 ? Math.min(d - 0.5, t) : t);
    hb.current.discontinuity();
    video.current?.seek(target);
    pos.current = target;
    setPosition(target);
  }, []);

  const nudge = (by: number) => {
    poke();
    seekTo(pos.current + by);
  };

  useImperativeHandle(ref, () => ({ seek: seekTo, currentTime: () => pos.current, pause: () => setPaused(true) }), [seekTo]);

  const refresh = useCallback(async () => {
    const fn = cbs.current.onRefresh;
    pendingSeek.current = pos.current || pendingSeek.current;
    if (!fn || refreshes.current >= MAX_REFRESHES) {
      setError("The video stopped loading.");
      return;
    }
    refreshes.current += 1;
    try {
      const next = await fn();
      if (!next) throw new Error("no source");
      hb.current.discontinuity();
      setLoaded(false);
      setBuffering(true);
      setError(null);
      setSource(next);
    } catch {
      setError("The video stopped loading.");
    }
  }, []);

  const toggle = useCallback(() => {
    poke();
    if (paused && isExpiring(source.expiresAt)) {
      refresh().then(() => setPaused(false));
      return;
    }
    if (!paused) {
      hb.current.pause();
      emit("pause");
    }
    setPaused((p) => !p);
  }, [paused, source.expiresAt, refresh, emit, poke]);

  const onLoad = (d: OnLoadData) => {
    dur.current = d.duration;
    setDuration(d.duration);
    setLoaded(true);
    setBuffering(false);
    setVideoTracks(d.videoTracks ?? []);
    setTextTracks(d.textTracks ?? []);
    const want = pendingSeek.current;
    pendingSeek.current = null;
    const at = want ? resumePoint(want, d.duration) : 0;
    if (at > 0) seekTo(at);
    refreshes.current = 0;
  };

  const onProgress = (p: OnProgressData) => {
    pos.current = p.currentTime;
    setPosition(p.currentTime);
    setBuffered(p.playableDuration);
    if (!paused) {
      playing.current = true;
      hb.current.sample(p.currentTime, Date.now(), rate);
    }
  };

  const onEnd = () => {
    hb.current.sample(dur.current, Date.now(), rate);
    emit("ended");
    hb.current.pause();
    setPaused(true);
    cbs.current.onEnded?.();
  };

  const selectedVideoTrack: SelectedVideoTrack = quality ? ({ type: "resolution", value: quality } as unknown as SelectedVideoTrack) : ({ type: "auto" } as unknown as SelectedVideoTrack);
  const selectedTextTrack: SelectedTrack = (caption === null ? { type: "disabled" } : { type: "index", value: caption }) as unknown as SelectedTrack;

  const box = fullscreen ? { width, height } : { width: "100%" as const, aspectRatio: 16 / 9 };
  // An overlay (Up next) owns the surface: the controls stay hidden under it.
  const showChrome = !overlay && (chrome || paused || !loaded);
  const qualities = qualityOptions(videoTracks);
  const icon = (n: number) => ({ size: n, color: onVideo });

  return (
    <View style={[styles.box, box, { backgroundColor: colors.shadow }, fullscreen && styles.fullscreen]} testID="player">
      <Video
        ref={video}
        source={{ uri: source.type === "youtube" ? undefined : source.url, ...(source.type === "hls" ? { type: "m3u8" } : {}) }}
        style={StyleSheet.absoluteFill}
        paused={paused}
        rate={rate}
        resizeMode="contain"
        controls={false}
        playInBackground={false}
        ignoreSilentSwitch="ignore"
        preventsDisplaySleepDuringVideoPlayback
        progressUpdateInterval={500}
        selectedVideoTrack={selectedVideoTrack}
        selectedTextTrack={selectedTextTrack}
        onLoad={onLoad}
        onProgress={onProgress}
        onBuffer={(b) => setBuffering(b.isBuffering)}
        onSeek={() => hb.current.discontinuity()}
        onEnd={onEnd}
        onError={() => refresh()}
      />
      {!loaded && source.posterUrl ? <Image source={{ uri: source.posterUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
      {source.watermark ? <Watermark text={source.watermark} color={onVideo} /> : null}

      <Pressable style={StyleSheet.absoluteFill} onPress={() => (chrome && !paused ? setChrome(false) : poke())} accessibilityLabel={showChrome ? "Hide player controls" : "Show player controls"} testID="player-surface">
        {showChrome ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} pointerEvents="box-none">
            <View style={styles.top} pointerEvents="box-none">
              <Text variant="smallStrong" numberOfLines={1} style={[u.flex1, { color: onVideo }]}>
                {fullscreen ? title : ""}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Player settings" onPress={() => setSheet(true)} hitSlop={10} style={styles.iconHit} testID="player-settings">
                <Settings2 {...icon(22)} />
              </Pressable>
            </View>
            <View style={styles.centre} pointerEvents="box-none">
              <Pressable accessibilityRole="button" accessibilityLabel="Back 10 seconds" onPress={() => nudge(-10)} hitSlop={10} style={styles.iconHit} testID="player-back10">
                <RotateCcw {...icon(28)} />
              </Pressable>
              {buffering && !paused ? (
                <View style={styles.bigHit}>
                  <ActivityIndicator color={onVideo} size="large" />
                </View>
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel={paused ? "Play" : "Pause"} onPress={toggle} hitSlop={10} style={styles.bigHit} testID="player-toggle">
                  {paused ? <Play {...icon(44)} fill={onVideo} /> : <Pause {...icon(44)} fill={onVideo} />}
                </Pressable>
              )}
              <Pressable accessibilityRole="button" accessibilityLabel="Forward 10 seconds" onPress={() => nudge(10)} hitSlop={10} style={styles.iconHit} testID="player-fwd10">
                <RotateCw {...icon(28)} />
              </Pressable>
            </View>
            <View style={styles.bottom} pointerEvents="box-none">
              <Text variant="caption" style={[styles.time, { color: onVideo }]}>{clock(dragging ?? position)}</Text>
              <Scrubber
                position={position}
                buffered={buffered}
                duration={duration}
                onSeek={(t) => {
                  poke();
                  seekTo(t);
                }}
                onDragChange={(t) => {
                  setDragging(t);
                  if (t !== null) clearTimeout(hideTimer.current);
                }}
                colors={{ fill: colors.brand, track: colors.overlay, buffered: colors.mutedForeground, thumb: onVideo }}
              />
              <Text variant="caption" style={[styles.time, { color: onVideo }]}>{`-${clock(Math.max(0, duration - (dragging ?? position)))}`}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={fullscreen ? "Exit full screen" : "Full screen"} onPress={() => onFullscreenChange(!fullscreen)} hitSlop={10} style={styles.iconHit} testID="player-fullscreen">
                {fullscreen ? <Minimize {...icon(20)} /> : <Maximize {...icon(20)} />}
              </Pressable>
            </View>
          </View>
        ) : null}
      </Pressable>

      {error ? (
        <View style={[StyleSheet.absoluteFill, styles.error, { backgroundColor: colors.scrim }]} testID="player-error">
          <Text variant="bodyStrong" center style={{ color: onVideo }}>{error}</Text>
          <Button
            label="Try again"
            variant="outline"
            size="sm"
            style={{ marginTop: space[3] }}
            onPress={() => {
              refreshes.current = 0;
              refresh();
            }}
          />
        </View>
      ) : null}
      {overlay}

      <Sheet visible={sheet} title="Playback" onClose={() => setSheet(false)} testID="player-sheet">
        <SheetLabel>Speed</SheetLabel>
        <ChoiceList options={SPEEDS.map((s) => ({ value: String(s), label: speedLabel(s) }))} selected={[String(rate)]} onToggle={(v) => setRate(Number(v))} />
        {qualities.length > 1 ? (
          <>
            <SheetLabel>Quality</SheetLabel>
            <ChoiceList options={[{ value: "auto", label: "Auto" }, ...qualities.map((h) => ({ value: String(h), label: `${h}p` }))]} selected={[quality ? String(quality) : "auto"]} onToggle={(v) => setQuality(v === "auto" ? null : Number(v))} />
          </>
        ) : null}
        {textTracks.length ? (
          <>
            <SheetLabel>Captions</SheetLabel>
            <ChoiceList
              options={[{ value: "off", label: "Off" }, ...textTracks.map((t) => ({ value: String(t.index), label: t.title || t.language || `Track ${t.index + 1}` }))]}
              selected={[caption === null ? "off" : String(caption)]}
              onToggle={(v) => setCaption(v === "off" ? null : Number(v))}
            />
          </>
        ) : null}
        {menuExtra}
      </Sheet>
    </View>
  );
});

/** YouTube lessons: YouTube draws its own controls; heartbeats sample its clock once a second. */
const YouTubeLesson = forwardRef<PlayerHandle, PlayerProps & { source: Extract<PlayerSource, { type: "youtube" }> }>(function YouTubeLessonImpl({ source, startAt, fullscreen, onFullscreenChange, onBeat, onEnded, overlay }, ref) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const yt = useRef<YoutubeIframeRef>(null);
  const [playing, setPlaying] = useState(true);
  const hb = useRef(createHeartbeat());
  const pos = useRef(0);
  const cbs = useRef({ onBeat, onEnded });
  cbs.current = { onBeat, onEnded };

  const emit = useCallback((reason: BeatReason) => {
    const beat = hb.current.take();
    if (beat) cbs.current.onBeat?.(beat, reason);
  }, []);

  useEffect(() => {
    hb.current.seed(source.resumeAt || startAt || 0);
  }, [source, startAt]);

  useEffect(() => {
    if (!playing) return;
    const tick = setInterval(() => {
      yt.current?.getCurrentTime().then((t) => {
        pos.current = t;
        hb.current.sample(t, Date.now());
      });
    }, 1000);
    const beat = setInterval(() => emit("interval"), BEAT_INTERVAL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(beat);
    };
  }, [playing, emit]);
  useEffect(() => () => emit("unmount"), [emit]);

  useImperativeHandle(ref, () => ({ seek: (t) => {
        hb.current.discontinuity();
        yt.current?.seekTo(t, true);
      }, currentTime: () => pos.current, pause: () => setPlaying(false) }), []);

  return (
    <View style={[u.full, styles.youtube, { backgroundColor: colors.shadow }]} testID="player">
      <YoutubePlayer
        ref={yt}
        height={(width * 9) / 16}
        width={width}
        videoId={source.videoId}
        play={playing}
        initialPlayerParams={{ start: Math.floor(source.resumeAt || startAt || 0), modestbranding: true, rel: false }}
        onFullScreenChange={(f: boolean) => fullscreen !== f && onFullscreenChange(f)}
        onChangeState={(s: string) => {
          if (s === "paused") {
            hb.current.pause();
            emit("pause");
            setPlaying(false);
          } else if (s === "playing") setPlaying(true);
          else if (s === "ended") {
            emit("ended");
            setPlaying(false);
            cbs.current.onEnded?.();
          }
        }}
      />
      {overlay}
    </View>
  );
});

const styles = StyleSheet.create({
  box: { overflow: "hidden", justifyContent: "center" },
  youtube: { aspectRatio: 16 / 9 },
  fullscreen: { position: "absolute", top: 0, left: 0, zIndex: 10 },
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: space[3], paddingTop: space[2] },
  centre: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[10] },
  bottom: { flexDirection: "row", alignItems: "center", paddingHorizontal: space[3], paddingBottom: space[1], gap: space[2] },
  time: { minWidth: 44, textAlign: "center", fontVariant: ["tabular-nums"] },
  iconHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  bigHit: { width: 72, height: 72, alignItems: "center", justifyContent: "center" },
  error: { alignItems: "center", justifyContent: "center", padding: space[6] },
});
