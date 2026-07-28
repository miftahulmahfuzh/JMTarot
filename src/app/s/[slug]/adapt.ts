/**
 * `ResolvedShare` -> `ReadingView`'s props, in ONE file.
 *
 * **THIS FILE IS THE RECONCILIATION SEAM AND THAT IS ITS ENTIRE JOB.** V7 was
 * written against V6's `ReadingView` while V6 was still being written, and V6's
 * shipped props differ from what V7's plan `## Interfaces I need` assumed — the
 * plan guessed a flat `{ reader, service, cards, body, bodyLocale, verdict, … }`
 * and the component actually takes `{ reading: ReadingDetail, prose, footer,
 * onCardOpened }`. Because every mount goes through here, that cost one file
 * rather than a page.
 *
 * PURE. No `next/*`, no session, no database, no React — so the truth table
 * below is testable without a DOM, which is the other reason it is not inlined in
 * `page.tsx`.
 *
 * ── RULE 4, AND WHY `prose` IS PASSED EXPLICITLY ────────────────────────────
 *
 * `ReadingView` NEVER renders `reading.body` when `reading.locale` differs from
 * the viewer's and no `prose` was supplied — it renders the TRANSLATING state
 * instead, forever, because nothing on the public page can ever fetch a
 * translation. So **omitting `prose` here would leave a stranger on a pulsing
 * spinner with nothing failing and nothing logged.**
 *
 * Reconciliation §5.5 says to pass `{ kind: 'original' }`, and **that instruction
 * does not work against V6's shipped component** — `resolveProse` deliberately
 * treats an explicit `original` exactly like an omitted prop, with a test named
 * for it, so following the reconciliation literally would have produced the very
 * spinner it was written to prevent. Found by reading that function rather than by
 * running the page, because the page LOOKS correct in Indonesian.
 *
 * So V7 added `{ kind: 'as-written' }` to `ReadingProse`: a state that says "the
 * prose stays in its own language and I have decided that", which is what
 * reconciliation §5.5 MEANT. Rule 4 is untouched — an omitted `prose` still yields
 * the spinner, and V6's truth table did not lose a line. The reconciliation's
 * reasoning is what settles it, and it is worth keeping in front of whoever reads
 * this next:
 *
 *   - VD7: `readings.body` is immutable and the original is what was shared.
 *   - VD8: translation is on demand and never in bulk. **The public route must
 *     never generate anything** — it is reachable by anyone holding a slug, and a
 *     public route that can spend a model call is a quota with no gate on it.
 *   - Even reading an EXISTING `translations` row would be wrong here: the page
 *     would then render differently depending on invisible state the sharer
 *     cannot see, which makes the share sheet's "this is exactly what they will
 *     see" preview a lie. The preview promise is worth more than the convenience.
 *
 * The honesty is carried by the `lang` attribute alone: the body is wrapped in
 * `<div lang={renderedLocale(...)}>` so a screen reader pronounces it correctly and
 * the browser's own translate offer points at the right language.
 *
 * **`isForeignProse` USED TO LIVE HERE AND IS DELETED** (Miftah's ruling,
 * 2026-07-28). Its whole job was to decide whether to print
 * `share.public.otherLanguage`, and that notice is gone — see `page.tsx`'s header
 * for the argument, which is that design A changed what the page shows underneath a
 * sentence describing the old mechanism. `renderedLocale` survives and is now the
 * only thing here that answers "what language is on screen"; the comparison against
 * the VIEWER's locale is what went, not the rendered locale itself.
 */
import type { ReadingProse, ReadingViewData } from '@/components/ReadingView';
import type { Locale } from '@/data/types';
import type { PublicReading, SharedTranslation } from '@/lib/share/types';

/** Exactly the props `page.tsx` hands `ReadingView`, minus the footer. */
export type SharedReadingViewProps = {
  reading: ReadingViewData;
  prose: ReadingProse;
};

/**
 * Re-exported so the adapter's own tests and callers need one import, while the
 * definition stays in `@/lib/share/types` — the file `resolveShare` (which
 * produces the value) and this adapter (which consumes it) can both reach.
 */
export type { SharedTranslation };

/**
 * Build the props. **`prose` IS ALWAYS `{ kind: 'as-written' }`** — see the header.
 *
 * `status` is hardcoded to `'ok'` rather than carried through, and that is not a
 * shortcut: `publicReadingQuery`'s `where` requires it, so a `PublicReading` that
 * exists is an `ok` reading by construction. Carrying the column would add a field
 * whose only possible value is the one the query already guaranteed, and the first
 * thing somebody would do with it is render a status badge on a public page.
 *
 * `question` and `nickname` are read with `in` rather than `?.`: the excluded
 * variants have no KEY at all (see `@/lib/share/types`), and `undefined` is not
 * what `ReadingDetail` accepts — it wants `string | null`.
 */
export function adaptSharedReading(
  reading: PublicReading,
  translation: SharedTranslation,
): SharedReadingViewProps {
  return {
    reading: {
      id: reading.id,
      readerId: reading.readerId,
      serviceId: reading.serviceId,
      localDate: reading.localDate,
      createdAtIso: reading.createdAtIso,
      locale: reading.locale,
      status: 'ok',
      verdict: reading.verdict,
      question: 'question' in reading ? (reading.question ?? null) : null,
      body: reading.body,
      /*
       * `sharedAt` IS NULL ON THE PUBLIC PAGE, DELIBERATELY. The column is real
       * and this reading certainly has it set -- that is what minting the link
       * did -- but V6 reads it to draw a "this has left the app" badge for the
       * OWNER, and a stranger has no use for it. Passing it would put a
       * timestamp about the sharer's behaviour into the flight payload for no
       * rendered pixel.
       */
      sharedAt: null,
      cards: reading.cards,
    },
    /*
     * `'translated'` WHEN A PINNED ROW CAME BACK, `'as-written'` OTHERWISE.
     *
     * `'translated'` is correct rather than a convenient near-miss: a translation
     * genuinely happened and is a row in `translations`. `ReadingProse`'s comment
     * warns in capitals against the OPPOSITE mistake -- naming `translated` when
     * nothing was translated -- and that warning is why the two states exist.
     *
     * **THE SOURCE IS NEVER OVERWRITTEN.** `reading.body` and `reading.locale` stay
     * as the row holds them, above, so `resolveProse` can still evaluate rule 4
     * against the real source locale and VD7's immutability is not contradicted
     * even locally.
     */
    prose: translation
      ? { kind: 'translated', locale: translation.locale, text: translation.body }
      : { kind: 'as-written' },
  };
}

/**
 * The locale the viewer's eyes actually land on.
 *
 * **THIS, NOT `reading.locale`, IS WHAT THE CHROME AND THE `lang` ATTRIBUTE MUST
 * AGREE WITH.** Before design A the two were always the same and the distinction
 * did not exist; now a pinned translation makes them differ exactly when the
 * feature is doing its job, so anything answering "what language is on screen"
 * has to come through here.
 */
export function renderedLocale(reading: PublicReading, translation: SharedTranslation): Locale {
  return translation ? translation.locale : reading.locale;
}

/**
 * Which nickname to render, or null.
 *
 * `include_nickname` decided this at mint time and the query already refused to
 * SELECT the column when it was false — so this function should never be the
 * thing that hides it. It exists as the second half of the same fence: if a
 * future query change starts fetching the nickname unconditionally, the toggle
 * still governs the pixel. Two independent mechanisms, which is §5's whole shape.
 */
export function sharedNickname(reading: PublicReading, includeNickname: boolean): string | null {
  if (!includeNickname) return null;
  if (!('nickname' in reading)) return null;
  const raw = reading.nickname;
  return typeof raw === 'string' && raw.trim() !== '' ? raw : null;
}
