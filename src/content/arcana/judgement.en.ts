import type { LoreDoc } from '@/content/types';

/**
 * Judgement (XX), English. **REWRITTEN, NOT TRANSLATED** (§8.2).
 *
 * **`Judgement`, NEVER `Judgment`**, and `judgement` in the URL. The card spells
 * it that way; §3.2's table and `urlSlug.test.ts` both hold the line.
 *
 * The pair's divergence:
 *   - `anchor` is `goldenDawnTitle` here and `element` there. This document enters
 *     through Spirit of the Primal Fire; that one enters through the fact that our
 *     data says water while the tradition says fire.
 *   - The interpretation makes a DIFFERENT ARGUMENT: the Indonesian half is about
 *     a summons that does not wait for readiness, this half is about the fact that
 *     what is being called is a version of you that you had already written off.
 *     The DIVERGENCE table forbids `summons`, `deserve`, `postpone` and `condition`
 *     in the two interpretation sections here.
 *   - The Q&A asks different questions -- the graves, and second chances.
 *
 * **Polarity `neutral` does not flip.** yesno `yes` -> `no`.
 * Root card: The High Priestess.
 */
export const judgementEn: LoreDoc = {
  slug: 'judgement',
  locale: 'en',
  cardId: 20,
  anchor: 'goldenDawnTitle',

  title: 'Judgement (XX) Tarot Card Meaning — Upright & Reversed',
  description:
    'Judgement (XX) is a call you have to answer. Upright and reversed meanings, ' +
    'the title Spirit of the Primal Fire, and what is actually being called.',
  h1: 'Judgement (XX): Tarot Card Meaning',
  standfirst:
    'The twentieth trump. Not a card about being judged — a card about a version of ' +
    'yourself you had already written off, being asked for by name.',
  imageAlt:
    'An enormous winged figure blows a long horn above a flooded graveyard; the ' +
    'dead climb from open stone graves with their arms raised, and a ruined city ' +
    'stands on the far horizon.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Everybody carries a few abandoned versions of themselves — the one who was ' +
        'going to build the thing, the one who was going to say it, the one who was ' +
        'good at something and stopped. They are not grieved over. They are filed, ' +
        'and the filing is what makes them survivable.',
    },
    {
      kind: 'paragraph',
      text:
        'This trump is the one that opens the file. Upright, something arrives that ' +
        'only that version could take, and it arrives addressed to them rather than ' +
        'to the person you have been running instead.',
    },
    {
      kind: 'paragraph',
      text:
        'Its charge is neutral both ways up, and that is precise. The card is not ' +
        'promising the return will go well. It reports that the question has been ' +
        'put, and that having been asked has already changed your position whatever ' +
        'you do next.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, a call you keep putting off. The charge is unchanged — neutral, ' +
        'not darker — and the only variable is how long it has been going on.',
    },
    {
      kind: 'paragraph',
      text:
        'Deferring never feels like refusing. It feels like sequencing, and the ' +
        'reasons are genuine every single time: something is on, something else is ' +
        'first, this is not the year. All of it true, and the file is still shut.',
    },
    {
      kind: 'paragraph',
      text:
        'So the verdict inverts to no, and it is not refusing the return. It is ' +
        'refusing the requirement you have attached to it, which has been quietly ' +
        'replaced with a new one at least twice.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Upright, yes, and it does not wait for you to feel qualified: the question ' +
      'has been put and silence counts as an answer. Reversed it turns to no — what ' +
      'it refuses is the fresh prerequisite you have attached.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Spirit of the Primal Fire' },
    {
      kind: 'paragraph',
      text:
        'The Golden Dawn title is Spirit of the Primal Fire, and it is the phrase ' +
        'that explains why this card sits where it does. Primal fire is not a ' +
        'punishment; it is the oldest energy in the scheme, the one everything else ' +
        'was made out of.',
    },
    {
      kind: 'paragraph',
      text:
        'A card at position twenty, one before the end, being assigned the FIRST ' +
        'thing is deliberate. What is called back here is not new. It predates ' +
        'everything that has happened since.',
    },

    { kind: 'heading', level: 2, text: 'Shin, and an element the sources disagree on' },
    {
      kind: 'paragraph',
      text:
        'The letter is Shin, meaning a tooth, and traditionally tied to fire — its ' +
        'written form is often read as three tongues of flame. That is where the ' +
        'fire in the title actually lives: in the letter rather than in the picture.',
    },
    {
      kind: 'paragraph',
      text:
        'Our card data gives this trump the element WATER, and the older tables give ' +
        'it fire. Both are true and this page renders ours, because that is the value ' +
        'the whole application has read since its first release. The flooded ground ' +
        'in the painting is on our side of the disagreement.',
    },
    {
      kind: 'paragraph',
      text:
        'The planet is Pluto — the second of only two modern bodies in this deck, ' +
        'after The Hanged Man. Pluto was not found until 1930, so it is absent from ' +
        'the original scheme entirely, and the sources genuinely disagree about this ' +
        'card in a way they do not about the other twenty-one.',
    },

    { kind: 'heading', level: 2, text: 'No scales anywhere' },
    {
      kind: 'paragraph',
      text:
        'The winged figure in ours is enormous and blowing a long horn. Below it the ' +
        'stone graves are already open and people are climbing out with their arms ' +
        'up. There is standing water between the graves and it is dark.',
    },
    {
      kind: 'paragraph',
      text:
        'A ruined city sits on the horizon. This call does not arrive somewhere ' +
        'intact; it arrives somewhere finished.',
    },
    {
      kind: 'paragraph',
      text:
        'And nothing in the frame is being weighed. There are no scales on this card ' +
        'at all — those belong to Justice, nine trumps earlier. Here there is a sound, ' +
        'and people getting up.',
    },

    { kind: 'heading', level: 2, text: 'Twenty, and its root' },
    {
      kind: 'paragraph',
      text:
        'Twenty folds to two, which is The High Priestess. The pairing is unusually ' +
        'apt: the card about something you already know and have not said stands ' +
        'directly behind the card about a call that has to be answered out loud.',
    },
    { kind: 'cardRef', slug: 'the-high-priestess', text: 'Read the lore for The High Priestess (II)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card it usually points at one unanswered message that is now well ' +
        'past polite, and whose answer would change something.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading, ahead of you it is not a forecast of the outcome. ' +
        'It marks the point at which the question gets put to you directly and ' +
        'avoiding it stops being available.',
    },
  ],

  questions: [
    {
      q: 'Is Judgement about being judged?',
      a:
        'No, and the picture says so: there are no scales anywhere on this card. ' +
        'Those are Justice, nine trumps earlier. Here there is a horn and people ' +
        'standing up, and the only thing asked for is an answer.',
    },
    {
      q: 'Why is it spelled Judgement rather than Judgment?',
      a:
        'Because the card spells it that way and the URL follows. The older British ' +
        'form is what nearly every tarot deck carries, including this one, and the ' +
        'address is permanent so the spelling is too.',
    },
    {
      q: 'Is this a second chance?',
      a:
        'It is the offer of one, which is not the same thing. The card is neutral in ' +
        'both orientations precisely because it declines to say whether taking it ' +
        'goes well.',
    },
    {
      q: 'Judgement or The Sun when something is coming to light?',
      a:
        'The Sun makes a thing visible and asks nothing. Judgement calls your name ' +
        'and then waits, and standing still is already one of the two available ' +
        'replies.',
    },
  ],
};

export default judgementEn;
