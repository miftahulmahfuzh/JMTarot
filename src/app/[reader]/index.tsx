import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { Hairline, Screen } from '@/components/Screen';
import { READER_ART, isReaderId, readerById } from '@/data/readers';
import { SERVICES } from '@/data/services';
import { isPulledToday, loadDailyPull, savePreferredReader } from '@/lib/storage';
import { color, radius, type } from '@/theme/tokens';
import type { DailyPull, Service } from '@/data/types';

/**
 * Service picker for a chosen reader.
 *
 * Landing here is what marks a reader as preferred, which is what the Daily Card
 * shortcut on the home screen then targets.
 */
export default function ServicePicker() {
  const { reader: readerParam } = useLocalSearchParams<{ reader: string }>();
  const router = useRouter();
  const [daily, setDaily] = useState<DailyPull | null>(null);

  const reader = readerById(readerParam ?? '');

  useEffect(() => {
    if (reader) savePreferredReader(reader.id);
  }, [reader]);

  useFocusRefresh(setDaily);

  // A bad reader slug means a stale deep link, not a state worth rendering.
  if (!readerParam || !isReaderId(readerParam) || !reader) {
    return <Redirect href="/" />;
  }

  const dailyDone = isPulledToday(daily);

  return (
    <Screen back padTop={0}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.banner}>
          <Image source={READER_ART[reader.id]} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient
            colors={['rgba(8,6,15,0.35)', 'rgba(8,6,15,0.8)', color.canvas]}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.bannerBody}>
            <Text style={[type.title, styles.name]}>{reader.name}</Text>
            <Text style={[type.hint, styles.readerTitle]}>{reader.title}</Text>
          </View>
        </View>

        <Text style={[type.reading, styles.bio]}>{reader.bio}</Text>

        <Hairline />

        <Text style={[type.sectionLabel, styles.sectionLabel]}>PILIH BACAAN</Text>

        <View style={styles.list}>
          {SERVICES.map((service) => (
            <ServiceRow
              key={service.id}
              service={service}
              locked={service.oncePerDay && dailyDone}
              // The draw screen owns the daily gate: it shows the stored card
              // instead of a fresh fan when the day is already spent.
              onPress={() =>
                router.push({
                  pathname: '/[reader]/draw',
                  params: { reader: reader.id, service: service.id },
                })
              }
            />
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

/**
 * Reload the daily gate whenever this screen regains focus -- otherwise coming
 * back from a draw would still show the service as available.
 */
function useFocusRefresh(set: (p: DailyPull | null) => void) {
  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadDailyPull().then((p) => {
        if (active) set(p);
      });
      return () => {
        active = false;
      };
    }, [set]),
  );
}

function ServiceRow({
  service,
  locked,
  onPress,
}: {
  service: Service;
  locked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button">
      <View style={styles.rowHead}>
        <Text style={[type.cardTitleLight, styles.serviceName]}>{service.name}</Text>
        <Text style={type.counter}>
          {locked ? 'SUDAH HARI INI' : `${service.cardCount} KARTU`}
        </Text>
      </View>
      <Text style={[type.hint, styles.tagline]}>{service.tagline}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 48, gap: 20 },
  banner: { height: 260, justifyContent: 'flex-end' },
  bannerBody: { paddingHorizontal: 20, paddingBottom: 4, gap: 2 },
  name: { fontSize: 32 },
  readerTitle: { fontSize: 16 },
  bio: { paddingHorizontal: 20, fontSize: 17, lineHeight: 26 },
  sectionLabel: { textAlign: 'center' },
  list: { paddingHorizontal: 20, gap: 12 },
  row: {
    padding: 16,
    gap: 6,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.goldHairline,
    backgroundColor: 'rgba(255,255,255,0.015)',
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  serviceName: { fontSize: 17 },
  tagline: { fontSize: 15 },
});
