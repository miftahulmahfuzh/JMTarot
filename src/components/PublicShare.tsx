'use client';

import { useState } from 'react';
import { track } from '@/lib/analytics/track.client';
import { useT } from '@/lib/i18n/LocaleProvider';
import type { PublicSurface } from './PublicShell';
import styles from './PublicShare.module.css';

/**
 * Share a public page. **Web Share API, then clipboard, then nothing (S-D8).**
 *
 * ── IT NEVER TOUCHES `/api/share`, AND `SHARE_ENTITIES` IS NOT EXTENDED ─────
 *
 * `src/lib/share/**` mints 60-bit capability URLs for PRIVATE artifacts and
 * requires a session. A lore page's URL is already public and is already its own
 * canonical address, so minting a `/s/<slug>` for it would manufacture a
 * **`noindex` duplicate of a page we are trying to get indexed** -- the exact
 * opposite of this release's purpose -- and would spend a per-user rate-limit
 * budget to do it. No session, no network, no row.
 *
 * ── THE URL IS A PROP, AND THAT IS THE WHOLE DESIGN ─────────────────────────
 *
 * `siteOrigin()`'s chain reads `AUTH_URL`, `VERCEL_PROJECT_PRODUCTION_URL` and
 * `VERCEL_URL`. None carries a `NEXT_PUBLIC_` prefix, so **in this bundle they are
 * `undefined` and the chain collapses to `http://localhost:3001`** -- and the
 * querent shares a link to their own laptop. `resolve.ts`'s header records
 * `localeSwitcherEnabled()` making precisely this mistake and living in
 * `LocaleSwitch.tsx` for about ten minutes. So the server page, which already
 * computed the canonical for its `<link rel="canonical">`, passes the same string
 * down. **Two fences hold it there**: `clientBoundary.test.ts` on the direct
 * import, and `scripts/audit-secrets.ts`'s TRANSITIVE walk, which is the half that
 * matters once a helper sits in between.
 *
 * ── `manual` IS NOT A GAP ───────────────────────────────────────────────────
 *
 * `navigator.share` is unavailable on desktop and `navigator.clipboard` needs a
 * secure context and a user gesture. When both fail the querent is left selecting
 * the address bar, and reporting that honestly is the only way the ratio is ever
 * visible -- `share.copied`'s `method` prop set that precedent.
 */
export function PublicShare({
  url,
  title,
  surface,
  slug,
}: {
  /** The page's canonical, absolute. Computed on the server. */
  url: string;
  /** What a share sheet shows as the title. The page's own <h1> text. */
  title: string;
  surface: PublicSurface;
  slug: string | null;
}) {
  const t = useT();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function onShare() {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title, url });
        track('public.link_shared', { from: surface, method: 'webshare', slug });
        return;
      } catch {
        /* A dismissed sheet lands here too, so fall through rather than reporting
           a failure the querent caused on purpose. */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
      track('public.link_shared', { from: surface, method: 'clipboard', slug });
    } catch {
      setState('failed');
      track('public.link_shared', { from: surface, method: 'manual', slug });
    }
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.button} onClick={onShare}>
        {t('public.share.button')}
      </button>
      {state !== 'idle' ? (
        <p className={styles.status} role="status" aria-live="polite">
          {t(state === 'copied' ? 'public.share.copied' : 'public.share.failed')}
        </p>
      ) : null}
    </div>
  );
}
