import type { LoreDoc } from '@/content/types';

/**
 * Wheel of Fortune (X), English. **REWRITTEN, NOT TRANSLATED** (§8.2).
 *
 * The pair's divergence:
 *   - `anchor` is `hebrewLetter` here and `number` there. This document enters
 *     through Kaph, the open palm; that one enters through ten folding back to one.
 *   - The interpretation makes a DIFFERENT ARGUMENT: the Indonesian half is about
 *     recognising the turn early, this half is about the fact that the wheel is
 *     indifferent -- it is not a judgement on how you have behaved, which is the
 *     reading everybody supplies for free. The DIVERGENCE table forbids `turn
 *     early`, `recognise`, `cartwheel` and `spend` in the two interpretation
 *     sections here.
 *   - The Q&A asks different questions -- fate, and the figure at the handle.
 *
 * **Polarity `neutral` does not flip; `yesno` is `maybe` in both orientations.**
 */
export const wheelOfFortuneEn: LoreDoc = {
  slug: 'wheel-of-fortune',
  locale: 'en',
  cardId: 10,
  anchor: 'hebrewLetter',

  title: 'Wheel of Fortune (X) Tarot Meaning — Upright & Reversed',
  description:
    'Wheel of Fortune (X) is a turn that has come round to you. Upright and ' +
    'reversed meanings, the letter Kaph, and why the card refuses to predict.',
  h1: 'Wheel of Fortune (X): Tarot Card Meaning',
  standfirst:
    'The tenth trump. Not a card about luck — a card about the fact that the change ' +
    'arriving is not a verdict on how you have behaved.',
  imageAlt:
    'A hooded figure turns a heavy wooden cartwheel with both hands over a round ' +
    'stone well brimming with blood; a skull and a fallen crown rest on the rim, ' +
    'and two candles burn against the wall behind.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'People supply a moral for this card without being asked. Something changes, ' +
        'and within a day there is a story about why it was deserved — a reward for ' +
        'the diligence, or a consequence of the slippage. Both stories are ' +
        'comforting and neither is on the card.',
    },
    {
      kind: 'paragraph',
      text:
        'What is on the card is a mechanism with no opinion. Rates change, an ' +
        'industry contracts, somebody retires and a door opens. None of that consults ' +
        'a record of your conduct, and treating it as feedback produces the wrong ' +
        'lesson with great confidence.',
    },
    {
      kind: 'paragraph',
      text:
        'That is why the verdict is undecided in both orientations, and it is a ' +
        'report rather than a hedge. The card knows the position is about to change ' +
        'and declines to guess the direction, which is the only honest thing ' +
        'available to it.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, holding back a turn whose time has come. The charge is still ' +
        'neutral and the verdict is still undecided; the only difference is who is ' +
        'supplying the force.',
    },
    {
      kind: 'paragraph',
      text:
        'The cost never presents as a struggle. No single day feels like resistance. ' +
        'It is a standing charge against the same account every morning, in order to ' +
        'keep one thing exactly as it is, and the shortage shows up somewhere ' +
        'unrelated months later.',
    },
    {
      kind: 'paragraph',
      text:
        'The card reversed rarely asks for total surrender. It asks a smaller ' +
        'question: which part of the old arrangement is genuinely worth carrying ' +
        'forward, and what are you paying to preserve out of habit.',
    },
  ],

  yesno: {
    upright: 'maybe',
    reversed: 'maybe',
    note:
      'Undecided both ways up, and honestly: the card reports that the position is ' +
      'changing and refuses to claim it knows the direction. The one certainty is ' +
      'that where you are standing will not hold.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Kaph, an open palm' },
    {
      kind: 'paragraph',
      text:
        'The letter is Kaph, which means the open palm of a hand. An open palm can ' +
        'receive and it can let go. The one thing it cannot do is grip, and for this ' +
        'card that is not an accident of the alphabet.',
    },
    {
      kind: 'paragraph',
      text:
        'It also puts the trump in an interesting position relative to the rest of ' +
        'the deck. Most cards describe something you do. This one describes the ' +
        'posture available to you while something is done.',
    },

    { kind: 'heading', level: 2, text: 'Jupiter, which enlarges without choosing' },
    {
      kind: 'paragraph',
      text:
        'The planet is Jupiter, the largest, traditionally associated with increase. ' +
        'The part usually left out is that Jupiter increases whatever is already ' +
        'there. It does not select. Good conditions and bad ones are magnified at the ' +
        'same rate.',
    },
    {
      kind: 'paragraph',
      text:
        'The Golden Dawn title is Lord of the Forces of Life, which is similarly ' +
        'indifferent: forces, not favours.',
    },

    { kind: 'heading', level: 2, text: 'A cartwheel, and the well underneath it' },
    {
      kind: 'paragraph',
      text:
        'The familiar card floats its wheel in the sky with nobody turning it. Ours ' +
        'is a heavy wooden cartwheel on the ground, and a hooded figure has both ' +
        'hands on it.',
    },
    {
      kind: 'paragraph',
      text:
        'That changes a great deal. A wheel in the sky is fate. A wheel with somebody ' +
        'at the handle is something heavy, movable, and moved by a party who will not ' +
        'be telling you the schedule.',
    },
    {
      kind: 'paragraph',
      text:
        'It stands over a round stone well full of blood, with a skull and a dropped ' +
        'crown on the rim. Whatever was once on top and whatever is finished are ' +
        'resting on the same edge, which is the entire argument of the card in one ' +
        'arrangement of objects.',
    },

    { kind: 'heading', level: 2, text: 'Ten' },
    {
      kind: 'paragraph',
      text:
        'Ten is the first two-digit number and it folds straight back to one, which ' +
        'is The Magician. The older commentaries read this trump as that one at a ' +
        'higher octave, and the difference is exactly one thing: there, the tool is ' +
        'smaller than the person holding it.',
    },
    { kind: 'cardRef', slug: 'the-magician', text: 'Read the lore for The Magician (I)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card it marks a day that departs from the routine without asking. ' +
        'What helps is not a tidier plan but a willingness to abandon one already ' +
        'made.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading it is at its most accurate and least welcome ahead ' +
        'of you: something is going to move, and this trump will not be drawn on ' +
        'which way.',
    },
  ],

  questions: [
    {
      q: 'Is Wheel of Fortune about fate?',
      a:
        'The traditional picture says so — a wheel in the sky with nobody at it. Ours ' +
        'puts a figure at the handle, which makes the change something caused rather ' +
        'than something ordained, by a party who will not tell you the schedule.',
    },
    {
      q: 'Who is turning the wheel in our card?',
      a:
        'The painting will not say, and the refusal is the useful part. Most changes ' +
        'that land on a person were decided by somebody, somewhere, for reasons that ' +
        'had nothing to do with them.',
    },
    {
      q: 'Does a good outcome mean I did something right?',
      a:
        'Not according to this card, and that cuts both ways. The mechanism does not ' +
        'read your conduct, so a bad turn is not a verdict on you either — which is ' +
        'the half people forget when it is their turn.',
    },
    {
      q: 'Wheel of Fortune or The Tower for sudden change?',
      a:
        'The Wheel turns and will turn again; nothing is destroyed. The Tower removes ' +
        'the structure entirely and there is no next revolution to wait for.',
    },
  ],
};

export default wheelOfFortuneEn;
