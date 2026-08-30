/**
 * `refillView` AND THE `Refill` SHAPE IT READS — A PURE MODULE, ON PURPOSE.
 *
 * ── WHY THIS IS NOT IN `HistoryDetail.tsx` ANY MORE (2026-08-30) ────────────
 *
 * It was, and `HistoryDetail.test.ts` imported it from there. That worked only
 * while `HistoryDetail.tsx`'s module graph stayed light: the unit project runs in
 * plain Node with no Next compiler, so importing the component means importing
 * **everything it imports, transitively**. When `ReadingActions` put the account
 * control under a finished reading, that graph grew `AccountMenu` ->
 * `@/lib/auth/actions` -> `next-auth`, whose `'use server'` directive is inert
 * under Vitest -- and the test died on `Cannot find module 'next/server'`, naming
 * a package this function has never heard of.
 *
 * **THE FIX IS THE SEPARATION THE TEST'S OWN HEADER ALREADY ARGUED FOR.** That
 * header says rule 4 was extracted into an exported pure function *"because the
 * component itself is unreachable from the unit project"*; the component is now
 * unreachable in a second, harder sense, so the function moved the rest of the
 * way out. **NOTHING HERE MAY IMPORT A COMPONENT, `next/*`, OR ANYTHING UNDER
 * `@/lib/auth/**`** -- the two type imports below are the whole dependency list,
 * and the next person to widen them re-creates the failure this file exists to
 * end.
 */
import type { ReadingProse, ReadingViewData } from '@/components/ReadingView';
import type { Locale } from '@/data/types';

export type Refill = {
  text: string;
  /**
   * `readings.locale`, off `x-reading-locale` — the language the prose was
   * GENERATED in, which a retry never moves. Defaulted to `reading.locale` when
   * the header is absent or malformed, which is what the route's own comment
   * tells every client to do.
   */
  locale: Locale;
  choice: string | null;
};

/**
 * THE REFILLED READING, AND THE PROSE DECISION THAT GOES WITH IT.
 *
 * **THIS FUNCTION IS WHERE `ReadingView`'s RULE 4 SURVIVES THE REFILL, AND IT IS
 * EXPORTED AND UNIT-TESTED FOR EXACTLY THAT REASON.** Rule 4 — never render
 * `reading.body` when `reading.locale` differs from the viewer's and no
 * translation was supplied — is the RENDERER's invariant rather than the
 * caller's discipline, and the refill is the one path that hands the renderer a
 * body the server did not send. A truth table in `HistoryDetail.test.ts` holds
 * it, because the component itself is unreachable from the unit project.
 *
 * ── WHY A COPY OF THE READING AND NOT JUST THE `prose` PROP ──────────────────
 *
 * `resolveProse` short-circuits to `{ kind: 'unavailable' }` whenever
 * `reading.body === null`, WHATEVER the caller passed — deliberately, so an
 * empty row can never be dressed up as prose. So a refill handed in through
 * `prose` alone paints nothing at all. The body has to move onto the reading.
 *
 * ── WHY `as-written` AND NEVER `original` ────────────────────────────────────
 *
 * On a language mismatch this returns V7's `{ kind: 'as-written' }`: a NAMED
 * decision to show the prose in the language it came out in, which `ReadingView`
 * renders with a `lang` attribute. It must NEVER return `{ kind: 'original' }` —
 * `resolveProse` treats that identically to an omitted prop, so it would put
 * Indonesian prose in the English app through the very function written to stop
 * that. It never returns `translated` either: nothing was translated.
 *
 * `status: 'ok'` on the copy is the same claim `Draw.tsx` makes when its stream
 * ends normally, and `attachable()` and `ShareFooter`'s condition both read it.
 * `choice` falls back to the stored one, so a refill that produced no marker
 * does not erase a verdict the row already carried.
 */
export function refillView(
  reading: ReadingViewData,
  refill: Refill | null,
  viewer: Locale,
): { view: ReadingViewData; prose: ReadingProse | null } {
  // IDENTITY, not a copy. Nothing has happened yet, so nothing should re-render.
  if (refill === null) return { view: reading, prose: null };

  const view: ReadingViewData = {
    ...reading,
    body: refill.text,
    locale: refill.locale,
    status: 'ok',
    choice: refill.choice ?? reading.choice,
  };

  return { view, prose: refill.locale === viewer ? null : { kind: 'as-written' } };
}
