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

export type ImageObjectArgs = {
  /** ABSOLUTE. A relative `url` here is the bug the missing `metadataBase` was. */
  url: string;
  width: number;
  height: number;
  caption: string;
  /*
   * ── EVERYTHING BELOW IS OPTIONAL AND WAS ADDED BY S3 (v0.4.0) ──────────────
   *
   * `/gallery` needs a richer node than a lore page's inline one: twenty-two of
   * them in one `ImageGallery`, each of which has to be distinguishable and
   * joinable. **The alternative was a second builder, and that is exactly the
   * failure the register in reconciliation §5 exists to prevent** -- two
   * definitions of `ImageObject` in one codebase would disagree about `@id`
   * within a release. Additive and `undefined`-by-default, so S4's four-field
   * call is byte-identical.
   */
  /**
   * **THE JOIN BETWEEN `/gallery` AND `/arcana/<slug>`, AND IT IS THE WHOLE
   * REASON THIS FIELD EXISTS.** Both pages describe ONE artwork, so both emit
   * `<absolute lore url>#image` and Google merges them into a single node with
   * two mentions. Omit it and the gallery's twenty-two images and the lore
   * pages' twenty-two are forty-four unrelated nodes.
   *
   * It must be UNIQUE per image. A duplicate `@id` merges twenty-two images into
   * one, and the symptom is "our cards do not appear in Google Images" with
   * nothing in the report.
   */
  id?: string;
  /**
   * ABSOLUTE, and the highest-resolution representation of the artwork -- which
   * is **not** what the page renders. `/gallery` paints a 240x360 thumb at
   * 138-173 CSS px; Google Images wants the biggest honest file. So `contentUrl`
   * and the rendered `src` legitimately differ, and `thumbnailUrl` is where the
   * thumb belongs.
   *
   * **NO QUERY STRING IN EITHER.** `cardImage()`/`cardThumb()` append
   * `?v=${ART_VERSION}` because `/cards/*` is `immutable` for a year on
   * non-content-hashed filenames; that is right for an `<img src>` and wrong
   * here, because Google Images treats a changed URL as a NEW image with no
   * history. `cardImagePath()`/`cardThumbPath()` are the unversioned twins.
   */
  contentUrl?: string;
  thumbnailUrl?: string;
  /** MIME type of `contentUrl`. `image/webp` for our art. */
  encodingFormat?: string;
  /** A sentence about the subject -- the upright gloss, via `cardMeaning()`. */
  description?: string;
  /** The BARE tag (R15). Whatever the rest of this graph used. */
  inLanguage?: string;
  /** `@id` of the publisher, so the image is attributed to one organisation. */
  creator?: string;
  /**
   * The page STATING the licence.
   *
   * **A LICENCE URL IS A CLAIM, SO THE CALLER SUPPLIES IT OR OMITS IT.** Emitting
   * `license: <some url>` for a page that states no terms is the `SearchAction`
   * mistake with legal consequences instead of cosmetic ones. `/terms#9` is an
   * intellectual-property clause that RESERVES rights; it becomes a licence
   * statement only when S5 writes the wallpaper grant into it, and until then
   * `undefined` is the honest value. `JSON.stringify` drops it, so an absent
   * clause is an absent claim rather than a `null` a crawler has to interpret.
   */
  licenseUrl?: string;
};

/**
 * One image, as a node rather than a bare URL string (S4, v0.4.0).
 *
 * **THE `url` MUST BE ABSOLUTE AND THIS THROWS OTHERWISE.** Schema.org's own
 * spec permits a relative one and every consumer resolves it against a base it
 * guesses; a guessed base is how a page ends up claiming an image at a host we do
 * not control. S1's `siteOrigin()` is the caller's job -- this file takes no
 * origin because it takes the finished URL.
 *
 * S4 authors it; **S3 mounts it too** for the gallery's `ImageGallery`, which is
 * why it is here rather than in `src/app/arcana/[slug]/jsonld.ts`. R9 sequences
 * the appends S1 -> S3 -> S4 -> S6 and S3 was to write this one, but S3 is
 * blocked on S4a and therefore lands after -- so S4 writes it and S3 imports it.
 * A second definition of the same node type is the reconciliation failure §5's
 * register exists to prevent, whichever order they land in.
 */
export function imageObject(a: ImageObjectArgs): JsonLdNode {
  /*
   * EVERY URL-SHAPED FIELD IS CHECKED, NOT ONLY `url`. S3 added three more of
   * them, and a relative `contentUrl` fails in exactly the way the original
   * comment describes -- silently, against a base somebody else guessed.
   */
  for (const [field, value] of [
    ['url', a.url],
    ['@id', a.id],
    ['contentUrl', a.contentUrl],
    ['thumbnailUrl', a.thumbnailUrl],
    ['license', a.licenseUrl],
  ] as const) {
    if (value !== undefined && !/^https?:\/\//.test(value)) {
      throw new Error(`imageObject needs an absolute ${field}, got: ${value}`);
    }
  }
  return {
    '@type': 'ImageObject',
    /* `undefined` vanishes through `JSON.stringify`, so every optional field
       below is absent rather than null when the caller omits it. */
    '@id': a.id,
    url: a.url,
    contentUrl: a.contentUrl,
    thumbnailUrl: a.thumbnailUrl,
    encodingFormat: a.encodingFormat,
    width: a.width,
    height: a.height,
    caption: a.caption,
    description: a.description,
    inLanguage: a.inLanguage,
    creator: a.creator ? { '@id': a.creator } : undefined,
    /* Both fields or neither -- Google Images' licence badge reads
       `acquireLicensePage`, and one without the other is a half-claim. */
    license: a.licenseUrl,
    acquireLicensePage: a.licenseUrl,
  };
}

export type ImageGalleryArgs = {
  /** ABSOLUTE URL of the gallery page itself, in THIS locale. */
  url: string;
  name: string;
  description: string;
  /** The BARE tag (R15). */
  inLanguage: string;
  /** `${origin}/#website`, so the page hangs off one site node. */
  origin: string;
  /** `breadcrumbList([...])`'s node, embedded inline. */
  breadcrumb: JsonLdNode;
  images: readonly ImageObjectArgs[];
};

/**
 * `/gallery`: one `ImageGallery` holding twenty-two `ImageObject`s (S3, v0.4.0).
 *
 * S-D16 names exactly this for this page, and what it refuses is settled in this
 * file's header: no `SearchAction`, no `FAQPage`.
 *
 * **`associatedMedia` AND NOT `hasPart`.** `ImageGallery` is a `CollectionPage`,
 * and the documented property for the media a collection page collects is
 * `associatedMedia`; `hasPart` would be describing sub-pages, which twenty-two
 * images are not.
 *
 * **`numberOfItems` IS DERIVED FROM THE ARRAY AND MUST STAY THAT WAY.** A literal
 * `22` beside a list of some other length is a contradiction a validator reports
 * against the whole node, and the array is the thing that is true.
 *
 * PURE, and every URL and size arrives as an argument -- this file knows nothing
 * about `@/lib/wallpaper`, `cardThumbPath` or `process.env`.
 */
export function imageGallery(a: ImageGalleryArgs): JsonLdNode {
  if (!/^https?:\/\//.test(a.url)) {
    throw new Error(`imageGallery needs an absolute url, got: ${a.url}`);
  }
  return {
    '@type': 'ImageGallery',
    '@id': `${a.url}#gallery`,
    url: a.url,
    name: a.name,
    description: a.description,
    inLanguage: a.inLanguage,
    isPartOf: { '@id': `${a.origin}/#website` },
    breadcrumb: a.breadcrumb,
    numberOfItems: a.images.length,
    associatedMedia: a.images.map((image) => imageObject(image)),
  };
}

export type ArticleArgs = {
  origin: string;
  /** The canonical, from `contentAlternates()`. `mainEntityOfPage` and nothing else. */
  url: string;
  headline: string;
  description: string;
  /** The BARE tag: `id` or `en`. **Never `intlTag()`** — see the header (R15). */
  inLanguage: string;
  image: JsonLdNode;
  /** `YYYY-MM-DD`. A COMMITTED CONSTANT, never `new Date()` — see below. */
  datePublished: string;
  dateModified: string;
  /** What the article is ABOUT, nested. For a lore page, the card itself. */
  about: JsonLdNode;
};

/**
 * An authored document (S4, v0.4.0). **`Article`, not `CreativeWork`** — roadmap
 * §13 left the choice open and this is S4's call with its reason.
 *
 * `CreativeWork` is `Article`'s parent. Choosing a parent communicates strictly
 * less and buys nothing: Google's documented eligibility is defined over `Article`
 * and its subtypes, never over `CreativeWork`. Every property `Article` expects is
 * honestly true of these documents -- they are authored, dated, reviewed and
 * committed as source (S-D7) -- and the competitor set is article-shaped, so
 * matching the type matches a category a crawler has already learned for this
 * query class.
 *
 * **THE ARGUMENT FOR `CreativeWork` IS CORRECT AND POINTS AT `about`, NOT AT THE
 * PAGE TYPE.** A tarot card IS an artefact and this page describes it -- so the
 * card is the `about` and our painting is the `image`. Both, correctly nested,
 * rather than one flattened compromise.
 *
 * NOT `WebPage`: every page is one, so it says nothing.
 * **NOT `FAQPage`** (S-D16): Google restricted FAQ rich results to authoritative
 * government and health sites in August 2023. The Q&A CONTENT ships; the schema
 * does not, and no part of this node depends on it.
 *
 * **`author` AND `publisher` ARE `@id` REFERENCES, NEVER INLINE DUPLICATES.** Two
 * definitions of who published this will disagree the first time the
 * organisation's name changes, and a crawler joining the graph will pick one.
 *
 * **`dateModified` IS A COMMITTED CONSTANT AND MUST NEVER BE `new Date()`.** A
 * page whose `dateModified` is the request time tells a crawler the content
 * changes on every fetch, which is a lie that costs crawl budget --
 * `sitemap.ts`'s `lastModified` carries the same rule and a byte-stability test.
 */
export function article(a: ArticleArgs): JsonLdNode {
  return {
    '@type': 'Article',
    headline: a.headline,
    description: a.description,
    inLanguage: a.inLanguage,
    image: a.image,
    datePublished: a.datePublished,
    dateModified: a.dateModified,
    mainEntityOfPage: a.url,
    about: a.about,
    author: { '@id': orgId(a.origin) },
    publisher: { '@id': orgId(a.origin) },
    isPartOf: { '@id': `${a.origin}/#website` },
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
