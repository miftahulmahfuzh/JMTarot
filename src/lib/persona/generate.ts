import 'server-only';

/**
 * The impure half of the persona: the read, the model call, the write.
 *
 * EVERYTHING STATEFUL ABOUT THE PERSONA IS IN THIS ONE FILE, and that is where the
 * query-module contract put it rather than a preference. `queries/persona.ts` holds
 * two queries that each take the handle first; a hash function, a facet rotation
 * and a staleness predicate have no handle to take. `contract.test.ts` is what
 * makes that a wall — the same one W3 hit with the Lotus cache and W5 with
 * `windowBounds`.
 *
 * ── THREE ABSOLUTES, STATED AS ABSOLUTES ─────────────────────────────────────
 *
 * 1. **`generatePersona` NEVER THROWS.** Every failure path writes the fallback, so
 *    the user ends up with a body regardless, and an `after()` that rejects is an
 *    unhandled rejection in a serverless invocation nobody is watching.
 * 2. **IDEMPOTENT.** If the stored row already matches the current hash and source
 *    version it returns `unchanged` after two indexed reads. That is what makes
 *    calling it from a write path affordable.
 * 3. **NO COOLDOWN, AND THE ABSENCE IS DELIBERATE.** `lotus.generate.ts` has one
 *    because the READING path fires a speculative repair behind somebody else's
 *    reading; that path does not exist here. The only reader is `/account`, and it
 *    is allowed to wait. **Adding a cooldown "for symmetry" reintroduces W3's bug:**
 *    its ten minutes swallowed a user-caused answer edit, leaving `input_hash`
 *    byte-identical and `updated_at` frozen — the delete button being a lie. The
 *    throttle that DOES exist is `personaStaleness`'s, on the read path, and it is a
 *    latency decision rather than a correctness one.
 *
 * **THE CALLER SET CHANGED ON 2026-07-29 AND ABSOLUTE 3 IS WHY IT COULD.** The two
 * answer routes no longer call this at all — an answer edit defers to the next
 * `/account` open, which is one model call per edit instead of two. `/api/account/facts`
 * still calls it directly, because a facts edit happens ON this page with the
 * paragraph in view. What makes the deferral safe is `personaStaleness`'s
 * `'user-edit'` arm: it reports an answer edit as stale REGARDLESS of the floor and
 * the route regenerates in front of the response rather than behind it. Delete that
 * arm and A13's rule is broken from the other side.
 *
 * THERE IS ALSO NO IN-PROCESS CACHE. `getLotusBlock`'s exists because a READING
 * needs its block on the request path. Nothing here is on a request path that
 * matters, `/account` is visited occasionally, and a cache serving a
 * just-regenerated persona from a stale entry is a worse bug than a second lookup.
 *
 * The pure half — the contract, the hash, the rotation, the checks, the fallback —
 * is `prompt.ts`, and it is where every rule worth testing lives.
 */
import {
  LOTUS_COLORS,
  WISH_KINDS,
  isFreeText,
  type LotusColor,
  type WishKind,
} from '@/data/onboarding';
import type { Locale } from '@/data/types';
import { db } from '@/lib/db/client';
import { recentReadingIds, topCardAllTime, topReaderAllTime, readingCountAllTime } from '@/lib/db/queries/allTime';
import { getLotusAvatar } from '@/lib/db/queries/lotus';
import { answersUpdatedAt, getAnswers } from '@/lib/db/queries/onboarding';
import { getPersona, upsertPersona } from '@/lib/db/queries/persona';
import { getProfile } from '@/lib/db/queries/profile';
import { getProvider } from '@/lib/llm';
import type { CallClass } from '@/lib/llm/meter';
import { correspondencesFor } from '@/lib/numerology';
import {
  PERSONA_PROMPT_VERSION,
  PERSONA_SOURCE_VERSION,
  buildPersonaPrompt,
  facetsFor,
  fallbackPersona,
  isPersonaStale,
  personaStaleness,
  personaFactsFor,
  personaInputHash,
  personaSafetyCheck,
  type PersonaFacet,
  type PersonaFacts,
  type PersonaInput,
  type PersonaRejectReason,
  type PersonaStaleness,
} from './prompt';

/** What actually happened, for the log and for `persona.generated`. */
export type PersonaOutcome = {
  ok: boolean;
  /** True when the stored body is the template rather than the model's. */
  fallback: boolean;
  reason?: PersonaRejectReason | 'no_profile' | 'not_completed' | 'unchanged' | 'error';
  ms: number;
  model: string;
  locale: Locale;
  /** For the event. Empty when the run never got as far as choosing them. */
  facets: PersonaFacet[];
  readingCount: number;
};

/**
 * What `/account` and V7's share page render. THE READ, with no generation.
 *
 * `nickname` is the querent's own and is NOT in the body — `personaSafetyCheck`
 * rejects a body containing it (A14), which is what makes
 * `share_links.include_nickname: false` an honest column rather than a checkbox
 * that does nothing.
 */
export type PersonaView = {
  body: string;
  /** The locale the BODY is in. May differ from the viewer's; V2 translates. */
  locale: Locale;
  facts: PersonaFacts;
  nickname: string | null;
  updatedAt: string;
  /** True when the stored body is the deterministic template. */
  fallback: boolean;
};

/**
 * The persona is a different job from writing a reading — it runs occasionally
 * rather than nine times a day, and it may want a stricter model. Defaulting to
 * `LLM_MODEL` means nobody has to set it.
 */
function personaModel(): string {
  return process.env.PERSONA_MODEL || process.env.LLM_MODEL || 'unknown';
}

/** Dev and test: write the template, make no network call. NEVER in production. */
function stubbed(): boolean {
  return process.env.PERSONA_STUB === '1' && process.env.NODE_ENV !== 'production';
}

/**
 * The read-path floor under regeneration (A13), in seconds.
 *
 * READ HERE AND PASSED IN, so `prompt.ts` stays free of `process.env` — exactly as
 * `summary.ts`'s `isStale` takes its own threshold. Defensive parse: a
 * non-numeric value must not become `NaN`, which would make every comparison false
 * and silently disable the floor.
 *
 * **3600 IS A GUESS, NOT A MEASUREMENT** (V8's open question 6). `input_hash` moves
 * on every reading, so this number decides how often a heavy user pays for a model
 * call, and it cannot be calibrated before there is a heavy user. Recorded so
 * whoever finds it wrong knows it was never a finding.
 */
export function personaMinAgeSeconds(): number {
  const raw = Number(process.env.PERSONA_MIN_AGE_SECONDS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 3600;
}

/** An unrecognised jsonb value reads as absent. See `personaMaterial`. */
function asColour(raw: unknown): LotusColor | null {
  return typeof raw === 'string' && (LOTUS_COLORS as readonly string[]).includes(raw)
    ? (raw as LotusColor)
    : null;
}

function asWishKind(raw: unknown): WishKind | null {
  return typeof raw === 'string' && (WISH_KINDS as readonly string[]).includes(raw)
    ? (raw as WishKind)
    : null;
}

/** Everything both the generator and the route need, in one round of reads. */
type Material = {
  profile: { fullName: string; nickname: string; birthDate: string };
  facts: PersonaFacts;
  inputHash: string;
  facets: PersonaFacet[];
  lotusSummary: string | null;
  colour: LotusColor | null;
  introversion: number | null;
  wishKind: WishKind | null;
  rawAnswers: string[];
  /**
   * `max(onboarding_answers.updated_at)`, or null. **NOT prompt material** — it is
   * here because `personaMaterial` is the one round of reads `/account` pays for,
   * and `personaStaleness` needs it to tell a user's answer edit from ordinary
   * hash drift. Reading it separately would be a seventh query on that page.
   */
  answersTouchedAt: Date | null;
};

/**
 * Read everything, compute the hash, choose the facets. NO MODEL CALL.
 *
 * Exported because `/api/persona` needs the hash to decide staleness BEFORE
 * deciding whether to generate, and reading it twice would double six queries on
 * the one page that does its reads on the render path's behalf.
 *
 * Returns null when there is no profile or onboarding is not complete. **A
 * HALF-WRITTEN ANSWER SET MUST NEVER BE DISTILLED** (L3): row presence is not
 * completion, and a user who abandoned at step 4 has two answers stored.
 */
export async function personaMaterial(userId: string, locale: Locale): Promise<Material | null> {
  const profile = await getProfile(db, userId);
  if (!profile || !profile.completedAt) return null;

  const [answers, avatar, topCard, topReader, readingCount, readingIds, answersTouchedAt] =
    await Promise.all([
      getAnswers(db, userId),
      getLotusAvatar(db, userId),
      topCardAllTime(db, userId),
      topReaderAllTime(db, userId),
      readingCountAllTime(db, userId),
      recentReadingIds(db, userId),
      /* One `max()` over at most six rows on an indexed `user_id`, and it reads no
         text -- see `answersUpdatedAt`. It joins this `Promise.all` rather than
         being a seventh round trip on the page that pays for these. */
      answersUpdatedAt(db, userId),
    ]);

  const bare = {
    fullName: profile.fullName,
    nickname: profile.nickname,
    birthDate: profile.birthDate,
  };

  const facts = personaFactsFor(bare, {
    topCardId: topCard?.cardId ?? null,
    topCardCount: topCard?.count ?? null,
    /*
     * STRICTLY MORE than half, so an even split reads as upright. `cardMeaning` is
     * a pair and the reversed line is a different statement; a 2:2 card has not
     * declared itself, and the upright gloss is the one the deck's own data leads
     * with.
     */
    topCardReversedDominant:
      topCard === null ? null : topCard.reversedCount * 2 > topCard.count,
    topReaderId: topReader?.readerId ?? null,
    readingCount,
  });

  const inputHash = personaInputHash({ profile: bare, answers, readingIds });

  const traits = avatar?.traits ?? null;

  return {
    profile: bare,
    facts,
    inputHash,
    facets: facetsFor(inputHash),
    lotusSummary: avatar?.summary?.[locale]?.trim() || null,
    /*
     * NARROWED AT READ TIME, AND THAT IS NOT CEREMONY. `lotus_avatars.traits` is
     * jsonb typed as `{ color: string | null; introversion: number | null;
     * [key: string]: unknown }` — schema.ts deliberately keeps W3's unions out of
     * itself, so nothing has ever checked these values against the closed sets.
     * jsonb is not validated by postgres either, so a row written before a value
     * set changed can hold anything, and an unrecognised value handed to
     * `COLOUR_LABEL[locale][colour]` would interpolate `undefined` into the prompt.
     * An unknown value reads as absent, which is the same thing a skip is.
     */
    colour: asColour(traits?.color),
    introversion: typeof traits?.introversion === 'number' ? traits.introversion : null,
    wishKind: asWishKind(traits?.wishKind),
    rawAnswers: answers
      .filter((a) => isFreeText(a.key) && !a.skipped && a.text)
      .map((a) => a.text as string),
    answersTouchedAt,
  };
}

/**
 * Write one user's persona, in `locale`, and store it.
 *
 * Call it directly from a write path — a facts edit, a cleared answer — and NEVER
 * through a cooldown. It is idempotent and it never throws.
 */
export async function generatePersona(
  userId: string,
  locale: Locale,
  /**
   * **`interactive` BY DEFAULT, AND THE DEFAULT IS THE POINT.** Every call site is
   * something the querent just did: opened `/account`, renamed themselves, cleared
   * an answer. A quota running low must not silently stop writing personas for
   * people who are actively using the page. The only `deferred` caller is
   * `/api/persona`'s serve-stale branch, where a body is already on screen and its
   * absence costs nothing that is not already absent.
   */
  callClass: CallClass = 'interactive',
  /** Pre-read material, when the caller already has it. Saves six queries. */
  preread?: Material,
): Promise<PersonaOutcome> {
  const started = Date.now();
  const model = personaModel();
  const done = (
    o: Omit<PersonaOutcome, 'ms' | 'model' | 'locale' | 'facets' | 'readingCount'>,
    facets: PersonaFacet[] = [],
    readingCount = 0,
  ): PersonaOutcome => ({
    ...o,
    ms: Date.now() - started,
    model,
    locale,
    facets,
    readingCount,
  });

  try {
    const material = preread ?? (await personaMaterial(userId, locale));
    if (!material) {
      /*
       * Two different absences reported as one, because the caller does the same
       * thing with both: `/api/persona` requires completed onboarding via
       * `requireUser()`, so reaching here means a race with the completion route.
       */
      return done({ ok: false, fallback: false, reason: 'not_completed' });
    }

    const input: PersonaInput = {
      locale,
      facts: material.facts,
      correspondences: correspondencesFor(material.profile, locale),
      lotusSummary: material.lotusSummary,
      colour: material.colour,
      introversion: material.introversion,
      wishKind: material.wishKind,
      facets: material.facets,
    };

    /*
     * IDEMPOTENCE, and it is what makes a write-path call affordable. Checked on
     * the hash AND the locale: a stored `en` body with a matching hash is not the
     * `id` persona somebody just asked to be written, and returning `unchanged`
     * there would leave the wrong language stored forever.
     */
    const existing = await getPersona(db, userId);
    if (
      existing &&
      existing.sourceVersion === PERSONA_SOURCE_VERSION &&
      existing.inputHash === material.inputHash &&
      existing.locale === locale
    ) {
      return done({ ok: true, fallback: false, reason: 'unchanged' }, material.facets, material.facts.readingCount);
    }

    if (stubbed()) {
      return await store(userId, fallbackPersona(input), input, material, model, done, true, undefined);
    }

    const prompt = buildPersonaPrompt(input);
    const { text } = await getProvider().complete(prompt, { op: 'persona', model, callClass });

    /*
     * One paragraph, whatever the model did with the newline rule. Collapsing
     * rather than rejecting: a two-line answer to a one-paragraph prompt is still
     * a usable paragraph, and this renders into a single `<p>`.
     */
    const body = text.replace(/\s+/g, ' ').trim();

    const verdict = personaSafetyCheck(body, locale, {
      nickname: material.profile.nickname,
      fullName: material.profile.fullName,
      birthDate: material.profile.birthDate,
      rawAnswers: material.rawAnswers,
    });

    if (!verdict.ok) {
      /*
       * ANY failure discards the model output ENTIRELY — no partial acceptance, no
       * inline retry. Nobody re-reads this string after it is written, it is about
       * to be renderable on a public page, and a body that failed one rule is a
       * body whose other rules are suspect.
       *
       * The reason is logged and NOT the body: a rejected persona is prose about a
       * person, and the platform log is not where it belongs.
       */
      console.warn('persona rejected by safety check', { userId, locale, reason: verdict.reason });
      return await store(userId, fallbackPersona(input), input, material, model, done, true, verdict.reason);
    }

    return await store(userId, body, input, material, model, done, false, undefined);
  } catch (err) {
    /*
     * NEVER THROWS, and never logs the raw error in production. The caller may be
     * an `after()` with nothing useful to do with one, and an LLM client error can
     * carry the prompt — which carries this querent's Lotus summary. Same rule as
     * `flush.ts`, `log.ts` and `auth.ts`.
     */
    if (process.env.NODE_ENV === 'development') {
      console.error('persona generation failed', { userId, err });
    } else {
      console.error('persona generation failed', {
        userId,
        name: err instanceof Error ? err.name : typeof err,
      });
    }
    return done({ ok: false, fallback: false, reason: 'error' });
  }
}

/** The one write, shared by the three paths that reach it. */
async function store(
  userId: string,
  body: string,
  input: PersonaInput,
  material: Material,
  model: string,
  done: (
    o: Omit<PersonaOutcome, 'ms' | 'model' | 'locale' | 'facets' | 'readingCount'>,
    facets?: PersonaFacet[],
    readingCount?: number,
  ) => PersonaOutcome,
  fallback: boolean,
  reason: PersonaRejectReason | undefined,
): Promise<PersonaOutcome> {
  await upsertPersona(db, {
    userId,
    body,
    locale: input.locale,
    /*
     * The engine's output verbatim, as the row's audit trail. `facts` is a
     * `Record<string, unknown>` column and this is a typed object; the cast is the
     * jsonb boundary and nothing more.
     */
    facts: material.facts as unknown as Record<string, unknown>,
    inputHash: material.inputHash,
    sourceVersion: PERSONA_SOURCE_VERSION,
    /*
     * `'fallback'` when the body is the template. A fallback was produced by no
     * model at all, and writing `glm-4.6` there would make an operator
     * investigating "why does this read like a template" look at the wrong thing.
     */
    model: fallback ? 'fallback' : model,
    promptVersion: PERSONA_PROMPT_VERSION,
  });

  return done({ ok: true, fallback, reason }, material.facets, material.facts.readingCount);
}

/**
 * The read V7 wants: one round trip, NO generation, null if there is no row.
 *
 * **THE PUBLIC PAGE MUST NEVER GENERATE ANYTHING** — V7's rule, and it applies to
 * the persona exactly as it applies to a translation. A stranger's GET on `/s/`
 * triggering a model call is the denial-of-service surface that release worried
 * about, wearing a different hat.
 *
 * `nickname` is a SEPARATE field rather than part of the body, because V7's
 * `include_nickname` switch turns it off — and the body never contains it either
 * (A14), which is what makes that column honest.
 */
export async function readPersonaView(
  userId: string,
  includeNickname = true,
): Promise<PersonaView | null> {
  const row = await getPersona(db, userId);
  if (!row) return null;

  let nickname: string | null = null;
  if (includeNickname) {
    const profile = await getProfile(db, userId);
    nickname = profile?.nickname ?? null;
  }

  return {
    body: row.body,
    locale: row.locale,
    facts: row.facts as unknown as PersonaFacts,
    nickname,
    updatedAt: row.updatedAt.toISOString(),
    fallback: row.model === 'fallback',
  };
}

/** Re-exported so a route does not have to import from two persona modules. */
export { isPersonaStale, personaStaleness, type PersonaStaleness };
