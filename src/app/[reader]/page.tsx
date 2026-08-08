import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccountButton } from '@/components/AccountButton';
import { ChatButton } from '@/components/ChatButton';
import { Eyebrow } from '@/components/Eyebrow';
import { ReaderDeck } from '@/components/ReaderDeck';
import { ReaderViewed } from '@/components/ReaderViewed';
import { TrackLink } from '@/components/TrackLink';
import { READERS, readerById, readerPortrait } from '@/data/readers';
import { SERVICES } from '@/data/services';
import { localeSwitcherEnabled } from '@/lib/i18n/resolve';
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
      {/* V4. Fixed to the viewport's top-right corner, so it takes no space here
          and needs no CSS from this file -- the first row is the left-aligned
          back link, about 110px wide at 390px, and the circle is at the right
          edge. `showLanguage` is resolved in this SERVER component because
          LOCALE_SWITCHER has no NEXT_PUBLIC_ prefix and would inline as
          `undefined` inside a client one.

          THIS FILE IS V5's under roadmap §8. The line is additive and trivially
          mergeable; if V5's swipe deck lands on top of it, keep both. */}
      <AccountButton surface="service_picker" showLanguage={localeSwitcherEnabled()} />
      {/* v0.7.0 / `C-D17`, beside the account circle. See `ChatButton`'s header for
          the mount rule and for why it is absent from the draw screen. */}
      <ChatButton />

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

      {/* The reader's bio and, when there is one, what this reader remembers
          about today -- two panels of one swipe deck (V5, roadmap §1.5).

          IT RENDERS ONE PANEL FOR A QUERENT WHO HAS NOT READ TODAY, which is
          the common case and must stay the cheapest: no dots, no affordance,
          and a deck exactly as tall as the bio. There is no empty second panel,
          ever (M14).

          STILL A CLIENT COMPONENT, and the reason is the one that outlived W6's
          prerendering canary: an awaited DB read plus a possible model call
          HERE blocks the first byte of the page, and roadmap §6 forbids that
          whether or not the route is static. The three readers and their
          services must render before any memory feature resolves. */}
      <ReaderDeck readerId={reader.id} readerName={reader.name} bio={reader.bio[t.locale]} />

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
