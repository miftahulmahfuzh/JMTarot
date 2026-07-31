'use client';

/**
 * The structured block editor. **v0.5.0 / A6, tasks 20–22, decision A-D14.**
 *
 * **NO CONTENTEDITABLE, NO RICH TEXT, NO MARKDOWN.** It produces the existing FIVE block
 * kinds and the four span kinds and there is nothing between the author and the JSON.
 * §9.7 forbids a markdown parser as a new runtime dependency; A-D10's CSP argument
 * forbids a markup-carrying block kind at all — *"what it costs is not a theoretical
 * injection on prose we wrote, it is a permanent new reason the policy can never be
 * enforced"*. **There is no sixth kind here and `blockSchema.ts` refuses one on save.**
 *
 * ── UP/DOWN BUTTONS, NEVER DRAG-AND-DROP ──────────────────────────────────
 *
 * Three reasons and the third is binding: a drag needs a dependency or a hand-rolled
 * pointer handler; touch drag is exactly what loop 5 cannot verify (`innerWidth` is 500
 * whatever `--width` says); and **a button is the control a keyboard has.**
 *
 * ── A6-31. THE JOINED STRING IS SHOWN, WITH ITS BOUNDARY WHITESPACE VISIBLE ─
 *
 * `blocks.ts:27-36`'s trap: `para(s('Lihat '), link('/gallery', 'galeri'))` renders
 * `Lihat galeri`, and dropping the trailing space renders `Lihatgaleri` — the block
 * union's form of the JSX-whitespace bug that shipped three times in one afternoon as
 * `www.jmtarot.siteand add to your phone`. **Every HTML form control the author will use
 * trims nothing but SHOWS nothing either, so the CMS is strictly more dangerous here
 * than a file was: in a file the space is at least in the diff.** The monospace strip
 * below every span list is the diff, and the middle dot is what makes it readable.
 *
 * `spansSeparate` is IMPORTED from `@/lib/content/lint` rather than reimplemented — the
 * inline warning and the save-time refusal have to agree, and a second copy of that
 * predicate is the drift the rule exists to prevent. That module is pure and
 * marker-free, which is why a client component may have it.
 *
 * ── THE CLIENT BOUND IS NOT OPTIONAL (§4.2 rule 2) ────────────────────────
 *
 * `AbortSignal.timeout(SAVE_ABORT_MS)` against the route's `maxDuration = 30`.
 * *"A bigger `maxDuration` is not a latency regression, but it must be paired with a
 * bound on the client, or you have only made the hang longer."* And **a timeout is the
 * one outcome that means UNKNOWN**, so it says so rather than claiming the save failed:
 * on this path a truncated request may still have committed.
 */
import { useState } from 'react';
import type { Block, Inline, Phrasing } from '@/content/types';
import { extractSegments } from '@/lib/content/blogSegments';
import { spansSeparate } from '@/lib/content/lint';
import { BLOG } from './copy';
import styles from './blog.module.css';

/** 25s, under the route's `maxDuration = 30` so the server's answer wins the race. */
const SAVE_ABORT_MS = 25_000;
/**
 * 55s, under the translate route's `maxDuration = 60` for the same reason: the SERVER
 * must lose the race last, so what the operator gets is the sentence that says what
 * happened rather than a platform timeout with no diagnosis. A 2,000-word article is a
 * large completion and this is the one admin request that legitimately takes tens of
 * seconds (§4.2 rule 2).
 */
const TRANSLATE_ABORT_MS = 55_000;

const KINDS = ['heading', 'paragraph', 'list', 'quote', 'cardRef'] as const;
const SPAN_KINDS = ['text', 'em', 'strong', 'link'] as const;

type SpanKind = (typeof SPAN_KINDS)[number];

export type EditorProps = {
  slug: string;
  locale: string;
  slugFrozen: boolean;
  /**
   * Is there a document in the OTHER locale to translate from? Resolved on the server,
   * because the editor only ever holds one locale's row.
   */
  canTranslate: boolean;
  initial: {
    title: string;
    description: string;
    heroCardSlug: string | null;
    body: Block[];
  } | null;
  /** The 22 URL slugs, resolved on the SERVER so the client never sees the deck. */
  cardSlugs: readonly string[];
};

const emptySpan = (): Inline => ({ kind: 'text', text: '' });

const emptyBlock = (kind: (typeof KINDS)[number]): Block => {
  switch (kind) {
    case 'heading':
      return { kind: 'heading', level: 2, id: '', text: '' };
    case 'paragraph':
      return { kind: 'paragraph', text: [emptySpan()] };
    case 'list':
      return { kind: 'list', ordered: false, items: [[emptySpan()]] };
    case 'quote':
      return { kind: 'quote', text: '', source: '' };
    case 'cardRef':
      return { kind: 'cardRef', slug: '', text: '' };
  }
};

/** Lowercase-hyphens, from a heading's own words. The manual override wins. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function BlockEditor({
  slug,
  locale,
  slugFrozen,
  canTranslate,
  initial,
  cardSlugs,
}: EditorProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [heroCard, setHeroCard] = useState(initial?.heroCardSlug ?? '');
  const [body, setBody] = useState<Block[]>(initial?.body ?? [emptyBlock('paragraph')]);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed' | 'timeout'>('idle');
  const [tr, setTr] = useState<'idle' | 'confirm' | 'running' | 'done' | 'failed' | 'timeout'>(
    'idle',
  );
  const [trNote, setTrNote] = useState('');
  const [violations, setViolations] = useState<{ rule: string; cls: string; field: string; detail: string; excerpt: string }[]>([]);

  const isNew = initial === null;

  const patch = (i: number, next: Block) =>
    setBody((b) => b.map((x, j) => (j === i ? next : x)));
  const move = (i: number, by: number) =>
    setBody((b) => {
      const j = i + by;
      if (j < 0 || j >= b.length) return b;
      const copy = [...b];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  const removeAt = (i: number) => setBody((b) => b.filter((_, j) => j !== i));
  const insertAfter = (i: number, kind: (typeof KINDS)[number]) =>
    setBody((b) => [...b.slice(0, i + 1), emptyBlock(kind), ...b.slice(i + 1)]);

  /**
   * **IS THERE ANYTHING TO LOSE?** The confirmation Miftah asked for fires on FORM state,
   * not on the stored row — that is what auto-translate overwrites, and it is the thing
   * the server has never seen. An untouched empty form has nothing at stake, and a
   * confirmation there is a dialog that teaches people to click through dialogs.
   *
   * **`extractSegments` RATHER THAN A HAND-ROLLED CHECK, AND THE FIRST DRAFT PROVED WHY.**
   * It asked whether `JSON.stringify(block)` still had letters in it after the structural
   * keys were stripped — and a brand-new empty paragraph is
   * `{"kind":"paragraph","text":[{"kind":"text","text":""}]}`, whose remaining `"text"`
   * KEYS are letters. **So the confirmation fired on an empty form**, which is precisely
   * the dialog-that-means-nothing this guard exists to avoid. Found by clicking the
   * button.
   *
   * The function that already knows what a document's human text is is the one that
   * flattens it for translation. Using it means the guard and the thing it guards can
   * never disagree about what "content" means.
   */
  const formHasContent = extractSegments({
    locale: 'id',
    slug,
    title,
    description,
    hero: heroCard ? { cardUrlSlug: heroCard, alt: '' } : null,
    body,
  }).some((seg) => seg.trim().length > 0);

  async function translate() {
    setTr('running');
    setTrNote('');
    try {
      const res = await fetch(`/api/admin/blog/${slug}/translate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(TRANSLATE_ABORT_MS),
        body: JSON.stringify({ to: locale }),
      });
      if (!res.ok) {
        setTr('failed');
        setTrNote(BLOG.editor.translateFailed);
        return;
      }
      const payload = (await res.json()) as {
        ok: boolean;
        detail?: string;
        segments?: number;
        violations?: { kind: string }[];
        doc?: {
          title: string;
          description: string;
          hero: { cardUrlSlug: string; alt: string } | null;
          body: Block[];
        };
      };
      /*
       * **A REFUSAL ARRIVES AS A 200 WITH `ok: false` AND ITS OWN SENTENCE** — the reply
       * was truncated, the model translated a card name, the article is too long. Those
       * are answers the operator has to read, and rendering the generic failure state
       * over them would throw away the only useful part.
       */
      if (!payload.ok || !payload.doc) {
        setTr('failed');
        setTrNote(payload.detail ?? BLOG.editor.translateFailed);
        return;
      }
      setTitle(payload.doc.title);
      setDescription(payload.doc.description);
      setHeroCard(payload.doc.hero?.cardUrlSlug ?? '');
      setBody(payload.doc.body);
      // Nothing is stored yet, and the note says so rather than implying a save.
      const untranslated = (payload.violations ?? []).filter((v) => v.kind === 'untranslated').length;
      setTr('done');
      setTrNote(
        BLOG.editor.translateDone(payload.segments ?? 0) +
          (untranslated > 0 ? ` ${BLOG.editor.translateUntranslated(untranslated)}` : ''),
      );
    } catch (err) {
      /* A timeout means UNKNOWN, but nothing was written either way, so it is safe to retry. */
      setTr(err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'failed');
      setTrNote(
        err instanceof Error && err.name === 'TimeoutError'
          ? BLOG.editor.translateTimedOut
          : BLOG.editor.translateFailed,
      );
    }
  }

  async function save() {
    setState('saving');
    setViolations([]);
    try {
      const res = await fetch('/api/admin/blog', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(SAVE_ABORT_MS),
        body: JSON.stringify({
          slug,
          locale,
          title,
          description,
          hero: heroCard ? { cardUrlSlug: heroCard } : null,
          body,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        violations?: typeof violations;
      };
      setViolations(payload.violations ?? []);
      /*
       * **A 201/200 CARRIES THE WARNINGS THAT DID NOT BLOCK** (A6-17), so a clean save
       * and a save-over-a-warning look different on screen. That is the whole point of
       * the two classes: the author sees the description band without being stopped by
       * it, and the publish gate is where it becomes a refusal.
       */
      setState(res.ok ? 'saved' : 'failed');
      if (res.ok && isNew) {
        // The page re-reads on navigation, so the editor stops being "new".
        window.location.href = `/admin/blog/${slug}?locale=${locale}`;
      }
    } catch (err) {
      /*
       * **A TIMEOUT IS THE ONE OUTCOME THAT MEANS UNKNOWN** (`POST /api/locale`'s third
       * rule): the request may have committed. It is not retried automatically here and
       * it does not claim the save failed — the operator reloads and looks.
       */
      setState(err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'failed');
    }
  }

  return (
    <div className={styles.editor}>
      <section className={styles.pane}>
        <h2 className={styles.h2}>{BLOG.editor.fields}</h2>

        <label className={styles.field}>
          <span className={styles.label}>{BLOG.editor.slug}</span>
          <input className={styles.input} value={slug} readOnly disabled />
          <span className={styles.hint}>
            {/*
              A6-30. **A PUBLISHED SLUG IS A PERMANENT ADDRESS** — in Google's index, in
              `sitemap.xml`, in the `@id` of a `BlogPosting` node, in every `PublicShare`
              link anybody sent, and in `contentAlternates()`'s derivation of the `/en/`
              twin. There is no redirect table in this project and building one is not in
              scope, so renaming a published slug is a 404 with a working-looking editor
              above it. This is the `/history`-not-`/jejak` rule, enforced in a form.
            */}
            {slugFrozen ? BLOG.editor.slugFrozen : BLOG.editor.slugHint}
          </span>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{BLOG.editor.articleTitle}</span>
          <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} />
          <span className={styles.hint}>{BLOG.editor.titleHint}</span>
          <Meter n={title.length} max={110} />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{BLOG.editor.description}</span>
          {/*
            **THE HINT COMES BEFORE THE FIELD, NOT AFTER IT.** This is the one field on
            the surface whose correct content is not guessable from its label: *"Deskripsi
            (meta)"* reads as "a summary of the article", and a summary is exactly the
            wrong thing. It is the two lines Google prints UNDER the title.
          */}
          <span className={styles.hint}>{BLOG.editor.descriptionHint}</span>
          <span className={styles.hint}>{BLOG.editor.descriptionBand}</span>
          <textarea
            className={styles.textarea}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Meter n={description.length} min={80} max={158} />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{BLOG.editor.heroCard}</span>
          {/*
            A `<select>` OVER THE 22, so a free-text slug is not reachable through the UI
            (A6-20). The API is covered separately by `resolveViolations`, because the UI
            is not the only caller and never will be.
          */}
          <select
            className={styles.input}
            value={heroCard}
            onChange={(e) => setHeroCard(e.target.value)}
          >
            <option value="">{BLOG.editor.heroNone}</option>
            {cardSlugs.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>


        <h2 className={styles.h2}>{BLOG.editor.blocks}</h2>
        <ol className={styles.blockList}>
          {body.map((block, i) => (
            <li key={i} className={styles.block}>
              <div className={styles.blockHead}>
                <span className={styles.kindBadge}>{BLOG.editor.kind[block.kind]}</span>
                <span className={styles.blockControls}>
                  <button type="button" onClick={() => move(i, -1)} aria-label={BLOG.editor.moveUp}>
                    {BLOG.editor.moveUp}
                  </button>
                  <button type="button" onClick={() => move(i, 1)} aria-label={BLOG.editor.moveDown}>
                    {BLOG.editor.moveDown}
                  </button>
                  <button type="button" onClick={() => removeAt(i)} aria-label={BLOG.editor.remove}>
                    {BLOG.editor.remove}
                  </button>
                </span>
              </div>

              <BlockFields
                block={block}
                cardSlugs={cardSlugs}
                onChange={(next) => patch(i, next)}
              />

              <div className={styles.addRow}>
                <span className={styles.hint}>{BLOG.editor.addBelow}</span>
                {KINDS.map((k) => (
                  <button key={k} type="button" onClick={() => insertAfter(i, k)}>
                    {BLOG.editor.kind[k]}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ol>

        {/*
          **AUTO-TRANSLATE. IT FILLS THE FORM AND STORES NOTHING** — see the route's
          header. The hint says so, and says the English is meant to be rewritten rather
          than translated, because a button that looks like a finished answer will be
          treated as one.
        */}
        <section className={styles.translateBox}>
          <h2 className={styles.h2}>
            {BLOG.editor.translate} {BLOG.editor.translateFrom(locale)}
          </h2>
          <p className={styles.hint}>{BLOG.editor.translateHint}</p>

          {!canTranslate ? (
            <p className={styles.hint}>{BLOG.editor.translateNoSource}</p>
          ) : tr === 'confirm' ? (
            /*
             * **THE OVERWRITE GUARD, INLINE RATHER THAN `window.confirm`.** A native
             * confirm blocks the thread, cannot be styled to say what is at stake, and
             * on Safari drops focus in the way `AccountMenu` records. Two taps, and the
             * second one names the cost.
             */
            <div className={styles.confirm} role="alertdialog" aria-label={BLOG.editor.translateConfirmTitle}>
              <p className={styles.bad}>{BLOG.editor.translateConfirmTitle}</p>
              <p className={styles.hint}>{BLOG.editor.translateConfirmBody}</p>
              <div className={styles.saveRow}>
                <button type="button" className={styles.primary} onClick={translate}>
                  {BLOG.editor.translateConfirmYes}
                </button>
                <button type="button" onClick={() => setTr('idle')}>
                  {BLOG.editor.translateConfirmNo}
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.saveRow}>
              <button
                type="button"
                className={styles.primary}
                disabled={tr === 'running'}
                onClick={() => (formHasContent ? setTr('confirm') : translate())}
              >
                {tr === 'running' ? BLOG.editor.translating : BLOG.editor.translate}
              </button>
              {trNote ? (
                <span className={tr === 'done' ? styles.ok : styles.bad} role="status">
                  {trNote}
                </span>
              ) : null}
            </div>
          )}
        </section>

        <div className={styles.saveRow}>
          <button className={styles.primary} type="button" onClick={save} disabled={state === 'saving'}>
            {state === 'saving' ? BLOG.editor.saving : BLOG.editor.save}
          </button>
          {state === 'saved' ? <span className={styles.ok}>{BLOG.editor.saved}</span> : null}
          {state === 'failed' ? <span className={styles.bad}>{BLOG.editor.saveFailed}</span> : null}
          {state === 'timeout' ? (
            <span className={styles.bad}>{BLOG.editor.saveTimedOut}</span>
          ) : null}
        </div>

        <LintPanel violations={violations} />
      </section>
    </div>
  );
}

/**
 * A live character count **against its target**, not on its own.
 *
 * **`126 karakter` DOES NOT TELL ANYBODY WHETHER 126 IS RIGHT**, which is what the field
 * showed before: a bare number that turned red at a boundary the operator could not see.
 * This prints `126 / 80–158 karakter · pas` and names the direction when it is out, so
 * the target is on screen at the moment the decision is being made rather than in a
 * refusal after the fact.
 *
 * **IT IS A HINT, NOT A REFUSAL** (A6-17). Every band it renders is warning-class: they
 * are properties of a FINISHED article, and refusing to save a half-written draft is
 * refusing to let somebody write. The publish gate is where they bite, and this is what
 * makes that later refusal predictable instead of surprising.
 *
 * `role="status"` so a screen reader hears the count change rather than only seeing it.
 */
function Meter({ n, min, max }: { n: number; min?: number; max?: number }) {
  const short = min !== undefined && n < min;
  const long = max !== undefined && n > max;
  const label =
    min !== undefined && max !== undefined
      ? BLOG.editor.charsOf(n, min, max)
      : max !== undefined
        ? BLOG.editor.charsMax(n, max)
        : BLOG.editor.charsMin(n, min!);
  /*
   * An EMPTY field says nothing. A "terlalu pendek" on a field somebody has not started
   * is a warning about not having done the work yet, which trains people to ignore the
   * colour.
   */
  const verdict = n === 0 ? '' : short ? BLOG.editor.tooShort : long ? BLOG.editor.tooLong : BLOG.editor.justRight;
  return (
    <span className={styles.hint} role="status" data-warn={n > 0 && (short || long)}>
      {label}
      {verdict ? ` · ${verdict}` : ''}
    </span>
  );
}

/** The per-kind controls. Five kinds, and there is no sixth branch to add one to. */
function BlockFields({
  block,
  cardSlugs,
  onChange,
}: {
  block: Block;
  cardSlugs: readonly string[];
  onChange: (b: Block) => void;
}) {
  switch (block.kind) {
    case 'heading':
      return (
        <div className={styles.fields}>
          <label className={styles.inline}>
            <span className={styles.label}>{BLOG.editor.level}</span>
            <select
              className={styles.small}
              value={block.level}
              onChange={(e) =>
                onChange({ ...block, level: Number(e.target.value) === 3 ? 3 : 2 })
              }
            >
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <label className={styles.field}>
            {/*
              **ITS OWN LABEL, NOT `articleTitle`.** At 1440 the heading block read
              `TINGKAT` / `JUDUL` directly under the document's own `JUDUL` field, and
              the two are different things — one is the `<h1>` and the `<title>`, the
              other is an `<h2>` inside the prose. Reusing a label because the word fits
              is how a form teaches somebody the wrong model of its data.
            */}
            <span className={styles.label}>{BLOG.editor.headingText}</span>
            <input
              className={styles.input}
              value={block.text}
              onChange={(e) =>
                onChange({
                  ...block,
                  text: e.target.value,
                  /*
                   * **AUTO-DERIVED UNTIL SOMEBODY TYPES ONE.** The id is an INTERFACE —
                   * `/blog/x#myths-and-facts` is linked from the public footer — so it
                   * must be editable; and a heading with no id is a section missing from
                   * its own table of contents with nothing on screen looking wrong,
                   * which is why it is never left empty by default.
                   */
                  id: !block.id || block.id === slugify(block.text)
                    ? slugify(e.target.value)
                    : block.id,
                })
              }
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{BLOG.editor.anchorId}</span>
            <input
              className={styles.input}
              value={block.id ?? ''}
              onChange={(e) => onChange({ ...block, id: e.target.value })}
            />
          </label>
        </div>
      );

    case 'paragraph':
      return (
        <PhrasingEditor
          value={block.text}
          onChange={(text) => onChange({ ...block, text })}
        />
      );

    case 'list':
      return (
        <div className={styles.fields}>
          <label className={styles.inline}>
            <input
              type="checkbox"
              checked={block.ordered === true}
              onChange={(e) => onChange({ ...block, ordered: e.target.checked })}
            />
            <span className={styles.label}>{BLOG.editor.ordered}</span>
          </label>
          <span className={styles.hint}>{BLOG.editor.orderedHint}</span>
          {block.items.map((item, j) => (
            <div key={j} className={styles.item}>
              <span className={styles.label}>
                {BLOG.editor.listItem} {j + 1}
              </span>
              <PhrasingEditor
                value={item}
                onChange={(next) =>
                  onChange({ ...block, items: block.items.map((x, k) => (k === j ? next : x)) })
                }
              />
              <button
                type="button"
                onClick={() =>
                  onChange({ ...block, items: block.items.filter((_, k) => k !== j) })
                }
              >
                {BLOG.editor.remove}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...block, items: [...block.items, [emptySpan()]] })}
          >
            {BLOG.editor.addItem}
          </button>
        </div>
      );

    case 'quote':
      return (
        <div className={styles.fields}>
          <textarea
            className={styles.textarea}
            rows={2}
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
          />
          <label className={styles.field}>
            <span className={styles.label}>{BLOG.editor.quoteSource}</span>
            {/*
              REQUIRED, and `required` here is the third of three layers: the union
              demands the field, zod demands `.min(1)`, and the lint refuses whitespace.
              An empty string satisfies the TYPE, which is the whole reason the other two
              exist.
            */}
            <input
              className={styles.input}
              required
              value={block.source}
              onChange={(e) => onChange({ ...block, source: e.target.value })}
            />
          </label>
        </div>
      );

    case 'cardRef':
      return (
        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.label}>{BLOG.editor.cardSlug}</span>
            <select
              className={styles.input}
              value={block.slug}
              onChange={(e) => onChange({ ...block, slug: e.target.value })}
            >
              <option value="">—</option>
              {cardSlugs.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <input
            className={styles.input}
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
          />
        </div>
      );
  }
}

/**
 * The span row list, **and the monospace strip under it (A6-31).**
 *
 * The *teks biasa* toggle stores `text: string` for a run with no emphasis and no link —
 * the arm forty-four lore documents take, and not legacy: an `Inline[]` of one `text`
 * span is ceremony the adjacency rule then has to reason about.
 */
function PhrasingEditor({
  value,
  onChange,
}: {
  value: Phrasing;
  onChange: (v: Phrasing) => void;
}) {
  const plain = typeof value === 'string';
  const spans: Inline[] = plain ? [{ kind: 'text', text: value }] : value;
  const joined = spans.map((s) => s.text).join('');

  /** Every adjacent pair that would render as one word. `spansSeparate` is the lint's. */
  const glued = plain
    ? []
    : spans.flatMap((s, i) =>
        i + 1 < spans.length && !spansSeparate(s.text, spans[i + 1].text) ? [i] : [],
      );

  return (
    <div className={styles.fields}>
      <label className={styles.inline}>
        <input
          type="checkbox"
          checked={plain}
          onChange={(e) => onChange(e.target.checked ? joined : [{ kind: 'text', text: joined }])}
        />
        <span className={styles.label}>{BLOG.editor.plainToggle}</span>
      </label>

      {plain ? (
        <textarea
          className={styles.textarea}
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <>
          {spans.map((span, i) => (
            <div key={i} className={styles.spanRow} data-glued={glued.includes(i)}>
              <select
                className={styles.small}
                value={span.kind}
                onChange={(e) => {
                  const kind = e.target.value as SpanKind;
                  const next: Inline =
                    kind === 'link'
                      ? { kind, path: span.kind === 'link' ? span.path : '', text: span.text }
                      : { kind, text: span.text };
                  onChange(spans.map((x, j) => (j === i ? next : x)));
                }}
              >
                {SPAN_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {BLOG.editor.spanKind[k]}
                  </option>
                ))}
              </select>
              {/*
                **A `<textarea>`, NOT AN `<input>`, AND A 1440px SCREENSHOT IS WHY.** The
                launch articles are mostly ONE span per paragraph, three hundred
                characters long — and a single-line field showed the first sixty of them
                with the rest scrolled out of sight. The strip below rendered the whole
                string correctly the entire time, which is exactly the shape of defect
                only a look can find: nothing was wrong, and the control was unusable.
                Two rows, growing, `overflow-wrap` from the shared style.

                **NEWLINES ARE STRIPPED ON THE WAY IN.** A `text` span is a run of words
                and the union has no line-break kind; a newline pasted here renders as
                one space in HTML while sitting in the stored JSON as `\n` — so
                `plainText()` and the rendered page would disagree about a string the
                copy lint reads, which is the one guarantee R16 granted `Inline[]` on.
              */}
              <textarea
                className={styles.spanText}
                rows={2}
                value={span.text}
                onChange={(e) =>
                  onChange(
                    spans.map((x, j) =>
                      j === i ? { ...x, text: e.target.value.replace(/[\r\n]+/g, ' ') } : x,
                    ),
                  )
                }
              />
              {span.kind === 'link' ? (
                <input
                  className={styles.small}
                  placeholder={BLOG.editor.spanPath}
                  value={span.path}
                  onChange={(e) =>
                    onChange(
                      spans.map((x, j) =>
                        j === i && x.kind === 'link' ? { ...x, path: e.target.value } : x,
                      ),
                    )
                  }
                />
              ) : null}
              <button
                type="button"
                onClick={() => onChange(spans.filter((_, j) => j !== i))}
                aria-label={BLOG.editor.remove}
              >
                {BLOG.editor.remove}
              </button>
            </div>
          ))}
          <button type="button" onClick={() => onChange([...spans, emptySpan()])}>
            {BLOG.editor.addSpan}
          </button>

          {/*
            **THE STRIP IS THE DIFF (A6-31).** The rendered string, verbatim, with every
            space at a span boundary made visible. In a file a trailing space is at least
            in the diff; a form field shows nothing, so the CMS is strictly more
            dangerous here than the file was, and this is the compensation.
          */}
          <p className={styles.label}>{BLOG.editor.joined}</p>
          <pre className={styles.strip}>{visibleBoundaries(spans)}</pre>
          <span className={styles.hint}>{BLOG.editor.joinedHint}</span>
          {glued.length > 0 ? (
            <p className={styles.bad} role="alert">
              {BLOG.editor.glued}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * The joined string with boundary spaces rendered as `·`.
 *
 * **ONLY AT A BOUNDARY**, not everywhere: a paragraph full of middle dots is unreadable
 * and the author stops looking at the strip, which is the same failure as a lint that
 * cries wolf. The last character of a span and the first of the next are the two
 * positions the trap lives at.
 */
function visibleBoundaries(spans: readonly Inline[]): string {
  return spans
    .map((span, i) => {
      let t = span.text;
      if (i > 0 && t.startsWith(' ')) t = `·${t.slice(1)}`;
      if (i < spans.length - 1 && t.endsWith(' ')) t = `${t.slice(0, -1)}·`;
      return t;
    })
    .join('');
}

/**
 * The violations, grouped by field, with the excerpt.
 *
 * **AN ARRAY, COMPARED AGAINST `[]`, ONE STRING PER ENTRY** — A6-14, and it is the
 * reason `lintDocument` returns what it returns. A boolean cannot tell an author which
 * word; and the per-word `toMatchObject({ hit: false })` form prints only the failing
 * property, which is never the one that says which word it was.
 */
function LintPanel({
  violations,
}: {
  violations: { rule: string; cls: string; field: string; detail: string; excerpt: string }[];
}) {
  const errors = violations.filter((v) => v.cls === 'error');
  const warnings = violations.filter((v) => v.cls === 'warning');

  return (
    <section className={styles.lint}>
      <h2 className={styles.h2}>{BLOG.editor.lintTitle}</h2>
      {violations.length === 0 ? (
        <p className={styles.ok}>{BLOG.editor.lintClean}</p>
      ) : (
        <>
          {errors.length > 0 ? (
            <p className={styles.bad}>{BLOG.editor.lintErrors(errors.length)}</p>
          ) : null}
          {warnings.length > 0 ? (
            <p className={styles.warn}>{BLOG.editor.lintWarnings(warnings.length)}</p>
          ) : null}
          <ul className={styles.lintList}>
            {violations.map((v, i) => (
              <li key={i} data-cls={v.cls}>
                <strong>
                  {BLOG.editor.field[v.field as keyof typeof BLOG.editor.field] ?? v.field}
                </strong>{' '}
                <code>{v.rule}</code> — <em>{v.detail}</em>
                {v.excerpt ? <span className={styles.excerpt}> {v.excerpt}</span> : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
