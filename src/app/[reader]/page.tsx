import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DaySummary } from '@/components/DaySummary';
import { Eyebrow } from '@/components/Eyebrow';
import { ReaderViewed } from '@/components/ReaderViewed';
import { TrackLink } from '@/components/TrackLink';
import { READERS, readerById, readerPortrait } from '@/data/readers';
import { SERVICES } from '@/data/services';
import { getT } from '@/lib/i18n/t';
import styles from './page.module.css';

/** Three readers, known at build time. */
export function generateStaticParams() {
  return READERS.map((r) => ({ reader: r.id }));
}

export default async function ServicePicker({
  params,
}: {
  params: Promise<{ reader: string }>;
}) {
  const { reader: readerId } = await params;
  const reader = readerById(readerId);
  if (!reader) notFound();

  const t = await getT();

  return (
    <main className={styles.shell}>
      {/* Renders nothing. Kept out of the server component so this page stays
          static; `from` is derived in the browser because the server cannot
          see a client-side navigation. */}
      <ReaderViewed readerId={reader.id} />

      {/* Standalone mode has no browser chrome and no back gesture. See the
          note in the stylesheet -- this is not decoration. */}
      <Link href="/" className={styles.back}>
        {t('nav.back.readers')}
      </Link>

      <div className={styles.bannerWrap}>
        <div className={styles.portrait}>
          <Image
            src={readerPortrait(reader.id)}
            alt={t('picker.reader.portraitAlt', { name: reader.name, title: reader.title })}
            width={1024}
            height={512}
            priority
            sizes="(max-width: 520px) 100vw, 520px"
          />
          <div className={styles.scrim} />
          <div className={styles.caption}>
            <div className={styles.name}>{reader.name}</div>
            <div className={styles.readerTitle}>{reader.title}</div>
          </div>
        </div>
      </div>

      <p className={styles.bio}>{reader.bio[t.locale]}</p>

      {/* What this reader remembers about today. Renders nothing until the
          first byte, and nothing at all for a querent who has not read today
          (M14) -- which is the common case and must stay the cheapest.

          STILL A CLIENT COMPONENT, BUT THE REASON CHANGED WITH W6. This used to
          say "so this page stays static", and `npm run build` listing
          /thessaly, /margaret and /adrian as prerendered was the canary. That
          canary is gone: the root layout awaits `getLocale()` for `<html lang>`,
          which opts the whole tree into dynamic rendering, and the build now
          lists every route as ƒ. Plan §8 says to expect exactly that.

          What survives is the reason that actually mattered: an awaited DB read
          plus a possible model call HERE blocks the first byte of the page, and
          roadmap §6 forbids that whether or not the page was static. So it still
          mounts empty and fills in -- and the check is no longer a line in the
          build output but the requirement itself, which is that the three
          readers and their services render before any memory feature resolves. */}
      <DaySummary readerId={reader.id} readerName={reader.name} />

      <Eyebrow>{t('picker.service.eyebrow')}</Eyebrow>

      <div className={styles.services}>
        {SERVICES.map((service) => (
          <TrackLink
            key={service.id}
            href={`/${reader.id}/${service.id}`}
            className={styles.service}
            name="service.chosen"
            props={{ reader_id: reader.id, service_id: service.id }}
          >
            <span>
              <span className={styles.serviceName}>{service.name[t.locale]}</span>
              <span className={styles.tagline}>{service.tagline[t.locale]}</span>
            </span>
            <span className={styles.count}>
              {t.plural('picker.service.cardCount', service.cardCount)}
            </span>
          </TrackLink>
        ))}
      </div>

      <p className={styles.disclaimer}>{t('common.disclaimer.short')}</p>
    </main>
  );
}
