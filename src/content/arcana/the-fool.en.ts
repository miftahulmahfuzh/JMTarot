import type { LoreDoc } from '@/content/types';

/**
 * The Fool (0), English. **REWRITTEN, NOT TRANSLATED** (§8.2).
 *
 * The pair's divergence:
 *   - `anchor` is `number` here and `element` there. This document enters through
 *     zero; that one enters through the aether mark and the missing planet.
 *   - The interpretation's images are different: an unsigned contract and a
 *     rehearsal that never ends, against a departure taken before the kit is
 *     complete and a leap out of boredom. The DIVERGENCE table forbids `bored`,
 *     `equipment`, `barking` and `warned` in the two interpretation sections here.
 *   - The Q&A asks different questions -- reversals, and where the card belongs in
 *     the deck -- not the same four.
 *
 * WHAT IS THE SAME AND MUST BE: the meaning, and `yesno: yes upright / no
 * reversed`, asserted against `effectiveYesNo()`.
 */
export const theFoolEn: LoreDoc = {
  slug: 'the-fool',
  locale: 'en',
  cardId: 0,
  anchor: 'number',

  title: 'The Fool (0) Tarot Card Meaning — Upright & Reversed',
  description:
    'The Fool (0) is a first step taken on trust rather than on certainty. Upright ' +
    'and reversed meanings, the number zero, and why this card has no planet.',
  h1: 'The Fool (0): Tarot Card Meaning',
  standfirst:
    'The card numbered nothing. Not the card of stupidity — the card of a departure ' +
    'made before the conditions for it were all met.',
  imageAlt:
    'A barefoot, ragged figure strides over the lip of a cliff with one foot already ' +
    'in the air; a small pale dog barks at their heel, and the slope below is a ' +
    'scree of bone and skulls running down into the dark.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Upright, this is not the card of someone who knows nothing. It is the card ' +
        'of someone who knows a fair amount and goes anyway. The difference is thin ' +
        'and it decides everything: the first has not seen the drop, and the second ' +
        'has already made peace with the part of this that will go badly.',
    },
    {
      kind: 'paragraph',
      text:
        'What it offers is not a guarantee, it is a permission — to begin on an ' +
        'unsigned contract, because some of the terms genuinely cannot be settled ' +
        'until after you have started. A plan that waits for every clause is a plan ' +
        'that stays a rehearsal, and a rehearsal can go on for years.',
    },
    {
      kind: 'paragraph',
      text:
        'It charges for that. Move like this and you give up the right to be ' +
        'surprised when something goes wrong. Paying that at the front is what ' +
        'separates the people who last from the people who believed they were ready.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, the move still happens and the reason underneath it has changed. ' +
        'It is no longer trust; it is an exit, and from the outside the two are ' +
        'indistinguishable.',
    },
    {
      kind: 'paragraph',
      text:
        'One exercise separates them. Describe where you are going without ' +
        'mentioning what you are leaving. If the description survives that, it is a ' +
        'departure. If it collapses into nothing, the thing behind you has been ' +
        'doing the steering, and a thing behind you cannot steer toward anywhere.',
    },
    {
      kind: 'paragraph',
      text:
        'The reversal also flips the verdict. Upright it answers yes; reversed it ' +
        'answers no — not because the plan is bad, but because a plan chosen by what ' +
        'you are leaving tends to arrive somewhere you did not choose.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Upright, yes — the earliest yes in the deck: go, and pick the rest up on the ' +
      'way. Reversed it turns to no, because what is pushing is the thing behind you ' +
      'rather than the thing ahead, and that is not a direction.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'A number that is an absence' },
    {
      kind: 'paragraph',
      text:
        'Every other trump is numbered in sequence. This one is numbered zero, which ' +
        'is not a position in a sequence at all — it is what the count looks like ' +
        'before it begins. That is why the card is filed at the front of some decks ' +
        'and at the back of others, and why both are defensible.',
    },
    {
      kind: 'paragraph',
      text:
        'It also means the card has no root: zero folds to zero, so unlike eleven of ' +
        'the twenty-two there is no earlier trump standing behind it. Nothing stands ' +
        'behind it. That is the position.',
    },

    { kind: 'heading', level: 2, text: 'Aleph, and the only trump with no planet' },
    {
      kind: 'paragraph',
      text:
        'Its letter is Aleph, the first, which in tradition carries no sound of its ' +
        'own and only opens the way for the next one. And where the other twenty-one ' +
        'trumps are assigned a planet or a sign, this one is assigned an element: ' +
        'air, the aether. The Golden Dawn called it the Spirit of Aether.',
    },
    {
      kind: 'paragraph',
      text:
        'A planet fixes a card somewhere in the sky. This one is fixed nowhere, ' +
        'because it is the state before anything has been placed — which reads like ' +
        'missing information and is in fact the information.',
    },

    { kind: 'heading', level: 2, text: 'What is actually in the picture' },
    {
      kind: 'paragraph',
      text:
        'Our figure is in rags and has no shoes, and one foot is already past the ' +
        'edge. There is no sun behind them. There is a storm, and black peaks a long ' +
        'way off.',
    },
    {
      kind: 'paragraph',
      text:
        'The animal beside them is small, pale, and barking. In friendlier decks it ' +
        'is playing. Here it is plainly raising an alarm and the figure is stepping ' +
        'anyway, which is the whole card in one gesture.',
    },
    {
      kind: 'paragraph',
      text:
        'And the slope underneath is not grass. It is bone, stacked all the way down, ' +
        'with a single red track running through it. Others have gone over this edge. ' +
        'The card does not hide that from you before it makes its offer.',
    },
    {
      kind: 'quote',
      text: 'a prince of the other world on his travels through this one',
      source: 'A. E. Waite, on the figure of The Fool',
    },
    { kind: 'cardRef', slug: 'the-world', text: 'Read the lore for The World (XXI)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card this rarely means an easy day. More often it marks the day ' +
        'something starts without ceremony: a message finally sent, a form filled in, ' +
        'a conversation opened at last.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading it is sharpest ahead of you, where it is an offer ' +
        'rather than a forecast. Behind you, it points at a decision taken without ' +
        'any guarantee, and you generally already know which one.',
    },
  ],

  questions: [
    {
      q: 'Should The Fool be numbered 0 or 22?',
      a:
        'Both traditions exist and neither is a mistake. Zero is not a place in a ' +
        'sequence, so the card sits outside the count and can be filed at either end. ' +
        'This deck numbers it 0 and the twenty-second trump is The World.',
    },
    {
      q: 'Is a reversed Fool a warning not to start?',
      a:
        'It is a warning about the reason, not about the act. The test is what you ' +
        'have if everything goes right. If the honest answer is only that you are out ' +
        'of the current arrangement, the card is pointing at the arrangement.',
    },
    {
      q: 'Why does this card have no planet when the others do?',
      a:
        'Because the traditional attribution is the element air rather than a body in ' +
        'the sky. Uranus is a modern substitution and the sources that offer it flag ' +
        'it as outside the original scheme, so this deck keeps the older assignment.',
    },
    {
      q: 'The Fool or The Chariot — which one actually moves?',
      a:
        'Both, in opposite conditions. The Chariot has momentum and a direction ' +
        'already chosen. The Fool has neither and goes regardless, which is why one is ' +
        'a card about steering and the other is a card about starting.',
    },
  ],
};

export default theFoolEn;
