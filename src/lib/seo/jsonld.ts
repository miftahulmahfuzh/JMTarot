/**
 * The structured data this site emits, as pure builders.
 *
 * ── WHY BUILDERS AND NOT LITERALS IN EACH PAGE (S-D16) ──────────────────────
 *
 * Forty-four content pages hand-writing JSON-LD is forty-four chances to emit a
 * node whose `@id` does not match the one the homepage published, and the failure
 * is that Google stops joining the graph and quietly treats every page as an
 * unattributed document. One function per type, one test per function, and a page
 * calls it.
 *
 * **PURE. NO IMPORTS.** No `next/*`, no catalog, no `@/lib/seo/origin` -- the
 * origin arrives as an argument. That is not fussiness: it makes every builder
 * testable with a literal origin, and it is why `origin.ts` rather than this file
 * is the one fenced out of client components.
 *
 * ── WHAT WE EMIT, AND THE TWO WE REFUSE ─────────────────────────────────────
 *
 * `Organization` and `WebSite` on `/`; `BreadcrumbList` on every content page.
 * S3 adds `ImageGallery`/`ImageObject`, S4 `Article`, S6 `Blog`/`BlogPosting` --
 * INTO THIS FILE, each pure, each tested, sequenced S1 -> S3 -> S4 -> S6 (R9).
 *
 * **NO `SearchAction`.** There is no site search, and marking up one we do not
 * have is a lie a crawler can check by following the `target` template into a 404.
 * The cost is not the missing feature; it is that every other claim in our markup
 * is trusted less. There is a test on the serialized string, because the shape
 * somebody reaches for is a nested `potentialAction`.
 *
 * **NO `FAQPage`.** Google restricted FAQ rich results to authoritative
 * government and health sites in August 2023, so the markup buys approximately
 * nothing for us. Q&A *content* on a lore page is still worth writing -- write the
 * content, do not build an architecture around the schema.
 *
 * ── `inLanguage` IS THE BARE TAG, NEVER `intlTag()` (R15) ───────────────────
 *
 * `intlTag('en')` is **`en-GB`**, and V6 chose that deliberately for date and
 * time formats -- a real decision about a real regional variant. But `inLanguage`
 * is a FACTUAL CLAIM a crawler believes, nothing here was written as British
 * English, and the bare tag is what `<html lang>` already emits. What must not
 * ship is `id-ID` on the `WebSite` node and `id` on the 22 `ImageObject`s inside
 * the same `@graph`. Every builder takes it as a plain string argument, so the
 * rule costs nothing and binds S1, S3, S4 and S6 identically.
 *
 * ── `@id` IS THE JOIN, AND IT ENDS IN A FRAGMENT ────────────────────────────
 *
 * `${origin}/#organization` and `${origin}/#website` are the conventional
 * self-referential ids. Every other node points at them by `@id` rather than
 * repeating the object, which is what makes one `Organization` in the graph rather
 * than forty-four slightly different ones.
 */

export type JsonLdNode = { '@type': string; [key: string]: unknown };

export type Crumb = { name: string; url: string };

export type OrganizationArgs = {
  /** No trailing slash. `siteOrigin()`'s output. */
  origin: string;
  name: string;
  /** Absolute, or a path this function makes absolute. */
  logo: string;
  description?: string;
  /**
   * `PT Citra Suka Buana`, from `src/app/terms/operator.ts`.
   *
   * OPTIONAL, and `/` passes it. The operator's legal name is settled by
   * reconciliation §7.3; the `forum` string in that file is the one still needing
   * confirmation against the deed, and it is not emitted here.
   */
  legalName?: string;
};

export function organization(a: OrganizationArgs): JsonLdNode {
  const node: JsonLdNode = {
    '@type': 'Organization',
    '@id': orgId(a.origin),
    name: a.name,
    url: `${a.origin}/`,
    logo: abs(a.origin, a.logo),
  };
  if (a.description) node.description = a.description;
  if (a.legalName) node.legalName = a.legalName;
  /*
   * `sameAs` IS OMITTED, NOT EMPTIED. There are no social accounts to name, and
   * `sameAs: []` is a claim about nothing that Google's validator flags. Add the
   * field the day there is an account, not before.
   */
  return node;
}

export type WebSiteArgs = {
  origin: string;
  name: string;
  description: string;
  /** The BARE tag: `id` or `en`. **Never `intlTag()`** — see the header (R15). */
  inLanguage: string;
};

export function website(a: WebSiteArgs): JsonLdNode {
  return {
    '@type': 'WebSite',
    '@id': `${a.origin}/#website`,
    name: a.name,
    url: `${a.origin}/`,
    description: a.description,
    inLanguage: a.inLanguage,
    /* By reference. See the header: one Organization in the graph, not forty-four. */
    publisher: { '@id': orgId(a.origin) },
  };
}

/**
 * The trail, positions numbered from 1.
 *
 * THROWS ON AN EMPTY TRAIL AND ON A RELATIVE URL. Both are caller bugs that would
 * otherwise ship as markup Google silently discards -- and a half-absolute
 * breadcrumb is the specific way a page ends up claiming a crumb at a host we do
 * not control.
 *
 * **THE MIDDLE RUNG OF A LORE PAGE'S TRAIL IS `/gallery`, NEVER `/arcana`**
 * (reconciliation, §13). `/arcana` is a deliberate 404, and naming it in a
 * breadcrumb is a machine-readable claim that a page exists there.
 */
export function breadcrumbList(items: readonly Crumb[]): JsonLdNode {
  if (items.length === 0) throw new Error('breadcrumbList needs at least one item');
  for (const item of items) {
    if (!/^https?:\/\//.test(item.url)) {
      throw new Error(`breadcrumbList needs an absolute url, got: ${item.url}`);
    }
  }
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** One `@context` over N nodes. Two contexts is valid and doubles the bytes. */
export function graph(nodes: readonly JsonLdNode[]): JsonLdNode {
  return { '@context': 'https://schema.org', '@type': 'ItemList', '@graph': nodes } as JsonLdNode;
}

/**
 * JSON, hardened for an inline `<script>`.
 *
 * ── THE ESCAPING IS NOT FOR CORRECTNESS. IT IS FOR NOT DEPENDING ON REACT ───
 *
 * **MEASURED, NOT RECALLED (reconciliation R1).** On this tree's react-dom
 * 19.2.8, a plain text child of `<script>` round-trips through `JSON.parse`
 * intact: React does NOT HTML-escape it, `&` stays literal, `"` stays `\"`, and
 * it applies script-aware escaping to `</script` instead. Two agents reasoned
 * from memory about this and produced two confidently-argued, mutually exclusive,
 * both-wrong answers before anybody ran the four lines that settle it.
 *
 * That behaviour is an unspecified React implementation detail of how it treats
 * raw-text elements, and **a release must not depend on one.** Pre-escaping `&`,
 * `<` and `>` to `\uXXXX` makes the output correct under BOTH behaviours -- the
 * escapes are ordinary JSON, so nothing downstream can tell -- and it costs one
 * `.replace()` chain. It also independently closes the breakout: **`</script>`
 * inside a JSON string ends the script element as far as the HTML parser is
 * concerned**, because the parser does not know it is inside a string.
 *
 * U+2028 and U+2029 are legal in JSON strings and are line terminators in
 * JavaScript, so an unescaped one is a syntax error in an inline block.
 *
 * The order matters and is safe: the `<`/`>` passes emit no `&`, and the `&` pass
 * emits no `<`/`>`.
 */
export function serializeJsonLd(node: JsonLdNode): string {
  return JSON.stringify(node)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    /*
     * **WRITTEN AS `\\u2028` IN THIS SOURCE TOO, NEVER AS THE LITERAL
     * CHARACTER.** They are invisible, and an editor, a linter or a
     * copy-paste that normalises them turns both of these replaces into
     * silent no-ops -- a fix that removes the fix and looks identical in a
     * diff. `jsonld.test.ts` builds its input the same way, for the same
     * reason.
     */
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function orgId(origin: string): string {
  return `${origin}/#organization`;
}

function abs(origin: string, pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  return `${origin}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}
