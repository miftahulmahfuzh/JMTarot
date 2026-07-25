'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';
import styles from './login.module.css';

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        // refresh() so the server re-evaluates the session for the layout;
        // push() alone can serve a cached logged-out render.
        router.replace('/');
        router.refresh();
        return;
      }

      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? 'Tidak bisa masuk. Coba lagi.');
    } catch {
      setError('Tidak bisa terhubung. Periksa koneksimu.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <span className={styles.eyebrow}>Major Arcana</span>
        <h1 className={styles.title}>JMTarot</h1>

        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="username">
              Nama pengguna
            </label>
            <input
              id="username"
              className={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              /* iOS Keychain offers to fill and to save on these two names.
                 It matters more than it looks: each of them types this
                 password exactly once. */
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Kata sandi
            </label>
            <input
              id="password"
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <p className={styles.error} role="alert" aria-live="polite">
            {error}
          </p>

          <button className={styles.submit} type="submit" disabled={busy}>
            {busy ? 'Membuka…' : 'Masuk'}
          </button>
        </form>
      </div>
    </main>
  );
}
