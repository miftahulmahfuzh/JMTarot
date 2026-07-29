import type { LoreDoc } from '@/content/types';

/**
 * The Sun (XIX), English. **REWRITTEN, NOT TRANSLATED** (§8.2).
 *
 * The pair's divergence:
 *   - `anchor` is `hebrewLetter` here and `sign` there. This document enters
 *     through Resh, the head; that one enters through Sol and the naming collision
 *     with the card called The Moon.
 *   - The interpretation makes a DIFFERENT ARGUMENT: the Indonesian half is about
 *     the effort that goes into keeping a thing unseen, this half is about the
 *     fact that clarity removes your excuses along with everybody else's. The
 *     DIVERGENCE table forbids `midday`, `filter`, `store` and `all at once` in
 *     the two interpretation sections here.
 *   - The Q&A asks different questions -- the child, and whether it means summer.
 *
 * ENGINE: yesno `yes` -> `no`; polarity `light` -> `shadow`. Root: The Magician.
 */
export const theSunEn: LoreDoc = {
  slug: 'the-sun',
  locale: 'en',
  cardId: 19,
  anchor: 'hebrewLetter',

  title: 'The Sun (XIX) Tarot Card Meaning — Upright & Reversed',
  description:
    'The Sun (XIX) is truth that is plain, and warm with it. Upright and reversed ' +
    'meanings, the letter Resh, and what clarity takes away along with the doubt.',
  h1: 'The Sun (XIX): Tarot Card Meaning',
  standfirst:
    'The nineteenth trump. Not a card about happiness — a card about losing your ' +
    'excuses at the same moment you lose your doubt.',
  imageAlt:
    'A child rides a pale horse with both arms flung wide beneath a flat white sun; ' +
    'behind them a field of sunflowers stands blackened with its heads bowed, and a ' +
    'red sun-wheel is painted on the ground.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Uncertainty is unpleasant and it is also a shelter. While a thing is unclear ' +
        'you are not obliged to act on it, and nobody can reasonably ask why you ' +
        'have not. That protection is worth more than people admit.',
    },
    {
      kind: 'paragraph',
      text:
        'This card takes it away. Upright, the situation becomes plain, and the ' +
        'moment it does the question stops being what is true and becomes what you ' +
        'intend to do — which is a harder question and one with your name on it.',
    },
    {
      kind: 'paragraph',
      text:
        'It answers yes, straightforwardly, and the yes is warm rather than gentle. ' +
        'What you needed to know is now visible. The next move is yours and there is ' +
        'no longer anywhere to file it under pending.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, glare that hides the detail. The light has not gone anywhere and ' +
        'there is not less of it. What has gone is the ability to make out shape ' +
        'inside it.',
    },
    {
      kind: 'paragraph',
      text:
        'The usual form is too much candour delivered in one piece. Everything said, ' +
        'accurately, in a single sitting, and the result is not understanding but a ' +
        'listener who has closed their eyes. Undosed brightness works exactly like ' +
        'dark.',
    },
    {
      kind: 'paragraph',
      text:
        'So the verdict turns to no, and it is not refusing the honesty. It is ' +
        'refusing the delivery, because the person receiving it has a capacity and ' +
        'that capacity is not a character flaw.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Upright, yes, and plainly: what you needed to see is visible. Reversed it ' +
      'turns to no — not because you are wrong, but because delivering all of it at ' +
      'once makes the listener close their eyes.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Resh, the head' },
    {
      kind: 'paragraph',
      text:
        'The letter is Resh, which means a head. Not an eye and not a heart: the ' +
        'part that assembles facts into a conclusion. For a card everybody reads as ' +
        'joy, that is a notably cold assignment, and it fits the reading above better ' +
        'than the picture does.',
    },
    {
      kind: 'paragraph',
      text:
        'The Golden Dawn title is Lord of the Fire of the World. Fire of the world ' +
        'rather than of heaven — heat that reaches the ground and lands on everything ' +
        'standing on it, without selecting.',
    },

    { kind: 'heading', level: 2, text: 'Sol, and a name that had to be kept in Latin' },
    {
      kind: 'paragraph',
      text:
        'The attribution is the sun, and the tables call it Sol. That is not ' +
        'affectation. This card is already called The Sun, and labelling its ' +
        'attribution The Sun as well produces a line reading "The Sun: The Sun".',
      },
    {
      kind: 'paragraph',
      text:
        'The same problem sits on card two, whose attribution is the moon and whose ' +
        'label is Luna — while card eighteen is called The Moon. Two bodies, two ' +
        'cards, and four names that have to be kept from colliding.',
    },

    { kind: 'heading', level: 2, text: 'A field of dead sunflowers' },
    {
      kind: 'paragraph',
      text:
        'The familiar card puts a wall of sunflowers in full bloom behind the child, ' +
        'all of them turned towards him. The message is uncomplicated: everything is ' +
        'fine.',
    },
    {
      kind: 'paragraph',
      text:
        'Ours blackens them and bows their heads. The sun above is flat and white ' +
        'rather than gold. The child still has both arms open and the banner on the ' +
        'horse is in rags.',
    },
    {
      kind: 'paragraph',
      text:
        'Stripping the supporting evidence makes the original claim sharper rather ' +
        'than weaker. The child’s delight was never contingent on the field, and this ' +
        'version proves it by removing the field.',
    },

    { kind: 'heading', level: 2, text: 'Nineteen, and its root' },
    {
      kind: 'paragraph',
      text:
        'Nineteen folds to one, The Magician. Two trumps fold there — the other is ' +
        'Wheel of Fortune — and all three are about force at work: the kind you hold, ' +
        'the kind that turns, and the kind that simply shines on everything.',
    },
    { kind: 'cardRef', slug: 'wheel-of-fortune', text: 'Read the lore for Wheel of Fortune (X)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card it usually marks the thing that stops being private today. ' +
        'That is not always pleasant and is very nearly always a relief.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading, ahead of you it is one of the most direct cards in ' +
        'the deck: the thing you asked about will become visible. Behind you it marks ' +
        'a period when everything was clear, which is worth holding up against now.',
    },
  ],

  questions: [
    {
      q: 'Why a child on the card?',
      a:
        'Because a child has nothing filed away. The figure is not innocent in the ' +
        'sense of ignorant; it is a person with nothing that needs keeping out of the ' +
        'light, which is what the card is describing.',
    },
    {
      q: 'Does The Sun mean summer, or a literal good season?',
      a:
        'Rarely, and it is the least interesting reading available. The trump is ' +
        'filed under the reckoning stage, not the beginning, so it describes a state ' +
        'arrived at rather than a season passing through.',
    },
    {
      q: 'Is a reversed Sun bad news?',
      a:
        'It is the same news badly delivered. Nothing about the situation has ' +
        'changed; what has failed is the dose, and everything the card says upright ' +
        'is still true underneath.',
    },
    {
      q: 'The Sun or The Star for a question about hope?',
      a:
        'The Star is faint, distant, and enough to walk by. The Sun is overhead and ' +
        'leaves nothing in shadow, including the things you would rather it left ' +
        'alone.',
    },
  ],
};

export default theSunEn;
