'use client';

import { useState } from 'react';

import { LOCAL_DATE_HEADER, SESSION_HEADER } from '@/lib/analytics/localdate';
import { getSessionId } from '@/lib/analytics/track.client';
import { useT } from '@/lib/i18n/LocaleProvider';
import { formatLocalDate } from '@/lib/i18n/format';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { todayKey } from '@/lib/storage';
import styles from './AccountFacts.module.css';

/**
 * The three facts, editable in place (A10).
 *
 * **THIS IS THE FIRST CALLER `upsertProfileFacts` HAS EVER HAD**, and A10's
 * argument is not convenience: a typo in the full name produces a wrong Expression
 * number FOREVER, which is worse than a regeneration — and the regeneration is
 * automatic, because `personas.input_hash` covers the facts.
 *
 * ── ONE FORM, THREE FIELDS, NOT THREE INLINE EDITORS ─────────────────────────
 *
 * Three independently-editable rows would be three save buttons, three in-flight
 * states and three chances to leave the birth date half-typed. `PATCH
 * /api/account/facts` takes all three because `upsertProfileFacts` writes all three,
 * and a partial PATCH would have to read-modify-write — which is the shape that
 * loses a concurrent edit.
 *
 * ── THE BIRTH DATE IS `type="date"`, AND THE VALUE IS AN ISO STRING ──────────
 *
 * `birth_date` is a `'YYYY-MM-DD'` STRING everywhere in this app and never a `Date`
 * — `## Traps`' rule, because a `Date` renders in the server's zone and is a day out
 * for anyone in Jakarta between midnight and 07:00. `<input type="date">`'s `value`
 * and `valueAsValue` are exactly that string format, so nothing is parsed and
 * nothing is reformatted. **Do not "improve" this into a `Date` round trip.**
 *
 * ── IT DOES NOT `router.refresh()` ON SUCCESS ────────────────────────────────
 *
 * The page's three server-rendered blocks are derived from the READINGS, not from
 * these facts, so nothing above changes when a nickname does. The persona DOES
 * change, in `after()`, and it is fetched by a client component that will pick the
 * new one up on the next visit — which is the honest thing to show, because the
 * model call has not finished by the time this response arrives. A refresh here
 * would re-render the same three blocks and still show the old persona.
 */
export function AccountFacts({
  initial,
}: {
  initial: { fullName: string; nickname: string; birthDate: string };
}) {
  const t = useT();
  const locale = useLocale();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<'network' | 'invalid' | null>(null);
  /** The last SAVED values, so a cancel restores them and a save keeps them. */
  const [facts, setFacts] = useState(initial);
  const [draft, setDraft] = useState(initial);

  function begin() {
    setDraft(facts);
    setFailed(null);
    setOpen(true);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setFailed(null);

    try {
      const res = await fetch('/api/account/facts', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          [SESSION_HEADER]: getSessionId(),
          [LOCAL_DATE_HEADER]: todayKey(),
        },
        body: JSON.stringify(draft),
      });

      if (res.status === 400) {
        /*
         * The server's zod schema is the authority on a plausible birth date, and
         * it carries a rule the browser cannot: one day of slack for a querent whose
         * calendar day is ahead of UTC. So a 400 is reported as "check what you
         * entered" rather than pre-empted here — two validators would be two answers
         * to one question, and the client's would be the weaker.
         */
        setFailed('invalid');
        setSaving(false);
        return;
      }
      if (!res.ok) {
        setFailed('network');
        setSaving(false);
        return;
      }

      setFacts(draft);
      setOpen(false);
      setSaving(false);
    } catch {
      setFailed('network');
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className={styles.rows}>
        <Row label={t('account.facts.nickname')} value={facts.nickname} />
        <Row label={t('account.facts.fullName')} value={facts.fullName} />
        <Row
          label={t('account.facts.birthDate')}
          /* Rendered from the STRING, by `formatLocalDate`, which builds no `Date`.
             The same helper V6 uses for a history row's day. */
          value={formatLocalDate(facts.birthDate, locale, true)}
        />
        <button type="button" className={styles.edit} onClick={begin}>
          {t('account.facts.edit')}
        </button>
      </div>
    );
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('account.facts.nickname')}</span>
        <input
          className={styles.input}
          value={draft.nickname}
          maxLength={40}
          required
          onChange={(e) => setDraft({ ...draft, nickname: e.target.value })}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('account.facts.fullName')}</span>
        <input
          className={styles.input}
          value={draft.fullName}
          maxLength={120}
          required
          onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('account.facts.birthDate')}</span>
        <input
          className={styles.input}
          type="date"
          value={draft.birthDate}
          required
          onChange={(e) => setDraft({ ...draft, birthDate: e.target.value })}
        />
      </label>

      {failed ? (
        <p className={styles.failed} role="alert">
          {failed === 'invalid' ? t('account.facts.invalid') : t('account.facts.failed')}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cancel}
          onClick={() => setOpen(false)}
          disabled={saving}
        >
          {t('account.facts.cancel')}
        </button>
        <button type="submit" className={styles.save} disabled={saving}>
          {saving ? t('account.facts.saving') : t('account.facts.save')}
        </button>
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
    </div>
  );
}
