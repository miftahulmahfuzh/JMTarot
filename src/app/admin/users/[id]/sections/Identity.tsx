/**
 * §4.1 — every column of `users`, plus the soft-delete banner. v0.5.0 / A5.
 *
 * **`google_sub` IS RENDERED IN FULL** and that is deliberate: it is an opaque provider
 * identifier, not a credential, and correlating a row with the Google console is a real
 * operator need. It must never reach `events.props` or a URL (A5-19).
 *
 * **`avatar_url` IS A STRING AND NOT AN IMAGE.** `next/image` refuses a local `src` with a
 * query string, there is no `images` block in `next.config.ts`, and a remote Google avatar is
 * a third-party request from an admin page for no information gain.
 *
 * **THE SOFT-DELETE BANNER SAYS WHAT ERASURE ALREADY DID** (A5-14). V8's `deleteAccount` ran
 * `revokeAllForUser` and `redactForUser` **inside the transaction that set `deleted_at`**, and
 * deliberately did NOT clear the six answers — that would break the thirty-day restore the
 * confirmation copy promises. Without those four sentences every panel below reads as data
 * loss. `restorableUntil` comes from `ERASURE_GRACE_DAYS` and never from a typed 30.
 */
import { ERASURE_GRACE_DAYS } from '@/lib/account/grace';
import type { AdminIdentity } from '@/lib/db/queries/admin/detail';
import { dayWithYear } from '../../../format';
import { DETAIL, U } from '../../copy';
import styles from '../detail.module.css';
import { Badge, Field, Fields, Panel } from './kit';

/** An instant, rendered as one — `created_at` is a real point in time, unlike `local_date`. */
function instant(at: Date | null): string {
  return at === null ? U.empty : at.toISOString().replace('T', ' ').slice(0, 19);
}

export function Identity({ user }: { user: AdminIdentity }) {
  const c = DETAIL.identity;
  return (
    <Panel id="identitas" heading={c.heading}>
      {user.deletedAt ? <DeletedBanner deletedAt={user.deletedAt} /> : null}
      <Fields>
        <Field label={c.id} value={<code className={styles.code}>{user.id}</code>} />
        <Field label={c.googleSub} value={<code className={styles.code}>{user.googleSub}</code>} />
        <Field label={c.email} value={user.email} />
        <Field label={c.emailVerified} value={user.emailVerified ? U.yes : U.no} />
        <Field label={c.displayName} value={user.displayName ?? U.empty} />
        <Field
          label={c.avatarUrl}
          value={
            user.avatarUrl ? (
              <code className={styles.codeWrap}>{user.avatarUrl}</code>
            ) : (
              U.empty
            )
          }
        />
        <Field label={c.locale} value={user.locale} />
        <Field label={c.localeSource} value={user.localeSource} />
        <Field label={c.createdAt} value={instant(user.createdAt)} />
        <Field label={c.lastSeenAt} value={instant(user.lastSeenAt)} />
        <Field label={c.termsAcceptedAt} value={instant(user.termsAcceptedAt)} />
        <Field label={c.termsVersion} value={user.termsVersion ?? U.empty} />
        <Field label={c.ageConfirmedAt} value={instant(user.ageConfirmedAt)} />
      </Fields>
      <p className={styles.note}>{c.localeSourceNote}</p>
      <p className={styles.note}>{c.avatarNote}</p>
    </Panel>
  );
}

function DeletedBanner({ deletedAt }: { deletedAt: Date }) {
  const c = DETAIL.deleted;
  const until = new Date(deletedAt.getTime() + ERASURE_GRACE_DAYS * 86_400_000);
  return (
    <div className={styles.banner}>
      <p className={styles.bannerHeading}>
        <Badge tone="warn">{c.heading}</Badge>
      </p>
      <p className={styles.bannerLine}>{c.at(instant(deletedAt))}</p>
      <p className={styles.bannerLine}>{c.restorable(dayWithYear(until.toISOString().slice(0, 10)))}</p>
      <ul className={styles.bannerList}>
        {c.what.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
