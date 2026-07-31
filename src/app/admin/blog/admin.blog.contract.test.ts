import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The fences over A6's admin subtree. **v0.5.0 / A6, task 23.**
 *
 * `adminSurface.test.ts` and `adminCopy.test.ts` already bind every file here — the gate
 * per file, `runtime` and a literal `maxDuration`, no `<main>`, no `robots`, no
 * `usePathname`, no `t()`. **This file adds only what is A6's**, and each of these is a
 * rule that fires in a way nothing else would notice.
 *
 * Every ABSENCE assertion reads the file with its **comments stripped**, this project's
 * own rule paid for three times: `queries/contract.test.ts` grepped for
 * `from '../client'` and failed against the sentence *"Never import from '../client'"*
 * in a doc comment; `adminSurface.test.ts` strips for the same reason; and A6's own
 * `blog.contract.test.ts` had to start stripping when `load.ts`'s header mentioned
 * `generateMetadata`. **A rule that fires on the prose describing the rule is a rule
 * people delete**, and every file here documents what it forbids.
 */

const FILES = globSync('src/app/admin/blog/**/*.{ts,tsx}').filter((f) => !f.includes('.test.'));

function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const importsOf = (source: string): string[] =>
  [...source.matchAll(/^\s*import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)].map((m) => m[1]);

describe('the fences are not vacuous', () => {
  it('finds the whole subtree', () => {
    // A glob that matches nothing is a test that always passes.
    expect(FILES.length).toBeGreaterThanOrEqual(7);
    expect(FILES.map((f) => f.replaceAll('\\', '/')).sort()).toEqual([
      'src/app/admin/blog/MarkdownEditor.tsx',
      'src/app/admin/blog/StatusControl.tsx',
      'src/app/admin/blog/[slug]/page.tsx',
      'src/app/admin/blog/actions.ts',
      'src/app/admin/blog/copy.ts',
      'src/app/admin/blog/new/page.tsx',
      'src/app/admin/blog/page.tsx',
    ]);
  });
});

describe('A6-3 -- the editor never imports the committed registry', () => {
  it('imports no `@/content/blog` module', () => {
    /*
     * **THE REGISTRY DIES IN TASK 26 AND THIS SUBTREE MUST NOT BE WHY IT CANNOT.** A CMS
     * that reads the files it exists to replace is a CMS that keeps them alive; the
     * deletion commit would then be a refactor rather than a deletion, and what gets
     * deleted under that pressure is the test.
     *
     * `@/content/types` is permitted and is the only thing from `src/content/**` that is
     * — the same split `clientBoundary.test.ts` names: **the SHAPE crosses the boundary,
     * the CONTENT does not.**
     */
    for (const f of FILES) {
      const offending = importsOf(code(f)).filter(
        (spec) => spec.startsWith('@/content/') && spec !== '@/content/types',
      );
      expect({ [f]: offending }).toEqual({ [f]: [] });
    }
  });
});

describe('A6-25 -- the write path is the ONLY thing that writes', () => {
  it('reaches the database through the admin query module or `blogSave`, and nothing else', () => {
    /*
     * A page here may read `queries/admin/blog` (every status) and `queries/blog`
     * (`publishedSlugs`, for the resolution half of `bare-path`). **What it must not do
     * is reach `@/lib/db/schema` and write a row of its own**: `upsertDocument` and
     * `setStatus` are where `updatedAt` is set by hand, and a second writer is how
     * `dateModified` freezes on one path and not the other.
     */
    const PERMITTED = [
      '@/lib/db/client',
      '@/lib/db/queries/admin/blog',
      '@/lib/db/queries/blog',
    ];
    for (const f of FILES) {
      const offending = importsOf(code(f)).filter(
        (spec) => spec.startsWith('@/lib/db') && !PERMITTED.includes(spec),
      );
      expect({ [f]: offending }).toEqual({ [f]: [] });
    }
    // Not vacuous: the permitted ones are actually used.
    expect(importsOf(code('src/app/admin/blog/page.tsx'))).toContain(
      '@/lib/db/queries/admin/blog',
    );
  });

  it('never spells an INSERT or an UPDATE itself', () => {
    for (const f of FILES) {
      expect(code(f), f).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    }
  });
});

describe('A6-21 -- there is no delete, and no path back to draft', () => {
  it('offers no delete control anywhere in the subtree', () => {
    /*
     * `unpublished` is the removal path. **A hard delete of an article whose URL was
     * public leaves no record of what was there**, and `draft` -- the other way to hide
     * it -- means NEVER PUBLIC, so an admin who could set it has laundered a public URL
     * into a private one with nothing recording the change.
     *
     * The state machine refuses both; this asserts the UI does not offer them either,
     * because a control that always errors is a control somebody makes work.
     *
     * **IT GREPS FOR AN IDENTIFIER, NOT FOR THE WORD, AND THE FIRST DRAFT DID THE
     * OPPOSITE.** `/\bhapus\b/i` fired on `copy.ts`'s own `noDelete` line -- *"Tidak ada
     * tombol hapus…"* -- which is the sentence that EXISTS BECAUSE OF THIS RULE. Comment
     * stripping does not help: it is a string literal, not a comment. This file's header
     * names the trap and then walked into it, which is worth leaving on the record: **a
     * fence over prose fires on the prose that explains the fence**, and the fix is to
     * fence the mechanism instead. The copy is asserted PRESENT in the next case.
     */
    for (const f of FILES) {
      const src = code(f);
      expect(src, f).not.toMatch(/\bdeleteArticle\b|\bremoveArticle\b|\bdeletePost\b/);
      expect(src, f).not.toMatch(/value="draft"|to:\s*'draft'|'Jadikan draf'/);
      // No form or handler whose target status is `draft` -- the launder path.
      expect(src, f).not.toMatch(/to=\{?['"]draft/);
    }
  });

  it('says on screen WHY there is no delete', () => {
    // An operator looking for the button should find the argument, not conclude the
    // feature is missing. It is one line of copy and it is the difference.
    expect(readFileSync('src/app/admin/blog/copy.ts', 'utf8')).toContain('noDelete');
    expect(code('src/app/admin/blog/page.tsx')).toContain('BLOG.noDelete');
  });
});

describe('the `Publik` chip links to the article, and only that chip does', () => {
  /*
   * The list said an article was public and gave no way to read it. The fix is one anchor;
   * these are the three ways it could ship wrong, and none of them would look wrong.
   */

  it('builds the href through `blogPostPath`, never by hand', () => {
    /*
     * `blog.contract.test.ts`'s rule over the public tree, applied here: **every internal
     * href goes through `localePath()`.** A `locale === 'en' ? '/en/blog/…' : '/blog/…'` in
     * this subtree is a second definition of the prefix maths in the tree least likely to
     * be revisited when a third locale lands — and A-D12's grep (`adminCopy.test.ts`)
     * forbids importing `@/lib/i18n/prefix` here, so the seam is S6's builder.
     */
    const page = code('src/app/admin/blog/page.tsx');
    expect(importsOf(page)).toContain('@/lib/seo/blog');
    expect(page).toContain('blogPostPath(');
    for (const f of FILES) {
      // No hand-rolled prefix, in either direction, anywhere in the subtree.
      expect(code(f), f).not.toMatch(/['"`]\/en\/blog/);
    }
  });

  it('decides on the SERVER whether there is a public address', () => {
    /*
     * `GalleryTile`'s rule: a client component would have to know the locale prefix maths.
     * `publicHref` is `null` for `draft` and `unpublished` — a link to a 404 rendered AS
     * the status would say the opposite of what the chip says — and the page is what
     * computes it, so the decision sits with the render that knows the row.
     */
    expect(code('src/app/admin/blog/page.tsx')).toMatch(/publicHref=\{/);
    const control = code('src/app/admin/blog/StatusControl.tsx');
    expect(control).toMatch(/publicHref: string \| null/);
    // The client component only ever renders it. It must not derive one.
    expect(control).not.toContain('blogPostPath');
    expect(control).not.toMatch(/['"`]\/blog\//);
  });

  it('opens a new tab, says so, and is 44px of target', () => {
    /*
     * The accessible name is `Publik` alone without the label — a link named after a state.
     * And the chip is a 20px pill: fine for a label, under the one number iOS enforces for
     * a target, which every other control in `/admin` carries.
     */
    const control = code('src/app/admin/blog/StatusControl.tsx');
    expect(control).toContain('target="_blank"');
    expect(control).toContain('rel="noreferrer"');
    expect(control).toContain('BLOG.openPublic');
    expect(readFileSync('src/app/admin/blog/copy.ts', 'utf8')).toMatch(/openPublic: '[^']*tab baru/);
    const css = readFileSync('src/app/admin/blog/blog.module.css', 'utf8');
    expect(css).toMatch(/\.chipLink \{[^}]*min-height: 44px/);
  });
});

describe('A6-31 IS RETIRED, AND THE RULE IT PROTECTED IS NOT', () => {
  /*
   * **THE SPAN STRIP AND THE GLUED-PAIR OUTLINE ARE GONE WITH `BlockEditor.tsx`**, and this
   * block is what stops that reading as the rule being dropped.
   *
   * A6-31 existed because an HTML form field shows a trailing space no more than it trims
   * one, so `para(s('Lihat '), link('/gallery', 'galeri'))` rendered `Lihatgaleri` with
   * nothing on screen saying so — the block union's form of the JSX-whitespace bug that
   * shipped three times in one afternoon as `www.jmtarot.siteand add to your phone`.
   *
   * **IN MARKDOWN THE SPACE IS IN THE TEXT**, in the position a diff would show it:
   * `Lihat [galeri](/gallery)`. So the compensation is not needed, and it is not needed for
   * a reason rather than by assumption — `markdown.test.ts` asserts over the four REAL
   * documents that a parse never emits an adjacent pair `spansSeparate` would object to.
   */
  it('no longer reimplements the strip, because there is nothing to compensate for', () => {
    const editor = code('src/app/admin/blog/MarkdownEditor.tsx');
    expect(editor).not.toContain('visibleBoundaries');
    expect(editor).not.toContain('spansSeparate');
    // And no local re-derivation of the boundary character sets, which is the drift the
    // original rule was really about.
    expect(editor).not.toMatch(/const (OPENING|CLOSING)\s*=/);
  });

  it('keeps the predicate and the save-time refusal alive elsewhere', () => {
    // Not vacuous: if `spansSeparate` were deleted too, the assertions above would pass
    // while the lint rule they stand in for had quietly gone.
    expect(readFileSync('src/lib/content/lint.ts', 'utf8')).toContain('export function spansSeparate');
    expect(readFileSync('src/lib/content/markdown.test.ts', 'utf8')).toContain('spansSeparate');
  });
});

describe('A-D14 -- five kinds, and nothing on this surface can author a sixth', () => {
  it('leaves the block vocabulary to the parser, and names no refused kind', () => {
    /*
     * **THE EDITOR USED TO CARRY `KINDS` AND `SPAN_KINDS` AS LITERALS AND NO LONGER DOES**,
     * because it has no per-kind controls: `parseMarkdown` is the only thing that decides
     * what a block is, and `blockSchema.ts` still refuses a sixth on save. So the assertion
     * moves rather than disappearing — a literal list in a client component that no longer
     * builds blocks would be a list nobody maintains.
     */
    const parser = code('src/lib/content/markdown.ts');
    for (const kind of ['heading', 'paragraph', 'list', 'quote', 'cardRef']) {
      expect(parser, kind).toContain(`'${kind}'`);
    }
    for (const refused of ['callout', 'html', 'raw']) {
      expect(parser, refused).not.toContain(`kind: '${refused}'`);
    }
    for (const f of FILES) {
      for (const kind of ['callout', 'html', 'raw']) {
        expect(code(f), `${f}:${kind}`).not.toContain(`kind: '${kind}'`);
      }
    }
  });

  it('stores no markdown, which is what keeps A-D10 intact', () => {
    /*
     * **THERE IS NO `markdown` BLOCK KIND AND THE COLUMN IS STILL `Block[]`.** The word
     * appears all over this surface now, so the fence has to be about the SHAPE rather than
     * about the string: markdown is a projection built by `serializeMarkdown` on every page
     * load, never a stored representation.
     */
    expect(code('src/lib/content/blockSchema.ts')).not.toContain("literal('markdown')");
    expect(code('src/lib/content/markdown.ts')).not.toContain("kind: 'markdown'");
    expect(code('src/app/admin/blog/MarkdownEditor.tsx')).toContain('serializeMarkdown(');
  });

  it('has no contenteditable, no rich text and no innerHTML', () => {
    // A-D10's CSP argument: a markup-carrying path is *"a permanent new reason the policy
    // can never be enforced"*, and an admin page is not an exception to it. A `<textarea>`
    // is the opposite of a rich-text field — it carries a string and renders nothing.
    for (const f of FILES) {
      expect(code(f), f).not.toMatch(/contentEditable|dangerouslySetInnerHTML|innerHTML/);
    }
  });
});

describe('A6-30 -- the slug is frozen once any locale is published', () => {
  it('computes the freeze from EVERY locale row, not the one being edited', () => {
    /*
     * The address belongs to the ARTICLE: `contentAlternates()` derives the `/en/` twin
     * from one path, so renaming while `id` is published breaks the English URL too.
     * There is no redirect table in this project and building one is not in scope.
     */
    const page = code('src/app/admin/blog/[slug]/page.tsx');
    expect(page).toContain("l.status !== 'draft'");
    expect(page).toContain('slugFrozen');
    // The field is never editable in the editor -- it is rendered `readOnly`.
    expect(code('src/app/admin/blog/MarkdownEditor.tsx')).toMatch(/value=\{slug\}\s+readOnly/);
  });
});

describe('the locale tabs remount the editor', () => {
  it('keys the editor on `locale`', () => {
    /*
     * **THE ONE-LINE FIX FOR A BUG THAT WROTE ONE LOCALE'S BODY INTO THE OTHER'S ROW.**
     *
     * The tabs are `<Link>`s, so pressing one is a SOFT navigation within the same route
     * segment: the server re-renders and the preview updates, but React reconciles the
     * editor as the same element and every field in it is a `useState` initialiser, which
     * runs on mount and never again. `save()` then posts the NEW locale — so `id` ->
     * `English` -> `Simpan` stored the Indonesian document as the English one, with
     * nothing on screen looking wrong.
     *
     * **A SOURCE ASSERTION BECAUSE THE BEHAVIOUR NEEDS A SOFT NAVIGATION**, which is loop
     * 5 and not Vitest. What this can check is the mechanism, and the mechanism is one
     * character long and therefore exactly the kind of thing a later refactor drops: the
     * key carries no visible behaviour on first paint, so nothing about the page looks
     * different the moment it is removed.
     *
     * It must be `locale` and not the index or the slug. The slug does not change across
     * a tab press, which is the whole navigation this guards.
     */
    const page = code('src/app/admin/blog/[slug]/page.tsx');
    expect(page).toMatch(/<MarkdownEditor\s+key=\{locale\}/);
  });

  it('seeds every editor field from a prop, which is WHY the key is needed', () => {
    /*
     * Not vacuous, and it is the other half of the argument: if the editor ever stopped
     * holding its own copy of the row, the key would become dead weight and somebody
     * would delete it — correctly. This asserts the precondition still holds, so the two
     * facts fail together rather than the guard rotting alone.
     */
    const editor = code('src/app/admin/blog/MarkdownEditor.tsx');
    expect(editor).toMatch(/useState\(initial\?\./);
    // And the textarea is seeded the same way, through the lazy initialiser form.
    expect(editor).toMatch(/useState\(\(\) =>\s*\n?\s*initial \? serializeMarkdown/);
  });
});

describe('§4.2 -- the client bound that makes `maxDuration` mean something', () => {
  it('bounds all FOUR fetches from the client, each below its own route ceiling', () => {
    /*
     * *"A bigger `maxDuration` is not a latency regression, but it must be paired with a
     * bound on the client, or you have only made the hang longer."*
     *
     *   save      route 30s, client 25s
     *   status    route 30s, client 25s   <- `Simpan & terbitkan`'s second request
     *   translate route 60s, client 55s
     *   format    route 60s, client 45s   <- smaller: four fields of metadata, not sixty
     *                                        translated segments, so 45s means stuck
     *
     * The SERVER must lose the race last, so what the operator gets is the sentence that
     * says what happened rather than a platform 504 with no diagnosis. **A new fetch with no
     * bound is the way this rule decays** — it went from three to four when `Simpan &
     * terbitkan` landed, and the count is asserted so the next one cannot arrive silently.
     */
    const editor = code('src/app/admin/blog/MarkdownEditor.tsx');
    expect(editor).toMatch(/SAVE_ABORT_MS = 25_000/);
    expect(editor).toMatch(/TRANSLATE_ABORT_MS = 55_000/);
    expect(editor).toMatch(/FORMAT_ABORT_MS = 45_000/);
    const fetches = editor.match(/await fetch\(/g) ?? [];
    const signals = editor.match(/signal: AbortSignal\.timeout\(/g) ?? [];
    expect(signals).toHaveLength(fetches.length);
    expect(fetches.length).toBe(4);
  });

  it('treats a timeout as UNKNOWN rather than as a failure, and Auto Format says so hardest', () => {
    /*
     * `POST /api/locale`'s third rule: a timeout is the one outcome that means unknown, and
     * on a write path the request may still have committed.
     *
     * **AUTO FORMAT IS THE ONE WHERE THAT BITES.** Unlike translate it WRITES, so its copy
     * must not claim the format failed — it says the draft may be stored and to reload.
     */
    const editor = code('src/app/admin/blog/MarkdownEditor.tsx');
    expect(editor).toContain("'TimeoutError'");
    const copy = readFileSync('src/app/admin/blog/copy.ts', 'utf8');
    expect(copy).toContain('saveTimedOut');
    expect(copy).toContain('formatTimedOut');
    expect(copy).toMatch(/formatTimedOut:[\s\S]{0,200}muat ulang/);
  });

  it('says on screen that BOTH model buttons store, and where', () => {
    /*
     * **THEY USED TO HAVE OPPOSITE STORAGE BEHAVIOUR AND NOW THEY BOTH WRITE**, which is a
     * smaller trap than the one before it but a trap all the same: `Format otomatis` stores
     * THIS locale and `Terjemahkan otomatis` stores the OTHER one, and an operator who thinks
     * translate filled a form will not go and look at what it published into.
     *
     * The direction flip is why. Pulling into the tab you stand on could leave the result
     * unsaved because you were there to press Simpan; pushing cannot.
     */
    const copy = readFileSync('src/app/admin/blog/copy.ts', 'utf8');
    expect(copy).toMatch(/formatHint:[\s\S]{0,500}MENYIMPAN/);
    expect(copy).toMatch(/translateHint:[\s\S]{0,500}MENYIMPANNYA sebagai draf di sana/);
    // And the label names the DESTINATION, not the source.
    expect(copy).toContain('translateTo:');
    expect(copy).not.toContain('translateFrom:');
  });
});

describe('every failure says WHICH failure it is (2026-07-31)', () => {
  /*
   * Miftah's report: *"right now i just receive this generic error: Format otomatis gagal.
   * this is bad engineering practice."* Four distinguishable outcomes printed one sentence.
   *
   * **THE RULE THIS MUST NOT BREAK IS "NEVER THE DRIVER'S WORDS", AND IT DOES NOT.** A
   * postgres error quotes the failing statement AND its bound parameters, which on this path
   * are a whole article body. `stage` is a literal we wrote and `errorClass` is `err.name`,
   * which cannot carry a parameter — the same two things CLAUDE.md already permits to be
   * logged (*"ids, attempt, SQLSTATE and the error's class"*).
   */
  it('never renders the bare generic note as the only branch', () => {
    const editor = code('src/app/admin/blog/MarkdownEditor.tsx');
    // Each of the five distinguishable outcomes has its own builder at the call site.
    for (const builder of [
      'formatInvalid(',
      'formatHttp(',
      'formatStage(',
      'formatUnreadable(',
      'formatNetwork(',
    ]) {
      expect(editor, builder).toContain(builder);
    }
    // The generic one survives only as a fallback, never as the sole arm of a branch.
    expect(editor).toContain('BLOG.editor.formatFailed');
  });

  it('distinguishes "no JSON" from "JSON with nothing in it", in ONE place', () => {
    /*
     * `.catch(() => ({}))` collapsed those two, and they need different sentences: an empty
     * object means the route answered and had nothing to add, while a parse failure means it
     * crashed before answering or something is between the browser and it.
     *
     * **ONE HELPER RATHER THAN FOUR COPIES, BECAUSE THE FOURTH COPY USED THE SHORTCUT.**
     * `savePublish` was written with `.catch(() => ({}))` and this assertion caught it — which
     * is the fence doing exactly what it was added for a few hours earlier.
     */
    const editor = code('src/app/admin/blog/MarkdownEditor.tsx');
    expect(editor).toContain('async function readReply');
    expect(editor).not.toContain('res.json().catch(');
    // Every fetch goes through it, so no path can regress to the shortcut.
    const fetches = (editor.match(/await fetch\(/g) ?? []).length;
    expect((editor.match(/await readReply\(res\)/g) ?? []).length).toBe(fetches);
  });

  it('carries a stage and an error class on every 503 in the tree, and never a message', () => {
    const shared = code('src/app/api/admin/blog/shared.ts');
    expect(shared).toContain('export function errorClass');
    // `err.name`, never `err.message` — the distinction IS the rule.
    expect(shared).toContain('err.name');
    for (const f of ['src/app/api/admin/blog/route.ts',
                     'src/app/api/admin/blog/[slug]/format/route.ts',
                     'src/app/api/admin/blog/[slug]/status/route.ts',
                     'src/app/api/admin/blog/[slug]/translate/route.ts']) {
      const src = code(f);
      expect(src, f).not.toMatch(/unavailable\(\)/);
      expect(src, f).toMatch(/unavailable\('[a-z]+', errorClass\(/);
    }
    for (const f of [...FILES, 'src/app/api/admin/blog/shared.ts']) {
      expect(code(f), f).not.toContain('err.message');
    }
  });

  it('says the Judul field may be left empty, because that is now a supported path', () => {
    /*
     * Before Auto Format could write one, an empty title produced a zod 422 reading
     * `markup / title / Too small: expected string to have >=1 characters` — accurate and
     * useless. The route now answers with its own sentence, and the field says so up front.
     */
    const copy = readFileSync('src/app/admin/blog/copy.ts', 'utf8');
    expect(copy).toContain('titleAutoHint');
    expect(code('src/app/admin/blog/MarkdownEditor.tsx')).toContain('BLOG.editor.titleAutoHint');
    expect(code('src/app/api/admin/blog/[slug]/format/route.ts')).toContain("reason: 'no-title'");
  });

  it('uses the model’s title ONLY when the field was empty', () => {
    /*
     * A typed title is an editorial decision, and a model overwriting it is V8's `user-edit`
     * failure. The check is in the route as well as in `adviceNeeded`, because *whether to ask*
     * and *whether to use* are different questions — a model can ignore "return an empty
     * string" and send one anyway.
     */
    const route = code('src/app/api/admin/blog/[slug]/format/route.ts');
    expect(route).toMatch(/const finalTitle = title\.trim\(\) !== '' \? title : \(advice\?\.title \?\? ''\)/);
  });
});

describe('the translation PUSHES to the other locale (2026-07-31)', () => {
  /*
   * Miftah: *"i think you got the translation workflow upside down … from nothing, i click a
   * translation TO the other language, but you make it so that we translate this FROM another
   * language, but usually the starting point is that this article does not exist yet."*
   *
   * He was right. The button was mounted on the TARGET tab, so using it meant navigating to an
   * empty English tab to create the English article. Nobody does that.
   */
  it('sends the OTHER locale as `to`, so `from` derives to the tab you are on', () => {
    // The route always derived `from` as "the locale that is not `to`", so the flip is one
    // expression at the call site -- and that expression is the whole direction.
    const editor = code('src/app/admin/blog/MarkdownEditor.tsx');
    expect(editor).toMatch(/to: locale === 'id' \? 'en' : 'id'/);
    expect(editor).not.toMatch(/JSON\.stringify\(\{ to: locale \}\)/);
  });

  it('offers the button on the presence of THIS locale’s body, not the other’s', () => {
    /*
     * The predicate flipped with the direction. Getting this wrong is the shape of bug that
     * looks like a working feature: the button would be enabled exactly when there is nothing
     * to send and disabled exactly when there is.
     */
    const page = code('src/app/admin/blog/[slug]/page.tsx');
    expect(page).toMatch(/canTranslate = \(article\?\.locales \?\? \[\]\)\.some\(\s*\(l\) => l\.locale === locale && l\.body\.length > 0,/);
    expect(page).toMatch(/targetHasBody = \(article\?\.locales \?\? \[\]\)\.some\(\s*\(l\) => l\.locale !== locale && l\.body\.length > 0,/);
  });

  it('guards the overwrite on the stored TARGET row, not on the form', () => {
    /*
     * What is at risk moved with the direction: a stored article in a tab the operator is not
     * looking at. That is the only thing on this surface that can be destroyed without the
     * operator seeing it happen, so the confirmation is strictly more earned than before.
     */
    const editor = code('src/app/admin/blog/MarkdownEditor.tsx');
    expect(editor).toMatch(/targetHasBody \? setTr\('confirm'\) : translate\(\)/);
    expect(editor).not.toMatch(/formHasContent \? setTr\('confirm'\)/);
  });

  it('does not touch the form it is standing on', () => {
    /*
     * **THE ONE ASSERTION THAT WOULD CATCH THE FLIP BEING HALF-DONE.** A push that still
     * assigned the response into `setTitle`/`setMarkdown` would overwrite the article the
     * operator is working on with a translation of itself.
     */
    const editor = code('src/app/admin/blog/MarkdownEditor.tsx');
    const translateFn = editor.slice(editor.indexOf('async function translate('), editor.indexOf('async function save('));
    for (const setter of ['setTitle(', 'setMarkdown(', 'setHeroCard(', 'setDescription(']) {
      expect(translateFn, setter).not.toContain(setter);
    }
  });

  it('writes through `saveDocument`, so machine output gets no shortcut past the gates', () => {
    const route = code('src/app/api/admin/blog/[slug]/translate/route.ts');
    expect(route).toContain('saveDocument(');
    // The derived hero alt: the translated doc's own `alt` must not be forwarded (§7).
    expect(route).toMatch(/hero: result\.doc\.hero \? \{ cardUrlSlug: result\.doc\.hero\.cardUrlSlug \} : null/);
    // And it fires the save event, or every translated row is missing from the metric.
    expect(route).toContain("via: 'auto_translate'");
  });
});

describe('Simpan & terbitkan, and the link that follows it', () => {
  it('chains the two existing endpoints rather than adding a combined route', () => {
    /*
     * A combined route would need its own gate, event and refusal set, duplicating
     * `changeStatus` -- which owns rules the editor must not restate: no path back to draft
     * (A6-21), `id` before `en`, and a publish refused for ANY violation including warnings.
     */
    const editor = code('src/app/admin/blog/MarkdownEditor.tsx');
    expect(editor).toMatch(/\/api\/admin\/blog\/\$\{slug\}\/status/);
    expect(editor).toMatch(/to: 'published'/);
    // The publish runs only after the save reports success.
    expect(editor).toMatch(/if \(!\(await save\(\)\)\) return;/);
  });

  it('renders a state refusal as a sentence from `BLOG.refusal`', () => {
    /*
     * `id-not-published` is the one an operator will actually hit -- the English cannot go out
     * before the Indonesian -- and A6-7's rule is that a silent no-op is how somebody ends up
     * editing a row by hand in `db:studio`.
     */
    const editor = code('src/app/admin/blog/MarkdownEditor.tsx');
    expect(editor).toContain('BLOG.refusal[');
    expect(readFileSync('src/app/admin/blog/copy.ts', 'utf8')).toContain('publishRefused');
  });

  it('builds the public href on the SERVER and gates the link on the status', () => {
    /*
     * `StatusControl`'s rule: a client component must not know the locale prefix maths, and
     * `adminCopy.test.ts` keeps `@/lib/i18n/prefix` out of this subtree. `blogPostPath` is the
     * sanctioned builder and the page is what calls it.
     */
    const page = code('src/app/admin/blog/[slug]/page.tsx');
    expect(importsOf(page)).toContain('@/lib/seo/blog');
    expect(page).toMatch(/publicPath=\{blogPostPath\(slug, locale\)\}/);
    const editor = code('src/app/admin/blog/MarkdownEditor.tsx');
    expect(editor).not.toContain('blogPostPath');
    // Rendered only when the row is live, and in a new tab so the editor stays open.
    expect(editor).toMatch(/\{live \? \(/);
    expect(editor).toContain('target="_blank"');
    expect(editor).toContain('rel="noreferrer"');
  });

  it('keeps `live` independent of the save state', () => {
    /*
     * A link gated on `state === 'published'` would vanish the next time the operator pressed
     * Simpan, because the article stays published while the state returns to `saved`.
     */
    const editor = code('src/app/admin/blog/MarkdownEditor.tsx');
    expect(editor).toMatch(/useState\(status === 'published'\)/);
  });
});

describe('the lint panel arrives rather than standing there', () => {
  it('renders nothing when there is nothing to say', () => {
    /*
     * Miftah asked whether this section is still used. **It is** -- the lint still refuses
     * saves and publishes and is the only place its words appear; a live check on a real paste
     * produced `malay / tempoh` and `bare-path / /history`, both error class, both storing
     * nothing. What did not survive is the PERMANENT EMPTY panel: beside a form with dozens of
     * fields a standing "Tidak ada masalah" was reassurance, beside three fields it is
     * furniture that teaches an operator to stop reading that part of the screen.
     */
    const editor = code('src/app/admin/blog/MarkdownEditor.tsx');
    expect(editor).toMatch(/if \(violations\.length === 0\) return null;/);
    expect(editor).not.toContain('BLOG.editor.lintClean');
  });

  it('still renders both classes when there is', () => {
    const editor = code('src/app/admin/blog/MarkdownEditor.tsx');
    expect(editor).toContain('BLOG.editor.lintErrors');
    expect(editor).toContain('BLOG.editor.lintWarnings');
  });
});

describe('§9 -- the table of contents has ONE definition, and both surfaces mount it', () => {
  /*
   * **IT WAS AUTOMATIC SINCE S6 AND NO OPERATOR HAD EVER SEEN IT.** The feature request was
   * *"the LLM automatically generates a clickable Table of Contents"*, and the public page
   * had been building one from every level-2 heading with an id since it shipped. What was
   * missing was the PREVIEW: this pane mounted `Prose` alone, without the page chrome, so
   * the one surface somebody looks at while writing was the one that did not show it.
   *
   * A6-32's argument for not reimplementing `Prose` binds here identically — two
   * definitions of the outline would agree right up until they did not, and the divergence
   * would show on a public page rather than in the preview.
   */
  it('is mounted from `@/components/ArticleToc` on both surfaces', () => {
    const admin = code('src/app/admin/blog/[slug]/page.tsx');
    const publicPage = code('src/app/blog/[slug]/page.tsx');
    expect(importsOf(admin)).toContain('@/components/ArticleToc');
    expect(importsOf(publicPage)).toContain('@/components/ArticleToc');
    expect(admin).toContain('<ArticleToc');
    expect(publicPage).toContain('<ArticleToc');
  });

  it('leaves no second copy of the markup on either page', () => {
    // The failure mode is somebody copying the `<nav>` back rather than importing it, which
    // works and passes every other test in this file.
    for (const f of ['src/app/admin/blog/[slug]/page.tsx', 'src/app/blog/[slug]/page.tsx']) {
      expect(code(f), f).not.toContain('aria-labelledby="toc-title"');
      expect(code(f), f).not.toContain('tocList');
    }
  });

  it('takes its label as a PROP, so the admin tree can mount it', () => {
    /*
     * **`adminCopy.test.ts` FORBIDS `getT` AND `useT` ACROSS THE ADMIN TREE**, because the
     * admin surface is deliberately Indonesian-only: an operator's chrome following the
     * viewer's locale is a translation nobody asked for on a page nobody but Miftah sees.
     * A component calling `t()` could not be mounted here at all — so it takes the string,
     * and neither fence bends.
     */
    const toc = code('src/components/ArticleToc.tsx');
    expect(toc).not.toMatch(/\bgetT\(|\buseT\(/);
    expect(toc).toContain('label: string');
    expect(code('src/app/admin/blog/[slug]/page.tsx')).toContain('BLOG.editor.previewToc');
    expect(code('src/app/blog/[slug]/page.tsx')).toContain("t('blog.inThisArticle')");
  });

  it('deletes `previewStale` rather than rewording it', () => {
    /*
     * It said *"satu simpan di belakang"*, and that stopped being true when `Format
     * otomatis` began writing the draft row and navigating (design R5). **A hint describing
     * a staleness the pane no longer has teaches an operator to distrust what they are
     * looking at**, which is worse than no hint. `previewHref` is the one that stays: `Prose`
     * resolves the locale itself, so preview links lack the `/en/` prefix for an `en`
     * document.
     */
    const copy = readFileSync('src/app/admin/blog/copy.ts', 'utf8');
    expect(code('src/app/admin/blog/copy.ts')).not.toContain('previewStale:');
    expect(code('src/app/admin/blog/[slug]/page.tsx')).not.toContain('previewStale');
    expect(copy).toContain('previewHref:');
    expect(code('src/app/admin/blog/[slug]/page.tsx')).toContain('BLOG.editor.previewHref');
  });
});

describe('the server action gates itself', () => {
  it('calls `requireAdminPage()` in every file that declares `use server`', () => {
    /*
     * **A SERVER ACTION IS A PUBLIC HTTP ENDPOINT.** Next gives it an id, it runs under
     * no layout, and it is not protected by the page that renders the form.
     * `adminSurface.test.ts` asserts the gate on `page.tsx` and `route.ts` files and
     * globs neither `actions.ts` nor an inline action, so this is the only thing
     * checking it.
     */
    for (const f of FILES) {
      const src = code(f);
      if (!src.includes("'use server'") && !src.includes("\n    'use server';")) continue;
      expect(src, f).toMatch(/requireAdminPage\(\)/);
    }
    // Not vacuous: two files declare one.
    const withActions = FILES.filter((f) => readFileSync(f, 'utf8').includes("'use server'"));
    expect(withActions.length).toBeGreaterThanOrEqual(2);
  });
});
