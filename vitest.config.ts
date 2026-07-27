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
 * The `@` alias mirrors tsconfig's `paths`. Vitest does not read tsconfig, so the
 * two have to be kept in step by hand.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      /*
       * `server-only` RESOLVES TO ITS OWN NO-OP HERE, and this is not a hole in
       * the fence (W7 Task 11).
       *
       * The package ships two files. `empty.js` is what the bundler picks under
       * the `react-server` export condition; `index.js` throws, and it is what
       * plain Node -- and therefore Vitest -- gets. The throw is how a Client
       * Component importing a server module becomes a BUILD error, which is the
       * entire value of the marker and is completely unaffected by this line.
       *
       * Without the alias, W7-D14 is unimplementable rather than merely awkward:
       * adding the marker to `src/lib/prompt/**` and `src/lib/moderation/**` --
       * which is the point of that decision -- would break `build.test.ts`,
       * `lotus.test.ts`, `memory.test.ts`, `summary.test.ts`, the base-contract
       * snapshot and the classifier's own tests on import, and the fix people
       * would reach for is deleting the marker. Pointing at the package's OWN
       * empty module rather than at a stub of ours means there is nothing to
       * keep in step if the package ever changes.
       *
       * What still catches a real leak: `next build` (the condition-resolved
       * throw), `clientBoundary.test.ts` (source-level import fence) and
       * `scripts/audit-secrets.ts` (the built-output grep). Three layers, none
       * of which is this one.
       */
      'server-only': fileURLToPath(new URL('./node_modules/server-only/empty.js', import.meta.url)),
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
          /*
           * Reconciliation R20. Analytics writes are off in the fast suite, so
           * a module that forgot to mock its writer fails on an assertion
           * rather than by reaching for Docker. The integration harness sets it
           * back to '1' explicitly for its own tests, and the few unit tests
           * that exercise the enabled path set it per test.
           */
          env: { ANALYTICS_ENABLED: '0' },
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
