import styles from './page.module.css';

export default function Home() {
  return (
    <main className={styles.shell}>
      <span className={styles.eyebrow}>Major Arcana</span>
      <div className={styles.rule} />
      <h1 className={styles.title}>JMTarot</h1>
      <p className={styles.hint}>Pilih pembacamu.</p>
    </main>
  );
}
