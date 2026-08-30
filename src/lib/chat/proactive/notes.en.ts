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
import type { UserMemoryKind } from '@/lib/memory/profile/types';
import { CHAT_TIME_VOCAB, WEEKDAYS } from '../clock';
import type { MaterialNotes } from './notes';

/**
 * The subjects, in English. **Nothing here is a therapy word and nothing here is a fact** —
 * the English tic list binds a prompt as hard as it binds output, and this table is what
 * tells the director a subject is available at all.
 *
 * The typographic apostrophe avoids escaping inside these single-quoted literals and matches
 * the codebase's prose constants elsewhere.
 */
export const PROFILE_SUBJECT_EN: Record<UserMemoryKind, string> = {
  habit: 'the shape of the querent’s ordinary day',
  taste: 'what the querent likes',
  person: 'the people around the querent',
  situation: 'what is going on in the querent’s life',
  place: 'where the querent spends time',
  trait: 'how the querent describes themselves',
  other: 'something about the querent',
};

export const MATERIAL_NOTES_EN: MaterialNotes = {
  reading: () => 'new since this room last spoke: the querent finished laying cards out',

  unanswered: () =>
    'a reader asked something and the querent never came back to it; this is material to come at from another side, not to chase an answer for',

  orphan: () =>
    "a reader's message was left sitting there; this is material to build on, not to nudge about",

  recurring: (m) =>
    `new since this room last spoke: ${m.mechanic.topName} keeps turning up across their readings`,

  occasion: (m) =>
    m.occasion === 'birthday'
      ? "new today: it is the querent's birthday"
      : m.occasion === 'first_reading_anniversary'
        ? 'today is a year to the day since their first reading'
        : 'they are back after a long stretch away',

  lotus: (m) =>
    `new since this room last spoke: their own picture of themselves shifted — ${m.summary}`,

  /*
   * **REWRITTEN, NOT TRANSLATED, AND THE ANGLE IS THE DIFFERENCE.** The Indonesian note
   * says *what is known*; this one says *how it got there — over time*, which is the thing
   * an English room would actually remark on. Neither carries the sentence itself.
   */
  profile: (m) =>
    `something this room has picked up about ${PROFILE_SUBJECT_EN[m.itemKind]} over time`,

  /*
   * **THE INDONESIAN NOTE LEADS WITH THE CLOCK; THIS ONE LEADS WITH THE SHAPE OF THE
   * WEEK.** Same rule, same reason: a reviewer can see a translation in five seconds.
   *
   * The closing clause is the same load-bearing one — it is what licenses an opener rather
   * than a hunt through the transcript for a pretext.
   */
  time_of_day: (m) => {
    const shape =
      m.shape === 'week_start'
        ? 'the working week has just started'
        : m.shape === 'weekend_close'
          ? 'the weekend is nearly over'
          : m.shape === 'weekend'
            ? 'it is the weekend'
            : 'it is an ordinary weekday';
    return `${shape}; where the querent is it is ${CHAT_TIME_VOCAB.en.weekdays[WEEKDAYS.indexOf(m.weekday)]} ${CHAT_TIME_VOCAB.en.parts[m.part]}, and nothing else in this room is new`;
  },
};
