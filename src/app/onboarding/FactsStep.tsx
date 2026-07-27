'use client';

/**
 * Step 1: the three factual answers, on one screen.
 *
 * THE ONE STEP THAT AWAITS ITS WRITE (L2). The `profiles` row is what everything
 * else hangs off -- `completed_at` lives on it, the nickname is what the reader
 * calls you, and the birth year is a distillation input -- so it is worth one
 * awaited round trip. The six that follow write optimistically, because they are
 * resume markers and the final submit is authoritative.
 *
 * Three fields together rather than three screens, per plan §3's flow and Task
 * 4's "three fields": they are one thought ("who are you"), they are all short,
 * and asking a name on its own screen would be the register this flow is trying
 * to avoid.
 */
import { useState, type FormEvent } from 'react';
import type { Profile } from '@/data/types';
import { useT } from '@/lib/i18n/LocaleProvider';
import styles from './onboarding.module.css';

export type Facts = { fullName: string; nickname: string; birthDate: string };

type Props = {
  /** Pre-filled on resume. Facts ARE sent back to the client, unlike answers:
   *  they are not sensitive and they are editable (L13). */
  profile: Profile | null;
  headingId: string;
  onSubmit: (facts: Facts) => Promise<void>;
};

/**
 * The floor on `birth_date`, and it is NOT an age gate.
 *
 * The minimum age is 18 (reconciliation §7.6), and it is enforced by W2's
 * first-sign-in checkbox and `users.age_confirmed_at`. Deliberately NOT
 * re-derived from the birth date here: two age policies in one codebase drift,
 * and the one in the column someone typed is the weaker of the two anyway. This
 * bound only rejects dates that cannot be a birth date at all.
 */
const MIN_BIRTH_DATE = '1900-01-01';

/** Today, in the DEVICE's timezone -- the same reasoning as `todayKey()`. A UTC
 *  `toISOString()` would let someone in Jakarta pick tomorrow for seven hours a
 *  day. */
function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function FactsStep({ profile, headingId, onSubmit }: Props) {
  const t = useT();
  const [fullName, setFullName] = useState(profile?.fullName ?? '');
  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [birthDate, setBirthDate] = useState(profile?.birthDate ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = fullName.trim() !== '' && nickname.trim() !== '' && birthDate !== '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!filled || saving) return;

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        fullName: fullName.trim(),
        nickname: nickname.trim(),
        birthDate,
      });
    } catch {
      /*
       * NO SILENT FAILURES, and the step stays filled in. Losing three typed
       * fields to a dropped connection, on the one step that cannot be skipped,
       * is how someone abandons onboarding at step 1.
       */
      setError(t('onboarding.error.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.step} onSubmit={submit}>
      <h1 className={styles.title} id={headingId} tabIndex={-1}>
        {t('onboarding.facts.title')}
      </h1>

      <label className={styles.field}>
        <span className={styles.label}>{t('onboarding.facts.fullName.label')}</span>
        <input
          className={styles.input}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          autoCapitalize="words"
          inputMode="text"
          maxLength={120}
          required
        />
        <span className={styles.fieldHint}>{t('onboarding.facts.fullName.hint')}</span>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{t('onboarding.facts.nickname.label')}</span>
        <input
          className={styles.input}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          /*
           * `nickname` is a real autofill token, and it is the right one: it
           * stops Safari offering the full name here, which it does for
           * `given-name` and which would make the two fields identical for most
           * people -- and the nickname is the one the reader says out loud.
           */
          autoComplete="nickname"
          autoCapitalize="words"
          inputMode="text"
          maxLength={40}
          required
        />
        <span className={styles.fieldHint}>{t('onboarding.facts.nickname.hint')}</span>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{t('onboarding.facts.birthDate.label')}</span>
        {/*
          A NATIVE date input, not three selects. Three selects is more code and
          worse on a phone, and the native control gets the locale's own field
          order and its own scroll picker for free. `min`/`max` also give iOS
          something to clamp its wheels to, so an impossible date is not
          reachable by spinning.
        */}
        <input
          className={styles.input}
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          autoComplete="bday"
          min={MIN_BIRTH_DATE}
          max={todayLocal()}
          required
        />
        <span className={styles.fieldHint}>{t('onboarding.facts.birthDate.hint')}</span>
      </label>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className={styles.cta} disabled={!filled || saving}>
        {t('onboarding.actions.next')}
      </button>
    </form>
  );
}
