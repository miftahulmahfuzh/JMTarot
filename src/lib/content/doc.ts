import type { Block, Inline, Phrasing } from '@/content/types';

/**
 * Questions you can ask a content document without rendering it.
 *
 * **PURE AND LEAF.** No React, no `next/*`, no env, no `server-only`. The copy lint,
 * the chrome (`blog.readingTime`) and the internal-link classification all need
 * answers about a document, and none of them should have to mount a component to get
 * one. `blog.content.test.ts`, `lore.test.ts` and `src/lib/seo/blog.ts` are the
 * callers.
 *
 * ── WHY `plainText` MATTERS MORE THAN IT LOOKS ──────────────────────────────────
 *
 * It is the input to §11.4's copy lint -- the Malay grep and the therapy/tic lists,
 * which until v0.4.0 ran only against *generated* readings and therefore never saw a
 * word of the permanent copy a stranger reads first. **`src/content/types.ts` widened
 * `paragraph.text` to `string | Inline[]` only because this function restores the
 * exact reader string** (reconciliation R16), so if it silently skipped a block
 * variant, that variant would be un-linted. `doc.test.ts` names every variant
 * explicitly for that reason.
 */

/**
 * One run of words, as the reader sees it.
 *
 * **SPANS ARE JOINED WITH NOTHING.** That is the load-bearing half of R16's ruling:
 * joining with a space would mean the lint never sees `setumpukkartu` and the
 * adjacency test in `blog.content.test.ts` would be checking a string the renderer
 * does not produce. The spans carry their own spaces -- `blocks.ts`'s header records
 * the trap.
 */
export function phrasingText(text: Phrasing): string {
  return typeof text === 'string' ? text : text.map((span: Inline) => span.text).join('');
}

/**
 * Every word a reader sees, blocks separated by `\n`.
 *
 * **BLOCKS ARE SEPARATED BY A NEWLINE**, and that half is deliberate too: joining
 * blocks with nothing would let the last word of one paragraph and the first of the
 * next form a word that is in neither, which is exactly how a word-boundary grep
 * produces a false positive nobody can find.
 *
 * `quote.source` is included: it is authored prose on the page and a lint that
 * skipped it would leave the one field most likely to carry a name unchecked.
 */
export function plainText(blocks: readonly Block[]): string {
  const out: string[] = [];
  for (const block of blocks) {
    switch (block.kind) {
      case 'heading':
        out.push(block.text);
        break;
      case 'paragraph':
        out.push(phrasingText(block.text));
        break;
      case 'list':
        for (const item of block.items) out.push(phrasingText(item));
        break;
      case 'quote':
        out.push(phrasingText(block.text));
        out.push(block.source);
        break;
      case 'cardRef':
        out.push(block.text);
        break;
      default: {
        /* A sixth block kind must be a compile error here too, not silently un-linted. */
        const unhandled: never = block;
        return unhandled;
      }
    }
  }
  return out.join('\n');
}

export function wordCount(blocks: readonly Block[]): number {
  const words = plainText(blocks).trim().split(/\s+/);
  return words.length === 1 && words[0] === '' ? 0 : words.length;
}

/**
 * A rounded estimate at 200 words per minute, floored at one.
 *
 * 200 wpm is the conventional silent-reading figure for English and it is close
 * enough for both languages at this length. **Nobody has measured Indonesian and this
 * plan does not pretend otherwise** -- the label says *"sekitar"* / *"about"*, so the
 * exposure is small, and it is the same category of unmeasured user-facing number as
 * `PERSONA_MIN_AGE_SECONDS`. The floor exists because "0 menit baca" reads as a bug.
 */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 200));
}

/** Heading ids at one level, in document order. Feeds the in-page nav and the anchor test. */
export function headingIds(blocks: readonly Block[], level: 2 | 3): string[] {
  return blocks.flatMap((b) =>
    b.kind === 'heading' && b.level === level && b.id !== undefined ? [b.id] : [],
  );
}

/** Every inline link path in a document, in order. Feeds the bare-path lint. */
export function linkPaths(blocks: readonly Block[]): string[] {
  const runs: Phrasing[] = blocks.flatMap((b) =>
    b.kind === 'paragraph' || b.kind === 'quote' ? [b.text] : b.kind === 'list' ? b.items : [],
  );
  return runs.flatMap((run) =>
    typeof run === 'string' ? [] : run.flatMap((x) => (x.kind === 'link' ? [x.path] : [])),
  );
}

/**
 * What a link points at, as a CLOSED set.
 *
 * **IT EXISTS SO NOTHING EVER PUTS AN HREF IN AN ANALYTICS PROP.** `events.ts` rule 1
 * is no free text and rule 2 is no unbounded cardinality; a path is both. Five tokens
 * answer the only question worth asking of an internal-link click -- is the article
 * feeding the lore pages, the gallery, itself, or the app.
 *
 * **NOTHING FIRES AN EVENT FROM IT TODAY, AND THAT IS RECORDED RATHER THAN FIXED.**
 * S6's plan proposed a `content.link_clicked` carrying this value from a delegated
 * listener over the prose. S1 owns `events.ts` for v0.4.0 (S-D13) and the folded
 * taxonomy has `public.link_clicked`, whose `to` union has no `anchor` member -- so
 * wiring this up means widening another workstream's data dictionary for an in-page
 * jump. The chrome links that *do* fire it (the index's orientation block, the lore
 * pages' gallery link) pass a literal `to`, which is what S3 and S4 already do. The
 * function is still the single definition of the classification, and
 * `Prose.tsx`'s header records the same decision from the renderer's side.
 *
 * **MATCHED AS A SEGMENT, NEVER AS A PREFIX.** `/galleryish` is not the gallery, for
 * the same reason `isPublic()` is a function rather than a regex.
 */
export type LinkKind = 'arcana' | 'gallery' | 'blog' | 'app' | 'anchor';

export function linkKind(path: string): LinkKind {
  if (path.startsWith('#')) return 'anchor';
  if (path === '/gallery') return 'gallery';
  if (path === '/blog' || path.startsWith('/blog/')) return 'blog';
  if (path.startsWith('/arcana/')) return 'arcana';
  return 'app';
}
