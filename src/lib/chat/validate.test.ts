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
  mixesPronounRegisterId,
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
  memoryNotes: [] as string[],
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
   * **THE TELLS ARE BOUNDED AT THE HEAD AND OPEN AT THE TAIL, AND BOTH HALVES WERE
   * MEASURED** (calibration run 3, and run 1).
   *
   * A plain `includes` refused *"bukan biodatamu"* — a reader DENYING that it holds a file
   * on you — because `datamu` is inside `biodatamu`. And a `\b`-terminated match would
   * have let *"yang kamu pernah ceritain sendiri"* through, because Indonesian
   * affixation puts a suffix where the boundary would be.
   */
  it('13b. source_tell does not fire on a prefix, and does fire through a suffix', () => {
    accepts('Kita cuma baca kartunya, Mif, bukan biodatamu.');
    refuses('yang kamu pernah ceritain sendiri', 'source_tell');
    accepts('kamu mau cerita?');
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

  /**
   * 17. `memory_verbatim_ngram` at EIGHT words, and not at seven. **A near-miss test written
   * before the refusal** — the near miss is the one that matters here, because the accept
   * bias governs everything this check does not have a promise behind.
   *
   * (The plan numbered this 16; `too_many_bubbles` already held that number, so the four R2
   * tests are 17–20. The numbers are labels, and a collision reads as one test replacing
   * another.)
   */
  it('17. memory_verbatim_ngram at eight words, and not at seven', () => {
    const memoryNotes = ['Lari pagi jam lima, tujuh sudah terlalu panas buatnya sejak dulu.'];
    refuses('lari pagi jam lima tujuh sudah terlalu panas buatnya', 'memory_verbatim_ngram', {
      memoryNotes,
    });
    /*
     * SEVEN, counted rather than eyeballed: `pagi jam lima tujuh sudah terlalu panas`.
     * Dropping the leading `lari` is what takes the run from eight to seven — the same
     * sentence WITH it is a refusal, which is the boundary this test exists to pin.
     */
    accepts('pagi jam lima tujuh sudah terlalu panas?', { memoryNotes });
    accepts('masih lari jam lima?', { memoryNotes });
  });

  /**
   * **THE RULING, AS A TEST, AND IT IS THE MOST IMPORTANT ACCEPTANCE IN THE FILE.** A name
   * that lives only in the memory is a name the querent said out loud in this room, and
   * *"gimana si bonjeng, marah2 lagi ga dia?"* is the sentence this release exists to
   * produce. If somebody adds a `memory_name_leak`, this fails first.
   */
  it('18. never refuses a name that appears only in the memory', () => {
    const memoryNotes = ['Ada orang di kantornya yang ia panggil bonjeng, sering marah-marah.'];
    accepts('gimana si bonjeng, marah2 lagi ga dia?', { memoryNotes });
    accepts('bonjeng masih gitu?', { memoryNotes });
  });

  /**
   * **AND THE OTHER HALF: `answer_name_leak` STILL COVERS THE ONLY NAME THAT CARRIES A
   * PROMISE**, wherever in the bubble it came from. A name that leaked out of a stored answer
   * into the memory is refused by the check that already existed — which is why no new name
   * check was needed.
   */
  it('19. still refuses an answer name even when the memory repeats it', () => {
    refuses('gimana kabar Sari sekarang?', 'answer_name_leak', {
      rawAnswers: ['ibu saya, namanya Sari'],
      memoryNotes: ['Sering menyebut Sari, ibunya.'],
    });
  });

  /**
   * 20. R2's four source tells, under the EXISTING reason token. `aku inget` must pass.
   *
   * `aku inget kamu suka…` passes because `aku inget` is not a tell. `aku inget kamu pernah
   * bilang…` is already refused by the existing `kamu pernah bilang` with its open tail —
   * that is the correct boundary and it needs no new phrase.
   */
  it('20. refuses a named store and never a reader simply remembering', () => {
    refuses('di catatanku kamu suka nasi padang', 'source_tell');
    refuses('menurut data kamu tidur jam tiga', 'source_tell');
    accepts('eh gue inget lu lagi diet');
    accepts('aku inget kamu suka nasi padang');
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

/**
 * 2026-08-09. The reported bubble, its two consistent repairs, and the near misses that
 * keep the grep from firing on correct Indonesian.
 */
describe('mixesPronounRegisterId — the smoke-only half', () => {
  it('catches the reported bubble', () => {
    expect(
      mixesPronounRegisterId(
        'lo belum jawab pertanyaan aku, mif. baru aja aku bilang tubuh lo di batas, langsung undang nongkrong.',
      ),
    ).toBe(true);
  });

  it('accepts either set held consistently', () => {
    expect(mixesPronounRegisterId('lo belum jawab pertanyaan gue, mif')).toBe(false);
    expect(mixesPronounRegisterId('kamu belum jawab pertanyaanku, mif')).toBe(false);
    expect(mixesPronounRegisterId('batas waktunya kapan?')).toBe(false);
  });

  /**
   * The word-bounded halves. `berlaku` and `buku` carry `ku`, `ilmu` carries `mu`, and
   * `selo`/`lupa` carry the slang forms as substrings — every one of them is ordinary
   * Indonesian, and firing on any of them is how this check gets deleted.
   */
  it('does not fire on ordinary words that merely contain a pronoun', () => {
    expect(mixesPronounRegisterId('aturannya masih berlaku, kamu tinggal baca bukunya')).toBe(false);
    expect(mixesPronounRegisterId('kamu lupa nutup jendela, ilmunya ke mana')).toBe(false);
    expect(mixesPronounRegisterId('aku selo kok hari ini')).toBe(false);
  });

  /**
   * **IT IS NOT RUN OVER A JOINED RUN, and this is the property the smoke script has to
   * preserve.** Two bubbles, one from each set, is a reader drifting — which the
   * contract licenses in as many words.
   */
  it('is per bubble: the same two lines joined would read as a mix', () => {
    const a = 'lo udah bilang ke dia belum';
    const b = 'aku nggak yakin itu perlu';
    expect(mixesPronounRegisterId(a)).toBe(false);
    expect(mixesPronounRegisterId(b)).toBe(false);
    expect(mixesPronounRegisterId(`${a}\n${b}`)).toBe(true);
  });
});
