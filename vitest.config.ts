import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/*
 * Vitest runs the logic layer only -- deck maths, prompt assembly, question
 * sanitization, session tokens, the rate limiter. There are deliberately no
 * browser tests: Chromium cannot launch in this WSL image without
 * sudo-installed libraries, so Playwright is not in this project and should
 * not be added. Visual checks happen in a real browser against `npm run dev`,
 * and touch behaviour on a real iPhone against a Vercel preview URL.
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
    include: ['src/**/*.test.ts'],
  },
});
