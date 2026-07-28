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
import { theMoonId } from './the-moon.id';
import { theMoonEn } from './the-moon.en';

/**
 * **THE ENTRIES ARE WRITTEN IN CARD ORDER AND `registry.test.ts` ASSERTS IT.**
 * `Object.keys` preserves insertion order for string keys and `LORE_SLUGS` is what
 * the sitemap reads, so writing them in whatever order the tasks happened to run in
 * would let the sitemap's order drift for no reason a reviewer could see.
 */
export const ARCANA_LORE: Record<string, Localized<LoreDoc>> = {
  'the-moon': { id: theMoonId, en: theMoonEn },
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
