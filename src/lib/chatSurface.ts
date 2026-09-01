/**
 * Every decision the chat surface makes, as pure functions.
 *
 * ── WHY THEY ARE HERE AND NOT IN THE COMPONENT ─────────────────────────────
 *
 * `src/lib/swipeDeck.ts`'s argument verbatim, one release later: this project has
 * no jsdom, no Testing Library and no Playwright, and it **must not acquire any** —
 * so the only part of a client component `npm test` can reach is the part that does
 * not touch React or the DOM. `src/lib/draw.ts`'s `togglePick` is the older
 * precedent. The interesting decisions live here, `ChatRoom.tsx` is the thin part,
 * and `public/cards/_chatfit.html` plus loop 5 cover what is left.
 *
 * ── WHY `src/lib/chatSurface.ts` AND NOT `src/lib/chat/surface.ts` (F4's D9) ─
 *
 * `src/lib/chat/` is F1's, F2's and F3's directory — the engine, the director and
 * the voices — and a client-side reducer sitting inside it invites an import in the
 * wrong direction on the day somebody needs *"the state machine"* on the server.
 * `swipeDeck.ts` sits beside `lib/` for the same reason. Roadmap §7's F4 glob is
 * widened to include this file by reconciliation §4.
 *
 * ── PURE. NO REACT, NO DOM, NO `next/*`, NO `@/lib/db/**`, NO `server-only` ──
 *
 * Its only imports are types. `Date.now()` is never read here either: the one state
 * that needs a clock (`waiting`) takes the deadline as an argument, so every
 * transition in `## The state machine` is one call and one assertion.
 */
import type { Locale, ReaderId } from '@/data/types';
import type { AdvanceReply, ChatAuthor, ChatMessageDto } from '@/lib/chat/types';
import { REPLY_SNIPPET_CHARS } from '@/lib/chat/types';

// ---------------------------------------------------------------------------
// The advance loop
// ---------------------------------------------------------------------------

/**
 * WHERE THE CLIENT IS IN A RUN. **The client is a driver, not a scheduler**
 * (`C-D1`, `C-R2`): it never decides who speaks, never decides how long to wait and
 * never decides whether a run continues. Every one of those is in the reply.
 *
 * `settled` and `idle` render identically and are kept apart anyway, because they
 * are different facts about the room — *a run just finished* against *there was
 * never one* — and the day somebody wants to know which, the distinction is not
 * recoverable from a screen.
 *
 * `stopped` is TERMINAL FOR THIS MOUNT AND SHOWS NOTHING (`C-R7`, `F4-13`): a run
 * whose every beat failed ends `abandoned` server-side and is indistinguishable,
 * from the room, from the director saying nobody replies (`C-R6`). **There is no
 * error bubble in this release.**
 */
export type LoopState =
  | { kind: 'idle' }
  /** `POST /api/chat/message` is in flight and there is no run to drive yet. */
  | { kind: 'posting' }
  /** `POST /api/chat/advance` is in flight. `retried` is `F4-12`'s one retry. */
  | { kind: 'advancing'; runId: string | null; retried: boolean }
  /**
   * The server declared `delayMs` and the client is holding it (`C-R4`, seam S3).
   *
   * `reader: null` is the `busy` arm — somebody else holds the lease, so we wait and
   * render NO indicator, because naming a reader who is not about to speak is a lie
   * the querent can catch.
   */
  | { kind: 'waiting'; runId: string | null; reader: ReaderId | null; untilMs: number }
  /** A run finished. */
  | { kind: 'settled' }
  /** `runId` is kept so `online` can resume the same run (`F4-12`). */
  | { kind: 'offline'; runId: string | null }
  | { kind: 'stopped'; reason: 'failed' | 'shed' };

/**
 * Everything that can move the loop. **`reply` carries F1's `AdvanceReply`
 * verbatim** — the seven-arm union is the contract (`[R10]`), and re-describing it
 * here as four booleans is how two files start disagreeing about what `done` means.
 */
export type LoopEvent =
  /** The mount's two fetches came back. */
  | { type: 'loaded'; pendingRun: boolean; runId: string | null }
  /** The composer submitted. */
  | { type: 'send' }
  /** `POST /api/chat/message` stored the row. `runId` is null under `CHAT_ENABLED=0`. */
  | { type: 'sent'; runId: string | null }
  /** Refused, rate-limited, offline or failed. The COMPOSER speaks, not the loop. */
  | { type: 'send_failed' }
  | { type: 'reply'; reply: AdvanceReply; nowMs: number }
  /** `!ok` and `offline` are ANSWERS; only `timeout` means UNKNOWN (`F4-12`). */
  | { type: 'advance_failed'; reason: 'timeout' | 'error' }
  | { type: 'delay_elapsed' }
  | { type: 'offline' }
  | { type: 'online' }
  /** The tab went to the background. See `HIDDEN_CANCELS` below. */
  | { type: 'hidden' };

/**
 * How long to wait before re-asking when somebody else holds the lease (`C-R3`).
 *
 * **NOT ZERO AND NOT `delayMs`.** `busy` carries no `next`, because there is no beat
 * to name — another tab is executing one. A tight retry against a held lease is a
 * client hammering a lambda for a bubble that is already being written somewhere
 * else, and the lease is ~90s, so 1.5s is a poll rather than a spin.
 */
export const BUSY_RETRY_MS = 1500;

/**
 * One transition. **EVERY ROW OF F4 §3.2's TABLE IS ONE CALL AND ONE ASSERTION.**
 *
 * The three that matter most, and each is a rule from somewhere else in this repo:
 *
 *  - **a timeout retries ONCE and keeps the run id** — `POST /api/locale`'s rule 3,
 *    *a timeout is the one outcome that means UNKNOWN, so it is the only one
 *    retried.* A timed-out `advance` may have executed its beat and written its row;
 *    the run id plus the server's lease and `beats_done` accounting is what makes
 *    the retry idempotent enough.
 *  - **`!ok` does NOT retry** — that is an answer.
 *  - **`shed` lands in `stopped`, never in `settled`** (`C-D6`, `[F1-6]`). The run is
 *    still `running` with beats left; treating it as finished is what would lose
 *    them, and retrying it is a client hammering a budget that is already out.
 */
export function advanceStep(state: LoopState, event: LoopEvent): LoopState {
  // Terminal for this mount. Only a deliberate reload or a fresh `state` call
  // (which arrives as `loaded`) restarts the loop.
  if (state.kind === 'stopped' && event.type !== 'loaded') return state;

  switch (event.type) {
    case 'loaded':
      return event.pendingRun
        ? { kind: 'advancing', runId: event.runId, retried: false }
        : { kind: 'idle' };

    case 'send':
      /*
       * **THE COMPOSER STAYS ENABLED DURING A RUN** (Q-F4-3): a real group chat lets
       * you talk while somebody is typing, and blocking the box for twenty seconds is
       * the single most chatbot-like thing on this surface. So a send while a run is
       * in flight does NOT interrupt the loop — the optimistic bubble is the
       * component's business, and the engine serialises the runs.
       */
      return state.kind === 'advancing' || state.kind === 'waiting'
        ? state
        : { kind: 'posting' };

    case 'sent':
      if (event.runId === null) {
        // `CHAT_ENABLED=0`, or the engine already had a live run. The message is
        // stored either way (`[F1-19]`); there is simply nothing new to drive.
        return state.kind === 'advancing' || state.kind === 'waiting'
          ? state
          : { kind: 'idle' };
      }
      return state.kind === 'advancing' || state.kind === 'waiting'
        ? state
        : { kind: 'advancing', runId: event.runId, retried: false };

    case 'send_failed':
      return state.kind === 'posting' ? { kind: 'idle' } : state;

    case 'reply':
      return afterReply(event.reply, event.nowMs);

    case 'advance_failed':
      if (state.kind !== 'advancing') return state;
      if (event.reason === 'timeout' && !state.retried) {
        return { kind: 'advancing', runId: state.runId, retried: true };
      }
      return { kind: 'stopped', reason: 'failed' };

    case 'delay_elapsed':
      return state.kind === 'waiting'
        ? { kind: 'advancing', runId: state.runId, retried: false }
        : state;

    case 'offline':
      return { kind: 'offline', runId: runIdOf(state) };

    case 'online':
      return state.kind === 'offline'
        ? state.runId === null
          ? { kind: 'idle' }
          : { kind: 'advancing', runId: state.runId, retried: false }
        : state;

    case 'hidden':
      /*
       * **`setTimeout` IS THROTTLED TO >=1s IN A BACKGROUND TAB AND PAUSES ENTIRELY IN
       * A BACKGROUNDED iOS TAB**, so a held delay resumes at an arbitrary later moment
       * and drops three bubbles at once when the querent comes back. Nothing is lost by
       * stopping: the run is server-side, and `visibilitychange -> visible` re-asks
       * `GET /api/chat/state`, which is `C-D18`'s proactive tick anyway.
       */
      return state.kind === 'waiting' || state.kind === 'advancing' ? { kind: 'idle' } : state;
  }
}

function runIdOf(state: LoopState): string | null {
  return state.kind === 'advancing' || state.kind === 'waiting' || state.kind === 'offline'
    ? state.runId
    : null;
}

/** The seven arms, each mapped to exactly one state. */
function afterReply(reply: AdvanceReply, nowMs: number): LoopState {
  switch (reply.state) {
    case 'planned':
      return hold(reply.runId, reply.next.reader, nowMs + reply.next.delayMs);

    case 'spoke':
    case 'skipped':
      if (reply.done) return { kind: 'settled' };
      return reply.next
        ? hold(reply.runId, reply.next.reader, nowMs + reply.next.delayMs)
        : // `done: false` with no `next` is not a shape F1 emits; asking again
          // immediately is the only reading of it that cannot lose a beat.
          { kind: 'advancing', runId: reply.runId, retried: false };

    case 'silent':
      // `C-R6`. The director said nobody replies, which is a GOOD outcome and is what
      // happens in a real group chat. Nothing renders.
      return { kind: 'settled' };

    case 'busy':
      return hold(reply.runId, null, nowMs + BUSY_RETRY_MS);

    case 'shed':
      return { kind: 'stopped', reason: 'shed' };

    case 'idle':
      return { kind: 'settled' };
  }
}

function hold(runId: string | null, reader: ReaderId | null, untilMs: number): LoopState {
  return { kind: 'waiting', runId, reader, untilMs };
}

/** Who the typing indicator names, or null for no indicator (`C-R4`, `F4-7`). */
export function typingReader(state: LoopState): ReaderId | null {
  return state.kind === 'waiting' ? state.reader : null;
}

// ---------------------------------------------------------------------------
// Scroll anchoring
// ---------------------------------------------------------------------------

/**
 * How close to the bottom still counts as *at the bottom*.
 *
 * **48px is about one line of Cormorant plus its padding** — small enough that a
 * querent who has deliberately scrolled up by one bubble is not treated as being at
 * the bottom, large enough that the ~1px sub-pixel residue every browser leaves
 * after a snap does not read as *"scrolled away"*.
 */
export const ANCHOR_THRESHOLD_PX = 48;

/**
 * May the list scroll itself to the bottom?
 *
 * `F4-9`: **only when the querent was already at the bottom.** Reading back through
 * yesterday and being thrown to the end by Adrian is the single most annoying thing
 * a chat client does. The querent's OWN message is the exception and it is the
 * caller's, not this function's — they just pressed Kirim, and not showing them the
 * result of their own press is the one case where *do not interrupt* is wrong.
 *
 * **A NEGATIVE DISTANCE IS AT THE BOTTOM.** iOS rubber-banding reports one, and
 * `panelIndexAt`'s clamp is the precedent for treating an over-scroll as the edge
 * it is over-scrolling past.
 */
export function shouldStickToBottom(
  distanceFromBottom: number,
  threshold: number = ANCHOR_THRESHOLD_PX,
): boolean {
  return distanceFromBottom <= threshold;
}

/**
 * Is the newest message far enough away to be worth a control that jumps back to it?
 *
 * The second half of the scroll-position pair, and **deliberately a much coarser
 * question than `shouldStickToBottom`'s.** The 48px there is *"did the querent
 * deliberately scroll away"*; that is the right size for deciding whether the list
 * may move itself, and much too eager for deciding whether to put a floating button
 * over the room. A querent one bubble up has not asked for one.
 *
 * **ONE SCREENFUL, MEASURED AS THE LIST'S OWN `clientHeight`, NOT A SECOND
 * CONSTANT.** It self-scales — an iPhone SE and a tall Android get the same
 * *meaning* rather than the same number of pixels — and the meaning is exact: the
 * newest message is entirely off screen, so getting back to it is real work. A fixed
 * px figure would have to be justified against one screen size and would then be
 * wrong on every other.
 *
 * A non-positive height is *not* far away: before layout there is nothing to be far
 * from, and a predicate that answered `true` there would flash the control on the
 * first paint of every visit.
 */
export function shouldOfferScrollToLatest(
  distanceFromBottom: number,
  viewportHeight: number,
): boolean {
  if (viewportHeight <= 0) return false;
  return distanceFromBottom > viewportHeight;
}

// ---------------------------------------------------------------------------
// Day separators
// ---------------------------------------------------------------------------

/** `YYYY-MM-DD` in the DEVICE's zone, `todayKey()`'s shape and its reason. */
export type DayKey = string;

export type ChatRow =
  | { kind: 'day'; key: DayKey; relative: 'today' | 'yesterday' | null }
  | { kind: 'message'; message: ChatMessageDto };

/**
 * A message's calendar day **in the reader's own timezone**, from its ISO instant.
 *
 * `getFullYear()` and not `toISOString()`, for `todayKey()`'s reason stated in that
 * function's comment and repeated here because this is the second copy: UTC rolls
 * the day over at 07:00 in Jakarta, so a third of every Jakarta evening would sit
 * under tomorrow's separator.
 */
export function dayKeyOf(iso: string): DayKey {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The calendar day before `key`, as a key. Pure string-in, string-out date maths. */
export function previousDayKey(key: DayKey): DayKey {
  const [y, m, d] = key.split('-').map(Number);
  // Local midnight minus one day. `new Date(y, m, 0)` handles month and year ends,
  // and a LOCAL constructor rather than `Date.parse`, which reads `YYYY-MM-DD` as UTC.
  const prev = new Date(y, m - 1, d - 1);
  return dayKeyOf(prev.toISOString());
}

/**
 * The list, with a day separator wherever the day changes. **Oldest first.**
 *
 * **`today` IS A PARAMETER AND MAY BE `null`, AND THAT IS `F4-15`.** The separators
 * need the QUERENT's calendar day, which the server does not know; `todayKey()`
 * reads `new Date()`, which is a different value on the server and on the client,
 * and **React cannot patch attribute mismatches during hydration** — the
 * `shuffleDeck()` case is the canonical one, where the querent saw one spread and
 * was read a different one with nothing on screen looking wrong.
 *
 * So `ChatRoom` starts with `today = null`, renders the messages ungrouped, and sets
 * it in an effect. **Nothing flashes**: separators appearing one frame late is
 * invisible, and separators appearing WRONG is not.
 */
export function groupByDay(messages: readonly ChatMessageDto[], today: DayKey | null): ChatRow[] {
  const rows: ChatRow[] = [];
  if (today === null) {
    for (const message of messages) rows.push({ kind: 'message', message });
    return rows;
  }

  const yesterday = previousDayKey(today);
  let current: DayKey | null = null;

  for (const message of messages) {
    const key = dayKeyOf(message.createdAt);
    if (key !== current) {
      current = key;
      rows.push({
        kind: 'day',
        key,
        relative: key === today ? 'today' : key === yesterday ? 'yesterday' : null,
      });
    }
    rows.push({ kind: 'message', message });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// The quote stub
// ---------------------------------------------------------------------------

export type Quote = { id: string; author: ChatAuthor; text: string };

/**
 * What the quote stub inside a bubble renders (`C-D11`).
 *
 * **THE ROUTE INLINES THE STUB AND THAT IS WHY THIS CANNOT RETURN "GONE"** (`[R10]`,
 * F4's D3, answered by F1). A page is 40 rows and the whole point of the mechanic is
 * a beat quoting an hour-old message that is usually off the page — so
 * `ChatMessageDto.replyTo` carries `{ id, author, snippet }` resolved server-side.
 * And `reply_to_message_id` is `ON DELETE SET NULL`, so a non-null id always has a
 * row behind it: an unresolvable quote is not a state this schema can produce, which
 * is why there is no `chat.reply.gone` string in the catalog.
 *
 * `byId` is preferred over the stub when the quoted message is on the page, because
 * a locally-held body is the same text at full length, and the alternative is two
 * ellipsis positions for one bubble depending on how the querent scrolled.
 */
export function quoteFor(
  message: ChatMessageDto,
  byId: ReadonlyMap<string, ChatMessageDto>,
): Quote | null {
  const id = message.replyToMessageId;
  if (id === null) return null;

  const loaded = byId.get(id);
  if (loaded) return { id, author: loaded.author, text: clamp(loaded.body) };
  if (message.replyTo) {
    return { id, author: message.replyTo.author, text: message.replyTo.snippet };
  }
  return null;
}

/** The stub's own ceiling, so a locally-resolved body is not a second copy of the
 *  bubble. The CSS clamps to one LINE; this clamps the string. */
function clamp(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length <= REPLY_SNIPPET_CHARS ? flat : `${flat.slice(0, REPLY_SNIPPET_CHARS)}…`;
}

/**
 * Words kept in the COMPOSER's reply stub — a different ceiling from the in-bubble
 * quote's, and deliberately much shorter.
 *
 * A quote inside a bubble is content: it is what the reader was answering and it is
 * read. The stub above the box is a **label on a control** — *which message am I
 * replying to* — and it is read once, at a glance, while the keyboard is up and the
 * room is at its shortest. Eight words identify a message; a hundred and twenty
 * characters is a second copy of it.
 */
export const REPLY_PREVIEW_WORDS = 8;

/**
 * What the composer's reply stub renders (2026-08-09).
 *
 * ── THIS IS A WIDTH FIX, NOT A TIDY-UP, AND IT IS THE ONE THAT SHIPPED WRONG ──
 *
 * The stub took `replyTo.body` **raw** and drew it under `white-space: nowrap`, which
 * makes an element's MIN-content width equal its max-content width — the whole message
 * on one line, unbreakable. Everything above it inherits that as a minimum: the
 * composer, the room, and finally `.shell`'s auto-sized grid track. Spec says
 * `min-width: 0` on the text clamps that contribution to zero and Chrome agrees, which
 * is why every loop in this repo measured it green; WebKit's intrinsic sizing through
 * nested flex containers is where this class of bug actually lives, and the report is
 * from an iPhone. When it goes wrong the row is wider than the screen, `overflow:
 * hidden` on the shell eats the right-hand end, and **the querent sees a cropped field
 * with no send button** — which is exactly what was reported.
 *
 * **THE IN-BUBBLE QUOTE NEVER HAD THE BUG, AND THE DIFFERENCE IS THE WHOLE LESSON.**
 * `.quoteText` wraps, clamps by LINE, and carries `overflow-wrap: anywhere`, so its
 * min-content is one character; `quoteFor` also clamps the string. The composer's stub
 * had neither, while its comment claimed the two *"read as one mechanic"*. They now
 * are one mechanic.
 *
 * So this is belt AND braces on purpose: the CSS makes a long string harmless, and
 * this makes the string short. Either alone would do in a spec-correct browser, and
 * the bug is that this app does not run in one.
 */
export function replyPreview(body: string, words = REPLY_PREVIEW_WORDS): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  if (flat === '') return '';

  const parts = flat.split(' ');
  const kept = parts.slice(0, words).join(' ');
  const cut = parts.length > words;

  /* A word can be a 96-character URL — the seeded harness case — so the word cap is
     not a length cap. `clamp` is the same ceiling the in-bubble quote already uses. */
  const capped = clamp(kept);
  if (!cut || capped.endsWith('…')) return capped;
  return `${capped}…`;
}

// ---------------------------------------------------------------------------
// The optimistic bubble
// ---------------------------------------------------------------------------

/**
 * The querent's own message, on screen before the POST resolves (`C-R1`).
 *
 * **THE ID IS THE CLIENT KEY, AND THAT IS NOT A CONVENIENCE.** `POST
 * /api/chat/message` takes a `client_key` so `F4-12`'s one permitted timeout retry
 * cannot double-post — *"both copies become context for every future turn"*
 * (`C-R5`) — and reusing it as the React key means the swap from optimistic to
 * stored row replaces the element rather than appending beside it.
 *
 * `runId`, `beatIndex` and `intent` are null because a user message belongs to no
 * run; `insertMessage` refuses any other combination.
 */
export function optimisticMessage(args: {
  clientKey: string;
  body: string;
  locale: Locale;
  replyTo: ChatMessageDto | null;
  attachedReadingId: string | null;
  createdAt: string;
}): ChatMessageDto {
  return {
    id: args.clientKey,
    author: 'user',
    body: args.body,
    locale: args.locale,
    replyToMessageId: args.replyTo?.id ?? null,
    replyTo: args.replyTo
      ? { id: args.replyTo.id, author: args.replyTo.author, snippet: clamp(args.replyTo.body) }
      : null,
    attachedReadingId: args.attachedReadingId,
    runId: null,
    beatIndex: null,
    intent: null,
    createdAt: args.createdAt,
  };
}

/**
 * Replace the optimistic bubble with the stored row, or drop it (a refusal).
 *
 * **A LOCALLY BUILT ARRAY, HANDED TO `setMessages` WHOLE** — never
 * `setMessages(prev => …)` with a value that came from a side effect. StrictMode
 * double-invokes updaters, and `DaySummary`'s comment records what that costs:
 * *"would duplicate every chunk in development"*.
 */
export function settleOptimistic(
  messages: readonly ChatMessageDto[],
  clientKey: string,
  stored: ChatMessageDto | null,
): ChatMessageDto[] {
  const out: ChatMessageDto[] = [];
  for (const m of messages) {
    if (m.id !== clientKey) {
      out.push(m);
      continue;
    }
    if (stored) out.push(stored);
  }
  return out;
}

/**
 * Append arriving bubbles, oldest first, ignoring any the list already holds.
 *
 * The de-duplication is not defensive padding: `F4-12`'s retry can deliver a beat
 * whose row was already written by the timed-out attempt, and the whole point of
 * that retry is that the server's `beats_done` accounting decides — not the client.
 */
export function appendMessages(
  messages: readonly ChatMessageDto[],
  arriving: readonly ChatMessageDto[],
): ChatMessageDto[] {
  const seen = new Set(messages.map((m) => m.id));
  const out = [...messages];
  for (const m of arriving) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

/**
 * Prepend an older page, oldest first, ignoring duplicates.
 *
 * `GET /api/chat/messages` answers NEWEST FIRST and the room renders oldest first,
 * so the caller reverses; this function is the only place the two orders meet.
 */
export function prependMessages(
  messages: readonly ChatMessageDto[],
  older: readonly ChatMessageDto[],
): ChatMessageDto[] {
  const seen = new Set(messages.map((m) => m.id));
  return [...older.filter((m) => !seen.has(m.id)), ...messages];
}
