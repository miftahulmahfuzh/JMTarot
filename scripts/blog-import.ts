/**
 * The four committed blog documents, into Postgres. **v0.5.0 / A6, §13.**
 *
 * **A SCRIPT, NOT A MIGRATION** (roadmap §0.4: *no migration in this project inserts a
 * row*), on the `db:seed` precedent — a migration runs in production too, and the
 * whole point of a seeded row is that it is a decision somebody takes rather than a
 * side effect of a deploy. It is **not** in `npm run build`.
 *
 *     npm run blog:import            # apply
 *     npm run blog:import -- --dry   # print what it would do, write nothing
 *     npm run blog:import -- --force # overwrite a row an admin has since edited
 *
 * ── UNLIKE `db-seed.ts`, THERE IS NO `127.0.0.1` GUARD AND NO `NODE_ENV` REFUSAL ─
 *
 * **Production is where this script is MEANT to run**, once, and A6-34 below is what
 * makes that safe. `db-seed.ts` refuses both because it DELETES before it inserts;
 * this one only ever upserts, and it refuses to overwrite anything a person has
 * touched.
 *
 * ── THE RULES IT INHERITS FROM `scripts/**` ────────────────────────────────
 *
 * **No top-level `await`** — there is no `"type": "module"`, so tsx transforms to CJS
 * and a top-level await is a syntax error at run time rather than at typecheck.
 * `async function main()` + `main().catch(...)`.
 *
 * **It never imports `@/lib/db/client`**, which starts with `import 'server-only'`
 * and throws outside a Next server bundle. It builds its own postgres.js client and
 * loads `.env.local` itself, exactly as `db-seed.ts` does.
 *
 * It **does** import `BLOG_ARTICLES` from `@/content/blog`. It is the last consumer,
 * and **the deletion commit (task 26) deletes this script along with the registry.**
 *
 * ── A6-33. IT WRITES THE COMMITTED DATES, NOT THE CLOCK ────────────────────
 *
 * All four documents carry `datePublished: '2026-07-29'` and
 * `dateModified: '2026-07-29'`. **An import that let the defaults fire would move
 * `BlogPosting.dateModified` on four indexed pages to the day we migrated, and
 * `sitemap.xml`'s `lastModified` with it — announcing to every crawler that four
 * articles changed when not one word did.** That is a spam signal for a database
 * migration. It also destroys §13.3's oracle, which is the only proof the move was
 * lossless.
 *
 * ── A6-34. IT REFUSES TO OVERWRITE A ROW AN ADMIN HAS SINCE EDITED ─────────
 *
 * **This script will be run twice — the second time by somebody checking whether the
 * first worked.** If `blog_post_locales.updated_at` is NEWER than the committed
 * `dateModified`, the row has been edited through the CMS and re-running would
 * silently revert an author's work. It skips that row, says which and why, and exits
 * non-zero if any row was skipped. `--force` is the only way past.
 *
 * ── IT LINTS BEFORE IT WRITES (§6.4's fourth caller, in effect) ────────────
 *
 * Deliberately not counted among R43's three: it lints the same documents
 * `lore.test.ts`'s sibling already covers. It is here so that **the import cannot
 * introduce prose the API would have refused** — which would leave the database in a
 * state the editor cannot save back.
 *
 * It gates on the ERROR class only. The four documents used to carry **eight warnings
 * between them**, all one finding: every hero `alt` is the bare card name.
 *
 * **THAT DEFECT IS NOW FIXED RATHER THAN PRINTED, AND THE PARAGRAPH ABOVE IS KEPT
 * BECAUSE IT WAS RIGHT ABOUT WHOSE FAULT IT WAS.** It was *"a real defect in v0.4.0's
 * prose rather than a mis-calibrated lint"*, and it was knowingly imported. `alt` is no
 * longer read from the committed document at all: `heroAltForDoc` derives it from the
 * card's own `LoreDoc.imageAlt`, which is the string `lore.test.ts` already holds to >=60
 * characters and to not opening with the card name. **So re-running this script is the
 * repair for the four live rows**, and the eight warnings are gone at the source.
 */
import { config } from 'dotenv';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { BLOG_ARTICLES } from '@/content/blog';
import { resolveViolations } from '@/lib/content/blogResolve';
import { heroAltFor } from '@/lib/content/heroAlt';
import { formatViolation, hasErrors, lintDocument, rulesFor, type LintDoc } from '@/lib/content/lint';
import * as schema from '@/lib/db/schema';
import { blogPostLocales, blogPosts } from '@/lib/db/schema';
import { wordCount } from '@/lib/content/doc';

config({ path: '.env.local', quiet: true });

/**
 * The hero pair for one committed document, with `alt` DERIVED.
 *
 * **THROWS RATHER THAN WRITING A HALF-SET PAIR.** The CHECK constraint
 * `blog_post_locales_hero_pair_ck` asserts `hero_card_slug IS NULL = hero_alt IS NULL`, so
 * a `null` from `heroAltFor` beside a non-null slug is a constraint violation mid-
 * transaction with a driver error naming a column. A script may throw; it has an operator
 * reading its output, which is the whole difference between here and the request path.
 */
function heroLinted(doc: LintDoc): LintDoc {
  const alt = heroAltForDoc(doc);
  return doc.hero !== null && alt !== null
    ? { ...doc, hero: { cardUrlSlug: doc.hero.cardUrlSlug, alt } }
    : doc;
}

function heroAltForDoc(doc: LintDoc): string | null {
  if (doc.hero === null) return null;
  const alt = heroAltFor(doc.hero.cardUrlSlug, doc.locale);
  if (alt === null) {
    throw new Error(
      `${doc.slug}.${doc.locale}: hero card '${doc.hero.cardUrlSlug}' has no lore document, so there is no alt to derive`,
    );
  }
  return alt;
}

const FORCE = process.argv.includes('--force');
const DRY = process.argv.includes('--dry');

type Outcome = 'inserted' | 'updated' | 'skipped';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local.');

  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  /*
   * **EVERY DOCUMENT IS LINTED BEFORE ANY ROW IS WRITTEN**, so a single violation
   * stops the whole import rather than leaving two of four articles in. A half-imported
   * blog is the state in which somebody runs it again to "finish", which is exactly
   * what A6-34 then has to reason about.
   */
  const docs = BLOG_ARTICLES.flatMap((entry) =>
    entry.locales.map((locale) => ({
      entry,
      locale,
      doc: entry.docs[locale]!,
      /*
       * **THE LINT SEES THE DERIVED `alt`, NOT THE COMMITTED ONE**, so what it reports is
       * what the row will hold. Linting the committed string would print the eight
       * warnings this change exists to remove and would be judging prose nobody stores.
       */
      lint: heroLinted({ ...entry.docs[locale]!, slug: entry.slug } as LintDoc),
    })),
  );

  const knownSlugs = BLOG_ARTICLES.map((e) => e.slug);
  let refused = false;
  for (const { entry, locale, lint } of docs) {
    const violations = [
      ...lintDocument(lint, rulesFor(entry.slug)),
      ...resolveViolations(lint, knownSlugs),
    ];
    for (const v of violations) {
      console.log(`  ${entry.slug}.${locale}  ${formatViolation(v)}`);
    }
    if (hasErrors(violations)) {
      console.error(`REFUSED: ${entry.slug}.${locale} has error-class violations.`);
      refused = true;
    }
  }
  if (refused) {
    await client.end();
    process.exitCode = 1;
    return;
  }

  const outcomes: { name: string; outcome: Outcome; reason?: string }[] = [];

  for (const entry of BLOG_ARTICLES) {
    for (const locale of entry.locales) {
      const doc = entry.docs[locale]!;
      const revision = entry.revisions[locale]!;
      const name = `${entry.slug}.${locale}`;
      /*
       * A6-33. The committed date, at midnight UTC, so `utcDay()` reads it back as
       * exactly `'2026-07-29'` -- `blogRow.ts` formats with `toISOString().slice(0,10)`
       * and a local-midnight `Date` would be the previous day for anyone east of
       * Greenwich. The same trap `local_date` names, in reverse.
       */
      const modified = new Date(`${revision.dateModified}T00:00:00.000Z`);

      const existing = await db
        .select({ updatedAt: blogPostLocales.updatedAt })
        .from(blogPosts)
        .innerJoin(blogPostLocales, eq(blogPostLocales.postId, blogPosts.id))
        .where(and(eq(blogPosts.slug, entry.slug), eq(blogPostLocales.locale, locale)));

      const prior = existing[0]?.updatedAt ?? null;
      if (prior !== null && prior.getTime() > modified.getTime() && !FORCE) {
        outcomes.push({
          name,
          outcome: 'skipped',
          reason: `edited through the CMS at ${prior.toISOString()} — re-importing would revert it. Use --force.`,
        });
        continue;
      }

      if (DRY) {
        outcomes.push({ name, outcome: prior === null ? 'inserted' : 'updated' });
        continue;
      }

      await db.transaction(async (tx) => {
        const [post] = await tx
          .insert(blogPosts)
          .values({
            slug: entry.slug,
            datePublished: entry.datePublished,
            createdAt: modified,
            updatedAt: modified,
          })
          .onConflictDoUpdate({
            target: blogPosts.slug,
            set: { datePublished: entry.datePublished, updatedAt: modified },
          })
          .returning({ id: blogPosts.id });

        await tx
          .insert(blogPostLocales)
          .values({
            postId: post.id,
            locale,
            // Step 5: every imported document is `published`. These four are live today.
            status: 'published',
            title: doc.title,
            description: doc.description,
            heroCardSlug: doc.hero?.cardUrlSlug ?? null,
            /*
             * **DERIVED, NOT TRANSCRIBED, AND THAT IS A CORRECTION TO WHAT THESE FOUR
             * ROWS ALREADY HOLD.** All four committed documents spell `alt` as the card's
             * own name -- `'The World'`, `'The High Priestess'`, `'The Hermit'` -- which is
             * the one thing `LoreDoc.imageAlt` forbids and `lore.test.ts` refuses on the
             * forty-four lore pages. `hero-pair` is warning-class and this script writes
             * `status: 'published'` directly rather than through `changeStatus`, so the
             * gate that would have caught it was never on the path that made the rows.
             *
             * Re-running this script is therefore the repair for the four live rows. See
             * `@/lib/content/heroAlt`.
             */
            heroAlt: heroAltForDoc(doc),
            body: doc.body,
            createdAt: modified,
            updatedAt: modified,
          })
          .onConflictDoUpdate({
            target: [blogPostLocales.postId, blogPostLocales.locale],
            set: {
              status: 'published',
              title: doc.title,
              description: doc.description,
              heroCardSlug: doc.hero?.cardUrlSlug ?? null,
              heroAlt: heroAltForDoc(doc),
              body: doc.body,
              // A6-33 again: the COMMITTED date, never `now()`.
              updatedAt: modified,
            },
          });
      });

      outcomes.push({ name, outcome: prior === null ? 'inserted' : 'updated' });
    }
  }

  console.log(DRY ? '\nblog:import --dry — nothing was written\n' : '\nblog:import\n');
  for (const entry of BLOG_ARTICLES) {
    for (const locale of entry.locales) {
      const doc = entry.docs[locale]!;
      const name = `${entry.slug}.${locale}`;
      const o = outcomes.find((x) => x.name === name)!;
      console.log(
        `  ${name.padEnd(26)} ${String(wordCount(doc.body)).padStart(5)} words  ` +
          `${String(doc.body.length).padStart(3)} blocks  ${o.outcome}` +
          (o.reason ? `\n      ${o.reason}` : ''),
      );
    }
  }

  const skipped = outcomes.filter((o) => o.outcome === 'skipped');
  if (skipped.length > 0) {
    console.error(`\n${skipped.length} row(s) skipped. Nothing was reverted. Exit 1.`);
    process.exitCode = 1;
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
