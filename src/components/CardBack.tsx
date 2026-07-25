import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { color, radius } from '@/theme/tokens';

const crosshatch = require('@/assets/ui/crosshatch.png');

/**
 * The card back, drawn procedurally exactly as the design does -- so it costs no
 * artwork and scales to any size. Inset gold rings, a tiled crosshatch, and a
 * ringed sigil medallion.
 */
export function CardBack({ width, height }: { width: number; height: number }) {
  const pad = Math.max(6, width * 0.075);
  const medallion = width * 0.39;

  return (
    <LinearGradient
      colors={[color.cardBack[0], color.cardBack[1], color.cardBack[2]]}
      locations={[0, 0.48, 1]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={[styles.root, { width, height, padding: pad }]}
    >
      {/* Two inset rings: a near-black bevel, then a thin gold line. */}
      <View style={styles.bevel} pointerEvents="none" />
      <View style={styles.inner}>
        <Image source={crosshatch} resizeMode="repeat" style={styles.hatch} />
        <View
          style={[
            styles.medallion,
            { width: medallion, height: medallion, borderRadius: medallion / 2 },
          ]}
        >
          <Text style={[styles.sigil, { fontSize: medallion * 0.42 }]}>✧</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.cardBackBorder,
    overflow: 'hidden',
  },
  bevel: {
    position: 'absolute',
    inset: 0,
    borderRadius: radius.card,
    borderWidth: 4,
    borderColor: 'rgba(10,8,18,0.6)',
  },
  inner: {
    flex: 1,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  hatch: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  medallion: {
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(201,162,39,0.10)',
  },
  sigil: {
    color: color.goldLift,
    lineHeight: undefined,
  },
});
