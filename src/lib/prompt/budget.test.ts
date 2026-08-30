import { describe, expect, it } from 'vitest';

import { LOCALES } from '@/lib/i18n/locale';
import { READERS } from '@/data/readers';
import {
  budgetFor,
  chatBudgetFor,
  CHAT_LENGTH_BUDGET,
  CHAT_MAX_TOKENS,
  LENGTH_BUDGET,
  MARGARET_MULTIPLIER,
} from './budget';

const READER_IDS = READERS.map((r) => r.id);

describe('CHAT_LENGTH_BUDGET', () => {
  /**
   * `C-D19`'s ceiling. **24 and not 28**: `spread3`'s per-paragraph ceiling is one of
   * four paragraphs of a *reading*, which is denser prose than a chat message, and a
   * 28-word bubble at 390px is four lines — the chatbot tell `C-D19` names.
   *
   * **IT SHIPPED AT 22 AND THE FIRST THREE CALIBRATION RUNS MOVED IT**, because
   * Margaret's resolved 29 refused three of her six English turns. See
   * `CHAT_LENGTH_BUDGET`'s header for the measurement.
   *
   * ── AND `en` MOVED AGAIN, 24 → 27, ON 2026-08-09 — THE SECOND ROUND ─────────
   *
   * **THE SAME READER, THE SAME LOCALE, THE SAME FAILURE.** Three fresh runs of the
   * release gate on the final assembly: Margaret's English bubbles at 25, 26, 27, 29,
   * 31, 31 against her resolved 31, with **two of the three runs losing a bubble** to
   * `too_long`. `id` never failed and topped out at 21.
   *
   * **THE TWO LOCALES NOW DIFFER IN `maxWords`, WHICH THE TEST BELOW SAID THEY WOULD
   * NOT** — that assertion was about `maxChars` being the axis of difference, and the
   * measurement put it in this column instead. The `id` number is untouched, because
   * nothing about the `id` band asked to move and scaling it "to match" would be a
   * change with evidence for half of it.
   *
   * **IF A THIRD ROUND MOVES IT AGAIN, THE LEVER IS THE WRONG ONE.** Twice now the
   * base ceiling has been raised to accommodate one reader in one locale, and what
   * that really says is that `MARGARET_MULTIPLIER = 1.3` is too small for English —
   * her English sentences run 3–4× the other two readers' where her Indonesian runs
   * 3.5× at a much lower absolute. **The fix then is a per-(locale, reader)
   * multiplier, not a third raise**, and it is deliberately not taken on two rounds
   * of evidence: VD19 makes the multiplier a fact about the READER, and splitting it
   * by locale is a reconciliation question rather than an authoring convenience.
   */
  it('is 24 words in `id` and 27 in `en`, each measured rather than translated', () => {
    expect(CHAT_LENGTH_BUDGET.id.maxWords).toBe(24);
    expect(CHAT_LENGTH_BUDGET.en.maxWords).toBe(27);
  });

  /**
   * `[F3-10]`. **THE FLOOR IS ZERO IN BOTH LOCALES AND THE CONSTANT EXISTS AT ZERO
   * RATHER THAN BEING ABSENT**, so raising it is a visible edit rather than an
   * addition nobody reviews. *"wkwk"*, *"iya sih"* and *"hm"* are how a group chat
   * actually reads.
   */
  it('has a floor of zero in every locale', () => {
    for (const locale of LOCALES) expect(CHAT_LENGTH_BUDGET[locale].minWords).toBe(0);
  });

  /**
   * The character guard differs and the word ceiling does not, because the
   * characters-per-word ratio is the one thing that genuinely differs between the two
   * languages (Indonesian affixation).
   */
  it('differs between locales in maxChars only', () => {
    expect(CHAT_LENGTH_BUDGET.id.maxChars).toBe(260);
    expect(CHAT_LENGTH_BUDGET.en.maxChars).toBe(240);
  });

  it('is far below every reading budget', () => {
    for (const locale of LOCALES) {
      for (const service of ['daily', 'spread3', 'yesno'] as const) {
        expect(CHAT_LENGTH_BUDGET[locale].maxWords).toBeLessThan(
          LENGTH_BUDGET[locale][service].maxParagraphWords,
        );
      }
    }
  });
});

describe('chatBudgetFor', () => {
  /** `[F3-11]`, and VD19: it is a fact about the reader, so it holds here too. */
  it('applies MARGARET_MULTIPLIER to her ceilings, in both locales', () => {
    for (const locale of LOCALES) {
      const base = CHAT_LENGTH_BUDGET[locale];
      const hers = chatBudgetFor(locale, 'margaret');
      expect(hers.maxWords).toBe(Math.round(base.maxWords * MARGARET_MULTIPLIER));
      expect(hers.maxChars).toBe(Math.round(base.maxChars * MARGARET_MULTIPLIER));
    }
    /* 24 x 1.3 = 31, which is one subordinated sentence — the thing she was refused for. */
    expect(chatBudgetFor('id', 'margaret').maxWords).toBe(31);
    expect(chatBudgetFor('id', 'margaret').maxChars).toBe(338);
  });

  it('leaves the other two readers on the base ceiling', () => {
    for (const locale of LOCALES) {
      for (const reader of READER_IDS.filter((id) => id !== 'margaret')) {
        expect(chatBudgetFor(locale, reader)).toEqual(CHAT_LENGTH_BUDGET[locale]);
      }
    }
  });

  /**
   * **THE MULTIPLIER REACHES CEILINGS ONLY, AND WRITING THE RULE WHILE IT IS VACUOUS
   * IS THE POINT** — the day somebody raises the floor they will otherwise scale it,
   * which `MARGARET_MULTIPLIER`'s own header says would *"demand length rather than
   * permit it"*.
   */
  it('never scales the floor, including for Margaret', () => {
    for (const locale of LOCALES) {
      for (const reader of READER_IDS) {
        expect(chatBudgetFor(locale, reader).minWords).toBe(0);
      }
    }
  });
});

describe('CHAT_MAX_TOKENS', () => {
  /**
   * **THE PROPERTY, NOT THE NUMBER (rewritten 2026-08-30).** The old test asserted `90`
   * against `maxWords * 2` under a title saying *"roughly double"* and a docblock saying
   * *"roughly triple"* — 90 is neither, and **the assertion passed while the constant was
   * silently acting as the length control.** A `--chat` run stored a Margaret bubble cut
   * mid-WORD at `out=90`, thirteen words into a thirty-one-word ceiling.
   *
   * What has to be true is that this ceiling **cannot bind before the WORD ceiling does**,
   * because `validateTurn`'s `too_long` refuses an over-long bubble and `C-R7` retries it,
   * while a bubble truncated here arrives short and is never refused. So the check is: a
   * beat writing TWO bubbles at the longest resolved ceiling, in the SOURCE locale, at the
   * measured Indonesian token cost, still fits.
   *
   * **`ID_TOKENS_PER_WORD` IS A MEASUREMENT AND NOT A CONSTANT OF NATURE** — 2.2–3.1 over
   * one `glm-5.2` run, taken at the top of the range. Re-measure it from `llm_calls`
   * output tokens on a provider or model change; `npm run probe:usage` is the instrument
   * for what a provider reports.
   */
  it('cannot bind before the word ceiling, at two bubbles in the source locale', () => {
    const ID_TOKENS_PER_WORD = 3.1;
    const longest = Math.max(...READER_IDS.map((r) => chatBudgetFor('id', r).maxWords));
    const worstCase = longest * ID_TOKENS_PER_WORD * 2;
    expect({ longest, fits: CHAT_MAX_TOKENS >= worstCase }).toEqual({ longest, fits: true });
    /* And still tiny in absolute terms -- `C-D6` makes the chat's call budget scarce. */
    expect(CHAT_MAX_TOKENS).toBeLessThan(300);
  });
});

describe('the reading path', () => {
  /**
   * F3 edits this file, so the regression check belongs in it: `budgetFor` is what
   * `services.{id,en}.ts` interpolate and what `npm run smoke -- --all` asserts
   * against, and its numbers must be byte-identical after the chat rows land.
   */
  it('is untouched by the chat rows', () => {
    expect(LENGTH_BUDGET.id.spread3).toEqual({
      maxParagraphWords: 28,
      minTotalWords: 74,
      maxTotalWords: 109,
    });
    expect(budgetFor('id', 'spread3', 'margaret')).toEqual({
      maxParagraphWords: 36,
      minTotalWords: 74,
      maxTotalWords: 142,
    });
    expect(budgetFor('en', 'daily', 'thessaly')).toEqual(LENGTH_BUDGET.en.daily);
  });
});
