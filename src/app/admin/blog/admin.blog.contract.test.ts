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
      'src/app/admin/blog/BlockEditor.tsx',
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

describe('A6-16 / A6-31 -- the span predicate has ONE definition', () => {
  it('imports `spansSeparate` rather than reimplementing it', () => {
    /*
     * The inline warning in the editor and the `422` on save have to agree, or the author
     * fixes something the server does not object to (or worse, the reverse). A second copy
     * of the boundary character sets is precisely the drift `blocks.ts`'s trap describes:
     * `para(s('Lihat'), link('/gallery', 'galeri'))` renders `Lihatgaleri`, and **a form
     * field shows a trailing space no more than it trims one.**
     */
    const editor = code('src/app/admin/blog/BlockEditor.tsx');
    expect(importsOf(editor)).toContain('@/lib/content/lint');
    expect(editor).toContain('spansSeparate(');
    // And no local re-derivation of the character sets.
    expect(editor).not.toMatch(/const (OPENING|CLOSING)\s*=/);
  });

  it('renders the joined string with boundary whitespace made visible', () => {
    const editor = code('src/app/admin/blog/BlockEditor.tsx');
    expect(editor).toContain('visibleBoundaries');
    expect(editor).toContain('·');
  });
});

describe('A-D14 -- five kinds, and the editor cannot author a sixth', () => {
  it('names exactly the five block kinds and the four span kinds', () => {
    const editor = code('src/app/admin/blog/BlockEditor.tsx');
    expect(editor).toMatch(
      /const KINDS = \['heading', 'paragraph', 'list', 'quote', 'cardRef'\] as const;/,
    );
    expect(editor).toMatch(/const SPAN_KINDS = \['text', 'em', 'strong', 'link'\] as const;/);
    for (const refused of ['callout', 'html', 'raw', 'markdown']) {
      expect(editor, refused).not.toContain(`'${refused}'`);
    }
  });

  it('has no contenteditable, no rich text and no innerHTML', () => {
    // A-D10's CSP argument: a markup-carrying path is *"a permanent new reason the policy
    // can never be enforced"*, and an admin page is not an exception to it.
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
    expect(code('src/app/admin/blog/BlockEditor.tsx')).toMatch(/value=\{slug\}\s+readOnly/);
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
    expect(page).toMatch(/<BlockEditor\s+key=\{locale\}/);
  });

  it('seeds every editor field from a prop, which is WHY the key is needed', () => {
    /*
     * Not vacuous, and it is the other half of the argument: if the editor ever stopped
     * holding its own copy of the row, the key would become dead weight and somebody
     * would delete it — correctly. This asserts the precondition still holds, so the two
     * facts fail together rather than the guard rotting alone.
     */
    const editor = code('src/app/admin/blog/BlockEditor.tsx');
    expect(editor).toMatch(/useState\(initial\?\./);
  });
});

describe('§4.2 -- the client bound that makes `maxDuration` mean something', () => {
  it('aborts the save from the client, below the route’s ceiling', () => {
    /*
     * *"A bigger `maxDuration` is not a latency regression, but it must be paired with a
     * bound on the client, or you have only made the hang longer."* The route is 30s and
     * the client gives up at 25, so the SERVER's answer wins the race and the operator
     * gets a stated failure rather than a platform 504 with no diagnosis.
     */
    const editor = code('src/app/admin/blog/BlockEditor.tsx');
    expect(editor).toContain('AbortSignal.timeout(SAVE_ABORT_MS)');
    expect(editor).toMatch(/SAVE_ABORT_MS = 25_000/);
  });

  it('treats a timeout as UNKNOWN rather than as a failure', () => {
    // `POST /api/locale`'s third rule: a timeout is the one outcome that means unknown,
    // and on a write path the request may still have committed.
    const editor = code('src/app/admin/blog/BlockEditor.tsx');
    expect(editor).toContain("'TimeoutError'");
    expect(readFileSync('src/app/admin/blog/copy.ts', 'utf8')).toContain('saveTimedOut');
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
