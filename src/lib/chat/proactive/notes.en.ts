/**
 * THE ENGLISH HALF. **REWRITTEN, NOT TRANSLATED** — `## Localization` rule 3, and
 * `material.test.ts` is the enforcement.
 *
 * The rule is stated for the worked examples in the reader prompts and the reason
 * generalises exactly: *"a reviewer can see it in five seconds."* Here it bites on the
 * angle each line takes rather than on the nouns — the Indonesian `orphan` note calls
 * the risk *menagih* (chasing somebody for a reply) and this one calls it *nudging*,
 * because those are the two things the respective rooms actually do wrong.
 *
 * Same register rule as the Indonesian half: a note **names a subject**, never a
 * sentence for a reader to say (`[F5-9]`). And the English tic list applies to a prompt
 * as much as to output — no *the Universe*, no *soul's journey*, and nothing from
 * `THERAPY_EN`, which binds harder on a surface whose whole point is that a reader may
 * ask about the worst thing you have seen.
 */
import type { MaterialNotes } from './notes';

export const MATERIAL_NOTES_EN: MaterialNotes = {
  reading: () => 'new since this room last spoke: the querent finished laying cards out',

  unanswered: () => 'a reader asked something and the querent never came back to it',

  orphan: () =>
    "a reader's message was left sitting there; this is material to build on, not to nudge about",

  recurring: () =>
    'new since this room last spoke: one card keeps turning up across their recent readings',

  occasion: (m) =>
    m.occasion === 'birthday'
      ? "new today: it is the querent's birthday"
      : m.occasion === 'first_reading_anniversary'
        ? 'today is a year to the day since their first reading'
        : 'they are back after a long stretch away',

  lotus: (m) =>
    `new since this room last spoke: their own picture of themselves shifted — ${m.summary}`,
};
