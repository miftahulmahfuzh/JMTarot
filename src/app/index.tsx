import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Backdrop } from '@/components/Backdrop';
import { CardFan } from '@/components/CardFan';
import { shuffleDeck } from '@/data/deck';
import { color, type } from '@/theme/tokens';
import type { Draw } from '@/data/types';

/**
 * Fan spike.
 *
 * Per the design's build order this screen exists to prove the draw interaction
 * feels right before any of the real navigation is built. It is a harness, not a
 * destination -- the reader picker replaces it as the app's index.
 */
const SLOT_LABELS = ['Masa lalu', 'Saat ini', 'Nanti'];

export default function FanSpike() {
  const insets = useSafeAreaInsets();
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<Draw[] | null>(null);

  // Re-shuffling is a new round, which remounts the fan with a fresh order.
  const deck = useMemo(() => shuffleDeck(), [round]);

  const reset = useCallback(() => {
    setResult(null);
    setRound((r) => r + 1);
  }, []);

  const hint = result
    ? 'Ketiga kartumu sudah terbuka. Ketuk kartu untuk mengembalikannya.'
    : 'Geser kartu ke atas — atau ketuk — untuk mengangkatnya dari kipas.';

  return (
    <View style={styles.root}>
      <Backdrop />

      <View style={[styles.header, { paddingTop: insets.top + 24 }]} pointerEvents="none">
        <View style={styles.eyebrowRow}>
          <View style={styles.ruleLeft} />
          <Text style={type.eyebrow}>THE MAJOR ARCANA</Text>
          <View style={styles.ruleRight} />
        </View>
        <Text style={[type.title, styles.title]}>Tarik Tiga Kartu</Text>
        <Text style={[type.hint, styles.hint]}>{hint}</Text>
      </View>

      <CardFan
        key={round}
        deck={deck}
        required={3}
        slotLabels={SLOT_LABELS}
        onComplete={setResult}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 26 }]}>
        {result && (
          <View style={styles.reading}>
            <Text style={type.sectionLabel}>HASIL SEMENTARA</Text>
            <Text style={[type.reading, styles.readingText]}>
              {result
                .map(
                  (d, i) =>
                    `${SLOT_LABELS[i]}: ${d.card.name}${d.reversed ? ' (terbalik)' : ''}`,
                )
                .join(' · ')}
            </Text>
          </View>
        )}
        <View style={styles.footerRow}>
          <Pressable style={styles.button} onPress={reset}>
            <Text style={type.button}>ACAK ULANG</Text>
          </Pressable>
          <Text style={type.counter}>
            {(result?.length ?? 0)} DARI 3
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.canvas, overflow: 'hidden' },
  header: { alignItems: 'center', gap: 5, paddingHorizontal: 24, zIndex: 1 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ruleLeft: { width: 48, height: 1, backgroundColor: color.gold, opacity: 0.6 },
  ruleRight: { width: 48, height: 1, backgroundColor: color.gold, opacity: 0.6 },
  title: { marginTop: 4, textAlign: 'center' },
  hint: { textAlign: 'center', maxWidth: 460 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // The design floats the footer above the fan so cards slide behind it.
    zIndex: 400,
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: 'rgba(8,6,15,0.9)',
  },
  reading: { alignItems: 'center', gap: 8, maxWidth: 760 },
  readingText: { textAlign: 'center' },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  button: {
    borderWidth: 1,
    borderColor: color.goldBorder,
    backgroundColor: color.goldWash,
    borderRadius: 2,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
});
