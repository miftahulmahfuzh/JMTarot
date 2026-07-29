import type { LoreDoc } from '@/content/types';

/**
 * The Hanged Man (XII), English. **REWRITTEN, NOT TRANSLATED** (§8.2).
 *
 * The pair's divergence:
 *   - `anchor` is `path` here and `hebrewLetter` there. This document enters
 *     through where the trump sits on the Tree; that one enters through Mem.
 *   - The interpretation makes a DIFFERENT ARGUMENT: the Indonesian half separates
 *     a pause from a rest, this half is about what it costs to be visibly idle in
 *     front of other people. The DIVERGENCE table forbids `rest`, `busy`, `weekly`
 *     and `container` in the two interpretation sections here.
 *   - The Q&A asks different questions -- the traitor's punishment, and sunk cost.
 *
 * **POLARITY IS `shadow` UPRIGHT AND `light` REVERSED.** The reversal is the LESS
 * dark reading by the engine's own reckoning; the page prints that strip directly
 * above this prose. yesno `no` -> `yes`. Root card: The Empress.
 */
export const theHangedManEn: LoreDoc = {
  slug: 'the-hanged-man',
  locale: 'en',
  cardId: 12,
  anchor: 'path',

  title: 'The Hanged Man (XII) Tarot Meaning — Upright & Reversed',
  description:
    'The Hanged Man (XII) is stopping a moment, and the angle changes. Upright and ' +
    'reversed meanings, the Neptune attribution, and why the answer flips.',
  h1: 'The Hanged Man (XII): Tarot Card Meaning',
  standfirst:
    'The twelfth trump. Not a card about punishment — a card about what it costs to ' +
    'be visibly doing nothing while other people are watching.',
  imageAlt:
    'A figure hangs upside down by one ankle from the branch of an enormous bare ' +
    'tree, arms loose at his sides; below him sits a round stone basin of dark ' +
    'water, and ruins stand on the horizon under a low sky.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'The hard part of this card is not the stopping. It is being seen to stop. ' +
        'A person who suspends something has to spend the whole suspension looking ' +
        'like somebody who gave up, and there is no version of it that reads as ' +
        'productive from outside.',
    },
    {
      kind: 'paragraph',
      text:
        'That social cost is why the pause almost never happens on its own. It is ' +
        'far easier to keep making small moves that are defensible in conversation ' +
        'than to make none and have nothing to report, and the small moves are ' +
        'exactly what is preventing the change of angle.',
    },
    {
      kind: 'paragraph',
      text:
        'Upright the trump answers no, and the refusal is narrow: not to the ' +
        'destination, to the next move. Something has to be suspended first, and the ' +
        'suspension is the work rather than a gap in it.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, the charge becomes LIGHT — this trump is shadow upright and light ' +
        'inverted, so reading the reversal as the worse version contradicts the data ' +
        'printed above it.',
    },
    {
      kind: 'paragraph',
      text:
        'What it names is waiting used as a way out. It is indistinguishable from a ' +
        'real suspension for the first month. The difference shows up in what comes ' +
        'out: a genuine pause produces a changed mind, and an evasion produces a ' +
        'better-phrased version of the same position.',
    },
    {
      kind: 'paragraph',
      text:
        'Which is why the verdict flips to yes. Not yes to more waiting — yes to the ' +
        'thing you already saw from the new angle and have been deferring since, on ' +
        'the grounds that you were still thinking.',
    },
  ],

  yesno: {
    upright: 'no',
    reversed: 'yes',
    note:
      'Upright, no, and it refuses the next move rather than the destination: ' +
      'something has to be suspended first. Reversed it flips to yes, because the ' +
      'suspension finished its work and what is left is delay.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'A path that goes down' },
    {
      kind: 'paragraph',
      text:
        'On the Hermetic Tree this trump is laid on a path that descends, and the ' +
        'figure on it is inverted. The two facts are usually read together as one ' +
        'joke about perspective, which undersells them: a descent you take head-first ' +
        'is not a fall, it is a deliberate reversal of which way is forward.',
    },
    {
      kind: 'paragraph',
      text:
        'Everything else in the deck moves along its path. This one is the only ' +
        'figure who has stopped on his, and the tradition made him comfortable there ' +
        'rather than stuck.',
    },

    { kind: 'heading', level: 2, text: 'Mem, and a planet that arrived late' },
    {
      kind: 'paragraph',
      text:
        'Its letter is Mem, which means water — one of the three mother letters, ' +
        'standing for the element with no shape of its own, whose form is always the ' +
        'form of whatever is holding it. The Golden Dawn title follows: Spirit of the ' +
        'Mighty Waters.',
    },
    {
      kind: 'paragraph',
      text:
        'The planet is Neptune, and this is one of only two places where our deck ' +
        'takes a modern body — the other is Judgement. Neptune was not discovered ' +
        'until the nineteenth century, so it is not in the original scheme at all. ' +
        'Worth saying plainly, because leaving it out would make the whole table on ' +
        'this page sound older than it is.',
    },

    { kind: 'heading', level: 2, text: 'One ankle, and no halo' },
    {
      kind: 'paragraph',
      text:
        'The familiar card gives him a living T-shaped tree, hands bound behind his ' +
        'back, and a halo. His face is calm. That picture says he is receiving ' +
        'something.',
    },
    {
      kind: 'paragraph',
      text:
        'Ours strips all of it. The tree is bare and much larger, his arms hang ' +
        'loose, and there is no light around his head. What is left is the position ' +
        'with none of the reassurance attached.',
    },
    {
      kind: 'paragraph',
      text:
        'Directly below him is a round stone basin of dark water, exactly where his ' +
        'head would arrive if the rope failed. The card is not promising that the ' +
        'pause is safe.',
    },
    {
      kind: 'quote',
      text: 'it is a card of life in suspension, but life and not death',
      source: 'A. E. Waite, on the twelfth trump',
    },

    { kind: 'heading', level: 2, text: 'Twelve, and its root' },
    {
      kind: 'paragraph',
      text:
        'Twelve folds to three, which is The Empress. The pairing is sound: the card ' +
        'about something growing stands behind the card about stopping, because what ' +
        'grows cannot be hurried and whoever is waiting on it has to hold still.',
    },
    { kind: 'cardRef', slug: 'the-empress', text: 'Read the lore for The Empress (III)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card it usually nominates one thing not to do today. That sounds ' +
        'restful and is generally the hardest instruction in the deck.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading it is accurate and unwelcome in the present ' +
        'position: you are already suspended. Behind you it marks a stoppage that ' +
        'turned out to redirect things, though at the time it felt like losing.',
    },
  ],

  questions: [
    {
      q: 'Was hanging by one ankle a punishment?',
      a:
        'Historically yes — in Italy it was how traitors were depicted, and the ' +
        'earliest versions of this card are drawing on that. What the trump does is ' +
        'reread the same posture as chosen, and the test is whether you could come ' +
        'down if you decided to.',
    },
    {
      q: 'Is this card about sunk cost?',
      a:
        'Frequently, and it is one of the clearest readings available. The move you ' +
        'cannot stop making is usually the one already paid for, and the suspension ' +
        'exists to let you notice that the payment is gone either way.',
    },
    {
      q: 'How is a suspension different from procrastination?',
      a:
        'By what comes out of it. A suspension produces a changed position; ' +
        'procrastination produces the same position with better wording. The card ' +
        'reversed is the second one.',
    },
    {
      q: 'The Hanged Man or Death when something has to end?',
      a:
        'The Hanged Man stops a thing that could still resume. Death is for the one ' +
        'that has already finished, whether or not anybody has said so.',
    },
  ],
};

export default theHangedManEn;
