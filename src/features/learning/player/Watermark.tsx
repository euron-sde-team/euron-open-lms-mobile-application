/**
 * The playback watermark (the learner's email or the text the server sends), drifting
 * slowly between spots at low opacity so it cannot be cropped out and never sits still
 * over the same words.
 */
import { memo, useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Text } from "../../../ui/components/Text";
import { u } from "../styles";

const DRIFT_MS = 9000;

export const Watermark = memo(function WatermarkImpl({ text, color }: { text: string; color: string }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const pos = useRef(new Animated.ValueXY({ x: 16, y: 16 })).current;

  useEffect(() => {
    if (!box.w || !box.h) return;
    let alive = true;
    const hop = () => {
      if (!alive) return;
      const x = 12 + Math.random() * Math.max(0, box.w * 0.55);
      const y = 12 + Math.random() * Math.max(0, box.h - 40);
      Animated.timing(pos, { toValue: { x, y }, duration: DRIFT_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start(({ finished }) => finished && hop());
    };
    hop();
    return () => {
      alive = false;
      pos.stopAnimation();
    };
  }, [box, pos]);

  const onLayout = (e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout} importantForAccessibility="no-hide-descendants">
      <Animated.View style={[u.faint, { transform: pos.getTranslateTransform() }]}>
        <Text variant="smallStrong" style={{ color }} numberOfLines={1} testID="player-watermark">
          {text}
        </Text>
      </Animated.View>
    </View>
  );
});
