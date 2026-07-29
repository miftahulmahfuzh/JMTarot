import type { LoreDoc } from '@/content/types';

/**
 * The World (XXI), English. **REWRITTEN, NOT TRANSLATED** (§8.2).
 *
 * The last of the forty-four.
 *
 * The pair's divergence:
 *   - `anchor` is `number` here and `sign` there. This document enters through
 *     twenty-one folding to three and through the deck closing back onto zero;
 *     that one enters through Saturn and earth.
 *   - The interpretation makes a DIFFERENT ARGUMENT: the Indonesian half is about
 *     the difference between finishing and closing, this half is about the fact
 *     that an ending has to be witnessed by somebody else to hold. The DIVERGENCE
 *     table forbids `filed`, `hanging`, `announce` and `resurface` in the two
 *     interpretation sections here.
 *   - The Q&A asks different questions -- the four creatures, and what comes next.
 *
 * ENGINE: yesno `yes` -> `no`; polarity `light` -> `shadow`. Root: The Empress.
 */
export const theWorldEn: LoreDoc = {
  slug: 'the-world',
  locale: 'en',
  cardId: 21,
  anchor: 'number',

  title: 'The World (XXI) Tarot Card Meaning — Upright & Reversed',
  description:
    'The World (XXI) is the circle finally closed. Upright and reversed meanings, ' +
    'the Saturn attribution, and why an ending needs a witness to hold.',
  h1: 'The World (XXI): Tarot Card Meaning',
  standfirst:
    'The last trump. Not a card about victory — a card about the fact that an ' +
    'ending nobody else acknowledged tends not to stay ended.',
  imageAlt:
    'A pale figure floats with open arms inside an oval wreath of thorns; at the ' +
    'four corners hang animal skulls — an ox, a lion, a ram and a beaked bird — and ' +
    'a dark globe hangs beneath her feet.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'An ending held privately is not finished. It reopens, reliably, because ' +
        'everybody else is still operating on the old arrangement and each of them ' +
        'will eventually act on it, in good faith, and put the whole thing back on ' +
        'the table.',
    },
    {
      kind: 'paragraph',
      text:
        'What actually closes something is a witness. One other person who knows it ' +
        'is over, so that the ending exists outside your own head and cannot be ' +
        'quietly revised there later — which is what makes the last conversation so ' +
        'much harder than the decision was.',
    },
    {
      kind: 'paragraph',
      text:
        'Upright, the card answers yes, and the yes is for that act rather than for ' +
        'anything new. Say it to somebody. That is the entire remaining work and it ' +
        'is why this trump is at the end of the sequence rather than in the middle.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, an ending announced too early. All the visible forms have ' +
        'happened — the goodbye, the thanks, the handover — and one strand is still ' +
        'live underneath them.',
    },
    {
      kind: 'paragraph',
      text:
        'It is nearly always the strand that is awkward to raise: a small debt, a ' +
        'standing promise nobody withdrew, one person who was never told. Everything ' +
        'easy has been dealt with, so what is left is precisely the part that keeps ' +
        'the ending from taking effect.',
    },
    {
      kind: 'paragraph',
      text:
        'The verdict turns to no, and it is not refusing the conclusion. It is ' +
        'refusing to treat it as done, because one live strand is enough to keep the ' +
        'whole thing open, and it will be the strand that reopens it.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Upright, yes — to the act of closing rather than to anything new: say it to ' +
      'somebody. Reversed it turns to no, because one strand still live is enough to ' +
      'keep the whole arrangement open.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Twenty-one, and the number at the other end' },
    {
      kind: 'paragraph',
      text:
        'Twenty-one folds to three, which is The Empress — the card about something ' +
        'growing because it is being fed, standing behind the card about something ' +
        'that has finished growing. The whole arc of the deck is in that pairing.',
    },
    {
      kind: 'paragraph',
      text:
        'And at the far end there is The Fool, numbered zero, who has not left yet. ' +
        'Zero and twenty-one are the only two trumps with nothing after them, in ' +
        'opposite directions. One is a departure with no equipment; this one is a ' +
        'return with nothing left to carry.',
    },
    { kind: 'cardRef', slug: 'the-fool', text: 'Read the lore for The Fool (0)' },

    { kind: 'heading', level: 2, text: 'Saturn, Tau, and the night of time' },
    {
      kind: 'paragraph',
      text:
        'The planet is Saturn and the element is earth. Saturn is the planet of ' +
        'limits — in the old tables it was the outermost, so its orbit was the edge ' +
        'of everything anybody could see. Putting the final card under the furthest ' +
        'planet is a tidy piece of design: a boundary is what closes a circle.',
    },
    {
      kind: 'paragraph',
      text:
        'The letter is Tau, the last in the Hebrew alphabet, meaning a mark or a ' +
        'cross — the stroke you make to record that a thing has been counted. The ' +
        'Golden Dawn title is The Great One of the Night of Time: not the height of ' +
        'the day, the far end of a long one.',
    },

    { kind: 'heading', level: 2, text: 'Thorns, and four skulls' },
    {
      kind: 'paragraph',
      text:
        'The familiar card has a figure dancing inside a laurel wreath with a wand ' +
        'in each hand, and the four living creatures of Ezekiel at the corners: man, ' +
        'lion, ox and eagle, all of them watching.',
    },
    {
      kind: 'paragraph',
      text:
        'Ours makes the wreath out of thorns and renders the four creatures as ' +
        'skulls. The figure is not dancing and is holding nothing at all — her hands ' +
        'are open and empty, and a dark globe hangs below her feet.',
    },
    {
      kind: 'paragraph',
      text:
        'That does not make the card bleak so much as itemised. A circle that has ' +
        'genuinely closed was closed over something, and the four corners are what ' +
        'did not make it to the end.',
    },
    {
      kind: 'quote',
      text: 'it represents also the perfection and end of the Cosmos, the secret which is within it',
      source: 'A. E. Waite, on the twenty-first trump',
    },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card it usually names one thing that is nearly done and has been ' +
        'nearly done for months. Closing it today generally costs far less than the ' +
        'estimate you have been carrying.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading, ahead of you it is not a promise of success — it ' +
        'marks something genuinely ending. Behind you it points at a closure you may ' +
        'not have counted as one.',
    },
  ],

  questions: [
    {
      q: 'Who are the four figures at the corners?',
      a:
        'The living creatures of Ezekiel — man, lion, ox and eagle — which later ' +
        'tradition also reads as the four fixed signs and the four evangelists. Ours ' +
        'renders them as skulls, which keeps the structure and changes what it costs.',
    },
    {
      q: 'Does The World mean I succeeded?',
      a:
        'It means something closed. That often coincides with success and does not ' +
        'require it; a proper ending happens to things that went badly too, and is ' +
        'arguably more valuable there.',
    },
    {
      q: 'What comes after The World?',
      a:
        'Nothing, in this deck, and that is the answer rather than a gap. The Fool is ' +
        'numbered zero and stands before the sequence rather than after it. This card ' +
        'is about closing; starting again belongs to a different one.',
    },
    {
      q: 'The World or Death for an ending?',
      a:
        'Death is a thing that stopped some time ago and has not been named. The ' +
        'World is the naming — the act that makes the ending exist for anybody other ' +
        'than you.',
    },
  ],
};

export default theWorldEn;
