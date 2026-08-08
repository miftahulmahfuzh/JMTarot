import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import id from '@/lib/i18n/locales/id';
import { corner } from '@/theme/tokens';

/**
 * The chat surface's source-level contracts (v0.7.0 / F4).
 *
 * `accountSurface.test.ts` is the model and this is its sibling, including the
 * shape: **BOTH MOUNT ASSERTIONS ARE DENY-SHAPED.** An allowlist would have to be
 * edited by F5, F6 and F7 as they land, and *an allowlist somebody has to edit to
 * make their branch green is an allowlist somebody widens without reading it.* A
 * denylist names the pages where the answer is NO and stays out of everybody's way.
 *
 * Everything here is source-level for one reason: **the behaviour needs a real
 * browser and this repo does not have one.** A fetch count is a thing a regex can
 * hold; whether the room scrolls correctly is loop 4, loop 5 and a phone.
 * `admin.blog.contract.test.ts` is the precedent for every counted assertion below.
 */

const ROOT = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = walk(ROOT).map((path) => ({
  path: path.slice(ROOT.length + 1).replaceAll('\\', '/'),
  source: readFileSync(path, 'utf8'),
}));

/** A TypeScript source, from the walk. */
const file = (path: string) => {
  const found = FILES.find((f) => f.path === path);
  expect(found, path).toBeDefined();
  return found!.source;
};

/** A stylesheet. The walk collects `.ts`/`.tsx` only, and these are read by name. */
const css = (path: string) => readFileSync(join(ROOT, path), 'utf8');

/** Comments carry the rules and name the things the rules forbid, so an assertion
 *  about what the CODE does has to read the code. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const importers = (re: RegExp) => FILES.filter((f) => re.test(f.source)).map((f) => f.path).sort();

const count = (source: string, re: RegExp) => (source.match(re) ?? []).length;

describe('the chat button', () => {
  const MOUNTS = importers(/from '@\/components\/ChatButton'/);

  it('is mounted on the four pages C-D17 names, so the denylist is not vacuous', () => {
    expect(MOUNTS).toEqual([
      'app/[reader]/page.tsx',
      'app/account/page.tsx',
      'app/history/page.tsx',
      'app/page.tsx',
    ]);
  });

  /**
   * **THE DRAW SCREEN AND `/chat` ITSELF ARE THE TWO IMPORTANT ENTRIES.**
   *
   * The draw screen is `AccountButton`'s reason 2 verbatim: `Draw.tsx` aborts its
   * reading on unmount, so a one-tap exit in the corner of a streaming page kills
   * the reading and records `reading.aborted`. F6's attachment control is the route
   * into the room from there, and it appears only once the reading has finished.
   *
   * `/chat` itself is `PublicShell`'s deleted `LINKS` table: a control that points
   * at the page it is on. Deleting that filter is what let the landing page's footer
   * grow a link to itself.
   *
   * The rest have no session by design (`isPublic()`), except `/s/`, which has no
   * session BECAUSE IT IS A STRANGER'S PAGE — and this room is the last thing in the
   * app a stranger may reach (`C-D12`).
   */
  it('is not mounted on the draw screen, on /chat, or on any page without a session', () => {
    const FORBIDDEN = [
      'app/[reader]/[service]/', // THE DRAW SCREEN. See above.
      'app/chat/', // the page it points at
      'app/login/',
      'app/terms/',
      'app/privacy/',
      'app/onboarding/',
      'app/s/', // V7's public share page
      'app/gallery/',
      'app/arcana/',
      'app/blog/',
      'app/Landing.tsx', // S1's signed-out homepage: no session BY CONSTRUCTION
      'app/layout.tsx', // the mount seam is the owning page, never the root layout
    ];
    for (const prefix of FORBIDDEN) {
      expect({ [prefix]: MOUNTS.filter((p) => p.startsWith(prefix)) }).toEqual({ [prefix]: [] });
    }
  });

  it('reads no session and takes no viewer, because mounting it IS the session check', () => {
    // The comments NAME `ViewerProvider` and `auth()` to say it does not use them,
    // so the assertion is about the code.
    const src = stripComments(file('components/ChatButton.tsx'));
    expect(src).not.toMatch(/useViewer|ViewerProvider|currentUser|requireUser/);
  });
});

describe('the corner rail (seam S9)', () => {
  /**
   * **A ONE-WAY COUPLING, ASSERTED RATHER THAN SHARED.** F4 may not edit
   * `AccountButton.module.css` (S9), so it still carries `10px` and `44px` as
   * literals while `ChatButton` computes its slot from `--corner-*`. If the account
   * circle ever moves, this goes red and names the rail in `tokens.ts` — which is
   * the only warning available, because two circles overlapping in one corner is
   * invisible to every loop in this repo except a screenshot.
   */
  it('keeps AccountButton’s literals equal to the rail in tokens.ts', () => {
    const sheet = css('components/AccountButton.module.css');
    expect(sheet).toContain(`width: ${corner.size}px`);
    expect(sheet).toContain(`height: ${corner.size}px`);
    expect(sheet).toContain(`top: calc(${corner.inset}px +`);
    expect(sheet).toContain(`right: calc(${corner.inset}px +`);
  });

  it('mirrors the rail into tokens.css, slot 1 included', () => {
    const sheet = css('theme/tokens.css');
    expect(sheet).toContain(`--corner-inset: ${corner.inset}px`);
    expect(sheet).toContain(`--corner-size: ${corner.size}px`);
    expect(sheet).toContain(`--corner-gap: ${corner.gap}px`);
    // 10 + 44 + 8 = 62. Derived in CSS rather than hardcoded, so one edit moves both.
    expect(sheet).toContain(
      '--corner-slot-1: calc(var(--corner-inset) + var(--corner-size) + var(--corner-gap))',
    );
  });

  it('positions the chat circle from the rail and adds the safe-area inset back', () => {
    /*
     * `globals.css` pads <body> with `env(safe-area-inset-*)` and that padding does
     * NOTHING for a fixed element. Without adding it back the circle sits under the
     * clock and the notch in standalone mode — which is the one place WSL cannot
     * check and a real iPhone can.
     */
    const sheet = css('components/ChatButton.module.css');
    expect(sheet).toContain('top: calc(var(--corner-inset) + env(safe-area-inset-top))');
    expect(sheet).toContain('right: calc(var(--corner-slot-1) + env(safe-area-inset-right))');
    expect(sheet).toContain('position: fixed');
  });

  it('spends no new hex on the badge, and does NOT spend --danger on it', () => {
    /*
     * `tokens.ts` says `--danger` is the ONE destructive colour in the app, that
     * /account's deletion sheet is its only consumer, and that it is a border and a
     * label and NEVER a fill — *a filled red button is the one a thumb goes to.* A
     * red dot meaning "Margaret said something" spends the app's only stop signal on
     * a friendly notification.
     */
    // The comment ARGUES about `--danger`, so the assertion reads the declarations.
    const sheet = stripComments(css('components/ChatButton.module.css'));
    expect(sheet).not.toContain('--danger');
    expect(sheet).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe('the lotus, extracted (F4’s D8)', () => {
  it('lives in exactly one file and is drawn from it in both places', () => {
    /*
     * `C-D16` makes the querent's chat avatar *"the same glyph AccountButton
     * draws"*. The refused alternative was a second copy of four `d` strings held in
     * step by a byte-identity test; the ruling was a pure extraction, which is why
     * this asserts the ABSENCE of a second `<path d=` in the two consumers.
     */
    expect(importers(/from '\.\/LotusMark'/)).toEqual([
      'components/AccountButton.tsx',
      'components/ChatAvatar.tsx',
    ]);
    for (const consumer of ['components/AccountButton.tsx', 'components/ChatAvatar.tsx']) {
      expect({ [consumer]: count(file(consumer), /<path\s/g) }).toEqual({ [consumer]: 0 });
    }
    expect(count(file('components/LotusMark.tsx'), /<path\s/g)).toBe(4);
  });
});

describe('every fetch is bounded, and the COUNT is asserted (F4-11)', () => {
  /**
   * `MarkdownEditor`'s convention, and its reason: **the behaviour needs a real
   * browser, and a count is a thing a regex can hold.** Every `fetch(` has its own
   * `AbortController` and its own `setTimeout`, each bound sits UNDER its route's
   * `maxDuration` so the client's copy wins over a platform 504, and a fifth
   * unbounded one is red.
   *
   * If `/api/chat/read` is ever folded into `state` the number becomes four and this
   * changes IN THE SAME COMMIT — written down so that is a decision rather than a
   * green test somebody edited to make it pass.
   */
  const ROOM = 'app/chat/ChatRoom.tsx';

  it('the room has exactly five, and every one of them is bounded', () => {
    /*
     * **THE CONTROLLER IS CENTRALISED IN `openRequest` AND THE COUNT IS ASSERTED ON
     * ITS CALLS.** `MarkdownEditor` uses `AbortSignal.timeout()` inline; that is not
     * available here, because these five must ALSO abort on unmount — StrictMode
     * mounts, unmounts and remounts every effect, and a room left open for ten
     * minutes with a live socket is the other half of the same rule. One helper that
     * bounds, registers and cleans up is what makes "every fetch" mechanical rather
     * than five copies of four lines with one of them wrong.
     */
    const src = stripComments(file(ROOM));
    expect(count(src, /await fetch\(/g)).toBe(5);
    expect(count(src, /openRequest\(/g)).toBe(5);
    expect(count(src, /signal: req\.signal/g)).toBe(5);
    // One place a controller is made, and it is the same place the timer is set.
    expect(count(src, /new AbortController\(\)/g)).toBe(1);
    expect(src).toMatch(/setTimeout\(\(\) => \{\s*timedOut = true;\s*controller\.abort\(\);/);
  });

  it('bounds each one UNDER its route’s maxDuration', () => {
    /*
     * *"A bigger `maxDuration` is not a latency regression, but it must be paired
     * with a bound on the client, or you have only made the hang longer."* The
     * SERVER must lose the race last, so what the querent gets is the sentence that
     * says what happened rather than a platform 504 with no diagnosis.
     *
     *   messages  route 15s, client 10s
     *   state     route 30s, client 10s
     *   message   route 20s, client 18s
     *   advance   route 60s, client 55s   <- the blog editor's translate bound
     *   read      route 15s, client 10s
     */
    const src = file(ROOM);
    expect(src).toMatch(/MESSAGES_ABORT_MS = 10_000/);
    expect(src).toMatch(/STATE_ABORT_MS = 10_000/);
    expect(src).toMatch(/SEND_ABORT_MS = 18_000/);
    expect(src).toMatch(/ADVANCE_ABORT_MS = 55_000/);
    expect(src).toMatch(/READ_ABORT_MS = 10_000/);
  });

  it('reads every body through the one helper (savePublish’s bug)', () => {
    /*
     * `savePublish` was written with `.catch(() => ({}))` and the fence added hours
     * earlier caught it. `POST /api/chat/read` is fire-and-forget and reads nothing;
     * the other four do, and `message` reads two shapes — the refusal payload and
     * the stored row — so the declaration plus five call sites is six.
     */
    const src = stripComments(file(ROOM));
    expect(count(src, /readReply</g)).toBe(6);
    expect(src).not.toMatch(/\.catch\(\(\) => \(\{\}\)\)/);
  });

  it('the button has exactly one, bounded the same way', () => {
    const src = file('components/ChatButton.tsx');
    expect(count(src, /\bfetch\(/g)).toBe(1);
    expect(count(src, /new AbortController\(\)/g)).toBe(1);
    expect(count(src, /signal:/g)).toBe(1);
  });
});

describe('the room’s React traps, asserted at source level', () => {
  const ROOM = 'app/chat/ChatRoom.tsx';

  it('never calls todayKey() during render (F4-15)', () => {
    /*
     * `todayKey()` reads `new Date()`, which is a different value on the server and
     * on the client, and **React cannot patch attribute mismatches during
     * hydration** — the `shuffleDeck()` case is the canonical one. `today` starts
     * null and an effect sets it; `groupByDay` returns the messages ungrouped until
     * then. The forbidden shape is the "simplification" `HistoryBrowser` carries the
     * same sentence against.
     */
    const src = stripComments(file(ROOM));
    expect(src).not.toMatch(/useState\(\s*\(\)\s*=>\s*todayKey/);
    expect(src).toMatch(/useState<DayKey \| null>\(null\)/);
    // It is set in an effect, and the effect is the mount one.
    expect(src).toContain('setToday(todayKey())');
  });

  it('drives the loop from a ref, and never lists `messages` as a dependency (F4-8)', () => {
    /*
     * V5's MEASURED finding, not a style preference: `SwipeDeck`'s five-row table
     * says *the dependency list is the primary mechanism*, and
     * `react-hooks/exhaustive-deps` will never argue either way because the body
     * reads `…Ref.current`. `messages` is a fresh array on every render and every
     * arriving bubble re-renders the room, so listing it re-enters the loop per
     * bubble: N concurrent `advance` calls for one run.
     */
    const src = stripComments(file(ROOM));
    expect(src).toContain('messagesRef.current = messages');
    // THE LOOP'S OWN DEPENDENCY LIST, asserted exactly. `advance` and `dispatch` are
    // stable `useCallback`s; `loop` is the only thing that may re-enter this effect.
    expect(src).toContain('}, [loop, advance, dispatch]);');
    /*
     * And no effect anywhere lists the ARRAY itself. `messages.length` is legal and
     * is what the anchoring layout effect depends on — a number, which changes once
     * per arrival rather than once per render.
     */
    expect(src).not.toMatch(/\}, \[[^\]]*\bmessages(?!\.)\b[^\]]*\]\)/);
  });

  it('does not acquire `locale` as a loop dependency (F4-5)', () => {
    /*
     * `FrequencyLine` and `DaySummary` both had to ACQUIRE it, because their rows are
     * keyed on locale and `router.refresh()` keeps client state. **`ChatRoom` is the
     * opposite case and a future session will "fix" it to match:** `C-D9` says a chat
     * message is written once, in the language it was written in, so a re-fetch
     * returns byte-identical rows — and mid-run it races the advance loop against a
     * held lease, where a bubble either doubles or vanishes with nothing logged.
     *
     * Asserted over `useEffect` blocks only: `locale` is a legitimate dependency of
     * the `useCallback` that BUILDS an outgoing message, because a message records
     * the language it was written in (`chat_messages.locale`). What must never
     * acquire it is a FETCHING effect.
     */
    const src = stripComments(file(ROOM));
    const effects = [...src.matchAll(/use(?:Layout)?Effect\(([\s\S]*?)\n  \}, (\[[^\]]*\])\);/g)];
    expect(effects.length).toBeGreaterThanOrEqual(4);
    for (const [, , deps] of effects) {
      expect({ deps, hasLocale: /\blocale\b/.test(deps) }).toEqual({ deps, hasLocale: false });
    }
  });

  it('reads data-still itself before every programmatic scroll (F4-10)', () => {
    /*
     * A JS `scrollTo({ behavior })` OVERRIDES CSS `scroll-behavior` rather than
     * defaulting from it, so `html[data-still]` in a stylesheet has no say over these
     * calls. V5's `goTo` paid for this and `ScrollToHash` repeated it. Without it
     * every measurement `_chatfit.html` takes is at a scroll position that does not
     * exist, because a smooth scroll under `--virtual-time-budget` advances one frame
     * and stops.
     */
    expect(file(ROOM)).toContain("hasAttribute('data-still')");
  });

  it('has no error bubble anywhere in the tree (C-R7, F4-13)', () => {
    /*
     * A failure is silence. A notice inside a bubble would be stored as context for
     * every future turn and quoted back at the querent as if a reader had said it —
     * W4's `[Bacaan terputus…]` rule, which is automatic in a chat. The three
     * failure strings that DO exist all render outside the message list.
     */
    for (const path of ['app/chat/ChatRoom.tsx', 'components/ChatBubble.tsx']) {
      expect(file(path)).not.toMatch(/chat\.error\.\w+.*ChatBubble|<ChatBubble[^>]*error/);
    }
    expect(file('components/ChatBubble.tsx')).not.toContain("t('chat.error");
  });
});

describe('the software keyboard (reported from a phone, 2026-08-09)', () => {
  /*
   * `100dvh` tracks the browser's own UI and NOT the software keyboard, so with the
   * keyboard up the bottom of the shell — the composer, and therefore `Kirim` — is
   * underneath it. The room got away with that because Safari scrolls a focused field
   * into view by itself; tapping `Balas` grows the composer by ~60px WITHOUT moving
   * focus, so that reveal never re-runs and the send button goes under the glass.
   *
   * Source-level for the reason this whole file is: the behaviour is loop 6's. What a
   * regex can hold is that the mechanism is wired up and takes itself back down.
   */
  const HOOK = 'app/chat/keyboardInset.ts';

  it('shortens the ROOM with a margin, defaulting to the layout that shipped', () => {
    /*
     * A stretched grid item is sized to its area minus its margins, so this can only
     * ever make the room shorter — and `0px` is byte-identical to the pre-fix screen,
     * which is what the server renders and what every loop-5 browser gets. A computed
     * `height` would have to know the natural one to avoid growing the room past the
     * shell, where `overflow: hidden` would clip the composer it was trying to save.
     */
    expect(css('app/chat/ChatRoom.module.css')).toContain('margin-bottom: var(--kb-inset, 0px);');
    /* The shell keeps its own geometry: one owner, and the room is the element whose
       bottom edge IS the composer. */
    expect(css('app/chat/page.module.css')).toContain('100dvh');
    expect(css('app/chat/page.module.css')).not.toContain('--kb-inset');
  });

  it('measures a rect against the visual viewport and derives nothing', () => {
    /*
     * The obvious formula is `innerHeight - visualViewport.height - offsetTop`, and it
     * rests on a recalled claim about which viewport `innerHeight` reports on iOS with
     * a half-collapsed toolbar. Subtracting two edges in one coordinate system makes
     * the toolbar, the insets, the pan and `dvh` cancel. *Framework behaviour is
     * measured here, never recalled.*
     */
    const src = stripComments(file(HOOK));
    expect(src).toContain('getBoundingClientRect().bottom');
    expect(src).toContain('viewport.offsetTop + viewport.height');
    expect(src).not.toContain('window.innerHeight');
  });

  it('listens on both visual-viewport events and removes both', () => {
    /*
     * `scroll` as well as `resize`: iOS pans the visual viewport to reveal the caret
     * WITHOUT resizing it, so a resize-only listener misses half the states. And a
     * room that leaves its listeners behind leaves them on a page it no longer
     * renders — StrictMode mounts, unmounts and remounts every effect.
     */
    const src = stripComments(file(HOOK));
    expect(count(src, /viewport\.addEventListener\(/g)).toBe(2);
    expect(count(src, /viewport\.removeEventListener\(/g)).toBe(2);
    expect(src).toContain('cancelAnimationFrame(frame)');
    expect(src).toContain('removeProperty(KEYBOARD_INSET_VAR)');
  });

  it('is mounted by the room, on the element it measures', () => {
    const src = stripComments(file('app/chat/ChatRoom.tsx'));
    expect(src).toContain('useKeyboardInset(roomRef)');
    expect(src).toContain('<div className={styles.room} ref={roomRef}>');
  });

  it('re-reveals the SEND BUTTON when the composer grows under a focused box', () => {
    /*
     * The belt to the hook, and three things about it are load-bearing: it aims at the
     * button, which is the lowest thing in the row (`align-items: flex-end`) and the
     * first to go missing; it uses `nearest`, so a composer already in view is a no-op
     * rather than a jump; and it fires only while the box has focus, or a refusal
     * arriving while the querent reads three bubbles up would drag them back down.
     */
    const src = stripComments(file('components/ChatComposer.tsx'));
    expect(src).toContain('document.activeElement !== box.current');
    expect(src).toMatch(/send\.current\?\.scrollIntoView\(\{ block: 'nearest'/);
  });

  it('depends on booleans, never on the props themselves', () => {
    /*
     * `replyTo` is rebuilt by the room on every render (`replyTo ? { author, text } :
     * null`) and `staged`/`notice` are elements, so listing any of them would run this
     * effect on EVERY render — a `scrollIntoView` per keystroke, since typing
     * re-renders the room. The booleans change once per chrome change.
     */
    expect(stripComments(file('components/ChatComposer.tsx'))).toContain(
      '}, [hasReply, hasStaged, hasNotice, failure]);',
    );
  });
});

describe('the reply stub cannot widen the room (2026-08-09)', () => {
  /*
   * The reported bug, and the one the keyboard fix did not touch: reply to a bubble on
   * an iPhone and the field is cropped with `Kirim` gone. `white-space: nowrap` makes
   * an element's MIN-content width equal its max-content width — the whole message on
   * one unbreakable line — and nothing between it and `.shell`'s auto-sized grid track
   * scrolls horizontally, so that minimum propagates all the way up. Spec says the
   * `min-width: 0` on the text clamps it and Chrome agrees, which is why every loop
   * here measured it green; the report is from WebKit.
   */
  it('wraps and clamps by line, exactly as the in-bubble quote always has', () => {
    const composer = stripComments(css('components/ChatComposer.module.css'));
    expect(composer).not.toContain('white-space: nowrap');
    expect(composer).not.toContain('text-overflow: ellipsis');
    /* `anywhere` and not `break-word`: only `anywhere` changes the MIN-content size,
       which is the number this whole bug is about. */
    expect(composer).toContain('overflow-wrap: anywhere;');
    expect(composer).toContain('-webkit-line-clamp: 2;');

    /* The two stubs are one mechanic now, which the composer's comment claimed before
       it was true. The bubble's is one line because its name sits above it too. */
    expect(stripComments(css('components/ChatBubble.module.css'))).toContain(
      'overflow-wrap: anywhere;',
    );
  });

  it('carries a zero minimum at every box between the text and the shell', () => {
    /* One missing level is the whole chain: the list is safe from this by being a
       scroll container and the composer has no such protection. */
    const composer = stripComments(css('components/ChatComposer.module.css'));
    expect(count(composer, /min-width: 0;/g)).toBeGreaterThanOrEqual(5);
    expect(stripComments(css('app/chat/ChatRoom.module.css'))).toContain('min-width: 0;');
  });

  it('cuts the string as well, because the CSS is a spec argument and this is not', () => {
    expect(stripComments(file('components/ChatComposer.tsx'))).toContain(
      'replyPreview(replyTo.text)',
    );
  });
});

describe('the room survives a third child (2026-08-09)', () => {
  it('is a column, not a two-row grid, because the error line is a third child', () => {
    /*
     * `chat.error.load` renders ABOVE the list (`F4-13`), so on a failed load `.room`
     * has THREE children against a two-row template: the error took the `1fr` row, the
     * list took `auto` and grew to every bubble it had, the composer landed in an
     * implicit row, and the lot overflowed into `.shell`'s `overflow: hidden` — the
     * composer cropped, with no keyboard involved. A column has no fixed number of
     * rows to disagree with, which is the class rather than that one instance.
     */
    /* Comments only, stripped: the header on `.room` quotes the rule it replaced, and
       an assertion that cannot tell a declaration from a sentence about one is the
       assertion this file's `stripComments` exists for. */
    const sheet = stripComments(css('app/chat/ChatRoom.module.css'));
    expect(sheet).not.toContain('grid-template-rows: minmax(0, 1fr) auto');
    expect(sheet).toContain('flex-direction: column;');
    /* The `0` basis is the load-bearing part: with `auto` the list would contribute
       its whole content height and the composer would be squeezed to pay for it. */
    expect(sheet).toContain('flex: 1 1 0;');
    expect(sheet).toContain('flex: none;');

    /* And the third child is still where `F4-13` puts it: outside the list, above it. */
    const room = stripComments(file('app/chat/ChatRoom.tsx'));
    expect(room.indexOf('styles.loadError')).toBeGreaterThan(-1);
    expect(room.indexOf('styles.loadError')).toBeLessThan(room.indexOf('styles.listWrap'));
  });
});

describe('the copy', () => {
  it('asks the catalog for keys that exist (I3)', () => {
    /*
     * An unknown key renders THE KEY, on purpose — a good rule and a bad failure
     * mode for a typo, because `chat.error.send` on screen is a bug report. Template
     * literals are skipped; the type lock covers those.
     */
    const paths = FILES.filter(
      (f) => f.path.startsWith('app/chat/') || /^components\/Chat\w+\.tsx$/.test(f.path),
    );
    expect(paths.length).toBeGreaterThanOrEqual(4);
    for (const f of paths) {
      const keys = [...f.source.matchAll(/\bt(?:\.plural)?\('([a-z][\w.]*)'/g)].map((m) => m[1]);
      for (const key of keys) {
        const present = key in id || `${key}.other` in id;
        expect({ [f.path]: key, present }).toEqual({ [f.path]: key, present: true });
      }
    }
  });

  it('renders the existing disclaimer rather than minting a second one', () => {
    /*
     * `SignInForm`'s consent-line rule: one owner, because a second copy of a
     * sentence is how two surfaces end up making slightly different promises. The
     * room is where a person is most likely to forget this is entertainment.
     */
    expect(file('app/chat/page.tsx') + file('app/chat/ChatRoom.tsx')).toContain(
      "common.disclaimer.short",
    );
    expect(Object.keys(id)).not.toContain('chat.disclaimer');
  });
});

describe('the /readers/* plumbing (F4-18)', () => {
  it('excludes the avatars in the MATCHER, not in the gate', () => {
    /*
     * Two rules that look like one. `R7`: adding `/readers` to `isPublic()` also
     * returns 200 but leaves middleware RUNNING — so the locale-cookie write fires
     * and puts a `Set-Cookie` on a static image, which is edge-uncacheable and here
     * happens on every chat render. The header half is asserted in
     * `src/lib/headers.test.ts`.
     */
    expect(file('middleware.ts')).toContain('readers/');
    expect(file('lib/auth/gate.ts')).not.toContain('readers');
  });
});
