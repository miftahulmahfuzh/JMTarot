import type { LoreDoc } from '@/content/types';

/**
 * Justice (XI), English. **REWRITTEN, NOT TRANSLATED** (§8.2).
 *
 * The pair's divergence:
 *   - `anchor` is `marseille` here and `sign` there. **The VIII/XI exchange is
 *     told from the English side on this card and from the Indonesian side on
 *     Strength**, so the release carries the story twice and neither locale
 *     carries it twice.
 *   - The interpretation makes a DIFFERENT ARGUMENT: the Indonesian half is about
 *     the sum being two-directional, this half is about the difference between
 *     what is fair and what is enforceable. The DIVERGENCE table forbids
 *     `sum`, `ledger`, `modest` and `disinterested` in the two interpretation
 *     sections here.
 *   - The Q&A asks different questions -- the lowered sword, and legal cases.
 *
 * **NO ROOT CARD**: `reduce(11)` is 11, so `arcanaFor(11)` is Justice and
 * `rootCardFor` suppresses it. Writing "Justice folds to Justice" is the failure
 * that suppression exists to prevent.
 *
 * ENGINE: polarity `neutral` does NOT flip; `yesno` is `maybe` in both.
 */
export const justiceEn: LoreDoc = {
  slug: 'justice',
  locale: 'en',
  cardId: 11,
  anchor: 'marseille',

  title: 'Justice (XI) Tarot Card Meaning — Upright & Reversed',
  description:
    'Justice (XI) is the reckoning, honest and as it is. Upright and reversed ' +
    'meanings, the Libra attribution, and why this trump is numbered eleven.',
  h1: 'Justice (XI): Tarot Card Meaning',
  standfirst:
    'The eleventh trump. Not a card about punishment — a card about the gap between ' +
    'what is fair and what anybody can actually make happen.',
  imageAlt:
    'A crowned, veiled figure sits enthroned in carved stone holding a set of ' +
    'scales, the sword resting point-down on the floor rather than raised; blood ' +
    'has pooled around where the blade meets the ground.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Two questions get confused constantly and this card separates them. What ' +
        'would be fair here, and what can be enforced here, are different questions ' +
        'with different answers, and most of the pain in a dispute comes from ' +
        'treating them as one.',
    },
    {
      kind: 'paragraph',
      text:
        'Upright, the trump says both are answerable and that you have been working ' +
        'only on the first. Knowing what you are owed is not the same as having a ' +
        'route to it, and the route is usually shorter and less satisfying than the ' +
        'entitlement.',
    },
    {
      kind: 'paragraph',
      text:
        'The charge is neutral and the verdict is undecided in both orientations, ' +
        'which is not a failure of nerve. The outcome turns on a record rather than ' +
        'on a circumstance, and the card genuinely does not have the record.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, a scale tilted by fear. The charge does not change — this trump is ' +
        'neutral both ways up — and what changes is whose thumb is on the pan.',
    },
    {
      kind: 'paragraph',
      text:
        'The tilt almost always runs one way, and not the way people expect. A ' +
        'frightened person marks against themselves rather than in their own favour, ' +
        'and the result reads as scrupulous honesty, so nobody in the room ever ' +
        'corrects it.',
    },
    {
      kind: 'paragraph',
      text:
        'The verdict stays undecided, because the weighing is still going. What is ' +
        'needed is not more severity and not absolution; it is one person with no ' +
        'stake in the answer looking at the same facts.',
    },
  ],

  yesno: {
    upright: 'maybe',
    reversed: 'maybe',
    note:
      'Undecided both ways up, and honestly so rather than evasively: this trump ' +
      'weighs what is already on record, so the answer is in your account of events ' +
      'rather than in the card.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Eleven, and the trade with Strength' },
    {
      kind: 'paragraph',
      text:
        'Older decks number this card eight and put Strength at eleven. Waite ' +
        'exchanged the two, and the reason was structural rather than aesthetic: with ' +
        'the swap, the trumps run in the order of the zodiac, so Leo lands at eight ' +
        'and Libra at eleven.',
    },
    {
      kind: 'paragraph',
      text:
        'This deck follows Waite. That is not a claim that the older arrangement is ' +
        'wrong — it is a claim that one deck has to pick one order, because the ' +
        'number is part of what a reader reads and two systems inside one deck cannot ' +
        'be read at all.',
    },
    {
      kind: 'paragraph',
      text:
        'One consequence lands here and nowhere else. Eleven does not reduce in this ' +
        'system, so this trump has no root card: eleven returns eleven, and eleven is ' +
        'Justice. Every other numbered card in the second half stands on an earlier ' +
        'one. This one stands on itself, which is either an accident of arithmetic or ' +
        'the most on-the-nose thing in the deck.',
    },
    { kind: 'cardRef', slug: 'strength', text: 'Read the lore for Strength (VIII)' },

    { kind: 'heading', level: 2, text: 'Libra, and the only sign that is an object' },
    {
      kind: 'paragraph',
      text:
        'The sign is Libra: air, and cardinal. Air is the element of distinction, ' +
        'which is the correct element for a card whose job is to tell one thing from ' +
        'another. Cardinal means it opens rather than maintains — this is a weighing ' +
        'that has just started, which is part of why nothing is settled yet.',
    },
    {
      kind: 'paragraph',
      text:
        'And Libra is the one sign in the twelve that is not alive. The others are ' +
        'animals or people; this one is a tool. A balance has no interest in the ' +
        'outcome, and that is the entire reason anyone consents to use one.',
    },

    { kind: 'heading', level: 2, text: 'Lamed, a goad' },
    {
      kind: 'paragraph',
      text:
        'The letter is Lamed, an ox-goad — not a whip and not a blade. It is the ' +
        'implement for steering an animal far larger than the person holding it, by ' +
        'small repeated contact. As an image of justice it is a very long way from a ' +
        'gavel: the thing being directed is moving under its own power, and all the ' +
        'tool does is bend it slightly, again and again.',
    },

    { kind: 'heading', level: 2, text: 'A sword that has been put down' },
    {
      kind: 'paragraph',
      text:
        'In nearly every deck this figure holds the sword upright. Ours has the point ' +
        'in the floor and the hand resting on the pommel.',
    },
    {
      kind: 'paragraph',
      text:
        'The scales are still hanging from the other hand, so the weighing is live. ' +
        'What is not live is the cutting. A sword at rest is not a sword given up.',
    },
    {
      kind: 'paragraph',
      text:
        'There is blood pooled where the blade meets the stone. This one has been ' +
        'used. The card is not pretending that an honest reckoning leaves everybody ' +
        'unharmed.',
    },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card it usually means opening a record that has been shut for a ' +
        'while: an invoice, a promise, a conversation whose conclusion was never ' +
        'written down.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading, behind you it indicates cause rather than fault. ' +
        'Ahead of you it means the figure will come out, which is not the same as ' +
        'saying it will come out badly.',
    },
  ],

  questions: [
    {
      q: 'Why is the sword pointing down?',
      a:
        'Because the weighing and the cutting are separate acts and only one of them ' +
        'is happening. The scales are still up. A sword resting point-down is ' +
        'available and not in use, which is a more precise picture than a raised ' +
        'blade.',
    },
    {
      q: 'Does Justice predict the outcome of a legal case?',
      a:
        'No, and it would be irresponsible to read it that way. It describes a ' +
        'process of weighing, not a ruling — and the card is charged neutral and ' +
        'answers undecided precisely because the outcome depends on a record it ' +
        'cannot see.',
    },
    {
      q: 'Is Justice about karma?',
      a:
        'Less than people expect. Karma implies a cosmic accountant; this trump ' +
        'implies an ordinary one. What comes back is what was actually put in, ' +
        'through mechanisms anybody could point at.',
    },
    {
      q: 'Why does Justice have no root card when other trumps do?',
      a:
        'Because eleven is a master number in this system and master numbers do not ' +
        'reduce. Eleven returns eleven, which is this card, so there is no earlier ' +
        'trump standing behind it.',
    },
  ],
};

export default justiceEn;
