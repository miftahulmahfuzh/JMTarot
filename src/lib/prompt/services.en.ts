import 'server-only';

import type { ServiceId, YesNo } from '@/data/types';
import { CHOICE_MARKER } from '../reading/choice';
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
 * THE PER-PARAGRAPH CEILING STARTS AT THE INDONESIAN NUMBER AND IS THEN MEASURED
 * (§9.3). It is not a translated calibration. See `budget.ts` for why it could
 * move in either direction -- and for the 30% cut of 2026-07-29, which took the
 * number this paragraph used to name (40) down to 28.
 *
 * `structurally identical` NOW INCLUDES `CHOICE_RULE_EN`, which is in `daily` and
 * `spread3` and deliberately not in `yesno`. The asymmetry is the point rather
 * than a gap in the fork; the argument is in `services.id.ts`.
 */
/**
 * CHOOSE ONE, in English. **THE MARKER TOKEN DOES NOT FORK AND THE PROSE DOES.**
 *
 * `CHOICE_MARKER` is `PILIHAN:` in both locales, which looks like an oversight in
 * this file and is the decision: it is a protocol token no querent ever sees, one
 * regex parses it, and R17 already settled this shape for `<pertanyaan>` and
 * `<terjemahan>` -- an English-looking token would be a second spelling to keep in
 * step for no reader-visible gain.
 *
 * The rest is REWRITTEN rather than translated, which is `## Localization` rule 3
 * applied to a task rule: the option shapes an English querent types are not the
 * ones an Indonesian querent types, so the examples differ on purpose --
 * `"A or B"`, `"A versus B"` here against `"A atau B"`, `"A apa B"` there. If a
 * future version of this string lists `atau`, it was translated.
 *
 * Everything else about the rule -- why it is here and not in `base.en.ts`, why it
 * excludes `yesno`, where it sits inside each task, and why "copy exactly" is not
 * trusted -- is in `services.id.ts`'s `CHOICE_RULE_ID`. It is written once because
 * the argument is about the task layer, not about a language.
 */
const CHOICE_RULE_EN = `A QUESTION THAT OFFERS A CHOICE:
If the text inside <pertanyaan> names two or more options -- "A or B", "A versus B", "should I X or Y", three at once, whatever the shape -- you MUST pick exactly ONE. Not two, not "both have something to offer", not "it depends on you", not "whichever feels right". The cards choose; you report.
Name that option in your LAST paragraph, in the querent's own words. Not somewhere, not by implication -- in the last paragraph, so the reading itself answers the question and not only the line above it. A reader who sees the prose and nothing else must be able to tell what you chose.
Then, SEPARATELY from that, write one marker line as the VERY FIRST LINE of your answer -- before the first paragraph, not in the middle, and NEVER at the end. One blank line after it, then the reading:

${CHOICE_MARKER} <one option only, copied exactly from the question>

The marker line is not part of the reading and does not count towards the word limit. Copy the option EXACTLY as it appears in the question: do not translate it, do not correct its spelling, do not add any words to it.
That line holds ONE option and nothing else, as short as it can be -- "the new job", not "take the new job offer or stay where I am". If the word "or" is still on that line, you have not chosen yet. Do not copy the whole question, and do not name the option you did not pick.
If <pertanyaan> offers no choice at all, do NOT write that line. Begin with the reading.`;

export function servicePromptEn(
  service: ServiceId,
  b: LengthBudget,
  verdict?: YesNo,
): string {

  switch (service) {
    case 'daily':
      return `YOUR TASK: a Daily Card reading, one card.

LENGTH: exactly two paragraphs. Each paragraph 2 to 3 sentences AND at most ${b.maxParagraphWords} words -- whichever comes first is where the paragraph stops. The word limit wins over the sentence count.

${CHOICE_RULE_EN}

First paragraph: today's energy, through that card.
Second paragraph: one small concrete thing to watch for today. One, not a list.

Close with both feet on the ground. This is one day, not a whole life, and your closing note has to feel that size -- not a large prediction, not a promise.`;

    case 'spread3':
      return `YOUR TASK: a Three Card reading.

LENGTH: exactly four paragraphs. Each paragraph 1 to 2 sentences AND at most ${b.maxParagraphWords} words -- whichever comes first is where the paragraph stops. The whole reading comes to about ${midpoint(b)} words. This is a short reading; if you can say it in fewer, do.

That ${b.maxParagraphWords}-word limit applies to every reader, including the one whose style runs to long sentences with clauses inside them. If your sentences are genuinely long, write ONE in that paragraph, not two. One long sentence that stays inside the word limit is better than two that break it. The word limit wins over the sentence count, every time.

How to make it shorter: one idea per paragraph, not three. Do not restate the same idea in another sentence, do not explain again what the card means after you have already said it, and cut the second image if the first one landed.

${CHOICE_RULE_EN}

The first three paragraphs are for the three positions, in order. BEGIN each paragraph with that position's name exactly as written in the next message, then continue the sentence. Do not replace them with "the past", "the present" or "the future".

NAME the card in that paragraph's first sentence too, exactly as written, and add "(reversed)" if it is reversed. Making the reading shorter is not a reason to drop a card's name: the querent is looking at the cards on screen and has to know which paragraph is about which.

The fourth paragraph -- and this is the most important one -- DRAWS THE THREE TOGETHER into one thread. Not a summary that repeats the three paragraphs, but one understanding that only appears when all three cards are read together: how the first explains the second, and where the two of them point the third. This paragraph is also 1 to 2 sentences and at most ${b.maxParagraphWords} words.

If the three cards seem to contradict each other, do not smooth it over. That contradiction is often the reading.

FOUR paragraphs, not three. The fourth is required; without that synthesis the reading is just three separate card descriptions standing next to each other.
And the fourth paragraph is NOT longer than the three before it: at most ${b.maxParagraphWords} words, the same as the others.`;

    case 'yesno': {
      const word = verdict ? VERDICT_WORD_EN[verdict] : VERDICT_WORD_EN.maybe;
      return `YOUR TASK: a Yes or No reading, one card.

THE ANSWER IS ALREADY DECIDED: "${word}".

That answer comes from the card and its orientation, not from your judgement. You may NOT change it, soften it, or argue against it in the next sentence.

Begin the reading with the word "${word}" as the first word. Then 1-2 sentences on why this card says so.

LENGTH: one paragraph, 2 to 3 sentences AND at most ${b.maxParagraphWords} words -- whichever comes first. Being short is the shape of this service.${
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
