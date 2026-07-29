'use client';

/**
 * The search box on `/admin/users`. v0.5.0 / A5, task 10.
 *
 * **IT IS A `<form method="get">` AND IT FETCHES NOTHING.** The page is server-rendered from
 * `searchParams`, so a search is a NAVIGATION — the pattern A4 established and the one R21
 * struck the metrics route for. `RangeFilter` is the precedent, verbatim: a GET form whose
 * `action` is the page's own path.
 *
 * **SO WHY IS IT A CLIENT COMPONENT AT ALL?** For one thing only: the field keeps what the
 * operator typed after the navigation, which a `defaultValue` on a server-rendered input also
 * does — and for the "clear" control, which needs no JavaScript either. It is `'use client'`
 * because `useState` on the input is what makes the clear button update the field without a
 * round trip. **If that ever stops being worth a client boundary, this file should become a
 * server component and nothing else changes.**
 *
 * **NO DEBOUNCE AND NO `router.push` PER KEYSTROKE.** The plan asked for a debounced push;
 * every keystroke pushed to the URL would put a partially-typed email into the platform access
 * log once per character (A5-13's accepted cost, multiplied), and it would re-run a paged
 * aggregate per keystroke on a cold lambda. Submit is a deliberate act, which is what a search
 * over other people's email addresses should be.
 */
import { useState } from 'react';
import { LIST } from './copy';
import styles from './users.module.css';

export function AdminUserTable({ q }: { q: string }) {
  const [term, setTerm] = useState(q);

  return (
    <form className={styles.search} method="get" action="/admin/users">
      <label className={styles.searchLabel} htmlFor="admin-user-q">
        {LIST.searchLabel}
      </label>
      <input
        id="admin-user-q"
        name="q"
        type="search"
        className={styles.searchInput}
        placeholder={LIST.searchPlaceholder}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        // The query is capped server-side too (`normalizeQuery`); this is the courtesy half.
        maxLength={120}
        autoComplete="off"
      />
      <button type="submit" className={styles.searchButton}>
        {LIST.searchApply}
      </button>
      {term ? (
        <button
          type="button"
          className={styles.searchButton}
          onClick={() => setTerm('')}
        >
          {LIST.searchClear}
        </button>
      ) : null}
    </form>
  );
}
