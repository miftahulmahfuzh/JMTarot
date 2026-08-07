import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nextAction } from './machine';
import type { Beat, BeatSheet, RunStatus } from './types';
import { pace } from './voices/pace';

/**
 * The engine's decision, as a table.
 *
 * **`run.ts` CANNOT BE IMPORTED UNDER VITEST** — it reaches `@/lib/db/client`, which
 * dies on `Missing required environment variable: DATABASE_URL` before a single
 * assertion runs. **That is not a limitation to work around; it is why `machine.ts`
 * exists.** The decision is pure and lives there; this file is the table behind it,
 * in `gate.decide()`'s idiom.
 *
 * The second half of this file greps `run.ts` as SOURCE, which is the only way to
 * check the effect half at all — `flagCoverage.test.ts` and `clientBoundary.test.ts`
 * are the two precedents for that idiom and both give the same reason.
 */

const beat = (reader: Beat['reader'], intent: Beat['intent'] = 'answer'): Beat => ({
  reader,
  to: 'user',
  replyTo: null,
  intent,
  angle: null,
});

const sheet = (...beats: Beat[]): BeatSheet => ({ v: 1, beats });

type Row = { status: RunStatus; beats: BeatSheet | null; beatsDone: number };

describe('nextAction', () => {
  it('plans a pending run', () => {
    expect(nextAction({ status: 'pending', beats: null, beatsDone: 0 })).toEqual({
      kind: 'plan',
    });
  });

  it('plans a RECLAIMED planning run, because [F1-4] makes it provably sheetless', () => {
    /*
     * `status = 'planning' AND beats IS NOT NULL` is unrepresentable — the sheet write
     * and the status flip are ONE UPDATE. So a `planning` run that was reclaimed is one
     * whose executor died before answering, and planning it again is correct rather
     * than a second sheet.
     *
     * **Two statements there, and a reclaimed run with a sheet would get a SECOND
     * one — six bubbles where the querent was promised three.**
     */
    expect(nextAction({ status: 'planning', beats: null, beatsDone: 0 })).toEqual({
      kind: 'plan',
    });
  });

  it('executes the beat at beats_done', () => {
    const s = sheet(beat('thessaly'), beat('adrian', 'ask'), beat('margaret'));
    expect(nextAction({ status: 'running', beats: s, beatsDone: 1 })).toEqual({
      kind: 'execute',
      beat: s.beats[1],
      index: 1,
      total: 3,
    });
  });

  it('finishes when the sheet is exhausted but the status still says running', () => {
    // Reachable when a `completeBeat` committed and its status flip was lost, or when a
    // skip advanced past the last beat. Not an error state — just an unfinished row.
    const s = sheet(beat('thessaly'));
    expect(nextAction({ status: 'running', beats: s, beatsDone: 1 })).toEqual({
      kind: 'finish',
    });
  });

  it('finishes an EMPTY sheet rather than executing nothing (C-R6)', () => {
    /*
     * A zero-beat plan is valid and is the common good outcome: the querent's message
     * sits there unanswered, which is what happens in a real group chat. In practice
     * `writeBeatSheet` flips such a run straight to `done` in the same statement, so
     * this branch is the belt to that brace.
     */
    expect(nextAction({ status: 'running', beats: sheet(), beatsDone: 0 })).toEqual({
      kind: 'finish',
    });
  });

  it('is idle for a finished run, so an advance after done is free', () => {
    for (const status of ['done', 'abandoned'] as const) {
      expect(nextAction({ status, beats: sheet(beat('adrian')), beatsDone: 0 })).toEqual({
        kind: 'idle',
      });
    }
  });

  it('never indexes past the end, whatever beats_done says', () => {
    // `beats_done` is an integer column with a `>= 0` CHECK and no upper bound, and a
    // beat sheet is jsonb. A row where the two disagree must not hand `undefined` to a
    // voice, which would generate against a beat that is not there.
    const action = nextAction({ status: 'running', beats: sheet(beat('adrian')), beatsDone: 9 });
    expect(action).toEqual({ kind: 'finish' });
  });
});

describe('the pace (seam S3, [R11])', () => {
  it('is a FUNCTION of the previous bubble, not a constant (C-R4)', () => {
    /*
     * **A CONSTANT IS A METRONOME AND A METRONOME IS THE THING THAT READS AS A BOT.**
     * This is the assertion that fails when somebody "simplifies" `pace()` into a
     * number, which is the single most likely edit to this seam.
     */
    const short = pace({ next: beat('thessaly'), previousChars: 4 });
    const long = pace({ next: beat('thessaly'), previousChars: 400 });
    expect(long).toBeGreaterThan(short);
  });

  it('differs by reader, so three voices do not share one rhythm', () => {
    const forEach = (['thessaly', 'margaret', 'adrian'] as const).map((r) =>
      pace({ next: beat(r), previousChars: 100 }),
    );
    expect(new Set(forEach).size).toBe(3);
  });

  it('has a floor above zero and a ceiling below patience', () => {
    // A bubble with no pause at all is two messages rendering in one frame, which
    // reads as one long message split by a layout bug rather than as two people.
    expect(pace({ next: beat('thessaly'), previousChars: null })).toBeGreaterThanOrEqual(700);
    expect(pace({ next: beat('adrian'), previousChars: 100_000 })).toBeLessThanOrEqual(6000);
  });
});

describe('the engine keeps its promises in source', () => {
  const CODE = readFileSync('src/lib/chat/run.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('never logs a driver error directly ([F1-23])', () => {
    /*
     * A postgres error quotes the failing statement **and its bound parameters**, and
     * on this path one of them is `chat_messages.body` — a person's sentence. Every
     * catch goes through `logChatFailure()`, which strips to ids and SQLSTATE in
     * production.
     */
    expect(CODE).not.toMatch(/console\.(error|warn|log)\(/);
    expect(CODE).toContain('logChatFailure(');
  });

  it('releases the lease on a shed rather than advancing or abandoning ([F1-6])', () => {
    // The single best argument for the run engine: nothing is lost, nothing 500s, and
    // the querent's next visit delivers the rest.
    const doPlan = CODE.slice(CODE.indexOf('async function doPlan'), CODE.indexOf('async function doBeat'));
    expect(doPlan).toContain("outcome.kind === 'shed'");
    expect(doPlan).toContain('releaseLease(db, run.id, owner)');
    expect(doPlan).toContain("state: 'shed'");
    expect(doPlan).not.toContain("'abandoned'");
  });

  it('stores no error bubble, ever ([C-R7])', () => {
    /*
     * **W4's `[Bacaan terputus…]` RULE IS UNIMPLEMENTABLE HERE**, and that is why the
     * answer is silence rather than a notice: in a chat every message IS stored and IS
     * context for the next one, so a stored notice would be quoted back at the querent
     * by the next beat as if a reader had said it.
     */
    expect(CODE).not.toMatch(/terputus|\[error\]|maaf, ada gangguan/i);
  });

  it("takes an opaque lease owner and never a session id", () => {
    expect(CODE).toContain('randomUUID()');
    expect(CODE).not.toMatch(/sessionId|session_id/);
  });
});
