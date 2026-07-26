import { redirect } from 'next/navigation';
import { signIn } from '@/lib/auth/auth';
import { currentUser } from '@/lib/auth/server';
import styles from './login.module.css';

/**
 * One button. It is the first screen a stranger sees, on a phone, and the only
 * screen in this app whose job is to be trusted.
 *
 * A SERVER COMPONENT WITH A SERVER ACTION FORM. No 'use client', no useState, no
 * useRouter, no next-auth/react, no SessionProvider. It ships zero auth JavaScript
 * and works before hydration -- which for the screen that gates everything else is
 * worth more than any interactivity it gives up.
 */

/** Auth.js appends `?error=<code>` here because `pages.signIn` points at us. */
function errorMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    /*
     * Our own `signIn` callback refused: an unverified Google email, or an account
     * whose sign-in upsert failed. Deliberately vague about which -- "that address
     * is not verified" tells a stranger which addresses exist here.
     */
    case 'AccessDenied':
      return 'Akun itu tidak bisa dipakai untuk masuk. Coba akun Google lain.';
    /*
     * Everything else: Configuration, OAuthCallbackError, Verification, and
     * whatever a future beta adds. NEVER render the raw code -- it is English,
     * it means nothing to the querent, and it leaks which library we run.
     */
    default:
      return 'Tidak bisa masuk sekarang. Coba lagi sebentar.';
  }
}

/**
 * Only a path on this origin.
 *
 * Auth.js's default `redirect` callback already restricts to same-origin, so this
 * is the second of two checks -- worth it, because an open redirect on a login page
 * is the one that gets used. The `//` case is the whole reason a bare
 * `startsWith('/')` is not enough: `//evil.example` is a protocol-relative URL that
 * a browser reads as another origin.
 */
function safeCallback(raw: string | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  /*
   * A signed-in user must not be shown a dead button.
   *
   * `currentUser()` AND NOT `auth()`, and the difference is a redirect loop.
   * Middleware decides "signed in" by narrowing the session with `readToken()`;
   * if this page decided it by session truthiness instead, a token that Auth.js
   * happily decodes but `readToken` rejects -- one from a previous deploy, one with
   * no `uid` -- would make middleware send `/` here and this line send it straight
   * back. ONE predicate, used on both sides, is the only version of this that
   * cannot loop.
   */
  if (await currentUser()) redirect('/');

  const { callbackUrl, error } = await searchParams;
  const redirectTo = safeCallback(callbackUrl);
  const message = errorMessage(error);

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <span className={styles.eyebrow}>Major Arcana</span>
        <h1 className={styles.title}>JMTarot</h1>

        <p className={styles.tagline}>
          Tiga pembaca, dua puluh dua Major Arcana, satu bacaan untuk hari ini.
        </p>

        {message ? (
          <p className={styles.error} role="alert" aria-live="polite">
            {message}
          </p>
        ) : null}

        <form
          className={styles.form}
          action={async () => {
            'use server';
            await signIn('google', { redirectTo });
          }}
        >
          <button className={styles.submit} type="submit">
            <GoogleMark />
            Masuk dengan Google
          </button>
        </form>

        <p className={styles.legal}>
          Dengan masuk, kamu setuju pada <a href="/terms">Syarat &amp; Ketentuan</a> dan{' '}
          <a href="/privacy">Kebijakan Privasi</a>.
        </p>

        <p className={styles.disclaimer}>Untuk hiburan. Bukan nasihat medis, hukum, atau finansial.</p>
      </div>
    </main>
  );
}

/**
 * Google's four-colour "G".
 *
 * THE ONE PLACE IN THIS APP WITH HEX VALUES THAT ARE NOT DESIGN TOKENS, and it is
 * not an oversight: this is a trademark asset and the colours are Google's, not
 * ours to harmonise. Do not "fix" it to var(--gold).
 *
 * Inline rather than fetched, because a strict no-external-hosts posture is already
 * load-bearing here -- next/font self-hosts, the art is local -- and a remote logo
 * would be the only third-party request the app makes, on its most sensitive page.
 */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
