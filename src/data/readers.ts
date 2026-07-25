import raw from './readers.json';
import type { Reader, ReaderId } from './types';

export const READERS = raw as Reader[];

/**
 * Reader portraits are 2:1 landscape environmental scenes rather than cut-out
 * avatars, which is why readers are presented as wide banners instead of the
 * columns the original sketch showed.
 *
 * The iOS build needed a static registry here because Metro resolves `require`
 * at build time and cannot look up a computed path. On the web the URL *is*
 * the lookup, so the registry is gone.
 */
export function readerPortrait(id: ReaderId): string {
  return `/dukuns/${id}.jpg`;
}

export function readerById(id: string): Reader | undefined {
  return READERS.find((r) => r.id === id);
}

export function isReaderId(id: string): id is ReaderId {
  return READERS.some((r) => r.id === id);
}

/** Fallback for the daily shortcut before the user has expressed a preference. */
export const DEFAULT_READER: Reader = READERS[0];
