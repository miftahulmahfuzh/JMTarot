'use client';

/**
 * One `(slug, locale)` row's publish / unpublish button, and its refusal.
 * **v0.5.0 / A6, task 19.**
 *
 * ── IT IS A CLIENT COMPONENT AND IT WORKS WITH JAVASCRIPT OFF ──────────────
 *
 * Not a contradiction: `useActionState` over a `<form action={…}>` is Next's
 * progressive-enhancement path. **With JavaScript off the browser performs an ordinary
 * form POST and the page re-renders from the server**; with it on, the same action runs
 * without a navigation and the refusal appears in place. §11.4 is emphatic that the list
 * and the status control are the two operations that have to work *when something is
 * wrong in production*, and that is a state in which a hydration failure is likelier
 * than usual.
 *
 * The one thing lost without JavaScript is the in-place refusal: a full POST re-renders
 * the list, and the action's returned state is rendered by the same component either
 * way, so it survives.
 *
 * ── THE REFUSAL IS A SENTENCE, NOT A CODE ─────────────────────────────────
 *
 * `reason` is a closed set and `copy.ts` maps every member to a line that says what
 * happened and what to do. **A6-7's second defence exists because *"the toggle did
 * nothing"* is the state in which somebody opens `db:studio` and edits a row by hand**
 * — so a silent no-op here is not a cosmetic failure, it is how the state that 500s a
 * sitemapped URL gets reached.
 *
 * ── THE `Publik` CHIP IS A LINK, AND `publicHref` IS A PROP ────────────────
 *
 * The list said an article was public and gave no way to go and look at it. The chip is
 * now the way: `published` renders an anchor to the article's own address, in a new tab,
 * so the list this page came from is still there behind it.
 *
 * **The href is BUILT ON THE SERVER and arrives as a prop**, the rule `GalleryTile`
 * states for the same shape: a client component would have to know the locale prefix
 * maths, and `@/lib/i18n/prefix` is what A-D12's grep keeps out of this subtree. It is
 * `null` for every status but `published`, so *whether* there is a public address to
 * offer is decided by the same server render that knows the row.
 */
import { useActionState } from 'react';
import type { BlogStatus } from '@/lib/content/blogStatus';
import { setBlogStatus, type StatusActionState } from './actions';
import { BLOG, RULE_LINE } from './copy';
import styles from './blog.module.css';

export function StatusControl({
  slug,
  locale,
  status,
  unreachable,
  publicHref,
}: {
  slug: string;
  locale: string;
  status: BlogStatus;
  /** A6-22: published, but `id` is not, so the URL 404s by derivation. */
  unreachable: boolean;
  /**
   * The article's own public address, or `null` when there is none to offer.
   *
   * **A6-22 IS WHY THIS IS STILL A LINK WHEN `unreachable` IS TRUE.** The row records
   * what the operator asked for and the URL 404s by derivation; the address it names is
   * the one that 404s, and following it is how you confirm that rather than guessing.
   * The label beside it already says which one it is.
   */
  publicHref: string | null;
}) {
  const [state, action, pending] = useActionState<StatusActionState, FormData>(setBlogStatus, {});
  const to: BlogStatus = status === 'published' ? 'unpublished' : 'published';
  const mine = state.slug === slug && state.locale === locale;

  return (
    <div className={styles.statusCell}>
      {publicHref !== null ? (
        <a
          className={styles.chipLink}
          data-status={status}
          href={publicHref}
          target="_blank"
          rel="noreferrer"
          title={BLOG.openPublic}
          aria-label={`${BLOG.status[status]} — ${BLOG.openPublic}`}
        >
          {BLOG.status[status]}
          {/* Decoration: the accessible name above already says a tab opens. */}
          <span aria-hidden="true">↗</span>
        </a>
      ) : (
        <span className={styles.chip} data-status={status}>
          {BLOG.status[status]}
        </span>
      )}
      {unreachable ? (
        <span className={styles.unreachable} title={BLOG.unreachableWhy}>
          {BLOG.unreachable}
        </span>
      ) : null}

      <form action={action}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="to" value={to} />
        {/*
          **44px MINIMUM.** `PublicShare`'s 36px control is a known defect on 23 public
          pages and is not a precedent to copy — `blogfit.sh`'s `smallTargets` still
          reports it.
        */}
        <button className={styles.statusButton} type="submit" disabled={pending}>
          {to === 'published' ? BLOG.publish : BLOG.unpublish}
        </button>
      </form>

      {mine && state.refusal ? (
        <p className={styles.refusal} role="alert">
          {BLOG.refusal[state.refusal]}
        </p>
      ) : null}
      {mine && state.violations?.length ? (
        <ul className={styles.refusalList}>
          {state.violations.map((rule) => (
            <li key={rule}>{RULE_LINE[rule as keyof typeof RULE_LINE] ?? rule}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
