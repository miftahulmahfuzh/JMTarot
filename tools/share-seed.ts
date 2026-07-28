/**
 * Mint one share link against the DEV database, so `tools/share-check.py` has
 * something to look at.
 *
 *     export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
 *     npm run db:up && npm run db:seed
 *     npx tsx tools/share-seed.ts
 *     PORT=3003 npm run dev
 *     python3 tools/share-check.py http://localhost:3003
 *
 * It plants a KNOWN SENTINEL as the reading's question, which is what makes the
 * checker's question assertions exact rather than approximate.
 *
 * It builds its own postgres.js client and does NOT import `@/lib/db/client`,
 * which starts with `import 'server-only'` and throws outside a Next bundle --
 * the rule CLAUDE.md records for everything under `scripts/`.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import postgres from 'postgres';

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const SENTINEL = 'sentinel-question-haruskah-aku-pindah-kerja';

  // Pick a completed reading with three cards and plant a known question on it.
  const [r] = await sql`
    select r.id, r.user_id from readings r
    where r.status = 'ok' and r.body is not null
      and (select count(*) from reading_cards c where c.reading_id = r.id) = 3
    order by r.created_at desc limit 1`;
  if (!r) throw new Error('no shareable reading; run npm run db:seed');
  await sql`update readings set question = ${SENTINEL} where id = ${r.id}`;

  /*
   * `include_question` IS DELIBERATELY NOT NAMED, so the row takes the column
   * default -- which is what a real mint gets and is the thing worth exercising.
   * It was `false` under VD9 and is `true` since 2026-07-28.
   */
  const mk = async (slug: string, revoked: boolean) => {
    await sql`delete from share_links where slug = ${slug}`;
    await sql`
      insert into share_links (slug, user_id, entity, entity_id, include_nickname, revoked_at)
      values (${slug}, ${r.user_id}, 'reading', ${r.id}, true,
              ${revoked ? sql`now()` : null})
      on conflict (user_id, entity, entity_id) do update
        set slug = ${slug}, include_question = default,
            revoked_at = ${revoked ? sql`now()` : null}, updated_at = now()`;
  };

  await mk('aaaaaaaaaaaa', false);
  const rows = await sql`select slug, include_question, revoked_at from share_links`;
  console.log('reading', r.id);
  console.log(rows);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
