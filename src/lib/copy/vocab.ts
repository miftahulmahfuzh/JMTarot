/**
 * The forbidden-word lists, in ONE place.
 *
 * WHY THIS MODULE EXISTS. Three checks have been carried as inline literals in
 * `scripts/smoke-llm.ts` since W6: Malay leaking into the Indonesian half, the
 * therapy/diagnosis vocabulary that no reader-facing copy may use in either
 * locale, and the generic-mystic tics that flatten the three English readers
 * into one. V1's gloss tables need all three at TEST time and V8's persona
 * needs them at WRITE time — a smoke run three days later cannot un-share a
 * persona. Reconciliation §5 ("the shared vocabulary module") adopted the
 * extraction rather than let a fourth copy land.
 *
 * NO `server-only` MARKER, DELIBERATELY. `scripts/**` imports this, and the
 * marker throws outside a Next server bundle (CLAUDE.md: "Scripts still
 * throw"). There is nothing secret here — these are word lists, and every one
 * of them is a word we refuse to SAY.
 *
 * PLAIN AND PURE. No imports, no env, no catalog. It is data that both a test
 * and a script can read, which is the only property that makes it shareable.
 *
 * STATUS AT V1: created here because V1 is first in the build order and is the
 * first consumer. `scripts/smoke-llm.ts` STILL CARRIES ITS OWN COPIES and V3
 * owns pointing it here — the shared-file table in reconciliation §5 assigns
 * that script to V3 first. Until then the lists exist twice; do not add a
 * third. When V3 wires the script up, `EN_TICS` will make the smoke check
 * slightly stricter than it is today — see its own note.
 *
 * `anxiety` IS DELIBERATELY ABSENT from both therapy lists and must stay
 * absent. "That low-grade anxiety before you send the text" is legitimate in
 * Adrian's voice; the rule is against DIAGNOSIS, which is why `anxiety
 * disorder`, `clinical` and `diagnosed` are the entries that are here.
 */

/**
 * Malay words that are not Indonesian. THE `id` HALF ONLY.
 *
 * Running these against English would be theatre — `kerana` is not a risk in
 * English — and W6's rule 4 says so explicitly. `tempoh` is in the list because
 * it slipped through the original four.
 */
export const MALAY = [
  'kerjaya', 'hala tuju', 'sembang', 'awak',
  'tempoh', 'kerana', 'iaitu', 'ianya', 'manakala', 'seronok', 'kelmarin',
] as const;

/**
 * Therapy, diagnosis, treatment and healing — English.
 *
 * THE ENGLISH LIST IS LONGER, NOT A TRANSLATION. English tarot and wellness
 * writing is saturated with this vocabulary in a way Indonesian is not, so the
 * net has to be wider on that side.
 */
export const THERAPY_EN = [
  'trauma', 'therapy', 'therapist', 'diagnose', 'diagnosis', 'diagnosed',
  'clinical', 'healing', 'heal', 'inner child', 'mental health',
  'anxiety disorder', 'depression', 'medication', 'shadow work',
  'nervous system', 'hold space', 'regulate', 'dysregulated',
  /*
   * THE LAST THREE ARE v0.4.0's, and they close a real gap rather than tighten
   * the rule. **`src/lib/prompt/base.en.ts` already forbids all three in prose**
   * and this module's header says it exists so a fourth copy never lands -- so a
   * list that is a strict SUBSET of what the prompt forbids is the same
   * divergence one level down. S4 raised it; reconciliation item 12 granted it.
   *
   * VERIFIED SAFE BEFORE ADDING: no value in `NUMBER_GLOSSES`, `SIGN_GLOSSES`,
   * `ELEMENT_GLOSSES` or `MODALITY_GLOSSES` matches any of the three under
   * `\b…\b` -- 33's "…starts being work" does not match `\bdo the work\b` --
   * so `glosses.test.ts` stays green.
   */
  'attachment style', 'process your feelings', 'do the work',
] as const;

/** The same rule in Indonesian. Shorter, because the tic vocabulary is. */
export const THERAPY_ID = [
  'trauma', 'terapi', 'terapis', 'diagnosis', 'menyembuhkan', 'penyembuhan',
  'inner child', 'kesehatan mental', 'depresi', 'obat', 'dokter',
] as const;

/**
 * Generic-mystic tics. `en` only, and the biggest single threat to persona
 * separation: these are the average tarot voice in any training set, so all
 * three readers drift toward them TOGETHER — which is the failure the
 * reader-overlap number cannot see, because it rises when they converge on
 * anything.
 *
 * THE LAST THREE ARE NEW AT V1 and are stricter than the smoke script's list as
 * it stands today. `divine timing`, `higher self` and `sacred` saturate English
 * *numerology* writing specifically; roadmap §5 names `divine timing` while
 * assuming the script already greps for it, and it does not. Added here rather
 * than argued about later, because a gloss carrying one of them would seed it
 * into every reading and every persona it grounds.
 */
export const EN_TICS = [
  'dear one', 'beloved', 'sweet soul', 'the Universe', 'divine feminine',
  'energetically', 'vibration', 'manifest', 'abundance', "soul's journey",
  'divine timing', 'higher self', 'sacred',
] as const;
