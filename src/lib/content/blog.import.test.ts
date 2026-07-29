import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BLOG_ARTICLES } from '@/content/blog';
import { toArticleFacts, toBlogDoc, utcDay, type LocaleRowLike } from './blogRow';

/**
 * **THE MIGRATION ORACLE, AND IT HAS A STATED EXPIRY.** v0.5.0 / A6, §13.3,
 * reconciliation R46.
 *
 * Roadmap §10.2 asks that *"the two imported articles render byte-identically to
 * their committed counterparts"*, and calls it a release acceptance test. **IT
 * CANNOT BE A PERMANENT ONE**, because it compares a database row against a
 * committed file and §0.4 requires the file be deleted — and because **the first
 * legitimate edit through the editor breaks it, correctly.** A permanent test here
 * would be a test that forbids editing the articles.
 *
 * So it is a one-shot oracle, named as such, and it **dies in the same commit as
 * `src/content/blog/**` and `scripts/blog-import.ts`** (task 26). That is stated here
 * because a reviewer of the deletion commit needs to know this file is meant to go,
 * and because R46 says the roadmap should have said so.
 *
 * ── `bodyHash`'s HONEST RETIREMENT ───────────────────────────────────────────
 *
 * The four committed hashes were a live tripwire: *"edit the prose, the hash test
 * fails, and its message tells you to bump `dateModified` and paste the new hash"*.
 * A-D13 deletes the column, and CLAUDE.md, the S6 notes and
 * `src/content/blog/index.ts:33-42` all record `bodyHash` as **"manual bookkeeping
 * somebody will want to delete."** Deleting a tripwire looks exactly like deleting a
 * tripwire, so it is not simply deleted: **it stops guarding the prose and starts
 * proving the move was lossless, once, and then it goes.**
 *
 * The reason it existed is a reason about FILES — *"a filesystem mtime is a checkout
 * artefact on Vercel, `git log` is unavailable at request time, and either moves on a
 * whitespace change"* — and every clause of that is false of a row.
 * `blog_post_locales.updated_at` is written by the request that changed the prose, in
 * the same transaction, and is readable at request time. It is the truthful source
 * that did not exist.
 *
 * ── LAYER 1 OF THREE (§13.3) ─────────────────────────────────────────────────
 *
 * 1. **THIS FILE.** Unit, no database. Round-trip each committed `BlogDoc` through
 *    the row shape and back, and hash the result.
 * 2. Integration, against `jmtarot_test`: `loadArticle` and `blogPostingNode`.
 * 3. `curl` before and after, over the six blog URLs. **The real byte-identity check
 *    and the cheap one** — anything the first two miss (the ToC, the meta line, the
 *    `PublicShare` canonical, the JSON-LD's serialisation) shows up in that diff.
 */

/** What `scripts/blog-import.ts` writes, for a document it is importing. */
function asRow(doc: (typeof BLOG_ARTICLES)[number]['docs']['id'] & object, updatedAt: Date): LocaleRowLike {
  return {
    locale: doc.locale,
    title: doc.title,
    description: doc.description,
    heroCardSlug: doc.hero?.cardUrlSlug ?? null,
    heroAlt: doc.hero?.alt ?? null,
    body: doc.body,
    updatedAt,
  };
}

/** `sha256([title, description, hero, body])`, first 12 hex. The committed form. */
function bodyHash(doc: { title: string; description: string; hero: unknown; body: unknown }): string {
  return createHash('sha256')
    .update(JSON.stringify([doc.title, doc.description, doc.hero, doc.body]))
    .digest('hex')
    .slice(0, 12);
}

const IMPORTED = new Date('2026-07-29T00:00:00.000Z');

describe('the four committed documents survive the row shape unchanged', () => {
  it('found all four, so nothing below passes vacuously', () => {
    const names = BLOG_ARTICLES.flatMap((e) => e.locales.map((l) => `${e.slug}.${l}`)).sort();
    expect(names).toEqual([
      'how-to-read-tarot.en',
      'how-to-read-tarot.id',
      'what-tarot-is.en',
      'what-tarot-is.id',
    ]);
  });

  it('round-trips every document through toBlogDoc with deep equality', () => {
    /*
     * **DEEP EQUALITY OF `body` IS BYTE-IDENTITY OF THE RENDERED PROSE**, and that is
     * checkable precisely because `Prose.tsx` is unchanged (A6-35): it takes `blocks`
     * and nothing else, so two equal arrays render two equal documents.
     */
    for (const entry of BLOG_ARTICLES) {
      for (const locale of entry.locales) {
        const doc = entry.docs[locale]!;
        const back = toBlogDoc(
          { slug: entry.slug, datePublished: entry.datePublished },
          asRow(doc, IMPORTED),
        );
        expect(back, `${entry.slug}.${locale}`).toEqual(doc);
      }
    }
  });

  it('matches the four committed bodyHashes AFTER the round trip', () => {
    /*
     * The hashes are transcribed rather than recomputed from the source documents on
     * the fly: a test that hashes its input and compares it to a hash of its input
     * passes on any transform. These four twelve-hex strings were committed by S6 on
     * 2026-07-29 and they are what makes this an ORACLE.
     */
    const expected: Record<string, string> = {
      'what-tarot-is.id': 'fd66e5580bbb',
      'what-tarot-is.en': '79b11b6ed3d9',
      'how-to-read-tarot.id': 'dd979b02e6e4',
      'how-to-read-tarot.en': '9063906f8f97',
    };
    const actual: Record<string, string> = {};
    for (const entry of BLOG_ARTICLES) {
      for (const locale of entry.locales) {
        const doc = entry.docs[locale]!;
        const back = toBlogDoc(
          { slug: entry.slug, datePublished: entry.datePublished },
          asRow(doc, IMPORTED),
        );
        actual[`${entry.slug}.${locale}`] = bodyHash(back);
      }
    }
    expect(actual).toEqual(expected);
  });

  it('agrees with the registry’s own committed hashes, so the transcription is not a typo', () => {
    for (const entry of BLOG_ARTICLES) {
      for (const locale of entry.locales) {
        expect(entry.revisions[locale]!.bodyHash, `${entry.slug}.${locale}`).toBe(
          bodyHash(entry.docs[locale]!),
        );
      }
    }
  });
});

describe('the facts a row carries', () => {
  it('formats dateModified in UTC and never through a formatter (A6-13)', () => {
    /*
     * `local_date`'s trap in reverse: a `Date` rendered in the SERVER's zone is a day
     * out for a Jakarta edit made between 00:00 and 07:00 local, and
     * `BlogPosting.dateModified` is a claim in structured data. UTC is the honest
     * choice for a publication timestamp with no querent behind it.
     */
    expect(utcDay(new Date('2026-07-29T23:30:00.000Z'))).toBe('2026-07-29');
    // 06:30 Jakarta on the 30th is still the 29th in UTC, and the claim says so.
    expect(utcDay(new Date('2026-07-29T23:30:00.000+07:00'))).toBe('2026-07-29');
  });

  it('carries the committed dates for all four (A6-33)', () => {
    for (const entry of BLOG_ARTICLES) {
      const facts = toArticleFacts(
        { slug: entry.slug, datePublished: entry.datePublished },
        { updatedAt: IMPORTED },
        entry.locales,
      );
      expect(facts).toEqual({
        slug: entry.slug,
        datePublished: '2026-07-29',
        dateModified: '2026-07-29',
        locales: entry.locales,
      });
    }
  });

  it('falls back to the row’s own date rather than to today', () => {
    // A draft has no `date_published`. `new Date()` would be a date that moves on
    // every render — the `lastModified: new Date()` spam signal `sitemap.ts` refuses.
    const facts = toArticleFacts({ slug: 'x', datePublished: null }, { updatedAt: IMPORTED }, ['id']);
    expect(facts.datePublished).toBe('2026-07-29');
  });
});

describe('the hero is both fields or null, never half-set (A6-11)', () => {
  it('reads a half-set pair as null rather than inventing an empty alt', () => {
    /*
     * An empty `alt` on a hero image is an accessibility failure that renders as a
     * perfectly normal-looking page, so the degradation that loses a decorative image
     * beats the one that lies to a screen reader. The CHECK constraint makes the state
     * unreachable through the database; this is what happens if it is reached anyway.
     */
    const base = { locale: 'id' as const, title: 't', description: 'd', body: [], updatedAt: IMPORTED };
    expect(
      toBlogDoc({ slug: 'x', datePublished: null }, { ...base, heroCardSlug: 'the-moon', heroAlt: null })
        .hero,
    ).toBeNull();
    expect(
      toBlogDoc({ slug: 'x', datePublished: null }, { ...base, heroCardSlug: null, heroAlt: 'x' }).hero,
    ).toBeNull();
  });
});
