import type { Reader, Service, ServiceId } from './types';

/**
 * The three services. Each gets its own flow, and the active reader layers a
 * persona on top -- so the matrix is 3 services x 3 readers.
 */
export const SERVICES: Service[] = [
  {
    id: 'daily',
    name: 'Kartu Harian',
    tagline: 'Satu kartu untuk gambaran energi hari ini.',
    cardCount: 1,
    singleLabel: 'Hari ini',
    /** The free daily hook: one pull per calendar day, then it locks. */
    oncePerDay: true,
  },
  {
    id: 'spread3',
    name: 'Tiga Kartu',
    tagline: 'Bacaan lengkap untuk situasi yang sedang kamu jalani.',
    cardCount: 3,
    singleLabel: null,
    oncePerDay: false,
  },
  {
    id: 'yesno',
    name: 'Ya atau Tidak',
    tagline: 'Satu kartu, jawaban tegas. Untuk keputusan yang butuh kepastian sekarang.',
    cardCount: 1,
    singleLabel: 'Jawaban',
    oncePerDay: false,
  },
];

export function serviceById(id: string): Service | undefined {
  return SERVICES.find((s) => s.id === id);
}

export function isServiceId(id: string): id is ServiceId {
  return SERVICES.some((s) => s.id === id);
}

/**
 * Slot captions for the draw screen.
 *
 * The three-card spread borrows the reader's own framing, which is why Margaret
 * says "Yang telah berlalu" where Adrian says "Yang udah lewat". Single-card
 * services have nothing to position, so they use a fixed caption.
 */
export function slotLabels(service: Service, reader: Reader): string[] {
  if (service.cardCount === 3) return reader.positionFraming;
  return [service.singleLabel ?? reader.positionFraming[1]];
}
