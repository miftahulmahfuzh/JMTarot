/**
 * The public page, checked at the source level.
 *
 * **THE PAGE ITSELF IS NOT RENDERED HERE.** It is a server component that reaches
 * `next/headers`, the `server-only` database singleton and V9's limiter — none of
 * which belongs in Vitest — and the one failure that matters most (a client
 * component reaching for a session context) is invisible to any renderer that is
 * not a browser. `public/cards/_shareshot.html` is that check.
 *
 * What CAN be checked is the set of properties that are one deleted line away from
 * a real hole on the only URL in this project a stranger can open. Every assertion
 * below corresponds to a paragraph in the page's own header or in Miftah's
 * security amendment.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(process.cwd(), 'src', 'app', 's', '[slug]');
const read = (f: string) => readFileSync(join(DIR, f), 'utf8');

const PAGE = read('page.tsx');
const NOT_FOUND = read('not-found.tsx');
const VIEWED = read('ShareViewed.tsx');

/**
 * Comments stripped, FOR THE NEGATIVE ASSERTIONS ONLY. The page's header says at
 * length that `currentUser()` must never be called here, so a
 * `not.toContain('currentUser')` against the raw source fails on the sentence
 * forbidding it. `queries/contract.test.ts` records the lesson: a rule that fires
 * on prose describing the rule is a rule people delete.
 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const CODE = strip(PAGE);
const NOT_FOUND_CODE = strip(NOT_FOUND);

describe('the public share page', () => {
  it('reads the files at all, so nothing below passes vacuously', () => {
    expect(PAGE).toContain('export default async function SharePage');
    expect(PAGE.length).toBeGreaterThan(2000);
    expect(CODE).toContain('resolveShare');
    expect(CODE.length).toBeGreaterThan(1000);
    expect(NOT_FOUND).toContain('export default async function ShareNotFound');
  });

  it('NEVER touches the session', () => {
    /*
     * Fence 1 and 2 of the three that stop existing at this path. A page whose
     * output varies by session is a page whose cache key varies by session, and an
     * owner-only affordance here is a second renderer for VD10 to keep in step.
     *
     * `cookies()` is on the list because reading the session cookie by hand is the
     * way this rule gets broken without the word `currentUser` appearing.
     */
    for (const code of [CODE, NOT_FOUND_CODE, strip(VIEWED)]) {
      expect(code).not.toContain('currentUser');
      expect(code).not.toContain('requireUser');
      expect(code).not.toContain('ViewerProvider');
      expect(code).not.toContain('useViewer');
      expect(code).not.toContain('cookies()');
      expect(code).not.toContain("from '@/lib/auth/");
    }
  });

  it('NEVER generates anything', () => {
    /*
     * This route is reachable by anyone holding a slug, and a public route that
     * can spend a model call is a provider quota with no gate in front of it --
     * which since V9 is the app's primary abuse control, not a cost question.
     */
    expect(CODE).not.toContain('/api/translate');
    expect(CODE).not.toContain('translateOrCached');
    expect(CODE).not.toContain('translateStream');
    expect(CODE).not.toContain('getTranslation');
    expect(CODE).not.toContain("from '@/lib/llm");
    expect(CODE).not.toContain("from '@/lib/prompt");
  });

  it('checks BOTH limiters, AWAITED, before it reaches the database', () => {
    /*
     * The ORDER is the defence: a request that is over budget must cost one
     * lookup rather than a query, on the only unauthenticated read path in the
     * app. And both are async since V9 -- a forgotten `await` evaluates a Promise
     * as truthy, i.e. never refuses.
     */
    const limitAt = CODE.indexOf('Promise.all');
    const resolveAt = CODE.indexOf('await resolveShare');
    expect(limitAt).toBeGreaterThan(0);
    expect(resolveAt).toBeGreaterThan(limitAt);

    expect(CODE).toMatch(/hit\(`share:view:\$\{clientIp\(h\)\}`/);
    expect(CODE).toMatch(/consume\('share:view:_global'/);
    expect(CODE).toContain('if (!perIp.ok || !perFleet.ok)');
  });

  it('does NOT spend the reading path\'s global budget', () => {
    // `hitGlobal()`'s budget is the reading path's. A share link going viral must
    // not stop the actual product from working.
    expect(CODE).not.toContain('hitGlobal');
  });

  it('reads the fleet ceiling from V9 rather than declaring its own', () => {
    // V7's plan sized 3000 PER INSTANCE; fleet-wide that would 429 a genuinely
    // popular link, which reads to a stranger as a broken link. V9 owns the number.
    expect(CODE).toContain('SHARE_VIEW_GLOBAL_MAX');
    expect(CODE).not.toMatch(/\b3000\b/);
  });

  it('answers 429 as a page and 404 for everything else', () => {
    // A 404 on exhaustion would tell a person their friend's link is broken,
    // which is untrue and which they cannot act on.
    expect(CODE).toContain('<ShareBusy />');
    expect(CODE).toContain('if (!resolved) notFound()');
  });

  it('is never cached', () => {
    // A cached render is a revoked link that keeps working for as long as the
    // cache lives, and revocation is the highest-consequence control here.
    expect(CODE).toContain("export const dynamic = 'force-dynamic'");
    expect(CODE).toContain("export const runtime = 'nodejs'");
  });

  it('asks for noindex in the metadata as well as in the header', () => {
    expect(CODE).toContain('index: false');
    expect(CODE).toContain('noarchive: true');
  });

  it('renders the body inside <div lang> and passes prose through the adapter', () => {
    /*
     * `lang` is what makes a screen reader pronounce Indonesian prose as
     * Indonesian inside an English document. And `adaptSharedReading` is the only
     * thing that supplies `prose` -- without it, `ReadingView`'s rule 4 leaves a
     * stranger on a pulsing spinner forever, because nothing here can translate.
     */
    expect(CODE).toContain('adaptSharedReading');
    expect(CODE).not.toMatch(/prose=\{\{/); // built by the adapter, never inline
  });

  it('tags `lang` with the RENDERED locale, never the source', () => {
    /*
     * **DESIGN A's ONE ACCESSIBILITY TRAP.** A pinned translation makes the source
     * locale and the locale on screen differ exactly when the feature is working,
     * so `lang={reading.locale}` -- correct for two workstreams -- now tells a
     * screen reader to pronounce English prose as Indonesian.
     *
     * Asserted as an ABSENCE as well as a presence, because the failure is a line
     * that still reads perfectly and was simply never updated.
     */
    expect(CODE).toContain('renderedLocale');
    expect(CODE).not.toContain('lang={reading.locale}');
    expect(CODE).toMatch(/lang=\{shownLocale\}/);
  });

  it('drives the other-language notice off the translation, not the source', () => {
    /*
     * `isForeignProse` takes the translation as a REQUIRED third argument
     * precisely so this cannot regress silently -- but the page could still pass
     * `null` and look correct, so the wiring is asserted here too. Getting it
     * wrong shows a stranger "this is in another language" over prose in their own.
     */
    expect(CODE).toMatch(/isForeignProse\(reading, viewer, translation\)/);
  });

  it('takes the pinned translation from the resolver and never fetches one', () => {
    /*
     * The page reads `resolved.translation` and does not name the query. The read
     * belongs to `resolveShare`, which is what lets it share the reading's
     * `Promise.all` -- and it keeps the `getTranslation` absence asserted above
     * true of this file, so "the page generates nothing" stays checkable by
     * grepping one file.
     */
    expect(CODE).toMatch(/translation\b/);
    expect(CODE).not.toContain('getTranslation');
    expect(CODE).not.toContain("from '@/lib/db");
  });

  it('counts the view in after(), never on the render path', () => {
    const bumpAt = CODE.indexOf('bumpShareViewCount');
    const afterAt = CODE.indexOf('after(async');
    expect(afterAt).toBeGreaterThan(0);
    expect(bumpAt).toBeGreaterThan(afterAt);
    // And the failure is swallowed with the error's CLASS only, never the object.
    expect(CODE).toContain("name: (err as Error)?.name");
  });

  it('fires share.viewed with the id and never the slug', () => {
    const viewed = strip(VIEWED);
    expect(viewed).toContain("track('share.viewed'");
    expect(viewed).toContain('share_id: shareId');
    // A boolean about the question, never the text.
    expect(viewed).toContain('has_question: hasQuestion');

    /*
     * NARROWED TO THE `track()` ARGUMENT, and the narrowing is the point: the file
     * legitimately IMPORTS `@/lib/share/slug` for the `ShareEntity` type, so a
     * whole-file `not.toMatch(/slug/)` fails on the import path -- which is how a
     * first draft of this assertion failed against correct code. The rule is about
     * what reaches `events.props`, not about what the module names.
     */
    const props = viewed.match(/track\('share\.viewed',\s*\{([\s\S]*?)\n\s*\}\)/);
    expect(props).not.toBeNull();
    expect(props![1]).not.toMatch(/\bslug\b/);
    expect(props![1]).not.toMatch(/session/i);
  });

  it('keeps the question, the prose and the nickname OUT of the OG image (VD18)', () => {
    /*
     * **THIS IS THE ONE ASSERTION THE 2026-07-28 RULING MADE MORE IMPORTANT, NOT
     * LESS.** The question is now always on the PAGE, and `resolveShare` therefore
     * hands this route a `reading.question` it did not used to get -- so the only
     * thing keeping it out of a preview image is that nothing here reads it.
     *
     * The distinction is not fussiness: a page is opened by somebody who chose to,
     * and a preview image is cached by every messenger that merely SEES the link,
     * before anybody clicks. VD18 is about the second.
     */
    const og = strip(readFileSync(join(DIR, 'opengraph-image.tsx'), 'utf8'));
    expect(og).toContain('resolveShare'); // not vacuous: it does resolve the link
    expect(og).not.toMatch(/\bquestion\b/);
    expect(og).not.toMatch(/\.body\b/);
    expect(og).not.toMatch(/\bnickname\b/);
  });

  it('says nothing about WHY a link did not resolve', () => {
    /*
     * Five failures, one page. A distinguishable answer turns a revoked link into
     * an existence oracle for its author.
     */
    expect(NOT_FOUND_CODE).toContain("t('share.gone.title')");
    expect(NOT_FOUND_CODE).not.toMatch(/revoked|expired|deleted/i);
    // No analytics either: a 404 here has no share_links.id to attach.
    expect(NOT_FOUND_CODE).not.toContain('track(');
  });

  it('leaves the public tree with an <a>, not a next/link', () => {
    /*
     * A `Link` does a client-side RSC navigation out of a public tree into a
     * gated one, carrying this page's router cache with it. Both exits -- the CTA
     * and the gone page -- are document loads on purpose.
     */
    expect(NOT_FOUND_CODE).toContain('href="/"');
    expect(NOT_FOUND_CODE).not.toContain("from 'next/link'");
  });
});
