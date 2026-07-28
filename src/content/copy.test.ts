import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EN_TICS, MALAY, THERAPY_EN, THERAPY_ID } from '@/lib/copy/vocab';

/**
 * The copy constraints, applied to STATIC content (§11.4).
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * The Malay grep and the therapy list run in `npm run smoke -- --all`, against
 * GENERATED readings. Static content is not generated, so nothing checked it -- and
 * it is the copy a stranger reads FIRST and the copy that is PERMANENT. A reading
 * with a Malay word in it is one reading; a lore page with one is a sentence in
 * Google's index for as long as the page exists.
 *
 * ── THE LISTS ARE IMPORTED, NEVER COPIED ────────────────────────────────────
 *
 * §11.4 asked for an extraction that had **already happened** (R13):
 * `src/lib/copy/vocab.ts` holds all four lists. Its header records why it has no
 * `server-only` marker (scripts import it) and why `anxiety` is deliberately absent
 * from both therapy lists -- "that low-grade anxiety before you send the text" is
 * legitimate in Adrian's voice and the rule is against DIAGNOSIS, which is why
 * `anxiety disorder`, `clinical` and `diagnosed` are the entries that are there.
 *
 * **TWO INLINE COPIES SURVIVE ELSEWHERE AND BOTH STAY** (R13), which is the
 * non-obvious half. `scripts/smoke-llm.ts` keeps its own, because pointing it here
 * would make a live LLM check strictly stricter in a release that touches no
 * prompt. And `src/lib/i18n/catalog.test.ts` keeps a DIFFERENT Malay list holding
 * six words this one does not -- at least three of which (`kereta` a train,
 * `bilik` a chamber, `cuba` also a country) are ordinary Indonesian, safe against
 * 242 short reviewed strings and a false-positive machine against generated prose.
 * **A false positive in a shared list is how a check gets switched off.** Two
 * lists, two scopes; this is the sentence that stops the next person tidying them
 * together.
 *
 * ── IT BINDS BEFORE THERE IS ANY CONTENT, AND THAT IS DELIBERATE ────────────
 *
 * S1 lands first; S4 writes 44 lore documents and S6 writes the articles. A test
 * that silently passes on an empty directory is a test nobody notices has stopped
 * working, so the checker is proven against a SYNTHETIC document that must be
 * rejected. The real files start being checked the moment the first one lands, with
 * no further edit.
 *
 * ── STRING LITERALS ONLY, NOT THE WHOLE SOURCE ──────────────────────────────
 *
 * Matching the raw file would fire on identifiers and on comments -- and a rule that
 * fires on prose describing the rule is a rule people delete
 * (`queries/contract.test.ts` records that lesson twice). So comments are stripped
 * and only quoted strings and template literals are searched.
 *
 * WHEN `src/content/types.ts` LANDS, importing the registry and walking the typed
 * block union is strictly better than this regex -- it cannot miss a string and
 * cannot false-positive on an identifier. That is S4's improvement to make; this
 * shape is what is available before the type exists.
 *
 * ── AND ONE THING THIS LINT MUST NEVER BE WIDENED TO ────────────────────────
 *
 * **ITS SCOPE IS `src/content/**` ONLY.** `EN_TICS` contains `abundance`, which is
 * The Empress's own English keyword in generated `cards.json` -- exactly one
 * collision across all 22 cards, and the same shape holds for `sacred` (The
 * Hierophant), `heal`/`healing` (Temperance, The Star) and `shadow work` (The Devil,
 * The Moon). Anyone who widens this to the RENDERED page fails on data S4 does not
 * own, concludes the lint is broken, and switches it off.
 */

const CONTENT = join(process.cwd(), 'src', 'content');

/** Every quoted string and template literal in a module, comments removed. */
function stringsIn(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return [
    ...code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g),
  ].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
}

type Doc = { path: string; locale: 'id' | 'en'; strings: string[] };

/** The forbidden words for a document, by its locale. */
function forbidden(locale: 'id' | 'en'): readonly string[] {
  return locale === 'id'
    ? [...MALAY, ...THERAPY_ID]
    : // The Malay grep is `id`-ONLY (`## Localization` rule 4): `kerana` is not a
      // risk in English and running it there is theatre. The English half has its
      // own tic list instead, and it is longer -- English tarot writing is
      // saturated with that vocabulary in a way Indonesian is not.
      [...THERAPY_EN, ...EN_TICS];
}

function violations(doc: Doc): string[] {
  const found: string[] = [];
  for (const word of forbidden(doc.locale)) {
    // Word-bounded and case-insensitive, exactly as `smoke-llm.ts` matches. The
    // apostrophe class is for `soul's journey` against a curly quote.
    const re = new RegExp(`\\b${word.replace(/'/g, "['’]")}\\b`, 'i');
    for (const s of doc.strings) if (re.test(s)) found.push(`${word} in "${s.slice(0, 60)}"`);
  }
  return found;
}

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

function docs(): Doc[] {
  if (!existsSync(CONTENT)) return [];
  return walkFiles(CONTENT)
    .filter((full) => /\.(id|en)\.ts$/.test(full) && !/\.test\.ts$/.test(full))
    .map((full) => ({
      path: full.slice(process.cwd().length + 1),
      locale: /\.id\.ts$/.test(full) ? ('id' as const) : ('en' as const),
      strings: stringsIn(readFileSync(full, 'utf8')),
    }));
}

describe('the content copy lint', () => {
  it('REJECTS a synthetic document, so it is never vacuously passing', () => {
    /*
     * The negative control on the checker, and the only assertion in this file
     * that does any work before S4 and S6 land. If the extraction, the regex or
     * the locale split ever breaks, this fails -- rather than the whole file
     * quietly reporting that 44 documents are clean.
     */
    const bad: Doc = {
      path: 'synthetic.id.ts',
      locale: 'id',
      strings: ['Kartu ini bicara soal kerjaya kamu.', 'Ini bukan terapi.'],
    };
    expect(violations(bad)).toHaveLength(2);

    const badEn: Doc = {
      path: 'synthetic.en.ts',
      locale: 'en',
      strings: ['Dear one, this card is about healing.', 'kerana'],
    };
    // Two English hits -- `dear one` and `healing`. `kerana` must NOT fire: the
    // Malay grep is `id`-only, and running it against English is theatre.
    expect(violations(badEn)).toHaveLength(2);
  });

  it('names every document by locale, so none can escape the lint', () => {
    /*
     * §5's convention is `the-moon.id.ts` / `the-moon.en.ts`, and the lint derives
     * the locale from the filename -- so a file named `the-moon.ts` would be
     * skipped SILENTLY. Assert the convention rather than trusting it.
     *
     * `index.ts` and `types.ts` are exempt because §5 requires them to hold no
     * prose, and `copy.test.ts` is this file.
     */
    if (!existsSync(CONTENT)) return;
    const stray = walkFiles(CONTENT)
      .map((p) => p.slice(process.cwd().length + 1))
      .filter(
        (p) =>
          /\.tsx?$/.test(p) &&
          !/\.test\.tsx?$/.test(p) &&
          !/\/(index|types)\.ts$/.test(p) &&
          !/\.(id|en)\.ts$/.test(p),
      );
    expect(stray).toEqual([]);
  });

  it('has no forbidden word in any authored document', () => {
    for (const doc of docs()) {
      expect({ [doc.path]: violations(doc) }).toEqual({ [doc.path]: [] });
    }
  });

  it('spells card names in English, in both locales', () => {
    /*
     * `## Card data`: a reading refers to The Moon, and a lore page that calls it
     * anything else contradicts the reading the app just gave. V2's translator
     * learned this mechanically -- the prompt rule alone produced "Pulan" -- and
     * static content deserves the same check.
     *
     * Asserted as an ABSENCE of the invented forms rather than a presence of the
     * right one, because a lore page legitimately may not name every card.
     */
    for (const doc of docs()) {
      const joined = doc.strings.join(' ');
      for (const invented of ['Pulan', 'Bulan Tarot', 'Sang Bulan', 'Kartu Bulan']) {
        expect({ [doc.path]: joined.includes(invented) }).toEqual({ [doc.path]: false });
      }
    }
  });
});
