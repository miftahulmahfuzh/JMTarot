import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { requireEnv } from '@/lib/env';
import * as schema from './schema';

/*
 * THE ONLY PLACE THE DRIVER IS NAMED (roadmap D5).
 *
 * Local development against a single Postgres in Docker. When the production
 * host is chosen, exactly three things change and all three are in this file:
 *
 *   1. `max`      -> 1. Each serverless invocation is its own isolate; a pool
 *                    of 10 per isolate multiplied by concurrent invocations
 *                    exhausts Postgres' 100-connection default within seconds.
 *   2. `prepare`  -> false, IF AND ONLY IF the host puts a transaction-mode
 *                    pooler in front (Supabase's :6543, PgBouncer in txn mode).
 *                    Prepared statements do not survive a connection being
 *                    handed to another client mid-session, and the symptom is
 *                    `prepared statement "s1" already exists` under load and
 *                    never in testing. A session-mode pooler, or Neon's HTTP
 *                    driver, needs no such thing.
 *   3. `ssl`      -> 'require' for every managed host.
 *
 * The host is now chosen (roadmap D5): Neon, free tier, Singapore, reached
 * through its POOLED endpoint -- the one whose host contains `-pooler`, which
 * is PgBouncer in transaction mode. All three knobs therefore apply, and they
 * are keyed off `VERCEL` rather than `NODE_ENV`, because a Vercel PREVIEW build
 * is also `NODE_ENV=production` and is also serverless, while a local
 * `npm run build && npm start` is neither.
 *
 * The local Docker path keeps `max: 10` and prepared statements: it is one
 * long-lived process talking straight to Postgres, so both are free wins there
 * and neither is safe here.
 *
 * THE ONE CASE THIS GETS WRONG is pointing a LOCAL process at the pooled Neon
 * URL -- `VERCEL` is unset, `prepare` stays on, and you get `prepared statement
 * "s1" already exists` under concurrency. Use Neon's UNPOOLED string locally,
 * which is what `npm run db:migrate` against production wants anyway.
 */
const serverless = !!process.env.VERCEL;

function createClient() {
  return postgres(requireEnv('DATABASE_URL'), {
    max: serverless ? 1 : 10,
    prepare: !serverless,
    ssl: serverless ? 'require' : undefined,
    connect_timeout: 10,
    onnotice: () => {}, // migrations are noisy and the notices are never news
  });
}

/*
 * Cached on globalThis in development, and this is not a micro-optimisation.
 * `next dev` re-evaluates modules on every HMR pass, so without the cache an
 * afternoon of editing leaks one pool per save until Postgres starts refusing
 * connections -- which surfaces as an unrelated 500 in whatever route you were
 * editing at the time.
 */
const globalForDb = globalThis as unknown as { __jmtarotSql?: ReturnType<typeof createClient> };
const client = globalForDb.__jmtarotSql ?? createClient();
if (process.env.NODE_ENV !== 'production') globalForDb.__jmtarotSql = client;

export const db = drizzle(client, { schema });
