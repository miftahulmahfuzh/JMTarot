/**
 * The leaf of the i18n layer: what a locale is, and how to pick one.
 *
 * DELIBERATELY DEPENDENCY-FREE. No React, no `next/*`, no catalog import, no
 * `server-only`. This module is imported by the edge middleware, by
 * `src/lib/db/schema.ts` for its `$type<Locale>()` annotations, and by the smoke
 * script — and any one of those picking up a transitive React or Next dependency
 * would be a problem that shows up as a build error somewhere unrelated.
 *
 * `negotiate` lives here rather than in `resolve.ts` for the same reason:
 * `resolve.ts` is `server-only`, which throws under Vitest, and the
 * `Accept-Language` parser is the one piece of this layer with enough edge cases
 * to deserve its own test file.
 */

/*
 * Reconciliation R4: `Locale` is DEFINED in `src/data/types.ts` and RE-EXPORTED
 * here. It lives there so the Drizzle schema can reach it without `@/lib/db/**`
 * acquiring a dependency on `@/lib/i18n/**`; `types.ts` has no imports, which is
 * what makes that safe. Do not redeclare it here — two declarations of a
 * two-member union type agree right up until they do not.
 */
import type { Locale } from '@/data/types';

export type { Locale };

export const LOCALES = ['id', 'en'] as const satisfies readonly Locale[];

/**
 * The fallback of last resort, and the language `id.ts` is written in.
 *
 * A CONSTANT AND NOT AN ENVIRONMENT VARIABLE, on purpose (plan §6). Every string
 * in the app falls back to this, so a preview deployment that disagreed with
 * production about it would be a bug nobody could reproduce locally — and the
 * upside, flipping the default without a commit, is a thing we would want in a
 * diff anyway.
 */
export const DEFAULT_LOCALE: Locale = 'id';

/**
 * A value that exists once per locale. A missing locale is a compile error.
 *
 * This is why `Record<Locale, T>` and not `{ id: T; en?: T }`: the whole point of
 * the shape is that adding a third locale produces a list of type errors naming
 * every place that has to be written, rather than a runtime `undefined` handed to
 * a model or rendered at a user.
 */
export type Localized<T> = Record<Locale, T>;

/**
 * Is this one of ours?
 *
 * Strict by design — `'en-US'`, `'ID'` and `'id '` are all rejected. It guards
 * three untrusted inputs: the `jmt_locale` cookie, the dev-only `?lang=` query
 * parameter, and `POST /api/locale`'s body. A near-miss that passed would reach
 * `catalogFor()`, miss, and render raw message keys at the user, which is I3
 * working as designed against a value that should never have got that far.
 */
export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

/**
 * The BCP-47 tag for `Intl`. I7: `id -> id-ID`, `en -> en-GB`.
 *
 * `en-GB` rather than `en-US` is a decision, not an oversight, and `formatDate`
 * is what makes it nearly free: it always spells the month, so the
 * 26/7-vs-7/26 question never has to be answered. The tag still matters for
 * `Intl.NumberFormat` (`1,000` either way) and `Intl.PluralRules` (identical for
 * both English regions).
 */
export function intlTag(locale: Locale): string {
  return locale === 'id' ? 'id-ID' : 'en-GB';
}

/**
 * The deprecated primary subtags we still accept, mapped to the live one.
 *
 * `in` was ISO 639-1 for Indonesian until 1989 and some Android browsers still
 * send it. Java's `Locale` famously normalises the other direction, so a request
 * proxied through a JVM can also arrive this way.
 */
const ALIASES: Record<string, Locale> = { in: 'id' };

/**
 * `en-GB,en;q=0.9,id;q=0.8` -> `'en'`.
 *
 * PURE, AND THE ONLY PLACE `Accept-Language` IS PARSED (I10). Middleware calls it
 * once per request and forwards the answer as a header, so no server component
 * ever redoes this chain.
 *
 * Deliberately lenient about the header and strict about the result: a malformed
 * `q`, a `q` outside 0..1, a `q=0` ("not acceptable") and the `*` wildcard are
 * all skipped rather than throwing, because this runs on every request against a
 * header no client is obliged to get right. `*` in particular is not a match —
 * it means "anything else will do", which is what DEFAULT_LOCALE already is.
 */
export function negotiate(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  let best: Locale | null = null;
  let bestQ = 0;

  for (const part of acceptLanguage.split(',')) {
    const [rawTag, ...params] = part.split(';');
    const tag = rawTag.trim().toLowerCase();
    if (!tag || tag === '*') continue;

    const primary = tag.split('-')[0];
    const candidate = isLocale(primary) ? primary : ALIASES[primary];
    if (!candidate) continue;

    const q = quality(params);
    // `>` and not `>=`: earlier entries win ties, which is the order the client
    // wrote them in and the only tiebreak the header offers.
    if (q > bestQ) {
      best = candidate;
      bestQ = q;
    }
  }

  return best ?? DEFAULT_LOCALE;
}

/** The `q` parameter, or 1 when absent. 0 for anything malformed or out of range. */
function quality(params: string[]): number {
  for (const p of params) {
    const [k, v] = p.split('=');
    if (k.trim().toLowerCase() !== 'q') continue;
    const q = Number.parseFloat((v ?? '').trim());
    return Number.isFinite(q) && q > 0 && q <= 1 ? q : 0;
  }
  return 1;
}
