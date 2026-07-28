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

  // — translation (V2) —
  'translation.generated',

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
  /** `source` is load-bearing. See EventSource. */
  'reading.completed':         { reading_id: string; reader_id: string; service_id: string;
                                 latency_ms: number; total_ms: number; chars: number;
                                 token_input: number | null; token_output: number | null;
                                 truncated: boolean; status: 'ok' | 'partial'; source: EventSource };
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

  'locale.changed':            { from: string; to: string; surface: 'settings' | 'onboarding' | 'auto' };

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
