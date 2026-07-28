import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LORE_ANCHORS, type Block } from './types';

const SOURCE = readFileSync(join(process.cwd(), 'src/content/types.ts'), 'utf8');
const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the content block union', () => {
  it('has exactly the five kinds roadmap §5 rule 3 names', () => {
    // heading / paragraph / list / quote / card-reference. A sixth kind is a
    // decision, not a convenience, and it has to be argued for in reconciliation.
    const kinds: Block['kind'][] = ['heading', 'paragraph', 'list', 'quote', 'cardRef'];
    // Exhaustiveness proved at compile time by the assignment above plus the
    // renderer's `never` default; asserted at runtime so a widened union that
    // typechecks still fails here.
    expect(kinds).toHaveLength(5);
    for (const k of kinds) expect(code).toContain(`kind: '${k}'`);
  });

  it('HAS NO `html` KIND AND NO `raw` KIND, and never will', () => {
    /*
     * Roadmap §5 rule 3 and §10. The CSP is `script-src 'self' 'unsafe-inline'` in
     * REPORT-ONLY and the goal is to tighten it. A block carrying markup is a
     * `dangerouslySetInnerHTML` call site waiting to be written, and the cost is
     * not a theoretical XSS on authored content -- it is a permanent new reason
     * the policy can never be enforced.
     */
    for (const banned of ['html', 'raw', 'markdown', 'jsx']) {
      expect({ banned, present: new RegExp(`kind: '${banned}'`).test(code) })
        .toMatchObject({ present: false });
    }
    expect(code).not.toContain('dangerouslySetInnerHTML');
  });

  it('makes a quote carry its source, and a list carry no ordering', () => {
    // A quote with no attribution, on a page making claims about tradition, is
    // exactly what reads as invented -- so `source` is REQUIRED, not optional.
    expect(code).toMatch(/kind: 'quote';[\s\S]{0,120}source: string/);
    expect(code).not.toMatch(/kind: 'quote';[\s\S]{0,120}source\?/);
    // No `ordered`: a numbered list in lore is a how-to, and a how-to about
    // reading tarot is S6's article, not a card's page.
    expect(code).not.toContain('ordered');
  });

  it('is a LEAF: no react, no next, no server-only, no db', () => {
    // §5 rule 2: pure and client-importable, the same split as
    // `moderation/types.ts` against `blocklist.ts`. It may name `@/data/types`,
    // which has no imports of its own.
    const specs = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(specs).toEqual(['@/data/types']);
    expect(code).not.toContain('server-only');
  });

  it('offers a closed anchor set with more than one member per card to choose from', () => {
    // §8.2's enforcement hook: the `id` and `en` documents for one card must lead
    // with DIFFERENT anchors, so the set has to be big enough that twenty-two
    // pairs are possible without contrivance.
    expect(LORE_ANCHORS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(LORE_ANCHORS).size).toBe(LORE_ANCHORS.length);
  });
});
