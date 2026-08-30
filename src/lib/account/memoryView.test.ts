import { describe, expect, it } from 'vitest';

import { isMemoryItemId, memoryItems, type MemoryRowLike } from './memoryView';

/**
 * The adapter is the only thing standing between phase 3's payload and every string
 * of copy in this phase, so every refusal is asserted rather than only the happy
 * path.
 *
 * **THE FIXTURES CARRY `kind` AND `lastSeen` BECAUSE THE NARROWER IS PHASE 3's.**
 * This plan's draft fixtures predated the reconciliation ruling that named
 * `isUserMemoryItem` as the narrower, and carried neither field and a two-character
 * `id` — so they would have asserted the opposite of what the module does. Kept as a
 * warning: a fixture that is not a real row tests the fixture.
 */
const NASI = {
  id: 'a1b2c3d4e5f6',
  kind: 'taste' as const,
  text: 'Suka nasi padang, apalagi kalau lagi capek.',
  lastSeen: '2026-08-30',
};
const LARI = {
  id: '0123456789ab',
  kind: 'habit' as const,
  text: 'Lari pagi, idealnya jam lima.',
  lastSeen: '2026-08-29',
};

describe('memoryItems', () => {
  it('returns nothing for no row', () => {
    expect(memoryItems(null)).toEqual([]);
    expect(memoryItems(undefined)).toEqual([]);
    expect(memoryItems({})).toEqual([]);
  });

  it('reads the list item by item, in stored order', () => {
    expect(memoryItems({ items: [NASI, LARI] })).toEqual([
      { id: NASI.id, text: NASI.text },
      { id: LARI.id, text: LARI.text },
    ]);
  });

  it('renders the text and NOTHING else — no kind, no date', () => {
    /*
     * `C-D8`'s ban on saying how you know, one surface over. A date on this screen is
     * the same material that turns *"nasi padang lagi kan?"* into *"you told me on
     * the 9th"*, and the view type is what makes it unavailable rather than merely
     * unused.
     */
    const [row] = memoryItems({ items: [NASI] });
    expect(Object.keys(row).sort()).toEqual(['id', 'text']);
  });

  it('answers empty when there is no items array at all', () => {
    /*
     * RECONCILED: the two cases here used to be the prose-blob arm and a
     * both-shapes-present tie-break. Phase 3 chose the item list and the blob arm is
     * cancelled, so what is left to assert is that anything which is NOT a list reads
     * as nothing rather than as one mysterious line.
     */
    expect(memoryItems({} as MemoryRowLike)).toEqual([]);
    expect(memoryItems({ items: 'nope' } as unknown as MemoryRowLike)).toEqual([]);
  });

  it('drops a malformed item rather than the whole list', () => {
    /*
     * One bad row must not blank the screen: the querent came here to delete
     * something, and an empty list would tell them there is nothing to delete while
     * the prompt still reads the rest.
     */
    const row: MemoryRowLike = {
      items: [
        null,
        42,
        NASI,
        { ...LARI, text: '   ' },
        { ...LARI, kind: 'vibes' },
        { ...LARI, lastSeen: 'yesterday' },
        { text: 'no id' },
      ],
    };
    expect(memoryItems(row)).toEqual([{ id: NASI.id, text: NASI.text }]);
  });

  it('lists exactly what phase 5 puts in the prompt, and no more', () => {
    /*
     * **THE PROPERTY THIS WHOLE SURFACE EXISTS FOR.** `src/lib/chat/context.ts`
     * filters the same column through `isUserMemoryItem` before an item reaches
     * `<ingatan>`. If the two predicates ever diverge, one of two bugs ships in
     * silence: a line the readers were told that carries no delete button, or a
     * delete button for a line they were never told.
     */
    const mixed = [NASI, { ...LARI, kind: 'vibes' }, LARI];
    const shown = memoryItems({ items: mixed }).map((i) => i.id);
    const prompted = mixed
      .filter((raw): raw is typeof NASI => isPromptable(raw))
      .map((i) => i.id);
    expect(shown).toEqual(prompted);
  });

  it('caps the list and clips each line', () => {
    /*
     * Both ceilings sit ABOVE what phase 3 enforces, so these fixtures are
     * deliberately illegal rows: a real payload cannot reach either. That is the
     * point — this is the belt, and a belt is tested by removing the brace.
     */
    const many = Array.from({ length: 90 }, (_, i) => ({
      ...NASI,
      id: i.toString(16).padStart(12, '0'),
      text: `catatan ${i}`,
    }));
    expect(memoryItems({ items: many })).toHaveLength(60);

    const long = 'y'.repeat(900);
    expect(memoryItems({ items: [{ ...NASI, text: long }] })).toEqual([]);
  });

  it('drops an item whose id would not survive the URL narrowing', () => {
    // The id round-trips through a path segment on the delete route, so an id this
    // module renders and that route refuses would be a delete button that 400s.
    expect(memoryItems({ items: [{ ...NASI, id: '../../etc' }] })).toEqual([]);
  });
});

/** Phase 5's filter, spelled out here so the agreement test cannot pass vacuously. */
function isPromptable(raw: unknown): boolean {
  const KINDS = ['habit', 'taste', 'person', 'situation', 'place', 'trait', 'other'];
  if (typeof raw !== 'object' || raw === null) return false;
  const v = raw as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    isMemoryItemId(v.id) &&
    typeof v.kind === 'string' &&
    KINDS.includes(v.kind) &&
    typeof v.text === 'string' &&
    v.text.length > 0 &&
    v.text.length <= 140 &&
    typeof v.lastSeen === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.lastSeen)
  );
}

describe('isMemoryItemId', () => {
  /**
   * **PHASE 3's `USER_MEMORY_ITEM_ID_RE`, IMPORTED RATHER THAN DUPLICATED** — the
   * plan asked for a copy so this module could stay at zero imports, and
   * `isUserMemoryItem` already spends that budget on the same leaf. With it spent, an
   * import cannot drift at all where a copy could only drift safely.
   */
  it('admits a content-derived item id: twelve lowercase hex', () => {
    for (const ok of ['a'.repeat(12), '0123456789ab', 'deadbeefcafe']) {
      expect({ ok, admitted: isMemoryItemId(ok) }).toEqual({ ok, admitted: true });
    }
  });

  it('refuses everything else, including the cancelled reserved word', () => {
    for (const bad of [
      '',
      ' ',
      'whole',
      'A'.repeat(12),
      'a'.repeat(11),
      'a'.repeat(13),
      'ab-cd',
      'has space',
      '../x',
      'é'.repeat(12),
    ]) {
      expect({ bad, admitted: isMemoryItemId(bad) }).toEqual({ bad, admitted: false });
    }
  });
});
