import type { LoreDoc } from '@/content/types';

/**
 * The Star (XVII), English. **REWRITTEN, NOT TRANSLATED** (§8.2).
 *
 * **THIS DOCUMENT MAY NOT USE `heal` OR `healing`.** Both are on `THERAPY_EN`,
 * and The Star and Temperance are the two cards that reach for them. Neither word
 * says anything specific about this trump; both are available as a substitute for
 * the sentence that would.
 *
 * The pair's divergence:
 *   - `anchor` is `sign` here and `number` there. This document enters through
 *     Aquarius standing slightly outside; that one enters through seventeen
 *     folding to eight.
 *   - The interpretation makes a DIFFERENT ARGUMENT: the Indonesian half is about
 *     hope that rests on something already survived, this half is about the
 *     particular exposure of hoping in public after a visible failure. The
 *     DIVERGENCE table forbids `survived`, `repeat`, `direction` and `unnoticed`
 *     in the two interpretation sections here.
 *   - The Q&A asks different questions -- the eight stars, and how long it lasts.
 *
 * ENGINE: yesno `yes` -> `no`; polarity `light` -> `shadow`. Root card: Strength.
 */
export const theStarEn: LoreDoc = {
  slug: 'the-star',
  locale: 'en',
  cardId: 17,
  anchor: 'sign',

  title: 'The Star (XVII) Tarot Card Meaning — Upright & Reversed',
  description:
    'The Star (XVII) is quiet hope, after everything came apart. Upright and ' +
    'reversed meanings, the Aquarius attribution, and the cost of hoping openly.',
  h1: 'The Star (XVII): Tarot Card Meaning',
  standfirst:
    'The seventeenth trump. Not a card about luck arriving — a card about what it ' +
    'costs to be seen hoping again, after the last attempt failed in public.',
  imageAlt:
    'A woman kneels in the shallows of a black pool, pouring a thick red liquid ' +
    'from two jugs, one stream into the water and one onto the bank; one large star ' +
    'and seven smaller ones hang above a bare dead tree.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Hoping again is a risk of a specific kind, and it is not the risk of being ' +
        'disappointed. It is the risk of being seen. If the last attempt failed where ' +
        'people could watch, starting a second one means announcing that you have not ' +
        'learned your lesson.',
    },
    {
      kind: 'paragraph',
      text:
        'That exposure is why the recovery from a public setback takes so much longer ' +
        'than the setback did. The work is not difficult. Being visibly in the early, ' +
        'unconvincing stage of it, in front of people who saw the last one, is.',
    },
    {
      kind: 'paragraph',
      text:
        'Upright, the card says do it anyway and expect no cover. It answers yes, ' +
        'and it is a slow yes: to something whose progress will not be legible to ' +
        'anybody, including you, for a while.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, hope set on the wrong light. Not the loss of it — this reversal is ' +
        'rarely about somebody who has given up. It is about a full tank of it aimed ' +
        'at something that is never going to respond.',
    },
    {
      kind: 'paragraph',
      text:
        'It is recognisable from outside. One thing that nearly happens, repeatedly, ' +
        'and is called off each time for a fresh and entirely reasonable cause. The ' +
        'reasonableness of the causes is what lets it run for years.',
    },
    {
      kind: 'paragraph',
      text:
        'The verdict inverts to no, and what it refuses is the aim rather than the ' +
        'hoping. Nobody needs less of this; the same amount, pointed somewhere ' +
        'capable of answering, is usually the entire fix.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Upright, yes, and a slow one: to something whose progress will not be legible ' +
      'for a while. Reversed it turns to no — the hoping is not the problem, the ' +
      'target is, and a target can be moved.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Aquarius, and standing slightly outside' },
    {
      kind: 'paragraph',
      text:
        'The sign is Aquarius: air, and fixed. The water-bearer is drawn pouring, ' +
        'which makes people file it under water; it is an air sign, and the ' +
        'misfiling is so common it is worth stating twice.',
    },
    {
      kind: 'paragraph',
      text:
        'Fixed air is one idea held for a long time. Not a mood that persists — an ' +
        'idea. For a card about hope after a failure that distinction carries the ' +
        'whole weight: what survives is not the feeling but a conclusion you reached ' +
        'and have not withdrawn.',
    },
    {
      kind: 'paragraph',
      text:
        'Aquarius is also the sign that stands slightly apart from the group, which ' +
        'suits a trump about being visibly out of step with the sensible people who ' +
        'have stopped trying.',
    },

    { kind: 'heading', level: 2, text: 'Tzaddi, and a dweller between waters' },
    {
      kind: 'paragraph',
      text:
        'The letter is Tzaddi, read in several traditions as a fish-hook: a tool used ' +
        'where you cannot see what is under the surface, which works by waiting. The ' +
        'Golden Dawn title is Daughter of the Firmament, the Dweller between the ' +
        'Waters, and the position is literal in the picture — one part of her in the ' +
        'pool and one on the bank.',
    },

    { kind: 'heading', level: 2, text: 'What she is pouring' },
    {
      kind: 'paragraph',
      text:
        'Ours kneels in the shallows of a black pool, and what comes from both jugs ' +
        'is thick and red: one stream into the water, one onto the ground. One large ' +
        'star and seven smaller ones hang above her, exactly as in the older card.',
    },
    {
      kind: 'paragraph',
      text:
        'The tree on the left is dead. The familiar version puts a bird in its ' +
        'branches; here the branches are empty, and what survives from the original ' +
        'composition is the stars and the act of pouring.',
    },
    {
      kind: 'paragraph',
      text:
        'Her reflection is in the water, and it is the only thing on this card facing ' +
        'us.',
    },
    {
      kind: 'quote',
      text: 'she is the Great Mother communicating to those below in the measure they can receive',
      source: 'A. E. Waite, on the seventeenth trump',
    },

    { kind: 'heading', level: 2, text: 'Seventeen, and its root' },
    {
      kind: 'paragraph',
      text:
        'Seventeen folds to eight, which is Strength. The gentlest-looking card in ' +
        'the deck stands on the most demanding one, and the pairing is the best ' +
        'explanation of either: both are about doing an unremarkable thing again ' +
        'tomorrow, with no evidence yet that it is working.',
    },
    { kind: 'cardRef', slug: 'strength', text: 'Read the lore for Strength (VIII)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card it is usually not news. It is permission to do one small ' +
        'thing whose result will not show this week, and to do it anyway.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading, ahead of you it rarely indicates an event — it ' +
        'indicates the conditions afterwards. Behind you it marks a recovery that did ' +
        'not feel like one while it was happening.',
    },
  ],

  questions: [
    {
      q: 'What are the eight stars?',
      a:
        'One large and seven small. The seven are usually read as the classical ' +
        'planets, with the eighth as the star of the querent themselves — which makes ' +
        'the card less about receiving guidance than about being counted among the ' +
        'lights.',
    },
    {
      q: 'How long does The Star last?',
      a:
        'Longer than it feels and shorter than you want. It is filed under the ' +
        'reckoning stage rather than the beginning, so it describes conditions after ' +
        'an event rather than a run of good fortune.',
    },
    {
      q: 'Does The Star mean everything will be fine?',
      a:
        'No, and it never claims to. What it says is that the worst has already ' +
        'happened and you are still here, which is a fact rather than a forecast — ' +
        'and unlike a forecast it cannot be cancelled by the next piece of news.',
    },
    {
      q: 'The Star or The Sun for a question about optimism?',
      a:
        'The Sun is broad daylight with nothing left in shadow. The Star is faint and ' +
        'far away and offers just enough bearing to walk tonight.',
    },
  ],
};

export default theStarEn;
