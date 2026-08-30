import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFERRABLE_FLAGS,
  dailySummaryEnabled,
  frequencyVerdictEnabled,
  gistEnabled,
  lotusGenerationEnabled,
  personaGenerationEnabled,
} from './flags';

/**
 * The five kill switches, and the ONE property that binds all of them: only the
 * exact string `'0'` disables. `ANALYTICS_ENABLED`'s rule, and the reason is the
 * same — a typo must leave a feature ON, because the alternative is a variable
 * somebody meant to set to `1` silently costing every querent a feature with
 * nothing anywhere reporting it.
 *
 * The table drives every assertion, so a sixth flag added without a defaulting
 * test is a compile error rather than an omission nobody notices.
 */
const FLAGS = [
  { env: 'DAILY_SUMMARY_ENABLED', fn: dailySummaryEnabled },
  { env: 'FREQUENCY_VERDICT_ENABLED', fn: frequencyVerdictEnabled },
  { env: 'PERSONA_GENERATION_ENABLED', fn: personaGenerationEnabled },
  { env: 'LOTUS_GENERATION_ENABLED', fn: lotusGenerationEnabled },
  { env: 'GIST_ENABLED', fn: gistEnabled },
] as const;

const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const { env } of FLAGS) {
    saved.set(env, process.env[env]);
    delete process.env[env];
  }
});

afterEach(() => {
  for (const { env } of FLAGS) {
    const value = saved.get(env);
    if (value === undefined) delete process.env[env];
    else process.env[env] = value;
  }
});

describe.each(FLAGS)('$env', ({ env, fn }) => {
  it('is ENABLED when unset', () => {
    expect(fn()).toBe(true);
  });

  it('is enabled at the literal "1"', () => {
    process.env[env] = '1';
    expect(fn()).toBe(true);
  });

  it('is DISABLED at the literal "0" and only there', () => {
    process.env[env] = '0';
    expect(fn()).toBe(false);
  });

  /*
   * THE DIRECTION THAT MATTERS. Every one of these is somebody meaning to
   * disable a feature and mistyping it; all of them must leave it ON, because a
   * flag that silently half-works is worse than one that plainly did nothing.
   */
  it.each(['', ' ', '0 ', ' 0', 'false', 'no', 'off', 'FALSE', '00', 'disabled'])(
    'stays ENABLED at %j',
    (value) => {
      process.env[env] = value;
      expect(fn()).toBe(true);
    },
  );

  it('is read at CALL time, not module scope', () => {
    process.env[env] = '0';
    expect(fn()).toBe(false);
    process.env[env] = '1';
    expect(fn()).toBe(true);
  });
});

describe('the module', () => {
  /*
   * A LEAF, for `origin.ts`'s reason applied to a different graph: two of the
   * five consumers (`lotus.generate.ts`, `gist.generate.ts`) go out of their way
   * to avoid a static `@/lib/db/client` import so their pure neighbours stay
   * unit-testable, and a flags module that dragged one in would undo that from
   * the side.
   */
  it('imports nothing', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/llm/flags.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // Comments stripped first: the header names `server-only` and
    // `@/lib/db/client` while explaining why neither may be imported, and a rule
    // that fires on the prose describing the rule is a rule people delete.
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).toContain('DAILY_SUMMARY_ENABLED'); // not vacuous
  });

  /*
   * The reading and the translation are the backbone (Miftah's ruling,
   * 2026-07-30) and MUST NOT acquire a switch here. This asserts the absence by
   * name, because the way that rule dies is somebody adding a sixth entry for
   * symmetry.
   */
  it('declares no flag for the reading or the translation', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/llm/flags.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('READING_ENABLED');
    expect(code).not.toContain('TRANSLATION_ENABLED');
    expect(code).not.toContain('SPREAD_ENABLED');
  });

  /**
   * The register is what `.env.example` and DEPLOY-VERCEL are checked against.
   *
   * **FIVE BECAME SEVEN ON 2026-08-07** (`C-D15`). The two chat flags go at the END,
   * for `OP_ORDER`'s reason: the five above are in the order §2d of DEPLOY-VERCEL
   * teaches an operator to reach for them, and a reordering here would read as a
   * change of priority. **`CHAT_PROACTIVE_ENABLED` is nonetheless the first one to
   * reach for in an outage** — that is said in its own comment rather than by moving
   * it up the list.
   *
   * **SEVEN BECAME EIGHT ON 2026-08-30** (R2). `PROFILE_MEMORY_ENABLED` goes at the
   * END for the same reason the two chat flags did: the five above are in the order
   * §2d of DEPLOY-VERCEL teaches an operator to reach for them, and a reordering here
   * would read as a change of priority. Where it sits in THAT table is §2d's business.
   */
  it('registers exactly the eight deferrable features', () => {
    expect(DEFERRABLE_FLAGS.map((f) => f.env)).toEqual([
      'DAILY_SUMMARY_ENABLED',
      'FREQUENCY_VERDICT_ENABLED',
      'PERSONA_GENERATION_ENABLED',
      'LOTUS_GENERATION_ENABLED',
      'GIST_ENABLED',
      'CHAT_ENABLED',
      'CHAT_PROACTIVE_ENABLED',
      'PROFILE_MEMORY_ENABLED',
    ]);
  });

  it('answers for every registered flag through its own predicate', () => {
    for (const flag of DEFERRABLE_FLAGS) {
      process.env[flag.env] = '0';
      expect(flag.enabled()).toBe(false);
      delete process.env[flag.env];
      expect(flag.enabled()).toBe(true);
    }
  });
});
