import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { CardBack } from '@/components/CardBack';
import { CARD_ART } from '@/data/cardArt';
import { color, motion, radius, type } from '@/theme/tokens';
import type { Card, Draw } from '@/data/types';

/**
 * Portrait fan geometry.
 *
 * The design is desktop-shaped (1100x820 stage, 160x260 cards, a 70deg span at
 * radius 570). Scaling that down to a 390pt viewport -- which is what the
 * original `fit()` does -- lands on ~67pt cards, far too small to read or tap.
 * So the geometry is re-derived for portrait rather than scaled.
 *
 * The numbers below are chosen so that, on a 390pt-wide screen, the outermost
 * card *centres* stay on screen (only their outer halves clip, which reads as a
 * real fanned hand) while adjacent cards still reveal ~18pt of themselves.
 */
const CARD_W = 88;
const CARD_H = 132; // true 2:3, per tokens
const FAN_SPAN = 64; // total degrees swept by the fan
const PIVOT_D = 340; // card centre -> rotation pivot, i.e. the arc radius
const SLOT_GAP = 16;
const SLOT_SCALE = 1.02; // the design's lift on a chosen card
const HEADER_H = 118;
const FOOTER_H = 96;

const CARD_EASING = Easing.bezier(...motion.card.bezier);
const FLIP_EASING = Easing.bezier(...motion.flip.bezier);
const CARD_TIMING = { duration: motion.card.duration, easing: CARD_EASING };
const FLIP_TIMING = { duration: motion.flip.duration, easing: FLIP_EASING };

export type CardFanProps = {
  /** Pre-shuffled deck. Position in this array is the pick order the user sees. */
  deck: Draw[];
  /** How many cards this service asks for: 1 for Daily and Yes/No, 3 for the spread. */
  required: number;
  /** Position labels, in the active reader's voice. One per required card. */
  slotLabels: string[];
  /** Fired once `required` cards are down, after a held beat. */
  onComplete: (picks: Draw[]) => void;
};

export function CardFan({ deck, required, slotLabels, onComplete }: CardFanProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<number[]>([]);

  const layout = useMemo(() => {
    const slotsWidth = required * CARD_W + (required - 1) * SLOT_GAP;
    const slotX = Array.from(
      { length: required },
      (_, i) => -slotsWidth / 2 + CARD_W / 2 + i * (CARD_W + SLOT_GAP),
    );
    const slotCentreY = insets.top + HEADER_H + CARD_H / 2;
    const fanCentreY = height - insets.bottom - FOOTER_H - CARD_H / 2 - 8;
    return { slotX, slotCentreY, fanCentreY, slotsWidth };
  }, [required, insets.top, insets.bottom, height]);

  const complete = picked.length === required;

  useEffect(() => {
    if (!complete) return;
    const id = setTimeout(
      () => onComplete(picked.map((cardId) => deck.find((d) => d.card.id === cardId)!)),
      motion.settle,
    );
    return () => clearTimeout(id);
  }, [complete, picked, deck, onComplete]);

  const toggle = useCallback(
    (cardId: number) => {
      setPicked((prev) => {
        if (prev.includes(cardId)) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          return prev.filter((x) => x !== cardId);
        }
        if (prev.length >= required) return prev;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return [...prev, cardId];
      });
    },
    [required],
  );

  return (
    <>
      {/* Empty slot outlines, sitting beneath the flying cards. */}
      <View
        style={[styles.slotRow, { top: insets.top + HEADER_H, width: layout.slotsWidth }]}
        pointerEvents="none"
      >
        {slotLabels.slice(0, required).map((label, i) => (
          <View key={i} style={styles.slot}>
            <View style={styles.slotOutline} />
            <Text style={[type.slotLabel, styles.slotLabel]}>{label.toUpperCase()}</Text>
          </View>
        ))}
      </View>

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {deck.map((draw, index) => (
          <FanCard
            key={draw.card.id}
            draw={draw}
            index={index}
            total={deck.length}
            slotIndex={picked.indexOf(draw.card.id)}
            dimmed={complete && !picked.includes(draw.card.id)}
            slotX={layout.slotX}
            slotCentreY={layout.slotCentreY}
            fanCentreY={layout.fanCentreY}
            screenWidth={width}
            onToggle={toggle}
          />
        ))}
      </View>
    </>
  );
}

type FanCardProps = {
  draw: Draw;
  index: number;
  total: number;
  slotIndex: number;
  dimmed: boolean;
  slotX: number[];
  slotCentreY: number;
  fanCentreY: number;
  screenWidth: number;
  onToggle: (cardId: number) => void;
};

function FanCard({
  draw,
  index,
  total,
  slotIndex,
  dimmed,
  slotX,
  slotCentreY,
  fanCentreY,
  screenWidth,
  onToggle,
}: FanCardProps) {
  const baseAngle = total > 1 ? -FAN_SPAN / 2 + (FAN_SPAN / (total - 1)) * index : 0;

  const pick = useSharedValue(0); // 0 = in the fan, 1 = seated in its slot
  const flip = useSharedValue(0); // 0 = back showing, 1 = face showing
  const drag = useSharedValue(0); // finger lift, always <= 0
  const dim = useSharedValue(0);
  const isPicked = useSharedValue(0);
  const targetX = useSharedValue(0);
  const targetY = useSharedValue(0);

  useEffect(() => {
    const seated = slotIndex >= 0;
    // Latch the destination while it is valid, so the return journey animates
    // back *from* the slot instead of from a stale zero.
    if (seated) {
      targetX.value = slotX[slotIndex];
      targetY.value = slotCentreY - fanCentreY;
    }
    isPicked.value = seated ? 1 : 0;
    pick.value = withTiming(seated ? 1 : 0, CARD_TIMING);
    flip.value = withTiming(seated ? 1 : 0, FLIP_TIMING);
  }, [slotIndex, slotX, slotCentreY, fanCentreY, pick, flip, isPicked, targetX, targetY]);

  useEffect(() => {
    dim.value = withTiming(dimmed ? 1 : 0, { duration: 300 });
  }, [dimmed, dim]);

  // Created once: every value it reads is a shared value, so there is no stale
  // closure to invalidate and no reason to rebuild the gesture on re-render.
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onUpdate((e) => {
          if (isPicked.value === 1) return;
          drag.value = Math.min(0, e.translationY);
        })
        .onEnd(() => {
          runOnJS(onToggle)(draw.card.id);
        })
        .onFinalize(() => {
          drag.value = withTiming(0, CARD_TIMING);
        }),
    [draw.card.id, onToggle, drag, isPicked],
  );

  const outer = useAnimatedStyle(() => {
    const p = pick.value;
    const angle = interpolate(p, [0, 1], [baseAngle, 0]);
    const tx = interpolate(p, [0, 1], [0, targetX.value]);
    const ty = interpolate(p, [0, 1], [drag.value, targetY.value]);
    const scale = interpolate(p, [0, 1], [1, SLOT_SCALE]);

    return {
      opacity: interpolate(dim.value, [0, 1], [1, 0.42]),
      transform: [
        { translateX: tx },
        { translateY: ty },
        // Rotate about a pivot far below the card: this is what bends the row
        // into an arc. At p = 1 the angle is 0, so the pair cancels and the
        // card lands squarely in its slot.
        { translateY: PIVOT_D },
        { rotate: `${angle}deg` },
        { translateY: -PIVOT_D },
        { scale },
      ],
    };
  });

  // React Native does not support `transform-style: preserve-3d`, so the two
  // faces cannot be flipped by rotating a shared parent. Instead each face
  // carries its own rotation, 180deg apart, and `backfaceVisibility: hidden`
  // hides whichever one is currently turned away. Same result, and it is the
  // only approach that works on native.
  const backFace = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` },
    ],
  }));

  const frontFace = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          styles.card,
          {
            left: screenWidth / 2 - CARD_W / 2,
            top: fanCentreY - CARD_H / 2,
            zIndex: slotIndex >= 0 ? 300 + slotIndex : index,
          },
          outer,
        ]}
      >
        <Animated.View style={[styles.face, backFace]}>
          <CardBack width={CARD_W} height={CARD_H} />
        </Animated.View>
        <Animated.View style={[styles.face, styles.faceFront, frontFace]}>
          <Image
            source={CARD_ART[draw.card.slug]}
            style={[styles.art, draw.reversed && styles.artReversed]}
            contentFit="cover"
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  slotRow: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: SLOT_GAP,
  },
  slot: { width: CARD_W, alignItems: 'center', gap: 12 },
  slotOutline: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.goldHairline,
    backgroundColor: 'rgba(255,255,255,0.015)',
  },
  slotLabel: { textAlign: 'center' },
  card: { position: 'absolute', width: CARD_W, height: CARD_H },
  face: {
    ...StyleSheet.absoluteFill,
    backfaceVisibility: 'hidden',
    borderRadius: radius.card,
  },
  faceFront: {
    borderWidth: 1,
    borderColor: color.cardFaceBorder,
    overflow: 'hidden',
    backgroundColor: color.cardFace[0],
  },
  art: { width: '100%', height: '100%' },
  artReversed: { transform: [{ rotate: '180deg' }] },
});
