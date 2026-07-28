import type { LoreDoc } from '@/content/types';

/**
 * The Hermit (IX), English. **REWRITTEN, NOT TRANSLATED** (§8.2).
 *
 * The pair's divergence:
 *   - `anchor` is `goldenDawnTitle` here and `sign` there. This document enters
 *     through Prophet of the Eternal; that one enters through Virgo as mutable
 *     earth.
 *   - The interpretation makes a DIFFERENT ARGUMENT: the Indonesian half is about
 *     a withdrawal with an end date, this half is about the difference between
 *     needing more information and needing fewer voices. The DIVERGENCE table
 *     forbids `crowd`, `end date`, `come down` and `sift` in the two
 *     interpretation sections here.
 *   - The Q&A asks different questions -- the lamp, and grief.
 *
 * **THE VERDICT IS THE COUNTER-INTUITIVE ONE**: `no` upright, `yes` reversed.
 * **Polarity `neutral` does not flip.**
 */
export const theHermitEn: LoreDoc = {
  slug: 'the-hermit',
  locale: 'en',
  cardId: 9,
  anchor: 'goldenDawnTitle',

  title: 'The Hermit (IX) Tarot Card Meaning — Upright & Reversed',
  description:
    'The Hermit (IX) is stepping back a while so that it all comes clear. Upright ' +
    'and reversed meanings, the Virgo attribution, and why the answer is no.',
  h1: 'The Hermit (IX): Tarot Card Meaning',
  standfirst:
    'The ninth trump. Not a card about loneliness — a card about the difference ' +
    'between needing more information and needing fewer voices.',
  imageAlt:
    'A heavily cloaked figure walks away from us along a snow ridge above a sea of ' +
    'cloud, a staff in one hand and a lantern held low in the other; a trail of red ' +
    'drops marks the path behind him.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Most stuck decisions are not short of information. They are short of ' +
        'quiet. The relevant facts have all arrived, several times, wearing different ' +
        'people’s opinions, and the difficulty is telling which of the resulting ' +
        'preferences is yours.',
      },
    {
      kind: 'paragraph',
      text:
        'That is what this trump answers, and it is why its verdict is no. Not "do ' +
        'not", which people hear — "not while this many things are talking". The ' +
        'refusal has a scope and the scope is short.',
    },
    {
      kind: 'paragraph',
      text:
        'It is worth saying that gathering more input is the socially approved way ' +
        'to stall. Asking a fourth person looks like diligence and costs nothing, and ' +
        'it reliably produces a fourth opinion. This card is the one that stops ' +
        'counting them.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, solitude dressed up as wisdom. The charge is unchanged — this ' +
        'trump is neutral both ways — and what has shifted is why the figure is still ' +
        'up there.',
    },
    {
      kind: 'paragraph',
      text:
        'There is a straightforward symptom. A useful retreat produces something: a ' +
        'decision, a sentence, a changed mind. One that has gone on too long produces ' +
        'more retreat, and describes itself in terms of what it is protecting you ' +
        'from rather than what it is for.',
    },
    {
      kind: 'paragraph',
      text:
        'Which is where the verdict flips to yes. Not yes to staying — yes to the ' +
        'thing you have been deferring on the grounds that you were not ready. You ' +
        'became ready some time ago and did not notice, because nobody was there to ' +
        'tell you.',
    },
  ],

  yesno: {
    upright: 'no',
    reversed: 'yes',
    note:
      'Upright, no — and a no that means not yet rather than do not, scoped to the ' +
      'noise around the question. Reversed it flips to yes, because the retreat ' +
      'stopped producing anything a while ago.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Prophet of the Eternal' },
    {
      kind: 'paragraph',
      text:
        'The Golden Dawn calls this one the Prophet of the Eternal, the Magus of the ' +
        'Voice of Power. It is a very loud title for the quietest card in the deck, ' +
        'and the mismatch is the point: what is being described is not a mood, it is ' +
        'an office.',
    },
    {
      kind: 'paragraph',
      text:
        'A prophet is not somebody who withdrew because people were difficult. A ' +
        'prophet withdrew in order to come back with something, and is judged ' +
        'entirely on whether they did.',
    },

    { kind: 'heading', level: 2, text: 'Virgo, and Yod' },
    {
      kind: 'paragraph',
      text:
        'The sign is Virgo: earth, and mutable — an odd combination, since earth is ' +
        'supposed to stay put. What comes out of it is not solidity but separation: ' +
        'sorting the useful from the rest, grain by grain, which cannot be hurried by ' +
        'applying more force.',
    },
    {
      kind: 'paragraph',
      text:
        'The letter is Yod, the smallest character in the Hebrew alphabet, meaning a ' +
        'hand. Tradition treats it as the point from which every other letter is ' +
        'formed: the smallest thing and also the first. For a card about withdrawal ' +
        'that is a good note — what is being done up on the ridge is not large.',
    },

    { kind: 'heading', level: 2, text: 'A back, walking away' },
    {
      kind: 'paragraph',
      text:
        'The familiar card faces us and holds the lamp up, with a six-pointed star ' +
        'inside it. The gesture is unambiguous: he is lighting the way for somebody ' +
        'else.',
    },
    {
      kind: 'paragraph',
      text:
        'Ours has his back to us and he is walking off. The lantern is held down at ' +
        'knee height, so it lights a few paces in front of his own feet and nothing ' +
        'further. Nobody is being guided here.',
    },
    {
      kind: 'paragraph',
      text:
        'There is a trail of red drops on the path behind him. Getting up here cost ' +
        'something, and it was paid before the picture starts.',
    },

    { kind: 'heading', level: 2, text: 'Nine' },
    {
      kind: 'paragraph',
      text:
        'Nine is the last number before the count repeats, which is why it usually ' +
        'reads as completion. Two later trumps fold back to it, and the closest in ' +
        'meaning is The Moon at eighteen — a card whose poor light was never its ' +
        'choice, standing in front of the card that brought its own.',
    },
    { kind: 'cardRef', slug: 'the-moon', text: 'Read the lore for The Moon (XVIII)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card it usually recommends one hour with nobody in it, and one ' +
        'hour is generally enough. This trump does not require a month on a mountain.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading, behind you it often marks a quiet stretch that ' +
        'turned out to be useful even though it felt like lost time. Ahead of you it ' +
        'is scheduling a pause, not forecasting isolation.',
    },
  ],

  questions: [
    {
      q: 'Why is the lamp pointing at the ground in our card?',
      a:
        'Because he is not guiding anybody. The traditional gesture — lamp raised, ' +
        'star inside it — makes him a beacon. Ours lights a few paces of his own ' +
        'path, which is a smaller and more accurate claim about what withdrawal does.',
    },
    {
      q: 'Does The Hermit mean grief?',
      a:
        'Not by itself. It describes a chosen distance rather than an imposed one, ' +
        'and if the solitude in the question was not chosen, the card is usually ' +
        'describing what to do inside it rather than naming it.',
    },
    {
      q: 'Is a reversed Hermit telling me to socialise more?',
      a:
        'It is telling you the retreat has stopped producing anything. That often ' +
        'means going back to people, and sometimes it just means going back to the ' +
        'decision you climbed up here to make.',
    },
    {
      q: 'The Hermit or The Moon when I cannot see clearly?',
      a:
        'The Hermit chose the dark and brought a lamp. The Moon did not choose it and ' +
        'has no lamp at all. One is a decision about attention; the other is a report ' +
        'about conditions.',
    },
  ],
};

export default theHermitEn;
