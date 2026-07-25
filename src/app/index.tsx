import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';

import { Eyebrow, Screen } from '@/components/Screen';
import { CARD_ART } from '@/data/cardArt';
import { CARDS } from '@/data/deck';
import { DEFAULT_READER, READER_ART, READERS, readerById } from '@/data/readers';
import { isPulledToday, loadDailyPull, loadPreferredReader, loadProfile } from '@/lib/storage';
import { color, radius, type } from '@/theme/tokens';
import type { DailyPull, Profile, Reader } from '@/data/types';

/**
 * Reader picker, and the app's entry point.
 *
 * The Daily Card widget is pinned above the reader list on purpose: routing the
 * daily pull through reader -> service -> draw is three taps, which is too much
 * friction for something meant to become a habit. The full path stays available
 * for everything else.
 */
export default function ReaderPicker() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [daily, setDaily] = useState<DailyPull | null>(null);
  const [preferred, setPreferred] = useState<Reader>(DEFAULT_READER);

  // Refetch on focus so returning from a draw updates the daily widget.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const [p, d, r] = await Promise.all([
          loadProfile(),
          loadDailyPull(),
          loadPreferredReader(),
        ]);
        if (!active) return;
        setProfile(p);
        setDaily(d);
        setPreferred((r && readerById(r)) || DEFAULT_READER);
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const pulledToday = isPulledToday(daily);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Eyebrow>JMTAROT</Eyebrow>
          <Text style={[type.title, styles.title]}>
            {profile ? `Halo, ${profile.name}` : 'Selamat datang'}
          </Text>
        </View>

        <DailyWidget
          pull={pulledToday ? daily : null}
          reader={preferred}
          onPress={() =>
            // Always straight to the draw screen -- it owns the daily gate and
            // shows today's card when the day is spent, which is what someone
            // tapping this widget actually wants to see.
            //
            // Object form, not an interpolated string: these are dynamic routes,
            // and `typedRoutes` validates against `/[reader]`, not `/thessaly`.
            router.push({
              pathname: '/[reader]/draw',
              params: { reader: preferred.id, service: 'daily' },
            })
          }
        />

        <Text style={[type.sectionLabel, styles.sectionLabel]}>PILIH PEMBACA</Text>

        <View style={styles.readerList}>
          {READERS.map((reader) => (
            <ReaderBanner
              key={reader.id}
              reader={reader}
              onPress={() =>
                router.push({ pathname: '/[reader]', params: { reader: reader.id } })
              }
            />
          ))}
        </View>

        <Text style={styles.disclaimer}>
          JMTarot dibuat untuk hiburan dan refleksi diri.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function DailyWidget({
  pull,
  reader,
  onPress,
}: {
  pull: DailyPull | null;
  reader: Reader;
  onPress: () => void;
}) {
  const card = pull ? CARDS[pull.cardId] : null;

  return (
    <Pressable onPress={onPress} style={styles.daily} accessibilityRole="button">
      {card ? (
        <Image
          source={CARD_ART[card.slug]}
          style={[styles.dailyThumb, pull?.reversed && styles.thumbReversed]}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.dailyThumb, styles.dailyThumbEmpty]}>
          <Text style={styles.dailySigil}>✧</Text>
        </View>
      )}
      <View style={styles.dailyBody}>
        <Text style={type.slotLabel}>KARTU HARIAN</Text>
        <Text style={[type.cardTitleLight, styles.dailyName]}>
          {card ? card.name : 'Tarik kartu hari ini'}
        </Text>
        <Text style={[type.hint, styles.dailyHint]} numberOfLines={2}>
          {card
            ? `Dibaca oleh ${reader.name}. Kembali besok untuk kartu baru.`
            : `Satu kartu, satu tarikan — bersama ${reader.name}.`}
        </Text>
      </View>
    </Pressable>
  );
}

function ReaderBanner({ reader, onPress }: { reader: Reader; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.banner} accessibilityRole="button">
      <Image source={READER_ART[reader.id]} style={styles.bannerArt} contentFit="cover" />
      {/* Scrim: the portraits are bright, so text needs its own ground. */}
      <LinearGradient
        colors={['rgba(8,6,15,0.15)', 'rgba(8,6,15,0.72)', 'rgba(8,6,15,0.96)']}
        locations={[0, 0.45, 1]}
        style={styles.bannerScrim}
      />
      <View style={styles.bannerBody}>
        <Text style={[type.cardTitleLight, styles.bannerName]}>{reader.name}</Text>
        <Text style={[type.hint, styles.bannerTitle]}>{reader.title}</Text>
        <View style={styles.chipRow}>
          {reader.specialties.map((s) => (
            <View key={s} style={styles.chip}>
              <Text style={styles.chipText}>{s}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 48, paddingHorizontal: 20, gap: 24 },
  header: { alignItems: 'center', gap: 8 },
  title: { fontSize: 30, textAlign: 'center' },

  daily: {
    flexDirection: 'row',
    gap: 16,
    padding: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.goldBorder,
    backgroundColor: color.goldWash,
    alignItems: 'center',
  },
  dailyThumb: { width: 56, height: 84, borderRadius: 5, backgroundColor: color.cardBack[0] },
  dailyThumbEmpty: {
    borderWidth: 1,
    borderColor: color.goldHairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailySigil: { fontSize: 22, color: color.goldLift },
  thumbReversed: { transform: [{ rotate: '180deg' }] },
  dailyBody: { flex: 1, gap: 4 },
  dailyName: { fontSize: 17 },
  dailyHint: { fontSize: 15 },

  readerList: { gap: 16 },
  banner: {
    height: 168,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.goldHairline,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  bannerArt: { ...StyleSheet.absoluteFill },
  bannerScrim: { ...StyleSheet.absoluteFill },
  bannerBody: { padding: 16, gap: 3 },
  bannerName: { fontSize: 22 },
  bannerTitle: { fontSize: 15 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: {
    borderWidth: 1,
    borderColor: color.goldHairline,
    backgroundColor: 'rgba(201,162,39,0.10)',
    borderRadius: radius.chip,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  chipText: {
    fontFamily: type.slotLabel.fontFamily,
    fontSize: 8,
    letterSpacing: 1.4,
    color: color.goldPale,
  },

  sectionLabel: { textAlign: 'center' },
  disclaimer: {
    fontFamily: type.hint.fontFamily,
    fontSize: 13,
    textAlign: 'center',
    color: color.faint,
    marginTop: 8,
  },
});
