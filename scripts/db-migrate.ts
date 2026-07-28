/**
 * Apply every committed migration to DATABASE_URL.
 *
 * Idempotent: drizzle records what it has run in `drizzle.__drizzle_migrations`
 * and tops up whatever is missing, so running this twice is a no-op.
 *
 * Wrapped in main() rather than using top-level await, because this project
 * has no `"type": "module"` and tsx therefore transforms to CJS, where
 * top-level await is a build error. Same shape as scripts/smoke-llm.ts.
 */
import { config } from 'dotenv';
import { sql as drizzleSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Not Next, so nothing loads .env.local for us. See drizzle.config.ts.
config({ path: '.env.local', quiet: true });

/**
 * Which connection string to migrate over, and why there are two.
 *
 * **`MIGRATE_DATABASE_URL` WINS, AND ON VERCEL IT IS THE ONLY CORRECT VALUE.**
 * Neon hands out two strings and CLAUDE.md's `## Environment` states the rule:
 * the **pooled** one (`-pooler` in the host) is for Vercel's runtime only, and
 * migrations, `db:studio` and `pg_dump` take the **direct** one. `DATABASE_URL`
 * in the Vercel dashboard is therefore the pooled string -- correct for the app
 * and wrong for DDL, because pgbouncer in transaction mode does not reliably
 * carry a migration's session state.
 *
 * So a deploy-time migration cannot simply reuse `DATABASE_URL`. It needs the
 * direct string under its own name, which is also what makes the two roles
 * legible in the dashboard instead of one variable meaning different things
 * depending on who reads it.
 *
 * Locally they are the same value and `.env.local` sets only `DATABASE_URL`, so
 * the fallback keeps `npm run db:migrate` a one-word command on a laptop.
 */
function migrationUrl(): string {
  const direct = process.env.MIGRATE_DATABASE_URL;
  if (direct) return direct;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local.');

  /*
   * A LOUD WARNING RATHER THAN A REFUSAL. Pooled DDL usually works and this
   * script is also how somebody fixes a production drift by hand at 2am; hard
   * failing there would be the tool getting in the way. But migrating over
   * pgbouncer is never what anybody MEANT to do, so it may not be silent.
   */
  if (/-pooler\./.test(url)) {
    console.warn(
      'WARNING: DATABASE_URL looks POOLED (-pooler in the host). Migrations want the\n' +
        '         DIRECT Neon string -- set MIGRATE_DATABASE_URL. Continuing anyway.',
    );
  }
  return url;
}

async function main() {
  const url = migrationUrl();

  // A dedicated single connection, not the app's pool: migrations run DDL and
  // must not share a pooled connection with anything else.
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(sql);

  try {
    await migrate(db, { migrationsFolder: './src/lib/db/migrations' });
    const rows = await db.execute<{ count: string }>(
      drizzleSql`select count(*)::text as count from information_schema.tables
                  where table_schema = 'public'`,
    );
    console.log(`migrations applied (${rows[0].count} tables in public)`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('\nmigration failed:', err);
  process.exit(1);
});
