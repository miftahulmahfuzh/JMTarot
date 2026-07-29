import type { Locale } from '@/data/types';
import type { BlogDoc } from '../types';
import { howToReadTarotEn } from './how-to-read-tarot.en';
import { howToReadTarotId } from './how-to-read-tarot.id';
import { whatTarotIsEn } from './what-tarot-is.en';
import { whatTarotIsId } from './what-tarot-is.id';

/**
 * The blog registry. **NO PROSE IN THIS FILE** (roadmap §5: *"the registry … PURE, no
 * prose"*), only the facts a page, a sitemap and a `BlogPosting` node need.
 *
 * ── STATIC IMPORTS, NOT `() => import(...)` ────────────────────────────────────
 *
 * Four documents is ~70KB of server-side string data and lazy loading would buy
 * nothing while adding an async hop to `generateStaticParams`. **Revisit past roughly
 * ten articles** -- S4's 44-document registry is a different problem and makes its own
 * choice.
 *
 * ── `locales` IS A REAL FIELD, NOT A DERIVED ONE ───────────────────────────────
 *
 * It is what `hreflang` and the sitemap enumerate, and roadmap §1 permits an
 * Indonesian-only article: *"when effort has to be cut, `id` ships complete and `en`
 * waits."* An `en` listed with no document is a `<link rel="alternate">` pointing at a
 * 404 — and because `hreflang` must be reciprocal, that one bad tag takes **the whole
 * set** down silently (S-D15, R2). `blog.content.test.ts` asserts `locales` and the
 * loaded documents agree in both directions.
 *
 * ── `dateModified` IS PER LOCALE AND `datePublished` IS NOT ────────────────────
 *
 * The two locales are two URLs and two `BlogPosting` nodes; recording that the English
 * changed because the Indonesian did would be a small lie in structured data.
 *
 * **`bodyHash` IS WHAT KEEPS EITHER DATE HONEST, AND IT IS MANUAL ON PURPOSE.** There
 * is no truthful automatic source for `dateModified`: a filesystem mtime is a checkout
 * artefact on Vercel, `git log` is unavailable at request time, and either moves on a
 * whitespace change. So the date is hand-written and `blog.content.test.ts` recomputes
 * the hash. **Edit the prose, the hash test fails, and its message tells you to bump
 * `dateModified` and paste the new hash.** One line of bookkeeping per edit, and it is
 * the only thing making `BlogPosting.dateModified` a claim rather than decoration --
 * reconciliation §7 ruled on this directly: the honest alternative is dropping
 * `dateModified` from the structured data entirely, never emitting a date nobody
 * maintains.
 *
 * ── TWO ARTICLES, AND THE SECOND IS RECONCILIATION R5 ─────────────────────────
 *
 * S6's plan shipped one and flagged the reason it should be two: a footer link labelled
 * *"what is tarot"* that lands two-thirds of the way into a 2,400-word how-to is a
 * compromise rather than a design, and Jodith's request — *"ttg mitos, fakta, tarot itu
 * apa, manfaat apa"* — deserves its own page and its own query. R5 closed roadmap §13's
 * open question at **two**, and the plan was built so the second is purely additive:
 * one entry here, two modules, no code change anywhere.
 *
 * **BOTH ARTICLES CARRY THE THREE ORIENTATION ANCHORS**, `#what-tarot-is`,
 * `#myths-and-facts` and `#what-its-for`, in both locales. R5 moves the *footer's*
 * links onto `what-tarot-is`; it does not take the sections out of the how-to, which
 * would make it a how-to that opens without orienting anybody.
 */

export type BlogRevision = {
  /** `YYYY-MM-DD`. Hand-written, in the same commit as the prose it describes. */
  dateModified: string;
  /** First 12 hex of sha256 over `[title, description, hero, body]`. The tripwire. */
  bodyHash: string;
};

export type BlogEntry = {
  /**
   * The URL slug. Hyphenated lowercase, **identical and English in both locales** --
   * `BlogDoc.slug`'s comment has the reason, and it is not a style preference.
   */
  slug: string;
  /** `YYYY-MM-DD`. Locale-invariant: the article was published once. */
  datePublished: string;
  locales: readonly Locale[];
  revisions: Partial<Record<Locale, BlogRevision>>;
  docs: Partial<Record<Locale, BlogDoc>>;
};

export const BLOG_ARTICLES: readonly BlogEntry[] = [
  {
    slug: 'what-tarot-is',
    datePublished: '2026-07-29',
    locales: ['id', 'en'],
    revisions: {
      id: { dateModified: '2026-07-29', bodyHash: 'fd66e5580bbb' },
      en: { dateModified: '2026-07-29', bodyHash: '79b11b6ed3d9' },
    },
    docs: { id: whatTarotIsId, en: whatTarotIsEn },
  },
  {
    slug: 'how-to-read-tarot',
    datePublished: '2026-07-29',
    locales: ['id', 'en'],
    revisions: {
      id: { dateModified: '2026-07-29', bodyHash: 'dd979b02e6e4' },
      en: { dateModified: '2026-07-29', bodyHash: '9063906f8f97' },
    },
    docs: { id: howToReadTarotId, en: howToReadTarotEn },
  },
];

/**
 * Newest first, then by slug. The index's order, and the sitemap's.
 *
 * **THE SLUG TIE-BREAK IS NOT COSMETIC.** Both articles published on the same day, and
 * `Array.prototype.sort` is only guaranteed stable within one engine's implementation
 * of one array -- a sitemap whose row order changes between builds churns a crawl for
 * nothing. `sitemap.test.ts` asserts byte-stability across two calls and that is the
 * mechanical form of the same rule.
 */
export function blogEntries(): readonly BlogEntry[] {
  return [...BLOG_ARTICLES].sort(
    (a, b) => b.datePublished.localeCompare(a.datePublished) || a.slug.localeCompare(b.slug),
  );
}

/** Every slug, for `generateStaticParams`. */
export function blogSlugs(): string[] {
  return blogEntries().map((e) => e.slug);
}

/** `null` for an unknown slug, never a throw: the caller renders `notFound()`. */
export function blogArticle(slug: string): BlogEntry | null {
  return BLOG_ARTICLES.find((e) => e.slug === slug) ?? null;
}

/** `null` when the article exists but not in this language. The caller 404s. */
export function blogDoc(slug: string, locale: Locale): BlogDoc | null {
  return blogArticle(slug)?.docs[locale] ?? null;
}
