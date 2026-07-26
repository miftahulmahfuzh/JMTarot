import { CARDS, effectiveYesNo } from '@/data/deck';
import { readerById } from '@/data/readers';
import { serviceById, slotLabels } from '@/data/services';
import type { ReadingPrompt } from '@/lib/llm/types';
import { BASE_CONTRACT } from './base';
import { renderLotusBlock } from './lotus';
import { READER_PROMPTS } from './readers';
import { MAX_TOKENS, servicePrompt } from './services';
import { sanitizeQuestion } from './sanitize';

export type Pick = { id: number; reversed: boolean };

/**
 * The shared extension point for everything that is neither the cards nor the
 * question.
 *
 * ONE OBJECT, TWO OWNERS. Reconciliation §2 gives this file to W6 and settles
 * that W3 contributes `lotus` and W5 contributes `memory` -- so that three
 * workstreams that each need to add a field to `buildPrompt` do not each change
 * its signature. W6 has not landed, so W3 writes the plumbing, which is the rule
 * both plans agreed on: whichever lands first builds it and the other adds a
 * field and a renderer.
 *
 * EVERY FIELD HERE IS DERIVED FROM USER-TYPED TEXT, which is the property that
 * decides where it is rendered. Roadmap §7: all of it is model-facing CONTENT and
 * none of it is instructions, so each block is delimited and labelled exactly the
 * way `<pertanyaan>` is, and none of it goes in the system prompt.
 */
export type PromptContext = {
  /**
   * W3. The distilled Lotus summary in the request's locale, plus the nickname.
   *
   * NULL IS NORMAL AND IS NOT AN ERROR: not yet distilled, distillation failed,
   * or the user skipped every question. All three produce a valid reading.
   */
  lotus?: { nickname: string; summary: string } | null;
  /**
   * W5. The "what came before" block -- the last reading or two, as cards and a
   * one-clause gist. W5 owns the renderer; this field reserves the name.
   */
  memory?: string | null;
};

export type BuildArgs = {
  reader: string;
  service: string;
  picks: Pick[];
  question?: string | null;
  context?: PromptContext;
};

/**
 * Assemble the system prompt and the user turn for one reading.
 *
 * The client sends card ids and orientation, nothing else. Every word of card
 * text here is looked up from cards.json by id, so a tampered client cannot
 * inject invented card content into the prompt.
 */
export function buildPrompt({
  reader,
  service,
  picks,
  question,
  context,
}: BuildArgs): ReadingPrompt {
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

  /*
   * The Lotus block, AHEAD OF THE CARDS.
   *
   * Position is doing real work here. In the user turn it cannot be mistaken for
   * the contract; ahead of the cards it reads as background the cards are then
   * laid over, rather than as the subject of the reading. Behind them it would
   * read as a conclusion.
   *
   * `renderLotusBlock` is the ONLY place `<penanya>` is written, and it
   * sanitizes and caps on the way out -- so a nickname or a summary carrying a
   * delimiter cannot close the block early.
   */
  const lotus = context?.lotus;
  const lotusBlock = lotus ? renderLotusBlock(lotus) : null;

  const user = [
    `Pembaca: ${r.name}`,
    `Layanan: ${s.name}`,
    '',
    ...(lotusBlock ? [lotusBlock, ''] : []),
    'Kartu:',
    ...cardLines,
    '',
    questionBlock,
  ].join('\n');

  return { system, user, maxTokens: MAX_TOKENS[s.id] };
}
