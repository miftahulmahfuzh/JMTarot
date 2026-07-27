import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * `SECRET_ENV` in `scripts/audit-secrets.ts` is HAND-MAINTAINED, and a credential
 * missing from it is a credential the tripwire does not scan the client bundle
 * for. **The failure is silent and the audit still prints `clean`**, which is the
 * worst shape a security control can fail in.
 *
 * A source-level check, in the `legal.test.ts` idiom, because `audit-secrets.ts`
 * is a script with no test file of its own and importing it would run the audit.
 */
const audit = readFileSync('scripts/audit-secrets.ts', 'utf8');
const example = readFileSync('.env.example', 'utf8');

/**
 * Every credential-shaped variable V9 added.
 *
 * `UPSTASH_REDIS_REST_URL` is not itself a secret. It is on the list anyway
 * because it NAMES THE DATASTORE, which is the same reasoning that already put
 * `LLM_BASE_URL` and `DATABASE_URL` there.
 */
const V9_SECRETS = ['UPSTASH_REDIS_REST_TOKEN', 'UPSTASH_REDIS_REST_URL'];

/** Everything V9 reads from the environment, credential or not. */
const V9_ENV = [
  ...V9_SECRETS,
  'RATELIMIT_BACKEND',
  'RATELIMIT_TIMEOUT_MS',
  'RATELIMIT_GLOBAL_HOURLY',
  'RATELIMIT_EVENTS_BACKEND',
  'LLM_WINDOW_CALL_CEILING',
  'LLM_WINDOW_CALL_SOFT',
];

describe('the secrets tripwire knows about V9', () => {
  for (const name of V9_SECRETS) {
    it(`${name} is in SECRET_ENV`, () => {
      expect(audit).toContain(`'${name}'`);
    });
  }
});

describe('.env.example documents every variable V9 reads', () => {
  /*
   * `.env.example` is where the SHAPES live and it is what somebody copies to
   * `.env.local`. A variable the code reads and the example does not name is a
   * variable that only exists on the machine of whoever added it.
   */
  for (const name of V9_ENV) {
    it(`${name} appears in .env.example`, () => {
      expect(example).toContain(`${name}=`);
    });
  }

  it('warns about the `$` trap on the Upstash token', () => {
    /*
     * Next expands `$VAR` when loading a `.env` file, so a raw token loses part of
     * itself and arrives mangled -- and an Upstash token is long, opaque and
     * impossible to eyeball for a missing character. **The symptom is a limiter
     * that is silently 100% degraded**, because a bad token is an error and an
     * error falls back to memory, which looks exactly like working.
     */
    const block = example.slice(example.indexOf('UPSTASH_REDIS_REST_URL'));
    const warning = example.slice(0, example.indexOf('UPSTASH_REDIS_REST_URL='));
    expect(warning + block).toMatch(/ESCAPE `\$` AS `\\\$`/);
    expect(example).toMatch(/Do NOT escape in the Vercel dashboard/i);
  });

  it('says out loud that a missing Upstash config degrades SILENTLY', () => {
    // The one thing a deployer must know and cannot discover by looking: the app
    // works perfectly without it, at v0.2.0's per-instance limits.
    const block = example.slice(
      example.indexOf('# --- V9: the distributed rate limiter'),
      example.indexOf('UPSTASH_REDIS_REST_URL='),
    );
    expect(block).toMatch(/SILENTLY REVERTS/);
  });
});

describe('the env names V9 actually reads match the ones it documents', () => {
  it('no V9 module reads a RATELIMIT_ or LLM_WINDOW_ variable that is undocumented', () => {
    /*
     * The direction the two lists above cannot cover: they assert that what is
     * documented exists, not that what exists is documented. A `process.env.X`
     * added later with no `.env.example` entry is a knob only its author knows
     * about -- which is how a limiter ends up tuned on one machine.
     */
    const sources = [
      'src/lib/ratelimit/index.ts',
      'src/lib/ratelimit/redis.ts',
      'src/lib/llm/meter.ts',
    ].map((f) => readFileSync(f, 'utf8'));

    const found = new Set<string>();
    for (const src of sources) {
      for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) found.add(m[1]);
      for (const m of src.matchAll(/process\.env\[['"]?([A-Z0-9_]+)/g)) found.add(m[1]);
    }

    const undocumented = [...found].filter(
      (name) => /^(RATELIMIT_|LLM_WINDOW_|UPSTASH_)/.test(name) && !example.includes(`${name}=`),
    );
    expect(undocumented).toEqual([]);
  });
});
