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
 * They are not set now because (2) is a property of the pooler and not of
 * "serverless", so guessing it costs local performance to satisfy a host
 * nobody has picked. Nothing outside this file needs to change either way.
 */
const POOL_MAX = 10;

function createClient() {
  return postgres(requireEnv('DATABASE_URL'), {
    max: POOL_MAX,
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
