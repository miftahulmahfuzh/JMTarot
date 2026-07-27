/**
 * The English prompt contract.
 *
 * `FORMAT_RULES_EN` IS REAL AND SHIPPED. W5 wrote it for the three side prompts
 * (the gist, the frequency verdict, the day summary), which have been generating
 * English since W5 landed, and W6 moved it here from the deleted `side.ts` byte for
 * byte.
 *
 * `BASE_CONTRACT_EN` IS A PLACEHOLDER AND TASK 10 WRITES IT. Task 9 is a pure
 * refactor whose success criterion is that the nine Indonesian prompts come out
 * byte-identical; landing English prose in the same commit would let a persona
 * regression hide inside a file move, and no bisect would find it.
 *
 * WHEN IT IS WRITTEN IT IS NOT A TRANSLATION. Every rule in the Indonesian
 * contract exists because glm-4.6 did the thing, and an English model will do a
 * DIFFERENT set of things. The plan's §9.2 has the table: the card-name rule stops
 * being about invented Indonesian names and starts being about a parenthetical
 * gloss, lowercasing, and dropping the article; the Malay grep is replaced by a
 * register rule (no archaic diction, no capitalised abstractions, no vocatives);
 * the no-closing-offer rule gets STRONGER, because "let me know if you'd like me to
 * go deeper" is close to reflexive in English assistant prose; and the forbidden
 * list is LONGER, because English tarot writing is saturated with therapy
 * vocabulary that Indonesian is not.
 */

export const FORMAT_RULES_EN = `FORMAT RULES (mandatory, no exceptions):
- Write plain prose. NO markdown: no **bold**, no *italics*, no headings, no hashes, no bullet lists, no numbering.
- NO emoji or emoticons of any kind.
- Write card names EXACTLY as given, in English. Never translate one, never invent another name for one, and never add an alternative in brackets. "The Moon" stays "The Moon".

LANGUAGE:
- English, written plainly. No archaic register and no mock-mystical diction.
- Write numbers and terms the way an ordinary person writes them.

CONTENT LIMITS:
- This is entertainment. Never diagnose anything. Never touch therapy, trauma, healing, illness, mental disorders, or medication.
- Give no medical, legal or financial instruction.
- Never claim certainty about another person's feelings or about the future.
- Address the querent directly as "you".`;

/**
 * PLACEHOLDER. Task 10. Deliberately not prose: if this ever reaches a model, the
 * reading is wrong in a way somebody must notice immediately, and an English-looking
 * paragraph here would instead produce a plausible reading nobody checked.
 */
export const BASE_CONTRACT_EN = `TODO(W6 Task 10): the English base contract is not written yet.`;
