/**
 * **WHAT DOES THE PROVIDER ACTUALLY REPORT ABOUT TOKENS?** Ten seconds, four calls.
 *
 *   npm run probe:usage              the whole thing
 *   npm run probe:usage -- --raw     also dump the raw usage objects
 *
 * ── WHY THIS EXISTS, WHICH IS THE ONLY INTERESTING PART ──────────────────────
 *
 * For a whole release this project asserted, in about twelve places including
 * CLAUDE.md, that *"z.ai reports `input_tokens: 0` and honours no caching"*. Every
 * streamed reading stored NULL input tokens, a dashboard footnote grew up explaining
 * the blindness, and a workaround using a client-side tokenizer was proposed to
 * estimate the missing numbers.
 *
 * **None of it was true.** `anthropic.ts` read `input_tokens` from `message_start`,
 * where this wire always sends `0`, and the real counts were arriving in
 * `message_delta` all along -- in the same event the adapter already opened to read
 * `output_tokens` from. z.ai also honours prompt caching, which three comments denied.
 *
 * The original measurement was not careless. It was taken **once, by hand, and written
 * into prose that could then never be re-checked** -- so when it was wrong, nothing
 * could notice, and eleven copies of it hardened into fact. **A number we assert about
 * a provider needs a way to be re-verified, or it rots silently.** That is the same
 * instinct as `prices.ts`'s 365-day tripwire, and this script is its cheap version.
 *
 * **RUN THIS BEFORE BELIEVING ANY CLAIM IN THIS REPOSITORY ABOUT WHAT A PROVIDER
 * REPORTS**, and after any provider or model change -- `LLM_PROVIDER`, `LLM_MODEL`, a
 * base URL, an SDK bump. It reads whatever is configured; it hardcodes no provider.
 *
 * ── WHAT IT CHECKS ──────────────────────────────────────────────────────────
 *
 *   1. Buffered `complete()`  -- does it report an input count?
 *   2. Streamed, cold        -- ditto, on a prompt never sent before.
 *   3. Streamed, warm        -- the SAME prompt again. If the provider caches, the
 *                              input count splits and the TOTAL must still match (2).
 *   4. A short prompt        -- some providers only cache above a minimum length.
 *
 * **(2) AND (3) SUMMING TO THE SAME NUMBER IS THE ASSERTION THAT MATTERS.** It is what
 * proves the adapter's summing rule is right, and it is the check that would have
 * caught the original bug: a cold total of 1364 against a warm `input_tokens` of 20
 * says, unmissably, that reading one field is not enough.
 *
 * It makes real model calls against the configured key, like `npm run smoke`. Four of
 * them, tiny. `ANALYTICS_ENABLED=0` in the npm script keeps them out of `llm_calls`,
 * because a probe is not traffic.
 */
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { getProvider } from '@/lib/llm';
import { resolveBaseUrl } from '@/lib/llm/openai';
import type { ReadingUsage } from '@/lib/llm/types';

config({ path: '.env.local' });

const RAW = process.argv.includes('--raw');

/** Wide enough that a provider with a minimum cacheable length will cache it. */
function longSystem(nonce: string): string {
  return (
    `Kamu pembaca tarot dengan kode ${nonce}. Jawab dalam satu kalimat pendek. ` +
    'Jangan menyebut kartu apa pun. Jangan menambahkan penjelasan. '
  ).repeat(30);
}

function show(label: string, u: ReadingUsage, raw?: unknown): void {
  const total = u.inputTokens;
  const cached = u.cachedInputTokens;
  const fresh = total === null || cached === null ? null : total - cached;
  console.log(
    `  ${label.padEnd(26)} input=${String(total).padStart(6)}` +
      `  cached=${String(cached).padStart(6)}` +
      `  fresh=${String(fresh).padStart(6)}` +
      `  output=${String(u.outputTokens).padStart(5)}`,
  );
  if (RAW && raw !== undefined) console.log(`    raw: ${JSON.stringify(raw)}`);
}

async function drain(stream: AsyncIterable<string>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _ of stream) {
    /* the prose is not the point here */
  }
}

async function main(): Promise<void> {
  const provider = process.env.LLM_PROVIDER ?? 'zai';
  const model = process.env.LLM_MODEL ?? '(unset)';
  console.log(`\nprovider=${provider}  model=${model}  baseURL=${resolveBaseUrl()}`);
  console.log('four calls, one of them a deliberate repeat\n');

  const llm = getProvider();

  /*
   * **TWO NONCES, AND THE FIRST VERSION OF THIS SCRIPT HAD ONE.** With a single nonce
   * the buffered call primes the provider's cache, so the "cold" stream came back with
   * 1984 of 2028 tokens already cached -- measured, on the first run. That makes the
   * cold probe unable to distinguish "this provider does not cache" from "something
   * warmed it a moment ago", which is the one distinction it exists to draw.
   */
  const bufferedNonce = randomUUID();
  const streamNonce = randomUUID();

  const system = longSystem(streamNonce);
  const user = `Pertanyaan ${streamNonce}: apa yang harus aku lakukan hari ini?`;
  const prompt = { system, user, maxTokens: 24, promptVersion: 'probe-v1.00000000' };

  const buffered = await llm.complete(
    {
      system: longSystem(bufferedNonce),
      user: `Pertanyaan ${bufferedNonce}: apa yang harus aku lakukan?`,
      maxTokens: 24,
    },
    { op: 'gist' },
  );
  show('1. buffered', buffered.usage);

  const cold = llm.streamReading(prompt);
  await drain(cold);
  const coldUsage = await cold.usage;
  show('2. streamed, cold', coldUsage);

  const warm = llm.streamReading(prompt);
  await drain(warm);
  const warmUsage = await warm.usage;
  show('3. streamed, warm (repeat)', warmUsage);

  const shortSystem = `Pembaca tarot ${streamNonce}. Satu kalimat.`;
  const short = llm.streamReading({ ...prompt, system: shortSystem });
  await drain(short);
  show('4. streamed, short prompt', await short.usage);

  console.log('\n--- what this says ---');

  if (coldUsage.inputTokens === null) {
    console.log(
      '  ** NO INPUT COUNT ON THE STREAMED PATH. **\n' +
        '  Before concluding the provider does not report one, check WHICH EVENT the\n' +
        '  adapter reads. That was the bug: the count was on the wire the whole time,\n' +
        '  in message_delta, while the adapter read message_start.',
    );
  } else {
    console.log(`  streamed input tokens ARE reported: ${coldUsage.inputTokens}`);
  }

  const cachedWarm = warmUsage.cachedInputTokens ?? 0;
  if (cachedWarm > 0) {
    console.log(`  prompt caching IS honoured: ${cachedWarm} tokens served from cache on the repeat`);
  } else {
    console.log('  no cache hit on the repeat -- either not honoured, or not yet warm');
  }

  /*
   * **THE ONE REAL ASSERTION.** `inputTokens` is the TOTAL on both calls, so caching
   * moves tokens between the fresh and cached halves and must not change the sum. A
   * mismatch means the adapter's summing rule is wrong for this provider -- which is
   * the failure that silently halves or doubles every input figure in the dashboard.
   */
  if (coldUsage.inputTokens !== null && warmUsage.inputTokens !== null) {
    const same = coldUsage.inputTokens === warmUsage.inputTokens;
    console.log(
      same
        ? `  TOTALS AGREE across a cache hit: ${coldUsage.inputTokens} both times. Summing rule is right.`
        : `  ** TOTALS DISAGREE: cold=${coldUsage.inputTokens} warm=${warmUsage.inputTokens}. **\n` +
            '  The adapter is summing the wrong set of fields for this provider.\n' +
            '  Anthropic-wire: input_tokens EXCLUDES cache reads, so they must be added.\n' +
            '  OpenAI-wire:    prompt_tokens INCLUDES them, so they must NOT be.',
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
