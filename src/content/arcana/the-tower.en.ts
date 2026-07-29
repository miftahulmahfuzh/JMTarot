import type { LoreDoc } from '@/content/types';

/**
 * The Tower (XVI), English. **REWRITTEN, NOT TRANSLATED** (§8.2).
 *
 * The pair's divergence:
 *   - `anchor` is `goldenDawnTitle` here and `sign` there. This document enters
 *     through Lord of the Hosts of the Mighty; that one enters through Mars.
 *   - The interpretation makes a DIFFERENT ARGUMENT: the Indonesian half is about
 *     the crack having been known about for years, this half is about the speed --
 *     that the value of the collapse is entirely in how fast it happens, and a
 *     slow version of the same failure is worse. The DIVERGENCE table forbids
 *     `crack`, `patch`, `inspect` and `lightning last` in the two interpretation
 *     sections here.
 *   - The Q&A asks different questions -- the falling figures, and whether it can
 *     be prevented.
 *
 * **POLARITY `shadow` UPRIGHT AND `light` REVERSED; yesno `no` -> `yes`.**
 * Root card: The Chariot.
 */
export const theTowerEn: LoreDoc = {
  slug: 'the-tower',
  locale: 'en',
  cardId: 16,
  anchor: 'goldenDawnTitle',

  title: 'The Tower (XVI) Tarot Card Meaning — Upright & Reversed',
  description:
    'The Tower (XVI) is a collapse that needed to happen. Upright and reversed ' +
    'meanings, the Mars attribution, and why the speed of it is the mercy.',
  h1: 'The Tower (XVI): Tarot Card Meaning',
  standfirst:
    'The sixteenth trump. Not a card about random disaster — a card about a failure ' +
    'that finally happened quickly instead of taking another four years.',
  imageAlt:
    'A stone tower is split from top to bottom by a single strike, masonry bursting ' +
    'outward; two figures fall on either side, fire shows in the window slits, and ' +
    'blood runs down the rubble at its base.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'The same failure can arrive at two speeds, and the difference between them ' +
        'is most of what happens to the people involved. A company can shut in a ' +
        'month or bleed for five years. A relationship can end in a conversation or ' +
        'in a decade of managed disappointment.',
    },
    {
      kind: 'paragraph',
      text:
        'The slow version is worse and it is what everybody chooses, because each ' +
        'individual month of it is survivable and the fast version is not. Nobody ' +
        'ever opts for the tower. It has to be done to them.',
    },
    {
      kind: 'paragraph',
      text:
        'Upright, the card says the fast version has arrived, and that is the whole ' +
        'of its mercy. It answers no — refusing anything built on the part that just ' +
        'came down — and the refusal is narrow. Build. Not there.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, the charge becomes LIGHT, because this trump is shadow upright. ' +
        'What it names is a warning let past again and again, which means the ' +
        'collapse has not happened and the slow version is currently running.',
    },
    {
      kind: 'paragraph',
      text:
        'It does not present as neglect. It presents as competence: an emergency ' +
        'repair every few months, an explanation that is always the same one, one ' +
        'person who quietly absorbs the shortfall each time and has stopped ' +
        'mentioning it.',
    },
    {
      kind: 'paragraph',
      text:
        'So the verdict flips to yes — not to demolishing anything yourself, but to ' +
        'looking properly now, while the timing still belongs to you rather than to ' +
        'the weather.',
    },
  ],

  yesno: {
    upright: 'no',
    reversed: 'yes',
    note:
      'Upright, no, and it refuses only what would be built on the part that just ' +
      'failed. Reversed it flips to yes — to looking now, while the timetable is ' +
      'still yours and not something else’s.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Lord of the Hosts of the Mighty' },
    {
      kind: 'paragraph',
      text:
        'The Golden Dawn title is Lord of the Hosts of the Mighty, and `hosts` there ' +
        'means armies. Not one force: many, arriving together. That is a better ' +
        'description of how things actually fall over than a single bolt is.',
    },
    {
      kind: 'paragraph',
      text:
        'Structures almost never fail from one cause. They fail when three tolerable ' +
        'problems coincide, which is why the post-mortem always finds several and ' +
        'why nobody can be blamed cleanly.',
    },

    { kind: 'heading', level: 2, text: 'Mars, and a mouth' },
    {
      kind: 'paragraph',
      text:
        'The planet is Mars and the element is fire — the only card in this deck ' +
        'given both with no zodiac sign in between. Mars postpones nothing; what it ' +
        'does is accelerate what was going to happen anyway, which is exactly the ' +
        'reading above.',
    },
    {
      kind: 'paragraph',
      text:
        'The letter is Peh, the mouth. For a card about masonry that is a surprise ' +
        'and it is the most accurate detail in the attribution: what most often ' +
        'brings a structure down is not weather but somebody finally saying the thing ' +
        'everyone already knew.',
    },

    { kind: 'heading', level: 2, text: 'No crown' },
    {
      kind: 'paragraph',
      text:
        'In the familiar card the first thing to go is the crown on the tower’s top, ' +
        'blown clear by the strike. The signal is unmistakable: what is falling is ' +
        'power, or pride, or something that had it coming.',
    },
    {
      kind: 'paragraph',
      text:
        'Ours has no crown. The tower is split from top to bottom by one strike, the ' +
        'stone is bursting outward, and two figures fall on either side. There is ' +
        'fire in the window slits, which means somebody lived there.',
    },
    {
      kind: 'paragraph',
      text:
        'Removing the crown removes the moral. Nothing here is falling because it ' +
        'deserved to. It is a building with people in it, which is the reading that ' +
        'turns out to be right far more often.',
    },
    {
      kind: 'quote',
      text: 'it is the ruin of the House of Life, when evil has prevailed therein',
      source: 'A. E. Waite, on the sixteenth trump',
    },

    { kind: 'heading', level: 2, text: 'Sixteen, and its root' },
    {
      kind: 'paragraph',
      text:
        'Sixteen folds to seven, which is The Chariot. The card about something ' +
        'travelling fast and still steerable stands directly behind this one, and the ' +
        'distance between them answers the question of what happens when nobody holds ' +
        'the reins for long enough.',
    },
    { kind: 'cardRef', slug: 'the-chariot', text: 'Read the lore for The Chariot (VII)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card it seldom means a ruined day. More often it marks the one ' +
        'thing that gets said today and cannot be unsaid afterwards.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading, behind you it is nearly always something you are ' +
        'now glad about and were not at the time. Ahead of you it is not a sentence ' +
        'passed; it points at a fault you can still examine yourself.',
    },
  ],

  questions: [
    {
      q: 'Who are the two falling figures?',
      a:
        'The card does not say, and the older versions do not either. What matters is ' +
        'that there are two rather than one: a structure coming down takes everybody ' +
        'inside it, including the people who warned about it.',
    },
    {
      q: 'Can The Tower be prevented?',
      a:
        'Sometimes, and rarely by the person who draws it. What can be changed is ' +
        'which version arrives — the fast one or the five-year one — and only the ' +
        'reversal offers that choice, because it means the collapse has not started.',
    },
    {
      q: 'Is The Tower always about something bad?',
      a:
        'It is always about something ending abruptly, and the value of abruptly is ' +
        'real. A slow failure costs more and is easier to keep participating in, ' +
        'which is why nobody ever chooses this card and it has to be dealt to them.',
    },
    {
      q: 'The Tower or Death when something is over?',
      a:
        'Death is a thing that finished some time ago and has not been named. The ' +
        'Tower is happening now, loudly, and there will be no argument afterwards ' +
        'about whether it happened.',
    },
  ],
};

export default theTowerEn;
