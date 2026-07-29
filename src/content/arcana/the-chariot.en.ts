import type { LoreDoc } from '@/content/types';

/**
 * The Chariot (VII), English. **REWRITTEN, NOT TRANSLATED** (§8.2).
 *
 * The pair's divergence:
 *   - `anchor` is `sign` here and `goldenDawnTitle` there. This document enters
 *     through Cancer as cardinal water under armour; that one enters through Lord
 *     of the Triumph of Light.
 *   - The interpretation makes a DIFFERENT ARGUMENT: the Indonesian half asks
 *     whether you are still holding the reins, this half is about the cost of
 *     turning -- that a moving thing can only change direction slowly, so the
 *     decision has to be made further out than feels necessary. The DIVERGENCE
 *     table forbids `steer`, `stop this week`, `urgent` and `add` in the two
 *     interpretation sections here.
 *   - The Q&A asks different questions -- the sphinxes, and the burning city.
 *
 * SAME AND MUST BE: `yesno: yes upright / no reversed`.
 */
export const theChariotEn: LoreDoc = {
  slug: 'the-chariot',
  locale: 'en',
  cardId: 7,
  anchor: 'sign',

  title: 'The Chariot (VII) Tarot Card Meaning — Upright & Reversed',
  description:
    'The Chariot (VII) is momentum you can still steer. Upright and reversed ' +
    'meanings, the Cancer attribution, and why this hard card is filed under water.',
  h1: 'The Chariot (VII): Tarot Card Meaning',
  standfirst:
    'The seventh trump. Not a card about winning — a card about how far ahead you ' +
    'have to decide, once a thing is already moving.',
  imageAlt:
    'An armoured rider stands on a heavy war chariot drawn by two stone sphinxes, ' +
    'torn banners on a long pole; a city burns on the horizon behind him and the ' +
    'churned ground under the wheels is red.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'A stationary thing turns instantly and a moving one does not. That is the ' +
        'whole physics of this trump: the faster the situation is going, the further ' +
        'out you have to make the decision, and the less it will feel like a decision ' +
        'when you make it.',
    },
    {
      kind: 'paragraph',
      text:
        'Which is why people miss the turn. By the time a situation feels serious ' +
        'enough to act on, it is already past the point where acting is cheap — and ' +
        'everything before that felt too early to bother with.',
    },
    {
      kind: 'paragraph',
      text:
        'Upright, the card says you are still early enough. Not comfortably early — ' +
        'this trump never says comfortably — but early enough that a small correction ' +
        'now does the work a violent one would have to do later.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, great force with nowhere to point it. Every component is intact — ' +
        'the vehicle, the animals, the speed — and the only missing part is the hand, ' +
        'which is why from outside it still looks like progress.',
    },
    {
      kind: 'paragraph',
      text:
        'The commonest shape is a schedule that keeps filling while nothing gets ' +
        'finished. Each individual week is defensible. It is only at three months ' +
        'that the pattern is visible, and at three months the correction is expensive.',
    },
    {
      kind: 'paragraph',
      text:
        'So the verdict inverts to no, and the refusal is specific rather than ' +
        'general: not "don’t", but "not until something is aiming this". Force ' +
        'applied to an unaimed thing only brings the arrival forward.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Upright, yes — and yes to something already under way rather than to ' +
      'something new. Reversed it turns to no, because more force on an unaimed ' +
      'thing only brings the arrival forward.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Cancer, cardinal water, under armour' },
    {
      kind: 'paragraph',
      text:
        'The sign is Cancer: water, and cardinal. This is the attribution that stops ' +
        'people, because everything on the card looks like fire. Cancer, though, is ' +
        'the sign of the shell — the arrangement where something soft is carried by ' +
        'something hard.',
    },
    {
      kind: 'paragraph',
      text:
        'Read that way the armour stops being a boast. It is evidence: nobody plates ' +
        'a thing that cannot be hurt. The rider is armoured because the journey ' +
        'matters more than the comfort of the person making it, and there is ' +
        'something in there worth protecting to the end of it.',
    },
    {
      kind: 'paragraph',
      text:
        'Cardinal, meanwhile, means this sign opens a season. The movement on this ' +
        'card is not the middle of a long campaign. It is early, fast, and not yet ' +
        'tested.',
    },

    { kind: 'heading', level: 2, text: 'Cheth, an enclosure' },
    {
      kind: 'paragraph',
      text:
        'The letter is Cheth, which means a fence or an enclosed field. A shell ' +
        'again, and not a weapon. Two of this card’s three traditional attributions ' +
        'describe a container, which is a strange result for the trump everyone reads ' +
        'as the aggressive one.',
    },
    {
      kind: 'quote',
      text: 'he is conquest on all planes — in the mind, in science, in progress',
      source: 'A. E. Waite, on the seventh trump',
    },

    { kind: 'heading', level: 2, text: 'Two sphinxes, and a city on fire' },
    {
      kind: 'paragraph',
      text:
        'Ours is drawn by two stone sphinxes and they are not looking the same way. ' +
        'The familiar card makes them black and white and gives the driver no reins ' +
        'at all — the commentaries say he directs them by will, which is a generous ' +
        'reading of a man holding nothing.',
    },
    {
      kind: 'paragraph',
      text:
        'Behind him a city is burning. The painting does not say whether he has just ' +
        'left it or just done it, and that is not an oversight. Fast movement almost ' +
        'always has something behind it that did not come along.',
    },
    {
      kind: 'paragraph',
      text:
        'The banners on his pole are already in rags, and he is still carrying them.',
    },

    { kind: 'heading', level: 2, text: 'Seven' },
    {
      kind: 'paragraph',
      text:
        'Seven follows six, where the parts were arranged into one shape, and ' +
        'precedes eight, where the shape gets tested. In most schemes seven is ' +
        'victory that has not been examined yet — which fits a card travelling at ' +
        'speed in a direction it has not justified.',
    },
    { kind: 'cardRef', slug: 'strength', text: 'Read the lore for Strength (VIII)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card it usually marks a day that was full before you woke up. The ' +
        'useful move is not to add anything but to pick one thing and hold it to the ' +
        'end.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading it is uncomfortably accurate in the present ' +
        'position: something is travelling right now. Ahead of you it is not a promise ' +
        'of victory — it is notice that the speed is about to rise.',
    },
  ],

  questions: [
    {
      q: 'Why sphinxes rather than horses?',
      a:
        'A sphinx asks questions and kills those who answer badly, which makes it a ' +
        'pointed choice of animal to be pulled by. In ours they are carved from stone ' +
        'and face different ways: the thing towing you is not going to agree with ' +
        'itself.',
    },
    {
      q: 'What is the burning city behind him?',
      a:
        'The painting refuses to say whether it is a place he escaped or a place he ' +
        'destroyed. Both are true of enough real journeys that leaving it open is the ' +
        'more honest picture.',
    },
    {
      q: 'Does The Chariot mean literal travel?',
      a:
        'Occasionally, and it is a weak reading. The card is about control of ' +
        'something already in motion, and most of the time that is a project, a ' +
        'career or an argument rather than a vehicle.',
    },
    {
      q: 'The Chariot or The Magician when I need to get something done?',
      a:
        'The Magician is for a thing that has not started and needs aiming. The ' +
        'Chariot is for a thing already moving too fast to aim gently.',
    },
  ],
};

export default theChariotEn;
