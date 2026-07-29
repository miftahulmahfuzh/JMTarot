import type { Metadata, MetadataRoute } from 'next';
import { describe, expect, it } from 'vitest';

import { LOCALES, type Locale } from '@/lib/i18n/locale';
import { stripLocalePrefix } from '@/lib/i18n/prefix';
import { contentAlternates, sitemapLanguages } from './alternates';

const ORIGIN = 'https://www.jmtarot.site';

/** Every shape of content path, including the root and both trees. */
const PATHS = ['/', '/gallery', '/blog', '/blog/how-to-read-tarot', '/arcana', '/arcana/the-moon'];

describe('contentAlternates', () => {
  it('emits absolute URLs for the canonical and every alternate', () => {
    const a = contentAlternates({
      origin: ORIGIN,
      path: '/gallery',
      locale: 'id',
      locales: LOCALES,
    });
    expect(a).toEqual({
      canonical: 'https://www.jmtarot.site/gallery',
      languages: {
        id: 'https://www.jmtarot.site/gallery',
        en: 'https://www.jmtarot.site/en/gallery',
        'x-default': 'https://www.jmtarot.site/gallery',
      },
    });
  });

  it('moves only the canonical when the locale changes', () => {
    const en = contentAlternates({
      origin: ORIGIN,
      path: '/gallery',
      locale: 'en',
      locales: LOCALES,
    });
    expect(en.canonical).toBe('https://www.jmtarot.site/en/gallery');
  });

  it('handles the root', () => {
    expect(
      contentAlternates({ origin: ORIGIN, path: '/', locale: 'en', locales: LOCALES }),
    ).toEqual({
      canonical: 'https://www.jmtarot.site/en',
      languages: {
        id: 'https://www.jmtarot.site/',
        en: 'https://www.jmtarot.site/en',
        'x-default': 'https://www.jmtarot.site/',
      },
    });
  });

  it('tolerates a trailing slash on the origin', () => {
    // `NEXT_PUBLIC_SITE_ORIGIN` is typed by a human into a dashboard.
    expect(
      contentAlternates({
        origin: `${ORIGIN}/`,
        path: '/gallery',
        locale: 'id',
        locales: LOCALES,
      }).canonical,
    ).toBe('https://www.jmtarot.site/gallery');
  });

  /**
   * ── RECIPROCITY, MECHANICALLY (S-D15) ─────────────────────────────────────
   *
   * **A NON-RECIPROCAL PAIR IS DISCARDED SILENTLY BY GOOGLE.** If `/gallery`
   * names `/en/gallery` and `/en/gallery` does not name `/gallery`, the WHOLE tag
   * set stops working -- not just the broken edge -- and nothing reports it. So
   * the property is not "each page has three tags", it is "the set is identical
   * on every page in the group".
   */
  it('emits the identical language set from every locale of the same path', () => {
    for (const path of PATHS) {
      const sets = LOCALES.map(
        (locale) => contentAlternates({ origin: ORIGIN, path, locale, locales: LOCALES }).languages,
      );
      expect({ [path]: sets[1] }).toEqual({ [path]: sets[0] });
    }
  });

  it('names its own canonical inside its own language set', () => {
    for (const path of PATHS) {
      for (const locale of LOCALES) {
        const a = contentAlternates({ origin: ORIGIN, path, locale, locales: LOCALES });
        expect({ path, locale, self: a.languages[locale] }).toEqual({
          path,
          locale,
          self: a.canonical,
        });
      }
    }
  });

  /**
   * THE GRAPH IS CLOSED. Walk to every URL a page names, derive that URL's own
   * path and locale, and assert its alternates name the page we came from. This
   * is the assertion that would fail if `localePath` and the canonical builder
   * ever disagreed about the root, which is the one path where they could.
   */
  it('is closed under following its own alternates', () => {
    for (const path of PATHS) {
      for (const locale of LOCALES) {
        const from = contentAlternates({ origin: ORIGIN, path, locale, locales: LOCALES });
        for (const target of LOCALES) {
          const url = from.languages[target]!;
          const stripped = stripLocalePrefix(url.slice(ORIGIN.length) || '/');
          const back = contentAlternates({
            origin: ORIGIN,
            path: stripped.path === '' ? '/' : stripped.path,
            locale: (stripped.locale ?? 'id') as Locale,
            locales: LOCALES,
          });
          expect({ from: from.canonical, target }).toEqual({
            from: back.languages[locale],
            target,
          });
        }
      }
    }
  });

  /**
   * `x-default` POINTS AT THE INDONESIAN URL. Roadmap S-D1's own table says so
   * ("`/arcana/the-moon` -> id (canonical, x-default)"): `id` is the default and
   * the source language, so the bare path is what a visitor whose language we
   * cannot match should be sent to.
   */
  it('points x-default at the Indonesian URL', () => {
    for (const path of PATHS) {
      const a = contentAlternates({ origin: ORIGIN, path, locale: 'en', locales: LOCALES });
      expect(a.languages['x-default']).toBe(a.languages.id);
    }
  });

  /**
   * ── R2: THE LOCALE SET IS PER PATH, AND THIS IS THE HALF THE PLAN PREDATES ──
   *
   * `hreflang` must be reciprocal and a pair naming a URL that 404s is not, so
   * **Google discards the whole set silently.** A card whose English lore is not
   * written yet must therefore emit `id` + `x-default` and NO `en` -- absent,
   * not null and not an empty string, because a null is a value a validator
   * reads as a claim.
   */
  it('omits a locale that has no document at that path', () => {
    const a = contentAlternates({
      origin: ORIGIN,
      path: '/arcana/the-moon',
      locale: 'id',
      locales: ['id'],
    });
    expect(a).toEqual({
      canonical: 'https://www.jmtarot.site/arcana/the-moon',
      languages: {
        id: 'https://www.jmtarot.site/arcana/the-moon',
        'x-default': 'https://www.jmtarot.site/arcana/the-moon',
      },
    });
    expect('en' in a.languages).toBe(false);
  });

  /**
   * A canonical is THIS locale's address, so asking for a canonical in a locale
   * with no document is a request for a URL that 404s. Loud, because the quiet
   * version is a page naming itself in a group it is not a member of.
   */
  it('refuses a canonical for a locale that has no document', () => {
    expect(() =>
      contentAlternates({
        origin: ORIGIN,
        path: '/arcana/the-moon',
        locale: 'en',
        locales: ['id'],
      }),
    ).toThrow(/no canonical there/);
  });

  it('refuses a set with no Indonesian document, because x-default is the id URL', () => {
    expect(() =>
      contentAlternates({
        origin: ORIGIN,
        path: '/arcana/the-moon',
        locale: 'en',
        locales: ['en'],
      }),
    ).toThrow(/source language/);
  });

  /**
   * **THROWS ON A PREFIXED OR NON-CONTENT PATH**, rather than emitting a wrong
   * canonical. A canonical pointing at a page that does not exist de-indexes the
   * page that does, and nothing reports it; a thrown error in
   * `generateMetadata` is loud at implementation time, which is the only place
   * this mistake is cheap.
   */
  it('refuses a prefixed path and a non-content path', () => {
    expect(() =>
      contentAlternates({ origin: ORIGIN, path: '/en/gallery', locale: 'en', locales: LOCALES }),
    ).toThrow(/already-prefixed|not a content path/);
    expect(() =>
      contentAlternates({ origin: ORIGIN, path: '/history', locale: 'id', locales: LOCALES }),
    ).toThrow(/not a content path/);
    expect(() =>
      contentAlternates({
        origin: ORIGIN,
        path: '/gallerywhatever',
        locale: 'id',
        locales: LOCALES,
      }),
    ).toThrow(/not a content path/);
  });

  /**
   * ASSIGNABLE TO NEXT'S OWN TYPE, checked here rather than at five call sites.
   * `Languages<T>` in `next/dist/lib/metadata/types/alternative-urls-types` is a
   * mapped type over a closed `HrefLang` union that includes `'id'`, `'en'` and
   * `'x-default'`; a Next upgrade that narrowed it would otherwise break four
   * workstreams' pages instead of one test.
   */
  it('is assignable to Metadata["alternates"]', () => {
    const alternates: NonNullable<Metadata['alternates']> = contentAlternates({
      origin: ORIGIN,
      path: '/arcana/the-moon',
      locale: 'en',
      locales: LOCALES,
    });
    expect(alternates.canonical).toBe('https://www.jmtarot.site/en/arcana/the-moon');
  });
});

describe('sitemapLanguages', () => {
  /**
   * ONE IMPLEMENTATION, so the `<xhtml:link>` set in the sitemap and the
   * `<link rel="alternate">` set in the head cannot disagree. Google reads both
   * and treats a disagreement as a broken group.
   */
  it('is the same language set the head tags carry', () => {
    for (const path of PATHS) {
      expect(sitemapLanguages(ORIGIN, path, LOCALES)).toEqual(
        contentAlternates({ origin: ORIGIN, path, locale: 'id', locales: LOCALES }).languages,
      );
    }
  });

  it('carries R2 through to the sitemap', () => {
    expect(sitemapLanguages(ORIGIN, '/arcana/the-moon', ['id'])).toEqual({
      id: 'https://www.jmtarot.site/arcana/the-moon',
      'x-default': 'https://www.jmtarot.site/arcana/the-moon',
    });
  });

  it('is assignable to a sitemap entry', () => {
    const entry: MetadataRoute.Sitemap[number] = {
      url: `${ORIGIN}/gallery`,
      alternates: { languages: sitemapLanguages(ORIGIN, '/gallery', LOCALES) },
    };
    expect(entry.alternates?.languages?.en).toBe('https://www.jmtarot.site/en/gallery');
  });
});

describe('v0.5.0 / A1 -- no canonical and no hreflang for /admin (A-D3)', () => {
  /*
   * Behaviour that already exists; the assertion is what makes it a property of
   * the release. A canonical on a gated page is a claim to a search engine that a
   * URL is a document -- and `contentAlternates` throwing is what stops somebody
   * copying an `arcana` page's metadata block into an admin page and shipping a
   * canonical for `/admin` with no test to notice.
   */
  it('throws for /admin and for a nested admin path', () => {
    for (const path of ['/admin', '/admin/users', '/admin/tokens', '/admin/blog']) {
      expect(() =>
        contentAlternates({ origin: 'https://x.test', path, locale: 'id', locales: ['id'] }),
      ).toThrow(/not a content path/);
    }
  });

  it('throws for the prefixed spelling too, by the earlier guard', () => {
    expect(() =>
      contentAlternates({
        origin: 'https://x.test',
        path: '/en/admin',
        locale: 'en',
        locales: ['en', 'id'],
      }),
    ).toThrow(/already-prefixed/);
  });

  it('gives /admin no sitemap language set either, because it is the same function', () => {
    // `sitemapLanguages()` and `contentAlternates()` are one function on purpose,
    // which is what makes the two hreflang sets unable to disagree (S-D15).
    expect(() => sitemapLanguages('https://x.test', '/admin', ['id'])).toThrow(
      /not a content path/,
    );
  });
});
