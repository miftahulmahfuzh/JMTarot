import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARDS } from '@/data/deck';
import {
  WALLPAPER_SIZE,
  WALLPAPER_VARIANTS,
  wallpaperFilename,
  wallpaperPath,
  wallpapersFor,
} from '@/lib/wallpaper';

/**
 * The seam between `tools/make_wallpapers.py` and the TypeScript that links to
 * what it wrote.
 *
 * The Python holds its own slug derivation and its own dimensions; so does
 * `check_wallpapers.py`; so does this module. Three copies of one fact is
 * normally a smell, and here it is the design: no language can import the other,
 * so the FILESYSTEM is the shared artefact, and the check that ties them together
 * is "does the URL this module builds name a file that exists, at the size this
 * module claims". That is the assertion below, and it fails on either side
 * drifting.
 */
const PUBLIC = join(process.cwd(), 'public');

/** JPEG SOF0/SOF2 dimensions, without a decoder. Enough to prove the size. */
function jpegSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  for (let i = 2; i < buf.length - 9; ) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error(`no SOF marker in ${path}`);
}

describe('the wallpaper URL contract', () => {
  it('offers exactly two variants', () => {
    expect(WALLPAPER_VARIANTS).toEqual(['card', 'phone']);
  });

  it('builds a root-relative path with NO query string', () => {
    // The whole reason this path carries no `?v=` -- see the module header. A
    // query string here would also break `next/image`, which refuses a local src
    // with one unless `images.localPatterns` is configured.
    for (const { href } of wallpapersFor(CARDS[18])) {
      expect(href.startsWith('/wallpapers/')).toBe(true);
      expect(href).not.toContain('?');
      expect(href).not.toContain('http');
    }
  });

  it('names The Moon by its URL slug and never by its art slug', () => {
    expect(wallpaperPath('the-moon', 'phone')).toBe('/wallpapers/the-moon-phone.jpg');
    expect(wallpaperPath('the-moon', 'card')).toBe('/wallpapers/the-moon-card.jpg');
    expect(wallpaperFilename('the-moon', 'phone')).toBe('jmtarot-the-moon-phone.jpg');
    // The art slug addresses a FILE; this addresses a document a person found by
    // typing words. S-D4.
    expect(wallpaperPath('the-moon', 'card')).not.toContain('18_moon');
    // And the card this test names really is The Moon, so a reordered deck fails
    // here rather than silently checking a different card above.
    expect(CARDS[18].name).toBe('The Moon');
  });

  it('covers all 22 cards and both variants: 44 committed files', () => {
    const paths = CARDS.flatMap((c) => wallpapersFor(c).map((w) => w.href));
    expect(paths).toHaveLength(44);
    expect(new Set(paths).size).toBe(44);
  });

  it('every URL names a committed file that is not a 0-byte write', () => {
    for (const card of CARDS) {
      for (const { href } of wallpapersFor(card)) {
        const path = join(PUBLIC, href);
        expect(existsSync(path), `${href} is missing -- run npm run wallpapers`).toBe(true);
        expect(statSync(path).size).toBeGreaterThan(150_000);
      }
    }
  });

  it('the committed files really are the dimensions this module claims', () => {
    // THIS is what closes the Python/TypeScript duplication. A change to
    // PHONE_H in make_wallpapers.py without a change to WALLPAPER_SIZE here is
    // red, and so is the reverse.
    for (const card of CARDS) {
      for (const { href, variant, width, height } of wallpapersFor(card)) {
        expect(jpegSize(join(PUBLIC, href))).toEqual({ width, height });
        expect({ width, height }).toEqual(WALLPAPER_SIZE[variant]);
      }
    }
  });

  it('never upscales: the card variant is exactly the source resolution', () => {
    // 1024x1536 is the art's true resolution (verified: all 22 sources, mode
    // RGB, no ICC). A `card` variant at any other size means somebody resampled.
    expect(WALLPAPER_SIZE.card).toEqual({ width: 1024, height: 1536 });
  });
});
