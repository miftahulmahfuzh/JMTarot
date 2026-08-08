import { describe, expect, it } from 'vitest';

import { READERS } from '@/data/readers';
import { LOCALES } from '@/lib/i18n/locale';
import { affinityFor, READER_TOPICS, TOPIC_TERMS } from './affinity';

/**
 * §4's tests. **The first one is the drift guard and is the reason `READER_TOPICS` is a
 * literal rather than a derivation**: the mapping cannot be computed off the specialty
 * strings (`"Keputusan karier"` tokenizes to `keputusan`, which matches half of
 * everything), so the agreement between the two has to be a test.
 */
describe('READER_TOPICS agrees with readers.json in shape', () => {
  for (const locale of LOCALES) {
    it(`every reader has as many topics as specialties (${locale})`, () => {
      for (const reader of READERS) {
        expect({
          [reader.id]: READER_TOPICS[reader.id].length,
        }).toEqual({ [reader.id]: reader.specialties[locale].length });
      }
    });
  }

  it('every topic has terms in both locales', () => {
    for (const locale of LOCALES) {
      for (const topics of Object.values(READER_TOPICS)) {
        for (const topic of topics) {
          expect(TOPIC_TERMS[locale][topic].length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('affinityFor routes to the reader whose subject it is', () => {
  it('a career message leads to Thessaly', () => {
    const a = affinityFor('gue mau resign dari kantor tapi gaji di tempat baru belum jelas', 'id');
    expect(a.lead).toBe('thessaly');
    expect(a.by.thessaly).toBe('strong');
  });

  it('a partner message leads to Adrian', () => {
    expect(affinityFor('pacar gue kayaknya mau putus, gue takut banget', 'id').lead).toBe('adrian');
  });

  it('a grandmother message leads to Margaret', () => {
    expect(affinityFor('nenek gue di rumah lama, batin gue ngga tenang', 'id').lead).toBe('margaret');
  });

  it('routes in English too, on its own lexicon and not a translation', () => {
    expect(affinityFor('my boss wants an answer about the promotion', 'en').lead).toBe('thessaly');
    expect(affinityFor('my girlfriend broke up with me and i feel awful', 'en').lead).toBe('adrian');
  });

  /**
   * `[F2-5]`. A proactive run has nothing to score, and **the hint line is then absent
   * rather than three negatives** — a model shown three `tidak`s concludes something is
   * wrong with the querent.
   */
  it('an empty message is all-none with no lead', () => {
    const a = affinityFor('', 'id');
    expect(a).toEqual({ by: { thessaly: 'none', margaret: 'none', adrian: 'none' }, lead: null });
  });

  it('a message hitting two readers has no lead', () => {
    /*
     * Thessaly takes `kantor` + `ribet` (career, problem) and Adrian takes `pacar` +
     * `kecewa` (love, feelings). **Two `strong` readers is a tie, and a tie is null** — the
     * hint says *both of these are plausible* and the model decides, which is `[F2-4]`'s
     * whole position.
     */
    const a = affinityFor('di kantor ribet, dan sama pacar gue juga kecewa', 'id');
    expect(a.by.thessaly).toBe('strong');
    expect(a.by.adrian).toBe('strong');
    expect(a.lead).toBeNull();
  });

  /**
   * One topic and nobody else matched at all is a `strong` claim: it is the only signal
   * there is, so treating it as `some` would produce a hint with no lead on the majority of
   * short messages — which is most of them.
   */
  it('one topic and nothing else matched is a sole claim', () => {
    const a = affinityFor('kerjaan', 'id');
    expect(a.by.thessaly).toBe('strong');
    expect(a.lead).toBe('thessaly');
  });

  /**
   * The negative control, and it is `validateChoice`'s lookaround rule: `\b` is ASCII-only
   * and the bounds are what stop a term matching inside a longer word.
   */
  it('matches whole words only', () => {
    /* `ex` must not fire inside `next`; `hati` must not fire inside `perhatian`. */
    expect(affinityFor('what is the next line of code', 'en').by.adrian).toBe('none');
    expect(affinityFor('makasih perhatiannya ya', 'id').by.margaret).toBe('none');
  });

  /**
   * **A HYPHEN IS A BOUNDARY, AND THAT IS THE TRADE `validateChoice` ALREADY MADE.** It
   * costs one class of false positive — Indonesian reduplication, where `hati-hati` ("be
   * careful") matches the `inner` term `hati` — and it buys the far more common
   * `deadline-nya`, the enclitic-with-a-hyphen shape that appears in this workstream's own
   * worked example. A wrong hint is overrulable by prompt rule 4; a missed one is not.
   */
  it('reduplication is a known and accepted false positive', () => {
    expect(affinityFor('hati-hati di jalan ya', 'id').by.margaret).not.toBe('none');
    expect(affinityFor('deadline-nya minggu depan', 'id').by.thessaly).not.toBe('none');
  });

  it('counts distinct topics and never term occurrences', () => {
    /* `kerja` five times is one topic. Repetition is emphasis, not evidence. */
    const once = affinityFor('kerja', 'id');
    const many = affinityFor('kerja kerja kerja kerja kerja', 'id');
    expect(many.by.thessaly).toBe(once.by.thessaly);
  });
});

describe('the fairness term', () => {
  it('demotes a strong reader who just spoke when somebody else has something', () => {
    const text = 'di kantor ribet banget, gue capek';
    const plain = affinityFor(text, 'id');
    expect(plain.by.thessaly).toBe('strong');

    const demoted = affinityFor(text, 'id', { recentlySpoke: ['thessaly'] });
    expect(demoted.by.thessaly).toBe('some');
    /* And the lead goes with it: there is no unique `strong` reader any more. */
    expect(demoted.lead).toBeNull();
  });

  /**
   * **A DEMOTION THAT PRODUCED AN EMPTY HINT WOULD BE WORSE THAN A REPEATED READER**, so it
   * never fires when nobody else matched anything.
   */
  it('does not demote when nobody else matched anything', () => {
    const text = 'soal kerjaan di kantor lagi';
    const demoted = affinityFor(text, 'id', { recentlySpoke: ['thessaly'] });
    expect(demoted.by.thessaly).toBe('strong');
    expect(demoted.lead).toBe('thessaly');
  });

  it('never silences anybody', () => {
    const a = affinityFor('pacar gue, perasaan gue, hubungan gue', 'id', {
      recentlySpoke: ['adrian', 'thessaly', 'margaret'],
    });
    expect(a.by.adrian).not.toBe('none');
  });
});
