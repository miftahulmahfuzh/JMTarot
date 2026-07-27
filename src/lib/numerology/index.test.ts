/**
 * The facade's two composites (plan §7).
 *
 * `frequencyCorrespondence` IS NOT TESTED HERE BECAUSE IT IS NOT EXPORTED.
 * Reconciliation §5.4 moved the composed frequency type to V3's
 * `src/lib/memory/shadow.ts` along with dominance. What V1 hands V3 is
 * `shadowArcana` plus `numberGloss`, and `arcana.test.ts` holds the
 * exact-key-set assertion for V1's half.
 */
import { describe, expect, it } from 'vitest';
import { correspondencesFor, personNumbers } from './index';

const MIFTAH = { fullName: 'Miftahul Mahfuzh', nickname: 'Miftah', birthDate: '1994-07-26' };

describe('personNumbers', () => {
  it('is locale-free and stable — the same object for the same input', () => {
    expect(personNumbers(MIFTAH)).toEqual(personNumbers(MIFTAH));
  });

  it('carries five numbers and a sun', () => {
    const p = personNumbers(MIFTAH);
    expect(p.lifePath).not.toBeNull();
    expect(p.expression).not.toBeNull();
    expect(p.soulUrge).not.toBeNull();
    expect(p.personality).not.toBeNull();
    expect(p.nicknamePulse).not.toBeNull();
    expect(p.sun?.sign).toBe('leo');
  });

  it('survives a profile with no usable name', () => {
    const p = personNumbers({ fullName: '王小明', nickname: '', birthDate: '1994-07-26' });
    expect(p.expression).toBeNull();
    expect(p.nicknamePulse).toBeNull();
    expect(p.lifePath).not.toBeNull();
  });

  it('survives a malformed birth date', () => {
    const p = personNumbers({ ...MIFTAH, birthDate: 'nope' });
    expect(p.lifePath).toBeNull();
    expect(p.sun).toBeNull();
    expect(p.expression).not.toBeNull();
  });

  it('is JSON-round-trippable, because it is what `personas.facts` stores', () => {
    const p = personNumbers(MIFTAH);
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });

  it('carries no gloss and no card, so `personas.input_hash` is locale-free', () => {
    // V8 hashes this. A `gloss: string` in here would rehash on every language
    // switch and regenerate the persona the user just read.
    expect(JSON.stringify(personNumbers(MIFTAH))).not.toMatch(/gloss|arcana|"name":/);
  });
});

describe('correspondencesFor', () => {
  it('attaches a gloss and an arcana to every number it has', () => {
    const c = correspondencesFor(MIFTAH, 'id');
    expect(c.lifePath?.gloss.length).toBeGreaterThan(10);
    expect(c.lifePath?.arcana.id).toBeDefined();
    expect(c.sun?.signGloss.length).toBeGreaterThan(10);
    expect(c.sun?.elementGloss.length).toBeGreaterThan(10);
    expect(c.sun?.modalityGloss.length).toBeGreaterThan(10);
  });

  it('differs between locales in the glosses and NOWHERE ELSE', () => {
    const id = correspondencesFor(MIFTAH, 'id');
    const en = correspondencesFor(MIFTAH, 'en');
    expect(id.lifePath?.value).toBe(en.lifePath?.value);
    expect(id.sun?.sign).toBe(en.sun?.sign);
    expect(id.lifePath?.arcana.id).toBe(en.lifePath?.arcana.id);
    expect(id.lifePath?.gloss).not.toBe(en.lifePath?.gloss);
  });

  it('maps the number through arcanaFor, not through birthCard', () => {
    // lifePath('1994-07-26') is 2, so the arcana is CARDS[2].
    const c = correspondencesFor(MIFTAH, 'en');
    expect(c.lifePath?.value).toBe(2);
    expect(c.lifePath?.arcana.name).toBe('The High Priestess');
  });

  it('is null field by field, never a partially-built object', () => {
    const c = correspondencesFor({ fullName: '   ', nickname: '', birthDate: 'nope' }, 'en');
    expect(c).toEqual({
      lifePath: null, expression: null, soulUrge: null,
      personality: null, nicknamePulse: null, sun: null,
    });
  });
});
