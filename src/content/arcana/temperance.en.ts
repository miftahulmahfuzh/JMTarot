import type { LoreDoc } from '@/content/types';

/**
 * Temperance (XIV), English. **REWRITTEN, NOT TRANSLATED** (§8.2).
 *
 * **THIS DOCUMENT MAY NOT USE `heal` OR `healing`.** Both are on `THERAPY_EN`,
 * and Temperance and The Star are the two cards in the deck that reach for them
 * hardest -- which is exactly why the ban earns its place here: neither word says
 * anything specific about this trump, and both are available as a substitute for
 * the sentence that would.
 *
 * The pair's divergence:
 *   - `anchor` is `sign` here and `goldenDawnTitle` there. This document enters
 *     through Sagittarius as mutable fire; that one enters through Daughter of the
 *     Reconcilers.
 *   - The interpretation makes a DIFFERENT ARGUMENT: the Indonesian half is about
 *     finding the proportion by pouring, this half is about the fact that a
 *     compromise is not the midpoint of two positions and treating it as one
 *     produces something neither party wanted. The DIVERGENCE table forbids
 *     `pour`, `proportion`, `alternate` and `window` in the two interpretation
 *     sections here.
 *   - The Q&A asks different questions -- the impossible angle, and moderation.
 *
 * **`yesno` is `maybe` in BOTH orientations.** Polarity `light` -> `shadow`.
 */
export const temperanceEn: LoreDoc = {
  slug: 'temperance',
  locale: 'en',
  cardId: 14,
  anchor: 'sign',

  title: 'Temperance (XIV) Tarot Card Meaning — Upright & Reversed',
  description:
    'Temperance (XIV) is the middle way, and it asks for patience. Upright and ' +
    'reversed meanings, the Sagittarius attribution, and why a compromise is not ' +
    'a midpoint.',
  h1: 'Temperance (XIV): Tarot Card Meaning',
  standfirst:
    'The fourteenth trump. Not a card about calm balance — a card about the fact ' +
    'that splitting the difference usually produces something nobody wanted.',
  imageAlt:
    'A hooded, faceless figure with heavy dark wings pours a thick red liquid ' +
    'between two vessels, one bare foot standing in a stream; irises grow on the ' +
    'bank and the water runs red where the pour lands.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'The usual mistake with this card is arithmetic. Two positions, take the ' +
        'average, call it moderation. What that reliably produces is a third ' +
        'position with none of the merits of either — half a renovation, half a ' +
        'resignation, an argument settled by giving both sides too little to work ' +
        'with.',
    },
    {
      kind: 'paragraph',
      text:
        'What the trump actually does is combine. A combination keeps what each ' +
        'side was FOR and drops what each was merely defending, and that requires ' +
        'knowing which is which — a much harder question than where the midpoint is.',
    },
    {
      kind: 'paragraph',
      text:
        'The verdict is undecided in both orientations, which is a report. The card ' +
        'is certain a combination exists and has no view on what it looks like, ' +
        'because that depends on a distinction only you can draw.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, two opposites that refuse to combine. Usually they refuse for a ' +
        'reason, and the reason is that one of them is not actually a position — it ' +
        'is a fear wearing the clothes of a preference.',
    },
    {
      kind: 'paragraph',
      text:
        'A real preference can say what it wants. A defended fear can only say what ' +
        'it will not accept, and no combination can be built out of that, however ' +
        'reasonable everybody is being about it.',
    },
    {
      kind: 'paragraph',
      text:
        'The answer stays undecided, honestly. What is needed first is not more ' +
        'goodwill but one side stating a thing it is FOR, which is riskier than ' +
        'stating an objection and is the only move that unblocks this.',
    },
  ],

  yesno: {
    upright: 'maybe',
    reversed: 'maybe',
    note:
      'Undecided both ways up, and as a report rather than a hedge: the card is ' +
      'certain a combination exists and has no view on its shape, because that ' +
      'turns on a distinction only the people involved can draw.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Sagittarius, fire that keeps changing shape' },
    {
      kind: 'paragraph',
      text:
        'The sign is Sagittarius: fire, and mutable. Mutable signs close a season ' +
        'and hand it to the next, so they are the ones built for transition rather ' +
        'than for holding a position — which is a strange assignment for the trump ' +
        'everybody reads as steadiness.',
    },
    {
      kind: 'paragraph',
      text:
        'It stops being strange once you notice this card is not still. Something is ' +
        'being moved from one container to another for the whole duration, and the ' +
        'moment it stops moving the picture is over.',
    },

    { kind: 'heading', level: 2, text: 'Samekh, a prop' },
    {
      kind: 'paragraph',
      text:
        'The letter is Samekh, meaning a prop or a support. A prop lifts nothing; it ' +
        'holds a thing upright while the thing sets. For a card about repeated ' +
        'attempts that is the right piece of equipment — what you need during the ' +
        'failed tries is not encouragement but something that stops a failed try ' +
        'taking the whole structure down.',
    },

    { kind: 'heading', level: 2, text: 'What is being poured is not water' },
    {
      kind: 'paragraph',
      text:
        'The familiar card has an angel moving clear water between two cups, and the ' +
        'impossible detail is the angle: the stream runs sideways. The signal is that ' +
        'what is happening is not ordinary.',
    },
    {
      kind: 'paragraph',
      text:
        'Ours pours something thick and red, from a hooded figure with no face and ' +
        'heavy dark wings. One bare foot stands in the stream, and the water goes red ' +
        'where the pour lands.',
    },
    {
      kind: 'paragraph',
      text:
        'The irises are still on the bank, exactly where the older card put them. ' +
        'This version is not rejecting the idea of combination. It is refusing to ' +
        'pretend that what gets combined is clean.',
    },
    {
      kind: 'quote',
      text: 'the sun of the fluid of life passes from vessel to vessel',
      source: 'A. E. Waite, on the fourteenth trump',
    },

    { kind: 'heading', level: 2, text: 'Fourteen, and its root' },
    {
      kind: 'paragraph',
      text:
        'Fourteen folds to five, which is The Hierophant. That explains something ' +
        'about the cost: working the proportion out from nothing is expensive, and ' +
        'the trump about inheriting somebody else’s method stands directly behind ' +
        'this one.',
    },
    { kind: 'cardRef', slug: 'the-star', text: 'Read the lore for The Star (XVII)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card it usually recommends half of what you planned, done today. ' +
        'Not a postponement — a smaller dose of the same thing.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading, ahead of you it indicates an adjustment rather ' +
        'than an event. Behind you it often marks a period of trial and error that ' +
        'felt at the time like no progress at all.',
    },
  ],

  questions: [
    {
      q: 'Why is the water flowing sideways in the traditional card?',
      a:
        'Because it is not meant to be plausible. The angle marks the act as outside ' +
        'ordinary physics, which is the older deck’s way of saying that this ' +
        'combination is not a mechanical operation.',
    },
    {
      q: 'Is Temperance the same as moderation?',
      a:
        'Not quite, and the difference matters. Moderation is less of everything. ' +
        'This card is a specific ratio, which can easily turn out to be more of one ' +
        'thing and none of another.',
    },
    {
      q: 'How do I know when I have found the right mixture?',
      a:
        'When neither side is being managed. A working combination stops requiring ' +
        'daily attention; one that is still wrong needs somebody to hold it in place ' +
        'every morning.',
    },
    {
      q: 'Temperance or The Lovers when two things are in conflict?',
      a:
        'The Lovers is for a choice: one of them, and the other one goes. Temperance ' +
        'is for the case where both have to survive, and the only question is in what ' +
        'proportion.',
    },
  ],
};

export default temperanceEn;
