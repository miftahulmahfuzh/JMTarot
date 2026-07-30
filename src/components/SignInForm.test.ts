import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import id from '@/lib/i18n/locales/id';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const SOURCE = read('src/components/SignInForm.tsx');
const CODE = strip(SOURCE);

/**
 * The one sign-in control, on two surfaces (2026-07-30).
 *
 * It exists because the landing page's CTA was a LINK to `/login`, so a returning
 * querent whose session had lapsed paid two taps to get back in. The button now
 * lives on both screens, and the thing that must not be duplicated with it is the
 * consent line.
 */
describe('SignInForm', () => {
  it('reads the file, so nothing below passes vacuously', () => {
    expect(CODE).toContain('export');
    expect(CODE).toContain('SignInForm');
    expect(CODE.length).toBeGreaterThan(400);
  });

  it('is a SERVER component, so the button works before hydration', () => {
    /*
     * `/login` set this precedent and gave the reason: the screen that gates
     * everything else should not need JavaScript to be usable. The landing page
     * inherits it, and since the analytics event fires inside the server action
     * there is nothing left that needs a client.
     */
    expect(CODE).not.toMatch(/^\s*(['"])use client\1/m);
  });

  it('submits to a real server action that calls signIn with Google', () => {
    expect(CODE).toContain("'use server'");
    expect(CODE).toContain("signIn('google'");
  });

  it('OWNS the consent line, because that is where agreement is collected', () => {
    /*
     * THE ASSERTION THIS COMPONENT EXISTS FOR. Moving the button to the landing
     * page without this sentence would collect agreement to the Terms nowhere at
     * all, and it is the kind of omission that is invisible in a screenshot.
     */
    expect(CODE).toContain('login.legal.lead');
    expect(CODE).toContain('common.terms');
    expect(CODE).toContain('common.privacy');
    expect(CODE).toContain('href="/terms"');
    expect(CODE).toContain('href="/privacy"');
  });

  it('takes redirectTo as a prop rather than deciding for itself', () => {
    // The ONLY difference between the two surfaces. `/login` passes its validated
    // `callbackUrl`; the landing page passes `/`. A component that hardcoded one
    // would silently discard the other's.
    expect(CODE).toContain('redirectTo');
  });

  it('uses only keys that exist in the source catalog', () => {
    const used = [...CODE.matchAll(/t\('([a-z][a-zA-Z0-9_.]+)'/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(2);
    for (const key of used) expect(Object.keys(id), key).toContain(key);
  });
});

describe('the consent line has exactly one owner', () => {
  /*
   * **A GREP RATHER THAN A PROMISE.** Two surfaces render this form, and the
   * failure mode of "the button moved" is a second copy of the legal sentence that
   * drifts from the first -- one of them naming a document the other does not, in
   * the one piece of copy on the screen that has legal weight.
   */
  const OWNERS = ['src/components/SignInForm.tsx', 'src/app/login/page.tsx', 'src/app/Landing.tsx'];

  it('is written in SignInForm and in no other rendering surface', () => {
    const carriers = OWNERS.filter((p) => strip(read(p)).includes('login.legal.lead'));
    expect(carriers).toEqual(['src/components/SignInForm.tsx']);
  });

  it('leaves no second copy of the Google button either', () => {
    const carriers = OWNERS.filter((p) => strip(read(p)).includes("signIn('google'"));
    expect(carriers).toEqual(['src/components/SignInForm.tsx']);
  });
});
