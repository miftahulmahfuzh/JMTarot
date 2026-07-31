/**
 * **THE FENCES OVER A5's WHOLE SUBTREE.** v0.5.0 / A5, task 15, plan §9.
 *
 * Modelled on `src/app/s/[slug]/page.contract.test.ts`, and every ABSENCE assertion reads the
 * file with its **comments stripped** — this project's own rule, paid for twice:
 * `queries/contract.test.ts` grepped for `from '../client'` and failed against the sentence
 * *"Never import from '../client'"* in a doc comment, and `adminSurface.test.ts` strips for the
 * same reason. **A rule that fires on prose describing the rule is a rule people delete**, and
 * every file in this subtree documents what it forbids.
 *
 * ── EVERY ASSERTION HERE HAS BEEN SEEN TO FAIL ──────────────────────────────
 *
 * Task 15's acceptance is *"every assertion verified by negative control: temporarily introduce
 * the violation, watch the named test fail, revert."* That was done and the results are recorded
 * in `docs/workstream-notes.md` under A5 — **an assertion nobody has seen fail is an assertion
 * that does not bind**, and two of these did not fire on the first draft.
 */
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** A5's own files: the two pages, their components, the four routes, and the reveal module. */
const APP = globSync('src/app/admin/users/**/*.{ts,tsx}')
  .concat(globSync('src/app/api/admin/**/*.{ts,tsx}'))
  .filter((f) => !f.includes('.test.'));

const ROUTES = globSync('src/app/api/admin/**/route.ts');
const REVEAL = 'src/lib/admin/reveal.ts';
const QUERIES = globSync('src/lib/db/queries/admin/*.ts').filter((f) => !f.includes('.test.'));

function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('the fences are not vacuous', () => {
  it('finds A5 subtree, its routes and its query modules', () => {
    // A glob that matches nothing is a test that always passes.
    expect(APP.length).toBeGreaterThanOrEqual(20);
    expect(QUERIES.length).toBeGreaterThanOrEqual(7);
  });

  it('names every route under /api/admin, and A6 added two, A7 a seventh, the markdown editor an eighth', () => {
    /*
     * **THIS WAS `expect(ROUTES.length).toBe(4)` AND A6 MADE IT SIX.** Every
     * assertion below iterates `ROUTES`, and the glob is the whole `/api/admin/**`
     * tree rather than A5's own — deliberately, because the rules those assertions
     * carry (404 never 403, a literal `maxDuration`, no `after()`, no bare
     * `NextResponse.json`) are the SURFACE's rules and should bind whoever adds a
     * route next. A6's two satisfy all of them, which is the fence working.
     *
     * **NAMED RATHER THAN COUNTED, WHICH IS STRICTLY STRONGER.** A count says the
     * glob is not empty; a list says exactly which routes exist, so an UNOWNED
     * seventh fails loudly — R21's lesson, where `/api/admin/metrics/[metric]` was
     * assigned to "A3/A4", listed as a seam by nobody, and was the cheapest defect in
     * the release to fix and the likeliest to have been built twice.
     *
     * **A7 ADDED `insight/route.ts` ON 2026-07-31, AND THE FENCE DID ITS JOB TWICE
     * BEFORE THAT ROUTE PASSED**: its first draft imported `next/server` and built its
     * own `NextResponse.json`, which the two assertions below caught — so it grew an
     * `insight/shared.ts` like the other two trees. That is this list working as
     * designed, and it is why the glob stays the whole surface rather than A5's own
     * files.
     *
     * **THE MARKDOWN EDITOR ADDED `blog/[slug]/format/route.ts` ON 2026-07-31.** It reuses
     * `blog/shared.ts` rather than growing a fourth copy, which is the outcome A7's entry
     * above was written to produce — and it is the second route on this surface that waits
     * on a model, so it carries the same literal `maxDuration = 60` as its neighbour.
     */
    expect(ROUTES.map((f) => f.replaceAll('\\', '/')).sort()).toEqual([
      'src/app/api/admin/blog/[slug]/format/route.ts',
      'src/app/api/admin/blog/[slug]/status/route.ts',
      'src/app/api/admin/blog/[slug]/translate/route.ts',
      'src/app/api/admin/blog/route.ts',
      'src/app/api/admin/insight/route.ts',
      'src/app/api/admin/users/[id]/answer/[key]/route.ts',
      'src/app/api/admin/users/[id]/moderation/[flagId]/route.ts',
      'src/app/api/admin/users/[id]/reading/[readingId]/route.ts',
      'src/app/api/admin/users/route.ts',
    ]);
  });
});

describe('A5-23 -- no translation machinery anywhere in A5 (A-D12)', () => {
  it('calls no t() and imports no i18n module', () => {
    /*
     * **THIS GREP IS THE WHOLE ENFORCEMENT, NOT DEFENCE IN DEPTH** (R33). A-D12 justified the
     * rule partly by "the catalog ships to the browser on every page" -- but `LocaleProvider`
     * is mounted in the ROOT layout, so it already ships here and that saving does not exist.
     * What is real: ~150 strings in two locales for a surface with one reader, and `id.ts` owns
     * the key set, so every admin string would force an English twin.
     *
     * A1's and A4's own greps cover `src/app/admin/**`; this one adds `@/lib/admin/**`, which
     * neither globs.
     */
    for (const f of [...APP, REVEAL, 'src/lib/admin/types.ts', 'src/lib/admin/userList.ts']) {
      const src = code(f);
      expect(src, f).not.toMatch(/\bgetT\(|\buseT\(|\btFor\(|\buseLocale\(/);
      /*
       * **ONE NAMED EXCEPTION SINCE A6's AUTO-TRANSLATE: `@/lib/i18n/locale`.** The same
       * exception `adminCopy.test.ts` carries, and narrowed the same way so the two
       * fences cannot disagree about one rule — two greps over the same property with
       * different answers is worse than either.
       *
       * A-D12 is about the CATALOG. `locale.ts` is a LEAF whose only imports are types
       * from `@/data/**`; it holds no prose, no key set and no `t`, and what it exports
       * is the two locale CODES and `isLocale`. A route that translates BETWEEN locales
       * has to name them, and the alternative is a hardcoded `['id','en']` in the tree
       * least likely to be updated when a third lands. `@/lib/i18n/t`, `/catalog` and
       * `/locales` all still fail.
       */
      expect(src, f).not.toMatch(/@\/lib\/i18n\/(?!locale['"])/);
    }
  });
});

describe('A5-24 -- the admin tree makes NO model call, on any path', () => {
  it('imports no generator, no prompt layer and no LLM module except prices', () => {
    /*
     * A page that could generate would be `LLM_WINDOW_CALL_CEILING` with an operator's finger on
     * it, on a surface with no per-user budget. §11.2 is the argument for the absence of a
     * "regenerate" button; this is the absence made mechanical.
     *
     * `@/lib/llm/prices` is allowed and is the ONLY allowed `@/lib/llm/**` specifier: it is
     * PURE with zero imports, and A-D7's cost is computed at read time from it.
     */
    for (const f of APP) {
      const src = code(f);
      expect(src, f).not.toMatch(/@\/lib\/persona\//);
      expect(src, f).not.toMatch(/@\/lib\/prompt\//);
      expect(src, f).not.toMatch(/@\/lib\/translate\//);
      expect(src, f).not.toMatch(/\bgenerateLotus\b|\bgeneratePersona\b|\btranslateOrCached\b/);
      for (const spec of src.matchAll(/from '(@\/lib\/llm\/[^']+)'/g)) {
        expect(spec[1], `${f} imports ${spec[1]}`).toBe('@/lib/llm/prices');
      }
    }
  });
});

describe('A5-25 -- no admin write to querent data', () => {
  it('names no insert, update or delete anywhere in A5 except the audit row', () => {
    /*
     * §1 of the roadmap: the only admin writes are blog rows and the audit log. **There is no
     * honest UI for "we changed what you said"**, and the `input_hash` mechanisms behind Lotus
     * and the persona would silently disagree with the rows they were built from.
     *
     * `recordAdminAccess` and `recordUserDetailView` are the exception and they live in
     * `reveal.ts`, which is asserted separately below.
     */
    for (const f of APP) {
      const src = code(f);
      expect(src, f).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
      expect(src, f).not.toMatch(/\bupsert[A-Z]/);
    }
    // And the one write that does exist inserts into exactly one table.
    const reveal = code(REVEAL);
    expect(reveal).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });

  it('imports nothing destructive (A5-30)', () => {
    // No revoke, no redact, no delete, no restore -- not for a share link, not for an account.
    // Re-sharing rotates the slug, so an admin revoke has no undo; and restoring an account is
    // a thing the querent does by signing in.
    for (const f of [...APP, REVEAL]) {
      const src = code(f);
      expect(src, f).not.toMatch(
        /\brevokeAllForUser\b|\bredactForUser\b|\bdeleteAccount\b|\bclearFreeTextAnswers\b|\brevokeShare\b/,
      );
    }
  });
});

describe('A5-26 / A5-27 -- decryption lives in queries/, both sites, and nowhere else', () => {
  it('names no crypto primitive under src/app/**', () => {
    // A decrypt in a route or a component would put the AAD construction next to the response,
    // and **a mismatched AAD is indistinguishable from data loss**.
    for (const f of globSync('src/app/**/*.{ts,tsx}').filter((x) => !x.includes('.test.'))) {
      const src = code(f);
      expect(src, f).not.toMatch(/\bdecryptField\b|\banswerAad\b|\bmoderationFlagAad\b/);
    }
  });

  it('keeps the two decrypt sites to two files', () => {
    /*
     * `onboarding_answers.answer_text` -> `queries/onboarding.ts` (A5-6, and A5 adds NO site).
     * `moderation_flags.question` -> `queries/admin/moderation.ts` (A5-7).
     * The three-file `moderationFlagAad` assertion lives in `moderation.integration.test.ts`,
     * beside the four states it also proves.
     */
    const decryptors = globSync('src/lib/**/*.ts')
      .filter((f) => !f.includes('.test.'))
      .filter((f) => /\bdecryptField\(/.test(code(f)))
      .map((f) => f.replaceAll('\\', '/'))
      .sort();
    expect(decryptors).toEqual([
      'src/lib/db/crypto.ts',
      'src/lib/db/queries/admin/moderation.ts',
      'src/lib/db/queries/onboarding.ts',
    ]);
  });
});

describe('A5-28 / A5-29 -- the audit row is awaited BEFORE the read, and never deferred', () => {
  it('calls recordAdminAccess only from reveal.ts, awaited, and not inside a try', () => {
    /*
     * **THE HIGHEST-VALUE ASSERTION IN THIS FILE, AND IT IS THE WEAKER HALF OF THE PROOF.**
     * The executable half is `src/lib/admin/reveal.integration.test.ts`, which breaks the audit
     * insert with a `pg_temp` trigger and asserts the reveal REJECTS with no plaintext. This
     * fence is what catches the shape changing between runs of that test.
     *
     * Reconciliation R30: written in house style -- swallow and log, like `flushEvents` --
     * A5-10 becomes unimplementable **and looks implemented**.
     */
    const src = code(REVEAL);
    const calls = [...src.matchAll(/recordAdminAccess\(/g)];
    expect(calls.length).toBeGreaterThanOrEqual(4);
    // Every call is awaited.
    expect([...src.matchAll(/await recordAdminAccess\(/g)]).toHaveLength(calls.length);
    // No catch of any shape in the file: not `try`, not `.catch(`, not a swallowed rejection.
    expect(src).not.toMatch(/\btry\b|\.catch\(/);
    // And no route reaches for it directly -- the ordering has one home.
    for (const f of ROUTES) {
      expect(code(f), f).not.toMatch(/recordAdminAccess/);
    }
  });

  it('never uses after() in an admin route', () => {
    // An `after()` callback runs once the response is on its way, which is the exact opposite of
    // "before the response". An audit row written there is written after the plaintext left.
    for (const f of ROUTES) {
      expect(code(f), f).not.toMatch(/\bafter\(/);
      expect(code(f), f).not.toMatch(/from 'next\/server'/);
    }
  });
});

describe('A5-31 / A5-32 -- every route declares its bounds and its cache header', () => {
  it('declares runtime and a literal maxDuration', () => {
    for (const f of ROUTES) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toContain("export const runtime = 'nodejs'");
      // A LITERAL: `adminSurface.test.ts` matches `\d+` because Next reads these exports from
      // the module's static shape, where an imported identifier can be absent.
      expect(src, f).toMatch(/export const maxDuration = \d+/);
    }
  });

  it('answers with private, no-store on every response it constructs', () => {
    // The header is defined once in `shared.ts` and attached by `ok()` and `unavailable()`, so a
    // handler cannot forget it. This asserts the definition exists and that every route goes
    // through the helpers rather than constructing a bare `NextResponse.json`.
    expect(code('src/app/api/admin/users/shared.ts')).toContain('private, no-store');
    for (const f of ROUTES) {
      const src = code(f);
      expect(src, f).toMatch(/\bok\(|\bunavailable\(/);
      expect(src, f).not.toMatch(/NextResponse\.json\(/);
    }
  });

  it('never answers 401 or 403 (A-D2, A5-1)', () => {
    // A 403 confirms the surface exists. A signed-OUT caller does get a 401 -- from middleware,
    // not from these files (R36).
    for (const f of ROUTES) {
      expect(code(f), f).not.toMatch(/status:\s*40[13]/);
    }
  });
});

describe('A5-33 -- AdminReadingDetail is A5s own renderer, and ReadingView is untouched', () => {
  it('does not import ReadingView anywhere in A5', () => {
    for (const f of APP) {
      expect(code(f), f).not.toMatch(/ReadingView/);
    }
  });

  it('leaves ReadingViewProps free of operator-only fields', () => {
    /*
     * **R27's binding reason, asserted on the shared component rather than on A5's.** The admin
     * page needs `status`, `model`, `prompt_version`, tokens, `total_ms`, `session_id` and
     * `shared_at`; adding any of them to `ReadingViewProps` puts operator-only fields on the
     * component that renders `/s/<slug>` to strangers, and **a props type carrying `session_id`
     * is one spread away from a public RSC payload.**
     *
     * This is the assertion that fires if somebody later "unifies" the two renderers.
     */
    const src = code('src/components/ReadingView.tsx');
    for (const field of ['sessionId', 'promptVersion', 'tokenInput', 'tokenOutput', 'totalMs']) {
      expect(src, `ReadingView mentions ${field}`).not.toContain(field);
    }
  });
});

describe('A5-34 -- the list projection carries no prose, and search cannot reach it', () => {
  it('declares no prose field on AdminUserListItem', () => {
    /*
     * Absence is STRUCTURAL (A5-8): a `body: null` field would make `'body' in item === false`
     * unwritable, and *the binding reason is VD8, not bytes*.
     *
     * **SCOPED TO THE ONE TYPE, AND THE FIRST DRAFT WAS NOT.** Read over the whole file this
     * fired on `AdminAnswerReveal.text`, `AdminFlagReveal.question` and
     * `AdminReadingReveal.body` -- which are the one-key-per-request RESPONSE shapes and are the
     * entire point of the design. **A fence that forbids the feature it exists to protect is a
     * fence somebody deletes**, so it reads the `AdminUserListItem` block alone.
     */
    const whole = code('src/lib/admin/types.ts');
    const start = whole.indexOf('export type AdminUserListItem');
    expect(start, 'AdminUserListItem has been renamed').toBeGreaterThan(-1);
    const src = whole.slice(start, whole.indexOf('};', start));
    for (const field of ['body', 'gist', 'question', 'answerText', 'summary', 'persona']) {
      expect(src, `AdminUserListItem declares ${field}`).not.toMatch(
        new RegExp(`\\b${field}\\??:`),
      );
    }
  });

  it('never lets a search term reach a prose column (A5-13)', () => {
    /*
     * A free-text search over what querents wrote is a different product with a different
     * privacy policy, **and it is one `or(...)` away at all times.** The `ilike` in A3's
     * `adminUserList` binds `u.email`; this asserts no A5 file and no admin query module names a
     * prose column in a search context.
     */
    for (const f of [...APP, ...QUERIES]) {
      const src = code(f);
      expect(src, f).not.toMatch(/ilike[^\n]*\b(question|body|gist|answer_text)\b/i);
      expect(src, f).not.toMatch(/\b(question|body|gist)\b[^\n]*ilike/i);
    }
  });
});

describe('the positives, so nothing above passes vacuously', () => {
  it('both pages gate themselves and are real pages', () => {
    for (const f of ['src/app/admin/users/page.tsx', 'src/app/admin/users/[id]/page.tsx']) {
      const src = readFileSync(f, 'utf8');
      // **THE LAYOUT IS NOT THE GATE**: partial rendering, route interception and any future
      // parallel route can reach a page without a parent layout's promise holding.
      expect(src, f).toMatch(/requireAdminPage\(\)/);
      expect(src, f).toMatch(/export default async function/);
      expect(src.length, `${f} is suspiciously short`).toBeGreaterThan(2000);
    }
  });

  it('every route gates itself and answers 404 through A1s helper', () => {
    for (const f of ROUTES) {
      const src = code(f);
      expect(src, f).toMatch(/requireAdmin\(\)/);
      expect(src, f).toMatch(/adminNotFound\(\)|gate\.response/);
    }
  });

  it('the detail page renders all fourteen sections', () => {
    // A section that exists as a file and is never mounted is a panel nobody sees. Fourteen
    // imports, fourteen elements.
    const src = code('src/app/admin/users/[id]/page.tsx');
    for (const name of [
      'Identity',
      'Facts',
      'Answers',
      'Lotus',
      'Persona',
      'Readings',
      'Tokens',
      'Summaries',
      'Verdicts',
      'Translations',
      'ShareLinks',
      'Moderation',
      'EventStream',
      'AccessLog',
    ]) {
      expect(src, `page.tsx does not mount ${name}`).toMatch(new RegExp(`<${name}[\\s/>]`));
    }
  });

  it('the reveal control is mounted exactly three times (A5-D7)', () => {
    // An answer, a flagged question, a reading body. **A second reveal component is how the
    // fourth one ships without a bound.**
    const mounts = APP.filter((f) => /<AdminReveal\b/.test(code(f))).sort();
    expect(mounts).toEqual([
      'src/app/admin/users/[id]/AdminReadingDetail.tsx',
      'src/app/admin/users/[id]/sections/Answers.tsx',
      'src/app/admin/users/[id]/sections/Moderation.tsx',
    ]);
    // And it carries a bound. `REVEAL_ABORT_MS` is 12s against the routes' `maxDuration = 15`.
    const reveal = code('src/app/admin/users/[id]/AdminReveal.tsx');
    expect(reveal).toContain('AbortSignal.timeout(REVEAL_ABORT_MS)');
    // Nothing is fetched on mount: the request IS the asking.
    expect(reveal).not.toMatch(/useEffect/);
  });
});
