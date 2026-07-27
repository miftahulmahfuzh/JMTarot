import type { ServiceId, YesNo } from '@/data/types';
import { midpoint, type LengthBudget } from './budget';

/**
 * The English verdict words (I26).
 *
 * `Not yet` and not "Not yet clear". It reads fine as an opener, which is what the
 * yesno task needs -- the reading must OPEN with this word -- and it keeps the smoke
 * script's self-contradiction check tractable: that check greps for the OTHER two
 * verdicts, and a bare `No` collides with ordinary English prose (`no reason`, `there
 * is no`, `no one`) often enough that a hard FAIL would be noise. Task 11 downgrades
 * that one check to a sentence-initial WARN for `en` and says why.
 */
export const VERDICT_WORD_EN: Record<YesNo, string> = {
  yes: 'Yes',
  no: 'No',
  maybe: 'Not yet',
};

/**
 * The task layer, in English.
 *
 * STRUCTURALLY IDENTICAL TO `services.id.ts` AND DELIBERATELY SO. Same paragraph
 * counts, same "start each paragraph with the position name as written", same
 * explicit instruction to name the card in the first sentence, same ceiling
 * interpolated from `LENGTH_BUDGET`. The task layer is the one place in the fork
 * where divergence buys nothing: it describes what a reading IS, and that does not
 * change with the language.
 *
 * THE CARD-NAMING INSTRUCTION IS NOT BOILERPLATE. Under compression pressure
 * Thessaly stopped naming the cards at all in Indonesian, which is why the task says
 * so explicitly -- and there is no reason to expect an English model to behave
 * better about it. Same for the "do not replace them with past/present/future"
 * clause: the position names are the reader's own voice, and a model that swaps them
 * for the generic three has quietly deleted the persona from the slot captions.
 *
 * THE 40-WORD CEILING STARTS AT THE INDONESIAN NUMBER AND IS THEN MEASURED (§9.3).
 * It is not a translated calibration. See `budget.ts` for why it could move in
 * either direction.
 */
export function servicePromptEn(
  service: ServiceId,
  budget: Record<ServiceId, LengthBudget>,
  verdict?: YesNo,
): string {
  const b = budget[service];

  switch (service) {
    case 'daily':
      return `YOUR TASK: a Daily Card reading, one card.

LENGTH: exactly two paragraphs, each 2 to 4 sentences. No more.

First paragraph: today's energy, through that card.
Second paragraph: one small concrete thing to watch for today. One, not a list.

Close with both feet on the ground. This is one day, not a whole life, and your closing note has to feel that size -- not a large prediction, not a promise.`;

    case 'spread3':
      return `YOUR TASK: a Three Card reading.

LENGTH: exactly four paragraphs. Each paragraph 2 to 3 sentences AND at most ${b.maxParagraphWords} words -- whichever comes first is where the paragraph stops. The whole reading comes to about ${midpoint(b)} words. This is a short reading; if you can say it in fewer, do.

That ${b.maxParagraphWords}-word limit applies to every reader, including the one whose style runs to long sentences with clauses inside them. If your sentences are genuinely long, write ONE or TWO in that paragraph, not three. One long sentence that stays inside the word limit is better than two that break it. The word limit wins over the sentence count, every time.

How to make it shorter: one idea per paragraph, not three. Do not restate the same idea in another sentence, do not explain again what the card means after you have already said it, and cut the second image if the first one landed.

The first three paragraphs are for the three positions, in order. BEGIN each paragraph with that position's name exactly as written in the next message, then continue the sentence. Do not replace them with "the past", "the present" or "the future".

NAME the card in that paragraph's first sentence too, exactly as written, and add "(reversed)" if it is reversed. Making the reading shorter is not a reason to drop a card's name: the querent is looking at the cards on screen and has to know which paragraph is about which.

The fourth paragraph -- and this is the most important one -- DRAWS THE THREE TOGETHER into one thread. Not a summary that repeats the three paragraphs, but one understanding that only appears when all three cards are read together: how the first explains the second, and where the two of them point the third. This paragraph is also 2 to 3 sentences and at most ${b.maxParagraphWords} words.

If the three cards seem to contradict each other, do not smooth it over. That contradiction is often the reading.

FOUR paragraphs, not three. The fourth is required; without that synthesis the reading is just three separate card descriptions standing next to each other.
And the fourth paragraph is NOT longer than the three before it: at most ${b.maxParagraphWords} words, the same as the others.`;

    case 'yesno': {
      const word = verdict ? VERDICT_WORD_EN[verdict] : VERDICT_WORD_EN.maybe;
      return `YOUR TASK: a Yes or No reading, one card.

THE ANSWER IS ALREADY DECIDED: "${word}".

That answer comes from the card and its orientation, not from your judgement. You may NOT change it, soften it, or argue against it in the next sentence.

Begin the reading with the word "${word}" as the first word. Then 2-3 sentences on why this card says so.

LENGTH: one paragraph, 3 to 4 sentences. Being short is the shape of this service.${
        verdict === 'maybe'
          ? `\n\n"Not yet" is not you hedging. It is what the card says: the situation is not ripe enough to answer. Say so with confidence, and name what still has to happen.`
          : ''
      }`;
    }

    default: {
      const exhaustive: never = service;
      throw new Error(`Unknown service: ${String(exhaustive)}`);
    }
  }
}
