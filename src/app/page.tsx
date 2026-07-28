import Image from 'next/image';
import { AccountButton } from '@/components/AccountButton';
import { Eyebrow } from '@/components/Eyebrow';
import { FrequencyLine } from '@/components/FrequencyLine';
import { TrackLink } from '@/components/TrackLink';
import { READERS, readerPortrait } from '@/data/readers';
import { localeSwitcherEnabled } from '@/lib/i18n/resolve';
import { getT } from '@/lib/i18n/t';
import styles from './page.module.css';

/**
 * Reader picker -- the root screen.
 *
 * Plain interpolated hrefs. The expo-router trap recorded in CLAUDE.md, where
 * `/${reader.id}` failed typed-route validation and the object form was
 * required, was specific to expo-router's typedRoutes and does not apply here.
 */
export default async function Home() {
  const t = await getT();

  return (
    <main className={styles.shell}>
      {/* Fixed to the viewport's top-right corner; it takes no space in this
          flex column and needs no layout from this file. `showLanguage` is
          resolved HERE because LOCALE_SWITCHER has no NEXT_PUBLIC_ prefix and
          would inline as `undefined` inside a client component. */}
      <AccountButton surface="reader_picker" showLanguage={localeSwitcherEnabled()} />

      <Eyebrow>{t('common.majorArcana')}</Eyebrow>
      <h1 className={styles.title}>{t('app.title')}</h1>
      <p className={styles.hint}>{t('picker.reader.hint')}</p>

      {/* Renders nothing until it has a verdict, and nothing at all for a user
          with no pattern yet -- which is most users, most days (M14). Kept a
          client component so this page stays a server component that renders
          the readers instantly: a DB read and a model call in front of the
          picker for a decorative line is the shape roadmap §6 forbids. */}
      <FrequencyLine />

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
                alt={t('picker.reader.portraitAlt', {
                  name: reader.name,
                  title: reader.title,
                })}
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
                  {reader.specialties[t.locale].map((s) => (
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

      {/* The last child. The language switcher used to sit under this line and
          moved into the account menu in v0.3.0 R1 -- see LocaleSwitch's header
          and `accountSurface.test.ts`, which asserts it did not come back. */}
      <p className={styles.disclaimer}>{t('common.disclaimer.short')}</p>
    </main>
  );
}
