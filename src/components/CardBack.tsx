import styles from './CardBack.module.css';

/**
 * The face-down card. Purely decorative, so it is hidden from assistive tech --
 * a screen reader announcing "star glyph" 22 times would be noise, and the
 * cards carry their meaning through their `aria-label` on the pressable
 * wrapper instead.
 *
 * Positioned `inset: 0` and expects a positioned parent that sets the size.
 */
export function CardBack() {
  return (
    <div className={styles.back} aria-hidden="true">
      <div className={styles.panel}>
        <div className={styles.medallion}>
          <span className={styles.glyph}>✧</span>
        </div>
      </div>
    </div>
  );
}
