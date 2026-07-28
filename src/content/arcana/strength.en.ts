import type { LoreDoc } from '@/content/types';

/**
 * Strength (VIII), English. **REWRITTEN, NOT TRANSLATED** (§8.2).
 *
 * The pair's divergence:
 *   - `anchor` is `sign` here and `marseille` there. This document enters through
 *     Leo as fixed fire; that one enters through the VIII/XI exchange. The swap is
 *     told once per card and from opposite sides: Strength tells it in Indonesian,
 *     Justice tells it in English.
 *   - The interpretation makes a DIFFERENT ARGUMENT: the Indonesian half is about
 *     accompanying a thing rather than suppressing it, this half is about the fact
 *     that the lion is not going anywhere and the arrangement therefore has no end
 *     date. The DIVERGENCE table forbids `accompany`, `suppress`, `praise` and
 *     `ember` in the two interpretation sections here.
 *   - The Q&A asks different questions -- the closed eyes, and anger.
 *
 * SAME AND MUST BE: `yesno: yes upright / no reversed`.
 */
export const strengthEn: LoreDoc = {
  slug: 'strength',
  locale: 'en',
  cardId: 8,
  anchor: 'sign',

  title: 'Strength (VIII) Tarot Card Meaning — Upright & Reversed',
  description:
    'Strength (VIII) is gentleness that turns out to be holding the reins. Upright ' +
    'and reversed meanings, the Leo attribution, and why the lion never leaves.',
  h1: 'Strength (VIII): Tarot Card Meaning',
  standfirst:
    'The eighth trump. Not a card about force — a card about an arrangement with ' +
    'something dangerous that has no end date and was never going to.',
  imageAlt:
    'A woman kneels beside a lion with her bare hand inside its open jaws; the ' +
    'animal’s eyes are shut, there is blood on her sleeve, and a shallow bowl of ' +
    'blood stands in the dirt in front of them.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'The lion is not being defeated. Nothing on this card is being defeated. ' +
        'What has happened is that two things which could destroy each other have ' +
        'arrived at terms, and the terms hold for exactly as long as somebody keeps ' +
        'them.',
    },
    {
      kind: 'paragraph',
      text:
        'That is the part people want to skip. There is no version of this where the ' +
        'dangerous thing is finished and you can stop attending to it. Appetite, ' +
        'temper, grief and ambition are all permanent residents, and the trump is ' +
        'about tenancy rather than eviction.',
    },
    {
      kind: 'paragraph',
      text:
        'Upright, it says the terms are currently good ones and that you negotiated ' +
        'them. That is a real achievement and it is invisible from outside, which is ' +
        'why nobody has mentioned it.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, courage spent on the wrong thing. The nerve is genuine — the card ' +
        'never questions that — and it has been aimed at something that did not ' +
        'require it.',
    },
    {
      kind: 'paragraph',
      text:
        'Usually there has been a substitution. The genuinely hard thing was left ' +
        'alone, and something else is being fought hard enough to serve as evidence ' +
        'that you are not somebody who backs down. The evidence is even convincing.',
    },
    {
      kind: 'paragraph',
      text:
        'So the verdict turns to no, and what it refuses is not the nerve but the ' +
        'placement. Effort put where nothing will move is still effort, and it is ' +
        'spent from the same account as the effort that would have worked.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Upright, yes — a long yes, to something that has to be repeated rather than ' +
      'completed. Reversed it turns to no, because the nerve is real and it is ' +
      'pointed at something that will not move whatever you spend on it.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Leo, and the rarest combination in the zodiac' },
    {
      kind: 'paragraph',
      text:
        'The sign is Leo: fire, and fixed. Fixed fire is the least intuitive of the ' +
        'twelve pairings, because fire is the element that moves and fixed is the ' +
        'quality that does not. What survives that contradiction is a coal — no ' +
        'flame, no extinction, and heat for hours.',
    },
    {
      kind: 'paragraph',
      text:
        'That is precisely the demand the card makes. Not one act of bravery but the ' +
        'same heat tomorrow, and the day after, with nobody watching and no obvious ' +
        'progress to point at.',
    },

    { kind: 'heading', level: 2, text: 'Teth, and a sword that is only in the title' },
    {
      kind: 'paragraph',
      text:
        'The letter is Teth, which means serpent — the animal traditions reach for ' +
        'when something is both dangerous and older than you, and can be understood ' +
        'but not domesticated. The Golden Dawn title is Daughter of the Flaming ' +
        'Sword, and it is worth noticing that the sword is in the name and not in ' +
        'the picture: the sharp thing was inherited, and what is being used here is ' +
        'an open hand.',
    },

    { kind: 'heading', level: 2, text: 'A hand inside the jaws' },
    {
      kind: 'paragraph',
      text:
        'The familiar card has her standing, calmly closing the lion’s mouth. Ours ' +
        'has her kneeling, with her hand inside a mouth that is wide open.',
    },
    {
      kind: 'paragraph',
      text:
        'The lion’s eyes are shut. It is neither attacking nor tame; it is still. ' +
        'There is blood on her sleeve and it is not from today.',
    },
    {
      kind: 'paragraph',
      text:
        'That composition moves the whole card from power to trust that has already ' +
        'been paid for. She is not restraining the animal. She is in a position where ' +
        'it could end her at any moment, and she is staying there.',
    },
    {
      kind: 'quote',
      text: 'she has closed the jaws of the lion — but with a chain of flowers',
      source: 'A. E. Waite, on the eighth trump',
    },

    { kind: 'heading', level: 2, text: 'Eight, and the exchange with Justice' },
    {
      kind: 'paragraph',
      text:
        'Eight is repetition: four doubled, one shape stacked on itself. One later ' +
        'trump folds back here, The Star at seventeen, and the pairing is apt — both ' +
        'are cards about doing the same unremarkable thing again with no guarantee. ' +
        'Eight is also the contested number in this deck: older orders put Justice ' +
        'here and Strength at eleven, and Waite exchanged them so the trumps would ' +
        'follow the zodiac.',
    },
    { kind: 'cardRef', slug: 'justice', text: 'Read the lore for Justice (XI)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card it usually names the thing you will meet today that would be ' +
        'quickest to shout at. The card recommends the slower route, not because it ' +
        'is nobler, but because the quick one has to be repeated next week.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading it lands most often in the present, where it points ' +
        'at something you have been carrying for a long time without filing it under ' +
        'work.',
    },
  ],

  questions: [
    {
      q: 'Why are the lion’s eyes closed?',
      a:
        'Because nothing is being fought. A restrained animal is tense and an ' +
        'unconscious one is a different card; a still one with its eyes shut is an ' +
        'animal that has stopped treating the person beside it as a threat.',
    },
    {
      q: 'Is Strength about controlling anger?',
      a:
        'It is about living beside it. Control implies an end state where the anger ' +
        'is gone, and this card does not offer one — the arrangement it describes has ' +
        'to be renewed rather than completed.',
    },
    {
      q: 'Does Strength ever mean physical strength?',
      a:
        'Rarely, and it is almost always the weaker reading. The picture deliberately ' +
        'shows the smaller party unarmed and closer than she needs to be, which is a ' +
        'claim about nerve rather than about capacity.',
    },
    {
      q: 'Strength or The Chariot when something needs holding together?',
      a:
        'The Chariot holds a thing that is moving and can still be aimed. Strength ' +
        'holds a thing that is not going anywhere at all, and never was.',
    },
  ],
};

export default strengthEn;
