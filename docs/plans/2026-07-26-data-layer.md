# W1 — Data Layer & Schema — Implementation Plan

> **RECONCILED 2026-07-26. `docs/plans/2026-07-26-RECONCILIATION.md` outranks
> this file.** Read its §0 first: two live bugs in `src/lib/prompt/sanitize.ts`
> land on `main` before W1 starts.
>
> Resolutions that change this plan:
> - **R6** — `lotus_avatars.summary_id`/`summary_en` become **one `summary jsonb`**
>   column, `{"id": …, "en": …}`. Your rename proposal was right about the bug and
>   `body_id` did not fix it, since it still ends in `_id`.
> - **R2** — your required-AAD `encryptField(plaintext, aad)` **wins** over W3's
>   one-argument assumption. W3 updates its call sites, not you.
> - **R4** — you own `src/data/types.ts`, and `Locale` is defined there. W6
>   re-exports it, so `@/lib/db/**` never imports `@/lib/i18n/**`.
> - **R15** — encrypt `moderation_flags.question` as you recommended, **and**
>   keep W7's 30-day redaction. Not alternatives. AAD `moderation_flags:<user_id ?? 'anon'>`.
> - **R7** — failed and aborted readings **do** count toward the frequency
>   verdict; `blocked` readings write no `reading_cards` rows at all, so the
>   single-table scan survives with no extra column.
> - **R23** — leave the partial unique index on `google_sub` un-added. W2 refuses
>   soft-deleted accounts rather than resurrecting them, pending Miftah's call.
> - **R20** — `withTestDb` sets `ANALYTICS_ENABLED=1` explicitly rather than
>   inheriting W4's CI default of `0`.
> - Your open questions 1 (JWT carries `users.id`) and 5 (the two dev users
>   survive) are **confirmed** by W2. Question 6 (`check card_id`) — your
>   position stands, skip it.
> - **§3 of the reconciliation is the full folded delta set** across all seven
>   plans. It is what goes in `schema.ts` and the first migration.

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers-extended-cc:executing-plans` to implement this plan task-by-task.

**Workstream:** W1 of seven. See `PUBLIC_RELEASE_ROADMAP.md` §9.
**Owns:** `src/lib/db/**`, every migration, the physical realisation of roadmap §3.
**Depends on:** nothing. This is the foundation; the other six import from it.
**Blocks:** W2, W3, W4, W5, W6, W7 — all of them.

**Goal:** turn roadmap §3 from a fenced code block into a Postgres database, a
typed Drizzle schema, a committed migration, a field-encryption primitive, an
integration-test harness that did not exist before, and a seed that produces
realistic data for W5 to build against.

**Read `PUBLIC_RELEASE_ROADMAP.md` first.** §3 is canonical and this plan does
not redefine a single table in it. Where this plan wants something §3 does not
have, it is in `## Schema deltas` below and nowhere else.

---

## 1. Why this workstream is first, and what "first" costs

Six plans are being written in parallel against a schema that does not exist.
The roadmap fixed the *names* so that seven agents would not invent `user_id`,
`userId` and `uid`; this plan fixes the *types*, the nullability, the defaults,
the foreign-key actions and the indexes, because those are the next layer down
where the same divergence happens more quietly. A plan that assumes
`readings.local_date` arrives as a `Date` and a plan that assumes it arrives as
`'2026-07-26'` both compile. Only one of them is right, and the roadmap's §7
trap says which.

So the deliverable here is not "a database". It is a set of exported types and
signatures precise enough that the other six plans can be written against them
without ever opening a psql prompt. The `## Interfaces I export` section below
is the actual product. Everything else is how it gets built.

The second thing this workstream buys is stated in roadmap §9: **the database
makes integration tests possible for the first time.** Every test in this repo
today is a pure function against a pure function. There has never been a test
that could catch "the query is correct but the transaction is not", because
there were no queries and no transactions. Task 6 builds the harness, and the
constraint it must respect is that `npm test` stays as fast and as
dependency-free as it is today — a database that makes the existing suite
require Docker to run would be a net loss.

### What this plan deliberately does not do

- **No production database.** Roadmap D5 defers it. The whole shape of
  `client.ts` is built so that D5 is a diff inside one options object; see §4.4
  for exactly which three knobs move and why guessing them now produces wrong
  values.
- **No data migration.** There is nothing to migrate. Two users' profiles live
  in two browsers' `localStorage`, and after W3 they will re-enter a name and a
  birth date through onboarding — which asks for more than `localStorage` ever
  held anyway. The tables start empty. Say this out loud when someone asks
  where the old profiles went.
- **No queries with real bodies.** The consuming workstreams specify what they
  need to read. W1 owns the *shape* of a query module (§4.6) and ships four
  files with the signatures W2/W4/W5 will fill in, so that six plans can import
  a path that exists.
- **No `drizzle-kit push`, ever.** See Task 3, step 5.

---

## 2. Decisions

Each was a real fork. Recorded so the next session does not relitigate them.

| # | Decision | Choice | Why |
|---|---|---|---|
| W1-1 | Local Postgres | **Docker, `postgres:16-alpine`, host port 5432** | Probed on this machine: Ubuntu 24.04 already has `postgresql-16` installed and running — **on port 5433, with no `miftah` role, and `pg_hba.conf` readable only by root.** Creating a role there needs an interactive `sudo` password. Docker needs none: `miftah` is already in the `docker` group and `docker ps` works unprivileged. Port 5432 is free. See §3. |
| W1-2 | Postgres major version | **16** | Matches the `psql`/`pg_dump` 16.11 already on PATH, so client and server never disagree. `gen_random_uuid()` is core in PG13+, verified working on 16 with no extension — §3's `default gen_random_uuid()` needs no `CREATE EXTENSION pgcrypto`. |
| W1-3 | Driver | **`postgres` (postgres.js) 3.4.x via `drizzle-orm/postgres-js`** | Types ship in the package, so there is no `@types/pg` to drift out of step — this repo already carries four `@types/*` packages and does not need a fifth. No optional native `pg-native` path, so nothing compiles in WSL and nothing is skipped on a Vercel build. Its four serverless knobs (`max`, `idle_timeout`, `connect_timeout`, `prepare`) are one options object, which makes D5 a diff inside a literal rather than a different library. |
| W1-4 | Pooling now | **One lazily-created client, `max: 10`, cached on `globalThis`** | A long-lived `next dev` server wants a real pool. The `globalThis` cache is not a nicety: Next's HMR re-evaluates modules on every save, and without it a morning of editing leaks a pool per reload until Postgres refuses connections. |
| W1-5 | Pooling later | **Deferred with the knobs named, not guessed** | `max` and `prepare` are determined by the *pooler*, not by "is this serverless". A transaction-mode pooler (Supabase `:6543`, PgBouncer) requires `prepare: false` or you get `prepared statement "s1" already exists`; a session-mode pooler or Neon's HTTP driver does not. Setting `prepare: false` now would cost measurable local performance to satisfy a host nobody has picked. §4.4 writes the three-line change as a comment in the file. |
| W1-6 | Enum columns | **`text` narrowed with Drizzle's `.$type<...>()`, never `pgEnum`** | `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction that adds it, which makes adding a locale or a reader a two-migration dance. `text` + `$type` gives identical compile-time safety at zero migration cost, and W6 will add locales. |
| W1-7 | `date` columns | **`mode: 'string'`, always** | Roadmap §7 is emphatic that `local_date` is the *querent's* calendar day and must never be recomputed from `created_at`. A `Date` object invites exactly that recomputation, because it prints in the server's zone. `mode: 'string'` means the column round-trips as `'2026-07-26'` and there is no timezone to get wrong. Verified: the value comes back as a `string`. |
| W1-8 | Field encryption | **AES-256-GCM, self-describing `v1.<iv>.<ct>.<tag>` in base64url, AAD-bound to the row** | GCM gives confidentiality *and* integrity in one pass. The value carries its own IV and tag so nothing else in the schema has to. base64url has no `+`, `/`, `=` or `$`, so the ciphertext is safe in a log, a URL and a `.env` file. Binding the AAD to `user_id:question_key` means a ciphertext copied between rows fails to decrypt rather than silently impersonating another answer. |
| W1-9 | Decrypt failure | **Returns `null`, logs, never throws** | Roadmap §8 makes this data skippable and the app must work without it. A rotated or missing key must degrade every answer to "not provided" — the same code path as `skipped` — not 500 the onboarding page. Encryption is the opposite: it throws, because the alternative is silently writing plaintext into the column the privacy policy promises is encrypted. |
| W1-10 | Test isolation | **Transaction-per-test with a forced rollback; `TRUNCATE` as the escape hatch** | Verified working. It is ~100× faster than truncating nine tables per test and it composes for free with W1-11, because a `tx` handle satisfies the same parameter every query takes. Code that opens and commits its own transaction cannot be tested this way; `resetDb()` exists for those. |
| W1-11 | Query module shape | **Every exported function takes the `db` handle as its first argument** | This one rule is what makes W1-10 possible, keeps `src/lib/db/queries/**` free of module-level side effects, and lets a caller pass a transaction so an `after()` write of `readings` + `reading_cards` is atomic. A query module that imports the singleton cannot be tested and cannot participate in a transaction. |
| W1-12 | Vitest layout | **Two named `projects` in one config; `npm test` runs only `unit`** | Vitest 4.1.10 is installed and supports `projects` with `extends: true`, verified. `npm test` keeps its current meaning — fast, no Docker, no network — and `npm run test:integration` is the opt-in. Anyone who breaks that has made the default loop worse for everyone. |
| W1-13 | Seed data | **Deterministic, from a seeded PRNG, with a rigged card distribution** | Roadmap §5's first feature is "top two cards over a window". Against `Math.random()` that can only be asserted loosely. A fixed seed and a deliberate bias toward Strength and The Hanged Man make the expected answer exact — and it happens to be the pair in the roadmap's own worked example sentence. |
| W1-14 | The two hardcoded users | **They become real `users` rows with `google_sub = 'dev:<username>'`, created by the seed and never by a migration** | See `## The two hardcoded users` below. |

---

## 3. The machine, as probed — not as assumed

Everything below was checked on this WSL2 image on 2026-07-26, because
"assume nothing about what is installed" was the instruction and because two of
the findings change the commands.

| Thing | State | Consequence |
|---|---|---|
| `psql` | `/usr/bin/psql`, PostgreSQL 16.11 | Available for verification without Docker exec. Pin the server to 16 so they match. |
| Native `postgresql-16` | **Installed and running, cluster `16/main`, port `5433`, listening on `127.0.0.1` only** | Not port 5432. Do not assume the default. |
| A `miftah` Postgres role | **Does not exist** | `psql -p 5433` fails with `role "miftah" does not exist`. Creating one needs `sudo -u postgres`. |
| `sudo` | **Requires a password** (`sudo -n true` fails) | An agent cannot bring the native cluster up unattended. Miftah can, but it is an interactive step in an otherwise scriptable plan. |
| `docker` | 28.4.0, daemon running, **`miftah` is in the `docker` group** | Unprivileged `docker run` works. Verified. |
| `docker compose` | v2.39.4 (plugin) | `docker compose up -d` works. `docker-compose` (the v1 binary) is **not** installed — do not write it with a hyphen. |
| Port 5432 | **Free** | Safe to bind. |
| Port 3000 | **Taken by a Grafana container** from another project | This is why `CLAUDE.md` says "3001 if 3000 is taken". It is not intermittent; it is a permanently running container. W2 needs to know: `AUTH_URL` will be `http://localhost:3001`. |
| systemd | Enabled (`/etc/wsl.conf` has `systemd=true`) | Containers survive a WSL restart if given `restart: unless-stopped`. |
| `postgres:16-alpine` | **Pulled and cached** during this plan's verification | Task 1 will not need to download 294MB. |
| Node | default `v20.11.1`; `~/tools/node-v24.18.0-linux-x64/bin/node` is `v24.18.0` | Unchanged from `CLAUDE.md`. Prepend to PATH for every npm/npx call in this document. |

### Why Docker and not the native cluster

The native cluster is *there*, which is the entire argument for it, and it is
not a good enough one:

1. Using it needs an interactive `sudo` password to create a role and a
   database. That turns Task 1 from a script into a conversation, and it
   silently blocks any future automated setup.
2. It is on 5433 and its `pg_hba.conf` is root-only, so the auth method for TCP
   connections cannot even be inspected without sudo, let alone changed.
3. It is shared. Something already installed it — a `jmtarot` database in
   someone else's cluster is a database that survives `docker rm` and gets
   forgotten.
4. Docker pins the version. `postgres:16-alpine` is the same server every time
   and on any machine Jodith might use, which the apt package is not.

The cost is that `npm run db:up` must run before `npm run dev`. That is one
command and it is in the README. Take it.

**If Docker ever stops being available**, the native cluster is the fallback and
these are the commands, run once, interactively:

```sh
sudo -u postgres psql -p 5433 -c "CREATE ROLE jmtarot LOGIN PASSWORD 'jmtarot'"
sudo -u postgres psql -p 5433 -c "CREATE DATABASE jmtarot OWNER jmtarot"
sudo -u postgres psql -p 5433 -c "CREATE DATABASE jmtarot_test OWNER jmtarot"
```

then point `DATABASE_URL` at `127.0.0.1:5433`. Nothing else in this plan
changes, which is the point of keeping the driver in one file.

---

## 4. Design

### 4.1 Module map

Roadmap §4 fixes four paths under `src/lib/db/`. This plan adds three more; they
are additions to the map, not changes to it, and they are listed here so
reconciliation can fold them into roadmap §4.

```
src/lib/db/
  client.ts          the postgres.js client + Drizzle instance. `server-only`.
                     THE ONLY PLACE THE DRIVER IS NAMED.          [roadmap §4]
  types.ts           Db / Tx / DbOrTx. Type-only. No `server-only`.      [NEW]
  schema.ts          the nine tables of roadmap §3                [roadmap §4]
  crypto.ts          AES-256-GCM field encryption (§8/D11)               [NEW]
  queries/
    profile.ts       users + profiles + onboarding_answers + lotus       [roadmap §4]
    history.ts       readings + reading_cards, reads and writes    [roadmap §4]
    frequency.ts     the group-by that powers the card verdict     [roadmap §4]
    summary.ts       daily_summaries read-through cache            [roadmap §4]
  migrations/        generated by drizzle-kit, committed           [roadmap §4]
  testing/
    harness.ts       test db handle, withRollback, resetDb                [NEW]
    globalSetup.ts   applies migrations once per integration run          [NEW]

drizzle.config.ts    repo root, the drizzle-kit entry point               [NEW]
docker-compose.yml   repo root, local Postgres                            [NEW]
scripts/db-migrate.ts                                                     [NEW]
scripts/db-seed.ts                                                        [NEW]
```

**Why `types.ts` exists separately from `client.ts`.** `client.ts` starts with
`import 'server-only'`, which is what stops a client component from ever pulling
the connection string into a browser bundle. Every query module needs the `Db`
*type* and none of them needs the `db` *value*. Putting the types in their own
module with no runtime imports means a query module physically cannot acquire
the singleton by accident — there is nothing to import. Relying on
`import type` erasure instead would work, and would break the first time
someone drops the word `type`.

### 4.2 The two dangerous names in §3

Neither is a schema delta. Both are things the implementer will trip over.

**`lotus_avatars.summary_id` is not a foreign key.** §3 states the convention
"foreign keys are `<singular>_id`" and then, twenty lines later, names a column
`summary_id` that holds *the Indonesian summary text*. It pairs with
`summary_en`, so the `_id` is the ISO 639-1 code for Indonesian. Anyone skimming
the schema will read it as a uuid reference and either "fix" it or write a join
against it. Put a comment on the column. `## Open questions for
reconciliation` proposes a rename.

**`reading_cards.position`** is a non-reserved SQL keyword (`POSITION(x IN y)`).
Postgres accepts it as a column name and Drizzle quotes all identifiers, so it
works — verified in the generated DDL. It only matters if someone hand-writes
SQL without quotes.

### 4.3 Column conventions, made structural

Two helpers at the top of `schema.ts`, so the two conventions that matter most
are enforced by construction rather than by remembering:

```ts
/** Every timestamp in this schema. timestamptz, UTC, never a bare `timestamp`. */
const tsCol = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * Every DATE in this schema, as a `'YYYY-MM-DD'` string -- never a Date.
 *
 * Roadmap §7: `local_date` is the QUERENT'S calendar day, sent by the client,
 * and it must never be recomputed from `created_at`. A JS Date invites exactly
 * that, because it renders in the server's zone and looks plausible while being
 * a day out for anyone in Jakarta between midnight and 07:00. A string cannot
 * be accidentally re-derived.
 */
const dateCol = (name: string) => date(name, { mode: 'string' });
```

### 4.4 `client.ts` and the D5 escape hatch

```ts
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
```

And `types.ts`:

```ts
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;

/**
 * The handle inside `db.transaction(async (tx) => ...)`.
 *
 * Extracted positionally rather than imported as `PgTransaction<...>`, whose
 * four type parameters have to be spelled out and change between drizzle
 * minors. This follows the real signature automatically.
 */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** What every function in `queries/` accepts. See W1-11. */
export type DbOrTx = Db | Tx;
```

### 4.5 `crypto.ts`

Stored format, and it carries everything needed to decrypt itself except the key:

```
v1.<base64url iv, 12 bytes>.<base64url ciphertext>.<base64url tag, 16 bytes>
```

A 7-character answer produces a 53-character value; overhead is a flat ~60
characters. Verified end to end, including that a wrong AAD is rejected.

Four reasons for this shape over a single opaque blob:

1. **`v1.` is greppable.** `select answer_text from onboarding_answers where answer_text not like 'v1.%'` is the audit query for "is this column actually encrypted", and it can be run by someone who has never read this file.
2. **base64url has no `+`, `/`, `=` or `$`.** Safe in a log line, a URL, a JSON body and a `.env` file with no quoting and no escaping.
3. **The version prefix is the rotation seam.** `v2` with a new key or a new cipher can be read alongside `v1` without a backfill.
4. **The IV travels with the ciphertext**, so nothing else in the schema — no extra column, no side table — has to know GCM exists.

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { requireEnv } from '@/lib/env';

const VERSION = 'v1';
const IV_BYTES = 12;  // 96-bit nonce: the size GCM is specified for

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  // Buffer's base64 decoder accepts the URL-safe alphabet too, so a key
  // generated as either base64 or base64url works. Verified.
  const raw = Buffer.from(requireEnv('FIELD_ENCRYPTION_KEY'), 'base64');
  if (raw.length !== 32) {
    throw new Error(`FIELD_ENCRYPTION_KEY must decode to 32 bytes, got ${raw.length}`);
  }
  cachedKey = raw;
  return raw;
}

/**
 * The AAD for an onboarding answer.
 *
 * Exported so W3 cannot invent its own format: the AAD is part of the
 * ciphertext's identity, and two callers disagreeing about it is indis-
 * tinguishable from data loss. Binding it to the row means a ciphertext
 * copied from one user's row into another's fails to decrypt instead of
 * quietly reading as that user's answer.
 */
export function answerAad(userId: string, questionKey: string): string {
  return `onboarding_answers:${userId}:${questionKey}`;
}

/** Throws if the key is missing or malformed. It must never fall back to plaintext. */
export function encryptField(plaintext: string, aad: string): string { /* ... */ }

/**
 * Never throws. Returns null on a missing key, a wrong key, a wrong AAD, a
 * truncated value, a tampered tag, or a version this build does not know.
 *
 * Roadmap §8 makes every free-text answer skippable and requires the app to
 * work without it, so an undecryptable answer takes the same path as a skipped
 * one. The failure is logged (aad and reason, never the ciphertext, never the
 * key) because a missing FIELD_ENCRYPTION_KEY would otherwise be silent.
 */
export function decryptField(stored: string | null | undefined, aad: string): string | null { /* ... */ }

/** `true` if the value is in the v1 envelope. The audit helper. */
export function isEncrypted(stored: string | null | undefined): boolean { /* ... */ }
```

**The asymmetry is deliberate and is the most important thing in this file.**
Encrypt throws; decrypt returns `null`. Reverse either one and you get, in
order: a column of plaintext trauma descriptions, or an onboarding page that
500s for every user the moment a key is rotated.

### 4.6 The query-module contract

Six plans will write files into `queries/`. Five rules, and Task 5 ships a test
that enforces two of them.

1. **Every exported function takes the handle first:** `(db: DbOrTx, ...args)`.
   No module-level `import { db }`. This is what lets a test pass a rolled-back
   transaction, and what lets W4 write `readings` and `reading_cards` atomically
   inside one `db.transaction()`.
2. **Import the type, not the value:** `import type { DbOrTx } from '../types'`.
   Never `from '../client'`.
3. **No React, no Next.** Not `next/cache`, not `next/headers`, not
   `react`'s `cache()`. These modules are called from route handlers, from
   `after()`, from the seed script and from Vitest, and three of those four have
   no React runtime. Caching is the caller's decision, made where the caller
   knows the request context. Enforced by a test.
4. **Return domain shapes, not query builders.** A function returns `Promise<T>`
   or `Promise<T | null>`; it never returns something the caller has to `await`
   twice or `.execute()`.
5. **One file per read concern**, as roadmap §4 names them. A function that
   does not fit any of the four is a sign the concern is new — add a file and
   say so in your plan, do not widen `profile.ts` into a junk drawer.

Worked example, which is also the template:

```ts
// src/lib/db/queries/profile.ts
import { and, eq, isNull } from 'drizzle-orm';
import type { DbOrTx } from '../types';
import { profiles, users, type NewProfile, type Profile, type User } from '../schema';

/** The one lookup on the auth path (W2). Soft-deleted users are not found. */
export async function findUserByGoogleSub(db: DbOrTx, googleSub: string): Promise<User | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.googleSub, googleSub), isNull(users.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function getProfile(db: DbOrTx, userId: string): Promise<Profile | null> { /* ... */ }
export async function upsertProfile(db: DbOrTx, input: NewProfile): Promise<Profile> { /* ... */ }
```

---

## Schema deltas

Three, all small, all justified below. **No table in roadmap §3 is redefined.**
Every column, type, default, nullability and foreign-key action in `schema.ts`
comes from §3 verbatim; these are additions only.

### D-1. Two missing foreign-key indexes

| Table | Column | Type | Why |
|---|---|---|---|
| `reading_cards` | `reading_id` | `index reading_cards_reading_idx (reading_id)` | Postgres does not index a foreign key automatically. §3's index list covers seven of the nine child FK columns — `profiles.user_id` and `lotus_avatars.user_id` by being primary keys, `onboarding_answers.user_id` and `daily_summaries.user_id` as the leading column of their unique constraints, and `readings`/`reading_cards`/`events` `.user_id` by the named indexes. `reading_cards.reading_id` is covered by nothing. Two things need it: W5's chained-reading feature fetches the cards for the last one or two readings by `reading_id`, and `ON DELETE CASCADE` from `readings` performs one sequential scan of `reading_cards` *per deleted reading*. Roadmap §8 makes account erasure a promise in the privacy policy; without this index, erasing a heavy user is O(readings × reading_cards). |
| `moderation_flags` | `user_id` | `index moderation_flags_user_created_idx (user_id, created_at desc)` | Same `ON DELETE SET NULL` scan on erasure, and W7 will want "has this user been flagged before" without a table scan. Cheap now, awkward later. |

### D-2. `lotus_avatars.updated_at`

| Table | Column | Type | Why |
|---|---|---|---|
| `lotus_avatars` | `updated_at` | `timestamptz not null default now()` | Roadmap D10 says the Lotus block is "regenerable by bumping a version column". Regeneration is an upsert on the primary key, which leaves `created_at` at the original value — correct, and it means there is then *no* column that says when the current text was produced. W5's staleness checks and any "why does this read oddly" investigation both need it. Written with Drizzle's `$onUpdate(() => new Date())`, so it is maintained in the app rather than by a trigger. `profiles` already has the pair in §3; this makes `lotus_avatars` consistent with it. |

### D-3. Nothing else

Specifically **not** proposed, and each for a reason someone will otherwise ask
about:

- **A unique constraint on `users.email`.** §3 marks only `google_sub` unique and
  is right: the OIDC `sub` is the identity, a Google account's email can change,
  and a Workspace account can in principle be re-issued. Do not add it.
- **A partial unique index on `google_sub` excluding soft-deleted rows.** Not
  needed if W2 handles a returning user by clearing `deleted_at` on the existing
  row rather than inserting a new one, which it should. Noted in
  `## Interfaces I need`.
- **A `check (card_id between 0 and 21)` on `reading_cards`.** The route already
  bounds it with zod and the deck is fixed at the 22 Majors — but a check
  constraint would have to be dropped the day anyone adds Minors. Raised in
  `## Open questions for reconciliation`, not adopted.
- **A `pgEnum` for any of the eight enumerated `text` columns.** See W1-6.

---

## Interfaces I export

Exact paths and signatures. **Six plans are written against this section.** A
signature here changes only through reconciliation, never silently.

### `src/lib/db/client.ts`

```ts
export const db: Db;   // the singleton. `server-only`. Route handlers and after() use this.
```

### `src/lib/db/types.ts`

```ts
export type Db     = PostgresJsDatabase<typeof schema>;
export type Tx     = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;
```

### `src/lib/db/schema.ts`

Nine table objects, ten helper types, one const array. The Drizzle definitions
are transcribed in full in Task 3 — this is the import surface.

```ts
// Tables (Drizzle objects; pass to select/insert/update)
export const users:              PgTable;  // 'users'
export const profiles:           PgTable;  // 'profiles'
export const onboardingAnswers:  PgTable;  // 'onboarding_answers'
export const lotusAvatars:       PgTable;  // 'lotus_avatars'
export const readings:           PgTable;  // 'readings'
export const readingCards:       PgTable;  // 'reading_cards'
export const events:             PgTable;  // 'events'
export const dailySummaries:     PgTable;  // 'daily_summaries'
export const moderationFlags:    PgTable;  // 'moderation_flags'

// Row types. `X` is what a select returns; `NewX` is what an insert accepts
// (columns with a default become optional).
export type User               = typeof users.$inferSelect;
export type NewUser            = typeof users.$inferInsert;
export type Profile            = typeof profiles.$inferSelect;
export type NewProfile         = typeof profiles.$inferInsert;
export type OnboardingAnswer   = typeof onboardingAnswers.$inferSelect;
export type NewOnboardingAnswer= typeof onboardingAnswers.$inferInsert;
export type LotusAvatar        = typeof lotusAvatars.$inferSelect;
export type NewLotusAvatar     = typeof lotusAvatars.$inferInsert;
export type Reading            = typeof readings.$inferSelect;
export type NewReading         = typeof readings.$inferInsert;
export type ReadingCard        = typeof readingCards.$inferSelect;
export type NewReadingCard     = typeof readingCards.$inferInsert;
export type EventRow           = typeof events.$inferSelect;      // `Event` is a DOM global
export type NewEventRow        = typeof events.$inferInsert;
export type DailySummary       = typeof dailySummaries.$inferSelect;
export type NewDailySummary    = typeof dailySummaries.$inferInsert;
export type ModerationFlag     = typeof moderationFlags.$inferSelect;
export type NewModerationFlag  = typeof moderationFlags.$inferInsert;

// The six onboarding question keys, as a value W3 can iterate and a type it can narrow.
export const QUESTION_KEYS: readonly ['best_thing','worst_thing','most_loved',
                                      'introversion','color','willow_wish'];
export type QuestionKey = (typeof QUESTION_KEYS)[number];

// The shape of lotus_avatars.traits. W3 owns what goes in it; W1 owns that it is jsonb.
export type LotusTraits = { color: string | null; introversion: number | null;
                            [key: string]: unknown };
```

**Column value types the other plans will get wrong if they guess:**

| Column | TS type | Note |
|---|---|---|
| every `created_at`, `updated_at`, `last_seen_at`, `completed_at`, `deleted_at` | `Date` | timestamptz; `Date` on the way in and out |
| every `local_date`, `birth_date` | `string` | **`'YYYY-MM-DD'`. Verified. Never a `Date`.** See W1-7 and roadmap §7. |
| `users.locale`, `readings.locale`, `dailySummaries.locale` | `Locale` (`'id' \| 'en'`) | `events.locale` is `Locale \| null` |
| `readings.readerId`, `dailySummaries.readerId` | `ReaderId` | from `@/data/types` |
| `readings.serviceId` | `ServiceId` | from `@/data/types` |
| `readings.verdict` | `YesNo \| null` | **`'yes' \| 'no' \| 'maybe'`, the machine value from `effectiveYesNo()` — never the displayed word.** `'Ya'`/`'Tidak'` are locale-dependent (W6) and would make the analytics untranslatable. |
| `events.name` | `string` | deliberately not narrowed; W4 owns the taxonomy and narrows it in `track()`. Narrowing it here would make `schema.ts` depend on W4. |
| `events.props` | `Record<string, unknown>` | jsonb, defaults `{}` |
| `dailySummaries.sourceReadingIds` | `string[]` | `uuid[]` |
| `onboardingAnswers.answerText` | `string \| null` | **ciphertext.** Always through `crypto.ts`. |

### `src/data/types.ts` — one addition

```ts
/** The two supported locales. W1 declares it because schema.ts needs it before W6 exists. */
export type Locale = 'id' | 'en';
```

Lives here, next to the existing `ReaderId` and `ServiceId`, rather than in
`src/lib/i18n/`, so that `schema.ts` does not import from a module W6 has not
written yet. **W6 imports this type; it must not redefine it.**

### `src/lib/db/crypto.ts`

```ts
export function answerAad(userId: string, questionKey: string): string;
export function encryptField(plaintext: string, aad: string): string;      // throws
export function decryptField(stored: string | null | undefined, aad: string): string | null; // never throws
export function isEncrypted(stored: string | null | undefined): boolean;
```

W3's call site, exactly:

```ts
const aad = answerAad(userId, 'worst_thing');
await db.insert(onboardingAnswers).values({
  userId, questionKey: 'worst_thing',
  answerText: text === null ? null : encryptField(text, aad),
  skipped: text === null,
});
// ... and on the way out, in the distillation path only (D10):
const plain = decryptField(row.answerText, answerAad(row.userId, row.questionKey));
```

### `src/lib/db/queries/*.ts`

W1 ships the four files with these signatures implemented. Consuming
workstreams add functions to them following §4.6; they do not create parallel
modules.

```ts
// queries/profile.ts        -- W2 (auth) and W3 (onboarding)
export function findUserByGoogleSub(db: DbOrTx, googleSub: string): Promise<User | null>;
export function getUserById(db: DbOrTx, userId: string): Promise<User | null>;
export function getProfile(db: DbOrTx, userId: string): Promise<Profile | null>;
export function upsertProfile(db: DbOrTx, input: NewProfile): Promise<Profile>;
export function touchLastSeen(db: DbOrTx, userId: string): Promise<void>;

// queries/history.ts        -- W4 (the after() write path) and W5 (chained readings)
export function insertReading(db: DbOrTx, reading: NewReading,
                              cards: Omit<NewReadingCard, 'readingId' | 'userId'>[]): Promise<Reading>;
export function recentReadings(db: DbOrTx, userId: string, limit: number): Promise<Reading[]>;
export function readingsOnLocalDate(db: DbOrTx, userId: string, localDate: string): Promise<Reading[]>;

// queries/frequency.ts      -- W5 (the card-frequency verdict)
export type CardCount = { cardId: number; count: number };
export function cardCounts(db: DbOrTx, userId: string,
                           since: string, until: string): Promise<CardCount[]>;

// queries/summary.ts        -- W5 (the per-day reader summary cache)
export function getDailySummary(db: DbOrTx, userId: string, readerId: ReaderId,
                                localDate: string, locale: Locale): Promise<DailySummary | null>;
export function putDailySummary(db: DbOrTx, input: NewDailySummary): Promise<DailySummary>;
```

`insertReading` takes the cards and writes both tables **in one transaction**,
because a `readings` row with no `reading_cards` corrupts the frequency feature
silently. `since`/`until` in `cardCounts` are `'YYYY-MM-DD'` strings compared
against `local_date`, not timestamps — roadmap §5's windows are the querent's
days, not the server's hours.

### `src/lib/db/testing/harness.ts`

```ts
export const testDb: Db;
export function withRollback(fn: (tx: Tx) => Promise<void>): Promise<void>;
export function resetDb(): Promise<void>;          // TRUNCATE ... RESTART IDENTITY CASCADE
export function closeTestDb(): Promise<void>;
```

### npm scripts

```
db:up          docker compose up -d && wait for readiness
db:down        docker compose down            (keeps the volume)
db:nuke        docker compose down -v         (drops the volume; start over)
db:generate    drizzle-kit generate
db:migrate     apply pending migrations to DATABASE_URL
db:studio      drizzle-kit studio
db:seed        the dev seed (§ Task 7)
db:test:reset  drop + recreate jmtarot_test
test           vitest run --project unit          UNCHANGED MEANING: fast, no DB
test:integration  vitest run --project integration
test:all       vitest run
```

---

## Interfaces I need

Nothing blocks W1 — it is the root of the dependency graph. These are the
assumptions W1 makes about what the other six will do.

| From | What | Why it matters to W1 |
|---|---|---|
| **W2** (auth) | A returning soft-deleted user is handled by **clearing `deleted_at` on the existing row**, not by inserting a second one. `google_sub` is unique with no partial-index exemption. | Determines whether D-3's rejected partial index is actually needed. |
| **W2** | The dev password route (`DEV_PASSWORD_LOGIN`, D2) resolves a username to the seeded user via `google_sub = 'dev:<username>'`. It must not invent a second identity scheme. | See `## The two hardcoded users`. |
| **W2** | The `sub` in the JWT is `users.id` (the uuid), not the Google `sub`. Every signature in `## Interfaces I export` takes `userId: string` meaning `users.id`. | If W2 puts the Google sub in the JWT, every query gains a lookup on the request path, which violates the roadmap's first non-negotiable. **Flagged as open question 1.** |
| **W3** (onboarding) | Uses `encryptField`/`decryptField` with `answerAad(userId, questionKey)` and never writes `answer_text` by any other route. Owns the six `QuestionKey` values and what `LotusTraits` contains. | The AAD must match on both sides or decryption returns `null`. |
| **W3** | Bumps `lotus_avatars.source_version` to force regeneration, and upserts on `user_id`. | D-2. |
| **W4** (analytics) | Owns the `events.name` taxonomy and narrows it in `track()`. Calls `insertReading` inside `after()`, and treats the `readings` write as the one that gets a retry (roadmap §6). | `schema.ts` leaves `events.name` as `text` so it does not depend on W4. |
| **W4** | Sends `local_date` from the **client**, as a `'YYYY-MM-DD'` string, and never recomputes it server-side from `created_at`. | Roadmap §7. The column type makes the wrong thing awkward but not impossible. |
| **W5** (memory) | Fills in `frequency.ts` and `summary.ts` following §4.6. The windows are lower bounds on `local_date` and are configuration, not code. | Roadmap §5. |
| **W6** (i18n) | Imports `Locale` from `@/data/types`; does not redefine it. Locale resolution order is profile → cookie → `Accept-Language` → `'id'`, and `users.locale` is the profile half of that. | Roadmap D6. |
| **W7** (trust & safety) | Writes `moderation_flags`. Decides whether `moderation_flags.question` is stored in plaintext — see §9. The privacy policy must name **both** `onboarding_answers.answer_text` and `readings.question` as stored user text. | Roadmap §8 only mandates encryption for the first of those. |
| **W7** | The secrets audit confirms `DATABASE_URL` and `FIELD_ENCRYPTION_KEY` never reach a client bundle. `import 'server-only'` in `client.ts` is W1's half of that. | Roadmap's third non-negotiable. |

---

## New environment variables

Beyond roadmap §4. §4 already fixes `DATABASE_URL` and `FIELD_ENCRYPTION_KEY`;
this plan adds exactly one.

| Name | Value | Why |
|---|---|---|
| `TEST_DATABASE_URL` | `postgres://jmtarot:jmtarot@127.0.0.1:5432/jmtarot_test` | The integration suite `TRUNCATE`s. A **separate variable, not an override of `DATABASE_URL`**, so that a forgotten flag or a shell without the override cannot point `npm run test:integration` at development data. The harness additionally refuses to run if the value does not end in `_test`, which makes the mistake impossible rather than merely unlikely. |

### The `$` trap, restated for these values

`CLAUDE.md` records that Next expands `$VAR` when it loads a `.env` file, which
is how the bcrypt hashes lost their `$2b`. Applied here:

- **`FIELD_ENCRYPTION_KEY` needs no escaping.** Generate it as base64url —
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
  — whose alphabet is `A-Za-z0-9-_` only: no `+`, `/`, `=` and no `$`. Verified,
  and `Buffer.from(k, 'base64')` decodes it regardless, so a plain-base64 key
  also works.
- **`DATABASE_URL` is the one that can bite.** A password containing `$` will be
  mangled exactly the way the hashes were, and the symptom is a password-auth
  failure against a password that is demonstrably correct when you read the
  file. `@`, `:`, `/` and `?` must additionally be percent-encoded, because they
  are URL syntax. **Keep the dev password alphanumeric and the question does not
  arise** — which is what `docker-compose.yml` does.
- **Nothing in this section is escaped in the Vercel dashboard**, where values
  are literal. Unchanged from `CLAUDE.md`.

---

## Tasks

### Task 1: Local Postgres, brought up by one command

**Files:**
- Create: `docker-compose.yml`
- Modify: `package.json` (`db:up`, `db:down`, `db:nuke`), `.gitignore`, `.env.example`

**Step 1: Confirm the ground truth before writing anything**

```sh
docker compose version          # expect v2.x -- NOT `docker-compose`
id -nG | tr ' ' '\n' | grep -x docker   # expect a match; no sudo needed
ss -ltn | grep -E ':5432|:5433'         # expect 5433 (native pg), NOT 5432
```

If 5432 is occupied, change the host port in `docker-compose.yml` and in both
URLs in `.env.local` — nothing else in this plan cares.

**Step 2: `docker-compose.yml`**

```yaml
# Local development only. There is no production database yet (roadmap D5).
services:
  postgres:
    image: postgres:16-alpine       # 16 to match the psql 16.11 already on PATH
    container_name: jmtarot-pg
    restart: unless-stopped
    environment:
      POSTGRES_USER: jmtarot
      POSTGRES_PASSWORD: jmtarot    # local-only; see below
      POSTGRES_DB: jmtarot
    # 127.0.0.1, not 0.0.0.0. WSL2's NAT would otherwise expose this to the
    # Windows host and anything that can reach it.
    ports: ['127.0.0.1:5432:5432']
    volumes: ['jmtarot-pgdata:/var/lib/postgresql/data']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U jmtarot -d jmtarot']
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  jmtarot-pgdata:
```

The password is committed on purpose and is deliberately trivial: the container
binds to loopback and holds nothing but seeded fiction. **It must never be
reused for anything.** Put that sentence in the file as a comment.

**Step 3: `db:up` must not race initdb**

This is a real trap and it cost time during this plan's verification.
`docker exec jmtarot-pg pg_isready` returns *ready* while the container is still
in its `initdb` bootstrap, running a temporary server — and then the temporary
server shuts down and the next command fails with
`FATAL: the database system is shutting down`. The bootstrap server listens on
the **unix socket only**, so a probe over TCP from the host cannot see it and
cannot race it:

```json
"db:up": "docker compose up -d && until pg_isready -h 127.0.0.1 -p 5432 -q; do sleep 1; done && echo 'postgres ready'"
```

`pg_isready` is on PATH from the apt `postgresql-client-16`. Verified: ready in
about 1 second on a warm image.

**Step 4: Create the test database**

`POSTGRES_DB` makes `jmtarot`; the second one is one statement:

```sh
PGPASSWORD=jmtarot psql -h 127.0.0.1 -p 5432 -U jmtarot -d postgres \
  -c 'CREATE DATABASE jmtarot_test'
```

Put it in `scripts/db-test-reset.ts` behind `npm run db:test:reset`, as
`DROP DATABASE IF EXISTS` + `CREATE DATABASE`, so the same script both creates it
the first time and resets it later.

**Step 5: `.env.example` and `.env.local`**

Add the block from the `## New environment variables` section, `$`-warning and
all. Confirm `.gitignore` still covers `.env.local` — it does, via `.env*.local`
— and add nothing else; the compose volume is Docker-managed and never lands in
the working tree.

**Step 6: Verify**

```sh
npm run db:up
PGPASSWORD=jmtarot psql -h 127.0.0.1 -p 5432 -U jmtarot -d jmtarot -tAc 'select version()'
PGPASSWORD=jmtarot psql -h 127.0.0.1 -p 5432 -U jmtarot -d jmtarot -tAc 'select gen_random_uuid()'
```

Expected: `PostgreSQL 16.x ... on x86_64-pc-linux-musl`, then a uuid.
**The second one matters**: it proves §3's `default gen_random_uuid()` needs no
`CREATE EXTENSION pgcrypto`. Verified on 16.14.

Then prove the restart story, because `restart: unless-stopped` plus WSL
systemd is the whole reason this is not a chore every morning:
`docker restart jmtarot-pg && npm run db:up` should return in seconds.

**Step 7: Commit**

---

### Task 2: Drizzle, the driver, and the client

**Files:**
- Modify: `package.json`
- Create: `src/lib/db/client.ts`, `src/lib/db/types.ts`, `drizzle.config.ts`

**Step 1: Install, pinned**

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm install drizzle-orm@^0.45.2 postgres@^3.4.9 server-only@^0.0.1
npm install -D drizzle-kit@^0.31.10
```

Versions verified as current on 2026-07-26. **Do not take `drizzle-orm@1.x`** —
`1.0.0-beta.*` tags exist on npm and `latest` is `0.45.2`; a `^1` range would
pull a beta whose relational-query API differs.

**Step 2: Check the TypeScript trap immediately**

```sh
npm ls typescript
```

Expected: `typescript@5.9.3`. `CLAUDE.md`'s trap is that `npm install typescript`
resolves to 7.x, the native port, which passes `npm run typecheck` and then kills
`npm run build` with "The id argument must be of type string". Neither package
above depends on TypeScript, so this should be untouched — check anyway, because
the failure is a 20-minute detour into the wrong file.

**Step 3: `client.ts` and `types.ts`**

Exactly as written in §4.4, comments included. The D5 comment block is the point
of the file; do not trim it.

**Step 4: `drizzle.config.ts` at the repo root**

```ts
import 'dotenv/config';                    // drizzle-kit is not Next; it loads no .env
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './src/lib/db/migrations',          // roadmap §4
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  casing: 'snake_case',
  strict: true,                            // confirm before applying a destructive statement
  verbose: true,
});
```

`drizzle-kit` runs outside Next, so **it does not load `.env.local`** — a fact
that produces a baffling "DATABASE_URL is undefined" from a variable that is
plainly set for `npm run dev`. Either `npm install -D dotenv` and
`import 'dotenv/config'`, or run the scripts with `node --env-file=.env.local`.
Pick one and be consistent; this plan uses `dotenv` because `--env-file` does not
understand the `\$` escaping the rest of the file relies on.

**Step 5: Verify**

```sh
npm run typecheck && npm run build
```

**Do not skip `npm run build`.** `CLAUDE.md` is explicit that a green typecheck
proves nothing about the build, and this is the commit that adds three
dependencies. Watch specifically for a bundler complaint about `postgres` — if
one appears, add `serverExternalPackages: ['postgres']` to `next.config.ts` and
note it. Do not add it pre-emptively.

**Step 6: Commit**

---

### Task 3: `schema.ts` and the baseline migration

This is the task the other six read. Transcribe it; do not redesign it. Every
line below was typechecked against `drizzle-orm@0.45.2` and every table below
was created on a real PostgreSQL 16 during the writing of this plan.

**Files:**
- Create: `src/lib/db/schema.ts`, `src/lib/db/migrations/0000_baseline.sql` (+ `meta/`)
- Modify: `src/data/types.ts` (add `Locale`), `package.json`
- Create: `scripts/db-migrate.ts`

**Step 1: The header and the helpers**

```ts
/**
 * The nine tables of PUBLIC_RELEASE_ROADMAP.md §3, and nothing else.
 *
 * §3 is canonical. If you need a column that is not here, it goes in your
 * workstream plan's `## Schema deltas` section and reconciliation folds it in.
 * Do not add one directly: seven agents inventing user_id / userId / uid is
 * the single most likely way this project becomes a mess, and §3 exists to
 * stop it.
 *
 * Conventions, all from §3: snake_case, plural tables, every table has `id`
 * and `created_at`, timestamps are timestamptz and never bare, foreign keys
 * are `<singular>_id` and are declared with references() so the relations come
 * out typed.
 */
import {
  boolean, date, index, integer, jsonb, pgTable, real, text, timestamp, unique, uuid,
} from 'drizzle-orm/pg-core';
import type { Locale, ReaderId, ServiceId, YesNo } from '@/data/types';

const tsCol = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const dateCol = (name: string) => date(name, { mode: 'string' });
```

Both helpers get the doc comments from §4.3. `dateCol`'s comment is
load-bearing; §7 of the roadmap is the trap it defends against.

Add to `src/data/types.ts`:

```ts
/** The two supported locales. Declared here, beside ReaderId and ServiceId, so
 *  the DB schema does not have to import from an i18n module W6 has not written
 *  yet. W6 imports this; it does not redefine it. */
export type Locale = 'id' | 'en';
```

**Step 2: The nine tables**

```ts
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** The OIDC `sub`. THE identity -- not email, which can change. */
  googleSub: text('google_sub').notNull().unique(),
  email: text('email').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  /** From Google. NOT the onboarding answer -- that is profiles.full_name. */
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  locale: text('locale').$type<Locale>().notNull().default('id'),
  createdAt: tsCol('created_at').notNull().defaultNow(),
  lastSeenAt: tsCol('last_seen_at').notNull().defaultNow(),
  /** Soft delete, for the T&C erasure right (roadmap §8). Every read filters on it. */
  deletedAt: tsCol('deleted_at'),
});

export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  nickname: text('nickname').notNull(),
  birthDate: dateCol('birth_date').notNull(),
  onboardingVersion: integer('onboarding_version').notNull().default(1),
  completedAt: tsCol('completed_at'),
  createdAt: tsCol('created_at').notNull().defaultNow(),
  updatedAt: tsCol('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

export const QUESTION_KEYS = [
  'best_thing', 'worst_thing', 'most_loved', 'introversion', 'color', 'willow_wish',
] as const;
export type QuestionKey = (typeof QUESTION_KEYS)[number];

export const onboardingAnswers = pgTable('onboarding_answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  questionKey: text('question_key').$type<QuestionKey>().notNull(),
  /**
   * ENCRYPTED (roadmap §8/D11). NULL when skipped.
   *
   * The stored value is `v1.<iv>.<ciphertext>.<tag>`, base64url. NEVER write
   * this column except through encryptField() in ../crypto.ts, and never read
   * it except through decryptField(). The audit query is:
   *   select count(*) from onboarding_answers
   *    where answer_text is not null and answer_text not like 'v1.%';
   * It must return 0.
   */
  answerText: text('answer_text'),
  /** Closed questions: 'black'|'white'|'grey', and the introversion scale value. */
  answerChoice: text('answer_choice'),
  skipped: boolean('skipped').notNull().default(false),
  createdAt: tsCol('created_at').notNull().defaultNow(),
}, (t) => [
  unique('onboarding_answers_user_question_uq').on(t.userId, t.questionKey),
]);

export type LotusTraits = {
  color: string | null;
  introversion: number | null;
  [key: string]: unknown;   // W3 owns the rest
};

export const lotusAvatars = pgTable('lotus_avatars', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  /**
   * NOT A FOREIGN KEY. The Indonesian summary text; `_id` is the ISO 639-1
   * language code, pairing with summary_en below. §3 names it this way and §3
   * also says `<singular>_id` means a foreign key, so this column contradicts
   * the convention two paragraphs above it. Do not join on it.
   */
  summaryId: text('summary_id').notNull(),
  summaryEn: text('summary_en').notNull(),
  traits: jsonb('traits').$type<LotusTraits>().notNull(),
  /** Bump to force regeneration (roadmap D10). */
  sourceVersion: integer('source_version').notNull(),
  model: text('model').notNull(),
  createdAt: tsCol('created_at').notNull().defaultNow(),
  /** DELTA D-2: regeneration upserts on the pk, so created_at stops being the
   *  age of the text that is actually in the row. */
  updatedAt: tsCol('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

export const readings = pgTable('readings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  readerId: text('reader_id').$type<ReaderId>().notNull(),
  serviceId: text('service_id').$type<ServiceId>().notNull(),
  locale: text('locale').$type<Locale>().notNull(),
  /** The querent's text, already sanitized. May be NULL. Stored in plaintext --
   *  the privacy policy (W7) must say so. */
  question: text('question'),
  questionBlocked: boolean('question_blocked').notNull().default(false),
  /**
   * The MACHINE verdict from effectiveYesNo(): 'yes' | 'no' | 'maybe'.
   * Never the displayed word. 'Ya'/'Tidak'/'Belum jelas' are Indonesian, and
   * storing them would make the analytics untranslatable the moment W6 lands.
   */
  verdict: text('verdict').$type<YesNo>(),
  /** The generated prose. NULL if the stream died. */
  body: text('body'),
  model: text('model').notNull(),
  /** So a prompt change is visible in the data. */
  promptVersion: text('prompt_version').notNull(),
  latencyMs: integer('latency_ms'),
  tokenInput: integer('token_input'),
  tokenOutput: integer('token_output'),
  /** The QUERENT'S own calendar day, sent by the client. Roadmap §7. */
  localDate: dateCol('local_date').notNull(),
  createdAt: tsCol('created_at').notNull().defaultNow(),
}, (t) => [
  index('readings_user_created_idx').on(t.userId, t.createdAt.desc()),
  index('readings_user_local_date_idx').on(t.userId, t.localDate),
]);

export const readingCards = pgTable('reading_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  readingId: uuid('reading_id').notNull()
    .references(() => readings.id, { onDelete: 'cascade' }),
  /** Denormalized on purpose (§3): the frequency query filters on it directly. */
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  cardId: integer('card_id').notNull(),       // 0..21
  reversed: boolean('reversed').notNull(),
  /** 0-based slot in the spread. `position` is a non-reserved SQL keyword;
   *  Drizzle quotes it, so it is fine unless you hand-write SQL. */
  position: integer('position').notNull(),
  createdAt: tsCol('created_at').notNull().defaultNow(),
}, (t) => [
  index('reading_cards_user_card_idx').on(t.userId, t.cardId),
  /** DELTA D-1: the FK Postgres does not index for you. Needed by W5's chained
   *  readings and by the cascade on account erasure. */
  index('reading_cards_reading_idx').on(t.readingId),
]);

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  /** Per browser session, NOT the auth session. */
  sessionId: text('session_id'),
  /** Deliberately not narrowed: W4 owns the taxonomy and narrows it in track().
   *  Narrowing it here would make schema.ts depend on a workstream that
   *  depends on schema.ts. */
  name: text('name').notNull(),
  props: jsonb('props').$type<Record<string, unknown>>().notNull().default({}),
  locale: text('locale').$type<Locale>(),
  localDate: dateCol('local_date').notNull(),
  createdAt: tsCol('created_at').notNull().defaultNow(),
}, (t) => [
  index('events_user_created_idx').on(t.userId, t.createdAt.desc()),
  index('events_name_created_idx').on(t.name, t.createdAt.desc()),
]);

export const dailySummaries = pgTable('daily_summaries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  readerId: text('reader_id').$type<ReaderId>().notNull(),
  localDate: dateCol('local_date').notNull(),
  locale: text('locale').$type<Locale>().notNull(),
  body: text('body').notNull(),
  /** What it summarized, so staleness is detectable. No FK is possible on an array. */
  sourceReadingIds: uuid('source_reading_ids').array().notNull(),
  createdAt: tsCol('created_at').notNull().defaultNow(),
}, (t) => [
  unique('daily_summaries_user_reader_date_locale_uq')
    .on(t.userId, t.readerId, t.localDate, t.locale),
]);

export const moderationFlags = pgTable('moderation_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  question: text('question').notNull(),
  category: text('category').notNull(),   // 'self_harm' | 'violence' | 'sexual_minor' | ...
  source: text('source').$type<'blocklist' | 'classifier'>().notNull(),
  confidence: real('confidence'),
  createdAt: tsCol('created_at').notNull().defaultNow(),
}, (t) => [
  /** DELTA D-1. */
  index('moderation_flags_user_created_idx').on(t.userId, t.createdAt.desc()),
]);
```

Then the twenty inferred row types from `## Interfaces I export`. Note
`EventRow`, not `Event` — `Event` is a DOM global and `lib.dom` is in this
project's `tsconfig`, so shadowing it produces confusing errors in unrelated
files.

**Step 3: `scripts/db-migrate.ts`**

```ts
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// A dedicated single connection, not the app's pool: migrations run DDL and
// must not share a pooled connection with anything else.
const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
await migrate(drizzle(sql), { migrationsFolder: './src/lib/db/migrations' });
await sql.end();
console.log('migrations applied');
```

Scripts: `"db:generate": "drizzle-kit generate"`,
`"db:migrate": "tsx scripts/db-migrate.ts"`, `"db:studio": "drizzle-kit studio"`.

**Step 4: Generate and apply**

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run db:generate -- --name baseline
npm run db:migrate
```

Expected from `generate`: `9 tables`, and
`src/lib/db/migrations/0000_baseline.sql`. **Read the SQL before applying it.**
It should contain `timestamp with time zone` for every timestamp,
`date` for `local_date` and `birth_date`, `uuid[]` for `source_reading_ids`,
`jsonb DEFAULT '{}'::jsonb` for `events.props`, and
`uuid PRIMARY KEY DEFAULT gen_random_uuid()` on the seven tables that have it.
That is what it produced during verification.

**Step 5: The rule for the other six workstreams**

Put this verbatim in a comment at the top of `src/lib/db/migrations/README` —
one paragraph in a plan is not where anyone will look at merge time.

1. **`schema.ts` has one owner: W1.** If you need a column, it goes in your
   plan's `## Schema deltas` and reconciliation folds it in. That is the
   default and it should cover almost everything, because the build order
   (roadmap §9) is nearly sequential.
2. If you are genuinely blocked, you may append to `schema.ts` — but only for a
   table or column your own `## Schema deltas` section already names.
   **Never touch a table you did not add.**
3. Generate with `npm run db:generate -- --name <workstream>-<what>`, e.g.
   `w3-lotus-regen-flag`. The prefix makes `git log --stat` legible and makes a
   collision obvious on sight.
4. Commit the `schema.ts` edit, the generated `.sql`, **and** the updated files
   under `migrations/meta/` in one commit. A `.sql` without its journal entry is
   invisible to the migrator; a journal entry without its `.sql` crashes it.
5. **Never edit a migration that has been applied anywhere.** Not for a typo.
   Add another one.
6. **`meta/_journal.json` is the file that will conflict.** Do not resolve it by
   hand. Delete your own generated `.sql` and snapshot, take theirs wholesale,
   re-run `db:generate`. Drizzle recomputes the diff from `schema.ts`, so the
   regenerated migration is correct by construction and a hand-merge is never
   necessary and frequently wrong.
7. **`drizzle-kit push` is banned.** It diffs the live database against
   `schema.ts` and applies the change without writing a migration file, which
   silently desynchronizes the committed history from every other machine. Only
   `generate` + `migrate`.

**Step 6: Verify against the running database**

```sh
PGPASSWORD=jmtarot psql -h 127.0.0.1 -p 5432 -U jmtarot -d jmtarot -c '\dt'
PGPASSWORD=jmtarot psql -h 127.0.0.1 -p 5432 -U jmtarot -d jmtarot -tAc \
  "select indexname from pg_indexes where schemaname='public' order by 1"
```

Expected: the nine tables of §3, and among the indexes all five that §3 calls
non-optional plus the two from D-1:
`readings_user_created_idx`, `readings_user_local_date_idx`,
`reading_cards_user_card_idx`, `events_user_created_idx`,
`events_name_created_idx`, `reading_cards_reading_idx`,
`moderation_flags_user_created_idx`. A `drizzle.__drizzle_migrations` table also
appears — that is drizzle-kit's own bookkeeping and is expected.

Then confirm idempotency: `npm run db:migrate` a second time must print
`migrations applied` and change nothing.

**Step 7: `npm run typecheck && npm run build && npm test`, then commit**

The existing seven test files must still pass untouched.

---

### Task 4: Field encryption

**Files:**
- Create: `src/lib/db/crypto.ts`, `src/lib/db/crypto.test.ts`
- Modify: `.env.example`

**Step 1: Write the failing tests**

This is the one module in W1 that is pure logic, so it gets the full TDD loop
and it belongs in the fast `unit` project — no database, no Docker.

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { answerAad, decryptField, encryptField, isEncrypted } from './crypto';

const AAD = answerAad('11111111-1111-1111-1111-111111111111', 'worst_thing');

beforeAll(() => {
  process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString('base64url');
});

describe('field encryption', () => {
  it('round-trips Indonesian text with accents and emoji', () => {
    const plain = 'Sesuatu yang berat, dengan tanda kutip " dan émoji 🌙';
    expect(decryptField(encryptField(plain, AAD), AAD)).toBe(plain);
  });

  it('produces a different ciphertext every time for the same plaintext', () => {
    // A fixed IV would let anyone with the dump see which users answered the
    // same thing. This asserts the IV is random, not that encryption "works".
    expect(encryptField('sama', AAD)).not.toBe(encryptField('sama', AAD));
  });

  it('carries its own IV and tag in a self-describing envelope', () => {
    const stored = encryptField('rahasia', AAD);
    expect(stored.split('.')).toHaveLength(4);
    expect(stored.startsWith('v1.')).toBe(true);
    expect(isEncrypted(stored)).toBe(true);
  });

  it('never emits a character that needs escaping in a .env, a URL or a log', () => {
    expect(encryptField('rahasia', AAD)).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('refuses to decrypt under a different AAD', () => {
    const stored = encryptField('rahasia', AAD);
    expect(decryptField(stored, answerAad('22222222-2222-2222-2222-222222222222', 'worst_thing')))
      .toBeNull();
  });

  it('refuses to decrypt a tampered tag', () => {
    const parts = encryptField('rahasia', AAD).split('.');
    parts[3] = Buffer.from(randomBytes(16)).toString('base64url');
    expect(decryptField(parts.join('.'), AAD)).toBeNull();
  });

  // The four that must NOT throw, because roadmap §8 says the app works without
  // this data. Any one of them throwing is a 500 on the onboarding page.
  it.each([
    ['null',            null],
    ['garbage',         'not even close'],
    ['a truncated envelope', 'v1.abc'],
    ['an unknown version',   'v2.aaa.bbb.ccc'],
  ])('returns null rather than throwing for %s', (_label, input) => {
    expect(decryptField(input as string | null, AAD)).toBeNull();
  });

  it('returns null rather than throwing when the key is gone', () => {
    const saved = process.env.FIELD_ENCRYPTION_KEY;
    const stored = encryptField('rahasia', AAD);
    delete process.env.FIELD_ENCRYPTION_KEY;
    try { expect(decryptField(stored, AAD)).toBeNull(); }
    finally { process.env.FIELD_ENCRYPTION_KEY = saved; }
  });

  it('THROWS rather than storing plaintext when the key is gone', () => {
    const saved = process.env.FIELD_ENCRYPTION_KEY;
    delete process.env.FIELD_ENCRYPTION_KEY;
    try { expect(() => encryptField('rahasia', AAD)).toThrow(/FIELD_ENCRYPTION_KEY/); }
    finally { process.env.FIELD_ENCRYPTION_KEY = saved; }
  });

  it('rejects a key that is not 32 bytes', () => {
    const saved = process.env.FIELD_ENCRYPTION_KEY;
    process.env.FIELD_ENCRYPTION_KEY = randomBytes(16).toString('base64url');
    try { expect(() => encryptField('x', AAD)).toThrow(/32 bytes/); }
    finally { process.env.FIELD_ENCRYPTION_KEY = saved; }
  });
});
```

The last three are the ones that matter. The first two are table stakes; those
three encode roadmap §8's actual policy, and the pair of them — decrypt returns
null, encrypt throws — is the whole design.

**Note the key cache.** `key()` memoizes, so the two tests that delete the env
var will pass spuriously if a previous test warmed the cache. Either expose a
`__resetKeyCache()` for tests, or have `key()` re-read `process.env` when the
cached value's source string has changed. **Take the second**; a test-only
export is a foothold for production code.

**Step 2: Run to verify they fail**

`npm test -- crypto` — expected FAIL, `encryptField` is not defined. Not
assertion failures.

**Step 3: Implement**

§4.5, using `node:crypto`'s `aes-256-gcm`. Verified working, including AAD
rejection, during the writing of this plan.

**Step 4: Run to verify they pass**

**Step 5: `.env.example`**

```
# 32 bytes. Generate as base64url -- its alphabet is A-Za-z0-9-_ only, so there
# is no `+`, `/`, `=` or `$` to escape or quote anywhere (see the AUTH_USERS
# warning above for what a `$` does to a .env value):
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
#
# Losing this key does NOT break the app: encrypted onboarding answers decrypt
# to NULL and read as "skipped". It does mean that data is gone for good, and
# every affected read logs. Rotating it has the same effect -- there is no
# re-encryption path, deliberately, because building one before anyone has
# needed it means maintaining a migration for a hypothetical.
FIELD_ENCRYPTION_KEY=replace-me-with-32-random-bytes-base64url
```

**Step 6: Commit**

---

### Task 5: The query modules and their contract

**Files:**
- Create: `src/lib/db/queries/{profile,history,frequency,summary}.ts`
- Create: `src/lib/db/queries/contract.test.ts`

**Step 1: Write the four files with the signatures from `## Interfaces I export`**

Implement them; they are short. `insertReading` is the only one with any shape
to it:

```ts
export async function insertReading(
  db: DbOrTx,
  reading: NewReading,
  cards: Omit<NewReadingCard, 'readingId' | 'userId'>[],
): Promise<Reading> {
  // One transaction. A readings row with no reading_cards is not a partial
  // success -- it is a silent hole in the frequency feature that nothing will
  // ever surface, because every query still returns a plausible answer.
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(readings).values(reading).returning();
    if (cards.length > 0) {
      await tx.insert(readingCards).values(
        cards.map((c) => ({ ...c, readingId: row.id, userId: row.userId })),
      );
    }
    return row;
  });
}
```

`user_id` on `reading_cards` is denormalized (§3 says so on purpose) and is
copied from the reading here, never taken from the caller — one source of truth
means the denormalization cannot drift.

Note that `db.transaction` exists on `Tx` as well as `Db`, so a caller who
already has a transaction gets a savepoint rather than an error. That is what
makes `insertReading` callable from inside the test harness's rollback.

**Step 2: The contract test**

Genuinely runnable, no database, and it belongs in the `unit` project:

```ts
// fs.globSync is stable on Node 22+; verified present on the Node 24 here.
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const files = globSync('src/lib/db/**/*.ts')
  .filter((f) => !f.endsWith('.test.ts'))
  .filter((f) => !f.endsWith('/client.ts'));   // the one file that MUST import server-only

describe('the query-module contract', () => {
  it('finds the query modules at all', () => {
    // A glob that silently matches nothing is a test that always passes.
    expect(files.length).toBeGreaterThan(6);
  });

  it('never imports React or Next from the data layer', () => {
    // These modules run in route handlers, in after(), in scripts/db-seed.ts
    // and in Vitest. Three of those four have no React runtime. Caching is the
    // caller's decision, made where the caller knows the request context.
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/from\s+['"](react|next\/[a-z-]+|server-only)['"]/);
    }
  });

  it('imports the db handle only as a type', () => {
    for (const f of files.filter((f) => f.includes('/queries/'))) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/^import\s+\{[^}]*\bdb\b/m);
    }
  });
});
```

`client.ts` is excluded by name — it is the one file that *must* import
`server-only`. Write the exclusion as an explicit filter rather than loosening
the regex, so that a second file acquiring `server-only` is a test failure and
not a shrug.

**Step 3: Verify**

`npm test` — the existing seven files (56 tests, ~0.8s, measured) plus crypto
plus this one. Still no Docker, still fast. If the wall time has moved
noticeably, something in the data layer is being imported that should not be.

**Step 4: Commit**

---

### Task 6: The integration test harness

Roadmap §9: "the database makes integration tests possible for the first time".
The constraint is that it must not make the existing loop worse.

**Files:**
- Create: `src/lib/db/testing/harness.ts`, `src/lib/db/testing/globalSetup.ts`
- Create: `src/lib/db/queries/profile.integration.test.ts`
- Modify: `vitest.config.ts`, `package.json`
- Create: `scripts/db-test-reset.ts`

**Step 1: Split the Vitest config into two projects**

Vitest 4.1.10 is installed. This exact config was run against the existing
suite while writing this plan: `--project unit` collected all seven current
files, 56 tests, in 796ms, with the `@` alias resolving — so `extends: true`
does inherit the root `resolve` block and the alias stays in one place.

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/*
 * Two projects, and the split is the point.
 *
 * `unit` is what `npm test` runs and what it has always run: pure logic, no
 * database, no Docker, no network. Deck maths, prompt assembly, question
 * sanitization, session tokens, the rate limiter, togglePick, field
 * encryption. It must stay fast enough that nobody thinks about running it.
 *
 * `integration` needs `npm run db:up` and a TEST_DATABASE_URL. It applies the
 * committed migrations to a scratch database once per run -- which incidentally
 * tests that the migrations still apply from zero -- and rolls back after every
 * test.
 *
 * There are still no browser tests and there must not be: Chromium cannot
 * launch in this WSL image without sudo-installed libraries, so Playwright is
 * not in this project. Visual checks happen in a real browser against
 * `npm run dev`, and touch behaviour on a real iPhone against a Vercel preview.
 *
 * The alias mirrors tsconfig's `paths`. Vitest does not read tsconfig, so the
 * two have to be kept in step by hand.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.integration.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['src/**/*.integration.test.ts'],
          globalSetup: ['./src/lib/db/testing/globalSetup.ts'],
          // One database, one migration history, shared by all files. Parallel
          // files would each try to migrate it.
          fileParallelism: false,
        },
      },
    ],
  },
});
```

Scripts:

```json
"test":             "vitest run --project unit",
"test:watch":       "vitest --project unit",
"test:integration": "vitest run --project integration",
"test:all":         "vitest run"
```

`npm test` keeps its exact current meaning. That is deliberate and it is the
thing to protect: a default test command that needs Docker is a default test
command people stop running.

One wrinkle worth knowing before it looks like a bug: a project that matches no
files exits non-zero. Between adding the config and writing the first
`*.integration.test.ts`, `npm run test:integration` will fail with "No test
files found". Add the test in the same commit, or pass `--passWithNoTests`
temporarily — do not leave that flag in the script, because it would also mask
a broken `include` glob later.

**Step 2: `globalSetup.ts`**

```ts
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set. Run `npm run db:up` and copy .env.example.');

  // Not a style rule. This is the only thing standing between a mistyped
  // variable and TRUNCATE across your development data.
  if (!/_test(\?|$)/.test(url)) {
    throw new Error(`TEST_DATABASE_URL must name a database ending in _test, got: ${url}`);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  // Applying the COMMITTED migrations, not push: this run is also a test that
  // the migration history still applies cleanly from an empty database.
  await migrate(drizzle(sql), { migrationsFolder: './src/lib/db/migrations' });
  await sql.end();
}
```

No `teardown` that drops the database. `migrate()` is idempotent and tops up
whatever is missing, so keeping it between runs saves several seconds every
time. `npm run db:test:reset` exists for the one case that needs it — an already-
applied migration having been edited, which rule 5 of Task 3 forbids anyway.

**Step 3: `harness.ts`**

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import type { Db, Tx } from '../types';
import * as schema from '../schema';

// Its own client, not the app's. The app's is `server-only` and reads
// DATABASE_URL; this one must read TEST_DATABASE_URL and must never be the
// same connection.
const client = postgres(process.env.TEST_DATABASE_URL!, { max: 5, onnotice: () => {} });
export const testDb: Db = drizzle(client, { schema });

class Rollback extends Error {}

/**
 * Run `fn` inside a transaction that is always rolled back.
 *
 * ~100x faster than truncating nine tables per test, and it composes with the
 * §4.6 rule that every query takes its handle as the first argument -- `tx`
 * satisfies exactly the same parameter as `db`.
 *
 * It cannot test code that opens AND COMMITS its own top-level transaction, or
 * anything that spans two connections. Use resetDb() for those.
 */
export async function withRollback(fn: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await testDb.transaction(async (tx) => { await fn(tx); throw new Rollback(); });
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }
}

/** The escape hatch. CASCADE handles the FK order for us. */
export async function resetDb(): Promise<void> {
  await testDb.execute(sql`
    TRUNCATE TABLE users, readings, reading_cards, events,
                   daily_summaries, moderation_flags, onboarding_answers,
                   lotus_avatars, profiles
    RESTART IDENTITY CASCADE`);
}

export async function closeTestDb(): Promise<void> { await client.end(); }
```

**Step 4: The first integration test, which also proves the harness**

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import { findUserByGoogleSub, upsertProfile } from './profile';
import { users } from '@/lib/db/schema';

afterAll(closeTestDb);

describe('profile queries', () => {
  it('rolls back, so tests cannot see each other', async () => {
    await withRollback(async (tx) => {
      await tx.insert(users).values({ googleSub: 'probe', email: 'p@example.com' });
      expect(await findUserByGoogleSub(tx, 'probe')).not.toBeNull();
    });
    // A new transaction. If the rollback did not happen, this is not null and
    // every other integration test in this repo is quietly sharing state.
    await withRollback(async (tx) => {
      expect(await findUserByGoogleSub(tx, 'probe')).toBeNull();
    });
  });

  it('does not find a soft-deleted user', async () => {
    await withRollback(async (tx) => {
      await tx.insert(users).values({
        googleSub: 'gone', email: 'g@example.com', deletedAt: new Date(),
      });
      expect(await findUserByGoogleSub(tx, 'gone')).toBeNull();
    });
  });

  it('returns local_date as a YYYY-MM-DD string, not a Date', async () => {
    // Roadmap §7. This assertion is why the column is mode: 'string', and it
    // is the one that will catch a well-meaning "fix" to mode: 'date'.
    await withRollback(async (tx) => {
      const [u] = await tx.insert(users)
        .values({ googleSub: 'tz', email: 't@example.com' }).returning();
      const p = await upsertProfile(tx, {
        userId: u.id, fullName: 'X', nickname: 'X', birthDate: '1990-03-14',
      });
      expect(p.birthDate).toBe('1990-03-14');
      expect(typeof p.birthDate).toBe('string');
    });
  });
});
```

The rollback test is not ceremony. If `withRollback` silently commits, every
integration test in this repo still passes individually and starts failing in a
different order six weeks from now.

**Step 5: Verify**

```sh
npm run db:up
npm run db:test:reset
npm run test:integration     # expect 3 passed
npm test                     # expect the unit suite, unchanged, and FAST
docker stop jmtarot-pg && npm test   # STILL PASSES -- this is the real check
docker start jmtarot-pg
```

That last pair is the point of the whole task: `npm test` must not care whether
Postgres is running.

**Step 6: Commit**

---

### Task 7: The dev seed

W5 has to build card-frequency verdicts, chained readings and per-day summaries.
Against an empty table, all three render as their empty state and the actual
features are unverifiable. This task produces two weeks of plausible history.

**Files:**
- Create: `scripts/db-seed.ts`
- Modify: `package.json`

**Step 1: Guard rails first**

```ts
if (process.env.NODE_ENV === 'production') throw new Error('refusing to seed production');
if (!process.env.DATABASE_URL?.includes('127.0.0.1')) {
  throw new Error('refusing to seed a non-local DATABASE_URL');
}
```

The seed deletes before it inserts. Both guards are cheap and the failure mode
they prevent is not recoverable.

**Step 2: Deterministic randomness**

```ts
/**
 * mulberry32. A fixed seed, so the seeded history is byte-identical on every
 * machine and every run -- which is what lets W5 assert an EXACT top-two card
 * pair instead of "some pair". `Math.random()` would make the frequency
 * feature testable only loosely, and loosely is how an off-by-one window bound
 * survives.
 *
 * Also: this file is a script, so the CLAUDE.md rule about never shuffling in
 * a useState initialiser does not apply -- but the reasoning behind it does.
 * An impure seed is a seed you cannot write an assertion against.
 */
function mulberry32(seed: number) { /* the standard five lines */ }
const rand = mulberry32(0x4a4d5441);   // 'JMTA'
```

**Step 3: Idempotency by deletion, not by upsert**

```ts
await db.delete(users).where(inArray(users.googleSub, ['dev:miftah', 'dev:jodith']));
```

`ON DELETE CASCADE` clears profiles, answers, lotus, readings, reading_cards and
summaries. `events` and `moderation_flags` are `SET NULL`, so orphaned rows
survive — delete those by `user_id` first, explicitly. This also happens to
exercise the erasure path roadmap §8 promises in the privacy policy, which makes
`npm run db:seed` the cheapest test that cascade deletion actually works.

**Step 4: What to create**

- **Two users.** `dev:miftah` and `dev:jodith`, per `## The two hardcoded users`.
  `locale: 'id'` and `locale: 'en'` respectively — one of each, so W6 has an
  English user to look at without editing a row by hand.
- **A profile each**, with a real-looking `full_name`, `nickname` and
  `birth_date`. Use `mode: 'string'` dates written as literals.
- **Six onboarding answers for `dev:miftah`.** Four free-text, **written through
  `encryptField`** so the seeded data exercises the real path — a seed that
  writes plaintext into `answer_text` makes the audit query fail and teaches the
  next person the wrong thing. One (`worst_thing`) is `skipped: true` with
  `answer_text: null`, because roadmap §8 requires the skip path to work and it
  must be represented in the fixtures. Two closed answers in `answer_choice`.
  `dev:jodith` gets **no** answers — the "onboarding not done" state W3 needs.
- **A Lotus avatar for `dev:miftah` only.** `summary_id` and `summary_en` both
  filled, ~40 words each, `source_version: 1`, `model: 'seed'`. Write it to
  respect the no-therapy rule (roadmap §8's last bullet): "carries a heavy
  memory of loss", never "trauma".
- **14 days of readings for `dev:miftah`**, 1–3 per day, drawn across all three
  readers and all three services. `local_date` computed as
  `todayKey(new Date(Date.now() - d * 86400e3))` — the **local** helper from
  `src/lib/storage.ts`, not `toISOString()`, for exactly the reason its comment
  gives. Give three of the days two or more readings, so the per-day summary has
  something to summarize; leave one day empty, so the "nothing today" branch is
  reachable.
- **A rigged card distribution.** Bias the draws so that over the last 7 days
  the top two by count are **Strength (8)** and **The Hanged Man (12)**, in that
  order and with a clear margin. That is the pair in the roadmap's own worked
  sentence, so W5 can assert against a known answer:
  `"Minggu ini semesta membacamu sebagai Strength di atas The Hanged Man."`
  Do not make it a tie.
- **`reading_cards` via `insertReading`**, not by direct insert. The seed should
  go through the same query module the app does; otherwise it is not evidence
  that the query module works.
- **A handful of `events`** across the taxonomy W4 will define, with `props`
  populated, so W4 has non-empty jsonb to look at.
- **Nothing in `moderation_flags`.** W7 owns that table and its content is
  sensitive by definition; an empty table is the correct starting state.

**Step 5: Verify**

```sh
npm run db:seed
PGPASSWORD=jmtarot psql -h 127.0.0.1 -p 5432 -U jmtarot -d jmtarot -tAc \
  "select card_id, count(*) from reading_cards rc
     join readings r on r.id = rc.reading_id
    where r.local_date >= (current_date - 7)
    group by card_id order by 2 desc, 1 limit 3"
```

Expected: `8` first, `12` second, with a gap. Then:

```sh
# The §8 audit query. Must return 0.
PGPASSWORD=jmtarot psql ... -tAc \
  "select count(*) from onboarding_answers
    where answer_text is not null and answer_text not like 'v1.%'"

# Idempotency: run it twice and the counts must be identical.
npm run db:seed && PGPASSWORD=jmtarot psql ... -tAc \
  "select (select count(*) from users), (select count(*) from readings)"
```

Then `npm run db:studio` and look at it. Reading the seeded rows by eye is how
you notice that a summary is in the wrong language or that every reading landed
on the same day.

**Step 6: Commit**

---

### Task 8: Documentation and the handover

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `.env.example`, `docs/DEPLOY-VERCEL.md`

**Step 1: `CLAUDE.md`**

It currently states "No database: profile and daily state live in
`localStorage`, and a reading is not persisted at all" in the first paragraph,
and `docs/plans/2026-07-25-jmtarot-web-rewrite.md`'s decision table has
"Reading history — Not stored". Roadmap D12 reverses that. Do not delete the
old line; replace it and say what overturned it, the way `CLAUDE.md` already
handles the three obsolete iOS warnings — otherwise someone reads the rewrite
plan, believes there is no database, and writes another `localStorage` accessor.

Add, under Environment:

```sh
npm run db:up        # docker compose; Postgres 16 on 127.0.0.1:5432
npm run db:migrate   # apply committed migrations
npm run db:seed      # two dev users and two weeks of fake history
npm test             # unit only. No database. Keep it that way.
npm run test:integration   # needs db:up
```

And add to **Traps**, because each of these cost time to find:

- **The native `postgresql-16` on this machine is on port 5433, has no `miftah`
  role, and needs an interactive sudo to set one up.** The project uses Docker on
  5432 instead. Do not "helpfully" point `DATABASE_URL` at 5433.
- **Port 3000 is permanently occupied by another project's Grafana container**,
  so `npm run dev` lands on 3001. This is not intermittent.
- **`docker exec ... pg_isready` races initdb.** The bootstrap server listens on
  the unix socket only, reports ready, then shuts down. Probe over TCP from the
  host instead.
- **`drizzle-kit` does not load `.env.local`.** It is not Next. `drizzle.config.ts`
  imports `dotenv/config`.
- **`drizzle-kit push` is banned**; only `generate` + `migrate`. See
  `src/lib/db/migrations/README`.
- **`local_date` and `birth_date` are strings, not Dates**, on purpose, and the
  reason is the same one in `todayKey()`'s comment.

**Step 2: `README.md`** — add the three-command local setup before `npm run dev`.

**Step 3: `docs/DEPLOY-VERCEL.md`** — add a short, honest section saying the
database is local-only (roadmap D5), that no production `DATABASE_URL` exists
yet, and that `src/lib/db/client.ts` names the three settings that change when
one does. Do not write a deployment procedure for a host nobody has chosen.

**Step 4: Verify the whole loop from a cold start**

The real test of the documentation, and the one that catches a forgotten step:

```sh
docker compose down -v          # throw the database away entirely
npm run db:up && npm run db:migrate && npm run db:seed
npm run db:test:reset && npm run test:integration
npm test && npm run typecheck && npm run build
```

All six must pass with no manual intervention and no sudo.

**Step 5: Commit**

---

## Open questions for reconciliation

Ordered by how much damage getting them wrong does.

1. **What is in the JWT's `sub` — `users.id` or the Google `sub`?** (W2, blocking)
   Every signature in `## Interfaces I export` takes `userId: string` meaning
   `users.id`. If W2 puts the Google `sub` in the token instead, every request
   gains a `users` lookup before it can do anything, which violates the
   roadmap's first non-negotiable ("no DB read on the request-render path").
   **W1's position: the JWT carries `users.id`,** looked up once at sign-in.
   W2 must confirm.

2. **Does `crypto.ts` take an AAD, and is it required?** (W3, blocking)
   W1 ships `encryptField(plaintext, aad)` with `aad` **required**, plus an
   exported `answerAad(userId, questionKey)` so W3 cannot invent a second
   format. If W3's plan assumes a one-argument `encryptField(text)`, one of the
   two must move before either is implemented — and it must be W3, because an
   optional AAD is an AAD that is not passed.

3. **Should `moderation_flags.question` be encrypted too?** (W7)
   Roadmap §8 mandates encryption for `onboarding_answers.answer_text` and says
   nothing about this column — which will contain the text of questions
   classified as self-harm, violence or worse. That is at least as sensitive as
   the onboarding answers and it lands in the table *because* it is sensitive.
   **W1's recommendation: encrypt it with the same primitive**, AAD
   `moderation_flags:<user_id ?? 'anon'>`, and have the privacy policy say so.
   The cost is that it becomes unsearchable, which for a table nobody queries by
   content is not a cost. This is W7's call.

4. **Rename `lotus_avatars.summary_id` / `summary_en` to `body_id` / `body_en`.**
   (§3 owner)
   `summary_id` is text, not a foreign key, and §3 states the `<singular>_id`
   FK convention twenty lines above declaring it. `body_id`/`body_en` matches
   `readings.body` and `daily_summaries.body`, removes the ambiguity, and costs
   one line in `schema.ts` **if it is done before W3 writes against it**. After
   that it is a migration and a rename across two workstreams. Cheap now,
   annoying in a week.

5. **Do the two hardcoded accounts survive at all?** (W2)
   `## The two hardcoded users` assumes yes, as dev-only rows behind
   `DEV_PASSWORD_LOGIN`.
   If W2 decides Google login is the only path even locally, the seed's two
   users still make sense as fixtures, `AUTH_USERS` and
   `src/lib/auth/users.ts` are deleted outright, and `.env.example` loses its
   `$`-escaping warning — which would be a genuine simplification.

6. **`check (card_id between 0 and 21)` on `reading_cards`?**
   The route already bounds it with zod and the deck is fixed at the 22 Majors.
   A constraint would catch a bug at write time and would have to be dropped the
   day anyone adds the Minor Arcana. **W1's position: skip it**, but it is a
   one-line delta if reconciliation disagrees.

7. **`events` has no retention policy.** It is the analytics firehose and it
   grows without bound with no partitioning and no TTL. That is fine for two
   users and not fine for a public app. W4 should say what the ceiling is; W1
   will add whatever it decides, but is not going to invent a retention policy
   on W4's behalf.

---

## The two hardcoded users

They exist today as bcrypt hashes in `AUTH_USERS`, parsed by
`src/lib/auth/users.ts`, which fails closed on a malformed value. Roadmap D2
removes password login once Google works but keeps it behind
`DEV_PASSWORD_LOGIN=1` so that local development and Vitest never need a Google
round-trip. That leaves a gap D2 does not close: a dev login produces a
username, and every table in §3 hangs off a `users.id` that only exists if
somebody inserted the row.

**W1's answer, and the contract W2 builds against:**

1. **`AUTH_USERS` is unchanged and stays dev-only.** Same JSON, same bcrypt
   hashes, same `$`-escaping rule, same fail-closed parse. `parseUsers()` and
   `verifyCredentials()` in `src/lib/auth/users.ts` are not W1's to delete; W2
   decides their fate (see `## Open questions for reconciliation`, item 5).

2. **Each gets a real `users` row** with:
   ```
   google_sub     'dev:miftah'  /  'dev:jodith'
   email          'miftah@dev.local'  /  'jodith@dev.local'
   email_verified false
   display_name   'Miftah'  /  'Jodith'
   locale         'id'  /  'en'
   ```
   The `dev:` prefix cannot collide with a real Google `sub`, which is a
   decimal string of digits. It is also greppable, which makes
   `delete from users where google_sub like 'dev:%'` a safe and obvious cleanup.

3. **Created by `npm run db:seed`, never by a migration.** Migrations are
   schema. A migration that inserts application rows runs in production too, and
   the entire point of these accounts is that they do not exist there. This is
   the rule, not just this instance: **no migration in this project inserts a
   row.**

4. **W2's dev password route resolves the username to the row via
   `google_sub = 'dev:' + username`.** It must not invent a second identity
   scheme, and it must not create the row on the fly — if the seed has not been
   run, the login should fail.

5. **That failure mode is the second lock, and it is free.** Production never
   runs the seed, so the `dev:` rows do not exist there. If `DEV_PASSWORD_LOGIN`
   were ever set in production by accident, the password would verify against
   `AUTH_USERS` and then the user lookup would find nothing and the login would
   fail. Fail-closed by construction rather than by remembering, which is the
   same property `parseUsers()` already has.

6. **Nothing is migrated from `localStorage`.** Each browser holds a `{name,
   birthDate}` pair and there are two of them. W3's onboarding asks for more
   than that anyway — a nickname and six questions — so the honest thing is to
   let both of them walk through it once. Say so when it is noticed; it will
   look like data loss and it is not.

---

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Six plans written against a signature that then changes | The whole point of writing them in parallel evaporates. | `## Interfaces I export` is the contract, and every signature in it was typechecked against `drizzle-orm@0.45.2` before this document was written. Changes go through reconciliation. |
| A workstream edits `schema.ts` for a table it does not own | Roadmap §10 already names schema drift as the most likely way this becomes a mess. | Seven rules in Task 3 step 5, put in `migrations/README` where a merge conflict will actually surface them. `_journal.json` conflicts get an explicit resolution procedure. |
| `local_date` is treated as a timestamp somewhere | Roadmap §7's exact trap: the daily summary appears at 7am Jakarta and the day's readings split across two rows. Nothing looks broken. | `mode: 'string'` makes the wrong thing awkward, and Task 6 has an assertion that will fail if anyone "fixes" it. |
| The integration harness makes `npm test` need Docker | The fast loop is used a hundred times a day and the slow one a few times a week. Merging them loses the fast one. | `npm test` is `--project unit`. Task 6 step 5 verifies it passes with Postgres stopped. |
| `withRollback` silently commits | Every integration test passes in isolation and the suite starts failing in a different order weeks later. | The first integration test asserts the rollback itself, in a second transaction. |
| `FIELD_ENCRYPTION_KEY` is lost or rotated | Every onboarding answer becomes unreadable. There is deliberately no re-encryption path. | It degrades to `null` and reads as "skipped", which roadmap §8 already requires the app to handle. Documented in `.env.example` in those words, so the consequence is known before the key is generated rather than after. |
| Something writes plaintext into `answer_text` | The privacy policy would then say something untrue. | `encryptField` throws rather than falling back; the seed goes through the real path; the `not like 'v1.%'` audit query is in Task 7's verification and in the column's own comment. |
| The Docker password ends up somewhere real | It is committed in `docker-compose.yml`. | Loopback-only binding, dev-only data, and a comment in the file saying it must never be reused. W7's secrets audit should confirm it appears nowhere else. |
| D5 arrives and `max: 10` goes to production | Connection exhaustion under concurrency, which shows up as intermittent 500s and not as an obvious pool problem. | The three-knob comment block is in `client.ts` at the point of change, not in a document. |
