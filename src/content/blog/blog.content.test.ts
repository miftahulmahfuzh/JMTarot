import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cardByUrlSlug } from '@/data/deck';
import { headingIds, linkPaths, plainText, wordCount } from '@/lib/content/doc';
import { EN_TICS, MALAY, THERAPY_EN, THERAPY_ID } from '@/lib/copy/vocab';
import { LOCALES, type Locale } from '@/lib/i18n/locale';
import type { Block, BlogDoc, Inline } from '@/content/types';
import { BLOG_ARTICLES, blogArticle, blogDoc, blogEntries, blogSlugs } from './index';

/**
 * The committed blog prose, asserted on.
 *
 * `src/app/legal.test.ts` is the precedent and the model: what is checked here is the
 * part that is an INTERFACE rather than taste — the anchor ids the orientation links
 * point at, the word lists no reader-facing copy may contain, the proof that the
 * English was rewritten rather than translated, and the two bookkeeping facts
 * (`bodyHash`, `dateModified`) that keep the structured data honest.
 *
 * ── THE WORD LISTS ARE IMPORTED, NEVER COPIED (§11.4) ──────────────────────────
 *
 * `src/lib/copy/vocab.ts` is the one place they live; its own header records that
 * carrying a second copy is how `tempoh` went missing the first time.
 *
 * ── IT OVERLAPS `src/content/copy.test.ts` ON PURPOSE, AND THAT FILE ASKED FOR IT ─
 *
 * `copy.test.ts` finds forbidden words by regexing string LITERALS out of every
 * `*.{id,en}.ts` under `src/content/`, and its header says so in as many words:
 * *"WHEN `src/content/types.ts` LANDS, importing the registry and walking the typed
 * block union is strictly better than this regex — it cannot miss a string and cannot
 * false-positive on an identifier."* This is that improvement, for the blog half. Both
 * stay: the regex covers documents no registry imports (a file written and not wired
 * up, which is precisely the state a half-finished article is in), and the typed walk
 * covers what is actually served. Two scopes, and the narrower one is not redundant.
 */

/**
 * The three sections the orientation links point at. **Locale-invariant ids, and an
 * anchor is an INTERFACE** — the same discipline `Clause id="6-2"` established.
 *
 * **BOTH ARTICLES CARRY ALL THREE, AND R5 DID NOT CHANGE THAT.** Reconciliation R5
 * moved the *links* onto `what-tarot-is`, whose whole subject is those three questions.
 * It did not take the sections out of the how-to, which would leave a how-to that
 * teaches a method without first saying what the thing is. So the assertion is over
 * every document rather than over one, which is also the stronger invariant: a renamed
 * id breaks a link for the reader who knows least, and that is exactly the reader these
 * three sections exist for.
 */
const ORIENTATION_ANCHORS = ['what-tarot-is', 'myths-and-facts', 'what-its-for'] as const;

const DOCS: { name: string; locale: Locale; doc: BlogDoc }[] = BLOG_ARTICLES.flatMap((entry) =>
  entry.locales.map((locale) => ({
    name: `${entry.slug}.${locale}`,
    locale,
    doc: blogDoc(entry.slug, locale)!,
  })),
);

/** Every `Inline[]` run in a document — paragraphs, quotes and list items. */
const inlineRuns = (blocks: readonly Block[]): Inline[][] =>
  blocks
    .flatMap((b) =>
      b.kind === 'paragraph' || b.kind === 'quote' ? [b.text] : b.kind === 'list' ? b.items : [],
    )
    .filter((run): run is Inline[] => typeof run !== 'string');

const textOf = (doc: BlogDoc) => `${plainText(doc.body)}\n${doc.title}\n${doc.description}`;

describe('the fixtures are real, so nothing below passes vacuously', () => {
  it('loaded both articles in both locales', () => {
    /*
     * A registry that failed to import would give `DOCS = []` and turn every `for`
     * loop in this file into a green no-op. `legal.test.ts` opens the same way and for
     * the same reason.
     */
    expect(DOCS.map((d) => d.name).sort()).toEqual([
      'how-to-read-tarot.en',
      'how-to-read-tarot.id',
      'what-tarot-is.en',
      'what-tarot-is.id',
    ]);
  });
});

describe('the registry', () => {
  it('has at least one article and every slug is URL-safe', () => {
    expect(BLOG_ARTICLES.length).toBeGreaterThan(0);
    for (const entry of BLOG_ARTICLES) {
      expect({ slug: entry.slug, ok: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.slug) }).toEqual({
        slug: entry.slug,
        ok: true,
      });
    }
  });

  it('ships `id` for every article, because `id` is the priority locale', () => {
    // Roadmap §1: "When effort has to be cut, `id` ships complete and `en` waits."
    // An article with no Indonesian is not a cut, it is a mistake.
    for (const entry of BLOG_ARTICLES) {
      expect({ slug: entry.slug, id: entry.locales.includes('id') }).toEqual({
        slug: entry.slug,
        id: true,
      });
    }
  });

  it('keeps `locales` and the loaded documents in step', () => {
    /*
     * `locales` is what `hreflang` and the sitemap enumerate. A locale listed with no
     * document is a `<link rel="alternate">` pointing at a 404, which Google discards
     * silently — and it takes the RECIPROCAL tag down with it, so the whole set stops
     * working (S-D15, R2). A document present but unlisted is a page no crawler is
     * told about.
     */
    for (const entry of BLOG_ARTICLES) {
      for (const locale of LOCALES) {
        const listed = entry.locales.includes(locale);
        const loaded = blogDoc(entry.slug, locale) !== null;
        expect({ slug: entry.slug, locale, listed, loaded }).toEqual({
          slug: entry.slug,
          locale,
          listed,
          loaded: listed,
        });
      }
    }
  });

  it('agrees with each document about its own slug and locale', () => {
    // The redundancy is collapsed rather than trusted — §3.2's slug table's move. A
    // document filed under the wrong key would render at an address it does not name.
    for (const entry of BLOG_ARTICLES) {
      for (const locale of entry.locales) {
        const doc = entry.docs[locale]!;
        expect({ slug: doc.slug, locale: doc.locale }).toEqual({ slug: entry.slug, locale });
      }
    }
  });

  it('gives every listed locale a dateModified no earlier than datePublished', () => {
    for (const entry of BLOG_ARTICLES) {
      expect(/^\d{4}-\d{2}-\d{2}$/.test(entry.datePublished)).toBe(true);
      for (const locale of entry.locales) {
        const rev = entry.revisions[locale]!;
        expect(/^\d{4}-\d{2}-\d{2}$/.test(rev.dateModified)).toBe(true);
        expect({
          slug: entry.slug,
          locale,
          ordered: rev.dateModified >= entry.datePublished,
        }).toEqual({ slug: entry.slug, locale, ordered: true });
      }
    }
  });

  it('returns null for an unknown slug rather than throwing', () => {
    // `generateStaticParams` closes the slug space, but `notFound()` is the belt.
    expect(blogArticle('no-such-article')).toBeNull();
    expect(blogDoc('no-such-article', 'id')).toBeNull();
    expect(blogSlugs()).toContain('how-to-read-tarot');
  });

  it('orders the index deterministically, even when two articles share a date', () => {
    /*
     * Both launch articles published on the same day. `sort` is stable per engine, not
     * per specification of the comparator, so the tie-break on slug is what keeps the
     * sitemap's row order from changing between builds and churning a crawl for
     * nothing. Two calls, byte-identical — `sitemap.test.ts` carries the same rule.
     */
    expect(blogEntries().map((e) => e.slug)).toEqual(blogEntries().map((e) => e.slug));
    expect(blogEntries().map((e) => e.slug)).toEqual(['how-to-read-tarot', 'what-tarot-is']);
  });
});

describe('dateModified is a fact, not decoration', () => {
  /**
   * **EDIT THE PROSE AND THIS TEST FAILS.** There is no honest automatic source for
   * `dateModified` — a filesystem mtime is a checkout artefact on Vercel, `git log` is
   * unavailable at request time, and either moves on a whitespace change. So the date
   * is hand-written and this hash is what stops it rotting.
   *
   * THE WORKFLOW WHEN IT FAILS: bump `dateModified` for that locale to today, paste the
   * hash the failure message prints, re-run. One line of bookkeeping per edit, and it
   * is the only thing making `BlogPosting.dateModified` a claim rather than a guess.
   */
  it('matches the committed bodyHash for every locale', () => {
    for (const { name, doc } of DOCS) {
      const entry = blogArticle(doc.slug)!;
      const actual = createHash('sha256')
        .update(JSON.stringify([doc.title, doc.description, doc.hero, doc.body]))
        .digest('hex')
        .slice(0, 12);
      expect(
        { name, bodyHash: entry.revisions[doc.locale]!.bodyHash },
        `the prose changed. Bump revisions.${doc.locale}.dateModified and set bodyHash to "${actual}".`,
      ).toEqual({ name, bodyHash: actual });
    }
  });
});

describe('every article is substantial and structured for search', () => {
  it('is long enough to be an article rather than a stub', () => {
    // Roadmap §7 (S6): "substantial — a real article, not 300 words." R5 sets
    // `what-tarot-is` at ~1,200 words, which is the floor here rather than the target.
    for (const { name, doc } of DOCS) {
      const words = wordCount(doc.body);
      expect({ name, enough: words >= 1100, words }).toMatchObject({ name, enough: true });
    }
  });

  it('declares the three orientation anchors, in BOTH locales', () => {
    /*
     * `legal.test.ts`'s "declares the SAME anchors in both locales", applied to the
     * three orientation sections Jodith asked for. The public links point at these
     * ids; a document that renames one kills the link silently, for the reader who
     * knows least.
     */
    for (const { name, doc } of DOCS) {
      const ids = headingIds(doc.body, 2);
      const missing = ORIENTATION_ANCHORS.filter((a) => !ids.includes(a));
      expect({ name, missing }).toEqual({ name, missing: [] });
    }
  });

  it('gives every level-2 heading an id, so the table of contents is complete', () => {
    /*
     * `heading.id` is OPTIONAL in the union, because 44 lore documents carry none. On
     * an article it is not optional in practice: the in-page nav renders from
     * `headingIds`, so a section with no id is a section missing from its own outline
     * with nothing on screen looking wrong.
     */
    for (const { name, doc } of DOCS) {
      const h2s = doc.body.filter((b) => b.kind === 'heading' && b.level === 2);
      expect({ name, count: headingIds(doc.body, 2).length }).toEqual({
        name,
        count: h2s.length,
      });
    }
  });

  it('has unique heading ids within a document', () => {
    for (const { name, doc } of DOCS) {
      const ids = [...headingIds(doc.body, 2), ...headingIds(doc.body, 3)];
      expect({ name, unique: new Set(ids).size === ids.length, ids }).toMatchObject({
        name,
        unique: true,
      });
    }
  });

  it('opens with a level-2 heading and never skips to level 3', () => {
    // One `<h1>` per page comes from the page (the title); the body starts at `<h2>`.
    for (const { name, doc } of DOCS) {
      const levels = doc.body.flatMap((b) => (b.kind === 'heading' ? [b.level] : []));
      expect({ name, first: levels[0] }).toEqual({ name, first: 2 });
      let seen2 = false;
      for (const level of levels) {
        if (level === 2) seen2 = true;
        expect({ name, orphanH3: level === 3 && !seen2 }).toEqual({ name, orphanH3: false });
      }
    }
  });

  it('keeps the title inside the headline length Google will use', () => {
    for (const { name, doc } of DOCS) {
      expect({ name, len: doc.title.length <= 110 }).toEqual({ name, len: true });
    }
  });

  it('keeps the meta description inside the length a search result will show', () => {
    // Under ~158 characters or Google truncates it and the last clause is wasted; under
    // 80 and it wastes a slot Google will fill from the body instead.
    for (const { name, doc } of DOCS) {
      expect({ name, len: doc.description.length }).toMatchObject({ name });
      expect(doc.description.length).toBeGreaterThanOrEqual(80);
      expect(doc.description.length).toBeLessThanOrEqual(158);
    }
  });

  it('names a real card as its hero, by URL slug', () => {
    // A typo is a failing test rather than a broken image in production. S-D9: the hero
    // is one of the 22 paintings already committed, never a new asset.
    for (const { name, doc } of DOCS) {
      if (!doc.hero) continue;
      expect({ name, resolves: cardByUrlSlug(doc.hero.cardUrlSlug) !== undefined }).toEqual({
        name,
        resolves: true,
      });
      expect({ name, described: doc.hero.alt.length > 0 }).toEqual({ name, described: true });
    }
  });

  it('points every cardRef at a real card', () => {
    for (const { name, doc } of DOCS) {
      const dead = doc.body
        .flatMap((b) => (b.kind === 'cardRef' ? [b.slug] : []))
        .filter((slug) => cardByUrlSlug(slug) === undefined);
      expect({ name, dead }).toEqual({ name, dead: [] });
    }
  });

  it('links internally with BARE paths only, and actually links somewhere', () => {
    /*
     * A hard-coded `/en/` in a content module duplicates S2's `localePath()` and puts
     * an English reader's link into the Indonesian document. `Prose.tsx` prefixes.
     * An absolute `http` link would leave the site from inside the prose, which is the
     * opposite of what the internal linking is for.
     */
    for (const { name, doc } of DOCS) {
      const paths = linkPaths(doc.body);
      const offending = paths.filter((p) => p.startsWith('/en/') || p.startsWith('http'));
      expect({ name, offending }).toEqual({ name, offending: [] });
      expect({ name, links: paths.length > 0 }).toEqual({ name, links: true });
    }
  });

  it('points every in-page anchor at a heading in the same document', () => {
    /*
     * A `#reversals` that names no heading is a link that scrolls nowhere, and nothing
     * about the page looks wrong. Cheap to check, invisible by eye, and the launch
     * article carries four of them.
     */
    for (const { name, doc } of DOCS) {
      const ids = new Set([...headingIds(doc.body, 2), ...headingIds(doc.body, 3)]);
      const dead = linkPaths(doc.body)
        .filter((p) => p.startsWith('#'))
        .filter((p) => !ids.has(p.slice(1)));
      expect({ name, dead }).toEqual({ name, dead: [] });
    }
  });

  it('points every internal path at a route this release serves', () => {
    // `/gallery`, `/blog/<a real slug>` and `/arcana/<a real card>`, and nothing else.
    for (const { name, doc } of DOCS) {
      const unknown = linkPaths(doc.body).filter((p) => {
        if (p.startsWith('#') || p === '/' || p === '/gallery' || p === '/blog') return false;
        if (p.startsWith('/arcana/')) return cardByUrlSlug(p.slice('/arcana/'.length)) === undefined;
        if (p.startsWith('/blog/')) return blogArticle(p.slice('/blog/'.length)) === null;
        return true;
      });
      expect({ name, unknown }).toEqual({ name, unknown: [] });
    }
  });
});

describe('spans carry their own whitespace', () => {
  /**
   * **THE BLOCK UNION'S VERSION OF `legal.test.ts`'s JSX-WHITESPACE BUG**, which shipped
   * three times in one afternoon as `www.jmtarot.siteand add to your phone`.
   *
   * The union removes the JSX form — the prose is string data, not text nodes — and
   * replaces it with a narrower one: React inserts nothing between adjacent children, so
   * `para(s('Lihat'), link('/gallery', 'galeri'))` renders `Lihatgaleri`. The rule is
   * that the boundary between two spans must be whitespace or punctuation on one side or
   * the other.
   *
   * **THIS TEST IS HALF OF WHAT R16 GRANTED `Inline[]` ON.** The other half is
   * `plainText()` joining with the empty string, asserted in `doc.test.ts`. R16 says in
   * those words: *"If either is deleted, revert to S4's union."*
   */
  const OPENING = new Set(['(', '[', '“', '"', '‘', '—', '/']);
  const CLOSING = new Set([')', ']', '”', '"', '’', ',', '.', ':', ';', '?', '!', '—', '/', '-']);

  it('never glues two spans into one word', () => {
    for (const { name, doc } of DOCS) {
      const glued: string[] = [];
      for (const run of inlineRuns(doc.body)) {
        for (let i = 0; i + 1 < run.length; i++) {
          const left = run[i].text;
          const right = run[i + 1].text;
          const a = left.at(-1) ?? '';
          const b = right.at(0) ?? '';
          const ok =
            /\s/.test(a) || /\s/.test(b) || CLOSING.has(a) || OPENING.has(a) || CLOSING.has(b);
          if (!ok) glued.push(`…${left.slice(-14)}|${right.slice(0, 14)}…`);
        }
      }
      expect({ name, glued }).toEqual({ name, glued: [] });
    }
  });

  it('catches a glued pair when it is given one', () => {
    /*
     * THE NEGATIVE CONTROL. A whitespace checker that has never been seen to fail is a
     * checker nobody knows works — and this one passes on four correct documents, which
     * is exactly the state in which a broken checker is indistinguishable from a good
     * one.
     */
    const bad: Inline[] = [
      { kind: 'text', text: 'Lihat' },
      { kind: 'link', path: '/gallery', text: 'galeri' },
    ];
    const a = bad[0].text.at(-1)!;
    const b = bad[1].text.at(0)!;
    const ok = /\s/.test(a) || /\s/.test(b) || CLOSING.has(a) || OPENING.has(a) || CLOSING.has(b);
    expect(ok).toBe(false);
  });
});

describe('the copy constraints bind committed prose exactly as they bind a reading', () => {
  it('contains none of the eleven Malay-only words — the `id` half only', () => {
    /*
     * W6 rule 4: the Malay grep is `id`-only and running it against English is theatre.
     * `tempoh` is the one that matters when writing about how long something takes,
     * which a how-to article does constantly.
     */
    for (const { name, locale, doc } of DOCS) {
      if (locale !== 'id') continue;
      const prose = textOf(doc);
      for (const word of MALAY) {
        expect({ name, word, hit: new RegExp(`\\b${word}\\b`, 'i').test(prose) }).toEqual({
          name,
          word,
          hit: false,
        });
      }
    }
  });

  it('implies no therapy, diagnosis, treatment or trauma-healing, in EITHER locale', () => {
    for (const { name, locale, doc } of DOCS) {
      const prose = textOf(doc);
      for (const word of locale === 'en' ? THERAPY_EN : THERAPY_ID) {
        expect({ name, word, hit: new RegExp(`\\b${word}\\b`, 'i').test(prose) }).toEqual({
          name,
          word,
          hit: false,
        });
      }
    }
  });

  it('uses `anxiety` freely and `anxiety disorder` never', () => {
    /*
     * The negative control on the rule above. `anxiety` is deliberately ABSENT from
     * `THERAPY_EN` and must stay absent: the rule is against DIAGNOSIS. This test exists
     * so that somebody "tightening" the list has to argue with a named case.
     */
    expect([...THERAPY_EN]).not.toContain('anxiety');
    expect([...THERAPY_EN]).toContain('anxiety disorder');
  });

  it('carries none of the generic-mystic tics — `en` only', () => {
    /*
     * `EN_TICS` contains `abundance` and `sacred`, which are the two words English tarot
     * writing reaches for first — and `abundance` is also The Empress's own keyword in
     * generated `cards.json`. That collision is S4's and is not exempted there either:
     * the scope is `src/content/**` and the prose simply has to say what the thing IS.
     */
    for (const { name, locale, doc } of DOCS) {
      if (locale !== 'en') continue;
      const prose = textOf(doc);
      for (const tic of EN_TICS) {
        const pattern = new RegExp(tic.replace(/'/g, "['’]"), 'i');
        expect({ name, tic, hit: pattern.test(prose) }).toEqual({ name, tic, hit: false });
      }
    }
  });

  it('makes no closing offer of further help — `en` only', () => {
    for (const { name, locale, doc } of DOCS) {
      if (locale !== 'en') continue;
      const hit = /\b(let me know|feel free to|if you'?d like|happy to|i hope this helps)\b/i.test(
        textOf(doc),
      );
      expect({ name, hit }).toEqual({ name, hit: false });
    }
  });

  it('keeps card names in English in both locales', () => {
    /*
     * `## Card data`: a reading refers to The Moon and a card labelled anything else
     * disagrees with the text underneath it. The failure mode here is an author
     * "helpfully" writing `Bulan` in the Indonesian article — the same instinct that
     * produced "Pulan" from a model.
     */
    for (const { name, doc } of DOCS) {
      for (const invented of ['Sang Pandir', 'Kematian', 'Bulan Tarot', 'Roda Keberuntungan']) {
        expect({ name, invented, hit: textOf(doc).includes(invented) }).toEqual({
          name,
          invented,
          hit: false,
        });
      }
    }
  });

  it('carries no markup and no HTML entity in any authored string', () => {
    /*
     * `types.ts`'s consequence, embraced: typographic characters go in the source
     * LITERALLY. A `&ldquo;` would render as those eight characters — the union has no
     * markup-carrying kind and `Prose.tsx` has no `dangerouslySetInnerHTML` — and a
     * `<em>` in a `text` field is the shape somebody reaches for when they want
     * emphasis and have not noticed `strong()` and `em()` exist.
     */
    for (const { name, doc } of DOCS) {
      const offending = plainText(doc.body)
        .split('\n')
        .filter((line) => /<\/?[a-z][^>]*>|&[a-z]+;|&#\d+;/i.test(line))
        .map((line) => line.slice(0, 60));
      expect({ name, offending }).toEqual({ name, offending: [] });
    }
  });

  it('never explains how JMTarot works', () => {
    /*
     * Miftah's brief: "dont spill our business secrets… just spout some bullshit on how
     * to read tarot in general." Read as: write about tarot, not about us. This is the
     * mechanical half — the prompt layers, the reader personas' construction, the memory
     * features, the Shadow Arcana, the moderation categories, the Lotus, and the fact
     * that a reading is generated by a model. `/terms` 4.3 discloses the last one where
     * disclosure belongs; a how-to article is not that place.
     */
    for (const { name, doc } of DOCS) {
      const prose = textOf(doc).toLowerCase();
      for (const secret of [
        'prompt',
        'system prompt',
        'llm',
        'language model',
        'model bahasa',
        'shadow arcana',
        'lotus',
        'teratai',
        'openai',
        'anthropic',
        'kecerdasan buatan',
        'artificial intelligence',
        'api key',
        '/api/',
        'algoritma',
        'algorithm',
      ]) {
        /*
         * **`' api '` WAS IN THIS LIST AND HAD TO COME OUT** (reconciliation §8, from
         * S6). `api` is Indonesian for fire, and the article names the four elements —
         * so the substring check fired on `elemen api` in correct copy. A lint that
         * cries wolf is a lint somebody deletes (`clientBoundary.test.ts` records the
         * same lesson twice). `api key` and `/api/` are the shapes that would actually
         * indicate a leak.
         */
        expect({ name, secret, hit: prose.includes(secret) }).toEqual({ name, secret, hit: false });
      }
    }
  });
});

describe('the English article is REWRITTEN, not translated (roadmap §8.2)', () => {
  /**
   * `## Localization` rule 3 generalised: *"an English document that reads as a
   * translation of the Indonesian one is a defect a reviewer can see in five seconds."*
   *
   * A test cannot read register, so it holds the things a translation cannot have and an
   * authored document trivially does. **All of them fail by SAMENESS**, which is the
   * correct direction: the failure mode is a translator, not a divergent author. The
   * prompt layer's worked examples are enforced exactly this way and for exactly this
   * reason.
   */
  const cardRefsOf = (blocks: readonly Block[]) =>
    new Set(blocks.flatMap((b) => (b.kind === 'cardRef' ? [b.slug] : [])));

  const linkedCards = (blocks: readonly Block[]) =>
    new Set(linkPaths(blocks).filter((p) => p.startsWith('/arcana/')));

  const pairs = () =>
    BLOG_ARTICLES.flatMap((entry) => {
      const id = blogDoc(entry.slug, 'id');
      const en = blogDoc(entry.slug, 'en');
      return id && en ? [{ slug: entry.slug, id, en }] : [];
    });

  it('found both pairs, so the cases below are not vacuous', () => {
    expect(pairs().map((p) => p.slug).sort()).toEqual(['how-to-read-tarot', 'what-tarot-is']);
  });

  it('works its example on DIFFERENT cards in each locale', () => {
    for (const { slug, id, en } of pairs()) {
      const shared = [...cardRefsOf(id.body)].filter((c) => cardRefsOf(en.body).has(c));
      expect({ slug, shared }).toEqual({ slug, shared: [] });
    }
  });

  it('has at least one section the other locale does not', () => {
    /*
     * Structural divergence. The English how-to teaches the single-card draw first and
     * carries a "what a good reading feels like" section; the Indonesian carries a
     * preparation section the English folds elsewhere. A translated document has the
     * same outline by construction.
     *
     * The three `ORIENTATION_ANCHORS` are asserted PRESENT in both, above. This asserts
     * the outline is not merely those three plus a mirror.
     */
    for (const { slug, id, en } of pairs()) {
      const idIds = new Set(headingIds(id.body, 2));
      const enIds = new Set(headingIds(en.body, 2));
      const onlyId = [...idIds].filter((x) => !enIds.has(x));
      const onlyEn = [...enIds].filter((x) => !idIds.has(x));
      expect({ slug, onlyId: onlyId.length > 0, onlyEn: onlyEn.length > 0 }).toEqual({
        slug,
        onlyId: true,
        onlyEn: true,
      });
    }
  });

  it('recommends a different set of card pages', () => {
    // Not disjoint — The Fool is where the sequence begins in either language. Different.
    for (const { slug, id, en } of pairs()) {
      expect({ slug, same: [...linkedCards(id.body)].sort().join() === [...linkedCards(en.body)].sort().join() }).toEqual({
        slug,
        same: false,
      });
    }
  });

  it('does not share a title or a description across locales', () => {
    for (const { slug, id, en } of pairs()) {
      expect({ slug, title: en.title === id.title }).toEqual({ slug, title: false });
      expect({ slug, description: en.description === id.description }).toEqual({
        slug,
        description: false,
      });
    }
  });
});
