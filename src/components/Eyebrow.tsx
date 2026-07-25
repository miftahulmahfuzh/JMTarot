import styles from './Eyebrow.module.css';

/**
 * The design's section header: a short Cinzel label in gold, flanked by
 * hairlines. Used at the top of every screen, which is most of what gives
 * them a common frame.
 */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className={styles.eyebrow}>{children}</div>;
}
