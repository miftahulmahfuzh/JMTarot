/**
 * The two DETERMINISTIC sentences on `/account`, and the gate that decides whether
 * either gets to exist.
 *
 * **NO `server-only` MARKER, AND THAT IS THE POINT OF THE THIRD FILE.**
 * `prompt.ts` and `generate.ts` both carry it — `prompt.ts` because it holds
 * contract prose that must never reach the browser, `generate.ts` because it holds
 * the database and the provider. This module holds neither: it composes message-
 * catalog strings and nothing else, so `/account` can render it and
 * `clientBoundary.test.ts` fences `@/lib/persona/**` with this one exception,
 * paired with an assertion that it contains no contract prose. Same split as
 * `@/lib/prompt/sanitize` against the rest of that directory, and
 * `moderation/types.ts` against `blocklist.ts`.
 *
 * **THESE ARE TEMPLATES AND NOT GENERATED (A8), AND THE REASON IS REGISTER RATHER
 * THAN COST.** Three model calls for one page would be three failure modes and
 * three latencies for two sentences — but the deciding argument is different:
 * `frequency_verdicts` is generated because it recurs on the reader picker DAILY
 * and a template would read identically the fourth time. `/account` is visited
 * occasionally and its subject is IDENTITY, which should be stable. A line that
 * rephrased itself every visit would undercut the claim it is making. The generated
 * artifact on this page is the persona, which is where requirement 4 actually lives.
 *
 * `ALL_TIME_GATE` lives here rather than beside the queries because it is product
 * judgement with no handle to take — `contract.test.ts` would fail it in
 * `queries/allTime.ts` — and because it is the same argument `FREQUENCY_GATE`
 * makes: a change to it changes what the app claims about a person.
 */
import { CARDS } from '@/data/deck';
import { READERS } from '@/data/readers';
import type { Locale, ReaderId } from '@/data/types';
import type { TFunction } from '@/lib/i18n/format';
import type { PersonaFacts } from './prompt';

export const ALL_TIME_GATE = {
  /** Readings, not cards. One three-card spread is three cards, not a pattern. */
  minReadings: 3,
  /** The card must have actually recurred. Once is Tuesday, not the universe. */
  minTopCount: 2,
  /**
   * The reader block needs a PREFERENCE, so the top reader must be strictly ahead.
   * A two- or three-way tie is not a path opening; it is somebody browsing.
   */
  readerMustLead: true,
} as const;

/** What the reader gate needs beyond `PersonaFacts`, which carries no runner-up. */
export type ReaderStanding = { readerId: ReaderId; count: number; runnerUpCount: number } | null;

/**
 * Does the querent have a card worth naming?
 *
 * BOTH CONDITIONS, and neither is redundant. `minReadings` stops one spread
 * looking like a pattern; `minTopCount` stops a card that appeared exactly once in
 * five readings being called the card that keeps arriving. A user with three
 * readings and eight distinct cards passes the first and fails the second, which is
 * the correct answer for them.
 */
export function passesCardGate(facts: Pick<PersonaFacts, 'readingCount' | 'topCardCount'>): boolean {
  if (facts.readingCount < ALL_TIME_GATE.minReadings) return false;
  return (facts.topCardCount ?? 0) >= ALL_TIME_GATE.minTopCount;
}

export function passesReaderGate(readingCount: number, standing: ReaderStanding): boolean {
  if (readingCount < ALL_TIME_GATE.minReadings) return false;
  if (standing === null) return false;
  if (!ALL_TIME_GATE.readerMustLead) return true;
  return standing.count > standing.runnerUpCount;
}

/**
 * "Your Inner Lotus takes the form of The Star. It has come back to you again and
 * again, and what it carries is …"
 *
 * **THE CARD NAME IS ENGLISH IN BOTH LOCALES** and the gloss is not. That is
 * `## Card data`'s rule and it is load-bearing here for a second reason: the
 * thumbnail beside this sentence draws the same name over the art, so a translated
 * name would disagree with the image next to it.
 *
 * **THE GLOSS COMES FROM THE RIGHT HALF OF THE MEANING PAIR.** `cardMeaning` is a
 * pair, and the reversed line is a different STATEMENT rather than a negation —
 * showing the upright gloss for a card that keeps arriving upside down contradicts
 * the artwork the querent remembers. Strictly more than half, so an even split
 * reads as upright: a 2:2 card has not declared itself.
 *
 * Returns null when the gate fails; the caller renders `account.card.empty`.
 */
export function topCardLine(
  t: TFunction,
  locale: Locale,
  facts: Pick<PersonaFacts, 'readingCount' | 'topCardId' | 'topCardCount' | 'topCardReversedDominant'>,
): string | null {
  if (!passesCardGate(facts)) return null;
  if (facts.topCardId === null) return null;

  const card = CARDS[facts.topCardId];
  if (!card) return null;

  const pair = card.meaning[locale];
  const gloss = facts.topCardReversedDominant === true ? pair.reversed : pair.upright;

  /*
   * TERMINAL PUNCTUATION IS ADDED ONLY IF THE GLOSS DOES NOT ALREADY CARRY IT, and
   * the first draft got this wrong in the other direction: it appended a stop
   * unconditionally, on the assumption that the `cards.json` glosses are fragments.
   * **ALL 22 OF THEM END IN A FULL STOP** — `tools/generate_cards.py` writes whole
   * sentences — so the line came out `...berantakan..` in every locale. Caught by
   * its own test.
   *
   * The stop is added HERE rather than written into the catalog value, so that a
   * `{gloss}.` in the catalog does not read as an editing mistake to a translator
   * and so that a future gloss written without one still lands correctly.
   */
  const sentence = t('account.card.line', { card: card.name, gloss });
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

/**
 * "A path opened toward Margaret, and what you carry there is … Margaret will go
 * with you as far as they can." Then the closing line.
 *
 * **THE CLOSING LINE IS RETURNED SEPARATELY**, so the page can set it in its own
 * italic and so `lines.test.ts` can assert it is byte-identical to the catalog
 * value. It is the only sentence on the page that asks something OF the querent
 * rather than describing them, and that contrast is requirement 3.
 *
 * `{topic}` is the reader's own `specialties[locale][0]`, which is already
 * `Localized<>` in `readers.json` — a third copy of "what Margaret is for" is
 * exactly what I14 exists to prevent.
 */
export function topReaderLine(
  t: TFunction,
  locale: Locale,
  readingCount: number,
  standing: ReaderStanding,
): { line: string; closing: string } | null {
  if (!passesReaderGate(readingCount, standing) || standing === null) return null;

  const reader = READERS.find((r) => r.id === standing.readerId);
  if (!reader) return null;

  const topic = reader.specialties[locale][0];
  if (!topic) return null;

  return {
    line: t('account.reader.line', { reader: reader.name, topic: topic.toLowerCase() }),
    closing: t('account.reader.closing'),
  };
}
