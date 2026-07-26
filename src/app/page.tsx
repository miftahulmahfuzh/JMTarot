import Image from 'next/image';
import { Eyebrow } from '@/components/Eyebrow';
import { TrackLink } from '@/components/TrackLink';
import { READERS, readerPortrait } from '@/data/readers';
import styles from './page.module.css';

/**
 * Reader picker -- the root screen.
 *
 * Plain interpolated hrefs. The expo-router trap recorded in CLAUDE.md, where
 * `/${reader.id}` failed typed-route validation and the object form was
 * required, was specific to expo-router's typedRoutes and does not apply here.
 */
export default function Home() {
  return (
    <main className={styles.shell}>
      <Eyebrow>Major Arcana</Eyebrow>
      <h1 className={styles.title}>JMTarot</h1>
      <p className={styles.hint}>Pilih pembaca yang cocok denganmu.</p>

      <div className={styles.list}>
        {READERS.map((reader, i) => (
          <TrackLink
            key={reader.id}
            href={`/${reader.id}`}
            className={styles.banner}
            name="reader.chosen"
            props={{ reader_id: reader.id }}
          >
            <div className={styles.portrait}>
              <Image
                src={readerPortrait(reader.id)}
                alt={`${reader.name}, ${reader.title}`}
                width={1024}
                height={512}
                /* Only the first is above the fold on a phone; the rest can
                   wait rather than competing for the same connection. */
                priority={i === 0}
                sizes="(max-width: 520px) 100vw, 520px"
              />
              <div className={styles.scrim} />
              <div className={styles.caption}>
                <div className={styles.name}>{reader.name}</div>
                <div className={styles.readerTitle}>{reader.title}</div>
                <div className={styles.chips}>
                  {reader.specialties.map((s) => (
                    <span key={s} className={styles.chip}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </TrackLink>
        ))}
      </div>

      <p className={styles.disclaimer}>Untuk hiburan semata.</p>
    </main>
  );
}
