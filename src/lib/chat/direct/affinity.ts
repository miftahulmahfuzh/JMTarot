/**
 * WHICH READER THE QUESTION IS FOR — computed in code, handed over as a HINT.
 *
 * ── PURE, A LEAF. No `server-only`, no `process.env`, no `@/lib/db`, no `@/lib/llm`.
 *
 * `choice.ts`'s shape and for its reason: every rule here is a string transform, so
 * `npm test` can drive all of it, and a module that reached the provider could not be.
 *
 * ── WHY A HINT AND NOT A DERIVATION (`[F2-4]`) ─────────────────────────────
 *
 * `effectiveYesNo()`'s rule is *where code can enumerate the answer, code decides and
 * the model is handed the result*. A model asked to derive affinity from three persona
 * blocks would need those blocks in the prompt — ~2,400 characters of
 * `CHAT_READER_PROMPTS_*` in a prompt whose whole job is a routing decision, in front
 * of a model that is **not** supposed to be writing in anybody's voice (`[F2-2]`). And
 * it would be unmeasurable. A code-side score is a unit test.
 *
 * ── WHY A HINT AND NOT A VERDICT ──────────────────────────────────────────
 *
 * **This is the one place in this repo where the model is licensed to overrule a
 * code-derived value, and it is deliberate.** `effectiveYesNo()` is a fact about a card
 * and the model may not contradict it. Affinity is a guess about a person, and the
 * naturalness cost of always obeying it is severe: **a router that always routes is a
 * switchboard.** Adrian answering a career question because he happens to have
 * something to say about how tired the querent sounds is *better* than Thessaly
 * answering it correctly. `[C-N1]` beats correctness here, and prompt rule 4 says so in
 * the model's own language.
 *
 * ── WHY BUCKETS AND NOT A NUMBER ──────────────────────────────────────────
 *
 * `dominanceOf`'s rule (V3-5): **a bucket cannot be recited as a figure and cannot be
 * compared arithmetically.** A director handed `thessaly: 0.73` reasons about 0.73; a
 * director handed `thessaly=kuat` reasons about Thessaly.
 */
import type { Locale, ReaderId } from '@/data/types';

export type Topic =
  | 'career'
  | 'direction'
  | 'problem' // Thessaly
  | 'self'
  | 'inner'
  | 'family' // Margaret
  | 'love'
  | 'feelings'
  | 'short_term'; // Adrian

export type AffinityBucket = 'strong' | 'some' | 'none';

export type Affinity = {
  by: Record<ReaderId, AffinityBucket>;
  /** The single `strong` reader, or null on a tie and when nothing matched. */
  lead: ReaderId | null;
};

/**
 * THREE TOPICS PER READER, IN THE ORDER `readers.json` LISTS THEIR SPECIALTIES.
 *
 * **The mapping is a literal rather than derived from the specialty strings**, because
 * `"Keputusan karier"` tokenizes to `keputusan` — an ordinary Indonesian word that
 * matches half of everything — and `"Penyelesaian masalah"` to `penyelesaian`, which a
 * querent never types. A derivation off display copy would be a worse table with the
 * appearance of having no table.
 *
 * **The TEST is what stops the two drifting**: `affinity.test.ts` asserts every reader
 * has exactly `specialties[locale].length` topics in both locales, so adding a fourth
 * specialty to `readers.json` is a red test rather than a silently ignored line.
 */
export const READER_TOPICS: Record<ReaderId, readonly [Topic, Topic, Topic]> = {
  thessaly: ['career', 'direction', 'problem'],
  margaret: ['self', 'inner', 'family'],
  adrian: ['love', 'feelings', 'short_term'],
};

/**
 * The lexicon. **Terms a querent types, not words a reader would use.**
 *
 * `en` is a REWRITE and not a translation, on `## Localization` rule 3's reasoning
 * applied to data: an English querent says *"stuck"* and *"should i"*, not the English
 * words for *buntu* and *mending*.
 */
export const TOPIC_TERMS: Record<Locale, Record<Topic, readonly string[]>> = {
  id: {
    career: [
      'kerja', 'kerjaan', 'kantor', 'karier', 'atasan', 'bos', 'gaji', 'resign',
      'lamaran', 'interview', 'promosi', 'proyek', 'klien', 'bisnis', 'usaha',
      'jurusan', 'kuliah', 'skripsi',
    ],
    direction: [
      'arah', 'tujuan', 'masa depan', 'pindah', 'rencana', 'langkah', 'lanjut',
      'kelanjutan', 'pilih jalan', 'ke mana', 'jalan hidup', 'berhenti atau',
    ],
    problem: [
      'masalah', 'buntu', 'macet', 'gagal', 'kacau', 'berantakan', 'rumit', 'susah',
      'solusi', 'jalan keluar', 'tenggat', 'deadline', 'utang', 'biaya', 'cicilan',
      'ribet',
    ],
    self: [
      'diri', 'diri sendiri', 'jati diri', 'siapa aku', 'siapa saya', 'berubah',
      'tumbuh', 'pantas', 'berharga', 'arti hidup', 'makna', 'sudah cukup',
    ],
    inner: [
      'batin', 'hati', 'renung', 'tenang', 'gelisah', 'sepi', 'sendirian', 'kosong',
      'damai', 'mimpi', 'doa', 'ikhlas', 'pasrah',
    ],
    family: [
      'ibu', 'ayah', 'bapak', 'mama', 'papa', 'orang tua', 'kakak', 'adik', 'anak',
      'keluarga', 'nenek', 'kakek', 'saudara', 'rumah', 'mertua', 'sepupu',
    ],
    love: [
      'pacar', 'mantan', 'gebetan', 'suami', 'istri', 'jodoh', 'cinta', 'hubungan',
      'putus', 'nikah', 'selingkuh', 'ldr', 'sama dia', 'tunangan', 'taaruf', 'pdkt',
    ],
    feelings: [
      'perasaan', 'sedih', 'marah', 'kecewa', 'capek', 'lelah', 'takut', 'cemas',
      'malu', 'iri', 'kangen', 'baper', 'insecure', 'minder', 'sakit hati',
      'nggak enak',
    ],
    short_term: [
      'hari ini', 'besok', 'minggu ini', 'nanti', 'sekarang', 'mending', 'sebaiknya',
      'jadi nggak', 'jadi apa nggak', 'buruan', 'keburu',
    ],
  },
  en: {
    career: [
      'work', 'job', 'office', 'career', 'boss', 'manager', 'salary', 'pay', 'quit',
      'resign', 'application', 'interview', 'promotion', 'project', 'client',
      'business', 'degree', 'thesis',
    ],
    direction: [
      'direction', 'where i am going', 'purpose', 'move', 'plan', 'next step', 'path',
      'which way', 'stay or go', 'life is heading',
    ],
    problem: [
      'problem', 'stuck', 'dead end', 'failing', 'mess', 'messy', 'complicated',
      'hard', 'solution', 'way out', 'deadline', 'debt', 'cost', 'bills',
    ],
    self: [
      'myself', 'who i am', 'identity', 'change', 'grow', 'worth', 'worthy', 'meaning',
      'point of it', 'good enough',
    ],
    inner: [
      'inner', 'spirit', 'quiet', 'restless', 'lonely', 'alone', 'empty', 'peace',
      'dream', 'pray', 'let go', 'surrender',
    ],
    family: [
      'mother', 'mum', 'father', 'dad', 'parents', 'brother', 'sister', 'son',
      'daughter', 'family', 'grandmother', 'grandfather', 'home', 'in-laws', 'cousin',
    ],
    love: [
      'boyfriend', 'girlfriend', 'partner', 'ex', 'husband', 'wife', 'love',
      'relationship', 'break up', 'broke up', 'marry', 'married', 'cheating',
      'long distance', 'crush',
    ],
    feelings: [
      'feel', 'feeling', 'sad', 'angry', 'upset', 'tired', 'exhausted', 'scared',
      'anxious', 'ashamed', 'jealous', 'miss him', 'miss her', 'insecure', 'hurt',
    ],
    short_term: [
      'today', 'tomorrow', 'this week', 'tonight', 'right now', 'should i', 'better to',
      'or not', 'in time',
    ],
  },
};

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * WORD-BOUNDED WITH EXPLICIT LOOKAROUNDS AND NOT `\b`, which is ASCII-only and would
 * misjudge any message with a non-ASCII letter beside a term. **`validateChoice`'s rule
 * verbatim, and its worked failure is the one this inherits**: the bounds are what stop
 * `aya` matching inside `ayam`, and here they stop `ex` matching inside `next` and `hati`
 * inside `perhatian`.
 *
 * **A HYPHEN COUNTS AS A BOUNDARY, WHICH IS A TRADE AND NOT AN OVERSIGHT.** It costs
 * Indonesian reduplication — `hati-hati` ("be careful") matches the `inner` term `hati` —
 * and it buys the enclitic shape `deadline-nya`, which is what people actually type and
 * which appears in this workstream's own worked example. **A wrong hint is overrulable by
 * prompt rule 4; a missed one is not**, and `affinity.test.ts` pins both halves so the
 * false positive cannot be "fixed" without noticing what it would break.
 */
function mentions(text: string, term: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(term)}(?![\\p{L}\\p{N}])`, 'iu').test(text);
}

/** How many of a reader's three topics the text touches at all. `0..3`. */
function topicsHit(text: string, locale: Locale, reader: ReaderId): number {
  const lexicon = TOPIC_TERMS[locale];
  return READER_TOPICS[reader].filter((topic) => lexicon[topic].some((t) => mentions(text, t)))
    .length;
}

const READERS: readonly ReaderId[] = ['thessaly', 'margaret', 'adrian'];

/**
 * The hint.
 *
 * **TWO THINGS THIS SCORE DELIBERATELY DOES NOT DO:**
 *
 * 1. **Distinct topics, never term occurrences.** A message that says *kerja* five
 *    times is one topic, not five. Repetition is emphasis, not evidence, and counting
 *    occurrences would make a long anxious message about work outrank a short precise
 *    one.
 * 2. **No length normalisation and no ratio.** `provider-comparison.md`'s `jaccard()`
 *    is this repo's own cautionary tale — a measure with no length normalisation
 *    *rewards a model for writing less*, and two of that file's published numbers were
 *    wrong because of it. **A bucket over a small integer has nothing to normalise**,
 *    which is the cheapest available way to be right.
 *
 * `opts.recentlySpoke` is the previous run's cast, and it demotes rather than rotates:
 * affinity is stable and a querent's concerns are not evenly distributed, so three
 * consecutive messages about a partner would hand Adrian three consecutive runs and the
 * room would have one reader in it. **The demotion never silences anybody** (it never
 * goes below `some`) and **never fires when nobody else matched anything** — a demotion
 * that produced an empty hint would be worse than a repeated reader. It is a nudge in
 * the hint, not a rotation in code: a code-side rotation is a rota, and a rota is a
 * switchboard.
 */
export function affinityFor(
  text: string,
  locale: Locale,
  opts?: { recentlySpoke?: readonly ReaderId[] },
): Affinity {
  const raw = new Map<ReaderId, number>(
    READERS.map((reader) => [reader, text.trim() === '' ? 0 : topicsHit(text, locale, reader)]),
  );
  const anyMatched = [...raw.values()].some((n) => n > 0);

  const by = {} as Record<ReaderId, AffinityBucket>;
  for (const reader of READERS) {
    const hits = raw.get(reader) ?? 0;
    const soleClaim = hits === 1 && [...raw.entries()].every(([r, n]) => r === reader || n === 0);
    by[reader] = hits >= 2 || soleClaim ? 'strong' : hits >= 1 ? 'some' : 'none';
  }

  const recent = new Set(opts?.recentlySpoke ?? []);
  for (const reader of READERS) {
    if (by[reader] !== 'strong' || !recent.has(reader)) continue;
    const somebodyElse = READERS.some((other) => other !== reader && by[other] !== 'none');
    if (somebodyElse) by[reader] = 'some';
  }

  const strong = READERS.filter((reader) => by[reader] === 'strong');
  return { by, lead: anyMatched && strong.length === 1 ? strong[0] : null };
}
