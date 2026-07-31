# The blog editor becomes three fields and a paste box

**2026-07-31. Design, agreed with Miftah in five rulings. Supersedes A6 tasks 20–22's
editor surface and nothing else about A6.**

The A6 block editor is 880 lines of form controls over the `Block[]` union, and the
premise it was built on has not held: **nobody composes an article in it.** An article
arrives already written, from Gemini or ChatGPT, in markdown, on the clipboard. The
editor's job is not to be a writing surface — it is to accept a paste, turn it into the
five block kinds the renderer already knows, and refuse what the lint refuses.

This document is the design for that. It also records two defects found while reading the
current surface, one of which loses published content.

---

## §1. What is actually wrong

**1.1 The locale tabs keep the other locale's document in the form, and Save writes it.**
The tabs in `src/app/admin/blog/[slug]/page.tsx:126` are `<Link>`s, so pressing one is a
soft navigation *within the same route segment*. The server re-renders — which is why the
preview changes, and why the report reads as "only Pratinjau changes" — but React
reconciles `<BlockEditor>` as the same element, there is no `key`, and every field is
`useState(initial?.… ?? '')`, which runs on mount and never again.

`save()` then posts `{ slug, locale }` with the **new** locale
(`BlockEditor.tsx:246`). So: open `?locale=id`, press **English**, press **Simpan** →
the Indonesian body is written into the `en` row. On a published article that is silent
content loss behind a screen that looks correct. It is the `useState`-initialiser class of
bug CLAUDE.md already records twice (the shuffle trap, `todayKey()` during render): state
seeded from a prop that later changes.

**1.2 `Teks Alternatif Gambar` asks for a string that is already written, 44 times.**
`LoreDoc.imageAlt` is one alt text per card per locale, in
`src/content/arcana/<slug>.<locale>.ts`, and `lore.test.ts` already asserts each is ≥60
characters, does not begin with the card name, and describes *our* painting rather than a
remembered Rider-Waite. Asking an admin to write a second one produces a second
description of the same image, and only the first is linted.

**1.3 The block editor is a JSON editor.** A6's own header records the evidence without
drawing the conclusion: the span text control is a `<textarea>` rather than an `<input>`
because "the launch articles are mostly ONE span per paragraph, three hundred characters
long", and the `plainToggle` exists because a paragraph with no emphasis in `Inline[]`
form is "ceremony around one `text` node". Both are the union leaking through a form.

---

## §2. The five rulings

| # | Question | Ruling |
|---|---|---|
| R1 | Who converts pasted text to `Block[]`? | **Code parses; the model only judges.** A deterministic markdown parser is the only thing that ever touches the author's words. The model is asked for what code cannot decide and returns *metadata, never prose*. |
| R2 | Where does the meta description come from? | **Auto Format writes it**, shown in a collapsed row under Judul with A6's existing 80–158 meter, editable. |
| R3 | What op does the model call use? | **An eleventh `LLMOp`, `blog_format`, `callClass: 'deferred'.** Not a reuse of `translation`. |
| R4 | What happens to `BlockEditor`? | **Deleted.** The round trip is the safety net and the deep-equal test over the four committed articles is the proof. |
| R5 | How does Pratinjau stop being stale? | **Auto Format writes the draft row**, then the server re-renders. The preview is never behind. |

R1 is the repo's existing instinct, not a new one: `effectiveYesNo()` derives the verdict
in code because letting the model choose produced answers that contradicted the card;
`choice.ts` lets the model pick and has code validate *and return a slice of the
question, never the model's copy*; `blogSegments.ts` hides the structure from the model
entirely so it cannot break it. R1 is the same move for a different direction of travel.

---

## §3. Two fixes that ship ahead of the refactor

They are independent of everything below and should land first, in their own commits.

**3.1 `key={locale}` on `<BlockEditor>`** in `[slug]/page.tsx`. One line. It also becomes
`key={locale}` on the new editor in §8, for the same reason, and it is not made redundant
by the refactor — a `<textarea>` seeded from a prop has the identical defect.

The regression test is a source-level assertion in
`src/app/admin/blog/admin.blog.contract.test.ts`: the editor element carries a `key`
bound to `locale`. A behavioural test needs a soft navigation, which is loop 5 territory
(`tools/e2e/`) and worth one manual pass: open `?locale=id`, type, press **English**, read
the form.

**3.2 Nothing else.** The alt-text change is §7 and belongs with the refactor, because it
changes the segment contract.

---

## §4. `src/lib/content/markdown.ts` — PURE, no model, no `server-only`

Two functions and one property.

```ts
export function parseMarkdown(src: string): Block[];
export function serializeMarkdown(blocks: readonly Block[]): string;
```

**No `server-only` and no dependency.** It is imported by the editor (a client component)
so the parse runs on paste with no round trip, and by the save path on the server. A
markdown *library* is refused for the reason §9.7 already gives — a new runtime
dependency — and because a general parser produces constructs the union has no home for
(tables, images, HTML blocks, footnotes), which then have to be silently dropped. This
parser knows exactly five block kinds and four span kinds, and text it cannot classify
becomes a paragraph.

### 4.1 The grammar, in both directions

| `Block` | Markdown | Parsed back by |
|---|---|---|
| `heading` level 2 | `## Text` | `^## ` |
| `heading` level 3 | `### Text` | `^### ` |
| `heading.id` | `## Text {#anchor-id}` | the `{#…}` suffix; **absent → `slugify(text)`** |
| `paragraph` | a blank-line-separated run of lines | anything unclassified |
| `list` unordered | `- item` | `^- ` |
| `list` ordered | `1. item` | `^\d+\. ` |
| `quote` | `> text` then `> — source` | a `>` run; the em-dash last line is `source` |
| `cardRef` | a paragraph whose **entire** content is `[Text](/arcana/slug)` | one link span, path `^/arcana/[a-z0-9-]+$`, nothing else in the block |
| `text` span | plain | — |
| `em` span | `*text*` or `_text_` | serializes as `*text*` |
| `strong` span | `**text**` | |
| `link` span | `[text](/path)` | |

**`{#anchor-id}` is not decoration.** The four committed articles are
`h2('what-tarot-is', 'Tarot itu apa')` — English ids on Indonesian headings, which
`slugify` cannot produce. Anchors are an interface: `/blog/x#myths-and-facts` is linked
from elsewhere, `blogSegments.walk` copies `heading.id` through untouched so the two
locales share one anchor set, and `LAUNCH_ARTICLE_RULES`'s `orientation-anchors` refuses a
publish without three of them by name. A markdown form that could not express a manual id
would make every existing article unopenable without losing its anchors.

**`cardRef` is the only kind markdown has no syntax for**, and the rule above is exact
rather than heuristic: `Prose` renders `cardRef` as a whole `<p>` containing one link, so
a paragraph that is *nothing but* an `/arcana/<slug>` link is byte-identically what
`cardRef` produces. A paragraph containing that link *plus other text* stays a paragraph
with a `link` span, which is also what it renders as. Neither reading loses information.

`quote` has no author in any article and no `blocks.ts` helper — `types.contract.test.ts`
asserts the absence deliberately — so its round trip is written and tested against a
fixture rather than against a real document.

### 4.2 The property, and it is the whole safety argument for R4

```
serializeMarkdown ∘ parseMarkdown  is NOT required to be identity  (formatting normalises)
parseMarkdown ∘ serializeMarkdown  IS required to be identity      (no document is lost)
```

`markdown.test.ts` asserts the second over: every hand-written fixture covering all five
kinds and all four span kinds; and **the four committed articles as fixtures**
(`what-tarot-is.{id,en}`, `how-to-read-tarot.{id,en}`), deep-equal on `body`. Those four
use every kind except `quote`, including one `cardRef` each, 26 `strong` and 8 `link` in
the longest.

**`BlockEditor.tsx` is not deleted until that test is green.** That ordering is the
ruling, not a preference.

### 4.3 The span-adjacency trap survives the change and is mostly retired by it

A6-31's middle-dot strip exists because a form field hides a trailing space, and
`para(s('Lihat '), link('/gallery', 'galeri'))` renders `Lihatgaleri` if it is dropped. In
markdown the space is *in the text*, visible, in the same place a diff would show it — so
the strip goes with the editor. `spansSeparate` stays exactly where it is: the save-time
lint refusal is unchanged, and `parseMarkdown` cannot produce a glued pair from
`Lihat [galeri](/gallery)` in the first place.

---

## §5. Auto Format

One button, one server round trip, four phases. **Phases 1, 3 and 4 always run; phase 2
runs only when there is something a model has to decide.**

```
1  PARSE       parseMarkdown(konten)  -> Block[]          pure, client + server
2  JUDGE       one model call, IF needed -> metadata only  server
3  GATE        zod .strict() / lintDocument / resolveViolations
4  WRITE       upsertDocument, draft row, then re-render
```

### 5.1 What the model is asked, and what it may return

It is asked only when the parse leaves a question code cannot answer:

- **the body has fewer than two level-2 headings** — a raw-txt paste with no structure;
- **`description` is empty or outside 80–158 characters**;
- **any heading has no `{#…}` and therefore a `slugify`d id**, which for Indonesian
  headings is not the English anchor the convention wants.

It returns exactly this and nothing else:

```ts
type FormatAdvice = {
  /** Insert a level-2 heading BEFORE body[at]. `text` is a heading, never prose. */
  headings: { at: number; text: string; id: string }[];
  /** Assign an English anchor id to an existing heading. */
  anchors: { at: number; id: string }[];
  /** 80–158 characters. */
  description: string;
};
```

**It never returns a `Block`, a paragraph, or any of the author's words.** Code splices:
`headings` becomes `{ kind: 'heading', level: 2, id, text }` inserted at the index,
`anchors` overwrites `body[at].id` when `body[at].kind === 'heading'` and is discarded
otherwise, `description` is accepted only if it satisfies the band. `at` outside
`[0, body.length]` is discarded. **A malformed reply degrades to no advice, never to a
mangled document** — the parse result is already valid.

This is `validateChoice`'s shape: refuse shape, not truth. There is no cheap test for
"is this a good section heading", and the honest instrument is the preview directly
underneath.

### 5.2 The gates are the existing three, unchanged

`saveDocument` already runs zod `.strict()` (five kinds, no sixth), `lintDocument` with
`rulesFor(slug)`, and `resolveViolations`. Auto Format goes **through** it rather than
around it, so a refusal writes nothing — including a refusal caused by the model's
headings, which is the point.

An **error**-class violation refuses the write and the button reports it in the existing
`LintPanel`. A **warning** does not (A6-17), and the parsed markdown stays in the textarea
either way: the author never loses a paste to a refusal.

### 5.3 The common case costs nothing

Content pasted from Gemini or ChatGPT is already `##`-sectioned. It has two or more level-2
headings, so phase 2's heading branch does not fire. The only reason to call a model on
that paste is the description — and once written, it is not rewritten. **The steady state
for a well-formed paste is one model call per article, ever.**

### 5.4 Client bound

`AbortSignal.timeout(45_000)` against `maxDuration = 60` on the route, following
`TRANSLATE_ABORT_MS`'s rule: the server must lose the race last, so the operator reads a
sentence rather than a platform timeout. A timeout means UNKNOWN and says so — the draft
may have committed, so the copy says *reload and look* rather than claiming failure.

---

## §6. `blog_format`, the eleventh op

```ts
export type LLMOp =
  | 'reading' | 'moderation' | 'gist' | 'day_summary' | 'frequency'
  | 'lotus' | 'persona' | 'translation' | 'translation_repair' | 'insight'
  | 'blog_format';
```

The same argument that earned `insight` the tenth slot one day earlier, and Miftah's
ruling: a recurring model call with no querent behind it, whose price `/admin/tokens`'
*Biaya per keperluan* table has to be able to state. Reusing `translation` is what
`blogAutoTranslate` did and what its own header records as a **known caveat rather than a
precedent** — three features behind one cost row.

Consequences that are compile errors until done:

- `OP_ORDER` in `@/lib/analytics/rollup` — `AssertNever` over `Exclude`.
- `callClass.test.ts` — the declared tier, and the assertion that the op set used under
  `src/**` is exactly `LLMOp`, in both directions.
- **`flagCoverage.test.ts`'s `EXEMPT` table**, joining `insight` and `blogAutoTranslate`.
  No `flags.ts` entry: `callClass: 'deferred'` means the fleet-wide ceiling sheds it
  before any querent call, so **the tier is the switch**. A6's rule stands — a *third*
  admin-only site gets one `ADMIN_MODEL_CALLS_ENABLED` for the class, not a third
  exemption. `blog_format` is the second, so this is the last free one.

---

## §7. `Teks Alternatif Gambar` is deleted and derived

The field goes. `alt` is derived on the **server**, in `saveDocument`, from
`loreFor(hero.cardUrlSlug, doc.locale).imageAlt`.

Server-side because `src/content/**` is fenced from client components by
`clientBoundary.test.ts` — a bundle-size rule, and `ARCANA_LORE` statically imports all
forty-four documents.

Three ripples, all deliberate:

1. **The CHECK constraint stays satisfied with no migration.**
   `blog_post_locales_hero_pair_ck` asserts `hero_card_slug IS NULL = hero_alt IS NULL`.
   Deriving *on write* keeps the column populated, so `blogRow.ts`, `sweep/route.ts`,
   `translate/route.ts` and `changeStatus` all keep reading `row.heroAlt` unchanged. The
   alternative — dropping the column and deriving on read — touches five files and a
   migration to buy nothing.
2. **`hero.alt` leaves the translation segment list.** `blogSegments.walk` currently
   `visit`s it. It must stop: a translated alt would be a *third* description of the
   image, differing from both lore documents. This changes the segment **count**, which
   `applySegments` refuses a mismatch on — that is the contract working, and
   `blogSegments.test.ts`'s round-trip case is where it is re-asserted. `hero.cardUrlSlug`
   was already copied as an address; `alt` now joins `heading.id` as structure.
3. **A hero card with no lore document.** All 22 have one (`LORE_SLUGS` equals
   `CARD_URL_SLUGS` today), and `resolveViolations` already refuses a slug that is not a
   card. The derivation adds an error-class violation for the case anyway, because
   "identical today" is exactly when somebody simplifies one of the two lists.

`BLOG.editor.heroAlt` and `heroAltHint` are deleted from `copy.ts`. The `Meter` under it
goes; the one under `title` and the new one under `description` stay.

---

## §8. The editor surface

`src/app/admin/blog/MarkdownEditor.tsx` replaces `BlockEditor.tsx`.

```
Slug          the-moon-trivia                     (read-only, frozen if published)
Judul         [                                              ]  62 / maks. 110 · pas
Gambar Utama  [ the-moon                                   ▾ ]
              alt: “Bulan pucat di atas dua menara…”          (derived, read-only)
Konten        [                                              ]
              [                                              ]
              [  ## Tarot itu apa                            ]
              [                                              ]
              [  Tarot bukan ramalan…                        ]

              [ Auto Format ]  [ Simpan ]

▸ SEO · deskripsi terisi otomatis · 142 / 80–158 karakter · pas
```

- **`key={locale}`.** §3.1's defect is a property of seeding state from a prop, and a
  `<textarea>` has it too.
- **The SEO row is collapsed, not hidden.** R2. It opens to A6's existing hint —
  *"the two lines Google prints under the title"*, which is the one field whose correct
  content is not guessable from its label — the textarea, and the meter.
- **`Terjemahkan Otomatis` is unchanged** and keeps its two-tap overwrite guard. It fills
  the form and stores nothing. Its `formHasContent` check moves from `extractSegments`
  over a `Block[]` to a `.trim()` over three strings, which is simpler and has the same
  meaning. It returns a `Block[]`, so the editor serializes it into the textarea.
- **`Simpan` still exists.** Auto Format writes, but so does Simpan — for a markdown edit
  that must not be reformatted, and because a save button that is not there is a save
  button somebody looks for.

**Deleted:** `BlockEditor.tsx` (880), the span rows, `plainToggle`, `visibleBoundaries`,
the middle-dot strip, the up/down/remove controls, the five `Tambah blok` buttons,
`emptyBlock`, and `BLOG.editor.{blocks,addBelow,moveUp,moveDown,remove,kind,spanKind,plainToggle,joined,joinedHint,glued,addSpan,addItem,listItem,level,headingText,anchorId,ordered,orderedHint,quoteSource,cardSlug,spanPath,heroAlt,heroAltHint}`. `LintPanel` and `Meter`
move to the new file unchanged.

`src/app/admin/blog/new/page.tsx` is unchanged — slug first, then the editor.

---

## §9. Pratinjau

R5. Auto Format writes the draft row and the server re-renders, so the pane shows the
stored document. `BLOG.editor.previewStale` — *"satu simpan di belakang"* — is deleted,
because it stops being true.

The pane also gains **the TOC the public page already builds**, so the preview matches
`/blog/<slug>`. It is not a new feature and never was one: `blog/[slug]/page.tsx:256`
renders a real `<ol>` of real anchors from every level-2 heading with an `id`, whenever
there are more than two. The admin has never authored it. The reason it appeared missing is
that the preview mounts `Prose` alone, without the page chrome around it.

The TOC markup is lifted into a small server component both pages mount, so there is one
definition — the same argument A6-32 makes for not reimplementing `Prose`.

`BLOG.editor.previewHref` **stays**: `Prose` calls `getLocale()` itself, so an `en`
document previewed by an Indonesian admin shows `/arcana/the-moon` where the live page
shows `/en/arcana/the-moon`. Accepted, unchanged, still on screen.

---

## §10. Events

One new name, and it is a **fold request to A1**, who owns `events.ts` for v0.5.0:

```ts
'admin.blog_formatted': { slug: string; locale: string;
                          blocks: number;        // after the parse
                          model_called: boolean; // was phase 2 needed?
                          headings_added: number;
                          outcome: 'ok' | 'invalid' | 'advice_rejected' | 'failed' | 'timeout' };
```

`model_called` is the measurement that decides whether phase 2 earns its op: if it is
false on nearly every press, §5.3's steady state is confirmed and the model call is nearly
free; if it is true every time, the parser is missing something and that is the fix rather
than a bigger prompt.

**No prose in props.** `headings_added` is a count. `slug` is admin-authored public
content already in a URL — the same exemption `admin.blog_saved` records and A-D18 asks to
be restated at every new use.

---

## §11. Schema deltas

**None.** No new column, no new table, no migration. `hero_alt` stays and stays populated
(§7.1); `body` stays `Block[]`; nothing stores markdown. The markdown text lives in a
`<textarea>` and in the clipboard, and is reconstructed from `body` by
`serializeMarkdown` every time the page loads.

That last sentence is the load-bearing one and the reason R4 is safe: **markdown is a
projection of the stored document, never the record of it.** A-D10's CSP argument holds
untouched — no `markdown` block kind, no `raw`, no `dangerouslySetInnerHTML` — and the copy
lint keeps reading the exact sentence a reader reads, because `plainText()` still joins
spans with the empty string.

---

## §12. Risks, and what is not solved

- **`parseMarkdown ∘ serializeMarkdown` is the single point of failure for R4.** A shape
  the round trip loses is an article the admin cannot open without damage. Mitigated by
  the four committed articles as fixtures, and by the ordering rule in §4.2 — but the
  fixtures are four documents, and the day somebody stores a `quote` is the day the
  fixture set is thinner than the data.
- **A model that writes bad section headings ships bad section headings.** §5.1 refuses
  shape, not truth. The instruments are the preview under the button and the publish gate,
  and neither can tell whether a heading is a good one.
- **English anchor ids on an Indonesian article are a model's judgement now.** They were a
  human's in the four committed documents. `orientation-anchors` only binds the two launch
  slugs, so nothing refuses a bad id — it becomes a permanent address on the first publish.
- **`{#anchor-id}` is a syntax an admin can typo**, and a typo silently becomes a
  paragraph or a wrong anchor. A malformed suffix should be an error-class violation
  rather than silently swallowed; that is a lint rule to add, and it is not in this
  design's scope.
- **Nobody has used this on a phone or measured the textarea.** A `90dvh` admin pane with
  a keyboard up is the geometry WSL cannot answer, and `/account`'s answer sheet has the
  same open item.
- **Unchanged and still open from A6:** the two-pane split at admin widths, and whether
  `Terjemahkan Otomatis`'s English output is rewritten rather than translated, which no
  lint can tell.

---

## §13. Test plan

| Loop | What |
|---|---|
| 1 (unit) | `markdown.test.ts`: the grammar table both ways; `parse ∘ serialize` identity over hand fixtures **and the four committed articles**; `{#id}` present/absent; the `cardRef` exact rule and its near-miss (a link plus text stays a paragraph); span adjacency after a parse. |
| 1 (unit) | `FormatAdvice` validation: out-of-range `at`, non-heading `at`, a description outside the band, a malformed reply → no advice, document unchanged. |
| 1 (unit) | `callClass.test.ts`, `flagCoverage.test.ts`, `OP_ORDER` — all three go red until §6 is complete, by design. |
| 2 (integration) | Auto Format writes a draft row and nothing else; an error-class violation writes nothing; `hero_alt` is populated from the lore document; the `hero_pair_ck` constraint holds; `applySegments` count after `hero.alt` leaves the walk. |
| 1 (source) | `admin.blog.contract.test.ts`: the editor carries `key={locale}`; `BlockEditor.tsx` no longer exists; no `heroAlt` field in the surface. |
| 5 (CDP) | The locale switch with a dirty form — the §1.1 reproduction, before and after. A paste → Auto Format → preview round trip against `E2E_BASE=http://localhost:3001`. |
| 6 (phone) | The textarea with the keyboard up. Unscheduled, and named as an open item rather than promised. |

---

## §14. Order of work

1. `key={locale}` + its source assertion. **Ships alone.**
2. `src/lib/content/markdown.ts` + `markdown.test.ts`, including the four-article
   fixtures. Nothing else moves until green.
3. §7 — derive `alt`, drop it from the segment walk, delete the field's copy.
4. `blog_format` and its three compile errors.
5. `POST /api/admin/blog/[slug]/format`, `FormatAdvice` validation, the prompt.
6. `MarkdownEditor.tsx`; delete `BlockEditor.tsx`.
7. §9 — the shared TOC component, drop `previewStale`.
8. The `admin.blog_formatted` fold request to A1.
