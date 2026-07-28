/**
 * Apply committed migrations as part of a Vercel build. Runs BEFORE `next build`.
 *
 * ── WHY THIS EXISTS: A COMMITTED MIGRATION SAT UNAPPLIED AND TOOK SIGN-IN OUT ─
 *
 * Nothing in this repository ever ran migrations against production. `npm run
 * build` was `next build && audit:secrets`, and `db:migrate` was a command a
 * human remembered. On 2026-07-28 `0001_v2-translations-and-locale-source` --
 * committed 2026-07-27, applied locally, never applied to Neon -- produced this
 * in production, on every single sign-in:
 *
 *     column "locale_source" of relation "users" does not exist   (SQLSTATE 42703)
 *
 * `upsertUserOnSignIn` threw, `auth.ts`'s catch returned `null`, no session
 * cookie was minted, and the gate bounced the querent back to `/login`. Google's
 * consent screen succeeded every time, so the OAuth round trip looked perfect and
 * the app was simply impossible to sign in to. `POST /api/locale` was dead the
 * same way and for the same column, because `setUserLocale` writes
 * `locale_source` too -- ONE unapplied migration, TWO unrelated-looking bugs.
 *
 * The class of failure is what matters more than the instance: **code and schema
 * ship on different rails, so they drift, and the drift is silent until a user
 * hits the exact column.** A deploy that carries the code has to carry the schema.
 *
 * ── WHY IT FAILS THE BUILD WHEN IT CANNOT RUN ────────────────────────────────
 *
 * Same defaulting argument as `ANALYTICS_ENABLED` in CLAUDE.md: a typo must not
 * silently disable the thing. If this skipped quietly when
 * `MIGRATE_DATABASE_URL` were missing, forgetting to set it in the dashboard
 * would restore exactly the failure above -- and it would look like a healthy
 * green deploy. A red build is recoverable in a minute; a green build over a
 * drifted schema is the outage this file was written for.
 *
 * ── WHY IT IS SAFE TO RUN ON EVERY BUILD ─────────────────────────────────────
 *
 * `migrate()` is idempotent: drizzle records what it has applied in
 * `drizzle.__drizzle_migrations` and tops up only what is missing, so a redeploy
 * with no new migration is one SELECT. See `db-migrate.ts`.
 *
 * KNOWN LIMIT, WRITTEN DOWN RATHER THAN SOLVED: two builds finishing at once
 * could both try to apply the same migration. Drizzle takes no advisory lock.
 * For a one-developer project that is not worth a lock table; if this ever
 * becomes a team, wrap the call in `pg_advisory_lock`.
 *
 * No top-level await -- there is no `"type": "module"`, so tsx emits CJS. Same
 * shape as every other script here.
 */
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

config({ path: '.env.local', quiet: true });

/**
 * Is this a Vercel build?
 *
 * `VERCEL` and not `NODE_ENV`, exactly as `db/client.ts` argues: a preview build
 * is also `NODE_ENV=production`, so NODE_ENV cannot tell the two environments
 * apart and `VERCEL` can.
 */
const onVercel = process.env.VERCEL === '1';

async function main() {
  /*
   * A LOCAL `npm run build` MUST NOT TOUCH A DATABASE. It is run to check that
   * TypeScript and the secrets audit pass, often with Docker stopped, and making
   * it require Postgres would break the one command CLAUDE.md says never to skip.
   */
  if (!onVercel) {
    console.log('[migrate:deploy] not a Vercel build; skipping (run `npm run db:migrate`)');
    return;
  }

  const url = process.env.MIGRATE_DATABASE_URL;
  if (!url) {
    throw new Error(
      'MIGRATE_DATABASE_URL is not set.\n\n' +
        'This build would deploy code against a schema nobody has migrated, which is\n' +
        'how sign-in broke on 2026-07-28 (SQLSTATE 42703 on users.locale_source).\n\n' +
        'Set it in the Vercel dashboard for Production AND Preview to Neon’s DIRECT\n' +
        'connection string -- the one WITHOUT `-pooler` in the host. DATABASE_URL stays\n' +
        'the pooled string; see scripts/db-migrate.ts and docs/DEPLOY-VERCEL.md §6.',
    );
  }

  if (/-pooler\./.test(url)) {
    throw new Error(
      'MIGRATE_DATABASE_URL is the POOLED string (-pooler in the host).\n' +
        'Migrations need the DIRECT one; pgbouncer in transaction mode does not\n' +
        'reliably carry a migration’s session state. Drop `-pooler` from the host.',
    );
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder: './src/lib/db/migrations' });
    console.log('[migrate:deploy] schema is up to date');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  /*
   * The MESSAGE only, never the error object, and for the reason
   * `logSignInFailure` in `src/lib/auth/auth.ts` now spells out: a postgres
   * error quotes its bound parameters. A migration binds no user data, so this
   * is habit rather than necessity -- but the habit is what was missing on the
   * sign-in path, and build logs are readable by anyone with repository access.
   */
  console.error(`\n[migrate:deploy] FAILED\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
