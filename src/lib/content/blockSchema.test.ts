import { describe, expect, it } from 'vitest';
import { BLOG_ARTICLES } from '@/content/blog';
import { bullets, cardRef, h2, h3, link, para, s, steps } from '@/content/blocks';
import { bodySchema, documentSchema, heroSchema } from './blockSchema';

/**
 * The write gate, and the refusals that are the point of it.
 *
 * **THE FOUR COMMITTED DOCUMENTS ARE THE POSITIVE FIXTURE.** A schema that accepts
 * nothing passes every refusal case below, and a schema tested only on hand-written
 * fixtures is a schema tested against the author's own idea of the union. The prose
 * that is live in production is the honest input.
 */

describe('the four committed bodies parse, so the refusals below are not vacuous', () => {
  it('accepts every document `Prose` renders today', () => {
    const failures: string[] = [];
    for (const entry of BLOG_ARTICLES) {
      for (const locale of entry.locales) {
        const doc = entry.docs[locale]!;
        const r = documentSchema.safeParse({
          slug: entry.slug,
          locale,
          title: doc.title,
          description: doc.description,
          hero: doc.hero,
          body: doc.body,
        });
        if (!r.success) failures.push(`${entry.slug}.${locale}: ${r.error.issues[0]?.message}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('round-trips a body unchanged — the parse is the identity (A6-35)', () => {
    /*
     * **`heading.id` AND `list.ordered` ARE `.optional()` AND NOT `.default()`, AND
     * THIS IS THE CASE THAT SAYS WHY.** A default WRITES the field, so a document
     * that omitted it would come back with it — and the byte-identity oracle, which
     * hashes `[title, description, hero, body]`, would fail on documents nobody
     * touched. A parse on the write path must not be a transform.
     */
    for (const entry of BLOG_ARTICLES) {
      for (const locale of entry.locales) {
        const doc = entry.docs[locale]!;
        expect(bodySchema.parse(doc.body)).toEqual(doc.body);
      }
    }
  });
});

describe('the sixth kind is refused, and so is every markup-carrying one (A6-18)', () => {
  it('refuses `callout` — the ask reconciliation R16 refused', () => {
    /*
     * `types.contract.test.ts` asserts its absence from the union *because the
     * failure mode of a refused ask is somebody granting it quietly*. **A6 does not
     * grant it**, and this is the mechanical half: a stored `callout` would be a
     * block `Prose`'s exhaustive switch cannot render, on a public page, with the row
     * already committed.
     */
    expect(bodySchema.safeParse([{ kind: 'callout', text: 'x' }]).success).toBe(false);
  });

  it('refuses `html`, `raw` and `markdown`', () => {
    for (const kind of ['html', 'raw', 'markdown']) {
      expect(bodySchema.safeParse([{ kind, text: '<b>x</b>' }]).success, kind).toBe(false);
    }
  });

  it('refuses an EXTRA key on a valid kind — which is what `.strict()` buys', () => {
    /*
     * **zod's DEFAULT STRIPS UNKNOWN KEYS SILENTLY.** Without `.strict()` this
     * submission validates, the extra key is stored in `jsonb`, and it sits there
     * until somebody writes a renderer that reads it. That is a `dangerouslySetInnerHTML`
     * call site waiting to be written, arrived at through a validator that said yes.
     */
    const smuggled = [{ kind: 'paragraph', text: 'ok', html: '<script>alert(1)</script>' }];
    const r = bodySchema.safeParse(smuggled);
    expect(r.success).toBe(false);
  });

  it('refuses an extra key on a SPAN too, not only on a block', () => {
    expect(
      bodySchema.safeParse([{ kind: 'paragraph', text: [{ kind: 'text', text: 'x', href: '/y' }] }])
        .success,
    ).toBe(false);
  });
});

describe('the five kinds, each accepted in its real authored form', () => {
  it('accepts every kind `blocks.ts` builds', () => {
    const body = [
      h2('satu', 'Satu'),
      h3('dua', 'Dua'),
      para(s('Teks biasa.')),
      para(s('Lihat '), link('/gallery', 'galeri'), s('.')),
      bullets([s('a')], [s('b')]),
      steps([s('a')], [s('b')]),
      { kind: 'quote' as const, text: 'Sebuah kutipan.', source: 'Seseorang' },
      cardRef('the-moon', 'The Moon'),
    ];
    expect(bodySchema.safeParse(body).success).toBe(true);
  });

  it('accepts a paragraph as a plain string — the arm 44 lore documents take', () => {
    expect(bodySchema.safeParse([{ kind: 'paragraph', text: 'satu kalimat' }]).success).toBe(true);
  });

  it('refuses a level-1 heading, because the page owns its single <h1>', () => {
    expect(bodySchema.safeParse([{ kind: 'heading', level: 1, text: 'x' }]).success).toBe(false);
  });

  it('refuses a heading id that is not lowercase-hyphens', () => {
    expect(
      bodySchema.safeParse([{ kind: 'heading', level: 2, id: 'Myths And Facts', text: 'x' }]).success,
    ).toBe(false);
  });

  it('refuses an empty quote source, which the TYPE accepts', () => {
    expect(bodySchema.safeParse([{ kind: 'quote', text: 'x', source: '' }]).success).toBe(false);
  });

  it('refuses an empty body', () => {
    // A published row with an empty body names a URL in `hreflang` that renders a
    // blank page. A6-6's SQL predicate is the other half of the same rule.
    expect(bodySchema.safeParse([]).success).toBe(false);
  });

  it('refuses an empty span and an empty list', () => {
    expect(bodySchema.safeParse([{ kind: 'paragraph', text: [] }]).success).toBe(false);
    expect(bodySchema.safeParse([{ kind: 'list', items: [] }]).success).toBe(false);
  });
});

describe('the hero is both fields or null, never half-set (A6-11)', () => {
  it('accepts null and both fields', () => {
    expect(heroSchema.safeParse(null).success).toBe(true);
    expect(heroSchema.safeParse({ cardUrlSlug: 'the-moon', alt: 'A described painting.' }).success).toBe(
      true,
    );
  });

  it('refuses a card with no alt, and an alt with no card', () => {
    /*
     * An empty `alt` on a hero image is an accessibility failure that renders as a
     * perfectly normal-looking page. The CHECK constraint is one half and this is the
     * other; the transform is the third, and it must never construct
     * `{ cardUrlSlug: row.heroCardSlug!, alt: row.heroAlt ?? '' }`.
     */
    expect(heroSchema.safeParse({ cardUrlSlug: 'the-moon' }).success).toBe(false);
    expect(heroSchema.safeParse({ cardUrlSlug: 'the-moon', alt: '' }).success).toBe(false);
    expect(heroSchema.safeParse({ alt: 'x' }).success).toBe(false);
  });
});

describe('the document envelope', () => {
  const ok = {
    slug: 'apa-itu-tarot',
    locale: 'id',
    title: 'Judul',
    description: 'Deskripsi',
    hero: null,
    body: [{ kind: 'paragraph', text: 'x' }],
  };

  it('accepts a well-formed one', () => {
    expect(documentSchema.safeParse(ok).success).toBe(true);
  });

  it('refuses a slug that is not hyphenated lowercase', () => {
    // The same shape the CHECK constraint holds, and the reason is R6's:
    // `What-Tarot-Is` and `what-tarot-is` would be two rows, two URLs and two
    // `hreflang` groups, and the only thing that would notice is a crawler.
    for (const slug of ['What-Tarot-Is', 'apa itu tarot', 'apa_itu', '-x', 'x-', 'apa--itu']) {
      expect(documentSchema.safeParse({ ...ok, slug }).success, slug).toBe(false);
    }
  });

  it('refuses an unknown locale', () => {
    expect(documentSchema.safeParse({ ...ok, locale: 'ms' }).success).toBe(false);
  });

  it('refuses an extra top-level key', () => {
    expect(documentSchema.safeParse({ ...ok, status: 'published' }).success).toBe(false);
  });
});
