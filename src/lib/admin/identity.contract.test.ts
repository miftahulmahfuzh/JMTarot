import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * `identity.ts` cannot be exercised behaviourally in the unit project -- it reaches
 * `currentUser()`, which reaches NextAuth at module scope and the Postgres driver
 * behind it -- so the fences are source-level, exactly as
 * `src/app/s/[slug]/page.contract.test.ts` and
 * `src/app/api/share/route.contract.test.ts` already do for the same reason.
 * The BEHAVIOUR is covered by `allowlist.test.ts` (the decision) and by loop 5
 * plus `tools/admin/probe.sh` (the three identities against a real deployment).
 */
const SRC = readFileSync('src/lib/admin/identity.ts', 'utf8');

describe('the admin gate answers 404 and NEVER 403 (A-D2, A1-1)', () => {
  it('names 404 and neither 401 nor 403', () => {
    expect(SRC).toMatch(/status:\s*404/);
    expect(SRC).not.toMatch(/status:\s*401/);
    expect(SRC).not.toMatch(/status:\s*403/);
  });

  it('sends NO body with the refusal, because the body is the tell', () => {
    // `NextResponse.json({ error: ... }, { status: 404 })` is a body no unmatched
    // route in this app produces. §1.2, and R35: byte-identity with Next's own
    // 404 is explicitly NOT claimed -- an empty body is what is claimed.
    expect(SRC).toMatch(/new NextResponse\(null,\s*\{\s*status:\s*404/);
    expect(SRC).not.toMatch(/NextResponse\.json\([^)]*404/s);
  });

  it('calls notFound() for the page form', () => {
    expect(SRC).toContain("from 'next/navigation'");
    expect(SRC).toMatch(/notFound\(\)/);
  });
});

describe('the refusal path is silent (A1-1, and the fifth W2 trap)', () => {
  it('logs nothing at all', () => {
    /*
     * A warning naming the caller's email is the obvious diagnostic and it writes
     * a querent's email into the platform log for the crime of typing a URL.
     * CLAUDE.md states the rule three times -- flush.ts, moderation/log.ts,
     * auth.ts -- and W2 paid for it in production on 2026-07-28. There is nothing
     * here worth logging: the answer is in the 404.
     */
    expect(SRC).not.toMatch(/console\.(log|warn|error|info)/);
  });
});

describe('the module boundary', () => {
  it('reads ADMIN_EMAILS and does not re-implement the compare', () => {
    expect(SRC).toContain('process.env.ADMIN_EMAILS');
    expect(SRC).toContain("from './allowlist'");
    expect(SRC).not.toMatch(/toLowerCase\(\)/); // that lives in the leaf
  });

  it('goes through currentUser() and never a session read or a cookie (A1-7)', () => {
    expect(SRC).toContain("from '@/lib/auth/server'");
    expect(SRC).not.toMatch(/\bauth\(\)/);
    expect(SRC).not.toMatch(/cookies\(\)/);
  });

  it('touches no database', () => {
    // A1-10. Identity stays database-free (roadmap §6's first non-negotiable),
    // and a read here would lock the admin out during the outage they need the
    // dashboard for. R38: self-deletion is therefore not revocation either.
    expect(SRC).not.toMatch(/@\/lib\/db/);
  });

  it('does not memoise the allowlist at module scope', () => {
    /*
     * A module-level `const` freezes the value for the lifetime of a warm lambda,
     * so a redeploy that REMOVED an admin would take effect on a cold start and
     * not before -- a revocation mechanism that sometimes does not revoke. A-D1
     * accepts that revocation costs a redeploy; it must not also be a lottery.
     * The same trap `origin.ts` records for `NEXT_PUBLIC_SITE_ORIGIN`.
     */
    expect(SRC).toMatch(/function allowlist\(\)/);
    expect(SRC).not.toMatch(/^const\s+\w*(ALLOWLIST|allowlist)\w*\s*=/m);
  });
});
