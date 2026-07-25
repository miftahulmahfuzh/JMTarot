import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Redirect, useLocalSearchParams } from 'expo-router';

import { Backdrop } from '@/components/Backdrop';
import { CardFan } from '@/components/CardFan';
import { CARD_ART } from '@/data/cardArt';
import { CARDS, effectiveYesNo, shuffleDeck } from '@/data/deck';
import { isReaderId, readerById } from '@/data/readers';
import { isServiceId, serviceById, slotLabels } from '@/data/services';
import { isPulledToday, loadDailyPull, saveDailyPull, todayKey } from '@/lib/storage';
import { color, radius, type } from '@/theme/tokens';
import type { DailyPull, Draw } from '@/data/types';

/**
 * The draw screen.
 *
 * TODO: `onComplete` should navigate to the result screen. Until that exists,
 * the picks render inline here so the flow stays walkable end to end.
 */
export default function DrawScreen() {
  const { reader: readerParam, service: serviceParam } = useLocalSearchParams<{
    reader: string;
    service: string;
  }>();
  const insets = useSafeAreaInsets();

  const reader = readerById(readerParam ?? '');
  const service = serviceById(serviceParam ?? '');

  const [round, setRound] = useState(0);
  const [picks, setPicks] = useState<Draw[] | null>(null);
  const [gate, setGate] = useState<'loading' | 'open' | DailyPull>('loading');

  const deck = useMemo(() => shuffleDeck(), [round]);

  // Daily Card is once per calendar day. Resolve that before showing a fan, so
  // the user never draws a card that is going to be thrown away.
  useEffect(() => {
    if (!service) return;
    if (!service.oncePerDay) {
      setGate('open');
      return;
    }
    let active = true;
    loadDailyPull().then((pull) => {
      if (!active) return;
      setGate(isPulledToday(pull) && pull ? pull : 'open');
    });
    return () => {
      active = false;
    };
  }, [service]);

  const onComplete = useCallback(
    (drawn: Draw[]) => {
      setPicks(drawn);
      if (service?.oncePerDay && reader) {
        const [first] = drawn;
        saveDailyPull({
          date: todayKey(),
          cardId: first.card.id,
          reversed: first.reversed,
          readerId: reader.id,
        });
      }
    },
    [service, reader],
  );

  if (!readerParam || !isReaderId(readerParam) || !reader) return <Redirect href="/" />;
  if (!serviceParam || !isServiceId(serviceParam) || !service) {
    return <Redirect href={{ pathname: '/[reader]', params: { reader: reader.id } }} />;
  }

  const labels = slotLabels(service, reader);

  return (
    <View style={styles.root}>
      <Backdrop />

      <View style={[styles.header, { paddingTop: insets.top + 24 }]} pointerEvents="none">
        <Text style={type.eyebrow}>{service.name.toUpperCase()}</Text>
        <Text style={[type.title, styles.title]}>
          {service.cardCount === 3 ? 'Tarik Tiga Kartu' : 'Tarik Satu Kartu'}
        </Text>
        <Text style={[type.hint, styles.hint]}>
          {gate !== 'loading' && gate !== 'open'
            ? 'Kartumu untuk hari ini sudah terbuka.'
            : picks
              ? 'Kartumu sudah terbuka. Ketuk kartu untuk mengembalikannya.'
              : 'Geser kartu ke atas — atau ketuk — untuk mengangkatnya dari kipas.'}
        </Text>
      </View>

      {gate === 'loading' ? null : gate === 'open' ? (
        <CardFan
          key={round}
          deck={deck}
          required={service.cardCount}
          slotLabels={labels}
          onComplete={onComplete}
        />
      ) : (
        <SpentDaily pull={gate} />
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 26 }]}>
        {picks && (
          <View style={styles.reading}>
            <Text style={type.sectionLabel}>
              {service.id === 'yesno' ? 'JAWABAN' : 'HASIL SEMENTARA'}
            </Text>
            <Text style={[type.reading, styles.readingText]}>
              {service.id === 'yesno'
                ? yesNoText(picks[0])
                : picks
                    .map(
                      (d, i) =>
                        `${labels[i]}: ${d.card.name}${d.reversed ? ' (terbalik)' : ''}`,
                    )
                    .join(' · ')}
            </Text>
          </View>
        )}
        {gate === 'open' && !service.oncePerDay && (
          <Pressable
            style={styles.button}
            onPress={() => {
              setPicks(null);
              setRound((r) => r + 1);
            }}
          >
            <Text style={type.button}>ACAK ULANG</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function yesNoText(draw: Draw) {
  const verdict = effectiveYesNo(draw);
  const word = verdict === 'yes' ? 'Ya' : verdict === 'no' ? 'Tidak' : 'Belum jelas';
  return `${word} — ${draw.card.name}${draw.reversed ? ' (terbalik)' : ''}`;
}

/** Shown instead of a fan once the day's Daily Card has been spent. */
function SpentDaily({ pull }: { pull: DailyPull }) {
  const card = CARDS[pull.cardId];
  return (
    <View style={styles.spent}>
      <Image
        source={CARD_ART[card.slug]}
        style={[styles.spentCard, pull.reversed && styles.reversed]}
        contentFit="cover"
      />
      <Text style={[type.cardTitleLight, styles.spentName]}>{card.name}</Text>
      <Text style={[type.hint, styles.spentHint]}>Kembali besok untuk kartu baru.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.canvas, overflow: 'hidden' },
  header: { alignItems: 'center', gap: 5, paddingHorizontal: 24, zIndex: 1 },
  title: { marginTop: 4, fontSize: 30, textAlign: 'center' },
  hint: { textAlign: 'center', maxWidth: 460 },

  spent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  spentCard: { width: 176, height: 264, borderRadius: radius.card },
  reversed: { transform: [{ rotate: '180deg' }] },
  spentName: { fontSize: 20 },
  spentHint: { fontSize: 15 },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // Floats above the fan so edge cards slide behind it, as the design does.
    zIndex: 400,
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: 'rgba(8,6,15,0.9)',
  },
  reading: { alignItems: 'center', gap: 8, maxWidth: 760 },
  readingText: { textAlign: 'center' },
  button: {
    borderWidth: 1,
    borderColor: color.goldBorder,
    backgroundColor: color.goldWash,
    borderRadius: radius.chip,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
});
