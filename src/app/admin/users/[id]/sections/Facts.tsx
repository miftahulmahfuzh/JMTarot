/**
 * §4.2 — `profiles`. v0.5.0 / A5.
 *
 * **`completed_at IS NULL` RENDERS "rite belum selesai" AND NEVER A BLANK.** Row presence is
 * not completion — the facts row exists from step 1 of 9 — and a blank here would read as a
 * missing name.
 *
 * **`birth_date` IS A STRING AND IS RENDERED AS ONE** (A5-15). Parsing it into a `Date` to
 * format it renders in the server's zone and is a day out for anyone in Jakarta between
 * midnight and 07:00; the column is the querent's own calendar day.
 */
import type { Profile } from '@/lib/db/schema';
import { DETAIL } from '../../copy';
import { Empty, Field, Fields, Panel } from './kit';

export function Facts({ profile }: { profile: Profile | null }) {
  const c = DETAIL.facts;
  if (!profile) {
    return (
      <Panel id="data-diri" heading={c.heading}>
        <Empty>{c.noRow}</Empty>
      </Panel>
    );
  }
  return (
    <Panel id="data-diri" heading={c.heading}>
      <Fields>
        <Field label={c.fullName} value={profile.fullName} />
        <Field label={c.nickname} value={profile.nickname} />
        {/* A STRING, straight through. */}
        <Field label={c.birthDate} value={profile.birthDate} />
        <Field label={c.onboardingVersion} value={String(profile.onboardingVersion)} />
        <Field
          label={c.completedAt}
          value={
            profile.completedAt === null
              ? c.incomplete
              : profile.completedAt.toISOString().replace('T', ' ').slice(0, 19)
          }
        />
        <Field
          label={c.updatedAt}
          value={profile.updatedAt.toISOString().replace('T', ' ').slice(0, 19)}
        />
      </Fields>
    </Panel>
  );
}
