/**
 * What the app records, as one closed list a human can read in one sitting.
 *
 * NO IMPORTS. This file is the data dictionary, and it is read by people who
 * want to know what JMTarot stores about them as much as by code. It is also
 * imported by both the server and the client tracker, so a dependency here
 * would reach the browser bundle for nothing.
 *
 * WHY A CLOSED UNION AND NOT A STRING (plan A1). An open `name: string` field
 * is unqueryable within a month: you get `reader_chosen`, `reader.chosen` and
 * `readerChosen` from three files, names nobody removed after the feature
 * died, and no way to know what props a name carries without grepping every
 * call site. A closed union makes a rename a compile error and the props
 * checked where they are written.
 *
 * ── THE FIVE RULES FOR ADDING AN EVENT ──────────────────────────────────────
 *
 * 1. NO FREE TEXT IN PROPS, EVER. `question.typed` carries a `length`, not the
 *    question. `onboarding.question_answered` carries a `length`, not the
 *    answer. This is not a style rule: `events` rows SURVIVE ACCOUNT ERASURE
 *    with `user_id` nulled (reconciliation R9), and that is only honest
 *    because there is provably nothing in them that identifies anybody. If you
 *    want the text, it belongs in a real column with a real retention story.
 *    Enforced at runtime by `sanitizeProps()` in `flush.ts`.
 * 2. NO UNBOUNDED CARDINALITY. `error_kind` is a short classifier
 *    (`'timeout'`, `'upstream_5xx'`), never `err.message`. A prop whose value
 *    space is unbounded makes every `group by` useless.
 * 3. IDS ARE IDS. `card_id` is the integer, not the name; `reader_id` is the
 *    slug. Display names are translated by W6 and the data must not be.
 * 4. PREFER ONE EVENT WITH PROPS OVER FIVE EVENTS. `draw.card_picked` with a
 *    `slot` prop, not `draw.card_picked_slot_0`.
 * 5. A SOMETIMES-ABSENT PROP IS `| null`, NEVER OPTIONAL. jsonb with a missing
 *    key and jsonb with an explicit null behave differently in a `where`
 *    clause, and the second one is the one you want.
 *
 * Naming: `domain.verb_object`. One dot, `snake_case` within a segment, which
 * matches the schema's column convention and makes `where name like 'reading.%'`
 * a useful query. There is a test for the shape.
 */

export const EVENT_NAMES = [
  // — session and identity —
  'auth.signed_in',
  'auth.signed_out',
  'auth.session_expired',

  // — onboarding (W3 fires these) —
  'onboarding.started',
  'onboarding.question_answered',
  'onboarding.question_skipped',
  'onboarding.completed',
  'onboarding.abandoned',
  'onboarding.lotus_generated',

  // — navigation and choice —
  'reader.viewed',
  'reader.chosen',
  'reader.panel_swiped',
  'service.chosen',

  // — the draw —
  'draw.started',
  'draw.card_picked',
  'draw.card_returned',
  'draw.card_detail_opened',
  'draw.reshuffled',
  'draw.completed',

  // — the question field —
  'question.typed',
  'question.skipped',

  // — the reading —
  'reading.requested',
  'reading.first_token',
  'reading.completed',
  'reading.failed',
  'reading.aborted',
  'reading.retried',
  'reading.rate_limited',

  /*
   * — memory features (W5 fires these) —
   *
   * W4 RESERVED TWO OF THESE AS `summary.shown` AND `frequency.shown`; W5's
   * plan §4.5 and `## Interfaces I need` name seven, all prefixed `memory.`.
   * The reconciliation is silent, so this is the resolution: the `memory.`
   * prefix wins and the two reserved names are renamed. Nothing fired them --
   * they were forward declarations -- so the rename cost nothing, and it buys
   * `where name like 'memory.%'` returning the whole feature instead of five
   * sevenths of it. W4's prop shapes are kept, because they are better than the
   * ones W5's plan sketched: `cached` and `source_count` answer questions
   * `reader_id` alone cannot.
   */
  'memory.chain_offered',
  'memory.chain_used',
  'memory.gist_failed',
  'memory.summary_shown',
  'memory.summary_generated',
  'memory.frequency_shown',
  'memory.frequency_generated',

  // — locale (W6) —
  'locale.changed',

  // — the account shell (V4) —
  'account.opened',
  'account.details_viewed',

  // — /account and the persona (V8) —
  'account.deleted',
  /*
   * The 67th name (2026-07-29). **THE ONLY ONE ADDED FOR THIS CHANGE, AND THREE
   * WERE DRAFTED.** See its prop shape below for what was dropped and why.
   */
  'account.answer_changed',
  'persona.generated',
  'persona.viewed',

  // — trust and safety (W7) —
  'terms.viewed',
  'terms.accepted',
  'privacy.viewed',
  'moderation.refused',
  'moderation.timeout',
  'moderation.allowed_flagged',

  // — limits and quota (V9) —
  'ratelimit.backend_degraded',
  'llm.ceiling_reached',

  // — history (V6) —
  'history.viewed',
  'history.filtered',
  'history.item_opened',

  // — translation (V2) —
  'translation.generated',

  // — sharing (V7) —
  'share.created',
  'share.revoked',
  'share.copied',
  'share.viewed',
  'share.cta_clicked',

  // — the public content surface (v0.4.0) —
  'public.page_viewed',
  'public.link_clicked',
  'public.link_shared',
  'public.card_zoomed',
  'wallpaper.downloaded',

  // — the app shell —
  'app.launched',

  // — self-diagnostics —
  'analytics.local_date_fallback',
  'analytics.events_dropped',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/** Props are flat scalars. Rule 1 above, and `sanitizeProps` enforces it. */
export type EventPropValue = string | number | boolean | null;

/**
 * Which side of the wire fired it.
 *
 * On `reading.completed` this is the ENTIRE LOSS-DETECTION MECHANISM (plan
 * §10). The server's copy is written by the same `after()` that writes the
 * `readings` row, so if the invocation is killed both vanish together. The
 * client's copy arrives through `/api/events`, a different request with a
 * different `after()`, so a `reading.completed` with `source: 'client'` and no
 * matching `readings` row is exactly the signal that a write was lost. Both
 * being lost for the same reading is much rarer than either.
 */
export type EventSource = 'server' | 'client';

export type EventMap = {
  'auth.signed_in':            { method: 'google' | 'dev_password'; returning: boolean };
  'auth.signed_out':           Record<string, never>;
  'auth.session_expired':      { at_path: string };

  'onboarding.started':        { version: number };
  'onboarding.question_answered': { question_key: string; length: number; index: number };
  'onboarding.question_skipped':  { question_key: string; index: number };
  'onboarding.completed':      { version: number; answered: number; skipped: number; elapsed_ms: number };
  'onboarding.abandoned':      { version: number; last_index: number };
  'onboarding.lotus_generated':{ model: string; source_version: number; latency_ms: number; fallback: boolean };

  'reader.viewed':             { reader_id: string; from: 'picker' | 'direct' | 'back' };
  'reader.chosen':             { reader_id: string };
  /*
   * V5. Which panel of the reader swipe deck is showing, and who moved it.
   *
   * NO FREE TEXT, rule 1. Nothing here is a word the querent wrote or the model
   * generated. `panel` is a closed union of two machine tokens, not a label.
   *
   * `panel` IS A KEY, NOT AN INDEX (rule 3). An index would silently change
   * meaning the day a third panel is inserted before the summary.
   *
   * `source: 'auto'` IS NOT REDUNDANT WITH THE NAME. The roadmap fixed the name
   * as `panel_swiped`; the automatic slide is not a swipe, and `source` is the
   * only thing that lets a query separate "the app moved" from "the querent
   * moved". The ratio of the two is the number that says whether D-V5-2 -- slide
   * on the first byte -- was the right call.
   */
  'reader.panel_swiped':       { reader_id: string; panel: 'bio' | 'summary'; source: 'auto' | 'user' };
  'service.chosen':            { reader_id: string; service_id: string };

  'draw.started':              { reader_id: string; service_id: string; card_count: number; reduced_motion: boolean };
  'draw.card_picked':          { reader_id: string; service_id: string; card_id: number; reversed: boolean; slot: number };
  'draw.card_returned':        { card_id: number; slot: number };
  'draw.card_detail_opened':   { card_id: number; reversed: boolean; slot: number; during_reading: boolean };
  'draw.reshuffled':           { reader_id: string; service_id: string; picks_discarded: number };
  'draw.completed':            { reader_id: string; service_id: string; elapsed_ms: number };

  'question.typed':            { reader_id: string; service_id: string; length: number };
  'question.skipped':          { reader_id: string; service_id: string };

  'reading.requested':         { reading_id: string; reader_id: string; service_id: string; card_count: number;
                                 has_question: boolean; question_length: number;
                                 lotus_present: boolean; memory_block_present: boolean; prompt_version: string };
  'reading.first_token':       { reading_id: string; latency_ms: number };
  /**
   * `source` is load-bearing. See EventSource.
   *
   * ── `choice` AND `choice_length` (2026-07-29) ──────────────────────────────
   *
   * **TWO PROPS AND NOT A `reading.choice_offered` NAME, WHICH THIS FILE'S OWN
   * CEILING ASKED FOR.** `events.test.ts` bounds the taxonomy at 66 names and says
   * in those words that for a new measurement *"the answer is almost always a prop
   * on one of the five above"*. It was written about v0.4.0's public surface and
   * the argument generalises, so a 67th name was written, read back, and folded in
   * here instead. The query shape is strictly better for it: the numerator and the
   * denominator are now one table scan over one event rather than a join between
   * two.
   *
   * `'none'` on almost every reading -- a question offering a choice is rare.
   * `'invalid'` means the reader named something the querent never typed, so no box
   * was rendered, and **that is the number the choice verdict lives or dies by**:
   * V2's rule governs it verbatim, above ~2% fix the prompt rather than the
   * architecture. Split the two failure kinds with `choice_length`: past
   * `CHOICE_MAX_CHARS` the reader wrote a clause instead of an option, at or under
   * it the reader invented a third choice.
   *
   * **`choice_length` AND NEVER THE WORD, AND THIS IS THE STRICTEST CASE OF THAT
   * RULE IN THE FILE.** The chosen option is a word-bounded SLICE of
   * `readings.question` -- literally a fragment of free text somebody typed -- so
   * the word itself here would put user prose in `events.props`. `events` rows
   * survive account erasure with `user_id` nulled, and that is only honest because
   * `sanitizeProps()` provably strips everything identifying. `0` when there was no
   * marker.
   *
   * **BOTH COPIES CARRY THEM, server and client, and a disagreement is
   * information** -- exactly what the header says about `status`. The client
   * validates against the question in its own textarea and the server against the
   * stored `readings.question`; those must agree, and this is the only place it
   * would show if they stopped.
   */
  'reading.completed':         { reading_id: string; reader_id: string; service_id: string;
                                 latency_ms: number; total_ms: number; chars: number;
                                 token_input: number | null; token_output: number | null;
                                 truncated: boolean; status: 'ok' | 'partial'; source: EventSource;
                                 choice: 'none' | 'valid' | 'invalid'; choice_length: number };
  'reading.failed':            { reading_id: string; reader_id: string; service_id: string;
                                 stage: 'validation' | 'prompt' | 'connect' | 'stream';
                                 chars_before_failure: number; error_kind: string; source: EventSource };
  'reading.aborted':           { reading_id: string; chars_before_abort: number;
                                 reason: 'user' | 'navigation' | 'timeout'; source: EventSource };
  'reading.retried':           { reader_id: string; service_id: string; attempt: number };
  /*
   * `limit` IS V9's ADDITION, AND IT IS NOT A WIDENING OF WHAT IS COLLECTED ABOUT
   * A PERSON. The route deliberately answers all four ceilings with identical
   * copy, because telling the querent which one they hit tells a prober which one
   * to work around. The event is server-side and a prober cannot read it, so
   * there is no reason for the DATA to be as coy as the RESPONSE -- and without
   * it, `reading.rate_limited` in query 9 cannot distinguish "one user is
   * hammering" from "the window's quota is gone", which are the two most
   * different things it can mean.
   *
   * **`'unknown'` IS THE CLIENT'S VALUE AND IT IS NOT A GAP.** `Draw.tsx` fires
   * this name too, from a 429 whose body and headers deliberately do not say which
   * ceiling was hit -- that coyness is the anti-prober decision above, and the
   * browser is exactly the place it applies. So the client reports honestly that
   * it was not told. Filter on `limit <> 'unknown'` when attributing a cause, and
   * on `limit = 'unknown'` to count what a querent actually experienced.
   */
  'reading.rate_limited':      { reader_id: string; service_id: string; retry_after_s: number;
                                 limit: 'user' | 'refusal' | 'global' | 'daily' | 'unknown' };

  /*
   * W5's memory features.
   *
   * EVERY ARRAY W5'S PLAN ASKED FOR IS FLATTENED HERE, and that is not a style
   * preference. The plan specifies `recalled_ids: string[]` and
   * `repeat_card_ids: number[]`; `sanitizeProps()` DROPS non-scalars, so both
   * would have arrived as absent keys with nothing logged and nothing thrown --
   * a prop that silently is not there is worse than one that was never
   * declared. A count plus the first id answers every question the array was
   * for: "how often does a chain recall two readings" is `recalled_count`, and
   * the ids themselves are recoverable by joining `readings` on `reading_id`
   * and `created_at`, which is where they already live.
   */
  'memory.chain_offered':      { reading_id: string; recalled_count: number; reason: 'repeat' | 'question'; repeat_card_id: number | null; repeat_count: number };
  'memory.chain_used':         { reading_id: string; signal: 'card' | 'phrase' };
  'memory.gist_failed':        { reading_id: string; reason: 'call_failed' | 'empty' | 'unusable'; fell_back: boolean };
  'memory.summary_shown':      { reader_id: string; source_count: number; cached: boolean; chars: number };
  /*
   * V3 widens two prop shapes and adds NO NAME -- the taxonomy stays at 44, and
   * roadmap §6's reconciliation target of 61 is untouched by this workstream.
   *
   * `shadow_card_id` is what makes "what does the distribution of shadow cards
   * look like?" answerable without a `frequency_verdicts` column, which would
   * have been a denormalization of a two-column addition and a modulus.
   *
   * `sample` STAYS ON `frequency_generated` AND THAT IS NOT A VD2 VIOLATION.
   * VD2 forbids counts in the output the QUERENT READS, never in analytics --
   * `events` rows are how "is the gate set right?" gets answered.
   *
   * `memory.frequency_shown` and `memory.summary_shown` are deliberately
   * UNCHANGED. They fire on the cached path too, where the derived values were
   * never recomputed, and a field that is sometimes absent would make every
   * aggregate over them a different measurement -- the `latency_ms` argument.
   */
  'memory.summary_generated':  { reader_id: string; source_count: number; regeneration: boolean; generation_count: number; total_ms: number;
                                 shadow_card_id: number | null; echo_count: number };
  'memory.frequency_shown':    { window: string; top_card_id: number; second_card_id: number | null; sample: number; cached: boolean };
  'memory.frequency_generated':{ window: string; top_card_id: number; second_card_id: number | null; sample: number; angle: number; total_ms: number;
                                 shadow_card_id: number; shadow_collision: 'top' | 'second' | 'none';
                                 dominance: 'tied' | 'narrow' | 'clear' | 'overwhelming'; pulse: number };

  /*
   * `surface` GAINED `'content'` IN v0.4.0 (S2's switcher-as-link, §4.2).
   *
   * A content page's switcher is an `<a href>` to the sibling URL and does NOT
   * `POST /api/locale`, because there is often no session and because the sibling
   * URL *is* the other language -- so this event fires from a navigation rather than
   * from a write, and separating it from `'settings'` is what stops the two being
   * averaged into one meaningless rate. **Widened HERE by S1 (S-D13) rather than by
   * S2 in its own branch**, which is the whole point of one owner for this file.
   */
  'locale.changed':            { from: string; to: string;
                                 surface: 'settings' | 'onboarding' | 'auto' | 'content' };

  /*
   * V4. `surface` is a CLOSED UNION AND NOT A PATHNAME (rule 2: no unbounded
   * cardinality). It costs nothing to be exact, because the button is mounted
   * per page and each mounting page passes its own -- there is no pathname to
   * parse and no `/[reader]` to explode into three values.
   */
  'account.opened':            { surface: 'reader_picker' | 'service_picker' | 'account' | 'history' };
  /*
   * V4 DECLARES THIS AND V8 FIRES IT, from `/account` via `TrackView`. Declared
   * here because V4 lands first and a forward declaration costs nothing, and
   * because §6 wants every name in this file with a prop shape so the count
   * reaches 59. V8 owns the page and may widen the shape in its own plan; it is
   * the sole firer, so that is not a shared-file conflict.
   *
   * `from` is derived in the browser the way `ReaderViewed` derives
   * `reader.viewed.from`: the server never sees a Referer on a client-side
   * navigation, and "reached from the menu" and "reached from a bookmark" are
   * two different facts about whether the shell is discoverable.
   */
  'account.details_viewed':    { from: 'menu' | 'direct' };

  /*
   * ── V8's THREE (VD13, VD15) ────────────────────────────────────────────────
   *
   * `account.deleted` fires from the route's `after()`, AFTER the transaction
   * commits, so it never records an erasure that rolled back. The row it writes
   * OUTLIVES the account with `user_id` nulled (rule 1's whole reason), which is
   * why every prop here is a count or a boolean: this is the only trace that a
   * deletion happened, and it has to be honest about scale without being about a
   * person.
   *
   * `days_since_signup` IS AN UNBUCKETED INTEGER AND IT IS THE ONE ARGUABLE PROP
   * IN THIS SET (V8's open question 5). Rule 2 bars unbounded cardinality; this
   * is bounded by the app's own age in days, which is small now. Bucket it the
   * day that stops being true -- the shape to reach for is
   * `'0-7' | '8-30' | '31-90' | '91+'`, and the reason to prefer the integer
   * until then is that "how long did people stay before leaving" is the single
   * most useful question a deletion event can answer and a bucket loses it.
   */
  'account.deleted':           { reading_count: number; had_persona: boolean;
                                 flags_redacted: number; links_revoked: number;
                                 days_since_signup: number; elapsed_ms: number };
  /*
   * `/account`'s answer sheet (2026-07-29). **THE 67th NAME, AND THE CEILING MOVED
   * BY EXACTLY ONE BECAUSE THREE NAMES WERE DRAFTED AND TWO WERE REFUSED.**
   *
   * Drafted: `account.answer_revealed`, `account.answer_edited`,
   * `account.answer_cleared`. `events.test.ts` bounds the taxonomy and says the
   * answer to a new measurement is *"almost always a prop on one of the five
   * above"* — which is right, and there is no existing event that hosts this one.
   * `onboarding.question_answered` is the tempting host and is the wrong one: firing
   * it from `/account` would put edits inside the onboarding funnel, so
   * `onboarding.completed`'s denominator would count people who finished the rite
   * weeks ago.
   *
   * So: ONE name with a closed `action`, not three names.
   *
   * **`revealed` WAS DROPPED RATHER THAN FOLDED IN, and it is the interesting
   * omission.** It would have counted how often somebody opens an answer to look at
   * it. Two reasons it is not here: the privacy question it seemed to answer ("how
   * often does plaintext leave the server") is answered by
   * `GET /api/onboarding/answer/<key>` request volume in the platform log, which is
   * where request counts belong; and a look-and-close changes no decision, while
   * `edited` and `removed` are the two that say whether the control earns its place.
   * `linkKind()` is the precedent for keeping a capability without wiring an event
   * nobody has a question for.
   *
   * **`length` AND NEVER THE TEXT.** `onboarding.question_answered` carries exactly
   * this pair and this is the same fact from a different screen. `events` rows
   * survive account erasure with `user_id` nulled, which is only honest because
   * `sanitizeProps()` provably strips everything identifying — and `worst_thing`'s
   * plaintext is the single worst thing that could be in this file. `0` for a
   * removal, and for a closed question it is the length of the closed VALUE
   * (`grey`, `25`), which carries nothing.
   *
   * `question_key` is one of six, so it is closed by construction rather than by
   * assertion.
   */
  'account.answer_changed':    { question_key: string; action: 'edited' | 'removed';
                                 length: number };

  /*
   * THREE FACET PROPS, NOT AN ARRAY, and this is rule 1's runtime half rather
   * than a style choice: `sanitizeProps()` DROPS non-scalars, so
   * `facets: string[]` would arrive as an absent key with nothing logged and
   * nothing thrown. W5's `recalled_ids` was flattened for exactly this.
   *
   * `fallback` IS THE OPERATIONALLY INTERESTING ONE and it is
   * `onboarding.lotus_generated.fallback`'s twin. If it trends toward every user,
   * `personaSafetyCheck` is rejecting everything and the fix is the contract, not
   * the code. `reject_reason` is the closed `PersonaRejectReason` union plus the
   * generator's own outcomes -- never an error message (rule 2).
   */
  'persona.generated':         { model: string; source_version: number; locale: string;
                                 facet_a: string; facet_b: string; facet_c: string;
                                 reading_count: number; latency_ms: number;
                                 fallback: boolean; reject_reason: string | null };

  /** `chars`, NEVER the body (rule 1). The persona is prose about a person. */
  'persona.viewed':            { cached: boolean; locale: string; fallback: boolean;
                                 chars: number };

  'terms.viewed':              { version: string; from: string };
  'terms.accepted':            { version: string };
  'privacy.viewed':            { version: string; from: string };
  'moderation.refused':        { source: 'blocklist' | 'classifier' | 'timeout'; category: string;
                                 confidence_bucket: 'low' | 'medium' | 'high' | null;
                                 reader_id: string; service_id: string };
  /*
   * The classifier did not answer. `failed_open` is the whole point of the row:
   * W7-D7 fails OPEN on a clean blocklist and CLOSED on a Tier-B suspicion, and
   * reconciliation §7.7 keeps that policy tunable rather than guessed at -- if
   * this prop spikes toward `true`, the classifier is what needs fixing, not the
   * policy. `reason` separates a slow provider from a broken one.
   */
  'moderation.timeout':        { failed_open: boolean; reason: 'timeout' | 'error';
                                 reader_id: string; service_id: string };
  /*
   * A near-miss we let through: the classifier named a category, and the
   * threshold on `other` said it was not confident enough to refuse anybody.
   * WITHOUT THIS EVENT every moderation row is a block and the false-negative
   * side of tuning is invisible forever.
   */
  'moderation.allowed_flagged':{ category: string; confidence_bucket: 'low' | 'medium' | 'high' | null;
                                 reader_id: string; service_id: string };

  /*
   * The distributed limiter fell back to per-instance memory. **WITHOUT THIS
   * EVENT THE FALL-BACK IS INVISIBLE**, and the whole of V9 silently reverts to
   * v0.2.0's behaviour for as long as the outage lasts -- which could be weeks,
   * because nothing else about the app changes when it happens.
   *
   * THROTTLED TO ONE PER INSTANCE PER MINUTE. An Upstash outage degrades every
   * request, and one row per request would push the analytics path into exactly
   * the load W4 built `after()` to keep off it. So a count here is a count of
   * MINUTES, not of requests -- and since the instance count is unknown, it is a
   * lower bound on instances-times-minutes. Query 9 says so too.
   *
   * `surface` is the key PREFIX and never the key: the rest of it is a `users.id`
   * or an IP, and `events` rows survive account erasure with `user_id` nulled.
   */
  'ratelimit.backend_degraded': { backend: 'redis'; reason: 'timeout' | 'error'; surface: string };

  /*
   * The global ceiling refused a model call. **THIS IS THE REPLACEMENT FOR A
   * BILLING ALERT, AND THERE IS NO OTHER ONE.** `LLM_API_KEY` is a fixed
   * subscription, so abuse produces an exhausted quota rather than an invoice,
   * and an exhausted quota is invisible until a querent's reading fails.
   *
   * `tier: 'soft'` means deferred work is being shed and nobody has noticed
   * anything -- it is the warning. `tier: 'hard'` means readings are being
   * refused -- it is the outage. Query 9.
   */
  'llm.ceiling_reached':       { tier: 'soft' | 'hard'; call_class: 'interactive' | 'deferred';
                                 used: number; ceiling: number };

  /*
   * V6 -- history. ALL THREE FIRE FROM THE CLIENT: `history.filtered` needs to
   * know chip-vs-picker and the server cannot, and splitting the three across two
   * request paths for no gain would make "did they browse, then open?" a join.
   * The two read routes therefore run no `withAnalytics` at all.
   *
   * NO DATE IN ANY OF THESE, and that is rule 1 applied to a field that would
   * pass `sanitizeProps()` cleanly. `offset_days` and `age_days` are the shapes
   * the questions actually have -- "how far back do people look" and "how old is
   * a reading when it gets reopened" -- and a `local_date` string would answer
   * neither without arithmetic, while adding a second per-user calendar datum to
   * a table that survives account erasure with `user_id` nulled.
   * `events.local_date` already records the day of the visit.
   *
   * `source: 'menu' | 'direct'`, NEVER `document.referrer`. A referrer is a URL
   * and therefore free text with unbounded cardinality -- rules 1 and 2 together.
   * The same-origin comparison collapses it to the only distinction anyone will
   * query: V4's menu link is same-origin, a bookmark or a shared URL is not.
   *
   * `status` IS BARE `string`, NOT THE `ReadingStatus` UNION. This file has no
   * imports by design and it is the data dictionary people read;
   * `moderation.refused.category` sets the precedent that the set goes in a
   * comment rather than an import. It is
   * `'ok' | 'partial' | 'failed' | 'aborted'` -- never `'blocked'`, because a
   * blocked reading is not in the list and cannot be opened.
   *
   * `reading_id` IS A UUID AND THAT IS ALLOWED. Seven existing W4 events already
   * carry one, and this file's own comment says the ids are recoverable by
   * joining `readings` on `reading_id`. V7's "id never slug" rule is a different
   * rule for a different reason: a slug is a capability and an id is not.
   *
   * `needs_translation` IS THE NUMBER THAT DECIDES WHETHER VD8's ON-DEMAND MODEL
   * IS RIGHT. Near zero and translation is over-built; high while V2's
   * `translation.generated` stays much lower means the server-side cache read in
   * `/history/[id]` is doing its job.
   *
   * No `history.item_closed` and no dwell time: both need a `visibilitychange`
   * listener per row and neither answers a question anybody has asked.
   */
  'history.viewed':            { day_count: number; has_any: boolean;
                                 source: 'menu' | 'direct' };
  'history.filtered':          { offset_days: number; had_readings: boolean;
                                 via: 'chip' | 'picker' };
  'history.item_opened':       { reading_id: string; reader_id: string; service_id: string;
                                 status: string; age_days: number;
                                 needs_translation: boolean };

  /**
   * ONE NAME, NOT TWO. There is deliberately no `translation.failed`.
   *
   * Roadmap §6 fixes fifteen names for v0.3.0 and reconciliation §4 is the register
   * that has to balance; a sixteenth would break the count, and reconciliation
   * confirmed this shape is the one it wants anyway. `memory.gist_failed`'s
   * `fell_back` is the precedent for putting the interesting distinction in a prop
   * rather than in a second name.
   *
   * NO FREE TEXT (rule 1). `chars` is a length, `outcome` and the two locales are
   * closed sets, `violation` is a classifier, and `entity_id` is a uuid — the same
   * shape `reading_id` already has in seven other events, and what makes a lost
   * translation joinable back to its artifact.
   *
   * `outcome`:
   *   'cached'    served from the table. No model call. THE COMMON CASE, and the
   *               ratio of this to the rest is what says whether the feature costs
   *               one model call or one per view.
   *   'ok'        generated and verified first time.
   *   'repaired'  the first pass failed verification; the deferred repair passed and
   *               IS what got persisted.
   *   'invalid'   both passes failed. NOTHING was persisted and the viewer saw one
   *               bad translation. **THIS IS THE RATE THAT DECIDES WHETHER THE
   *               PROMPT NEEDS WORK** — above roughly 2%, fix the prompt, not the
   *               architecture. A design where this were invisible is the one that
   *               would justify buffering the stream instead.
   *   'failed'    the call threw or came back empty. Nothing persisted; the caller
   *               fell back to the source prose.
   */
  'translation.generated':     { entity: string; entity_id: string; field: string;
                                 source_locale: string; locale: string;
                                 outcome: 'cached' | 'ok' | 'repaired' | 'invalid' | 'failed';
                                 violation: string | null; chars: number;
                                 streamed: boolean; total_ms: number };

  /*
   * V7 -- sharing. FIVE NAMES, AND EVERY ONE CARRIES `share_links.id` AND NEVER
   * THE SLUG (roadmap §6).
   *
   * The reason is worth restating where the props are written rather than left in
   * the roadmap: **`events` rows SURVIVE ACCOUNT ERASURE with `user_id` nulled**,
   * so a slug in `props` would leave a live, working, PUBLIC URL sitting in a table
   * that outlives the account that revoked it. `share_links.id` grants nothing --
   * it is not in any URL, and every mutation keyed on it also carries `user_id` in
   * its `where`. A uuid in `props` is otherwise ordinary here: seven W4 events
   * already carry `reading_id`, and this file's own note says the ids are
   * recoverable by joining. The slug rule is a different rule for a different
   * reason: a slug is a CAPABILITY and an id is not.
   *
   * `entity` is the two-value closed union `'reading' | 'persona'`, declared as
   * `string` because this file has no imports by design --
   * `moderation.refused.category` sets that precedent.
   */
  /**
   * `pinned_locale` IS THE LOCALE THAT WAS WRITTEN, NOT THE ONE THE SHARER ASKED
   * FOR, and `null` means the link renders as-written.
   *
   * The mint resolves the pin rather than trusting it (`resolvePin`): it will fall
   * back to `null` when a translation into the sharer's language could not be
   * produced, because a row claiming `en` with no English body is a link that lies
   * about its own language. **That fallback is invisible without this prop** —
   * nothing else distinguishes a working pin from a silently degraded one, and the
   * querent sees a live URL either way. Same argument `translation.generated`'s
   * `outcome` prop won.
   *
   * `rotated` narrowed with it: it now means "*this language* had a prior address",
   * because a reading's first English link is a new address even when it already had
   * a Bahasa one.
   */
  'share.created':             { share_id: string; entity: string; include_question: boolean;
                                 include_nickname: boolean; rotated: boolean;
                                 pinned_locale: string | null };
  /** `age_hours` and `view_count` are read BEFORE the update -- they are facts
   *  about the link's life, not about the revoke. */
  'share.revoked':             { share_id: string; entity: string; age_hours: number;
                                 view_count: number };
  /** `method` records which affordance actually worked. `navigator.share` is what
   *  "send it to WhatsApp" is on a phone; clipboard is the desktop path; `manual`
   *  means both failed and the querent was left selecting the text. */
  'share.copied':              { share_id: string; entity: string;
                                 method: 'clipboard' | 'webshare' | 'manual' };
  /*
   * FIRES FROM THE PUBLIC PAGE WITH NO `user_id` AND NO `session_id`, exactly like
   * `terms.viewed`. `/api/events` is already public for this reason and needs no
   * change.
   *
   * **THE ABSENT `session_id` IS DELIBERATE AND NOT INCIDENTAL.** `/s/` is excluded
   * from middleware's `jmt_locale` write, so a stranger reading a shared reading
   * leaves with nothing in their cookie jar and there is nothing to correlate on
   * anyway. Making it explicit is what keeps `/privacy` §4.4 honest if somebody
   * later re-adds a cookie: the row is a COUNT, not a tracker.
   *
   * It is also not the same number as `share_links.view_count` -- that one counts
   * renders including crawlers, this one is a browser that ran JavaScript. The pair
   * disagreeing is the diagnosis; see query 10.
   */
  'share.viewed':              { share_id: string; entity: string; has_question: boolean;
                                 referrer_kind: 'direct' | 'internal' | 'external' };
  'share.cta_clicked':         { share_id: string; entity: string };

  /*
   * ── v0.4.0's FIVE, AND WHY THERE ARE FIVE RATHER THAN FIFTEEN ──────────────
   *
   * Rule 4: prefer one event with props over five events. Six workstreams are
   * shipping public pages simultaneously, and the version where each declares its
   * own `gallery.viewed` / `arcana.viewed` / `blog.viewed` gives
   * `where name like 'public.%'` five sevenths of the surface and makes "how do
   * people move through the content?" a five-way union. So `page` is a prop.
   * Reconciliation R18 ruled the same way from S6's side: **S3 and S4 extend a
   * `surface`/`page` union, they do not invent families.**
   *
   * **`slug` IS A CLOSED SET AND THEREFORE NOT FREE TEXT.** Rules 1 and 2 together
   * are what make this legal: the value space is 22 card slugs (S-D4's table, §3.2)
   * plus a handful of article slugs, all of them committed source. It is emphatically
   * NOT a search query, a referrer, a title or a heading -- `events` rows SURVIVE
   * ACCOUNT ERASURE with `user_id` nulled, and that is only honest because there is
   * provably nothing identifying in them.
   *
   * **EVERY ONE OF THESE FIRES WITH A NULL `user_id`**, exactly like `terms.viewed`
   * and `share.viewed`: the public pages have no session by construction (S-D10) and
   * `/api/events` is already public for this reason, so no route change is needed.
   *
   * `locale` is the CLOSED two-value set, as a string because this file has no
   * imports by design -- `moderation.refused.category` set that precedent. It is the
   * language the PAGE was rendered in, which after S2's rewrite is the language the
   * URL prefix names, and it is the number that answers the release's own question:
   * §1 says Indonesian is the priority and English is upside, and this is how we find
   * out whether that was right.
   */
  'public.page_viewed':        { page: 'landing' | 'gallery' | 'arcana' | 'blog_index' | 'blog_post';
                                 locale: string; slug: string | null;
                                 referrer_kind: 'direct' | 'internal' | 'external' };

  /*
   * `to` IS A DESTINATION CLASS, NOT AN HREF. An href is a URL and therefore
   * unbounded (rule 2), and the interesting question is which of six destinations a
   * reader chose -- `sign_in` against `gallery` against `arcana` is the funnel.
   *
   * `to: 'sign_in'` IS THE CONVERSION AND IS THE ONLY NUMBER IN THIS RELEASE THAT
   * MEASURES WHETHER IT WORKED. Forty-four indexable pages that nobody signs in from
   * is a different outcome from forty-four pages nobody visits, and without this prop
   * the two look identical.
   */
  'public.link_clicked':       { from: 'landing' | 'gallery' | 'arcana' | 'blog_index' | 'blog_post' | 'footer';
                                 to: 'sign_in' | 'app' | 'gallery' | 'arcana' | 'blog' | 'terms' | 'privacy' | 'wallpaper' | 'locale';
                                 slug: string | null };

  /*
   * S-D8's control. **A DIFFERENT NAME FROM `share.copied`, AND NOT BY PREFERENCE.**
   * `share.copied` requires a `share_id`, and S-D8's control mints no `share_links`
   * row at all -- it shares the canonical URL of a page that is already public. There
   * is no id to send, and reusing the name would put a null in a prop every existing
   * query treats as present.
   *
   * `method` is `share.copied`'s union verbatim, for its reason: `webshare` is what
   * "send it to WhatsApp" is on a phone, `clipboard` is the desktop path, and
   * `manual` means both failed and the reader was left selecting the address bar.
   * Without the third value that failure is invisible.
   */
  'public.link_shared':        { from: 'landing' | 'gallery' | 'arcana' | 'blog_index' | 'blog_post';
                                 method: 'clipboard' | 'webshare' | 'manual';
                                 slug: string | null };

  /*
   * S3 fires it, S1 declares it (S-D13). `card_id` is the INTEGER and never the name
   * (rule 3): display names are translated and the data must not be.
   *
   * `surface` is a closed union with two members today. It is here rather than implied
   * by the name because the draw screen's `draw.card_detail_opened` is the same
   * gesture on a different page, and the day somebody wants both in one query the prop
   * is what makes it possible without renaming an event.
   */
  'public.card_zoomed':        { card_id: number; surface: 'gallery' | 'arcana' };

  /*
   * S5 fires it. `variant` is the closed set S5's pipeline produces, and `card_id`
   * is the integer (rule 3).
   *
   * NO FILENAME, NO BYTE COUNT AND NO USER AGENT. A filename is derivable from
   * `(card_id, variant)`, a byte count is a fact about the pipeline rather than about
   * a person's choice, and a user agent is free text with unbounded cardinality --
   * rules 1 and 2 together. If "which variant do phones take" is ever the question,
   * the honest answer is a second closed prop, not a UA string.
   *
   * **THIS SHAPE WAS FOLDED IN NARROWER THAN S5 DECLARED IT, AND THE TWO MISSING
   * PROPS ARE RESTORED HERE (S5, 2026-07-29).** S-D13 makes S1 the single owner of
   * this file and every other workstream a declarer; folding a declaration in means
   * transcribing it, and this one lost `method` and `from` and renamed the variant
   * `card` to `native`:
   *
   *   `variant` IS `'card'`, NOT `'native'`, because the file on disk is
   *   `<slug>-card.jpg` and `WALLPAPER_VARIANTS` in `@/lib/wallpaper` is the union
   *   the component actually holds. A prop spelled differently from the asset it
   *   describes is a query written against a value that never appears.
   *
   *   `method` IS THE ANSWER TO A QUESTION THE COUNTS CANNOT SETTLE. The control is
   *   an `<a download>` upgraded to `navigator.share` on a touch device, because on
   *   iOS a download lands in Files and *Set Wallpaper* reads only from Photos. If
   *   `share` never appears in production, that upgrade is not running and the
   *   feature is worse on its target platform than it looks here.
   *
   *   `from` mirrors `public.card_zoomed`'s `surface` for the same reason: the same
   *   gesture exists on two pages and the prop is what makes one query possible
   *   without renaming an event. It is spelled `from` because that is the word
   *   `public.link_clicked` uses and the prop the component takes.
   *
   * A CANCELLED SHARE SHEET FIRES NOTHING. `navigator.share` rejecting with
   * AbortError means the person tapped Cancel, and recording it would make every
   * "download" figure an "intent" figure.
   */
  'wallpaper.downloaded':      { card_id: number; variant: 'card' | 'phone';
                                 method: 'share' | 'link'; from: 'gallery' | 'arcana' };

  'app.launched':              { standalone: boolean; referrer_kind: 'direct' | 'internal' | 'external' };

  'analytics.local_date_fallback': { reason: 'absent' | 'malformed' | 'out_of_range'; received: string | null; surface: string };
  'analytics.events_dropped':  { count: number; reason: 'unknown_name' | 'queue_overflow' | 'oversize_batch' };
};

export type EventProps<N extends EventName> = EventMap[N];

/**
 * The ONE signature both `track` implementations satisfy.
 *
 * `void`, not `Promise<void>`, and that is the enforcement rather than a
 * convention (plan A2): a function returning `void` cannot usefully be
 * awaited, so nobody puts an `await` in front of one while debugging something
 * else at 11pm. Analytics must never be on the path of a byte the user is
 * waiting for.
 */
export type TrackFn = <N extends EventName>(name: N, props: EventProps<N>) => void;

/*
 * The two directions of exhaustiveness, both at compile time.
 *
 * Without the first, a name in EVENT_NAMES with no prop shape is a `never`
 * nobody notices. Without the second, EventMap can declare a name the array
 * does not have, which compiles fine and produces an event the collector route
 * silently drops as unknown.
 */
type _EveryNameHasProps = EventMap[EventName];
void (undefined as unknown as _EveryNameHasProps);

type _NoOrphans = Exclude<keyof EventMap, EventName>;
const _noOrphans: _NoOrphans extends never ? true : never = true;
void _noOrphans;

/**
 * One buffered event on its way to the `events` table.
 *
 * NO TIMESTAMP. Every row in a batch gets the same `created_at` from the one
 * insert, and within-batch ordering is recovered from `props.seq` -- a
 * monotonic integer per browser session. Reconstructing order from a client
 * `Date.now()` would mean trusting a clock that is routinely wrong by minutes
 * and occasionally by years.
 */
export type PendingEvent = {
  name: EventName;
  props: Record<string, EventPropValue>;
};

/**
 * The runtime guard, because the collector route receives names off the wire
 * and a type cannot check those.
 *
 * A Set rather than `EVENT_NAMES.includes(v)`: this runs once per event in
 * every batch, and `includes` on a 46-element array is a linear scan against
 * attacker-controlled input.
 */
const NAME_SET: ReadonlySet<string> = new Set(EVENT_NAMES);

export function isEventName(v: unknown): v is EventName {
  return typeof v === 'string' && NAME_SET.has(v);
}
