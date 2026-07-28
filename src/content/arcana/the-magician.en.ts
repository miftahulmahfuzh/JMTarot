import type { LoreDoc } from '@/content/types';

/**
 * The Magician (I), English. **REWRITTEN, NOT TRANSLATED** (§8.2).
 *
 * The pair's divergence:
 *   - `anchor` is `hebrewLetter` here and `goldenDawnTitle` there. This document
 *     enters through Beth, the house; that one enters through the Magus of Power.
 *   - The interpretation's images are different: a workshop where everything is
 *     sharpened and nothing is cut, and a name that arrives before the work,
 *     against tools on a table and a well-run meeting about undone work. The
 *     DIVERGENCE table forbids `table`, `meeting`, `aimed` and `sentence` in the
 *     two interpretation sections here.
 *   - The Q&A asks different questions -- Mercury, and the count of emblems.
 *
 * WHAT IS THE SAME AND MUST BE: the meaning, and `yesno: yes upright / no
 * reversed`, asserted against `effectiveYesNo()`.
 */
export const theMagicianEn: LoreDoc = {
  slug: 'the-magician',
  locale: 'en',
  cardId: 1,
  anchor: 'hebrewLetter',

  title: 'The Magician (I) Tarot Card Meaning — Upright & Reversed',
  description:
    'The Magician (I) is ability finally pointed at something. Upright and reversed ' +
    'meanings, the letter Beth, and the Mercury attribution standing behind it.',
  h1: 'The Magician (I): Tarot Card Meaning',
  standfirst:
    'The first numbered trump. Not the card of miracles — the card of capability ' +
    'that has stopped being potential and picked one thing.',
  imageAlt:
    'A hooded, faceless figure stands at a stone slab with one hand raised and the ' +
    'other pointing down; a cup, a rod and a blade lie on the wet stone, and blood ' +
    'runs off its front edge in the candlelight.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Upright, this card makes no promise that you will succeed. It reports that ' +
        'what you need is already within reach. Nothing has to be acquired. What has ' +
        'not happened yet is the narrowing.',
    },
    {
      kind: 'paragraph',
      text:
        'So it turns up least often for people who lack something and most often for ' +
        'people with a workshop where every blade is sharpened and nothing has been ' +
        'cut. Capability spread across everything moves none of it; capability spent ' +
        'on one thing moves that thing.',
    },
    {
      kind: 'paragraph',
      text:
        'What it asks in return is a target narrow enough to MISS. A direction ' +
        'cannot be missed, which is exactly why a direction is not an answer to this ' +
        'card and why "getting better at my craft" has never once satisfied it.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, the skill is intact and the target has slipped. It is being spent ' +
        'on the appearance of competence rather than on any particular outcome.',
    },
    {
      kind: 'paragraph',
      text:
        'This can be very quiet. A reputation that arrives before the work does. An ' +
        'explanation tidier than the thing it explains. Months that each felt ' +
        'productive and together left nothing standing.',
    },
    {
      kind: 'paragraph',
      text:
        'The check is a calendar rather than a question. Look back a quarter and ' +
        'count what would be missing if you had not been there. A short count is not ' +
        'an accusation of laziness — it is the card saying the effort went somewhere, ' +
        'and asking you where, which is why the reversal answers no.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Upright, yes, conditional on one thing only: say what it is for. Reversed it ' +
      'turns to no — the ability is not short, it is being spent on something other ' +
      'than what you meant.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Beth, the house' },
    {
      kind: 'paragraph',
      text:
        'The letter assigned to this trump is Beth, and Beth means a house. A house ' +
        'is empty space that somebody has deliberately bounded until it became ' +
        'useful. It is not built out of material so much as out of limits.',
    },
    {
      kind: 'paragraph',
      text:
        'A craft works the same way. It is not the sum of what you can do — it is the ' +
        'set of things you have stopped doing, so that one thing can stand up inside ' +
        'the space that is left. That is why this card is about narrowing rather ' +
        'than about acquiring.',
    },

    { kind: 'heading', level: 2, text: 'Mercury, and a title that says power' },
    {
      kind: 'paragraph',
      text:
        'The planet is Mercury: the one that carries, translates, and moves a thing ' +
        'from one form into another. Mercury is never the origin of the message. ' +
        'Nobody has ever accused it of having something to say. That is an honest ' +
        'description of what a skill actually is.',
    },
    {
      kind: 'paragraph',
      text:
        'The Golden Dawn titled the card the Magus of Power, and the choice of word ' +
        'is the sharp part. Not knowledge. Not secrets. Power here means the narrow ' +
        'thing: the capacity to cause an outcome, which is a different faculty from ' +
        'the capacity to understand one — and understanding your situation has never ' +
        'once changed it.',
    },

    { kind: 'heading', level: 2, text: 'Three things on the stone' },
    {
      kind: 'paragraph',
      text:
        'The better-known version of this card lays four emblems out, one for each ' +
        'suit of the minor cards. Ours lays out three: a cup, a rod, and a blade. The ' +
        'stone they rest on is wet, and what is wetting it is running off the front ' +
        'edge.',
    },
    {
      kind: 'paragraph',
      text:
        'The figure is hooded and has no readable face. One hand up, one pointing at ' +
        'the slab. The gesture is very old and it has always meant the same thing: ' +
        'what is above is brought down, and whoever brings it has to stand between ' +
        'the two.',
    },
    {
      kind: 'paragraph',
      text:
        'A single candle burns on the wall. Enough to work by, not enough to see the ' +
        'room. This card never promises that you will be able to see; it promises ' +
        'that what you need to hold is within your arm.',
    },

    { kind: 'heading', level: 2, text: 'One, and the two cards that fold into it' },
    {
      kind: 'paragraph',
      text:
        'One is its own root, so this trump folds nowhere. Two others fold into it, ' +
        'though: Wheel of Fortune at ten and The Sun at nineteen. Both are cards ' +
        'about force in motion, and both stand on this one.',
    },
    { kind: 'cardRef', slug: 'the-sun', text: 'Read the lore for The Sun (XIX)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card it usually points at something small you already know how to ' +
        'do and have not used today. Not a new capability. An idle one.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading, ahead of you it is an offer. Behind you it usually ' +
        'marks something you built that has since become a tool, although at the time ' +
        'it did not feel like building anything.',
    },
  ],

  questions: [
    {
      q: 'Why is The Magician assigned Mercury rather than the Sun?',
      a:
        'Because the card is about transmission rather than about source. Mercury ' +
        'carries, translates and converts; it originates nothing. That is what a ' +
        'craft does with whatever it is handed.',
    },
    {
      q: 'Our card shows three emblems and the Rider-Waite shows four. Does that change the meaning?',
      a:
        'No. The four are the four minor suits, and the point of laying them out is ' +
        'that everything needed is present. Three objects make the same claim; the ' +
        'count is a painter’s decision, not a reading.',
    },
    {
      q: 'What separates a reversed Magician from simple procrastination?',
      a:
        'Procrastination knows what it is avoiding. A reversed Magician is busy, ' +
        'often visibly so, and the effort is going somewhere real — into being seen ' +
        'as capable rather than into an outcome.',
    },
    {
      q: 'The Magician or The High Priestess for a question about knowing?',
      a:
        'The High Priestess is knowledge you already have and have not spoken. The ' +
        'Magician is not about knowing at all; it is about doing, and it will not ' +
        'accept understanding in place of work.',
    },
  ],
};

export default theMagicianEn;
