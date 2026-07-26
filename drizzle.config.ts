/*
 * drizzle-kit runs outside Next, so IT DOES NOT LOAD `.env.local`. Without the
 * import below you get a baffling "DATABASE_URL is undefined" from a variable
 * that is plainly set for `npm run dev`.
 *
 * `dotenv` rather than `node --env-file`, because --env-file does not
 * understand the `\$` escaping the rest of this project's .env files rely on.
 */
import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env.local', quiet: true });

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './src/lib/db/migrations', // roadmap §4
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  casing: 'snake_case',
  strict: true, // confirm before applying a destructive statement
  verbose: true,
});
