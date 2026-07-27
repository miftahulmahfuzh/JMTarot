/**
 * The only module that loads both catalogs.
 *
 * WHY THIS IS NOT IN `format.ts`. `LocaleProvider` is a client component and
 * imports `makeT`; every runtime import in that module's graph therefore reaches
 * the browser. Keeping the two catalog objects behind a separate module means the
 * client ships exactly one catalog — the resolved one, as JSON props from the
 * server — instead of one as JSON and both as code. That is I9's whole argument,
 * and the plan's §8 states the rule directly: a client component that imports
 * `catalogFor()` and picks a locale itself has shipped the language the user did
 * not choose.
 *
 * NOT `server-only`, deliberately. The smoke script, `scripts/**` and the Vitest
 * catalog tests all need `tFor()`, and `server-only` throws outside a Next server
 * bundle. The fence that matters is the one in the other direction — no `'use
 * client'` file may import this — and it is enforced by the ESLint
 * `no-restricted-imports` rule rather than by a package that would also break the
 * tests.
 */
import { makeT, type Catalog, type TFunction } from './format';
import { type Locale } from './locale';
import en from './locales/en';
import id from './locales/id';

const CATALOGS: Record<Locale, Catalog> = { id, en };

/**
 * The catalog for a locale.
 *
 * `Record<Locale, Catalog>` rather than a lookup with a fallback: adding a third
 * locale must be a compile error listing what to write, not a silent
 * `undefined` that makes every string on the page render as its own key.
 */
export function catalogFor(locale: Locale): Catalog {
  return CATALOGS[locale];
}

/**
 * Synchronous `t`, with the locale passed explicitly.
 *
 * For route handlers, `after()` callbacks, the smoke script, and anything else
 * outside a React render. Prefer it over `await getLocale()` wherever the locale
 * is already in hand — and in `/api/reading` it is MANDATORY, because `t` has to
 * be captured before the `ReadableStream` opens: inside `start(controller)` there
 * is no request context and `await headers()` throws or answers wrongly.
 */
export function tFor(locale: Locale): TFunction {
  return makeT(locale, CATALOGS[locale]);
}
