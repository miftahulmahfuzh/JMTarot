import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Eyebrow } from '@/components/Eyebrow';
import { READERS, readerById, readerPortrait } from '@/data/readers';
import { SERVICES } from '@/data/services';
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

  return (
    <main className={styles.shell}>
      {/* Standalone mode has no browser chrome and no back gesture. See the
          note in the stylesheet -- this is not decoration. */}
      <Link href="/" className={styles.back}>
        &larr; Pembaca lain
      </Link>

      <div className={styles.bannerWrap}>
        <div className={styles.portrait}>
          <Image
            src={readerPortrait(reader.id)}
            alt={`${reader.name}, ${reader.title}`}
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

      <p className={styles.bio}>{reader.bio}</p>

      <Eyebrow>Pilih layanan</Eyebrow>

      <div className={styles.services}>
        {SERVICES.map((service) => (
          <Link
            key={service.id}
            href={`/${reader.id}/${service.id}`}
            className={styles.service}
          >
            <span>
              <span className={styles.serviceName}>{service.name}</span>
              <span className={styles.tagline}>{service.tagline}</span>
            </span>
            <span className={styles.count}>
              {service.cardCount} kartu
            </span>
          </Link>
        ))}
      </div>

      <p className={styles.disclaimer}>Untuk hiburan semata.</p>
    </main>
  );
}
