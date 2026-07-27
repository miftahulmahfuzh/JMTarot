/**
 * The anti-tally check (V3 §7). VD2's THIRD line of defence.
 *
 * The first is mechanical and is the one that matters: the counts are deleted
 * from both prompts, so the model cannot recite a figure it was never given.
 * The second is instruction — both prompts forbid it in as many words, and
 * restate the prohibition after the thing that invites elaboration. This is the
 * third: a grep over what actually came back.
 *
 * A MODULE AND NOT A STRING LIST IN THE SMOKE SCRIPT (V3-9). The Malay list can
 * live inline because eleven Malay-only words have no false positives in
 * Indonesian. THIS LIST DOES: `sekali` also means "very", `once` also means "as
 * soon as", and banning a bare `dua` would ban `dua kartu itu` — "those two
 * cards" — which is the most natural way to refer to the pair the whole feature
 * is about. That is CLAUDE.md's `lagi` trap in a new costume: a bare pattern
 * fired on most sentences of casual Indonesian and reported a ~90% callback rate
 * that was entirely noise. A list with false positives needs a false-positive
 * corpus, and a corpus needs a unit test, and a unit test needs a module.
 *
 * TWO TIERS (V3-10), on W7's blocklist precedent and for its stated reason: a
 * scanner that flags legitimate output is a scanner somebody switches off within
 * a week, and then nothing is checked at all. FAIL is anchored — a number word
 * bolted to `kali`/`times`, or a digit. WARN is the ambiguous single words, which
 * print and are read by a person.
 *
 * IT NEVER RUNS AT REQUEST TIME (V3-11). M14 says a failed generation renders
 * nothing, so a false positive in the route would delete the feature for that
 * user with nothing on screen and nothing to tell them. A heuristic is allowed
 * to fail a build; it is not allowed to fail a person.
 *
 * PURE, and NO `server-only`: `scripts/smoke-llm.ts` imports it and the marker
 * throws outside a Next server bundle. Same rule as `@/lib/copy/vocab`.
 */
import type { Locale } from '@/data/types';

export type TallyHit = { tier: 'fail' | 'warn'; pattern: string };

type Rule = { tier: 'fail' | 'warn'; pattern: RegExp; label: string };

/**
 * Both locales, always. The digit rule is the strongest one in the file and it
 * is language-independent; `2×` is the shape a model reaches for when it is
 * squeezed, in either language.
 */
const BOTH: Rule[] = [
  { tier: 'fail', pattern: /\d/, label: 'a digit' },
  // The `2×` shape. `\d` already catches it with the number attached; this
  // catches `The Moon ×` and the multiplication sign used on its own.
  { tier: 'fail', pattern: /[×✕]|(?<=\s)x(?=\s*\d)/, label: 'a × multiplier' },
];

/**
 * EVERY INDONESIAN PATTERN IS MULTI-WORD OR ANCHORED TO `kali`, deliberately.
 * `kali` alone is also "time" in the sense of an occasion and appears in
 * ordinary prose; a number word in front of it is what makes it a tally.
 */
const ID: Rule[] = [
  {
    tier: 'fail',
    pattern:
      /\b(dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas)\s+kali\b/i,
    label: 'a spelled-out count of times',
  },
  { tier: 'fail', pattern: /\bdua\s+belas\s+kali\b/i, label: '"dua belas kali"' },
  { tier: 'fail', pattern: /\bberapa\s+kali\b/i, label: '"berapa kali"' },
  { tier: 'fail', pattern: /\b(sekali|dua\s+kali)\s+lipat\b/i, label: 'a multiple' },
  // "both of them", which is a two-count wearing a pronoun.
  { tier: 'fail', pattern: /\bdua-duanya\b/i, label: '"dua-duanya"' },
  {
    tier: 'fail',
    pattern: /\b(satu|dua|tiga|empat|lima)\s+(bacaan|kartu\s+yang\s+sama)\b/i,
    label: 'a counted reading or repeated card',
  },
  {
    tier: 'fail',
    pattern:
      /\bmuncul\s+(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\b/i,
    label: '"muncul <number>"',
  },
  { tier: 'fail', pattern: /\b(jumlahnya|hitungannya)\b/i, label: 'the tally, named' },

  // WARN. Each has a legitimate use that saves it from the FAIL tier.
  // `sekali` is the intensifier -- `bagus sekali`, `pelan sekali` -- and
  // Adrian's register uses it constantly.
  { tier: 'warn', pattern: /\bsekali\b/i, label: '"sekali" (intensifier, or a count?)' },
  // A soft quantifier rather than a tally. Allowed prose; worth reading.
  { tier: 'warn', pattern: /\bberkali-kali\b/i, label: '"berkali-kali"' },
];

const EN: Rule[] = [
  { tier: 'fail', pattern: /\btwice\b/i, label: '"twice"' },
  { tier: 'fail', pattern: /\bthrice\b/i, label: '"thrice"' },
  {
    tier: 'fail',
    pattern:
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+times\b/i,
    label: 'a spelled-out count of times',
  },
  { tier: 'fail', pattern: /\bboth\s+times\b/i, label: '"both times"' },
  { tier: 'fail', pattern: /\ball\s+(three|four|five)\s+times\b/i, label: '"all N times"' },
  {
    tier: 'fail',
    pattern: /\b(one|two|three|four|five)\s+(readings|draws|of\s+your\s+readings)\b/i,
    label: 'a counted reading',
  },
  {
    tier: 'fail',
    pattern: /\bcame\s+up\s+(one|two|three|four|five|six)\b/i,
    label: '"came up <number>"',
  },
  /*
   * The tally, named. `(?!\s+on\b)` is the one exemption and it is measured
   * against Adrian's register rather than invented: "you can count on it" is
   * ordinary in his voice and is not a tally. The plural and `tallies` are
   * added to the plan's pattern because "the counts" is the exact failing
   * sentence this release is named after.
   */
  {
    tier: 'fail',
    pattern: /\b(the\s+)?(counts?|tall(?:y|ies))\b(?!\s+on\b)/i,
    label: 'the tally, named',
  },

  // WARN. `once` is the temporal conjunction -- "once you decide", "once the
  // week turns" -- far more often than it is a count.
  { tier: 'warn', pattern: /\bonce\b/i, label: '"once" (conjunction, or a count?)' },
  { tier: 'warn', pattern: /\bnumber\s+of\b/i, label: '"number of"' },
  { tier: 'warn', pattern: /\bseveral\s+times\b/i, label: '"several times"' },
];

/** Escape a catalog string so it can be removed as a literal. */
function escapeLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Tally-shaped problems in one generated line.
 *
 * THE WINDOW PHRASE IS STRIPPED FIRST, AND THAT IS NOT A NICETY.
 * `memory.frequency.windows.d13` is `Tiga belas hari terakhir` — a spelled-out
 * number — and `d666` is `666 hari terakhir` / `The last 666 days`, which
 * contains digits. The prompt INSTRUCTS the model to say the phrase. So a naive
 * `/\d/` fails a correct line, on a window that is on `VERDICT_LADDER`. Strip
 * every occurrence, case-insensitively, before matching anything.
 *
 * The day summary passes no phrase, because it names a day and not a window.
 */
export function tallyProblems(
  text: string,
  opts: { locale: Locale; windowPhrase?: string },
): TallyHit[] {
  let haystack = text;
  if (opts.windowPhrase && opts.windowPhrase.trim() !== '') {
    haystack = haystack.replace(new RegExp(escapeLiteral(opts.windowPhrase), 'gi'), ' ');
  }

  const rules = [...BOTH, ...(opts.locale === 'id' ? ID : EN)];
  const hits: TallyHit[] = [];
  for (const rule of rules) {
    if (rule.pattern.test(haystack)) hits.push({ tier: rule.tier, pattern: rule.label });
  }
  return hits;
}

/** The `fail` half, which is what a caller pushes into its `problems[]`. */
export function tallyFailures(
  text: string,
  opts: { locale: Locale; windowPhrase?: string },
): TallyHit[] {
  return tallyProblems(text, opts).filter((h) => h.tier === 'fail');
}
