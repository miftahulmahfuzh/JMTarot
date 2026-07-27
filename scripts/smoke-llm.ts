/**
 * Stream one completion from the configured provider to stdout.
 *
 *   npm run smoke
 *
 * The cheapest possible confirmation that LLM_API_KEY, LLM_BASE_URL and
 * LLM_MODEL are all correct, isolated from every UI question. Run it before
 * blaming the app. Task 10 extends this with --reader/--service to print real
 * readings.
 *
 * Chunks are written as they arrive and the footer reports timing, so a stream
 * that stalls or arrives all at once is visible rather than inferred.
 *
 * MEASURED against z.ai/glm-4.6 on 2026-07-25, for a ~250-word reading:
 * 354 chunks, first at 2.7s, last at 4.9s, only 2 gaps over 50ms. So it does
 * stream progressively once it starts.
 *
 * The problem is when it starts. Time-to-first-token across runs was 2.7s,
 * 5.4s and 11.6s -- highly variable and occasionally very slow. Two
 * consequences worth designing around:
 *
 *   - The "Membaca kartu..." placeholder is not decoration. It has to hold the
 *     screen for anything up to ten seconds without looking hung.
 *   - Short replies finish inside a single burst, which looks like no
 *     streaming at all. Do not conclude streaming is broken from one short
 *     run; check a full-length reading.
 */
import { readFileSync } from 'node:fs';
import { getProvider } from '@/lib/llm';
import type { MemoryContext } from '@/lib/prompt/memory';
import { isLocale, LOCALES, type Locale } from '@/lib/i18n/locale';

/* Loaded by hand: this runs outside Next, so nothing has read .env.local. */
function loadEnv(path = '.env.local') {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined) continue;
    // Undo the \$ escaping that .env files need; see .env.example.
    process.env[key] = rawValue.replace(/\\\$/g, '$').replace(/^["']|["']$/g, '');
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function run(
  label: string,
  system: string,
  user: string,
  maxTokens: number,
  promptVersion = 'smoke',
) {
  const provider = getProvider();
  process.stdout.write(`\n${'='.repeat(70)}\n${label}\n${'='.repeat(70)}\n`);

  const started = Date.now();
  let chunks = 0;
  let firstChunkAt = 0;
  let text = '';

  /*
   * STILL A PLAIN `for await`, unchanged by W4's interface change, which is the
   * whole justification for the intersection type: `usage` is an added property
   * and not a new shape, so every existing consumer keeps compiling.
   */
  const stream = provider.streamReading({ system, user, maxTokens, promptVersion });
  for await (const chunk of stream) {
    if (chunks === 0) firstChunkAt = Date.now() - started;
    chunks += 1;
    text += chunk;
    process.stdout.write(chunk);
  }

  /*
   * EXPECT NULLS ON z.ai. It reports `input_tokens: 0`, which the adapter
   * stores as null rather than 0 so no average is silently wrong. Printed here
   * so the fact is documented by the tool rather than left as folklore -- if
   * these ever come back as numbers, the provider changed and
   * readings.token_input becomes worth querying.
   */
  const usage = await stream.usage;

  process.stdout.write(
    `\n\n[${chunks} chunks, first after ${firstChunkAt}ms, ` +
      `${Date.now() - started}ms total, ${text.length} chars, ` +
      `tokens in=${usage.inputTokens ?? 'null'} out=${usage.outputTokens ?? 'null'}, ` +
      `prompt=${promptVersion}]\n`,
  );
  return text;
}

async function main() {
  loadEnv();

  for (const key of ['LLM_API_KEY', 'LLM_MODEL']) {
    if (!process.env[key]) {
      console.error(`Missing ${key}. Copy .env.example to .env.local and fill it in.`);
      process.exit(1);
    }
  }
  console.error(
    `provider=${process.env.LLM_PROVIDER ?? 'zai'} model=${process.env.LLM_MODEL} ` +
      `baseURL=${process.env.LLM_BASE_URL ?? 'api.anthropic.com'}`,
  );

  const reader = arg('reader');
  const service = arg('service');

  /*
   * W6. `--locale id|en`, defaulting to `id`.
   *
   * VALIDATED RATHER THAN CAST, because a typo would otherwise reach `buildPrompt`,
   * index a `Record<Locale, ...>` with a miss, and hand the model `undefined` as its
   * entire contract -- which does not throw and comes back as a fluent reading
   * generated with no rules at all. That is the single worst failure mode in the
   * fork and it costs one check to make impossible.
   */
  const localeArg = arg('locale') ?? 'id';
  if (!isLocale(localeArg)) {
    console.error(`--locale must be one of ${LOCALES.join(', ')}, got "${localeArg}"`);
    process.exit(1);
  }
  const locale: Locale = localeArg;

  const all = process.argv.includes('--all');
  const lotus = process.argv.includes('--lotus');
  const memory = process.argv.includes('--memory');
  const summary = process.argv.includes('--summary');
  const gist = process.argv.includes('--gist');
  const frequency = process.argv.includes('--frequency');
  /* Any comparison run wants fixed hands, for the reason spelled out at the
     `picks` assignment below: two runs that drew different cards cannot be
     diffed. `--memory` joins that list because its whole point is a recalled
     card that REPEATS in the current draw, which needs a hand it can control. */
  const fixedCards =
    all && (lotus || memory || process.argv.includes('--fixed'));

  /*
   * `npm run smoke -- --lotus` runs ONE real distillation and shows its whole
   * pipeline: the prompt, the raw model output, the parsed result and the
   * safety-check verdict.
   *
   * This exists because everything about the Lotus block is unit-tested for
   * SHAPE and nothing can unit-test whether it is any good -- and unlike a
   * reading, nobody ever reads this text again after it is written once. It goes
   * silently into every subsequent reading prompt instead. So it gets looked at
   * on purpose, at least once, by a person.
   */
  if (lotus && !all) {
    await runLotus();
    return;
  }

  /* `--summary` is its own run: it generates six summaries from one synthetic
     day and has nothing to do with the nine readings. It composes with `--all`
     -- run both and you get the nine, then the six. */
  if (summary) {
    await runSummary();
    if (!all) return;
  }

  /* `--frequency` is its own run too: five verdicts over five different card
     pairs, which is the only way to find out whether the angle rotation
     actually bites or whether the line reads the same every time. */
  if (frequency) {
    await runFrequency();
    if (!all) return;
  }

  if (!reader && !service && !all) {
    await run(
      'wiring check',
      'Jawab dalam bahasa Indonesia. Tanpa markdown, tanpa emoji.',
      'Sebutkan tiga hal kecil yang bisa membuat hari seseorang terasa lebih tenang.',
      300,
    );
    return;
  }

  const { buildPrompt } = await import('@/lib/prompt/build');
  const { VERDICT_WORD } = await import('@/lib/prompt/services');
  const { READERS } = await import('@/data/readers');
  const { SERVICES } = await import('@/data/services');
  const { CARDS, effectiveYesNo, shuffleDeck } = await import('@/data/deck');
  const { detectCallback, fallbackGist, gistPrompt, gistUserTurn, sanitizeGist } =
    await import('@/lib/prompt/memory');

  const pairs =
    reader && service
      ? [[reader, service] as const]
      : READERS.flatMap((r) => SERVICES.map((s) => [r.id, s.id] as const));

  const failures: string[] = [];
  /** reader -> its spread3 text, for the overlap number printed at the end. */
  const spreads = new Map<string, string>();

  let offered = 0;
  let used = 0;
  const bySignal = { card: 0, phrase: 0 };
  const gists: Array<{ pair: string; gist: string; fellBack: boolean }> = [];

  for (const [r, s] of pairs) {
    const count = SERVICES.find((x) => x.id === s)?.cardCount ?? 1;

    /*
     * DETERMINISTIC PICKS WHEN COMPARING, RANDOM OTHERWISE.
     *
     * `--all --lotus` is meant to be diffed against `--all`, and two runs that
     * drew different cards are not comparable at all -- any difference in the
     * prose is explained by The Tower turning up instead of The Star, and the
     * question the comparison exists to answer ("did the Lotus block flatten the
     * readers?") cannot be reached. So both runs draw the same nine hands.
     *
     * Off by default, because a single `--all` run is also how you check that a
     * random spread still produces sane readings.
     */
    const picks = fixedCards
      ? fixedPicks(pairs.findIndex(([pr, ps]) => pr === r && ps === s), count)
      : shuffleDeck()
          .slice(0, count)
          .map((d) => ({ id: d.card.id, reversed: d.reversed }));

    /*
     * THE SYNTHETIC MEMORY CONTEXT shares its first card with the current draw,
     * so the §4.3 gate resolves to 'repeat' and the block is guaranteed to be
     * offered. That is the point: this run measures whether the model USES an
     * offered block, and a run where the gate declined to offer one would
     * measure nothing while looking like a 0% callback rate.
     */
    const memoryCtx = memory ? memoryFixture(picks) : null;

    const prompt = buildPrompt({
      reader: r,
      service: s,
      picks,
      locale,
      question: arg('question'),
      context:
        lotus || memoryCtx
          ? { lotus: lotus ? LOTUS_BLOCK_FIXTURE : null, memory: memoryCtx }
          : undefined,
    });
    const text = await run(
      `${r} / ${s}`,
      prompt.system,
      prompt.user,
      prompt.maxTokens,
      prompt.promptVersion,
    );
    if (s === 'spread3') spreads.set(r, text);

    if (memoryCtx) {
      offered += 1;
      const hit = detectCallback({
        body: text,
        currentCardIds: picks.map((p) => p.id),
        recalledCardIds: memoryCtx.recalled.flatMap((x) => x.cards.map((c) => c.cardId)),
        locale: 'id',
      });
      if (hit.fired) {
        used += 1;
        bySignal[hit.signal!] += 1;
      }
      process.stdout.write(
        `\n[memory] block offered (${memoryCtx.reason}), callback ` +
          `${hit.fired ? `FIRED via ${hit.signal}` : 'did not fire'}\n`,
      );
    }

    if (gist) {
      /*
       * A REAL EXTRACTION over the body just generated. This is the only way to
       * find out whether the gists are clauses or sentences that restate the
       * reading -- no unit test can tell the difference, and every one of these
       * goes silently into a future reading's <riwayat> block.
       */
      const raw = await getProvider().complete({
        system: gistPrompt('id').system,
        user: gistUserTurn(text),
        maxTokens: gistPrompt('id').maxTokens,
      });
      const cleaned = sanitizeGist(raw.text);
      const fell = cleaned === null;
      const finalGist = cleaned ?? fallbackGist(text) ?? '';
      gists.push({ pair: `${r}/${s}`, gist: finalGist, fellBack: fell });
      process.stdout.write(
        `\n[gist]${fell ? ' (FELL BACK)' : ''} ${finalGist}\n`,
      );
    }

    const framing = READERS.find((x) => x.id === r)?.positionFraming[locale] ?? [];
    for (const problem of check(text, r, s, picks, {
      CARDS,
      effectiveYesNo,
      /*
       * `VERDICT_WORD[locale]`, NOT `VERDICT_WORD`. W6 Task 9 reshaped it to
       * `Record<Locale, Record<YesNo, string>>` and `deps` here is typed `any`, so
       * the old code compiled and read `undefined` at runtime -- the yesno opener
       * check would have silently passed on every reading. Same class of bug as the
       * `Layanan: [object Object]` this workstream already paid for, and the same
       * lesson: `any` at a boundary defeats the type lock exactly where the reshape
       * happens.
       */
      VERDICT_WORD: VERDICT_WORD[locale],
      framing,
      locale,
    })) {
      failures.push(`${r}/${s}: ${problem}`);
    }
  }

  process.stdout.write(`\n${'#'.repeat(70)}\nMECHANICAL CHECKS\n${'#'.repeat(70)}\n`);
  if (failures.length === 0) {
    process.stdout.write('all clean\n');
  } else {
    for (const f of failures) process.stdout.write(`FAIL  ${f}\n`);
    process.stdout.write(`\n${failures.length} violation(s)\n`);
  }

  if (spreads.size === 3) {
    /*
     * A HEURISTIC REPORTED AS A NUMBER, NEVER AN ASSERTION (W3 plan §9).
     *
     * Mean pairwise Jaccard overlap of content words between the three readers'
     * spread3 outputs. It will NOT catch two readers converging in rhythm while
     * using different words, so it can never be the gate -- but a jump between
     * the plain and lotus runs is a signal worth acting on, and it costs ten
     * lines.
     *
     * THE GATE IS STILL READING THE NINE.
     */
    const texts = [...spreads.entries()];
    const pairsOf: Array<[string, string, number]> = [];
    for (let i = 0; i < texts.length; i += 1) {
      for (let j = i + 1; j < texts.length; j += 1) {
        pairsOf.push([texts[i][0], texts[j][0], jaccard(texts[i][1], texts[j][1])]);
      }
    }
    const mean = pairsOf.reduce((sum, [, , v]) => sum + v, 0) / pairsOf.length;
    process.stdout.write(`\nreader overlap, spread3 (${lotus ? 'WITH lotus' : 'plain'}):\n`);
    for (const [a, b, v] of pairsOf) {
      process.stdout.write(`  ${a} vs ${b}: ${v.toFixed(3)}\n`);
    }
    process.stdout.write(`  mean: ${mean.toFixed(3)}\n`);
  }

  if (offered > 0) {
    /*
     * THE RATIO, WHICH IS THE NUMBER THIS FEATURE IS JUDGED ON (§4.5).
     *
     * The operating band, stated so it is falsifiable: below roughly 15% the
     * block is paying tokens for nothing and should be cut; above roughly 60%
     * it has become the tic roadmap §10 warns about and the §4.3 gate needs
     * tightening to 'repeat' only. `MEMORY_CHAIN_COUNT=0` is the kill switch.
     *
     * Nine readings is a SMALL SAMPLE and the band is about production traffic
     * over a week. What nine can tell you is whether the mechanism works at all
     * -- 0/9 or 9/9 both mean something is wrong.
     */
    const pct = ((used / offered) * 100).toFixed(0);
    process.stdout.write(`\n${'#'.repeat(70)}\nCHAINED READING\n${'#'.repeat(70)}\n`);
    process.stdout.write(`chain_used / chain_offered: ${used}/${offered} (${pct}%)\n`);
    process.stdout.write(`  via card signal:   ${bySignal.card}\n`);
    process.stdout.write(`  via phrase signal: ${bySignal.phrase}\n`);
    process.stdout.write(
      '\nBand: under ~15% the block pays tokens for nothing; over ~60% it is a\n' +
        'tic and the gate should drop the \'question\' reason. Nine is a small\n' +
        'sample -- what it can tell you is whether the mechanism fires AT ALL.\n',
    );
  }

  if (gists.length > 0) {
    process.stdout.write(`\n${'#'.repeat(70)}\nTHE GISTS\n${'#'.repeat(70)}\n`);
    for (const g of gists) {
      process.stdout.write(`${g.pair.padEnd(20)} ${g.fellBack ? '[fallback] ' : ''}${g.gist}\n`);
    }
    process.stdout.write(
      '\nRead these as a set. Each should be a CLAUSE naming what the reading\n' +
        'concluded -- not a sentence restating it, and not a card name. Every one\n' +
        'of them goes silently into a future reading\'s <riwayat> block.\n',
    );
  }

  if (lotus) {
    process.stdout.write(`\n${'#'.repeat(70)}\nTHE LOTUS BLOCK THESE NINE CARRIED\n${'#'.repeat(70)}\n`);
    process.stdout.write(`${renderLotusBlockFixture()}\n`);
    process.stdout.write(
      '\nRead the nine in THIS order (W3 plan §9):\n' +
        '  1. Cover the names. Can you still tell Thessaly, Margaret and Adrian\n' +
        '     apart? If not, fix the persona paragraphs or the base-contract\n' +
        '     <penanya> rule -- never the code.\n' +
        '  2. How many of the nine mention the background AT ALL? Nine out of nine\n' +
        '     means the "at most once, only if it sharpens" rule failed and the\n' +
        '     block is being treated as the topic. Two or three is the shape of a\n' +
        '     rule that is working.\n' +
        '  3. Does any reading reach PAST the block toward an incident that is not\n' +
        '     in it? The fixture says "kenangan berat tentang kehilangan" and\n' +
        '     nothing more; a reading that invents the loss has gone too far.\n',
    );
  } else {
    process.stdout.write(
      '\nWhat this cannot check: whether the three readers are actually\n' +
        'distinguishable. Cover the names and read them. If you cannot tell who\n' +
        'wrote which, the app has one reader in three hats -- fix the persona\n' +
        'paragraphs in src/lib/prompt/readers.ts, not the code.\n',
    );
  }
}

/**
 * Content-word overlap between two readings.
 *
 * Indonesian function words are stripped, or the number would mostly measure how
 * often both texts said "yang".
 */
const STOPWORDS = new Set(
  ('yang dan di ke dari itu ini ada untuk pada dengan kamu tidak bisa akan atau juga ' +
    'sudah masih saat kalau karena tapi lebih satu dalam bukan apa saja hanya jadi ' +
    'seperti agar oleh para adalah nya se ia dia mereka aku saya kita kami').split(' '),
);

function jaccard(a: string, b: string): number {
  const bag = (t: string) =>
    new Set(
      t
        .toLowerCase()
        .replace(/[^\p{L}\s]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
    );
  const x = bag(a);
  const y = bag(b);
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared += 1;
  return shared / (x.size + y.size - shared);
}

/**
 * The canned Lotus block the `--all --lotus` run injects into all nine readings.
 *
 * VERBATIM FROM A REAL DISTILLATION of the fixture below, not hand-written, so
 * the comparison measures what the feature actually produces rather than what
 * someone imagined it would. It carries the distilled line about a heavy memory
 * that §9's third check looks for -- "kenangan berat tentang kehilangan" and
 * nothing about what was lost -- so a reading that reaches past it toward an
 * incident has gone somewhere the block never took it.
 */
const LOTUS_BLOCK_FIXTURE = {
  nickname: 'Rani',
  summary:
    'Ada satu masa awal mandiri yang membekas sebagai titik terang, saat segala ' +
    'sesuatu terasa segar dan penuh kemungkinan. Ia juga menyimpan satu kenangan ' +
    'berat tentang kehilangan yang datang mendadak, suatu bayangan lama yang masih ' +
    'berdiam diam-diam. Orang yang paling dicintai adalah ibunya, sosok yang menjadi ' +
    'pusat dari rasa aman dan kehangatan dalam hidupnya. Ia lebih sering menyendiri, ' +
    'dengan dunia batin yang tenang dan terjaga.',
};

function renderLotusBlockFixture(): string {
  return `<penanya>\nNama panggilan: ${LOTUS_BLOCK_FIXTURE.nickname}\nLatar: ${LOTUS_BLOCK_FIXTURE.summary}\n</penanya>`;
}

/**
 * Nine fixed hands, one per (reader, service) pair.
 *
 * Derived from the pair's index rather than from a PRNG, so `--all` and
 * `--all --lotus` draw identically with no seed to pass and no state to carry
 * between two separate process runs. Spread across the deck and alternating
 * orientation so the nine are not all upright and not all from the same third of
 * the Fool's Journey.
 */
function fixedPicks(pairIndex: number, count: number): Array<{ id: number; reversed: boolean }> {
  const picks: Array<{ id: number; reversed: boolean }> = [];
  for (let i = 0; i < count; i += 1) {
    // 7 is coprime with 22, so successive pairs walk the whole deck without
    // repeating within a hand.
    const id = (pairIndex * 7 + i * 5) % 22;
    picks.push({ id, reversed: (pairIndex + i) % 3 === 0 });
  }
  return picks;
}

/**
 * The fixture answer set for `--lotus`.
 *
 * Chosen to exercise every guard at once rather than to be typical:
 *
 *   - `most_loved` carries a PROPER NAME ("Sari"), so a block that copies it is
 *     caught by the name check rather than by luck.
 *   - `worst_thing` carries something genuinely heavy, because "abstract, never
 *     restate" is only tested by material worth restating.
 *   - `best_thing` is long enough to produce a six-word run if the model quotes.
 *   - `willow_wish` is skipped, so the `(dilewati)` path is in the prompt.
 */
const LOTUS_FIXTURE = {
  birthYear: 1994,
  answers: [
    {
      key: 'best_thing' as const,
      text: 'tahun pertama kerja di kota lain, waktu semuanya masih serba baru dan aku belum kenal siapa-siapa',
      choice: null,
      skipped: false,
    },
    {
      key: 'worst_thing' as const,
      text: 'waktu SMA aku lihat tetangga sebelah rumah dibawa pergi pakai ambulans dan tidak pernah pulang lagi, ibunya menjerit di depan pagar sampai pagi',
      choice: null,
      skipped: false,
    },
    { key: 'most_loved' as const, text: 'ibu saya, namanya Sari', choice: null, skipped: false },
    { key: 'introversion' as const, text: null, choice: '30', skipped: false },
    { key: 'color' as const, text: null, choice: 'black', skipped: false },
    { key: 'willow_wish' as const, text: null, choice: null, skipped: true },
  ],
};

async function runLotus() {
  const { buildLotusPrompt, parseLotusResponse, fallbackLotus, lotusSafetyCheck, renderLotusBlock } =
    await import('@/lib/prompt/lotus');

  const prompt = buildLotusPrompt(LOTUS_FIXTURE);

  process.stdout.write(`\n${'#'.repeat(70)}\nUSER TURN SENT TO THE DISTILLER\n${'#'.repeat(70)}\n`);
  process.stdout.write(`${prompt.user}\n`);

  const raw = await run('lotus distillation', prompt.system, prompt.user, prompt.maxTokens);

  const rawAnswers = LOTUS_FIXTURE.answers
    .map((a) => a.text)
    .filter((t): t is string => typeof t === 'string');

  process.stdout.write(`\n${'#'.repeat(70)}\nPARSED\n${'#'.repeat(70)}\n`);

  let parsed;
  try {
    parsed = parseLotusResponse(raw, LOTUS_FIXTURE);
  } catch (err) {
    process.stdout.write(`UNPARSEABLE: ${err instanceof Error ? err.message : String(err)}\n`);
    process.stdout.write('falling back to the deterministic template:\n');
    parsed = fallbackLotus(LOTUS_FIXTURE);
  }

  const idWords = parsed.summaryId.trim().split(/\s+/).length;
  const enWords = parsed.summaryEn.trim().split(/\s+/).length;
  process.stdout.write(`summary_id (${idWords} words, ${parsed.summaryId.length} chars):\n`);
  process.stdout.write(`  ${parsed.summaryId}\n\n`);
  process.stdout.write(`summary_en (${enWords} words, ${parsed.summaryEn.length} chars):\n`);
  process.stdout.write(`  ${parsed.summaryEn}\n\n`);
  process.stdout.write(`traits: ${JSON.stringify(parsed.traits)}\n`);

  process.stdout.write(`\n${'#'.repeat(70)}\nSAFETY CHECK\n${'#'.repeat(70)}\n`);
  const verdict = lotusSafetyCheck({ id: parsed.summaryId, en: parsed.summaryEn }, rawAnswers);
  process.stdout.write(
    verdict.ok ? 'ACCEPTED\n' : `REJECTED -- reason: ${verdict.reason} (the template is stored)\n`,
  );

  process.stdout.write(`\n${'#'.repeat(70)}\nRENDERED INTO A READING\n${'#'.repeat(70)}\n`);
  const block = renderLotusBlock({
    nickname: 'Rani',
    summary: verdict.ok ? parsed.summaryId : fallbackLotus(LOTUS_FIXTURE).summaryId,
  });
  process.stdout.write(`${block}\n[${block.length} chars, cap 600]\n`);

  process.stdout.write(
    '\nThree questions to ask, and only the third needs a person:\n' +
      `  1. is summary_id ${45}-${75} words?  (${idWords} above)\n` +
      '  2. does it describe a SHAPE rather than an incident?\n' +
      '  3. would you be comfortable if the person who wrote those answers read it?\n' +
      'If the answer to the third is no, the CONTRACT needs another rule -- not the code.\n',
  );
}

/**
 * The constraints that can be checked by machine.
 *
 * Prose quality is not among them, deliberately -- see the note printed above.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function check(text: string, reader: string, service: string, picks: any[], deps: any): string[] {
  const problems: string[] = [];
  const { CARDS, effectiveYesNo, VERDICT_WORD } = deps;

  if (/\*\*|(?:^|\s)\*\w|^#{1,6}\s|^\s*[-•]\s|^\s*\d+\.\s/m.test(text)) {
    problems.push('markdown found');
  }
  if (/\p{Extended_Pictographic}/u.test(text)) problems.push('emoji found');

  /*
   * Malay leaking in where Indonesian belongs. The plan listed four words;
   * "tempoh" got through on the first run, so the net is wider now. These are
   * all Malay-only -- words that exist in both languages are deliberately
   * absent, since flagging those would be noise.
   */
  if (deps.locale === 'id') {
    for (const word of [
      'kerjaya', 'hala tuju', 'sembang', 'awak',
      'tempoh', 'kerana', 'iaitu', 'ianya', 'manakala', 'seronok', 'kelmarin',
    ]) {
      if (new RegExp(`\\b${word}\\b`, 'i').test(text)) problems.push(`Malay word "${word}"`);
    }
  }

  // Greeting or self-introduction in the opening.
  const opening = text.slice(0, 90);
  const greeting =
    deps.locale === 'id'
      ? /\b(halo|hai|selamat (pagi|siang|sore|malam)|salam)\b/i
      : /\b(hello|hi|hey|greetings|welcome|good (morning|afternoon|evening)|dear one|beloved|dear seeker)\b/i;
  if (greeting.test(opening)) {
    problems.push(`greeting in opening: "${opening.split('\n')[0].slice(0, 50)}"`);
  }
  if (new RegExp(`^\\s*${reader}\\b`, 'i').test(text)) problems.push('opens with own name');

  // Card names must survive verbatim, in English.
  for (const p of picks) {
    const name = CARDS[p.id].name;
    if (!text.includes(name)) problems.push(`card name missing or translated: "${name}"`);
  }

  /*
   * Therapy / medical / legal / financial instruction.
   *
   * THE ENGLISH LIST IS LONGER, NOT A TRANSLATION. English tarot and wellness
   * writing is saturated with this vocabulary in a way Indonesian is not, so the
   * net has to be wider on that side. `anxiety` is deliberately ABSENT: "that
   * low-grade anxiety before you send the text" is legitimate in Adrian's voice and
   * the rule is against DIAGNOSIS -- `anxiety disorder`, `clinical` and `diagnosed`
   * are the ones that are not.
   */
  const forbidden =
    deps.locale === 'id'
      ? ['trauma', 'terapi', 'terapis', 'diagnosis', 'menyembuhkan', 'penyembuhan',
         'inner child', 'kesehatan mental', 'depresi', 'obat', 'dokter']
      : ['trauma', 'therapy', 'therapist', 'diagnose', 'diagnosis', 'diagnosed',
         'clinical', 'healing', 'heal', 'inner child', 'mental health',
         'anxiety disorder', 'depression', 'medication', 'shadow work',
         'nervous system', 'hold space', 'regulate', 'dysregulated'];
  for (const word of forbidden) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) problems.push(`forbidden topic "${word}"`);
  }

  /*
   * GENERIC-MYSTIC TICS, `en` only. The English analogue of the Malay grep, and the
   * biggest single threat to persona separation: these are the average tarot voice
   * in any training set, and all three readers drift toward them together.
   */
  if (deps.locale === 'en') {
    for (const tic of [
      'dear one', 'beloved', 'sweet soul', 'the Universe', 'divine feminine',
      'energetically', 'vibration', 'manifest', 'abundance', "soul's journey",
    ]) {
      if (new RegExp(`\\b${tic.replace(/'/g, "['\u2019]")}\\b`, 'i').test(text)) {
        problems.push(`generic-mystic tic "${tic}"`);
      }
    }
    // The closing offer. Reflexive in English assistant prose; would otherwise
    // appear in all nine.
    const offer = /\b(let me know|feel free to|if you'?d like|happy to|i hope this helps)\b/i;
    if (offer.test(text)) problems.push('closing offer of further help');
  }

  // Each paragraph of a spread must open with the reader's own framing. This
  // is what makes Margaret's "Yang telah berlalu" differ from Adrian's "Yang
  // udah lewat"; two of three readers ignored it on the first run.
  if (service === 'spread3') {
    for (const label of deps.framing as string[]) {
      if (!text.includes(label)) problems.push(`position framing missing: "${label}"`);
    }

    /*
     * PER-PARAGRAPH WORD COUNT -- the guard on W5 §6's dilution risk.
     *
     * The 40-words-per-paragraph ceiling is a rule the model must hold WHILE
     * WRITING, and W5 pushes the context roughly 28% longer with the Lotus
     * block and the <riwayat> block. That makes the ceiling easier to lose, and
     * losing it is invisible: the reading still reads fine, it is just back to
     * ~330 words, which is more than anyone reads on a phone. The 1100->650
     * work that fixed it is what this protects.
     *
     * The whole-reading total is printed rather than asserted, because 128-169
     * is where three readers landed once and is a shape to watch rather than a
     * contract.
     */
    const paras = text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
    const counts = paras.map((x) => x.split(/\s+/).filter(Boolean).length);
    for (const [i, n] of counts.entries()) {
      if (n > 40) problems.push(`paragraph ${i + 1} is ${n} words, ceiling is 40`);
    }
    const total = counts.reduce((a, b) => a + b, 0);
    process.stdout.write(
      `[words] ${reader}/${service}: ${counts.join(' + ')} = ${total}` +
        `${total < 128 || total > 169 ? '  <- outside the 128-169 band seen at launch' : ''}\n`,
    );
  }

  // The yes/no verdict must be the code's, and must lead.
  if (service === 'yesno') {
    const expected = VERDICT_WORD[effectiveYesNo({ card: CARDS[picks[0].id], reversed: picks[0].reversed })];
    if (!text.trimStart().startsWith(expected)) {
      problems.push(`verdict should open with "${expected}", got "${text.trimStart().slice(0, 24)}"`);
    }
    for (const other of Object.values(VERDICT_WORD) as string[]) {
      if (other !== expected && new RegExp(`\\b${other}\\b`).test(text)) {
        problems.push(`contradicts itself with "${other}" (verdict was "${expected}")`);
      }
    }
  }

  return problems;
}

/**
 * A synthetic recalled reading that SHARES ITS FIRST CARD with the current draw.
 *
 * The shared card is deliberate and is what makes the run measure anything: the
 * §4.3 gate resolves to 'repeat', the block is offered with an `ULANG` marker,
 * and the question becomes "does the model use it". A fixture with no overlap
 * would be declined by the gate, and the run would report a 0% callback rate
 * that is really a 0% offer rate.
 */
function memoryFixture(picks: Array<{ id: number; reversed: boolean }>): MemoryContext {
  const shared = picks[0].id;
  return {
    recalled: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        localDate: '2026-07-24',
        readerId: 'margaret',
        serviceId: 'spread3',
        cards: [
          { cardId: shared, reversed: !picks[0].reversed },
          { cardId: (shared + 5) % 22, reversed: false },
          { cardId: (shared + 11) % 22, reversed: true },
        ],
        gist: 'tambalan lama sudah tidak menahan apa-apa',
        hadQuestion: true,
      },
    ],
    repeatCardIds: [shared],
    reason: 'repeat',
  };
}

/**
 * `--summary`: one synthetic day, summarized by all three readers in both
 * locales, printed adjacently.
 *
 * THIS IS THE "ARE THEY STILL DISTINGUISHABLE" CHECK applied to the new
 * feature, and it is the reason the per-reader deltas in W5 §5.3 exist. Three
 * readers summarising a day identically would prove the readers are
 * interchangeable -- which is the opposite of what M12 is for, since
 * summarising the WHOLE day regardless of who gave each reading only pays off
 * if the three tellings differ.
 *
 * Printed adjacently, and in both locales, so covering the names is one glance
 * rather than six scrolls.
 */
async function runSummary() {
  const { buildDaySummaryPrompt } = await import('@/lib/prompt/summary');
  const { READERS } = await import('@/data/readers');

  /* One day with a repeated card, so the BERULANG line is exercised -- the
     prompt calls that "the thing most worth naming", so a fixture without one
     would skip the branch the output most depends on. */
  const day = [
    {
      id: '00000000-0000-4000-8000-00000000000a',
      readerId: 'thessaly' as const,
      serviceId: 'daily' as const,
      cards: [{ cardId: 18, reversed: true }],
      gist: 'kabar yang setengah belum layak dipercaya',
      verdict: null,
    },
    {
      id: '00000000-0000-4000-8000-00000000000b',
      readerId: 'margaret' as const,
      serviceId: 'spread3' as const,
      cards: [
        { cardId: 16, reversed: false },
        { cardId: 12, reversed: false },
        { cardId: 17, reversed: false },
      ],
      gist: 'tambalan lama sudah tidak menahan apa-apa',
      verdict: null,
    },
    {
      id: '00000000-0000-4000-8000-00000000000c',
      readerId: 'adrian' as const,
      serviceId: 'yesno' as const,
      cards: [{ cardId: 18, reversed: false }],
      gist: 'yang ditunda ternyata sudah diputuskan diam-diam',
      verdict: 'yes',
    },
  ];

  const malay = [
    'kerjaya', 'hala tuju', 'sembang', 'awak',
    'tempoh', 'kerana', 'iaitu', 'ianya', 'manakala', 'seronok', 'kelmarin',
  ];
  const problems: string[] = [];

  for (const locale of ['id', 'en'] as const) {
    process.stdout.write(
      `\n${'#'.repeat(70)}\nDAY SUMMARY -- ${locale.toUpperCase()}\n${'#'.repeat(70)}\n`,
    );
    for (const r of READERS) {
      const prompt = buildDaySummaryPrompt({
        readerId: r.id,
        locale,
        localDate: '2026-07-26',
        readings: day,
      });
      const { text } = await getProvider().complete(prompt);
      const clean = text.trim();
      const words = clean.split(/\s+/).filter(Boolean).length;

      process.stdout.write(`\n--- ${r.name} (${words} words) ---\n${clean}\n`);

      if (words > 45) problems.push(`${locale}/${r.id}: ${words} words, ceiling is 45`);
      if (/\*\*|^#{1,6}\s/m.test(clean)) problems.push(`${locale}/${r.id}: markdown`);
      if (/\p{Extended_Pictographic}/u.test(clean)) problems.push(`${locale}/${r.id}: emoji`);
      /* The Malay grep runs on the INDONESIAN half only (roadmap §1), and it
         now covers summaries too: they are generated text and can go Malay
         just as easily as a reading can. */
      if (locale === 'id') {
        for (const w of malay) {
          if (new RegExp(`\\b${w}\\b`, 'i').test(clean)) {
            problems.push(`${locale}/${r.id}: Malay word "${w}"`);
          }
        }
      }
    }
  }

  process.stdout.write(`\n${'#'.repeat(70)}\nSUMMARY CHECKS\n${'#'.repeat(70)}\n`);
  if (problems.length === 0) process.stdout.write('all clean\n');
  else for (const p of problems) process.stdout.write(`FAIL  ${p}\n`);

  process.stdout.write(
    '\nCOVER THE NAMES AND READ THE THREE. Can you tell who wrote which?\n' +
      'If not, the per-reader deltas in W5 §5.3 are too thin -- fix those\n' +
      'paragraphs, not the code. Same rule as readers.ts.\n',
  );
}

/**
 * `--frequency`: five verdicts over five different card pairs.
 *
 * THE ONLY WAY TO FIND OUT WHETHER THE ANGLE ROTATION BITES. The unit tests
 * prove the INDEX varies with the fingerprint; they cannot prove the resulting
 * sentences read differently, and "reads identically the fourth time you see
 * it" is the exact failure M5 exists to prevent. Five pairs, five fingerprints,
 * five angles printed beside their lines.
 *
 * The angle is printed with each line so a repetitive set can be diagnosed --
 * five identical-sounding lines under five DIFFERENT angles is a prompt problem,
 * and under the same angle is a fingerprint problem.
 */
async function runFrequency() {
  const { buildFrequencyPrompt, angleIndexFor, FREQUENCY_ANGLES } =
    await import('@/lib/prompt/summary');
  const { fingerprintOf, rankCounts } = await import('@/lib/memory/frequency');
  const { CARDS } = await import('@/data/deck');

  /* Five plausible pairs with plausible counts, chosen to span the deck rather
     than to flatter the prompt. */
  const pairs: Array<[number, number, number, number, number]> = [
    // topId, topCount, secondId, secondCount, readings
    [8, 5, 12, 3, 7],
    [18, 4, 16, 3, 6],
    [0, 6, 21, 4, 9],
    [13, 3, 3, 2, 5],
    [17, 7, 9, 5, 12],
  ];

  const lines: string[] = [];
  const problems: string[] = [];

  for (const [topId, topN, secondId, secondN, readings] of pairs) {
    const ranked = rankCounts([
      { cardId: topId, count: topN, reversedCount: Math.floor(topN / 2), lastSeen: '2026-07-25' },
      { cardId: secondId, count: secondN, reversedCount: 0, lastSeen: '2026-07-24' },
    ]);
    const result = {
      window: 'week' as const,
      from: '2026-07-20',
      to: '2026-07-26',
      readings,
      ranked,
      fingerprint: fingerprintOf('week', readings, ranked),
    };

    const prompt = buildFrequencyPrompt({ result, locale: 'id' });
    const { text } = await getProvider().complete(prompt);
    const clean = text.replace(/\s+/g, ' ').trim();
    const angle = angleIndexFor(result.fingerprint, 'id');
    const words = clean.split(/\s+/).filter(Boolean).length;

    lines.push(clean);
    process.stdout.write(
      `\n[angle ${angle}] ${CARDS[topId].name} (${topN}) over ${CARDS[secondId].name} (${secondN}), ` +
        `${words} words\n  ${clean}\n`,
    );

    if (words > 25) problems.push(`${CARDS[topId].name}: ${words} words, ceiling is 25`);
    if (!clean.includes(CARDS[topId].name)) problems.push(`${CARDS[topId].name}: top card not named`);
    if (!clean.includes(CARDS[secondId].name)) {
      problems.push(`${CARDS[topId].name}: second card not named`);
    }
    if (/\*\*|\p{Extended_Pictographic}/u.test(clean)) problems.push(`${CARDS[topId].name}: markdown or emoji`);
  }

  process.stdout.write(`\n${'#'.repeat(70)}\nFREQUENCY CHECKS\n${'#'.repeat(70)}\n`);
  process.stdout.write(`angles used: ${new Set(pairs.map((_, i) => i)).size} pairs, ` +
    `${new Set(lines).size} distinct lines\n`);
  if (problems.length === 0) process.stdout.write('all clean\n');
  else for (const pr of problems) process.stdout.write(`FAIL  ${pr}\n`);

  process.stdout.write(
    '\nRead the five as a set. Do they read DIFFERENTLY, or is it one sentence\n' +
      'with the nouns swapped? Five similar lines under five different angles is\n' +
      'a prompt problem; under one angle it is a fingerprint problem. Available\n' +
      `angles: ${FREQUENCY_ANGLES.id.length}.\n`,
  );
}

main().catch((err) => {
  console.error('\nsmoke failed:', err);
  process.exit(1);
});
