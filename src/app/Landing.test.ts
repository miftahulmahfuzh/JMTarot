import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import id from '@/lib/i18n/locales/id';

const SOURCE = readFileSync(join(process.cwd(), 'src/app/Landing.tsx'), 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('the landing page', () => {
  it('reads the file, so nothing below passes vacuously', () => {
    expect(CODE).toContain('export async function Landing');
    expect(CODE.length).toBeGreaterThan(800);
  });

  it('is a SERVER component that ships no auth, no DB and no model', () => {
    /*
     * Roadmap §10: no database read on any public page, and a public page must not
     * be able to 500 on a database outage BECAUSE THERE IS NO DATABASE ON ITS PATH
     * AT ALL. `currentUser()` is the dispatcher's, in `page.tsx` -- this component
     * is reached only when there is no session, so reading one again would be a
     * second decode that could disagree with the first.
     */
    expect(CODE).not.toMatch(/^\s*(['"])use client\1/m);
    expect(CODE).not.toContain('currentUser');
    expect(CODE).not.toContain('@/lib/db');
    expect(CODE).not.toContain('@/lib/llm');
    expect(CODE).not.toContain('@/lib/prompt');
    expect(CODE).not.toContain('@/lib/translate');
    expect(CODE).not.toContain('@/components/AccountButton');
  });

  it('links to exactly the route table spellings (§3.1)', () => {
    /*
     * THESE THREE PAGES DO NOT EXIST UNTIL S3, S4 AND S6 LAND. That is fine on
     * `main` and NOT fine in production: a homepage linking to three 404s is worse
     * than no homepage. The release ships as one -- see the plan's §0.
     *
     * `/arcana/the-moon` and not `/arcana`: §3.1 makes the bare path a deliberate
     * 404, and S-D4 fixes the slug as the hyphenated English name.
     */
    expect(CODE).toContain('href="/gallery"');
    expect(CODE).toContain('href="/arcana/the-moon"');
    expect(CODE).toContain('href="/blog"');
    // And never a locale-prefixed one: S1 owns no `/en/` link (that is S2's).
    expect(CODE).not.toContain('/en/');
  });

  it('mounts the shared SignInForm rather than linking to /login', () => {
    /*
     * ── THIS ASSERTION WAS THE OPPOSITE UNTIL 2026-07-30, AND THE REASON IT GAVE
     *    WAS ALREADY VOID ───────────────────────────────────────────────────────
     *
     * It required `href="/login"` and forbade a `signIn()` action here, because
     * *"a `signIn()` server action would put @auth/core's provider machinery --
     * and therefore bcryptjs -- into the homepage's module graph."*
     *
     * **That machinery is in this route's graph either way.** `page.tsx` imports
     * `currentUser` from `@/lib/auth/server`, which imports `./auth`, which
     * statically imports `Credentials` and `verifyCredentials`; `users.ts`'s own
     * header says it *"ships in the Node lambda whether or not the flag is on."*
     * So the old fence was protecting a property the route did not have, and a
     * `SignInForm` import would have slipped past its regex without argument.
     * Restated rather than deleted, because the cost it was worried about — the
     * landing page acquiring auth concerns — is still worth fencing.
     *
     * The link is gone because it cost a returning querent a second tap.
     */
    expect(CODE).toContain('<SignInForm');
    expect(CODE).toContain("from '@/components/SignInForm'");
    expect(CODE).not.toContain('href="/login"');
  });

  it('still reaches auth only THROUGH SignInForm, never directly', () => {
    // The narrowed fence. `signIn` and the provider config belong to one component
    // on two surfaces; a second copy here is how the consent line gets forgotten.
    expect(CODE).not.toContain("from '@/lib/auth/auth'");
    expect(CODE).not.toContain("signIn('google'");
    expect(CODE).not.toContain('login.legal');
  });

  it('uses only keys that exist in the source catalog', () => {
    const used = [...CODE.matchAll(/t\('([a-z][a-zA-Z0-9_.]+)'/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(10);
    for (const key of used) expect(Object.keys(id), key).toContain(key);
  });

  it('has exactly one <h1>', () => {
    // One page, one H1. Two is the commonest on-page SEO defect and it is
    // invisible in a browser.
    expect([...CODE.matchAll(/<h1[\s>]/g)]).toHaveLength(1);
  });

  it('uses the versioned art helper, not a hand-written /cards path', () => {
    // `cardImage()` appends `?v=3`, which is the whole cache story for art served
    // with `max-age=31536000, immutable` on non-content-hashed filenames.
    expect(CODE).toContain('cardImage');
    expect(CODE).not.toMatch(/["']\/cards\//);
  });

  it('emits the bare language tag in JSON-LD, never intlTag() (R15)', () => {
    // `intlTag('en')` is `en-GB`. `inLanguage` is a factual claim, nothing here is
    // British English, and `id-ID` here beside `id` on S3's ImageObjects in the
    // same @graph is the inconsistency R15 exists to prevent.
    expect(CODE).toContain('inLanguage: locale');
    expect(CODE).not.toContain('intlTag');
  });

  it('introduces no new design token', () => {
    const tokens = readFileSync(join(process.cwd(), 'src/theme/tokens.css'), 'utf8');
    const css = readFileSync(join(process.cwd(), 'src/app/Landing.module.css'), 'utf8');
    const vars = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);
    expect(vars.length).toBeGreaterThan(5);
    for (const v of vars) expect(tokens, v).toContain(v);
  });

  it('bounds the hero image, which is declared at 800px wide', () => {
    /*
     * THE ONE THING ON THIS PAGE THAT OVERFLOWS A PHONE IF FORGOTTEN.
     * `width={800}` is the intrinsic size; without `max-width: 100%` the card is
     * 800 CSS pixels on a 320px screen and the whole document scrolls sideways.
     * `tools/seo/fit.sh` measures it at 320/360/390 and this fails in a second.
     */
    const css = readFileSync(join(process.cwd(), 'src/app/Landing.module.css'), 'utf8');
    expect(css).toMatch(/\.hero img\s*\{[^}]*max-width:\s*100%/);
  });
});
