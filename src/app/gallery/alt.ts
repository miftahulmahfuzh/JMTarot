/**
 * The `alt` text for one card on `/gallery`.
 *
 * ── WHY THIS EXISTS AND WHY IT IS NOT FORTY-FOUR CATALOG STRINGS ────────────
 *
 * `alt` on this page is INDEXED CONTENT. Google Images is a real tarot traffic
 * source, the art is the one asset a competitor cannot copy, and `The Moon` twice
 * over -- which is what `card.alt.upright` (`{name}`) gives -- describes nothing.
 *
 * But 22 hand-written sentences x 2 locales in `locales/id.ts` is 44 pieces of
 * prose shipped to EVERY visitor of EVERY page, including the draw screen, which
 * is exactly what S-D6 forbids: I9 hands the client one whole catalog as JSON. So
 * the sentence is DERIVED -- one template key plus fields already in `cards.json`,
 * both of which are already localised and neither of which is new data.
 *
 *   id: "Kartu tarot The Moon, Major Arcana XVIII: mimpi, ilusi, pasang"
 *   en: "The Moon tarot card, Major Arcana XVIII: dreams, illusion, tides"
 *
 * That is 22 distinct strings per locale, each carrying the phrase somebody
 * actually types (`kartu tarot the moon`, `the moon tarot card`), for one catalog
 * value.
 *
 * CARD NAMES AND NUMERALS STAY ENGLISH IN BOTH LOCALES (`## Card data`). Only the
 * frame and the keywords are translated, which is why the two locales differ on
 * every card and why a test asserts they do.
 *
 * THE JOINER IS A BARE `', '` AND NOT `Intl.ListFormat`. This is a list of
 * keywords after a colon, not a sentence: `Intl.ListFormat` would render "mimpi,
 * ilusi, dan pasang" / "dreams, illusion, and tides", which reads as prose the
 * card is asserting rather than as three index terms. Both locales use ", " and
 * there is nothing locale-dependent left to get wrong.
 */
import { cardKeywords } from '@/data/deck';
import type { Card } from '@/data/types';
import type { TFunction } from '@/lib/i18n/format';

export function galleryAlt(card: Card, t: TFunction): string {
  return t('gallery.card.alt', {
    name: card.name,
    numeral: card.numeral,
    keywords: cardKeywords(card, t.locale).join(', '),
  });
}
