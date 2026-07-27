/**
 * Stream one completion from the configured provider to stdout.
 *
 *   npm run smoke                      one call: is the key/baseURL/model right?
 *   npm run smoke -- --all             EIGHTEEN readings: both locales x 3 x 3
 *   npm run smoke -- --all --locale en NINE, one locale, for iterating
 *   npm run smoke -- --all --fixed     same hands, so two runs can be diffed
 *   npm run smoke -- --frequency       TWELVE verdicts: 6 card pairs x 2 locales
 *   npm run smoke -- --summary         SIX summaries: 3 readers x 2 locales
 *   npm run smoke -- --frequency --locale id   half of either, for iterating
 *
 * The cheapest possible confirmation that LLM_API_KEY, LLM_BASE_URL and
 * LLM_MODEL are all correct, isolated from every UI question. Run it before
 * blaming the app. `--reader`/`--service` print real readings.
 *
 * `--all` IS EIGHTEEN NOW, NOT NINE (W6). The whole risk the i18n workstream carries
 * is that one locale is quietly worse than the other, and a default that exercised
 * only one half would hide precisely that. What is `id`-only: the eleven-word Malay
 * grep. What is `en`-only: a generic-mystic tic list, a closing-offer check, a longer
 * therapy list, and the contraction-rate proxy -- which cannot exist in Indonesian,
 * and is a small piece of evidence that forking the prompt layer rather than
 * translating it was right.
 *
 * WHAT IS ASSERTED vs WHAT IS PRINTED. FAILs are mechanical and unambiguous: markdown,
 * emoji, a mangled card name, a greeting, a forbidden word, a paragraph over its
 * ceiling, a verdict that does not open the reading, a reader using their own
 * forbidden vocabulary, Margaret's sentences collapsing toward Thessaly's. WARNs are
 * for a human, and there is exactly one: the English self-contradiction check, because
 * `no reason` and `there is no` make a bare `No` ungreppable. Everything else --
 * per-paragraph word counts, reader overlap, mean sentence length, contraction rate --
 * PRINTS EVERY RUN, because three runs are supposed to give a distribution to
 * calibrate against rather than a boolean. That is how the 40-vs-55 ceiling question
 * got answered.
 *
 * AND IT ENDS WITH A BLIND READ. Three readings per locale, names covered, shuffled,
 * key after forty blank lines. It replaces a paragraph that asked the operator to
 * cover the names themselves, which nobody ever did.
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
import { CARDS, effectiveYesNo } from '@/data/deck';
import type { ReaderId, ServiceId, YesNo } from '@/data/types';
import { getProvider } from '@/lib/llm';
import { resolveBaseUrl } from '@/lib/llm/openai';
import { isLocale, LOCALES, type Locale } from '@/lib/i18n/locale';
import { budgetFor, type LengthBudget } from '@/lib/prompt/budget';
import type { MemoryContext } from '@/lib/prompt/memory';

/*
 * STATIC IMPORTS ARE SAFE FOR THESE FOUR AND NOT FOR THE REST.
 *
 * `main()` imports most modules dynamically because `loadEnv()` has to run before
 * anything reads `process.env` at module scope -- `memory.ts` reads
 * `MEMORY_CHAIN_COUNT`, `summary.ts` reads `SUMMARY_MIN_AGE_SECONDS`. `@/data/deck`
 * and `@/lib/prompt/budget` read no environment at all (checked, not assumed), so
 * they can be imported normally, and `check()` can then reach them directly instead of
 * being handed them through a `deps` bag. That bag is what hid the `VERDICT_WORD`
 * reshape; the fewer things travelling through it, the better.
 */

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
      `baseURL=${resolveBaseUrl()}`,
  );

  const reader = arg('reader');
  const service = arg('service');

  /*
   * W6. `--locale id|en` narrows; ABSENT MEANS BOTH under `--all`.
   *
   * So `npm run smoke -- --all` is EIGHTEEN readings now, not nine, and that is the
   * default on purpose: the whole risk this workstream carries is that one locale is
   * quietly worse than the other, and a default that only exercised one half would
   * hide exactly that. `--locale en` is for iterating on one side.
   *
   * VALIDATED RATHER THAN CAST. A typo would otherwise reach `buildPrompt`, index a
   * `Record<Locale, ...>` with a miss, and hand the model `undefined` as its entire
   * contract -- which does not throw and comes back as a fluent reading generated
   * with no rules at all. The single worst failure mode in the fork, and one check
   * makes it impossible.
   */
  const localeArg = arg('locale');
  if (localeArg !== undefined && !isLocale(localeArg)) {
    console.error(`--locale must be one of ${LOCALES.join(', ')}, got "${localeArg}"`);
    process.exit(1);
  }

  const all = process.argv.includes('--all');
  const locales: Locale[] = localeArg ? [localeArg] : all ? [...LOCALES] : ['id'];

  /*
   * THE SIDE RUNNERS DEFAULT TO BOTH LOCALES, WHERE A BARE READING RUN DEFAULTS
   * TO `id` (V3 Task 13).
   *
   * `--summary` already looped both and `--frequency` HARDCODED `'id'`, which was
   * a gap against VD2's "in both locales": the anti-tally work is checked in the
   * language nobody was checking. Neither of these is nine model calls, so
   * running both halves by default costs little and hiding half the risk costs a
   * lot. `--locale en` narrows either, the same flag `--all` already takes.
   */
  const sideLocales: Locale[] = localeArg ? [localeArg] : [...LOCALES];
  const lotus = process.argv.includes('--lotus');
  const memory = process.argv.includes('--memory');
  const summary = process.argv.includes('--summary');
  const gist = process.argv.includes('--gist');
  const frequency = process.argv.includes('--frequency');
  const translate = process.argv.includes('--translate');
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
    await runSummary(sideLocales);
    if (!all) return;
  }

  /* `--frequency` is its own run too: five verdicts over five different card
     pairs, which is the only way to find out whether the angle rotation
     actually bites or whether the line reads the same every time. */
  if (frequency) {
    await runFrequency(sideLocales);
    if (!all) return;
  }

  /* `--translate` is its own run: six real translations over three fixed hands,
     both directions, with the voice proxies applied to the OUTPUT rather than to
     native generation. It composes with `--all` like the two above. */
  if (translate) {
    await runTranslate();
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
  const { shuffleDeck } = await import('@/data/deck');
  const { detectCallback, fallbackGist, gistPrompt, gistUserTurn, sanitizeGist } =
    await import('@/lib/prompt/memory');

  /**
   * The pair list, per locale.
   *
   * `pairIndex` is the position within ONE locale, not within the flattened list, so
   * `--fixed` deals the SAME nine hands to `id` and to `en`. Two locales that drew
   * different cards cannot be compared, and comparing them is the entire reason
   * `--all` runs both.
   */
  const readerServicePairs =
    reader && service
      ? [[reader, service] as const]
      : READERS.flatMap((r) => SERVICES.map((s) => [r.id, s.id] as const));

  const runs = locales.flatMap((l) =>
    readerServicePairs.map(([r, s], i) => ({ locale: l, r, s, pairIndex: i })),
  );

  const failures: string[] = [];
  /*
   * WARNINGS ARE NOT FAILURES AND THE SPLIT IS DELIBERATE (Step 3). The English
   * self-contradiction check cannot be a FAIL -- `no reason`, `there is no`, `no one`
   * are ordinary prose and a bare `No` collides with all three -- so it is reported
   * for a human to judge. Shipping it as a FAIL would teach people to ignore the FAIL
   * line, which is the one thing this script has.
   */
  const warnings: string[] = [];
  /**
   * THE THREE VOICE PROXIES, IN THEIR OWN ARRAY, AND THAT IS A BUG FIX.
   *
   * They used to push into `failures`, which is printed and counted ~120 lines
   * ABOVE where they run -- so their verdicts landed in an array nobody read
   * again, nothing set an exit code, and every run exited 0. **CLAUDE.md says
   * these "FAIL loudly"; they printed their measurements and could not fail.**
   *
   * Nobody noticed because every model tried until 2026-07-27 passed the
   * sentence-length ratio anyway. `gpt-5.4-nano` is the first configuration to
   * genuinely trip it -- Margaret at 1.05x Thessaly against a 1.5x rule, which is
   * the three readers collapsing into one -- and the script reported nothing at
   * all. Found by doing the arithmetic by hand during a provider evaluation.
   *
   * A separate array rather than a moved print, for the reason `warnings` is
   * separate: these are a property of the READER SET across a whole run, not of
   * any one reading, and folding them into the per-reading count would make one
   * number mean two things.
   */
  const voiceFailures: string[] = [];
  /** `<locale>/<reader>` -> its spread3 text, for the overlap and the voice proxies. */
  const spreads = new Map<string, string>();
  /** Every reading, for the blind print and the per-locale summaries. */
  const bodies: Array<{ locale: Locale; reader: string; service: string; text: string }> = [];

  let offered = 0;
  let used = 0;
  const bySignal = { card: 0, phrase: 0 };
  const gists: Array<{ pair: string; gist: string; fellBack: boolean }> = [];

  for (const { locale, r, s, pairIndex } of runs) {
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
      ? fixedPicks(pairIndex, count)
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
      `${locale}  ${r} / ${s}`,
      prompt.system,
      prompt.user,
      prompt.maxTokens,
      prompt.promptVersion,
    );
    if (s === 'spread3') spreads.set(`${locale}/${r}`, text);
    bodies.push({ locale, reader: r, service: s, text });

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
    for (const problem of check({
      text,
      reader: r as ReaderId,
      service: s as ServiceId,
      picks,
      locale,
      framing,
      verdictWords: VERDICT_WORD[locale],
      budget: budgetFor(locale, s as ServiceId, r as ReaderId),
      warn: (w) => warnings.push(`${locale} ${r}/${s}: ${w}`),
    })) {
      failures.push(`${locale} ${r}/${s}: ${problem}`);
    }
  }

  process.stdout.write(`\n${'#'.repeat(70)}\nMECHANICAL CHECKS\n${'#'.repeat(70)}\n`);
  if (failures.length === 0) {
    process.stdout.write('all clean\n');
  } else {
    for (const f of failures) process.stdout.write(`FAIL  ${f}\n`);
    process.stdout.write(`\n${failures.length} violation(s)\n`);
  }
  /*
   * WARNINGS PRINT AFTER THE FAILURES AND ARE NOT COUNTED WITH THEM. The English
   * self-contradiction check lives here because grepping English for "No" cannot be a
   * FAIL without being noise -- see `check()`. A separate heading is what stops the
   * two being read as one number.
   */
  if (warnings.length > 0) {
    process.stdout.write(`\n-- WARN (for a human to judge, not failures) --\n`);
    for (const w of warnings) process.stdout.write(`WARN  ${w}\n`);
  }

  /*
   * `>= 3`, NOT `=== 3`. It was an exact equality and W6's doubling silently switched
   * the whole overlap report off: `--all` now yields SIX spread3 texts (three readers x
   * two locales), so `=== 3` was false and the block never ran. Nothing failed, nothing
   * logged, the section simply was not there -- found by grepping the output for a
   * heading that should have been printed. An exact-length guard on a collection whose
   * size is a function of configuration is a bug waiting for the configuration to
   * change.
   */
  if (spreads.size >= 3) {
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
        // Only compare readers WITHIN one locale. An id-vs-en overlap number is
        // meaningless -- two different languages share almost no content words, so it
        // would sit near zero and drag the mean down while saying nothing.
        if (texts[i][0].split('/')[0] !== texts[j][0].split('/')[0]) continue;
        pairsOf.push([texts[i][0], texts[j][0], jaccard(texts[i][1], texts[j][1])]);
      }
    }
    if (pairsOf.length > 0) {
      process.stdout.write(`\nreader overlap, spread3 (${lotus ? 'WITH lotus' : 'plain'}):\n`);
      for (const [a, b, v] of pairsOf) {
        process.stdout.write(`  ${a} vs ${b}: ${v.toFixed(3)}\n`);
      }
      for (const loc of locales) {
        const inLoc = pairsOf.filter(([a]) => a.startsWith(`${loc}/`));
        if (inLoc.length === 0) continue;
        const mean = inLoc.reduce((sum, [, , v]) => sum + v, 0) / inLoc.length;
        process.stdout.write(`  mean (${loc}): ${mean.toFixed(3)}\n`);
      }
      process.stdout.write(
        '  For reference: 0.056 before the Lotus block landed, 0.074 after; 0.050 ->\n' +
          '  0.063 for the memory block. A JUMP is the signal, not the absolute value.\n',
      );
    }
  }

  /*
   * ================= THE THREE VOICE PROXIES (Step 5) =====================
   *
   * A grep cannot judge voice. These three are not the judgement -- they are the thing
   * that fails loudly while the human is asleep, and each one measures an axis the
   * personas were written to differ on.
   */
  if (spreads.size >= 3) {
    process.stdout.write(`\n${'#'.repeat(70)}\nVOICE PROXIES\n${'#'.repeat(70)}\n`);

    for (const loc of locales) {
      const forLocale = READERS.map((r) => ({
        reader: r.id as ReaderId,
        texts: bodies.filter((b) => b.locale === loc && b.reader === r.id).map((b) => b.text),
      })).filter((x) => x.texts.length > 0);
      if (forLocale.length < 3) continue;

      process.stdout.write(`\n-- ${loc} --\n`);

      /*
       * 1. FORBIDDEN-VOCABULARY CROSSOVER. A hard FAIL, and the strongest signal here:
       *    each list was written precisely to hold that reader apart from the other
       *    two, so a hit is not a stylistic slip -- it is that reader being written by
       *    the average tarot voice.
       */
      for (const { reader, texts } of forLocale) {
        const joined = texts.join('\n').toLowerCase();
        for (const word of CROSSOVER[loc][reader]) {
          const hit =
            word === '!' ? joined.includes('!') : new RegExp(`\\b${word}\\b`, 'i').test(joined);
          if (hit) voiceFailures.push(`${loc} ${reader}: uses own forbidden word "${word}"`);
        }
      }

      /*
       * 2. MEAN SENTENCE LENGTH. A hard FAIL on the RATIO, not on the absolute
       *    numbers: the personas differ most on exactly this axis -- Thessaly short
       *    declaratives, Margaret long subordinated sentences, Adrian in between -- so
       *    if the ratio collapses, the voices collapsed. All three print every run,
       *    because the trend is the early warning and it needs no human.
       */
      const mean: Partial<Record<ReaderId, number>> = {};
      for (const { reader, texts } of forLocale) {
        mean[reader] = meanSentenceWords(texts.join('\n'));
        process.stdout.write(`  mean sentence words  ${reader.padEnd(9)} ${mean[reader]!.toFixed(1)}\n`);
      }
      const m = mean.margaret ?? 0;
      const t = mean.thessaly ?? 0;
      if (t > 0 && m < t * 1.5) {
        voiceFailures.push(
          `${loc}: Margaret's sentences (${m.toFixed(1)}) are not 1.5x Thessaly's ` +
            `(${t.toFixed(1)}) -- the voices are converging`,
        );
      }

      /*
       * 3. CONTRACTION RATE, `en` ONLY. THIS CHECK CANNOT EXIST IN INDONESIAN, which is
       *    a small piece of evidence that forking the prompt layer rather than
       *    translating it was the right call: Adrian's English voice is defined partly
       *    by contractions and Margaret's forbids them outright, and no Indonesian rule
       *    can express either.
       */
      if (loc === 'en') {
        const rate: Partial<Record<ReaderId, number>> = {};
        for (const { reader, texts } of forLocale) {
          rate[reader] = contractionRate(texts.join('\n'));
          process.stdout.write(`  contractions/100w    ${reader.padEnd(9)} ${rate[reader]!.toFixed(2)}\n`);
        }
        if ((rate.adrian ?? 0) === 0) {
          voiceFailures.push(
            'en adrian: zero contractions -- his voice rules ask for them throughout',
          );
        }
        if ((rate.margaret ?? 0) > 0) {
          voiceFailures.push(
            `en margaret: ${rate.margaret!.toFixed(2)} contractions/100w -- her rules forbid them`,
          );
        }
      }
    }

    /*
     * THE VERDICT, INSIDE THIS BLOCK AND AT THE END OF IT, for two reasons that
     * each cost a wrong first attempt.
     *
     * It is HERE rather than 120 lines up in MECHANICAL CHECKS because this is the
     * first point at which all three proxies have run. That was the bug: the
     * verdicts were pushed into an array printed long before they executed, so the
     * section CLAUDE.md calls "FAIL loudly" was structurally silent. See
     * `voiceFailures`' declaration.
     *
     * And it is INSIDE `if (spreads.size >= 3)` because outside it, a run that
     * never executed the proxies -- `--reader`/`--service`, or any run with fewer
     * than three spread3 texts -- would print "all clean" and mean nothing by it.
     * A green line for a check that did not happen is worse than no line.
     */
    process.stdout.write('\n-- VERDICT --\n');
    if (voiceFailures.length === 0) {
      process.stdout.write('all clean\n');
    } else {
      for (const f of voiceFailures) process.stdout.write(`FAIL  ${f}\n`);
      process.stdout.write(
        `\n${voiceFailures.length} violation(s). **THIS IS THE READERS CONVERGING**, and\n` +
          'CLAUDE.md is explicit about the fix: the persona paragraphs, not the code.\n',
      );
    }
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
  }

  blindPrint(bodies, locales);

  /*
   * THE EXIT CODE, AND IT IS THE OTHER HALF OF THE BUG FIX.
   *
   * Printing `FAIL` and exiting 0 means every automated caller -- a CI job, a
   * `&&` chain, anyone checking `$?` -- reads a run with violations as a success.
   * The three voice proxies were worse than unreported before this: they were
   * unreported AND unfailable.
   *
   * LAST, after the blind read, on purpose. A non-zero exit here must not
   * suppress any output: the blind read is the part a human is supposed to do,
   * and the whole point of the exercise is that you read the readings even when
   * -- especially when -- something failed.
   *
   * WARNINGS DO NOT COUNT. That is `warnings`' entire reason for existing; see
   * its declaration.
   */
  const total = failures.length + voiceFailures.length;
  if (total > 0) {
    process.stdout.write(
      `\n${'#'.repeat(70)}\n` +
        `${total} violation(s): ${failures.length} mechanical, ` +
        `${voiceFailures.length} voice propert${voiceFailures.length === 1 ? 'y' : 'ies'}. ` +
        `Exiting 1.\n${'#'.repeat(70)}\n`,
    );
    process.exitCode = 1;
  }
}

/**
 * THE HUMAN GATE (Step 5, proxy 4).
 *
 * REPLACES a closing paragraph that asked the operator to cover the names, which in
 * practice nobody ever did -- the names were right there. So the harness covers them:
 * each reader becomes READER A/B/C in a SHUFFLED order, their own name is redacted
 * from the body, and the key sits at the very bottom after forty blank lines so it
 * cannot be read by accident while you are still guessing.
 *
 * ACTUALLY GUESS. If you cannot match three of three, the personas need sharpening --
 * and the fix is the persona paragraphs in `readers.id.ts` / `readers.en.ts`, NEVER the
 * code. That instruction is in CLAUDE.md, in the rewrite plan's risk table and in
 * roadmap §10.
 *
 * `spread3` only. It is the longest of the three and the one with room for a voice to
 * show; a one-paragraph yes/no is too short to attribute and would make the exercise
 * feel unfair enough to skip.
 */
function blindPrint(
  bodies: Array<{ locale: Locale; reader: string; service: string; text: string }>,
  locales: Locale[],
): void {
  const spread = bodies.filter((b) => b.service === 'spread3');
  if (spread.length < 3) return;

  process.stdout.write(`\n${'#'.repeat(70)}\nTHE BLIND READ\n${'#'.repeat(70)}\n`);
  process.stdout.write(
    'Three readings per locale, names covered and shuffled. Guess who wrote which,\n' +
      'THEN scroll to the key at the very bottom. If you cannot get three of three,\n' +
      'fix the persona paragraphs -- not the code.\n',
  );

  const key: string[] = [];
  for (const loc of locales) {
    const forLocale = spread.filter((b) => b.locale === loc);
    if (forLocale.length < 3) continue;

    /*
     * A FIXED SHUFFLE, derived from the locale rather than from `Math.random()`. The
     * point is that the order is not reader order; it does not need to be
     * unpredictable, and a deterministic one means two runs of the script can be
     * diffed against each other.
     */
    const order = loc === 'id' ? [1, 2, 0] : [2, 0, 1];
    process.stdout.write(`\n===== ${loc} =====\n`);
    order.forEach((idx, position) => {
      const b = forLocale[idx];
      if (!b) return;
      const label = String.fromCharCode(65 + position);
      // Redact the reader's own name from the body. The base contract forbids a
      // self-introduction, but a reading that broke that rule would otherwise hand
      // the answer over -- and a failed rule should not also void the test.
      const redacted = b.text.replace(new RegExp(b.reader, 'gi'), '[REDACTED]');
      process.stdout.write(`\n--- READER ${label} ---\n${redacted}\n`);
      key.push(`${loc}  READER ${label} = ${b.reader}`);
    });
  }

  process.stdout.write('\n'.repeat(40));
  process.stdout.write(`${'-'.repeat(30)}\nTHE KEY\n${'-'.repeat(30)}\n`);
  for (const line of key) process.stdout.write(`${line}\n`);
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
type CheckArgs = {
  text: string;
  reader: ReaderId;
  service: ServiceId;
  picks: Array<{ id: number; reversed: boolean }>;
  locale: Locale;
  framing: string[];
  verdictWords: Record<YesNo, string>;
  budget: LengthBudget;
  /** Advisory findings, for a human to judge. Not failures. See `warnings`. */
  warn: (message: string) => void;
};

/**
 * The mechanical checks. ONE OBJECT, FULLY TYPED.
 *
 * IT USED TO BE `check(text, reader, service, picks, deps: any)` AND THAT `any` COST A
 * REAL BUG. W6 Task 9 reshaped `VERDICT_WORD` from `Record<YesNo, string>` to
 * `Record<Locale, Record<YesNo, string>>`; the call site kept passing the whole thing,
 * `deps.VERDICT_WORD[verdict]` read `undefined`, and the yes/no opener check silently
 * passed on every reading. `npm run typecheck` was green throughout. Same class as the
 * `Layanan: [object Object]` this workstream already paid for, and the same lesson: a
 * boundary typed `any` fails exactly where a reshape happens, which is exactly when
 * you need it.
 *
 * Positional arguments went with it. Five was already too many to read at the call
 * site, and the object makes an added check's dependency visible in one place.
 */
function check(a: CheckArgs): string[] {
  const { text, reader, service, picks, locale, framing, verdictWords, budget } = a;
  const problems: string[] = [];
  const en = locale === 'en';

  if (/\*\*|(?:^|\s)\*\w|^#{1,6}\s|^\s*[-\u2022]\s|^\s*\d+\.\s/m.test(text)) {
    problems.push('markdown found');
  }
  if (/\p{Extended_Pictographic}/u.test(text)) problems.push('emoji found');

  /*
   * Malay leaking in where Indonesian belongs. THE `id` HALF ONLY, now that there are
   * two: `kerana` is not a risk in English, and running the grep there would be
   * theatre that makes the check look more thorough than it is.
   */
  if (!en) {
    for (const word of [
      'kerjaya', 'hala tuju', 'sembang', 'awak',
      'tempoh', 'kerana', 'iaitu', 'ianya', 'manakala', 'seronok', 'kelmarin',
    ]) {
      if (new RegExp(`\\b${word}\\b`, 'i').test(text)) problems.push(`Malay word "${word}"`);
    }
  }

  // Greeting or self-introduction in the opening.
  const opening = text.slice(0, 90);
  const greeting = en
    ? /\b(hello|hi|hey|greetings|welcome|good (morning|afternoon|evening)|dear one|beloved|dear seeker)\b/i
    : /\b(halo|hai|selamat (pagi|siang|sore|malam)|salam)\b/i;
  if (greeting.test(opening)) {
    problems.push(`greeting in opening: "${opening.split('\n')[0].slice(0, 50)}"`);
  }
  if (new RegExp(`\\b${reader}\\b`, 'i').test(opening)) {
    problems.push('reader introduces itself by name in the opening');
  }

  // Card names exactly as given, in English, in both locales.
  for (const pick of picks) {
    const name = CARDS[pick.id].name;
    if (!text.includes(name)) problems.push(`card name missing or altered: "${name}"`);
  }

  /*
   * Therapy / medical / legal / financial instruction.
   *
   * THE ENGLISH LIST IS LONGER, NOT A TRANSLATION. English tarot and wellness writing
   * is saturated with this vocabulary in a way Indonesian is not, so the net has to be
   * wider on that side. `anxiety` is deliberately ABSENT: "that low-grade anxiety
   * before you send the text" is legitimate in Adrian's voice and the rule is against
   * DIAGNOSIS -- `anxiety disorder`, `clinical` and `diagnosed` are the ones that are
   * not.
   */
  for (const word of en
    ? ['trauma', 'therapy', 'therapist', 'diagnose', 'diagnosis', 'diagnosed',
       'clinical', 'healing', 'heal', 'inner child', 'mental health',
       'anxiety disorder', 'depression', 'medication', 'shadow work',
       'nervous system', 'hold space', 'regulate', 'dysregulated']
    : ['trauma', 'terapi', 'terapis', 'diagnosis', 'menyembuhkan', 'penyembuhan',
       'inner child', 'kesehatan mental', 'depresi', 'obat', 'dokter']) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) problems.push(`forbidden topic "${word}"`);
  }

  /*
   * GENERIC-MYSTIC TICS AND THE CLOSING OFFER, `en` only.
   *
   * The English analogue of the Malay grep, and the biggest single threat to persona
   * separation: these are the average tarot voice in any training set, so all three
   * readers drift toward them TOGETHER -- which is the failure the reader-overlap
   * number cannot see, because it rises when they converge on anything.
   */
  if (en) {
    for (const tic of [
      'dear one', 'beloved', 'sweet soul', 'the Universe', 'divine feminine',
      'energetically', 'vibration', 'manifest', 'abundance', "soul's journey",
    ]) {
      if (new RegExp(tic.replace(/'/g, "['\u2019]"), 'i').test(text)) {
        problems.push(`generic-mystic tic "${tic}"`);
      }
    }
    if (/\b(let me know|feel free to|if you'?d like|happy to|i hope this helps)\b/i.test(text)) {
      problems.push('closing offer of further help');
    }
  }

  // Each paragraph of a spread must open with the reader's own framing. This is what
  // makes Margaret's "What has passed" differ from Adrian's "What's done"; two of
  // three readers ignored it on the first Indonesian run.
  if (service === 'spread3') {
    for (const label of framing) {
      if (!text.includes(label)) problems.push(`position framing missing: "${label}"`);
    }
  }

  /*
   * THE PARAGRAPH WORD BUDGET, FOR EVERY SERVICE (Step 4).
   *
   * It used to run for `spread3` only, with `40` typed in beside the prompt's own
   * `40`. It now reads the SAME RESOLVED `LengthBudget` the prompt interpolated --
   * including Margaret's per-reader override -- so the number in the prose and the
   * number asserted here cannot drift, and a reader-specific ceiling cannot be in one
   * and absent from the other.
   *
   * Every count is PRINTED whether it passes or fails, because three runs of
   * `--all` are supposed to give a distribution to calibrate against rather than a
   * boolean. That is how the 40-vs-55 question got answered.
   */
  const paras = text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const counts = paras.map((x) => x.split(/\s+/).filter(Boolean).length);
  for (const [i, n] of counts.entries()) {
    if (n > budget.maxParagraphWords) {
      problems.push(`paragraph ${i + 1} is ${n} words, ceiling is ${budget.maxParagraphWords}`);
    }
  }
  const total = counts.reduce((x, y) => x + y, 0);
  if (total < budget.minTotalWords || total > budget.maxTotalWords) {
    problems.push(
      `total ${total} words, budget ${budget.minTotalWords}-${budget.maxTotalWords}`,
    );
  }
  process.stdout.write(
    `[words] ${locale} ${reader}/${service}: ${counts.join(' + ')} = ${total} ` +
      `(ceiling ${budget.maxParagraphWords}, band ${budget.minTotalWords}-${budget.maxTotalWords})\n`,
  );

  // The yes/no verdict must be the code's, and must lead.
  if (service === 'yesno') {
    const expected =
      verdictWords[effectiveYesNo({ card: CARDS[picks[0].id], reversed: picks[0].reversed })];
    if (!text.trimStart().startsWith(expected)) {
      problems.push(`verdict should open with "${expected}", got "${text.trimStart().slice(0, 24)}"`);
    }

    /*
     * THE SELF-CONTRADICTION CHECK IS A FAIL IN `id` AND A WARN IN `en` (Step 3), and
     * this is a real limitation of grepping English rather than a shortcut.
     *
     * The Indonesian words -- Ya, Tidak, Belum jelas -- are unambiguous enough that a
     * bare `\b` match means what it looks like. The English ones are not: `No`
     * collides with `no reason`, `there is no`, `no one`, and `Yes` appears inside
     * ordinary reassurance. So `en` matches only SENTENCE-INITIAL occurrences and
     * reports them for a person to read. Saying so beats shipping a check people
     * learn to ignore.
     */
    if (en) {
      const sentenceInitial = /(?:^|[.!?]\s+)(Yes|No|Not yet)\b/g;
      for (const m of text.matchAll(sentenceInitial)) {
        if (m[1] !== expected) {
          const at = m.index ?? 0;
          a.warn(`sentence opens with "${m[1]}" (verdict was "${expected}"): "${text.slice(at, at + 60).replace(/\n/g, ' ')}"`);
        }
      }
    } else {
      for (const other of Object.values(verdictWords)) {
        if (other !== expected && new RegExp(`\\b${other}\\b`).test(text)) {
          problems.push(`contradicts itself with "${other}" (verdict was "${expected}")`);
        }
      }
    }
  }

  return problems;
}

/**
 * Mean words per sentence. One of the three voice proxies (Step 5).
 *
 * Naive sentence splitting on purpose: a real segmenter would be more accurate and
 * would not change the RATIO between three readers, which is the only thing this is
 * used for.
 */
function meanSentenceWords(text: string): number {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((x) => x.trim());
  if (sentences.length === 0) return 0;
  const words = sentences.map((x) => x.split(/\s+/).filter(Boolean).length);
  return words.reduce((a, b) => a + b, 0) / sentences.length;
}

/** Contractions per 100 words. `en` only -- see the proxy report. */
function contractionRate(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  const hits = [...text.matchAll(/\b\w+['\u2019](t|re|ve|ll|m|d|s)\b/g)].length;
  return (hits / words) * 100;
}

/**
 * Each persona's OWN forbidden vocabulary, checked against that persona's OWN output.
 *
 * THE STRONGEST MACHINE SIGNAL AVAILABLE for whether the three are still three,
 * because these lists were written precisely to hold them apart -- CLAUDE.md records
 * that without them all three drift to the same mid-register mystic, "because that is
 * the average tarot voice in any training set".
 *
 * A hard FAIL, unlike the overlap number, which is a trend. Thessaly saying "the
 * universe" is not a small stylistic slip; it is Thessaly being written by the
 * average.
 */
const CROSSOVER: Record<Locale, Record<ReaderId, string[]>> = {
  id: {
    thessaly: ['semesta', 'energi', 'getaran', 'aura', 'takdir', 'perjalanan jiwa'],
    margaret: ['nggak', 'kayak', 'banget', 'oke', 'deh', 'sih'],
    adrian: ['trauma', 'coping', 'attachment', 'trigger', 'red flag'],
  },
  en: {
    thessaly: ['universe', 'energy', 'vibration', 'aura', 'destiny', 'divine', "soul's journey"],
    margaret: ['gonna', 'kinda', 'super', 'totally', 'okay', 'stuff', '!'],
    adrian: ['trauma', 'coping', 'attachment style', 'triggered', 'red flag'],
  },
};

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
        /*
         * The gist's own language (V2), and `'id'` is honest for BOTH halves of
         * `--all`: the fixture's gist below is Indonesian and is deliberately fed to
         * the English readings too, which is what exercises the base contract's
         * "write in ENGLISH even if the text you are reading is written in another
         * language" rule.
         *
         * The field is inert here -- this builds a `MemoryContext` directly, so
         * `recallChain`'s translation substitution never runs -- but a fixture that
         * lied about its own language would be the first thing to mislead whoever
         * next asks whether gist translation is worth keeping (plan open question 4).
         */
        locale: 'id',
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
async function runSummary(locales: Locale[]) {
  const { buildDaySummaryPrompt, summaryMaxWords, echoToday } =
    await import('@/lib/prompt/summary');
  const { dayShadowFor } = await import('@/lib/memory/shadow');
  const { tallyProblems } = await import('@/lib/memory/tally');
  const { MALAY } = await import('@/lib/copy/vocab');
  const { READERS } = await import('@/data/readers');

  /* One day with a repeated card, so the BERGEMA line is exercised -- the
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

  const problems: string[] = [];
  const echoes = echoToday(day);
  const dayShadow = dayShadowFor(day.flatMap((r) => r.cards.map((c) => c.cardId)));

  for (const locale of locales) {
    process.stdout.write(
      `\n${'#'.repeat(70)}\nDAY SUMMARY -- ${locale.toUpperCase()}\n${'#'.repeat(70)}\n` +
        `echo: ${echoes.map((id) => CARDS[id].name).join(', ') || '(none)'}` +
        `   shadow: ${dayShadow?.name ?? '(collides, omitted)'}\n`,
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

      /* THE CEILING IS IMPORTED, NOT TYPED AGAIN. It used to be a literal `45`
         here, which is the fourth-copy-of-a-tuned-number problem `budget.ts`
         exists to prevent, sitting in the file that is supposed to be the check.
         `summaryMaxWords` also applies VD19's Margaret multiplier, so the number
         in the prose and the number asserted here cannot disagree. */
      const ceiling = summaryMaxWords(r.id);
      if (words > ceiling) problems.push(`${locale}/${r.id}: ${words} words, ceiling is ${ceiling}`);
      if (/\*\*|^#{1,6}\s/m.test(clean)) problems.push(`${locale}/${r.id}: markdown`);
      if (/\p{Extended_Pictographic}/u.test(clean)) problems.push(`${locale}/${r.id}: emoji`);

      /* VD2, checked. The day summary passes no window phrase -- it names a day,
         not a window -- so every digit in it was invented. */
      for (const hit of tallyProblems(clean, { locale })) {
        if (hit.tier === 'fail') problems.push(`${locale}/${r.id}: TALLY -- ${hit.pattern}`);
        else process.stdout.write(`      warn  ${locale}/${r.id}: ${hit.pattern}\n`);
      }

      /* The Malay grep runs on the INDONESIAN half only (roadmap §1, W6 rule 4),
         and it now covers summaries too: they are generated text and can go
         Malay just as easily as a reading can. The list comes from
         `@/lib/copy/vocab` rather than a local literal -- V1 created that module
         and V3 owns pointing this script at it. */
      if (locale === 'id') {
        for (const w of MALAY) {
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
      'paragraphs, not the code. Same rule as readers.ts.\n' +
      'AND READ FOR A TALLY BY EYE. The grep is a floor, not a ceiling: it\n' +
      'cannot catch "the cards kept coming back to the same one, and then\n' +
      'again after that".\n',
  );
}

/**
 * `--translate`: SIX REAL TRANSLATIONS, BOTH DIRECTIONS (V2 §9).
 *
 * Three `id -> en` and three `en -> id`, one `spread3` per reader over the SAME THREE
 * FIXED HANDS, so the two directions are comparable with each other and with
 * `--all --fixed`. Every reading is generated live and then translated, and both
 * texts are printed adjacently — which is the only way to see whether the translation
 * is a re-issue in the reader's voice or a rendering of the other language.
 *
 * ── IT ASSERTS THROUGH `verifyTranslation`, NOT THROUGH ITS OWN COPY ──────────
 *
 * The card-name check, the paragraph count, the therapy list, the Malay grep and the
 * `en` tic list are exactly the function production runs before it persists anything.
 * A second implementation here would be a fifth copy of the word lists and a place for
 * the two to disagree about what passes — which is how `tempoh` went missing the first
 * time. What this file adds on top is what a static check cannot do: the two VOICE
 * PROXIES, over translations rather than over native output.
 *
 * **THE MALAY GREP RUNS ON THE `en -> id` OUTPUT AND NOWHERE ELSE**, which is W6's
 * rule 4 applied correctly rather than as theatre — `verifyTranslation` decides that
 * from the TARGET locale, so it happens by construction here.
 *
 * NO DATABASE AND NO ROUTE. It calls `buildTranslationPrompt` and the provider
 * directly, exactly as `--summary` and `--frequency` do.
 */
async function runTranslate() {
  const { buildTranslationPrompt, verifyTranslation } = await import(
    '@/lib/translate/contract'
  );
  const { TRANSLATABLE } = await import('@/lib/translate/keys');
  const { budgetFor } = await import('@/lib/prompt/budget');
  const { READERS } = await import('@/data/readers');
  const { buildPrompt } = await import('@/lib/prompt/build');
  const { serviceById } = await import('@/data/services');

  const spec = TRANSLATABLE['reading.body'];
  const service = serviceById('spread3')!;
  const problems: string[] = [];

  /** Per target locale and reader, for the voice proxies below. */
  const out: Record<'id' | 'en', Partial<Record<string, string>>> = { id: {}, en: {} };

  /*
   * BOTH DIRECTIONS, and `en -> id` is not decoration: Indonesian's affixation makes
   * it 5-15% longer in WORDS than English for the same content, so that direction is
   * the one most likely to overshoot a budget calibrated on native Indonesian. The
   * plan's open question 3 is exactly this, and this run is what answers it.
   */
  for (const [source, target] of [
    ['id', 'en'],
    ['en', 'id'],
  ] as const) {
    process.stdout.write(
      `\n${'#'.repeat(70)}\nTRANSLATION  ${source.toUpperCase()} -> ${target.toUpperCase()}\n${'#'.repeat(70)}\n`,
    );

    for (const [i, r] of READERS.entries()) {
      // The SAME hand for both directions and for `--all --fixed`, so any two runs
      // can be diffed. Two runs that drew different cards are not comparable.
      const picks = fixedPicks(i, 3);

      const native = buildPrompt({ reader: r.id, service: service.id, picks, locale: source });
      const { text: rawSource } = await getProvider().complete({
        system: native.system,
        user: native.user,
        maxTokens: native.maxTokens,
      });
      const src = rawSource.trim();

      const prompt = buildTranslationPrompt({
        source: src,
        sourceLocale: source,
        target,
        spec,
        readerId: r.id,
        serviceId: service.id,
      });
      const { text: rawOut } = await getProvider().complete(prompt);
      const translated = rawOut.trim();

      out[target][r.id] = translated;

      const budget = budgetFor(target, service.id, r.id);
      const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

      process.stdout.write(
        `\n--- ${r.name}: ${source} (${words(src)} words) ---\n${src}\n` +
          `\n--- ${r.name}: ${target} (${words(translated)} words, ceiling ` +
          `${budget.maxParagraphWords}/para, band ${budget.minTotalWords}-${budget.maxTotalWords}) ---\n` +
          `${translated}\n`,
      );

      /*
       * THE SAME FUNCTION THE TRANSLATOR GATES ON. If this passes and production
       * refuses the row, one of the two is wrong and it is not this file.
       */
      for (const v of verifyTranslation({
        source: src,
        output: translated,
        spec,
        target,
        readerId: r.id,
        serviceId: service.id,
      })) {
        problems.push(`${source}->${target}/${r.id}: ${v.kind} (${v.detail})`);
      }

      /*
       * The TOTAL band, which `verifyTranslation` deliberately does not check -- it
       * enforces the per-paragraph ceiling, because that is the one the model can
       * count as it writes and therefore the one worth refusing a row over. A total
       * outside the band is a calibration signal for a person, not a defect.
       *
       * **IF THE FIRST RUN FAILS ON THE BAND THAT IS DATA, NOT A BUG.** Record the
       * numbers and tune once, the way Margaret's 55 was tuned across five runs. Do
       * not widen the band to make the run green.
       */
      const total = words(translated);
      if (total < budget.minTotalWords || total > budget.maxTotalWords) {
        problems.push(
          `${source}->${target}/${r.id}: total ${total} words, band ` +
            `${budget.minTotalWords}-${budget.maxTotalWords}`,
        );
      }
    }
  }

  /*
   * ── THE TWO VOICE PROXIES, OVER TRANSLATIONS ────────────────────────────────
   *
   * Roadmap §9's named risk is *"Margaret translated by a generic prompt comes back
   * as Thessaly with longer words"*, and that risk is INVISIBLE to every check above:
   * a flattened Margaret still reproduces every card name, still hits the paragraph
   * count, still avoids every forbidden word. These two numbers are the only
   * mechanical signal that the three are still three.
   */
  process.stdout.write(`\n${'#'.repeat(70)}\nVOICE PROXIES, OVER THE TRANSLATIONS\n${'#'.repeat(70)}\n`);

  for (const target of ['id', 'en'] as const) {
    const mean: Record<string, number> = {};
    for (const r of READERS) {
      const t = out[target][r.id];
      if (t) mean[r.id] = meanSentenceWords(t);
    }
    process.stdout.write(
      `\n${target}  mean sentence words   ` +
        READERS.map((r) => `${r.id}=${(mean[r.id] ?? 0).toFixed(1)}`).join('  ') +
        `\n`,
    );
    /* Margaret's voice rules mandate long subordinated sentences and Thessaly's
       mandate short declaratives. If a translation flattens that ratio, the fix is
       the persona blocks the translation prompt carries, not the code. */
    if (mean.margaret && mean.thessaly && mean.margaret < mean.thessaly * 1.5) {
      problems.push(
        `${target}: margaret ${mean.margaret.toFixed(1)} vs thessaly ` +
          `${mean.thessaly.toFixed(1)} mean sentence words -- under 1.5x`,
      );
    }

    /* `en` ONLY. Indonesian has no contractions, so the proxy cannot exist there --
       running it would report 0.00 for all three and look like a passing check. */
    if (target === 'en') {
      const rate: Record<string, number> = {};
      for (const r of READERS) {
        const t = out.en[r.id];
        if (t) rate[r.id] = contractionRate(t);
      }
      process.stdout.write(
        `en  contractions/100w    ` +
          READERS.map((r) => `${r.id}=${(rate[r.id] ?? 0).toFixed(2)}`).join('  ') +
          `\n`,
      );
      if (rate.adrian !== undefined && rate.adrian === 0) {
        problems.push('en adrian: zero contractions -- his voice rules ask for them throughout');
      }
      if (rate.margaret !== undefined && rate.margaret > 0) {
        problems.push(
          `en margaret: ${rate.margaret.toFixed(2)} contractions/100w -- her rules forbid them`,
        );
      }
    }
  }

  process.stdout.write(`\n${'#'.repeat(70)}\nTRANSLATION CHECKS\n${'#'.repeat(70)}\n`);
  if (problems.length === 0) process.stdout.write('all clean\n');
  else for (const p of problems) process.stdout.write(`FAIL  ${p}\n`);

  process.stdout.write(
    '\nCOVER THE NAMES AND READ THE THREE TRANSLATIONS. Can you still tell who\n' +
      'wrote which? If not, the fix is the persona blocks the translation prompt\n' +
      'carries -- `readerPrompt(reader, target)` in buildTranslationPrompt -- and\n' +
      'NOT the code. Same rule as readers.ts, and the same rule as --summary.\n',
  );
}

/**
 * `--frequency`: SIX verdicts over six card pairs, in BOTH locales. Twelve calls.
 *
 * THE ONLY WAY TO FIND OUT WHETHER THE ANGLE ROTATION BITES. The unit tests
 * prove the INDEX varies with the fingerprint; they cannot prove the resulting
 * sentences read differently, and "reads identically the fourth time you see
 * it" is the exact failure M5 exists to prevent.
 *
 * The angle, the Shadow Arcana, the dominance bucket and the pulse number print
 * beside every line, so a flat set can be diagnosed rather than merely noticed:
 * twelve similar lines under twelve DIFFERENT angles is a prompt problem, and
 * under one angle it is a fingerprint problem. If they differ only in the nouns,
 * the shadow is carrying the variety and the angles are not.
 *
 * SIX PAIRS AND NOT FIVE. The sixth has The Fool as its runner-up, so the
 * collision branch -- one pair in twenty-two in the wild -- gets a real model
 * call that a person can read. The third pair has The Fool on TOP, so both
 * directions of the branch are exercised.
 *
 * IT LOOPED `id` ONLY BEFORE V3, which was a gap against VD2's "in both
 * locales": the language nobody was checking is the language a tally would have
 * survived in.
 */
async function runFrequency(locales: Locale[]) {
  const { buildFrequencyPrompt, frequencyFacts, FREQUENCY_ANGLES, FREQUENCY_MAX_WORDS } =
    await import('@/lib/prompt/summary');
  const { fingerprintOf, rankCounts } = await import('@/lib/memory/frequency');
  const { tallyProblems } = await import('@/lib/memory/tally');
  const { windowPhrase } = await import('@/lib/memory/windows');
  const { CARDS } = await import('@/data/deck');

  /* Six plausible pairs with plausible counts, chosen to span the deck rather
     than to flatter the prompt. The last one is the collision fixture. */
  const pairs: Array<[number, number, number, number, number]> = [
    // topId, topCount, secondId, secondCount, readings
    [8, 5, 12, 3, 7],
    [18, 4, 16, 3, 6],
    [0, 6, 21, 4, 9],
    [13, 3, 3, 2, 5],
    [17, 7, 9, 5, 12],
    [9, 4, 0, 3, 8],
  ];

  const problems: string[] = [];

  for (const locale of locales) {
    const lines: string[] = [];
    const anglesSeen = new Set<number>();
    process.stdout.write(
      `\n${'#'.repeat(70)}\nFREQUENCY VERDICT -- ${locale.toUpperCase()}\n${'#'.repeat(70)}\n`,
    );

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

      const prompt = buildFrequencyPrompt({ result, locale });
      const facts = frequencyFacts(result, locale);
      if (!prompt || !facts.mechanic) {
        problems.push(`${locale}/${CARDS[topId].name}: no prompt -- the mechanic declined`);
        continue;
      }
      const m = facts.mechanic;

      const { text } = await getProvider().complete(prompt);
      const clean = text.replace(/\s+/g, ' ').trim();
      const words = clean.split(/\s+/).filter(Boolean).length;
      lines.push(clean);
      anglesSeen.add(facts.angle);

      const tag = `${locale}/${m.topName}`;
      process.stdout.write(
        `\n[angle ${facts.angle}] ${m.topName} over ${m.secondName}` +
          `  shadow=${m.shadowName}${m.shadowCollision ? ` (collides: ${m.shadowCollision})` : ''}` +
          `  dominance=${m.dominance}  pulse=${m.pulseNumber}  ${words} words\n  ${clean}\n`,
      );

      /* THE CEILING IS IMPORTED. It was a literal `25` here, in the file that is
         supposed to be the check -- the fourth-copy problem `budget.ts` exists
         to prevent. */
      if (words > FREQUENCY_MAX_WORDS) {
        problems.push(`${tag}: ${words} words, ceiling is ${FREQUENCY_MAX_WORDS}`);
      }
      if (!clean.includes(m.topName)) problems.push(`${tag}: top card not named`);
      if (!clean.includes(m.secondName)) problems.push(`${tag}: second card not named`);
      /* On a collision the prompt asks for TWO names and the third-card line is
         not in the user turn, so demanding the shadow here would fail a correct
         line -- the same class of mistake the window-phrase strip avoids. */
      if (m.shadowCollision === null && !clean.includes(m.shadowName)) {
        problems.push(`${tag}: Shadow Arcana ${m.shadowName} not named`);
      }
      if (/\*\*|\p{Extended_Pictographic}/u.test(clean)) {
        problems.push(`${tag}: markdown or emoji`);
      }

      /* VD2, and the check the release is named after. The window phrase is
         passed because `d666` legitimately carries digits the prompt INSTRUCTS
         the model to say; `week` does not, and passing it costs nothing. */
      for (const hit of tallyProblems(clean, { locale, windowPhrase: windowPhrase('week', locale) })) {
        if (hit.tier === 'fail') problems.push(`${tag}: TALLY -- ${hit.pattern}`);
        else process.stdout.write(`      warn  ${tag}: ${hit.pattern}\n`);
      }
    }

    process.stdout.write(
      `\n${locale}: ${pairs.length} pairs, ${anglesSeen.size} distinct angles, ` +
        `${new Set(lines).size} distinct lines (of ${FREQUENCY_ANGLES[locale].length} available)\n`,
    );
  }

  process.stdout.write(`\n${'#'.repeat(70)}\nFREQUENCY CHECKS\n${'#'.repeat(70)}\n`);
  if (problems.length === 0) process.stdout.write('all clean\n');
  else for (const pr of problems) process.stdout.write(`FAIL  ${pr}\n`);

  process.stdout.write(
    '\nRead the set. Do they read DIFFERENTLY, or is it one sentence with the\n' +
      'nouns swapped? Similar lines under different angles is a prompt problem;\n' +
      'under one angle it is a fingerprint problem.\n' +
      'AND READ FOR A TALLY BY EYE -- the grep is a floor, not a ceiling.\n' +
      'AND CHECK THE PULSE IS SPOKEN, NOT PASTED: the gloss is a written line\n' +
      'and the prompt says "in your own words" twice. If it comes back verbatim,\n' +
      "the fix is V1 shipping a SHORT FORM of the gloss, not a third instruction.\n",
  );
}

main().catch((err) => {
  console.error('\nsmoke failed:', err);
  process.exit(1);
});
