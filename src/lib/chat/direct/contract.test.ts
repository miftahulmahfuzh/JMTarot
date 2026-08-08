import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * THE FENCES AROUND THE DIRECTOR, ASSERTED ON THE SOURCE.
 *
 * `context.contract.test.ts`'s idiom, and it exists for the one thing unit tests cannot
 * reach here: **`direct/prompt.ts` imports `@/lib/db/client`, which throws under Vitest**
 * (`## The data layer`'s rule — a script or a test that imports the singleton dies on
 * `Missing required environment variable: DATABASE_URL`). F1 hit the same wall with
 * `run.ts` and answered it with a pure `machine.ts`; F2's answer is the same shape — every
 * decision lives in `validate.ts`, `fallback.ts`, `window.ts` and `assemble.ts`, all pure —
 * and this file is what watches the one module those tests cannot import.
 */
const DIR = join(process.cwd(), 'src/lib/chat/direct');
const read = (file: string) => readFileSync(join(DIR, file), 'utf8');
const MODULES = readdirSync(DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

describe('the director carries the prompt, so the prompt is fenced', () => {
  it('marks every module that holds prose or reaches the database', () => {
    for (const file of ['prompt.ts', 'assemble.ts', 'system.ts', 'system.id.ts', 'system.en.ts']) {
      expect({ file, fenced: read(file).includes("import 'server-only'") }).toEqual({
        file,
        fenced: true,
      });
    }
  });

  /**
   * The five pure ones stay unmarked, and that is the property `npm test` rests on: every
   * refusal, every repair, every bucket and every fallback arm is reachable with no
   * database and no network. `audit-secrets.ts` fences `lib/chat/` wholesale from client
   * components, so nothing is lost by leaving these unmarked.
   */
  it('leaves the five pure modules unmarked', () => {
    for (const file of ['caps.ts', 'affinity.ts', 'window.ts', 'validate.ts', 'fallback.ts']) {
      expect({ file, fenced: read(file).includes("import 'server-only'") }).toEqual({
        file,
        fenced: false,
      });
    }
  });
});

/**
 * `[F2-1]` **THE DIRECTOR SEES THE ROOM AND NOTHING ABOUT THE PERSON**, enforced by
 * construction rather than by prose.
 *
 * `C-D8` amends `A5` for the chat surface with five conditions, and condition 1 says the
 * decryption happens **in exactly one new place**. A director that also read the six
 * answers would make that sentence false on the day it shipped: two prompts carrying the
 * most sensitive strings in the product instead of one, each a place a prompt-injection
 * attempt lands, and the second one buying nothing — the director's job is *who speaks*.
 */
describe('the director reads none of the querent', () => {
  it('never names a decrypt, an answer read, or the Lotus', () => {
    for (const file of MODULES) {
      const code = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      for (const needle of [
        'getAnswers',
        'decryptField',
        'queries/onboarding',
        'readLotusBlock',
        'generatePersona',
        'onboardingAnswers',
      ]) {
        expect({ file, needle, found: code.includes(needle) }).toEqual({
          file,
          needle,
          found: false,
        });
      }
    }
  });

  it('asks the assembler for the narrow profile and never for a voice', () => {
    const prompt = read('prompt.ts');
    expect(prompt).toContain("profile: 'director'");
    expect(prompt).not.toContain("profile: 'voice'");
  });

  /**
   * The four fences the voice prompt writes are the four blocks the director must not have.
   * A tag appearing in this tree would mean somebody had started rendering the person into
   * the routing decision — which is the diff this assertion makes visible.
   */
  it('writes none of the four blocks about the person', () => {
    for (const file of MODULES) {
      const code = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const fence of ['<penanya>', '<jawaban', '<riwayat>', '<sosok>', '<lampiran>']) {
        expect({ file, fence, found: code.includes(fence) }).toEqual({ file, fence, found: false });
      }
    }
  });
});

/**
 * The seam F1 fixed by string (`[R13]`): `direct/plan.ts` is F1's call site and
 * `callClass.test.ts` and `flagCoverage.test.ts` both name it. F2 supplies the three
 * exports it calls, and **an added or renamed export there is a build break in F1's file**,
 * which is a worse discovery than a red test here.
 */
describe('the seam with F1', () => {
  it('exports exactly the three names `plan.ts` imports', () => {
    const prompt = read('prompt.ts');
    for (const name of [
      'export async function buildPlanPrompt',
      'export function validatePlan',
      'export function planFallback',
    ]) {
      expect({ name, found: prompt.includes(name) }).toEqual({ name, found: true });
    }
  });

  it('does not edit F1s call site, which owns the op, the tier and the flag', () => {
    const plan = read('plan.ts');
    expect(plan).toContain("op: 'chat_plan'");
    expect(plan).toContain("callClass: 'deferred'");
    expect(plan).toContain('if (!chatEnabled())');
  });
});
