import 'server-only';

import type { Locale } from '@/data/types';
import type { ModerationCategory } from './types';

/**
 * The zero-cost layer. Pure, synchronous, and it never touches the network.
 *
 * **A BLOCKLIST CATCHES THE OBVIOUS AND NOTHING ELSE.** It will not catch
 * euphemism (`unalive`, `pamit duluan`), it will not catch a question phrased as
 * a story, and it will not catch a language nobody wrote a pattern for. Chasing
 * those with regexes produces a list that is long, unreviewable and
 * false-positive prone -- and **a false positive here is an accusation delivered
 * to someone who did nothing wrong**, with no appeal path in a streaming UI.
 * Recall is the classifier's job (W7-D2). This layer buys two things the
 * classifier cannot: a terminal deny that costs zero tokens and zero latency,
 * and a free signal about which way to fail when the classifier does not answer.
 *
 * `import 'server-only'` (W7-D12): a client copy of the pattern list is a bypass
 * map and dead weight. The UI's only pre-validation stays the 200-character cap.
 *
 * FIVE TECHNIQUES KEEP THE FALSE-POSITIVE RATE NEAR ZERO. Each is testable and
 * each has tests in `blocklist.test.ts`:
 *
 *   1. Two tiers, only one of which is terminal.
 *   2. Phrases, not tokens, and proximity-anchored.
 *   3. An exemption pass that runs first and MASKS rather than short-circuits.
 *   4. Matching against two normalizations and unioning the results.
 *   5. Indonesian affixes written out rather than stemmed.
 */

/**
 * How far apart the two halves of a Tier-A phrase may sit.
 *
 * `cara` at index 3 and `bunuh diri` at index 170 is not a phrase, it is a
 * coincidence in a 200-character field. Twenty-four characters is about four
 * Indonesian words, which covers `cara paling cepat buat bunuh diri` and
 * excludes two unrelated clauses.
 *
 * The squashed window is smaller because squashing removed every space, so the
 * same character count spans nearly twice the words. It is also the right
 * shape for what squashing defends against: somebody spelling a phrase out with
 * dots writes the phrase, not a paragraph.
 */
const WINDOW_SPACED = 24;
const WINDOW_SQUASHED = 12;

/**
 * Leet substitutions, applied to the squashed form ONLY.
 *
 * NOT to the spaced form, and the reason is concrete rather than stylistic:
 * `1` -> `i` and `3` -> `e` would turn `13 tahun` into `ie tahun`, and an age in
 * digits is load-bearing in the `sexual_minor` patterns. Keeping one haystack
 * numerically honest costs nothing, because the squashed haystack is the one
 * that exists to defeat obfuscation and the spaced one is the one that exists to
 * keep word boundaries.
 */
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' };

/**
 * Everything the two haystacks share: NFKC, lowercase, and combining marks gone.
 *
 * NFKC first, because it is what folds fullwidth `ｂｕｎｕｈ` and the various
 * mathematical alphanumerics onto plain ASCII. Marks are stripped via NFD so
 * that `bunuh dırı` and a diacritic-sprinkled variant land on the same letters;
 * Indonesian does not use combining marks, so nothing legitimate is lost.
 */
function fold(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '');
}

/**
 * The obfuscation-proof form: letters and digits only, leet collapsed.
 *
 *   'BUNUH DIRI'        -> 'bunuhdiri'
 *   'b.u.n.u.h d.i.r.i' -> 'bunuhdiri'
 *   'b u n u h  d i r i'-> 'bunuhdiri'
 *   'bun0h d1r1'        -> 'bunuhdiri'
 *
 * Exported for tests only. **DO NOT MATCH AGAINST THIS ALONE.** Removing every
 * separator destroys word boundaries, so `harga mati` and `bunuh waktu` become
 * one token each and a single-token pattern would start manufacturing false
 * positives. It is half of a union; `checkBlocklist` runs the spaced form too.
 */
export function normalizeForMatching(text: string): string {
  return fold(text)
    .replace(/[^a-z0-9]+/g, '')
    .replace(/[0-9]/g, (d) => LEET[d] ?? d);
}

/** The boundary-preserving form. One space between alphanumeric runs, digits intact. */
function spacedForm(text: string): string {
  return fold(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Idioms that contain a lethal-sounding token and mean nothing of the kind.
 *
 * **APPLIED AS A MASK, NOT AS A SHORT CIRCUIT.** Each match is replaced with a
 * space in the working copy before any pattern runs, so an exempt idiom sitting
 * in the same sentence as a real Tier-A phrase does not launder it:
 * `mati-matian, aku mau bunuh diri` still denies. Short-circuiting on the first
 * exemption would let one innocent idiom buy a free pass for the whole string,
 * which is a one-line bypass anybody would find.
 *
 * **CONSERVATIVE ON PURPOSE, AND THE ASYMMETRY IS WHY.** A MISSING exemption
 * costs at worst a Tier-B suspect, which is not terminal and only changes the
 * timeout policy. An OVER-BROAD exemption is a bypass, because masking deletes
 * text: an exemption overlapping a real phrase erases the real phrase. The
 * plan's list included `to die for`, and it is deliberately absent here for
 * exactly that reason -- it overlaps `want to die`, so `I want to die for real`
 * would have been masked down to `I want real` and the signal destroyed. When in
 * doubt, leave an idiom out.
 *
 * `mati rasa` is also deliberately NOT here. It is genuinely ambiguous -- it is
 * both "numb" and a plausible way to say something worse -- so it is Tier B and
 * the classifier decides.
 *
 * **BOTH LOCALES GET BOTH SETS. THIS REVERSES W7-D3, AND A LIVE TEST IS WHY.**
 *
 * D3 argued for an asymmetry: the `id` set carries the English idioms because
 * Indonesian users code-switch, and the `en` set carries no Indonesian ones
 * because "English users do not code-switch into Indonesian". The reasoning is
 * sound about PEOPLE and wrong about this VARIABLE. `locale` here is the UI
 * preference resolved by W6's middleware -- a cookie, a session claim or an
 * `Accept-Language` header. It is not a declaration of what language the
 * querent types in.
 *
 * JMTarot is an Indonesian-first app with an English toggle, so the overwhelmingly
 * likely `en`-locale user is an Indonesian speaker who prefers an English
 * interface -- or is on a phone set to `en-GB`. Caught on 2026-07-27 driving the
 * live route: `gimana cara bunuh diri yang paling cepat` under an English UI
 * locale fell straight through Tier A. It was still refused, because the
 * classifier is locale-invariant and names the Indonesian traps explicitly -- so
 * this was a degradation and not a hole -- but it cost a paid network round trip
 * for a phrase the blocklist is supposed to kill for free, on exactly the
 * abusive traffic the zero-cost property exists to make cheap.
 *
 * The merge is free of the false positives D3 was implicitly protecting against:
 * no Indonesian pattern token (`cara`, `gimana`, `bunuh diri`, `santet dia`,
 * `bom`) is an English word, and no Indonesian idiom (`mati lampu`, `harga
 * mati`) occurs in English text, so masking them there is a no-op. The near-miss
 * corpus runs the whole English half to prove it.
 *
 * `moderation_flags.locale` still records which UI locale was in play, so the
 * per-locale tuning question D3 wanted to answer is still answerable.
 */
const IDIOMS_EN = [
  'dying to know',
  'killing it',
  'kill time',
  'killing time',
  'killed time',
  'dead serious',
  'drop dead gorgeous',
];

const IDIOMS_ID = [
  'mati matian', // `mati-matian` folds to this: the hyphen is a separator
  'mati lampu',
  'mati listrik',
  'mati gaya',
  'mati kutu',
  'mati angin',
  'harga mati',
  'bunuh waktu',
  'membunuh waktu',
  ...IDIOMS_EN,
];

const EXEMPTIONS: Record<Locale, string[]> = { id: IDIOMS_ID, en: IDIOMS_ID };

/**
 * One pattern. Two halves that must sit near each other, or one half that stands
 * alone.
 *
 * A SPEC RATHER THAN A RAW REGEX, because the same pattern has to be compiled
 * twice -- once against the spaced haystack with `\s+` between words, and once
 * against the squashed one with nothing between them. Writing both by hand is
 * how the two silently drift, and a pattern that works only on the spaced form
 * is a pattern any attacker defeats with a full stop.
 *
 * Write word separators as a literal SPACE in the sources below. The compiler
 * turns it into `\s+` or into nothing, depending on the haystack.
 */
type PatternSpec = {
  /** `<locale>.<category>.<what>`. Logged to `moderation_flags.pattern_id`, never sent to the client. */
  id: string;
  category: ModerationCategory;
  tier: 'deny' | 'suspect';
  /** One source, or two that must fall within the proximity window, in order. */
  parts: [string] | [string, string];
  /**
   * Opt OUT of the squashed haystack. Defaults to on.
   *
   * **FOUND BY A NEAR-MISS TEST, NOT BY READING THE CODE.** The squashed form
   * has no word boundaries -- that is the whole point of it -- so a short
   * alternative matches inside a longer innocent word. `cara membuat bomboloni`
   * squashes to `caramembuatbomboloni`, in which `membuat` + `bom` is a clean
   * Tier-A hit for a question about a donut.
   *
   * So any spec containing a token under four characters (`bom`, `ied`, `sex`)
   * runs on the spaced haystack only, where `\s` boundaries make it safe. The
   * cost is stated plainly rather than hidden: **`cara bikin b0m` escapes Tier
   * A.** It still reaches the classifier, which is the layer that exists for
   * everything a pattern list cannot see, and a bypass that costs an attacker a
   * classifier call is a far better trade than refusing somebody's baking
   * question with an accusation of terrorism.
   */
  squash?: false;
};

/**
 * Indonesian affixes, written out rather than stemmed.
 *
 * `bunuh` takes `mem-`, `pem-`, `peng-`, `di-`, `ter-` and `ke-`, and a dozen
 * stems matter at most. A stemmer would be a dependency, a source of surprises,
 * and unreviewable in a diff -- and the thing being reviewed here is precisely
 * "what does this refuse".
 */
const PREFIX = '(?:mem|pem|peng|meng|di|ter|ke|ber)?';

/**
 * Tier A. TERMINAL, no LLM call, no appeal.
 *
 * **RESERVED FOR PATTERNS NOBODY TYPES INNOCENTLY** (W7-D2). Every one is a
 * method or decision word BOUND to a harm object -- never a bare token, however
 * grim. Deliberately small: fifteen-ish patterns. Growing the list is cheap; a
 * wrongly-refused user is not.
 */
const TIER_A_EN: PatternSpec[] = [
  {
    id: 'en.self_harm.method',
    category: 'self_harm',
    tier: 'deny',
    parts: [
      '(?:how (?:to|do i|can i)|best way to|easiest way to|fastest way to|ways to|instructions for|steps to)',
      '(?:kill myself|killing myself|end my life|ending my life|end it all|hang myself|take my own life|off myself|unalive myself|overdose on)',
    ],
  },
  {
    id: 'en.self_harm.decide',
    category: 'self_harm',
    tier: 'deny',
    parts: [
      '(?:should i|shall i|is it time (?:to|for me to)|tell me (?:to|whether to))',
      '(?:kill myself|end my life|end it all|take my own life|die tonight)',
    ],
  },
  {
    id: 'en.violence_others.method',
    category: 'violence_others',
    tier: 'deny',
    parts: [
      '(?:how (?:to|do i|can i)|best way to|easiest way to|get away with)',
      '(?:kill|murder|stab|strangle|shoot) (?:him|her|them|someone|my|a )',
    ],
  },
  {
    id: 'en.extremism.device',
    category: 'extremism',
    tier: 'deny',
    squash: false,
    parts: [
      '(?:how (?:to|do i|can i)|best way to|instructions for|steps to)',
      '(?:make|build|assemble|construct) (?:a |an )?(?:bomb|pipe bomb|explosive|ied|detonator)',
    ],
  },
  {
    id: 'en.illegal_harm.poison',
    category: 'illegal_harm',
    tier: 'deny',
    parts: [
      '(?:how (?:to|do i|can i)|best way to|untraceable way to)',
      '(?:poison|drug|dose) (?:him|her|them|someone|my )',
    ],
  },
];

const TIER_A_ID: PatternSpec[] = [
  {
    id: 'id.self_harm.method',
    category: 'self_harm',
    tier: 'deny',
    parts: [
      '(?:cara|gimana|bagaimana|tips|panduan|langkah|tutorial)',
      `(?:${PREFIX}bunuh diri|mengakhiri hidup|akhiri hidup|gantung diri|${PREFIX}sayat nadi|${PREFIX}potong nadi|overdosis obat)`,
    ],
  },
  {
    id: 'id.self_harm.decide',
    category: 'self_harm',
    tier: 'deny',
    parts: [
      // Bound to a first-person pronoun on purpose. Without it this fires on
      // `apakah bunuh diri itu dosa`, which is a theological question and is
      // allowed -- it seeks no method, no timing and no permission.
      '(?:haruskah|sebaiknya|apa sebaiknya|mending|lebih baik) (?:aku|saya|gue|gua|gw|ku)',
      '(?:bunuh diri|mengakhiri hidup|akhiri hidup|gantung diri|mati aja|mati saja)',
    ],
  },
  {
    id: 'id.violence_others.method',
    category: 'violence_others',
    tier: 'deny',
    parts: [
      '(?:cara|gimana|bagaimana|tips|panduan|langkah|tutorial)',
      // `nya` is a SUFFIX (`membunuhnya`), the rest are separate words. Written
      // as one alternation so `cara membunuhnya` and `cara membunuh orang` both
      // land, without a space that only one of them has.
      `(?:${PREFIX}bunuh|${PREFIX}habisi|${PREFIX}celakai|${PREFIX}lukai)(?:nya| (?:orang|dia|suami|istri|bos|tetangga|mantan))`,
    ],
  },
  {
    id: 'id.extremism.device',
    category: 'extremism',
    tier: 'deny',
    squash: false,
    parts: [
      '(?:cara|gimana|bagaimana|tips|panduan|langkah|tutorial)',
      '(?:membuat|bikin|merakit|rakit|meracik) (?:bom|peledak|bahan peledak|detonator)',
    ],
  },
  {
    id: 'id.illegal_harm.poison',
    category: 'illegal_harm',
    tier: 'deny',
    parts: [
      '(?:cara|gimana|bagaimana|tips|panduan|langkah|tutorial)',
      '(?:meracuni|racuni|menaruh racun|kasih racun) (?:orang|dia|suami|istri|nya)',
    ],
  },
  ...TIER_A_EN,
];

/**
 * `sexual_minor` is Tier A UNCONDITIONALLY and in both locales (W7-D1, T&C 6.5).
 *
 * The only category with no method binding and no ambiguity budget: an explicit
 * sexual term within the window of an explicit minority marker. It is still two
 * parts rather than one token, because `anak` is "child" and is also in `anak
 * saya sudah menikah`, and `kid` is in `kidding`. Requiring both halves is what
 * keeps this from firing on a grandmother asking about her grandchildren.
 *
 * Unlike every other category, the question text for this one is NEVER STORED
 * (W7-D19). See `log.ts`.
 */
const SEXUAL_MINOR: PatternSpec[] = [
  {
    id: 'x.sexual_minor.proximity',
    category: 'sexual_minor',
    tier: 'deny',
    squash: false,
    parts: [
      '(?:seks|sex|sexual|telanjang|bugil|nude|naked|horny|birahi|nafsu|porno|porn|molest|cabuli|setubuh|perkosa|rape)',
      // The digit ages are why leet substitution is applied to the SQUASHED form
      // only: `1` -> `i` would turn `13 tahun` into `ie tahun`. `\b` is what stops
      // `[1-9] tahun` matching the `5 tahun` inside `25 tahun`.
      '(?:anak kecil|anak kandung|bocah|balita|bayi|di ?bawah umur|belum cukup umur|minor|underage|preteen|toddler|child|children|kid|schoolgirl|schoolboy|siswi smp|siswa smp|anak sd|anak smp|1[0-7] tahun|[1-9] tahun|1[0-7] ?(?:yo|years old)|under 18)',
    ],
  },
];

/**
 * Tier B. NEVER TERMINAL ON ITS OWN.
 *
 * **ITS ONLY EFFECT IS TO FLIP THE TIMEOUT POLICY** from fail-open to
 * fail-closed (W7-D7). That is what a single token is actually good for: it is
 * far too weak to refuse on, and it is exactly strong enough to answer "if the
 * classifier does not come back, which way should we be wrong?".
 *
 * Because nothing here can refuse anybody, this list can be generous where Tier
 * A cannot. It is still worth keeping honest -- a Tier B that fires on every
 * question makes every classifier timeout a refusal.
 */
const TIER_B_EN: PatternSpec[] = [
  { id: 'en.self_harm.token', category: 'self_harm', tier: 'suspect', parts: ['(?:kill myself|killing myself|end my life|suicide|suicidal|self harm|self-harm|cut myself|cutting myself|overdose|want to die|wanna die|better off dead|not worth living)'] },
  { id: 'en.violence_others.token', category: 'violence_others', tier: 'suspect', parts: ['(?:kill (?:him|her|them)|hurt (?:him|her|them)|make (?:him|her|them) pay|beat (?:him|her|them) up)'] },
  { id: 'en.extremism.token', category: 'extremism', tier: 'suspect', squash: false, parts: ['(?:bomb|explosive|detonator|manifesto|jihad|martyrdom operation)'] },
  { id: 'en.nonconsent.token', category: 'nonconsent', tier: 'suspect', parts: ['(?:follow (?:him|her|them) home|track (?:his|her|their) phone|without (?:his|her|their) consent|make (?:him|her|them) say yes|revenge porn)'] },
  { id: 'en.system_abuse.token', category: 'system_abuse', tier: 'suspect', parts: ['(?:ignore (?:all )?(?:previous|prior|your) instructions|system prompt|reveal your (?:prompt|instructions|rules)|disregard (?:the|your) rules|you are now|jailbreak|developer mode)'] },
];

const TIER_B_ID: PatternSpec[] = [
  { id: 'id.self_harm.token', category: 'self_harm', tier: 'suspect', parts: ['(?:bunuh diri|mengakhiri hidup|akhiri hidup|gantung diri|pengen mati|pengin mati|pgn mati|mati aja|mati saja|nyakitin diri|menyakiti diri|sayat tangan|mati rasa|gak mau hidup|nggak mau hidup|ga mau hidup|udah gak kuat hidup)'] },
  // Two parts, because `capek banget sama hidup ini` is the phrasing people
  // actually use and `capek hidup` is not contiguous in it. Tier B, so this
  // costs a fail-closed-on-timeout and never a refusal -- which is right: the
  // classifier's ALLOW list names "despair phrased as exhaustion" explicitly.
  { id: 'id.self_harm.exhaustion', category: 'self_harm', tier: 'suspect', parts: ['(?:capek|lelah|cape|muak|putus asa)', '(?:hidup|hidupku|hidup ini)'] },
  { id: 'id.violence_others.token', category: 'violence_others', tier: 'suspect', parts: [`(?:${PREFIX}bunuh dia|${PREFIX}bunuh orang|${PREFIX}habisi dia|balas dendam|bikin dia menderita|celakain dia)`] },
  { id: 'id.extremism.token', category: 'extremism', tier: 'suspect', squash: false, parts: ['(?:bom|peledak|detonator|jihad|mati syahid|amaliyah)'] },
  { id: 'id.nonconsent.token', category: 'nonconsent', tier: 'suspect', parts: ['(?:ikuti dia diam diam|lacak hp dia|tanpa persetujuan|paksa dia mau|sebar foto dia|santet dia)'] },
  { id: 'id.system_abuse.token', category: 'system_abuse', tier: 'suspect', parts: ['(?:abaikan (?:semua )?(?:instruksi|aturan|perintah)|lupakan (?:instruksi|aturan)|tampilkan (?:prompt|instruksi)|kamu sekarang adalah|mode pengembang)'] },
  ...TIER_B_EN,
];

/**
 * Tier A first: a deny outranks a suspect, and `sexual_minor` outranks everything.
 *
 * **THE TWO LOCALES RESOLVE TO THE SAME SET**, for the reason written out above
 * `EXEMPTIONS`. The `Record<Locale, …>` shape is kept rather than collapsed to
 * one array so that re-introducing a per-locale difference is a data edit rather
 * than a refactor -- and so `checkBlocklist`'s signature does not have to change
 * if a genuinely locale-specific pattern ever appears.
 */
const ALL_PATTERNS: PatternSpec[] = [...SEXUAL_MINOR, ...TIER_A_ID, ...TIER_B_ID];

const PATTERNS: Record<Locale, PatternSpec[]> = { id: ALL_PATTERNS, en: ALL_PATTERNS };

/**
 * Compile one spec against one haystack shape.
 *
 * `joiner` is what a literal space in the source becomes: `\s+` for the spaced
 * haystack, the empty string for the squashed one. That single substitution is
 * why the specs are data rather than regexes.
 *
 * A two-part spec becomes `part1<window>part2`. Order matters and is not
 * commuted: `cara ... bunuh diri` is a request and `bunuh diri ... cara` is not
 * a phrase anyone writes, so allowing both directions would only add false
 * positives.
 */
function compile(spec: PatternSpec, joiner: string, window: number): RegExp {
  const spaced = joiner !== '';
  /*
   * `\b` ON THE SPACED FORM ONLY, AND IT IS NOT COSMETIC. Without the trailing
   * one, `(?:membuat|...)\s+(?:bom|...)` matches the first ten characters of
   * `membuat bomboloni` and refuses a question about a donut with an accusation
   * of terrorism. Found by the near-miss corpus, which is what that corpus is
   * for.
   *
   * The squashed form gets none, because it HAS no boundaries -- every separator
   * is gone by construction. That is precisely why `squash: false` exists for
   * any spec carrying a token under four characters.
   */
  const wrap = (p: string) => (spaced ? `\\b(?:${p})\\b` : p);
  const src = spec.parts.map((p) => wrap(p.replace(/ /g, spaced ? joiner : '')));
  const body = src.length === 1 ? src[0] : `${src[0]}.{0,${window}}?${src[1]}`;
  return new RegExp(body, 'is');
}

/*
 * Compiled once at module load, not per request.
 *
 * There are ~40 specs and each compiles to two regexes; doing that on every
 * reading would put ~80 `new RegExp` calls on the request path for no reason.
 * Regexes are stateless here -- no `g` flag, so no `lastIndex` to leak between
 * calls, which is the bug this optimisation would otherwise introduce.
 */
type Compiled = { spec: PatternSpec; spaced: RegExp; squashed: RegExp | null };

const COMPILED: Record<Locale, Compiled[]> = {
  id: PATTERNS.id.map(toCompiled),
  en: PATTERNS.en.map(toCompiled),
};

function toCompiled(spec: PatternSpec): Compiled {
  return {
    spec,
    spaced: compile(spec, '\\s+', WINDOW_SPACED),
    squashed: spec.squash === false ? null : compile(spec, '', WINDOW_SQUASHED),
  };
}

/** Replace every exempt idiom with a space, in whichever form is being built. */
function mask(haystack: string, idioms: string[], joiner: string): string {
  let out = haystack;
  for (const idiom of idioms) {
    const src = joiner === '' ? idiom.replace(/ /g, '') : idiom.replace(/ /g, '\\s+');
    out = out.replace(new RegExp(src, 'gi'), ' ');
  }
  return out;
}

export type BlocklistResult =
  | { tier: 'deny'; category: ModerationCategory; patternId: string }
  | { tier: 'suspect'; category: ModerationCategory; patternId: string }
  | { tier: 'clean' };

/**
 * Check one already-sanitized question.
 *
 * **THE STRING PASSED HERE MUST BE THE STRING THE MODEL SEES.** Not the raw
 * body, not a separately-normalized copy: the output of `sanitizeQuestion`, byte
 * for byte. Moderating one string and prompting another is the classic bypass,
 * and it is easy to build by accident because `buildPrompt` sanitizes internally
 * while the route holds the raw text. `gate.test.ts` asserts the invariant.
 *
 * Two haystacks, matched independently and unioned. The spaced one keeps word
 * boundaries and digits; the squashed one defeats `b.u.n.u.h` and `bun0h`.
 * Neither alone is enough -- the first is trivially obfuscated around, and the
 * second manufactures adjacency that was never in the text.
 *
 * Returns the FIRST deny it finds, or failing that the first suspect. Pattern
 * order therefore encodes precedence: `sexual_minor` is checked before
 * everything, then Tier A, then Tier B.
 */
export function checkBlocklist(question: string, locale: Locale): BlocklistResult {
  const idioms = EXEMPTIONS[locale];
  const spaced = mask(spacedForm(question), idioms, ' ');
  const squashed = mask(normalizeForMatching(question), idioms, '');

  let suspect: BlocklistResult | null = null;

  for (const { spec, spaced: reSpaced, squashed: reSquashed } of COMPILED[locale]) {
    if (!reSpaced.test(spaced) && !(reSquashed && reSquashed.test(squashed))) continue;

    if (spec.tier === 'deny') {
      return { tier: 'deny', category: spec.category, patternId: spec.id };
    }
    // Remember the first suspect but keep looking: a later Tier-A hit outranks
    // it, and the list is short enough that finishing the scan is free.
    suspect ??= { tier: 'suspect', category: spec.category, patternId: spec.id };
  }

  return suspect ?? { tier: 'clean' };
}

/** Exported so the tests can assert every pattern has a near-miss. */
export const _PATTERN_IDS: Record<Locale, string[]> = {
  id: PATTERNS.id.map((p) => p.id),
  en: PATTERNS.en.map((p) => p.id),
};
