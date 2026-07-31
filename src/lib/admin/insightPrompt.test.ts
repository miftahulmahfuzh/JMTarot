/**
 * The pure half of A7: the facts block, its hash, the prompt's three rules, and the
 * check over what comes back.
 *
 * **`insight.ts` HAS NO TEST HERE AND CANNOT**, for `flagCoverage.test.ts`'s reason: it
 * reaches `@/lib/llm`, which starts with `import 'server-only'`. That is exactly why
 * everything worth asserting was put in this file instead — the split is the testability.
 */
import { describe, expect, it } from 'vitest';
import {
  INSIGHT_SYSTEM,
  MAX_FACT_ROWS,
  MAX_INSIGHT_CHARS,
  buildInsightPrompt,
  insightInputHash,
  serializePanelFacts,
  validateInsight,
  type PanelFacts,
} from './insightPrompt';

const RANGE = { from: '2026-07-01', to: '2026-07-30', days: 30 };

function facts(over: Partial<PanelFacts> = {}): PanelFacts {
  return {
    title: 'Panggilan model per hari',
    purpose: 'Deret panggilan model per hari UTC.',
    headline: [{ label: 'Total panggilan', value: '1.204' }],
    columns: ['Hari', 'Panggilan'],
    rows: [
      ['2026-07-01', '40'],
      ['2026-07-02', '52'],
    ],
    notes: ['Dikelompokkan per hari UTC.'],
    ...over,
  };
}

describe('serializePanelFacts', () => {
  it('carries the title, the purpose, the range and its length', () => {
    const out = serializePanelFacts(facts(), RANGE);
    expect(out).toContain('PANEL: Panggilan model per hari');
    expect(out).toContain('GUNA: Deret panggilan model per hari UTC.');
    // The DAYS matter as much as the endpoints: "naik 30%" over 7 days and over 90 is
    // not the same claim, and a model given only two dates has to subtract them.
    expect(out).toContain('RENTANG: 2026-07-01 sampai 2026-07-30 (30 hari)');
  });

  it('omits a section entirely rather than printing an empty heading', () => {
    // A `TABEL` heading with nothing under it reads as data the model failed to see,
    // which is the one misreading a facts block must not invite.
    const out = serializePanelFacts(
      facts({ columns: [], rows: [], headline: [], notes: [] }),
      RANGE,
    );
    expect(out).not.toContain('TABEL');
    expect(out).not.toContain('ANGKA UTAMA');
    expect(out).not.toContain('CATATAN');
  });

  it('SAYS SO when it truncates, rather than handing over a prefix', () => {
    /*
     * The failure this prevents: a model told "these are the numbers" describes a trend
     * that stops in March, confidently, with no way for the reader to tell.
     */
    const many = Array.from({ length: MAX_FACT_ROWS + 5 }, (_, i) => [`d${i}`, `${i}`]);
    const out = serializePanelFacts(facts({ rows: many }), RANGE);
    expect(out).toContain('5 baris lagi tidak disertakan');
    expect(out).not.toContain(`d${MAX_FACT_ROWS + 1}`);
  });
});

describe('insightInputHash', () => {
  it('is stable for the same block', () => {
    const a = serializePanelFacts(facts(), RANGE);
    expect(insightInputHash(a)).toBe(insightInputHash(a));
  });

  it('moves when ANY number moves', () => {
    // The whole staleness mechanism. A hash that ignored the table would call a panel
    // current after a day of new calls landed in it.
    const before = insightInputHash(serializePanelFacts(facts(), RANGE));
    const after = insightInputHash(
      serializePanelFacts(facts({ rows: [['2026-07-01', '41'], ['2026-07-02', '52']] }), RANGE),
    );
    expect(after).not.toBe(before);
  });

  it('moves when the RANGE moves, even with identical facts', () => {
    const f = facts();
    const a = insightInputHash(serializePanelFacts(f, RANGE));
    const b = insightInputHash(serializePanelFacts(f, { ...RANGE, days: 7 }));
    expect(a).not.toBe(b);
  });
});

describe('the prompt', () => {
  it('states all three rules', () => {
    /*
     * Asserted because they are the difference between an insight and a fabrication,
     * and because compression pressure is what deletes an instruction — V3's rule. This
     * cannot check that the model OBEYS them; `validateInsight` catches rule 3's shape
     * and nothing catches rule 1. That gap is stated in `insightPrompt.ts`'s header
     * rather than papered over here.
     */
    expect(INSIGHT_SYSTEM).toMatch(/tidak ada di dalam blok data/);
    expect(INSIGHT_SYSTEM).toMatch(/di luar blok ini/);
    expect(INSIGHT_SYSTEM).toMatch(/2 sampai 4 kalimat/);
    expect(INSIGHT_SYSTEM).toMatch(/Tanpa markdown/);
  });

  it('tells the model the block is data and not instructions', () => {
    // The fifth-fence rule. Nothing in a facts block is user text today, and the fence
    // is what keeps that true if a renderer ever grows a column that is.
    expect(INSIGHT_SYSTEM).toContain('<panel>');
    // `\s+` rather than a space: the prompt is assembled from an array of lines, so a
    // phrase can straddle a newline. A test that assumed one space would go red on a
    // rewrap that changed nothing — the `plainText()` lesson, one layer up.
    expect(INSIGHT_SYSTEM).toMatch(/bukan\s+instruksi/);
  });

  it('puts the block in the USER turn, fenced, and never in the system half', () => {
    const { system, user } = buildInsightPrompt('PANEL: X');
    expect(user).toBe('<panel>\nPANEL: X\n</panel>');
    expect(system).not.toContain('PANEL: X');
  });
});

describe('validateInsight', () => {
  const good = 'Panggilan naik dibanding periode sebelumnya. Kenaikannya terpusat di tiga hari terakhir.';

  it('accepts ordinary prose', () => {
    expect(validateInsight(good)).toEqual({ ok: true, body: good });
  });

  it('collapses newlines rather than refusing them', () => {
    /*
     * A model that obeys "2 to 4 sentences" and puts each on its own line has written
     * correct prose. Refusing it would be refusing the content over the whitespace —
     * and anything with real STRUCTURE is refused below.
     */
    const out = validateInsight('Kalimat satu.\n\nKalimat dua.');
    expect(out).toEqual({ ok: true, body: 'Kalimat satu. Kalimat dua.' });
  });

  it('refuses empty and whitespace-only', () => {
    expect(validateInsight('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateInsight('   \n  ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('refuses an essay', () => {
    expect(validateInsight('a'.repeat(MAX_INSIGHT_CHARS + 1))).toEqual({
      ok: false,
      reason: 'too-long',
    });
  });

  for (const [name, body] of [
    ['a fence', '```\nPanggilan naik.\n```'],
    ['a heading', '## Ringkasan\nPanggilan naik.'],
    ['a dash bullet', '- Panggilan naik.\n- Token turun.'],
    ['a star bullet', '* Panggilan naik.'],
    ['a numbered list', '1. Panggilan naik.\n2. Token turun.'],
    ['a pipe table', 'Hari | Panggilan\n1 Jul | 40'],
    ['bold', 'Panggilan **naik** tajam.'],
    ['an underscore', 'Panggilan _naik_ tajam.'],
  ] as const) {
    it(`refuses ${name}`, () => {
      // Each of these renders as literal punctuation inside a paragraph, which reads as
      // a bug in the dashboard rather than as a model's habit. A refusal keeps whatever
      // prose was already on screen and asks for another press.
      expect(validateInsight(body)).toEqual({ ok: false, reason: 'format' });
    });
  }

  it('does not refuse an ordinary hyphen mid-sentence', () => {
    // The bullet test is anchored to the START of a line for exactly this reason: a
    // false refusal costs a correct insight its row, which is `namesIn`'s argument in
    // V2 and the same bias — reject structure, never punctuation.
    const dashed = 'Rentang 1-30 Juli naik tipis. Tidak ada yang menonjol.';
    expect(validateInsight(dashed)).toEqual({ ok: true, body: dashed });
  });
});
