'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { ChatBubble } from '@/components/ChatBubble';
import { ChatComposer } from '@/components/ChatComposer';
import { ChatTyping } from '@/components/ChatTyping';
import { ReadingAttachment } from '@/components/ReadingAttachment';
import { RefusalNotice } from '@/components/RefusalNotice';
import { StagedAttachment } from '@/components/StagedAttachment';
import { READERS } from '@/data/readers';
import { LOCAL_DATE_HEADER, SESSION_HEADER } from '@/lib/analytics/localdate';
import { getSessionId, track } from '@/lib/analytics/track.client';
import type { ChatAttachments, StagedReading } from '@/lib/chat/attachmentView';
import type {
  AdvanceReply,
  ChatMessageDto,
  ChatMessagesReply,
  ChatStateReply,
} from '@/lib/chat/types';
import {
  advanceStep,
  appendMessages,
  groupByDay,
  optimisticMessage,
  prependMessages,
  quoteFor,
  settleOptimistic,
  shouldStickToBottom,
  typingReader,
  type DayKey,
  type LoopEvent,
  type LoopState,
} from '@/lib/chatSurface';
import { formatDate } from '@/lib/i18n/format';
import { useLocale, useT } from '@/lib/i18n/LocaleProvider';
import type { RefusalPayload } from '@/lib/moderation/types';
import { todayKey } from '@/lib/storage';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import styles from './ChatRoom.module.css';
import { useKeyboardInset } from './keyboardInset';

/*
 * ── THE FIVE BOUNDS (`F4-11`) ───────────────────────────────────────────────
 *
 * Every fetch on this screen has its own `AbortController`, its own timeout, and a
 * bound UNDER its route's `maxDuration` so the client's own copy wins over a
 * platform 504 — *"a bigger `maxDuration` is not a latency regression, but it must
 * be paired with a bound on the client, or you have only made the hang longer."*
 *
 * `chatSurface.test.ts` asserts there are exactly FIVE of each, because the
 * behaviour needs a real browser and a count is a thing a regex can hold. **If
 * `/api/chat/read` is ever folded into `state` the number becomes four and that
 * assertion changes in the same commit** — a decision, rather than a green test
 * somebody edited to make it pass.
 *
 * `new AbortController()` rather than `MarkdownEditor`'s `AbortSignal.timeout()`,
 * and the difference is deliberate: these must also abort ON UNMOUNT. StrictMode
 * mounts, unmounts and remounts every effect in development, and a room left open
 * for ten minutes with an unbounded socket is the other half of the same rule.
 */
const MESSAGES_ABORT_MS = 10_000; // route 15
const STATE_ABORT_MS = 10_000; // route 30
const SEND_ABORT_MS = 18_000; // route 20
const ADVANCE_ABORT_MS = 55_000; // route 60 — the blog editor's translate bound
const READ_ABORT_MS = 10_000; // route 15

/** One page. The route caps at 50; 30 is two screens of bubbles on a phone. */
const PAGE_SIZE = 30;
/** How long a quoted bubble stays lit after its stub is tapped. */
const FLASH_MS = 1200;

type Outgoing = {
  /** `crypto.randomUUID()`. The idempotency key AND the optimistic bubble's id. */
  clientKey: string;
  body: string;
  replyToMessageId: string | null;
  attachedReadingId: string | null;
  /** F6. Which control staged it; `null` when nothing was attached. */
  attachFrom: 'history' | 'draw' | null;
};

/** One reader's display name. DATA, and English in both locales. */
const nameOf = (id: string) => READERS.find((r) => r.id === id)?.name ?? id;

/** `html[data-still]` — the screenshot hook, read HERE and not left to the
 *  stylesheet (`F4-10`): a JS `scrollTo({ behavior })` OVERRIDES CSS
 *  `scroll-behavior` rather than defaulting from it. */
const isStill = () =>
  typeof document !== 'undefined' && document.documentElement.hasAttribute('data-still');

/** One place a body is read, so a `.catch(() => ({}))` cannot appear at one of five
 *  call sites and be the one nobody looks at. `savePublish` was written that way. */
async function readReply<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * The room: five fetches, one loop, and a list that does not move under the querent.
 *
 * ── THE CLIENT IS A DRIVER, NOT A SCHEDULER (`C-D1`, `C-R2`) ───────────────
 *
 * It never decides who speaks, never decides how long to wait and never decides
 * whether a run continues. All three are in `AdvanceReply`, and every transition
 * lives in `advanceStep` in `src/lib/chatSurface.ts`, where `npm test` can reach it.
 * This file owns the fetches, the refs and the DOM, and nothing else.
 *
 * ── FIVE TRAPS BITE THIS SCREEN AT ONCE, AND NO PREVIOUS SURFACE HIT ALL FIVE ─
 *
 *  1. **`todayKey()` IS NEVER CALLED DURING RENDER** (`F4-15`). It reads
 *     `new Date()`, which differs between the server render and hydration, and React
 *     cannot patch attribute mismatches during hydration — the `shuffleDeck()` case
 *     is the canonical one, where *the querent saw one spread and was read a
 *     different one, with nothing on screen looking wrong.* `today` starts null and
 *     an effect sets it. **Do not "simplify" this into `useState(() => todayKey())`**;
 *     `HistoryBrowser` carries the same sentence.
 *  2. **NO SIDE EFFECT INSIDE A `setState` UPDATER.** StrictMode double-invokes
 *     them. Every updater here is PURE and IDEMPOTENT — `appendMessages` de-dupes by
 *     id, which is exactly what `setText(t => t + chunk)` was not when it duplicated
 *     every chunk of `DaySummary` in development. `track()` is called in the handler
 *     body (`F4-16`).
 *  3. **NOTHING IS SEEDED FROM A PROP THAT CAN CHANGE.** v0.6.0's silent content
 *     loss: the admin editor's locale tabs are `<Link>`s, so a soft navigation
 *     reconciled the editor as the same element and `useState(initial)` never re-ran,
 *     storing the Indonesian document as the English one. The message list is fetched,
 *     and the reply target is set only by a tap.
 *
 *     **F6's TWO PROPS ARE THE EXCEPTION AND THEY ARE THE SAME TRAP FROM THE OTHER
 *     SIDE.** `staged` and `entry` are read ONCE, into state and into a ref, and then
 *     this component stops looking at them — because the one soft navigation that
 *     happens on this route is `router.replace('/chat')` clearing `?attach=`, which
 *     re-renders the server component and hands back `staged: null`. **An effect
 *     syncing the prop into the state would therefore UNSTAGE the reading a moment
 *     after staging it**, and nothing on screen would explain why. Re-staging is not a
 *     case that exists: every route into `?attach=` comes from another page, which
 *     unmounts this one.
 *  4. **THE DEPENDENCY LIST IS THE PRIMARY MECHANISM** (`F4-8`, V5's measured
 *     five-row table). The advance loop depends on `loop` and nothing else;
 *     `messages` is a fresh array on every render and every arriving bubble
 *     re-renders the room, so listing it would re-enter the loop per bubble — N
 *     concurrent `advance` calls for one run, which the lease saves in the database
 *     and not on the screen. `react-hooks/exhaustive-deps` will never argue either
 *     way, because the body reads `…Ref.current`.
 *  5. **`locale` IS NOT A DEPENDENCY HERE, AND THAT IS THE OPPOSITE OF
 *     `FrequencyLine` AND `DaySummary`** (`F4-5`). Those two had to ACQUIRE it,
 *     because their rows are keyed on locale. `C-D9` says a chat message is written
 *     once, in the language it was written in — so a re-fetch would return
 *     byte-identical rows, and mid-run it would race the advance loop against a held
 *     lease, where a bubble either doubles or vanishes with nothing logged.
 */
export function ChatRoom({
  staged: stagedProp,
  entry,
}: {
  /** F6. The reading `?attach=` named, already resolved and ownership-checked. */
  staged: StagedReading | null;
  /** `chat.opened.from`, decided on the server. See `entryOf` in `page.tsx`. */
  entry: 'button' | 'direct' | 'attach';
}) {
  const t = useT();
  const locale = useLocale();
  const reduce = usePrefersReducedMotion();
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [loop, setLoop] = useState<LoopState>({ kind: 'idle' });
  const [today, setToday] = useState<DayKey | null>(null);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessageDto | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [newBelow, setNewBelow] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [sending, setSending] = useState(false);
  const [pendingKeys, setPendingKeys] = useState<readonly string[]>([]);
  const [sendFailure, setSendFailure] = useState<'send' | 'rateLimit' | 'offline' | null>(null);
  const [refusal, setRefusal] = useState<RefusalPayload | null>(null);
  const [unsent, setUnsent] = useState<Outgoing | null>(null);
  /*
   * F6. **SEEDED ONCE, AND NEVER SYNCED** — trap 3 above. `router.replace('/chat')`
   * hands this prop back as null a moment later, and an effect that followed it would
   * unstage the reading the querent just picked.
   */
  const [staged, setStaged] = useState<StagedReading | null>(stagedProp);
  /*
   * Every attachment any rendered bubble needs, keyed by `readings.id`, merged as
   * pages arrive. **A MAP RATHER THAN A FIELD PER MESSAGE**, because `chat/types.ts`
   * is a leaf six workstreams depend on (`[F1-14]`) and because the same reading may
   * be attached twice (O3) — one copy either way.
   */
  const [attachments, setAttachments] = useState<ChatAttachments>(
    stagedProp ? { [stagedProp.preview.readingId]: stagedProp.preview } : {},
  );

  /* The room's own box, measured against the visual viewport so the composer stays
     above the software keyboard. See `keyboardInset.ts`. */
  const roomRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  /* The current messages, reachable from an effect that must not depend on them. */
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  /** Was the querent at the bottom when the list last grew? Read BEFORE the DOM
   *  grows, into a ref, and acted on in the layout effect. */
  const stickRef = useRef(true);
  /** The scroll height before an older page was prepended, or null. */
  const prependedFromRef = useRef<number | null>(null);
  /** Every in-flight controller, so unmount can abort all of them at once. */
  const controllersRef = useRef<Set<AbortController>>(new Set());
  const mountedRef = useRef(true);
  const openedRef = useRef(false);
  const firstPaintRef = useRef(true);
  /*
   * F6. **THE ENTRY POINT AS IT WAS AT MOUNT, AND IT IS A REF BECAUSE OF A RACE.**
   * `chat.opened` fires after two awaited fetches, and by then the effect that clears
   * `?attach=` has very likely run — so a read of the LIVE prop (or of
   * `window.location.search`, which is what this used to be) would report `'direct'`
   * for exactly the opens F6 exists to distinguish. Written once, never reassigned;
   * the mount effect must not list `entry` as a dependency, because that would re-run
   * the whole first-page load when the URL is tidied.
   */
  const entryRef = useRef(entry);
  /** F6. The `?attach=` in the address bar is consumed exactly once. */
  const attachConsumedRef = useRef(false);

  /*
   * **THE COMPOSER STAYS ABOVE THE SOFTWARE KEYBOARD** — the one piece of geometry
   * `100dvh` cannot express, because the keyboard moves the visual viewport and leaves
   * the layout viewport alone. Everything it knows is in `keyboardInset.ts`.
   */
  useKeyboardInset(roomRef);

  const dispatch = useCallback((event: LoopEvent) => {
    // A PURE updater: `advanceStep` has no side effects and returns the SAME object
    // when nothing changes, so StrictMode's double invocation is free and the loop
    // effect below does not re-run on a no-op transition.
    setLoop((state) => advanceStep(state, event));
  }, []);

  /** Register, bound and clean up one request. Every fetch site opens with this. */
  const openRequest = useCallback((ms: number) => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ms);
    controllersRef.current.add(controller);
    return {
      signal: controller.signal,
      /** True only for the timeout, never for the unmount abort — `F4-12` retries a
       *  timeout and must not retry a teardown. */
      timedOut: () => timedOut,
      done: () => {
        clearTimeout(timer);
        controllersRef.current.delete(controller);
      },
    };
  }, []);

  const headers = useCallback(
    (json = false): Record<string, string> => ({
      [SESSION_HEADER]: getSessionId(),
      // The querent's own calendar day, which the server cannot compute.
      [LOCAL_DATE_HEADER]: todayKey(),
      ...(json ? { 'content-type': 'application/json' } : {}),
    }),
    [],
  );

  // -------------------------------------------------------------------------
  // 1. The page of history. ONE fetch site, used by the mount and by `Muat yang
  //    lebih lama` — the cursor is the only difference.
  // -------------------------------------------------------------------------
  const loadMessages = useCallback(
    async (before: ChatMessageDto | null): Promise<ChatMessageDto[] | null> => {
      const req = openRequest(MESSAGES_ABORT_MS);
      const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (before) {
        // BOTH OR NEITHER: a timestamp alone is not a cursor when one beat writes
        // two rows a millisecond apart (`[R19]`), and the route 400s on half of one.
        query.set('before', before.createdAt);
        query.set('beforeId', before.id);
      }
      try {
        const res = await fetch(`/api/chat/messages?${query.toString()}`, {
          headers: headers(),
          signal: req.signal,
        });
        if (!res.ok) return null;
        const page = await readReply<ChatMessagesReply & { attachments?: ChatAttachments }>(res);
        if (!page) return null;
        setHasMore(page.hasMore);
        /*
         * F6. **MERGED, NEVER REPLACED**, and the staged card is what proves it
         * matters: the querent sends an attachment, the optimistic bubble draws it
         * from the entry this map already holds, and then `Muat yang lebih lama`
         * arrives with a page that knows nothing about it. A `setAttachments(page…)`
         * would blank the card under a bubble already on screen.
         *
         * The route omits the key entirely on a page with no attachment, which is
         * nearly every page, so `?? {}` is the common path rather than a defence.
         */
        if (page.attachments) {
          setAttachments((prev) => ({ ...prev, ...page.attachments }));
        }
        // The route answers NEWEST FIRST; the room renders oldest first.
        return [...page.messages].reverse();
      } catch {
        return null;
      } finally {
        req.done();
      }
    },
    [headers, openRequest],
  );

  // -------------------------------------------------------------------------
  // 2. The state call: the badge's number, the flag that warms a pending run, and
  //    `CHAT_ENABLED`. **Its `after()` is `C-D18`'s proactive tick**, which is why
  //    the same call is made again when the tab becomes visible.
  // -------------------------------------------------------------------------
  const loadState = useCallback(async (): Promise<ChatStateReply | null> => {
    const req = openRequest(STATE_ABORT_MS);
    try {
      const res = await fetch('/api/chat/state', { headers: headers(), signal: req.signal });
      if (!res.ok) return null;
      return await readReply<ChatStateReply>(res);
    } catch {
      return null;
    } finally {
      req.done();
    }
  }, [headers, openRequest]);

  // -------------------------------------------------------------------------
  // 3. The read cursor. Fire-and-forget, and still bounded: an unbounded fetch on a
  //    page that lives for ten minutes is a socket held open for ten minutes.
  //    **A stale cursor costs a dot, never a message**, so nothing renders on
  //    failure.
  // -------------------------------------------------------------------------
  const markRead = useCallback(async () => {
    const req = openRequest(READ_ABORT_MS);
    try {
      await fetch('/api/chat/read', {
        method: 'POST',
        headers: headers(true),
        signal: req.signal,
        body: JSON.stringify({}),
      });
    } catch {
      /* silence */
    } finally {
      req.done();
    }
  }, [headers, openRequest]);

  // -------------------------------------------------------------------------
  // Arriving bubbles, through the anchoring rule.
  // -------------------------------------------------------------------------
  const receive = useCallback((arriving: readonly ChatMessageDto[], force = false) => {
    if (arriving.length === 0) return;
    /*
     * **THE DECISION IS READ BEFORE THE DOM GROWS.** `useLayoutEffect` runs after
     * React has committed, by which time the list is already taller and
     * `distanceFromBottom` reports the new height — so the read happens here, in the
     * handler that sets `messages`, and the layout effect acts on what it stored.
     */
    const el = listRef.current;
    const distance = el ? el.scrollHeight - el.scrollTop - el.clientHeight : 0;
    const stick = force || !el || shouldStickToBottom(distance);
    stickRef.current = stick;
    if (!stick) setNewBelow(true);
    // Pure and IDEMPOTENT: `appendMessages` drops ids the list already holds, which
    // is what makes StrictMode's double invocation free — and is also `F4-12`'s
    // safety net, since a retried beat can deliver a row the timed-out attempt wrote.
    setMessages((prev) => appendMessages(prev, arriving));
  }, []);

  // -------------------------------------------------------------------------
  // 4. One beat. `POST /api/chat/advance`.
  // -------------------------------------------------------------------------
  const advance = useCallback(
    async (runId: string | null) => {
      const req = openRequest(ADVANCE_ABORT_MS);
      try {
        const res = await fetch('/api/chat/advance', {
          method: 'POST',
          headers: headers(true),
          signal: req.signal,
          // Advisory. The engine claims by `user_id` regardless, which is W3's
          // completion-route rule applied to a run.
          body: JSON.stringify({ runId }),
        });
        if (!res.ok) {
          dispatch({ type: 'advance_failed', reason: 'error' });
          return;
        }
        const reply = await readReply<AdvanceReply>(res);
        if (!reply) {
          dispatch({ type: 'advance_failed', reason: 'error' });
          return;
        }
        // One beat may write TWO bubbles (`[R19]`), in the order they were written.
        if (reply.state === 'spoke') receive(reply.messages);
        dispatch({ type: 'reply', reply, nowMs: Date.now() });
        if (reply.done) void markRead();
      } catch {
        if (!mountedRef.current) return;
        // **A TIMEOUT IS THE ONE OUTCOME THAT MEANS UNKNOWN**, so it is the only one
        // retried — once, with the run id kept. An unmount abort is not a timeout.
        dispatch({ type: 'advance_failed', reason: req.timedOut() ? 'timeout' : 'error' });
      } finally {
        req.done();
      }
    },
    [dispatch, headers, markRead, openRequest, receive],
  );

  // -------------------------------------------------------------------------
  // 5. The querent speaks. `POST /api/chat/message`.
  // -------------------------------------------------------------------------
  const post = useCallback(
    async (outgoing: Outgoing) => {
      setSending(true);
      setSendFailure(null);
      setRefusal(null);
      setUnsent(null);
      dispatch({ type: 'send' });

      /*
       * **THE ONE PERMITTED RETRY, AND IT IS WHY `client_key` EXISTS** (`F4-12`,
       * `[R10]`, F4's D1). A slow-but-successful write retried without a key puts the
       * querent's sentence in the room twice — and **both copies become context for
       * every future turn** (`C-R5`), so one dropped packet is quoted back at them
       * forever. The route answers the second attempt with the first attempt's row.
       */
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const req = openRequest(SEND_ABORT_MS);
        try {
          const res = await fetch('/api/chat/message', {
            method: 'POST',
            headers: headers(true),
            signal: req.signal,
            body: JSON.stringify({
              body: outgoing.body,
              reply_to_message_id: outgoing.replyToMessageId,
              attached_reading_id: outgoing.attachedReadingId,
              attached_from: outgoing.attachFrom,
              client_key: outgoing.clientKey,
            }),
          });

          if (res.status === 403) {
            /*
             * **A REFUSAL RENDERS `RefusalNotice`, NEVER A BUBBLE** (`C-D13`,
             * `F4-14`): it is the app speaking, never Thessaly — *a reader who
             * refuses you is a friend who refuses you.* The optimistic bubble is
             * WITHDRAWN and the draft comes back, so the querent can see what was
             * refused. No row was stored.
             */
            const payload = await readReply<RefusalPayload>(res);
            setMessages((prev) => settleOptimistic(prev, outgoing.clientKey, null));
            setDraft(outgoing.body);
            if (payload) setRefusal(payload);
            dispatch({ type: 'send_failed' });
            return;
          }

          if (res.status === 429) {
            setMessages((prev) => settleOptimistic(prev, outgoing.clientKey, null));
            setDraft(outgoing.body);
            setSendFailure('rateLimit');
            dispatch({ type: 'send_failed' });
            return;
          }

          if (!res.ok) {
            // An answer, not an unknown: keep the bubble, offer `Kirim ulang`.
            setSendFailure('send');
            setUnsent(outgoing);
            dispatch({ type: 'send_failed' });
            return;
          }

          const stored = await readReply<{ message: ChatMessageDto; runId: string | null }>(res);
          if (!stored) {
            setSendFailure('send');
            setUnsent(outgoing);
            dispatch({ type: 'send_failed' });
            return;
          }

          setMessages((prev) => settleOptimistic(prev, outgoing.clientKey, stored.message));
          setPendingKeys((prev) => prev.filter((k) => k !== outgoing.clientKey));
          dispatch({ type: 'sent', runId: stored.runId });
          return;
        } catch {
          if (!mountedRef.current) return;
          if (req.timedOut() && attempt === 1) continue; // the one retry
          if (!navigator.onLine) {
            setSendFailure('offline');
            dispatch({ type: 'offline' });
          } else {
            setSendFailure('send');
            setUnsent(outgoing);
            dispatch({ type: 'send_failed' });
          }
          return;
        } finally {
          req.done();
          if (mountedRef.current) setSending(false);
        }
      }
    },
    [dispatch, headers, openRequest],
  );

  const submit = useCallback(() => {
    const body = draft.trim();
    /*
     * **AN ATTACHMENT WITH NO TEXT IS A MESSAGE** (§3.3, and the brief: *"user may /
     * may not add a text"*). Empty AND unattached is the only nothing; the route
     * agrees, 400s that case, and skips the classifier on an empty body rather than
     * spending a model call that can only return `allow`.
     */
    if ((body.length === 0 && !staged) || !chatOpen) return;

    const outgoing: Outgoing = {
      clientKey: crypto.randomUUID(),
      body,
      replyToMessageId: replyTo?.id ?? null,
      attachedReadingId: staged?.preview.readingId ?? null,
      attachFrom: staged?.from ?? null,
    };

    /*
     * **THE QUERENT'S OWN BUBBLE APPEARS INSTANTLY** (`C-R1`), before the POST
     * resolves, and it ALWAYS scrolls — they just pressed Kirim, and not showing them
     * the result of their own press is the one case where *do not interrupt* is
     * wrong.
     */
    receive(
      [
        optimisticMessage({
          clientKey: outgoing.clientKey,
          body,
          locale,
          replyTo,
          attachedReadingId: outgoing.attachedReadingId,
          createdAt: new Date().toISOString(),
        }),
      ],
      true,
    );
    setPendingKeys((prev) => [...prev, outgoing.clientKey]);
    setDraft('');
    setReplyTo(null);
    setSelectedId(null);
    /*
     * **THE STAGING IS CLEARED AND THE MAP KEEPS THE PREVIEW.** The card has to keep
     * drawing under the bubble that was just sent — it is already in `attachments`,
     * seeded at mount — while the composer goes back to empty, because the next
     * message is a different message. This is also why a re-send after a failure
     * carries `outgoing` rather than re-reading `staged`.
     */
    setStaged(null);
    void post(outgoing);
  }, [chatOpen, draft, locale, post, receive, replyTo, staged]);

  // -------------------------------------------------------------------------
  // Mount: the two fetches, in parallel, and the querent's calendar day.
  // -------------------------------------------------------------------------
  useEffect(() => {
    mountedRef.current = true;
    // `F4-15`. Never during render, and never in a `useState` initialiser.
    setToday(todayKey());

    void (async () => {
      const [page, state] = await Promise.all([loadMessages(null), loadState()]);
      if (!mountedRef.current) return;

      if (page === null && state === null) {
        setLoadFailed(true);
        return;
      }
      if (page) {
        setMessages(page);
        stickRef.current = true;
      }
      setReady(true);

      if (state) {
        setChatOpen(state.chatEnabled);
        dispatch({
          type: 'loaded',
          pendingRun: state.pendingRun !== null,
          runId: state.pendingRun?.id ?? null,
        });
      }

      /*
       * **ONE FIRE SITE FOR `chat.opened`** (`F4-16`: in the handler body, never
       * inside a `setState` updater). The entry point is set by whoever navigated
       * here — `ChatButton` sends `?from=button`, F6's controls send `?attach=<id>`,
       * a bare `/chat` is `direct`. A click event on the button PLUS a mount event
       * here would count the same open twice, which is why F1 folded
       * `chat.button_clicked` away.
       *
       * **DECIDED ON THE SERVER AND READ FROM A REF, WHERE IT USED TO BE PARSED OUT
       * OF `window.location` HERE.** Two things forced the move: the `from` key now
       * carries F6's `history|draw` (which is also `attached_from`), so a literal
       * match on `'attach'` would never fire; and the effect that tidies the URL runs
       * while these two fetches are still in flight, so by this line the parameter
       * may already be gone. `entryOf` in `page.tsx` is the one place that decides.
       */
      if (!openedRef.current) {
        openedRef.current = true;
        track('chat.opened', {
          unread: state?.unread ?? 0,
          from: entryRef.current,
          had_pending_run: state?.pendingRun != null,
        });
      }

      // The cursor moves once the list has painted, and again when a run finishes.
      if (state && state.unread > 0) void markRead();
    })();

    return () => {
      mountedRef.current = false;
      for (const controller of controllersRef.current) controller.abort();
      controllersRef.current.clear();
    };
  }, [dispatch, loadMessages, loadState, markRead]);

  // -------------------------------------------------------------------------
  // F6: the staged attachment is consumed out of the URL, ONCE.
  // -------------------------------------------------------------------------
  useEffect(() => {
    /*
     * **THE PARAMETER IS CONSUMED AND THE STAGING SURVIVES IT.** `[F6-5]` stages in
     * the URL because a query param survives a reload and a back button where
     * `sessionStorage` does not do so predictably on iOS — but it must not survive the
     * SEND: a reload afterwards would re-stage a reading the querent already sent, and
     * they would send it twice believing the first had failed.
     *
     * `useRef` and an empty dependency list, both load-bearing. StrictMode mounts,
     * unmounts and remounts every effect in development, and `router.replace` is a
     * navigation — a second one would be a second entry in the history stack, so the
     * back button would land the querent on `/chat` instead of the reading they came
     * from.
     *
     * `{ scroll: false }` because this room manages its own scroll position and a
     * navigation that jumped to the top would fight the anchoring rule the moment the
     * first bubbles land.
     */
    if (entryRef.current !== 'attach' || attachConsumedRef.current) return;
    attachConsumedRef.current = true;
    router.replace('/chat', { scroll: false });
  }, [router]);

  // -------------------------------------------------------------------------
  // The loop. **`loop` AND NOTHING ELSE** (`F4-8`).
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (loop.kind === 'advancing') {
      void advance(loop.runId);
      return;
    }
    if (loop.kind === 'waiting') {
      /*
       * The server said `delayMs` and the client waits it out; **the server never
       * sleeps** (`C-R4`) — a `setTimeout` inside a lambda is paid function time and,
       * on `after()`, is not reliably reached. Under `prefers-reduced-motion` the
       * indicator does not animate **and this delay still applies**: it is
       * conversational pacing, not decoration.
       */
      const wait = Math.max(0, loop.untilMs - Date.now());
      const timer = setTimeout(() => dispatch({ type: 'delay_elapsed' }), wait);
      return () => clearTimeout(timer);
    }
    return;
  }, [loop, advance, dispatch]);

  // -------------------------------------------------------------------------
  // Connectivity and visibility.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const onOffline = () => dispatch({ type: 'offline' });
    const onOnline = () => dispatch({ type: 'online' });
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        /*
         * `setTimeout` is throttled to >=1s in a background tab and pauses entirely
         * in a backgrounded iOS tab, so a held delay would resume at an arbitrary
         * later moment and drop three bubbles at once. Nothing is lost: the run is
         * server-side.
         */
        dispatch({ type: 'hidden' });
        return;
      }
      void (async () => {
        const state = await loadState();
        if (!state || !mountedRef.current) return;
        setChatOpen(state.chatEnabled);
        dispatch({
          type: 'loaded',
          pendingRun: state.pendingRun !== null,
          runId: state.pendingRun?.id ?? null,
        });
      })();
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [dispatch, loadState]);

  // -------------------------------------------------------------------------
  // Scroll anchoring (§4). THREE PIECES, AND THE ORDER MATTERS.
  // -------------------------------------------------------------------------
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior) => {
      const el = listRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior });
      setNewBelow(false);
    },
    [],
  );

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;

    /*
     * **PREPENDING MOVES EVERYTHING THE QUERENT IS READING DOWN**, so the
     * compensation is manual and engine-independent. Deliberately NOT
     * `overflow-anchor`: CSS scroll anchoring would do this for free in Chrome and
     * Firefox, and this repo cannot check what Safari does with it — which is the
     * platform the app is built for and the one loop 5 cannot answer. `.list` sets
     * `overflow-anchor: none` so a browser that DOES implement it cannot also
     * compensate and double-count.
     */
    if (prependedFromRef.current !== null) {
      el.scrollTop += el.scrollHeight - prependedFromRef.current;
      prependedFromRef.current = null;
      return;
    }

    if (firstPaintRef.current && messages.length > 0) {
      firstPaintRef.current = false;
      /*
       * The FIRST paint needs a frame — the list has no height until the messages
       * have laid out. **And no `cancelAnimationFrame` in a cleanup, even though
       * every lint instinct says to add one** (`SwipeDeck`'s note, verbatim): a stray
       * frame after unmount is harmless because the helper returns early on a null
       * ref, and a cleanup is actively dangerous the moment this effect re-runs,
       * because it cancels the pending frame, the effect re-enters, finds the guard
       * already set, and the list NEVER SCROLLS AT ALL, silently.
       */
      requestAnimationFrame(() => scrollToBottom('auto'));
      return;
    }

    if (!stickRef.current) return;
    // `F4-10`: the behaviour is passed explicitly, because a JS `scrollTo` overrides
    // the stylesheet rather than defaulting from it.
    scrollToBottom(reduce || isStill() ? 'auto' : 'smooth');
  }, [messages.length, reduce, scrollToBottom]);

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (shouldStickToBottom(distance)) setNewBelow(false);
  }, []);

  const loadOlder = useCallback(() => {
    if (loadingOlder || !hasMore) return;
    const oldest = messagesRef.current[0];
    if (!oldest) return;
    setLoadingOlder(true);
    void (async () => {
      const page = await loadMessages(oldest);
      if (!mountedRef.current) {
        return;
      }
      if (page && page.length > 0) {
        const el = listRef.current;
        prependedFromRef.current = el ? el.scrollHeight : null;
        setMessages((prev) => prependMessages(prev, page));
      }
      setLoadingOlder(false);
    })();
  }, [hasMore, loadMessages, loadingOlder]);

  const onQuoteTap = useCallback(
    (id: string) => {
      const el = listRef.current?.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
      if (!el) return;
      el.scrollIntoView({
        block: 'center',
        behavior: reduce || isStill() ? 'auto' : 'smooth',
      });
      setFlashId(id);
      window.setTimeout(() => {
        if (mountedRef.current) setFlashId(null);
      }, FLASH_MS);
    },
    [reduce],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const byId = new Map(messages.map((m) => [m.id, m]));
  const rows = groupByDay(messages, today);
  const typing = typingReader(loop);
  const empty = ready && messages.length === 0;

  /*
   * F6's §8 TABLE, AND IT IS A TABLE BECAUSE THE THREE CASES ARE NOT INTUITIVE.
   *
   *   preview resolved                   -> the card, linked to /history/[id]
   *   no preview, the bubble has text    -> NOTHING. An ordinary text bubble, no slot,
   *                                         no placeholder, no chrome.
   *   no preview, the bubble is empty    -> one muted line, `chat.attachment.gone`
   *
   * **A MISSING ATTACHMENT IS A RENDERING STATE, NOT AN ERROR** (`[F6-7]`).
   * `on delete set null` means the column may empty under a row that already
   * rendered — today only via the hard delete thirty days after an account deletion,
   * which cascades `chat_messages` first, so this is insurance in the schema rather
   * than a state the product produces. `C-R7` forbids an error bubble, and the same
   * argument forbids a placeholder saying a thing used to be here: **the room's
   * version of a missing attachment is that there was never an attachment.**
   *
   * The gone line is authored by the app inside the QUERENT's own bubble. It is never
   * a `chat_messages` row, so no director can point a beat at it and no reader can
   * quote it.
   */
  const attachmentSlot = (message: ChatMessageDto) => {
    if (!message.attachedReadingId) return undefined;
    const preview = attachments[message.attachedReadingId];
    if (preview) {
      return (
        <ReadingAttachment preview={preview} href={`/history/${preview.readingId}`} />
      );
    }
    return message.body ? undefined : (
      <span className={styles.gone}>{t('chat.attachment.gone')}</span>
    );
  };

  return (
    <div className={styles.room} ref={roomRef}>
      {loadFailed ? (
        <p className={styles.loadError} role="status">
          {t('chat.error.load')}
        </p>
      ) : null}

      <div className={styles.listWrap}>
      <ul className={styles.list} ref={listRef} onScroll={onScroll} aria-label={t('chat.list.aria')}>
        {/*
          THE EXISTING DISCLAIMER, NOT A SECOND ONE, AND IT MOVED HERE FROM THE HEADER
          (2026-08-09). `SignInForm`'s consent-line rule still holds — one owner,
          because a second copy of a sentence is how two surfaces end up making
          slightly different promises — and the room is still where a person is most
          likely to forget this is entertainment. `chatSurface.test.ts` accepts it in
          either this file or `page.tsx`, so the move is green either way.

          **WHY IN THE SCROLLING LOG RATHER THAN IN THE STICKY HEADER.** At
          `--fs-hint: 17px` it cost a permanent line of a header that measured 176px at
          320 — 38% of an iPhone SE's room before a single bubble. In flow it costs
          nothing permanent, and it is read by the person who needs it: an empty room
          does not scroll, so a first-timer meets this line and the empty state
          together. A returning querent's list opens scrolled to the bottom and this
          sits above the fold — which is the right economics rather than a regression,
          the reminder being for the newcomer.

          FIRST, ABOVE `chat.older`, because it is a statement about the room and not a
          message in it. It is a `<li>` for the same reason the day separators and the
          empty state are: it lives inside the one scroll container.
        */}
        <li className={styles.disclaimer}>{t('common.disclaimer.short')}</li>

        {hasMore ? (
          <li className={styles.older}>
            <button type="button" className={styles.olderButton} onClick={loadOlder} disabled={loadingOlder}>
              {loadingOlder ? t('chat.older.loading') : t('chat.older')}
            </button>
          </li>
        ) : null}

        {/*
          **`M14` DOES NOT APPLY TO AN EMPTY ROOM** and that is the difference between
          a room and a decoration: `FrequencyLine` renders nothing because it is
          ambient, and an empty room is the whole screen. A blank one reads as broken.
        */}
        {empty ? (
          <li className={styles.empty}>
            <p className={styles.emptyTitle}>{t('chat.empty.title')}</p>
            <p className={styles.emptyBody}>{t('chat.empty.body')}</p>
          </li>
        ) : null}

        {rows.map((row) =>
          row.kind === 'day' ? (
            <li key={`day-${row.key}`} className={styles.day}>
              <span className={styles.dayLabel}>
                {row.relative === 'today'
                  ? t('chat.day.today')
                  : row.relative === 'yesterday'
                    ? t('chat.day.yesterday')
                    : formatDate(new Date(`${row.key}T12:00:00`), locale)}
              </span>
            </li>
          ) : (
            <ChatBubble
              key={row.message.id}
              message={row.message}
              quote={quoteFor(row.message, byId)}
              authorName={nameOf(row.message.author)}
              youName={t('chat.reply.you')}
              selected={selectedId === row.message.id}
              onSelect={() =>
                setSelectedId((current) => (current === row.message.id ? null : row.message.id))
              }
              onReply={() => {
                setReplyTo(row.message);
                setSelectedId(null);
              }}
              onQuoteTap={onQuoteTap}
              flashing={flashId === row.message.id}
              pending={pendingKeys.includes(row.message.id)}
              attachment={attachmentSlot(row.message)}
            />
          ),
        )}

        {/* A ROW IN THE LIST, NOT AN OVERLAY: if it floated, the anchoring rule
            would not see the list grow when it appears. */}
        {typing ? <ChatTyping reader={typing} /> : null}
      </ul>

      {newBelow ? (
        <button
          type="button"
          className={styles.pill}
          onClick={() => scrollToBottom(reduce || isStill() ? 'auto' : 'smooth')}
        >
          {t('chat.newMessages')}
        </button>
      ) : null}
      </div>

      <ChatComposer
        draft={draft}
        onDraft={setDraft}
        onSubmit={submit}
        closed={!chatOpen}
        sending={sending}
        replyTo={
          replyTo
            ? {
                author: replyTo.author === 'user' ? t('chat.reply.you') : nameOf(replyTo.author),
                text: replyTo.body,
              }
            : null
        }
        onCancelReply={() => setReplyTo(null)}
        failure={sendFailure}
        onRetry={unsent ? () => void post(unsent) : undefined}
        /*
         * **THE REFUSAL IS DISMISSIBLE HERE AND NOWHERE ELSE** (2026-08-09, the
         * querent's report: *"it just wont disappear"*). On the draw screen it
         * REPLACES the reading panel; here it sits over a room still in use, so it
         * outlived the message that caused it. Closing it writes the same state
         * `post()` already clears before every send and sets on a 403 — nothing is
         * remembered, so the next refused message pops it straight back up, which is
         * both what was asked for and the only safe answer: a message that vanishes
         * from the room unexplained is the worse bug.
         */
        notice={
          refusal ? <RefusalNotice payload={refusal} onDismiss={() => setRefusal(null)} /> : null
        }
        /* F6. The card the querent is about to send, with a way back out of it. */
        staged={
          staged ? (
            <StagedAttachment preview={staged.preview} onRemove={() => setStaged(null)} />
          ) : null
        }
      />
    </div>
  );
}
