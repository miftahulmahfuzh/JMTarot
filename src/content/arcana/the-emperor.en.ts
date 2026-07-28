import type { LoreDoc } from '@/content/types';

/**
 * The Emperor (IV), English. **REWRITTEN, NOT TRANSLATED** (§8.2).
 *
 * The pair's divergence:
 *   - `anchor` is `goldenDawnTitle` here and `sign` there. This document enters
 *     through Sun of the Morning; that one enters through Aries as cardinal fire.
 *   - The interpretation makes a DIFFERENT ARGUMENT. The Indonesian half is about
 *     a fence and about who is downhill of it; this half is about the difference
 *     between a decision and a policy. The DIVERGENCE table forbids `fence`,
 *     `Monday`, `written down` and `room` in the two interpretation sections here.
 *   - The Q&A asks different questions -- the ram skulls, and authority you did
 *     not choose.
 *
 * **POLARITY IS `neutral` AND DOES NOT FLIP.** Neither half may read the reversal
 * as the darker version; the page prints the charge directly above the prose.
 */
export const theEmperorEn: LoreDoc = {
  slug: 'the-emperor',
  locale: 'en',
  cardId: 4,
  anchor: 'goldenDawnTitle',

  title: 'The Emperor (IV) Tarot Card Meaning — Upright & Reversed',
  description:
    'The Emperor (IV) is structure that makes your footing calmer. Upright and ' +
    'reversed meanings, the Aries attribution, and why the card is charged neutral.',
  h1: 'The Emperor (IV): Tarot Card Meaning',
  standfirst:
    'The fourth trump. Not a card about power — a card about the difference between ' +
    'a decision you keep making and one you made once.',
  imageAlt:
    'An armoured, crowned figure sits on a throne whose back is a crown of iron ' +
    'spikes, a ram skull on each arm rest; the seat stands at the top of a flight ' +
    'of stone steps and blood runs down them.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'A decision is something you make. A policy is something you made. The whole ' +
        'of this trump is in that tense, and upright it says one of your recurring ' +
        'costs has quietly become the second kind.',
    },
    {
      kind: 'paragraph',
      text:
        'The saving is larger than it looks. A question that is settled once stops ' +
        'consuming attention every time it comes round, and most people are not tired ' +
        'from the hard choices but from the same easy one arriving forty times.',
    },
    {
      kind: 'paragraph',
      text:
        'Its charge is neutral and stays neutral in both orientations. The card does ' +
        'not take a side, because the identical arrangement can shelter a thing or ' +
        'trap it, and which one it is depends on the contents rather than on the ' +
        'walls.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, the charge is still neutral — reading this as the sinister version ' +
        'contradicts the data printed above it. What inverts is what is being ' +
        'mistaken for strength: a grip tightening is not usually a sign of power, it ' +
        'is a sign of expecting to lose something.',
    },
    {
      kind: 'paragraph',
      text:
        'There is an external test. A policy that is doing real work carries its own ' +
        'reason and survives the absence of whoever set it. An arrangement that is ' +
        'only control evaporates the moment its author is out of earshot, and ' +
        'everybody involved can already tell you which one they are living under.',
    },
    {
      kind: 'paragraph',
      text:
        'The verdict turns to no, and rarely because the plan is bad. It is because ' +
        'the thing you are about to add is another layer of procedure to a situation ' +
        'that is short of trust, and procedure has never once produced trust.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Upright, yes — with this card’s characteristic condition: yes if you will ' +
      'settle it once rather than agree to it repeatedly. Reversed it turns to no, ' +
      'because what is short here is trust, and no arrangement produces that.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Sun of the Morning' },
    {
      kind: 'paragraph',
      text:
        'The Golden Dawn title is Sun of the Morning, Chief among the Mighty. The ' +
        'first half is the interesting one, and it is easy to read past: morning, not ' +
        'noon. This is not the card of an established power at its height. It is the ' +
        'card of the hour a thing begins to be governed.',
    },
    {
      kind: 'paragraph',
      text:
        'That matches its sign exactly. Aries is cardinal — the cardinal signs open ' +
        'the seasons — so the founding rather than the maintaining is the part this ' +
        'trump owns. Whoever is merely keeping an old arrangement alive is on a ' +
        'different card.',
    },

    { kind: 'heading', level: 2, text: 'Fire under a neutral charge, and a window' },
    {
      kind: 'paragraph',
      text:
        'The element is fire, which is why the card reads hard even where it is ' +
        'helping. Fire asks nothing. What stops it consuming everything is not any ' +
        'gentleness of its own but the shape somebody built around it, and this trump ' +
        'is that shape rather than the flame.',
    },
    {
      kind: 'paragraph',
      text:
        'Its letter is Heh, a window: a hole made deliberately in a wall, where what ' +
        'makes it a window rather than damage is that the wall is still standing. It ' +
        'is the whole argument of the card compressed into one noun.',
    },

    { kind: 'heading', level: 2, text: 'Spikes, ram skulls, and a flight of steps' },
    {
      kind: 'paragraph',
      text:
        'The back of our throne is a crown of iron spikes facing outward. Head on, it ' +
        'reads as rays. From the side it is a barricade. Both readings are correct ' +
        'and the painting is not choosing between them.',
    },
    {
      kind: 'paragraph',
      text:
        'A ram skull sits on each arm rest. The ram is the animal of Aries, and here ' +
        'nothing is left of it but the bone. A card about limits has mounted the ' +
        'remains of an unlimited impulse exactly where the hands come to rest.',
    },
    {
      kind: 'paragraph',
      text:
        'And the throne is at the top of a flight of steps with blood running down ' +
        'them. Elevation is part of the office. Whatever is decided up there is ' +
        'received first by whoever is standing lower, and the card is not pretending ' +
        'otherwise.',
    },

    { kind: 'heading', level: 2, text: 'Four' },
    {
      kind: 'paragraph',
      text:
        'Four is the smallest number of corners that encloses anything. Three can ' +
        'stand on its own with no walls at all; four shuts. Every later trump needs ' +
        'somewhere for its events to happen, and this is where the deck builds it.',
    },
    { kind: 'cardRef', slug: 'the-hierophant', text: 'Read the lore for The Hierophant (V)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card it usually names one thing to settle today so that it stops ' +
        'being renegotiated: a boundary, a time, a number both sides have agreed.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading, behind you it often means an arrangement you ' +
        'inherited and have never audited. Ahead of you it is an offer of structure, ' +
        'and an offer is not an instruction.',
    },
  ],

  questions: [
    {
      q: 'What do the ram skulls mean?',
      a:
        'The ram is the animal of Aries, this card’s sign. Rendering it as bone puts ' +
        'the impulse in the past tense: the force that founded the arrangement is ' +
        'finished, and what is left is the arrangement.',
    },
    {
      q: 'Does The Emperor mean a man?',
      a:
        'Occasionally, and it is seldom the most useful reading. More often it points ' +
        'at the structure itself — a rule, a schedule, a limit — and structures have ' +
        'no gender.',
    },
    {
      q: 'What if the authority in the question is one I did not choose?',
      a:
        'Then the card is describing the walls rather than endorsing them. Its charge ' +
        'is neutral for exactly this reason: it reports that something is being held ' +
        'in a shape, and leaves the question of whose shape to you.',
    },
    {
      q: 'The Emperor or Justice for a question about fairness?',
      a:
        'The Emperor is about whether a rule exists and holds. Justice is about ' +
        'whether the rule is the right one, which is a different question and a ' +
        'harder card.',
    },
  ],
};

export default theEmperorEn;
