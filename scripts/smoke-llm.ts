/**
 * Stream one completion from the configured provider to stdout.
 *
 *   npm run smoke                      one call: is the key/baseURL/model right?
 *   npm run smoke -- --all             EIGHTEEN readings: both locales x 3 x 3
 *   npm run smoke -- --all --locale en NINE, one locale, for iterating
 *   npm run smoke -- --all --fixed     same hands, so two runs can be diffed
 *   npm run smoke -- --all --choice    EIGHTEEN, all asking a two-option question:
 *                                      did the reader CHOOSE one, and did yesno
 *                                      stay out of it? READ THE MARKERS.
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
import { splitChoiceMarker, validateChoice } from '@/lib/reading/choice';
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
  /**
   * Filled in with the choice marker's candidate, when the reading opened with one.
   *
   * **AN OUT-PARAM RATHER THAN A WIDER RETURN TYPE**, because `run()` has eleven
   * callers -- the nine-reading matrix, the Lotus, the translations, the persona --
   * and only one of them cares. Widening the return to an object would touch every
   * one of them to reach a field that is null in ten.
   */
  out?: { choice: string | null },
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

  /*
   * THE CHOICE MARKER COMES OFF HERE, IN THE ONE FUNCTION EVERY CHECK READS FROM.
   *
   * **WITHOUT THIS, THE WORD BUDGET FAILS ON CORRECT OUTPUT.** `PILIHAN: Ayam` is a
   * paragraph as far as `text.split(/\n\s*\n/)` is concerned, so a reading that
   * obeyed the rule exactly would report an extra two-word paragraph and shift the
   * total -- and `budget.ts` says in its own words that a check failing on correct
   * behaviour is a check people learn to ignore. The Malay grep, the position
   * framing check and the three voice proxies read the same string.
   *
   * The RAW stream is already on the terminal above, marker included, so a human
   * reading a `--choice` run still sees exactly what the model emitted. That is the
   * whole instrument for the FORMAT, which no event in production can measure:
   * a marker the model spells differently enough to miss the matcher renders as
   * prose and reports nothing.
   */
  const split = splitChoiceMarker(text, true);
  if (out) out.choice = split.choice;
  if (split.choice !== null) {
    process.stdout.write(`[choice] marker named "${split.choice}"\n`);
  }
  return split.body;
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
  const persona = process.argv.includes('--persona');
  /*
   * `--chat`: THE RELEASE GATE FOR v0.7.0, AND THE ONLY INSTRUMENT FOR IT.
   *
   * `C-N1f` and roadmap §10.2: *"both halves, neither is a unit test."* Everything
   * about the chat is unit-tested for SHAPE -- the address forms, the fifteen
   * refusals, the pace, the fences -- and **nothing can unit-test whether three
   * readers in a room sound like three people.** So this drives a scripted
   * conversation through the real model, prints it, checks it, and ends on a blind
   * read whose two questions are the acceptance criteria.
   *
   * It composes with `--all` like the other side runners.
   */
  const chat = process.argv.includes('--chat');
  /*
   * `--choice`: THE ONLY INSTRUMENT FOR THE MARKER'S FORMAT.
   *
   * `reading.completed.choice` measures whether the reader named an option the
   * querent never typed. It CANNOT measure a marker the model spelled differently
   * enough to miss `splitChoiceMarker` -- that renders as prose and reports `none`,
   * indistinguishable in production from a question that offered no choice. So the
   * format is checked here, against a question that definitely offers one, by
   * looking at the raw stream and at whether the marker parsed and validated.
   *
   * A CANNED QUESTION PER LOCALE rather than `--question`, so the check is the same
   * two questions every time and a rate across runs means something. It composes
   * with `--all`, so `npm run smoke -- --all --choice` is eighteen readings that
   * should ALL carry a marker -- except the six `yesno` ones, which must carry NONE,
   * because `CHOICE_RULE_*` is deliberately not in that task.
   */
  const choiceRun = process.argv.includes('--choice');
  const CHOICE_QUESTION: Record<Locale, string> = {
    id: 'mending makan ayam atau ikan nanti siang?',
    /* REWRITTEN, NOT TRANSLATED, and the options differ on purpose -- the same
       enforcement `## Localization` rule 3 applies to the worked examples. If a
       future version of this line says chicken and fish, somebody translated it. */
    en: 'should I take the new job offer or stay where I am?',
  };
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

  /*
   * `--persona` is its own run: ONE real persona per locale, printed whole, with
   * the resolved engine facts, the chosen facets, the full contract, the full user
   * turn, the raw output, the safety verdict and the counts against the ceilings.
   *
   * SAME INSTRUCTION AND SAME REASON AS `--lotus`: **read it.** Everything about
   * the persona is unit-tested for shape and nothing can unit-test whether it is
   * any good -- and unlike a reading, this text is written once, stored, and
   * (V7) shareable to a public URL. A smoke run three days later cannot un-share
   * a persona, which is why the vocabulary checks below FAIL rather than warn.
   */
  if (persona) {
    await runPersona(sideLocales);
    if (!all) return;
  }

  if (chat) {
    /*
     * `--chat --director` IS F2's FLAG, AND F3's PLAN NAMES IT AS F2's IN THOSE WORDS.
     *
     * The two halves are separate instruments on purpose. `--chat` alone drives the
     * VOICES against canned beat sheets, because *"chaining a planner call in would
     * make a voice failure indistinguishable from a planning failure"* — `runPersona`'s
     * reason for not chaining the Lotus, one workstream over. This drives the DIRECTOR
     * against a canned transcript, for the mirror-image reason: a sheet judged by the
     * prose that came out of it is a sheet nobody judged.
     *
     * `[F2-19]`: the beat sheet is what §15.4 asks five questions of, and no unit test
     * can answer any of them.
     */
    if (process.argv.includes('--director')) {
      /*
       * `--voices` JOINS THE TWO HALVES, AND IT IS THE RELEASE'S REAL §10.2 GATE.
       *
       * `--chat` cans the sheets and `--chat --director` cans the voices, each so that a
       * failure in one is not read as a failure in the other. **Neither can answer
       * `[F2-2]`** — a beat sheet that reads well and produces three paragraphs that sound
       * alike — because that failure only exists where the two meet. This runs the real
       * director and then the real voices over its beats, in one growing room, with the
       * same fixture context `--chat` uses so the ONLY difference between the two runs is
       * the sheet.
       */
      await runDirector(sideLocales, process.argv.includes('--voices'));
      if (!all) return;
    } else if (process.argv.includes('--proactive')) {
      /*
       * `--chat --proactive` IS F5's HALF OF §10.2's GATE, AND IT IS ITS OWN RUNNER.
       *
       * `--chat` scripts a querent and cans the sheets; this one has **no querent at
       * all.** Six unprompted runs, one per material kind, each starting from a room that
       * went quiet hours ago — the director and the voices both live, because the whole
       * question is whether the material reached the prose, and a canned sheet would
       * answer it for the director instead of asking it.
       *
       * The two questions it ends on are the release's own: *does the opening message
       * have something to be about, and does it sound like somebody thought of you or
       * like a cron job?*
       */
      await runProactive(sideLocales);
      if (!all) return;
    } else {
      await runChat(sideLocales, false);
      if (!all) return;
    }
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

  /** `--choice` only. Its own list, so a clean matrix still reports the format. */
  const choiceProblems: string[] = [];

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
      question: choiceRun ? CHOICE_QUESTION[locale] : arg('question'),
      context:
        lotus || memoryCtx
          ? { lotus: lotus ? LOTUS_BLOCK_FIXTURE : null, memory: memoryCtx }
          : undefined,
    });
    const marker: { choice: string | null } = { choice: null };
    const text = await run(
      `${locale}  ${r} / ${s}`,
      prompt.system,
      prompt.user,
      prompt.maxTokens,
      prompt.promptVersion,
      marker,
    );

    if (choiceRun) {
      const question = CHOICE_QUESTION[locale];
      const valid = validateChoice(marker.choice, question);
      /*
       * `yesno` MUST NOT CARRY A MARKER, and this is the assertion that catches
       * `CHOICE_RULE_*` leaking into the third task. Two answer boxes on one
       * reading disagree -- `Ya` is not an answer to "ayam atau ikan" -- and
       * `ReadingView`'s `else if` hides the symptom, so nothing on screen would
       * show it.
       */
      if (s === 'yesno') {
        if (marker.choice !== null) {
          choiceProblems.push(`${locale} ${r}/yesno emitted a marker: "${marker.choice}"`);
        }
      } else if (marker.choice === null) {
        choiceProblems.push(`${locale} ${r}/${s} named no option`);
      } else if (valid === null) {
        // The reader chose something the querent never offered. This is the
        // production `invalid` case, visible here with the word attached.
        choiceProblems.push(`${locale} ${r}/${s} named "${marker.choice}", not in the question`);
      } else if (!namesChoiceInProse(text, valid)) {
        /*
         * THE PROSE MUST NAME IT TOO. The rule asks for both, because the box is
         * chrome: a querent whose box failed to render must still be able to read the
         * answer. Nothing in production measures this.
         *
         * **MATCHED ON CONTENT WORDS, NOT ON THE PHRASE, AND THE FIRST VERSION WAS AN
         * EXACT `includes()` THAT FAILED CORRECT READINGS.** Measured 2026-07-29: a
         * reading that chose `stay where I am` wrote *"staying where you are"* -- the
         * right answer, in the second person, inflected, and reported as a violation
         * six times out of eighteen. A check that fails on correct output is a check
         * people learn to ignore, which is `budget.ts`'s own rule about ceilings.
         */
        choiceProblems.push(`${locale} ${r}/${s} chose "${valid}" but never says it in the prose`);
      }
      process.stdout.write(
        `[choice] ${locale} ${r}/${s}: ` +
          (s === 'yesno'
            ? marker.choice === null
              ? 'no marker (correct for yesno)'
              : `LEAKED "${marker.choice}"`
            : valid !== null
              ? `chose "${valid}"`
              : `INVALID "${marker.choice ?? '(none)'}"`) +
          '\n',
      );
    }
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
      const raw = await getProvider().complete(
        {
          system: gistPrompt('id').system,
          user: gistUserTurn(text),
          maxTokens: gistPrompt('id').maxTokens,
        },
        { op: 'gist' },
      );
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
   * THE CHOICE VERDICT, ITS OWN HEADING (`--choice` only).
   *
   * Separate from the mechanical checks above because it answers a different
   * question -- not "is this reading well-formed" but "did the reader actually
   * choose" -- and because a run without `--choice` must not report a clean sweep
   * of a check it never performed. That is the structural silence the voice proxies
   * were fixed for; `n/a` beats `all clean` when nothing ran.
   */
  if (choiceRun) {
    process.stdout.write(`\n${'#'.repeat(70)}\nCHOICE VERDICT\n${'#'.repeat(70)}\n`);
    if (choiceProblems.length === 0) {
      process.stdout.write('every reading chose one, named it in the prose, and yesno stayed out\n');
    } else {
      for (const c of choiceProblems) process.stdout.write(`FAIL  ${c}\n`);
      process.stdout.write(`\n${choiceProblems.length} choice violation(s)\n`);
    }
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
 * Does the prose name the option the reader chose?
 *
 * **STEM MATCHING, BECAUSE A CHOICE IS AN INFLECTED PHRASE IN BOTH LANGUAGES.** An
 * exact `includes()` was tried first and failed six correct readings out of eighteen:
 * `stay where I am` came back as *"staying where you are"*, which is the right answer
 * written the way a reader writes. Indonesian does the same thing with affixes --
 * `pindah` becomes `berpindah`, `pilih` becomes `memilih`.
 *
 * So: take the option's CONTENT words, drop the ones too short or too generic to
 * carry meaning, cut each to its first six characters to survive an affix, and demand
 * that the longest one appears. One word rather than all of them, because a
 * three-word option rephrased in the reader's voice keeps its noun and loses its verb
 * -- and the noun is what tells the querent which lunch they are having.
 *
 * DELIBERATELY LOOSE. This is a smoke check a person reads beside the prose, not a
 * gate: its job is to catch a reading that answers the marker and then talks about
 * something else entirely, which is a real failure mode and the one that matters.
 */
function namesChoiceInProse(text: string, choice: string): boolean {
  const hay = text.toLowerCase();
  const STOP = new Set([
    'the', 'a', 'an', 'my', 'me', 'i', 'am', 'is', 'to', 'in', 'on', 'at', 'of', 'it',
    'that', 'this',
    'yang', 'itu', 'ini', 'di', 'ke', 'dari', 'aku', 'saya', 'nanti',
  ]);
  /*
   * **`stay`, `take`, `go`, `new`, `where` AND `makan` WERE ON THIS LIST AND CAME
   * OFF, because they are the words that carry the option.** Measured 2026-07-29: a
   * reading that chose `stay where I am` closed with *"**staying** asks that you bear
   * the pressure of them"* -- the option named, inflected, in the right paragraph --
   * and every word of the phrase was either a stop word or under three characters, so
   * the matcher had nothing left and fell through to the exact-phrase branch. A verb
   * looks generic in a stop list and is the whole answer in a choice.
   */
  const words = choice
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .sort((a, b) => b.length - a.length);

  /* Nothing but stop words -- e.g. the option IS "stay". Fall back to the phrase, so
     the check neither passes vacuously nor fails on a word it deliberately ignored. */
  if (words.length === 0) return hay.includes(choice.toLowerCase());

  return words.some((w) => hay.includes(w.slice(0, 6)));
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
      const { text } = await getProvider().complete(prompt, { op: 'day_summary' });
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
      const { text: rawSource } = await getProvider().complete(
        {
          system: native.system,
          user: native.user,
          maxTokens: native.maxTokens,
        },
        { op: 'reading' },
      );
      const src = rawSource.trim();

      const prompt = buildTranslationPrompt({
        source: src,
        sourceLocale: source,
        target,
        spec,
        readerId: r.id,
        serviceId: service.id,
      });
      const { text: rawOut } = await getProvider().complete(prompt, { op: 'translation' });
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

      const { text } = await getProvider().complete(prompt, { op: 'frequency' });
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

/**
 * `--persona` (V8's Task 15). One real persona per locale, end to end.
 *
 * **THE SCRIPT BUILDS ITS OWN INPUTS AND NEEDS NO DATABASE.** It imports the pure
 * module only, so it runs with `db:down` -- the same property `--lotus` has, and
 * the reason both are usable as a first check after changing a contract.
 *
 * **EVERY CEILING IS IMPORTED, NEVER TYPED INTO THIS FILE.** That is
 * `budget.ts`'s whole reason for existing and §0.3 of the reconciliation records
 * this script hardcoding two of V3's numbers as the fourth-copy drift it was
 * created to prevent. `PERSONA_MAX_WORDS` and `PERSONA_MAX_SENTENCES` come off
 * `prompt.ts`.
 */
async function runPersona(locales: Locale[]) {
  const {
    PERSONA_CONTRACT,
    PERSONA_MAX_CHARS,
    PERSONA_MAX_SENTENCES,
    PERSONA_MAX_WORDS,
    buildPersonaPrompt,
    facetsFor,
    fallbackPersona,
    personaFactsFor,
    personaSafetyCheck,
  } = await import('@/lib/persona/prompt');
  const { correspondencesFor } = await import('@/lib/numerology');

  /*
   * The same fixture answers `--lotus` uses, distilled by hand into a plausible
   * background. Deliberately NOT a real distillation: this run is about the
   * persona contract, and chaining two model calls would make a persona failure
   * indistinguishable from a Lotus failure.
   *
   * The profile carries a PROPER NAME in both fields, so a body that copies
   * either is caught by `nickname_leak` rather than by luck -- and a birth year
   * a leak check can find.
   */
  const PROFILE = { fullName: 'Rani Sari Wulandari', nickname: 'Rani', birthDate: '1994-08-03' };
  const RAW_ANSWERS = LOTUS_FIXTURE.answers
    .map((a) => a.text)
    .filter((t): t is string => typeof t === 'string');

  const LOTUS: Record<Locale, string> = {
    id: 'Ia menyimpan satu kenangan berat tentang kehilangan yang datang terlalu awal, dan sejak itu cenderung menimbang lama sebelum bicara. Ada satu tahun perpindahan yang masih ia ingat sebagai awal dari banyak hal.',
    en: 'They carry one heavy memory of a loss that arrived too early, and since then tend to weigh things a long time before speaking. There is a year of moving they still remember as the start of much else.',
  };

  const problems: string[] = [];

  const facts = personaFactsFor(PROFILE, {
    topCardId: 17,
    topCardCount: 5,
    topCardReversedDominant: false,
    topReaderId: 'margaret',
    readingCount: 12,
  });

  /* A hash-shaped seed rather than a real `personaInputHash`, so the facets are
     fixed across runs and two runs can be diffed. The rotation itself has its own
     unit test over 4096 seeds. */
  const facets = facetsFor('7f3a1c0400000000');

  process.stdout.write(
    `\n${'#'.repeat(70)}\nENGINE FACTS (computed in code -- VD1)\n${'#'.repeat(70)}\n` +
      `${JSON.stringify(facts, null, 2)}\n` +
      `\nfacets chosen: ${facets.join(', ')}\n`,
  );

  for (const locale of locales) {
    const input = {
      locale,
      facts,
      correspondences: correspondencesFor(PROFILE, locale),
      lotusSummary: LOTUS[locale],
      colour: 'black' as const,
      introversion: 30,
      wishKind: 'aman' as const,
      facets,
    };

    const prompt = buildPersonaPrompt(input);

    process.stdout.write(
      `\n${'#'.repeat(70)}\nSYSTEM CONTRACT [${locale}]\n${'#'.repeat(70)}\n${PERSONA_CONTRACT[locale]}\n`,
    );
    process.stdout.write(
      `\n${'#'.repeat(70)}\nUSER TURN [${locale}]\n${'#'.repeat(70)}\n${prompt.user}\n`,
    );

    const raw = await run(`persona [${locale}]`, prompt.system, prompt.user, prompt.maxTokens);
    const body = raw.replace(/\s+/g, ' ').trim();

    const words = body.split(/\s+/).filter(Boolean).length;
    const sentences = body.split(/[.!?]+(?:\s|$)/).filter((x) => x.trim().length > 0).length;

    const verdict = personaSafetyCheck(body, locale, {
      nickname: PROFILE.nickname,
      fullName: PROFILE.fullName,
      birthDate: PROFILE.birthDate,
      rawAnswers: RAW_ANSWERS,
    });

    process.stdout.write(
      `\n${'#'.repeat(70)}\nSTORED BODY [${locale}]\n${'#'.repeat(70)}\n` +
        `${verdict.ok ? body : fallbackPersona(input)}\n`,
    );

    /* PRINTED, not failed: the counts are what a person reads to judge whether
       the ceiling is right, and one run over is variance rather than a defect. */
    process.stdout.write(
      `\n[${locale}] ${words} words (cap ${PERSONA_MAX_WORDS}), ` +
        `${sentences} sentences (cap ${PERSONA_MAX_SENTENCES}), ` +
        `${body.length} chars (cap ${PERSONA_MAX_CHARS})\n` +
        `[${locale}] facets: ${facets.join(', ')}\n` +
        `[${locale}] safety: ${verdict.ok ? 'ACCEPTED' : `REJECTED -- ${verdict.reason} (the template is stored)`}\n`,
    );

    /*
     * THE CHECKS THAT FAIL. `personaSafetyCheck` is the real gate and it already
     * covers the vocabulary, the names, the brackets and the year -- so a rejection
     * IS the failure, and repeating its list here would be a second copy that
     * drifts. What this adds is the two things the gate deliberately does not
     * refuse, because they are prose-quality rather than safety: markdown and
     * emoji. A persona with a bullet point in it is a contract failure the gate
     * would happily store.
     */
    if (!verdict.ok) problems.push(`[${locale}] safety check rejected: ${verdict.reason}`);
    if (/[*_#`]|^\s*[-•]\s/m.test(body)) problems.push(`[${locale}] markdown or a list marker`);
    if (/\p{Extended_Pictographic}/u.test(body)) problems.push(`[${locale}] emoji`);
    if (words > PERSONA_MAX_WORDS * 1.5) {
      problems.push(`[${locale}] ${words} words is over 1.5x the ${PERSONA_MAX_WORDS} ceiling`);
    }

    /*
     * THE CARD NAME, MECHANICALLY. The contract says to copy it exactly and in
     * English, and CLAUDE.md records the model inventing "Pulan" for The Moon when
     * only the prompt rule stood behind it. The life-path arcana is the one card the
     * body is REQUIRED to name.
     */
    const arcana = input.correspondences.lifePath?.arcana.name;
    if (arcana && verdict.ok && !body.includes(arcana)) {
      problems.push(`[${locale}] does not name ${arcana} as given`);
    }
  }

  process.stdout.write(`\n${'#'.repeat(70)}\nPERSONA CHECKS\n${'#'.repeat(70)}\n`);
  if (problems.length === 0) process.stdout.write('all clean\n');
  else for (const pr of problems) process.stdout.write(`FAIL  ${pr}\n`);

  process.stdout.write(
    '\nFour questions, and only the last two need a person:\n' +
      '  1. is it four sentences, one per facet after the card?\n' +
      '  2. does it name the card exactly as given?\n' +
      '  3. does it read as a RECORD kept about someone, or as a reader talking to them?\n' +
      '     A greeting, an offer of help, or a reader\'s warmth means VD16 is slipping\n' +
      '     and the fix is the contract, not the code.\n' +
      '  4. would you be comfortable if a stranger opened this at a public URL?\n' +
      '     That is what V7 makes possible, and it is the whole reason the checks\n' +
      '     above FAIL rather than warn.\n',
  );
}


// ---------------------------------------------------------------------------
// `--chat` (F3). THE RELEASE GATE.
// ---------------------------------------------------------------------------

/**
 * `[F3-25]`. **THE SHORTEST BUBBLE IN A WHOLE CONVERSATION MUST BE SHORT.**
 *
 * Every other length check in this repository fails on output being too long ONCE. This
 * one fails when brevity NEVER HAPPENS — a run in which every bubble is 18–22 words is
 * three readers delivering paragraphs, which is `C-D19`'s named worst outcome and which
 * no existing instrument can see, because every ceiling was met.
 */
const CHAT_BREVITY_FLOOR = 6;

/**
 * Margaret's mean sentence must be this much longer than Thessaly's.
 *
 * **IT SHIPPED AT 1.25 AND THE FIRST THREE RUNS PUT IT BACK AT 1.5** (§17 item 5, open
 * question 3, closed). The worry was that at a 22-word bubble everybody is short and the
 * ratio compresses, so the reading path's 1.5 — calibrated on 28-word paragraphs — would
 * fail on correct output. **Measured: 1.96, 2.57, 2.57, 3.06, 3.53 and 4.36 across six
 * locale-runs**, so the compression did not happen; Margaret writes one long sentence
 * where Thessaly writes half of one, and the shape survives the shorter ceiling intact.
 *
 * Back at 1.5 because the stricter number catches convergence earlier and the margin is
 * still 0.46 below the worst observed run. The numbers are in
 * `docs/workstream-notes.md`; if a future run fails on this, **that is data** and the
 * honest alternative is to print it and stop failing on it.
 */
const CHAT_SENTENCE_RATIO = 1.5;

/**
 * The scripted conversation. **EIGHT MESSAGES PER LOCALE, EACH PROBING SOMETHING THE
 * RELEASE IS JUDGED ON**, and `en` is REWRITTEN rather than translated
 * (`## Localization` rule 3) so the two halves probe different failures.
 */
const CHAT_SCRIPT: Record<Locale, Array<{ text: string; probes: string }>> = {
  id: [
    { text: 'halo', probes: 'THE EMPTY OPENER. Does anybody answer at all, and is it short?' },
    { text: 'lagi pusing sama kerjaan sih', probes: 'the ordinary one. baseline voice separation' },
    {
      text: 'gue mikirin nenek gue akhir-akhir ini',
      probes: 'THE C-D8 PROBE. Reaches worst_thing: connect without quoting or diagnosing',
    },
    {
      text: 'emang kalian tau apa soal gue',
      probes: 'THE SURVEILLANCE PROBE. It invites "kamu pernah bilang" directly ([F3-9])',
    },
    { text: 'wkwk', probes: 'THE BREVITY PROBE. Does anybody answer a laugh with a paragraph?' },
    {
      text: 'menurut kalian mending resign apa nggak',
      probes: 'THE READING PROBE. A choice-shaped question with no cards on the table',
    },
    {
      text: '@margaret setuju sama adrian?',
      probes: 'THE READER-TO-READER PROBE. Does she answer HIM, using his actual words?',
    },
    { text: 'iya deh', probes: 'THE ENDING PROBE. Does the room know to let it stop? (C-R6)' },
  ],
  en: [
    { text: 'hey', probes: 'THE EMPTY OPENER' },
    { text: 'work has been a lot lately', probes: 'the ordinary one' },
    {
      text: "my mum's been on my mind",
      probes: 'THE C-D8 PROBE, en half. Reaches most_loved: DOES ANYBODY SAY "Sari"? ([F3-8])',
    },
    { text: 'how do you even know that about me', probes: 'THE SURVEILLANCE PROBE' },
    { text: 'lol', probes: 'THE BREVITY PROBE' },
    { text: 'should i quit or not, honestly', probes: 'THE READING PROBE' },
    {
      text: 'do you actually agree with him, margaret',
      probes: 'THE READER-TO-READER PROBE',
    },
    { text: 'fair enough', probes: 'THE ENDING PROBE' },
  ],
};

/**
 * The canned beat sheets, one per user message: `[1] [1] [2] [1] [1] [3] [1] [0]`.
 *
 * **THE DIRECTOR IS NOT CALLED.** `--chat --director` would be F2's flag and F2's cost;
 * this run is about the VOICES, and chaining a planner call in would make a voice failure
 * indistinguishable from a planning failure — `runPersona`'s reason for not chaining the
 * Lotus, one workstream over.
 *
 * The last sheet is EMPTY, deliberately: `C-R6` says a plan of length zero is valid and
 * desirable, and the run has to be able to show that the room can let a conversation stop.
 */
const CHAT_SHEETS: Array<Array<{ reader: ReaderId; to: 'user' | ReaderId; intent: string; angle: string | null; replyToPrevious?: boolean }>> = [
  [{ reader: 'adrian', to: 'user', intent: 'react', angle: null }],
  [{ reader: 'thessaly', to: 'user', intent: 'ask', angle: 'how long it has been like this' }],
  [
    { reader: 'margaret', to: 'user', intent: 'answer', angle: null },
    { reader: 'adrian', to: 'user', intent: 'ask', angle: null },
  ],
  [{ reader: 'thessaly', to: 'user', intent: 'answer', angle: null }],
  [{ reader: 'adrian', to: 'user', intent: 'react', angle: null }],
  [
    { reader: 'thessaly', to: 'user', intent: 'answer', angle: 'the deadline' },
    { reader: 'adrian', to: 'thessaly', intent: 'push_back', angle: null, replyToPrevious: true },
    { reader: 'margaret', to: 'user', intent: 'agree', angle: null },
  ],
  [{ reader: 'margaret', to: 'adrian', intent: 'push_back', angle: null, replyToPrevious: true }],
  [],
];

/** The fixture querent. `Mifta` is what `addressForms` derives `Mif` and `Ta` from. */
const CHAT_NICKNAME = 'Mifta';

/**
 * `LOTUS_FIXTURE`'s answers, VERBATIM — a proper name (`Sari`), a genuinely heavy
 * `worst_thing`, and a skipped `willow_wish`, so the name check, the quotation check and
 * `[F3-7]` are all exercised by the same fixture the Lotus run uses.
 */
function chatFixtureAnswers(): Array<{ key: string; text: string }> {
  return LOTUS_FIXTURE.answers
    .filter((a) => a.text !== null && !a.skipped)
    .map((a) => ({ key: a.key as string, text: a.text as string }));
}

/**
 * The voice's `ChatContext`, from the fixtures.
 *
 * **ONE BUILDER FOR BOTH RUNNERS.** `--chat` drives it with canned beat sheets and
 * `--chat --director --voices` drives it with real ones, and the two must differ in the
 * SHEET and in nothing else — otherwise a difference between the runs is a difference
 * between two fixtures, which is the measurement answering a question nobody asked.
 */
function chatFixtureContext(args: {
  locale: Locale;
  nickname: string;
  forms: string[];
  answers: Array<{ key: string; text: string }>;
  messages: Array<{
    id: string;
    author: 'user' | ReaderId;
    createdAt: string;
    body: string;
    replyToAuthor: 'user' | ReaderId | null;
    attachment: string | null;
  }>;
  replyToId: string | null;
}) {
  const { locale } = args;
  return {
    profile: 'voice' as const,
    locale,
    nickname: args.nickname,
    addressForms: args.forms,
    facts: [
      { kind: 'lifePath' as const, value: '8', gloss: locale === 'id' ? 'kerja panjang yang akhirnya kelihatan' : 'long work that finally shows' },
      { kind: 'sun' as const, value: 'pisces', gloss: locale === 'id' ? 'ikut arus, lalu bertanya ke mana' : 'goes with the current, then asks where' },
      { kind: 'element' as const, value: 'water', gloss: locale === 'id' ? 'terbawa perasaan sebelum tahu kenapa' : 'moved before knowing why' },
    ],
    lotus: LOTUS_BLOCK_FIXTURE.summary,
    answers: args.answers,
    readings: [0, 1, 2].map((i) => ({
      localDate: `2026-08-0${i + 1}`,
      readerId: (['thessaly', 'margaret', 'adrian'] as const)[i],
      cards: fixedPicks(i, 3).map((p) => ({ cardId: p.id, reversed: p.reversed })),
      gist:
        locale === 'id'
          ? ['sesuatu yang dibiarkan terlalu lama', 'satu keputusan yang ditunda', 'kabar yang belum datang'][i]
          : ['something left too long', 'a decision put off', 'news that has not come'][i],
    })),
    repeatCardIds: [] as number[],
    messages: args.messages,
    replyTo: args.replyToId
      ? (args.messages.find((m) => m.id === args.replyToId) ?? null)
      : null,
  };
}

/**
 * `npm run smoke -- --chat`, and `--chat --proactive` for F5's half.
 *
 * **THE CONTEXT IS BUILT FROM FIXTURES RATHER THAN THROUGH `assembleChatContext`, AND
 * THAT IS A DIVERGENCE FROM THE PLAN WITH A REASON.** §12.1 asks for a stub handle that
 * answers the assembler's reads. Those reads are five real query modules that build
 * drizzle statements; faking that builder chain would be testing the fake, and the
 * assembler's own behaviour — the decrypt, the window, the director narrowing — is what
 * `context.integration.test.ts` drives against a real row. **What this run is for is the
 * PROSE**, so it assembles the same shape by hand from the fixtures `--lotus` and
 * `--persona` already use, and stays Docker-free as `npm run smoke` must.
 */
async function runChat(locales: Locale[], proactive: boolean) {
  const { CHAT_LENGTH_BUDGET, chatBudgetFor } = await import('@/lib/prompt/budget');
  const { buildChatPrompt, chatPromptVersion } = await import('@/lib/chat/prompt/build');
  const { addressForms } = await import('@/lib/chat/address');
  const { pace } = await import('@/lib/chat/voices/pace');
  const { chatModel, chatModelName } = await import('@/lib/chat/model');
  const {
    CHAT_CLOSERS_EN,
    CHAT_CLOSERS_ID,
    CHAT_EMOJI,
    CHAT_MULTI_DASH,
    CHAT_OPENERS_EN,
    CHAT_OPENERS_ID,
    CHAT_SOURCE_TELLS_EN,
    CHAT_SOURCE_TELLS_ID,
    CHAT_TICS_EN,
    CHAT_TICS_ID,
    checkTurnBodies,
  } = await import('@/lib/chat/validate');
  const { properNames, sharesNgram } = await import('@/lib/prompt/lotus');
  const { MALAY } = await import('@/lib/copy/vocab');

  process.stdout.write(
    `\nchat model=${chatModelName()} (CHAT_MODEL=${process.env.CHAT_MODEL ?? 'unset'})\n`,
  );

  const NICKNAME = CHAT_NICKNAME;
  const FORMS = addressForms(NICKNAME);
  const ANSWERS = chatFixtureAnswers();
  const RAW_ANSWERS = ANSWERS.map((a) => a.text);

  const problems: string[] = [];
  /** Every bubble a reader wrote, per locale, for the proxies. */
  const perLocale: Record<string, Array<{ author: string; body: string; words: number }>> = {};
  /** The WHOLE conversation in order, both sides, for the transcript and the blind read. */
  const conversations: Record<string, Array<{ author: string; body: string }>> = {};

  for (const locale of locales) {
    const script = CHAT_SCRIPT[locale];
    const messages: Array<{
      id: string;
      author: 'user' | ReaderId;
      createdAt: string;
      body: string;
      replyToAuthor: 'user' | ReaderId | null;
      attachment: string | null;
    }> = [];
    const spoken: Array<{ author: string; body: string; words: number }> = [];
    let clock = Date.parse('2026-08-07T07:00:00.000Z');
    let messageNo = 0;

    process.stdout.write(`\n${'#'.repeat(70)}\nCHAT -- ${locale}\n${'#'.repeat(70)}\n`);

    for (const [step, line] of script.entries()) {
      clock += 60_000;
      messageNo += 1;
      messages.push({
        id: `m${messageNo}`,
        author: 'user',
        createdAt: new Date(clock).toISOString(),
        body: line.text,
        replyToAuthor: null,
        attachment: null,
      });
      process.stdout.write(`\n--- ${messageNo}. ${NICKNAME}: ${line.text}\n    (${line.probes})\n`);

      const sheet = CHAT_SHEETS[step] ?? [];
      if (sheet.length === 0) {
        process.stdout.write('    [no beats -- C-R6, and this is a GOOD outcome]\n');
        continue;
      }

      for (const [beatIndex, planned] of sheet.entries()) {
        const previous = messages[messages.length - 1];
        const beat = {
          reader: planned.reader,
          to: planned.to,
          replyTo: planned.replyToPrevious ? previous.id : null,
          intent: planned.intent as 'answer',
          angle: planned.angle,
        };
        const budget = chatBudgetFor(locale, planned.reader);
        const ctx = chatFixtureContext({
          locale,
          nickname: NICKNAME,
          forms: FORMS,
          answers: ANSWERS,
          messages,
          replyToId: beat.replyTo,
        });

        const delay = pace({ next: beat, previousChars: beatIndex === 0 ? null : previous.body.length });
        const guards = {
          locale,
          reader: planned.reader,
          budget,
          addressForms: FORMS,
          rawAnswers: RAW_ANSWERS,
          conversation: messages.map((m) => m.body),
        };

        /*
         * **THE RETRY IS HERE BECAUSE PRODUCTION HAS ONE** (`C-R7`, `F1-D2`): `speak()`
         * calls the model a second time inside the same request, with the refused
         * reason named in the prompt. A runner that made one call would report every
         * refusal as a lost bubble and **overstate the cost of a tight ceiling** —
         * which is exactly the number Task 11 is calibrating. It also measures the one
         * thing no unit test can: whether the repair line actually recovers a turn.
         */
        let text = '';
        let ms = 0;
        let usage: { inputTokens: number | null; outputTokens: number | null } = {
          inputTokens: null,
          outputTokens: null,
        };
        let checked = checkTurnBodies('', guards);
        let attempts = 0;
        let repairReason: string | null = null;

        for (const attempt of [1, 2] as const) {
          attempts = attempt;
          const prompt = buildChatPrompt({
            ctx,
            self: planned.reader,
            beat,
            budget,
            now: clock,
            repairReason: attempt === 2 ? repairReason : null,
          });
          const started = Date.now();
          const reply = await getProvider().complete(prompt, {
            op: 'chat_turn',
            callClass: 'deferred',
            model: chatModel(),
          });
          ms = Date.now() - started;
          text = reply.text;
          usage = reply.usage;
          checked = checkTurnBodies(text, guards);
          if (checked.ok) break;
          repairReason = checked.reason;
        }

        /*
         * **A TURN REFUSED TWICE STORES NOTHING** (`C-R7`, `[F3-13]`), so it must not
         * enter this transcript either: in production the room simply never sees it, and
         * counting it would put a bubble over the ceiling into the SHORTNESS distribution
         * the ceiling is calibrated from. It is printed below instead.
         */
        for (const body of checked.ok ? checked.bodies : []) {
          const words = body.split(/\s+/).filter(Boolean).length;
          clock += Math.max(delay, 1000);
          messageNo += 1;
          messages.push({
            id: `m${messageNo}`,
            author: planned.reader,
            createdAt: new Date(clock).toISOString(),
            body,
            replyToAuthor: beat.replyTo ? previous.author : null,
            attachment: null,
          });
          spoken.push({ author: planned.reader, body, words });
          process.stdout.write(
            `    [${delay}ms] ${planned.reader} (${planned.intent}${beat.replyTo ? ` -> ${previous.author}` : ''}): ${body}\n` +
              `        ${words}w ${body.length}c, ${ms}ms, attempt ${attempts}, tokens in=${usage.inputTokens ?? 'null'} out=${usage.outputTokens ?? 'null'}, ${chatPromptVersion(locale, planned.reader, budget)}\n`,
          );
        }

        if (!checked.ok) {
          /* BOTH attempts failed, which in production is `C-R7`'s skip: nothing stored,
           * nothing shown, and the room is quieter. Printed so the run says which
           * bubble was lost. */
          process.stdout.write(`    [refused twice -- ${checked.reason}, nothing stored] ${text.trim().slice(0, 160)}\n`);
          problems.push(
            `[${locale}] ${planned.reader} beat ${beatIndex}: refused TWICE -- ${checked.reason}: ${JSON.stringify(text.slice(0, 120))}`,
          );
        } else if (attempts === 2) {
          /* The repair line worked. PRINTED, not failed: this is the mechanism working. */
          process.stdout.write(`        [repaired on attempt 2 after ${repairReason}]\n`);
        }
      }
    }

    perLocale[locale] = spoken;
    conversations[locale] = messages.map((m) => ({ author: m.author, body: m.body }));

    // ---- THE CHECKS (§12.3) -------------------------------------------------
    const budget = CHAT_LENGTH_BUDGET[locale];
    const counts = spoken.map((s) => s.words).sort((a, b) => a - b);
    const mean = counts.reduce((a, b) => a + b, 0) / Math.max(counts.length, 1);
    process.stdout.write(
      `\n[shortness ${locale}] ${counts.length} bubbles, words ${counts.join(' ')}\n` +
        `    min=${counts[0]} mean=${mean.toFixed(1)} max=${counts[counts.length - 1]} ` +
        `ceiling=${budget.maxWords} (margaret ${chatBudgetFor(locale, 'margaret').maxWords})\n` +
        `    <=3 words: ${counts.filter((c) => c <= 3).length} of ${counts.length} ` +
        '(band: at least 1 in 10 -- PRINTED, not failed, and the plan\'s "2 in 16" was\n' +
        '     arithmetic on beat sheets that come to ten beats, not sixteen)\n',
    );
    if (counts.length > 0 && counts[0] > CHAT_BREVITY_FLOOR) {
      problems.push(
        `[${locale}] SHORTNESS: the shortest bubble is ${counts[0]} words, over ${CHAT_BREVITY_FLOOR}. ` +
          'Three readers each delivered a paragraph, which is C-D19\'s named worst outcome ([F3-25]).',
      );
    }
    if (mean > budget.maxWords) {
      problems.push(`[${locale}] SHORTNESS: mean ${mean.toFixed(1)} words is over the ${budget.maxWords} ceiling`);
    }

    const joined = spoken.map((s) => s.body).join('\n');
    const lower = joined.toLowerCase();

    /* `[F3-9]`. THE HIGHEST-VALUE GREP IN THE RELEASE. */
    for (const tell of locale === 'id' ? CHAT_SOURCE_TELLS_ID : CHAT_SOURCE_TELLS_EN) {
      if (lower.includes(tell)) problems.push(`[${locale}] SURVEILLANCE: a reader said "${tell}"`);
    }

    /* `[F3-8]`, and it is what keeps `onboarding.q.most_loved.hint`'s promise. */
    const saidByQuerent = new Set(
      script.flatMap((l) => properNames(l.text).map((n) => n.toLowerCase())),
    );
    for (const answer of RAW_ANSWERS) {
      for (const name of properNames(answer)) {
        if (saidByQuerent.has(name.toLowerCase())) continue;
        if (new RegExp(`\\b${name}\\b`).test(joined)) {
          problems.push(`[${locale}] NAME LEAK: a reader wrote "${name}", which only exists in a stored answer`);
        }
      }
      const words = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
      if (sharesNgram(words(answer), words(joined), 6)) {
        problems.push(`[${locale}] QUOTATION: a six-word run from a stored answer reached a bubble`);
      }
    }

    /* The smoke-only half of §7: stylistic tells rather than violations. */
    for (const tic of locale === 'id' ? CHAT_TICS_ID : CHAT_TICS_EN) {
      if (lower.includes(tic)) problems.push(`[${locale}] REGISTER: "${tic}"`);
    }
    for (const opener of locale === 'id' ? CHAT_OPENERS_ID : CHAT_OPENERS_EN) {
      if (spoken.some((s) => s.body.toLowerCase().startsWith(opener))) {
        problems.push(`[${locale}] REGISTER: a bubble opened with "${opener}"`);
      }
    }
    for (const closer of locale === 'id' ? CHAT_CLOSERS_ID : CHAT_CLOSERS_EN) {
      if (lower.includes(closer)) problems.push(`[${locale}] REGISTER: a bubble closed with "${closer}"`);
    }
    if (locale === 'id') {
      for (const word of MALAY) {
        if (new RegExp(`\\b${word}\\b`, 'i').test(joined)) {
          problems.push(`[${locale}] MALAY: "${word}"`);
        }
      }
    }
    if (CHAT_MULTI_DASH.test(joined)) problems.push(`[${locale}] REGISTER: more than one em dash in a bubble`);

    /*
     * §7.5. **EMOJI ARE PRINTED, NOT FAILED.** People put emoji in group chats, so a
     * refusal would cost bubbles for something that is not a harm; three readers who
     * each emoji is its own tell. If the rate is non-zero across three runs the prompt is
     * not binding and **the fix is the prompt.**
     */
    const emoji = spoken.filter((s) => CHAT_EMOJI.test(s.body)).length;
    process.stdout.write(`[emoji ${locale}] ${emoji} of ${spoken.length} bubbles (contract forbids; validator accepts)\n`);

    /* `C-N1e`. The band's shape is `chain_used / chain_offered`'s, and the numbers are
       guesses until the first three runs. */
    const named = spoken.filter((s) =>
      FORMS.some((f) => new RegExp(`\\b${f}\\b`, 'i').test(s.body)),
    ).length;
    process.stdout.write(
      `[address ${locale}] ${named}/${spoken.length} bubbles name the querent ` +
        `(band: over ~40% is a tic, under ~5% and C-N1e did not happen -- GUESSES until three runs)\n`,
    );

    /* `C-N1d`. The closing half of the loop is not machine-checkable and goes to the read. */
    const asked = spoken.filter((s) => s.body.trim().endsWith('?')).length;
    process.stdout.write(
      `[questions ${locale}] ${asked}/${spoken.length} bubbles end in a question ` +
        '(band: under ~15% the readers are not asking, over ~50% it is an interrogation)\n',
    );

    /* THE THREE VOICE PROXIES (`C-N1f`), over each reader's own bubbles joined. */
    const byReader = (id: ReaderId) => spoken.filter((s) => s.author === id).map((s) => s.body).join(' ');
    for (const readerId of ['thessaly', 'margaret', 'adrian'] as ReaderId[]) {
      const text = byReader(readerId);
      if (!text) continue;
      for (const word of CROSSOVER[locale][readerId]) {
        if (text.toLowerCase().includes(word.toLowerCase())) {
          problems.push(`[${locale}] CROSSOVER: ${readerId} used "${word}", which is their own forbidden vocabulary`);
        }
      }
    }
    const thessalyMean = meanSentenceWords(byReader('thessaly'));
    const margaretMean = meanSentenceWords(byReader('margaret'));
    process.stdout.write(
      `[sentence length ${locale}] thessaly=${thessalyMean.toFixed(1)} margaret=${margaretMean.toFixed(1)} ` +
        `adrian=${meanSentenceWords(byReader('adrian')).toFixed(1)} (ratio must be >= ${CHAT_SENTENCE_RATIO})\n`,
    );
    if (thessalyMean > 0 && margaretMean > 0 && margaretMean < thessalyMean * CHAT_SENTENCE_RATIO) {
      problems.push(
        `[${locale}] SENTENCE LENGTH: margaret ${margaretMean.toFixed(1)} < thessaly ${thessalyMean.toFixed(1)} x ${CHAT_SENTENCE_RATIO}`,
      );
    }
    if (locale === 'en') {
      const adrianRate = contractionRate(byReader('adrian'));
      const margaretRate = contractionRate(byReader('margaret'));
      process.stdout.write(`[contractions en] adrian=${adrianRate.toFixed(1)} margaret=${margaretRate.toFixed(1)} per 100 words\n`);
      if (byReader('adrian') && adrianRate === 0) problems.push('[en] CONTRACTIONS: adrian used none');
      if (margaretRate > 0) problems.push('[en] CONTRACTIONS: margaret used some');
    }

    /*
     * READER OVERLAP. **THE REFERENCE BAND IS NOT `--all`'s.** A chat's vocabulary is
     * bounded by the conversation, so all three readers share the querent's words by
     * construction and the number sits far above 0.086. The FIRST run's number is the
     * reference and goes into `docs/workstream-notes.md`; a JUMP is the signal.
     */
    const pairs: Array<[string, string, number]> = [];
    const ids: ReaderId[] = ['thessaly', 'margaret', 'adrian'];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = byReader(ids[i]);
        const b = byReader(ids[j]);
        if (a && b) pairs.push([ids[i], ids[j], jaccard(a, b)]);
      }
    }
    for (const [a, b, n] of pairs) {
      process.stdout.write(`[overlap ${locale}] ${a} vs ${b}: ${n.toFixed(3)}\n`);
    }
  }

  /*
   * THE WHOLE THING AGAIN, AS A CONVERSATION AND NOTHING ELSE -- no timings, no counts,
   * no reasons. The instrumented print above is for finding a defect; this is for reading,
   * and roadmap §10.2's second question ("would a person send this?") cannot be answered
   * off a page interleaved with millisecond figures.
   */
  for (const locale of locales) {
    process.stdout.write(`\n${'='.repeat(70)}\nTRANSCRIPT -- ${locale}\n${'='.repeat(70)}\n`);
    for (const line of conversations[locale] ?? []) {
      process.stdout.write(`${line.author === 'user' ? NICKNAME : line.author}: ${line.body}\n`);
    }
  }

  // ---- THE CHECK REPORT -----------------------------------------------------
  process.stdout.write(`\n${'-'.repeat(70)}\nCHAT CHECKS\n${'-'.repeat(70)}\n`);
  if (problems.length === 0) process.stdout.write('all clean\n');
  else for (const pr of problems) process.stdout.write(`FAIL  ${pr}\n`);

  // ---- THE BLIND READ (§12.4), AND IT IS THE RELEASE GATE --------------------
  chatBlindPrint(conversations, locales, NICKNAME, proactive);

  if (problems.length > 0) process.exitCode = 1;
}

/**
 * `blindPrint`'s mechanism, applied to a conversation.
 *
 * **THE QUERENT'S MESSAGES STAY LABELLED AND UNREDACTED**, deliberately: they are the
 * scaffolding, and an exchange with one side removed cannot be read at all. Each reader's
 * own name is redacted from every body for `blindPrint`'s reason — *a broken
 * self-introduction rule must not also void the test.*
 */
function chatBlindPrint(
  conversations: Record<string, Array<{ author: string; body: string }>>,
  locales: Locale[],
  nickname: string,
  proactive: boolean,
): void {
  process.stdout.write(`\n${'#'.repeat(70)}\nTHE BLIND READ\n${'#'.repeat(70)}\n`);

  const key: string[] = [];
  for (const locale of locales) {
    const lines = conversations[locale] ?? [];
    if (lines.length === 0) continue;

    /* A FIXED, LOCALE-DERIVED SHUFFLE, so two runs can be diffed. `blindPrint`'s rule. */
    const order: ReaderId[] =
      locale === 'id'
        ? ['margaret', 'adrian', 'thessaly']
        : ['adrian', 'thessaly', 'margaret'];
    const label = new Map(order.map((id, i) => [id, `PEMBACA ${String.fromCharCode(65 + i)}`]));

    process.stdout.write(`\n===== ${locale} =====\n`);
    for (const line of lines) {
      /*
       * **THE QUERENT'S OWN MESSAGES STAY LABELLED AND UNREDACTED.** They are the
       * scaffolding: an exchange with one side removed cannot be read at all, and the
       * question is who wrote the REPLIES.
       */
      if (line.author === 'user') {
        process.stdout.write(`${nickname}: ${line.body}\n`);
        continue;
      }
      const covered = line.body.replace(/\b(Thessaly|Margaret|Adrian)\b/gi, '[REDACTED]');
      process.stdout.write(`${label.get(line.author as ReaderId) ?? line.author}: ${covered}\n`);
    }
    for (const id of order) key.push(`${locale}  ${label.get(id)} = ${id}`);
  }

  process.stdout.write(
    '\nTWO QUESTIONS, AND THE SECOND ONE IS THIS RELEASE\'S OWN:\n' +
      '\n  1. GUESS WHO IS WHO. Three of three, or the persona blocks need sharpening --\n' +
      '     and the fix is CHAT_READER_PROMPTS_{ID,EN}, never the code.\n' +
      (proactive
        ? '\n  2. DOES THIS SOUND LIKE SOMEBODY THOUGHT OF YOU, OR LIKE A CRON JOB?\n' +
          '       a. Is it ABOUT something, or is it "hai, apa kabar?" (C-N2e)\n' +
          '       b. Does it open a conversation, or close one?\n'
        : '\n  2. READ IT AGAIN AND ANSWER: WOULD A PERSON SEND THIS?\n' +
          '     Three specific things, because "does it feel natural" is not a question\n' +
          '     anyone can answer cold:\n' +
          '       a. Did any reader deliver a PARAGRAPH? One is too many.\n' +
          '       b. Did any reader SUMMARISE the querent back at themselves before\n' +
          '          answering? That is the most bot-like move available and no grep\n' +
          '          can see it.\n' +
          '       c. Did the room ever GO QUIET, or does every message get answered by\n' +
          '          somebody? A room where every message is answered is a focus group.\n') +
      `\n  The querent is ${nickname} and their messages are NOT covered -- they are the\n` +
      '  scaffolding. Write the answers, the shortness distribution and the overlap\n' +
      '  number into docs/workstream-notes.md under "## The group chat (F3)".\n',
  );

  process.stdout.write('\n'.repeat(40));
  process.stdout.write(`${'-'.repeat(30)}\nTHE KEY\n${'-'.repeat(30)}\n`);
  for (const line of key) process.stdout.write(`${line}\n`);
}

// ---------------------------------------------------------------------------
// `--chat --director` (F2). THE ONLY INSTRUMENT FOR A BEAT SHEET.
// ---------------------------------------------------------------------------

/**
 * One line of the canned room. `after` is minutes since the previous line, so the ages the
 * director reads are real relative durations and `[belum dijawab]` is reachable.
 *
 * A line with `probes` is a querent message the director is asked to plan for; every other
 * line is scaffolding, and the reader lines are hand-written because **calling the voices
 * here would make a bad sheet and a bad bubble indistinguishable**.
 */
type DirectorLine = {
  author: 'user' | ReaderId;
  body: string;
  after: number;
  probes?: string;
};

/**
 * The eight probes, chosen to reach the four levers of the plan's §11 and the two prompt
 * rules no unit test can see (5 and 10).
 *
 * **THE ENGLISH HALF IS A REWRITE, NOT A TRANSLATION** — different subjects on purpose, the
 * same enforcement `## Localization` rule 3 applies to the worked examples. If a future
 * version of this fixture says *atasan* and *boss* about the same week, somebody translated
 * it.
 */
const DIRECTOR_SCRIPT: Record<Locale, DirectorLine[]> = {
  id: [
    { author: 'user', body: 'hai', after: 0, probes: 'THE EMPTY OPENER. Silence, or ONE small beat? Three beats here is the failure.' },
    { author: 'adrian', body: 'eh, tumben. kenapa?', after: 1 },
    { author: 'user', body: 'kerjaan gue numpuk banget, atasan minta semuanya kelar minggu ini', after: 2, probes: 'THE ORDINARY ONE. Affinity says thessaly. Does the room agree, and does anybody overrule it?' },
    { author: 'thessaly', body: 'Berapa yang benar-benar harus minggu ini?', after: 2 },
    { author: 'user', body: 'sori ketiduran. tiga sih sebenernya, sisanya bisa minggu depan', after: 95, probes: 'RULE 5. Thessaly asked and never heard back. Does she get the first beat?' },
    { author: 'margaret', body: 'Tiga dan sisanya adalah dua daftar yang berbeda, dan yang kedua biasanya yang menahan orang.', after: 3 },
    { author: 'user', body: 'wkwk iya sih', after: 1, probes: 'THE ONE-WORD PROBE. A real group lets this pass. Does this one?' },
    { author: 'thessaly', body: 'Tulis tiga itu sekarang, sebelum lupa.', after: 2 },
    { author: 'user', body: 'iya tapi ngga sesimpel itu, atasan gue tiap hari nambah', after: 2, probes: 'THE TWO-BEAT PROBE. A real group answers this twice: somebody pushes back on Thessaly and somebody sides with the querent.' },
    { author: 'user', body: 'nenek gue meninggal tahun lalu dan gue masih kebayang terus', after: 40, probes: 'RULE 10. NO tease, and one beat is usually enough. A tease here is the worst outcome in the run.' },
    { author: 'thessaly', body: 'Setahun itu belum lama.', after: 2 },
    { author: 'user', body: 'margaret kamu setuju ngga sama thessaly?', after: 3, probes: 'DIRECTED AT A READER. Margaret should be in the cast, and to= should name somebody.' },
    { author: 'adrian', body: 'nah itu dia. gue juga pengen tau jawabannya', after: 2 },
    { author: 'user', body: 'pacar gue ngambek dari kemarin dan gue bingung mau ngomong apa', after: 5, probes: 'THE AFFINITY SWITCH. Adrian is the lead now. Does the cast move?' },
    { author: 'user', body: 'oke deh, makasih ya', after: 4, probes: 'THE ENDING PROBE. `beats: []` is the correct answer (C-R6).' },
  ],
  en: [
    { author: 'user', body: 'hey', after: 0, probes: 'THE EMPTY OPENER' },
    { author: 'margaret', body: 'There you are.', after: 1 },
    { author: 'user', body: 'my landlord wants an answer about the lease by friday', after: 2, probes: 'THE ORDINARY ONE. Affinity says thessaly.' },
    { author: 'thessaly', body: 'What happens if you say no?', after: 2 },
    { author: 'user', body: 'sorry, fell asleep. i think i just move out honestly', after: 100, probes: 'RULE 5. Thessaly asked and never heard back.' },
    { author: 'adrian', body: 'you said that last month too though', after: 3 },
    { author: 'user', body: 'lol fair', after: 1, probes: 'THE ONE-WORD PROBE' },
    { author: 'thessaly', body: 'Then give notice this week.', after: 2 },
    { author: 'user', body: 'thats easy for you to say, i have nowhere to go yet', after: 2, probes: 'THE TWO-BEAT PROBE. A real group answers this twice: one pushes back on Thessaly, one sides with the querent.' },
    { author: 'user', body: 'my dad had a fall and i keep thinking about it', after: 45, probes: 'RULE 10. NO tease here.' },
    { author: 'margaret', body: 'A fall frightens the people watching more than the person who fell.', after: 2 },
    { author: 'user', body: 'adrian do you actually agree with her', after: 3, probes: 'DIRECTED AT A READER' },
    { author: 'thessaly', body: 'He will say yes and then say something else.', after: 2 },
    { author: 'user', body: 'my ex texted me and i havent replied for two days', after: 5, probes: 'THE AFFINITY SWITCH. Adrian is the lead now.' },
    { author: 'user', body: 'ok thanks', after: 4, probes: 'THE ENDING PROBE' },
  ],
};

/**
 * `npm run smoke -- --chat --director`. Eight real `chat_plan` calls per locale.
 *
 * **THE CONTEXT IS THE FIXTURE ABOVE RATHER THAN `assembleChatContext`**, exactly as
 * `runChat` does it and for the same reason: the assembler's reads are five real query
 * modules building drizzle statements, and faking that chain would be testing the fake.
 * `context.integration.test.ts` drives the assembler against a real row; **what this run is
 * for is the DECISION.**
 */
async function runDirector(locales: Locale[], withVoices = false) {
  const { buildPlanPromptFrom } = await import('@/lib/chat/direct/assemble');
  const { affinityFor } = await import('@/lib/chat/direct/affinity');
  const { planCaps } = await import('@/lib/chat/direct/caps');
  const { checkPlan } = await import('@/lib/chat/direct/validate');
  const { awaitingReader, buildWindow, recentlySpoke, renderBeatSheet } = await import(
    '@/lib/chat/direct/window'
  );
  const { chatModel, chatModelName } = await import('@/lib/chat/model');
  const { buildChatPrompt } = await import('@/lib/chat/prompt/build');
  const { chatBudgetFor } = await import('@/lib/prompt/budget');
  const { addressForms } = await import('@/lib/chat/address');
  const { checkTurnBodies } = await import('@/lib/chat/validate');
  const { pace } = await import('@/lib/chat/voices/pace');

  const FORMS = addressForms(CHAT_NICKNAME);
  const ANSWERS = chatFixtureAnswers();
  const RAW_ANSWERS = ANSWERS.map((a) => a.text);
  /** User lines and GENERATED bubbles only — never the canned ones (see below). */
  const conversations: Record<string, Array<{ author: string; body: string }>> = {};

  const caps = planCaps();
  process.stdout.write(
    `\ndirector model=${chatModelName()} (CHAT_MODEL=${process.env.CHAT_MODEL ?? 'unset'})\n` +
      `caps: maxBeats=${caps.maxBeats} perReader=${caps.maxBeatsPerReader} angle=${caps.maxAngleChars} window=${caps.windowMessages} oldReply=${caps.oldReplyMinAgeMinutes}m\n`,
  );

  for (const locale of locales) {
    process.stdout.write(`\n${'#'.repeat(70)}\nDIRECTOR -- ${locale}\n${'#'.repeat(70)}\n`);

    const script = DIRECTOR_SCRIPT[locale];
    const messages: Array<{
      id: string;
      author: 'user' | ReaderId;
      body: string;
      createdAt: string;
      replyToAuthor: 'user' | ReaderId | null;
      attachment: string | null;
    }> = [];
    let clock = Date.parse('2026-08-07T02:00:00.000Z');
    let no = 0;
    const spoken: Array<{ author: string; body: string }> = [];

    /** Every sheet, for the levers at the end. */
    const sheets: Array<{
      beats: number;
      readers: number;
      asks: number;
      /**
       * `to` NAMING A READER — **AND IT IS A FLOOR, NOT A RATE. DO NOT TUNE THE PROMPT
       * AGAINST THIS NUMBER.**
       *
       * §11's lever says *"beats whose `replyTo` names a reader message"*, and that half
       * can only ever catch a quote of a PREVIOUS run: the first beat of this run has no
       * `chat_messages` row yet, so the second beat cannot quote it. Within a run,
       * answering another reader is `to`; across runs it is `replyTo`.
       *
       * **BUT THE PROSE ANSWERS ANOTHER READER FAR MORE OFTEN THAN `to` SAYS.** Measured
       * on a joined run: *"he's right though"* and *"she said it like a checklist"* both
       * scored as help-desk beats because `to` was `user`, and both are the room talking to
       * itself. `to` exists so `build.ts` can write `Bicara kepada:` and so `validateTurn`
       * knows whether a nickname may appear — **it was never a count of anything.** Two
       * prompt pushes were spent chasing it before the join was built; the second cost the
       * cast mix and was reverted. **The instrument is the blind read below.**
       */
      readerDirected: number;
      readerQuotes: number;
      oldReplies: number;
      source: string;
      followedLead: boolean | null;
    }> = [];

    for (const line of script) {
      clock += line.after * 60_000;
      no += 1;
      messages.push({
        id: `m${no}`,
        author: line.author,
        body: line.body,
        createdAt: new Date(clock).toISOString(),
        replyToAuthor: null,
        attachment: null,
      });
      /*
       * **A CANNED READER LINE IS CONTEXT AND NEVER PART OF THE BLIND READ.** They are
       * written by hand, in the readers' voices, to set the probes up — so putting them in
       * front of somebody guessing who is who would be marking my own homework. The
       * querent's lines are scaffolding and are shown, exactly as `--chat` shows them.
       */
      if (line.author === 'user') spoken.push({ author: 'user', body: line.body });
      if (!line.probes) continue;

      const triggerId = `m${no}`;
      const window = buildWindow({
        messages,
        locale,
        caps,
        triggerMessageId: triggerId,
        now: clock,
      });
      const cast = recentlySpoke(window);
      const affinity = affinityFor(line.body, locale, { recentlySpoke: cast });
      const prompt = buildPlanPromptFrom(
        {
          trigger: 'user_message',
          fallbackLocale: locale,
          window,
          affinity,
          awaiting: awaitingReader(window),
          material: null,
          caps,
        },
        cast,
      );

      const started = Date.now();
      const reply = await getProvider().complete(prompt, {
        op: 'chat_plan',
        callClass: 'deferred',
        model: chatModel(),
      });
      const ms = Date.now() - started;

      const checked = checkPlan(reply.text, { window, fallbackLocale: locale, caps });
      process.stdout.write(`\n--- ${no}. ${line.body}\n    (${line.probes})\n`);

      if (!checked.ok) {
        /* **A REFUSAL IS THE FALLBACK, AND THE FALLBACK IS NOT SILENCE** (`[F2-7]`). It is
         * printed as loudly as possible: a refusal rate above a few percent means the
         * prompt is wrong, and `validatePlan` must be LOOSENED rather than the prompt
         * blamed if the plans it refuses read as correct. */
        process.stdout.write(
          `    [REFUSED -- ${checked.reason}] raw: ${JSON.stringify(reply.text.slice(0, 200))}\n`,
        );
        sheets.push({
          beats: 1,
          readers: 1,
          asks: 0,
          readerDirected: 0,
          readerQuotes: 0,
          oldReplies: 0,
          source: 'fallback',
          followedLead: null,
        });
        continue;
      }

      const readerMessages = new Set(window.filter((e) => e.author !== 'user').map((e) => e.id));
      const oldIds = new Set(
        window.filter((e) => e.ageMinutes >= caps.oldReplyMinAgeMinutes).map((e) => e.id),
      );
      sheets.push({
        beats: checked.beats.length,
        readers: new Set(checked.beats.map((b) => b.reader)).size,
        asks: checked.beats.filter((b) => b.intent === 'ask').length,
        readerDirected: checked.beats.filter((b) => b.to !== 'user').length,
        readerQuotes: checked.beats.filter((b) => b.replyTo !== null && readerMessages.has(b.replyTo))
          .length,
        oldReplies: checked.beats.filter((b) => b.replyTo !== null && oldIds.has(b.replyTo)).length,
        source: 'model',
        followedLead:
          affinity.lead === null ? null : (checked.beats[0]?.reader ?? null) === affinity.lead,
      });

      process.stdout.write(
        `${renderBeatSheet({
          label: `    run ${no}`,
          trigger: 'user_message',
          locale,
          source: 'model',
          beats: checked.beats,
          affinity,
          window,
        })}\n` +
          `    ${ms}ms, tokens in=${reply.usage.inputTokens ?? 'null'} out=${reply.usage.outputTokens ?? 'null'}` +
          `${checked.repairs.length > 0 ? `, repairs: ${checked.repairs.join(',')}` : ''}\n`,
      );

      if (!withVoices) continue;

      /*
       * ── THE JOIN. Every beat of this sheet, through the real voice. ───────────
       *
       * `C-R5`: **each beat sees every earlier beat of its own run, as ACTUAL PROSE** —
       * which is why the generated bubble is pushed into `messages` before the next beat
       * builds its context, and why beats run serially here exactly as `run.ts` runs them.
       *
       * `C-R7`'s one retry is included, for the reason F3's runner records: a runner that
       * made one call would report every refusal as a lost bubble and overstate the cost of
       * a tight ceiling.
       */
      for (const [beatIndex, beat] of checked.beats.entries()) {
        const budget = chatBudgetFor(locale, beat.reader);
        const previous = messages[messages.length - 1];
        const delay = pace({
          next: beat,
          previousChars: beatIndex === 0 ? null : previous.body.length,
        });

        const guards = {
          budget,
          addressForms: FORMS,
          rawAnswers: RAW_ANSWERS,
          conversation: messages.map((m) => m.body),
        };

        let text = '';
        let turnMs = 0;
        let turn = checkTurnBodies('', { locale, reader: beat.reader, ...guards });
        let repairReason: string | null = null;
        let attempts = 0;

        for (const attempt of [1, 2] as const) {
          attempts = attempt;
          const turnPrompt = buildChatPrompt({
            ctx: chatFixtureContext({
              locale,
              nickname: CHAT_NICKNAME,
              forms: FORMS,
              answers: ANSWERS,
              messages,
              replyToId: beat.replyTo,
            }),
            self: beat.reader,
            beat,
            budget,
            now: clock,
            repairReason: attempt === 2 ? repairReason : null,
          });
          const startedTurn = Date.now();
          const turnReply = await getProvider().complete(turnPrompt, {
            op: 'chat_turn',
            callClass: 'deferred',
            model: chatModel(),
          });
          turnMs = Date.now() - startedTurn;
          text = turnReply.text;
          turn = checkTurnBodies(text, { locale, reader: beat.reader, ...guards });
          if (turn.ok) break;
          repairReason = turn.reason;
        }

        if (!turn.ok) {
          /* `C-R7`: refused twice stores NOTHING, the room is quieter, and no notice
           * reaches the screen. Printed here because the run has to say what was lost. */
          process.stdout.write(
            `    [${beat.reader} refused twice -- ${turn.reason}, nothing stored] ${text.trim().slice(0, 120)}\n`,
          );
          continue;
        }

        for (const body of turn.bodies) {
          clock += Math.max(delay, 1000);
          no += 1;
          messages.push({
            id: `m${no}`,
            author: beat.reader,
            body,
            createdAt: new Date(clock).toISOString(),
            replyToAuthor: beat.replyTo
              ? (messages.find((m) => m.id === beat.replyTo)?.author ?? null)
              : null,
            attachment: null,
          });
          spoken.push({ author: beat.reader, body });
          process.stdout.write(
            `    [${delay}ms] ${beat.reader}` +
              `${beat.to === 'user' ? '' : ` -> ${beat.to}`} (${beat.intent}): ${body}\n` +
              `        ${body.split(/\s+/).filter(Boolean).length}w ${body.length}c, ${turnMs}ms, attempt ${attempts}\n`,
          );
        }
      }
    }

    conversations[locale] = spoken;

    // ---- §11's FOUR LEVERS. PRINTED, NEVER FAILED ---------------------------
    /*
     * **TARGETS FOR F7's PANELS, NOT THRESHOLDS ANYTHING ENFORCES.** A number outside the
     * band is a reason to read the prompt, never a reason to add a clamp — and a clamp is
     * the coin flip `[F2-17]` refuses, arriving in a different file.
     */
    const runs = sheets.length;
    const silent = sheets.filter((s) => s.beats === 0).length;
    const beats = sheets.reduce((n, s) => n + s.beats, 0);
    const spread = [1, 2, 3, 4].map(
      (n) => `${n}: ${sheets.filter((s) => s.beats === n).length}`,
    );
    const withLead = sheets.filter((s) => s.followedLead !== null);
    const pct = (a: number, b: number) => (b === 0 ? '--' : `${Math.round((a / b) * 100)}%`);

    process.stdout.write(
      `\n${'-'.repeat(70)}\nDIRECTOR LEVERS -- ${locale}\n${'-'.repeat(70)}\n` +
        `  silence rate       ${pct(silent, runs)}  (${silent}/${runs})  target 10-25%; 0% is a help desk, >40% has stopped reading\n` +
        `  cast size          ${spread.join('  ')}  over ${runs - silent} speaking runs (target 1:45 2:35 3:15 4:5)\n` +
        `  reader-directed    ${pct(sheets.reduce((n, s) => n + s.readerDirected, 0), beats)} of ${beats} beats set to=<reader>, ${sheets.reduce((n, s) => n + s.readerQuotes, 0)} quote one\n` +
        `                     A FLOOR, NOT A RATE -- the prose answers another reader far more often\n` +
        `                     than \`to\` says, and a quote of a sibling beat is impossible by design.\n` +
        `                     DO NOT TUNE THE PROMPT AGAINST THIS. Read the bubbles instead.\n` +
        `  ask rate           ${pct(sheets.filter((s) => s.asks > 0).length, runs)} of runs  target 25-35%; 0% and C-N1d did not ship\n` +
        `  old quotes         ${sheets.reduce((n, s) => n + s.oldReplies, 0)} of ${beats} beats  (>15% and the room is stuck: fix rule 8, not the cap)\n` +
        `  fallback rate      ${pct(sheets.filter((s) => s.source === 'fallback').length, runs)}  ANY of these is a prompt problem, not a validator problem\n` +
        `  affinity followed  ${pct(withLead.filter((s) => s.followedLead).length, withLead.length)} of ${withLead.length} runs with a lead  (100% is a switchboard; 0% means the hint is noise)\n`,
    );
  }

  process.stdout.write(
    `\n${'-'.repeat(70)}\nHOW TO READ THE SHEETS ABOVE (§15.4)\n${'-'.repeat(70)}\n` +
      '  The first two questions are the ones that matter.\n\n' +
      '  1. Would a PERSON have said nothing here? If yes, and the sheet has two beats,\n' +
      '     the silence rule is not landing and prompt rule 6 is where to look.\n' +
      '  2. Is there a beat that exists only to be POLITE? A second `agree`, a closing\n' +
      '     beat, a summary of the beat above it. That is the false positive the\n' +
      '     "YANG BUKAN ALASAN" block exists to refuse, and it is the failure that will\n' +
      '     actually ship.\n' +
      '  3. Does anybody answer ANYBODY? **ASK THIS OF THE PROSE, NOT OF THE `to` COLUMN**\n' +
      '     -- "he\'s right though" is the room talking to itself and scores as `to=user`.\n' +
      '  4. Is the SAME READER always first? If so, the affinity demotion is not firing\n' +
      '     or the lexicon is too coarse for this subject matter.\n' +
      '  5. Is the angle a SUBJECT or a SENTENCE? If you could send it as it stands,\n' +
      '     MAX_ANGLE_CHARS is too high and that is the number to move.\n\n' +
      '  Then read the BUBBLES below. A sheet that reads well and produces three\n' +
      '  indistinguishable paragraphs is `[F2-2]` failing, and the fix is in the director\n' +
      '  rather than in the persona blocks.\n',
  );

  /*
   * **THE JOINED BLIND READ IS THE ONE THAT COUNTS** (§10.2). Same mechanism as `--chat`'s
   * — names covered, a fixed locale-derived shuffle so two runs can be diffed, the key
   * after forty blank lines — but over prose that a REAL beat sheet asked for. The
   * question to hold while reading is `[F2-2]`'s: are these three people, or is this one
   * model wearing three hats because the director told all three the same thing?
   */
  if (withVoices) chatBlindPrint(conversations, locales, CHAT_NICKNAME, false);
}


// ---------------------------------------------------------------------------
// `--chat --proactive` (F5). THE OTHER HALF OF §10.2's GATE.
// ---------------------------------------------------------------------------

/**
 * `[F5-10]`'s failure, as a grep. **THE EXACT STRING THE ROADMAP NAMES.**
 *
 * `C-N2e`: *a proactive run with nothing to be about produces "hai, apa kabar?", which
 * is the emptiest thing this feature could ship.* A run that HAD material and opened
 * with it anyway means the brief did not reach the voice — which is a prompt problem,
 * not a material problem, and it is invisible in every unit test because the material
 * object was perfectly correct on its way in.
 */
const PROACTIVE_EMPTY_OPENER = /\b(apa kabar|gimana kabar|how are you|what'?s up|how's it going)\b/i;

/**
 * WARN, not FAIL. `tally.ts`'s two-tier argument verbatim: *"a scanner that flags
 * legitimate output is a scanner somebody switches off within a week."* **"Selamat pagi"
 * from a morning nudge is legitimate**; a bare *"hai"* opening an unprompted run usually
 * is not, and the difference is a judgement a person makes while reading.
 */
const PROACTIVE_BARE_GREETING = /^\s*(hai|halo|hi|hey)\b/i;

/**
 * `npm run smoke -- --chat --proactive`. **Six real runs, one per material kind, with no
 * querent and no database.**
 *
 * ── WHY BOTH HALVES ARE LIVE HERE, WHERE `--chat` CANS ONE ────────────────
 *
 * `--chat` cans the sheets and `--chat --director` cans the voices, each so that a
 * failure in one is not read as a failure in the other. **Neither split works for this
 * question.** What F5 ships is a *brief*, and the only way to find out whether a brief
 * reached the prose is to let it travel the whole way: material -> director -> voice. A
 * canned sheet would answer the question for the director; canned prose would answer it
 * for the voices.
 *
 * ── ONE LOCALE BY DEFAULT, AND THE REASON DIFFERS FROM `--all`'s ──────────
 *
 * `--all` defaults to both because W6's whole risk *is* the second locale. Here the risk
 * is the **material**, and twelve unprompted runs is more prose than anybody reads in one
 * sitting — **and the blind read is the gate, so a run nobody finishes reading is a gate
 * nobody passes.** `--locale en` switches.
 */
async function runProactive(locales: Locale[]) {
  const { buildPlanPromptFrom } = await import('@/lib/chat/direct/assemble');
  const { affinityFor } = await import('@/lib/chat/direct/affinity');
  const { planCaps } = await import('@/lib/chat/direct/caps');
  const { checkPlan } = await import('@/lib/chat/direct/validate');
  const { awaitingReader, buildWindow, recentlySpoke, renderBeatSheet } = await import(
    '@/lib/chat/direct/window'
  );
  const { chatModel, chatModelName } = await import('@/lib/chat/model');
  const { buildChatPrompt } = await import('@/lib/chat/prompt/build');
  const { CHAT_LENGTH_BUDGET, chatBudgetFor } = await import('@/lib/prompt/budget');
  const { addressForms } = await import('@/lib/chat/address');
  const { checkTurnBodies } = await import('@/lib/chat/validate');
  const { pace } = await import('@/lib/chat/voices/pace');
  const { describeMaterial, materialLine } = await import('@/lib/chat/proactive/material');
  const { PROACTIVE_ROOMS, proactiveFixtures } = await import('@/lib/chat/proactive/fixtures');
  const { tallyFailures } = await import('@/lib/memory/tally');

  const caps = planCaps();
  const FORMS = addressForms(CHAT_NICKNAME);
  const ANSWERS = chatFixtureAnswers();
  const RAW_ANSWERS = ANSWERS.map((a) => a.text);

  process.stdout.write(
    `\nproactive model=${chatModelName()} (CHAT_MODEL=${process.env.CHAT_MODEL ?? 'unset'})\n` +
      `caps: maxBeats=${caps.maxBeats} perReader=${caps.maxBeatsPerReader}\n`,
  );

  const problems: string[] = [];
  const conversations: Record<string, Array<{ author: string; body: string }>> = {};
  /** The key the blind read prints: which run was about what. */
  const materialKey: string[] = [];

  for (const locale of locales) {
    process.stdout.write(`\n${'#'.repeat(70)}\nPROACTIVE -- ${locale}\n${'#'.repeat(70)}\n`);
    const spoken: Array<{ author: string; body: string; words: number }> = [];
    const transcript: Array<{ author: string; body: string }> = [];
    let runNo = 0;

    for (const fixture of proactiveFixtures(locale)) {
      runNo += 1;
      /*
       * A FIXED CLOCK PER RUN, so two runs of this script produce the same ages and can
       * be diffed. `[F5-2]`'s injected clock, extended to the instrument.
       */
      let clock = Date.parse('2026-08-07T12:00:00.000Z');
      const messages = PROACTIVE_ROOMS[locale][fixture.room].map((m) => ({
        id: m.id,
        author: m.author,
        body: m.body,
        createdAt: new Date(clock - m.minutesAgo * 60_000).toISOString(),
        replyToAuthor: null as 'user' | ReaderId | null,
        attachment: null as string | null,
      }));

      const brief = describeMaterial(fixture.material, locale);
      const line = materialLine(brief);

      process.stdout.write(
        `\n--- run ${runNo}: ${fixture.kind} (trigger ${fixture.trigger}, room "${fixture.room}")\n` +
          `    BAHAN: ${line}\n` +
          `    replyTo: ${brief.replyTo ?? 'none'}\n`,
      );
      /* The room the run starts from, printed once so the bubbles have something to sit
       * against. It is context, not part of the blind read's answer. */
      for (const m of messages) {
        process.stdout.write(`      ${m.author === 'user' ? CHAT_NICKNAME : m.author}: ${m.body}\n`);
      }

      const window = buildWindow({
        messages,
        locale,
        caps,
        /*
         * **A PROACTIVE RUN HAS NO TRIGGER MESSAGE**, which is exactly the shape
         * `[F2-5]` describes: the affinity is scored on the trigger message alone, so it
         * scores `''` and no hint line is emitted at all. The material is what the
         * director decides on instead, which is the whole point of this run.
         */
        triggerMessageId: brief.replyTo,
        now: clock,
      });
      const cast = recentlySpoke(window);
      const affinity = affinityFor('', locale, { recentlySpoke: cast });

      const prompt = buildPlanPromptFrom(
        {
          trigger: fixture.trigger,
          fallbackLocale: locale,
          window,
          affinity,
          awaiting: awaitingReader(window),
          material: line,
          caps,
        },
        cast,
      );

      const started = Date.now();
      const reply = await getProvider().complete(prompt, {
        op: 'chat_plan',
        callClass: 'deferred',
        model: chatModel(),
      });
      const planMs = Date.now() - started;
      const checked = checkPlan(reply.text, { window, fallbackLocale: locale, caps });

      if (!checked.ok) {
        process.stdout.write(
          `    [PLAN REFUSED -- ${checked.reason}] ${JSON.stringify(reply.text.slice(0, 200))}\n`,
        );
        problems.push(`[${locale}] ${fixture.kind}: the plan was refused -- ${checked.reason}`);
        continue;
      }

      process.stdout.write(
        `${renderBeatSheet({
          label: `    plan`,
          trigger: fixture.trigger,
          locale,
          source: 'model',
          beats: checked.beats,
          affinity,
          window,
        })}\n    ${planMs}ms, tokens in=${reply.usage.inputTokens ?? 'null'} out=${reply.usage.outputTokens ?? 'null'}\n`,
      );

      if (checked.beats.length === 0) {
        /*
         * **`[F5-7]`: A PROACTIVE RUN'S BEAT SHEET IS NEVER EMPTY.** `C-R6`'s *"the
         * director may say nobody replies"* is an affordance for a POSTED MESSAGE, where
         * declining to answer is a naturalness signal. Applied to a proactive trigger it
         * is a contradiction — nobody spoke, so there is nothing to decline to answer —
         * and `[F5-13]`'s non-refunding counter means the querent's day was spent on
         * silence.
         */
        problems.push(
          `[${locale}] ${fixture.kind}: ZERO BEATS on a proactive trigger ([F5-7]). The day's ` +
            'budget was spent on silence; F2 owns the enforcement.',
        );
        continue;
      }

      const runBubbles: string[] = [];
      for (const [beatIndex, beat] of checked.beats.entries()) {
        const budget = chatBudgetFor(locale, beat.reader);
        const previous = messages[messages.length - 1];
        const delay = pace({
          next: beat,
          previousChars: beatIndex === 0 ? null : previous.body.length,
        });
        const guards = {
          locale,
          reader: beat.reader,
          budget,
          addressForms: FORMS,
          rawAnswers: RAW_ANSWERS,
          conversation: messages.map((m) => m.body),
        };

        let text = '';
        let turnMs = 0;
        let turn = checkTurnBodies('', guards);
        let repairReason: string | null = null;
        let attempts = 0;

        /* The retry is here because production has one (`C-R7`, `F1-D2`): a runner that
         * made one call would report every refusal as a lost bubble. */
        for (const attempt of [1, 2] as const) {
          attempts = attempt;
          const turnPrompt = buildChatPrompt({
            ctx: chatFixtureContext({
              locale,
              nickname: CHAT_NICKNAME,
              forms: FORMS,
              answers: ANSWERS,
              messages,
              replyToId: beat.replyTo,
            }),
            self: beat.reader,
            beat,
            budget,
            now: clock,
            repairReason: attempt === 2 ? repairReason : null,
          });
          const startedTurn = Date.now();
          const turnReply = await getProvider().complete(turnPrompt, {
            op: 'chat_turn',
            callClass: 'deferred',
            model: chatModel(),
          });
          turnMs = Date.now() - startedTurn;
          text = turnReply.text;
          turn = checkTurnBodies(text, guards);
          if (turn.ok) break;
          repairReason = turn.reason;
        }

        if (!turn.ok) {
          /* `C-R7`: refused twice stores nothing and the room is simply quieter. */
          process.stdout.write(
            `    [${beat.reader} refused twice -- ${turn.reason}, nothing stored] ${text.trim().slice(0, 120)}\n`,
          );
          problems.push(
            `[${locale}] ${fixture.kind} beat ${beatIndex}: refused TWICE -- ${turn.reason}`,
          );
          continue;
        }

        for (const body of turn.bodies) {
          clock += Math.max(delay, 1000);
          const words = body.split(/\s+/).filter(Boolean).length;
          messages.push({
            id: `g${messages.length + 1}`,
            author: beat.reader,
            body,
            createdAt: new Date(clock).toISOString(),
            replyToAuthor: null,
            attachment: null,
          });
          spoken.push({ author: beat.reader, body, words });
          transcript.push({ author: beat.reader, body });
          runBubbles.push(body);
          process.stdout.write(
            `    [${delay}ms] ${beat.reader}${beat.to === 'user' ? '' : ` -> ${beat.to}`} ` +
              `(${beat.intent}): ${body}\n        ${words}w ${body.length}c, ${turnMs}ms, attempt ${attempts}\n`,
          );
        }
      }

      // ---- §11.2's THREE CHECKS, PER RUN ------------------------------------
      const opener = runBubbles[0] ?? '';
      if (opener !== '' && PROACTIVE_EMPTY_OPENER.test(opener)) {
        problems.push(
          `[${locale}] ${fixture.kind}: THE EMPTY OPENER. The run had material and opened with ` +
            `${JSON.stringify(opener.slice(0, 80))} -- C-N2e's named worst outcome, and it means ` +
            'the brief did not reach the voice.',
        );
      }
      for (const body of runBubbles) {
        /*
         * **A DIGIT IN THE OUTPUT WAS INVENTED.** M4 hands over a Shadow Arcana, a pulse
         * word and a dominance bucket and **never a count** (`[F5-9]`); `material.test.ts`
         * asserts the brief carries no digit, and this asserts the prose did not grow one.
         * V3's entire finding, in a new place.
         */
        for (const hit of tallyFailures(body, { locale })) {
          problems.push(`[${locale}] ${fixture.kind}: A TALLY -- ${hit.pattern}: ${JSON.stringify(body.slice(0, 100))}`);
        }
      }
      if (opener !== '' && PROACTIVE_BARE_GREETING.test(opener)) {
        process.stdout.write(
          `    WARN  a bare greeting opens this run: ${JSON.stringify(opener.slice(0, 60))}\n` +
            '          "Selamat pagi" from a morning nudge is legitimate; a bare "hai" usually is not.\n',
        );
      }

      materialKey.push(`${locale}  run ${runNo} = ${fixture.kind} (${fixture.trigger})`);
      /* The room's own lines are context and are NOT part of the blind read: they are
       * hand-written in the readers' voices to set the run up, so showing them to
       * somebody guessing who is who would be marking my own homework. */
    }

    conversations[locale] = transcript;

    // ---- THE BUDGET, ASSERTED SO THE PROMPT AND THE TABLE CANNOT DRIFT ------
    const budget = CHAT_LENGTH_BUDGET[locale];
    const counts = spoken.map((s) => s.words).sort((a, b) => a - b);
    if (counts.length > 0) {
      const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
      process.stdout.write(
        `\n[shortness ${locale}] ${counts.length} bubbles, words ${counts.join(' ')}\n` +
          `    min=${counts[0]} mean=${mean.toFixed(1)} max=${counts[counts.length - 1]} ` +
          `ceiling=${budget.maxWords} (margaret ${chatBudgetFor(locale, 'margaret').maxWords})\n`,
      );
      if (mean > budget.maxWords) {
        problems.push(
          `[${locale}] SHORTNESS: mean ${mean.toFixed(1)} words is over the ${budget.maxWords} ceiling`,
        );
      }
    }
  }

  process.stdout.write(`\n${'-'.repeat(70)}\nPROACTIVE CHECKS\n${'-'.repeat(70)}\n`);
  if (problems.length === 0) process.stdout.write('all clean\n');
  else for (const pr of problems) process.stdout.write(`FAIL  ${pr}\n`);

  chatBlindPrint(conversations, locales, CHAT_NICKNAME, true);

  process.stdout.write(
    `\n${'-'.repeat(30)}\nTHE MATERIAL KEY\n${'-'.repeat(30)}\n` +
      '  Guess what each run was ABOUT before reading this. If you cannot tell, the\n' +
      '  material did not reach the voice -- and the fix is describeMaterial\'s note table\n' +
      '  or F3\'s prompt, NEVER the code.\n',
  );
  for (const k of materialKey) process.stdout.write(`${k}\n`);

  if (problems.length > 0) process.exitCode = 1;
}


main().catch((err) => {
  console.error('\nsmoke failed:', err);
  process.exit(1);
});
