import type { LoreDoc } from '@/content/types';

/**
 * The Devil (XV), English. **REWRITTEN, NOT TRANSLATED** (§8.2).
 *
 * **THIS DOCUMENT MAY NOT USE `shadow work`.** It is on `EN_TICS` and this is the
 * card that reaches for it. `shadow` on its own is fine -- it is this card's own
 * English keyword in `cards.json` -- and the two-word phrase is the tic.
 *
 * The pair's divergence:
 *   - `anchor` is `rws` here and `sign` there. This document enters through the
 *     detail in the older card that the whole trump turns on -- the chains are
 *     loose enough to lift off; that one enters through Capricorn as cardinal
 *     earth.
 *   - The interpretation makes a DIFFERENT ARGUMENT: the Indonesian half is about
 *     a bargain you keep renewing, this half is about the fact that the arrangement
 *     is genuinely paying you something, which is why the advice to simply leave
 *     is useless. The DIVERGENCE table forbids `renew`, `terms`, `anniversary` and
 *     `name it` in the two interpretation sections here.
 *   - The Q&A asks different questions -- addiction, and whether the figure is
 *     external.
 *
 * **POLARITY `shadow` UPRIGHT AND `light` REVERSED; yesno `no` -> `yes`.**
 * Root card: The Lovers.
 */
export const theDevilEn: LoreDoc = {
  slug: 'the-devil',
  locale: 'en',
  cardId: 15,
  anchor: 'rws',

  title: 'The Devil (XV) Tarot Card Meaning — Upright & Reversed',
  description:
    'The Devil (XV) is a chain you can see perfectly well from where you stand. ' +
    'Upright and reversed meanings, the Capricorn attribution, and the loose chain.',
  h1: 'The Devil (XV): Tarot Card Meaning',
  standfirst:
    'The fifteenth trump. Not a card about evil — a card about an arrangement that ' +
    'is genuinely paying you something, which is why leaving is not simple.',
  imageAlt:
    'A horned figure crouches on top of a stone font holding a small flame; two ' +
    'hooded figures kneel below with bowed heads and chains at their necks, and ' +
    'the chains hang slack.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Nobody stays in a bad arrangement for nothing. That is the sentence this ' +
        'card exists to make people say out loud, because every piece of advice ' +
        'about a situation like this is useless until it is said.',
    },
    {
      kind: 'paragraph',
      text:
        'The arrangement pays. It might pay in money, in status, in not having to ' +
        'find out what you are like without it, or simply in the relief of a ' +
        'question that is already settled. The payment is real and it arrives on ' +
        'time, which is precisely what makes the situation stable rather than merely ' +
        'sad.',
    },
    {
      kind: 'paragraph',
      text:
        'So the trump answers no, and the refusal is aimed at the plan that pretends ' +
        'otherwise. Any exit built on the premise that you were getting nothing will ' +
        'fail in the second week, when the thing you were getting stops arriving and ' +
        'you have not replaced it.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, the charge becomes LIGHT — shadow upright, light inverted — so ' +
        'this is not the darker version, whatever the picture suggests. What it names ' +
        'is a hunger you have not dared to say.',
    },
    {
      kind: 'paragraph',
      text:
        'An unadmitted want does not go quiet. It routes: a run of decisions that ' +
        'were each defensible on their own merits and that all, oddly, went the same ' +
        'way. Nothing was hidden from anybody. It simply never came up.',
    },
    {
      kind: 'paragraph',
      text:
        'Which is why the verdict flips to yes, and to something almost ' +
        'embarrassingly small: put the want in an ordinary sentence, once, with no ' +
        'defence attached. Most of its leverage came from never having been weighed ' +
        'against anything else.',
    },
  ],

  yesno: {
    upright: 'no',
    reversed: 'yes',
    note:
      'Upright, no — aimed at any exit built on the premise that this was giving you ' +
      'nothing. Reversed it flips to yes, to the small hard thing: saying plainly ' +
      'what you actually want.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'The detail the whole card turns on' },
    {
      kind: 'paragraph',
      text:
        'In the Rider-Waite two naked figures are chained by the neck to the block ' +
        'the horned figure sits on. The chains are drawn deliberately loose — wide ' +
        'enough to lift straight off over their heads. Waite meant it to be noticed, ' +
        'and most people looking at the card do not notice it.',
    },
    {
      kind: 'paragraph',
      text:
        'Ours keeps the slack and drops the nudity. Two hooded figures kneel with ' +
        'their heads down, and nothing is pulling on the chain. They are not being ' +
        'held in that position; they have been in it long enough that it has become ' +
        'the way they sit.',
    },
    {
      kind: 'paragraph',
      text:
        'And the small flame in the horned figure’s hand is the only light in the ' +
        'room. That is the most honest thing in the painting: the thing that binds is ' +
        'also the thing you can see by, which is why the advice from outside always ' +
        'sounds so easy.',
    },

    { kind: 'heading', level: 2, text: 'Capricorn, and a card about discipline' },
    {
      kind: 'paragraph',
      text:
        'The sign is Capricorn: earth, and cardinal — which is startling here, ' +
        'because Capricorn is the sign usually read as discipline. The long ascent, ' +
        'the patience, the work nobody sees.',
    },
    {
      kind: 'paragraph',
      text:
        'It is exactly right. What holds people longest is not laziness; it is ' +
        'commitment. The chains that take years to get out of were fitted by somebody ' +
        'conscientious, and cardinal means the arrangement had a start date you can ' +
        'probably still name.',
    },

    { kind: 'heading', level: 2, text: 'Ayin, an eye' },
    {
      kind: 'paragraph',
      text:
        'The letter is Ayin, which means an eye. For a card about bondage that seems ' +
        'like a mismatch until you notice that the entire trump depends on seeing: ' +
        'the chain is not hidden and never was. The Golden Dawn title is Lord of the ' +
        'Gates of Matter, Child of the Forces of Time — two names for one thing, ' +
        'something that binds because it has gone on a long while.',
    },

    { kind: 'heading', level: 2, text: 'Fifteen, and its root' },
    {
      kind: 'paragraph',
      text:
        'Fifteen folds to six, which is The Lovers. The card about a binding choice ' +
        'stands directly behind the card about a binding that is no longer chosen, ' +
        'and the only distance between them is elapsed time.',
    },
    { kind: 'cardRef', slug: 'the-lovers', text: 'Read the lore for The Lovers (VI)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card it usually points at one automatic thing you decided once: ' +
        'a habit, a payment, a reply you always send.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading it is seldom wrong and seldom welcome in the present ' +
        'position. Ahead of you it is not a warning about temptation — it is a note ' +
        'about a renewal date.',
    },
  ],

  questions: [
    {
      q: 'Is The Devil about addiction?',
      a:
        'It can describe the structure of one, and this page will not go further ' +
        'than that. Anything involving substances or compulsion is a matter for real ' +
        'help rather than for a card, and the trump’s subject is the bargain rather ' +
        'than any condition.',
    },
    {
      q: 'Is the horned figure something outside me?',
      a:
        'The painting declines to say, and the arrangement works the same either way. ' +
        'What it is holding is a light rather than the chain, which is the more ' +
        'uncomfortable of the two available readings.',
    },
    {
      q: 'If the chain is loose, why not just walk?',
      a:
        'Because the chain was never what was holding anybody. The arrangement is ' +
        'paying, and walking means losing the payment as well as the constraint. Any ' +
        'plan that skips that step is a plan that lasts a fortnight.',
    },
    {
      q: 'The Devil or The Moon for a question about self-deception?',
      a:
        'The Moon is not seeing clearly. The Devil is seeing perfectly well and ' +
        'having very good reasons, which is the harder of the two to work with.',
    },
  ],
};

export default theDevilEn;
