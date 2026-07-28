import type { Metadata } from 'next';
import Image from 'next/image';
import { AccountButton } from '@/components/AccountButton';
import { Eyebrow } from '@/components/Eyebrow';
import { FrequencyLine } from '@/components/FrequencyLine';
import { TrackLink } from '@/components/TrackLink';
import { READERS, readerPortrait } from '@/data/readers';
import { currentUser } from '@/lib/auth/server';
import { localeSwitcherEnabled } from '@/lib/i18n/resolve';
import { getT } from '@/lib/i18n/t';
import { Landing } from './Landing';
import styles from './page.module.css';

/**
 * `/` -- the one route in this app that renders two different pages (S-D5).
 *
 * Signed out: a static, crawlable landing page. Signed in: the reader picker,
 * exactly as before.
 *
 * ── WHY THE BRANCH IS HERE AND NOT IN THE GATE ──────────────────────────────
 *
 * `gate.ts`'s `decide()` gained one clause -- no session and `pathname === '/'` is
 * `next` -- and `'/'` is deliberately NOT in `isPublic()`, because that function
 * short-circuits above the onboarding check and a half-onboarded querent would land
 * on this picker, which assumes a completed `profiles` row. So the gate lets the
 * request through and this component decides what it means. `gate.test.ts` has the
 * assertion named for that case.
 *
 * `currentUser()` and not `auth()`: `src/lib/auth/server.ts` says everything needing
 * "who is this, on the server" goes through it, and `/login`'s header records what
 * happens when two surfaces use two predicates. **It is DATABASE-FREE**, which is
 * what makes this branch legal on a public route -- roadmap §10 forbids a database
 * read on a public page's render path, and this reads a decoded JWT.
 *
 * ── THIS ROUTE IS DELIBERATELY UNCACHEABLE, AND THAT IS S-D5's PRICE ────────
 *
 * `next.config.ts` gives `/gallery`, `/arcana/*` and `/blog*` an `s-maxage`; it
 * gives `/` nothing. Three independent reasons, and all three would have to be
 * solved together: the output varies by session; middleware writes `jmt_locale`
 * here, and a `Set-Cookie` makes a response uncacheable at the edge whatever
 * `Cache-Control` says; and its LANGUAGE follows D6's chain rather than the URL,
 * because the signed-in arm is an app route where D6 survives (S-D1) -- which is
 * also why `contentRewrite('/', true)` is `passthrough`, and `/` is the only path
 * for which that function reads the session at all.
 *
 * The crawler pays a warm `sin1` lambda, which is what `/login` has always cost.
 * The one design that would fix all three is a middleware rewrite of signed-out `/`
 * to an internal, session-invariant, prefix-pinned path -- the shape S2 is already
 * building for `/en/*` -- and it belongs to S2's file, not this one.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    /*
     * SESSION-INVARIANT ON PURPOSE. The title, the description and the canonical
     * are the same for both arms -- a session read here would be a second decode
     * that can disagree with the page's, and it would make the one part of this
     * route a crawler caches vary by cookie. There is a test.
     *
     * `title` is absent: the root layout already sets `t('app.title')` and a
     * duplicate here would be the same string twice in a diff.
     *
     * RELATIVE, resolved by `metadataBase`. **S2 REPLACES THIS WITH S-D15's
     * `contentAlternates('/')`**, which adds the reciprocal `id`/`en`/`x-default`
     * set. One line, in this file, and it is the only line S2 owns here.
     */
    alternates: { canonical: '/' },
    description: t('meta.description'),
  };
}

export default async function Home() {
  const user = await currentUser();
  if (!user) return <Landing />;
  return <ReaderPicker />;
}

/**
 * Reader picker -- the root screen for a signed-in querent. **UNCHANGED by S1**
 * apart from being given a name.
 *
 * Plain interpolated hrefs. The expo-router trap recorded in CLAUDE.md, where
 * `/${reader.id}` failed typed-route validation and the object form was
 * required, was specific to expo-router's typedRoutes and does not apply here.
 */
async function ReaderPicker() {
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
