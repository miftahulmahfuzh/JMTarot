import type { LoreDoc } from '@/content/types';

/**
 * The Hierophant (V), English. **REWRITTEN, NOT TRANSLATED** (§8.2).
 *
 * **THIS DOCUMENT MAY NOT USE THE WORD `sacred`.** It is on `EN_TICS` and this is
 * the card in the deck that reaches for it hardest -- which is exactly why the ban
 * is worth having here: the word carries no information about this trump and
 * substitutes for the sentence that would have.
 *
 * The pair's divergence:
 *   - `anchor` is `sign` here and `hebrewLetter` there. This document enters
 *     through Taurus as fixed earth; that one enters through Vav, the nail.
 *   - The interpretation makes a DIFFERENT ARGUMENT: the Indonesian half is about
 *     an inherited rule and how to date it, this half is about the difference
 *     between a lesson and a licence -- who is allowed to say the thing. The
 *     DIVERGENCE table forbids `shelf`, `generations`, `expired` and `unique` in
 *     the two interpretation sections here.
 *   - The Q&A asks different questions -- the two kneeling figures, and mentors.
 *
 * **POLARITY IS `neutral` AND DOES NOT FLIP.**
 */
export const theHierophantEn: LoreDoc = {
  slug: 'the-hierophant',
  locale: 'en',
  cardId: 5,
  anchor: 'sign',

  title: 'The Hierophant (V) Tarot Card Meaning — Upright & Reversed',
  description:
    'The Hierophant (V) is a lesson handed down that still earns its place. Upright ' +
    'and reversed meanings, the Taurus attribution, and who is allowed to teach it.',
  h1: 'The Hierophant (V): Tarot Card Meaning',
  standfirst:
    'The fifth trump. Not a card about religion — a card about the difference ' +
    'between knowing a thing and being permitted to say it.',
  imageAlt:
    'A robed figure stands high on a stone pulpit beneath a rose window with both ' +
    'hands raised; two hooded supplicants kneel far below on a flooded floor, ' +
    'between rows of burning candles.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Most crafts contain some knowledge that is freely available and some that ' +
        'you are only handed once somebody vouches for you. The second kind is what ' +
        'this trump is about, and upright it says a door of that sort has opened.',
    },
    {
      kind: 'paragraph',
      text:
        'That arrangement is not a conspiracy and it is not entirely fair either. It ' +
        'exists because certain things cannot safely be given to a stranger, and the ' +
        'cost is that access depends on being recognised — which is a slow, personal ' +
        'and often unjust filter.',
    },
    {
      kind: 'paragraph',
      text:
        'The charge is neutral and stays neutral. Being admitted to something is not ' +
        'the same as the thing being good, and the card declines to tell you which ' +
        'you have. It only reports that the transmission is happening.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, the charge is unchanged — neutral both ways — and what inverts is ' +
        'the direction of the authority. The office is now speaking on subjects the ' +
        'office was never given.',
    },
    {
      kind: 'paragraph',
      text:
        'This is common and it is rarely deliberate. Somebody earns standing in one ' +
        'narrow area and is then asked, deferentially, about everything else, and ' +
        'answering is the polite thing to do. Nobody in the room has an incentive to ' +
        'point out where the mandate ran out.',
    },
    {
      kind: 'paragraph',
      text:
        'So the verdict turns to no. Not because the source is dishonest, but because ' +
        'you are about to take an answer on a subject the source is not actually ' +
        'standing on, and the confidence you are reading came from somewhere else.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Upright, yes, on one condition: take the method and leave the standing. ' +
      'Reversed it turns to no — the confidence in front of you was earned somewhere ' +
      'other than the subject you are asking about.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Taurus, and the slowest thing in the deck' },
    {
      kind: 'paragraph',
      text:
        'The sign is Taurus: earth, and fixed. Fixed signs hold the middle of a ' +
        'season rather than opening or closing it, and fixed earth is the slowest of ' +
        'the twelve combinations to change its mind about anything.',
    },
    {
      kind: 'paragraph',
      text:
        'That is not an insult and it is not an accident. An institution is asked for ' +
        'exactly one thing above all others: be the same next year. A body that ' +
        'reconsidered its position monthly could transmit nothing, because there ' +
        'would be nothing stable enough to transmit.',
    },

    { kind: 'heading', level: 2, text: 'Vav, and a title that keeps the word Magus' },
    {
      kind: 'paragraph',
      text:
        'The letter is Vav, which means a nail or a peg, and which in Hebrew grammar ' +
        'also serves as the word "and". It has no content of its own; its entire job ' +
        'is to join two things into one object. A joint is not a source, and a ' +
        'teacher who forgets that begins to believe the material originated with them.',
    },
    {
      kind: 'paragraph',
      text:
        'The Golden Dawn title is Magus of the Eternal Gods. It is worth noticing ' +
        'that he is still a magus, like the first trump. The difference is whose ' +
        'capability is being pointed: card one aims its own, and this one aims what ' +
        'it was handed.',
    },

    { kind: 'heading', level: 2, text: 'The height of the pulpit' },
    {
      kind: 'paragraph',
      text:
        'The familiar card has him seated, one hand raised in benediction. Ours has ' +
        'him standing on a tall pulpit with both hands up, and the two kneeling ' +
        'figures are a long way below him.',
    },
    {
      kind: 'paragraph',
      text:
        'The distance is the reading. Instruction travels from the pulpit to the ' +
        'floor intact. What does not make the trip is a question going the other way, ' +
        'and no part of the architecture was built for one.',
    },
    {
      kind: 'paragraph',
      text:
        'The floor is under water and the water is dark. The candles along the walls ' +
        'are all still lit and nobody has put them out. Whatever has happened in this ' +
        'building, the building is still running.',
    },

    { kind: 'heading', level: 2, text: 'Five' },
    {
      kind: 'paragraph',
      text:
        'Five is the first disruptive number: four has just closed a room, and five ' +
        'is what does not fit inside it. In most schemes five is the number of ' +
        'upheaval. Filing the institution here is an admission that institutions ' +
        'appear precisely because something did not fit.',
    },
    { kind: 'cardRef', slug: 'the-high-priestess', text: 'Read the lore for The High Priestess (II)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card it usually names one person who has already been through ' +
        'what you are in the middle of, and whom you have not asked.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading, behind you it is almost always family or school — ' +
        'something installed before you had a vote. Ahead of you it offers an existing ' +
        'method, and offering is not instructing.',
    },
  ],

  questions: [
    {
      q: 'Who are the two kneeling figures?',
      a:
        'In the older card they are ministers being instructed, which makes the ' +
        'picture a scene of transmission rather than of worship. Ours puts them ' +
        'further away and lower down, which sharpens the same point: this is a ' +
        'one-directional channel.',
    },
    {
      q: 'Is this card about a mentor?',
      a:
        'Often, and usefully so. A mentor is the small version of the institution: ' +
        'somebody who hands you a method they did not invent, along with the standing ' +
        'to use it. The reversal is the same person answering outside their subject.',
    },
    {
      q: 'Does The Hierophant mean marriage?',
      a:
        'It can, in the narrow sense that a marriage is a private arrangement given a ' +
        'public form by an institution. That framing is what the card contributes; ' +
        'whether the relationship is a good one is a different card entirely.',
    },
    {
      q: 'The Hierophant or The Emperor for a question about rules?',
      a:
        'The Emperor sets a rule and can change it. The Hierophant transmits one that ' +
        'predates them and that they could not change alone even if they wanted to.',
    },
  ],
};

export default theHierophantEn;
