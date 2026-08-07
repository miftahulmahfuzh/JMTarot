import { describe, expect, it } from 'vitest';

import type { Locale, ReaderId } from '@/data/types';
import { chatBudgetFor } from '@/lib/prompt/budget';
import {
  checkTurn,
  checkTurnBodies,
  CHAT_CLOSERS_ID,
  CHAT_OPENERS_EN,
  CHAT_OPENERS_ID,
  CHAT_SOURCE_TELLS_EN,
  CHAT_SOURCE_TELLS_ID,
  CHAT_TICS_EN,
  CHAT_TICS_ID,
  splitBubbles,
  type TurnRejectReason,
} from './validate';

/**
 * F3, task 6. **A NEAR-MISS TEST FOR EVERY REFUSAL, WRITTEN BEFORE THE REFUSAL** — W7's
 * rule, and the reason is `[F3-12]`: this validator is biased towards ACCEPTING, which
 * is the opposite of `validateChoice`'s bias, because **a false rejection costs a bubble
 * and makes the room quieter — the one failure this release cannot afford.**
 */

const ctx = (over: Partial<Parameters<typeof checkTurn>[1]> = {}) => ({
  locale: 'id' as Locale,
  reader: 'thessaly' as ReaderId,
  budget: chatBudgetFor('id', 'thessaly'),
  addressForms: ['Mifta', 'Mif', 'Ta'],
  rawAnswers: [] as string[],
  conversation: [] as string[],
  ...over,
});

const reason = (body: string, over: Partial<Parameters<typeof checkTurn>[1]> = {}) => {
  const out = checkTurn(body, ctx(over));
  return out.ok ? null : out.reason;
};

function accepts(body: string, over: Partial<Parameters<typeof checkTurn>[1]> = {}) {
  expect({ body, reason: reason(body, over) }).toEqual({ body, reason: null });
}

function refuses(body: string, expected: TurnRejectReason, over: Partial<Parameters<typeof checkTurn>[1]> = {}) {
  expect({ body, reason: reason(body, over) }).toEqual({ body, reason: expected });
}

describe('checkTurn — the ordinary bubble', () => {
  it('accepts the shapes a group chat is actually made of', () => {
    accepts('batas waktunya kapan?');
    accepts('wkwk');
    accepts('iya sih');
    accepts('hm');
    accepts('dua bulan itu bukan lagi fase sih');
    accepts('berarti bukan ragu, mif. kamu udah nolak, tinggal ngomong.');
  });

  /** `[F3-10]`. **THERE IS NO FLOOR BRANCH AND ITS ABSENCE IS THE ENFORCEMENT.** */
  it('has no floor at all', () => {
    accepts('hm');
    accepts('eh');
    accepts('.');
    expect(chatBudgetFor('id', 'thessaly').minWords).toBe(0);
  });

  /** §7.5, and it demonstrates `[F3-12]`: the contract forbids it, the validator does not. */
  it('accepts an emoji, deliberately', () => {
    accepts('iya sih 😄');
  });

  it('accepts a bubble that answers nothing, or repeats another reader', () => {
    accepts('nggak tau juga');
    accepts('sama sih');
  });
});

describe('checkTurn — every refusal, with its near miss', () => {
  it('1. empty', () => {
    refuses('', 'empty');
    refuses('   \n  ', 'empty');
    accepts('.');
  });

  it('2. too_long, by words and by chars', () => {
    refuses(Array.from({ length: 25 }, () => 'kata').join(' '), 'too_long');
    // Margaret's resolved ceiling is 29, so the same 25 words are hers to spend.
    accepts(Array.from({ length: 25 }, () => 'kata').join(' '), {
      reader: 'margaret',
      budget: chatBudgetFor('id', 'margaret'),
    });
    // The character guard fires on few long words, which the word count cannot see.
    refuses(Array.from({ length: 8 }, () => 'x'.repeat(40)).join(' '), 'too_long');
  });

  it('3. markdown, and not a bare asterisk in prose', () => {
    refuses('**gitu ya**', 'markdown');
    refuses('- pertama\n- kedua', 'markdown');
    refuses('1. begini', 'markdown');
    accepts('2 * 3 masih enam');
  });

  it('4. angle_bracket', () => {
    refuses('kayak <penanya> gitu', 'angle_bracket');
    accepts('kayak gitu');
  });

  /**
   * `[F3-3]`. **The two-letter prefix plus the length bound is what keeps this narrow**:
   * an unrelated capitalised word does not share both, so the check cannot fire on
   * ordinary prose.
   */
  it('5. address_form, and not on an unrelated capitalised word', () => {
    refuses('Mi, itu bukan soal uang', 'address_form');
    refuses('Miftah, itu bukan soal uang', 'address_form');
    accepts('Mif, itu bukan soal uang');
    accepts('Ta, itu bukan soal uang');
    accepts('Mifta, itu bukan soal uang');
    // The near misses: a long word sharing the prefix, and a word that shares nothing.
    accepts('Minggu depan, coba tanya lagi');
    accepts('Nanti, kalau udah tenang');
    // And a form that only APPEARS mid-sentence is not a vocative at all.
    accepts('kayaknya mie ayam lebih enak');
  });

  it('6. self_address, and never another reader’s name', () => {
    refuses('Thessaly, menurutku beda', 'self_address');
    accepts('Margaret, menurutku beda');
    accepts('Adrian, itu ngaco', { reader: 'thessaly' });
  });

  /**
   * `[F3-12]`'s bias in the hardest place. **A LOWERCASE PHRASE IS ORDINARY PROSE IN A
   * CHAT AND IS NOT REFUSED**: everybody types lowercase in a group, so "the sun" and
   * "strength" have to pass. What is refused is a MIXED-CASE near miss, which is the
   * shape of a model mangling a card name.
   */
  it('7. card_name, only when it is a mixed-case near miss', () => {
    refuses('the Moon lagi', 'card_name');
    refuses('The MOON lagi', 'card_name');
    refuses('kartunya Moon lagi', 'card_name');
    accepts('The Moon lagi');
    accepts('the moon kelihatan terang');
    accepts('kamu butuh strength buat itu');
    accepts('di bawah the sun juga sama');
  });

  it('8. reading_shape, and not a single card mentioned in passing', () => {
    refuses('PILIHAN: Ayam', 'reading_shape');
    refuses('CHOICE: chicken', 'reading_shape', { locale: 'en', budget: chatBudgetFor('en', 'thessaly') });
    refuses('The Tower, The Hermit, The Lovers', 'reading_shape');
    accepts('The Tower lagi ya');
    accepts('The Tower dan The Hermit dua-duanya soal waktu');
  });

  /**
   * **OVERRIDES THE ACCEPT BIAS** (non-negotiable 13), and the near miss is the one
   * `CLAUDE.md` names by hand: `anxiety` is deliberately NOT forbidden, because *"that
   * low-grade anxiety before you send the text"* is legitimate in Adrian's voice. The
   * rule is against DIAGNOSIS.
   */
  it('9. banned_word, and not bare anxiety or bare cemas', () => {
    refuses('kayaknya itu trauma', 'banned_word');
    refuses('coba terapi deh', 'banned_word');
    refuses('itu butuh penyembuhan', 'banned_word');
    accepts('that low-grade anxiety before you send the text', {
      locale: 'en',
      reader: 'adrian',
      budget: chatBudgetFor('en', 'adrian'),
    });
    refuses('that sounds like an anxiety disorder', 'banned_word', {
      locale: 'en',
      reader: 'adrian',
      budget: chatBudgetFor('en', 'adrian'),
    });
    accepts('kamu kayaknya cemas banget', { reader: 'adrian', budget: chatBudgetFor('id', 'adrian') });
  });

  it('10. malay_word, on the id half only', () => {
    refuses('tempoh dua bulan', 'malay_word');
    accepts('tempo dua bulan');
    // W6 rule 4: running the Malay words against English is theatre.
    accepts('the tempoh was two months', {
      locale: 'en',
      budget: chatBudgetFor('en', 'thessaly'),
    });
  });

  /** `personaSafetyCheck`'s `the Universe` near-miss, verbatim. */
  it('11. tic_phrase, on the en half only, with the capital rule', () => {
    refuses('the Universe is telling you', 'tic_phrase', {
      locale: 'en',
      budget: chatBudgetFor('en', 'thessaly'),
    });
    accepts('the universe of small decisions', {
      locale: 'en',
      budget: chatBudgetFor('en', 'thessaly'),
    });
    accepts('dear one', { locale: 'id' });
    refuses('dear one, listen', 'tic_phrase', {
      locale: 'en',
      budget: chatBudgetFor('en', 'thessaly'),
    });
  });

  /** §7.2: **position-anchored, which is what makes it shape rather than judgement.** */
  it('12. register, anchored to the opening and the last sentence', () => {
    refuses('Baik, jadi kontraknya kapan?', 'register');
    refuses('kapan? kalau ada yang mau ditanya lagi, bilang ya', 'register');
    refuses('mari kita lihat besok pagi', 'register');
    /* Anchoring is the whole point: the same words mid-sentence are ordinary Indonesian. */
    accepts('coba mari kita hitung');
    refuses('Okay so what happened next', 'register', {
      locale: 'en',
      budget: chatBudgetFor('en', 'thessaly'),
    });
    accepts('it was okay so far', { locale: 'en', budget: chatBudgetFor('en', 'thessaly') });
  });

  /** `[F3-9]`. **THE HIGHEST-VALUE CHECK IN THE RELEASE.** */
  it('13. source_tell, anywhere in the bubble', () => {
    refuses('kamu pernah bilang soal itu', 'source_tell');
    refuses('di jawabanmu ada kok', 'source_tell');
    refuses('you told us about that', 'source_tell', {
      locale: 'en',
      budget: chatBudgetFor('en', 'thessaly'),
    });
    accepts('kamu bilang apa ke dia?');
    accepts('you can tell me if you want', {
      locale: 'en',
      budget: chatBudgetFor('en', 'thessaly'),
    });
  });

  /**
   * **OVERRIDES THE ACCEPT BIAS** (`[F3-8]`), and **the carve-out is load-bearing**: the
   * querent may type a friend's name in the room, and a reader repeating it back is
   * natural and correct. What is refused is a name that arrived from a stored answer and
   * has never been said out loud.
   */
  it('14. answer_name_leak, unless the querent used the name in the room', () => {
    const rawAnswers = ['ibu saya, namanya Sari'];
    refuses('gimana kabar Sari sekarang?', 'answer_name_leak', { rawAnswers });
    accepts('gimana kabar ibumu sekarang?', { rawAnswers });
    accepts('gimana kabar Sari sekarang?', {
      rawAnswers,
      conversation: ['tadi ketemu Sari di pasar'],
    });
    // A relation word that Indonesian capitalises is not a name — `NOT_NAMES`' rule.
    accepts('Ibu kamu tahu soal ini?', { rawAnswers: ['Ibu saya yang paling sabar'] });
  });

  /** **OVERRIDES THE ACCEPT BIAS.** Six words is `lotus.ts`'s judgement, reused. */
  it('15. verbatim_ngram at six words, and not at five', () => {
    const answer = 'tetangga saya dibawa pergi naik mobil hijau dan tidak pernah kembali';
    refuses('tetangga saya dibawa pergi naik mobil hijau itu', 'verbatim_ngram', {
      rawAnswers: [answer],
      budget: chatBudgetFor('id', 'margaret'),
    });
    accepts('tetangga saya dibawa pergi naik apa?', { rawAnswers: [answer] });
  });

  /**
   * `[R19]`, and it is `checkTurnBodies`' refusal rather than `checkTurn`'s: a third
   * bubble is a property of the TURN, not of any one message in it.
   *
   * **REFUSED RATHER THAN TRUNCATED**, because three blocks from one beat is a model
   * dumping paragraphs — and taking the first two would store the dump's opening half as
   * if it were a considered message.
   */
  it('16. too_many_bubbles, over the whole turn', () => {
    const out = checkTurnBodies('satu\n\ndua\n\ntiga', ctx());
    expect(out).toEqual({ ok: false, reason: 'too_many_bubbles' });
    expect(checkTurnBodies('satu\n\ndua', ctx())).toEqual({ ok: true, bodies: ['satu', 'dua'] });
  });
});

describe('checkTurn — the order of the checks', () => {
  /**
   * `personaSafetyCheck`'s ordering: the structural refusals come first, so a bubble
   * that is both too long and a diagnosis reports the cheap reason. The one that must
   * come first is `angle_bracket`, because a surviving delimiter means the material and
   * the instruction may already have been confused.
   */
  it('reports angle_bracket before anything else', () => {
    refuses('<jawaban> trauma banget ' + 'kata '.repeat(30), 'angle_bracket');
  });

  it('reports the therapy word even when the register is also wrong', () => {
    // The overrides are what the operator needs to see; `register` is cosmetic beside
    // them, so the content refusals are checked after the shape ones but their reasons
    // are the ones that matter — asserted so a re-ordering is a visible change.
    refuses('kayaknya itu trauma deh', 'banned_word');
  });
});

describe('splitBubbles', () => {
  /**
   * `[R19]`, granted by Miftah as *"the largest naturalness gain left"*: **a person who
   * has more to say sends a second message rather than a longer one.** A blank line is
   * the separator, because that is what a model produces when it wants a paragraph
   * break and it is the one shape that cannot appear inside a bubble — `stripUntrusted`
   * collapses newlines out of everything user-derived.
   */
  it('splits on a blank line, and only into two', () => {
    expect(splitBubbles('satu')).toEqual(['satu']);
    expect(splitBubbles('satu\n\ndua')).toEqual(['satu', 'dua']);
    expect(splitBubbles('  satu  \n\n\n  dua  ')).toEqual(['satu', 'dua']);
    expect(splitBubbles('satu\n\ndua\n\ntiga')).toHaveLength(3);
  });

  /** A single newline is not a message boundary; it is a model wrapping a line. */
  it('does not split on a single newline', () => {
    expect(splitBubbles('satu\ndua')).toEqual(['satu dua']);
  });

  it('never returns an empty string', () => {
    expect(splitBubbles('')).toEqual([]);
    expect(splitBubbles('\n\n\n')).toEqual([]);
  });
});

describe('the register lists', () => {
  /**
   * §7: **two lists that are not the same list, and this is what keeps them from being
   * collapsed.** `validateTurn`'s list refuses ONE BUBBLE and is therefore short and
   * position-anchored; the smoke script's judges a WHOLE RUN, costs nothing, and is
   * long. Both live here, exported, because a second copy is how `tempoh` went missing
   * the first time.
   */
  it('exports the smoke script’s half rather than duplicating it', () => {
    expect(CHAT_TICS_ID.length).toBeGreaterThan(10);
    expect(CHAT_TICS_EN.length).toBeGreaterThan(10);
    expect(CHAT_SOURCE_TELLS_ID.length).toBeGreaterThan(10);
    expect(CHAT_SOURCE_TELLS_EN.length).toBeGreaterThan(10);
    expect(CHAT_OPENERS_ID.length).toBeGreaterThan(10);
    expect(CHAT_OPENERS_EN.length).toBeGreaterThan(10);
    expect(CHAT_CLOSERS_ID.length).toBeGreaterThan(8);
  });

  it('is lowercase throughout, because the openers and closers match case-insensitively', () => {
    for (const list of [CHAT_OPENERS_ID, CHAT_OPENERS_EN, CHAT_CLOSERS_ID]) {
      for (const phrase of list) expect(phrase).toBe(phrase.toLowerCase());
    }
  });

  /**
   * §7.4's two recorded near misses, so nobody "completes" the list:
   *
   *  - **`sit with` is NOT a tic.** `readers.en.ts` says Margaret closes with something
   *    to sit with — it is her register, and banning it would delete the move that
   *    distinguishes her from Thessaly.
   *  - **`journey` IS a tic here** and `soul's journey` is on the shared `EN_TICS`. The
   *    bare word is here and not there because `EN_TICS` is shared with the reading
   *    path, where a Fool's-Journey context makes it legitimate; in a group chat nobody
   *    says "journey".
   */
  it('keeps its two recorded near misses', () => {
    expect(CHAT_TICS_EN).not.toContain('sit with');
    expect(CHAT_TICS_EN).toContain('journey');
  });
});
