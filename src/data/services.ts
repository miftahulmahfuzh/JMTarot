import type { Locale, Reader, Service, ServiceId } from './types';

/**
 * The three services. Each gets its own flow, and the active reader layers a
 * persona on top -- so the matrix is 3 services x 3 readers.
 */
export const SERVICES: Service[] = [
  {
    id: 'daily',
    name: { id: 'Kartu Harian', en: 'Daily Card' },
    tagline: {
      id: 'Satu kartu untuk gambaran energi hari ini.',
      en: 'One card for the shape of today.',
    },
    cardCount: 1,
    singleLabel: { id: 'Hari ini', en: 'Today' },
    /** The free daily hook: one pull per calendar day, then it locks. */
    oncePerDay: true,
  },
  {
    id: 'spread3',
    name: { id: 'Tiga Kartu', en: 'Three Cards' },
    tagline: {
      id: 'Bacaan lengkap untuk situasi yang sedang kamu jalani.',
      en: 'A full reading for whatever you are in the middle of.',
    },
    cardCount: 3,
    singleLabel: null,
    oncePerDay: false,
  },
  {
    id: 'yesno',
    name: { id: 'Ya atau Tidak', en: 'Yes or No' },
    tagline: {
      id: 'Satu kartu, jawaban tegas. Untuk keputusan yang butuh kepastian sekarang.',
      en: 'One card, one straight answer. For the decision that will not wait.',
    },
    cardCount: 1,
    singleLabel: { id: 'Jawaban', en: 'The answer' },
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
 * says "Yang telah berlalu" where Adrian says "Yang udah lewat" -- and, in
 * English, "What has passed" where Adrian says "What's done". Single-card
 * services have nothing to position, so they use a fixed caption.
 *
 * These strings are ALSO prompt input (I14). The same array reaches the model as
 * the paragraph openings the three-card task demands, which is why the locale is a
 * parameter here rather than resolved inside: the caller knows whether it is
 * rendering a screen or building a prompt, and in `/api/reading` the prompt's
 * locale is captured before the stream opens.
 */
export function slotLabels(service: Service, reader: Reader, locale: Locale): string[] {
  if (service.cardCount === 3) return reader.positionFraming[locale];
  return [service.singleLabel?.[locale] ?? reader.positionFraming[locale][1]];
}
