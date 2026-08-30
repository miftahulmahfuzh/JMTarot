import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Source-level assertions over the two memory routes, in
 * `src/app/api/account/route.test.ts`'s register. They exist to stop the properties
 * this phase argued for being kept green by other means — a bulk read moving onto
 * the page's render path, a raw driver error reaching a production log, a limiter
 * that is called and not awaited.
 *
 * COMMENTS ARE STRIPPED FIRST: a rule that fires on the prose describing the rule
 * is a rule people delete.
 */
const strip = (raw: string) =>
  raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const LIST = strip(readFileSync('src/app/api/account/memory/route.ts', 'utf8'));
const ONE = strip(readFileSync('src/app/api/account/memory/[item]/route.ts', 'utf8'));
const PAGE = readFileSync('src/app/account/page.tsx', 'utf8');

describe('the memory routes', () => {
  it('read the files at all, so nothing below passes vacuously', () => {
    expect(LIST.length).toBeGreaterThan(500);
    expect(ONE.length).toBeGreaterThan(300);
    expect(LIST).toContain('export async function GET');
    expect(LIST).toContain('export async function DELETE');
    expect(ONE).toContain('export async function DELETE');
  });

  it('serves the notes `private, no-store`', () => {
    // Per-user, and a machine's inferences about a person. No shared cache, no
    // disk, no history entry.
    expect(LIST).toContain("'cache-control': 'private, no-store'");
  });

  it('never renders the notes on the server', () => {
    /*
     * **THE PROPERTY `/api/onboarding/answer/<key>` ACTUALLY PROTECTS**, kept here
     * by a different mechanism because the payload has no labels: the text is not in
     * the response to merely OPENING a page. `/account` must not read the table.
     */
    expect(PAGE).not.toContain('queries/memory');
    expect(PAGE).not.toContain('memoryItems');
  });

  it('requires a session on every verb, with the fail-closed default kept', () => {
    // Unlike `/api/onboarding/*` and `DELETE /api/account`, there is nothing here to
    // read or erase before onboarding: the room does not open until then.
    expect(LIST).toContain('requireUser()');
    expect(ONE).toContain('requireUser()');
    expect(LIST).not.toContain('requireOnboarding: false');
    expect(ONE).not.toContain('requireOnboarding: false');
  });

  it('rate limits, and awaits the limiter', () => {
    // `hit()` is async since V9; an un-awaited Promise is truthy, i.e. never
    // refuses.
    expect(LIST).toMatch(/await\s+hit\(/);
    expect(ONE).toMatch(/await\s+hit\(/);
  });

  it('declares runtime and maxDuration on both', () => {
    for (const [name, src] of [
      ['list', LIST],
      ['one', ONE],
    ] as const) {
      expect({ name, ok: src.includes("export const runtime = 'nodejs'") }).toEqual({
        name,
        ok: true,
      });
      expect({ name, ok: /export const maxDuration = \d+/.test(src) }).toEqual({ name, ok: true });
    }
  });

  it('narrows the id before it reaches a query', () => {
    // An unrecognised id would match nothing and return a cheerful 404, which reads
    // as "already deleted" and hides a client bug.
    const guardIndex = ONE.indexOf('isMemoryItemId');
    const queryIndex = ONE.indexOf('dismissUserMemoryItems(db');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(queryIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(queryIndex);
  });

  it('tombstones on both delete paths, and calls the erasure function on neither', () => {
    /*
     * **`redactUserMemory` IS THE ERASURE PATH's FUNCTION AND MUST NOT BE REACHED
     * FROM HERE.** It empties `items` WITHOUT tombstoning, on purpose, so a restored
     * account rebuilds its memory. On this path nothing is being erased and the
     * transcript that produced every fact is still in `chat_messages`, so a
     * non-tombstoning clear is a button that lies until the next extraction.
     */
    for (const [name, src] of [
      ['list', LIST],
      ['one', ONE],
    ] as const) {
      expect({ name, dismisses: src.includes('dismissUserMemoryItems') }).toEqual({
        name,
        dismisses: true,
      });
      expect({ name, redacts: src.includes('redactUserMemory') }).toEqual({
        name,
        redacts: false,
      });
    }
  });

  it('404s an erasure that erased nothing, on both delete paths', () => {
    // Reporting success for a deletion that deleted nothing is the wrong answer to
    // give about somebody's data.
    expect(LIST).toMatch(/status:\s*404/);
    expect(ONE).toMatch(/status:\s*404/);
  });

  it('never logs a raw error object in production', () => {
    /*
     * A postgres error quotes its bound parameters, and on the write path one of
     * those is the payload — prose a model wrote about this person's life.
     */
    for (const [name, src] of [
      ['list', LIST],
      ['one', ONE],
    ] as const) {
      const guarded = src.includes("process.env.NODE_ENV === 'development'");
      expect({ name, guarded }).toEqual({ name, guarded: true });
      // The bare `console.error('...', err)` form, outside the development branch.
      expect({
        name,
        bare: /console\.error\([^)]*,\s*err\s*\)/.test(src.split('development')[0]),
      }).toEqual({ name, bare: false });
    }
  });

  it('declares no analytics event', () => {
    /*
     * This phase adds ZERO names to `events.ts`, deliberately — the register's own
     * guidance is to fold rather than add, and every available fold here is one it
     * has already refused. If a number is ever needed, it lands beside the
     * extractor's event with the ceiling moved once and the accounting written.
     */
    for (const src of [LIST, ONE]) {
      expect(src).not.toContain('withAnalytics');
      expect(src).not.toMatch(/\btrack\(/);
    }
  });
});
