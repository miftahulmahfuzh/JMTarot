import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('types.ts has no imports -- it is the leaf', () => {
  /*
   * Same fence as `src/data/types.ts` and `src/lib/db/types.ts`, and the same
   * reason, one layer sharper: `index.ts` imports both backends and `redis.ts`
   * pulls in the vendor SDK, so a type imported from either of those would drag
   * `@upstash/redis` into anything that merely wanted to NAME a
   * `RateLimitResult` -- including, eventually, a client component.
   */
  const src = readFileSync(new URL('./types.ts', import.meta.url), 'utf8');
  expect(src).not.toMatch(/^\s*import\s/m);
});
