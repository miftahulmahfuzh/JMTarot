/**
 * The URL builder and the kill switch. Unit — `server-only` is aliased to its own
 * `empty.js` by `vitest.config.ts`, so importing this module is fine, and nothing
 * asserted here reaches `handle()` and therefore nothing reaches the driver.
 *
 * The origin is worth its own test because it is read from the environment at CALL
 * time, and the failure mode of getting that wrong is a production build carrying
 * `http://localhost:3001` inside every link somebody sent to a friend.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveShare, shareOrigin, sharingEnabled, shareUrl, SHARE_RESOLVE_CACHE_MS } from './links';
import { newSlug } from './slug';

const KEYS = ['SHARE_BASE_URL', 'AUTH_URL', 'SHARING_ENABLED'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('shareOrigin', () => {
  it("prefers SHARE_BASE_URL, falls back to AUTH_URL's ORIGIN", () => {
    process.env.SHARE_BASE_URL = 'https://s.example';
    process.env.AUTH_URL = 'https://www.jmtarot.site';
    expect(shareOrigin()).toBe('https://s.example');

    delete process.env.SHARE_BASE_URL;
    /*
     * THE ORIGIN, NOT THE STRING. AUTH_URL is allowed to carry a path, and a share
     * URL built by concatenation would come out as `.../some/path/s/<slug>` --
     * which resolves to nothing and is unfixable from the chat message it is in.
     */
    process.env.AUTH_URL = 'https://www.jmtarot.site/some/path';
    expect(shareOrigin()).toBe('https://www.jmtarot.site');
  });

  it('never returns a trailing slash', () => {
    process.env.SHARE_BASE_URL = 'https://s.example/';
    expect(shareOrigin()).toBe('https://s.example');
    process.env.SHARE_BASE_URL = 'https://s.example///';
    expect(shareOrigin()).toBe('https://s.example');
  });

  it('falls back to the dev origin, which is 3001 and not 3000', () => {
    // Port 3000 is permanently held by another project's Grafana container, so
    // 3001 is the app's real dev origin rather than a guess.
    expect(shareOrigin()).toBe('http://localhost:3001');
  });

  it('reads the environment at CALL time, not at module scope', () => {
    process.env.SHARE_BASE_URL = 'https://one.example';
    expect(shareOrigin()).toBe('https://one.example');
    process.env.SHARE_BASE_URL = 'https://two.example';
    expect(shareOrigin()).toBe('https://two.example');
  });

  it('does not throw on an unparseable value', () => {
    process.env.SHARE_BASE_URL = 'not a url/';
    expect(shareOrigin()).toBe('not a url');
  });
});

describe('shareUrl', () => {
  it('builds /s/<slug>', () => {
    process.env.AUTH_URL = 'https://www.jmtarot.site';
    expect(shareUrl('abcdefghjkmn')).toBe('https://www.jmtarot.site/s/abcdefghjkmn');
  });

  it('is only 39 characters at the production origin', () => {
    // The whole reason the slug is twelve and the prefix is `/s/`: one line of a
    // WhatsApp bubble at any phone width.
    process.env.AUTH_URL = 'https://www.jmtarot.site';
    expect(shareUrl(newSlug())).toHaveLength(39);
  });
});

describe('sharingEnabled', () => {
  it('only the exact string 0 disables it', () => {
    expect(sharingEnabled()).toBe(true); // unset
    process.env.SHARING_ENABLED = '1';
    expect(sharingEnabled()).toBe(true);
    process.env.SHARING_ENABLED = '';
    expect(sharingEnabled()).toBe(true);
    /*
     * A TYPO LEAVES THE FEATURE ON, following ANALYTICS_ENABLED's rule -- the
     * opposite of RATELIMIT_BACKEND's, because there a typo must not disable
     * enforcement and here a typo must not silently kill a shipped feature.
     */
    process.env.SHARING_ENABLED = 'flase';
    expect(sharingEnabled()).toBe(true);
    process.env.SHARING_ENABLED = 'no';
    expect(sharingEnabled()).toBe(true);

    process.env.SHARING_ENABLED = '0';
    expect(sharingEnabled()).toBe(false);
  });
});

describe('resolveShare', () => {
  it('answers null for a malformed slug WITHOUT reaching the database', async () => {
    /*
     * This test can only pass because the validation happens first. There is no
     * database configured in the unit project and `handle()` would throw on
     * `import('@/lib/db/client')`, so a `resolveShare` that queried before
     * validating would fail here rather than return null -- which is exactly the
     * property worth asserting: one fewer round trip per garbage request on the
     * one denial-of-service surface in the release.
     */
    for (const bad of ['', 'abc', 'a'.repeat(13), 'aaaaaaaaaaa!', "' or 1=1--", null, 7]) {
      await expect(resolveShare(bad)).resolves.toBeNull();
    }
  });
});

describe('the resolve cache', () => {
  it('is off, because a stale positive would outlive a revoke', () => {
    // If this ever becomes non-zero, somebody has decided how long a revoked link
    // may keep working. That is a decision with a number attached and it belongs
    // in a commit message, not in a default.
    expect(SHARE_RESOLVE_CACHE_MS).toBe(0);
  });
});
