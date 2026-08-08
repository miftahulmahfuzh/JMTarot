import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BEAT_INTENTS,
  MAX_ANGLE_CHARS,
  MAX_CHAT_MESSAGE_LENGTH,
  REPLY_SNIPPET_CHARS,
  type AdvanceReply,
  type Beat,
  type BeatSheet,
  type ChatAuthor,
  type ChatMessageDto,
  type RunStatus,
  type RunTrigger,
} from './types';

/**
 * **`src/lib/chat/types.ts` IS A LEAF AND SIX WORKSTREAMS DEPEND ON IT STAYING ONE**
 * (`[F1-14]`).
 *
 * A query module names `ChatAuthor` and may not acquire `server-only` even
 * transitively; a client component names `ChatMessageDto` and `AdvanceReply`. The
 * failure of losing that property is not a red test in this workstream — it is a
 * build failure in somebody else's branch, weeks later, on a file they did not
 * touch. So the import list is asserted as source text, in
 * `clientBoundary.test.ts`'s idiom.
 *
 * The `satisfies` clauses below are TYPE assertions wearing a runtime test: they
 * fail at `npm run typecheck` and inside `npm test` if a field is dropped or a union
 * is widened. The runtime expectations exist so Vitest reports a pass rather than an
 * empty suite.
 */

const SOURCE = readFileSync('src/lib/chat/types.ts', 'utf8');

/**
 * The source with its comments removed.
 *
 * **`queries/contract.test.ts`'s LESSON, PAID FOR AGAIN HERE:** its first version
 * grepped for `from '../client'` and failed against the sentence *"Never import from
 * '../client'"* in a doc comment, and its header records that *"a rule that fires on
 * prose describing the rule is a rule people delete."* This file's header says the
 * words `process.env` out loud, so the `process.env` assertion below must not read
 * them.
 */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Every module specifier the file imports. `queries/contract.test.ts`'s parser. */
function importsOf(source: string): string[] {
  return [...source.matchAll(/^\s*import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)].map(
    (m) => m[1],
  );
}

describe('the chat types leaf stays a leaf', () => {
  it('imports exactly one module, and it is @/data/types', () => {
    expect(importsOf(SOURCE)).toEqual(['@/data/types']);
  });

  it('carries no server-only, no next/*, no react', () => {
    for (const spec of importsOf(SOURCE)) {
      expect(
        spec === 'server-only' || spec === 'react' || spec.startsWith('next/'),
        `types.ts imports ${spec}`,
      ).toBe(false);
    }
  });

  it('reads no environment variable', () => {
    /*
     * A default that is really a policy belongs in `model.ts` or `budget.ts`, which
     * carry the `[F1-17]` read-at-call-time rule. A `process.env` here would be
     * inlined by the bundler into every client component that names a type from this
     * file — and would make the value unflippable without a redeploy.
     */
    expect(CODE).not.toContain('process.env');
  });

  it('holds no prompt prose', () => {
    // §0.3 non-negotiable 2. F2's and F3's prompts are client-fenced files; a
    // sentence of prompt in the one module a client component may import is how
    // `audit-secrets.ts` gets something to find.
    expect(SOURCE).not.toMatch(/<(pertanyaan|penanya|jawaban|riwayat|obrolan|lampiran)>/);
  });
});

describe('Beat is closed and carries no unbounded free text', () => {
  it('has exactly the five fields [R9] pins', () => {
    const beat = {
      reader: 'thessaly',
      to: 'user',
      replyTo: null,
      intent: 'ask',
      angle: 'nenek yang meninggal',
    } satisfies Beat;

    expect(Object.keys(beat).sort()).toEqual(['angle', 'intent', 'replyTo', 'to'].concat('reader').sort());
  });

  it('types no field as bare `string` other than replyTo and angle', () => {
    /*
     * **THE ASSERTION THAT KEEPS `topic` OUT.** `F1-D1` refused a director-written
     * prose field on `C-R5`'s ground — *"a director-written summary sitting in the
     * prompt is what a voice would read instead of the transcript"* — and `[R9]`
     * admitted exactly one, bounded, as a SUBJECT. A sixth `string` field is the
     * refusal being undone, and it would read as an authoring convenience.
     */
    const block = SOURCE.slice(SOURCE.indexOf('export type Beat = {'));
    const body = block.slice(0, block.indexOf('\n};'));
    const bare = [...body.matchAll(/^\s{2}(\w+):\s*string(\s*\|\s*null)?;/gm)].map((m) => m[1]);
    expect(bare.sort()).toEqual(['angle', 'replyTo']);
  });

  it('bounds the angle, and the bound is a phrase rather than a sentence', () => {
    expect(MAX_ANGLE_CHARS).toBe(90);
  });

  it('drops `aside`: six intents, not seven ([R9])', () => {
    expect([...BEAT_INTENTS]).toEqual([
      'answer',
      'ask',
      'react',
      'tease',
      'agree',
      'push_back',
    ]);
    expect(BEAT_INTENTS).not.toContain('aside');
  });

  it('accepts the empty sheet, which is C-R6 and is the common good outcome', () => {
    const silent = { v: 1, beats: [] } satisfies BeatSheet;
    expect(silent.beats).toHaveLength(0);
  });

  it('is a versioned wrapper and not a bare array', () => {
    const sheet = { v: 1, beats: [] } satisfies BeatSheet;
    expect(sheet.v).toBe(1);
  });
});

describe('the closed unions', () => {
  it('ChatAuthor is the querent plus the three readers, one column', () => {
    const all = ['user', 'thessaly', 'margaret', 'adrian'] satisfies ChatAuthor[];
    expect(all).toHaveLength(4);
  });

  it('RunStatus keeps pending and planning apart', () => {
    const all = [
      'pending',
      'planning',
      'running',
      'done',
      'abandoned',
    ] satisfies RunStatus[];
    expect(all).toHaveLength(5);
  });

  it('RunTrigger is the five F5 owns', () => {
    const all = [
      'user_message',
      'reading_completed',
      'idle_nudge',
      'unanswered',
      'cron',
    ] satisfies RunTrigger[];
    expect(all).toHaveLength(5);
  });
});

describe('the wire shapes', () => {
  it('ChatMessageDto carries no model, and the absence is [F1-12]', () => {
    const dto = {
      id: 'a',
      author: 'thessaly',
      body: 'hm',
      locale: 'id',
      replyToMessageId: null,
      replyTo: null,
      attachedReadingId: null,
      runId: null,
      beatIndex: null,
      intent: null,
      createdAt: '2026-08-07T00:00:00.000Z',
    } satisfies ChatMessageDto;

    expect('model' in dto).toBe(false);
    // And in the source, so a later widening of the type is red here too.
    const block = SOURCE.slice(SOURCE.indexOf('export type ChatMessageDto = {'));
    expect(block.slice(0, block.indexOf('\n};'))).not.toMatch(/^\s{2}model:/m);
  });

  it('inlines the reply stub, without which C-D11 silently disappears ([R10])', () => {
    const dto = {
      id: 'b',
      author: 'user',
      body: 'iya',
      locale: 'id',
      replyToMessageId: 'a',
      replyTo: { id: 'a', author: 'adrian', snippet: 'udah laper ya?' },
      attachedReadingId: null,
      runId: null,
      beatIndex: null,
      intent: null,
      createdAt: '2026-08-07T00:00:00.000Z',
    } satisfies ChatMessageDto;

    expect(dto.replyTo?.snippet.length).toBeLessThanOrEqual(REPLY_SNIPPET_CHARS);
  });

  it("AdvanceReply has a 'shed' arm, which C-R2's sketch could not express", () => {
    const shed = { state: 'shed', runId: 'r', done: false } satisfies AdvanceReply;
    expect(shed.done).toBe(false);
    expect('message' in shed).toBe(false);
  });

  it('every arm carries `done`, so a client loop never reads undefined', () => {
    const arms: AdvanceReply[] = [
      { state: 'planned', runId: 'r', next: { reader: 'adrian', delayMs: 900 }, done: false },
      { state: 'spoke', runId: 'r', messages: [], next: null, done: true },
      { state: 'skipped', runId: 'r', next: null, done: true },
      { state: 'silent', runId: 'r', done: true },
      { state: 'busy', runId: null, done: false },
      { state: 'shed', runId: null, done: false },
      { state: 'idle', runId: null, done: true },
    ];
    expect(arms).toHaveLength(7);
    for (const arm of arms) expect(typeof arm.done).toBe('boolean');
  });

  it("'spoke' carries an ARRAY of messages, and that is [R19]", () => {
    /*
     * Miftah granted F3's ask that one beat may produce two bubbles — *"a person who
     * has more to say sends a second message rather than a longer one"* — and it had
     * to be built now because `beats_done` accounting cannot acquire it cheaply
     * later. **`beats_done` still advances by ONE.**
     */
    const two = {
      state: 'spoke',
      runId: 'r',
      messages: [] as ChatMessageDto[],
      next: null,
      done: true,
    } satisfies AdvanceReply;
    expect(Array.isArray(two.messages)).toBe(true);
  });
});

describe('the constants', () => {
  it('a chat message is a paragraph, not a question', () => {
    expect(MAX_CHAT_MESSAGE_LENGTH).toBe(2000);
  });
});
