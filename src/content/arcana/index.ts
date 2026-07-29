/**
 * The lore registry (roadmap §5). **NO PROSE IN THIS FILE.**
 *
 * STATIC IMPORTS, NOT `import()`. All forty-four documents are in the build either
 * way, this is server-side only so nothing reaches the browser bundle, and a
 * dynamic import would make every consumer async for no gain. The one real cost --
 * every arcana page's server bundle holds all forty-four documents -- is build-time
 * memory on a route that is CDN-cached, and only this route and the sitemap import
 * it.
 *
 * `Localized<LoreDoc>` per slug, so **a card with only one locale written is a
 * COMPILE error**, which is the same trick the prompt facades use (`Record<Locale,
 * …>`; a missing locale there returned `undefined` to a model, which does not throw
 * and produces fluent prose grounded in nothing).
 *
 * KEYED BY URL SLUG, AND `registry.test.ts` ASSERTS THE KEY SET AGAINST
 * `CARD_URL_SLUGS`. A `Record<string, …>` cannot make a MISSING card a compile
 * error, because `cards.json` is generated and there is no literal union to derive.
 * The completeness assertion is therefore a test, and it lives in `lore.test.ts`.
 */
import type { Locale, Localized } from '@/data/types';
import type { LoreDoc } from '@/content/types';
import { theFoolId } from './the-fool.id';
import { theFoolEn } from './the-fool.en';
import { theMagicianId } from './the-magician.id';
import { theMagicianEn } from './the-magician.en';
import { theHighPriestessId } from './the-high-priestess.id';
import { theHighPriestessEn } from './the-high-priestess.en';
import { theEmpressId } from './the-empress.id';
import { theEmpressEn } from './the-empress.en';
import { theEmperorId } from './the-emperor.id';
import { theEmperorEn } from './the-emperor.en';
import { theHierophantId } from './the-hierophant.id';
import { theHierophantEn } from './the-hierophant.en';
import { theLoversId } from './the-lovers.id';
import { theLoversEn } from './the-lovers.en';
import { theChariotId } from './the-chariot.id';
import { theChariotEn } from './the-chariot.en';
import { strengthId } from './strength.id';
import { strengthEn } from './strength.en';
import { theHermitId } from './the-hermit.id';
import { theHermitEn } from './the-hermit.en';
import { wheelOfFortuneId } from './wheel-of-fortune.id';
import { wheelOfFortuneEn } from './wheel-of-fortune.en';
import { justiceId } from './justice.id';
import { justiceEn } from './justice.en';
import { theHangedManId } from './the-hanged-man.id';
import { theHangedManEn } from './the-hanged-man.en';
import { deathId } from './death.id';
import { deathEn } from './death.en';
import { temperanceId } from './temperance.id';
import { temperanceEn } from './temperance.en';
import { theDevilId } from './the-devil.id';
import { theDevilEn } from './the-devil.en';
import { theTowerId } from './the-tower.id';
import { theTowerEn } from './the-tower.en';
import { theStarId } from './the-star.id';
import { theStarEn } from './the-star.en';
import { theMoonId } from './the-moon.id';
import { theMoonEn } from './the-moon.en';
import { theSunId } from './the-sun.id';
import { theSunEn } from './the-sun.en';
import { judgementId } from './judgement.id';
import { judgementEn } from './judgement.en';
import { theWorldId } from './the-world.id';
import { theWorldEn } from './the-world.en';

/**
 * **THE ENTRIES ARE WRITTEN IN CARD ORDER AND `registry.test.ts` ASSERTS IT.**
 * `Object.keys` preserves insertion order for string keys and `LORE_SLUGS` is what
 * the sitemap reads, so writing them in whatever order the tasks happened to run in
 * would let the sitemap's order drift for no reason a reviewer could see.
 */
export const ARCANA_LORE: Record<string, Localized<LoreDoc>> = {
  'the-fool': { id: theFoolId, en: theFoolEn },
  'the-magician': { id: theMagicianId, en: theMagicianEn },
  'the-high-priestess': { id: theHighPriestessId, en: theHighPriestessEn },
  'the-empress': { id: theEmpressId, en: theEmpressEn },
  'the-emperor': { id: theEmperorId, en: theEmperorEn },
  'the-hierophant': { id: theHierophantId, en: theHierophantEn },
  'the-lovers': { id: theLoversId, en: theLoversEn },
  'the-chariot': { id: theChariotId, en: theChariotEn },
  strength: { id: strengthId, en: strengthEn },
  'the-hermit': { id: theHermitId, en: theHermitEn },
  'wheel-of-fortune': { id: wheelOfFortuneId, en: wheelOfFortuneEn },
  justice: { id: justiceId, en: justiceEn },
  'the-hanged-man': { id: theHangedManId, en: theHangedManEn },
  death: { id: deathId, en: deathEn },
  temperance: { id: temperanceId, en: temperanceEn },
  'the-devil': { id: theDevilId, en: theDevilEn },
  'the-tower': { id: theTowerId, en: theTowerEn },
  'the-star': { id: theStarId, en: theStarEn },
  'the-moon': { id: theMoonId, en: theMoonEn },
  'the-sun': { id: theSunId, en: theSunEn },
  judgement: { id: judgementId, en: judgementEn },
  'the-world': { id: theWorldId, en: theWorldEn },
};

/**
 * The slugs that HAVE lore, in Fool's Journey order.
 *
 * **`src/app/sitemap.ts` TAKES THIS AND NOT `CARD_URL_SLUGS`.** While the
 * forty-four are being written, advertising a URL whose document does not exist is
 * telling a crawler about a 404 -- and once the two lists are identical the safe
 * spelling costs nothing forever.
 */
export const LORE_SLUGS: readonly string[] = Object.keys(ARCANA_LORE);

export function loreFor(slug: string, locale: Locale): LoreDoc | undefined {
  return ARCANA_LORE[slug]?.[locale];
}
