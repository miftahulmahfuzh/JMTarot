/**
 * Every Auth.js endpoint: /api/auth/signin, /signout, /session, /csrf,
 * /callback/google, /callback/credentials, /providers.
 *
 * Pinned to Node because `auth.ts` reaches the Postgres driver and bcryptjs, and
 * neither runs on the edge. `src/middleware.ts` imports `config.ts` instead and so
 * stays edge-safe -- see that file's header.
 *
 * The path is FIXED: `/api/auth` is Auth.js's `basePath`, and the provider id
 * completes it. `/api/auth/callback/google` is what has to be registered in the
 * Google console, character for character. Do not invent a prettier path.
 *
 * `gate.isPublic()` lets all of `/api/auth/` through. Gating it would send the
 * Google callback to /login, which sends the user to Google, which returns to the
 * callback -- an infinite loop that logs nothing.
 */
import { handlers } from '@/lib/auth/auth';

export const runtime = 'nodejs';

export const { GET, POST } = handlers;
