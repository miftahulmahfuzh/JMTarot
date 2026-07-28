'use client';

import { useRouter } from 'next/navigation';
import { Fragment, useState, useTransition } from 'react';

import { track } from '@/lib/analytics/track.client';
import { useLocale, useT } from '@/lib/i18n/LocaleProvider';
import { LOCALES, type Locale } from '@/lib/i18n/locale';
import styles from './LocaleSwitch.module.css';

/**
 * The language toggle. TWO PLACES, TWO SHAPES, AND THE SHAPE IS THE POINT.
 *
 * ── WHERE IT LIVES (v0.3.0 R1 — this REPLACES "the reader picker footer") ────
 *
 *   `variant="names"`  -- `Indonesia · English`, in the /login footer, and
 *                         nowhere else. There is no session there and therefore
 *                         no account button, so the footer is the only place a
 *                         stranger can find this control.
 *   `variant="codes"`  -- `ID · EN`, one row inside `AccountMenu`. VD12.
 *
 * The reader-picker footer no longer carries it. Do not put it back: two live
 * switchers on one screen is two controls that can disagree about what is
 * pending, and the menu is where v0.3.0 puts every account-shaped choice.
 *
 * `variant` is REQUIRED and not defaulted, so both call sites have to declare
 * intent and R1's relocation is visible at both of them in a diff.
 *
 * ── WHY THE TWO SHAPES ARE BOTH CORRECT (VD12) ───────────────────────────────
 *
 * This header used to argue, flatly, that the names must always be written in
 * their own language -- `Indonesia`, `English`, never `Bahasa Inggris`. THAT
 * ARGUMENT IS STILL TRUE AND IT IS NARROWER THAN IT LOOKED. It is an argument
 * about a stranger meeting an unlabelled control on a login page in a language
 * they may not read: the only text that helps that person is the target
 * language's own name for itself.
 *
 * Inside the account menu none of that holds. The row is LABELLED -- `Bahasa` /
 * `Language`, from the catalog, in the language the user is already in -- and
 * the user opened the menu on purpose looking for exactly this. What is needed
 * there is a two-state toggle small enough to sit at the end of a menu row, and
 * `ID · EN` is that. `Indonesia · English` at the end of that row wraps at
 * 320px.
 *
 * So: full names where the control has to introduce itself, codes where the row
 * above it already did. Both are in the catalog (`locale.name.*`,
 * `locale.code.*`) and both are written in their own language.
 *
 * ── NOT THE DRAW SCREEN, AND NOW NOT THE ACCOUNT BUTTON EITHER ───────────────
 *
 * A flip mid-reading leaves streamed prose in one language and the chrome in
 * another, and `readings.locale` (I24) records the language the prose came out
 * in. THE READING KEEPS THE LOCALE IT WAS GENERATED IN, PERMANENTLY -- and
 * `router.refresh()` below KEEPS CLIENT STATE, so a flip after the stream ends
 * would leave the finished Indonesian reading sitting under English chrome.
 * That is why V4 suppresses the whole account button on `/[reader]/[service]`
 * rather than only this row; see `AccountButton.tsx`'s header and
 * `accountSurface.test.ts`.
 *
 * v0.3.0 R2 does NOT relax this. A reading becomes reachable in the other
 * language through `/history`, as a derived `translations` row (VD7), with the
 * original never overwritten. That is a different surface and a different
 * mechanism.
 *
 * `router.refresh()` and not `location.reload()`. The locale is resolved on the
 * server, so the page has to be re-rendered there; `refresh()` re-fetches the RSC
 * payload and keeps client state, which on the reader picker means the frequency
 * line does not flash away and come back.
 */
/**
 * How long the querent may be left holding a disabled control.
 *
 * NOT a guess at how long the write takes -- `maxDuration` on the route owns
 * that, and on a cold Neon compute it can legitimately need most of it. This
 * answers a different question: how long is it honest to show somebody two
 * greyed-out words with no spinner and no copy? Six seconds is already long.
 *
 * PASSING THIS DEADLINE IS NOT A CANCELLATION OF THE SWITCH. The request is
 * abandoned client-side; the lambda keeps running to its own budget and the write
 * still lands. That asymmetry is the point -- see the catch in `choose`.
 */
const SWITCH_DEADLINE_MS = 6_000;

export function LocaleSwitch({ variant }: { variant: 'names' | 'codes' }) {
  const t = useT();
  const active = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [posting, setPosting] = useState(false);
  /*
   * THE TAP HAS TO REGISTER IN THE FRAME IT HAPPENED IN.
   *
   * `active` comes from `LocaleProvider`, which is handed its value by the root
   * layout -- so it cannot change until the RSC refresh lands. Before this, the
   * only feedback for that entire round trip was `disabled` on two words: no
   * spinner, and no copy, because M14 gives this component no error string. On
   * the warm path that is 22ms and invisible. On a cold serverless path it is
   * seconds of a control that looks broken, which is what was reported.
   *
   * So the marker moves optimistically and `active` catches up behind it. On
   * failure it is put back, which is the same honesty rule the catch follows: the
   * page says the language did not change by still being in it.
   */
  const [chosen, setChosen] = useState<Locale | null>(null);

  const busy = pending || posting;
  /** What the row PAINTS as selected. `active` is what the server believes. */
  const shown = chosen ?? active;

  async function choose(next: Locale) {
    if (next === active || busy) return;
    setPosting(true);
    setChosen(next);
    try {
      const response = await fetch('/api/locale', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale: next }),
        /*
         * THE BOUND THAT MAKES THE HANG UNREACHABLE. Without a signal this
         * `await` is as long as the network cares to make it, and `posting` only
         * clears in the `finally` -- so an unresponsive cold start held both
         * options disabled indefinitely. Verified by negative control: with the
         * stub in `_localehang.html?hang=1`, removing this line leaves the row
         * disabled at t=8000; with it, the row re-arms at t=6500.
         */
        signal: AbortSignal.timeout(SWITCH_DEADLINE_MS),
      });
      /*
       * NO ERROR COPY, and it is the same call M14 made for the memory features:
       * a failed language switch leaves the page in the language it was already
       * in, which is a visible, self-explanatory outcome. A red sentence saying
       * "could not change language" adds nothing the screen has not already said,
       * and it would need two more catalog keys to say it in.
       */
      if (!response.ok) {
        // Put the marker back. The language really did not change.
        setChosen(null);
        return;
      }
      /*
       * `locale.changed` HAS BEEN IN THE TAXONOMY SINCE W6 AND HAS NEVER BEEN
       * FIRED. It is fired here, after the write succeeded, so the row means
       * "the language actually changed" and not "somebody tapped". `surface` is
       * `'settings'` from both call sites -- see the plan's `## Open questions`;
       * the login footer is arguably not settings and widening a union in W4's
       * file for one call site is not a change V4 makes unilaterally.
       */
      track('locale.changed', { from: active, to: next, surface: 'settings' });
      startTransition(() => router.refresh());
    } catch {
      /*
       * Offline, OR the deadline above fired. For the offline case the reasoning
       * is the `!ok` branch's: the page is unchanged and says so by being
       * unchanged.
       *
       * THE TIMEOUT CASE IS DELIBERATELY TREATED THE SAME WAY, AND THE
       * ALTERNATIVE IS WORSE. We do not know what happened -- the lambda may be
       * mid-write and about to succeed against its own larger budget, or it may
       * be gone. So the refresh is NOT fired: refreshing on a request whose
       * cookie may never have been set would re-render the page in the OLD locale
       * and stamp the failure as final. Reverting the marker and re-arming the
       * control leaves the querent able to tap again -- and if the write did
       * land, their next navigation is already in the new language, which is the
       * documented degradation this route was always designed around.
       */
      setChosen(null);
    } finally {
      setPosting(false);
    }
  }

  const label = (locale: Locale) =>
    variant === 'codes' ? t(`locale.code.${locale}`) : t(`locale.name.${locale}`);

  return (
    <div
      className={variant === 'codes' ? `${styles.row} ${styles.inline}` : styles.row}
      role="group"
      aria-label={t('locale.switch.aria')}
    >
      {LOCALES.map((locale, i) => (
        <Fragment key={locale}>
          {i > 0 ? (
            <span className={styles.sep} aria-hidden="true">
              ·
            </span>
          ) : null}
          {locale === shown ? (
            /*
             * A `<span>`, not a disabled button. `aria-current` tells a screen
             * reader which is selected, and a control that does nothing when
             * pressed should be neither focusable nor pressable-looking.
             *
             * `shown`, not `active`: the marker moves on tap so the control is
             * visibly responsive during the round trip, and reverts if the switch
             * fails. See `chosen` above.
             */
            <span className={`${styles.option} ${styles.active}`} aria-current="true">
              {label(locale)}
            </span>
          ) : (
            <button
              type="button"
              className={styles.option}
              onClick={() => choose(locale)}
              disabled={busy}
            >
              {label(locale)}
            </button>
          )}
        </Fragment>
      ))}
    </div>
  );
}
