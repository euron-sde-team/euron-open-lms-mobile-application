/**
 * The seek bar: played and buffered tracks, a thumb, and dragging with a live preview. The
 * seek happens on release so a drag is one jump for the player and the heartbeat.
 */
import { memo, useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { spokenTime } from "../format";

export function ratioToTime(x: number, width: number, duration: number): number {
  if (!(width > 0) || !(duration > 0)) return 0;
  return Math.max(0, Math.min(1, x / width)) * duration;
}

export const Scrubber = memo(function ScrubberImpl({ position, buffered, duration, onSeek, onDragChange, colors }: {
  position: number;
  buffered: number;
  duration: number;
  onSeek: (t: number) => void;
  onDragChange?: (t: number | null) => void;
  colors: { fill: string; track: string; buffered: string; thumb: string };
}) {
  const width = useRef(0);
  const [drag, setDrag] = useState<number | null>(null);
  const cb = useRef({ onSeek, onDragChange, duration });
  cb.current = { onSeek, onDragChange, duration };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const t = ratioToTime(e.nativeEvent.locationX, width.current, cb.current.duration);
          setDrag(t);
          cb.current.onDragChange?.(t);
        },
        onPanResponderMove: (e) => {
          const t = ratioToTime(e.nativeEvent.locationX, width.current, cb.current.duration);
          setDrag(t);
          cb.current.onDragChange?.(t);
        },
        onPanResponderRelease: (e) => {
          const t = ratioToTime(e.nativeEvent.locationX, width.current, cb.current.duration);
          setDrag(null);
          cb.current.onDragChange?.(null);
          cb.current.onSeek(t);
        },
        onPanResponderTerminate: () => {
          setDrag(null);
          cb.current.onDragChange?.(null);
        },
      }),
    []
  );

  const shown = drag ?? position;
  const pct = (t: number) => (duration > 0 ? `${Math.max(0, Math.min(100, (t / duration) * 100))}%` : "0%") as `${number}%`;

  return (
    <View
      style={styles.hit}
      onLayout={(e: LayoutChangeEvent) => (width.current = e.nativeEvent.layout.width)}
      accessibilityRole="adjustable"
      accessibilityLabel="Seek"
      accessibilityValue={{ text: `${spokenTime(shown)} of ${spokenTime(duration)}` }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => onSeek(Math.max(0, Math.min(duration, position + (e.nativeEvent.actionName === "increment" ? 10 : -10))))}
      testID="player-scrubber"
      {...responder.panHandlers}
    >
      <View pointerEvents="none" style={[styles.track, { backgroundColor: colors.track }]}>
        <View style={[styles.abs, { width: pct(buffered), backgroundColor: colors.buffered }]} />
        <View style={[styles.abs, { width: pct(shown), backgroundColor: colors.fill }]} />
      </View>
      <View pointerEvents="none" style={[styles.thumb, { left: pct(shown), backgroundColor: colors.thumb, transform: [{ translateX: -7 }, { scale: drag !== null ? 1.25 : 1 }] }]} />
    </View>
  );
});

const styles = StyleSheet.create({
  hit: { height: 32, justifyContent: "center", flex: 1 },
  track: { height: 3, borderRadius: 2, overflow: "hidden" },
  abs: { position: "absolute", left: 0, top: 0, bottom: 0 },
  thumb: { position: "absolute", width: 14, height: 14, borderRadius: 7, top: 9 },
});
