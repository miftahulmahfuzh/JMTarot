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
   * `C-D19`'s ceiling. **22 and not 28**: `spread3`'s per-paragraph ceiling is one of
   * four paragraphs of a *reading*, which is denser prose than a chat message, and a
   * 28-word bubble at 390px is four lines — the chatbot tell `C-D19` names.
   */
  it('is 22 words in both locales, and English is not a translation of a calibration', () => {
    expect(CHAT_LENGTH_BUDGET.id.maxWords).toBe(22);
    expect(CHAT_LENGTH_BUDGET.en.maxWords).toBe(22);
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
    expect(chatBudgetFor('id', 'margaret').maxWords).toBe(29);
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
   * A runaway guard at roughly double her 29 words, the same relationship
   * `MAX_TOKENS.spread3` and `PERSONA_MAX_TOKENS` have to their ceilings — generous
   * enough that a model finishes its sentence, tiny in absolute terms because `C-D6`
   * makes the chat's call budget scarce.
   */
  it('is a runaway guard at roughly double the longest ceiling', () => {
    expect(CHAT_MAX_TOKENS).toBe(90);
    expect(CHAT_MAX_TOKENS).toBeGreaterThan(chatBudgetFor('id', 'margaret').maxWords * 2);
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
