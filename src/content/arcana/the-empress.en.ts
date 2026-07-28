import type { LoreDoc } from '@/content/types';

/**
 * The Empress (III), English. **REWRITTEN, NOT TRANSLATED** (§8.2).
 *
 * **THIS DOCUMENT MAY NOT USE THE WORD `abundance`, WHICH IS THIS CARD'S OWN
 * ENGLISH KEYWORD IN `cards.json`.** It is on `EN_TICS`, the lint scans
 * `src/content/**` and nothing else, and the keyword chip on the page comes from
 * generated data and is unaffected. So the lore has to say what the thing IS. That
 * is not a workaround imposed by a tool -- naming a virtue is exactly the filler
 * the authoring brief forbids, and this is the one card where the ban is
 * mechanical.
 *
 * The pair's divergence:
 *   - `anchor` is `stage` here and `sign` there. This document enters through the
 *     fact that a card this heavy is still filed under `beginning`; that one
 *     enters through Venus and earth.
 *   - The interpretation makes a DIFFERENT ARGUMENT: the Indonesian half is about
 *     who pays for the feeding, this half is about the difference between a thing
 *     that grows and a thing that is assembled. The DIVERGENCE table forbids
 *     `feed`, `season`, `quietly` and `reliable` in the two interpretation
 *     sections here.
 *   - The Q&A asks different questions -- Venus, and the dead garden.
 *
 * ENGINE: yesno `yes` -> `no`. Polarity `light` -> `shadow`.
 */
export const theEmpressEn: LoreDoc = {
  slug: 'the-empress',
  locale: 'en',
  cardId: 3,
  anchor: 'stage',

  title: 'The Empress (III) Tarot Card Meaning — Upright & Reversed',
  description:
    'The Empress (III) is something growing because it is genuinely being fed. ' +
    'Upright and reversed meanings, the Venus attribution, and what growth costs.',
  h1: 'The Empress (III): Tarot Card Meaning',
  standfirst:
    'The third trump. Not a card about plenty — a card about the difference between ' +
    'a thing that grows and a thing that is assembled.',
  imageAlt:
    'A veiled and visibly pregnant figure sits on a stone throne carved with skulls, ' +
    'one hand on her belly; the thorn garden around her is dead, crows watch from ' +
    'the branches, and skulls lie scattered in the earth at her feet.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Some things are built and some things are grown, and the two obey different ' +
        'rules. A built thing can be finished early by working harder. A grown thing ' +
        'cannot, at any price, and this trump is only ever about the second kind.',
    },
    {
      kind: 'paragraph',
      text:
        'That is why it is a difficult card to receive when you are impatient. It ' +
        'does not respond to effort in the way the rest of your week does. It ' +
        'responds to being returned to, which is a much smaller demand made a much ' +
        'larger number of times.',
    },
    {
      kind: 'paragraph',
      text:
        'Upright it is usually recognition rather than news. Something has been ' +
        'getting that treatment for long enough that it has started to show from ' +
        'outside, and the person most surprised by it is generally the one who did it.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, the rule holds and the accounting breaks. Care given past your own ' +
        'limit is not a better grade of care; it moves the shortage somewhere else, ' +
        'usually somewhere nobody is auditing.',
    },
    {
      kind: 'paragraph',
      text:
        'It rarely looks like a crisis. It looks like a person everybody can depend ' +
        'on and nobody can ask anything of, because the asking has had nowhere to go ' +
        'in their calendar for a long time.',
    },
    {
      kind: 'paragraph',
      text:
        'So the verdict inverts to no. Not because the thing you are tending is ' +
        'unworthy — the card never argues that — but because one more commitment ' +
        'would be drawn from an account that is already at zero.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Upright, yes, on an unglamorous condition: yes if you can return to it for as ' +
      'long as it takes, which is longer than you think. Reversed it turns to no, ' +
      'because the next commitment comes out of an account already at zero.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Still a beginning, and that is the surprise' },
    {
      kind: 'paragraph',
      text:
        'This deck files each trump under one of three stages, and The Empress is ' +
        'filed under `beginning` alongside The Fool and The Magician. That reads ' +
        'wrong at first: she is the heaviest figure in the opening set and the only ' +
        'one carrying something.',
    },
    {
      kind: 'paragraph',
      text:
        'It is right, and it is the most useful thing the classification says about ' +
        'her. Everything on this card is still ahead of itself. Nothing has been ' +
        'tested, nothing has survived a winter, and the outcome is entirely ' +
        'contingent on somebody continuing to show up. A beginning is not a small ' +
        'thing; it is an unfinished one.',
    },

    { kind: 'heading', level: 2, text: 'Venus, brought down to earth' },
    {
      kind: 'paragraph',
      text:
        'The planet is Venus and the element is earth, and the pair explains the card ' +
        'better than any single word. Venus alone reads as beauty. Earth drags it ' +
        'somewhere far less romantic: soil admires nothing, holds what it is given, ' +
        'and charges in time rather than in effort.',
    },
    {
      kind: 'paragraph',
      text:
        'Her letter is Daleth, a door — the place a thing enters the world, and also ' +
        'the only part of a house that is built to be shut. Both properties belong to ' +
        'this card and the second is the one people forget. The Golden Dawn title is ' +
        'Daughter of the Mighty Ones: not the powers themselves. Whoever makes a thing ' +
        'grow is seldom whoever decided it should.',
    },

    { kind: 'heading', level: 2, text: 'A garden with nothing living in it' },
    {
      kind: 'paragraph',
      text:
        'The familiar version of this card seats her in ripe wheat with a stream ' +
        'behind her. Ours seats her in dead thorn. Crows are in the branches and ' +
        'there are skulls in the ground.',
    },
    {
      kind: 'paragraph',
      text:
        'That is not cynicism, it is a choice of month. The painting has put her in ' +
        'the part of the year where what is growing is still entirely dependent on ' +
        'the person tending it, and where nothing in the surroundings is helping. ' +
        'Harvest is a different card.',
    },
    {
      kind: 'paragraph',
      text:
        'Her throne is stone and carved with skulls, and her hand rests on her belly. ' +
        'The card declines to separate what is arriving from what has already gone. ' +
        'It puts them on one seat.',
    },

    { kind: 'heading', level: 2, text: 'Three' },
    {
      kind: 'paragraph',
      text:
        'Three is the first number that can produce something: two can face each ' +
        'other, three can make. Two later trumps fold back here — The Hanged Man at ' +
        'twelve and The World at twenty-one — and both are about what happens once a ' +
        'thing has finished growing.',
    },
    { kind: 'cardRef', slug: 'the-hanged-man', text: 'Read the lore for The Hanged Man (XII)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card it usually points at one thing that needs a little today — ' +
        'not finishing, just attending to. This trump counts small repeated acts and ' +
        'is indifferent to large single ones.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading, behind you it almost always indicates somebody who ' +
        'tended you rather than the other way round. Ahead of you it is a question ' +
        'about stamina, and answering it honestly is allowed.',
    },
  ],

  questions: [
    {
      q: 'Does The Empress mean pregnancy?',
      a:
        'It can, and it is not the default. The card is about anything that grows ' +
        'because it is continuously fed — a business, a craft, a friendship. Reading ' +
        'it as a literal pregnancy every time is how a tarot reader ends up wrong in ' +
        'public.',
    },
    {
      q: 'Why is our garden dead when the traditional card is a wheat field?',
      a:
        'Because the painting picks a different month. Ripe wheat is a harvest, and ' +
        'harvest is the end of the story this card tells. Dead thorn puts the ' +
        'dependence back: nothing here survives without the person on the throne.',
    },
    {
      q: 'What does Venus actually contribute here?',
      a:
        'Less than you would expect on its own. Paired with earth it stops being ' +
        'about beauty and becomes about attachment to a particular thing over a long ' +
        'period — which is a much better description of what the card asks for.',
    },
    {
      q: 'The Empress or The Hierophant for a question about family?',
      a:
        'The Empress is what is being fed in a family right now. The Hierophant is ' +
        'what the family inherited and still repeats, whether or not it still works.',
    },
  ],
};

export default theEmpressEn;
