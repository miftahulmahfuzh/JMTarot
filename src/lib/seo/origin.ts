/**
 * The one place that decides what this site's origin is.
 *
 * ── WHY THIS FILE EXISTS AT ALL (S-D11) ─────────────────────────────────────
 *
 * `src/app/robots.ts` carried an explicit refusal to import `shareOrigin()` from
 * `@/lib/share/links`, because that pulls `server-only`, `queries/share.ts` and
 * the whole Drizzle schema into a route whose entire output is four lines of
 * text. That refusal was right and it left a hole: `sitemap.ts`, `metadataBase`
 * and forty-four content pages' `generateMetadata` all need the same answer, and
 * the alternative to a leaf is each of them reading `process.env` its own way.
 *
 * **TWO FUNCTIONS THAT INDEPENDENTLY DECIDE THIS SITE'S ORIGIN WILL DISAGREE THE
 * FIRST TIME THE DOMAIN CHANGES, AND THE SYMPTOM IS A CANONICAL TAG POINTING AT
 * THE WRONG HOST — WHICH DE-INDEXES THE CORRECT PAGE.** That is the single worst
 * class of SEO bug available and nothing reports it. So there is one chain, here,
 * and `shareOrigin()` delegates to it.
 *
 * ── NO IMPORTS. A LEAF STAYS A LEAF ─────────────────────────────────────────
 *
 * No `server-only`, no `@/lib/db`, no `@/lib/i18n`, no `next/*`. `robots.ts`,
 * `sitemap.ts` and `layout.tsx` all import it and each of those is a route whose
 * module graph is worth keeping small. `origin.test.ts` also asserts the absence,
 * because "it imports nothing" is the property, not the current line count.
 *
 * ── READ AT CALL TIME, NEVER AT MODULE SCOPE ────────────────────────────────
 *
 * A module-scope `const` is inlined by the bundler and freezes the local value
 * into the production build. `resolve.ts` and `share/links.ts` both record this
 * for the same shape; there is a test.
 *
 * ── THE CHAIN, AND THE ONE RUNG THE ROADMAP DID NOT NAME ────────────────────
 *
 *   NEXT_PUBLIC_SITE_ORIGIN          the explicit answer. What production sets.
 *   AUTH_URL                         **ADDED BY RECONCILIATION R10.**
 *   VERCEL_PROJECT_PRODUCTION_URL    the project's production host, bare.
 *   VERCEL_URL                       the per-deployment host, bare. LAST RESORT.
 *   http://localhost:3001            dev. 3001 because port 3000 is permanently
 *                                    held by another project's Grafana container.
 *
 * `AUTH_URL` is a rung because production already sets it to
 * `https://www.jmtarot.site` and `docs/DEPLOY-VERCEL.md` §5 leans on exactly that
 * for `shareOrigin()`. Without it, a deployment that forgot
 * `NEXT_PUBLIC_SITE_ORIGIN` falls through to a Vercel host and silently emits
 * canonicals for a domain nobody typed. With it, the app has to be misconfigured
 * in two places before that can happen. **S-D11's point is answered honestly by
 * that rung and not despite it: the leaf holds EVERY rung `shareOrigin()` had,
 * or delegating would be a behaviour change disguised as a refactor.**
 *
 * **NOTHING UNDER `'use client'` MAY CALL THIS.** `AUTH_URL` and both Vercel
 * variables carry no `NEXT_PUBLIC_` prefix, so in a browser bundle they inline as
 * `undefined` and the chain silently collapses to `http://localhost:3001` — the
 * exact trap `localeSwitcherEnabled()` recorded when it "lived in
 * `LocaleSwitch.tsx` for about ten minutes". A client component that needs an
 * absolute URL is handed one as a prop by the server page that owns it, which is
 * how `shareUrl()` already works. `clientBoundary.test.ts` carries the fence.
 */

/** The dev origin. 3001, never 3000 — see CLAUDE.md `## Traps`. */
const DEV_ORIGIN = 'http://localhost:3001';

export function siteOrigin(): string {
  const explicit = normalize(process.env.NEXT_PUBLIC_SITE_ORIGIN);
  if (explicit) return explicit;

  const authUrl = normalize(process.env.AUTH_URL);
  if (authUrl) return authUrl;

  /*
   * Both Vercel variables are BARE HOSTS with no scheme. `new URL('www.x.site')`
   * throws, and a canonical without a scheme is not a URL at all.
   */
  const production = normalize(process.env.VERCEL_PROJECT_PRODUCTION_URL, 'https://');
  if (production) return production;

  const deployment = normalize(process.env.VERCEL_URL, 'https://');
  if (deployment) return deployment;

  return DEV_ORIGIN;
}

/**
 * `${siteOrigin()}${path}`, with exactly one slash between them.
 *
 * REFUSES AN ABSOLUTE INPUT rather than passing it through. Every caller is
 * building a canonical, an `hreflang` or a sitemap entry from a route this app
 * owns; an absolute string arriving here means somebody is about to canonicalise
 * a page at a host we do not control, and returning it unchanged would make that
 * silent.
 */
export function absoluteUrl(path: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) {
    throw new Error(`absoluteUrl expects a relative path, got: ${path}`);
  }
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${siteOrigin()}${suffix}`;
}

/**
 * Trim, prefix a scheme if asked, take the ORIGIN, drop a trailing slash.
 *
 * TOTAL BY CONSTRUCTION. `metadataBase` is `new URL(siteOrigin())` and a throw
 * there is a 500 on every page in the app, so an unparseable value falls to the
 * next rung rather than propagating.
 */
function normalize(raw: string | undefined, scheme = ''): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    return new URL(value.includes('://') ? value : `${scheme}${value}`).origin;
  } catch {
    return null;
  }
}
