import { describe, expect, it } from 'vitest';

import { READERS } from '@/data/readers';
import { SERVICES } from '@/data/services';
import { LOCALES } from './locale';
import en from './locales/en';
import id from './locales/id';
import type { MessageKey } from './locales/id';

/**
 * The English length budget, for the strings that sit in a box with no room.
 *
 * WHY VITEST AND NOT A SCREENSHOT. This is the cheapest of Task 12's three loops and
 * the only one that runs in CI, which is the point: W3, W5 and W7 will all add keys
 * after this task closes, and a screenshot taken today protects nothing from a key
 * added in three weeks. The two expensive loops -- `getBoundingClientRect` in a fixed
 * container, and a real iPhone -- answer questions this cannot, and this answers the
 * one they cannot be run often enough to catch.
 *
 * THE BUDGET IS THE INDONESIAN LENGTH, WHICH IS KNOWN TO FIT, PLUS A MARGIN. Not an
 * absolute character count: the Indonesian shipped and was looked at on a phone, so it
 * is the only empirical fact available about what fits. A ratio also survives a
 * rewording of the Indonesian, which an absolute number would not.
 *
 * ENGLISH IS NOT UNIFORMLY LONGER AND THAT IS EXACTLY THE PROBLEM. `Pertanyaan (boleh
 * dikosongkan)` (30) becomes `Question (optional)` (19), but `Kocok ulang` (11) becomes
 * `Shuffle again` (13) and `Untuk hiburan semata.` (21) becomes `For entertainment
 * only.` (23). You cannot reason about the direction, so it is measured.
 */

/*
 * The elements that make these tight, recorded so the list can be audited rather than
 * trusted:
 *
 *   Eyebrow.module.css            `white-space: nowrap`
 *   [reader]/page.module.css:154  `nowrap` on the card-count chip
 *   Slots.module.css              `flex-wrap: nowrap`, 96px `max-width` on the label
 *   LocaleSwitch.module.css       one row, two words and a separator
 *
 * A key NOT on this list is one that wraps freely. Adding a key to a nowrap box and
 * not to this list is the failure mode; the comment above each group is what makes
 * that reviewable.
 */
const TIGHT: Partial<Record<MessageKey, number>> = {
  // Back links: `nowrap`, and they share the row with nothing, so the margin is
  // generous. `nav.back.reader` interpolates a reader name and is checked separately.
  'nav.back.readers': 1.15,

  /*
   * Eyebrows: `nowrap`, centred, ALONE ON A FULL-WIDTH LINE. 1.15 was wrong here and
   * the test caught it -- `Choose a reading` (16) failed against `Pilih layanan` (13)
   * by one character, on a string with 343px of room at the narrowest supported width
   * (375 less 2x16 padding). At 10px Cinzel with `--ls-button` tracking, 16 characters
   * is roughly 136px. The uniform ratio was the mistake, not the copy: a budget has to
   * model the BOX, and this box is nine times wider than the string. Step 2 measures it
   * rather than trusting that arithmetic.
   */
  'picker.service.eyebrow': 1.4,
  // Identical in both catalogs by design, so the ratio is exactly 1.
  'common.majorArcana': 1.0,

  // The card-count chip and the draw counter: `nowrap`, and they sit beside other
  // content on the same row.
  'picker.service.cardCount.one': 1.15,
  'picker.service.cardCount.other': 1.15,
  'draw.counter.one': 1.15,
  'draw.counter.other': 1.15,

  // Buttons sized to their text, on a row with a sibling.
  'draw.reset': 1.25,
  'common.close': 1.25,
  'card.return': 1.25,
  'card.reversed': 1.25,

  // The switcher's two labels sit on one row with a separator between them.
  'locale.name.id': 1.0,
  'locale.name.en': 1.0,

  // The onboarding controls: three buttons, one row, and Skip sits beside Continue at
  // equal weight on the worst_thing step.
  'onboarding.actions.next': 1.3,
  'onboarding.actions.back': 1.3,
  'onboarding.actions.skip': 1.2,
  'onboarding.actions.finish': 1.3,
  'onboarding.q.introversion.left': 1.2,
  'onboarding.q.introversion.right': 1.2,
  'onboarding.q.color.option.black': 1.3,
  'onboarding.q.color.option.white': 1.3,
  'onboarding.q.color.option.grey': 1.3,
};

describe('English length budget', () => {
  it('keeps every tight key inside its margin over the Indonesian', () => {
    for (const [key, ratio] of Object.entries(TIGHT) as [MessageKey, number][]) {
      const budget = Math.ceil(id[key].length * ratio);
      expect(
        { key, en: en[key].length, budget, text: en[key] },
        `"${en[key]}" is ${en[key].length} chars against a budget of ${budget}`,
      ).toEqual({ key, en: en[key].length <= budget ? en[key].length : budget, budget, text: en[key] });
    }
  });

  /**
   * The six English `positionFraming` strings, from `readers.json` rather than the
   * catalog (I14: dual-role copy lives in the data files).
   *
   * These are the tightest strings in the app: `Slots.module.css` puts a 96px
   * `max-width` on the label inside a `flex-wrap: nowrap` row of three, at 10px Cinzel
   * with `--ls-slot-label` tracking. Encouraging arithmetic, to be CONFIRMED by Step 2
   * rather than trusted: `WHAT NOW ABIDES` is 14 characters against `YANG KINI
   * BERSEMAYAM`'s 20, so English should wrap LESS here. The tracking makes character
   * counts a bad proxy, which is why this is a budget and not a proof.
   */
  it('keeps the English slot captions no longer than the Indonesian ones', () => {
    for (const reader of READERS) {
      for (const i of [0, 1, 2]) {
        const idLabel = reader.positionFraming.id[i];
        const enLabel = reader.positionFraming.en[i];
        const budget = Math.ceil(idLabel.length * 1.15);
        expect(
          { reader: reader.id, i, len: enLabel.length, budget, enLabel },
          `${reader.id}[${i}] "${enLabel}" is ${enLabel.length} chars, budget ${budget} (id: "${idLabel}")`,
        ).toEqual({
          reader: reader.id,
          i,
          len: enLabel.length <= budget ? enLabel.length : budget,
          budget,
          enLabel,
        });
      }
    }
  });

  /**
   * `singleLabel` shares the same 96px box as `positionFraming`, and is easy to forget
   * because it only renders for the two single-card services.
   */
  it('keeps the English single-card slot captions inside the same box', () => {
    for (const service of SERVICES) {
      if (!service.singleLabel) continue;
      const budget = Math.ceil(service.singleLabel.id.length * 1.4);
      const len = service.singleLabel.en.length;
      expect({ id: service.id, len: len <= budget ? len : budget, budget }).toEqual({
        id: service.id,
        len,
        budget,
      });
    }
  });

  /**
   * `nav.back.reader` is `← {name}` in both locales, so its own length proves nothing.
   * What matters is the RENDERED string with the longest reader name substituted, which
   * is the actual thing in the `nowrap` box.
   */
  it('keeps the rendered back-link inside its box for the longest reader name', () => {
    const longest = READERS.reduce((a, b) => (a.name.length >= b.name.length ? a : b));
    for (const locale of LOCALES) {
      const catalog = locale === 'id' ? id : en;
      const rendered = catalog['nav.back.reader'].replace('{name}', longest.name);
      // `← Margaret` is 10 characters. The box holds the Indonesian `← Pembaca lain`
      // (14) comfortably, so anything at or under that is safe by construction.
      expect({ locale, len: rendered.length <= 16 }).toEqual({ locale, len: true });
    }
  });
});
