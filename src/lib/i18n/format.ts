/**
 * The lookup itself: pure, isomorphic, and catalog-agnostic.
 *
 * NO `next/*`, NO REACT, AND — the part that matters — NO RUNTIME IMPORT OF
 * EITHER CATALOG. `LocaleProvider` is a client component and imports `makeT`
 * from here, so anything this module `import`s at runtime lands in the browser
 * bundle. `catalogFor` and `tFor` therefore live in `./catalog`, which is the
 * only module that loads both catalogs, and nothing client-side imports it.
 * That is a deviation from the plan's §4, which listed all four functions in one
 * file; the plan's own I9 is the reason for the split — "the client imports both
 * catalogs and picks" ships the locale the user did not choose, and the whole
 * point of handing the provider a resolved catalog is not to.
 *
 * The types below reach `id.ts` through a `import type`, which is erased, so the
 * parameter derivation costs the bundle nothing.
 */
import { intlTag, type Locale } from './locale';
import type { Catalog, MessageKey, Messages } from './locales/id';

export type { Catalog, MessageKey };

/** Loose params, for `plural()` and for callers holding a dynamic key. */
export type TParams = Record<string, string | number>;

/**
 * The params a message actually requires, derived from the INDONESIAN message's
 * literal type (I4). `t('nav.back.reader')` with no `{name}` is a compile error;
 * `t('draw.reset', { name: 'x' })` is not an error, because an unused param is
 * harmless and forbidding it would mean a second, stricter type for no gain.
 *
 * Derived from `id.ts` and not `en.ts` because `en.ts` is declared as
 * `Record<MessageKey, string>`, so its values are widened to `string` and carry
 * no literal to read. That asymmetry is I2 working as intended: the Indonesian
 * catalog is the source of truth about the key set AND about its shape.
 *
 * A value built with `+` widens to `string` and therefore requires no params.
 * `id.ts`'s header says so; every value with a placeholder is a single literal.
 */
type Params<S extends string> = S extends `${string}{${infer P}}${infer Rest}`
  ? { [K in P]: string | number } & Params<Rest>
  : Record<never, never>;

type ParamsArg<K extends MessageKey> = Record<never, never> extends Params<Messages[K]>
  ? [params?: TParams]
  : [params: Params<Messages[K]>];

/**
 * `foo.one` + `foo.other` in the catalog makes `foo` a plural key.
 *
 * Derived rather than declared, so a plural family cannot exist without being
 * callable and `t.plural('draw.counter', n)` cannot be called on a key family
 * that is not there.
 */
type StripOne<K extends string> = K extends `${infer B}.one` ? B : never;
export type PluralKey = StripOne<MessageKey>;

export type TFunction = {
  <K extends MessageKey>(key: K, ...args: ParamsArg<K>): string;
  /**
   * Select `.one` or `.other` by `Intl.PluralRules`, with `{count}` already
   * formatted and injected.
   *
   * FOR INDONESIAN THIS ALWAYS SELECTS `.other`, because CLDR gives `id` only
   * that category (I6). The two Indonesian values are therefore required to be
   * identical, and a test asserts it — otherwise somebody edits `.one`, sees
   * nothing change, and concludes the mechanism is broken.
   */
  plural(key: PluralKey, count: number, params?: TParams): string;
  readonly locale: Locale;
};

/**
 * Build a `t` for one locale and one already-resolved catalog.
 *
 * PURE, AND THE SAME FUNCTION ON BOTH SIDES OF THE RSC BOUNDARY. `getT()`
 * (server) and `useT()` (client) both just call this; what is identical is the
 * call site, `t('draw.reset')`, and that is the only thing that needed to be.
 */
export function makeT(locale: Locale, messages: Catalog): TFunction {
  const tag = intlTag(locale);
  const plurals = new Intl.PluralRules(tag);
  const numbers = new Intl.NumberFormat(tag);
  const table = messages as Record<string, string>;

  const t = ((key: string, params?: TParams) => render(table, key, params)) as TFunction;

  return Object.assign(t, {
    locale,
    plural(key: string, count: number, params?: TParams) {
      const selected = `${key}.${plurals.select(count)}`;
      /*
       * The fallback to `.other` is not defensive padding: CLDR has six plural
       * categories and English uses two, but a locale added later could select
       * `few` or `many` against a family that only declares `one`/`other`. That
       * must render the plural form, not the key.
       */
      const resolved = selected in table ? selected : `${key}.other`;
      // Params last, so a caller can override the formatted count deliberately.
      return render(table, resolved, { count: numbers.format(count), ...params });
    },
  });
}

/**
 * I3: AN UNKNOWN KEY RETURNS THE KEY. Never the other locale's string.
 *
 * A type-system bypass — a cast, a dynamic key, a catalog that lost an entry in
 * a bad merge — must be LOUD. `reading.error.start` rendered on screen is a bug
 * report a user can paste into a message; the Indonesian sentence rendered in the
 * English app is a bug that ships.
 *
 * A MISSING PARAM LEAVES THE PLACEHOLDER VISIBLE, for the same reason:
 * `Kartu {slot}: The Moon` says which param was forgotten, and
 * `Kartu undefined: The Moon` says only that something is wrong.
 */
function render(table: Record<string, string>, key: string, params?: TParams): string {
  const raw = table[key];
  if (raw === undefined) return key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/**
 * `26 Juli 2026` / `26 July 2026`. Always `day numeric, month long, year numeric`.
 *
 * THE SPELLED MONTH IS THE POINT (I7). It sidesteps 26/07 vs 07/26 entirely, so
 * `en-GB` vs `en-US` never has to be decided for a date the user reads. There is
 * deliberately no options parameter: a second call site with a different format
 * is how an app ends up rendering three date styles.
 *
 * Takes a `Date`, so callers holding a `local_date` STRING must not pass
 * `new Date('2026-07-26')` — that parses as UTC midnight and renders as 25 July
 * west of Greenwich, which is the exact bug `local_date` exists to prevent. The
 * memory blocks split the string instead; see `formatLocalDate`.
 */
export function formatDate(d: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlTag(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/**
 * Month names for rendering a `local_date` STRING. Moved here from
 * `src/lib/memory/copy.ts`, which W6 deleted.
 *
 * `Intl.DateTimeFormat` is not used, and that is the point of the whole helper.
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
 * THE COUNTERPART TO `formatDate`, AND THE CONTRAST IS THE REASON BOTH EXIST.
 * `formatDate` takes a `Date` and is for a moment in time. This takes the
 * `local_date` string and SPLITS IT rather than parsing it, because
 * `new Date('2026-07-26')` parses as UTC midnight and renders as 25 July for
 * anyone west of Greenwich — which is the same class of bug `local_date` exists
 * to prevent (roadmap §7) and would be a comical one to reintroduce inside the
 * features that read the column. If you ever find yourself wanting to route this
 * through `Intl`, you want a `Date`, and you cannot have one: the querent's
 * calendar day is not a timestamp.
 *
 * Day and month only by default, no year: everything the memory blocks recall is
 * inside a fourteen-day lookback or the same calendar day, so a year would be
 * noise the model might repeat back. `withYear` exists for the frequency window
 * bounds, where a 666-day span genuinely crosses years.
 *
 * DAY-FIRST IN BOTH LOCALES. Indonesian has no other option, and `26 July` is
 * ordinary English — while `July 26` inside an Indonesian-shaped prompt block
 * would be the only line in it with American date order.
 */
export function formatLocalDate(
  localDate: string,
  locale: Locale,
  withYear = false,
): string {
  const [y, m, d] = localDate.split('-');
  const month = MONTHS[locale][Number(m) - 1] ?? m;
  const dayMonth = `${Number(d)} ${month}`;
  return withYear ? `${dayMonth} ${y}` : dayMonth;
}

/**
 * `19.40` / `19:40`. The clock time of a reading, in the VIEWER'S zone.
 *
 * **BOTH LOCALES ARE A 24-HOUR CLOCK AND ONLY THE SEPARATOR DIFFERS. V6's plan
 * said `19.40 / 7:40 PM` and that is wrong here** -- `intlTag('en')` is `en-GB`,
 * whose default hour cycle is h23. Measured: `id-ID` gives `19.40`, `en-GB` gives
 * `19:40`, and it is `en-US` that gives `7:40 PM`.
 *
 * That is the RIGHT outcome and not an accident to correct. It is the same
 * decision `formatDate` already records: English here is day-first, spelled-month
 * `26 July 2026`, chosen so `en-GB` versus `en-US` never has to be settled for a
 * date the user reads. A meridiem would reopen exactly that question for a time
 * they read. Do not "fix" this to `en-US` or to `hour12: true`; a test asserts
 * the absence of AM/PM.
 *
 * THE THIRD OF THREE, AND THE CONTRAST WITH THE OTHER TWO IS WHY IT LIVES HERE
 * RATHER THAN IN A HISTORY FILE.
 *
 *   - `formatLocalDate` takes a STRING and splits it, because a `local_date` is a
 *     calendar day the querent declared and must never be re-derived through a
 *     timezone.
 *   - `formatDate` takes a `Date`, for a moment in time rendered as a day.
 *   - this takes a `Date` too, and it is the ONE PLACE IN THE APP where handing
 *     an instant to `Intl` and letting it render in the reader's own zone is
 *     exactly right. `readings.created_at` IS an instant, and "what time did I
 *     take this reading" is a question about the clock the querent was looking
 *     at.
 *
 * Saying that next to two helpers that exist because it is usually NOT right is
 * the entire point of the placement. Move this into `src/lib/history/` and the
 * next person to need a time formatter writes a second one.
 *
 * NO OPTIONS PARAMETER, same rule as `formatDate`: a second call site with a
 * different format is how an app ends up rendering three time styles.
 */
export function formatTime(d: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlTag(locale), {
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}
