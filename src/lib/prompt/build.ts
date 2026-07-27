import 'server-only';

import { createHash } from 'node:crypto';
import { CARDS, cardKeywords, effectiveYesNo } from '@/data/deck';
import { readerById } from '@/data/readers';
import { serviceById, slotLabels } from '@/data/services';
import type { Locale } from '@/data/types';
import type { ReadingPrompt } from '@/lib/llm/types';
import { baseContract } from './base';
import { renderLotusBlock } from './lotus';
import { memoryBlock, memoryInstruction, type MemoryContext } from './memory';
import { readerPrompt } from './readers';
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
   * one-clause gist.
   *
   * W3 RESERVED THIS AS `string | null` AND W5 WIDENED IT TO THE CONTEXT OBJECT,
   * which is the right way round: a pre-rendered string would have forced the
   * ROUTE to call `memoryBlock()` and `memoryInstruction()` and to know that one
   * goes in the user turn and the other in the system prompt. That knowledge is
   * exactly what M10 is about, and it belongs in this file with the
   * `<pertanyaan>` placement it mirrors, not spread across every caller.
   *
   * Null is normal and is not an error: the relevance gate omitted the block
   * (§4.3), there is no history yet, or `MEMORY_CHAIN_COUNT=0` has switched
   * chaining off entirely.
   */
  memory?: MemoryContext | null;
};

export type BuildArgs = {
  reader: string;
  service: string;
  picks: Pick[];
  question?: string | null;
  context?: PromptContext;
  /**
   * W6's, reserved here because `promptVersion` needs it and W6 has not landed.
   * There is one prompt fork today, so the default is the only value.
   */
  locale?: Locale;
};

/**
 * The user turn's labels, per locale (§9.1).
 *
 * MODEL-FACING VOCABULARY, NOT UI COPY, which is why it is here and not in
 * `src/lib/i18n/locales/*`. No querent ever sees any of these strings. Keeping them
 * beside the prompt layer means nobody edits `muatan:` because it reads awkwardly on
 * a screen it never appears on.
 *
 * The trailing space is inside the label rather than in the template, so a locale can
 * write `Pembaca:` or `Reader —` or nothing at all without the caller knowing.
 */
const TURN_LABELS: Record<Locale, {
  reader: string;
  service: string;
  cards: string;
  keywords: string;
  stage: string;
  charge: string;
  /** Appended to the card name, INCLUDING its leading space. */
  reversed: string;
  noQuestion: string;
}> = {
  id: {
    reader: 'Pembaca:',
    service: 'Layanan:',
    cards: 'Kartu:',
    keywords: 'kata kunci:',
    stage: 'tahap:',
    charge: 'muatan:',
    reversed: ' (terbalik)',
    noQuestion: 'Penanya tidak menuliskan pertanyaan. Baca kartunya secara umum.',
  },
  en: {
    reader: 'Reader:',
    service: 'Service:',
    cards: 'Cards:',
    keywords: 'keywords:',
    stage: 'stage:',
    /*
     * `charge:` and not `polarity:`. `muatan` is the ordinary word for a charge or a
     * load, not the technical term -- the Indonesian prompt does not say `polaritas`
     * either -- and the value it labels is `light`/`shadow`/`neutral`, which reads as
     * a charge and not as a coordinate.
     */
    charge: 'charge:',
    reversed: ' (reversed)',
    noQuestion: 'The querent did not write a question. Read the cards generally.',
  },
};

/**
 * `<locale>-v1.<sha8>` (reconciliation R5), over the STATIC layers only.
 *
 * The locale prefix is W6's requirement -- you cannot interpret a reading
 * without knowing which prompt fork produced it -- and the hash is W4's,
 * because roadmap §3 asks that a prompt change be visible in the data and a
 * hand-bumped constant requires discipline nobody has at 11pm.
 *
 * WHAT IS DELIBERATELY NOT HASHED: the Lotus block, the memory block and the
 * question. All three vary per user and per request, and including them would
 * turn a version into a per-row nonce -- `group by prompt_version` would return
 * one row per reading and the column would answer nothing.
 *
 * `v1` is a readable epoch a human bumps when the SCHEME changes; the hash does
 * the actual work. One consequence worth knowing: `servicePrompt` takes the
 * verdict, so `yesno` has three hashes per reader per locale rather than one.
 * That is correct -- the three really are different system prompts -- and it
 * means a yes/no latency comparison groups into three buckets.
 */
function promptVersion(locale: Locale, staticLayers: string[]): string {
  const digest = createHash('sha256').update([locale, ...staticLayers].join('\0')).digest('hex');
  return `${locale}-v1.${digest.slice(0, 8)}`;
}

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
  locale = 'id',
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

  const staticLayers = [
    baseContract(locale),
    readerPrompt(r.id, locale),
    servicePrompt(s.id, locale, r.id, verdict),
  ];

  /*
   * THE MEMORY INSTRUCTION GOES LAST, AFTER THE SERVICE TASK, and it is NOT one
   * of the static layers -- `promptVersion` hashes those, and a version that
   * changed depending on whether this particular querent happened to have a
   * recallable reading would be a per-user nonce rather than a version.
   *
   * Last because of DILUTION (§6). The model is handed new material at exactly
   * the moment it is under a 40-words-per-paragraph ceiling it must count
   * against as it writes, and pushing that ceiling further back in the context
   * makes it easier to lose. The instruction sits where the ceiling it restates
   * is the most recent thing the model has read.
   */
  const memory = context?.memory ?? null;
  const system = (memory ? [...staticLayers, memoryInstruction(locale)] : staticLayers).join(
    '\n\n',
  );

  /*
   * THE USER-TURN LABELS FORK TOO (§9.1), and they are NOT in the message catalog.
   *
   * `Pembaca:`, `Layanan:`, `Kartu:`, `kata kunci:`, `tahap:`, `muatan:`, the
   * `(terbalik)` marker and the no-question line are MODEL-FACING, not user-facing.
   * Nobody ever reads them. Putting them in the catalog would mix the two audiences
   * in one file and invite somebody to "improve" a prompt token because it reads
   * awkwardly on a screen it never appears on -- so they live with the prompt layer,
   * which is where the rest of the model's vocabulary is.
   *
   * The VALUES they label -- `stage`, `polarity` -- stay English enum tokens in both
   * locales (§7.13). They are machine tokens that happen to be English words, the
   * model copes fine with `tahap: reckoning`, and translating `reckoning` would fork
   * a value the database also stores.
   */
  const labels = slotLabels(s, r, locale);
  const L = TURN_LABELS[locale];
  const cardLines = draws.map((d, i) => {
    const position = labels[i] ?? labels[0];
    const orientation = d.reversed ? L.reversed : '';
    return (
      `${i + 1}. ${position} — ${d.card.name}${orientation}` +
      ` — ${L.keywords} ${cardKeywords(d.card, locale).join(', ')}` +
      ` — ${L.stage} ${d.card.stage} — ${L.charge} ${d.card.polarity}`
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
    : L.noQuestion;

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
    `${L.reader} ${r.name}`,
    /*
     * `s.name[locale]`, NOT `s.name`. It became `Localized<string>` in W6 Task 6
     * and a template literal will happily stringify the object -- this line
     * shipped `Layanan: [object Object]` into all nine system prompts, and
     * `npm run typecheck` was green, because interpolating an object is legal
     * TypeScript. Caught by diffing the nine generated prompts against the
     * previous commit, which is the check the plan's Task 9 snapshot institutes
     * permanently. Nothing else would have found it before a smoke run.
     */
    `${L.service} ${s.name[locale]}`,
    '',
    ...(lotusBlock ? [lotusBlock, ''] : []),
    L.cards,
    ...cardLines,
    '',
    /*
     * IMMEDIATELY BEFORE `<pertanyaan>`, and after the cards. The cards are what
     * is being read; the history is context for reading them, and it sits
     * between the two so it cannot be mistaken for either. Same reasoning as the
     * Lotus block's placement above, one position later.
     */
    ...(memory ? [memoryBlock(memory, locale), ''] : []),
    questionBlock,
  ].join('\n');

  return {
    system,
    user,
    maxTokens: MAX_TOKENS[s.id],
    promptVersion: promptVersion(locale, staticLayers),
  };
}
