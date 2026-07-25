import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { color } from '@/theme/tokens';

/**
 * The design's backdrop is
 * `radial-gradient(120% 90% at 50% 4%, #221a3a, #130f22 42%, #08060f)`.
 *
 * React Native has no radial gradient without pulling in react-native-svg, so
 * this approximates it with a vertical LinearGradient (the dominant axis, since
 * the origin sits at top-centre) plus a soft elliptical bloom behind it. Close
 * enough that the difference is not visible on device; swap in an SVG
 * RadialGradient later if we ever need it exact.
 */
export function Backdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[color.bgRadial[0], color.bgRadial[1], color.bgRadial[2]]}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.bloom} />
      <Starfield />
    </View>
  );
}

/**
 * Ten fixed stars that breathe together on a 7s cycle, matching the design's
 * `twinkle` keyframes (opacity .25 -> .9). Positions and sizes are transcribed
 * from the original radial-gradient stops.
 */
const STARS = [
  { left: '12%', top: '18%', size: 1.5 },
  { left: '28%', top: '9%', size: 1 },
  { left: '44%', top: '22%', size: 1.5 },
  { left: '63%', top: '12%', size: 1 },
  { left: '78%', top: '25%', size: 1.5 },
  { left: '90%', top: '15%', size: 1 },
  { left: '8%', top: '34%', size: 1 },
  { left: '55%', top: '32%', size: 1 },
  { left: '71%', top: '38%', size: 1 },
  { left: '35%', top: '42%', size: 1 },
] as const;

function Starfield() {
  const twinkle = useSharedValue(0.25);

  useEffect(() => {
    twinkle.value = withRepeat(
      withTiming(0.9, { duration: 3500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [twinkle]);

  const style = useAnimatedStyle(() => ({ opacity: twinkle.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      {STARS.map((star, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: star.left,
            top: star.top,
            width: star.size * 2,
            height: star.size * 2,
            borderRadius: star.size,
            backgroundColor: '#fff',
          }}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bloom: {
    position: 'absolute',
    top: '-30%',
    left: '-25%',
    right: '-25%',
    height: '75%',
    borderRadius: 9999,
    backgroundColor: color.bgRadial[0],
    opacity: 0.55,
  },
});
