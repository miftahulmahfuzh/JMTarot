import type { LoreDoc } from '@/content/types';

/**
 * The High Priestess (II), English. **REWRITTEN, NOT TRANSLATED** (§8.2).
 *
 * The pair's divergence:
 *   - `anchor` is `rws` here and `sign` there. This document enters through what
 *     the older card shows and ours removes; that one enters through Luna and a
 *     neutral charge.
 *   - The interpretation makes a DIFFERENT ARGUMENT rather than the same one in
 *     English. The Indonesian half is about a sentence you have not said and the
 *     reason you have not said it; this half is about the gap between what you
 *     would answer in a survey and what you would bet money on.
 *   - The Q&A asks different questions -- the pillars, and intuition against
 *     wishful thinking.
 *
 * SAME AND MUST BE: polarity `neutral` does NOT flip, and `yesno` is `maybe` in
 * both orientations. Neither half may lean on a change of charge that the engine
 * does not make.
 */
export const theHighPriestessEn: LoreDoc = {
  slug: 'the-high-priestess',
  locale: 'en',
  cardId: 2,
  anchor: 'rws',

  title: 'The High Priestess (II) Tarot Meaning — Upright & Reversed',
  description:
    'The High Priestess (II) is something you already know and have not said out ' +
    'loud. Upright and reversed meanings, and why her answer is always undecided.',
  h1: 'The High Priestess (II): Tarot Card Meaning',
  standfirst:
    'The second trump. Not a card about other people’s secrets — a card about the ' +
    'thing you would bet money on and have never once said.',
  imageAlt:
    'A veiled figure with no visible face sits beneath a stone arch between two ' +
    'pillars capped with skulls; the floor is flooded and dark, and a single ' +
    'crescent lies flat in the water in front of her.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'There is a difference between what you would write on a survey and what you ' +
        'would put money on. This card lives in that gap. Upright, it says the second ' +
        'number exists and you have already worked it out.',
    },
    {
      kind: 'paragraph',
      text:
        'People generally treat that as being unsure. It is not: an unsure person has ' +
        'no second number. What is actually happening is that the second number ' +
        'commits you to something, and the survey answer does not.',
    },
    {
      kind: 'paragraph',
      text:
        'The card does not ask for a confession. It asks you to notice that you were ' +
        'never undecided, and to stop spending effort on gathering more information ' +
        'you will not use. That expenditure can go on for a year, and it looks ' +
        'diligent from the outside.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, the charge does not change — this trump is neutral both ways up, ' +
        'and a reading that makes the reversal darker is contradicting the card ' +
        'directly. What changes is the volume of everything else.',
    },
    {
      kind: 'paragraph',
      text:
        'The usual mechanism is not refusal, it is noise. Something plays the moment ' +
        'the car door shuts. A screen is on while the kettle boils. None of it is ' +
        'avoidance in any way you could be accused of, and all of it works: the ' +
        'unwelcome thought never gets far enough along to finish.',
    },
    {
      kind: 'paragraph',
      text:
        'Which is why the verdict stays undecided, and that is a report rather than ' +
        'a hedge. Nothing outside you is holding the answer back. It is waiting on ' +
        'somebody to say it, and this trump has never been the one who says it.',
    },
  ],

  yesno: {
    upright: 'maybe',
    reversed: 'maybe',
    note:
      'Undecided, both ways up, and that is the honest reading rather than a hedge. ' +
      'What settles this question is not a circumstance that could turn either way ' +
      'but a decision already taken and not yet admitted to.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'What the older card shows, and what ours takes away' },
    {
      kind: 'paragraph',
      text:
        'In the Rider-Waite the Priestess holds a scroll marked TORA, half hidden in ' +
        'the folds of her robe. Knowledge, present and deliberately not fully shown. ' +
        'It is the detail almost every description of the card leans on.',
    },
    {
      kind: 'paragraph',
      text:
        'Ours has no scroll. Her hands are empty, and the only object in the frame is ' +
        'a crescent lying flat in the flooded floor in front of her. Nothing is being ' +
        'withheld from you, because there is no document to withhold. What is being ' +
        'kept is not the kind of thing that can be handed over.',
    },
    {
      kind: 'paragraph',
      text:
        'She has no face either. Not shadowed, not turned away — the cloth falls ' +
        'straight from her head to her lap and there is nothing behind it to read. ' +
        'You will not get a tell out of this one.',
    },

    { kind: 'heading', level: 2, text: 'The pillars, and who is sitting on them' },
    {
      kind: 'paragraph',
      text:
        'The two pillars are traditionally lettered B and J, for Boaz and Jachin, and ' +
        'the reader is meant to pass between them. Ours are capped with skulls. The ' +
        'people on top of these pillars have already been through.',
    },
    {
      kind: 'quote',
      text: 'she is the secret Church, the House which is of God and man',
      source: 'A. E. Waite, on the second trump',
    },

    { kind: 'heading', level: 2, text: 'Luna, Gimel, and the Silver Star' },
    {
      kind: 'paragraph',
      text:
        'The attribution is Luna, which is the astrologers’ name for the moon as a ' +
        'body — kept in Latin here precisely because The Moon is also a card, and ' +
        '"The Moon" as a label on card two would read as an error. Luna has no light ' +
        'of its own; it reflects, and how much shows depends on where it is standing.',
    },
    {
      kind: 'paragraph',
      text:
        'Its letter is Gimel, the camel: an animal that carries its supply inside ' +
        'itself and crosses country that provides nothing. The Golden Dawn title is ' +
        'Priestess of the Silver Star, and silver rather than gold is the whole ' +
        'point — a metal that reflects instead of one that burns.',
    },

    { kind: 'heading', level: 2, text: 'Two' },
    {
      kind: 'paragraph',
      text:
        'Two is the first number that makes comparison possible. One can only exist; ' +
        'two can differ. That is why this trump sits immediately after The Magician: ' +
        'one picks and acts, the other holds and weighs, and a deck with only the ' +
        'first would be unbearable.',
    },
    { kind: 'cardRef', slug: 'the-magician', text: 'Read the lore for The Magician (I)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card this rarely forecasts an event. It marks a day that will ' +
        'reward listening and punish announcing.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading it turns up most often in the present position, ' +
        'where it describes something you are holding right now rather than something ' +
        'coming. Ahead of you it is at its plainest: the unsaid thing will not resolve ' +
        'on its own.',
    },
  ],

  questions: [
    {
      q: 'Is The High Priestess about intuition or about wishful thinking?',
      a:
        'Both feel identical, so the card offers a test rather than a definition: an ' +
        'intuition gets MORE specific when you interrogate it, and wishful thinking ' +
        'gets vaguer. Ask it a second question and see which way it moves.',
    },
    {
      q: 'What do the two pillars mean?',
      a:
        'In the older card they are Boaz and Jachin, the two columns of the temple, ' +
        'and the reader passes between them into what is behind the veil. Ours are ' +
        'capped with skulls, which makes the same claim less politely.',
    },
    {
      q: 'Can this card mean a real person?',
      a:
        'Sometimes, and when it does it is usually somebody who knows the situation ' +
        'better than they have let on — not out of malice, but because they were ' +
        'never asked a direct question.',
    },
    {
      q: 'Why is a reversed High Priestess not the darker version?',
      a:
        'Because the trump’s charge is neutral, and neutral does not invert. A reading ' +
        'that makes the reversal sinister is contradicting the card’s own data, which ' +
        'this page prints directly above the interpretation.',
    },
  ],
};

export default theHighPriestessEn;
