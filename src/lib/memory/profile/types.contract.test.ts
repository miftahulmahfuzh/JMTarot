import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isUserMemoryItem,
  USER_MEMORY_ITEM_ID_RE,
  USER_MEMORY_ITEM_MAX_CHARS,
  USER_MEMORY_KINDS,
  USER_MEMORY_MAX_ITEMS,
  USER_MEMORY_SOURCE_VERSION,
} from './types';

const RAW = readFileSync('src/lib/memory/profile/types.ts', 'utf8');
const CODE = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the user-memory type leaf', () => {
  it('imports nothing at all', () => {
    // A LEAF. `schema.ts` type-imports it, and schema.ts's narrowing rule is that
    // it may never depend on a module that depends on schema.ts. Zero imports is
    // the only version of that promise nobody has to re-check.
    const specs = [...CODE.matchAll(/^\s*import\s.*?['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    expect(specs).toEqual([]);
  });

  it('carries no server marker, no environment read and no database', () => {
    // A client component renders an item and offers a delete control. The first
    // would be a build error; the second reads `undefined` in the browser, which
    // is `localeSwitcherEnabled()`'s ten minutes inside `LocaleSwitch.tsx`.
    for (const sentinel of ["'server-only'", 'process.env', '@/lib/db/']) {
      expect({ sentinel, present: CODE.includes(sentinel) }).toEqual({ sentinel, present: false });
    }
    // The stripper must not have eaten the code it is checking.
    expect(CODE).toContain('USER_MEMORY_KINDS');
  });

  it('carries no prompt prose', () => {
    /*
     * Phase 4's `prompt.ts` lands beside this file. The moment a sentence of the
     * extractor's contract migrates in here "so the validator can share it", the
     * client-importability above becomes the leak rule 1 of `clientBoundary.test.ts`
     * exists to prevent.
     */
    for (const sentinel of ['ATURAN', 'Kamu adalah', 'You are a', 'Tulis ', 'Write one']) {
      expect({ sentinel, present: CODE.includes(sentinel) }).toEqual({ sentinel, present: false });
    }
  });

  it('has seven kinds, and `other` among them', () => {
    // Not a round number for its own sake: the count is asserted so that widening
    // the set is a decision somebody makes on purpose. Every id in every tombstone
    // has a kind in its preimage.
    expect(USER_MEMORY_KINDS).toHaveLength(7);
    expect(USER_MEMORY_KINDS).toContain('other');
    expect(new Set(USER_MEMORY_KINDS).size).toBe(USER_MEMORY_KINDS.length);
  });

  it('keeps the budget constants where a reviewer can see them', () => {
    expect(USER_MEMORY_MAX_ITEMS).toBe(32);
    expect(USER_MEMORY_ITEM_MAX_CHARS).toBe(140);
    expect(USER_MEMORY_SOURCE_VERSION).toBe(1);
    expect(USER_MEMORY_ITEM_ID_RE.source).toBe('^[0-9a-f]{12}$');
  });
});

describe('isUserMemoryItem', () => {
  const good = {
    id: '0a1b2c3d4e5f',
    kind: 'taste',
    text: 'suka nasi padang',
    lastSeen: '2026-08-30',
  };

  it('accepts a well-formed item', () => {
    expect(isUserMemoryItem(good)).toBe(true);
  });

  it('refuses everything a bad jsonb read can hand back', () => {
    for (const bad of [
      null,
      undefined,
      'a string',
      42,
      [],
      { ...good, id: 'NOTHEX' },
      { ...good, id: '0a1b2c3d4e5' }, // eleven
      { ...good, id: '0A1B2C3D4E5F' }, // uppercase; ids are lowercase hex by contract
      { ...good, kind: 'favourite' },
      { ...good, text: '' },
      { ...good, text: 'x'.repeat(USER_MEMORY_ITEM_MAX_CHARS + 1) },
      { ...good, lastSeen: new Date() },
      { ...good, lastSeen: '30-08-2026' },
    ]) {
      expect({ bad, ok: isUserMemoryItem(bad) }).toEqual({ bad, ok: false });
    }
  });
});
