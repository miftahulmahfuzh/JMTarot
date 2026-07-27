/**
 * The correspondence engine (V1). Numbers in, meanings out.
 *
 * EVERYTHING OUTSIDE THIS DIRECTORY IMPORTS FROM HERE AND NEVER FROM A LEAF.
 * `purity.test.ts` walks `src/**` and fails on `@/lib/numerology/reduce` and
 * friends. The rule buys one thing: the five-file split can change without a
 * cross-workstream edit, and V3 and V8 both depend on this directory.
 *
 * PURE. No React, no `next/*`, no database, no `server-only` (roadmap §6). The
 * only external dependency is `@/data`, and three consumers need it to stay
 * that way: V8 renders glosses in a client component, V3 calls it from a route
 * handler, and `personNumbers` feeds `personas.input_hash`, which is computed
 * where there is no Next runtime and `server-only` would throw.
 *
 * `birthCard()` IN `src/data/deck.ts` ALSO REDUCES A BIRTH DATE, BY A DIFFERENT
 * RULE, AND THE TWO DELIBERATELY DISAGREE (reconciliation §5.3). It folds to
 * 0–21 with no master halt, because it is picking one of 22 cards; `lifePath`
 * halts at 11, 22 and 33, because it is picking a numerological quality. So
 * `birthCard('1994-07-26')` and `arcanaFor(lifePath('1994-07-26'))` are not the
 * same card and are not supposed to be. NEITHER IS REWRITTEN IN TERMS OF THE
 * OTHER and neither calls the other. The birth card is still out of scope.
 *
 * WHAT IS NOT HERE: dominance and the composed frequency type. Reconciliation
 * §5.4 gave both to V3 (`src/lib/memory/frequency.ts` and `shadow.ts`) because
 * the thresholds are frequency-specific product judgement tuned against real
 * output. V3 composes `shadowArcana` with `numberGloss` itself.
 */
import type { Card, Locale } from '@/data/types';
import { arcanaFor } from './arcana';
import { type SunFacts, lifePath, sunSign } from './astrology';
import { expression, nicknamePulse, personality, soulUrge } from './gematria';
import { elementGloss, modalityGloss, numberGloss, signGloss } from './glosses';
import type { GlossNumber } from './reduce';

export {
  MASTER_NUMBERS,
  type MasterNumber,
  type GlossNumber,
  isMaster,
  isGlossNumber,
  reduce,
  reduceToGloss,
} from './reduce';

export {
  PYTHAGOREAN,
  type NameNumbers,
  normalizeName,
  letterValue,
  vowelFlags,
  expression,
  soulUrge,
  personality,
  nicknamePulse,
  nameNumbers,
} from './gematria';

export {
  ZODIAC,
  SIGNS,
  type ZodiacSign,
  type Modality,
  type SunFacts,
  type IsoDateParts,
  parseIsoDate,
  sunSign,
  lifePath,
} from './astrology';

export {
  type CountedCard,
  type ShadowResult,
  arcanaFor,
  shadowArcana,
} from './arcana';

export {
  NUMBER_GLOSSES,
  SIGN_GLOSSES,
  ELEMENT_GLOSSES,
  MODALITY_GLOSSES,
  numberGloss,
  signGloss,
  elementGloss,
  modalityGloss,
} from './glosses';

export type PersonInput = {
  fullName: string;
  nickname: string;
  birthDate: string;
};

/**
 * The scalars. LOCALE-FREE, and that is not tidiness.
 *
 * `personas.facts` is jsonb and `personas.input_hash` is computed over the
 * inputs; both have to be identical whichever language the persona was
 * generated in, or the persona regenerates every time the querent taps `EN`
 * and the prose they just read is replaced by different prose. A shape carrying
 * `gloss: string` cannot be hashed that way. So: scalars for storage, glosses
 * for rendering, one function each.
 *
 * EVERY FIELD IS INDEPENDENTLY NULLABLE. A user with a CJK-only full name has a
 * life path and no expression; a user with a malformed birth date has the
 * reverse. Render nothing for a null (W5's M14 rule) — a caption under a number
 * the system does not have is worse than a gap.
 */
export type PersonNumbers = {
  lifePath: GlossNumber | null;
  expression: GlossNumber | null;
  soulUrge: GlossNumber | null;
  personality: GlossNumber | null;
  nicknamePulse: GlossNumber | null;
  sun: SunFacts | null;
};

export function personNumbers(input: PersonInput): PersonNumbers {
  return {
    lifePath: lifePath(input.birthDate),
    expression: expression(input.fullName),
    soulUrge: soulUrge(input.fullName),
    personality: personality(input.fullName),
    nicknamePulse: nicknamePulse(input.nickname),
    sun: sunSign(input.birthDate),
  };
}

/**
 * One number, its written line, and the card it corresponds to.
 *
 * `arcana` IS INCLUDED EVEN THOUGH V8 MAY NOT USE IT. `arcanaFor` is exported
 * anyway and the join is one array index; making V8 write
 * `arcanaFor(c.lifePath.value)` at four call sites is four chances to pass the
 * wrong number. If it turns out unused, deleting a field is cheap.
 */
export type NumberFact = { value: GlossNumber; gloss: string; arcana: Card };

export type SunFact = SunFacts & {
  signGloss: string;
  elementGloss: string;
  modalityGloss: string;
};

export type PersonCorrespondences = {
  lifePath: NumberFact | null;
  expression: NumberFact | null;
  soulUrge: NumberFact | null;
  personality: NumberFact | null;
  nicknamePulse: NumberFact | null;
  sun: SunFact | null;
};

function fact(value: GlossNumber | null, locale: Locale): NumberFact | null {
  return value === null
    ? null
    : { value, gloss: numberGloss(value, locale), arcana: arcanaFor(value) };
}

/** The glossed view, for a prompt and for `/account`'s captions. */
export function correspondencesFor(
  input: PersonInput,
  locale: Locale,
): PersonCorrespondences {
  const n = personNumbers(input);
  return {
    lifePath: fact(n.lifePath, locale),
    expression: fact(n.expression, locale),
    soulUrge: fact(n.soulUrge, locale),
    personality: fact(n.personality, locale),
    nicknamePulse: fact(n.nicknamePulse, locale),
    sun: n.sun === null
      ? null
      : {
          ...n.sun,
          signGloss: signGloss(n.sun.sign, locale),
          elementGloss: elementGloss(n.sun.element, locale),
          modalityGloss: modalityGloss(n.sun.modality, locale),
        },
  };
}
