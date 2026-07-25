import raw from './readers.json';
import type { Reader, ReaderId } from './types';

export const READERS = raw as Reader[];

/**
 * Static art registry -- Metro resolves `require` at build time, so portraits
 * cannot be looked up by a computed path.
 *
 * These are 2:1 landscape environmental scenes rather than cut-out avatars,
 * which is why readers are presented as wide banners instead of the columns the
 * original sketch showed.
 */
export const READER_ART: Record<ReaderId, number> = {
  thessaly: require('@/assets/dukuns/thessaly.jpg'),
  margaret: require('@/assets/dukuns/margaret.jpg'),
  adrian: require('@/assets/dukuns/adrian.jpg'),
};

export function readerById(id: string): Reader | undefined {
  return READERS.find((r) => r.id === id);
}

export function isReaderId(id: string): id is ReaderId {
  return READERS.some((r) => r.id === id);
}

/** Fallback for the daily shortcut before the user has expressed a preference. */
export const DEFAULT_READER: Reader = READERS[0];
