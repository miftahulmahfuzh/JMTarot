import { describe, expect, it } from 'vitest';

import { READERS } from '@/data/readers';
import type { Locale } from '@/data/types';
import { MALAY } from '@/lib/copy/vocab';
import { LOCALES } from '@/lib/i18n/locale';
import { resolveChatClock } from '../clock';
import type { ChatAuthor } from '../types';
import { buildPlanPromptFrom, PLAN_MAX_TOKENS, type PlanInput } from './assemble';
import { affinityFor } from './affinity';
import { planCaps, type PlanCaps } from './caps';
import { planSystemPrompt } from './system';
import { checkPlan } from './validate';
import { buildWindow, type WindowSource } from './window';

const CAPS = planCaps();
const NOW = Date.parse('2026-08-07T12:00:00.000Z');
const HALVES: Record<Locale, string> = {
  id: planSystemPrompt('id', CAPS),
  en: planSystemPrompt('en', CAPS),
};

describe('the contract carries its rules, in both locales', () => {
  for (const locale of LOCALES) {
    const half = HALVES[locale];

    /* **THIS SAID "ten" WHILE ELEVEN EXISTED.** A count written as a sentence goes stale;
     * it is a list the loop walks now, so a thirteenth rule fails here rather than
     * silently going unasserted. */
    it(`all twelve numbered rules are present (${locale})`, () => {
      for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
        expect(half).toContain(`\n${n}. `);
      }
    });

    /**
     * `BAHAN`'s lesson, applied to a second header line: **a line the rules never mention
     * is a line the director reads as unexplained furniture.** There is no worked example
     * of `SEKARANG` in the system half and there cannot be one — `[F2-9]` forbids a
     * quantity there and the digit test enforces it — so the rule carrying the whole
     * weight is what this asserts.
     */
    it(`the rules name the clock line and forbid copying it into an angle (${locale})`, () => {
      expect(half).toContain(locale === 'id' ? 'SEKARANG' : 'NOW');
      expect(half).toMatch(
        locale === 'id'
          ? /JANGAN PERNAH menyalin jam atau tanggal/
          : /NEVER copy a clock time or a date/,
      );
      expect(half).toMatch(
        locale === 'id' ? /Kalau baris SEKARANG tidak ada/ : /If there is no NOW line/,
      );
    });

    it(`the six intents are spelled exactly as the union spells them (${locale})`, () => {
      for (const intent of ['answer', 'ask', 'react', 'tease', 'agree', 'push_back']) {
        expect(half).toContain(intent);
      }
      /* The seventh was folded by `[R9]`; naming it here would license it. */
      expect(half).not.toContain('aside');
    });

    it(`the JSON keys are English tokens in both locales (${locale})`, () => {
      /* `[F2-8]`, `CHOICE_MARKER`'s rule: one thing to parse, one thing to test, and no way
       * to get a locale/token pairing wrong. No querent ever sees a byte of this. */
      for (const key of ['"locale"', '"beats"', '"reader"', '"to"', '"reply"', '"intent"', '"angle"']) {
        expect(half).toContain(key);
      }
    });

    it(`silence is named as a correct answer, with its own worked example (${locale})`, () => {
      expect(half).toContain('"beats":[]');
    });

    it(`the "not a reason to add a beat" block is present (${locale})`, () => {
      expect(half).toMatch(locale === 'id' ? /YANG BUKAN ALASAN/ : /WHAT IS NOT A REASON/);
    });

    /**
     * **R3, 2026-08-30.** The two mechanics the user asked for by name that had no rule of
     * their own: readers taking each other's side, and being allowed to be funny. Each is
     * asserted separately because each is separately deletable, and the first is the one a
     * tidying pass removes as a restatement of *"they may disagree"* — it is the opposite
     * of that, which is the point.
     */
    it(`licenses mutual support and jokes, in the rules (${locale})`, () => {
      const rules = half.slice(half.indexOf(locale === 'id' ? '\nATURAN\n' : '\nRULES\n'));
      expect(rules).toContain(locale === 'id' ? 'SALING MEMBELA' : 'BACK EACH OTHER UP');
      expect(rules).toContain(locale === 'id' ? 'BERCANDA ITU BOLEH' : 'JOKES ARE ALLOWED');
      /* The ceiling-is-not-a-target line, which is the false positive a raised cap buys. */
      expect(rules).toContain(
        locale === 'id' ? 'batas atas, bukan target' : 'a ceiling, not a target',
      );
    });

    it(`the security clause names the fence and calls its contents material (${locale})`, () => {
      expect(half).toContain('<obrolan>');
      expect(half).toMatch(locale === 'id' ? /KEAMANAN/ : /SECURITY/);
    });

    it(`each sketch names its own reader's territory (${locale})`, () => {
      /*
       * `[F2-10]`'s stated cost: the three one-line sketches and
       * `CHAT_READER_PROMPTS_*` can drift, and this is a weak check that is honestly the
       * best available. **If the director starts routing wrongly, the sketches are the
       * first thing to read.**
       */
      const territory: Record<string, string> =
        locale === 'id'
          ? { thessaly: 'karier', margaret: 'keluarga', adrian: 'percintaan' }
          : { thessaly: 'work', margaret: 'family', adrian: 'love' };
      for (const reader of READERS) {
        const paragraph = half.split('\n').find((line) => line.includes(`- ${reader.name} —`));
        expect(paragraph).toBeDefined();
        expect(paragraph).toContain(territory[reader.id]);
      }
    });
  }

  it('the Indonesian half is Indonesian and not Malay', () => {
    const found = MALAY.filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(HALVES.id));
    expect(found).toEqual([]);
  });

  /**
   * `## Localization` rule 3, and its enforcement mechanism: **the English half is a REWRITE,
   * not a translation, and its worked examples use a different situation on purpose.** A
   * reviewer who sees an English example about a work deadline knows in five seconds that
   * somebody translated the file.
   */
  /**
   * **THE `BAHAN` RULE, ASSERTED BY NAME BECAUSE IT WAS ADDED FROM A MEASUREMENT AND WILL
   * OTHERWISE READ AS FURNITURE** (F5's amendment, 2026-08-08).
   *
   * `assemble.ts` renders a `BAHAN:` / `MATERIAL:` line on every proactive run and the rules
   * did not mention it, so the model treated it as an unexplained header and planned from the
   * newest line in the window instead — measured over six live proactive runs, twice, with
   * `recurring` and `lotus` producing prose about the room rather than about the material.
   *
   * The three clauses below are the whole repair, and each fails differently if deleted: the
   * label is what the model looks for, the *do not answer the stale line* clause is the
   * behaviour that was actually wrong, and the *not silence* clause is `[F5-7]` — a
   * zero-beat proactive plan spends the querent's daily budget on nothing, because
   * `[F5-13]`'s counter increments at the mint and does not refund.
   */
  for (const locale of LOCALES) {
    it(`the rules name the material line and what to do with it (${locale})`, () => {
      const half = HALVES[locale];
      const label = locale === 'id' ? 'BAHAN' : 'MATERIAL';
      /* Named in the RULES, not merely in a worked example: an example teaches a shape and a
       * rule is what a model consults when the shape does not match. */
      const rules = half.slice(half.indexOf(locale === 'id' ? '\nATURAN\n' : '\nRULES\n'));
      expect(rules).toContain(label);
      expect(rules).toContain(locale === 'id' ? 'PEMICU' : 'TRIGGER');
      /* `beats: []` is a correct answer for a posted message and a wrong one here. */
      expect(rules).toContain('"beats":[]');
      /* And the worked example exists, in the half, above the rules. */
      expect(half.indexOf(label)).toBeLessThan(half.indexOf(rules));
    });
  }

  it('the two halves share no worked-example body', () => {
    const idBodies = exampleWindowBodies(HALVES.id);
    const enBodies = exampleWindowBodies(HALVES.en);
    expect(idBodies.length).toBeGreaterThan(0);
    expect(enBodies.length).toBeGreaterThan(0);
    for (const body of idBodies) expect(enBodies).not.toContain(body);
  });
});

describe('the caps are interpolated and never typed into the prose', () => {
  /**
   * `services.id.ts` paid for this lesson with `Batas 40 kata`: three of four copies of a
   * number were replaced by a constant and the fourth stood for a release, in the one
   * sentence whose whole job was to bind the ceiling. **Grep for the number, not for the
   * phrase.**
   */
  const OTHER: PlanCaps = { ...CAPS, maxBeats: 3, maxBeatsPerReader: 1, maxAngleChars: 70 };

  for (const locale of LOCALES) {
    it(`a different cap changes the prose (${locale})`, () => {
      const moved = planSystemPrompt(locale, OTHER);
      expect(moved).not.toBe(HALVES[locale]);
      expect(moved).toContain('70');
      expect(moved).not.toContain(String(CAPS.maxAngleChars));
    });
  }
});

/**
 * `[F2-9]`. **EVERY DIGIT IN THE SYSTEM HALF IS AN ADDRESS, A CAP, OR A RULE NUMBER.**
 *
 * `insightPrompt.ts`'s discovery was that *"the worked examples carry no digits, and that is
 * not a style choice"* — a figure in the system half is a number the model can copy that rule
 * 1 would then have to catch. **The rule transfers with a twist rather than verbatim**,
 * because this protocol is made of indices. What it forbids is a QUANTITY: the example's angle
 * says *"tenggatnya sudah dekat"* where a lazier one would have said a number of days.
 *
 * A copied address is harmless in a way a copied figure is not — `checkPlan`'s `P3` nulls an
 * ordinal that is not in the real window.
 */
describe('no quantity the model could copy', () => {
  for (const locale of LOCALES) {
    it(`every digit is an address, a cap or a rule number (${locale})`, () => {
      const stripped = HALVES[locale]
        .replace(/#\d+/g, '')
        .replace(/^\s*\d+\.\s/gm, '')
        .replace(new RegExp(`\\b${CAPS.maxBeats}\\b`, 'g'), '')
        .replace(new RegExp(`\\b${CAPS.maxBeatsPerReader}\\b`, 'g'), '')
        .replace(new RegExp(`\\b${CAPS.maxAngleChars}\\b`, 'g'), '');
      expect(stripped).not.toMatch(/\d/);
    });
  }
});

/**
 * **THE CHECK THE BLOG EDITOR's `at:` BUG WOULD HAVE NEEDED**: the worked example is not
 * merely plausible, it is *correct* — it parses, every `#n` it names is in the window printed
 * directly above it, and `checkPlan` repairs nothing.
 *
 * That is the whole content of the blog editor's lesson, applied one release later: *an index
 * rule needs a worked example, not a definition* — and an example that would itself be
 * repaired teaches the model the wrong protocol with full confidence.
 */
describe('every worked example survives checkPlan against its own printed window', () => {
  for (const locale of LOCALES) {
    it(`the examples are legal plans (${locale})`, () => {
      const examples = examplesIn(HALVES[locale]);
      /*
       * **FOUR SINCE 2026-08-30, AND THE COUNT IS THE FIX RATHER THAN A SIDE EFFECT.**
       *
       * There were three, and TWO of them answered with two beats while rule 1 asked for
       * three or four — because the 2026-08-28 cap change rewrote the rule and left the
       * examples alone. `system.id.ts`'s own header ranks the examples above the rules
       * (*"the example does more work than the description"*), so the model was shown two
       * and told four, and the room stayed quiet through a release.
       *
       * The four now teach the four shapes the rules describe, in the order a reader of
       * the prompt meets them:
       *
       *   [0] the LONG run, four beats, three of them aimed at another reader
       *   [1] SILENCE, `C-R6`, unchanged and untouchable
       *   [2] the SHORT run, one beat -- **added with the long one, not instead of it.**
       *       A cap at eight with only long examples flattens the MIX, and `caps.ts` is
       *       explicit that liveliness comes from the mix and from the silence rate.
       *   [3] the PROACTIVE run, rule 11, four beats and nothing quoted
       */
      expect(examples).toHaveLength(4);

      for (const [i, example] of examples.entries()) {
        const window = buildWindow({
          messages: example.window,
          locale,
          caps: CAPS,
          triggerMessageId: example.window[example.window.length - 1]?.id ?? null,
          now: NOW,
        });
        /*
         * **THE FOURTH EXAMPLE IS CHECKED AS THE PROACTIVE RUN IT DEPICTS.** Passing
         * `'user_message'` for all four would let a zero-beat proactive example pass as a
         * correct silence — which is exactly what `[F5-7]` forbids and what rule 11 tells
         * the model not to do, so the example would be teaching the opposite of the rule
         * printed beneath it and this test would agree.
         */
        const result = checkPlan(example.json, {
          window,
          fallbackLocale: locale,
          caps: CAPS,
          trigger: i === 3 ? 'cron' : 'user_message',
        });
        if (!result.ok) throw new Error(`${locale}: ${result.reason}`);
        expect(result.repairs).toEqual([]);
        expect(result.dropped).toBe(0);
        expect(result.locale).toBe(locale);
      }

      /* Long, silent, short, proactive — and `[F5-7]` is why the last is NOT another
       * silence: on a proactive run nobody spoke, so there is nothing to decline to
       * answer, and the querent's daily budget was already spent at the mint. */
      expect(examplesIn(HALVES[locale]).map((e) => JSON.parse(e.json).beats.length)).toEqual([
        4, 0, 1, 4,
      ]);

      /*
       * **THE FOURTH EXAMPLE'S WHOLE POINT IS THAT IT QUOTES NOTHING.** The window it
       * prints is days old; a `reply` pointing into it would teach exactly the behaviour
       * rule 11 exists to stop, and it would do it with a worked example's authority.
       */
      const proactive = JSON.parse(examples[3].json) as { beats: Array<{ reply: string | null }> };
      for (const beat of proactive.beats) expect(beat.reply).toBeNull();

      /*
       * **R3's OWN ASSERTION, AND IT IS ABOUT THE EXAMPLES RATHER THAN THE PROSE.** The
       * mechanic the release is measured on is readers answering each other, and rule 1
       * has said so in words since 2026-08-28 while no example demonstrated it more than
       * once. Both multi-beat examples must aim at least HALF their beats somewhere other
       * than the querent, or the prompt is describing the mechanic and showing its
       * opposite.
       *
       * **HALF RATHER THAN ALL-BUT-ONE, AND THE DIFFERENCE IS NOT A WEAKENED CHECK.**
       * All-but-one is unreachable without breaking the examples: three of the four
       * multi-beat runs aim a second beat at the querent because that beat is an `ask`,
       * and a question put to the person cannot be aimed at a reader instead. Writing the
       * examples to satisfy `beats.length - 1` would mean inventing questions the readers
       * ask each other in order to pass a test, which is the exact inversion this check
       * exists to catch. **The floor that matters is that a reader is both answered AND
       * answers back**, which is two directed beats out of four, and one directed beat in
       * a four-beat run still fails here.
       */
      for (const index of [0, 3]) {
        const beats = JSON.parse(examples[index].json).beats as Array<{ to: string }>;
        const directed = beats.filter((b) => b.to !== 'user').length;
        const floor = Math.ceil(beats.length / 2);
        expect({ index, ok: directed >= floor, directed }).toEqual({
          index,
          ok: true,
          directed,
        });
      }
    });
  }
});

describe('the user turn', () => {
  const MESSAGES: WindowSource[] = [
    { id: 'a', author: 'margaret', body: 'Kadang yang menahan bukan pekerjaannya.', createdAt: iso(120) },
    { id: 'b', author: 'thessaly', body: 'Kamu belum bilang kapan tenggatnya. Kapan?', createdAt: iso(110) },
    { id: 'c', author: 'user', body: 'eh sori ketiduran, deadline-nya minggu depan', createdAt: iso(0) },
  ];

  function input(over: Partial<PlanInput> = {}): PlanInput {
    const window = buildWindow({
      messages: MESSAGES,
      locale: 'id',
      caps: CAPS,
      triggerMessageId: 'c',
      now: NOW,
    });
    return {
      trigger: 'user_message',
      fallbackLocale: 'id',
      window,
      affinity: affinityFor('deadline-nya minggu depan', 'id'),
      awaiting: 'thessaly',
      material: null,
      caps: CAPS,
      ...over,
    };
  }

  it('renders the trigger as a phrase and the window inside one fence', () => {
    const { user, system, maxTokens } = buildPlanPromptFrom(input(), ['margaret']);
    expect(user).toContain('PEMICU: pesan baru dari penanya');
    expect(user).toContain('BAHASA TERAKHIR: id');
    expect(user).toContain('BARU SAJA BICARA: margaret');
    expect(user).toContain('MENUNGGU JAWABAN: thessaly');
    expect(user.match(/<obrolan>/g)).toHaveLength(1);
    expect(system).toBe(HALVES.id);
    expect(maxTokens).toBe(PLAN_MAX_TOKENS);
  });

  it('numbers the window and marks the hanging question', () => {
    const { user } = buildPlanPromptFrom(input());
    expect(user).toContain('#3  penanya');
    expect(user).toContain('[belum dijawab]');
  });

  /**
   * `[F2-5]`. **AN ABSENT LINE IS SILENCE; A LINE SAYING *tidak ada* IS A FACT THE MODEL WILL
   * REASON ABOUT.** A model shown three negatives concludes something is wrong with the
   * querent; a model shown nothing decides on other grounds.
   */
  it('omits every header line it has nothing to say on', () => {
    const { user } = buildPlanPromptFrom(
      input({ affinity: affinityFor('', 'id'), awaiting: null, material: null }),
      [],
    );
    expect(user).not.toContain('KECOCOKAN');
    expect(user).not.toContain('MENUNGGU JAWABAN');
    expect(user).not.toContain('BARU SAJA BICARA');
    expect(user).not.toContain('BAHAN');
  });

  it('names only the readers who matched, and drops the rest', () => {
    const { user } = buildPlanPromptFrom(input({ affinity: affinityFor('soal kantor', 'id') }));
    const line = user.split('\n').find((l) => l.startsWith('KECOCOKAN:'));
    expect(line).toContain('thessaly=');
    expect(line).not.toContain('margaret=');
  });

  /**
   * `[F2-1]`. **THE DIRECTOR SEES THE ROOM AND NOTHING ABOUT THE PERSON**, and `PlanInput` is
   * where that is enforced by construction: there is no field for a nickname, a birth date,
   * the Lotus or an onboarding answer, so there is nothing for a future edit to accidentally
   * render.
   */
  it('carries no block about the querent at all', () => {
    const { user, system } = buildPlanPromptFrom(input());
    for (const fence of ['<penanya>', '<jawaban>', '<riwayat>', '<sosok>']) {
      expect(user).not.toContain(fence);
      expect(system).not.toContain(fence);
    }
  });

  it("renders F5's material token when there is one, above the window", () => {
    const { user } = buildPlanPromptFrom(
      input({ trigger: 'reading_completed', material: 'reading: The Tower, The Star' }),
    );
    expect(user).toContain('BAHAN: reading: The Tower, The Star');
    expect(user.indexOf('BAHAN:')).toBeLessThan(user.indexOf('<obrolan>'));
    expect(user).toContain('PEMICU: penanya baru saja selesai membaca kartu');
  });

  /**
   * R1, director side. **`SEKARANG` is first, above `PEMICU`** — every other line says
   * something about this run; the clock says when all of it is happening.
   */
  it('renders the clock line first when an offset is known, and omits it when it is not', () => {
    const withClock = buildPlanPromptFrom(
      input({
        now: Date.parse('2026-08-30T01:39:48.000Z'),
        clock: resolveChatClock({
          offsetMinutes: 420,
          now: new Date('2026-08-30T01:39:48.000Z'),
        }),
      }),
    );
    expect(withClock.user.startsWith('SEKARANG: Minggu, 30 Agustus 2026, 08.39 (pagi)')).toBe(true);
    expect(withClock.user.indexOf('SEKARANG:')).toBeLessThan(withClock.user.indexOf('PEMICU:'));

    const without = buildPlanPromptFrom(input());
    expect(without.user).not.toContain('SEKARANG:');
    expect(without.user.startsWith('PEMICU:')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reading the worked examples back out of the prose
// ---------------------------------------------------------------------------

function iso(minutesAgo: number): string {
  return new Date(NOW - minutesAgo * 60_000).toISOString();
}

const AUTHOR_LINE = /^\s*#(\d+)\s+(the querent|penanya|thessaly|margaret|adrian)\s{2,}(.*)$/;

/** The bodies printed in every example window, for the rewrite-not-translation check. */
function exampleWindowBodies(half: string): string[] {
  return half
    .split('\n')
    .map((line) => AUTHOR_LINE.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[3].replace(/\s{2,}\[(belum dijawab|unanswered)\]\s*$/, '').trim());
}

/**
 * Each example, as the window it printed plus the JSON it answered with.
 *
 * The shape template — the one with `"..."` placeholders — is skipped: it is a schema and not
 * an answer, and running `checkPlan` over it would assert that `"..."` is a reader.
 */
function examplesIn(half: string): Array<{ window: WindowSource[]; json: string }> {
  const out: Array<{ window: WindowSource[]; json: string }> = [];
  let window: WindowSource[] = [];

  for (const line of half.split('\n')) {
    const entry = AUTHOR_LINE.exec(line);
    if (entry) {
      if (Number(entry[1]) === 1) window = [];
      window.push({
        id: `x${out.length}-${entry[1]}`,
        author:
          entry[2] === 'penanya' || entry[2] === 'the querent'
            ? 'user'
            : (entry[2] as ChatAuthor),
        body: entry[3],
        /* Placeholder; the ages are assigned below, once the length is known. */
        createdAt: iso(0),
      });
      continue;
    }
    const json = /^\{"locale".*\}$/.exec(line.trim());
    if (json && !line.includes('"..."')) {
      /*
       * **THE AGES MIRROR WHAT THE EXAMPLE ITSELF PRINTS**: the last line is the trigger,
       * *just now*, and everything above it is an hour or more old. That is what makes `P8`'s
       * one-old-quote budget bind here the way it binds in a real run — and it is why the
       * example's second beat may point at `#2` while its first points at the newest line.
       */
      const n = window.length;
      out.push({
        window: window.map((m, i) => ({ ...m, createdAt: iso(i === n - 1 ? 0 : (n - i) * 60) })),
        json: json[0],
      });
    }
  }
  return out;
}
