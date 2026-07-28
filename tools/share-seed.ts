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
  /*
   * `locale = 'id'` IS PART OF THE FIXTURE, not incidental. `db:seed` writes
   * readings in both locales and this script takes the most recent one, so without
   * pinning it the design-A fixture below can end up being a translation of `en`
   * INTO `en` -- a row that cannot exist in production, exercising the mechanism
   * against a case that proves nothing. Found by checking the seeded row's locale
   * after the page rendered "correctly" for the wrong reason.
   */
  await sql`update readings set question = ${SENTINEL}, locale = 'id' where id = ${r.id}`;

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

  /*
   * ── THE PINNED-LOCALE FIXTURE (design A) ────────────────────────────────────
   *
   * The seeded reading is `id`. This plants an English `translations` row and pins
   * `share_links.locale = 'en'` on a SECOND link, so `/s/bbbbbbbbbbbb` is the
   * case the whole design exists for: a stranger must see the ENGLISH prose, and
   * an English viewer must NOT see `share.public.otherLanguage`.
   *
   * The sentinel is deliberately unmistakable and deliberately NOT a translation
   * of the Indonesian body -- if the page renders the Indonesian, the diff is
   * obvious rather than a judgement call about translation quality.
   *
   * A SECOND ROW IS IMPOSSIBLE on the same artifact -- `unique (user_id, entity,
   * entity_id)` -- so this REPLACES the pin on the one row and reports both slugs.
   * `aaaaaaaaaaaa` therefore stops resolving, which is correct: rotation is how
   * this table works and the checker only ever needs the live slug.
   */
  const EN_SENTINEL =
    'SENTINEL-EN the first card speaks of a threshold you have already crossed.';
  await sql`
    insert into translations (entity, entity_id, field, locale, body, source_locale,
                              model, prompt_version)
    values ('reading', ${r.id}, 'body', 'en', ${EN_SENTINEL}, 'id', 'seed', 'seed-v1')
    on conflict (entity, entity_id, field, locale) do update
      set body = ${EN_SENTINEL}, updated_at = now()`;
  await sql`
    update share_links set slug = 'bbbbbbbbbbbb', locale = 'en', revoked_at = null,
                           updated_at = now()
     where user_id = ${r.user_id} and entity = 'reading' and entity_id = ${r.id}`;

  const rows = await sql`select slug, include_question, locale, revoked_at from share_links`;
  console.log('reading', r.id);
  console.log(rows);
  console.log('\nEN-pinned link:  /s/bbbbbbbbbbbb');
  console.log('expect on that page:');
  console.log('  - the body starting "SENTINEL-EN"');
  console.log('  - NO "written in another language" notice for an EN viewer');
  console.log('  - <div lang="en"> around the body');
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
