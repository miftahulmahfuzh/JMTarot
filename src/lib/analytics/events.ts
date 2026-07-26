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

  // — memory features (W5 fires these) —
  'summary.shown',
  'frequency.shown',

  // — locale (W6) —
  'locale.changed',

  // — trust and safety (W7) —
  'terms.viewed',
  'terms.accepted',
  'privacy.viewed',
  'moderation.refused',

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
  'reading.rate_limited':      { reader_id: string; service_id: string; retry_after_s: number };

  'summary.shown':             { reader_id: string; source_count: number; cached: boolean; chars: number };
  'frequency.shown':           { window: string; top_card_id: number; second_card_id: number | null; sample: number };

  'locale.changed':            { from: string; to: string; surface: 'settings' | 'onboarding' | 'auto' };

  'terms.viewed':              { version: string; from: string };
  'terms.accepted':            { version: string };
  'privacy.viewed':            { version: string; from: string };
  'moderation.refused':        { source: 'blocklist' | 'classifier'; category: string;
                                 confidence_bucket: 'low' | 'medium' | 'high' | null;
                                 reader_id: string; service_id: string };

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
 * The runtime guard, because the collector route receives names off the wire
 * and a type cannot check those.
 *
 * A Set rather than `EVENT_NAMES.includes(v)`: this runs once per event in
 * every batch, and `includes` on a 38-element array is a linear scan against
 * attacker-controlled input.
 */
const NAME_SET: ReadonlySet<string> = new Set(EVENT_NAMES);

export function isEventName(v: unknown): v is EventName {
  return typeof v === 'string' && NAME_SET.has(v);
}
