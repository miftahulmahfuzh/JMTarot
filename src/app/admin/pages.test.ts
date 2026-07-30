/**
 * The admin page table. 2026-07-30.
 *
 * `ADMIN_PAGES` gained a `tab` column so `AdminTabs` can light a tab without a
 * pathname (R32 — see the file's header). **A `tab` naming an entry with no label
 * lights nothing**, and the symptom is a tab row where none of the four is on, on one
 * route only. Nothing about that appears in a diff, so it is asserted here.
 */
import { describe, expect, it } from 'vitest';
import { ADMIN_PAGES, ADMIN_TABS, tabFor } from './pages';

describe('every entry points at a tab that actually renders', () => {
  it('names a labelled entry from its own table', () => {
    const labelled = new Set(ADMIN_TABS.map((p) => p.path));
    // Not vacuous: there is more than one tab, and fewer tabs than pages.
    expect(labelled.size).toBeGreaterThan(1);
    expect(labelled.size).toBeLessThan(ADMIN_PAGES.length);

    for (const p of ADMIN_PAGES) {
      expect(labelled.has(p.tab), `${p.path} points at '${p.tab}', which renders no tab`).toBe(
        true,
      );
    }
  });

  it('is total over every page, so no route can fail to light one', () => {
    // `tabFor` is the only reader and it must answer for every entry -- a route with no
    // tab on is a nav that goes dead on the deepest page, which is the one you scroll.
    for (const p of ADMIN_PAGES) {
      expect(tabFor(p.path), p.path).toBe(p.tab);
    }
  });

  it('sends a labelled page to itself, and a sub-route to its parent', () => {
    // The two cases the column exists for, spelled out so a future entry has a pattern.
    expect(tabFor('/admin')).toBe('/admin');
    expect(tabFor('/admin/users')).toBe('/admin/users');
    expect(tabFor('/admin/users/[id]')).toBe('/admin/users');
    expect(tabFor('/admin/blog/new')).toBe('/admin/blog');
    expect(tabFor('/admin/blog/[slug]')).toBe('/admin/blog');
  });
});

describe('ADMIN_TABS is the nav, in nav order', () => {
  it('drops exactly the entries with no label, keeping their order', () => {
    expect(ADMIN_TABS.map((p) => p.path)).toEqual(
      ADMIN_PAGES.filter((p) => p.label !== null).map((p) => p.path),
    );
  });

  it('carries a non-empty Indonesian label for each, never a translation call', () => {
    // A-D12: admin copy is hardcoded and never enters the i18n catalog. A label that
    // arrived as a key would render as the key.
    for (const p of ADMIN_TABS) {
      expect(p.label.length, p.path).toBeGreaterThan(0);
      expect(p.label, p.path).not.toMatch(/\./);
    }
  });
});
