import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DailyPull, Profile, ReaderId } from '@/data/types';

/**
 * The entire persistence layer: four keys, all device-local.
 *
 * Nothing here is ever transmitted. JMTarot has no accounts and no server, which
 * is what lets the App Privacy label say "Data Not Collected" -- so resist adding
 * anything that would need declaring.
 */
const KEY = {
  profile: 'user.profile',
  dailyPull: 'daily.lastPull',
  preferredReader: 'reader.preferred',
} as const;

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    // Corrupt or unparseable: treat as absent rather than crashing the app on
    // launch. Worst case the user re-enters their name.
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage failures are not worth interrupting a reading for.
  }
}

export const loadProfile = () => readJson<Profile>(KEY.profile);
export const saveProfile = (profile: Profile) => writeJson(KEY.profile, profile);

export const loadDailyPull = () => readJson<DailyPull>(KEY.dailyPull);
export const saveDailyPull = (pull: DailyPull) => writeJson(KEY.dailyPull, pull);

export const loadPreferredReader = () => readJson<ReaderId>(KEY.preferredReader);
export const savePreferredReader = (id: ReaderId) => writeJson(KEY.preferredReader, id);

/**
 * Today's date in the device's own timezone, as `YYYY-MM-DD`.
 *
 * Deliberately not `toISOString()`, which is UTC -- that would roll the daily
 * card over at 07:00 in Jakarta (UTC+7) instead of at midnight.
 */
export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** True when the Daily Card has already been drawn for the current local day. */
export function isPulledToday(pull: DailyPull | null): boolean {
  return pull !== null && pull.date === todayKey();
}
