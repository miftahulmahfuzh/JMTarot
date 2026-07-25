import { CARDS, effectiveYesNo } from '@/data/deck';
import { readerById } from '@/data/readers';
import { serviceById, slotLabels } from '@/data/services';
import type { ReadingPrompt } from '@/lib/llm/types';
import { BASE_CONTRACT } from './base';
import { READER_PROMPTS } from './readers';
import { MAX_TOKENS, servicePrompt } from './services';
import { sanitizeQuestion } from './sanitize';

export type Pick = { id: number; reversed: boolean };

export type BuildArgs = {
  reader: string;
  service: string;
  picks: Pick[];
  question?: string | null;
};

/**
 * Assemble the system prompt and the user turn for one reading.
 *
 * The client sends card ids and orientation, nothing else. Every word of card
 * text here is looked up from cards.json by id, so a tampered client cannot
 * inject invented card content into the prompt.
 */
export function buildPrompt({ reader, service, picks, question }: BuildArgs): ReadingPrompt {
  const r = readerById(reader);
  if (!r) throw new Error(`Unknown reader: ${reader}`);

  const s = serviceById(service);
  if (!s) throw new Error(`Unknown service: ${service}`);

  if (picks.length !== s.cardCount) {
    throw new Error(`Service ${s.id} needs ${s.cardCount} card(s), got ${picks.length}`);
  }

  const draws = picks.map(({ id, reversed }) => {
    const card = CARDS[id];
    if (!card || card.id !== id) throw new Error(`Unknown card id: ${id}`);
    return { card, reversed };
  });

  /*
   * The yes/no verdict is derived here, in code, from the deck's own
   * semantics -- including the reversal flip -- and handed to the model as a
   * given. Letting the model choose produced answers that contradicted the
   * card's own orientation, which is the one thing a yes/no reading cannot do.
   */
  const verdict = s.id === 'yesno' ? effectiveYesNo(draws[0]) : undefined;

  const system = [
    BASE_CONTRACT,
    READER_PROMPTS[r.id],
    servicePrompt(s.id, verdict),
  ].join('\n\n');

  const labels = slotLabels(s, r);
  const cardLines = draws.map((d, i) => {
    const position = labels[i] ?? labels[0];
    const orientation = d.reversed ? ' (terbalik)' : '';
    return (
      `${i + 1}. ${position} — ${d.card.name}${orientation}` +
      ` — kata kunci: ${d.card.keywords.join(', ')}` +
      ` — tahap: ${d.card.stage} — muatan: ${d.card.polarity}`
    );
  });

  /*
   * The question goes in the USER turn only, never the system prompt, and
   * always inside the delimiter the base contract names. Interpolating it into
   * the system prompt would put querent-controlled text where instructions
   * live.
   */
  const clean = sanitizeQuestion(question);
  const questionBlock = clean
    ? `<pertanyaan>\n${clean}\n</pertanyaan>`
    : 'Penanya tidak menuliskan pertanyaan. Baca kartunya secara umum.';

  const user = [
    `Pembaca: ${r.name}`,
    `Layanan: ${s.name}`,
    '',
    'Kartu:',
    ...cardLines,
    '',
    questionBlock,
  ].join('\n');

  return { system, user, maxTokens: MAX_TOKENS[s.id] };
}
