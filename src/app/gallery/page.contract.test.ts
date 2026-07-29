import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `/gallery`'s fence, in `/s/[slug]/page.contract.test.ts`'s shape.
 *
 * **SOURCE-LEVEL, AND THEREFORE NOT TRANSITIVE.** That gap is real and is the same
 * one `clientBoundary.test.ts` records: this loop reads the five files in this
 * directory, so a session read that arrives through a component in
 * `src/components/**` is invisible here. Every component this page mounts is
 * fenced by its own owner -- `PublicShell` and `PublicShare` by S1,
 * `PublicPageViewed` by this workstream -- and one plan asserting a property about
 * a file it does not own is a fence that goes red when somebody else edits their
 * code.
 *
 * The comment-stripping helper is copied for the reason recorded on `/s/`: a
 * `not.toContain('currentUser')` against raw source fails on the sentence
 * forbidding it, and *"a rule that fires on prose describing the rule is a rule
 * people delete"*.
 */
const DIR = join(process.cwd(), 'src', 'app', 'gallery');
const read = (f: string) => readFileSync(join(DIR, f), 'utf8');
const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/* `jsonld.ts` is NOT in this list: S3's two builders live in `src/lib/seo/jsonld.ts`,
   which is S1's file, and S1 fences its own module. */
const FILES = ['page.tsx', 'GalleryGrid.tsx', 'GalleryTile.tsx', 'alt.ts', 'images.ts'];
const CODE = FILES.map((f) => [f, strip(read(f))] as const);

describe('the public gallery page', () => {
  it('reads the files at all, so nothing below passes vacuously', () => {
    expect(read('page.tsx')).toContain('export default async function GalleryPage');
    expect(strip(read('page.tsx'))).toContain('GalleryGrid');
    expect(strip(read('page.tsx')).length).toBeGreaterThan(800);
    for (const [f, code] of CODE) expect({ [f]: code.length > 200 }).toEqual({ [f]: true });
  });

  it('NEVER touches the session', () => {
    for (const [f, code] of CODE) {
      for (const banned of [
        'currentUser',
        'requireUser',
        'ViewerProvider',
        'useViewer',
        'cookies()',
        "from '@/lib/auth/",
      ]) {
        expect({ [f]: code.includes(banned) }).toEqual({ [f]: false });
      }
    }
  });

  it('NEVER reads the database (roadmap §10: it cannot 500 on an outage)', () => {
    for (const [f, code] of CODE) {
      expect({ [f]: code.includes('@/lib/db') }).toEqual({ [f]: false });
    }
  });

  it('NEVER generates anything (S-D7)', () => {
    for (const [f, code] of CODE) {
      for (const banned of ['@/lib/prompt/', '@/lib/llm/', '@/lib/translate/']) {
        expect({ [f]: code.includes(banned) }).toEqual({ [f]: false });
      }
    }
  });

  it('NEVER mints a share link (S-D8)', () => {
    // `SHARE_ENTITIES` is not extended and `/api/share` requires a session. A
    // capability URL for a page that is already public would manufacture a
    // `noindex` DUPLICATE of a page we are trying to get indexed.
    for (const [f, code] of CODE) {
      expect({ [f]: code.includes('@/lib/share') }).toEqual({ [f]: false });
      expect({ [f]: code.includes('/api/share') }).toEqual({ [f]: false });
    }
  });

  it('NEVER reads the visitor to decide what LANGUAGE to render (§4.1)', () => {
    // The URL is the only input. `negotiate` or an `accept-language` read here
    // would make the page viewer-variant, therefore uncacheable, therefore a
    // canonical tag that lies about which language lives at which address.
    for (const [f, code] of CODE) {
      expect({ [f]: code.includes('accept-language') }).toEqual({ [f]: false });
      expect({ [f]: code.includes('negotiate') }).toEqual({ [f]: false });
      expect({ [f]: code.includes('resolveForMiddleware') }).toEqual({ [f]: false });
    }
  });

  it('mounts no nested LocaleProvider and no <main lang> (unlike /s/[slug])', () => {
    // That page needs both because its language comes from a database row while
    // `<html lang>` follows the viewer. Here the URL pins the locale and the root
    // layout already follows it, so mounting the mechanism anyway would ship a
    // second catalog (+3.3KB gzipped, measured on `/s/`) for nothing.
    const page = strip(read('page.tsx'));
    expect(page).not.toContain('LocaleProvider');
    expect(page).not.toMatch(/<main[^>]*\slang=/);
  });

  it('shows every card UPRIGHT', () => {
    const grid = strip(read('GalleryGrid.tsx'));
    expect(grid).toContain('reversed: false');
    // The reversed GLOSS is legitimate and comes from `bothMeanings`; a reversed
    // ARTWORK is not -- `reversed` in this app means the card came out of the deck
    // that way, and no card on this page came out of a deck.
    expect(strip(read('GalleryTile.tsx'))).not.toContain('reversed');
    for (const [f, code] of CODE) {
      expect({ [f]: code.includes('shuffleDeck') }).toEqual({ [f]: false });
    }
  });

  it('reads every gloss through cardMeaning, never the raw field', () => {
    for (const [f, code] of CODE) {
      expect({ [f]: /\.meaning\s*\[/.test(code) }).toEqual({ [f]: false });
      expect({ [f]: code.includes('.meaning.upright') }).toEqual({ [f]: false });
      expect({ [f]: code.includes('.meaning.reversed') }).toEqual({ [f]: false });
    }
    // `images.ts` is where the gloss is read now -- the image nodes moved out of
    // `page.tsx` so the cross-page `@id` join could be tested (`imageJoin.test.ts`).
    expect(strip(read('images.ts'))).toContain('cardMeaning(');
  });

  it('sorts the cards by id rather than trusting cards.json order', () => {
    expect(strip(read('page.tsx'))).toMatch(/sort\(\(a, b\) => a\.id - b\.id\)/);
  });

  it("builds the lore hrefs on the SERVER with S2's helper", () => {
    expect(strip(read('page.tsx'))).toContain('localePath(');
    // A client component hardcoding `/arcana/` would send an English visitor to
    // the Indonesian page -- the half-translated failure the `/s/` monolingual
    // ruling was about.
    for (const f of ['GalleryGrid.tsx', 'GalleryTile.tsx']) {
      expect({ [f]: strip(read(f)).includes("'/arcana/") }).toEqual({ [f]: false });
      expect({ [f]: strip(read(f)).includes('localePath') }).toEqual({ [f]: false });
    }
  });

  it('uses no next/image (the ?v= query-string refusal)', () => {
    /*
     * `cardThumb()` appends `?v=${ART_VERSION}` and `next/image` REFUSES a local
     * `src` carrying a query string unless `images.localPatterns` is configured.
     * `next.config.ts` configures no `images` block, so an `<Image>` here throws
     * at request time and takes the page to a 500 WITH A GREEN BUILD.
     */
    for (const [f, code] of CODE) {
      expect({ [f]: code.includes("from 'next/image'") }).toEqual({ [f]: false });
    }
  });

  it('emits no versioned URL into the structured data', () => {
    // `cardImage`/`cardThumb` are the versioned pair and must not appear here; the
    // unversioned `*Path` twins are what an `ImageObject` may name.
    for (const [f, code] of CODE) {
      expect({ [f]: /\bcardImage\(/.test(code) }).toEqual({ [f]: false });
      expect({ [f]: /\bcardThumb\(/.test(code) }).toEqual({ [f]: false });
    }
    const images = strip(read('images.ts'));
    expect(images).toContain('cardImagePath');
    expect(images).toContain('cardThumbPath');
  });

  it('renders exactly one <h1> and does not render its own disclaimer', () => {
    // §8.3's sentence comes from `PublicShell`'s footer. Two copies on one screen
    // is what `_galleryfit.html` counts.
    // STRIPPED, because the comment above the heading says `<h1>` in prose --
    // the exact "a rule that fires on prose describing the rule" trap this file's
    // helper exists for, and it fired on the first run.
    const page = strip(read('page.tsx'));
    expect((page.match(/<h1/g) ?? []).length).toBe(1);
    expect(page).not.toContain('disclaimer');
  });

  it('passes `locales: LOCALES` to contentAlternates, and that is not R2\'s trap', () => {
    /*
     * R2 forbids `LOCALES` where a locale might have no document. `/gallery` is
     * ONE route file serving both addresses -- middleware rewrites the prefix --
     * so neither alternate can name a 404. The 22 lore pages pass
     * `localesFor(slug)` instead, and the difference is the whole point of the
     * parameter. Asserted so a future edit copying the lore page's shape here, or
     * this shape onto a page whose English document is optional, is a visible
     * change rather than a silent one.
     */
    const page = strip(read('page.tsx'));
    expect(page).toContain('locales: LOCALES');
    expect(page).toContain("path: '/gallery'");
  });
});
