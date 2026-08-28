import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import id from '@/lib/i18n/locales/id';

/**
 * F6's UI half (tasks 6–8): the two controls, the staging, and the bubble.
 *
 * `chatSurface.test.ts` is the sibling and the model, including the reason everything
 * here is source-level: **the behaviour needs a real browser and this repo does not
 * have one.** What a regex CAN hold is which condition a control renders under, which
 * predicate gates it, and which fields cross the wire — and every one of those is a
 * decision F6's plan argues for pages and would otherwise live only in prose.
 *
 * The bug shape this file is aimed at is the one loop 5 exists for and the one this
 * repo has paid for twice: **the page looked correct and the outgoing request was
 * wrong.** An attachment is exactly that — an id the querent cannot see, carried
 * across a navigation.
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

const file = (path: string) => {
  const found = FILES.find((f) => f.path === path);
  expect(found, path).toBeDefined();
  return found!.source;
};

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const count = (source: string, re: RegExp) => (source.match(re) ?? []).length;

describe('the two controls (F6 tasks 6 and 7)', () => {
  it('is mounted on exactly the two surfaces the roadmap names', () => {
    /*
     * `/history/[id]` and the finished reading on the draw screen. **NOT `/history`'s
     * list** (O4: the list payload carries no body and no cards-with-meaning, so a row
     * cannot preview what it is about to send), **not `/s/[slug]`** (no session at
     * all), and **not `/account`.**
     */
    const mounts = FILES.filter((f) => /<AttachReadingLink/.test(f.source)).map((f) => f.path);
    expect(mounts.sort()).toEqual([
      'app/[reader]/[service]/Draw.tsx',
      'app/history/[id]/HistoryDetail.tsx',
    ]);
  });

  it('renders on the draw screen ONLY inside the completed-reading condition (F6-3)', () => {
    /*
     * **`AccountButton`'s reason 2, which `C-D17` restates: a one-tap exit in the
     * corner of a streaming page ABORTS THE READING.** `Draw.tsx` aborts on unmount and
     * records `reading.aborted { reason: 'user' }`, so a control offered mid-stream
     * would destroy the thing it was offering to talk about and book it as the
     * querent's choice — a spike in `reading.aborted` that reads as impatience and is
     * one button.
     *
     * Asserted as ORDER inside the source rather than as a parsed JSX tree: the
     * condition opens, then the control, then `ShareFooter`. If somebody lifts the
     * control out of the block, the guard string stops preceding it.
     */
    const src = stripComments(file('app/[reader]/[service]/Draw.tsx'));
    const guard = src.indexOf(
      "reading.status === 'done' && finished.current && finished.current.id !== 'unknown'",
    );
    const control = src.indexOf('<AttachReadingLink');
    const share = src.indexOf('<ShareFooter');

    expect(guard).toBeGreaterThan(-1);
    expect(control).toBeGreaterThan(guard);
    // ABOVE the share control: the private action above the public one.
    expect(control).toBeLessThan(share);
    // Exactly one of each, so a second copy outside the block is red.
    expect(count(src, /<AttachReadingLink/g)).toBe(1);
  });

  it('leaves the draw screen’s abort, reset and snapshot untouched', () => {
    /*
     * Task 6 says *"no other line of that file changes"*, and these three are why:
     * `finished.current` is the snapshot `reset()` clears, so a reshuffle takes the
     * control with it rather than offering the PREVIOUS reading, and the abort effect
     * is what makes `[F6-3]` a real risk rather than a theoretical one.
     */
    const src = file('app/[reader]/[service]/Draw.tsx');
    expect(src).toContain('abortRef.current?.abort()');
    expect(src).toContain('finished.current = null');
  });

  it('is gated by `attachable()` on /history/[id], and by nothing else', () => {
    /*
     * A pure predicate with a unit test rather than a condition inlined in a `.tsx`,
     * which is the whole reason `attachable` is exported. It is ONE `trim()` wider than
     * the share control's condition and refuses `partial`, which the route accepts —
     * *the UI is never wider than the server*, and here it is deliberately narrower.
     */
    const src = stripComments(file('app/history/[id]/HistoryDetail.tsx'));
    /*
     * **THE ARGUMENT IS `view` AND NOT `reading`, SINCE 2026-08-28, AND THE PIN IS
     * ON THE REFILLED ONE ON PURPOSE.** `/history/[id]` now offers `Coba ulang` on a
     * `body IS NULL` row and paints the result in place, so `reading` — the server
     * prop — still has no body afterwards while `view` is what is on screen.
     * Gating on `reading` would silently refuse to offer *Bahas di grup* on a
     * reading the querent just watched arrive, which is the failure this line is
     * here to catch.
     */
    expect(src).toMatch(/attachable\(view\)\s*\?/);
    expect(src.indexOf('<AttachReadingLink')).toBeLessThan(src.indexOf('<ShareFooter'));
  });

  it('navigates and never posts (F6-4)', () => {
    /*
     * Neither control fetches. Three rules land on the same answer: §0.3's no-write-on
     * the-waiting-path, `C-D13`'s moderation gate living on `POST /api/chat/message`
     * (a composer here would need `RefusalNotice` ON THE DRAW SCREEN, which already has
     * its own refusal state for its own question), and the blog editor's lesson that
     * every client fetch is a timeout somebody has to choose and assert.
     */
    const src = stripComments(file('components/AttachReadingLink.tsx'));
    expect(src).not.toMatch(/\bfetch\(/);
    expect(src).not.toMatch(/AbortController|AbortSignal/);
    expect(src).toContain('prefetch={false}');
  });

  it('spells `from` the way the route’s enum and the event’s union spell it', () => {
    /*
     * **F6's PLAN SAID `'reading'` AND EVERY OTHER FILE IN THE RELEASE SAYS `'draw'`.**
     * F1 owns `events.ts` and folded `chat.attachment_added` into
     * `chat.message_sent.attached_from`, whose union is `'history' | 'draw' | null`,
     * and the route's zod enum matches it. A plan-spelled value would have ridden the
     * URL, failed the parse and 400'd every draw-screen attach — wrong on exactly one
     * of the two surfaces, and the one a querent reaches most often.
     */
    expect(stripComments(file('components/AttachReadingLink.tsx'))).toContain(
      "from: 'history' | 'draw'",
    );
    expect(stripComments(file('app/api/chat/message/route.ts'))).toContain(
      "attached_from: z.enum(['history', 'draw'])",
    );
    expect(stripComments(file('app/[reader]/[service]/Draw.tsx'))).toContain('from="draw"');
    expect(stripComments(file('app/history/[id]/HistoryDetail.tsx'))).toContain('from="history"');
  });
});

describe('the staging (F6-5) and what the room sends', () => {
  const ROOM = 'app/chat/ChatRoom.tsx';

  it('resolves `?attach=` on the server, with ownership as a where predicate', () => {
    /*
     * `[F6-6]`: `readingWithCards(db, user.id, id)` is `/history/[id]`'s own function —
     * *a reading that is not yours and a reading that does not exist both 404, and they
     * are indistinguishable on purpose.* It also validates the uuid shape and filters
     * `blocked`. **Never a lookup by id alone**, because an id typed into the query
     * param would otherwise resolve a stranger's reading into a prompt with nothing on
     * screen looking wrong.
     */
    const src = stripComments(file('app/chat/page.tsx'));
    expect(src).toContain('readingWithCards(db, auth.user.id, attach)');
    expect(src).toContain('requireUser()');
    // Only when the parameter is present. Absent is the common case and costs nothing.
    expect(src).toMatch(/if \(attach\) \{/);
    // And the UI predicate filters again, so nothing stages a body that stops mid-sentence.
    expect(src).toContain('attachable(reading)');
  });

  it('consumes the parameter once, and does not re-stage from the prop', () => {
    /*
     * `router.replace('/chat')` re-renders the server component, which hands `staged`
     * back as NULL. **An effect syncing the prop into the state would therefore unstage
     * the reading a moment after staging it**, with nothing on screen explaining why —
     * the v0.6.0 soft-navigation trap arriving from the other side. The ref guard is
     * StrictMode's: a second `replace` is a second history entry, so the back button
     * would land on `/chat` instead of the reading the querent came from.
     */
    const src = stripComments(file(ROOM));
    expect(src).toContain('useState<StagedReading | null>(stagedProp)');
    expect(src).toContain('attachConsumedRef.current = true;');
    expect(src).toContain("router.replace('/chat', { scroll: false })");
    expect(count(src, /router\.replace\(/g)).toBe(1);
  });

  it('posts the id it staged, and the control that staged it', () => {
    /*
     * The loop-5 question in a regex: does the UI agree with what it sends? The full
     * answer needs a browser; what is checkable here is that the outgoing body reads
     * the STAGED preview rather than anything else, and that the hardcoded `null` F4
     * left behind is gone.
     */
    const src = stripComments(file(ROOM));
    expect(src).toContain('attachedReadingId: staged?.preview.readingId ?? null');
    expect(src).toContain('attachFrom: staged?.from ?? null');
    expect(src).toContain('attached_reading_id: outgoing.attachedReadingId');
    expect(src).toContain('attached_from: outgoing.attachFrom');
    // The optimistic bubble carries it too, or the card vanishes for the moment
    // between the press and the reply.
    expect(src).toContain('attachedReadingId: outgoing.attachedReadingId');
  });

  it('lets an attachment with no text be sent (§3.3), on both sides of the composer', () => {
    /*
     * *"user may / may not add a text"*, verbatim from the brief. An attachment with no
     * words is *"look at this"* — a perfectly good conversational move that must
     * produce a run, and `C-R6` even permits nobody answering it. **Empty AND
     * unattached is the only nothing**, and all three guards agree on that: the
     * composer's button, the room's submit, and the route's 400.
     */
    expect(stripComments(file('components/ChatComposer.tsx'))).toContain(
      'draft.trim().length > 0 || staged != null',
    );
    expect(stripComments(file(ROOM))).toContain('body.length === 0 && !staged');
    expect(stripComments(file('app/api/chat/message/route.ts'))).toContain(
      'body.length === 0 && !input.attached_reading_id',
    );
  });

  it('adds no sixth fetch to the room (F4-11)', () => {
    // The staging is a prop off the server render and the previews ride the page the
    // room already fetches. `chatSurface.test.ts` owns the count; this asserts F6 did
    // not spend it.
    const src = stripComments(file(ROOM));
    expect(count(src, /await fetch\(/g)).toBe(5);
  });

  it('reports `chat.opened.from` from the server’s decision, not from the URL', () => {
    /*
     * Two things forced this: the `from` key now carries `history|draw` (which is also
     * `attached_from`), so a literal match on `'attach'` could never fire; and the
     * effect that tidies the URL runs while the two mount fetches are still in flight,
     * so a late read would report `'direct'` for exactly the opens F6 exists to
     * distinguish.
     */
    const src = stripComments(file(ROOM));
    expect(src).toContain('from: entryRef.current');
    expect(src).not.toContain('window.location.search');
    expect(stripComments(file('app/chat/page.tsx'))).toContain(
      "if (typeof params.attach === 'string' && params.attach.length > 0) return 'attach';",
    );
  });
});

describe('the bubble’s slot, and the state that is not an error', () => {
  it('mounts F6’s renderer and never a fourth ReadingView (F6-1)', () => {
    /*
     * `ReadingView` is the one renderer three surfaces mount (VD10). **Rule 4 is the
     * fatal one:** it renders a pulsing translating state for any reading whose locale
     * differs from the viewer's unless the caller supplies `prose`, so a foreign-locale
     * attachment would pulse forever inside a bubble — `C-R7`'s *"there is no error
     * bubble"* arriving as a loading state that predates the rule.
     */
    const room = stripComments(file('app/chat/ChatRoom.tsx'));
    expect(room).toContain('<ReadingAttachment');
    for (const path of ['app/chat/ChatRoom.tsx', 'components/ChatBubble.tsx',
      'components/ReadingAttachment.tsx', 'components/StagedAttachment.tsx']) {
      expect({ path, mountsReadingView: /<ReadingView/.test(file(path)) }).toEqual({
        path,
        mountsReadingView: false,
      });
    }
  });

  it('draws the gone line only for an EMPTY bubble whose attachment resolved to nothing', () => {
    /*
     * §8's table. A missing attachment under a bubble that HAS text is an ordinary text
     * bubble — no slot, no placeholder, no chrome — because `C-R7` forbids an error
     * bubble and the same argument forbids a placeholder announcing the app's plumbing.
     * **The room's version of a missing attachment is that there was never an
     * attachment.**
     */
    const src = stripComments(file('app/chat/ChatRoom.tsx'));
    expect(src).toMatch(/return message\.body \? undefined : \(/);
    expect(src).toContain("t('chat.attachment.gone')");
  });

  it('keeps the gone line out of the message log’s data (C-R7)', () => {
    // It is the app labelling an empty slot inside the querent's own bubble, rendered
    // by the caller — never a `chat_messages` row a director could point a beat at.
    expect(stripComments(file('components/ChatBubble.tsx'))).not.toContain('chat.attachment');
  });

  it('asks the catalog for keys that exist (I3)', () => {
    for (const path of ['components/ReadingAttachment.tsx', 'components/StagedAttachment.tsx',
      'components/AttachReadingLink.tsx']) {
      const keys = [...file(path).matchAll(/\bt\('([a-z][\w.]*)'/g)].map((m) => m[1]);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) expect({ path, key, present: key in id }).toEqual({
        path,
        key,
        present: true,
      });
    }
    // The chip's key is built from the locale, so both halves are asserted by hand.
    expect('chat.attachment.language.id' in id).toBe(true);
    expect('chat.attachment.language.en' in id).toBe(true);
  });
});

describe('[F6-11] /chat gains no share surface, and the attachment is not one', () => {
  /**
   * The sentence has to exist because the two controls are ADJACENT ON SCREEN and look
   * alike: **attaching shows a reading to three characters who already hold the
   * querent's six onboarding answers; sharing puts it on the public internet.** A
   * checklist rather than a paragraph, so it can be reviewed rather than believed.
   */
  it('mounts no share control anywhere in the chat tree', () => {
    for (const f of FILES.filter(
      (x) => x.path.startsWith('app/chat/') || /^components\/(Chat|Reading|Staged)\w+\.tsx$/.test(x.path),
    )) {
      const shares = /<ShareFooter|<PublicShare|<TryItYourself/.test(f.source);
      expect({ path: f.path, shares }).toEqual({ path: f.path, shares: false });
    }
  });

  it('mints no link and touches no share column', () => {
    for (const path of ['app/chat/ChatRoom.tsx', 'app/chat/page.tsx',
      'app/api/chat/message/route.ts', 'app/api/chat/messages/route.ts']) {
      const src = file(path);
      expect({ path, share: /share_links|shareLinks|sharedAt|ShareEntity/.test(src) }).toEqual({
        path,
        share: false,
      });
    }
  });
});
