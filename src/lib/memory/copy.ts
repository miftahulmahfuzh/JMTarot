/**
 * W5's user-facing and prompt-facing strings, in both locales.
 *
 * THIS FILE IS A STAGING POST FOR W6's MESSAGE CATALOG, AND MIGRATING IT MUST BE
 * A FIND-AND-REPLACE. Same pattern, and for the same reason, as
 * `src/app/onboarding/copy.ts`: the keys below are exactly the `memory.*` keys
 * W5's plan (`## Interfaces I need`) hands W6, spelled identically, so when
 * `src/lib/i18n/locales/{id,en}.ts` lands the move is: copy these entries in,
 * replace `c(locale, 'memory.x')` with `t('memory.x')`, delete this file. Do not
 * rename a key here to something that reads better locally -- the name IS the
 * interface.
 *
 * IT IS `c()` AND NOT `t()` ON PURPOSE. W3 established this and it is worth
 * keeping: the two names differ by one character, so the W6 migration shows up
 * as a real diff on every call site rather than as a silent no-op that leaves
 * half the app reading from a dead file.
 *
 * WHY THIS FILE IS BILINGUAL WHEN THE REST OF THE APP IS NOT YET. W6 has not
 * landed and `users.locale` is `'id'` for everybody, so nothing here reaches a
 * screen in English today. The strings are written anyway because the
 * alternative is that W6 inherits a translation job at exactly the moment the
 * roadmap's §10 warns that translated copy reads as translated. These are short
 * and factual -- window phrases and month names -- so unlike the reader
 * personas they are the one part of W5 where a native rewrite would produce the
 * same words.
 *
 * NO ERROR COPY AND NO EMPTY-STATE COPY, deliberately (M14). Both failure paths
 * render nothing at all, so there is no string here for W6 to translate and no
 * temptation to add one. An empty state announces that the feature exists and
 * that you are not interesting enough for it.
 */
import type { Locale } from '@/data/types';

/**
 * A flat record with dotted keys rather than a nested object, because the keys
 * are dotted paths in W6's catalog and nesting them here would mean un-nesting
 * them there.
 *
 * `{reader}` is the one interpolation, and it is spelled the way W3's copy
 * spells it so W6 inherits one convention rather than two.
 */
const COPY = {
  id: {
    'memory.summary.a11yLabel': 'Ringkasan hari ini dari {reader}',
    'memory.frequency.a11yLabel': 'Pola kartumu belakangan ini',

    /*
     * THE WINDOW PHRASE IS INTERPOLATED INTO THE FREQUENCY PROMPT, not only
     * rendered on screen. §3.6 tells the model to "name the stretch of time in
     * words, not dates", and this is the phrase it is handed -- which is why
     * these read as something a person would say rather than as labels.
     */
    'memory.frequency.windows.week': 'Minggu ini',
    'memory.frequency.windows.d3': 'Tiga hari terakhir',
    'memory.frequency.windows.d13': 'Tiga belas hari terakhir',
    'memory.frequency.windows.d666': '666 hari terakhir',
    'memory.frequency.windows.month': 'Bulan ini',
    'memory.frequency.windows.quarter': 'Kuartal ini',
    'memory.frequency.windows.year': 'Tahun ini',
    'memory.frequency.windows.birthday': 'Sejak ulang tahunmu yang terakhir',
  },
  en: {
    'memory.summary.a11yLabel': 'What {reader} remembers about today',
    'memory.frequency.a11yLabel': 'The pattern in your recent cards',

    'memory.frequency.windows.week': 'This week',
    'memory.frequency.windows.d3': 'The last three days',
    'memory.frequency.windows.d13': 'The last thirteen days',
    'memory.frequency.windows.d666': 'The last 666 days',
    'memory.frequency.windows.month': 'This month',
    'memory.frequency.windows.quarter': 'This quarter',
    'memory.frequency.windows.year': 'This year',
    'memory.frequency.windows.birthday': 'Since your last birthday',
  },
} as const satisfies Record<Locale, Record<string, string>>;

/**
 * Every key, taken from the `id` catalog.
 *
 * `satisfies` above already forces the two locales to be assignable to the same
 * record type, but it does NOT force them to have the same keys -- an extra key
 * in `en` compiles, and a MISSING key in `en` compiles too, which is the one
 * that ships a blank string. `_SameKeys` below is the guard that catches it.
 */
export type CopyKey = keyof (typeof COPY)['id'];

/*
 * Both directions of exhaustiveness, at compile time, exactly as `events.ts`
 * does it for the taxonomy. Without this a key present in `id` and absent in
 * `en` is a runtime `undefined` that renders as the empty string -- and since
 * nothing runs in English yet, nobody would see it until W6 landed and the
 * frequency prompt started asking the model to name a stretch of time called
 * "undefined".
 */
type _MissingInEn = Exclude<CopyKey, keyof (typeof COPY)['en']>;
type _ExtraInEn = Exclude<keyof (typeof COPY)['en'], CopyKey>;
const _sameKeys: _MissingInEn | _ExtraInEn extends never ? true : never = true;
void _sameKeys;

/**
 * The lookup. `c(locale, key)`, with `{placeholder}` substitution.
 *
 * Renamed to `t()` by W6. See the header.
 */
export function c(
  locale: Locale,
  key: CopyKey,
  vars?: Record<string, string | number>,
): string {
  const raw: string = COPY[locale][key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/**
 * Month names for rendering a `local_date` inside the two memory blocks.
 *
 * THE BLOCKS RENDER DATES FROM `local_date`, NEVER FROM `created_at` (roadmap
 * §7). `local_date` is already the querent's own calendar day as a
 * `'YYYY-MM-DD'` string, so `formatLocalDate` below splits the string rather
 * than constructing a Date -- `new Date('2026-07-26')` parses as UTC midnight
 * and renders as 25 July for anyone west of Greenwich, which is the same class
 * of bug `local_date` exists to prevent and would be a comical one to
 * reintroduce inside the feature that reads the column.
 */
const MONTHS: Record<Locale, readonly string[]> = {
  id: [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ],
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
};

/**
 * `'2026-07-26'` -> `'26 Juli'` / `'26 July'`.
 *
 * Day and month only, no year: everything these blocks recall is inside a
 * fourteen-day lookback or the same calendar day, so a year would be noise the
 * model might repeat back. `withYear` exists for the frequency window bounds,
 * where a 666-day span genuinely crosses years.
 */
export function formatLocalDate(
  localDate: string,
  locale: Locale,
  withYear = false,
): string {
  const [y, m, d] = localDate.split('-');
  const month = MONTHS[locale][Number(m) - 1] ?? m;
  // Day-first in both locales. Indonesian has no other option, and "26 July"
  // is ordinary English -- while "July 26" inside an Indonesian-shaped block
  // would be the only line in the prompt with American date order.
  const dayMonth = `${Number(d)} ${month}`;
  return withYear ? `${dayMonth} ${y}` : dayMonth;
}
