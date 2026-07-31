import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOG_ARTICLES } from '@/content/blog';
import { ARCANA_LORE, LORE_SLUGS } from '@/content/arcana';
import { CARD_URL_SLUGS } from '@/data/deck';
import { LOCALES } from '@/lib/i18n/locale';
import { heroAltFor } from './heroAlt';

/**
 * `docs/plans/2026-07-31-blog-markdown-editor-design.md` §7.
 *
 * Three things: the derivation resolves for every card in every locale, the derived string
 * satisfies the `hero-pair` rule the free-text field could not, and no client component
 * reaches this module — which matters more here than for its neighbours, because the one
 * hop behind it is forty-four lore documents.
 */

describe('the derivation resolves for the whole deck', () => {
  it('returns a non-null alt for all 22 cards in both locales', () => {
    const missing: string[] = [];
    for (const slug of CARD_URL_SLUGS) {
      for (const locale of LOCALES) {
        if (heroAltFor(slug, locale) === null) missing.push(`${slug}.${locale}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('is the lore document’s own `imageAlt`, not a copy of it', () => {
    // A second definition would drift. This is the assertion that keeps the derivation a
    // read rather than a transcription.
    for (const slug of LORE_SLUGS) {
      for (const locale of LOCALES) {
        expect(heroAltFor(slug, locale)).toBe(ARCANA_LORE[slug][locale].imageAlt);
      }
    }
  });

  it('refuses an unknown slug with `null` rather than an empty string', () => {
    /*
     * **`null` IS A REFUSAL AND `''` WOULD BE A LIE.** An empty `alt` on a hero image is an
     * accessibility failure that renders as a perfectly normal-looking page (A6-11), so
     * `blogSave` turns this into an error-class violation instead.
     */
    expect(heroAltFor('the-mooon', 'id')).toBeNull();
    expect(heroAltFor('', 'en')).toBeNull();
  });

  it('differs between the two locales, so the alt follows the document’s language', () => {
    // The English lore documents are REWRITTEN rather than translated (§8.2), so this is
    // 44 distinct strings and not 22 pairs.
    for (const slug of LORE_SLUGS) {
      expect(heroAltFor(slug, 'id'), slug).not.toBe(heroAltFor(slug, 'en'));
    }
  });
});

describe('the derived string passes the rule the free-text field could not', () => {
  /*
   * `lint.ts`'s `hero-pair` checks exactly two things and both were WARNING class, which is
   * why the four launch articles shipped with the card's name as `alt`. Re-asserting them
   * over the derived values is what makes the field's deletion a fix rather than a
   * relocation of the same risk.
   */
  it('is at least 60 characters for every card in both locales', () => {
    const short: string[] = [];
    for (const slug of LORE_SLUGS) {
      for (const locale of LOCALES) {
        const alt = heroAltFor(slug, locale)!;
        if (alt.trim().length < 60) short.push(`${slug}.${locale}: ${alt.trim().length}`);
      }
    }
    expect(short).toEqual([]);
  });

  it('never opens with the card name', () => {
    // `lint.ts`'s own derivation of the card's words: the slug, hyphens turned to spaces.
    const opens: string[] = [];
    for (const slug of LORE_SLUGS) {
      const name = slug.replace(/-/g, ' ');
      for (const locale of LOCALES) {
        const alt = heroAltFor(slug, locale)!;
        if (alt.trim().toLowerCase().startsWith(name)) opens.push(`${slug}.${locale}`);
      }
    }
    expect(opens).toEqual([]);
  });
});

describe('the four committed articles are the defect this replaces', () => {
  it('every one of them stored the bare card name as its hero alt', () => {
    /*
     * **THE EVIDENCE, ASSERTED SO IT CANNOT BE MISREMEMBERED AS A HYPOTHETICAL.**
     * `what-tarot-is.id` shipped `alt: 'The World'`; the other three shipped their own
     * card's name. Nine to eighteen characters, against a 60-character floor, opening with
     * the card name — both halves of `hero-pair`, on four indexed pages.
     *
     * It was not missed: `scripts/blog-import.ts`'s header called it *"a real defect in
     * v0.4.0's prose"* and imported it anyway, because `hero-pair` is warning class and the
     * script writes `status: 'published'` directly rather than through `changeStatus`. **The
     * gate that would have caught it was never on the path that made the rows.**
     *
     * This case dies with `src/content/blog/**` in task 26, like the rest of the registry
     * oracles.
     */
    const offenders: string[] = [];
    for (const entry of BLOG_ARTICLES) {
      for (const locale of entry.locales) {
        const hero = entry.docs[locale]!.hero;
        if (hero === null) continue;
        const name = hero.cardUrlSlug.replace(/-/g, ' ');
        const bad = hero.alt.trim().length < 60 || hero.alt.trim().toLowerCase().startsWith(name);
        if (bad) offenders.push(`${entry.slug}.${locale}`);
      }
    }
    expect(offenders.sort()).toEqual([
      'how-to-read-tarot.en',
      'how-to-read-tarot.id',
      'what-tarot-is.en',
      'what-tarot-is.id',
    ]);
  });

  it('and the derived replacement is a real description in every case', () => {
    for (const entry of BLOG_ARTICLES) {
      for (const locale of entry.locales) {
        const hero = entry.docs[locale]!.hero;
        if (hero === null) continue;
        const derived = heroAltFor(hero.cardUrlSlug, locale);
        expect(derived, `${entry.slug}.${locale}`).not.toBeNull();
        expect(derived!.trim().length).toBeGreaterThanOrEqual(60);
        expect(derived).not.toBe(hero.alt);
      }
    }
  });
});

describe('no client component reaches the lore registry through this module', () => {
  it('is imported by no `use client` file', () => {
    /*
     * **`clientBoundary.test.ts` CHECKS DIRECT IMPORTS ONLY, AND THIS IS THE ONE HOP THAT
     * MATTERS.** That fence keeps `@/content/**` out of client components because it is
     * *"tens of thousands of words of prose per locale"*; `heroAlt.ts` imports
     * `@/content/arcana`, which statically imports all forty-four documents. A client
     * component importing THIS module would serialise the lot into an RSC payload and pass
     * every existing fence.
     *
     * The module carries no `server-only` marker, deliberately — it follows
     * `blogResolve.ts`, because `blogSave.ts` must stay drivable by `withRollback`. So this
     * assertion is the whole protection.
     */
    const root = join(process.cwd(), 'src');
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
      }
      return out;
    };
    const offending = walk(root)
      .map((path) => ({ path: path.slice(root.length + 1), source: readFileSync(path, 'utf8') }))
      .filter((f) => /^\s*(['"])use client\1/m.test(f.source.split('import')[0]))
      .filter((f) => /from\s+['"]@\/lib\/content\/heroAlt['"]/.test(f.source))
      .map((f) => f.path);
    expect(offending).toEqual([]);
  });

  it('is not vacuous — there really are client components under `src`', () => {
    const root = join(process.cwd(), 'src');
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
      }
      return out;
    };
    const clients = walk(root)
      .map((path) => readFileSync(path, 'utf8'))
      .filter((source) => /^\s*(['"])use client\1/m.test(source.split('import')[0]));
    expect(clients.length).toBeGreaterThan(20);
  });
});
