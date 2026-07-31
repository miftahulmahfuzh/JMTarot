'use client';

/**
 * The article editor: **Judul, Gambar Utama, Konten, and two buttons.**
 *
 * v0.5.0, the markdown editor, `docs/plans/2026-07-31-blog-markdown-editor-design.md` §8.
 * It replaces `BlockEditor.tsx` — 880 lines of form controls over the `Block[]` union.
 *
 * ── WHY THE BLOCK EDITOR WENT ───────────────────────────────────────────────
 *
 * Nobody composed an article in it. An article arrives already written, from Gemini or
 * ChatGPT, in markdown, on the clipboard — and A6's own header recorded the evidence
 * without drawing the conclusion: the span control is a `<textarea>` rather than an
 * `<input>` because *"the launch articles are mostly ONE span per paragraph, three hundred
 * characters long"*, and `plainToggle` existed because a paragraph with no emphasis in
 * `Inline[]` form is *"ceremony around one `text` node"*. Both are the union leaking
 * through a form.
 *
 * **THE STORED SHAPE DID NOT CHANGE.** `body` is still `Block[]`, `Prose` is still the one
 * renderer, and A-D10's CSP argument is untouched — there is no `markdown` block kind, no
 * `raw`, and no `dangerouslySetInnerHTML` anywhere on this path. Markdown is a PROJECTION
 * of the document: `serializeMarkdown` builds the textarea's contents from the stored
 * blocks on every page load, and `parseMarkdown` turns them back. The round trip is
 * asserted over all four committed articles in `markdown.test.ts`, and that assertion is
 * what licensed the deletion.
 *
 * ── `key={locale}` IS NOT INHERITED, IT IS RE-EARNED ────────────────────────
 *
 * The locale tabs are `<Link>`s, so pressing one is a soft navigation within the same route
 * segment: the server re-renders but React reconciles this component as the same element,
 * and `useState(initial…)` runs on mount and never again. **A `<textarea>` seeded from a
 * prop has exactly the defect the block editor had**, and it wrote one locale's body into
 * the other's row. The page keys this component on `locale`; see `[slug]/page.tsx`.
 *
 * ── TWO ADJACENT BUTTONS WITH OPPOSITE STORAGE BEHAVIOUR ────────────────────
 *
 * `Format otomatis` WRITES the draft row (design R5 — it is what makes the preview stop
 * being one save behind). `Terjemahkan otomatis` stores nothing, by design, because what is
 * at risk there is unsaved form state the server has never seen. Those are opposite, they
 * sit next to each other, and **the only thing that tells them apart is the copy** — which
 * is why `formatHint` says *"lalu MENYIMPAN sebagai draf"* in as many words.
 *
 * ── THE CLIENT BOUND IS NOT OPTIONAL (§4.2 rule 2) ──────────────────────────
 *
 * *"A bigger `maxDuration` is not a latency regression, but it must be paired with a bound
 * on the client, or you have only made the hang longer."* Three routes, three bounds, each
 * under its route's ceiling so the SERVER's answer wins the race and the operator reads a
 * sentence rather than a platform timeout. **And a timeout is the one outcome that means
 * UNKNOWN** — on Auto Format that is load-bearing, because unlike translate it writes, so
 * the copy says *reload and look* rather than claiming failure.
 */
import { useState } from 'react';
import type { Block } from '@/content/types';
import { parseMarkdown, serializeMarkdown } from '@/lib/content/markdown';
import { BLOG } from './copy';
import styles from './blog.module.css';

/** 25s, under the save route's `maxDuration = 30`. */
const SAVE_ABORT_MS = 25_000;
/** 55s, under the translate route's `maxDuration = 60`. */
const TRANSLATE_ABORT_MS = 55_000;
/**
 * 45s, under the format route's `maxDuration = 60`. Lower than the translate bound because
 * this call is small — three fields of metadata rather than sixty translated segments —
 * so a request still running at 45s is not slow, it is stuck.
 */
const FORMAT_ABORT_MS = 45_000;

type Violation = { rule: string; cls: string; field: string; detail: string; excerpt: string };

export type EditorProps = {
  slug: string;
  locale: string;
  slugFrozen: boolean;
  /** Is there a document in the OTHER locale to translate from? Resolved on the server. */
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

export function MarkdownEditor({
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
  /*
   * **THE STORED BLOCKS, SERIALIZED ONCE ON MOUNT.** Not on every render: `useState`'s
   * initialiser form runs once, and re-serializing would throw away what the operator has
   * typed. This is also the only place the projection is built — the server sends `Block[]`
   * because that is what it has, and `blogRow`/`Prose` stay unaware markdown exists.
   */
  const [markdown, setMarkdown] = useState(() =>
    initial ? serializeMarkdown(initial.body) : '',
  );
  const [seoOpen, setSeoOpen] = useState(false);

  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed' | 'timeout'>('idle');
  /** Why the save failed, when `state` alone cannot say. See `save()`. */
  const [saveNote, setSaveNote] = useState('');
  const [fmt, setFmt] = useState<'idle' | 'running' | 'done' | 'failed' | 'timeout'>('idle');
  const [fmtNote, setFmtNote] = useState('');
  const [tr, setTr] = useState<'idle' | 'confirm' | 'running' | 'done' | 'failed' | 'timeout'>(
    'idle',
  );
  const [trNote, setTrNote] = useState('');
  const [violations, setViolations] = useState<Violation[]>([]);

  const isNew = initial === null;

  /**
   * **IS THERE ANYTHING TO LOSE?** The overwrite confirmation fires on FORM state, not on
   * the stored row — that is what auto-translate replaces, and it is the thing the server
   * has never seen. An untouched empty form has nothing at stake, and a confirmation there
   * is a dialog that teaches people to click through dialogs.
   *
   * **A `.trim()` OVER THREE STRINGS, WHERE THE BLOCK EDITOR NEEDED `extractSegments`.**
   * Its first draft asked whether `JSON.stringify(block)` still had letters in it after the
   * structural keys were stripped, and a brand-new empty paragraph is
   * `{"kind":"paragraph","text":[{"kind":"text","text":""}]}` — whose remaining `"text"`
   * KEYS are letters, so the confirmation fired on an empty form. **A textarea has no such
   * problem**: empty is empty, and the guard is now obviously correct rather than correct
   * for a reason that needed a paragraph.
   */
  const formHasContent =
    title.trim() !== '' || description.trim() !== '' || markdown.trim() !== '';

  /** The current parse, for the block count in the Auto Format note. Pure and cheap. */
  const blockCount = markdown.trim() === '' ? 0 : parseMarkdown(markdown).length;

  async function autoFormat() {
    setFmt('running');
    setFmtNote('');
    setViolations([]);
    try {
      const res = await fetch(`/api/admin/blog/${slug}/format`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(FORMAT_ABORT_MS),
        body: JSON.stringify({
          locale,
          title,
          description,
          heroCardSlug: heroCard === '' ? null : heroCard,
          /*
           * **THE BODY CARRIES MARKDOWN AND NOTHING SHAPED LIKE A DOCUMENT.** The route
           * parses it and derives the hero `alt` itself, so a caller cannot post a
           * `Block[]` the editor could not have produced. A7's rule, applied to a payload.
           */
          markdown,
        }),
      });

      /*
       * **`unreadable` DISTINGUISHES "NO JSON" FROM "JSON SAYING NOTHING".** `.catch(() => ({}))`
       * collapsed those two, and they need different sentences: an empty object means the route
       * answered and had nothing to add, while a parse failure means it crashed before it
       * answered or something is between us and it.
       */
      let payload: {
        ok?: boolean;
        reason?: string;
        detail?: string;
        markdown?: string;
        description?: string;
        title?: string;
        titleGenerated?: boolean;
        headingsAdded?: number;
        rejected?: string[];
        violations?: Violation[];
        stage?: string;
        errorClass?: string;
        errorCode?: string;
      } = {};
      let unreadable = false;
      try {
        payload = await res.json();
      } catch {
        unreadable = true;
      }

      if (unreadable) {
        setFmt('failed');
        setFmtNote(BLOG.editor.formatUnreadable(res.status));
        return;
      }

      /*
       * **A 422 IS THE LINT OR ZOD REFUSING, AND IT LANDS IN THE ONE `LintPanel`** — the same
       * shape the save route returns, so there is one place violations are rendered whichever
       * button produced them. The NOTE names the count and the fields, because a panel below
       * the fold is a panel nobody scrolls to unless something points at it.
       */
      if (res.status === 422) {
        const v = payload.violations ?? [];
        setViolations(v);
        setFmt('failed');
        setFmtNote(
          v.length > 0
            ? BLOG.editor.formatInvalid(
                v.length,
                [...new Set(v.map((x) => BLOG.editor.field[x.field as keyof typeof BLOG.editor.field] ?? x.field))].join(', '),
              )
            : BLOG.editor.formatFailed,
        );
        return;
      }
      if (!res.ok) {
        /*
         * **THE STATUS CODE AND THE STAGE ARE THE WHOLE DIAGNOSTIC.** A 503 from this route is
         * either the read or the save; without knowing which, the first thing anybody does is
         * guess. `errorClass` is `err.name` and never the driver's message — see
         * `shared.ts`'s `unavailable()`.
         */
        setFmt('failed');
        setFmtNote(
          [
            BLOG.editor.formatHttp(res.status),
            payload.stage && payload.errorClass
              ? BLOG.editor.formatStage(payload.stage, payload.errorClass, payload.errorCode)
              : '',
          ]
            .filter(Boolean)
            .join(' '),
        );
        return;
      }
      /*
       * **A REFUSAL ARRIVES AS A 200 WITH `ok: false` AND ITS OWN SENTENCE** — the article
       * is too long to section, the model did not answer, the quota is nearly spent. Those
       * are answers the operator has to act on, and the generic failure state would throw
       * away the only useful part.
       */
      if (!payload.ok) {
        setFmt('failed');
        setFmtNote(payload.detail ?? BLOG.editor.formatFailed);
        return;
      }

      /*
       * **THE SERIALIZED ROUND TRIP REPLACES THE TEXTAREA, NOT THE SUBMITTED TEXT.** What
       * comes back is what was STORED, re-projected — so headings the model added appear as
       * `## …` and a `{#id}` shows up wherever an anchor is not the heading's own words.
       * Echoing what was sent would hide the change the button was pressed to make.
       */
      if (typeof payload.markdown === 'string') setMarkdown(payload.markdown);
      if (typeof payload.description === 'string') setDescription(payload.description);
      /*
       * **THE TITLE COMES BACK BECAUSE THE FIELD MAY HAVE BEEN EMPTY.** The route only ever
       * sends the one it stored, and it only generates when the field was blank — so assigning
       * unconditionally cannot overwrite something the operator typed.
       */
      if (typeof payload.title === 'string' && payload.title !== '') setTitle(payload.title);
      setViolations(payload.violations ?? []);

      const added = payload.headingsAdded ?? 0;
      const rejected = payload.rejected ?? [];
      setFmt('done');
      setFmtNote(
        BLOG.editor.formatDone(
          typeof payload.markdown === 'string' ? parseMarkdown(payload.markdown).length : blockCount,
          added,
          payload.titleGenerated === true,
        ) +
          (rejected.length > 0
            ? ` ${BLOG.editor.formatRejected(rejected.length, rejected[0])}`
            : ''),
      );
      /*
       * **THE PREVIEW IS SERVER-RENDERED FROM THE STORED ROW, SO IT NEEDS A RELOAD TO
       * MOVE.** `Prose` is a server component (A6-32) and cannot be handed client state.
       * A full navigation rather than `router.refresh()`: the SEO row's open/closed state
       * and the notes above are worth less than the certainty that what is on screen is
       * what is in the database, which is the whole point of R5.
       */
      window.location.href = `/admin/blog/${slug}?locale=${locale}`;
    } catch (err) {
      /*
       * **A TIMEOUT MEANS UNKNOWN, AND HERE THAT MATTERS MORE THAN ANYWHERE ELSE ON THIS
       * SURFACE**: this route WRITES, so a truncated request may have committed. The copy
       * says reload and look rather than claiming the format failed.
       */
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      setFmt(timedOut ? 'timeout' : 'failed');
      /*
       * **A NON-TIMEOUT THROW HERE IS A NETWORK FAILURE, NOT A SERVER ONE**, and the two need
       * different sentences: the request never arrived, so nothing was written and the thing to
       * check is whether the dev server is still up. `err.name` is `TypeError` for a refused
       * connection, which is unhelpful on its own and useful next to that sentence.
       */
      setFmtNote(
        timedOut
          ? BLOG.editor.formatTimedOut
          : BLOG.editor.formatNetwork(err instanceof Error ? err.name : typeof err),
      );
    }
  }

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
          hero: { cardUrlSlug: string } | null;
          body: Block[];
        };
      };
      if (!payload.ok || !payload.doc) {
        setTr('failed');
        setTrNote(payload.detail ?? BLOG.editor.translateFailed);
        return;
      }
      setTitle(payload.doc.title);
      setDescription(payload.doc.description);
      setHeroCard(payload.doc.hero?.cardUrlSlug ?? '');
      /*
       * **THE TRANSLATED DOCUMENT IS PROJECTED INTO THE TEXTAREA.** It arrives as a
       * `Block[]` because `applySegments` works on the document shape — the model never
       * sees the structure, which is `blogSegments.ts`'s load-bearing decision — so this is
       * where the two representations meet.
       */
      setMarkdown(serializeMarkdown(payload.doc.body));
      // Nothing is stored yet, and the note says so rather than implying a save.
      const untranslated = (payload.violations ?? []).filter((v) => v.kind === 'untranslated').length;
      setTr('done');
      setTrNote(
        BLOG.editor.translateDone(payload.segments ?? 0) +
          (untranslated > 0 ? ` ${BLOG.editor.translateUntranslated(untranslated)}` : ''),
      );
    } catch (err) {
      /* Nothing was written either way, so a timeout here is safe to retry. */
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      setTr(timedOut ? 'timeout' : 'failed');
      setTrNote(timedOut ? BLOG.editor.translateTimedOut : BLOG.editor.translateFailed);
    }
  }

  async function save() {
    setState('saving');
    setSaveNote('');
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
          // No `alt`: `heroSchema` is `.strict()` and the save path derives it (§7).
          hero: heroCard ? { cardUrlSlug: heroCard } : null,
          body: parseMarkdown(markdown),
        }),
      });
      /*
       * **THE SAME DIAGNOSTIC TREATMENT AS `autoFormat`**, sharing its copy builders rather
       * than growing a second spelling of *"HTTP 503"*. `saveNote` carries it, because
       * `state` alone cannot say which of five outcomes happened.
       */
      let payload: {
        violations?: Violation[];
        error?: string;
        stage?: string;
        errorClass?: string;
        errorCode?: string;
      } = {};
      let unreadable = false;
      try {
        payload = await res.json();
      } catch {
        unreadable = true;
      }

      setViolations(payload.violations ?? []);

      if (res.ok) {
        setState('saved');
        setSaveNote('');
        if (isNew) window.location.href = `/admin/blog/${slug}?locale=${locale}`;
        return;
      }

      setState('failed');
      if (unreadable) {
        setSaveNote(BLOG.editor.formatUnreadable(res.status));
      } else if (res.status === 422) {
        const v = payload.violations ?? [];
        setSaveNote(
          v.length > 0
            ? BLOG.editor.formatInvalid(
                v.length,
                [...new Set(v.map((x) => BLOG.editor.field[x.field as keyof typeof BLOG.editor.field] ?? x.field))].join(', '),
              )
            : BLOG.editor.saveFailed,
        );
      } else if (res.status === 409) {
        setSaveNote(BLOG.editor.saveExists);
      } else {
        setSaveNote(
          [
            BLOG.editor.formatHttp(res.status),
            payload.stage && payload.errorClass
              ? BLOG.editor.formatStage(payload.stage, payload.errorClass, payload.errorCode)
              : '',
          ]
            .filter(Boolean)
            .join(' '),
        );
      }
    } catch (err) {
      /* A timeout is the one outcome that means UNKNOWN: the request may have committed. */
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      setState(timedOut ? 'timeout' : 'failed');
      setSaveNote(
        timedOut ? '' : BLOG.editor.formatNetwork(err instanceof Error ? err.name : typeof err),
      );
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
              twin. There is no redirect table in this project.
            */}
            {slugFrozen ? BLOG.editor.slugFrozen : BLOG.editor.slugHint}
          </span>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{BLOG.editor.articleTitle}</span>
          <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} />
          <span className={styles.hint}>{BLOG.editor.titleHint}</span>
          {/*
            An empty Judul is a SUPPORTED path now, not a 422 — Auto Format writes one in the
            article's language. The line says so, because a required-looking field that can be
            left blank is a field people fill in badly rather than leave.
          */}
          {title.trim() === '' ? (
            <span className={styles.hint}>{BLOG.editor.titleAutoHint}</span>
          ) : null}
          <Meter n={title.length} max={110} />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{BLOG.editor.heroCard}</span>
          {/*
            A `<select>` OVER THE 22, so a free-text slug is not reachable through the UI
            (A6-20). `resolveViolations` covers every other caller.
          */}
          <select
            className={styles.input}
            value={heroCard}
            onChange={(e) => setHeroCard(e.target.value)}
          >
            <option value="">{BLOG.editor.heroNone}</option>
            {cardSlugs.map((sl) => (
              <option key={sl} value={sl}>
                {sl}
              </option>
            ))}
          </select>
          {/*
            §7. The alt is derived from the card's own lore page and there is no field for
            it. The line says so, because a missing field reads as a missing feature — and
            all four committed articles answered that field with the bare card name.
          */}
          {heroCard ? <span className={styles.hint}>{BLOG.editor.heroDerived}</span> : null}
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{BLOG.editor.content}</span>
          <span className={styles.hint}>{BLOG.editor.contentHint}</span>
          <span className={styles.hint}>{BLOG.editor.anchorSyntaxHint}</span>
          <textarea
            className={styles.content}
            rows={28}
            value={markdown}
            spellCheck={false}
            onChange={(e) => setMarkdown(e.target.value)}
          />
        </label>

        {/*
          **THE SEO ROW IS COLLAPSED, NOT HIDDEN** (design R2). Three fields is the promise
          and the description is the fourth — filled in FOR the operator by Auto Format,
          and opened only when they disagree with it. `<details>` rather than a state
          toggle: it works with JavaScript off, which every other control here does not.
        */}
        <details
          className={styles.seo}
          open={seoOpen}
          onToggle={(e) => setSeoOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className={styles.label}>
            {BLOG.editor.seoSection} · {BLOG.editor.seoSummary(description.trim().length)}
          </summary>
          <div className={styles.field}>
            {/*
              **THE HINT COMES BEFORE THE FIELD.** This is the one field whose correct
              content is not guessable from its label: *"Deskripsi (meta)"* reads as "a
              summary of the article", and a summary is exactly the wrong thing.
            */}
            <span className={styles.label}>{BLOG.editor.description}</span>
            <span className={styles.hint}>{BLOG.editor.descriptionHint}</span>
            <span className={styles.hint}>{BLOG.editor.descriptionBand}</span>
            <textarea
              className={styles.textarea}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <Meter n={description.length} min={80} max={158} />
          </div>
        </details>

        {/* ── Auto Format ────────────────────────────────────────────────── */}
        <section className={styles.translateBox}>
          <h2 className={styles.h2}>{BLOG.editor.format}</h2>
          <p className={styles.hint}>{BLOG.editor.formatHint}</p>
          <div className={styles.saveRow}>
            <button
              type="button"
              className={styles.primary}
              disabled={fmt === 'running' || markdown.trim() === ''}
              onClick={autoFormat}
            >
              {fmt === 'running' ? BLOG.editor.formatting : BLOG.editor.format}
            </button>
            {fmtNote ? (
              <span className={fmt === 'done' ? styles.ok : styles.bad} role="status">
                {fmtNote}
              </span>
            ) : null}
          </div>
        </section>

        {/* ── Auto translate. IT FILLS THE FORM AND STORES NOTHING ───────── */}
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
             * confirm blocks the thread, cannot be styled to say what is at stake, and on
             * Safari drops focus in the way `AccountMenu` records.
             */
            <div
              className={styles.confirm}
              role="alertdialog"
              aria-label={BLOG.editor.translateConfirmTitle}
            >
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
          <button
            className={styles.primary}
            type="button"
            onClick={save}
            disabled={state === 'saving'}
          >
            {state === 'saving' ? BLOG.editor.saving : BLOG.editor.save}
          </button>
          {state === 'saved' ? <span className={styles.ok}>{BLOG.editor.saved}</span> : null}
          {state === 'failed' ? (
            <span className={styles.bad} role="status">
              {saveNote || BLOG.editor.saveFailed}
            </span>
          ) : null}
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
 * A live character count **against its target**, not on its own. Unchanged from A6.
 *
 * **`126 karakter` DOES NOT TELL ANYBODY WHETHER 126 IS RIGHT.** This prints
 * `126 / 80–158 karakter · pas` and names the direction when it is out, so the target is on
 * screen at the moment the decision is being made rather than in a refusal after the fact.
 *
 * **IT IS A HINT, NOT A REFUSAL** (A6-17). Every band it renders is warning-class: they are
 * properties of a FINISHED article, and refusing to save a half-written draft is refusing to
 * let somebody write. The publish gate is where they bite.
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
  /* An EMPTY field says nothing. A "terlalu pendek" on a field somebody has not started is
     a warning about not having done the work yet, which trains people to ignore the colour. */
  const verdict =
    n === 0 ? '' : short ? BLOG.editor.tooShort : long ? BLOG.editor.tooLong : BLOG.editor.justRight;
  return (
    <span className={styles.hint} role="status" data-warn={n > 0 && (short || long)}>
      {label}
      {verdict ? ` · ${verdict}` : ''}
    </span>
  );
}

/**
 * The violations, grouped by field, with the excerpt. Unchanged from A6.
 *
 * **AN ARRAY, COMPARED AGAINST `[]`, ONE STRING PER ENTRY** — A6-14, and the reason
 * `lintDocument` returns what it returns. A boolean cannot tell an author which word.
 */
function LintPanel({ violations }: { violations: Violation[] }) {
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
