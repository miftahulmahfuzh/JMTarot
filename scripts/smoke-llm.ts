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

async function run(label: string, system: string, user: string, maxTokens: number) {
  const provider = getProvider();
  process.stdout.write(`\n${'='.repeat(70)}\n${label}\n${'='.repeat(70)}\n`);

  const started = Date.now();
  let chunks = 0;
  let firstChunkAt = 0;
  let text = '';

  for await (const chunk of provider.streamReading({ system, user, maxTokens })) {
    if (chunks === 0) firstChunkAt = Date.now() - started;
    chunks += 1;
    text += chunk;
    process.stdout.write(chunk);
  }

  process.stdout.write(
    `\n\n[${chunks} chunks, first after ${firstChunkAt}ms, ` +
      `${Date.now() - started}ms total, ${text.length} chars]\n`,
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
  const all = process.argv.includes('--all');

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

  const pairs =
    reader && service
      ? [[reader, service] as const]
      : READERS.flatMap((r) => SERVICES.map((s) => [r.id, s.id] as const));

  const failures: string[] = [];

  for (const [r, s] of pairs) {
    const count = SERVICES.find((x) => x.id === s)?.cardCount ?? 1;
    const picks = shuffleDeck()
      .slice(0, count)
      .map((d) => ({ id: d.card.id, reversed: d.reversed }));

    const prompt = buildPrompt({ reader: r, service: s, picks, question: arg('question') });
    const text = await run(`${r} / ${s}`, prompt.system, prompt.user, prompt.maxTokens);

    const framing = READERS.find((x) => x.id === r)?.positionFraming ?? [];
    for (const problem of check(text, r, s, picks, {
      CARDS,
      effectiveYesNo,
      VERDICT_WORD,
      framing,
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
  process.stdout.write(
    '\nWhat this cannot check: whether the three readers are actually\n' +
      'distinguishable. Cover the names and read them. If you cannot tell who\n' +
      'wrote which, the app has one reader in three hats -- fix the persona\n' +
      'paragraphs in src/lib/prompt/readers.ts, not the code.\n',
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
  for (const word of [
    'kerjaya', 'hala tuju', 'sembang', 'awak',
    'tempoh', 'kerana', 'iaitu', 'ianya', 'manakala', 'seronok', 'kelmarin',
  ]) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) problems.push(`Malay word "${word}"`);
  }

  // Greeting or self-introduction in the opening.
  const opening = text.slice(0, 90);
  if (/\b(halo|hai|selamat (pagi|siang|sore|malam)|salam)\b/i.test(opening)) {
    problems.push(`greeting in opening: "${opening.split('\n')[0].slice(0, 50)}"`);
  }
  if (new RegExp(`^\\s*${reader}\\b`, 'i').test(text)) problems.push('opens with own name');

  // Card names must survive verbatim, in English.
  for (const p of picks) {
    const name = CARDS[p.id].name;
    if (!text.includes(name)) problems.push(`card name missing or translated: "${name}"`);
  }

  // Therapy / medical / legal / financial instruction.
  for (const word of [
    'trauma', 'terapi', 'terapis', 'diagnosis', 'menyembuhkan', 'penyembuhan',
    'inner child', 'kesehatan mental', 'depresi', 'obat', 'dokter',
  ]) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) problems.push(`forbidden topic "${word}"`);
  }

  // Each paragraph of a spread must open with the reader's own framing. This
  // is what makes Margaret's "Yang telah berlalu" differ from Adrian's "Yang
  // udah lewat"; two of three readers ignored it on the first run.
  if (service === 'spread3') {
    for (const label of deps.framing as string[]) {
      if (!text.includes(label)) problems.push(`position framing missing: "${label}"`);
    }
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

main().catch((err) => {
  console.error('\nsmoke failed:', err);
  process.exit(1);
});
