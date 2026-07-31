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

/** What any of the four routes on this surface can put in a body. */
type Reply = {
  ok?: boolean;
  reason?: string;
  detail?: string;
  markdown?: string;
  description?: string;
  title?: string;
  titleGenerated?: boolean;
  headingsAdded?: number;
  rejected?: string[];
  segments?: number;
  violations?: ({ kind?: string } & Partial<Violation>)[];
  error?: string;
  stage?: string;
  errorClass?: string;
  errorCode?: string;
};

/**
 * Read a JSON body, distinguishing **"no JSON"** from **"JSON saying nothing"**.
 *
 * `await res.json().catch(() => ({}))` collapses those two, and they need different sentences:
 * an empty object means the route answered and had nothing to add, while a parse failure means
 * it crashed before answering or something is between the browser and it. One helper rather
 * than four copies, because the fourth copy is the one that would use the shortcut.
 */
async function readReply(res: Response): Promise<{ payload: Reply; unreadable: boolean }> {
  try {
    return { payload: (await res.json()) as Reply, unreadable: false };
  } catch {
    return { payload: {}, unreadable: true };
  }
}

/** The violations from a reply, dropping the translate route's `{ kind }` entries. */
const lintOf = (payload: Reply): Violation[] =>
  (payload.violations ?? []).filter((v): v is Violation => v.cls !== undefined);

/** `judul, isi` — the distinct field names in a refusal, for the note above the panel. */
const fieldsOf = (violations: readonly Violation[]): string =>
  [
    ...new Set(
      violations.map(
        (x) => BLOG.editor.field[x.field as keyof typeof BLOG.editor.field] ?? x.field,
      ),
    ),
  ].join(', ');

export type EditorProps = {
  slug: string;
  locale: string;
  slugFrozen: boolean;
  /**
   * Is there a stored document in THIS locale to translate FROM? **The direction flipped on
   * 2026-07-31** — see `translate()`. Resolved on the server, because the editor only ever
   * holds one locale's row and cannot see whether it has been saved.
   */
  canTranslate: boolean;
  /** Does the OTHER locale already have a body the translation would overwrite? */
  targetHasBody: boolean;
  /** This row's status, so the editor knows whether there is an article to link to. */
  status: 'draft' | 'published' | 'unpublished';
  /**
   * This locale's public path, BUILT ON THE SERVER by `blogPostPath`.
   *
   * `StatusControl`'s rule: *"a client component would have to know the locale prefix maths,
   * and `@/lib/i18n/prefix` is what A-D12's grep keeps out of this subtree."* It arrives
   * unconditionally — it is one string — and **whether to render a link to it is gated on the
   * status**, which is the fact that decides whether the address resolves.
   */
  publicPath: string;
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
  targetHasBody,
  status,
  publicPath,
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

  const [state, setState] = useState<
    'idle' | 'saving' | 'saved' | 'publishing' | 'published' | 'failed' | 'timeout'
  >('idle');
  /** Why the save failed, when `state` alone cannot say. See `save()`. */
  const [saveNote, setSaveNote] = useState('');
  /**
   * Is the article published RIGHT NOW? Seeded from the server and moved by a publish.
   *
   * **IT IS NOT DERIVED FROM `state`**, because `state` returns to `saved` on the next save and
   * the article stays published — so a link gated on `state` would disappear from under an
   * operator who pressed Simpan once more.
   */
  const [live, setLive] = useState(status === 'published');
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

  /** Any in-flight write. One flag, so two buttons cannot both be pressed into one row. */
  const busy = state === 'saving' || state === 'publishing';

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

      const { payload, unreadable } = await readReply(res);

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
        const v = lintOf(payload);
        setViolations(v);
        setFmt('failed');
        setFmtNote(
          v.length > 0 ? BLOG.editor.formatInvalid(v.length, fieldsOf(v)) : BLOG.editor.formatFailed,
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
      setViolations(lintOf(payload));

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
        /*
         * **`to` IS THE OTHER LOCALE, WHICH IS THE WHOLE DIRECTION FLIP.** The route derives
         * `from` as the locale that is not `to`, so pushing needed no new parameter — only
         * the caller naming the destination instead of itself. The old spelling was
         * `{ to: locale }`, which pulled INTO the tab you were standing on and required you
         * to be standing on an empty one.
         */
        body: JSON.stringify({ to: locale === 'id' ? 'en' : 'id' }),
      });
      if (!res.ok) {
        setTr('failed');
        setTrNote(BLOG.editor.translateFailed);
        return;
      }
      const { payload, unreadable } = await readReply(res);
      if (unreadable) {
        setTr('failed');
        setTrNote(BLOG.editor.formatUnreadable(res.status));
        return;
      }
      if (!payload.ok) {
        setTr('failed');
        /*
         * A lint refusal on a translation arrives as `ok: false` with the violations, because
         * the operator did not type this text and cannot fix it in the form on screen — they
         * are on the SOURCE tab. So it lands in the panel AND gets a sentence.
         */
        const lint = lintOf(payload);
        setViolations(lint);
        setTrNote(
          payload.detail ||
            (lint.length > 0
              ? BLOG.editor.formatInvalid(lint.length, fieldsOf(lint))
              : BLOG.editor.translateFailed),
        );
        return;
      }
      /*
       * **NOTHING ON THIS FORM CHANGES.** The translation was stored in the OTHER locale, so
       * touching `title`/`markdown` here would overwrite the article the operator is working
       * on with a translation of itself — which is what the pull-direction version did on
       * purpose and what makes the push version safe to press by reflex.
       */
      const untranslated = (payload.violations ?? []).filter((v) => v.kind === 'untranslated').length;
      setTr('done');
      setTrNote(
        BLOG.editor.translateDone(payload.segments ?? 0) +
          (untranslated > 0 ? ` ${BLOG.editor.translateUntranslated(untranslated)}` : ''),
      );
    } catch (err) {
      /*
       * **A TIMEOUT HERE MEANS UNKNOWN NOW, WHERE IT ONCE MEANT NOTHING HAPPENED.** The route
       * writes the target locale, so a truncated request may have committed it — the copy says
       * to open the other tab and look rather than claiming nothing changed.
       */
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      setTr(timedOut ? 'timeout' : 'failed');
      setTrNote(
        timedOut
          ? BLOG.editor.translateTimedOut
          : BLOG.editor.formatNetwork(err instanceof Error ? err.name : typeof err),
      );
    }
  }

  /**
   * Store the form. **Returns whether it committed**, so `savePublish` can chain on it.
   *
   * A boolean rather than a thrown error: every failure arm already sets the state and the
   * note, and a caller that has to catch would duplicate that.
   */
  async function save(): Promise<boolean> {
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
      const { payload, unreadable } = await readReply(res);
      setViolations(lintOf(payload));

      if (res.ok) {
        setState('saved');
        setSaveNote('');
        /*
         * **A CREATE STILL NAVIGATES, SO IT CANNOT BE CHAINED INTO A PUBLISH.** The page has to
         * re-read for the editor to stop being "new", and `savePublish` handles that by
         * publishing only when there is already a row. See its guard.
         */
        if (isNew) window.location.href = `/admin/blog/${slug}?locale=${locale}`;
        return true;
      }

      setState('failed');
      if (unreadable) {
        setSaveNote(BLOG.editor.formatUnreadable(res.status));
      } else if (res.status === 422) {
        const v = lintOf(payload);
        setSaveNote(
          v.length > 0 ? BLOG.editor.formatInvalid(v.length, fieldsOf(v)) : BLOG.editor.saveFailed,
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
      return false;
    } catch (err) {
      /* A timeout is the one outcome that means UNKNOWN: the request may have committed. */
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      setState(timedOut ? 'timeout' : 'failed');
      setSaveNote(
        timedOut ? '' : BLOG.editor.formatNetwork(err instanceof Error ? err.name : typeof err),
      );
      return false;
    }
  }

  /**
   * Save, then publish. **Two requests against two existing endpoints, deliberately.**
   *
   * A single combined route would need its own gate, its own event and its own refusal set,
   * duplicating `changeStatus` — which owns rules this editor must not restate: no path back to
   * draft (A6-21), `id` before `en`, and a publish refused for ANY violation including
   * warnings. Chaining means those answers arrive from the one place that decides them.
   *
   * **THE PUBLISH IS SKIPPED WHEN THE SAVE NAVIGATED.** A create redirects so the page can
   * re-read, and firing a publish into a page that is unloading is a request whose answer
   * nobody sees. The operator presses it again on the reloaded page, where it is an update.
   */
  async function savePublish() {
    if (!(await save())) return;
    if (isNew) return;

    setState('publishing');
    try {
      const res = await fetch(`/api/admin/blog/${slug}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(SAVE_ABORT_MS),
        body: JSON.stringify({ locale, to: 'published' }),
      });
      const { payload, unreadable } = await readReply(res);
      if (unreadable) {
        setState('failed');
        setSaveNote(BLOG.editor.formatUnreadable(res.status));
        return;
      }

      if (res.ok) {
        setState('published');
        setLive(true);
        setViolations(lintOf(payload));
        return;
      }

      setState('failed');
      setViolations(lintOf(payload));
      if (res.status === 422) {
        /*
         * **THE PUBLISH GATE REFUSES ON WARNINGS TOO**, which the save does not — so this is
         * the one place an operator meets a violation that let them save five seconds ago.
         * Naming the fields is what makes that comprehensible rather than surprising.
         */
        const v = lintOf(payload);
        setSaveNote(
          v.length > 0 ? BLOG.editor.formatInvalid(v.length, fieldsOf(v)) : BLOG.editor.saveFailed,
        );
      } else if (payload.reason) {
        // A state refusal, not a content one: `id-not-published` is the one that fires.
        setSaveNote(
          BLOG.editor.publishRefused(
            BLOG.refusal[payload.reason as keyof typeof BLOG.refusal] ?? payload.reason,
          ),
        );
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

        {/* ── Auto translate. IT PUSHES TO THE OTHER LOCALE AND STORES IT ── */}
        <section className={styles.translateBox}>
          <h2 className={styles.h2}>
            {BLOG.editor.translate} {BLOG.editor.translateTo(locale)}
          </h2>
          <p className={styles.hint}>{BLOG.editor.translateHint}</p>

          {!canTranslate ? (
            <p className={styles.hint}>{BLOG.editor.translateNoSource}</p>
          ) : tr === 'confirm' ? (
            /*
             * **THE OVERWRITE GUARD, INLINE RATHER THAN `window.confirm`.** A native
             * confirm blocks the thread, cannot be styled to say what is at stake, and on
             * Safari drops focus in the way `AccountMenu` records.
             *
             * What it guards changed with the direction: the risk is now a STORED article in
             * the tab the operator is not looking at, which is worth confirming more than a
             * form they can see was.
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
                onClick={() => (targetHasBody ? setTr('confirm') : translate())}
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
            disabled={busy}
          >
            {state === 'saving' ? BLOG.editor.saving : BLOG.editor.save}
          </button>
          {/*
            **`Simpan & terbitkan` IS A SECOND BUTTON, NOT A MODE ON THE FIRST.** Publishing is
            a state change with its own event and NO WAY BACK to draft (A6-21), so a single
            control that sometimes published would be the one thing here whose effect an
            operator could not predict from its label.

            It is hidden once the row is live: `changeStatus` treats `published -> published`
            as a no-op that writes nothing, so the button would be a control that correctly
            does nothing — and A6-7's rule is that *"the toggle did nothing"* is the state in
            which somebody opens `db:studio` and edits a row by hand.
          */}
          {!live ? (
            <button type="button" onClick={savePublish} disabled={busy}>
              {state === 'publishing' ? BLOG.editor.savePublishing : BLOG.editor.savePublish}
            </button>
          ) : null}
          {/*
            **THE LINK IS GATED ON `live`, AND `publicPath` WAS BUILT ON THE SERVER.**
            `StatusControl`'s rule — a client component must not know the locale prefix maths,
            and `adminCopy.test.ts` keeps `@/lib/i18n/prefix` out of this whole subtree.
          */}
          {live ? (
            <a
              className={styles.link}
              href={publicPath}
              target="_blank"
              rel="noreferrer"
              title={BLOG.editor.viewArticleTitle}
            >
              {BLOG.editor.viewArticle}
            </a>
          ) : null}
          {state === 'saved' ? <span className={styles.ok}>{BLOG.editor.saved}</span> : null}
          {state === 'published' ? (
            <span className={styles.ok} role="status">
              {BLOG.editor.savePublished}
            </span>
          ) : null}
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
  /*
   * **IT RENDERS NOTHING WHEN THERE IS NOTHING, AND THAT IS A CHANGE (2026-07-31).**
   *
   * Miftah asked whether this section is still used. It is — the lint still refuses saves and
   * still refuses publishes, and it is the only place its words appear: a live check on the
   * real paste produced `malay / tempoh` and `bare-path / /history`, both error class, both
   * stored nothing. **What did not survive is the permanent empty panel.** It existed beside a
   * form with dozens of fields, where a standing "Tidak ada masalah" was reassurance; beside
   * three fields it is a heading and a green line that never change, which is furniture that
   * teaches an operator to stop reading this part of the screen.
   *
   * The save row already says `Tersimpan.`, and a publish refused for a warning says which
   * field — so silence here is now the successful state and the panel is a thing that ARRIVES.
   */
  if (violations.length === 0) return null;

  const errors = violations.filter((v) => v.cls === 'error');
  const warnings = violations.filter((v) => v.cls === 'warning');

  return (
    <section className={styles.lint}>
      <h2 className={styles.h2}>{BLOG.editor.lintTitle}</h2>
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
    </section>
  );
}
