import styles from './LotusMark.module.css';

/**
 * Three petals over a bowl. **The app's own symbol for the querent.**
 *
 * ── EXTRACTED FROM `AccountButton.tsx` BY v0.7.0 / F4, AND THAT IS `[D8]` ────
 *
 * It was a non-exported function inside that file. `C-D16` makes the querent's chat
 * avatar *"the lotus, the same glyph `AccountButton` draws"*, and seam S9 forbids F4
 * editing `AccountButton.tsx` — so the reconciliation ruled the extraction in as
 * **the one edit to that file S9 permits**: a pure move, no behaviour change, one
 * glyph in one place. The alternative it refused was `ChatAvatar` declaring its own
 * `<svg>` with the same four `d` strings and a byte-identity test holding them in
 * step, which is two copies of a drawing kept in agreement by a regex.
 *
 * ── WHY THE LOTUS AND NOT A PICTURE OR A LETTER ─────────────────────────────
 *
 * `AccountButton`'s header carries the full argument and it is unchanged:
 *
 *  - **NOT THE GOOGLE AVATAR.** Reconciliation R21 removed `picture` from the token
 *    deliberately, to avoid a CSP `img-src` exception for a decorative element, and
 *    `CLAUDE.md` records the 548-vs-676-byte cookie measurement behind it.
 *  - **NOT AN INITIAL.** `users.display_name` is the GOOGLE name; the name this app
 *    calls the querent by is the nickname from onboarding, which lives in `profiles`
 *    and which a render path may not read. A circle showing the Google initial while
 *    three readers on screen say *mif* is the app disagreeing with itself about who
 *    the user is — and a lettered circle top-right reads as Gmail.
 *
 * It needs no data, no session and no network, which is why it can be the querent's
 * avatar in a room that renders it once per bubble.
 *
 * ── STROKED IN `currentColor`, SO THERE IS NOT A HEX IN THIS FILE ───────────
 *
 * The mounting element's own colour drives it — `AccountButton`'s hover and expanded
 * states, `ChatAvatar`'s `--gold-pale`. `size` is a class, not a prop with a number
 * in it, so no caller can invent a fourth dimension.
 *
 * `aria-hidden` and `focusable="false"`: the accessible name belongs to the control
 * or the bubble around it, and a glyph announcing itself as well reads the thing
 * twice.
 */
export function LotusMark({ size = 'button' }: { size?: 'button' | 'avatar' }) {
  return (
    <svg
      className={size === 'avatar' ? styles.avatar : styles.button}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* centre petal */}
      <path d="M12 4.5C14.4 7.6 14.4 11.9 12 15C9.6 11.9 9.6 7.6 12 4.5Z" />
      {/* left petal */}
      <path d="M12 15C8.6 14.5 5.7 12 4.6 8.8C8.2 9.2 11.2 11.5 12 15Z" />
      {/* right petal */}
      <path d="M12 15C15.4 14.5 18.3 12 19.4 8.8C15.8 9.2 12.8 11.5 12 15Z" />
      {/* the bowl the flower sits in */}
      <path d="M4.2 13.6C6.1 17.9 8.9 20 12 20C15.1 20 17.9 17.9 19.8 13.6" />
    </svg>
  );
}
