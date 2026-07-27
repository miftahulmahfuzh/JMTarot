/**
 * EVERY TABLE THAT STORES GENERATED PROSE RECORDS THE LANGUAGE IT CAME OUT IN.
 *
 * V2 §7's audit table, turned into a test. It reads `schema.ts` off disk in
 * `contract.test.ts`'s style: no database, no Docker, and it belongs in the fast
 * `unit` project.
 *
 * WHY A TEST AND NOT A PARAGRAPH IN A PLAN. This is the first non-negotiable of
 * v0.3.0's second item — *no generated prose is ever shown in a language it was
 * not generated in* — and it is unenforceable after the fact. A future workstream
 * that adds a generated-prose table without a locale column produces rows that
 * cannot be rendered honestly and cannot be repaired, because nothing recorded
 * which prompt fork wrote them. Catching that at the migration is the only time
 * it is cheap.
 *
 * It reads source text rather than introspecting the Drizzle objects on purpose:
 * two of the assertions are about COMMENTS. `lotus_avatars` is exempt, and VD6
 * asks for the reason to be written next to the column — an exemption whose
 * justification can be deleted without failing anything is an exemption that
 * turns into an oversight.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(join(process.cwd(), 'src/lib/db/schema.ts'), 'utf8');

/**
 * One table's block of `schema.ts`, from its `pgTable(` call to the closing of
 * its definition.
 *
 * Bounded by the next `export const <name> = pgTable(` rather than by brace
 * matching, which is what keeps this a twelve-line function instead of a parser.
 * The tables are declared one after another with nothing between them but the
 * section banners.
 */
function blockOf(table: string): string {
  const start = SOURCE.indexOf(`pgTable(\n  '${table}'`);
  const inline = SOURCE.indexOf(`pgTable('${table}'`);
  const from = start === -1 ? inline : start;
  if (from === -1) return '';

  const rest = SOURCE.slice(from + 10);
  const next = rest.search(/\n(?:\/\*|\/\/ -+\n\/\/ |export (?:const|type) )/);
  return next === -1 ? rest : rest.slice(0, next);
}

/**
 * Tables holding prose a model wrote, EXCEPT the one grandfathered exemption.
 *
 * `readings` is here for `body`; `reading_cards` is not, because it holds card
 * ids and orientation and no prose at all. `translations` carries two locale
 * columns and the list only demands one, which is correct: `locale` is what it
 * was translated into, and that is the one a renderer needs.
 */
const MUST_TAG = [
  'readings',
  'daily_summaries',
  'frequency_verdicts',
  'translations',
] as const;

describe('the locale tag on generated prose', () => {
  it('finds the schema and can carve a table out of it, so nothing passes vacuously', () => {
    expect(SOURCE.length).toBeGreaterThan(4000);
    expect(blockOf('readings')).toContain('prompt_version');
    expect(blockOf('nonexistent_table')).toBe('');
  });

  for (const table of MUST_TAG) {
    it(`${table} declares a locale column`, () => {
      expect(blockOf(table)).toMatch(/text\('locale'\)\.\$type<Locale>\(\)/);
    });
  }

  /*
   * THE ONE EXCEPTION, ASSERTED AS AN EXCEPTION.
   *
   * `lotus_avatars.summary` is jsonb keyed by locale rather than a row per
   * locale, and it is NOT translated — it is distilled per locale from the same
   * source answers, which produces better prose than translating one into the
   * other. VD6 grandfathers it and asks for that to be said in the file.
   *
   * Two assertions, not one: that it still has no `locale` column (so nobody
   * "fixes" the asymmetry into a half-migrated third shape), and that the
   * reasoning is still beside the column. The second is the one that matters —
   * the asymmetry looks like an oversight from `translations`, and a reader who
   * cannot find the reason will assume there isn't one.
   */
  it('grandfathers lotus_avatars, and keeps VD6 written next to the column', () => {
    const block = blockOf('lotus_avatars');
    expect(block).toContain("jsonb('summary')");
    expect(block).not.toMatch(/text\('locale'\)/);

    expect(block).toContain('GRANDFATHERED');
    expect(block).toContain('VD6');
    // The actual argument, not just the citation: it is distilled per locale
    // rather than translated, which is why widening `translations` would be a
    // rewrite of a working path for symmetry alone.
    expect(block).toMatch(/DISTILLED PER LOCALE/i);
  });

  /*
   * `readings.gist` has NO locale column and must not acquire one (V2 §7). It
   * inherits `readings.locale` by construction — `extractGist` is called with the
   * reading's own locale and `gistPrompt` is locale-forked. A second column would
   * be a second place for one fact and the first place for the two to disagree.
   *
   * Asserted because the absence looks like an oversight from `translations`,
   * where `reading.gist` is a translatable field in its own right.
   */
  it('keeps readings.gist locale-free, with the reason recorded', () => {
    const block = blockOf('readings');
    expect(block).not.toMatch(/gist_locale|text\('gist_locale'\)/);
    expect(block).toMatch(/NO LOCALE OF ITS OWN/i);
    expect(block).toContain('inherits');
  });

  /*
   * `personas` is V8's and does not exist yet. Asserted CONDITIONALLY rather than
   * left out, so that the day the table lands it is already covered: V8 does not
   * have to remember to come back here, and a `personas` table with no `locale`
   * fails a test that was written before it.
   */
  it('covers personas if and only if V8 has landed it', () => {
    const block = blockOf('personas');
    if (!block) {
      expect(SOURCE).not.toContain("pgTable('personas'");
      return;
    }
    expect(block).toMatch(/text\('locale'\)\.\$type<Locale>\(\)/);
  });
});
