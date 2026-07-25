import type { DailyPull, Profile, ReaderId } from '@/data/types';

/**
 * The entire client-side persistence layer: three keys, all in `localStorage`.
 *
 * Nothing here is ever transmitted. There is no database, and a reading is not
 * persisted at all -- only the profile and the daily-card state outlive a page
 * load. Resist adding anything a server would need to see.
 *
 * These are synchronous, unlike the AsyncStorage version they replace, and they
 * must not be called during render on the server: `localStorage` does not exist
 * there. Every accessor guards on `typeof window` and returns null rather than
 * throwing, so a stray server call degrades instead of crashing the route.
 */
const KEY = {
  profile: 'user.profile',
  dailyPull: 'daily.lastPull',
  preferredReader: 'reader.preferred',
} as const;

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    // Corrupt, unparseable, or blocked (Safari private mode throws on access):
    // treat as absent rather than crashing. Worst case the user re-enters their
    // name.
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or private-mode failures are not worth interrupting a reading for.
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
