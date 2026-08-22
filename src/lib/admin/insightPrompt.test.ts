/**
 * The pure half of A7: the facts block, its hash, the prompt's three rules, and the
 * check over what comes back.
 *
 * **`insight.ts` IS TESTED IN `insight.test.ts`, AND THIS HEADER USED TO SAY IT COULD
 * NOT BE.** The old text: *"`insight.ts` HAS NO TEST HERE AND CANNOT, for
 * `flagCoverage.test.ts`'s reason: it reaches `@/lib/llm`, which starts with
 * `import 'server-only'`."* The premise is true; the conclusion was wrong. `vi.mock`
 * intercepts the specifier before the module is evaluated, so `server-only` never runs —
 * which `src/lib/translate/translate.test.ts` has relied on since V2 on a server-only
 * module reaching the same provider. Corrected rather than left standing, because a
 * comment asserting something is untestable is how it stays untested.
 *
 * The SPLIT it describes is still right and is untouched: everything worth asserting
 * that is a string transform is here, and only what needs a provider is next door.
 */
import { describe, expect, it } from 'vitest';
import {
  INSIGHT_SYSTEM,
  MAX_FACT_ROWS,
  MAX_INSIGHT_CHARS,
  MAX_REJECTED_CHARS,
  RETRY_BUDGET_MS,
  buildInsightPrompt,
  insightInputHash,
  isRetryableReason,
  retryFitsBudget,
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
  it('states all four rules', () => {
    /*
     * Asserted because they are the difference between an insight and a fabrication,
     * and because compression pressure is what deletes an instruction — V3's rule. This
     * cannot check that the model OBEYS them; `validateInsight` catches rule 4's shape
     * and the coarsest violation of rule 2, and nothing catches rule 1. That gap is
     * stated in `insightPrompt.ts`'s header rather than papered over here.
     */
    expect(INSIGHT_SYSTEM).toMatch(/tidak ada di dalam blok data/);
    expect(INSIGHT_SYSTEM).toMatch(/di luar blok ini/);
    expect(INSIGHT_SYSTEM).toMatch(/2 sampai 4 kalimat/);
    expect(INSIGHT_SYSTEM).toMatch(/Tanpa markdown/);
  });

  it('asks for a finding rather than a summary, and forbids the recital', () => {
    /*
     * The 2026-08-01 rewrite. The first version's *"apa yang dikatakan angkanya"* got a
     * tally back — true, and worth nothing under a chart the operator had just read. If
     * these two go, the prompt has quietly become the one that produced the report.
     */
    expect(INSIGHT_SYSTEM).toMatch(/BUKAN MENYEBUT ULANG ANGKANYA/);
    expect(INSIGHT_SYSTEM).toMatch(/sebagai BUKTI/);
    expect(INSIGHT_SYSTEM).toMatch(/tidak pernah\s+sebagai daftar/);
  });

  it('lists what is NOT a problem and resolves doubt toward "nothing wrong"', () => {
    /*
     * The false-positive half, and the expensive one: an operator sent chasing a healthy
     * panel stops trusting the box. W7's gate makes the same trade — a false positive is
     * an accusation delivered to somebody who did nothing wrong.
     */
    expect(INSIGHT_SYSTEM).toMatch(/YANG BUKAN MASALAH/);
    expect(INSIGHT_SYSTEM).toMatch(/[Dd]itinggalkan/);
    expect(INSIGHT_SYSTEM).toMatch(/CATATAN DARI PANEL/);
    expect(INSIGHT_SYSTEM).toMatch(/ragu sesuatu masalah atau bukan, anggap bukan/);
    // "No problem" must read as a correct answer, or the model invents one to be useful.
    expect(INSIGHT_SYSTEM).toMatch(/jawaban yang benar/);
  });

  it('WRITES THE RECITAL EXAMPLE WITH NO DIGITS IN IT', () => {
    /*
     * `summary.test.ts`'s rule, narrowed to the one line where it bites. Rule 1 says
     * every number in the OUTPUT must be findable in the block — so a figure inside a
     * worked example is a number the model can copy that rule 1 would then have to
     * catch. `sekian` shows the shape and carries nothing copyable.
     *
     * **The rest of the prompt is NOT digit-free and must not be made so**: rule 4's
     * *"2 sampai 4 kalimat"* is the length control, and `## The prompt` is explicit that
     * a ceiling the model can count as it writes is the only kind that binds.
     */
    const example = INSIGHT_SYSTEM.split('\n').find((l) => l.includes('op A'));
    expect(example).toBeDefined();
    expect(example).not.toMatch(/\d/);
    expect(example).toContain('sekian');
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
    ['underscore emphasis', 'Panggilan _naik_ tajam.'],
    ['a leading underscore', 'Panggilan _naik tajam.'],
    ['a trailing underscore', 'Panggilan naik_ tajam.'],
    ['a lone underscore', 'Panggilan naik _ tajam.'],
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

  /*
   * The 2026-08-01 anti-recital backstop. **The prompt is the control and these two are
   * the belt**, so every case below is either an unambiguous recital or a correct answer
   * that must survive — a threshold that starts refusing correct prose has to be loosened,
   * not worked around at the call site.
   */
  describe('tally', () => {
    it('refuses a body in which every sentence is only numbers', () => {
      // The reported failure, in its own words: "A is 23, followed by B total of 45".
      // Three sentences, a digit in all three, no claim anywhere.
      const recital = 'Op reading 412 panggilan. Op moderation 388 panggilan. Op persona 40.';
      expect(validateInsight(recital)).toEqual({ ok: false, reason: 'tally' });
    });

    it('refuses one sentence that is a list of five figures', () => {
      const listed =
        'Panggilan 412, token input 88.000, token output 41.000, bacaan 120, dan p95 8.200 ms.';
      expect(validateInsight(listed)).toEqual({ ok: false, reason: 'tally' });
    });

    it('ACCEPTS a finding that cites its evidence', () => {
      // The shape the prompt asks for: problem, one figure as evidence, one action. The
      // action sentence carries no digit, which is what the recital rule keys on.
      const good =
        'Kegagalan hampir seluruhnya menumpuk di op persona: 12 dari 14. ' +
        'Op lain bersih, jadi ini pola sistematis dan bukan sebaran acak. ' +
        'Periksa panel status di rentang yang lebih panjang sebelum menyimpulkan apa pun.';
      expect(validateInsight(good)).toEqual({ ok: true, body: good });
    });

    it('ACCEPTS two sentences that both carry a figure', () => {
      // `MIN_SENTENCES_FOR_RECITAL` exists for this: at two, "X naik ke A, Y turun ke B"
      // is an ordinary comparison and refusing it would be refusing a correct answer.
      const two = 'TTFT p95 naik ke 8.200 ms. Panggilan bacaan turun 12%.';
      expect(validateInsight(two)).toEqual({ ok: true, body: two });
    });

    it('ACCEPTS a sentence carrying a date alongside two figures', () => {
      /*
       * The reason `NUMBER` keeps the hyphen inside its character class. Without it
       * `2026-07-28` counts as three numbers, this sentence reaches five, and a correct
       * finding is refused for citing the day it happened.
       */
      const dated =
        'Lonjakan itu terpusat pada 2026-07-28, ketika panggilan mencapai 412 dari rata-rata 180. ' +
        'Tidak ada op lain yang ikut naik.';
      expect(validateInsight(dated)).toEqual({ ok: true, body: dated });
    });

    it('ACCEPTS the honest "nothing is wrong" answer', () => {
      // Stated as a correct outcome in the prompt, so it must be one here too.
      const clean = 'Semua op berakhir wajar dan tidak ada yang menonjol. Tidak ada yang perlu ditindaklanjuti dari panel ini.';
      expect(validateInsight(clean)).toEqual({ ok: true, body: clean });
    });
  });
});

/*
 * ── CARD #2: THE CHECK THAT REFUSED CORRECT PROSE ──────────────────────────
 *
 * Ten presses of `format` in a row, on a panel whose own notes hand the model
 * `chat_plan`, `chat_turn`, `blog_format` and `llm_calls.user_id` while rule 2 asks it
 * to cite evidence out of that block. **These are the sentences that were refused**, and
 * each one is a real string a panel could produce — `panels.ts` is where they come from,
 * which is why the assertion is written as prose rather than as `'a_b'`.
 */
describe('validateInsight: snake_case identifiers from the facts block', () => {
  for (const [name, body] of [
    ['an op name', 'Panggilan chat_turn naik tajam sejak akhir bulan. Layak dilihat di rentang yang lebih panjang.'],
    ['two op names', 'Kenaikannya ada di chat_plan dan chat_turn, bukan di bacaan. Tidak ada yang perlu ditindaklanjuti.'],
    ['a qualified column', 'Yang membedakan keduanya cuma llm_calls.user_id. Panelnya sendiri wajar.'],
    ['a column name', 'Sebagian baris tidak melaporkan input_tokens sama sekali. Itu berarti providernya tidak memberi tahu.'],
  ] as const) {
    it(`ACCEPTS ${name}`, () => {
      expect(validateInsight(body)).toEqual({ ok: true, body });
    });
  }

  it('still refuses emphasis wrapping a whole word', () => {
    // The positional rule is not a licence: `_naik_` has no word character before the
    // first underscore, so it is emphasis and is still structure.
    expect(validateInsight('Panggilan _naik_ tajam.')).toEqual({ ok: false, reason: 'format' });
  });

  it('still refuses an asterisk anywhere', () => {
    // The asterisk stayed blanket, deliberately: no Indonesian prose needs one.
    expect(validateInsight('Panggilan naik * tajam.')).toEqual({ ok: false, reason: 'format' });
  });
});

describe('the retry policy', () => {
  it('retries exactly the four shape refusals', () => {
    for (const r of ['format', 'tally', 'too-long', 'empty']) {
      expect(isRetryableReason(r)).toBe(true);
    }
  });

  it('never retries `ceiling` or `failed`', () => {
    /*
     * Neither produced text, so there is no wrong example to give — and a `ceiling`
     * retry spends quota the limiter has just refused, on the one call class that exists
     * to be shed before a querent's reading.
     */
    expect(isRetryableReason('ceiling')).toBe(false);
    expect(isRetryableReason('failed')).toBe(false);
  });

  it('allows a retry only when a second call of the same cost still fits', () => {
    expect(retryFitsBudget(0)).toBe(true);
    expect(retryFitsBudget(RETRY_BUDGET_MS / 2)).toBe(true);
    expect(retryFitsBudget(RETRY_BUDGET_MS / 2 + 1)).toBe(false);
    expect(retryFitsBudget(RETRY_BUDGET_MS)).toBe(false);
  });

  it('keeps the retry budget under the client abort it is derived from', () => {
    /*
     * `InsightBox`'s `ABORT_MS` is 45_000, and the composite admin read precedes this
     * pair while `putInsight` follows it. **The two numbers are ends of one bound** — if
     * this assertion fails, the pair can now outlive the bound the operator actually
     * experiences, and an aborted press reports an outcome nobody can read.
     */
    expect(RETRY_BUDGET_MS).toBeLessThan(45_000);
  });
});

describe('buildInsightPrompt with a rejected attempt', () => {
  const serialized = serializePanelFacts(facts(), RANGE);

  it('emits no wrong-example block on a first attempt', () => {
    const { user, system } = buildInsightPrompt(serialized);
    expect(user).not.toContain('contoh_salah');
    expect(user).not.toContain('PERCOBAAN SEBELUMNYA');
    expect(system).toBe(INSIGHT_SYSTEM);
  });

  it('fences the rejected body and names what it did wrong', () => {
    const { user } = buildInsightPrompt(serialized, {
      reason: 'format',
      body: '- Panggilan naik.\n- Token turun.',
    });
    expect(user).toContain('<contoh_salah>');
    expect(user).toContain('</contoh_salah>');
    expect(user).toContain('- Panggilan naik.');
    // The violation is NAMED. "formatmu salah" is the instruction that already failed.
    expect(user).toContain('markdown');
    // The facts block is still there and still first.
    expect(user.indexOf('<panel>')).toBeLessThan(user.indexOf('<contoh_salah>'));
  });

  it('says the fenced text is data rather than instructions', () => {
    // R17's rule. The text inside is the model's own output, but the fence still says so.
    const { user } = buildInsightPrompt(serialized, { reason: 'tally', body: 'A 1. B 2. C 3.' });
    expect(user).toContain('data, bukan instruksi');
  });

  it('caps the fed-back body', () => {
    const { user } = buildInsightPrompt(serialized, { reason: 'too-long', body: 'x'.repeat(2000) });
    expect(user).toContain('x'.repeat(MAX_REJECTED_CHARS));
    expect(user).not.toContain('x'.repeat(MAX_REJECTED_CHARS + 1));
  });

  it('emits the sentence and NO fence for an empty attempt', () => {
    /*
     * An empty pair of tags reads to a model as an example of writing nothing, which is
     * precisely the failure being corrected.
     */
    const { user } = buildInsightPrompt(serialized, { reason: 'empty', body: '   \n ' });
    expect(user).toContain('PERCOBAAN SEBELUMNYA');
    expect(user).not.toContain('<contoh_salah>');
  });

  it('leaves INSIGHT_SYSTEM untouched on a retry', () => {
    // The contract is the same on both attempts; what changed is a fact about this press.
    const { system } = buildInsightPrompt(serialized, { reason: 'format', body: '## x' });
    expect(system).toBe(INSIGHT_SYSTEM);
  });

  it('DOES NOT MOVE THE INPUT HASH', () => {
    /*
     * **THE ONE ASSERTION IN THIS FILE THAT PROTECTS THE CACHE.** The hash is taken over
     * the serialized facts alone. If a negative example ever reached it, a rescued
     * insight would store a hash that never equals the next page load's — the cache
     * would invert into a guarantee of one model call per view, and the box would read
     * stale for ever.
     */
    const plain = buildInsightPrompt(serialized);
    const retried = buildInsightPrompt(serialized, { reason: 'format', body: '## x' });
    expect(retried.user).not.toBe(plain.user);
    expect(insightInputHash(serialized)).toBe(insightInputHash(serialized));
    expect(retried.maxTokens).toBe(plain.maxTokens);
  });
});
