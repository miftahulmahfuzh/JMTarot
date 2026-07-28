/**
 * `/account` — the page `/privacy` §8 has been describing for a whole release, and
 * the four blocks requirement 1–4 asked for.
 *
 * **BLOCKS 1–3 RENDER ON THE SERVER. BLOCK 4 MOUNTS EMPTY AND FILLS IN.**
 * The first three are three indexed reads and no model call, so `/account` is a fast
 * page that is complete except for its last block. Putting the persona's model call
 * in front of the whole page for one paragraph is exactly the shape roadmap §6
 * forbids, and it is `FrequencyLine`'s argument one page over.
 *
 * **THE THREE READS ARE A RENDER-PATH EXEMPTION AND THEY ARE NOT COVERED BY THE ONE
 * §8 GRANTS.** Reconciliation grants `/history/[id]` and `/s/[slug]` one awaited
 * primary-key read each on the ground that *the row is the page*. This page reads
 * three things, and the same ground carries it: `/account` with no facts, no card
 * and no reader is not a slower `/account`, it is a blank one. What it must NOT do
 * is wait for a model call, which is why block 4 is a client fetch.
 *
 * `currentUser()` AND NOT `requireUser()`, because this is a server component and
 * `requireUser` returns a `NextResponse`. The redirects below repeat what middleware
 * already did, and the repetition is deliberate: `requireUser`'s fail-closed default
 * is the right posture, and a page that assumes middleware ran is a page that breaks
 * silently when the matcher changes. `isPublic()` must never learn this path.
 */
import Image from 'next/image';
import { redirect } from 'next/navigation';

import { AccountButton } from '@/components/AccountButton';
import { AccountAnswers } from '@/components/AccountAnswers';
import { AccountFacts } from '@/components/AccountFacts';
import { DeleteAccount } from '@/components/DeleteAccount';
import { Eyebrow } from '@/components/Eyebrow';
import { PersonaBlockClient } from '@/components/PersonaBlock';
import { TrackView } from '@/components/TrackView';
import { CARDS, cardThumb } from '@/data/deck';
import { READERS, readerPortrait } from '@/data/readers';
import { currentUser } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import {
  readingCountAllTime,
  topCardAllTime,
  topReaderAllTime,
} from '@/lib/db/queries/allTime';
import { answerPresence } from '@/lib/db/queries/onboarding';
import { getProfile } from '@/lib/db/queries/profile';
import { localeSwitcherEnabled } from '@/lib/i18n/resolve';
import { getLocale, getT } from '@/lib/i18n/t';
import { topCardLine, topReaderLine } from '@/lib/persona/lines';
import styles from './page.module.css';

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!user.onboardingComplete) redirect('/onboarding');

  const t = await getT();
  const locale = await getLocale();

  /*
   * ONE `Promise.all`, five reads, and the profile is the one that decides whether
   * the page can exist at all. `readingCountAllTime` is separate from the other two
   * rather than derived from them, because both gates count READINGS and both of
   * those queries count something else — cards and readers.
   */
  const [profile, topCard, topReader, readingCount, answers] = await Promise.all([
    getProfile(db, user.id),
    topCardAllTime(db, user.id),
    topReaderAllTime(db, user.id),
    readingCountAllTime(db, user.id),
    /* DECRYPTS NOTHING. `answerPresence` reads `answer_text IS NOT NULL`, so the
       plaintext of `worst_thing` never leaves the database on this page's account
       -- see its header and `AccountAnswers`'. */
    answerPresence(db, user.id),
  ]);

  /*
   * Middleware and the `onb` claim already guarantee a completed profile, so this
   * is the race with the completion route rather than a state anybody browses into.
   * `/onboarding` is where it belongs: the facts step is step 1 of 9.
   */
  if (!profile) redirect('/onboarding');

  const cardLine = topCardLine(t, locale, {
    readingCount,
    topCardId: topCard?.cardId ?? null,
    topCardCount: topCard?.count ?? null,
    /* Strictly more than half, so an even split reads as upright. The same rule
       `personaMaterial` applies, because the sentence and the prompt must agree
       about which half of the meaning pair this card has earned. */
    topCardReversedDominant: topCard === null ? null : topCard.reversedCount * 2 > topCard.count,
  });

  const readerLine = topReaderLine(
    t,
    locale,
    readingCount,
    topReader === null
      ? null
      : {
          readerId: topReader.readerId,
          count: topReader.count,
          runnerUpCount: topReader.runnerUpCount,
        },
  );

  const card = cardLine !== null && topCard !== null ? CARDS[topCard.cardId] : null;
  const reader = readerLine !== null && topReader !== null
    ? (READERS.find((r) => r.id === topReader.readerId) ?? null)
    : null;

  return (
    <main className={styles.shell}>
      {/*
        `/account` IS NOT THE DRAW SCREEN, which is the one page
        `accountSurface.test.ts` forbids this on. Nothing streams here that a locale
        flip could tear in half.

        `showLanguage` is resolved HERE because `LOCALE_SWITCHER` has no
        `NEXT_PUBLIC_` prefix and would inline as `undefined` inside a client
        component.
      */}
      <AccountButton surface="account" showLanguage={localeSwitcherEnabled()} />

      {/* V4 declared `account.details_viewed` and V8 fires it (reconciliation §4).
          `from` is derived in the browser, because the server never sees a Referer
          on a client-side navigation and "reached from the menu" against "reached
          from a bookmark" is the only signal that says whether the shell is
          discoverable. */}
      <TrackView name="account.details_viewed" props={{ from: 'direct' }} />

      <Eyebrow>{t('common.majorArcana')}</Eyebrow>
      <h1 className={styles.title}>{t('account.title')}</h1>
      <p className={styles.hint}>{t('account.hint')}</p>

      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>{t('account.facts.heading')}</h2>
        <AccountFacts
          initial={{
            fullName: profile.fullName,
            nickname: profile.nickname,
            birthDate: profile.birthDate,
          }}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>{t('account.card.heading')}</h2>
        {cardLine && card ? (
          <div className={styles.withArt}>
            {/*
              THE 240x360 THUMBNAIL, DRAWN AT 88x132 — the same asset and the same
              size the fan and the slot row use. `cardThumb` appends `ART_VERSION`,
              which is the whole cache story: `next.config.ts` serves `/cards/*`
              with a one-year `immutable` header on slug-based, non-content-hashed
              filenames, so a regenerated deck is only ever visible because of that
              query string.
            */}
            <Image
              className={styles.thumb}
              src={cardThumb(card.slug)}
              alt={card.name}
              width={88}
              height={132}
            />
            <p className={styles.line}>{cardLine}</p>
          </div>
        ) : (
          <Empty t={t} message={t('account.card.empty')} />
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>{t('account.reader.heading')}</h2>
        {readerLine && reader ? (
          <div className={styles.withArt}>
            {/* The 2:1 landscape scene, at the width the block can spare. The
                picker draws the same asset full-bleed; here it is a stamp beside a
                sentence, so `sizes` is narrow and nothing is `priority` -- this is
                the third block on a page nobody arrives at in a hurry. */}
            <Image
              className={styles.portrait}
              src={readerPortrait(reader.id)}
              alt={t('picker.reader.portraitAlt', { name: reader.name, title: reader.title })}
              width={1024}
              height={512}
              sizes="120px"
            />
            <div>
              <p className={styles.line}>{readerLine.line}</p>
              {/*
                THE CLOSING LINE, IN ITS OWN ITALIC. It is the only sentence on this
                page that asks something OF the querent rather than describing them,
                and that contrast is requirement 3. Do not fold it into the paragraph
                above: `lines.ts` returns them separately so this stays visible.
              */}
              <p className={styles.closing}>{readerLine.closing}</p>
            </div>
          </div>
        ) : (
          <Empty t={t} message={t('account.reader.empty')} />
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>{t('account.persona.heading')}</h2>
        {/* NEVER EMPTY (A9). The endpoint always returns a body, because the
            fallback is a real block. */}
        <PersonaBlockClient />
      </section>

      {/*
        PER-ANSWER CLEARING (reconciliation §7.3), BELOW the persona rather than
        beside the facts. `/privacy` promises it twice in both locales and nobody
        could perform it, which is the mistake this page exists to end — but L13's
        warning that six rows "turn the rite into a settings page" is about EDITING
        them, and the placement is what protects the rite: labelled by question,
        blank by content, and nowhere near the top of the page.
      */}
      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>{t('account.answers.heading')}</h2>
        <AccountAnswers initial={answers} />
      </section>

      <p className={styles.disclaimer}>{t('common.disclaimer.short')}</p>

      <DeleteAccount />
    </main>
  );
}

/**
 * **AN EMPTY STATE WITH REAL COPY, UNLIKE M14's AMBIENT FEATURES (A9).**
 *
 * M14's "render nothing" is right for a line that appears unbidden on the reader
 * picker — announcing a feature the querent is not interesting enough for is worse
 * than invisibility. `/account` is a page they navigated to on purpose, and a page
 * with three empty holes reads as broken. So each empty block says what is missing
 * and offers the one thing that fixes it.
 */
function Empty({
  t,
  message,
}: {
  t: Awaited<ReturnType<typeof getT>>;
  message: string;
}) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyLine}>{message}</p>
      <a className={styles.cta} href="/">
        {t('account.draw.cta')}
      </a>
    </div>
  );
}
