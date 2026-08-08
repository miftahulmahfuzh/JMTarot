/**
 * A NICKNAME IN, AN ORDERED LIST OF WAYS TO SAY IT OUT.
 *
 * Requirement 5 of the brief, `C-D10`: *miftah → mif or tah; jodith → jo; nina → ni
 * or na; anton → ton.* The readers call the querent the way Indonesians actually
 * address each other, and **code enumerates the legal answers while the model picks
 * one** — `effectiveYesNo()`'s rule and `validateChoice`'s rule in a third place
 * (`[F3-3]`). The model is not asked to do Indonesian morphology, because this repo
 * is not asked to predict what a model will invent: it invented *"Pulan"* for The
 * Moon and it will invent `Miftahku`.
 *
 * ── PURE. A LEAF. ZERO IMPORTS. AND THAT IS NOT STYLISTIC (`[F3-1]`) ───────
 *
 * The denylist has to hold a lowercase form of every card name, and importing
 * `CARDS` to derive them would give this module a dependency on `@/data`, which
 * pulls `cards.json` into anything that merely wants to clip a nickname — the edge
 * middleware included. **The list is typed out and `address.test.ts` imports `CARDS`
 * and asserts the coverage: a test may import what the module may not.** The same
 * rule `locale.ts`, `flags.ts`, `prefix.ts`, `origin.ts` and `choice.ts` each keep
 * for their own reason, and every one of those reasons is the same one — *a leaf that
 * acquires one import stops being reachable from one side of the app.*
 *
 * ── THE FULL NICKNAME IS ALWAYS CANDIDATE ZERO (`[F3-2]`) ──────────────────
 *
 * `C-D10`, verbatim: it *"is always candidate zero and is the default. If the
 * derivation produces nothing usable, the readers use the nickname, which is what
 * they do today. **An empty candidate list is a correct outcome, never an error.**"*
 * Eight of the twenty rows in `address.test.ts` return the nickname alone, and that
 * distribution is the point: a derivation refined until it always produces something
 * is how a person ends up being called `Ne`.
 *
 * The ONE case that returns nothing at all is a nickname that is empty after
 * normalisation, where there is no candidate zero to return either.
 *
 * ── TWO HARD CONSTRAINTS, AND THE BIAS BETWEEN THEM ───────────────────────
 *
 * `C-D10`: a minimum length of two, and a denylist checked against both locales,
 * because *"a mechanical clipping of an arbitrary name can land on a word nobody
 * wants shouted at them"*. **A false denial costs a real address form; a false
 * permission costs the app calling somebody something they did not agree to.** So
 * every ambiguous entry is denied — the exception is `gus`, recorded below, which
 * reconciliation `[R19]` left off.
 *
 * ── WHERE THIS DIVERGES FROM THE PLAN, AND WHY THE TABLE WON ──────────────
 *
 * `docs/plans/2026-08-07-chat-voices.md` §8.1 lists `sp st sk sl` among the onset
 * clusters that keep a VCCV boundary together, and §8.3 row 13 expects `Christine →
 * Chris, Christi`, which requires the opposite: `chris·ti·ne`, not `chri·sti·ne`.
 * **The table won, because the table is the test** — and it is also the better
 * answer, since s+stop is not a native Indonesian onset. Only the digraphs and the
 * obstruent+liquid clusters keep a boundary together here.
 */

/** `C-D10`'s minimum. A one-character address form is a typo, not a name. */
export const MIN_ADDRESS_LENGTH = 2;

/**
 * The nickname plus at most two clips.
 *
 * **A list of six invites the model to ROTATE**, and rotating a person's name every
 * bubble is the most artificial thing a group chat can do. Three is *"the name, and
 * one or two ways to shorten it"*, which is what a real group has.
 */
export const MAX_ADDRESS_FORMS = 3;

/** Nuclei. `y` is handled separately — see `isNucleus`. */
const VOWELS = 'aeiou';

/**
 * Two-letter sequences that behave as ONE consonant in Indonesian, on the onset side
 * (`Ngurah → Ngu`) and on the coda side (`bang` has a one-consonant coda, so it is a
 * legal clip and is dropped by the denylist rather than by the shape rules).
 */
const DIGRAPHS = ['ng', 'ny', 'sy', 'kh'];

/**
 * Clusters that may open a syllable, so a VCCV boundary falls BEFORE them.
 *
 * Obstruent+liquid only. `sp st sk sl` are deliberately absent — see the header.
 */
const ONSET_CLUSTERS = [
  'pr',
  'tr',
  'kr',
  'br',
  'dr',
  'gr',
  'fr',
  'pl',
  'kl',
  'bl',
  'gl',
  'fl',
];

/**
 * FOUR GROUPS, AND EACH ONE HAS ITS OWN REASON. `C-D10` says the list is checked
 * against both locales; the English half matters more than it looks, because a
 * candidate is two to four letters and short English strings are where the accidents
 * are.
 *
 *  1. **Terms of address**, because a derived form that IS one turns a name into a
 *     title — calling somebody `Bu` is calling them "ma'am", and `Ayu → Yu` would
 *     have the readers addressing her as an older sibling.
 *  2. **Function words**, because a preposition in the vocative slot reads as broken
 *     grammar: *"eh di, gimana?"* is not a sentence.
 *  3. **Words that are unkind in either locale.** Deliberately over-broad: every
 *     entry here costs at most one clipping, and the thing it prevents is the app
 *     shouting an insult at a person by arithmetic.
 *  4. **JMTarot's own vocabulary**, because a reader calling the querent `Moon`
 *     while The Moon is on the table is confusing — and because `Star`, `Sun` and
 *     `World` are all plausible clips of real names. **`address.test.ts` imports
 *     `CARDS` and asserts this group covers every card name** (`[F3-1]`).
 *
 * **`gus` IS DELIBERATELY NOT HERE**, and it is the one entry where groups 1 and 4
 * collide with real usage. It is an honorific (*Gus Dur*), so a purist would deny
 * it — but `Agus → Gus` is the single most common Indonesian nickname clipping there
 * is, and denying it would leave every Agus in the app with nothing but their full
 * name while a perfectly good clip existed. Reconciliation `[R19]` ruled: F3's
 * judgement, biased toward the denylist, and this is the exception it argued for.
 */
export const ADDRESS_DENYLIST: readonly string[] = [
  // 1. terms of address
  'bu',
  'pak',
  'bpk',
  'mas',
  'mbak',
  'bang',
  'kak',
  'dik',
  'ade',
  'om',
  'tan',
  'nyi',
  'ki',
  'ning',
  'yu',
  'wak',
  'bung',
  'non',
  'neng',
  'mr',
  'ms',
  'sir',
  // 2. function words
  'di',
  'ke',
  'ya',
  'sih',
  'deh',
  'nih',
  'tuh',
  'kok',
  'dong',
  'lah',
  'pun',
  'dan',
  'atau',
  'itu',
  'ini',
  'ada',
  'apa',
  'aku',
  'kau',
  'kamu',
  'dia',
  'nya',
  'the',
  'and',
  'but',
  'for',
  'you',
  'are',
  'was',
  'its',
  // 3. unkind in either locale
  'anj',
  'anjg',
  'bab',
  'beg',
  'gob',
  'gil',
  'kon',
  'mem',
  'mon',
  'tol',
  'ass',
  'arse',
  'cum',
  'dic',
  'dick',
  'fag',
  'hoe',
  'nig',
  'pis',
  'piss',
  'shit',
  'slu',
  'slut',
  'tit',
  'tits',
  'twa',
  'cok',
  'cock',
  'cunt',
  'wank',
  // 4. JMTarot's own vocabulary — every word of every card name, then the rest
  'the',
  'fool',
  'magician',
  'high',
  'priestess',
  'empress',
  'emperor',
  'hierophant',
  'lovers',
  'chariot',
  'strength',
  'hermit',
  'wheel',
  'of',
  'fortune',
  'justice',
  'hanged',
  'man',
  'death',
  'temperance',
  'devil',
  'tower',
  'star',
  'moon',
  'sun',
  'judgement',
  'world',
  'thes',
  'marg',
  'adri',
  'tarot',
  'kartu',
  'card',
];

const DENIED = new Set(ADDRESS_DENYLIST);

/** Latin letters, an apostrophe or a hyphen. Anything else and derivation stops. */
const LATIN_STEM = /^[A-Za-z'-]+$/;

/**
 * `ch.length === 1` FIRST, BECAUSE A WORD BOUNDARY IS NOT A VOWEL. `''.includes('')`
 * is true, so an empty neighbour once made every word-final `y` a glide and `Rizky`
 * derived nothing at all.
 */
function isVowel(ch: string): boolean {
  return ch.length === 1 && VOWELS.includes(ch);
}

/**
 * `y` IS A NUCLEUS ONLY BETWEEN CONSONANTS, and this is what stops the syllabifier
 * emitting a syllable with no vowel in it.
 *
 * `Rizky` is `riz·ky` and `ky` is not a form anybody could be called, so it is
 * dropped in refinement; `Ayu` is `a·yu` and not `a·y·u`, because there the `y` is a
 * glide between two vowels. Both are §8.3 rows (17 and 14).
 */
function isNucleus(lower: string, i: number): boolean {
  const ch = lower[i];
  if (isVowel(ch)) return true;
  if (ch !== 'y') return false;
  const before = i > 0 ? lower[i - 1] : '';
  const after = i + 1 < lower.length ? lower[i + 1] : '';
  return !isVowel(before) && !isVowel(after);
}

/**
 * The ordinary schoolbook rule, not a phonology engine:
 *
 *   V      -> nucleus
 *   VCV    -> V-CV      the single consonant goes with the following vowel
 *   VCCV   -> VC-CV     split, UNLESS the CC is a digraph or an onset cluster
 *   VCCCV  -> VC-CCV
 *   final consonants attach to the preceding vowel
 *
 * A stem with no nucleus at all syllabifies to nothing, which is `Bob`'s and `M`'s
 * answer: an empty pool, and therefore the nickname alone.
 */
function syllabify(stem: string): string[] {
  const lower = stem.toLowerCase();
  const nuclei: number[] = [];
  for (let i = 0; i < lower.length; i += 1) if (isNucleus(lower, i)) nuclei.push(i);
  if (nuclei.length === 0) return [];

  const cuts: number[] = [];
  for (let k = 0; k + 1 < nuclei.length; k += 1) {
    const a = nuclei[k];
    const b = nuclei[k + 1];
    const gap = b - a - 1;
    if (gap <= 1) {
      cuts.push(a + 1);
      continue;
    }
    const pair = lower.slice(a + 1, a + 3);
    if (gap === 2 && (DIGRAPHS.includes(pair) || ONSET_CLUSTERS.includes(pair))) {
      cuts.push(a + 1);
      continue;
    }
    cuts.push(a + 2);
  }

  const parts: string[] = [];
  let from = 0;
  for (const cut of cuts) {
    parts.push(stem.slice(from, cut));
    from = cut;
  }
  parts.push(stem.slice(from));
  return parts.filter((p) => p.length > 0);
}

/** The trailing consonant run, with a digraph counted as one consonant. */
function codaLength(lower: string): number {
  let end = lower.length;
  while (end > 0 && !isVowel(lower[end - 1])) end -= 1;
  const coda = lower.slice(end);
  if (coda.length === 0) return 0;
  if (coda.length === 2 && DIGRAPHS.includes(coda)) return 1;
  if (coda.length === 3 && DIGRAPHS.includes(coda.slice(1))) return 2;
  return coda.length;
}

function hasOnset(lower: string): boolean {
  return lower.length > 0 && !isVowel(lower[0]) && lower[0] !== 'y';
}

function hasVowelNucleus(lower: string): boolean {
  for (const ch of lower) if (isVowel(ch)) return true;
  return false;
}

/** (a) and (b) of step 7: the shape rules, which no amount of extending can fix. */
function shapeOk(candidate: string): boolean {
  const lower = candidate.toLowerCase();
  return hasOnset(lower) && hasVowelNucleus(lower) && codaLength(lower) < 2;
}

/**
 * Step 7, in order, and the ORDER IS THE ALGORITHM:
 *
 *   a. no onset consonant, or no vowel at all  -> drop. `an` from Anton, `ky` from
 *      Rizky. A vocative with no onset is not how anyone is addressed, and a
 *      vocative with no vowel is not a word.
 *   b. a coda of two or more consonants        -> drop. `dith` from Jodith:
 *      Indonesian codas are one consonant.
 *   c. shorter than the minimum                -> extend rightwards one letter at a
 *      time, re-testing (a) and (b).
 *   d. on the denylist                         -> extend rightwards by ONE letter
 *      and re-test once. `bu` -> `bud`. If it still trips, drop.
 */
function refine(candidate: string, stem: string, startsAt: number): string | null {
  if (!shapeOk(candidate)) return null;

  let form = candidate;
  while (form.length < MIN_ADDRESS_LENGTH) {
    const next = stem.slice(startsAt, startsAt + form.length + 1);
    if (next.length === form.length) return null; // the stem ran out
    form = next;
    if (!shapeOk(form)) return null;
  }

  if (DENIED.has(form.toLowerCase())) {
    const extended = stem.slice(startsAt, startsAt + form.length + 1);
    if (extended.length === form.length) return null;
    if (!shapeOk(extended) || DENIED.has(extended.toLowerCase())) return null;
    form = extended;
  }

  return form;
}

/**
 * Re-case a survivor to the nickname's own convention: a leading capital if the
 * nickname carries one, otherwise exactly as it was sliced. `MIFTAH` keeps `MIF`
 * rather than becoming `Mif`, because the slice already agrees with how the person
 * types their own name.
 */
function recase(form: string, nickname: string): string {
  const first = nickname[0];
  if (first !== first.toUpperCase()) return form;
  return form[0].toUpperCase() + form.slice(1);
}

/**
 * The candidate list, nickname first.
 *
 * **NEVER THROWS. NEVER RETURNS A ONE-CHARACTER DERIVED FORM. NEVER RETURNS MORE
 * THAN `MAX_ADDRESS_FORMS`.** The prompt is handed this list and told it may use any
 * member or none; `validateTurn` refuses a vocative outside it and the turn is
 * retried once (`[F3-3]`, `C-R7`).
 */
export function addressForms(nickname: string): string[] {
  // 1. NORMALISE.
  const name = nickname.trim().replace(/\s+/g, ' ');
  if (name.length === 0) return [];

  // 3. THE STEM IS THE FIRST WORD, so "Ayu Lestari" derives out of "Ayu" alone.
  const stem = name.split(' ')[0];

  /*
   * 4. Derivation is defined for Latin orthography only. A mechanical clip of a
   * script we cannot syllabify is exactly the *"word nobody wants shouted at them"*
   * `C-D10` warns about, so we do not guess — the nickname is the answer.
   */
  if (!LATIN_STEM.test(stem)) return [name];

  const syllables = syllabify(stem);

  /*
   * 6. THE POOL. **The n>=3 case is not symmetry, it is Indonesian usage:**
   * Wulandari clips to Wulan, never to "ri"; Miftahul clips to Mif and Mifta, never
   * to "hul". A one-syllable name has no shorter form at all (`[F3-2]`).
   */
  const pool: Array<{ form: string; at: number }> = [];
  if (syllables.length === 2) {
    pool.push({ form: syllables[0], at: 0 });
    pool.push({ form: syllables[1], at: syllables[0].length });
  } else if (syllables.length >= 3) {
    pool.push({ form: syllables[0], at: 0 });
    pool.push({ form: syllables[0] + syllables[1], at: 0 });
  }

  const out = [name];
  const seen = new Set([name.toLowerCase()]);
  for (const { form, at } of pool) {
    if (out.length >= MAX_ADDRESS_FORMS) break;
    const refined = refine(form, stem, at);
    if (refined === null) continue;
    const cased = recase(refined, name);
    if (seen.has(cased.toLowerCase())) continue;
    seen.add(cased.toLowerCase());
    out.push(cased);
  }
  return out;
}
