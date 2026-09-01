import { describe, expect, it } from 'vitest';
import en from './locales/en';
import id from './locales/id';
import type { MessageKey } from './locales/id';

/**
 * S-D6, made mechanical.
 *
 * ── WHY A LENGTH RULE IS THE RIGHT SHAPE ────────────────────────────────────
 *
 * **THE CLIENT IS SHIPPED EXACTLY ONE CATALOG, ENTIRE, AS JSON, ON EVERY FULL PAGE
 * LOAD** (I9, and `LocaleProvider`'s header says so). That is fine at 268 short
 * strings and it is the reason twenty-two lore documents may never live here: they
 * would reach every visitor of every page, including the draw screen, for a page
 * that renders none of them.
 *
 * S-D6 is the kind of rule that decays -- somebody pastes one paragraph in because
 * it is "basically chrome", and the next person has precedent. Two ceilings make it
 * mechanical.
 *
 * ── BOTH NUMBERS ARE MEASURED, AND THEY ARE CEILINGS RATHER THAN TARGETS ────
 *
 * Measured 2026-07-29, WITH S1's 26 keys already in: 268 keys, the longest value
 * `onboarding.intro.body` at 267 characters, `id` serializing to 15,801 bytes and
 * `en` to 15,527.
 *
 *   MAX_VALUE  320    267 plus headroom. Catches a pasted paragraph.
 *   MAX_BYTES  20000  ~21% headroom. **This is the load-bearing one**, because the
 *                     per-value ceiling alone would let 44 documents of 320
 *                     characters in and quadruple the payload.
 *
 * ── RE-MEASURED 2026-08-08, AND `MAX_BYTES` MOVED 20,000 -> 23,000 ─────────
 *
 * **THE ONLY WIDENING THIS CEILING HAS HAD, AND HERE IS THE WRITTEN REASON THE
 * PARAGRAPH BELOW DEMANDS.** v0.7.0 adds a whole SCREEN — `/chat` — and with it 39
 * `chat.*` keys across three workstreams: F1's first-open notice, F6's attachment
 * copy and F4's room. `id` measures 21,161 bytes over 376 keys and `en` 20,788;
 * the chat block is **1,848 bytes of the total**, or 8.7%.
 *
 * **THE RULE IS UNCHANGED AND NOTHING WAS RELAXED TO FIT.** Every one of those 39 is
 * chrome — a button, a placeholder, an empty state, a day separator — the longest is
 * 84 characters, and `MAX_VALUE` did not move. The check that S-D6 actually cares
 * about is *"is this content in the wrong place"*, and the answer is still no:
 * `/chat` renders no authored document, and the one long sentence on the screen
 * (`chat.first_open.notice`) is a consent disclosure that has to be in the catalog
 * because it is chrome in two languages.
 *
 * 23,000 is ~8.7% headroom over `id`, which is deliberately TIGHTER than the 21%
 * this started with: the next workstream to add a screen's worth of keys should meet
 * this test, and answer it in writing, exactly as this paragraph does.
 *
 * **S-D6's real cost is the PAYLOAD, not the line count** -- the roadmap argues
 * from `id.ts` being 843 lines, and CLAUDE.md's `## Localization` still claims 118
 * keys, which has been wrong for two releases. The bytes are the number that
 * reaches a phone.
 *
 * TIGHTENED WHEN THE CATALOG SHRINKS, NEVER WIDENED WITHOUT A WRITTEN REASON --
 * `LENGTH_BUDGET`'s rule, for the same reason: a ceiling raised on one inconvenient
 * commit is not a ceiling. **A workstream whose chrome keys would breach either has
 * content in the wrong place**, and `src/content/**` is where it goes.
 *
 * ── RE-MEASURED 2026-09-01, AND `MAX_BYTES` MOVED 23,000 -> 25,000 ─────────
 *
 * **THE SECOND WIDENING, AND THE HEADROOM WAS ALREADY SPENT BEFORE THIS COMMIT
 * TOUCHED THE CATALOG.** Card #33 adds ONE key — `chat.scrollToLatest`, a 16-character
 * `aria-label` for an icon-only button, which is the shortest and most obviously
 * chrome-shaped thing this catalog can hold — and it breached the ceiling. Measured
 * on `main` immediately before: **`id` 22,995 bytes over 404 keys, `en` 22,647. FIVE
 * BYTES of headroom.** With the key: 23,036 and 22,696 over 405.
 *
 * So the number to read is not "one key cost 41 bytes", it is that the 8.7% headroom
 * bought on 2026-08-08 was consumed by the releases between — and **nobody re-measured,
 * because nothing failed until the margin was gone.** That is the failure mode of a
 * ceiling with no reporting: it is silent until it is a wall, and the commit it falls
 * on is whichever one happens to be next rather than the one that spent it.
 *
 * **NOTHING WAS RELAXED TO FIT AND `MAX_VALUE` DID NOT MOVE**, which is the same
 * sentence the 2026-08-08 block earned. 25,000 restores ~8.5% over the new figure, the
 * proportion the last re-measure chose. The rule below is intact: this is a WRITTEN
 * reason with the measurement in it, not a number nudged on an inconvenient commit.
 *
 * ── RE-MEASURED 2026-09-01 (card #34), NO WIDENING ─────────────────────────
 *
 * **RECORDED BECAUSE THE PARAGRAPH ABOVE NAMES NOT RE-MEASURING AS THE FAILURE MODE**,
 * not because anything came close. Card #34 lengthens one value -- `account.memory.hint`
 * gains a sentence, because the chat's notes now reach a reading prompt and `C-D8`'s
 * finding is that the hint is where a querent actually reads that. **`id` 23,145 bytes,
 * `en` 22,816, over 405 keys: ~1,855 of headroom, 7.4%.** `MAX_VALUE` did not move and
 * the hint is nowhere near it.
 *
 * So the margin bought on this morning's widening is intact, and the next workstream
 * inherits a number that was checked rather than assumed.
 */

const MAX_VALUE = 320;
const MAX_BYTES = 25_000;

describe('the catalog holds chrome, not prose (S-D6)', () => {
  it('has no value longer than the ceiling', () => {
    for (const [name, catalog] of [
      ['id', id],
      ['en', en],
    ] as const) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ [`${name}:${key}`]: value.length <= MAX_VALUE }).toEqual({
          [`${name}:${key}`]: true,
        });
      }
    }
  });

  it('names the longest value, so a regression says what it displaced', () => {
    // Not a redundant assertion: it fails when a NEW value becomes the longest,
    // which is the moment to ask whether it is chrome. Update the name and the
    // number together, in the same commit, with a reason.
    const longest = (Object.entries(id) as [MessageKey, string][]).sort(
      (a, b) => b[1].length - a[1].length,
    )[0];
    expect(longest[0]).toBe('onboarding.intro.body');
    expect(longest[1].length).toBeLessThanOrEqual(280);
  });

  it('keeps each catalog under the payload ceiling', () => {
    // THE ONE THAT MATTERS. The per-value ceiling alone would let 44 documents of
    // 320 characters in.
    for (const [name, catalog] of [
      ['id', id],
      ['en', en],
    ] as const) {
      const bytes = JSON.stringify(catalog).length;
      expect({ [name]: bytes < MAX_BYTES }, `${name} is ${bytes} bytes`).toEqual({
        [name]: true,
      });
    }
  });

  it('holds no paragraph breaks except the one that is framing', () => {
    /*
     * Prose has paragraphs; chrome does not. Two exemptions, each earned:
     *
     *   `reading.error.midStream`  OPENS with `\n\n[...]`, and `catalog.test.ts`
     *                             asserts that shape -- the blank line and the
     *                             brackets are what make a mid-stream notice read
     *                             as a system message rather than as the reader
     *                             suddenly saying something strange.
     *   `onboarding.intro.body`   Genuinely two paragraphs, and it is the invitation
     *                             screen rather than a label. It is also the longest
     *                             value in the catalog, which is not a coincidence:
     *                             it is the boundary case this whole file exists to
     *                             keep from becoming a precedent.
     */
    const EXEMPT = new Set<string>(['reading.error.midStream', 'onboarding.intro.body']);
    for (const [name, catalog] of [
      ['id', id],
      ['en', en],
    ] as const) {
      for (const [key, value] of Object.entries(catalog)) {
        if (EXEMPT.has(key)) continue;
        expect({ [`${name}:${key}`]: value.replace(/^\n\n/, '').includes('\n\n') }).toEqual({
          [`${name}:${key}`]: false,
        });
      }
    }
  });

  it('holds no markup, because a catalog value is a STRING and not HTML', () => {
    /*
     * `t()` returns a string and React escapes it. A value containing `<p>` or
     * `<a href` is somebody reaching for `dangerouslySetInnerHTML`, which §5 rule 3
     * forbids -- and which reconciliation R1 refused an exception to even for
     * JSON-LD. `/login`'s four-key legal line is the sanctioned pattern for a
     * sentence with a link in it, with its limitation recorded in `id.ts`.
     */
    for (const catalog of [id, en]) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ [key]: /<\/?[a-z][^>]*>/i.test(value) }).toEqual({ [key]: false });
      }
    }
  });
});
