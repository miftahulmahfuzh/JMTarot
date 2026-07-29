import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CATEGORIES, CLAUSE_FOR, clauseAnchor } from '@/lib/moderation/types';
import { TermsEn } from './terms/terms.en';
import { TermsId } from './terms/terms.id';
import { PrivacyEn } from './privacy/privacy.en';
import { PrivacyId } from './privacy/privacy.id';
import { PROVIDER, RETENTION } from './privacy/facts';

/**
 * The legal documents, rendered and then asserted on.
 *
 * What is checked here is the part that is an INTERFACE rather than copy -- the
 * anchor scheme, the locale parity, the Malay grep, and the two things
 * reconciliation refused to guess at (no unread statute, no appellate court).
 *
 * **THE ANCHOR TEST IS THE IMPORTANT ONE.** `CLAUSE_FOR` maps every moderation
 * category to a clause, the refusal renders `/terms#6-2`, and a heading that
 * gets renumbered turns that into a link to nowhere -- silently, in the one
 * place in the app where a broken link is delivered to somebody who has just
 * been refused.
 */

const ROOT = join(process.cwd(), 'src', 'app');

/**
 * **RENDER THE DOCUMENTS, DO NOT GREP THE SOURCE.**
 *
 * The first version of this file read the `.tsx` files as text, and it was wrong
 * in both directions at once. The Malay grep FAILED on `kerjaya` -- because the
 * file's own header comment lists the Malay words to avoid, so the check fired
 * on its own documentation. And the court check PASSED nothing, because the
 * clause renders `{OPERATOR.forum}` and the string "Pengadilan Negeri" is in
 * `operator.ts`, not in the document.
 *
 * Rendering fixes both: comments vanish, interpolations resolve, and what is
 * asserted is what a reader actually sees. `createElement` rather than JSX
 * because the unit project globs `*.test.ts` and widening that glob is another
 * workstream's config.
 */
const render = (doc: typeof TermsId) =>
  renderToStaticMarkup(createElement(doc, { effective: 'v-test' }));

/** The rendered HTML -- attributes, anchors and all. */
const HTML = {
  'terms.id': render(TermsId),
  'terms.en': render(TermsEn),
} as const;

const PRIVACY_HTML = {
  'privacy.id': render(PrivacyId),
  'privacy.en': render(PrivacyEn),
} as const;

const PRIVACY = Object.fromEntries(
  Object.entries(PRIVACY_HTML).map(([k, html]) => [
    k,
    html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '),
  ]),
) as Record<keyof typeof PRIVACY_HTML, string>;

/** Visible prose only, with tags and attributes stripped. What a person reads. */
const TEXT = Object.fromEntries(
  Object.entries(HTML).map(([k, html]) => [k, html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')]),
) as Record<keyof typeof HTML, string>;

/** Kept for the one assertion that is genuinely about the source: the imports. */
const SOURCE = {
  'terms.id': readFileSync(join(ROOT, 'terms', 'terms.id.tsx'), 'utf8'),
  'terms.en': readFileSync(join(ROOT, 'terms', 'terms.en.tsx'), 'utf8'),
} as const;

/** Every `id="..."` a `Clause` or `SubClause` declares in one document. */
function anchorsIn(source: string): Set<string> {
  return new Set([...source.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
}

describe('the clause anchors are an interface', () => {
  it('gives every moderation category a heading in BOTH documents', () => {
    /*
     * If this fails, a refusal is linking at nothing. The fix is to add the
     * heading, never to point `CLAUSE_FOR` at a clause that says something else
     * -- citing 6.1 for a `sexual_minor` refusal would be worse than citing
     * nothing.
     */
    for (const [name, source] of Object.entries(HTML)) {
      const anchors = anchorsIn(source);
      const missing = CATEGORIES.map((c) => clauseAnchor(CLAUSE_FOR[c])).filter(
        (a) => !anchors.has(a),
      );
      expect({ name, missing: [...new Set(missing)] }).toEqual({ name, missing: [] });
    }
  });

  it('declares the SAME anchors in both locales', () => {
    /*
     * An English reader refused under 6.2 must land on 6.2, not on whatever the
     * English document happens to number that clause. Divergence here is how a
     * translation quietly becomes a different contract.
     */
    const id = [...anchorsIn(HTML['terms.id'])].sort();
    const en = [...anchorsIn(HTML['terms.en'])].sort();
    expect(en).toEqual(id);
  });

  it('numbers clause 6 through 6.10, because the gate depends on the range', () => {
    const anchors = anchorsIn(HTML['terms.id']);
    for (let i = 1; i <= 10; i++) {
      expect({ clause: `6-${i}`, present: anchors.has(`6-${i}`) }).toEqual({
        clause: `6-${i}`,
        present: true,
      });
    }
  });

  it('keeps clause 7 -- the privacy policy links to it', () => {
    for (const [name, source] of Object.entries(HTML)) {
      expect({ name, has7: anchorsIn(source).has('7') }).toEqual({ name, has7: true });
    }
  });
});

/**
 * The eleven Malay-only words. Shared by the terms and the privacy suites --
 * these are the two longest Indonesian documents in the repo, and the smoke
 * script's grep covers generated readings only.
 */
const MALAY_WORDS = [
  'kerjaya',
  'hala tuju',
  'sembang',
  'awak',
  'tempoh',
  'boleh jadi',
  'bagi pihak',
  'percuma',
  'kereta',
  'jemputan',
  'usah',
];

describe('the Indonesian document is Indonesian, not Malay', () => {
  /**
   * The same eleven-word grep `npm run smoke -- --all` runs against generated
   * readings, pointed at the longest Indonesian prose in the repo.
   *
   * **`tempoh` IS THE ONE THAT MATTERS HERE.** It is the natural Malay reach
   * when writing about retention, which these documents do constantly -- and it
   * is the word that slipped past the original four-word list. The Indonesian is
   * `jangka waktu` or `masa simpan`.
   */
  it('contains none of the eleven Malay-only words', () => {
    const prose = TEXT['terms.id'];
    for (const word of MALAY_WORDS) {
      /*
       * Word-boundary matched. `awak` without a boundary fires on `awal`? No --
       * but it does fire inside `mengawaki`, and a grep that cries wolf is a
       * grep somebody deletes.
       */
      const hit = new RegExp(`\\b${word}\\b`, 'i').test(prose);
      expect({ word, hit }).toEqual({ word, hit: false });
    }
  });

  it('uses `kamu`, the register the rest of the app uses', () => {
    expect(TEXT['terms.id']).toContain('kamu');
  });
});

describe('what must be in the documents', () => {
  it('names the operator and a contact address in both locales', () => {
    /*
     * A privacy policy with no contact is not a privacy policy, and Google's
     * consent-screen review checks for both. They come from `operator.ts` rather
     * than being typed four times, so this asserts the import is actually used.
     */
    for (const [name, source] of Object.entries(SOURCE)) {
      // Asserted against the SOURCE on purpose: the point is that the value is
      // imported from `operator.ts` rather than typed out a fourth time.
      expect({ name, uses: source.includes('OPERATOR.legalName') }).toEqual({ name, uses: true });
      expect({ name, mail: source.includes('OPERATOR.contactEmail') }).toEqual({ name, mail: true });
    }
    for (const [name, text] of Object.entries(TEXT)) {
      expect({ name, named: text.includes('PT Citra Suka Buana') }).toEqual({ name, named: true });
      expect({ name, mail: text.includes('cs@citrasukabuana.co.id') }).toEqual({ name, mail: true });
    }
  });

  it('does not glue an interpolated value onto the next word', () => {
    /*
     * **CAUGHT BY LOOKING AT A SCREENSHOT, NOT BY A TEST**, which is why there is
     * now a test. The English clause 1 rendered `www.jmtarot.siteand add to your
     * phone` -- JSX drops the whitespace around a line-initial `{expression}`,
     * so an interpolation that starts a line loses the space before the text
     * that follows it. It typechecks, it lints, and it reads correctly in the
     * source.
     *
     * Checked against the two values that actually appear mid-sentence. A
     * general "no glued words" heuristic would fire on every legitimate
     * `word.Another` in prose; these two are the ones that are interpolated.
     */
    for (const [name, text] of Object.entries(TEXT)) {
      for (const value of ['www.jmtarot.site', 'cs@citrasukabuana.co.id', 'Pengadilan Negeri Jakarta Pusat']) {
        const glued = new RegExp(`${value.replace(/[.@]/g, '\\$&')}[A-Za-z]`).test(text);
        expect({ name, value, glued }).toEqual({ name, value, glued: false });
      }
    }
  });

  it('states in BOTH versions that the Indonesian one governs (W7-D20)', () => {
    // Two natively-written legal documents will drift. Naming the governing one
    // is a two-line clause now and an unanswerable question later -- and saying
    // it in only one of them is the same as not saying it.
    expect(TEXT['terms.id']).toContain('Versi Bahasa Indonesia yang berlaku');
    expect(TEXT['terms.en']).toContain('The Indonesian version governs');
  });

  it('sets the age bar at 18 in both locales', () => {
    expect(TEXT['terms.id']).toContain('18 tahun ke atas');
    expect(TEXT['terms.en']).toContain('18 or older');
  });

  it('cites no statute, article number or law by name', () => {
    /*
     * **RECONCILIATION §7.6 SURVIVED THE AGE DECISION.** Choosing 18 does not
     * answer what Indonesia's personal-data law requires for children's data,
     * and nobody on this project has read the article. A confident citation
     * nobody verified is worse than no citation, so the rule is mechanical: if
     * one of these appears, somebody has to have read the source first.
     */
    for (const [name, source] of Object.entries(TEXT)) {
      for (const pattern of [/\bUU\s+PDP\b/i, /\bUndang-Undang\b/i, /\bPasal\s+\d/i, /\bArticle\s+\d/i]) {
        expect({ name, pattern: String(pattern), hit: pattern.test(source) }).toEqual({
          name,
          pattern: String(pattern),
          hit: false,
        });
      }
    }
  });

  it('names a first-instance court, never an appellate one', () => {
    /*
     * Reconciliation §7.3's correction, made mechanical. A *Pengadilan Tinggi*
     * is appellate: a claim cannot be filed there, so a clause electing one
     * names a venue nobody can use. The city was the part actually decided.
     */
    for (const source of Object.values(TEXT)) {
      expect(source).toContain('Pengadilan Negeri');
      expect(source).not.toContain('Pengadilan Tinggi');
    }
  });
});


// ---------------------------------------------------------------------------
// The privacy policy.
// ---------------------------------------------------------------------------

describe('the privacy policy', () => {
  it('declares the same section anchors in both locales', () => {
    // `/privacy#8` is linked from terms clause 8, in both languages.
    const id = [...anchorsIn(PRIVACY_HTML['privacy.id'])].sort();
    const en = [...anchorsIn(PRIVACY_HTML['privacy.en'])].sort();
    expect(en).toEqual(id);
    expect(id).toContain('8');
  });

  it('quotes onboarding question 3b as it ACTUALLY ships', () => {
    /*
     * **RECONCILIATION §7.4.** The roadmap's version of 3b enumerated "rape,
     * murder, bullying, suicide, domestic violence"; W3 shipped it WITHOUT the
     * list, at Miftah's explicit direction, because a list of extremes turns an
     * open question into a menu and primes the worst item on it.
     *
     * A privacy policy that quotes the roadmap's wording would be describing a
     * question this app does not ask -- and describing it more luridly than the
     * real one. So: quote the shipped title, and assert the enumeration is
     * absent.
     */
    expect(PRIVACY['privacy.id']).toContain('Hal paling berat yang pernah kamu saksikan');
    expect(PRIVACY['privacy.en']).toContain('The heaviest thing you have watched happen');

    for (const [name, text] of Object.entries(PRIVACY)) {
      for (const word of ['perkosa', 'pemerkosaan', 'rape', 'murder', 'pembunuhan']) {
        expect({ name, word, present: new RegExp(`\\b${word}\\b`, 'i').test(text) }).toEqual({
          name,
          word,
          present: false,
        });
      }
    }
  });

  it('states the retention numbers the code actually enforces', () => {
    // Read from `facts.ts`, which reads the same env the sweep reads. A
    // hand-typed number here is how a policy quietly becomes a lie.
    for (const [name, text] of Object.entries(PRIVACY)) {
      expect({ name, ok: text.includes(String(RETENTION.eventsDays)) }).toEqual({ name, ok: true });
      expect({
        name,
        ok: text.includes(String(RETENTION.moderationQuestionDays)),
      }).toEqual({ name, ok: true });
      expect({ name, ok: text.includes(String(RETENTION.erasureGraceDays)) }).toEqual({
        name,
        ok: true,
      });
    }
  });

  /*
   * ── v0.5.0 / A1: THE ADMIN AMENDMENT (A-D16, reconciliation R31) ────────────
   *
   * **A RELEASE BLOCKER, NOT A FOLLOW-UP.** `/admin` ships in this release, so a
   * policy still describing a system in which nobody reads your answers would be a
   * live legal document that is false in two languages.
   *
   * A-D16 named clauses 3 and 8. **R31 found five**: clause 4's "three parties, and
   * no others", clause 5's honest-limit paragraph (which now has a second limit),
   * and clause 6's retention list (which had no row for a table the sweep is
   * forbidden to touch). Amending only two would leave a policy that is technically
   * amended and still misleading, which is worse than one plainly out of date.
   *
   * The anchor-set equality above is what makes "both locales" mechanical, so the
   * risk was never forgetting `en` -- it was amending too few clauses in both.
   */
  describe('the admin amendment (A-D16, R31)', () => {
    it('describes admin access in BOTH locales', () => {
      expect(PRIVACY['privacy.id']).toContain('satu per satu, satu permintaan untuk satu jawaban');
      expect(PRIVACY['privacy.en']).toContain('one at a time, one request per answer');
    });

    it('promises the audit row is written or the answer is not opened', () => {
      // A1-11/A1-12 as a sentence a person can hold us to, and
      // `audit.integration.test.ts` is what makes it true rather than aspirational.
      expect(PRIVACY['privacy.id']).toContain(
        'Kalau baris itu gagal ditulis, jawabannya tidak dibuka',
      );
      expect(PRIVACY['privacy.en']).toMatch(
        /if that row cannot be written, the answer is not opened/i,
      );
    });

    it('says the operator only reads, and cannot edit', () => {
      // Roadmap §1: "not a write surface over querent data". A policy that omits
      // this leaves a reader assuming the worst available reading.
      expect(PRIVACY['privacy.id']).toContain('Operator hanya membaca');
      expect(PRIVACY['privacy.en']).toContain('The operator only reads');
    });

    it('admits a REFUSED question can be read too', () => {
      // R31 calls this the least comfortable sentence in the amendment and the one
      // most likely to be omitted. It is also the one W7's 30-day redaction makes
      // survivable, so leaving it out would be the choice to look better than we are.
      expect(PRIVACY['privacy.id']).toContain('teks pertanyaan yang pernah ditolak');
      expect(PRIVACY['privacy.en']).toContain('the text of a refused question');
    });

    it('stops claiming three parties are the whole answer', () => {
      expect(PRIVACY['privacy.id']).not.toContain('Tiga pihak, dan tidak ada yang lain.');
      expect(PRIVACY['privacy.en']).not.toContain('Three parties, and no others.');
    });

    it('states the SECOND limit in the clause about limits', () => {
      expect(PRIVACY['privacy.id']).toContain('Batas kedua');
      expect(PRIVACY['privacy.en']).toContain('A second limit');
    });

    it('gives the access log a retention row and an after-erasure statement', () => {
      // The sweep may never touch this table (roadmap §6), so `kept indefinitely`
      // is the honest row -- unusual enough in a retention list that it has to be
      // written rather than inferred from an absence.
      expect(PRIVACY['privacy.id']).toContain('disimpan seterusnya');
      expect(PRIVACY['privacy.en']).toContain('kept indefinitely');
      expect(anchorsIn(PRIVACY_HTML['privacy.id'])).toContain('8-1');
      expect(anchorsIn(PRIVACY_HTML['privacy.en'])).toContain('3-1');
    });

    it('leaves clause 4.4 and every other existing anchor untouched', () => {
      /*
       * `/privacy` §4.4 is cited by name in `src/middleware.ts` and in V7's notes,
       * and the T&C precedent is that sub-numbering is an INTERFACE -- a refusal
       * renders `/terms#6-2`. New anchors are free; renumbering is not.
       */
      for (const anchor of ['3', '4', '4-4', '5', '6', '8']) {
        expect(anchorsIn(PRIVACY_HTML['privacy.id']), anchor).toContain(anchor);
        expect(anchorsIn(PRIVACY_HTML['privacy.en']), anchor).toContain(anchor);
      }
    });
  });

  it('says readings are NOT on the analytics clock, in those words', () => {
    // Reconciliation §7.9b asks for both facts stated explicitly rather than one
    // retention period implied to cover everything.
    expect(PRIVACY['privacy.id']).toContain('selama akunmu ada');
    expect(PRIVACY['privacy.en']).toContain('for the life of your account');
  });

  describe('the z.ai clause (reconciliation §7.1)', () => {
    it('says the question leaves Indonesia', () => {
      expect(PRIVACY['privacy.id']).toContain('meninggalkan Indonesia');
      expect(PRIVACY['privacy.en']).toContain('leaves Indonesia');
    });

    it('scopes the no-training claim to the API terms, not to the company', () => {
      /*
       * **THE CLAIM IS API-SPECIFIC AND THE GENERAL TERMS SAY THE OPPOSITE.** For
       * individual non-API users the same document reserves the right to process
       * user content to improve the service. A blanket "z.ai does not train on
       * your data" would therefore be false, and disprovable by any reader who
       * opens the page we cite.
       */
      expect(PRIVACY['privacy.id']).toContain('Ketentuan API');
      expect(PRIVACY['privacy.en']).toContain('API terms');
    });

    it('asserts NO retention period and NO country on the provider behalf', () => {
      /*
       * The two gaps §7.1 refuses to paper over: the terms publish neither. The
       * honest copy says both are unknown. If a future edit invents "30 days" or
       * "Singapore" to sound reassuring, that is a false statement in a privacy
       * policy, which is the worst place to have one.
       */
      for (const [name, text] of Object.entries(PRIVACY)) {
        for (const invented of [
          /diproses di (?:Singapura|Tiongkok|Cina|Amerika)/i,
          /processed in (?:Singapore|China|the United States)/i,
          /menyimpannya selama \d+/i,
          /retains? (?:it )?for \d+/i,
        ]) {
          expect({ name, invented: String(invented), hit: invented.test(text) }).toEqual({
            name,
            invented: String(invented),
            hit: false,
          });
        }
      }
      // And it says so out loud rather than staying silent.
      expect(PRIVACY['privacy.id']).toContain('belum diketahui');
      expect(PRIVACY['privacy.en']).toContain('unknown');
    });

    it('carries a citation that is not stale', () => {
      /*
       * §7.1's closing paragraph: the clause is recorded with `sourceUrl` +
       * `verifiedOn` exactly like a hotline entry, and held to the same
       * 180-day-warn / 365-day-fail standard. Terms of use change, and a privacy
       * policy quoting a clause that was silently revised is worse than one that
       * never quoted it.
       */
      const days = (Date.now() - Date.parse(`${PROVIDER.verifiedOn}T00:00:00Z`)) / 86_400_000;
      if (days > 180) {
        console.warn(
          `\n[privacy] the z.ai terms citation is ${Math.round(days)} days old.\n` +
            `Re-read ${PROVIDER.termsUrl}, confirm the API clause still reads the same,\n` +
            `then update PROVIDER.verifiedOn. Hard failure at 365 days.\n`,
        );
      }
      expect({ url: PROVIDER.termsUrl, stale: days > 365 }).toEqual({
        url: PROVIDER.termsUrl,
        stale: false,
      });
    });
  });

  it('is Indonesian, not Malay', () => {
    // This document is about retention on almost every line, which is exactly
    // where `tempoh` would land.
    for (const word of MALAY_WORDS) {
      const hit = new RegExp(`\\b${word}\\b`, 'i').test(PRIVACY['privacy.id']);
      expect({ word, hit }).toEqual({ word, hit: false });
    }
  });

  it('does not glue an interpolated value onto the next word', () => {
    for (const [name, text] of Object.entries(PRIVACY)) {
      for (const value of ['cs@citrasukabuana.co.id', 'z.ai (Zhipu AI)']) {
        const glued = new RegExp(`${value.replace(/[.@()]/g, '\\$&')}[A-Za-z]`).test(text);
        expect({ name, value, glued }).toEqual({ name, value, glued: false });
      }
    }
  });
});


// ---------------------------------------------------------------------------

describe('JSX does not swallow a space before wrapped prose', () => {
  /**
   * **THE BUG THIS CATCHES SHIPPED THREE TIMES IN ONE AFTERNOON**, and it was
   * found by looking at a screenshot, not by a test:
   *
   *     www.jmtarot.siteand add to your phone
   *     watched happen.”We quote it here
   *     the language model.The distillation is
   *
   * The rule, learned the hard way: **JSX strips the leading whitespace of a
   * text node that spans more than one line.** A space after `</strong>` or
   * after a `{expression}` survives when the sentence fits on one source line
   * and vanishes when it wraps -- so the failure appears and disappears with
   * code formatting, which is about the worst trigger a bug can have.
   *
   * **THIS IS A SOURCE CHECK ON PURPOSE, AND A RENDER TEST WOULD NOT WORK.**
   * The first attempt rendered the components with `renderToStaticMarkup` and
   * reported CLEAN while the running app was visibly broken: Vite's JSX
   * transform keeps the space and Next's SWC drops it. The only trustworthy
   * oracles are the served bytes and the source itself, and the source is the
   * one available in a unit test.
   *
   * The convention it enforces: after an inline close or an expression, write
   * `{' '}` rather than a bare space whenever the sentence continues onto
   * another line.
   */
  const RISKY = /(<\/(?:em|strong|a|code|Link)>|\})( )(?=[^\s<{])/g;

  const FILES = [
    'app/terms/terms.id.tsx',
    'app/terms/terms.en.tsx',
    'app/privacy/privacy.id.tsx',
    'app/privacy/privacy.en.tsx',
    'components/RefusalNotice.tsx',
  ];

  for (const rel of FILES) {
    it(`uses an explicit {' '} at every wrapping boundary in ${rel}`, () => {
      const src = readFileSync(join(process.cwd(), 'src', rel), 'utf8');
      const offenders: string[] = [];

      for (const m of src.matchAll(RISKY)) {
        // `import { x } from 'y'` is not JSX.
        const line = src.slice(src.lastIndexOf('\n', m.index) + 1, src.indexOf('\n', m.index));
        if (/^\s*import\b/.test(line)) continue;

        /*
         * An ATTRIBUTE, not prose: `className={styles.x} aria-live="polite"`.
         * The `}` closes a prop value and the space after it separates props, so
         * JSX never touched it. Detected by looking back for an unclosed `<`.
         */
        const lastOpen = src.lastIndexOf('<', m.index);
        const lastClose = src.lastIndexOf('>', m.index);
        if (lastOpen > lastClose) continue;

        // Where the text run ends. Only a run that WRAPS loses its leading space.
        const start = m.index + m[0].length;
        const stops = ['<', '{'].map((c) => src.indexOf(c, start)).filter((i) => i !== -1);
        const run = src.slice(start, stops.length ? Math.min(...stops) : src.length);
        if (!run.includes('\n')) continue;

        offenders.push(line.trim().slice(0, 90));
      }

      expect({ file: rel, offenders }).toEqual({ file: rel, offenders: [] });
    });
  }
});
