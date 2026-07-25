import styles from './Backdrop.module.css';

/**
 * The fixed night-sky background: one radial wash plus a twinkling starfield.
 *
 * Rendered once in the root layout and pinned behind everything at z-index -1,
 * so it does not scroll with the page and no screen has to think about it.
 */
export function Backdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <div className={styles.stars} />
    </div>
  );
}
