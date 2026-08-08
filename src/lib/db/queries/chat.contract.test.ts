import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * **`chat_messages.model` MUST NEVER REACH THE BROWSER** (`[F1-12]`, §0.3
 * non-negotiable 2), and **nothing else in this repository can tell you whether it
 * did.**
 *
 * `scripts/audit-secrets.ts` greps the built bundle for env VALUES; a column a route
 * JSON-serialised is not one. `clientBoundary.test.ts` fences imports, and this is a
 * field on an object. A typecheck is satisfied by `db.select()` with no argument,
 * which returns every column including this one and would ship the model name to
 * every open room in the app.
 *
 * So the enforcement is a grep over the one file that reads these tables: **every
 * projection is explicit, and `model` is in none of them.**
 *
 * `queries/contract.test.ts` covers the handle-first and no-`server-only` rules for
 * this file already; those are not restated here.
 */

const FILE = 'src/lib/db/queries/chat.ts';
const SOURCE = readFileSync(FILE, 'utf8');

/** The source with its comments removed — `queries/contract.test.ts`'s lesson: a rule
 *  that fires on the prose describing the rule is a rule people delete. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('every read of chat_messages names its columns', () => {
  it('contains no bare db.select() over the message table', () => {
    /*
     * `db.select()` with no argument returns EVERY column, `model` included. It is
     * legitimate on `chat_threads` and `chat_runs` — neither reaches a browser
     * whole — and it is a defect here.
     *
     * Matched as `.select()\n    .from(chatMessages)` in either spelling, because
     * prettier will wrap it and a single-line regex would stop matching the day it
     * does.
     */
    const bare = [...CODE.matchAll(/\.select\(\s*\)\s*\.from\((\w+)\)/g)].map((m) => m[1]);
    expect(bare).not.toContain('chatMessages');
  });

  it('never names `model` in a projection', () => {
    /*
     * The `DTO_COLUMNS` table is the single projection all three read paths share, so
     * this is really one assertion about one object — but it is written over the
     * whole file, because the way it fails is somebody adding a fourth read path with
     * its own inline projection at 11pm.
     */
    expect(CODE).not.toMatch(/model:\s*chatMessages\.model/);
    // ...and not vacuous: the table it should be checking really is projected here.
    expect(CODE).toMatch(/body:\s*chatMessages\.body/);
  });

  it('declares the DTO projection exactly once, so three read paths cannot drift', () => {
    expect([...CODE.matchAll(/DTO_COLUMNS\s*=/g)]).toHaveLength(1);
    // Three readers plus the client-key lookup.
    expect([...CODE.matchAll(/\.select\(DTO_COLUMNS\)/g)].length).toBeGreaterThanOrEqual(3);
  });

  it('returns the DTO projection from the insert, not the whole row', () => {
    expect(CODE).toContain('.returning(DTO_COLUMNS)');
  });
});

describe('the module logs no driver error ([F1-23])', () => {
  it('has no console.error or console.warn at all', () => {
    /*
     * A postgres error quotes the failing statement **and its bound parameters**, and
     * `chat_messages.body` is one of them — text a person typed into a room where
     * they were invited to talk about the worst thing they have seen. This module
     * throws unchanged and every caller catches through `logChatFailure()`.
     */
    expect(CODE).not.toMatch(/console\.(error|warn|log|debug)/);
  });

  it('carries a typed LeaseLostError so a route can branch without reading a message', () => {
    // The lease being lost is an ordinary outcome (`{ state: 'busy' }`), not a
    // failure — and telling it from a driver failure by string-matching an error
    // message is how a bound parameter ends up in a log line.
    expect(CODE).toContain('export class LeaseLostError');
  });
});

describe('the lease protocol is one statement, and both predicates are present', () => {
  const claim = CODE.slice(CODE.indexOf('export async function claimRun'));

  it('takes the lease in the SAME statement that reads the run ([F1-2])', () => {
    // A read-then-update is a race with a window the width of a network round trip,
    // and this engine is reached by two tabs, an after() and a cron by design.
    expect(claim).toContain('update chat_runs');
    expect(claim).toContain('for update skip locked');
  });

  it('keeps `lease_until < now()`, which skip locked does NOT cover', () => {
    /*
     * `skip locked` skips a row another transaction currently HOLDS — the
     * two-tabs-in-the-same-millisecond case. This predicate excludes a row whose
     * holder has already COMMITTED, which is far more common and is not a locked row.
     * **Deleting it makes the two-tabs-a-second-apart case post the same bubble
     * twice**, and `chat.integration.test.ts` has the case that turns red.
     */
    expect(claim).toContain('lease_until is null or lease_until < now()');
  });

  it('drains the oldest run first, in the order the room happened', () => {
    expect(claim).toContain('order by created_at asc');
  });
});

describe('the two writes that must not be split', () => {
  const sheet = CODE.slice(
    CODE.indexOf('export async function writeBeatSheet'),
    CODE.indexOf('export async function completeBeat'),
  );
  const beat = CODE.slice(CODE.indexOf('export async function completeBeat'));

  it('writes the sheet and flips the status in ONE update ([F1-4])', () => {
    /*
     * So `status = 'planning' AND beats IS NOT NULL` is unrepresentable. Two
     * statements, and a reclaimed run with a sheet gets a SECOND sheet — six bubbles
     * where the querent was promised three.
     */
    expect([...sheet.matchAll(/update chat_runs/g)]).toHaveLength(1);
    expect(sheet).toContain('status      = case');
  });

  it("guards the sheet write on lease_owner AND beats_done = 0 ([F1-5])", () => {
    // The guard is in the WHERE, not in TypeScript: a sheet overwritten after a beat
    // has executed makes `beats_done` index into a different array.
    expect(sheet).toContain('and lease_owner =');
    expect(sheet).toContain('and beats_done = 0');
    expect(sheet).toContain('and beats is null');
  });

  it('inserts the message and increments beats_done in ONE transaction ([F1-1])', () => {
    expect(beat).toContain('db.transaction(');
    expect(beat).toContain('insertMessage(tx,');
  });

  it('guards the increment on lease_owner AND the expected beats_done', () => {
    expect(beat).toContain('and lease_owner =');
    expect(beat).toContain('and beats_done = ${args.expectedBeatsDone}');
  });
});

describe('one beat may write two bubbles, and beats_done still advances by one ([R19])', () => {
  const beat = CODE.slice(CODE.indexOf('export async function completeBeat'));

  it('takes an array of bodies', () => {
    expect(beat).toContain('bodies: string[]');
  });

  it('increments by exactly one regardless of how many it wrote', () => {
    expect(beat).toContain('beats_done  = beats_done + 1');
  });

  it('refuses an empty beat, because C-R7 says a failure stores nothing', () => {
    expect(beat).toContain('if (args.bodies.length === 0) throw');
  });
});
