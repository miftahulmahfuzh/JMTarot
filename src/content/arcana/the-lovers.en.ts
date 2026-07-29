import type { LoreDoc } from '@/content/types';

/**
 * The Lovers (VI), English. **REWRITTEN, NOT TRANSLATED** (§8.2).
 *
 * The pair's divergence:
 *   - `anchor` is `rws` here and `sign` there. This document enters through the
 *     figure standing above the two; that one enters through Gemini and air.
 *   - The interpretation makes a DIFFERENT ARGUMENT: the Indonesian half is about
 *     closing the other doors, this half is about the fact that a choice is a
 *     statement about the chooser and is read that way by everybody else. The
 *     DIVERGENCE table forbids `spare`, `maintain`, `wholeness` and `cheaper` in
 *     the two interpretation sections here.
 *   - The Q&A asks different questions -- the third figure, and choosing between
 *     two jobs rather than two people.
 *
 * SAME AND MUST BE: `yesno: yes upright / no reversed`, asserted against
 * `effectiveYesNo()`.
 */
export const theLoversEn: LoreDoc = {
  slug: 'the-lovers',
  locale: 'en',
  cardId: 6,
  anchor: 'rws',

  title: 'The Lovers (VI) Tarot Card Meaning — Upright & Reversed',
  description:
    'The Lovers (VI) is a choice made with the whole of you. Upright and reversed ' +
    'meanings, the Gemini attribution, and the figure standing over the pair.',
  h1: 'The Lovers (VI): Tarot Card Meaning',
  standfirst:
    'The sixth trump. Not a card about romance — a card about the fact that what ' +
    'you pick is read by everybody as a statement about you.',
  imageAlt:
    'Two figures stand side by side with their joined hands manacled together by a ' +
    'short chain; a dark winged shape blocks the moon above them, a black snake ' +
    'coils on the ground, and white roses grow among dry thorns.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Every real choice is also a disclosure. Pick one of two roles, two cities, ' +
        'two people, and you have told everyone watching what you value more — ' +
        'including the person you did not pick, and including yourself.',
    },
    {
      kind: 'paragraph',
      text:
        'That is the weight on this trump, and it explains why the deciding takes so ' +
        'much longer than the deliberating. The options were compared weeks ago. What ' +
        'has not happened is being willing to be the sort of person who chose that.',
    },
    {
      kind: 'paragraph',
      text:
        'Upright, the card says the disclosure is survivable and probably overdue. ' +
        'Nobody has ever thought less of a person for choosing clearly; the ' +
        'contempt, when it arrives, is always for the hedging.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, a self split between two directions. Not usually because both are ' +
        'equally good — they rarely are — but because committing would settle a ' +
        'question about your own character that you would rather leave open.',
    },
    {
      kind: 'paragraph',
      text:
        'The tell is what you say out loud. Somebody in this position describes both ' +
        'options generously and neither one specifically, because a specific ' +
        'description of the one you want is already the decision, and it can be ' +
        'quoted back at you later.',
    },
    {
      kind: 'paragraph',
      text:
        'So the verdict inverts to no, and it is not a judgement on either option. ' +
        'It is the plainest thing the card ever says: nothing has been chosen yet, so ' +
        'there is nothing here to answer yes to.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Upright, yes, and a demanding yes: yes if you will also say out loud which ' +
      'one it is. Reversed it turns to no — two options kept alive at once is not a ' +
      'decision, and there is nothing there to affirm.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'The third figure, and who it is looking at' },
    {
      kind: 'paragraph',
      text:
        'The Rider-Waite puts the angel Raphael above the pair, arms open, lit and ' +
        'benevolent, with a serpent in the tree behind the woman and a burning tree ' +
        'behind the man. It is a scene of blessing with a warning hidden in the ' +
        'foliage.',
    },
    {
      kind: 'paragraph',
      text:
        'Ours keeps the figure and takes away the light. It is a black winged shape ' +
        'across the moon, and you cannot tell whether it is presiding or waiting. ' +
        'That ambiguity is the more honest picture of what it feels like to make a ' +
        'binding choice while somebody is watching.',
    },
    {
      kind: 'paragraph',
      text:
        'The snake is not in a tree here. It is on the ground to their left, coiled, ' +
        'offering nothing. White roses grow through dry thorn. There is blood where ' +
        'they are standing.',
    },
    {
      kind: 'paragraph',
      text:
        'And their hands are not merely held. A short chain runs between the two ' +
        'wrists. Binding yourself to one thing costs range of movement, and the ' +
        'painting declines to hide that, without ever suggesting it is a mistake.',
    },

    { kind: 'heading', level: 2, text: 'Gemini, and a card of union filed under air' },
    {
      kind: 'paragraph',
      text:
        'People expect a card about union to be water. This one is air, because the ' +
        'sign is Gemini, and the filing is not a slip. Air is the element of ' +
        'distinction: sorting, comparing, telling this from that.',
    },
    {
      kind: 'paragraph',
      text:
        'Which is exactly right. Feeling can hold two people at once without any ' +
        'difficulty at all. A decision cannot, and this trump is about the second one.',
    },

    { kind: 'heading', level: 2, text: 'Zayin, and a title about a voice' },
    {
      kind: 'paragraph',
      text:
        'The letter is Zayin, a sword — an odd assignment for a card most decks ' +
        'illustrate with two lovers, until you remember what a sword does: it makes ' +
        'one thing into two. The Golden Dawn title is Children of the Voice Divine, ' +
        'and a voice picks one word and abandons every other word in the language to ' +
        'do it.',
    },

    { kind: 'heading', level: 2, text: 'Six' },
    {
      kind: 'paragraph',
      text:
        'Six arrives after the upheaval of five and before the victory of seven. It ' +
        'is the number of alignment: parts that were at odds arranged into one shape. ' +
        'What the arrangement never advertises is that something was always left out ' +
        'of it.',
    },
    { kind: 'cardRef', slug: 'the-chariot', text: 'Read the lore for The Chariot (VII)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card this is rarely about another person. It usually marks one ' +
        'small thing you have deferred because picking it means letting the other ' +
        'thing go.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading, behind you it points at an old decision still ' +
        'shaping the present. Ahead of you it is not a forecast of meeting anybody; ' +
        'it is a date in the calendar for a choice.',
    },
  ],

  questions: [
    {
      q: 'Does The Lovers predict a new relationship?',
      a:
        'Sometimes, and that is the narrowest available reading. The card is about a ' +
        'choice made with all of you, and a relationship is one instance of that ' +
        'rather than the definition of it.',
    },
    {
      q: 'What if the choice is between two jobs?',
      a:
        'Then the card works exactly as written, and the useful question is the same ' +
        'one: which choice are you reluctant to have on the record about yourself? ' +
        'That reluctance is usually where the answer already is.',
    },
    {
      q: 'Is the winged figure a blessing or a warning?',
      a:
        'In the older card, plainly a blessing. In ours it is a silhouette over the ' +
        'moon and it could be either, which is closer to how a binding decision ' +
        'actually feels while you are making it.',
    },
    {
      q: 'The Lovers or The Devil for a question about attachment?',
      a:
        'The Lovers is a chain you fastened on purpose and can name. The Devil is one ' +
        'you can see perfectly well and have not admitted is loose.',
    },
  ],
};

export default theLoversEn;
