/**
 * What the public page is allowed to know. CLIENT-REACHABLE, so no
 * `@/lib/db/**` specifier appears here — not even `import type`, because
 * `src/lib/clientBoundary.test.ts`'s regex does not know the `type` keyword.
 * Same reason `src/lib/history/types.ts` exists one directory over.
 *
 * **`question` AND `nickname` ARE ABSENT KEYS RATHER THAN NULLABLE FIELDS**, so a
 * component cannot render a field the query did not fetch and a refactor cannot
 * "helpfully" pass `?? ''`.
 *
 * **THE QUESTION IS NOW ALWAYS PRESENT** (Miftah, 2026-07-28, reversing VD9): a
 * shared reading without its question cannot be followed by the stranger it was
 * sent to. So this shape no longer guards the common case -- it guards the
 * CAPABILITY, and it still governs the nickname, which keeps its switch.
 * `schema.ts`'s comment on `include_question` records the ruling and its cost.
 *
 * Nothing here carries the slug. The slug is the capability (VD9); the page has
 * it in the URL already and nothing below the page needs it, while
 * `share_links.id` grants nothing and is what the analytics props carry.
 */
import type { Locale, ReaderId, ServiceId, YesNo } from '@/data/types';
import type { ShareEntity } from './slug';

/** One card of the shared draw, as `reading_cards` stores it. */
export type PublicShareCard = {
  /** 0..21. */
  cardId: number;
  reversed: boolean;
  /** 0-based slot in the spread. Rendered in this order, not array order. */
  position: number;
};

/**
 * The link itself, as the public page may see it.
 *
 * NO `slug`, NO `userId`, NO `viewCount`. The page needs the id (for the two
 * analytics events), the entity, and the two toggles so it can render what the
 * sharer chose. Everything else on the row is either a capability or somebody
 * else's business.
 */
export type ShareLinkPublic = {
  id: string;
  entity: ShareEntity;
  includeQuestion: boolean;
  includeNickname: boolean;
};

/** Everything a shared reading shows regardless of the two toggles. */
type PublicReadingBase = {
  id: string;
  readerId: ReaderId;
  serviceId: ServiceId;
  /** `'YYYY-MM-DD'`. The SHARER'S own calendar day, never recomputed. */
  localDate: string;
  /** ISO 8601. */
  createdAtIso: string;
  /** VD7: the language the prose came out in. Immutable, and NOT the viewer's. */
  locale: Locale;
  /** `effectiveYesNo()`'s machine verdict, stored at draw time. */
  verdict: YesNo | null;
  body: string;
  cards: PublicShareCard[];
};

/**
 * A shared reading. **THE ABSENT KEYS ARE THE FEATURE.** See the header.
 *
 * `question` and `nickname` appear only when the link opted in, and
 * `publicReadingQuery` does not put either column in the projection otherwise —
 * so an excluded value never enters this process, never enters a driver error's
 * bound parameters, and never enters the RSC flight payload the browser
 * downloads. The question opts in by default now; the nickname still asks.
 */
export type PublicReading = PublicReadingBase & {
  question?: string | null;
  nickname?: string | null;
};

/**
 * V8's artifact, declared so `'persona'` can sit in the union inert.
 *
 * **THERE IS NO `personas` TABLE YET** — V8 owns it and has not shipped. The
 * shape is V7's plan's `## Interfaces I need`, recorded here so the day V8 lands
 * the change is one query and not a redesign. `publicPersonaForShare` answers
 * `null` until then, which is exactly the answer an artifact that does not exist
 * deserves and is indistinguishable from an orphan (§3.4).
 */
export type PublicPersonaFacts = {
  lifePath: number;
  expression: number;
  soulUrge: number;
  sunSign: string;
  element: string;
  modality: string;
  topCardId: number;
  topReaderId: ReaderId;
};

export type PublicPersona = {
  body: string;
  locale: Locale;
  facts: PublicPersonaFacts;
  createdAtIso: string;
  nickname?: string | null;
};

/**
 * What `resolveShare` hands the page. One shape per entity, so the page's own
 * narrowing decides which renderer runs.
 */
export type ResolvedShare =
  | { entity: 'reading'; link: ShareLinkPublic; reading: PublicReading }
  | { entity: 'persona'; link: ShareLinkPublic; persona: PublicPersona };
