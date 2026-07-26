import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/*
 * Two projects, and the split is the point.
 *
 * `unit` is what `npm test` runs and what it has always run: pure logic, no
 * database, no Docker, no network. Deck maths, prompt assembly, question
 * sanitization, session tokens, the rate limiter, togglePick, field
 * encryption, the query-module contract. It must stay fast enough that nobody
 * thinks about running it -- a default test command that needs Docker is a
 * default test command people stop running.
 *
 * `integration` needs `npm run db:up` and a TEST_DATABASE_URL. It applies the
 * COMMITTED migrations to a scratch database once per run -- which incidentally
 * tests that the migration history still applies cleanly from empty -- and
 * rolls back after every test.
 *
 * There are still no browser tests and there must not be: Chromium cannot
 * launch in this WSL image without sudo-installed libraries, so Playwright is
 * not in this project and should not be added. Visual checks happen in a real
 * browser against `npm run dev`, and touch behaviour on a real iPhone against
 * a Vercel preview URL.
 *
 * The alias mirrors tsconfig's `paths`. Vitest does not read tsconfig, so the
 * two have to be kept in step by hand.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
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
          // One database, one migration history, shared by every file.
          // Parallel files would each try to migrate it.
          fileParallelism: false,
        },
      },
    ],
  },
});
