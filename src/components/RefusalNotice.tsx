'use client';

import Link from 'next/link';
import { useLocale, useT } from '@/lib/i18n/LocaleProvider';
import { crisisResources } from '@/lib/moderation/resources';
import { clauseAnchor, type RefusalPayload } from '@/lib/moderation/types';
import styles from './RefusalNotice.module.css';

/**
 * What a refused question renders as.
 *
 * **THE APP SPEAKS HERE, NEVER A READER** (W7-D9). No Thessaly, no Margaret, no
 * Adrian, no oracular register, no card imagery. A refusal delivered in a
 * reader's voice is grotesque, and for self-harm it is worse than grotesque.
 * That is why this is its own component rather than another `status` branch
 * inside `ReadingPanel`'s prose slot: the two are visually adjacent and must
 * never be mistaken for each other.
 *
 * **IT IMPORTS `moderation/types` AND `moderation/resources`, AND NOTHING ELSE
 * FROM THAT DIRECTORY.** Those two are the deliberate `server-only` exceptions
 * (W7-D14): a category name is not a secret and a hotline number is public
 * information. `blocklist.ts`, `classify.ts` and `gate.ts` are fenced, and
 * `clientBoundary.test.ts` enforces it.
 *
 * Built from existing tokens only -- `--fs-reading`, `--fs-eyebrow`, `--gold`,
 * `--gold-hairline`. No new hex values, sizes or curves.
 *
 * ── `onDismiss` IS OPTIONAL, AND THE ABSENCE IS THE DEFAULT ────────────────
 *
 * Reported 2026-08-09 against the group chat: *"it just wont disappear"*. The
 * two mounts are not the same situation. On the draw screen the refusal
 * REPLACES `ReadingPanel`'s prose slot, so closing it would leave a blank
 * panel with nothing to say; in the chat room it sits above the composer, over
 * a room the querent goes on using, and it outlived the message that caused
 * it. So the control arrives as a prop from the caller that wants it, and
 * `ReadingPanel` is untouched.
 *
 * **DISMISSING IS NOT REMEMBERING.** The room clears its `refusal` state and
 * nothing is stored, so the next refused message renders this again. That is
 * the requested behaviour and it is also the safe one: a suppressed refusal
 * would leave a querent with no explanation of why their message vanished.
 *
 * **THE BUTTON IS THE LAST CHILD IN BOTH BRANCHES.** W7-D10 orders this block
 * *resources first, refusal second, the clause link last and small*, and that
 * ordering is a decision about what somebody in crisis meets first. A close
 * button written above the lead is the first thing a screen reader announces.
 * CSS puts it in the top-right corner; the DOM keeps the lead in front.
 * `RefusalNotice.test.ts` asserts both halves.
 */
export function RefusalNotice({
  payload,
  onDismiss,
}: {
  payload: RefusalPayload;
  onDismiss?: () => void;
}) {
  const t = useT();
  const locale = useLocale();

  /* The modifier, not `:has()`: nothing in this repo's stylesheets uses that
     selector yet, and the only thing it would buy here is one less class. It
     carries `position: relative` and the room the glyph needs, so the mount
     WITHOUT a dismiss keeps the layout it shipped with. */
  const sectionClass = onDismiss ? `${styles.refusal} ${styles.dismissible}` : styles.refusal;

  const dismiss = onDismiss ? (
    <button
      type="button"
      className={styles.dismiss}
      aria-label={t('moderation.blocked.dismiss')}
      onClick={onDismiss}
    >
      ×
    </button>
  ) : null;

  const termsHref = `/terms#${clauseAnchor(payload.clause)}`;
  const termsLink = (
    <Link className={styles.link} href={termsHref}>
      {t('common.terms')}
    </Link>
  );

  /*
   * **RESOURCES FIRST, REFUSAL SECOND, THE CLAUSE LINK LAST AND SMALL**
   * (W7-D10). Every element Miftah asked for is present -- the app says it
   * cannot read the cards, and it links the Terms -- and the ORDER is the
   * product decision: you do not open with a policy citation to a person
   * describing suicidal ideation.
   */
  if (payload.showCrisisResources) {
    const resources = crisisResources(locale);

    return (
      <section className={sectionClass} aria-live="polite">
        <p className={styles.lead}>{t('moderation.blocked.selfHarm.lead')}</p>

        {/*
         * An empty list is a CORRECT state, not a bug -- `resources.ts` enters
         * nothing it has not verified against a live page. When it is empty the
         * emergency line below still renders, and that line names no digits, so
         * it is true in every jurisdiction and invents nothing.
         */}
        {resources.length > 0 ? (
          <>
            <h2 className={styles.resourcesLabel}>
              {t('moderation.blocked.selfHarm.resourcesLabel')}
            </h2>
            <ul className={styles.resources}>
              {resources.map((r) => (
                <li key={r.id} className={styles.resource}>
                  <span className={styles.resourceLabel}>{r.label[locale]}</span>{' '}
                  {r.href ? (
                    <a className={styles.link} href={r.href} target="_blank" rel="noreferrer">
                      {r.value}
                    </a>
                  ) : (
                    <span className={styles.resourceValue}>{r.value}</span>
                  )}
                  {r.note ? <span className={styles.note}>{r.note[locale]}</span> : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <p className={styles.emergency}>{t('moderation.blocked.selfHarm.emergency')}</p>

        <p className={styles.closing}>
          {t('moderation.blocked.selfHarm.closing')} {termsLink}.
        </p>

        {dismiss}
      </section>
    );
  }

  return (
    <section className={sectionClass} aria-live="polite">
      <p className={styles.title}>{t('moderation.blocked.generic.title')}</p>
      <p className={styles.body}>
        {t('moderation.blocked.generic.lead')} {termsLink}.{' '}
        {t('moderation.blocked.generic.tail')}
      </p>

      {dismiss}
    </section>
  );
}
