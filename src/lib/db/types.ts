import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from './schema';

/*
 * Type-only, and separate from client.ts on purpose.
 *
 * client.ts starts with `import 'server-only'`, which is what stops a client
 * component from ever pulling the connection string into a browser bundle.
 * Every query module needs the `Db` TYPE and none of them needs the `db`
 * VALUE. Putting the types in a module with no runtime imports means a query
 * module physically cannot acquire the singleton by accident -- there is
 * nothing here to import. Relying on `import type` erasure instead would work,
 * and would break the first time someone drops the word `type`.
 */

export type Db = PostgresJsDatabase<typeof schema>;

/**
 * The handle inside `db.transaction(async (tx) => ...)`.
 *
 * Extracted positionally rather than imported as `PgTransaction<...>`, whose
 * four type parameters have to be spelled out and change between drizzle
 * minors. This follows the real signature automatically.
 */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** What every function in `queries/` accepts. See the plan's W1-11. */
export type DbOrTx = Db | Tx;
