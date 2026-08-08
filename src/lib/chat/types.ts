/**
 * The shapes six workstreams share. **F1 owns this file (`[F1-14]`).**
 *
 * ── A LEAF. NO `server-only`, NO `next/*`, NO `process.env` ─────────────────
 *
 * Its ONLY import is `@/data/types`, which is itself import-free. That is not
 * tidiness: `src/lib/db/queries/chat.ts` names `ChatAuthor` and may not acquire
 * `server-only` even transitively (`queries/contract.test.ts` walks the graph),
 * and F4's client components name `ChatMessageDto` and `AdvanceReply`. `flags.ts`,
 * `prefix.ts`, `origin.ts` and `choice.ts` are the four precedents, and every one of
 * them says the same thing: **a leaf that acquires one import stops being reachable
 * from one side of the app, and the discovery is a build failure in somebody else's
 * branch.** `types.contract.test.ts` is the fence.
 *
 * What may NEVER live here: an env read, a prompt string, a validator, a default
 * that is really a policy. Those are `model.ts`, `budget.ts`, F2's and F3's.
 */
import type { Locale, ReaderId } from '@/data/types';

/**
 * WHO WROTE A `chat_messages` ROW.
 *
 * **ONE COLUMN, NOT A NULLABLE `reader_id` BESIDE A BOOLEAN** (§3.2): two columns
 * that must agree is two columns that will not.
 *
 * `'user'` sits in the same union as the three readers rather than beside it,
 * because every consumer — the renderer, the transcript builder, the badge count —
 * asks exactly one question of a row, *"is this me or one of them"*, and a union is
 * how that question stays one comparison.
 */
export type ChatAuthor = 'user' | ReaderId;

/**
 * `pending` and `planning` DIFFER, and collapsing them loses the distinction the
 * lease reclaim needs: `pending` is minted and unclaimed, `planning` is claimed and
 * the director is in flight. A reclaimed `planning` run is provably one whose
 * executor died — and `[F1-4]` makes `status = 'planning' AND beats IS NOT NULL`
 * unrepresentable, so it is also provably one with no sheet.
 *
 * **`abandoned` and a zero-beat `done` are indistinguishable FROM THE ROOM**
 * (`C-R7`) and distinguishable here, which is the whole reason `chat.run_finished`
 * exists as an event.
 */
export type RunStatus = 'pending' | 'planning' | 'running' | 'done' | 'abandoned';

/**
 * WHY A RUN EXISTS. **F5 owns the values; the set is closed and lives here** (§3.3).
 *
 * `C-D5`: **a proactive turn is a `chat_turn`, and what made it proactive is this.**
 * An op is what the call *is*; this is why it happened. `/admin/chat` groups by it.
 */
export type RunTrigger =
  | 'user_message'
  | 'reading_completed'
  | 'idle_nudge'
  | 'unanswered'
  | 'cron';

/**
 * WHO IS SPEAKING, and the union is `ReaderId` because a beat is always a reader.
 * There is no `'user'` beat: the querent is not directed.
 */
export type BeatSpeaker = ReaderId;

/**
 * WHO IS BEING SPOKEN TO. Not the same thing as `replyTo`, and conflating them is
 * the mistake the two fields exist to prevent — see the comment on `replyTo`.
 */
export type BeatAddressee = 'user' | ReaderId;

/**
 * WHAT THE BEAT IS FOR.
 *
 * **F2 OWNS THE MEMBERS; F1 OWNS THAT THE FIELD IS A CLOSED UNION DECLARED HERE.**
 * The relationship is `LLMOp`'s: the union lives in the import-free file because
 * `queries/chat.ts` and a client component both name it, and adding a member is a
 * reconciliation question rather than an authoring convenience.
 *
 * **SIX, NOT SEVEN. `aside` WAS DROPPED BY RECONCILIATION `[R9]`.** F2 proposed the
 * fold against a shape with no `to` field; F1's `to` makes it stronger, not weaker —
 * **an aside is `to` naming somebody with `replyTo: null`**, which is two fields
 * already saying it. Reinstating a seventh member is a reconciliation question.
 *
 * `ask` IS THE ONE THE RELEASE IS MEASURED BY (`C-N1d`), which is why
 * `chat.run_planned` carries an `asks` count rather than leaving it to be derived.
 */
export type BeatIntent = 'answer' | 'ask' | 'react' | 'tease' | 'agree' | 'push_back';

/** Every member, as a value, for a runtime check at the route boundary. */
export const BEAT_INTENTS = [
  'answer',
  'ask',
  'react',
  'tease',
  'agree',
  'push_back',
] as const satisfies readonly BeatIntent[];

/**
 * An `angle` names a SUBJECT and never a sentence, and this is the ceiling that
 * makes that mechanical rather than hoped for (`[R9]`).
 *
 * **90 characters is a phrase.** F1 refused free text in a beat outright, on the
 * ground that *"a director-written summary sitting in the prompt is what a voice
 * would read instead of the transcript"* (`C-R5`) — and the reconciliation admitted
 * the field while **recording F1's concern as the reason for every constraint on
 * it**: capped here, run through `stripUntrusted()`, nulled on a newline, and `null`
 * an ordinary outcome the prompt explicitly licenses.
 *
 * The deciding argument was the release's own: without an angle, three beats of
 * intent `answer` give three voices nothing to differ about, and a room where all
 * three answer the same thing in the same direction is the panel `C-N1c` forbids.
 */
export const MAX_ANGLE_CHARS = 90;

/**
 * ONE BEAT. FIVE FIELDS, FOUR CLOSED, AND THE FIFTH IS BOUNDED PROSE (`[R9]`).
 *
 * `delayMs` is NOT here (seam S3, `[R11]`). It is a function of the PREVIOUS
 * bubble's length, which does not exist when the sheet is written; F3's `Pace`
 * computes it at execution time from prose that has actually been generated.
 */
export type Beat = {
  /** Which reader speaks. */
  reader: BeatSpeaker;
  /**
   * WHO THEY ARE TALKING TO. A prompt fact: it decides whether the querent is
   * addressed by name at all, which is what `validateTurn`'s address-form check
   * (`C-D10`) needs before it can refuse an invented nickname.
   */
  to: BeatAddressee;
  /**
   * WHICH MESSAGE THIS QUOTES, or null. `chat_messages.id`.
   *
   * **THIS IS THE QUOTE STUB AND NOT THE ADDRESSEE** (`C-D11`: *"WhatsApp's quote
   * stub and nothing more"*). A beat may address Margaret without quoting her, and
   * may quote a message while addressing the querent about it. Two facts, two
   * fields; merged, and `to` becomes unknowable for every un-quoted beat.
   *
   * **THE "OUT OF NOWHERE" REPLY IS THIS FIELD POINTING AT AN OLD ID** and nothing
   * else. `C-D11`: nothing else is needed and nothing else may be built.
   */
  replyTo: string | null;
  intent: BeatIntent;
  /** A SUBJECT, never a sentence. `<= MAX_ANGLE_CHARS`. `null` is ordinary. */
  angle: string | null;
};

/**
 * THE SHEET, AS IT IS STORED IN `chat_runs.beats`.
 *
 * A WRAPPER AND NOT A BARE ARRAY (`F1-D1`): a jsonb blob written by one workstream,
 * read by another, indexed into by `beats_done` forever, cannot say which shape it
 * is if it is an array. One integer buys a discriminated read instead of a guess.
 *
 * **`beats: []` IS A VALID SHEET AND IS THE COMMON GOOD OUTCOME** (`C-R6`): the
 * director said nobody replies, the run goes straight to `done`, no `chat_turn` call
 * is made, and the querent's message sits there unanswered — which is what happens in
 * a real group chat. F7 measures the rate; **a rate of zero means the director is not
 * really deciding.**
 */
export type BeatSheet = {
  v: 1;
  beats: Beat[];
};

/**
 * How much of a sheet is left to execute.
 *
 * **A PURE FUNCTION IN THE TYPES LEAF, AND IT IS HERE BECAUSE `queries/chat.ts`
 * COULD NOT HOLD IT.** `queries/contract.test.ts` asserts *"the handle is the first
 * parameter of every exported function"* over every file matching `/queries/`, and a
 * pure fold has no handle to take. Same wall W3 hit with the Lotus cache, W5 with
 * `windowBounds`, V6 with `history/dates.ts` and A3 with `rollup.ts`; same
 * resolution, and the precedent is that **this codebase separates the pure part from
 * the part that touches the world, and the reason is always that the pure part is
 * what tests can reach.**
 *
 * Structurally typed rather than `Pick<ChatRun, …>`, because naming the row type
 * would make this leaf import `schema.ts` and the leaf would stop being one.
 */
export function beatsRemaining(run: { beats: BeatSheet | null; beatsDone: number }): number {
  return Math.max(0, (run.beats?.beats.length ?? 0) - run.beatsDone);
}

/**
 * THE LONGEST MESSAGE A QUERENT MAY POST.
 *
 * **NOT `MAX_QUESTION_LENGTH`'s 200.** A question is one line typed into a box under
 * a spread; a chat message is a paragraph somebody types into a room they were
 * invited to talk in. Enforced by Zod at the route and **not by a column CHECK**,
 * following `blog_post_locales`' *"under 110 chars by lint, not by column"* — a
 * constant that moves must not require a migration.
 */
export const MAX_CHAT_MESSAGE_LENGTH = 2000;

/**
 * How much of a quoted message travels inline with the row that quotes it
 * (`[R10]`). A stub, never the body: enough to recognise the bubble, not enough to
 * be a second copy of it.
 */
export const REPLY_SNIPPET_CHARS = 120;

/**
 * THE QUOTE STUB, INLINED ON EVERY MESSAGE THAT HAS ONE (`[R10]`, F4's D3).
 *
 * A page is 40 rows and `C-D11`'s whole point is a beat quoting an hour-old message
 * that is usually off the page — **without the inline stub the quote renders as
 * nothing and the release's most distinctive mechanic silently disappears.**
 */
export type ReplyStub = {
  id: string;
  author: ChatAuthor;
  /** `<= REPLY_SNIPPET_CHARS`, ellipsised by the query, never the whole body. */
  snippet: string;
};

/**
 * ONE MESSAGE, AS IT REACHES THE BROWSER.
 *
 * **`model` IS ABSENT AND ITS ABSENCE IS `[F1-12]`.** §0.3 non-negotiable 2 forbids a
 * model name reaching the browser, and `audit-secrets.ts` greps the built bundle for
 * env VALUES — it cannot see a column a route JSON-serialised. Explicit projections
 * in `queries/chat.ts` are the enforcement.
 */
export type ChatMessageDto = {
  id: string;
  author: ChatAuthor;
  body: string;
  /** The language **this message** is in (`C-D9`). Not the viewer's. */
  locale: Locale;
  replyToMessageId: string | null;
  /** `null` when the quoted row is gone (`on delete set null`) or was never set. */
  replyTo: ReplyStub | null;
  attachedReadingId: string | null;
  runId: string | null;
  beatIndex: number | null;
  /** F5's unanswered-ask material and F7's ask rate read this. Null for the querent. */
  intent: BeatIntent | null;
  createdAt: string; // ISO
};

/** Who is about to speak, and for how long the indicator runs. One fact, one object. */
export type NextBeat = { reader: ReaderId; delayMs: number };

/**
 * WHAT ONE `advance` CALL ANSWERS. **A DISCRIMINATED UNION WHERE `C-R2` SKETCHED
 * FOUR OPTIONAL SIBLINGS**, and `C-R2` delegates the naming to F1.
 *
 * `typingFor` and `delayMs` are one object because they are one fact, and a reply
 * that could carry a `delayMs` with no reader is a shape F4 would have to defend
 * against at every call site. **`done` is present on every arm** so a client's loop
 * condition never reads `undefined`.
 *
 * **`'shed'` IS THE ARM `C-R2`'s SKETCH COULD NOT EXPRESS** (`[R10]`, `[F1-6]`), and
 * `C-D6` requires it: the run stays `running` with beats left, it is not an error and
 * it is not done. `done: true` would stop the client; `done: false` with no message
 * makes it hammer the soft ceiling; an HTTP error gets retried. **F4 must not retry
 * this arm** — retrying a soft-ceiling refusal is a client hammering a budget that is
 * already out.
 *
 * **`messages` IS AN ARRAY ON `'spoke'`, AND THAT IS `[R19]`.** Miftah granted F3's
 * ask that one beat may produce TWO bubbles — *"a person who has more to say sends a
 * second message rather than a longer one"* — and it had to be built now because it
 * cannot be added cheaply later. `beats_done` still advances by ONE.
 */
export type AdvanceReply =
  | { state: 'planned'; runId: string; next: NextBeat; done: false }
  | {
      state: 'spoke';
      runId: string;
      /** One or two (`[R19]`), in the order they were written. Never empty. */
      messages: ChatMessageDto[];
      next: NextBeat | null;
      done: boolean;
    }
  | { state: 'skipped'; runId: string; next: NextBeat | null; done: boolean }
  | { state: 'silent'; runId: string; done: true }
  | { state: 'busy'; runId: string | null; done: false }
  | { state: 'shed'; runId: string | null; done: false }
  | { state: 'idle'; runId: null; done: true };

/** `GET /api/chat/state`. **The count drives the dot; the flag drives the warm** (`[R6]`). */
export type ChatStateReply = {
  /** Reader messages after `last_read_at`. **A STORED BUBBLE LIGHTS THE DOT, NEVER A
   *  PENDING RUN** — `C-R6` makes a zero-beat plan valid, so a dot lit by a pending
   *  run can lead the querent to a room with nothing new in it. */
  unread: number;
  lastReadAt: string | null;
  lastMessageAt: string | null;
  pendingRun: { id: string; status: RunStatus; beatsRemaining: number } | null;
  /** `[F1-19]`. F4 disables the composer with one line of copy; the room still opens. */
  chatEnabled: boolean;
};

/** `GET /api/chat/messages`. Newest first, keyset-paginated on `(created_at, id)`. */
export type ChatMessagesReply = {
  messages: ChatMessageDto[];
  hasMore: boolean;
};

// ---------------------------------------------------------------------------
// The three interfaces F2 and F3 implement. `run.ts` calls them; nothing else does.
// ---------------------------------------------------------------------------

export type DirectorInput = {
  runId: string;
  userId: string;
  trigger: RunTrigger;
  triggerMessageId: string | null;
  triggerReadingId: string | null;
  /** The querent's default, per `C-D9`'s fallback. The director may override it. */
  fallbackLocale: Locale;
};

export type DirectorResult = {
  beats: Beat[];
  locale: Locale;
  /** `'silence'` is `C-R6` and is a GOOD outcome. `'fallback'` is `plan_source`. */
  outcome: 'ok' | 'fallback' | 'silence';
  /** `validatePlan`'s CLOSED set, never a message. `null` on `'ok'`. */
  rejectReason: string | null;
  model: string;
  totalMs: number;
};

/** F2 implements this. */
export interface Director {
  plan(input: DirectorInput): Promise<DirectorResult>;
}

export type VoiceInput = {
  runId: string;
  userId: string;
  beat: Beat;
  beatIndex: number;
  locale: Locale;
  trigger: RunTrigger;
  /** `C-R5`: every beat sees every earlier beat of its own run, as ACTUAL PROSE. */
  runSoFar: ChatMessageDto[];
  attempt: 1 | 2;
};

export type VoiceResult =
  | {
      ok: true;
      /**
       * ONE OR TWO BUBBLES, IN ORDER (`[R19]`). A voice that has more to say sends a
       * second message rather than a longer one. Never empty — an empty array is a
       * failure and must come back as `ok: false`, or `C-R7`'s *"a reader never
       * stores an empty bubble"* arrives as data.
       */
      bodies: string[];
      addressForm: 'nickname' | 'clipped' | 'none';
      model: string;
      totalMs: number;
    }
  | { ok: false; rejectReason: string; totalMs: number };

/** F3 implements this. */
export interface Voice {
  speak(input: VoiceInput): Promise<VoiceResult>;
}

/**
 * Seam S3, `[R11]`: **F3 computes it, F1 returns it, F4 honours it.** Three files,
 * one number. PURE, so `npm test` can drive it. `previousChars` is null before the
 * first bubble of a run.
 *
 * `C-R4`: **a constant is a metronome and a metronome is the thing that reads as a
 * bot.** F4 owns `prefers-reduced-motion`, under which the indicator does not animate
 * **but the delay still applies** — it is conversational pacing, not decoration.
 */
export type Pace = (args: { next: Beat; previousChars: number | null }) => number;
