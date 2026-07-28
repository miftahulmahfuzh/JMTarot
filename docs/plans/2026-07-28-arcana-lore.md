# S4 — Card lore pages (`/arcana/[slug]`)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Workstream:** S4 of v0.4.0. **Contract:** `PUBLIC_RELEASE_ROADMAP_v0.4.0.md` §7 (S4),
§3.2, §5, §8.2, §8.3, and S-D4 / S-D6 / S-D7 / S-D8 / S-D16.
**Precedence:** roadmap → `docs/plans/2026-07-28-RECONCILIATION-v0.4.0.md` → this plan.
Where this plan disagrees with the roadmap, **this plan is wrong.**

**Blocked on:** S1 (gate, shell, JSON-LD builders, `events.ts`, the catalog, `sitemap.ts`,
cache headers) and S2 (the prefix rewrite, the `hreflang` helper). Every one of those is
consumed through a **named interface declared in `## Deltas requested`**; nothing in this
plan waits on their internals.

**Blocking:** S3 and S6 both need `cardUrlSlug`. **Task 1 exists so it lands first and
alone.**

---

## Goal

Forty-four pages a stranger can read, each a real answer to a query somebody types.

`evatarot.net` outranks us because it has hundreds of crawlable pages and we have three.
Twenty-two cards × two locales is the single largest addressable surface v0.4.0 can add,
and it is the one a competitor cannot copy, because the art and the three authored voices
are ours. The blog is one page. This is forty-four.

Done means:

1. `/arcana/the-moon` and `/en/arcana/the-moon` are 200 to a crawler with no cookie jar,
   carry no `Set-Cookie`, read no database, call no model, and are complete with
   JavaScript disabled.
2. `cardUrlSlug()` is asserted against §3.2's twenty-two-row table, because **a slug is a
   permanent public address and a rename is a 301 nobody will remember to write.**
3. Every page's content is grounded in the correspondence engine (V1) and in `cards.json`.
   **A lore page that contradicts `cardMeaning()` contradicts the reading the app just
   gave**, so the page renders the gloss adjacent to the authored prose and the yes/no
   verdict is asserted against `effectiveYesNo()` rather than written from memory.
4. The Indonesian is Indonesian and the English is **rewritten, not translated**, and both
   facts are mechanically checked over `src/content/**` rather than promised.
5. Each page links honestly to eight to twelve others. Twenty-two pages each linking to
   several is the structure that competes; a page with one outbound link is a leaf.

**Non-goals, recorded so they are not smuggled in:** no `FAQPage` markup (S-D16 — Google
restricted FAQ rich results to authoritative government and health sites in August 2023,
so the markup buys approximately nothing; the Q&A **content** still ships, for the reader
and for long-tail matching). No `/api/` route. No schema change. No migration. No new
dependency, and **MDX is not added.** No model call at build time or request time. No
Minor Arcana. No regenerated art.

---

## Architecture

### The five modules, and the one seam that is not mine

```
src/data/deck.ts                     +cardUrlSlug, +cardByUrlSlug, +CARD_URL_SLUGS.
                                     NO NEW IMPORT -- not even a type. S4 owns it
                                     for v0.4.0 (roadmap §6.5).
src/lib/arcana/correspondence.ts     NEW, S4-owned. PURE, client-importable. The
                                     glyph -> attribution table, and the bridge to
                                     @/lib/numerology's signGloss / elementGloss /
                                     modalityGloss / reduce / arcanaFor.
src/content/types.ts                 NEW, S4-owned. PURE, client-importable. The
                                     block union + LoreDoc. S6 APPENDS BlogDoc and
                                     touches nothing else (see Deltas requested).
src/content/arcana/index.ts          NEW. The registry: url slug -> Localized<LoreDoc>.
                                     NO PROSE.
src/content/arcana/<slug>.<loc>.ts   44 authored documents. Server-imported only.
src/components/Prose.tsx             NEW, S4-owned, shared with S6. The ONE block
                                     renderer. Server component, exhaustive switch.
src/app/arcana/[slug]/               page.tsx, page.module.css, ArcanaFacts.tsx,
                                     ArcanaShare.tsx ('use client'), jsonld.ts,
                                     page.contract.test.ts.
```

### Why the prose is NOT in the i18n catalog (S-D6), and why it is `.ts` and not `.tsx`

**Two separate decisions with two separate reasons, and they are usually conflated.**

**Not the catalog.** I9 ships the client exactly one catalog, as JSON, from the server.
`src/lib/i18n/locales/id.ts` is 843 lines and 242 keys today. Twenty-two lore documents at
the exemplar's length is roughly 24,000 words per locale — an order of magnitude larger
than the whole catalog — and every word of it would be serialised into the RSC payload of
**every visitor of every page, including the draw screen**, because `LocaleProvider` is
handed one resolved bundle. Only chrome keys go in the catalog (§`## Deltas requested`
item 3 lists mine, thirty-five of them, none longer than about forty characters), and they
go in `id.ts` first so a missing English string is a red typecheck (I2). §11.4's
"no prose in the catalog" guard is what keeps that mechanical after this release.

**Not `.tsx`.** `src/app/terms/terms.id.tsx` and `privacy.id.tsx` are this codebase's
existing precedent for long-form bilingual prose, and they settle the question the roadmap
asks them to settle: **MDX is not added** (§5 rule 4). They do **not** settle the file
format for lore, and §5 rule 3 answers that differently — a typed block union, not a
string of HTML and not a tree of JSX. **The binding reason is §11.4's copy lint.** The
Malay grep, the therapy lists and the English tic list have to run over this prose, and
they need exact strings. A `.tsx` document gives a regex `{' '}` separators, `&ldquo;`
entities, `{OPERATOR.domain}` interpolations and JSX children — so `\btempoh\b` can be
split across two text nodes and never match, and `&mdash;` looks like a word boundary that
is not one. `{ kind: 'paragraph', text: '…' }` gives the lint one string per paragraph and
nothing to parse. **The lint is the reason content is data.** Say that out loud, because
"terms.id.tsx did it this way" is the argument someone will make for converting these
files, and it would silently switch the release's only quality gate off.

The consequence, embraced: typographic characters go in the source **literally** (`—`,
`'`, `"`), never as HTML entities. React escapes on render; the file is UTF-8; the lint
sees what the reader sees. A test forbids `<tag>` and `&entity;` in any `text` field.

### `generateStaticParams` does not produce static HTML here, and the roadmap's wording invites the opposite belief

§7's S4 entry says "`generateStaticParams` over 22 slugs", which reads like twenty-two
prerendered files. It will not be. S-D10 accepts a **dynamic root layout** — `app/layout.tsx`
awaits `getLocale()` for `<html lang>`, and `## Localization` rule 5 forbids "fixing" that
— so `headers()` is read above every page and the whole segment tree renders at request
time. **The build output will show `ƒ` for `/arcana/[slug]` and that is the symptom of the
rule working, not a failure.**

What `generateStaticParams` actually buys, and it is worth having:

- With `export const dynamicParams = false`, any slug outside the twenty-two is a **404 at
  the routing layer**, before my code runs. That is the cheapest possible answer to a
  crawler walking a slug space.
- It is the enumeration the build validates the route against.

The TTFB story for a crawler is **entirely S1's `Cache-Control: public, s-maxage=…,
stale-while-revalidate=…`** on the content routes (S-D10), which is exactly the trade S-D10
takes over multiple root layouts. Nothing in this plan sets a cache header; §`## Deltas
requested` item 7 declares the one I need.

### Grounding: what is already true, and the twelve-card invariant that proves the join

The roadmap's instruction is "use them", and the payoff is larger than it looks.
`cards.json` carries `glyph`, and **`glyph` is referenced nowhere in `src/` today** — it is
twenty-two committed astrological attributions that no code has ever read.

Checked against the Golden Dawn's attributions (sources at the bottom of this section),
all twenty-two agree, and **twelve of them close a loop that is exactly assertable**:

| glyph | attribution | cards |
|---|---|---|
| ♈♉♊♋♌♍♎♏♐♑♒♓ | the twelve signs | The Emperor, The Hierophant, The Lovers, The Chariot, Strength, The Hermit, Justice, Death, Temperance, The Devil, The Star, The Moon |
| ☿☾♀♃♆♂☉♇♄ | nine planets | The Magician, The High Priestess, The Empress, Wheel of Fortune, The Hanged Man, The Tower, The Sun, Judgement, The World |
| ✧ | aether / Air | The Fool |

For the twelve sign-attributed cards, `SIGNS[sign].element` in
`src/lib/numerology/astrology.ts` **equals `card.element` in `cards.json`, for all twelve,
with no exceptions** — Aries/fire, Taurus/earth, Gemini/air, Cancer/water, Leo/fire,
Virgo/earth, Libra/air, Scorpio/water, Sagittarius/fire, Capricorn/earth, Aquarius/air,
Pisces/water. Task 2 asserts it. That single test is what makes the glyph table trustworthy:
a mistyped glyph almost certainly disagrees with the card's own element, and the test names
the card.

The nine planetary elements are **editorial and deliberately NOT asserted.** Judgement is
`water` in `cards.json` while the Golden Dawn attributes that trump to Fire (Pluto being a
modern addition to the system, which the source itself flags). **Do not "fix" `cards.json`**
— it is generated by `tools/generate_cards.py`, which S4 does not own, and the reading
prompt has consumed `element` since the first release.

What each page then gets for free, already written and already lint-checked:

- `signGloss(sign, locale)` — a written line per sign per locale, for twelve cards.
- `modalityGloss(SIGNS[sign].modality, locale)` — cardinal / fixed / mutable.
- `elementGloss(card.element, locale)` — all twenty-two.
- `cardMeaning({card, reversed}, locale)` — the distinct upright/reversed gloss pair.
- `cardKeywords(card, locale)` — the three chips.
- `effectivePolarity` and `effectiveYesNo` — including the reversal flips.
- `reduce(card.id)` and `arcanaFor(reduce(card.id))` — **the root card**, which is a real
  internal link and not an arbitrary one: eighteen folds to nine, so The Moon's root is The
  Hermit, and Wheel of Fortune's is The Magician. Eleven cards have one (10, 12–21).

**The nine planetary cards get no sign gloss and that asymmetry is honest.** V1 has no
planet table and this workstream is not adding one — inventing nine glosses to fill a
layout hole is the "vague cosmic language" the v0.3.0 risk table logs against exactly this
kind of page. Those nine render the element gloss and their authored lore, and the fact
strip is shorter. Render nothing for a null (W5's M14 rule).

Sources for the attribution table, to be cited in the plan's research notes and re-checked
per card in Tasks 13–33: [Golden Dawn Astrological Tarot
Correspondences](https://angelorum.co/topics/divination/golden-dawn-astrologica/),
[The Moon Tarot Meaning](https://paulomara.com/the-moon/),
[The Moon — Occult Encyclopedia](https://www.occult.live/index.php?title=The_Moon).

### `Article`, not `CreativeWork` (roadmap §13's open question, S4's call)

**Decision: `Article`, with the card as its `about`.**

`CreativeWork` is `Article`'s parent class. Choosing a parent communicates strictly less
and buys nothing: Google's documented eligibility — rich results, Discover, the Top
Stories family — is defined over `Article` and its subtypes, never over `CreativeWork`.
The properties `Article` expects are ones we honestly have: `headline`, `image`,
`datePublished`, `dateModified`, `author`, `publisher`, `inLanguage`. Every one is true of
these documents, which are authored, reviewed and committed as source (S-D7).

The competitor set — evatarot, Biddy, Labyrinthos — are article-shaped pages, and matching
the type matches the category a crawler has already learned for this query class.

The real argument for `CreativeWork` is that a tarot card **is** an artefact and the page
describes it. That argument is correct and it does not point at the page type — it points
at `about`. So the graph nests both, correctly:

```
Article
  headline / description / inLanguage / datePublished / dateModified
  image        -> ImageObject   (the 800x1200 art; width, height, caption)
  author       -> Organization  (S1's, by @id reference)
  publisher    -> Organization  (S1's, by @id reference)
  isPartOf     -> WebSite       (S1's, by @id reference)
  mainEntityOfPage -> the canonical URL
  about        -> CreativeWork  { name: 'The Moon', identifier: 'XVIII',
                                  isPartOf: 'Major Arcana' }
BreadcrumbList
  1 Home ('/')  ->  2 Gallery ('/gallery')  ->  3 The Moon (canonical)
```

Not `WebPage`: every page is one, so it says nothing. Not `FAQPage`: S-D16.
Not `VisualArtwork` for `about`: that would describe *our painting* rather than *the card*,
and the page is about the card in general — the painting is the `image`.

**THE BREADCRUMB'S MIDDLE RUNG IS `/gallery`, NOT `/arcana`.** `/arcana` is a 404 by
§3.1, so a breadcrumb naming it points markup at a dead URL — which is worse than a
two-item breadcrumb, because it is a machine-readable claim that a page exists. `/gallery`
is the index of this collection by §3.1's own reasoning, so it is also the honest parent.

### The one thing that cannot be tested and how the page compensates

Roadmap §7: *"A lore page that contradicts `cardMeaning()` contradicts the reading the app
just gave."* There is no mechanical test for semantic agreement between a one-line gloss
and four authored paragraphs, and claiming one would be a lie.

Three things are done instead, in descending strength:

1. **`effectiveYesNo()` is asserted, not remembered.** `LoreDoc.yesno` carries the two
   verdicts as data and Task 6's lint asserts them equal to `effectiveYesNo({card,
   reversed})`. This is a second representation of a derived truth, collapsed by an
   assertion — the same shape as §3.2's slug table, and it exists because the flip is
   genuinely counter-intuitive: **The Moon answers `no` upright and `yes` reversed**, and a
   writer following the mood of the artwork will get that backwards. `note` is the sentence
   the writer builds from the field.
2. **The page renders `cardMeaning` for both orientations immediately above the authored
   sections**, so the gloss and the prose are on one screen and a contradiction is a
   reading defect a reviewer meets rather than a hidden one. `page.contract.test.ts`
   asserts `cardMeaning` is called for both orientations, so nobody tidies it away.
3. **`effectivePolarity` is rendered for both orientations too**, which is the other flip
   that catches people: reversed The Moon is `light`, not darker.

---

## Tech Stack

Nothing new. **No new dependency** (roadmap §10) and **no new design token** — every rule
in `page.module.css` and `Prose.module.css` composes `src/theme/tokens.css`, and
`Legal.module.css` is the model: `--fs-reading` / `--lh-reading` for body,
`--fs-eyebrow` / `--ls-section-label` for labels, `--gold` / `--gold-hairline` /
`--gold-wash` for rules and boxes, `68ch` for the measure.

- Next 15 App Router, server components. `next/link` for internal links with
  `prefetch={false}`; a plain `<img>` for the art, never `next/image` (`cardImage()`
  appends `?v=3` and `next/image` refuses a local `src` with a query string when no
  `images.localPatterns` is configured — the constraint `AccountCard` records, satisfied
  rather than dodged).
- Vitest, `unit` project only. **The include glob is `src/**/*.test.ts`, `.ts` and not
  `.tsx`** — every test in this plan is `.test.ts`, which the block-union content model
  makes natural.
- `@/lib/copy/vocab` for the word lists. **Reused, never copied.** `MALAY`, `THERAPY_ID`,
  `THERAPY_EN`, `EN_TICS` already live there; `scripts/smoke-llm.ts` and
  `src/lib/numerology/glosses.test.ts` already import from it. `src/lib/prompt/base.en.ts`
  states a **longer** English therapy list in prose than `THERAPY_EN` holds, and closing
  that gap is `## Deltas requested` item 10.
- No `dangerouslySetInnerHTML`, anywhere. The CSP is `script-src 'self' 'unsafe-inline'`
  in **report-only** and the goal is to tighten it; acquiring a new reason it can never be
  enforced is the opposite of the direction of travel.

---

### Task 1: `cardUrlSlug` / `cardByUrlSlug`, asserted against §3.2

**S3 AND S6 ARE BLOCKED ON THIS SIGNATURE. It lands first, alone, in its own commit.**

```ts
export function cardUrlSlug(card: Card): string;
export function cardByUrlSlug(slug: string): Card | undefined;
export const CARD_URL_SLUGS: readonly string[];   // 22, in Fool's Journey order
```

**Files**
- `src/data/deck.ts` (edit — **no import line changes at all**)
- `src/data/urlSlug.test.ts` (new)

### The failing test first

`src/data/urlSlug.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CARDS, CARD_URL_SLUGS, cardByUrlSlug, cardUrlSlug } from './deck';

/**
 * §3.2's table, transcribed. **THE TRANSCRIPTION IS THE POINT** (S-D4): a slug is a
 * permanent public address, so a rename is a 301 nobody will remember to write, and
 * the only thing standing between a rename and silence is a hand-written table that
 * disagrees with the function.
 *
 * Ordered by card id, so the array index IS the id and a reordered `cards.json`
 * fails here rather than serving the wrong document at the right address.
 */
const TABLE: readonly string[] = [
  'the-fool', 'the-magician', 'the-high-priestess', 'the-empress', 'the-emperor',
  'the-hierophant', 'the-lovers', 'the-chariot', 'strength', 'the-hermit',
  'wheel-of-fortune', 'justice', 'the-hanged-man', 'death', 'temperance',
  'the-devil', 'the-tower', 'the-star', 'the-moon', 'the-sun',
  'judgement', 'the-world',
];

describe('the URL slug', () => {
  it('has one row per card, so the table is not short', () => {
    expect(TABLE).toHaveLength(22);
    expect(CARDS).toHaveLength(22);
  });

  it('matches roadmap §3.2 exactly, card by card', () => {
    for (const card of CARDS) {
      expect({ id: card.id, name: card.name, slug: cardUrlSlug(card) })
        .toEqual({ id: card.id, name: card.name, slug: TABLE[card.id] });
    }
  });

  it('exports the twenty-two in Fool\'s Journey order', () => {
    expect([...CARD_URL_SLUGS]).toEqual([...TABLE]);
  });

  it('is NOT the art slug, which is the whole of S-D4', () => {
    // `18_moon` addresses a file; `the-moon` addresses a document somebody found by
    // typing words. Underscores and a leading number are worth nothing in a URL and
    // cost a keyword.
    for (const card of CARDS) {
      expect(cardUrlSlug(card)).not.toBe(card.slug);
      expect(cardUrlSlug(card)).not.toMatch(/[_0-9]/);
    }
  });

  it('round-trips, and is undefined for anything else', () => {
    for (const card of CARDS) {
      expect(cardByUrlSlug(cardUrlSlug(card))).toBe(card);
    }
    // `undefined` and not a throw, for `cardById`'s recorded reason: every caller is
    // a renderer. The page turns it into notFound() itself.
    for (const miss of ['', 'the-mooon', '18_moon', 'The-Moon', 'the moon', 'moon']) {
      expect(cardByUrlSlug(miss)).toBeUndefined();
    }
  });

  it('needs no special case for the four articleless cards or for `of`', () => {
    // §3.2's closing note, asserted: `strength`, `justice`, `death`, `temperance`
    // carry no article and `wheel-of-fortune` keeps its `of`, and both follow from
    // lowercasing and hyphenating. If either ever needs a branch, the function is
    // wrong and not the table.
    expect(cardUrlSlug(CARDS[8])).toBe('strength');
    expect(cardUrlSlug(CARDS[10])).toBe('wheel-of-fortune');
    expect(cardUrlSlug(CARDS[20])).toBe('judgement');   // not `judgment`
  });
});
```

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm test -- urlSlug
```

**Expected failure:** `Error: No "cardUrlSlug" export is defined on the "./deck" mock`
— in practice a resolution failure naming `cardUrlSlug`, `cardByUrlSlug` and
`CARD_URL_SLUGS` as missing exports of `src/data/deck.ts`.

### The implementation

Append to `src/data/deck.ts`. **Nothing above the first `export` changes** — no new
`import`, not even a type name added to the existing `./types` line. `Card` and `CARDS`
are already in scope, which is what makes the roadmap's "no new import" literally true
rather than approximately true.

```ts
/**
 * The card's PUBLIC URL slug (S-D4). `the-moon`, never `18_moon`.
 *
 * **A SECOND IDENTIFIER, DELIBERATELY, AND THE TWO MUST NEVER BE MERGED.**
 * `Card.slug` addresses a FILE: it matches the art filename and twenty-two committed
 * assets under `public/cards/` depend on it, which is why `cardImage()` and
 * `cardThumb()` interpolate it. This one addresses a DOCUMENT somebody found by
 * typing words. An underscore and a leading number are worth nothing in a URL and
 * cost a keyword; a hyphenated English name is the query.
 *
 * **IDENTICAL IN BOTH LOCALES, because card names are** (`## Card data`,
 * `## Localization` rule 1). That is what makes the `hreflang` pair a clean
 * `/arcana/X` <-> `/en/arcana/X` mapping with no per-locale slug table — S-D4's own
 * reason, and it is load-bearing for S2's helper.
 *
 * **NO SPECIAL CASES, AND `urlSlug.test.ts` ASSERTS THERE ARE NONE.** Four cards
 * carry no article and `Wheel of Fortune` keeps its `of`; both fall out of
 * lowercasing and hyphenating. `Judgement` keeps the British spelling because the
 * card does.
 *
 * DERIVED RATHER THAN TABULATED, and asserted against a committed table. A hand-
 * written map would be twenty-two chances to typo an address that can never change;
 * a derivation with a table test is one function and one list a reviewer can read.
 */
export function cardUrlSlug(card: Card): string {
  return card.name.toLowerCase().replace(/\s+/g, '-');
}

/**
 * The twenty-two URL slugs, in Fool's Journey order.
 *
 * For `generateStaticParams` and for S1's sitemap. **A `readonly string[]` and not a
 * literal union**: `cards.json` is generated, so there is nothing to derive a union
 * from at compile time, and the guarantee lives in `urlSlug.test.ts` instead — the
 * same place the address contract already lives.
 */
export const CARD_URL_SLUGS: readonly string[] = CARDS.map(cardUrlSlug);

/**
 * One card by its URL slug, or `undefined`.
 *
 * `undefined` rather than a throw, for exactly `cardById`'s reason: every caller is a
 * renderer, and the page turns the miss into `notFound()` where it can still send a
 * status. Case-sensitive and exact — `/arcana/The-Moon` is a different URL and must
 * 404 rather than quietly serving the same document at a second address, which is a
 * duplicate a crawler has to choose between.
 */
export function cardByUrlSlug(slug: string): Card | undefined {
  return CARDS.find((c) => cardUrlSlug(c) === slug);
}
```

### Green

```sh
npm test -- urlSlug        # 6 passing
npm test                   # the whole unit suite, still green
npm run typecheck
```

**Commit:** `S4-1: cardUrlSlug and cardByUrlSlug, asserted against roadmap §3.2`

---

### Task 2: the correspondence bridge

**Files**
- `src/lib/arcana/correspondence.ts` (new)
- `src/lib/arcana/correspondence.test.ts` (new)

### Why a new directory rather than `src/data/` or `src/content/`

Three constraints meet here and only one placement satisfies all of them.

- **It cannot go in `src/data/`.** It needs `ZodiacSign` and `signGloss` from
  `@/lib/numerology`, and `@/lib/numerology/arcana.ts` imports `CARDS` from
  `@/data/deck`. A `@/data/**` module importing the engine is a cycle, and
  `src/data/onboarding.ts`'s "NO IMPORTS OUTSIDE @/data" rule exists because `@/data`
  has to stay reachable from the edge.
- **It cannot go in `src/content/`.** §5 rule 1 fences that tree from client components,
  and S3's gallery zoom is a client component that legitimately wants the attribution
  label.
- **It must import `@/lib/numerology` and never `@/lib/numerology/glosses`.**
  `purity.test.ts` walks `src/**` and fails on any deep import; only the facade is
  reachable from outside that directory.

So: `src/lib/arcana/`, pure, client-importable, importing `@/data/deck`, `@/data/types`
and `@/lib/numerology` and nothing else.

### The failing test first

`src/lib/arcana/correspondence.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CARDS } from '@/data/deck';
import { SIGNS } from '@/lib/numerology';
import { ATTRIBUTIONS, attributionFor, rootCardFor } from './correspondence';

describe('the glyph attribution table', () => {
  it('covers every card exactly once, with no orphan keys', () => {
    // Twenty-two glyphs, twenty-two cards, and a glyph is a single non-ASCII
    // character in a source file -- so the failure mode is a mojibake key that
    // matches nothing and renders a gap. Assert both directions.
    const used = CARDS.map((c) => c.glyph);
    expect(new Set(used).size).toBe(22);
    expect(Object.keys(ATTRIBUTIONS).sort()).toEqual([...used].sort());
    for (const card of CARDS) {
      expect({ name: card.name, has: attributionFor(card) !== null })
        .toEqual({ name: card.name, has: true });
    }
  });

  it('agrees with cards.json about the element, for all twelve sign cards', () => {
    /*
     * **THE INVARIANT THAT MAKES THE WHOLE TABLE TRUSTWORTHY.** A mistyped glyph
     * almost certainly disagrees with the card's own element, and this names the
     * card when it does. Verified 2026-07-28: all twelve agree with the Golden
     * Dawn attributions and with `SIGNS` in astrology.ts, with no exceptions.
     */
    const signCards = CARDS.filter((c) => attributionFor(c)!.sign !== null);
    expect(signCards).toHaveLength(12);
    for (const card of signCards) {
      const sign = attributionFor(card)!.sign!;
      expect({ name: card.name, sign, element: SIGNS[sign].element })
        .toEqual({ name: card.name, sign, element: card.element });
    }
  });

  it('leaves the nine planetary cards and The Fool with no sign, on purpose', () => {
    // V1 has no planet table and this workstream is not inventing one: nine made-up
    // glosses to fill a layout hole is the "vague cosmic language" the v0.3.0 risk
    // table logs against exactly this page. Render nothing for a null (M14).
    const noSign = CARDS.filter((c) => attributionFor(c)!.sign === null);
    expect(noSign.map((c) => c.name).sort()).toEqual([
      'Judgement', 'The Empress', 'The Fool', 'The Hanged Man', 'The High Priestess',
      'The Magician', 'The Sun', 'The Tower', 'The World', 'Wheel of Fortune',
    ]);
  });

  it('names the two luminaries in Latin, so a label never collides with a card name', () => {
    // ☾ is The High Priestess's attribution and `The Moon` is a CARD. Labelling it
    // "The Moon" renders "The High Priestess -- The Moon", and on the lore page for
    // card 18 it renders "The Moon: The Moon". `Luna` and `Sol` are the standard
    // astrological names and they are proper nouns, so they are not translated copy.
    expect(attributionFor(CARDS[2])!.label.en).toBe('Luna');
    expect(attributionFor(CARDS[19])!.label.en).toBe('Sol');
    for (const card of CARDS) {
      const label = attributionFor(card)!.label;
      for (const other of CARDS) {
        expect({ card: card.name, label: label.en, clash: label.en === other.name })
          .toMatchObject({ clash: false });
      }
    }
  });

  it('translates the planets and leaves the signs alone', () => {
    // Sign names are the Latin names in Indonesian too (`Pisces`, not a translation),
    // so those pairs are identical BY DESIGN and that is not a missing translation.
    // Planet names do inflect: Merkurius, Saturnus, Neptunus, Matahari, Bulan.
    expect(attributionFor(CARDS[18])!.label).toEqual({ id: 'Pisces', en: 'Pisces' });
    expect(attributionFor(CARDS[1])!.label).toEqual({ id: 'Merkurius', en: 'Mercury' });
    expect(attributionFor(CARDS[21])!.label).toEqual({ id: 'Saturnus', en: 'Saturn' });
  });
});

describe('the root card', () => {
  it('folds eighteen to The Hermit and ten to The Magician', () => {
    expect(rootCardFor(CARDS[18])!.name).toBe('The Hermit');
    expect(rootCardFor(CARDS[10])!.name).toBe('The Magician');
    expect(rootCardFor(CARDS[21])!.name).toBe('The Empress');
  });

  it('is null for The Fool, for 1-9, and FOR JUSTICE', () => {
    /*
     * **THE JUSTICE CASE IS A TRAP AND IT EXISTS BECAUSE OF RECONCILIATION §5.3.**
     * `reduce(11)` is 11 -- the masters are FIXED POINTS since that amendment -- so
     * Justice's root card is Justice, and rendering "Justice reduces to Justice"
     * is a tautology dressed as a correspondence. Suppressed here rather than in
     * the page, so every future consumer inherits the suppression.
     *
     * The Fool is null because `reduce(0)` is 0 and `reduceToGloss(0)` is null:
     * zero is not a numerological quality (see reduce.ts's GlossNumber comment).
     * Cards 1-9 are their own root, which is equally not worth a sentence.
     */
    expect(rootCardFor(CARDS[0])).toBeNull();
    expect(rootCardFor(CARDS[11])).toBeNull();
    for (let id = 1; id <= 9; id++) expect(rootCardFor(CARDS[id])).toBeNull();
  });

  it('has one for exactly eleven cards', () => {
    const withRoot = CARDS.filter((c) => rootCardFor(c) !== null).map((c) => c.id);
    expect(withRoot).toEqual([10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
  });
});
```

```sh
npm test -- correspondence
```

**Expected failure:** `Failed to resolve import "./correspondence"`.

### The implementation

`src/lib/arcana/correspondence.ts`:

```ts
/**
 * The bridge from a card's `glyph` to the correspondence engine (S4, v0.4.0).
 *
 * **`Card.glyph` HAS BEEN IN `cards.json` SINCE THE FIRST RELEASE AND NOTHING HAS
 * EVER READ IT.** Twenty-two committed astrological attributions, unused: `grep -rn
 * glyph src` finds the type declaration and this file. The lore pages are the first
 * surface that needs them, and the reason this module exists rather than a lookup
 * inline in the page is that the join is checkable and the check is worth having.
 *
 * PURE and CLIENT-IMPORTABLE. Imports `@/data/*` and `@/lib/numerology` -- the
 * FACADE, never a leaf, because `purity.test.ts` fails on a deep import. It must not
 * acquire `server-only`: S3's gallery zoom is a client component and may want the
 * label.
 *
 * **IT IS NOT IN `src/data/` AND CANNOT BE.** `@/lib/numerology/arcana.ts` imports
 * `CARDS` from `@/data/deck`, so a `@/data/**` module importing the engine is a
 * cycle -- and `src/data/onboarding.ts`'s "NO IMPORTS OUTSIDE @/data" rule exists
 * because that tree has to stay reachable from the edge middleware.
 *
 * **IT IS NOT IN `src/content/` AND CANNOT BE**, because roadmap §5 rule 1 fences
 * that tree from client components.
 */
import type { Card, Localized, Locale } from '@/data/types';
import { CARDS } from '@/data/deck';
import {
  type ZodiacSign,
  SIGNS,
  arcanaFor,
  elementGloss,
  modalityGloss,
  reduceToGloss,
  signGloss,
} from '@/lib/numerology';

/** What kind of thing the glyph names. Decides which glosses exist. */
export type AttributionKind = 'sign' | 'planet' | 'element';

export type Attribution = {
  /** The character as it appears in `cards.json`. The lookup key. */
  glyph: string;
  kind: AttributionKind;
  /**
   * The name, per locale. **PROPER NOUNS, NOT COPY**, which is why they live beside
   * the table rather than in the message catalog: `Pisces` is `Pisces` in Indonesian
   * and `Mercury` is `Merkurius`, and neither is a translator's decision. Same
   * argument `## Localization` rule 1 makes about card names, one level out.
   */
  label: Localized<string>;
  /**
   * The `ZodiacSign` for the twelve sign cards, `null` for the other ten.
   *
   * NON-NULL IS WHAT UNLOCKS `signGloss` AND `modalityGloss`. The ten planetary
   * cards get neither and the fact strip is shorter for them; inventing nine planet
   * glosses to even it up is the failure this file is careful not to commit.
   */
  sign: ZodiacSign | null;
};

/**
 * Keyed by the glyph character, not by card id, and the test asserts both
 * directions.
 *
 * A glyph is one non-ASCII character in a source file, so the realistic failure is a
 * key that got mangled in an editor and matches nothing -- which renders a gap
 * rather than an error. Keying by the character means the test can compare
 * `Object.keys(ATTRIBUTIONS)` against `CARDS.map(c => c.glyph)` and fail with the
 * two sets printed.
 *
 * **CHECKED AGAINST THE GOLDEN DAWN'S ATTRIBUTIONS ON 2026-07-28** and all twenty-two
 * agree. For the twelve signs, `SIGNS[sign].element === card.element` with no
 * exceptions, which `correspondence.test.ts` asserts card by card.
 *
 * **`✧` IS THE ONE THAT IS NOT A PLANET OR A SIGN, AND IT IS CORRECT.** The Fool's
 * authentic Golden Dawn attribution is the ELEMENT Air -- Uranus is a modern
 * addition the source itself flags as outside the original system -- so the aether
 * mark is right and `♅` would be the anachronism. The Hanged Man (`♆`) and Judgement
 * (`♇`) are the two places this deck DID take the modern planets, and they are
 * labelled as such rather than back-dated to Water and Fire.
 */
export const ATTRIBUTIONS: Record<string, Attribution> = {
  '✧': { glyph: '✧', kind: 'element', label: { id: 'Udara (eter)', en: 'Air (aether)' }, sign: null },
  '☿': { glyph: '☿', kind: 'planet', label: { id: 'Merkurius', en: 'Mercury' }, sign: null },
  // `Luna`, not `The Moon`: the label must never collide with a card name, and on
  // `/arcana/the-moon` the naive spelling renders "The Moon: The Moon".
  '☾': { glyph: '☾', kind: 'planet', label: { id: 'Bulan', en: 'Luna' }, sign: null },
  '♀': { glyph: '♀', kind: 'planet', label: { id: 'Venus', en: 'Venus' }, sign: null },
  '♈': { glyph: '♈', kind: 'sign', label: { id: 'Aries', en: 'Aries' }, sign: 'aries' },
  '♉': { glyph: '♉', kind: 'sign', label: { id: 'Taurus', en: 'Taurus' }, sign: 'taurus' },
  '♊': { glyph: '♊', kind: 'sign', label: { id: 'Gemini', en: 'Gemini' }, sign: 'gemini' },
  '♋': { glyph: '♋', kind: 'sign', label: { id: 'Cancer', en: 'Cancer' }, sign: 'cancer' },
  '♌': { glyph: '♌', kind: 'sign', label: { id: 'Leo', en: 'Leo' }, sign: 'leo' },
  '♍': { glyph: '♍', kind: 'sign', label: { id: 'Virgo', en: 'Virgo' }, sign: 'virgo' },
  '♃': { glyph: '♃', kind: 'planet', label: { id: 'Jupiter', en: 'Jupiter' }, sign: null },
  '♎': { glyph: '♎', kind: 'sign', label: { id: 'Libra', en: 'Libra' }, sign: 'libra' },
  '♆': { glyph: '♆', kind: 'planet', label: { id: 'Neptunus', en: 'Neptune' }, sign: null },
  '♏': { glyph: '♏', kind: 'sign', label: { id: 'Scorpio', en: 'Scorpio' }, sign: 'scorpio' },
  '♐': { glyph: '♐', kind: 'sign', label: { id: 'Sagittarius', en: 'Sagittarius' }, sign: 'sagittarius' },
  '♑': { glyph: '♑', kind: 'sign', label: { id: 'Capricorn', en: 'Capricorn' }, sign: 'capricorn' },
  '♂': { glyph: '♂', kind: 'planet', label: { id: 'Mars', en: 'Mars' }, sign: null },
  '♒': { glyph: '♒', kind: 'sign', label: { id: 'Aquarius', en: 'Aquarius' }, sign: 'aquarius' },
  '♓': { glyph: '♓', kind: 'sign', label: { id: 'Pisces', en: 'Pisces' }, sign: 'pisces' },
  '☉': { glyph: '☉', kind: 'planet', label: { id: 'Matahari', en: 'Sol' }, sign: null },
  '♇': { glyph: '♇', kind: 'planet', label: { id: 'Pluto', en: 'Pluto' }, sign: null },
  '♄': { glyph: '♄', kind: 'planet', label: { id: 'Saturnus', en: 'Saturn' }, sign: null },
};

/** `null` only if the deck ever gains a glyph this table does not know. */
export function attributionFor(card: Card): Attribution | null {
  return ATTRIBUTIONS[card.glyph] ?? null;
}

/**
 * The card a card's number folds to, or `null` when there is nothing to say.
 *
 * **THREE NULL CASES AND ONE OF THEM IS A TRAP.**
 *
 *   - The Fool: `reduce(0)` is 0 and `reduceToGloss(0)` is null, because zero is not
 *     a numerological quality (`reduce.ts`'s `GlossNumber` comment).
 *   - Cards 1-9: their own root. "The Hermit reduces to The Hermit" is not a
 *     correspondence.
 *   - **JUSTICE, and only because of reconciliation §5.3.** `reduce(11)` is 11 --
 *     the master numbers are FIXED POINTS since that amendment -- so `arcanaFor` maps
 *     eleven back to Justice. Suppressed HERE and not in the page, so the next
 *     consumer inherits it.
 *
 * Eleven cards have a root: 10 and 12 through 21. Wheel of Fortune folds to The
 * Magician, which is the traditional "the Wheel is the Magician at a higher octave",
 * and The Moon folds to The Hermit -- the card that carries its own lamp standing
 * behind the card whose light was not its choice. These are real internal links, not
 * filler ones.
 */
export function rootCardFor(card: Card): Card | null {
  const n = reduceToGloss(card.id);
  if (n === null) return null;
  const root = arcanaFor(n);
  return root.id === card.id ? null : root;
}

/** Everything the page's fact strip and lore need, in one locale. */
export type ArcanaFacts = {
  card: Card;
  urlSlug: string;
  attribution: Attribution;
  /** Non-null for the twelve sign cards only. */
  signGloss: string | null;
  /** Non-null for the twelve sign cards only. `cardinal` / `fixed` / `mutable`. */
  modality: 'cardinal' | 'fixed' | 'mutable' | null;
  modalityGloss: string | null;
  /** Always present -- every card has an element. */
  elementGloss: string;
  root: Card | null;
};

export function arcanaFactsFor(card: Card, locale: Locale, urlSlug: string): ArcanaFacts {
  const attribution = attributionFor(card);
  if (attribution === null) {
    throw new Error(`no attribution for glyph ${JSON.stringify(card.glyph)} (${card.name})`);
  }
  const sign = attribution.sign;
  return {
    card,
    urlSlug,
    attribution,
    signGloss: sign === null ? null : signGloss(sign, locale),
    modality: sign === null ? null : SIGNS[sign].modality,
    modalityGloss: sign === null ? null : modalityGloss(SIGNS[sign].modality, locale),
    elementGloss: elementGloss(card.element, locale),
    root: rootCardFor(card),
  };
}

/**
 * Up to `n` other cards sharing a field, chosen DETERMINISTICALLY by walking ids
 * upward and wrapping.
 *
 * **DETERMINISTIC MATTERS MORE THAN INTERESTING HERE.** These are the internal links
 * a crawler sees, and a link set that differs between two builds is crawl churn on
 * forty-four pages for no editorial gain. Walking ids and wrapping gives the same
 * answer forever and spreads the inbound links evenly instead of pointing every
 * fire card at The Sun.
 *
 * Capped because fire has six members and stage `reckoning` has seven; an
 * eleven-link row at 320px is a wall.
 */
export function relatedByElement(card: Card, n = 3): Card[] {
  return walkFrom(card, (c) => c.element === card.element, n);
}

export function relatedByStage(card: Card, n = 3): Card[] {
  return walkFrom(card, (c) => c.stage === card.stage, n);
}

function walkFrom(card: Card, keep: (c: Card) => boolean, n: number): Card[] {
  const out: Card[] = [];
  for (let step = 1; step < CARDS.length && out.length < n; step++) {
    const candidate = CARDS[(card.id + step) % CARDS.length];
    if (candidate.id !== card.id && keep(candidate)) out.push(candidate);
  }
  return out;
}

/**
 * The card before and after, WRAPPING at both ends.
 *
 * The Fool's previous is The World and The World's next is The Fool, which is both
 * traditionally true -- the Fool's Journey closes -- and gives all twenty-two pages
 * the same outbound link degree. A ragged link graph with two pages at half the
 * degree of the rest is worse for no reason.
 */
export function neighboursOf(card: Card): { previous: Card; next: Card } {
  const n = CARDS.length;
  return {
    previous: CARDS[(card.id - 1 + n) % n],
    next: CARDS[(card.id + 1) % n],
  };
}
```

### Green

```sh
npm test -- correspondence   # 8 passing
npm test -- purity           # the engine's own fence: only the facade is imported
npm test && npm run typecheck
```

`purity.test.ts`'s last assertion — *"only `index.ts` is imported from outside the
directory"* — is the one that would fail on a careless deep import here. Run it by name
and read the output; that assertion existing is why this file imports the facade.

**Commit:** `S4-2: glyph attributions and the bridge to the correspondence engine`

---

### Task 3: `src/content/types.ts` — the block union and `LoreDoc`

**THE S4 <-> S6 SEAM. Roadmap §12 names it; §`## Deltas requested` item 11 states the
contract in one sentence.** S4 writes this file and defines `Block`, `BlockKind`, `QA`,
`LORE_ANCHORS`, `LoreAnchor` and `LoreDoc`. **S6 appends `BlogDoc` to this same file and
touches nothing above it.** One file, two disjoint declarations, one owner each — which is
what roadmap §5's tree asks for and is unambiguous about who breaks what.

**Files**
- `src/content/types.ts` (new)
- `src/content/types.test.ts` (new)

### The failing test first

`src/content/types.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LORE_ANCHORS, type Block } from './types';

const SOURCE = readFileSync(join(process.cwd(), 'src/content/types.ts'), 'utf8');
const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the content block union', () => {
  it('has exactly the five kinds roadmap §5 rule 3 names', () => {
    // heading / paragraph / list / quote / card-reference. A sixth kind is a
    // decision, not a convenience, and it has to be argued for in reconciliation.
    const kinds: Block['kind'][] = ['heading', 'paragraph', 'list', 'quote', 'cardRef'];
    // Exhaustiveness proved at compile time by the assignment above plus the
    // renderer's `never` default; asserted at runtime so a widened union that
    // typechecks still fails here.
    expect(kinds).toHaveLength(5);
    for (const k of kinds) expect(code).toContain(`kind: '${k}'`);
  });

  it('HAS NO `html` KIND AND NO `raw` KIND, and never will', () => {
    /*
     * Roadmap §5 rule 3 and §10. The CSP is `script-src 'self' 'unsafe-inline'` in
     * REPORT-ONLY and the goal is to tighten it. A block carrying markup is a
     * `dangerouslySetInnerHTML` call site waiting to be written, and the cost is
     * not a theoretical XSS on authored content -- it is a permanent new reason the
     * policy can never be enforced.
     */
    for (const banned of ['html', 'raw', 'markdown', 'jsx']) {
      expect({ banned, present: new RegExp(`kind: '${banned}'`).test(code) })
        .toMatchObject({ present: false });
    }
    expect(code).not.toContain('dangerouslySetInnerHTML');
  });

  it('makes a quote carry its source, and a list carry no ordering', () => {
    // A quote with no attribution, on a page making claims about tradition, is
    // exactly what reads as invented -- so `source` is REQUIRED, not optional.
    expect(code).toMatch(/kind: 'quote';[\s\S]{0,120}source: string/);
    expect(code).not.toMatch(/kind: 'quote';[\s\S]{0,120}source\?/);
    // No `ordered`: a numbered list in lore is a how-to, and a how-to about reading
    // tarot is S6's article, not a card's page.
    expect(code).not.toContain('ordered');
  });

  it('is a LEAF: no react, no next, no server-only, no db', () => {
    // §5 rule 2: pure and client-importable, the same split as
    // `moderation/types.ts` against `blocklist.ts`. It may name `@/data/types`,
    // which has no imports of its own.
    const specs = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(specs).toEqual(['@/data/types']);
    expect(code).not.toContain('server-only');
  });

  it('offers a closed anchor set with more than one member per card to choose from', () => {
    // §8.2's enforcement hook: the `id` and `en` documents for one card must lead
    // with DIFFERENT anchors, so the set has to be big enough that twenty-two pairs
    // are possible without contrivance.
    expect(LORE_ANCHORS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(LORE_ANCHORS).size).toBe(LORE_ANCHORS.length);
  });
});
```

```sh
npm test -- content/types
```

**Expected failure:** `Failed to resolve import "./types" from "src/content/types.test.ts"`.

### The implementation

`src/content/types.ts`:

```ts
/**
 * The shape of authored public content (S4, roadmap §5).
 *
 * PURE AND CLIENT-IMPORTABLE. The prose modules beside it are NOT -- §5 rule 1
 * fences `src/content/**` from client components and `clientBoundary.test.ts` gains
 * the rule in Task 6. This file is the exception, and it is the same split
 * `moderation/types.ts` has against `blocklist.ts` and `share/types.ts` against
 * `share/links.ts`: the SHAPE crosses the boundary, the CONTENT does not.
 *
 * ── OWNERSHIP, BECAUSE TWO WORKSTREAMS WRITE HERE ───────────────────────────────
 *
 * **S4 owns everything above the `BlogDoc` marker. S6 owns `BlogDoc` and appends it
 * below.** Roadmap §12 names this as one of two seams in v0.4.0 and §5's tree puts
 * both document types in one file; splitting them into two files would have been
 * tidier and would have made the shared thing -- `Block`, which one renderer
 * consumes -- ambiguous about who may widen it. Nobody widens it: a sixth block kind
 * is a reconciliation question.
 *
 * ── WHY PROSE IS DATA AND NOT TSX ───────────────────────────────────────────────
 *
 * `terms.id.tsx` is this codebase's precedent for long-form bilingual prose and it
 * settles the question §5 rule 4 asks it to settle: **MDX is not added.** It does
 * not settle this one. §11.4 requires a copy lint -- the Malay grep, the therapy
 * lists, the English tic list -- over every word of this content, and a lint needs
 * exact strings. In a `.tsx` document a sentence is split across text nodes by
 * `{' '}`, punctuation arrives as `&ldquo;`, and `\btempoh\b` can straddle a JSX
 * boundary and never match. One `text: string` per paragraph gives the lint the
 * sentence a reader will read. **THE LINT IS THE REASON THIS IS DATA.** Anyone
 * converting these files to TSX for authoring comfort switches the release's only
 * quality gate off, silently.
 *
 * Consequence, embraced: typographic characters go in the source LITERALLY -- an em
 * dash is `—`, a quote is `"`. Never an HTML entity. React escapes on render, the
 * file is UTF-8, and the lint sees what the reader sees. Task 6 forbids `<tag>` and
 * `&entity;` in any `text` field.
 */
import type { Locale, YesNo } from '@/data/types';

/**
 * One unit of prose. Rendered by `src/components/Prose.tsx` and by nothing else.
 *
 * **NO `html`, NO `raw`, NO `markdown` VARIANT, EVER** (§5 rule 3, §10). The CSP is
 * `script-src 'self' 'unsafe-inline'` in report-only and the goal is to TIGHTEN it.
 * A markup-carrying block is a `dangerouslySetInnerHTML` call site waiting to be
 * written, and what it costs is not a theoretical injection on prose we wrote --
 * it is a permanent new reason the policy can never be enforced.
 */
export type Block =
  /**
   * `level` is 2 or 3 and NEVER 1: the page owns its single `<h1>` and a document
   * that could emit a second one would break the one heading rule a crawler
   * actually reads. Never used for styling -- if a line needs to be large and is
   * not a section, it is a paragraph and the CSS says so.
   */
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  /** Unordered only. See the file header's note on `ordered`. */
  | { kind: 'list'; items: string[] }
  /**
   * `source` is REQUIRED. A quotation with no attribution, on a page making claims
   * about a tradition, is precisely what reads as invented -- and the roadmap's
   * ruling is that lore may be invented where tradition is SILENT, which is only
   * an honest position if the parts that are not invented are sourced.
   */
  | { kind: 'quote'; text: string; source: string }
  /**
   * An inline link to another card's page. `slug` is a URL slug (S-D4) and Task 6
   * asserts every one of them resolves through `cardByUrlSlug` -- a dead internal
   * link on forty-four pages is a real cost and nothing would notice it by eye.
   *
   * The href is built by the RENDERER from the locale it resolves itself, so a
   * document never spells `/en/` and can never be wrong about the prefix.
   */
  | { kind: 'cardRef'; slug: string; text: string };

export type BlockKind = Block['kind'];

/** One question and its answer. Content, never `FAQPage` markup (S-D16). */
export type QA = { q: string; a: string };

/**
 * The tradition detail a document LEADS its lore with.
 *
 * **THIS FIELD EXISTS TO MAKE §8.2 MECHANICAL.** "English content is rewritten, not
 * translated" is checked three ways in Task 6, and this is the cheapest and the
 * hardest to fake: the `id` and `en` documents for one card must not share an
 * anchor. It forces the writer to PLAN the divergence instead of discovering
 * afterwards that they translated.
 */
export const LORE_ANCHORS = [
  'goldenDawnTitle',
  'hebrewLetter',
  'path',
  'marseille',
  'rws',
  'sign',
  'number',
  'element',
  'stage',
  'polarity',
] as const;

export type LoreAnchor = (typeof LORE_ANCHORS)[number];

/** One card's lore, in one locale. One file per document, 44 files. */
export type LoreDoc = {
  /**
   * The URL slug, and the filename's first segment. **DERIVABLE from `cardId`, and
   * carried anyway**, for `Legal.tsx`'s stated reason about clause anchors: it makes
   * the address GREPPABLE. `grep -rn "the-moon" src/content` finds the document, its
   * registry entry and every `cardRef` pointing at it. Task 6 asserts it equals
   * `cardUrlSlug(cardById(cardId))`, so the redundancy is collapsed rather than
   * trusted -- the same move §3.2's table makes.
   */
  slug: string;
  /** Asserted against the filename's second segment. */
  locale: Locale;
  /** 0-21. The join to `cards.json`, the correspondence engine and analytics. */
  cardId: number;

  /**
   * The whole `<title>`. **NO BRAND**, and 60 characters is the reason: the SERP
   * budget is finite and `Tarot Major Arcana` earns more on a query nobody knows us
   * by than `| JMTarot` does. Task 6 asserts <= 65 characters, and that it contains
   * the card's English name and its numeral in parentheses.
   *
   *   id: 'Arti Kartu The Moon (XVIII) — Tarot Major Arcana'
   *   en: 'The Moon (XVIII) Tarot Card Meaning — Upright & Reversed'
   */
  title: string;
  /**
   * `<meta name="description">`. Task 6 asserts 110-165 characters: under 110 wastes
   * a slot Google will fill from the body instead, over 165 is truncated mid-clause.
   * It is not a summary of the page, it is the sentence that earns the click.
   */
  description: string;
  /** The single `<h1>`. Not the same string as `title`. */
  h1: string;
  /**
   * One sentence under the `<h1>`, before anything else. The answer a reader came
   * for, above the fold, on a phone.
   */
  standfirst: string;
  /**
   * The art's `alt`. **A DESCRIPTION OF THE PAINTING, NEVER THE CARD NAME REPEATED**
   * -- the name is already in the `<h1>`, the caption and the surrounding prose, and
   * a fourth copy in `alt` is noise to a screen reader and to a crawler.
   *
   * Task 6 asserts it does NOT start with the card name and is at least 60
   * characters. **THE AUTHOR MUST LOOK AT `public/cards/<artSlug>.webp` BEFORE
   * WRITING IT**; describing a Rider-Waite card from memory is how this field
   * becomes false, and this deck is its own painting.
   */
  imageAlt: string;
  /** Which tradition detail the lore leads with. Must differ across the pair. */
  anchor: LoreAnchor;

  /** Upright reading. 2-4 blocks. */
  upright: Block[];
  /** Reversed reading. 2-4 blocks. */
  reversed: Block[];
  /**
   * The yes/no verdict, AS DATA, plus the sentence the writer builds from it.
   *
   * **ASSERTED AGAINST `effectiveYesNo()` IN TASK 6 AND THEREFORE NOT DUPLICATION**
   * -- the same shape §3.2's slug table has. It is here because the flip is
   * counter-intuitive and a writer following the mood of the artwork will get it
   * backwards: **The Moon answers `no` upright and `yes` reversed.** Getting that
   * wrong on a public page contradicts the verdict the app itself would print, which
   * is the exact failure roadmap §7 names.
   */
  yesno: { upright: YesNo; reversed: YesNo; note: string };
  /** Tradition, the glyph, the number, the painting. 6-12 blocks. */
  lore: Block[];
  /**
   * How the card lands in a reading. 1-3 blocks.
   *
   * **IT MAY NAME THE THREE SERVICES AND THE THREE POSITIONS AND NOTHING ELSE ABOUT
   * HOW THE APP WORKS** (S-D7's corollary, and the same constraint roadmap §7 puts
   * on S6's article). No prompt, no model, no chaining, no card-frequency scoring,
   * no Shadow Arcana, no Lotus, no persona. Task 6 greps for all of those.
   */
  inSpread: Block[];
  /**
   * Q&A CONTENT. 3-5 pairs. **No `FAQPage` markup** (S-D16): Google restricted FAQ
   * rich results to authoritative government and health sites in August 2023, so the
   * schema buys approximately nothing. The content still earns its place for the
   * reader and for long-tail matching, which is why it is written and not skipped.
   */
  questions: QA[];
};

/* ────────────────────────────────────────────────────────────────────────────────
 * S6 APPENDS `BlogDoc` BELOW THIS LINE AND CHANGES NOTHING ABOVE IT.
 * `Block`, `BlockKind` and `QA` are shared; `LoreDoc` is S4's alone.
 * ──────────────────────────────────────────────────────────────────────────── */
```

### Green

```sh
npm test -- content/types    # 5 passing
npm test && npm run typecheck
```

**Commit:** `S4-3: src/content/types.ts -- the block union and LoreDoc`

---

### Task 4: `Prose` — the one block renderer

**Files**
- `src/components/Prose.tsx` (new)
- `src/components/Prose.module.css` (new)
- `src/components/Prose.test.ts` (new — source-level, like `ReadingView.test.ts`)

### Two decisions that will otherwise be undone

**It is a SERVER component with no `'use client'`.** `Legal.tsx`'s header states the
reason for exactly this shape of content: *"these are static prose and shipping a
hydration bundle for a document nobody interacts with would be waste on the one page a
stranger reads over mobile data."* A lore page is that page, forty-four times.

**It resolves the locale ITSELF with `await getLocale()` and takes no `locale` prop.**
`LocaleProvider`'s header says **"NO LOCALE PROP IS DRILLED ANYWHERE"**, and CLAUDE.md's
`/s/` section spends a paragraph on why a prop was the wrong mechanism there. A server
component has `getLocale()`, which is `cache()`d, so calling it per `Prose` costs one
`headers()` read for the whole render. The side effect is desirable: importing
`@/lib/i18n/t` makes this file permanently unreachable from a client component, and
`clientBoundary.test.ts` already fences that import.

### The failing test first

`src/components/Prose.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(join(process.cwd(), 'src/components/Prose.tsx'), 'utf8');
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('the prose renderer', () => {
  it('reads the file, so nothing below passes vacuously', () => {
    expect(SRC).toContain('export async function Prose');
    expect(code.length).toBeGreaterThan(400);
  });

  it('NEVER uses dangerouslySetInnerHTML', () => {
    expect(code).not.toContain('dangerouslySetInnerHTML');
  });

  it('is a server component and drills no locale prop', () => {
    expect(SRC).not.toMatch(/^\s*(['"])use client\1/m);
    expect(code).toContain('await getLocale()');
    expect(code).not.toMatch(/locale\s*[,}:]/);      // no `locale` in the props type
  });

  it('handles every block kind and proves exhaustiveness with `never`', () => {
    for (const kind of ['heading', 'paragraph', 'list', 'quote', 'cardRef']) {
      expect({ kind, handled: code.includes(`case '${kind}'`) })
        .toMatchObject({ handled: true });
    }
    // A sixth kind added to the union must be a COMPILE error, not a blank render.
    expect(code).toContain('never');
  });

  it('emits h2 and h3 only, never h1', () => {
    expect(code).not.toMatch(/<h1[\s>]/);
    expect(code).toContain('<h2');
    expect(code).toContain('<h3');
  });

  it('builds a cardRef href through the locale path helper, never by hand', () => {
    // Forty-four pages hand-writing `/en/` is forty-four chances to emit the wrong
    // tree. S2 owns the one helper; this file calls it.
    expect(code).toContain('localePath');
    expect(code).not.toMatch(/['"`]\/en\/arcana/);
  });

  it('prefetches nothing', () => {
    // Ten prefetches per page, on CDN-cached content, for a visitor who will follow
    // at most one link.
    expect(code).toContain('prefetch={false}');
  });
});
```

```sh
npm test -- Prose
```

**Expected failure:** `ENOENT: no such file or directory, open '.../src/components/Prose.tsx'`.

### The implementation

`src/components/Prose.tsx`:

```tsx
import Link from 'next/link';
import type { Block } from '@/content/types';
import { getLocale } from '@/lib/i18n/t';
import { localePath } from '@/lib/i18n/resolve';
import styles from './Prose.module.css';

/**
 * The ONE renderer for `src/content/**`'s block union. S4 owns it; S6 mounts it too.
 *
 * **A SERVER COMPONENT, DELIBERATELY.** `Legal.tsx`'s header gives the reason for
 * this exact shape of content: static prose, no interaction, and a hydration bundle
 * for a document nobody touches is waste on the one page a stranger reads over
 * mobile data. Forty-four of those pages.
 *
 * **IT RESOLVES THE LOCALE ITSELF AND TAKES NO `locale` PROP.**
 * `LocaleProvider`'s header says "NO LOCALE PROP IS DRILLED ANYWHERE", and
 * CLAUDE.md's `/s/` section records what drilling one would have cost there.
 * `getLocale()` is `cache()`d, so N calls in one render are one `headers()` read.
 * Importing `@/lib/i18n/t` also makes this file permanently unreachable from a
 * client component, which `clientBoundary.test.ts` already enforces -- a feature,
 * because a content module must never reach the browser (§5 rule 1).
 *
 * **NO `dangerouslySetInnerHTML`, and the union has no markup-carrying kind.** §10.
 *
 * The `switch` is exhaustive and the `never` assignment is what makes a sixth block
 * kind a compile error rather than a silently blank paragraph.
 */
export async function Prose({ blocks }: { blocks: readonly Block[] }) {
  const locale = await getLocale();

  return (
    <>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'heading':
            /*
             * LEVEL 2 OR 3, NEVER 1. The page owns its single `<h1>`; a document
             * that could emit a second one breaks the one heading signal a crawler
             * reliably reads. And never a heading for size -- `Prose.module.css`
             * styles sections, and a line that needs to be big and is not a section
             * is a paragraph.
             */
            return block.level === 2 ? (
              <h2 key={i} className={styles.h2}>{block.text}</h2>
            ) : (
              <h3 key={i} className={styles.h3}>{block.text}</h3>
            );

          case 'paragraph':
            return <p key={i} className={styles.p}>{block.text}</p>;

          case 'list':
            return (
              <ul key={i} className={styles.list}>
                {block.items.map((item, j) => (
                  <li key={j} className={styles.li}>{item}</li>
                ))}
              </ul>
            );

          case 'quote':
            /*
             * `<figure>`/`<figcaption>` rather than a bare `<blockquote>` plus a
             * `<p>`: the attribution is part of the quotation's meaning on a page
             * making claims about a tradition, and `figcaption` is the element that
             * says so to a screen reader.
             */
            return (
              <figure key={i} className={styles.quote}>
                <blockquote className={styles.quoteText}>{block.text}</blockquote>
                <figcaption className={styles.quoteSource}>{block.source}</figcaption>
              </figure>
            );

          case 'cardRef':
            /*
             * The href is built HERE, from the resolved locale, so no document ever
             * spells `/en/` and no document can be wrong about the prefix. S2 owns
             * `localePath`; forty-four pages hand-writing it is forty-four chances
             * to point at the wrong tree.
             *
             * `prefetch={false}`: ten links per page on CDN-cached content for a
             * visitor who will follow at most one. `next/link` still emits a real
             * `<a href>` in the HTML, so a crawler follows it either way.
             */
            return (
              <p key={i} className={styles.p}>
                <Link
                  className={styles.cardRef}
                  href={localePath(locale, `/arcana/${block.slug}`)}
                  prefetch={false}
                >
                  {block.text}
                </Link>
              </p>
            );

          default: {
            const unhandled: never = block;
            return unhandled;
          }
        }
      })}
    </>
  );
}
```

`src/components/Prose.module.css` — tokens only, and `Legal.module.css` is the model.
Copy its `.p`, `.list`, `.li` and `.callout` rules verbatim in spirit: `--fs-reading` /
`--lh-reading` / `--text-warm` for body, `var(--font-body)` for prose and
`var(--font-display)` for headings, `--gold` for `.h2`, `--text-warm` for `.h3`,
`--gold-hairline` for the quote's left rule, `--gold` with `text-decoration: underline;
text-underline-offset: 3px` for `.cardRef`. `scroll-margin-block-start: 24px` on both
headings for the same reason `Legal.module.css` has it.

**No new token.** If a rule seems to want one, it wants an existing one.

### Green

```sh
npm test -- Prose            # 7 passing
npm test && npm run typecheck
```

**Commit:** `S4-4: Prose -- the one block renderer, server-side, exhaustive`

---

### Task 5: The Moon, both locales, and the registry

**THE TWO EXEMPLARS. These are the quality bar for the other forty-two.** Register:
dark, unsentimental, concrete. The Indonesian must read as though an Indonesian wrote it.

**Files**
- `src/content/arcana/the-moon.id.ts` (new)
- `src/content/arcana/the-moon.en.ts` (new)
- `src/content/arcana/index.ts` (new)
- `src/content/arcana/registry.test.ts` (new)

### Research done for this card, and the shape of the research every card needs

Verified before writing, with sources:

- **Attribution: Pisces** — mutable water. Golden Dawn title **"Ruler of Flux and
  Reflux"**. Hebrew letter **Qoph**, traditionally tied to the back of the head and to
  sleep — receptive consciousness, what absorbs before it reasons. Path from **Netzach to
  Malkuth**, the last stretch before the material world.
  ([angelorum](https://angelorum.co/topics/divination/golden-dawn-astrologica/),
  [paulomara](https://paulomara.com/the-moon/),
  [Illumination Tarot](https://www.illuminationtarot.com/kabbalah/the-moon.html))
- **Rider-Waite**: a full moon with a face in profile between two towers; a narrow path
  from a pool through the towers to distant mountains; a crayfish emerging from the pool;
  a dog and a wolf howling from opposite sides. Waite on the crayfish: *"that which lies
  deeper than the savage beast."*
  ([Occult Encyclopedia](https://www.occult.live/index.php?title=The_Moon))
- **Our painting**, looked at directly (`public/cards/18_moon.webp`, and **this step is
  not optional per card**): the moon's face is turned **down**, not out. Both towers are
  **ruined** and crenellated. A wolf howls from the left parapet and a paler dog from the
  right; a **skull** sits on the right-hand stonework and bone lies in the shallows.
  Tattered banners hang along the road, which is cobbled, perfectly straight, and runs to
  a city that is rubble. The pool in the foreground is **fouled with blood**, and a
  crayfish is hauling itself out of it.
- **Engine facts:** element `water`, stage `reckoning`, polarity `shadow` (reversed →
  `light`), yesno `no` (reversed → **`yes`**), keywords `mimpi/ilusi/pasang` and
  `dreams/illusion/tides`. `reduce(18) = 9` → **The Hermit**.

### The divergence plan for this pair, and the rule it follows

**Rewritten means different images and a different entry angle. It does NOT mean a
different meaning** — the meaning is fixed by `cardMeaning()` and by `effectiveYesNo()`,
and a pair that disagreed about the card would be two bugs rather than one rewrite.

|  | `id` | `en` |
|---|---|---|
| `anchor` | `goldenDawnTitle` — flux and reflux, then Qoph | `path` — Netzach down into Malkuth |
| upright's images | walking with two steps of visibility; night; guessing | insufficient light on a road; a survey with half the answers missing; estimating |
| reversed's images | two in the morning; rereading one message seven times | a hunch that gets specific vs a fear that changes its story |
| Q&A | is it bad / about other people / yes-or-no | is it bad / is someone lying / timing |

Task 6's DIVERGENCE table therefore forbids `step`, `night`, `guess`, `message`, `seven`
and `two in the morning` from the **English `upright` and `reversed` sections only**. The
`lore` section is **exempt**, and the exemption is principled rather than convenient: both
documents describe **one painting**, so they must share its nouns — towers, wolf, dog,
crayfish, skull. `glosses.ts` exempts its element glosses from its own DIVERGENCE table
for the same shape of reason and says so. Interpretation may not share imagery; a
description of a shared object must.

### `src/content/arcana/the-moon.id.ts`

```ts
import type { LoreDoc } from '@/content/types';

/**
 * The Moon (XVIII), Indonesian. **THE SOURCE DOCUMENT OF THE PAIR.**
 *
 * MALAY CHECK: no `kerjaya`, `hala tuju`, `sembang`, `awak`, `tempoh`, `kerana`,
 * `iaitu`, `ianya`, `manakala`, `seronok`, `kelmarin`. `kamu` throughout.
 * NO THERAPY, DIAGNOSIS OR HEALING LANGUAGE. `Major Arcana` stays English.
 * CARD NAMES STAY ENGLISH -- `The Moon`, never `Sang Bulan` and never `Pulan`.
 *
 * AGREES WITH THE ENGINE: yesno `no` upright, `yes` reversed (`effectiveYesNo`
 * flips it, and Task 6 asserts these two fields against it). Polarity `shadow`
 * upright, `light` reversed. Root card The Hermit, from `reduce(18) = 9`.
 */
export const theMoonId: LoreDoc = {
  slug: 'the-moon',
  locale: 'id',
  cardId: 18,
  anchor: 'goldenDawnTitle',

  title: 'Arti Kartu The Moon (XVIII) — Tarot Major Arcana',
  description:
    'The Moon (XVIII) bicara soal yang belum jelas: mimpi, ilusi, dan pasang yang ' +
    'naik tanpa diminta. Arti tegak, terbalik, dan lambang Pisces di baliknya.',
  h1: 'Arti Kartu The Moon (XVIII)',
  standfirst:
    'Kartu kedelapan belas Major Arcana. Bukan kartu kebohongan — kartu cahaya yang ' +
    'tidak cukup untuk melihat, dan keputusan yang tetap harus diambil di dalamnya.',
  imageAlt:
    'Bulan penuh berwajah menunduk tergantung di antara dua menara yang sudah runtuh; ' +
    'seekor serigala dan seekor anjing melolong dari dua sisi jalan batu, dan seekor ' +
    'udang karang merangkak keluar dari kolam gelap di depan.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Tegak, The Moon tidak menuduh siapa-siapa berbohong. Dia cuma memberi tahu ' +
        'bahwa penerangannya kurang. Jalannya masih jalan yang sama dan tujuannya belum ' +
        'pindah; yang berubah adalah seberapa jauh ke depan kamu bisa melihat malam ini.',
    },
    {
      kind: 'paragraph',
      text:
        'Apa yang sedang dibisikkan oleh hal yang belum jelas biasanya benar sebagian, ' +
        'dan justru "sebagian" itu masalahnya. Kalau dibuang, kamu ikut membuang sinyal ' +
        'yang sungguhan. Kalau dituruti seluruhnya, kamu menyusun rencana di atas ' +
        'keterangan yang separuhnya belum masuk.',
    },
    {
      kind: 'paragraph',
      text:
        'Karena itu kartu ini jarang menyuruh menunggu sampai semuanya pasti. Sering ' +
        'kali kepastian itu memang tidak akan datang. Yang dia tawarkan adalah izin ' +
        'untuk melangkah sambil tahu bahwa kamu sedang menebak — dan itu jauh lebih ' +
        'aman daripada menebak sambil merasa yakin.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, arahnya membalik. Bukan lagi hal samar yang berbicara kepadamu, ' +
        'tapi rasa takutmu sendiri yang berbicara, dan kamu memperlakukannya sebagai ' +
        'pertanda.',
    },
    {
      kind: 'paragraph',
      text:
        'Ini kartu jam dua pagi. Membaca ulang satu pesan sampai tujuh kali. Menyusun ' +
        'cerita yang lengkap dari satu kalimat yang terpotong. Bedanya dengan intuisi ' +
        'tidak ada di rasanya — rasanya persis sama dari dalam — tapi di apa yang ' +
        'terjadi kalau kamu memeriksanya: intuisi bertahan dan makin jelas, ketakutan ' +
        'berubah ceritanya setiap kali ditanya kedua kali.',
    },
    {
      kind: 'paragraph',
      text:
        'Jadi kartu ini terbalik jarang minta kamu berani. Dia minta kamu memeriksa. ' +
        'Satu pertanyaan yang jawabannya bisa dicek hari ini lebih berguna daripada ' +
        'satu malam penuh menebak.',
    },
  ],

  yesno: {
    upright: 'no',
    reversed: 'yes',
    note:
      'Tegak, jawabannya tidak: keterangannya belum cukup untuk memutuskan. Terbalik, ' +
      'kartu ini justru membalik jadi ya — ya yang bersyarat, karena yang menahan ' +
      'ternyata cerita yang kamu percayai dan bukan keadaannya, dan cerita lebih murah ' +
      'diperiksa daripada keadaan.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Penguasa pasang dan surut' },
    {
      kind: 'paragraph',
      text:
        'Dalam susunan Golden Dawn, kartu kedelapan belas diberi judul Ruler of Flux ' +
        'and Reflux — penguasa pasang dan surut. Bukan penguasa kebohongan. Penguasa ' +
        'hal yang naik lalu turun lagi tanpa pernah minta izin, dan yang kadarnya ' +
        'tidak pernah sama dua malam berturut-turut.',
    },
    {
      kind: 'paragraph',
      text:
        'Huruf Ibrani yang dipasangkan padanya adalah Qoph, yang secara tradisi ' +
        'dikaitkan dengan bagian belakang kepala dan dengan tidur: bagian dirimu yang ' +
        'menyerap dulu dan berpikir belakangan. Untuk kartu ini itu bacaan yang jujur, ' +
        'dan sekaligus peringatannya.',
    },

    { kind: 'heading', level: 2, text: 'Pisces, air, dan yang tidak mau dipatok' },
    {
      kind: 'paragraph',
      text:
        'Lambangnya Pisces: air, dan mutable. Air mengikuti bentuk wadahnya dan ingat ' +
        'lama apa yang pernah ditampungnya; mutable berarti dia akan berubah bentuk ' +
        'lagi daripada berhenti. Itu deskripsi yang tepat untuk keadaan yang belum ' +
        'jelas, dan juga untuk versi ceritamu tentang keadaan itu — yang menjelaskan ' +
        'kenapa kartu ini sering terbaca sebagai keduanya sekaligus.',
    },

    { kind: 'heading', level: 2, text: 'Dua menara, dua binatang, satu jalan' },
    {
      kind: 'paragraph',
      text:
        'Di kartu kami bulannya menunduk. Wajahnya ada, tapi tidak menatap balik. Dua ' +
        'menara di kiri dan kanan sudah runtuh sebagian, panji-panjinya tinggal ' +
        'sobekan, dan jalan batu di antaranya tetap lurus dan tetap terbaca — menuju ' +
        'kota yang sudah jadi puing. Jalannya masih jelas; tujuannya tidak.',
    },
    {
      kind: 'paragraph',
      text:
        'Di dua sisi jalan ada serigala dan anjing, dan keduanya melolong ke arah yang ' +
        'sama. Yang satu belum pernah dijinakkan, yang satu pernah. Pada penerangan ' +
        'sebesar ini kamu tidak bisa membedakan dorongan yang liar dari kebiasaan yang ' +
        'sudah dilatih, dan dua-duanya milikmu.',
    },
    {
      kind: 'paragraph',
      text:
        'Yang paling tua di gambar itu ada paling depan: udang karang yang merangkak ' +
        'keluar dari kolam. Dia tidak berniat apa-apa. Dia naik karena airnya bergerak.',
    },
    {
      kind: 'quote',
      text: 'sesuatu yang letaknya lebih dalam daripada binatang buas',
      source: 'A. E. Waite, tentang makhluk di kolam kartu The Moon',
    },

    { kind: 'heading', level: 2, text: 'Angka delapan belas' },
    {
      kind: 'paragraph',
      text:
        'Delapan belas dilipat menjadi sembilan, dan sembilan adalah The Hermit. Kartu ' +
        'yang membawa lampunya sendiri berdiri persis di belakang kartu yang cahayanya ' +
        'bukan pilihannya. Jarak antara keduanya itulah ukuran kartu ini: The Hermit ' +
        'memilih gelapnya. The Moon tidak.',
    },
    { kind: 'cardRef', slug: 'the-hermit', text: 'Baca lore The Hermit (IX)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, The Moon biasanya bukan ramalan kejadian. Dia catatan soal ' +
        'kondisi penglihatanmu hari itu: hari yang bukan untuk memutuskan hal besar, ' +
        'dan hari yang bagus untuk mengumpulkan satu keterangan yang bisa dicek.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, posisinya mengubah artinya lebih banyak daripada ' +
        'biasanya. Di posisi yang sudah lewat, dia bilang keputusan sebelumnya diambil ' +
        'dengan keterangan yang tidak lengkap — itu penjelasan, bukan tuduhan. Di ' +
        'posisi yang menanti di depan, artinya paling sederhana: keterangannya belum ' +
        'lengkap dan belum akan lengkap sebelum kamu bergerak.',
    },
  ],

  questions: [
    {
      q: 'The Moon kartu buruk atau bukan?',
      a:
        'Bukan. Dia tidak meramalkan kerugian. Dia melaporkan bahwa keterangan yang ' +
        'kamu punya belum lengkap, dan laporan itu paling berguna justru ketika kamu ' +
        'sedang mau memutuskan sesuatu yang besar.',
    },
    {
      q: 'Kalau The Moon keluar soal orang lain, artinya dia menyembunyikan sesuatu?',
      a:
        'Biasanya bukan itu. Lebih sering artinya kamu belum tahu apa yang sedang dia ' +
        'hadapi, dan cerita yang kamu susun untuk menutup kekosongan itu terasa ' +
        'lengkap justru karena kamu sendiri yang menulisnya.',
    },
    {
      q: 'Untuk pertanyaan ya atau tidak, The Moon jawabannya apa?',
      a:
        'Tegak, tidak. Terbalik, kartu ini membalik jadi ya, dengan syarat: yang ' +
        'selama ini menahan adalah ketakutan yang kamu baca sebagai pertanda, dan ' +
        'begitu itu diperiksa, jalannya biasanya terbuka.',
    },
    {
      q: 'Bedanya The Moon dan The Star apa?',
      a:
        'The Star adalah harapan yang tenang setelah semuanya berantakan; kamu tahu ' +
        'apa yang kamu tuju. The Moon adalah malam sebelum itu, waktu kamu belum tahu ' +
        'mana cahaya yang benar.',
    },
  ],
};

export default theMoonId;
```

### `src/content/arcana/the-moon.en.ts`

```ts
import type { LoreDoc } from '@/content/types';

/**
 * The Moon (XVIII), English. **REWRITTEN, NOT TRANSLATED** (§8.2, and
 * `## Localization` rule 3 generalised).
 *
 * The pair's divergence, so a reviewer can check it in five seconds:
 *   - `anchor` is `path` here and `goldenDawnTitle` there. This document enters
 *     through Netzach -> Malkuth; that one enters through Flux and Reflux.
 *   - The interpretation's images are different: insufficient light on a road and a
 *     survey with half its answers missing, against two steps of visibility and two
 *     in the morning. Task 6's DIVERGENCE table forbids `step`, `night`, `guess`,
 *     `message`, `seven` in the two interpretation sections here.
 *   - The Q&A asks different questions -- lying, and timing -- not the same three.
 *
 * WHAT IS THE SAME AND MUST BE: the MEANING. Both agree with `cardMeaning()` and both
 * carry `yesno: no upright / yes reversed`, which Task 6 asserts against
 * `effectiveYesNo()`. Rewritten is about images and entry angle, never about verdict.
 *
 * NO THERAPY OR DIAGNOSIS VOCABULARY and no generic-mystic tics: no `heal`, no
 * `trauma`, no `shadow work`, no `nervous system`, no `dear one`, no `the Universe`,
 * no `soul's journey`, no `sacred`, no `divine timing`, no `higher self`. `anxiety`
 * is not forbidden and is not used here either.
 */
export const theMoonEn: LoreDoc = {
  slug: 'the-moon',
  locale: 'en',
  cardId: 18,
  anchor: 'path',

  title: 'The Moon (XVIII) Tarot Card Meaning — Upright & Reversed',
  description:
    'The Moon (XVIII) is the card of what you cannot see clearly yet: dreams, ' +
    'illusion, tides. Upright and reversed meanings, and the Pisces attribution ' +
    'behind it.',
  h1: 'The Moon (XVIII): Tarot Card Meaning',
  standfirst:
    'The eighteenth trump. Not the card of lies — the card of light too weak to see ' +
    'by, and of the decision you still have to make inside it.',
  imageAlt:
    'A full moon with a downturned face hangs between two ruined watchtowers; a wolf ' +
    'and a dog howl from either side of a cobbled road running out to a broken city, ' +
    'and a crayfish hauls itself from the dark pool in the foreground.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Upright, The Moon does not accuse anybody of deception. It reports ' +
        'insufficient light. The road has not changed and the destination has not ' +
        'moved; what has changed is how far ahead of yourself you can currently see.',
    },
    {
      kind: 'paragraph',
      text:
        'What the thing you cannot see clearly is telling you is usually partly ' +
        'right, and the partly is the whole problem. Discard it and you have thrown ' +
        'away a real signal. Act on all of it and you have built a plan on a survey ' +
        'with half the answers missing.',
    },
    {
      kind: 'paragraph',
      text:
        'So this card rarely asks you to wait for certainty. Certainty is often not ' +
        'coming. What it offers instead is permission to move while knowing you are ' +
        'estimating, which is considerably safer than estimating while feeling sure.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, the direction inverts. It is no longer the unclear thing speaking ' +
        'to you; it is your own fear speaking, and being read as an omen.',
    },
    {
      kind: 'paragraph',
      text:
        'The tell is not how it feels. A fear and a hunch are identical from the ' +
        'inside. The tell is what each one does under examination: a hunch holds its ' +
        'shape and gets more specific, and a fear changes its account every time you ' +
        'ask it a second question.',
    },
    {
      kind: 'paragraph',
      text:
        'Note also that a reversal flips this card’s verdict. Upright it answers ' +
        'no; reversed it answers yes, and the yes is conditional — what has been ' +
        'holding the thing up turns out to be a story rather than a circumstance, and ' +
        'a story is much the cheaper of the two to test.',
    },
  ],

  yesno: {
    upright: 'no',
    reversed: 'yes',
    note:
      'Upright the answer is no: there is not enough information in front of you to ' +
      'decide on. Reversed it flips to yes, conditionally — what has been in the way ' +
      'is an account you believe rather than a fact about the situation.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'The last path before the ground' },
    {
      kind: 'paragraph',
      text:
        'In the Hermetic scheme the eighteenth trump is laid on the path running from ' +
        'Netzach down into Malkuth — the final stretch before the material world, and ' +
        'the only one you cross at night. Whatever comes down that path arrives before ' +
        'anybody has had the chance to explain it.',
    },
    {
      kind: 'paragraph',
      text:
        'Its assigned letter is Qoph, tied by tradition to the back of the head and ' +
        'to sleep: the part of a person that receives before it reasons. The Golden ' +
        'Dawn’s own title for the card is Ruler of Flux and Reflux — not ruler of ' +
        'lies, ruler of what rises and falls without asking.',
    },

    { kind: 'heading', level: 2, text: 'Pisces, and why nothing here keeps a shape' },
    {
      kind: 'paragraph',
      text:
        'The sign is Pisces: water, and mutable. Water takes the shape of whatever ' +
        'holds it and remembers what held it; mutable means it will change form again ' +
        'rather than stop. That is an exact description of an unresolved situation and ' +
        'an equally exact description of your account of it, which is why readers ' +
        'reach for this card for both.',
    },

    { kind: 'heading', level: 2, text: 'What is actually in the picture' },
    {
      kind: 'paragraph',
      text:
        'Our Moon looks down and does not look back. Two watchtowers stand ruined on ' +
        'either side of a road that is still perfectly legible, running out to a city ' +
        'that is not. Torn banners hang along the walls, there is a skull on the ' +
        'right-hand stonework, and bone in the shallows.',
    },
    {
      kind: 'paragraph',
      text:
        'A wolf howls from the left and a dog from the right, and they are howling at ' +
        'the same thing. One was never tamed and one was. At this level of light you ' +
        'cannot tell a wild impulse from a trained habit, and both of them are yours.',
    },
    {
      kind: 'paragraph',
      text:
        'The oldest thing on the card is closest to the front: a crayfish dragging ' +
        'itself out of the pool. It intends nothing at all. It has surfaced because ' +
        'the water moved.',
    },
    {
      kind: 'quote',
      text: 'that which lies deeper than the savage beast',
      source: 'A. E. Waite, on the creature in The Moon’s pool',
    },

    { kind: 'heading', level: 2, text: 'Eighteen' },
    {
      kind: 'paragraph',
      text:
        'Eighteen folds to nine, and nine is The Hermit: the card that carries its own ' +
        'lamp, standing directly behind the card whose light was never its choice. The ' +
        'distance between those two is most of what this one means. The Hermit chose ' +
        'the dark.',
    },
    { kind: 'cardRef', slug: 'the-hermit', text: 'Read the lore for The Hermit (IX)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card this is rarely a forecast of events. It is a note about the ' +
        'state of your visibility: a day to gather one checkable fact, and not a day ' +
        'to settle something large.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading its position moves the meaning more than most cards ' +
        'do. Behind you, it says an earlier decision was made on incomplete ' +
        'information, which is an explanation and not a charge. Ahead of you, it is at ' +
        'its plainest: the information is not complete and will not become complete ' +
        'until you move.',
    },
  ],

  questions: [
    {
      q: 'Is The Moon a bad card?',
      a:
        'No. It does not predict loss. It reports that your information is ' +
        'incomplete, and that report is most useful precisely when you are about to ' +
        'decide something large.',
    },
    {
      q: 'Does The Moon mean someone is lying to me?',
      a:
        'Usually not. More often it means you do not yet know what the other person ' +
        'is dealing with, and that the account you assembled to fill the gap feels ' +
        'finished because you are the one who wrote it.',
    },
    {
      q: 'What does The Moon say about timing?',
      a:
        'Very little, and that is the honest answer. It is a card about not being ' +
        'able to see ahead, so a date read off it is a date invented. If a spread owes ' +
        'you a schedule, the other cards owe it, not this one.',
    },
    {
      q: 'The Moon or The High Priestess — what is the difference?',
      a:
        'The High Priestess is something you already know and have not said out loud. ' +
        'The Moon is something nobody in the room knows yet, including you.',
    },
  ],
};

export default theMoonEn;
```

### `src/content/arcana/index.ts`

```ts
/**
 * The lore registry (roadmap §5). **NO PROSE IN THIS FILE.**
 *
 * STATIC IMPORTS, NOT `import()`. All forty-four documents are in the build either
 * way, this is server-side only so nothing reaches the browser bundle, and a dynamic
 * import would make every consumer async for no gain. The one real cost -- every
 * arcana page's server bundle holds all forty-four documents -- is build-time memory
 * on a route that is CDN-cached, and only this route and S1's sitemap import it.
 *
 * `Localized<LoreDoc>` per slug, so **a card with only one locale written is a
 * COMPILE error**, which is the same trick the prompt facades use (`Record<Locale,
 * …>`; a missing locale there returned `undefined` to a model, which does not throw
 * and produces fluent prose grounded in nothing).
 *
 * KEYED BY URL SLUG, AND `registry.test.ts` ASSERTS THE KEY SET AGAINST
 * `CARD_URL_SLUGS`. A `Record<string, …>` cannot make a MISSING card a compile
 * error, because `cards.json` is generated and there is no literal union to derive.
 * The completeness assertion is therefore a test, and it lives in Task 34 rather
 * than here -- deliberately, see that task's note.
 */
import type { Localized } from '@/data/types';
import type { Locale } from '@/data/types';
import type { LoreDoc } from '@/content/types';
import { theMoonId } from './the-moon.id';
import { theMoonEn } from './the-moon.en';

export const ARCANA_LORE: Record<string, Localized<LoreDoc>> = {
  'the-moon': { id: theMoonId, en: theMoonEn },
};

/**
 * The slugs that HAVE lore, in Fool's Journey order.
 *
 * **S1's SITEMAP TAKES THIS AND NOT `CARD_URL_SLUGS`** (`## Deltas requested` item
 * 4). While the forty-four are being written, advertising a URL whose document does
 * not exist is telling a crawler about a 404 -- and after Task 34 the two lists are
 * identical, so the safe spelling costs nothing forever.
 */
export const LORE_SLUGS: readonly string[] = Object.keys(ARCANA_LORE);

export function loreFor(slug: string, locale: Locale): LoreDoc | undefined {
  return ARCANA_LORE[slug]?.[locale];
}
```

`LORE_SLUGS` must come out in card order. `Object.keys` preserves insertion order for
string keys, so **the entries in `ARCANA_LORE` are written in card order and
`registry.test.ts` asserts it** — otherwise the sitemap's order drifts with whatever order
the tasks happened to run in.

### `src/content/arcana/registry.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { CARDS, CARD_URL_SLUGS, cardById, cardUrlSlug } from '@/data/deck';
import { ARCANA_LORE, LORE_SLUGS, loreFor } from './index';

describe('the lore registry', () => {
  it('holds only real slugs', () => {
    for (const slug of LORE_SLUGS) {
      expect({ slug, card: cardUrlSlug(CARDS.find((c) => cardUrlSlug(c) === slug)!) })
        .toEqual({ slug, card: slug });
      expect(CARD_URL_SLUGS).toContain(slug);
    }
  });

  it('is written in card order, because S1’s sitemap reads the insertion order', () => {
    const ids = LORE_SLUGS.map((s) => ARCANA_LORE[s].id.cardId);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it('agrees with itself about slug, locale and cardId in both halves', () => {
    for (const slug of LORE_SLUGS) {
      for (const locale of ['id', 'en'] as const) {
        const doc = loreFor(slug, locale)!;
        const card = cardById(doc.cardId)!;
        expect({ slug: doc.slug, locale: doc.locale, derived: cardUrlSlug(card) })
          .toEqual({ slug, locale, derived: slug });
      }
    }
  });

  it('returns undefined for a slug with no document, and for a bad locale key', () => {
    expect(loreFor('the-fool', 'id')).toBeUndefined();   // until its own task
    expect(loreFor('not-a-card', 'id')).toBeUndefined();
  });
});
```

Note the fourth test asserts `loreFor('the-fool', 'id')` is `undefined` **on purpose**
while the tree is being written; Task 13 deletes that line in the same commit that adds The
Fool. Say so in a comment there, or it reads as a bug.

### Green

```sh
npm test -- content/arcana   # registry: 4 passing
npm test && npm run typecheck
```

**Commit:** `S4-5: The Moon, both locales, and the lore registry`

---

### Task 6: the copy lint over `src/content/**` (roadmap §11.4)

**S1 owns the test infrastructure; S4 owns making its content pass it.** This task writes
the lint that every one of Tasks 13–33 then runs. It is the release's only quality gate on
44 permanent documents that a stranger reads first.

**Files**
- `src/content/arcana/lore.test.ts` (new — the whole lint)
- `src/lib/clientBoundary.test.ts` (edit — the `src/content/**` fence, §5 rule 1)

### Reuse, never copy — and the three words the shared list is missing

The word lists already live in **`src/lib/copy/vocab.ts`**: `MALAY` (eleven words, `id`
only), `THERAPY_ID`, `THERAPY_EN`, `EN_TICS`. `scripts/smoke-llm.ts` imports `MALAY` from
there and `src/lib/numerology/glosses.test.ts` imports all four. **This lint imports the
same module.** A fifth copy of the Malay list is the failure `vocab.ts`'s own header was
written to prevent.

**`src/lib/prompt/base.en.ts` forbids three phrases in prose that `THERAPY_EN` does not
hold:** `attachment style`, `process your feelings`, `do the work`. That gap is real —
`vocab.ts` should be a superset of what the prompt forbids — and closing it is
`## Deltas requested` item 10. **I checked that the addition is safe**: no value in
`NUMBER_GLOSSES`, `SIGN_GLOSSES`, `ELEMENT_GLOSSES` or `MODALITY_GLOSSES` matches any of
the three under `\b…\b` (33's `…starts being work` does not match `\bdo the work\b`), so
`glosses.test.ts` stays green. If the delta is refused, this file declares them locally in
an `UPSTREAM_PENDING` array with a comment saying where they belong.

### The matcher is word-boundary aware, and `sobat` is why

`glosses.test.ts` uses `new RegExp(`\\b${word}\\b`, 'i')` and this file uses the same one,
for a reason that bites specifically in Indonesian: **`THERAPY_ID` contains `obat`, and
`sobat` ("mate", "buddy") is ordinary casual Indonesian.** A bare `includes()` fails a
correct sentence, and the fix somebody reaches for when a lint fails correct prose is
deleting the lint — the lesson `tally.ts`'s two-tier design and `queries/contract.test.ts`
both record. `EN_TICS` entries are matched with `tic.replace(/'/g, "['’]")` and no `\b`,
because `soul's journey` carries an apostrophe and the source uses a typographic one.

### THE TRAP THAT WILL GET THIS TEST DELETED

**`EN_TICS` contains `abundance`, and `abundance` is The Empress's own English keyword in
`cards.json`.** So:

- The Empress's **English lore may not use the word `abundance`.** It must say what
  abundance *is*. That is a feature — the ban forces concrete writing, which is the register
  this content is supposed to be in.
- The **keyword chip on the page is unaffected**, because it comes from
  `cardKeywords(card, 'en')`, which is data. **This lint scans `src/content/**` and
  nothing else.**
- **Anyone who "improves" the lint to scan the rendered page will fail on data S4 does not
  own** (`tools/generate_cards.py` generates `cards.json`), conclude the lint is broken,
  and switch it off. The scope is the scope. `sacred`, `heal` and `healing` are the other
  three a tarot writer reaches for constantly — The Hierophant, Temperance and The Star
  respectively — and none of them is exempted either.

### The failing test first

`src/content/arcana/lore.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARDS, cardById, cardUrlSlug, effectiveYesNo } from '@/data/deck';
import { EN_TICS, MALAY, THERAPY_EN, THERAPY_ID } from '@/lib/copy/vocab';
import type { Block, LoreDoc } from '@/content/types';
import { ARCANA_LORE, LORE_SLUGS, loreFor } from './index';

/** Every authored string in one document, flattened. */
function textsOf(doc: LoreDoc): { field: string; text: string }[] {
  const out: { field: string; text: string }[] = [];
  const push = (field: string, text: string) => out.push({ field, text });
  const blocks = (field: string, bs: readonly Block[]) => {
    bs.forEach((b, i) => {
      const at = `${field}[${i}]`;
      if (b.kind === 'heading' || b.kind === 'paragraph') push(at, b.text);
      else if (b.kind === 'list') b.items.forEach((x, j) => push(`${at}.items[${j}]`, x));
      else if (b.kind === 'quote') { push(`${at}.text`, b.text); push(`${at}.source`, b.source); }
      else push(`${at}.text`, b.text);
    });
  };
  push('title', doc.title);
  push('description', doc.description);
  push('h1', doc.h1);
  push('standfirst', doc.standfirst);
  push('imageAlt', doc.imageAlt);
  push('yesno.note', doc.yesno.note);
  blocks('upright', doc.upright);
  blocks('reversed', doc.reversed);
  blocks('lore', doc.lore);
  blocks('inSpread', doc.inSpread);
  doc.questions.forEach((qa, i) => { push(`questions[${i}].q`, qa.q); push(`questions[${i}].a`, qa.a); });
  return out;
}

const ALL = LORE_SLUGS.flatMap((slug) =>
  (['id', 'en'] as const).map((locale) => ({ slug, locale, doc: loreFor(slug, locale)! })),
);

const INTERPRETATION = (doc: LoreDoc) =>
  textsOf(doc).filter((t) => t.field.startsWith('upright') || t.field.startsWith('reversed'));

describe('the lore documents', () => {
  it('found documents at all, so nothing below passes vacuously', () => {
    expect(ALL.length).toBeGreaterThan(0);
    expect(ALL.length % 2).toBe(0);
    for (const { doc } of ALL) expect(textsOf(doc).length).toBeGreaterThan(20);
  });

  // ── the copy constraints ────────────────────────────────────────────────────

  it('has no Malay in the Indonesian half', () => {
    // `## Copy constraints`. The eleven-word list, `id` ONLY -- running it against
    // English is theatre (W6 rule 4). `\b` matters: `obat` is inside `sobat`.
    for (const { slug, doc } of ALL.filter((x) => x.locale === 'id')) {
      for (const { field, text } of textsOf(doc)) {
        for (const w of MALAY) {
          expect({ slug, field, word: w, hit: new RegExp(`\\b${w}\\b`, 'i').test(text) })
            .toMatchObject({ hit: false });
        }
      }
    }
  });

  it('has no therapy, diagnosis, treatment or healing language, in either locale', () => {
    /*
     * The rule that began as an App Review constraint and is kept because it was
     * always the honest line for an entertainment app. **THE ENGLISH LIST IS LONGER,
     * NOT SHORTER** -- English tarot and wellness writing is saturated with this
     * vocabulary in a way Indonesian is not.
     *
     * `anxiety` IS DELIBERATELY ABSENT from both lists and must stay absent; the rule
     * is against DIAGNOSIS, which is why `anxiety disorder`, `clinical` and
     * `diagnosed` are the entries that are there.
     */
    for (const { slug, locale, doc } of ALL) {
      const list = locale === 'id' ? THERAPY_ID : THERAPY_EN;
      for (const { field, text } of textsOf(doc)) {
        for (const w of list) {
          expect({ slug, locale, field, word: w, hit: new RegExp(`\\b${w}\\b`, 'i').test(text) })
            .toMatchObject({ hit: false });
        }
      }
    }
  });

  it('has none of the English generic-mystic tics', () => {
    /*
     * `en` only. **`abundance` IS ON THIS LIST AND IS ALSO THE EMPRESS'S OWN ENGLISH
     * KEYWORD IN `cards.json`.** That is not a conflict to resolve with an exemption:
     * the chip is DATA and this lint scans `src/content/**`, so The Empress's lore has
     * to say what abundance is instead of naming it. `sacred` (The Hierophant),
     * `heal`/`healing` (Temperance, The Star) are the same shape and are equally not
     * exempted.
     */
    for (const { slug, doc } of ALL.filter((x) => x.locale === 'en')) {
      for (const { field, text } of textsOf(doc)) {
        for (const tic of EN_TICS) {
          const re = new RegExp(tic.replace(/'/g, "['’]"), 'i');
          expect({ slug, field, tic, hit: re.test(text) }).toMatchObject({ hit: false });
        }
      }
    }
    // Also the closing offer, which is a tic of shape rather than of vocabulary.
    for (const { slug, doc } of ALL.filter((x) => x.locale === 'en')) {
      for (const { field, text } of textsOf(doc)) {
        expect({ slug, field, hit: /let me know if|feel free to|reach out/i.test(text) })
          .toMatchObject({ hit: false });
      }
    }
  });

  it('keeps CARD NAMES IN ENGLISH in both locales, and refuses an invented one', () => {
    /*
     * `## Localization` rule 1. The model invents `Pulan` for The Moon and a human
     * writing Indonesian will reach for `Sang Bulan` -- and a card labelled anything
     * else disagrees with the reading and with `CardFace`'s own caption.
     *
     * **THE PATTERN IS `Sang ` FOLLOWED BY A CAPITAL, NOT A LIST OF NOUNS.** Banning
     * `Kematian`, `Keadilan` or `Kekuatan` would ban the ordinary Indonesian words
     * for death, justice and strength, which lore prose legitimately uses -- the
     * `lagi` trap in a new costume (`## Memory features`). `Sang X` is the exact
     * construction used to render an English card title and appears in no ordinary
     * sentence about a card.
     */
    for (const { slug, locale, doc } of ALL) {
      const card = cardById(doc.cardId)!;
      for (const { field, text } of textsOf(doc)) {
        expect({ slug, field, hit: /\bSang [A-Z]/.test(text) }).toMatchObject({ hit: false });
        expect({ slug, field, hit: /\bPulan\b/i.test(text) }).toMatchObject({ hit: false });
      }
      // `Major Arcana` stays English too -- it is the eyebrow's own words.
      const joined = textsOf(doc).map((t) => t.text).join(' ');
      expect({ slug, locale, hit: /Ark?ana (Mayor|Utama|Besar)/i.test(joined) })
        .toMatchObject({ hit: false });
      // And the card must name itself, in English, in its own title and h1.
      expect(doc.title).toContain(card.name);
      expect(doc.h1).toContain(card.name);
      if (locale === 'id') expect(joined).toContain(card.name);
    }
  });

  it('spills nothing about how the app works (S-D7’s corollary)', () => {
    // The same constraint roadmap §7 puts on S6's article. A lore page may name the
    // three services and the three positions and nothing else.
    for (const { slug, doc } of ALL) {
      for (const { field, text } of textsOf(doc)) {
        for (const w of [
          'prompt', 'LLM', 'token', 'Shadow Arcana', 'Lotus', 'persona',
          'frequency verdict', 'system message', 'temperature', 'model',
        ]) {
          expect({ slug, field, word: w, hit: new RegExp(`\\b${w}\\b`, 'i').test(text) })
            .toMatchObject({ hit: false });
        }
      }
    }
  });

  // ── the shape constraints ──────────────────────────────────────────────────

  it('carries no HTML and no entities, because the source is UTF-8 prose', () => {
    for (const { slug, doc } of ALL) {
      for (const { field, text } of textsOf(doc)) {
        expect({ slug, field, hit: /<\/?[a-z][a-z0-9]*[\s/>]/i.test(text) })
          .toMatchObject({ hit: false });
        expect({ slug, field, hit: /&[a-z]+;|&#\d+;/i.test(text) })
          .toMatchObject({ hit: false });
        // No markdown either: the block union IS the structure.
        expect({ slug, field, hit: /(\*\*|^#{1,6}\s|\[[^\]]+\]\()/m.test(text) })
          .toMatchObject({ hit: false });
        expect({ slug, field, trimmed: text === text.trim() }).toMatchObject({ trimmed: true });
      }
    }
  });

  it('emits headings at level 2 or 3 only', () => {
    for (const { slug, doc } of ALL) {
      for (const bs of [doc.upright, doc.reversed, doc.lore, doc.inSpread]) {
        for (const b of bs) {
          if (b.kind === 'heading') {
            expect({ slug, level: b.level }).toMatchObject({ level: expect.anything() });
            expect([2, 3]).toContain(b.level);
          }
        }
      }
    }
  });

  it('keeps the SERP strings inside their budgets', () => {
    for (const { slug, locale, doc } of ALL) {
      const card = cardById(doc.cardId)!;
      // <= 65 and no brand: the SERP budget is finite and `Tarot Major Arcana` earns
      // more on a query nobody knows us by than `| JMTarot` does.
      expect({ slug, locale, len: doc.title.length }).toMatchObject({
        len: expect.any(Number),
      });
      expect(doc.title.length).toBeLessThanOrEqual(65);
      expect(doc.title).not.toContain('JMTarot');
      expect(doc.title).toContain(`(${card.numeral})`);
      // 110-165: under 110 wastes a slot Google fills from the body instead; over
      // 165 truncates mid-clause.
      expect(doc.description.length).toBeGreaterThanOrEqual(110);
      expect(doc.description.length).toBeLessThanOrEqual(165);
      // The h1 is not the title.
      expect(doc.h1).not.toBe(doc.title);
      expect(doc.standfirst.length).toBeGreaterThanOrEqual(60);
    }
  });

  it('writes alt text that DESCRIBES rather than repeating the name', () => {
    for (const { slug, locale, doc } of ALL) {
      const card = cardById(doc.cardId)!;
      expect(doc.imageAlt.length).toBeGreaterThanOrEqual(60);
      expect(doc.imageAlt.startsWith(card.name)).toBe(false);
      // A description of a painting has at least one verb-shaped clause; the cheap
      // proxy is that it is not just a noun phrase of keywords.
      expect({ slug, locale, commas: doc.imageAlt.includes(',') || doc.imageAlt.includes(';') })
        .toMatchObject({ commas: true });
    }
  });

  it('agrees with effectiveYesNo() in both orientations', () => {
    /*
     * **THE ONE PLACE A LORE PAGE COULD CONTRADICT THE APP AND NOBODY WOULD NOTICE.**
     * The flip is counter-intuitive -- The Moon answers `no` upright and `yes`
     * reversed -- so a writer following the artwork's mood gets it backwards. Held as
     * data and asserted, which is the same move §3.2's slug table makes.
     */
    for (const { slug, locale, doc } of ALL) {
      const card = cardById(doc.cardId)!;
      expect({ slug, locale, ...doc.yesno }).toMatchObject({
        upright: effectiveYesNo({ card, reversed: false }),
        reversed: effectiveYesNo({ card, reversed: true }),
      });
      expect(doc.yesno.note.length).toBeGreaterThan(40);
    }
  });

  it('has every internal cardRef resolve to a real card, and never to itself', () => {
    // A dead internal link on forty-four pages is a real cost and nothing notices it
    // by eye. A self-link is a rendering bug that reads as a link.
    for (const { slug, doc } of ALL) {
      for (const b of [...doc.upright, ...doc.reversed, ...doc.lore, ...doc.inSpread]) {
        if (b.kind !== 'cardRef') continue;
        expect({ slug, ref: b.slug, resolves: CARDS.some((c) => cardUrlSlug(c) === b.slug) })
          .toMatchObject({ resolves: true });
        expect(b.slug).not.toBe(slug);
        expect(b.text.length).toBeGreaterThan(8);
      }
    }
  });

  it('has the block counts each section is specified for', () => {
    for (const { slug, locale, doc } of ALL) {
      const at = `${slug}.${locale}`;
      expect({ at, n: doc.upright.length }).toMatchObject({ n: expect.any(Number) });
      expect(doc.upright.length).toBeGreaterThanOrEqual(2);
      expect(doc.upright.length).toBeLessThanOrEqual(4);
      expect(doc.reversed.length).toBeGreaterThanOrEqual(2);
      expect(doc.reversed.length).toBeLessThanOrEqual(4);
      expect(doc.lore.length).toBeGreaterThanOrEqual(6);
      expect(doc.lore.length).toBeLessThanOrEqual(14);
      expect(doc.inSpread.length).toBeGreaterThanOrEqual(1);
      expect(doc.inSpread.length).toBeLessThanOrEqual(3);
      expect(doc.questions.length).toBeGreaterThanOrEqual(3);
      expect(doc.questions.length).toBeLessThanOrEqual(5);
      // Every quote carries a source with a name in it, or it reads as invented.
      for (const b of doc.lore) {
        if (b.kind === 'quote') expect(b.source.length).toBeGreaterThan(10);
      }
    }
  });

  // ── §8.2: rewritten, not translated ───────────────────────────────────────

  it('leads the two locales with DIFFERENT anchors', () => {
    for (const slug of LORE_SLUGS) {
      const pair = ARCANA_LORE[slug];
      expect({ slug, id: pair.id.anchor, en: pair.en.anchor })
        .toMatchObject({ id: expect.any(String), en: expect.any(String) });
      expect(pair.id.anchor).not.toBe(pair.en.anchor);
    }
  });

  it('shares no interpretation IMAGERY across the pair (the DIVERGENCE table)', () => {
    /*
     * `glosses.test.ts`'s mechanism, generalised: for each card, the English words
     * for the Indonesian half's interpretation images, which the English half must
     * NOT contain.
     *
     * **ONE-DIRECTIONAL, LIKE THE ORIGINAL, AND FOR W6's REASON**: Indonesian is the
     * source language, so the failure mode is translating INTO English.
     *
     * **SCOPED TO `upright` AND `reversed` ONLY. THE `lore` SECTION IS EXEMPT AND THE
     * EXEMPTION IS PRINCIPLED.** Both documents describe ONE painting, so they must
     * share its nouns -- towers, wolf, dog, crayfish, skull. Interpretation may not
     * share imagery; a description of a shared object must. `glosses.ts` exempts its
     * element glosses from its own table for the same shape of reason and says so.
     */
    const DIVERGENCE: Record<string, string[]> = {
      'the-moon': ['step', 'night', 'guess', 'message', 'seven', 'two in the morning'],
      // one row per card; Tasks 13-33 each add theirs.
    };
    expect(Object.keys(DIVERGENCE).sort()).toEqual([...LORE_SLUGS].sort());
    for (const [slug, words] of Object.entries(DIVERGENCE)) {
      for (const { field, text } of INTERPRETATION(ARCANA_LORE[slug].en)) {
        for (const w of words) {
          expect({ slug, field, word: w, hit: new RegExp(`\\b${w}s?\\b`, 'i').test(text) })
            .toMatchObject({ hit: false });
        }
      }
    }
  });

  it('asks DIFFERENT questions in the two locales', () => {
    // A translated document asks the same three questions in the same order. Compare
    // on the leading word set of each question, which survives paraphrase but not
    // translation-by-position.
    for (const slug of LORE_SLUGS) {
      const pair = ARCANA_LORE[slug];
      const n = Math.min(pair.id.questions.length, pair.en.questions.length);
      // At least one of the English questions must have no positional counterpart in
      // subject. Enforced as: the two lists must not be the same LENGTH and the same
      // ORDER of topics -- checked by the plan's per-card table and by eye, and
      // mechanically only to the extent of forbidding an identical count with an
      // identical first-question subject word.
      expect({ slug, n }).toMatchObject({ n: expect.any(Number) });
      expect(pair.en.questions.map((q) => q.q)).not.toEqual(pair.id.questions.map((q) => q.q));
    }
  });

  // ── the file tree ──────────────────────────────────────────────────────────

  it('has one file per registered document, named <slug>.<locale>.ts', () => {
    const files = readdirSync(join(process.cwd(), 'src/content/arcana'))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts');
    const expected = ALL.map(({ slug, locale }) => `${slug}.${locale}.ts`).sort();
    expect(files.sort()).toEqual(expected);
  });

  it('imports nothing but the type from a document file', () => {
    // A document is DATA. The moment one imports the deck, the engine or the catalog,
    // it has become code and the lint's flatten stops seeing all of its prose.
    const dir = join(process.cwd(), 'src/content/arcana');
    for (const { slug, locale } of ALL) {
      const src = readFileSync(join(dir, `${slug}.${locale}.ts`), 'utf8');
      const specs = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      expect({ slug, locale, specs }).toMatchObject({ specs: ['@/content/types'] });
    }
  });
});
```

### The `clientBoundary.test.ts` edit (§5 rule 1)

Append one case, in the shape of the file's existing fences:

```ts
  /*
   * S4's Task 6. **`src/content/**` IS 24,000 WORDS OF PROSE PER LOCALE** and roadmap
   * §5 rule 1 fences it from client components. A client component importing a lore
   * document serialises the whole document into the RSC payload of whatever page
   * mounts it -- which is the same failure S-D6 keeps out of the message catalog,
   * arriving through a different door.
   *
   * **`@/content/types` IS THE ONE EXCEPTION**, and it is the same split
   * `moderation/types.ts` has against `blocklist.ts` and `share/types.ts` against
   * `share/links.ts`: the SHAPE crosses the boundary, the CONTENT does not. The next
   * test is what keeps the exception earned.
   */
  it('lets no client component import a content module', () => {
    for (const file of CLIENT) {
      const offending = importsOf(file.source).filter(
        (spec) => spec.startsWith('@/content/') && spec !== '@/content/types',
      );
      expect({ [file.path]: offending }).toEqual({ [file.path]: [] });
    }
  });

  it('keeps `@/content/types` free of prose, so the exception stays earned', () => {
    // Asserted on the SOURCE with comments stripped -- `types.ts`'s own header
    // explains at length why prose may not live there, and a fence that fires on
    // prose describing the rule is a fence people delete
    // (`queries/contract.test.ts` records the lesson).
    const raw = readFileSync(join(ROOT, 'content/types.ts'), 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // No string literal longer than a type name.
    for (const m of code.matchAll(/'([^']{40,})'/g)) {
      expect({ literal: m[1] }).toMatchObject({ literal: '' });
    }
    expect(code).toContain('LORE_ANCHORS');   // the stripper did not eat the code
  });
```

### Green

```sh
npm test -- lore                 # 16 passing against the two Moon documents
npm test -- clientBoundary       # the existing cases plus two
npm test && npm run typecheck
```

**Then deliberately break it once, and read the failure**, because a lint nobody has seen
fail is a lint nobody trusts:

```
# temporarily put `tempoh` in the-moon.id.ts's standfirst -> the Malay case names
#   { slug: 'the-moon', field: 'standfirst', word: 'tempoh', hit: true }
# temporarily flip yesno.reversed to 'no'      -> the effectiveYesNo case names both
# temporarily put `abundance` in the-moon.en.ts -> the tic case names the field
```

**Commit:** `S4-6: the copy lint over src/content, and the client fence`

---

### Task 7: `/arcana/[slug]`

**Files**
- `src/app/arcana/[slug]/page.tsx` (new)
- `src/app/arcana/[slug]/page.module.css` (new)
- `src/app/arcana/[slug]/ArcanaFacts.tsx` (new — server component)
- `src/app/arcana/[slug]/ArcanaViewed.tsx` (new — `'use client'`, one event)

### What is consumed from S1 and S2, by name

Coded against these signatures. `## Deltas requested` items 5, 6, 7 and 8 are where they
are asked for; if a signature lands differently, **only this file and Task 10 change.**

```ts
// S2 — src/lib/i18n/resolve.ts. EDGE-SAFE, no `server-only`.
export function localePath(locale: Locale, path: string): string;   // ('en','/x') -> '/en/x'

// S2 — the single canonical + hreflang + x-default helper (S-D15).
export function alternates(path: string): {
  canonical: string;
  languages: Record<string, string>;                                // incl. 'x-default'
};

// S1 — src/lib/seo/origin.ts (S-D11). A LEAF: process.env and nothing else.
export function siteOrigin(): string;

// S1 — the public shell and footer.
export function PublicShell(props: { children: ReactNode }): ReactNode;

// S1 — the JSON-LD builders (S-D16), pure.
export function articleJsonLd(input: {...}): object;
export function breadcrumbJsonLd(items: { name: string; url: string }[]): object;
export function jsonLdScript(graph: object[]): ReactNode;           // emits <script type="application/ld+json">
```

### The page

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

import type { YesNo } from '@/data/types';
import {
  CARD_URL_SLUGS,
  cardByUrlSlug,
  cardImage,
  cardMeaning,
  cardUrlSlug,
  effectiveYesNo,
} from '@/data/deck';
import {
  arcanaFactsFor,
  neighboursOf,
  relatedByElement,
  relatedByStage,
} from '@/lib/arcana/correspondence';
import { loreFor } from '@/content/arcana';
import { Prose } from '@/components/Prose';
import { Eyebrow } from '@/components/Eyebrow';
import { getLocale, getT } from '@/lib/i18n/t';
import { localePath } from '@/lib/i18n/resolve';
import { alternates } from '@/lib/seo/alternates';
import { PublicShell } from '@/components/PublicShell';
import { ArcanaFacts } from './ArcanaFacts';
import { ArcanaShare } from './ArcanaShare';
import { ArcanaViewed } from './ArcanaViewed';
import { arcanaGraph } from './jsonld';
import styles from './page.module.css';

/**
 * `/arcana/<url slug>` -- one Major Arcana card, in one language, for a stranger.
 *
 * ── FOUR FENCES THAT STOP EXISTING HERE, AS THEY DO ON `/s/[slug]` ─────────────
 *
 *   1. `requireUser()` never runs, so NOTHING here may assume a `CurrentUser`.
 *   2. The onboarding gate never runs, so nothing may assume a `profiles` row.
 *   3. There is no session to key anything on.
 *   4. **THERE IS NO DATABASE ON THIS PATH AT ALL** (roadmap §10), which is what
 *      makes "a public page must not be able to 500 on a database outage" true by
 *      construction rather than by a try/catch. Three routes already carry that bug;
 *      this must not be the fourth.
 *
 * **`currentUser()` IS NEVER CALLED, AND `curl` CANNOT SEE THE FAILURE IF IT IS.**
 * `/s/[slug]`'s header records the exact shape: a client component reaching for a
 * session context renders correct HTML on the server and throws during hydration, so
 * `curl` reports 200 with the page in the body and the page is dead in a browser.
 * `page.contract.test.ts` fences the whole subtree and loop 5 is the check.
 *
 * **NO COOKIE** (S-D10). Also mechanical: a `Set-Cookie` makes the response
 * uncacheable at the edge, and these are the pages whose TTFB a crawler measures.
 * S2 grows middleware's `/s/` cookie guard to cover the content routes.
 *
 * **NOTHING HERE GENERATES ANYTHING** (S-D7, VD7). Every byte is authored and
 * committed. A session-less public route with a model call behind it is
 * `LLM_WINDOW_CALL_CEILING` with no gate in front of it.
 *
 * ── AND ONE THING THE ROADMAP'S WORDING INVITES YOU TO GET WRONG ───────────────
 *
 * **`generateStaticParams` DOES NOT MAKE THIS PAGE STATIC.** `app/layout.tsx` awaits
 * `getLocale()` for `<html lang>` and `## Localization` rule 5 forbids "fixing" that,
 * so `headers()` is read above every page and the whole tree renders per request. The
 * build output shows `ƒ` and that is the symptom of the rule working. What
 * `generateStaticParams` + `dynamicParams = false` buys is a **404 at the routing
 * layer** for any slug outside the twenty-two. The TTFB story is S1's
 * `Cache-Control`, which is exactly the trade S-D10 takes over multiple root layouts.
 */

export const runtime = 'nodejs';

/**
 * The twenty-two, derived. NOT `LORE_SLUGS`: a slug with no document must 404 rather
 * than fall through to a catch-all, and `notFound()` below is what answers it.
 * S1's SITEMAP takes `LORE_SLUGS` instead, so an unwritten page is never advertised.
 */
export function generateStaticParams() {
  return CARD_URL_SLUGS.map((slug) => ({ slug }));
}

/** Anything outside the twenty-two is a 404 before this module runs. */
export const dynamicParams = false;

/**
 * `YesNo` -> catalog key, SPELLED OUT, because a template literal is not a
 * `MessageKey`.
 *
 * `t()` is typed over `keyof typeof id` and `` t(`reading.verdict.${verdict}`) `` widens
 * to `string`, which does not satisfy that union -- so it is a red typecheck if you
 * are lucky and, if the signature is ever loosened, an unknown key at runtime. I3 is
 * explicit that an unknown key returns THE KEY on purpose, so the failure mode is
 * `reading.verdict.no` rendered as the verdict on a public page. Three lines of
 * lookup buys the compile-time check back.
 *
 * REUSING `reading.verdict.*` RATHER THAN ADDING `arcana.verdict.*`: these must be
 * the SAME WORDS the app prints after a real yes/no reading, and a second key is how
 * the lore page and the reading eventually disagree about what `maybe` is called.
 */
const VERDICT_KEY = {
  yes: 'reading.verdict.yes',
  no: 'reading.verdict.no',
  maybe: 'reading.verdict.maybe',
} as const satisfies Record<YesNo, string>;

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const card = cardByUrlSlug(slug);
  const doc = card ? loreFor(slug, locale) : undefined;
  if (!card || !doc) return {};

  return {
    title: doc.title,
    description: doc.description,
    /*
     * **ONE HELPER, NEVER HAND-WRITTEN** (S-D15). Forty-four pages emitting three
     * `<link rel="alternate">` tags by hand is forty-four chances at a
     * non-reciprocal pair, which Google discards SILENTLY -- the whole tag set stops
     * working and nothing reports it. The slug is identical in both locales (S-D4),
     * which is what makes this a clean `/arcana/X` <-> `/en/arcana/X` mapping with no
     * per-locale slug table.
     */
    alternates: alternates(`/arcana/${slug}`),
    openGraph: {
      type: 'article',
      title: doc.title,
      description: doc.description,
      locale: locale === 'en' ? 'en_US' : 'id_ID',
      images: [{ url: cardImage(card.slug), width: 800, height: 1200, alt: doc.imageAlt }],
    },
    /*
     * NO `robots` FIELD. The default is indexable and that is the point of the
     * release; S-D12's trap is the opposite direction -- a broadly-matching
     * `x-robots-tag` that silently `noindex`es the site. `headers.test.ts` is the
     * only thing that would notice, which is why S1 adds a case per new rule.
     */
  };
}

export default async function ArcanaPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const card = cardByUrlSlug(slug);
  if (!card) notFound();

  const locale = await getLocale();
  const t = await getT();
  const doc = loreFor(slug, locale);
  /*
   * A written card in one locale and not the other 404s rather than falling back.
   * **NO CROSS-LOCALE FALLBACK** (I3's argument, applied to content): an Indonesian
   * document served under an English URL is a bug that ships, and `hreflang` would be
   * claiming a translation that does not exist. Task 34's completeness test is what
   * makes this branch unreachable at release.
   */
  if (!doc) notFound();

  const facts = arcanaFactsFor(card, locale, slug);
  const { previous, next } = neighboursOf(card);
  const canonical = alternates(`/arcana/${slug}`).canonical;

  const related = [
    ...(facts.root ? [{ card: facts.root, kind: 'root' as const }] : []),
    ...relatedByElement(card).map((c) => ({ card: c, kind: 'element' as const })),
    ...relatedByStage(card).map((c) => ({ card: c, kind: 'stage' as const })),
  ].filter((r, i, all) => all.findIndex((x) => x.card.id === r.card.id) === i);

  return (
    <PublicShell>
      <ArcanaViewed cardId={card.id} locale={locale} />
      {arcanaGraph({ card, doc, canonical, locale })}

      <article className={styles.doc}>
        <Eyebrow>Major Arcana</Eyebrow>

        {/* THE SINGLE `<h1>`. Nothing else on this page may emit one. */}
        <h1 className={styles.h1}>{doc.h1}</h1>
        <p className={styles.standfirst}>{doc.standfirst}</p>

        {/*
          A plain `<img>`, never `next/image`. `cardImage()` appends `?v=3` and
          `next/image` refuses a local `src` with a query string when no
          `images.localPatterns` is configured -- the constraint `AccountCard`
          records, satisfied rather than dodged. `width`/`height` are set so there is
          no layout shift, and the art is already an optimised WebP at exactly this
          size, so the optimiser has nothing to improve and would only add a
          serverless invocation per card.

          `fetchPriority="high"` because it is the largest contentful paint on the
          page and there is nothing above it.
        */}
        <img
          className={styles.art}
          src={cardImage(card.slug)}
          alt={doc.imageAlt}
          width={800}
          height={1200}
          fetchPriority="high"
          decoding="async"
        />

        <ArcanaFacts facts={facts} />

        {/*
          **THE TWO GLOSSES SIT DIRECTLY ABOVE THE AUTHORED SECTIONS, AND THAT
          ADJACENCY IS THE ENFORCEMENT.** Roadmap §7: a lore page that contradicts
          `cardMeaning()` contradicts the reading the app just gave. There is no test
          for semantic agreement between one line and four paragraphs, so the page is
          built so that a contradiction is a reading defect a reviewer MEETS rather
          than a hidden one. `page.contract.test.ts` asserts both orientations are
          rendered, so nobody tidies this away as duplication of the lore.
        */}
        <section className={styles.section}>
          <h2 className={styles.h2}>{t('arcana.upright')}</h2>
          <p className={styles.gloss}>{cardMeaning({ card, reversed: false }, locale)}</p>
          <Prose blocks={doc.upright} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>{t('arcana.reversed')}</h2>
          <p className={styles.gloss}>{cardMeaning({ card, reversed: true }, locale)}</p>
          <Prose blocks={doc.reversed} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>{t('arcana.verdict')}</h2>
          {/*
            The verdict words come from `effectiveYesNo` at RENDER time and the
            catalog, never from the document -- `doc.yesno` exists to be ASSERTED
            against the engine in the lint, not to be displayed. So the words on
            screen are the same words the app prints after a yes/no reading, by
            construction.
          */}
          <dl className={styles.verdict}>
            <dt>{t('arcana.upright')}</dt>
            <dd>{t(VERDICT_KEY[effectiveYesNo({ card, reversed: false })])}</dd>
            <dt>{t('arcana.reversed')}</dt>
            <dd>{t(VERDICT_KEY[effectiveYesNo({ card, reversed: true })])}</dd>
          </dl>
          <p className={styles.p}>{doc.yesno.note}</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>{t('arcana.lore')}</h2>
          <Prose blocks={doc.lore} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>{t('arcana.inSpread')}</h2>
          <Prose blocks={doc.inSpread} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>{t('arcana.questions')}</h2>
          {/*
            Q&A CONTENT WITH NO `FAQPage` MARKUP (S-D16). Google restricted FAQ rich
            results to authoritative government and health sites in August 2023, so
            the schema buys approximately nothing -- but the content still earns its
            place, for the reader and for long-tail matching. `<h3>` per question so
            the heading order stays semantic and a question is linkable.
          */}
          {doc.questions.map((qa, i) => (
            <div key={i} className={styles.qa}>
              <h3 className={styles.h3}>{qa.q}</h3>
              <p className={styles.p}>{qa.a}</p>
            </div>
          ))}
        </section>

        <ArcanaShare canonical={canonical} cardId={card.id} />

        {/*
          THE LINK GRAPH. Twenty-two pages each linking to several others is the
          structure that competes with a fifteen-year-old site; a page with one
          outbound link is a leaf. Derived rather than authored, so no link can rot,
          and DETERMINISTIC, so the set does not change between builds and churn a
          crawl. Between eight and twelve internal links per page.
        */}
        <nav className={styles.links} aria-label={t('arcana.neighbours')}>
          <h2 className={styles.h2}>{t('arcana.neighbours')}</h2>
          <ul className={styles.linkList}>
            <li>
              <Link href={localePath(locale, `/arcana/${cardUrlSlug(previous)}`)} prefetch={false}>
                {previous.numeral} · {previous.name}
              </Link>
            </li>
            <li>
              <Link href={localePath(locale, `/arcana/${cardUrlSlug(next)}`)} prefetch={false}>
                {next.numeral} · {next.name}
              </Link>
            </li>
          </ul>

          <h2 className={styles.h2}>{t('arcana.related')}</h2>
          <ul className={styles.linkList}>
            {related.map(({ card: c, kind }) => (
              <li key={c.id}>
                <Link href={localePath(locale, `/arcana/${cardUrlSlug(c)}`)} prefetch={false}>
                  {c.numeral} · {c.name}
                </Link>
                <span className={styles.linkWhy}>{t(`arcana.related.${kind}`)}</span>
              </li>
            ))}
          </ul>

          <Link className={styles.gallery} href={localePath(locale, '/gallery')} prefetch={false}>
            {t('arcana.gallery')}
          </Link>
        </nav>

        {/*
          §8.3. `common.disclaimer.long` and not `.short`: the constraint is that an
          entertainment-only disclaimer appears under every reading and on both
          pickers, and the legal exposure is HIGHER on a page a stranger reaches
          first with no account. `Legal.module.css`'s `.callout` shape, because the
          two statements that must not be skimmed past already look like that.
        */}
        <aside className={styles.disclaimer}>{t('common.disclaimer.long')}</aside>
      </article>
    </PublicShell>
  );
}
```

`ArcanaFacts.tsx` — a server component rendering the fact strip as a `<dl>`: numeral,
element + `elementGloss`, stage, polarity (both orientations), the glyph with its
attribution label, `signGloss` and `modalityGloss` **when they exist**, and the three
keywords from `cardKeywords`. **Render nothing for a null** (M14): the nine planetary
cards' strip is shorter and there is no placeholder.

**Two label traps to avoid, both already paid for elsewhere in this codebase.** `.label`
being `text-transform: uppercase` is what turned `What you are called` into
`WHAT YOU ARE CALLED` over two rows on `/account`; keep every label one or two short words
(`Unsur` / `Element`, not `Unsur yang dibawanya`). And `The High Priestess` in a chip needs
`overflow-wrap: anywhere` or it overflows at 320px — measured in Task 11, not guessed.

`ArcanaViewed.tsx` — `'use client'`, fires `arcana.viewed` once behind a ref guard, exactly
as `TrackView` does (**the ref guard is not optional**: StrictMode double-invokes effects,
so without it the count is wrong only in development, which is the worst kind of
measurement bug). It classifies the referrer into a **closed set** — see
`## Analytics deltas`; the referrer STRING never enters props.

### Green

```sh
npm run dev   # in another shell, with npm run db:up NOT required -- this page has no DB
curl -sS -o /dev/null -w '%{http_code}\n' localhost:3001/arcana/the-moon      # 200
curl -sSi localhost:3001/arcana/the-moon | grep -i 'set-cookie'               # NOTHING
curl -sS localhost:3001/arcana/the-moon | grep -c '<h1'                       # 1
curl -sS localhost:3001/arcana/the-fool -o /dev/null -w '%{http_code}\n'      # 404, no doc yet
npm run typecheck && npm test
```

**Commit:** `S4-7: the /arcana/[slug] page`

---

### Task 8: `page.contract.test.ts` — the fence

**The page itself is not rendered here.** It is a server component reaching `next/headers`
and S1's shell, and the one failure that matters most — a client component reaching for a
session context — is invisible to any renderer that is not a browser (loop 5 is that
check). What *can* be checked is the set of properties that are one deleted line away from
a real hole on a URL a stranger opens. **`src/app/s/[slug]/page.contract.test.ts` is the
model and this file is written in its shape**, including the comment-stripping.

**Files**
- `src/app/arcana/[slug]/page.contract.test.ts` (new)

```ts
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(process.cwd(), 'src', 'app', 'arcana');
const read = (f: string) => readFileSync(join(DIR, f), 'utf8');
/*
 * Comments stripped FOR THE NEGATIVE ASSERTIONS. The page's header says at length
 * that `currentUser()` must never be called here, so `not.toContain('currentUser')`
 * against the raw source fails on the sentence forbidding it.
 * `queries/contract.test.ts` records the lesson: a rule that fires on prose
 * describing the rule is a rule people delete.
 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const SUBTREE = readdirSync(join(DIR, '[slug]'))
  .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'))
  .map((f) => ({ f, code: strip(read(join('[slug]', f))) }));

const PAGE = read(join('[slug]', 'page.tsx'));
const CODE = strip(PAGE);

describe('the public arcana page', () => {
  it('reads the files, so nothing below passes vacuously', () => {
    expect(PAGE).toContain('export default async function ArcanaPage');
    expect(CODE).toContain('loreFor');
    expect(SUBTREE.length).toBeGreaterThanOrEqual(4);
  });

  it('NEVER touches the session, across the whole subtree', () => {
    for (const { f, code } of SUBTREE) {
      for (const banned of [
        'currentUser', 'requireUser', 'ViewerProvider', 'useViewer',
        'cookies()', "from '@/lib/auth/", 'getServerSession', 'auth(',
      ]) {
        expect({ f, banned, hit: code.includes(banned) }).toMatchObject({ hit: false });
      }
    }
  });

  it('NEVER reads the database, and therefore cannot 500 on an outage', () => {
    // Roadmap §10's new non-negotiable. Three routes already 500 instead of 204 when
    // the database is down; this must not be the fourth, and the way to guarantee
    // that is to have no database on the path rather than a try/catch around one.
    for (const { f, code } of SUBTREE) {
      for (const banned of ["from '@/lib/db", 'drizzle', 'queries/']) {
        expect({ f, banned, hit: code.includes(banned) }).toMatchObject({ hit: false });
      }
    }
  });

  it('NEVER generates anything (S-D7, VD7)', () => {
    for (const { f, code } of SUBTREE) {
      for (const banned of [
        "from '@/lib/llm", "from '@/lib/prompt", "from '@/lib/translate",
        "from '@/lib/persona", '/api/translate', 'translateOrCached',
      ]) {
        expect({ f, banned, hit: code.includes(banned) }).toMatchObject({ hit: false });
      }
    }
  });

  it('NEVER sets a cookie and never mints a share link', () => {
    // S-D10: a Set-Cookie makes the response uncacheable at the edge, and these are
    // the pages whose TTFB a crawler measures. S-D8: `/api/share` mints a 60-bit
    // capability URL for a PRIVATE artifact, requires a session, and would
    // manufacture a `noindex` DUPLICATE of a page we are trying to get indexed.
    for (const { f, code } of SUBTREE) {
      expect({ f, hit: /Set-Cookie|cookies\(\)\.set/i.test(code) }).toMatchObject({ hit: false });
      expect({ f, hit: code.includes('/api/share') }).toMatchObject({ hit: false });
      expect({ f, hit: code.includes("from '@/lib/share") }).toMatchObject({ hit: false });
    }
  });

  it('NEVER uses dangerouslySetInnerHTML anywhere in the subtree', () => {
    // ...except the JSON-LD script tag, which is S1's `jsonLdScript` helper and does
    // not live here. If it ever does, it is a `<script type="application/ld+json">`
    // with `JSON.stringify` output and nothing else, and that argument belongs in
    // S1's file with S1's test.
    for (const { f, code } of SUBTREE) {
      expect({ f, hit: code.includes('dangerouslySetInnerHTML') }).toMatchObject({ hit: false });
    }
  });

  it('emits exactly one <h1> and no heading used for styling', () => {
    const h1s = [...CODE.matchAll(/<h1[\s>]/g)].length;
    expect(h1s).toBe(1);
    // Every other heading in the file is h2 or h3; `Prose` emits only those two.
    expect(CODE).not.toMatch(/<h4|<h5|<h6/);
  });

  it('renders cardMeaning for BOTH orientations, adjacent to the authored prose', () => {
    /*
     * **THE ONLY ENFORCEMENT AVAILABLE FOR ROADMAP §7's HARD CONSTRAINT.** There is
     * no test for semantic agreement between a one-line gloss and four paragraphs, so
     * the page puts them on one screen and a contradiction becomes a reading defect a
     * reviewer meets. Deleting these two lines as "duplication of the lore" is the
     * change this assertion exists to fail.
     */
    expect(CODE).toContain('cardMeaning({ card, reversed: false }');
    expect(CODE).toContain('cardMeaning({ card, reversed: true }');
  });

  it('takes the yes/no verdict from effectiveYesNo, never from the document', () => {
    // `doc.yesno` exists to be ASSERTED against the engine in the lint. The words on
    // screen come from the engine plus the catalog, so they are the same words the
    // app prints after a real yes/no reading, by construction.
    expect(CODE).toContain('effectiveYesNo({ card, reversed: false })');
    expect(CODE).toContain('effectiveYesNo({ card, reversed: true })');
  });

  it('builds canonical and hreflang through the ONE helper (S-D15)', () => {
    expect(CODE).toContain('alternates(');
    // Forty-four pages hand-writing three alternate tags is forty-four chances at a
    // non-reciprocal pair, which Google discards silently.
    expect(CODE).not.toContain('rel="alternate"');
    expect(CODE).not.toContain('hreflang');
    // And no hand-built locale prefix anywhere in the subtree.
    for (const { f, code } of SUBTREE) {
      expect({ f, hit: /['"`]\/en\//.test(code) }).toMatchObject({ hit: false });
    }
  });

  it('asks for NO robots directive, and adds no x-robots-tag (S-D12)', () => {
    // The default is indexable and that is the point of the release. The trap runs
    // the other way: a broadly-matching header entry silently noindexing the site.
    expect(CODE).not.toContain('noindex');
    expect(CODE).not.toContain('x-robots-tag');
  });

  it('carries the entertainment-only disclaimer (§8.3)', () => {
    expect(CODE).toContain("t('common.disclaimer.long')");
  });

  it('is a 404 at the routing layer for anything outside the twenty-two', () => {
    expect(CODE).toContain('export const dynamicParams = false');
    expect(CODE).toContain('generateStaticParams');
    expect(CODE).toContain('notFound()');
  });

  it('has NO /arcana index page, deliberately', () => {
    // §3.1: `/gallery` is the index and two indexes of one collection compete. A
    // future release wanting `/arcana` 301s it to `/gallery`; it does not add a page.
    expect(existsSync(join(DIR, 'page.tsx'))).toBe(false);
    expect(existsSync(join(DIR, 'page.ts'))).toBe(false);
  });

  it('leaves no next/link in the ONE client component that could ship one', () => {
    // The share control is `'use client'` and must stay presentational: no router,
    // no navigation, no fetch. It changes the clipboard and fires one event.
    const share = strip(read(join('[slug]', 'ArcanaShare.tsx')));
    expect(share).not.toContain('useRouter');
    expect(share).not.toContain('fetch(');
  });
});
```

```sh
npm test -- arcana/\\[slug\\]/page.contract    # 14 passing
```

**Commit:** `S4-8: the arcana page contract fence`

---

### Task 9: the share control (S-D8)

`navigator.share()` where available, `navigator.clipboard` otherwise, **on the canonical
URL of the page you are standing on.** No session, no network, no row.

**`SHARE_ENTITIES` IS NOT EXTENDED AND `/api/share` IS NOT CALLED.** `src/lib/share/**`
mints 60-bit capability URLs for **private** artifacts and requires a session. A lore
page's URL is already public and is already its canonical address, so minting a `/s/<slug>`
for it would manufacture a **`noindex` duplicate of a page we are trying to get indexed** —
the exact opposite of the release's purpose — and would spend a rate-limit budget to do it.

**Files**
- `src/app/arcana/[slug]/ArcanaShare.tsx` (new, `'use client'`)
- `src/app/arcana/[slug]/ArcanaShare.module.css` (new)
- `src/app/arcana/[slug]/ArcanaShare.test.ts` (new, source-level)

Key decisions, each with its reason:

- **The canonical URL arrives as a PROP, never from `window.location.href` and never from
  `process.env`.** `location.href` carries whatever query string a campaign appended and
  whatever host a preview served, so the shared link would not be the canonical one — and
  a canonical-adjacent URL sent into a group chat is a duplicate we asked for. S-D11's note
  says `NEXT_PUBLIC_SITE_ORIGIN` exists partly for a client share control; a prop resolved
  by the server page is strictly better, because it is the same string
  `generateMetadata` put in `<link rel="canonical">`. `resolve.ts`'s header records
  `localeSwitcherEnabled()` living in `LocaleSwitch.tsx` for ten minutes and reading a
  non-`NEXT_PUBLIC_` variable as `undefined`; a prop cannot make that mistake.
- **`navigator.share` is feature-detected, not user-agent detected**, and the clipboard
  path is not a fallback for failure — it is the fallback for *absence*. A rejected share
  (the user dismissed the sheet) is **not** an error and must not fire the clipboard or a
  `failed` event: `AbortError` is a person changing their mind.
- **`navigator.clipboard` needs a secure context**, so on plain `http://localhost:3001` it
  is present and on `http://<lan-ip>:3001` it is not. If both paths are unavailable the
  control renders a **selectable, `readonly` `<input>` holding the URL** rather than a dead
  button — the same instinct as "a bigger `maxDuration` without a client bound only makes
  the hang longer".
- **The confirmation is `aria-live="polite"`** and reverts after ~2s. `arcana.share.copied`
  is a catalog key, not a hardcoded string.
- **Safari does not focus a `<button>` when it is tapped.** This control does not open a
  dialog so there is no opener to restore, but do not add one later without reading
  `AccountMenu`'s `returnFocusTo` prop first.

The test is source-level in the shape of `ShareFooter.test.ts`: asserts `'use client'`,
`navigator.share` and `navigator.clipboard` both present, `AbortError` handled separately
from a real failure, the `canonical` prop used rather than `window.location`, no
`process.env`, no `/api/share`, no `@/lib/share` import, and the event fired through
`@/lib/analytics/track.client` (**never `@/lib/analytics/track`**, which drags
`node:async_hooks` and `next/server` into the browser bundle and fails the build).

```sh
npm test -- ArcanaShare
```

**Commit:** `S4-9: the share control -- Web Share plus clipboard, never /api/share`

---

### Task 10: `Article` + `ImageObject` + `BreadcrumbList` (S-D16)

**Files**
- `src/app/arcana/[slug]/jsonld.ts` (new — the arcana graph, pure)
- `src/app/arcana/[slug]/jsonld.test.ts` (new)

S1 owns the **builders** (`articleJsonLd`, `breadcrumbJsonLd`, `jsonLdScript`, and the
`Organization`/`WebSite` `@id`s). This file owns **the arcana graph**: which builders, with
what, in what order.

The decision and its reasoning are in `## Architecture`. In code:

```ts
/**
 * The structured data for one lore page. **`Article`, not `CreativeWork`** — roadmap
 * §13 left the choice open and this is S4's call with its reason.
 *
 * `CreativeWork` is `Article`'s parent. Choosing a parent communicates strictly less
 * and buys nothing: Google's documented eligibility is defined over `Article` and its
 * subtypes, never over `CreativeWork`. Every property `Article` expects is honestly
 * true of these documents — they are authored, dated, reviewed and committed as
 * source (S-D7) — and the competitor set is article-shaped, so matching the type
 * matches a category a crawler has already learned for this query class.
 *
 * **THE ARGUMENT FOR `CreativeWork` IS CORRECT AND POINTS AT `about`, NOT AT THE PAGE
 * TYPE.** A tarot card IS an artefact and this page describes it — so the card is the
 * `about` and our painting is the `image`. Both, correctly nested, rather than one
 * flattened compromise.
 *
 * NOT `WebPage`: every page is one, so it says nothing.
 * **NOT `FAQPage`** (S-D16): Google restricted FAQ rich results to authoritative
 * government and health sites in August 2023. The Q&A CONTENT ships; the schema does
 * not, and no part of this graph depends on it.
 * NOT `VisualArtwork` for `about`: that would describe OUR painting rather than the
 * card, and the page is about the card in general.
 *
 * **THE BREADCRUMB'S MIDDLE RUNG IS `/gallery`, NEVER `/arcana`.** `/arcana` is a 404
 * by §3.1, so naming it is a machine-readable claim that a page exists where one does
 * not — worse than a two-item breadcrumb. `/gallery` is the index of this collection
 * by §3.1's own reasoning, which makes it both valid and honest.
 */
```

The test asserts, on the returned objects rather than on a rendered string:

- `@type` is `'Article'`; the string `'FAQPage'` appears nowhere in the file.
- `image` is an `ImageObject` with `width: 800`, `height: 1200`, and `url` **absolute** —
  a relative `og:image` or `ImageObject.url` is the bug §1 names about the missing
  `metadataBase`, and it must be built from S1's `siteOrigin()`.
- `about.name` is `card.name` (**English in both locales**) and `about.identifier` is
  `card.numeral`.
- `inLanguage` is `'id'` or `'en'` and tracks the rendered locale, not the viewer's.
- `mainEntityOfPage` equals the canonical from `alternates()`, so the graph and the
  `<link rel="canonical">` cannot disagree — **a canonical pointing at the wrong host is
  the single worst class of SEO bug because it de-indexes the correct page** (S-D11).
- `breadcrumb` has exactly three items and **item 2's URL ends in `/gallery`**, asserted by
  string, with the comment above as its reason.
- `author` and `publisher` are `@id` **references** to S1's `Organization`, never inline
  duplicates: two definitions of who published this will disagree the first time the
  organisation's name changes.
- `datePublished` is a committed constant per document family and `dateModified` is not
  `new Date()` — a page whose `dateModified` is the request time tells a crawler the
  content changes on every fetch, which is a lie that costs crawl budget.

```sh
npm test -- jsonld
curl -sS localhost:3001/arcana/the-moon \
  | sed -n 's/.*application\/ld+json[^>]*>\(.*\)<\/script>.*/\1/p' | head -c 400
# and paste it into the Rich Results Test before the release
```

**Commit:** `S4-10: Article + ImageObject + BreadcrumbList for a lore page`

---

### Task 11: width, with loop 4 (not a screenshot)

**Neither Chrome available here gives a phone width — both floor at ~500px** — so a
screenshot that *looks* like a phone is not one, and CLAUDE.md records that this file and
`.claude/skills/` both claimed otherwise for three workstreams. **Loop 4 is exact for
container-driven layout**, which this page is.

**Files**
- `public/cards/_arcanafit.html` (new, **gitignored** — `public/cards/_*.html` is in
  `.gitignore`, and that path is excluded by `middleware.ts`'s matcher **twice over**,
  which is the only reason a harness there loads at all)

The harness loads `/arcana/the-moon` in a same-origin iframe, constrains the iframe to 320,
360 and 390, and for each width reports `scrollWidth > clientWidth` on:

1. `article.doc` — **long prose at 320px is the real risk on this page**, and it is the one
   the `68ch` measure does not protect, because at 320 the viewport binds long before the
   measure does.
2 the fact strip — **the widest thing on the page.** `The High Priestess` is 18 characters
  in a chip; `Sagittarius` plus its modality is a long `<dd>`. Expect this to be the one
  that fails first and fix it with `overflow-wrap: anywhere` on the value, not by
  shortening the label.
3. the neighbour/related link rows — `XVIII · The High Priestess` twice on one line.
4. the Q&A `<h3>`s, which are full sentences.
5. the `<img>` — `max-inline-size: 100%` and `height: auto`, and the harness asserts the
  rendered aspect ratio is still 2:3 so nobody "fixes" the CLS with a fixed height.

Run it against **both locales** (`?lang=en` works in development only, and that is fine
here) because `## Localization`'s note is that English usually fits *better* — every English
label is one or two lines while `Yang menanti di depan` takes three — but the fact strip
inverts that: `Sagittarius` and `The High Priestess` are English strings in both locales.

Record the measured numbers in `docs/workstream-notes.md` in Task 34. **Do not report a
screenshot as evidence of fit.**

**Commit:** `S4-11: the loop-4 width harness for a lore page`

---

### Task 12: `/arcana` is a 404, and the gate says so

**Files**
- `src/app/arcana/[slug]/page.contract.test.ts` (already asserts the absence of
  `src/app/arcana/page.tsx` — Task 8)
- **No file S4 owns.** This task is a `## Deltas requested` item and a verification.

**THE ROADMAP CONTRADICTS ITSELF HERE AND SOMEBODY HAS TO PICK.** §3.1 says *"`/arcana`
with no slug is a 404, deliberately"*. §6.1 says `gate.test.ts` gains *"a negative control
per path: `/gallerywhatever`, **`/arcana`**, `/blogroll`…"* — i.e. `/arcana` must **not** be
public. Those cannot both hold: a non-public `/arcana` is a **302 to `/login`**, not a 404,
because `middleware.ts`'s matcher covers it and `decide()` redirects everything
`isPublic()` does not name.

**S4's recommendation: `/arcana` is PUBLIC and 404s.** The reasons, in order:

1. `/arcana` is the parent of twenty-two indexed URLs, so a crawler will try it and people
   hand-edit URLs to it. **Sending that request to a login form is the exact failure the
   release exists to remove** (§1's table: "302 → /login" on every row).
2. A 404 is a correct, terminal answer that costs one response. A redirect to `/login` is
   treated as a soft 404 *attributed to `/login`*, which pollutes the one page §1 already
   complains is our whole indexable surface.
3. It costs nothing: there is no `src/app/arcana/page.tsx` and there will not be, so Next
   404s it without any code from anybody.

So `isPublic()` should name **`/arcana` exactly AND `/arcana/` as one narrow prefix**, and
§6.1's negative control for this path becomes `/arcanaX` and `/arcana-cards` rather than
`/arcana`. **The negative control that must not move is `/en/history` and `/en/account`** —
a prefix-stripping bug that makes the whole app reachable under `/en/` is the worst outcome
available in this release and would look like a working feature.

Verification once S1 lands it:

```sh
for p in /arcana /en/arcana /arcanaX /arcana/ /arcana/not-a-card; do
  curl -sS -o /dev/null -w "%{http_code} $p\n" "http://localhost:3001$p"
done
# want: 404 404 302 404 404      -- and NOT 302 on /arcana
curl -sSI localhost:3001/arcana | grep -i location    # must print nothing
```

**Commit:** `S4-12: assert /arcana is a 404 and request the gate clause`

---

## The authoring brief

**Read this once before Task 13 and keep it open through Task 33.** The two Moon documents
are the worked example; this is the rule set they follow.

### Register

**Dark, unsentimental, concrete.** The art is a bloodied gothic ruin — look at
`public/cards/18_moon.webp` — and Miftah's ruling is that a darker register suits it. That
does not license melodrama: the failure mode on the other side is a page that is atmospheric
and says nothing, which is the "generated filler" risk roadmap §9 logs against exactly this
kind of page and which the v0.3.0 risk table already logged once against V3.

The test, per paragraph: **does this sentence make a claim a reader could disagree with?**
"The Moon speaks of mystery and the unknown depths of the psyche" is unfalsifiable and is
filler. "A hunch holds its shape and gets more specific; a fear changes its account every
time you ask it a second question" is a claim, and a reader can check it against their own
week. Write the second kind.

Three habits that produce it:

- **Name the cost, not only the virtue.** `glosses.ts` states this rule for its sixty-two
  lines and the reason generalises: "stable and reliable" is horoscope filler. Every
  section should say what the card *takes*.
- **Prefer a concrete object or a specific hour to an abstraction.** Two in the morning. A
  survey with half the answers missing. A cobbled road to a city that is rubble.
- **Second person is allowed here** — unlike `glosses.ts`, which is impersonal because a
  prompt turns it into second person. A lore page is addressed to a reader. But **no
  vocatives**: `base.en.ts` forbids "dear one", "beloved", "sweet soul", "dear seeker", "my
  friend", and so does the lint.

### The Indonesian half must read as though an Indonesian wrote it

- `kamu` throughout. Not `Anda`, not `awak`.
- Indonesian, not Malay: `karier` not `kerjaya`, `arah hidup` not `hala tuju`, `ngobrol` not
  `sembang`, `waktu`/`masa simpan` not `tempoh`. The other six in `MALAY` are `kerana`,
  `iaitu`, `ianya`, `manakala`, `seronok`, `kelmarin`.
- **The lint is a floor, not a ceiling.** V3 found `berulang-ulang` matching nothing because
  only `berkali-kali` was on the list, and Gemini once produced `memulakannya` — a
  *morphological* `me-…-kan` leak the eleven-word grep structurally cannot catch. **Read the
  Indonesian out loud.** If a clause sounds like a Malaysian news bulletin, rewrite it.
- Idiom is welcome and is the point: `jam dua pagi`, `menebak sambil merasa yakin`,
  `keterangannya belum masuk`. A document assembled from dictionary equivalents of English
  sentences reads as a translation even when no English document exists.

### The English half is REWRITTEN (§8.2)

**Rewritten means different images and a different entry angle. It does not mean a different
meaning** — the meaning is fixed by `cardMeaning()` and the verdict by `effectiveYesNo()`,
and a pair that disagreed about the card would be two bugs rather than one rewrite.

Three enforcement layers, and Task 6 holds all three:

1. **`anchor` must differ across the pair.** One document enters through the Golden Dawn
   title, the other through the path, or the sign, or the number, or Marseille. This forces
   the divergence to be *planned*.
2. **The DIVERGENCE table**, `glosses.test.ts`'s mechanism: the English words for the
   Indonesian half's interpretation images, forbidden in the English `upright` and
   `reversed`. **The `lore` section is exempt** because both documents describe one
   painting and must share its nouns.
3. **The Q&A asks different questions.** Not the same three reordered.

**How a reviewer checks it in five seconds** — the same procedure `## Localization` rule 3
prescribes: put the two documents side by side and read only the section headings and the
first sentence of each paragraph. **If the paragraphs are in the same order and each makes
the same point in the same figure, it was translated**, and one of the two has to be
rewritten. That check is cheap enough to run on all twenty-two pairs in one sitting and it
is the acceptance test for §8.2.

### What must never appear

- **A translated card name.** `The Moon`, never `Sang Bulan`, never `Pulan`. The lint bans
  `Sang ` + capital and `Pulan` by name; the *reason* is that a card labelled anything else
  disagrees with the reading and with `CardFace`'s own caption. Reader names and `Major
  Arcana` are English in both locales too.
- **Therapy, diagnosis, treatment or healing language, in either locale**, and the English
  list is longer. Watch `heal`/`healing` (Temperance, The Star), `sacred` (The Hierophant),
  `abundance` (The Empress — it is her own keyword and she may still not use the word),
  `shadow work` (The Devil, The Moon), `nervous system`, `trauma`. **`anxiety` is not
  forbidden** — the rule is against diagnosis, so `anxiety disorder`, `clinical` and
  `diagnosed` are.
- **Anything about how the app works** (S-D7's corollary): no prompt, model, token,
  chaining, Shadow Arcana, Lotus, persona, frequency verdict. The `inSpread` section may
  name the three services and the three positions and nothing else.
- **An unverified tradition claim.** VD4's rule about fabricated data presented as fact
  binds here: the Golden Dawn titles and Hebrew letters below are **research targets, not
  facts**, and each must be confirmed with a search before it is committed and cited in the
  document's header comment. A `quote` block requires a `source` for exactly this reason.
- **An `imageAlt` written from memory.** Open the WebP. This deck is its own painting and
  it is not Pamela Colman Smith's.

### Length

The Moon's documents are the target: roughly 550 words of prose each. `lore` is 6–14
blocks, `upright` and `reversed` are 2–4 each, `inSpread` is 1–3, `questions` is 3–5. Task 6
asserts every one of those bands.

**If the release must land sooner, cut CARDS, not words.** Twenty-two thin pages lose to
evatarot on twenty-two queries; eleven real pages win eleven. That is a scope conversation
for reconciliation, not a decision to make at 11pm inside a document.

---

## The twenty-two cards: the correspondence table

Every column here is **derived from committed data and asserted in Tasks 1, 2 and 6** — it
is a worksheet, not a second source of truth. The two "verify" columns are the only ones
requiring research, and neither may be committed unverified.

| id | numeral | name / url slug | glyph → attribution | element · stage · polarity (up→rev) | yes/no (up→rev) | root | Hebrew (verify) | GD title (verify) |
|---|---|---|---|---|---|---|---|---|
| 0 | 0 | The Fool · `the-fool` | ✧ → Air (aether) | air · beginning · light→shadow | yes→no | — | Aleph | Spirit of Aether |
| 1 | I | The Magician · `the-magician` | ☿ → Mercury | air · beginning · light→shadow | yes→no | — | Beth | Magus of Power |
| 2 | II | The High Priestess · `the-high-priestess` | ☾ → Luna | water · beginning · neutral | maybe→maybe | — | Gimel | Priestess of the Silver Star |
| 3 | III | The Empress · `the-empress` | ♀ → Venus | earth · beginning · light→shadow | yes→no | — | Daleth | Daughter of the Mighty Ones |
| 4 | IV | The Emperor · `the-emperor` | ♈ → Aries (cardinal fire) | fire · beginning · neutral | yes→no | — | Heh | Sun of the Morning |
| 5 | V | The Hierophant · `the-hierophant` | ♉ → Taurus (fixed earth) | earth · beginning · neutral | yes→no | — | Vav | Magus of the Eternal |
| 6 | VI | The Lovers · `the-lovers` | ♊ → Gemini (mutable air) | air · beginning · light→shadow | yes→no | — | Zayin | Children of the Voice Divine |
| 7 | VII | The Chariot · `the-chariot` | ♋ → Cancer (cardinal water) | water · beginning · light→shadow | yes→no | — | Cheth | Lord of the Triumph of Light |
| 8 | VIII | Strength · `strength` | ♌ → Leo (fixed fire) | fire · trial · light→shadow | yes→no | — | Teth | Daughter of the Flaming Sword |
| 9 | IX | The Hermit · `the-hermit` | ♍ → Virgo (mutable earth) | earth · trial · neutral | **no→yes** | — | Yod | Prophet of the Eternal |
| 10 | X | Wheel of Fortune · `wheel-of-fortune` | ♃ → Jupiter | fire · trial · neutral | maybe→maybe | **The Magician** | Kaph | Lord of the Forces of Life |
| 11 | XI | Justice · `justice` | ♎ → Libra (cardinal air) | air · trial · neutral | maybe→maybe | **none — see the trap** | Lamed | Ruler of the Balance |
| 12 | XII | The Hanged Man · `the-hanged-man` | ♆ → Neptune | water · trial · **shadow→light** | **no→yes** | The Empress | Mem | Spirit of the Mighty Waters |
| 13 | XIII | Death · `death` | ♏ → Scorpio (fixed water) | water · trial · **shadow→light** | **no→yes** | The Emperor | Nun | Lord of the Gate of Death |
| 14 | XIV | Temperance · `temperance` | ♐ → Sagittarius (mutable fire) | fire · trial · light→shadow | maybe→maybe | The Hierophant | Samekh | Daughter of the Reconcilers |
| 15 | XV | The Devil · `the-devil` | ♑ → Capricorn (cardinal earth) | earth · reckoning · **shadow→light** | **no→yes** | The Lovers | Ayin | Lord of the Gates of Matter |
| 16 | XVI | The Tower · `the-tower` | ♂ → Mars | fire · reckoning · **shadow→light** | **no→yes** | The Chariot | Peh | Lord of the Hosts of the Mighty |
| 17 | XVII | The Star · `the-star` | ♒ → Aquarius (fixed air) | air · reckoning · light→shadow | yes→no | Strength | Tzaddi | Daughter of the Firmament |
| 18 | XVIII | The Moon · `the-moon` | ♓ → Pisces (mutable water) | water · reckoning · **shadow→light** | **no→yes** | The Hermit | Qoph | Ruler of Flux and Reflux |
| 19 | XIX | The Sun · `the-sun` | ☉ → Sol | fire · reckoning · light→shadow | yes→no | The Magician | Resh | Lord of the Fire of the World |
| 20 | XX | Judgement · `judgement` | ♇ → Pluto | water · reckoning · neutral | yes→no | The High Priestess | Shin | Spirit of the Primal Fire |
| 21 | XXI | The World · `the-world` | ♄ → Saturn | earth · reckoning · light→shadow | yes→no | The Empress | Tau | Great One of the Night of Time |

**Six rows that will be got wrong if this table is not consulted.**

- **The Hermit answers `no` upright and `yes` reversed**, which is the opposite of the
  intuition that a wise old man is a yes. Five cards share the shape: The Hermit, The Hanged
  Man, Death, The Devil, The Tower, The Moon.
- **Justice has no root card**, because `reduce(11)` is 11 — the master numbers are fixed
  points since reconciliation §5.3 — so `arcanaFor` maps it back to itself and
  `rootCardFor` returns null. **Do not write a "Justice reduces to…" paragraph.**
- **The Empress, The Emperor, The Hierophant and Justice are `neutral` in polarity** for
  four of them and neutral does not flip, so their reversed sections must not lean on a
  polarity change that did not happen.
- **Reversed The Moon, Death, The Devil, The Tower and The Hanged Man are `light`.** A
  reversed shadow card is *less* dark by the engine's own reckoning, and a document calling
  reversed Death the darker reading contradicts the strip rendered directly above it.
- **`Judgement`, not `Judgment`**, and `judgement` in the URL. The card spells it that way.
- **Judgement's element is `water` in `cards.json` while the Golden Dawn attributes the
  trump to Fire.** Both facts are true and the page renders ours. **Do not "fix"
  `cards.json`** — it is generated, S4 does not own the generator, and the reading prompt
  has consumed `element` since the first release. Task 2 asserts the twelve *sign* cards
  only, for exactly this reason.

## The twenty-two cards: the editorial table

The anchor pair must differ (Task 6 asserts it); the images are the writer's, and the
DIVERGENCE column is the English words each pair's table row will forbid in the English
interpretation sections.

| url slug | `id` anchor | `en` anchor | `id` entry image (suggested) | `en` entry angle (suggested) |
|---|---|---|---|---|
| `the-fool` | `element` — the aether mark, and why this is the one card with no planet | `number` — zero, and what a card numbered nothing is doing at the front | a step taken off a kerb you did not look at | the only card whose number is an absence |
| `the-magician` | `goldenDawnTitle` — Magus of Power | `hebrewLetter` — Beth, the house | one tool picked up out of four | capability that has finally been pointed at something |
| `the-high-priestess` | `sign` — Luna, and water in a `neutral` card | `rws` — the veil and the two pillars | a door left ajar on purpose | the answer already in the room, unsaid |
| `the-empress` | `sign` — Venus and earth | `stage` — still `beginning`, and what that costs | a garden that is fed every day | the arithmetic of care given past your own limit |
| `the-emperor` | `sign` — Aries, cardinal fire under a `neutral` card | `goldenDawnTitle` — Sun of the Morning | a fence post set deep | structure as a favour, and as a cage |
| `the-hierophant` | `hebrewLetter` — Vav, the nail | `sign` — Taurus, fixed earth | a rule your grandmother could recite | inherited instruction that still earns its place |
| `the-lovers` | `sign` — Gemini, and why a union card is `air` | `rws` — the figure above the two | one choice made with the whole of you | two directions, and the cost of not picking |
| `the-chariot` | `goldenDawnTitle` — Triumph of Light | `sign` — Cancer, cardinal water under armour | reins still in your hands | momentum you can steer versus force with nowhere to point |
| `strength` | `marseille` — VIII versus XI, and Waite's swap | `sign` — Leo, fixed fire | a hand on a muzzle, not a fist | gentleness that turns out to hold the reins |
| `the-hermit` | `sign` — Virgo, mutable earth | `goldenDawnTitle` — Prophet of the Eternal | one lamp on a table late | a `no` that is a postponement, not a refusal |
| `wheel-of-fortune` | `number` — ten folding back to one | `hebrewLetter` — Kaph, the open palm | a cart wheel too heavy to stop | your turn arriving whether or not you are ready |
| `justice` | `marseille` — XI versus VIII, the other half of the swap | `sign` — Libra, cardinal air | two pans levelled until your arm aches | the reckoning, and a scale tilted by fear |
| `the-hanged-man` | `hebrewLetter` — Mem, water | `path` — the suspended path | hanging by one ankle, on purpose | the angle changing because you stopped |
| `death` | `sign` — Scorpio, fixed water | `marseille` — the unnamed thirteenth | a field cleared on purpose | an ending that frees, versus a grip on what is finished |
| `temperance` | `goldenDawnTitle` — Daughter of the Reconcilers | `sign` — Sagittarius, mutable fire | two liquids poured slowly into one cup | the middle way, and the patience it charges |
| `the-devil` | `sign` — Capricorn, cardinal earth | `rws` — the chain that is not fastened | a chain you can see from where you stand | a hunger you have not dared to name |
| `the-tower` | `sign` — Mars | `goldenDawnTitle` — Hosts of the Mighty | lightning, and the roof going | the collapse that needed to happen |
| `the-star` | `number` — seventeen folding to eight | `sign` — Aquarius, fixed air, standing slightly outside | water poured back into the pool | quiet hope, after everything came apart |
| `the-moon` | `goldenDawnTitle` — Flux and Reflux, then Qoph | `path` — Netzach down into Malkuth | two in the morning; one message, seven times | insufficient light; a survey with half its answers |
| `the-sun` | `sign` — Sol | `hebrewLetter` — Resh, the head | midday, and nothing left in shadow | plain truth, and the glare that hides detail |
| `judgement` | `element` — water against the Golden Dawn's fire | `goldenDawnTitle` — Spirit of the Primal Fire | a name called out across a yard | a call you have to answer, or keep putting off |
| `the-world` | `sign` — Saturn | `number` — twenty-one folding to three | a circle finally closed | completion, and an ending announced too early |

---

## Tasks 13–33: one card per task, twenty-one tasks

**ONE TASK PER CARD IS DELIBERATE AND IT IS THE RIGHT GRANULARITY.** Three arguments, and
they are the reason this is not batched by stage into three tasks:

1. **Each card is an independent writing act with its own research.** Nothing about The
   Devil informs The Star, and a task that holds seven cards holds seven unfinished
   research questions.
2. **The lint runs per task.** A therapy word in card six of a seven-card commit means
   rebasing five documents that were fine. At one card per commit the failure is local.
3. **A reviewer reads one card per commit.** This is content, and the review is *reading*,
   not diffing. Twenty-one commits each holding two documents and one table row is exactly
   what a person can review in one sitting. A commit holding fourteen documents is not
   reviewed.

**Order: card id ascending** (Task 13 = The Fool … Task 33 = The World, skipping The Moon,
which is Task 5). Ascending because the Fool's Journey is the order the writer's own sense of
the arc develops in, and because the four `beginning`-stage cards are the easiest and build
the habit before Death.

### The template each of Tasks 13–33 follows

**Files** (four, every time)
- `src/content/arcana/<slug>.id.ts` (new)
- `src/content/arcana/<slug>.en.ts` (new)
- `src/content/arcana/index.ts` (edit — one entry, **in card order**)
- `src/content/arcana/lore.test.ts` (edit — one `DIVERGENCE` row)

**Step 1 — research, before writing a word.** Confirm the Hebrew letter and the Golden Dawn
title with a search and record the URL in the document's header comment. Confirm the
Rider-Waite composition. VD4's rule binds: an unverified tradition claim on a public page is
fabricated data presented as fact.

**Step 2 — look at the painting.** `Read public/cards/<artSlug>.webp`. Write `imageAlt` from
what is actually there and write the art paragraph from the same look. **This deck is not
Pamela Colman Smith's** — The Moon's face is turned down, the towers are ruined, the pool is
fouled. Assume nothing.

**Step 3 — read the row.** The correspondence table's row for this card, and the six
warnings under it. Copy `yesno` from the table, not from intuition.

**Step 4 — the failing test.** Add the `DIVERGENCE` row for this slug **first**:

```ts
      '<slug>': ['<english word for the id half's first image>', '…'],
```

```sh
npm test -- lore
```

**Expected failure:** `expect(Object.keys(DIVERGENCE).sort()).toEqual([...LORE_SLUGS].sort())`
fails, printing the slug present in the table and absent from the registry. That assertion
is what makes the table and the tree impossible to drift apart, and it is why the row goes
in before the documents.

**Step 5 — write both documents, then register them.** Indonesian first, always: it is the
source language (`## Localization` rule 2's argument, applied to prose rather than to keys),
and writing the English first produces an Indonesian document that is a translation no
matter how carefully it is written.

**Step 6 — green.**

```sh
npm test -- lore              # every case, over 2N documents
npm test -- content/arcana    # the registry's order and self-agreement
npm test && npm run typecheck
curl -sS -o /dev/null -w '%{http_code}\n' localhost:3001/arcana/<slug>       # 200
curl -sS -o /dev/null -w '%{http_code}\n' localhost:3001/en/arcana/<slug>    # 200 once S2 lands
```

**Step 7 — read it on the page, in both locales, before committing.** The lint checks words;
nothing checks whether the page is worth reading. This is the step the release's quality
actually depends on.

**Commit:** `S4-<n>: <Card Name> (<numeral>), both locales`

### The four cards that need extra care, and why

- **Task 21 (`strength`) and Task 24 (`justice`) are a pair and must be written together in
  spirit even though they are two tasks.** Our deck numbers Strength VIII with Leo and
  Justice XI with Libra, which is Waite's arrangement; Marseille has them the other way
  round. Both documents have to tell that story consistently, and each is the other's
  natural `cardRef`. Write Strength, then Justice, and re-read Strength.
- **Task 26 (`death`) is the highest-risk document in the release.** The word `death` next
  to anything that reads as diagnosis or as a prediction about a real person is the one
  place the therapy constraint and the entertainment-only disclaimer are both load-bearing
  at once. `THERAPY_ID`/`THERAPY_EN` do not contain `death`, so **the lint will not save
  this one** — the rule is the honest line, not the word list. Write about endings that
  have already happened.
- **Task 28 (`the-devil`) will reach for `shadow work`.** It is on `EN_TICS`. `shadow` alone
  is fine and is the card's own English keyword.
- **Task 16 (`the-empress`) may not use the word `abundance`**, which is her own English
  keyword. Say what it is instead. See Task 6's trap note.

---

### Task 34: completeness, the build, the signed-out crawl, and the record

**Files**
- `src/content/arcana/lore.test.ts` (edit — the completeness case)
- `src/content/arcana/registry.test.ts` (edit — delete the `loreFor('the-fool')` line)
- `CLAUDE.md` (edit — a `## Card lore pages (S4)` section)
- `docs/workstream-notes.md` (edit — the traps, the measurements, the harness internals)

### The completeness assertion, and why it lands last on purpose

```ts
  it('covers all twenty-two cards in BOTH locales', () => {
    /*
     * **WRITTEN IN THE LAST TASK, DELIBERATELY.** A test that is red for twenty-one
     * commits is a test people learn to scroll past, and by the time it matters
     * nobody reads its output. Every per-document assertion in this file has been
     * green since Task 6; this one is the release gate.
     *
     * `CARD_URL_SLUGS` and not a transcribed list: the address contract already has
     * exactly one hand-written table and it is in `urlSlug.test.ts`.
     */
    expect([...LORE_SLUGS]).toEqual([...CARD_URL_SLUGS]);
    for (const slug of CARD_URL_SLUGS) {
      for (const locale of ['id', 'en'] as const) {
        expect({ slug, locale, present: loreFor(slug, locale) !== undefined })
          .toMatchObject({ present: true });
      }
    }
    expect(ALL).toHaveLength(44);
  });
```

Also delete Task 5's `expect(loreFor('the-fool', 'id')).toBeUndefined()` — it was true while
the tree was being written and is now a lie. **Task 13 deletes it**, in the commit that adds
The Fool; this task verifies it is gone.

### The build, which is not optional

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
node -v                    # v24.x -- check this before believing a build failure
npm run typecheck
npm test                    # the unit project alone
npm run test:integration    # separately. S4 adds NO integration test (roadmap §11.1)
npm run build
```

**`npm run typecheck` being green is not an answer** — the TypeScript trap: `npm install
typescript` resolves to 7.x, which passes `tsc --noEmit` and dies in `next build`.
`audit:secrets` runs inside the build and is the built-output grep that no source-level fence
can substitute for. **If the build dies with 36 `@vercel/turbopack-next/internal/font/google`
errors, retry it** — that is `next/font` losing a DNS race that does not honour
`RES_OPTIONS`, not a code failure.

Read the build output and **expect `ƒ` on `/arcana/[slug]`.** `●` would mean the root layout
stopped awaiting `getLocale()`, which is `## Localization` rule 5 being undone.

### The signed-out crawl — the acceptance test (§11.2)

**With no cookie jar.** This is the check the release exists to pass.

```sh
BASE=http://localhost:3001    # then again against the Vercel preview

# every lore URL, both locales, must be 200 with no redirect
for slug in the-fool the-magician the-high-priestess the-empress the-emperor \
            the-hierophant the-lovers the-chariot strength the-hermit \
            wheel-of-fortune justice the-hanged-man death temperance the-devil \
            the-tower the-star the-moon the-sun judgement the-world; do
  for p in "/arcana/$slug" "/en/arcana/$slug"; do
    code=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE$p")
    [ "$code" = 200 ] || echo "FAIL $code $p"
  done
done
echo 'crawl done'

# no cookie, on any of them. A 302 or a Set-Cookie anywhere is the release failing.
curl -sSI "$BASE/arcana/the-moon" | grep -Ei 'set-cookie|^location' && echo 'FAIL'

# the head of the document: one h1, canonical, three alternates, no noindex
curl -sS "$BASE/arcana/the-moon" > /tmp/moon.html
grep -c '<h1' /tmp/moon.html                       # 1
grep -o 'rel="canonical" href="[^"]*"' /tmp/moon.html
grep -o 'hreflang="[^"]*" href="[^"]*"' /tmp/moon.html   # id, en, x-default -- three
grep -ci noindex /tmp/moon.html                    # 0
grep -o '"@type":"[^"]*"' /tmp/moon.html           # Article, ImageObject, BreadcrumbList
grep -c 'FAQPage' /tmp/moon.html                   # 0

# reciprocity, by hand once (S-D15): the en page must name the id page back
curl -sS "$BASE/en/arcana/the-moon" | grep -o 'hreflang="id" href="[^"]*"'

# and /arcana itself
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/arcana"        # 404, NOT 302
```

**Loop 5** for the two questions `curl` cannot answer:

```sh
tools/e2e/run.sh   # E2E_BASE=http://localhost:3001
# 1. /en/arcana/the-moon actually renders English -- read the DOM, not a screenshot
# 2. THE PAGE IS COMPLETE WITH JAVASCRIPT DISABLED. Emulation.setScriptExecutionDisabled
#    then navigate: every section, every internal link and the disclaimer must be in the
#    DOM. This is what a crawler is most reliably given, and it is also the check that
#    catches a client component reaching for a session context -- which renders correct
#    HTML on the server and throws during hydration, so `curl` reports 200 on a page that
#    is dead in a browser (`/s/[slug]`'s recorded trap).
# NOT for width: --width 390 becomes --window-size=390,844 and innerWidth measures 500.
```

**Loop 6** — a real iPhone against a Vercel preview — for the one thing WSL structurally
cannot test: **`navigator.share()` actually opening the iOS share sheet.** Chrome on Linux
has no share target, so the clipboard branch is the only one any local loop exercises.
Also look at the art at retina on a phone, because these pages are the first place a stranger
looks at it closely.

### The record

`CLAUDE.md` gains a short `## Card lore pages (S4)` section: the file map, the four rules a
future session will otherwise undo (**prose is data because the lint needs strings; card
names stay English; `doc.yesno` is asserted against `effectiveYesNo` and is never the source
of what is rendered; `EN_TICS` bans The Empress's own keyword and the lint's scope is
`src/content/**` only**), the `Article`-not-`CreativeWork` decision in two sentences, and a
pointer to `docs/workstream-notes.md` for everything else. **Add new traps to
workstream-notes, not here** — CLAUDE.md stays short enough to be worth loading.

`docs/workstream-notes.md` gains the full record: the twelve-card element invariant and how
it was checked, the Justice/`reduce(11)` trap, the `sobat`/`obat` word-boundary finding, the
`abundance` collision, the `/arcana` 404-versus-302 contradiction and how it was resolved,
the measured loop-4 numbers at 320/360/390 in both locales, the DIVERGENCE mechanism and its
`lore`-section exemption with the `glosses.ts` precedent, and the three deliberately-broken
lint runs from Task 6 with their exact failure output.

**Commit:** `S4-34: completeness, the signed-out crawl, and the record`

---

## Schema deltas

**None.** S-D14, and the reason is stronger than "we do not need one": a migration in
v0.4.0 drags in the failure that took production down on 2026-07-28 — `npm run build` applies
migrations on Vercel and **fails the build** when it cannot — for a release that otherwise
does not touch the database at all.

Nothing in S4 reads or writes Postgres. That is not a policy this workstream follows, it is
a **property `page.contract.test.ts` asserts across the whole subtree** (no `@/lib/db`, no
`drizzle`, no `queries/`), which is what makes roadmap §10's "a public page must not be able
to 500 on a database outage" true by construction rather than by a try/catch. Three routes
already carry that bug (`/api/memory/{frequency,summary}`, `/api/persona`); this is not the
fourth.

---

## Analytics deltas

**S1 folds these into `src/lib/analytics/events.ts` in one edit (S-D13).** S4 does not touch
that file. Names and prop shapes only, following its five rules.

```ts
// — S4: public card lore pages —
'arcana.viewed',
'arcana.shared',
'arcana.link_clicked',
```

```ts
'arcana.viewed':        { card_id: number; locale: 'id' | 'en';
                          from: 'direct' | 'gallery' | 'arcana' | 'blog' | 'home' | 'external' };
'arcana.shared':        { card_id: number; locale: 'id' | 'en';
                          method: 'web_share' | 'clipboard' | 'manual' | 'failed' };
'arcana.link_clicked':  { card_id: number; to_card_id: number | null;
                          kind: 'neighbour' | 'root' | 'element' | 'stage' | 'gallery' | 'inline' };
```

Every rule in that file's header, applied:

1. **No free text, ever.** `from` is the hard case and it is closed: the referrer is
   classified **in the client component** by matching a same-origin referrer's *pathname*
   against the known content routes, and **the referrer string never enters props.** A
   cross-origin referrer is `'external'` and nothing about which origin is recorded. These
   rows survive account erasure with `user_id` nulled, and that is only honest because
   `sanitizeProps()` can prove there is nothing identifying in them.
2. **No unbounded cardinality.** `card_id` is one of twenty-two; `kind` and `method` are
   closed sets.
3. **Ids are ids.** `card_id` is the integer, never `card.name` and never the slug — the slug
   is derivable and the name is the display string. This is why there is no `slug` prop, and
   somebody will want to add one.
4. **One event with props over five events.** The gallery-return the brief asks for is
   `arcana.link_clicked` with `kind: 'gallery'`, not a separate `gallery.returned`. Same for
   the neighbour click.
5. **A sometimes-absent prop is `| null`, never optional.** `to_card_id` is `null` for
   `kind: 'gallery'`, because jsonb with a missing key and jsonb with an explicit null behave
   differently in a `where` clause and the second is the one you want.

**`user_id` is null on all three**, the way `share.viewed` is: these fire on a page with no
session, and `/api/events` is public precisely so events that happen before there is a
session can be recorded. `arcana.viewed` carries **no `session_id`** either, for the reason
middleware gives for skipping the locale cookie on `/s/`: a stranger who never agreed to
anything should leave with nothing to correlate on, and `/privacy` §4.4 is honest only while
that is true.

All three fire from `@/lib/analytics/track.client`, **never** from `@/lib/analytics/track` —
which drags `node:async_hooks` and `next/server` into the browser bundle and fails the build.
`track()` returns `void` and must never be awaited.

**One known gap, named rather than hidden:** `arcana.viewed.from` will report `'direct'` for
a hard navigation with a stripped referrer, which is most crawler and most privacy-browser
traffic. `account.details_viewed` already has the degenerate version of this bug (it always
reports `from: 'direct'`); this one is at least sometimes right and never wrong.

---

## Deltas requested

Ordered by who owns the file. **Every one is coded against a named signature in Task 7 or
Task 10, so a different spelling changes those two files and nothing else.**

### From S1

1. **`src/lib/auth/gate.ts` — `isPublic()` names `/arcana` EXACTLY as well as `/arcana/` as
   one narrow prefix.** §3.1 wants `/arcana` to be a 404 and §6.1's negative-control list
   wants it non-public; those contradict, because a non-public `/arcana` is a 302 to
   `/login`. Task 12 has the full argument. **§6.1's negative control for this path should
   become `/arcanaX` and `/arcana-cards`.** `/en/history` and `/en/account` must stay in that
   list unchanged — a prefix-stripping bug that makes the app reachable under `/en/` is the
   worst outcome available in this release.
2. **`src/lib/analytics/events.ts` — the three events above** (S-D13).
3. **`src/lib/i18n/locales/{id,en}.ts` — thirty-five chrome keys, `id.ts` first** (S-D6, I2).
   All short; none is prose, so §11.4's max-length guard passes:
   `arcana.upright`, `arcana.reversed`, `arcana.verdict`, `arcana.lore`, `arcana.inSpread`,
   `arcana.questions`, `arcana.neighbours`, `arcana.related`, `arcana.related.root`,
   `arcana.related.element`, `arcana.related.stage`, `arcana.gallery`, `arcana.share`,
   `arcana.share.copied`, `arcana.facts.numeral`, `arcana.facts.element`,
   `arcana.facts.stage`, `arcana.facts.polarity`, `arcana.facts.attribution`,
   `arcana.facts.keywords`, `arcana.facts.modality`,
   `arcana.element.{fire,earth,air,water}`, `arcana.stage.{beginning,trial,reckoning}`,
   `arcana.polarity.{light,shadow,neutral}`, `arcana.modality.{cardinal,fixed,mutable}`.
   **The enum VALUES stay English in the data and the displayed WORD is a catalog key** —
   `reading.verdict.{yes,no,maybe}` is the existing precedent and this reuses it rather than
   adding a fourth spelling. **Keep every label one or two short words**: `.label` is
   `text-transform: uppercase` on `/account` and that is what turned `What you are called`
   into `WHAT YOU ARE CALLED` over two rows.
4. **`src/app/sitemap.ts` — the arcana URLs come from `LORE_SLUGS` (the registry), not from
   `CARD_URL_SLUGS`.** While the forty-four are being written, advertising a URL whose
   document does not exist is telling a crawler about a 404. After Task 34 the two lists are
   identical, so the safe spelling costs nothing forever. Both locales; S2 owns the locale
   expansion.
5. **The JSON-LD builders (S-D16).** Signatures in Task 7. Task 10 needs `Organization` and
   `WebSite` exposed as `@id` **references** rather than inlined — two definitions of who
   published this disagree the first time the organisation's name changes.
6. **The public shell.** `PublicShell` wrapping `children`, carrying the header, the footer
   and the cross-links. It must **set no cookie and read no session** (S-D10, S-D5), because
   `page.contract.test.ts` fences this subtree and a shell that calls `currentUser()` breaks
   forty-four pages at once — and `curl` cannot see it.
7. **`next.config.ts` — a cache header for `/arcana/:path*`** (S-D10): `cache-control:
   public, s-maxage=86400, stale-while-revalidate=604800`. **Placed after `/(.*)` and
   carrying NO `x-robots-tag`** (S-D12): a broadly-matching robots header would silently
   `noindex` the site and `headers.test.ts` is the only thing that would notice. Please add
   the case asserting it applies here **and** that `/s/` is still
   `noindex, nofollow, noarchive`.
8. **`src/lib/clientBoundary.test.ts`** — S4 adds the `src/content/**` fence itself in Task 6
   (§5 rule 1). Flagging it because §6.5's owner table does not list that file; if it should
   be S1's edit, take the two cases from Task 6 verbatim.

### From S2

9. **`localePath(locale, path)` and the `alternates(path)` helper (S-D15).** Signatures in
   Task 7. `alternates` must emit `x-default` and must be **reciprocal**; the slug is
   identical in both locales (S-D4), which is what makes this a clean `/arcana/X` ↔
   `/en/arcana/X` mapping with no per-locale slug table.
10. **`src/middleware.ts` — grow the `/s/` cookie-write guard to cover `/arcana`** (S-D10).
    A `Set-Cookie` makes the response uncacheable at the edge and these are the pages whose
    TTFB a crawler measures. And `NextResponse.rewrite(url, { request: { headers } })` — the
    `request:` form is the only one that mutates what a server component sees, and the
    failure without it is silent: `getLocale()` falls through to the cookie and the page is
    *occasionally* in the wrong language.

### From S6

11. **`src/content/types.ts` — S4 defines `Block`, `BlockKind`, `QA`, `LORE_ANCHORS`,
    `LoreAnchor` and `LoreDoc`; S6 APPENDS `BlogDoc` below the marker comment and changes
    nothing above it.** Roadmap §5's tree puts both document types in one file and §12 names
    this as one of two seams. `Block` is shared and **nobody widens it** — a sixth block kind
    is a reconciliation question, not a convenience, because `src/components/Prose.tsx` is
    the one renderer and its `switch` is exhaustive with a `never` default. S6 mounts `Prose`
    rather than writing a second renderer.

### From reconciliation

12. **`src/lib/copy/vocab.ts` — add `attachment style`, `process your feelings` and
    `do the work` to `THERAPY_EN`.** `src/lib/prompt/base.en.ts` already forbids all three in
    prose and `vocab.ts` should be a superset of what the prompt forbids; its own header says
    "do not add a third copy". **Verified safe**: no value in `NUMBER_GLOSSES`,
    `SIGN_GLOSSES`, `ELEMENT_GLOSSES` or `MODALITY_GLOSSES` matches any of the three under
    `\b…\b`, so `glosses.test.ts` stays green. That file has no owner in §6.5's table, which
    is why this is a reconciliation item rather than a request to a workstream. If refused,
    Task 6 declares them locally in an `UPSTREAM_PENDING` array with a comment saying where
    they belong.
13. **`src/lib/arcana/correspondence.ts` is a NEW directory and S4 owns it.** §6.5 gives S4
    only `src/data/deck.ts` under the existing files, and this is new rather than an edit —
    recorded so reconciliation knows. **S3 may import it** for the gallery zoom's attribution
    label and must not redefine the glyph table; it is pure and client-importable precisely
    so that is possible. `src/components/Prose.tsx` is likewise new and S6 mounts it.
14. **`gallery.title` must exist as a catalog key** (S3 declares it). Task 10's
    `BreadcrumbList` names the middle rung and takes its label from there rather than
    inventing a second word for the same page.

---

## Flags

1. **§3.1 and §6.1 contradict each other about `/arcana`, and one of them has to lose.**
   §3.1: "`/arcana` with no slug is a 404, deliberately." §6.1: the negative-control list
   includes `/arcana`, i.e. it must not be public — and a non-public `/arcana` is a **302 to
   `/login`**, not a 404, because middleware's matcher covers it. I have chosen 404 and asked
   S1 for the clause (Deltas 1, Task 12). **If S1 keeps `/arcana` non-public, the parent of
   twenty-two indexed URLs redirects to a login form**, which is the failure §1's table
   exists to describe, and §3.1 is not satisfied.

2. **`generateStaticParams` will NOT produce static HTML, and §7's wording invites the
   opposite expectation.** The root layout awaits `getLocale()` (S-D10 accepts this;
   `## Localization` rule 5 forbids changing it), so `/arcana/[slug]` builds as **`ƒ`**. What
   `generateStaticParams` + `dynamicParams = false` buys is a 404 at the routing layer, and
   the TTFB story is **entirely** S1's cache headers. A reviewer expecting `●` in the build
   output should be told this before they read it as a defect.

3. **If `en` is cut (§1: "when effort has to be cut, `id` ships complete and `en` waits"),
   S-D15's reciprocity assumption breaks.** `hreflang` must be reciprocal and include
   `x-default`; a pair naming an English URL that 404s is a **non-reciprocal pair, which
   Google discards silently** — the whole tag set stops working and nothing reports it.
   **Recommendation: ship both locales for a card, or ship `id` alone with NO `en` alternate
   emitted for that path.** Per-card, not per-release. Task 34's completeness test would need
   splitting per locale, and `alternates()` would need to take the set of locales that
   actually exist for a path — which is a change to S2's signature, so it is cheaper to
   decide now than after.

4. **`EN_TICS` contains `abundance`, which is The Empress's own English keyword in
   `cards.json`.** The lint scans `src/content/**` only, so the keyword chip is unaffected
   and The Empress's English lore simply may not use the word. **Anyone who "improves" the
   lint to scan the rendered page will fail on data S4 does not own** (`cards.json` is
   generated by `tools/generate_cards.py`), conclude the lint is broken, and switch it off.
   Same shape for `sacred` (The Hierophant), `heal`/`healing` (Temperance, The Star) and
   `shadow work` (The Devil, The Moon).

5. **Justice has no root card, and it is a tautology rather than a gap.** `reduce(11)` is 11
   — the master numbers became **fixed points** in reconciliation §5.3 — so `arcanaFor(11)`
   is Justice. `rootCardFor` suppresses it. Anyone who "restores" the missing block will
   render "Justice reduces to Justice", and anyone who instead changes `reduce` to fix that
   silently rewrites the meaning of every `frequency_verdicts` and `personas` row already
   stored (that amendment's own warning).

6. **`Judgement`'s element is `water` in `cards.json` while the Golden Dawn attributes the
   trump to Fire.** Task 2 asserts the element agreement for the **twelve sign cards only**,
   which all agree exactly; the nine planetary ones are editorial and are not asserted. **Do
   not "fix" `cards.json`** — it is generated, S4 does not own the generator, and the reading
   prompt has consumed `element` since the first release. The lore for Judgement should name
   ours and may note the tradition's; that is the `element`-versus-`goldenDawnTitle` anchor
   pair in the editorial table.

7. **The lore pages are the first surface where a stranger looks at the art closely, and
   `docs/art-inconsistency.md` says the deck is three inconsistent generations** — cream
   frames at 44–49% luminance against navy at 8–29%, and cards 12–21 sharing one background
   composition. Twenty-two pages seen in sequence is exactly the presentation that makes that
   visible. **Regenerating is out of scope** (S-D9, and §13 lists it as out of scope while
   still calling it the highest-leverage art fix). Recorded because this release is what will
   prompt somebody to ask.

8. **Forty-four documents at the exemplars' length is roughly 24,000 words of committed
   prose per locale, and no model may write any of it** (S-D7). That is the single largest
   line item in the release and it is a human writing act twenty-two times over. **If the
   release must land sooner, cut CARDS and not words**: twenty-two thin pages lose to
   evatarot on twenty-two queries, eleven real pages win eleven. Splitting the tree is
   already supported — `LORE_SLUGS` drives the sitemap and an unwritten card 404s — so a
   partial release is mechanically clean and needs only Task 34's completeness assertion
   relaxed to the shipped set. **That is a reconciliation decision, not one to take inside a
   document at 11pm.**

9. **The Golden Dawn titles and Hebrew letters in the correspondence table are RESEARCH
   TARGETS, not verified facts.** They are written from one source and from memory, and VD4's
   rule — no fabricated data presented as fact — binds a public page harder than it binds
   `/account`. Each must be confirmed with a search in its own task and the URL recorded in
   the document's header. A `quote` block's required `source` field exists for the same
   reason. **The row for Judgement is the one most likely to be wrong**, because the modern
   outer planets are not part of the original system and the sources disagree about them.

10. **No lint can tell whether a page is worth reading.** Every mechanical check in Task 6
    passes on twenty-two documents of atmospheric nothing, and roadmap §9's first risk is
    exactly that. **The acceptance test is Miftah reading four pages** — one from each stage
    plus Death — in both locales, on a phone. That is not a step this plan can automate and
    it should not pretend otherwise; step 7 of the per-card template is where it happens
    twenty-two times and Task 34 is where it happens once for the release.
