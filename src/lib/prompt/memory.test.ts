/**
 * The chain block: the M9 relevance gate, the system instruction, and the
 * `<riwayat>` renderer (W5 plan Task 6).
 *
 * The build.ts seam -- that the block lands in `user` and never in `system` --
 * is asserted in `build.test.ts`, beside the injection test it extends.
 */
import { describe, expect, it } from 'vitest';
import type { RecalledReading } from '@/lib/db/queries/history';
import {
  MEMORY_CHAIN_COUNT,
  chainRelevance,
  memoryBlock,
  memoryInstruction,
  type MemoryContext,
} from './memory';

function recalled(over: Partial<RecalledReading> = {}): RecalledReading {
  return {
    id: 'r1',
    localDate: '2026-07-24',
    readerId: 'margaret',
    serviceId: 'spread3',
    cards: [
      { cardId: 16, reversed: false }, // The Tower
      { cardId: 17, reversed: true }, // The Star
      { cardId: 9, reversed: false }, // The Hermit
    ],
    gist: 'tambalan lama sudah tidak menahan apa-apa',
    hadQuestion: false,
    ...over,
  };
}

describe('the M9 relevance gate', () => {
  it('omits the block when there is no repeat and no question', () => {
    /*
     * The case the gate exists for, and the single largest mitigation for
     * roadmap §10's callback-tic risk. No question and no repeat card means
     * nothing could be genuinely relevant, only vibes -- and unlike a prompt
     * instruction, omitting the block is testable.
     */
    const out = chainRelevance({
      currentCardIds: [1, 2, 3],
      currentHasQuestion: false,
      recalled: [recalled()],
    });
    expect(out).toEqual({ include: false, reason: null, repeatCardIds: [] });
  });

  it('includes on a repeat card, regardless of questions', () => {
    for (const hasQuestion of [true, false]) {
      const out = chainRelevance({
        currentCardIds: [16, 4],
        currentHasQuestion: hasQuestion,
        recalled: [recalled()],
      });
      expect(out.include, String(hasQuestion)).toBe(true);
      expect(out.reason).toBe('repeat');
      expect(out.repeatCardIds).toEqual([16]);
    }
  });

  it('prefers repeat over question when both hold', () => {
    // 'repeat' is the case where a callback is unambiguously earned and the
    // model should not have to exercise judgement; the reason recorded in
    // analytics must say so.
    const out = chainRelevance({
      currentCardIds: [16],
      currentHasQuestion: true,
      recalled: [recalled({ hadQuestion: true })],
    });
    expect(out.reason).toBe('repeat');
  });

  it('includes on questions BOTH sides, with no repeat', () => {
    const out = chainRelevance({
      currentCardIds: [1, 2],
      currentHasQuestion: true,
      recalled: [recalled({ hadQuestion: true })],
    });
    expect(out).toEqual({ include: true, reason: 'question', repeatCardIds: [] });
  });

  it('omits when only the CURRENT reading has a question', () => {
    // Only the model can judge continuity between two questions, and there is
    // no second question to continue from.
    const out = chainRelevance({
      currentCardIds: [1, 2],
      currentHasQuestion: true,
      recalled: [recalled({ hadQuestion: false })],
    });
    expect(out.include).toBe(false);
  });

  it('omits when only the RECALLED reading had a question', () => {
    const out = chainRelevance({
      currentCardIds: [1, 2],
      currentHasQuestion: false,
      recalled: [recalled({ hadQuestion: true })],
    });
    expect(out.include).toBe(false);
  });

  it('omits when there is no history at all', () => {
    const out = chainRelevance({ currentCardIds: [1], currentHasQuestion: true, recalled: [] });
    expect(out.include).toBe(false);
  });

  it('finds a repeat in the SECOND recalled reading, not only the first', () => {
    const out = chainRelevance({
      currentCardIds: [9],
      currentHasQuestion: false,
      recalled: [recalled({ id: 'a', cards: [{ cardId: 1, reversed: false }] }), recalled({ id: 'b' })],
    });
    expect(out.repeatCardIds).toEqual([9]);
  });

  it('matches a repeat regardless of orientation', () => {
    // The Star is reversed in the recalled draw and upright now. It is still
    // the same card turning up again, which is what "ULANG" claims.
    const out = chainRelevance({
      currentCardIds: [17],
      currentHasQuestion: false,
      recalled: [recalled()],
    });
    expect(out.repeatCardIds).toEqual([17]);
  });

  it('returns repeats sorted and de-duplicated, so the block is deterministic', () => {
    // Two otherwise identical requests must produce the same block, or the
    // analytics `repeat_card_id` becomes whichever card the deck listed first.
    const out = chainRelevance({
      currentCardIds: [17, 9, 16],
      currentHasQuestion: false,
      recalled: [recalled()],
    });
    expect(out.repeatCardIds).toEqual([9, 16, 17]);
  });

  it('MEMORY_CHAIN_COUNT is 2 by default, and 0 would disable the gate', () => {
    // The kill switch is read at module scope, so it cannot be flipped inside a
    // test without a module reset. Asserting the default is what keeps a typo
    // in `.env.example` from silently disabling the feature; `chain.ts` checks
    // the same constant before it even queries.
    expect(MEMORY_CHAIN_COUNT).toBe(2);
  });
});

describe('the <riwayat> block', () => {
  const ctx: MemoryContext = {
    recalled: [
      recalled(),
      recalled({
        id: 'r2',
        localDate: '2026-07-25',
        readerId: 'adrian',
        serviceId: 'yesno',
        cards: [{ cardId: 18, reversed: true }], // The Moon, reversed
        gist: 'kabar yang setengah belum layak dipercaya',
      }),
    ],
    repeatCardIds: [18],
    reason: 'repeat',
  };

  it('fences the block and nothing else', () => {
    const out = memoryBlock(ctx, 'id');
    expect(out.startsWith('<riwayat>')).toBe(true);
    expect(out.endsWith('</riwayat>')).toBe(true);
    expect(out.match(/<[^>]*>/g)).toEqual(['<riwayat>', '</riwayat>']);
  });

  it('uses <riwayat> in English too (reconciliation R17)', () => {
    // One token per purpose across both locales. W5's plan says `<history>`;
    // R17 outranks it, and its own reasoning decides it -- an English querent
    // will never type "riwayat" and will absolutely type "history".
    const out = memoryBlock(ctx, 'en');
    expect(out).toContain('<riwayat>');
    expect(out).not.toContain('<history>');
  });

  it('names the date, the service, the reader, the cards and the gist', () => {
    const out = memoryBlock(ctx, 'id');
    expect(out).toContain('24 Juli');
    expect(out).toContain('Tiga Kartu');
    expect(out).toContain('Margaret');
    expect(out).toContain('The Tower, The Star (terbalik), The Hermit');
    expect(out).toContain('inti: tambalan lama sudah tidak menahan apa-apa');
  });

  it('renders dates from local_date in the querent’s locale', () => {
    // Never from created_at, which rolls over at 07:00 in Jakarta.
    expect(memoryBlock(ctx, 'en')).toContain('24 July');
    expect(memoryBlock(ctx, 'en')).not.toContain('Juli');
  });

  it('NAMES THE OTHER READER, so the model can attribute rather than claim', () => {
    // M12's cross-reader recall only works if the block says whose reading it
    // was; the instruction tells the model to describe it without claiming it.
    const out = memoryBlock(ctx, 'id');
    expect(out).toContain('(Margaret)');
    expect(out).toContain('(Adrian)');
  });

  it('marks the repeat in code, not by asking the model to notice', () => {
    // The gate already knows which cards repeat. Making the model re-derive it
    // is work it can get wrong, on the one signal the whole feature turns on.
    expect(memoryBlock(ctx, 'id')).toContain('ULANG: The Moon');
    expect(memoryBlock(ctx, 'en')).toContain('AGAIN: The Moon');
  });

  it('omits the marker line when nothing repeats', () => {
    const noRepeat: MemoryContext = { ...ctx, repeatCardIds: [], reason: 'question' };
    expect(memoryBlock(noRepeat, 'id')).not.toContain('ULANG');
    expect(memoryBlock(noRepeat, 'en')).not.toContain('AGAIN');
  });

  it('NEVER CARRIES THE RECALLED QUESTION (M11)', () => {
    /*
     * The recalled question does not reach the prompt, and the way it stays
     * that way is that `RecalledReading` has no field for it -- the query
     * reduces it to `hadQuestion` before it crosses into this layer. This test
     * asserts the consequence: even a gist is the only free text here.
     */
    const out = memoryBlock(ctx, 'id');
    expect(out).not.toContain('pertanyaan');
    expect(Object.keys(ctx.recalled[0])).not.toContain('question');
  });

  it('survives a card id that is not in the deck', () => {
    // A row written before a deck change should degrade, not throw, on a page
    // the querent is waiting for.
    const odd: MemoryContext = {
      recalled: [recalled({ cards: [{ cardId: 99, reversed: false }] })],
      repeatCardIds: [99],
      reason: 'repeat',
    };
    expect(() => memoryBlock(odd, 'id')).not.toThrow();
    expect(memoryBlock(odd, 'id')).toContain('#99');
  });
});

describe('the memory instruction', () => {
  it('says the block is material and not an instruction', () => {
    expect(memoryInstruction('id')).toContain('bahan saja');
    expect(memoryInstruction('en')).toContain('material only');
  });

  it('tells the model to stay silent when there is no thread', () => {
    // Roadmap §10: a forced callback in every reading destroys the effect the
    // feature exists to create.
    expect(memoryInstruction('id')).toContain('jangan menyinggungnya sama sekali');
    expect(memoryInstruction('en')).toContain('do not mention it at all');
  });

  it('RESTATES THE PARAGRAPH WORD LIMIT', () => {
    /*
     * §6's real risk is dilution, not cost: the model is handed new material at
     * exactly the moment it is under a 40-words-per-paragraph ceiling it must
     * count against as it writes. Restating the ceiling at the point of
     * temptation costs eleven words and protects the 1100->650 work.
     */
    expect(memoryInstruction('id')).toContain('jangan melewati batas kata paragraf itu');
    expect(memoryInstruction('en')).toContain("do not go over that paragraph's word limit");
  });

  it('tells the model not to claim another reader’s reading', () => {
    expect(memoryInstruction('id')).toContain('tanpa mengaku kamu yang membacanya');
    expect(memoryInstruction('en')).toContain('without claiming you were the one who gave it');
  });

  it('names the marker it will actually see', () => {
    expect(memoryInstruction('id')).toContain('ULANG');
    expect(memoryInstruction('en')).toContain('AGAIN');
  });
});
