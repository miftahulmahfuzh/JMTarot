import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Backdrop } from '@/components/Backdrop';
import { color, type } from '@/theme/tokens';

/** Gold hairline flanking a Cinzel eyebrow -- the design's recurring header motif. */
export function Eyebrow({ children }: { children: string }) {
  return (
    <View style={styles.eyebrowRow}>
      <View style={styles.rule} />
      <Text style={type.eyebrow}>{children}</Text>
      <View style={styles.rule} />
    </View>
  );
}

/** A bare gold hairline, for separating sections. */
export function Hairline({ inset = 0 }: { inset?: number }) {
  return <View style={[styles.hairline, { marginHorizontal: inset }]} />;
}

export function Screen({
  children,
  back = false,
  padTop = 24,
}: {
  children: ReactNode;
  /** Show the back chevron. Omitted on the root, which has nowhere to go. */
  back?: boolean;
  padTop?: number;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.root}>
      <Backdrop />
      {back && (
        <Pressable
          onPress={() => router.back()}
          style={[styles.back, { top: insets.top + 12 }]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Kembali"
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
      )}
      <View style={{ flex: 1, paddingTop: insets.top + padTop }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.canvas },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rule: { width: 48, height: 1, backgroundColor: color.gold, opacity: 0.6 },
  hairline: { height: 1, backgroundColor: color.goldHairline },
  back: { position: 'absolute', left: 16, zIndex: 500, padding: 8 },
  backGlyph: {
    fontSize: 34,
    lineHeight: 36,
    color: color.goldLift,
    // Cinzel has no chevron worth using; the system serif reads cleaner here.
    fontWeight: '300',
  },
});
