/**
 * The catalogue, the keys, the order, and the two note tables.
 *
 * Everything here is pure, so it is all reachable from `npm test` with no Docker —
 * which is the property `[F5-9]` rests on: the material is the only thing standing
 * between a proactive run and *"hai, apa kabar?"*, and it must be checkable without a
 * model call.
 */
import { describe, expect, it } from 'vitest';

import { LOCALES } from '@/lib/i18n/locale';
import { MALAY } from '@/lib/copy/vocab';
import { THERAPY_EN } from '@/lib/copy/vocab';
import { USER_MEMORY_KINDS } from '@/lib/memory/profile/types';
import { DAY_PARTS, WEEKDAYS } from '../clock';
import {
  describeMaterial,
  materialKey,
  materialLine,
  materialReplyTo,
  MATERIAL_ORDER,
  renderCards,
  shapeOf,
  timeOfDayMaterial,
  type Material,
  type MaterialKind,
} from './material';
import { MATERIAL_NOTES } from './notes';
import { PROFILE_SUBJECT_EN } from './notes.en';
import { PROFILE_SUBJECT_ID } from './notes.id';

/** `USER_MEMORY_ITEM_ID_RE`'s shape — twelve lowercase hex, so it can hold no `:`. */
const ITEM_ID = 'f00d5a1ad00d';

/** One fixture per kind, so every table below can be walked exhaustively. */
const FIXTURES: Record<MaterialKind, Material> = {
  reading: {
    kind: 'reading',
    readingId: '11111111-1111-4111-8111-111111111111',
    readerId: 'thessaly',
    serviceId: 'spread3',
    cards: [
      { cardId: 18, name: 'The Moon', reversed: false },
      { cardId: 16, name: 'The Tower', reversed: true },
      { cardId: 17, name: 'The Star', reversed: false },
    ],
    gist: 'kerjaan numpuk dan dia belum minta tolong',
    verdict: null,
    choice: null,
    hadQuestion: true,
    localDate: '2026-08-07',
  },
  unanswered: {
    kind: 'unanswered',
    messageId: '22222222-2222-4222-8222-222222222222',
    readerId: 'margaret',
    askedAgoHours: 5,
  },
  orphan: {
    kind: 'orphan',
    messageId: '33333333-3333-4333-8333-333333333333',
    readerId: 'adrian',
    ageHours: 9,
  },
  recurring: {
    kind: 'recurring',
    window: 'month',
    fingerprint: 'month:9:18-4,16-3',
    mechanic: {
      topName: 'The Moon',
      secondName: 'The Tower',
      shadowName: 'The Hermit',
      shadowCardId: 9,
      shadowCollision: null,
      pulseNumber: 7,
      pulseGloss: 'penantian',
      dominance: 'narrow',
    },
  },
  occasion: { kind: 'occasion', occasion: 'birthday', years: null, localDate: '2026-08-07' },
  lotus: {
    kind: 'lotus',
    summary: 'orang yang menahan banyak hal sendirian',
    updatedAtIso: '2026-08-07T04:00:00.000Z',
  },
  profile: { kind: 'profile', itemId: ITEM_ID, itemKind: 'taste', month: '2026-08' },
  time_of_day: {
    kind: 'time_of_day',
    /* 2026-08-09 is a Sunday. The querent's own example. */
    localDate: '2026-08-09',
    weekday: 'sun',
    part: 'afternoon',
    shape: 'weekend_close',
  },
};

const KINDS = Object.keys(FIXTURES) as MaterialKind[];

describe('the closed set', () => {
  it('orders the eight exactly as §4.2 argues, and covers every kind', () => {
    /*
     * **A FIXED ORDER, NOT A SCORE.** A score is a number somebody tunes, a tuned number
     * needs a corpus, and there is no corpus. The order encodes three judgements: an
     * occasion is rarer and more welcome than anything else; a thing the querent just did
     * beats a thing the app noticed; **an unanswered question is more urgent than a
     * pattern, because a question decays and a pattern does not.**
     */
    expect([...MATERIAL_ORDER]).toEqual([
      'occasion',
      'reading',
      'unanswered',
      'profile',
      'recurring',
      'orphan',
      'lotus',
      'time_of_day',
    ]);
    expect([...MATERIAL_ORDER].sort()).toEqual([...KINDS].sort());
  });
});

describe('materialKey (§4.5)', () => {
  it('is prefixed and stable per kind', () => {
    expect(materialKey(FIXTURES.reading)).toBe('reading:11111111-1111-4111-8111-111111111111');
    expect(materialKey(FIXTURES.unanswered)).toBe('ask:22222222-2222-4222-8222-222222222222');
    expect(materialKey(FIXTURES.orphan)).toBe('orphan:33333333-3333-4333-8333-333333333333');
    expect(materialKey(FIXTURES.lotus)).toBe('lotus:2026-08-07T04:00:00.000Z');
  });

  it('carries the FINGERPRINT for a recurring card, which is what makes it self-expiring', () => {
    /*
     * The verdict changes when the card counts change, the fingerprint moves, and a new
     * key becomes available. Until then the readers say nothing about it again, **which
     * is the behaviour a person has.**
     */
    expect(materialKey(FIXTURES.recurring)).toBe('freq:month:month:9:18-4,16-3');
    const shifted: Material = {
      ...(FIXTURES.recurring as Extract<Material, { kind: 'recurring' }>),
      fingerprint: 'month:10:18-5,16-3',
    };
    expect(materialKey(shifted)).not.toBe(materialKey(FIXTURES.recurring));
  });

  it('keys a birthday by the YEAR and a return by the DAY', () => {
    /*
     * §4.5 wrote `occasion:<occasion>:<YYYY>` for all three, and `return` is refined
     * deliberately: a birthday happens once a year and a greeting for it should too, but
     * *coming back* happens whenever somebody comes back, **and a once-a-year key would
     * silently swallow the second return.** The gap gate and the daily cap bound it.
     */
    expect(materialKey(FIXTURES.occasion)).toBe('occasion:birthday:2026');
    const back: Material = {
      kind: 'occasion',
      occasion: 'return',
      years: null,
      localDate: '2026-08-07',
    };
    expect(materialKey(back)).toBe('occasion:return:2026-08-07');
  });

  it('gives every kind a distinct key', () => {
    const keys = KINDS.map((k) => materialKey(FIXTURES[k]));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('materialReplyTo (C-D11)', () => {
  it('names a message for the two materials that HAVE one, and null for the rest', () => {
    /*
     * **This is how M2 and M3 reach `C-D11` without a second mechanism.** The director is
     * already handed the last N messages with their ids and may point a beat at any of
     * them; F5 names one and never constructs a beat.
     */
    expect(materialReplyTo(FIXTURES.unanswered)).toBe('22222222-2222-4222-8222-222222222222');
    expect(materialReplyTo(FIXTURES.orphan)).toBe('33333333-3333-4333-8333-333333333333');
    for (const kind of ['reading', 'recurring', 'occasion', 'lotus', 'profile', 'time_of_day'] as const) {
      expect(materialReplyTo(FIXTURES[kind])).toBeNull();
    }
  });
});

describe('describeMaterial', () => {
  it('returns scalars only, in both locales, for every kind', () => {
    /*
     * `sanitizeProps()`'s discipline applied to a prompt: no arrays, no nesting. **A card
     * list is one string built here, so the director cannot receive a shape it has to
     * parse.**
     */
    for (const locale of LOCALES) {
      for (const kind of KINDS) {
        const brief = describeMaterial(FIXTURES[kind], locale);
        expect(brief.kind).toBe(kind);
        expect(brief.note.trim().length).toBeGreaterThan(0);
        for (const [key, value] of Object.entries(brief.facts)) {
          expect(
            { key, type: typeof value },
            `${locale}/${kind}.${key} must be a scalar`,
          ).toEqual({ key, type: typeof value });
          expect(['string', 'number', 'boolean']).toContain(typeof value);
        }
      }
    }
  });

  it('HANDS OVER NO COUNT FOR A RECURRING CARD (V3, [F5-9])', () => {
    /*
     * V3's ruling in capitals: *"THE COUNTS ARE DELETED FROM BOTH PROMPTS, NOT FORBIDDEN
     * IN THEM. A model cannot recite a count it was never given."* `dominance` is a
     * bucket precisely because a bucket cannot be accidentally recited as a figure.
     *
     * The assertion is over the RENDERED line rather than the object, because the line is
     * what a model sees — and a `topCount` added "for a good-looking reason" would reach
     * it through `facts` without anybody editing this file.
     */
    for (const locale of LOCALES) {
      const brief = describeMaterial(FIXTURES.recurring, locale);
      /* `top` lives in the NOTE rather than here, so the card is named exactly once — see
       * `describeMaterial`'s `recurring` arm. */
      expect(Object.keys(brief.facts).sort()).toEqual(['dominance', 'pulse', 'second', 'shadow']);
      expect(materialLine(brief)).not.toMatch(/\d/);
      /* And it IS named: a line that lost the card would be the failure this arm was
       * measured into existence to fix. */
      expect(materialLine(brief)).toContain('The Moon');
    }
  });

  it('omits a null verdict and a null choice rather than sending them', () => {
    /* `assemble.ts`'s rule: **an absent line is silence; a line saying `tidak ada` is a
     * fact the model will reason about.** */
    const plain = describeMaterial(FIXTURES.reading, 'id');
    expect(plain.facts.verdict).toBeUndefined();
    expect(plain.facts.choice).toBeUndefined();

    const yesno = describeMaterial(
      { ...(FIXTURES.reading as Extract<Material, { kind: 'reading' }>), verdict: 'yes', choice: 'ayam' },
      'id',
    );
    expect(yesno.facts.verdict).toBe('yes');
    expect(yesno.facts.choice).toBe('ayam');
  });

  it('carries the boolean and never the question', () => {
    /* `RecalledReading`'s M11: the raw question is not model output, and dropping it
     * removes injection surface and tokens in one move. */
    const brief = describeMaterial(FIXTURES.reading, 'id');
    expect(brief.facts.had_question).toBe(true);
    expect(JSON.stringify(brief)).not.toContain('?');
  });
});

describe('renderCards', () => {
  it('labels a reversal in the run’s language and never in the other one', () => {
    const cards = [
      { name: 'The Moon', reversed: false },
      { name: 'The Tower', reversed: true },
    ];
    /* **CARD NAMES STAY ENGLISH IN BOTH LOCALES** and only the orientation word moves. */
    expect(renderCards(cards, 'id')).toBe('The Moon, The Tower (terbalik)');
    expect(renderCards(cards, 'en')).toBe('The Moon, The Tower (reversed)');
  });
});

describe('materialLine — the one line F2 renders after BAHAN:', () => {
  it('is one line, kind-prefixed, in both locales, for every kind', () => {
    for (const locale of LOCALES) {
      for (const kind of KINDS) {
        const line = materialLine(describeMaterial(FIXTURES[kind], locale));
        expect(line.startsWith(`${kind} — `), `${locale}/${kind}`).toBe(true);
        /* ONE LINE. The header it joins is one fact per line, and a material spanning
         * three would read as three facts. */
        expect(line).not.toContain('\n');
      }
    }
  });
});

describe('the note tables', () => {
  it('are REWRITTEN, not translated (## Localization rule 3)', () => {
    /*
     * The enforcement shape I5 uses for the worked examples: a reviewer can see a
     * translation in five seconds, and a test can see that no line is the same line.
     */
    for (const kind of KINDS) {
      const id = MATERIAL_NOTES.id[kind](FIXTURES[kind] as never);
      const en = MATERIAL_NOTES.en[kind](FIXTURES[kind] as never);
      expect(id, kind).not.toBe(en);
      expect(id.length, kind).toBeGreaterThan(10);
      expect(en.length, kind).toBeGreaterThan(10);
    }
  });

  it('covers all three occasions in both locales', () => {
    for (const locale of LOCALES) {
      const rendered = (['birthday', 'first_reading_anniversary', 'return'] as const).map((o) =>
        MATERIAL_NOTES[locale].occasion({
          kind: 'occasion',
          occasion: o,
          years: 1,
          localDate: '2026-08-07',
        }),
      );
      expect(new Set(rendered).size, locale).toBe(3);
    }
  });

  it('keeps the Indonesian half Indonesian, not Malay', () => {
    /*
     * The eleven-word grep, applied to the only F5 prose a model reads. The smoke script
     * greps the OUTPUT; this greps the input, because a model echoes the vocabulary it
     * was handed.
     */
    const all = KINDS.map((k) => MATERIAL_NOTES.id[k](FIXTURES[k] as never)).join(' ').toLowerCase();
    for (const word of MALAY) {
      expect({ word, present: new RegExp(`\\b${word}\\b`).test(all) }).toEqual({
        word,
        present: false,
      });
    }
  });

  it('keeps therapy vocabulary out of the English half', () => {
    /*
     * Non-negotiable 13, and it **binds harder here than anywhere**: a reader asking
     * about the worst thing you have seen is one sentence away from sounding like a
     * clinician, and this table is what tells the director the subject is available.
     */
    const all = KINDS.map((k) => MATERIAL_NOTES.en[k](FIXTURES[k] as never)).join(' ').toLowerCase();
    for (const word of THERAPY_EN) {
      expect({ word, present: all.includes(word) }).toEqual({ word, present: false });
    }
  });

  it('gives no note an instruction verb, because a note names a subject ([F5-9])', () => {
    /*
     * *"It never returns `Bilang ke dia kalau The Moon muncul lagi`."* A model handed a
     * sentence paraphrases it, and three readers handed the same sentence paraphrase it
     * three ways in one run — **which is the room agreeing with itself in three voices.**
     *
     * Shape, not truth: the imperative openers are the cheap tell, and the honest
     * instrument is a person reading `npm run smoke -- --chat --proactive`.
     */
    const IMPERATIVES = [
      /^\s*(bilang|katakan|tanya|tanyakan|sapa|ingatkan|sebutkan|jangan)\b/i,
      /^\s*(tell|ask|say|greet|remind|mention|make sure|don'?t)\b/i,
    ];
    for (const locale of LOCALES) {
      for (const kind of KINDS) {
        const note = MATERIAL_NOTES[locale][kind](FIXTURES[kind] as never);
        for (const rx of IMPERATIVES) {
          expect({ locale, kind, note, imperative: rx.test(note) }).toEqual({
            locale,
            kind,
            note,
            imperative: false,
          });
        }
      }
    }
  });
});

describe('the two R3 kinds', () => {
  it('puts `time_of_day` LAST, because it is the one material with unlimited supply', () => {
    /*
     * Its key is fresh in every part of every day, and `selectMaterial` walks this list
     * lazily and stops at the first unused key. **A material with unlimited supply placed
     * anywhere but last starves everything below it** and the ladder stops being a ranking
     * and becomes a monopoly. Asserted as an index rather than in prose, because that is
     * the property a reorder would break.
     */
    expect(MATERIAL_ORDER[MATERIAL_ORDER.length - 1]).toBe('time_of_day');
  });

  it('puts `profile` above `recurring`: their life beats their deck', () => {
    expect(MATERIAL_ORDER.indexOf('profile')).toBeLessThan(MATERIAL_ORDER.indexOf('recurring'));
    /* And below `unanswered`, because a question decays and a habit does not. */
    expect(MATERIAL_ORDER.indexOf('unanswered')).toBeLessThan(MATERIAL_ORDER.indexOf('profile'));
  });

  it('keys the day AND the part, so a Monday morning expires by Monday evening', () => {
    expect(materialKey(FIXTURES.time_of_day)).toBe('tod:2026-08-09:afternoon');
    const evening: Material = {
      ...(FIXTURES.time_of_day as Extract<Material, { kind: 'time_of_day' }>),
      part: 'evening',
    };
    expect(materialKey(evening)).not.toBe(materialKey(FIXTURES.time_of_day));
    /* And a week later is a different key, which is what stops `tod:monday-morning`'s
     * once-in-a-lifetime failure. */
    const nextWeek = timeOfDayMaterial('2026-08-16', 'afternoon');
    expect(nextWeek).not.toBeNull();
    expect(materialKey(nextWeek as Material)).toBe('tod:2026-08-16:afternoon');
  });

  it('keys a remembered fact by the ITEM and the MONTH', () => {
    expect(materialKey(FIXTURES.profile)).toBe(`profile:${ITEM_ID}:2026-08`);
    const nextMonth: Material = {
      ...(FIXTURES.profile as Extract<Material, { kind: 'profile' }>),
      month: '2026-09',
    };
    expect(materialKey(nextMonth)).not.toBe(materialKey(FIXTURES.profile));
  });

  it('GIVES `ProfileMaterial` NOWHERE TO PUT THE REMEMBERED SENTENCE', () => {
    /*
     * **The whole seam, as one assertion.** The `BAHAN:` line sits in the director's
     * UNFENCED header, and `user_memory` is model prose distilled from whatever the querent
     * types — an unlimited number of attempts at that line, where the Lotus summary (which
     * its note DOES interpolate) is one attempt from six fixed answers.
     *
     * So the type carries no text, `describeMaterial` cannot leak what the object does not
     * hold, and the sentence reaches the reader through phase 5's fenced `<ingatan>`
     * instead. **If this assertion is edited to admit a `text` field, the fence is gone.**
     */
    expect(Object.keys(FIXTURES.profile).sort()).toEqual(['itemId', 'itemKind', 'kind', 'month']);
    for (const locale of LOCALES) {
      const brief = describeMaterial(FIXTURES.profile, locale);
      expect(Object.keys(brief.facts)).toEqual(['kind']);
      expect(USER_MEMORY_KINDS).toContain(brief.facts.kind);
      /* The month is a date the model could recite, for no reader's benefit. */
      expect(materialLine(brief)).not.toContain('2026-08');
    }
  });

  it('hands the director three closed tokens for the clock and no date', () => {
    for (const locale of LOCALES) {
      const brief = describeMaterial(FIXTURES.time_of_day, locale);
      expect(Object.keys(brief.facts).sort()).toEqual(['part', 'shape', 'weekday']);
      /* **THE DATE IS IN THE KEY AND OUT OF THE PROMPT.** A reader reciting the date at
       * somebody who already knows what day it is is the register `C-N1b` forbids. */
      expect(materialLine(brief)).not.toContain('2026-08-09');
    }
  });

  it('names every kind and every part distinctly, in both locales', () => {
    for (const locale of LOCALES) {
      const subjects = USER_MEMORY_KINDS.map((itemKind) =>
        MATERIAL_NOTES[locale].profile({ kind: 'profile', itemId: ITEM_ID, itemKind, month: '2026-08' }),
      );
      expect(new Set(subjects).size, `${locale}/kinds`).toBe(USER_MEMORY_KINDS.length);

      const parts = DAY_PARTS.map((part) =>
        MATERIAL_NOTES[locale].time_of_day({
          kind: 'time_of_day',
          localDate: '2026-08-12',
          weekday: 'wed',
          part,
          shape: 'ordinary',
        }),
      );
      expect(new Set(parts).size, `${locale}/parts`).toBe(DAY_PARTS.length);
    }
  });

  it('keeps the whole subject table clean, not just the kind the fixture happens to use', () => {
    /*
     * The greps above walk `FIXTURES`, which is one `profile` fixture and therefore one of
     * seven subjects. These tables are prompt prose a model reads and paraphrases, so all
     * seven are checked in the language whose list is written for it.
     */
    const id = Object.values(PROFILE_SUBJECT_ID).join(' ').toLowerCase();
    for (const word of MALAY) {
      expect({ word, present: new RegExp(`\\b${word}\\b`).test(id) }).toEqual({
        word,
        present: false,
      });
    }
    const en = Object.values(PROFILE_SUBJECT_EN).join(' ').toLowerCase();
    for (const word of THERAPY_EN) {
      expect({ word, present: en.includes(word) }).toEqual({ word, present: false });
    }
  });

  it('shapes the two days the querent’s own examples name', () => {
    /*
     * **THE JUDGEMENT IS CODE'S, NOT THE MODEL'S** — `effectiveYesNo()`'s rule. Order
     * matters inside `shapeOf`: Monday morning is `week_start` before anything else, and
     * Sunday afternoon is `weekend_close` before it is `weekend`, because *"the weekend is
     * nearly over"* is the thing worth speaking about and *"it is the weekend"* is not.
     */
    /* "njir, udah senin aja. mager ga lu ngantor?" — Monday morning to noon. */
    expect(shapeOf('mon', 'morning')).toBe('week_start');
    expect(shapeOf('mon', 'midday')).toBe('week_start');
    expect(shapeOf('mon', 'evening')).toBe('ordinary');
    /* "kamu weekend ini kemana aja?" — Sunday afternoon. */
    expect(shapeOf('sun', 'afternoon')).toBe('weekend_close');
    expect(shapeOf('sun', 'evening')).toBe('weekend_close');
    expect(shapeOf('sun', 'morning')).toBe('weekend');
    expect(shapeOf('sat', 'evening')).toBe('weekend');
    expect(shapeOf('wed', 'morning')).toBe('ordinary');
  });

  it('refuses a malformed day or an unknown part rather than throwing on a prompt path', () => {
    /* `brief.ts`'s rule: a key it cannot read is a run it cannot describe, not one it
     * should fail — and `timeOfDayFromKey` is the caller that depends on it. */
    expect(timeOfDayMaterial('nonsense', 'morning')).toBeNull();
    expect(timeOfDayMaterial('2026-8-9', 'morning')).toBeNull();
    expect(timeOfDayMaterial('2026-08-09', 'teatime' as never)).toBeNull();
  });

  it('derives the weekday and the shape rather than storing them', () => {
    /*
     * **ONE CONSTRUCTOR, CALLED BY BOTH `detect.ts` AND `brief.ts`.** The mint and the plan
     * are hours apart and the plan rebuilds from `material_key` alone; two independent
     * derivations are two chances for a run to change what it is about in between.
     */
    expect(timeOfDayMaterial('2026-08-31', 'morning')).toEqual({
      kind: 'time_of_day',
      localDate: '2026-08-31',
      weekday: 'mon',
      part: 'morning',
      shape: 'week_start',
    });
    /* And the note reads it back through the ONE word table (`CHAT_TIME_VOCAB`), so this
     * material and phase 2's `<waktu>` block cannot name the same day two ways. */
    const note = MATERIAL_NOTES.id.time_of_day(
      timeOfDayMaterial('2026-08-09', 'afternoon') as Extract<Material, { kind: 'time_of_day' }>,
    );
    expect(note).toContain('Minggu sore');
    expect(WEEKDAYS).toContain('sun');
  });
});
