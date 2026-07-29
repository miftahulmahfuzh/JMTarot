/**
 * The wallpaper asset contract. PURE, CLIENT-IMPORTABLE, and a LEAF.
 *
 * S5 owns the asset; S3 owns where the control is mounted (roadmap §7, R8). This
 * module is the boundary between them: a variant name, a size, a URL, and the
 * filename the person ends up with on disk.
 *
 * **NO `process.env`, EVER**, for the reason `src/lib/share/slug.ts` gives: this
 * is imported by a client component, and an origin read here would either inline
 * a build-time value into the bundle or be `undefined` at runtime. Every path
 * below is root-relative, which is also what makes the `download` attribute work
 * -- see the note on cross-origin below.
 *
 * **NO VERSION AND NO CONTENT HASH IN THE FILENAME**, and that is a decision
 * rather than an omission. `src/data/deck.ts`'s `ART_VERSION` exists because
 * `/cards/*` is served `max-age=31536000, immutable` -- correct there, because the
 * fan pulls 22 files on every cold draw. `/wallpapers/*` is served
 * `max-age=86400, stale-while-revalidate=604800` instead, because a wallpaper is
 * fetched ONCE by somebody who tapped a button, so caching it for a year buys
 * nothing and costs the whole staleness problem that header's comment describes.
 * A regenerated deck therefore propagates on its own within a day, and there is
 * no number here to forget to bump. A test asserts the URL contains no `?`.
 */
import type { Card } from '@/data/types';
import { cardUrlSlug } from '@/data/deck';

/**
 * Two variants, and the roadmap fixes the count (§7, S5; reconciliation R3
 * refused the reduction to one).
 *
 * `card` is the native source resolution -- the honest maximum, for somebody who
 * wants the artwork rather than a wallpaper. `phone` is those exact pixels,
 * unscaled, centred on the app's backdrop.
 */
export const WALLPAPER_VARIANTS = ['card', 'phone'] as const;
export type WallpaperVariant = (typeof WALLPAPER_VARIANTS)[number];

/**
 * The dimensions, duplicated from `tools/make_wallpapers.py` on purpose.
 *
 * They are an INTERFACE, not an implementation detail: the copy states them to
 * the person deciding whether to download ("Phone wallpaper, 1440x3120"), and
 * `srcset`-free `width`/`height` attributes need them to reserve layout. The
 * duplication is closed mechanically -- `wallpaper.test.ts` reads the committed
 * files off disk and asserts their real pixel dimensions against this table, so
 * Python and TypeScript cannot drift without a red suite.
 */
export const WALLPAPER_SIZE: Record<WallpaperVariant, { width: number; height: number }> = {
  card: { width: 1024, height: 1536 },
  phone: { width: 1440, height: 3120 },
};

/** Root-relative path to the asset. Never absolute — see the header. */
export function wallpaperPath(urlSlug: string, variant: WallpaperVariant): string {
  return `/wallpapers/${urlSlug}-${variant}.jpg`;
}

/**
 * The name the file gets in the person's Downloads or Photos.
 *
 * Prefixed `jmtarot-` because a folder full of `the-moon-phone.jpg` from four
 * different sites is a folder nobody can use. **The `download` attribute is
 * IGNORED ON A CROSS-ORIGIN URL** (same-origin-or-nothing, in every browser), so
 * this only works while the asset is served from our own origin. If wallpapers
 * ever move to an image CDN, this function's output stops being the filename and
 * a `content-disposition` on the CDN becomes the only mechanism.
 */
export function wallpaperFilename(urlSlug: string, variant: WallpaperVariant): string {
  return `jmtarot-${urlSlug}-${variant}.jpg`;
}

/** Both variants for one card, in the order they should be offered. */
export function wallpapersFor(card: Card): {
  variant: WallpaperVariant;
  href: string;
  filename: string;
  width: number;
  height: number;
}[] {
  const slug = cardUrlSlug(card);
  return WALLPAPER_VARIANTS.map((variant) => ({
    variant,
    href: wallpaperPath(slug, variant),
    filename: wallpaperFilename(slug, variant),
    ...WALLPAPER_SIZE[variant],
  }));
}
