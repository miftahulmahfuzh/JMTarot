/**
 * W5's two GENERATED lines that are not readings: the card-frequency verdict
 * (§3.6) and the per-day reader summary (§5.3).
 *
 * They share a file because they share a shape -- a short, cached, generated
 * sentence about the querent's own history -- and because they are the two
 * halves of the same product claim: the app remembers. They do NOT share a
 * voice. The verdict is house voice (M6); the summary is the chosen reader's,
 * built from the identical `READER_PROMPTS` entry the readings use.
 *
 * NEITHER IS A READING, which is why both build on `SIDE_FORMAT_RULES` rather
 * than `BASE_CONTRACT`. See `side.ts` for what that drops and why.
 */
import { CARDS } from '@/data/deck';
import type { Locale } from '@/data/types';
import type { CompletionPrompt } from '@/lib/llm/types';
import type { FrequencyResult } from '@/lib/memory/frequency';
import { windowPhrase } from '@/lib/memory/windows';
import { SIDE_FORMAT_RULES } from './side';

/**
 * Bumped by hand when any prompt in this file changes in a way that should
 * invalidate cached output.
 *
 * NOT A HASH, unlike `readings.prompt_version`. That one is derived because a
 * reading's prompt is assembled from three layers that change independently and
 * nobody would remember to bump a constant. These two prompts are one function
 * each in one file, and the column they land in --
 * `frequency_verdicts.prompt_version`, `daily_summaries.prompt_version` -- is
 * read to decide whether a CACHED ROW IS STALE. A hash would invalidate every
 * cached summary on a whitespace edit; a hand-bumped epoch invalidates them when
 * a human decides the words changed enough to matter, which is the actual
 * question being asked.
 */
export const MEMORY_PROMPT_VERSION = 'memory-v1';

/** M4's runaway guard on the verdict, and the number the prompt states. */
export const FREQUENCY_MAX_WORDS = 25;

/**
 * Five framings, rotated deterministically by the fingerprint (§3.5).
 *
 * THE INSTRUCTION "WRITE IT DIFFERENTLY EACH TIME" IS NOT EXECUTABLE BY A
 * STATELESS MODEL -- it has no memory of last time and cannot comply. What is
 * executable is handing it a different frame. Rotating by a hash of the facts
 * is the mechanism that actually produces variety, and it is cache-coherent:
 * same facts, same angle, same line, so a cached row and a fresh generation
 * agree.
 *
 * ONE OF THE FIVE IS DELIBERATELY "NO IMAGE AT ALL". Four metaphors and no
 * plain option would make the feature read as relentlessly poetic, which is a
 * different failure from reading as repetitive and just as tiring.
 */
export const FREQUENCY_ANGLES: Record<Locale, readonly string[]> = {
  id: [
    'Bayangkan dua kartu itu sebagai timbangan: yang pertama lebih berat.',
    'Bayangkan yang pertama sebagai suara utama dan yang kedua sebagai suara di belakangnya.',
    'Bayangkan yang pertama sebagai pintu dan yang kedua sebagai apa yang menunggu di baliknya.',
    'Sebut saja jumlahnya apa adanya, tanpa perumpamaan.',
    'Bayangkan keduanya sebagai cuaca yang berulang di rentang waktu itu.',
  ],
  en: [
    'Frame the two as a balance: the first one weighs more.',
    'Frame the first as the voice in front and the second as the one behind it.',
    'Frame the first as a door and the second as what waits on the other side of it.',
    'Just name the counts plainly, with no image at all.',
    'Frame the two as weather that kept returning across that stretch of time.',
  ],
};

/**
 * Which angle a fingerprint selects. Exported because the analytics event
 * carries it, and because the test that proves the rotation bites needs it.
 *
 * The first eight hex digits are 32 bits -- comfortably inside the range where
 * `parseInt` is exact, which `slice(0, 16)` would not be.
 */
export function angleIndexFor(fingerprint: string, locale: Locale): number {
  return parseInt(fingerprint.slice(0, 8), 16) % FREQUENCY_ANGLES[locale].length;
}

/** `8` -> `'Strength'`. Ids are validated upstream; this is the display name. */
function cardName(cardId: number): string {
  return CARDS[cardId]?.name ?? `Card ${cardId}`;
}

/**
 * The frequency verdict prompt (§3.6). House voice, per M6.
 *
 * NO DELIMITER, AND THAT IS DELIBERATE (§7). Card ids, counts and dates are the
 * only things that reach this prompt -- no querent text of any kind -- so it is
 * the one memory prompt with no injection surface. Someone will eventually wrap
 * the user turn in a tag out of habit; a tag here would be the only unexplained
 * one in the codebase and would imply a threat that is not present. There is a
 * test asserting no `<` is emitted.
 *
 * The caller is responsible for having run `passesGate` first: this function
 * reads `ranked[0]` and `ranked[1]` and a result with fewer than two cards is a
 * verdict that should never have been requested.
 */
export function buildFrequencyPrompt(args: {
  result: FrequencyResult;
  locale: Locale;
}): CompletionPrompt {
  const { result, locale } = args;
  const [top, second] = result.ranked;
  const phrase = windowPhrase(result.window, locale);
  const angle = FREQUENCY_ANGLES[locale][angleIndexFor(result.fingerprint, locale)];

  const system =
    locale === 'id'
      ? `TUGASMU: satu kalimat tentang pola kartu penanya.

Penanya sudah menarik kartu beberapa kali dalam satu rentang waktu. Dua kartu yang paling sering muncul diberikan di pesan berikutnya, beserta jumlahnya. Tulis SATU kalimat, maksimal ${FREQUENCY_MAX_WORDS} kata, yang menyebut kedua kartu itu dan menempatkan yang pertama di atas yang kedua.

Ini bukan bacaan. Jangan menafsirkan, jangan menasihati, jangan meramal, jangan menyapa, jangan bertanya balik. Cukup namai polanya.

Sebut rentang waktunya dengan kata, bukan tanggal: "${phrase}".

${angle}

${SIDE_FORMAT_RULES.id}`
      : `YOUR TASK: one sentence naming the pattern in this querent's cards.

They have drawn several times over one stretch of time. The two cards that came up most often are in the next message, with their counts. Write ONE sentence, ${FREQUENCY_MAX_WORDS} words at most, that names both cards and puts the first one above the second.

This is not a reading. Do not interpret, do not advise, do not predict, do not greet, do not ask anything back. Name the pattern and stop.

Name the stretch of time in words, not dates: "${phrase}".

${angle}

${SIDE_FORMAT_RULES.en}`;

  const line = (n: number, card: typeof top) =>
    locale === 'id'
      ? `${n}. ${cardName(card.cardId)} — muncul ${card.count} kali (${card.reversedCount} terbalik)`
      : `${n}. ${cardName(card.cardId)} — came up ${card.count} times (${card.reversedCount} reversed)`;

  const user =
    locale === 'id'
      ? [
          `Rentang: ${phrase} (${result.from} .. ${result.to})`,
          `Bacaan dalam rentang ini: ${result.readings}`,
          '',
          line(1, top),
          line(2, second),
        ].join('\n')
      : [
          `Stretch: ${phrase} (${result.from} .. ${result.to})`,
          `Readings in it: ${result.readings}`,
          '',
          line(1, top),
          line(2, second),
        ].join('\n');

  /*
   * 120, against a 25-word ceiling. A runaway guard, not the length control --
   * the same relationship `MAX_TOKENS.spread3` has to the 40-words-per-paragraph
   * rule. Indonesian tokenizes at roughly 3.2 characters per token on an
   * English-tuned BPE, so 25 words is comfortably under 60 and the headroom is
   * there to let a model finish a sentence rather than be cut mid-clause.
   */
  return { system, user, maxTokens: 120 };
}

/**
 * The angle, the phrase and the two card names, without building the prompt.
 *
 * Used by the analytics event and by the smoke script, both of which want to
 * report what was chosen without paying for a prompt assembly.
 */
export function frequencyFacts(result: FrequencyResult, locale: Locale) {
  return {
    phrase: windowPhrase(result.window, locale),
    angle: angleIndexFor(result.fingerprint, locale),
    topName: cardName(result.ranked[0]?.cardId ?? -1),
    secondName: cardName(result.ranked[1]?.cardId ?? -1),
  };
}
