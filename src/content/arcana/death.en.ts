import type { LoreDoc } from '@/content/types';

/**
 * Death (XIII), English. **REWRITTEN, NOT TRANSLATED** (§8.2).
 *
 * **THE HIGHEST-RISK DOCUMENT IN THE RELEASE, AND THE LINT DOES NOT COVER IT.**
 * `THERAPY_EN` contains no entry for `death`, `dying` or `bereavement`, so nothing
 * mechanical stops this page from reading as a prediction about a real person. The
 * rule is the honest line, not a word list: write about endings that have ALREADY
 * HAPPENED, name no illness, offer no prognosis, and route any question about
 * somebody's health to a doctor rather than to a card. §8.3's disclaimer renders
 * under this prose and is load-bearing here in a way it is not elsewhere.
 *
 * The pair's divergence:
 *   - `anchor` is `marseille` here and `sign` there. This document enters through
 *     the fact that the oldest decks leave the thirteenth trump UNNAMED; that one
 *     enters through Scorpio as fixed water.
 *   - The interpretation makes a DIFFERENT ARGUMENT: the Indonesian half is about
 *     the energy released by admitting a thing has stopped, this half is about the
 *     gap between the date something ended and the date it was announced. The
 *     DIVERGENCE table forbids `announce`, `upkeep`, `loyalty` and `subscription`
 *     in the two interpretation sections here.
 *   - The Q&A asks different questions -- the unnamed card, and reversals.
 *
 * **POLARITY `shadow` UPRIGHT AND `light` REVERSED; yesno `no` -> `yes`.**
 * Root card: The Emperor.
 */
export const deathEn: LoreDoc = {
  slug: 'death',
  locale: 'en',
  cardId: 13,
  anchor: 'marseille',

  title: 'Death (XIII) Tarot Card Meaning — Upright & Reversed',
  description:
    'Death (XIII) is an ending that frees you. Upright and reversed meanings, the ' +
    'Scorpio attribution, and why the card reports rather than predicts.',
  h1: 'Death (XIII): Tarot Card Meaning',
  standfirst:
    'The thirteenth trump. It describes something that has already finished, and it ' +
    'is almost never about anybody dying.',
  imageAlt:
    'A skeletal armoured rider carries a scythe across a finished battlefield on a ' +
    'pale horse; shields and skulls lie in the churned mud, and torn banners lean ' +
    'in the distance under a low sun.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Before anything else: this card is almost never about a person dying. Any ' +
        'question about somebody’s health belongs with a doctor, and no arrangement ' +
        'of cards is entitled to an opinion about it.',
    },
    {
      kind: 'paragraph',
      text:
        'What the trump actually measures is a gap. There is a date on which ' +
        'something stopped working, and a later date on which somebody said so out ' +
        'loud, and the distance between those two is where most of the damage lives. ' +
        'Upright, the card says the first date is behind you.',
    },
    {
      kind: 'paragraph',
      text:
        'That gap is expensive in a specific way. Everything scheduled during it was ' +
        'planned around a thing that had already stopped, so the plans were sound and ' +
        'the premise was not — which is why the period afterwards so often reads as ' +
        'wasted rather than as unlucky.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, the charge becomes LIGHT: this trump is shadow upright and light ' +
        'inverted, and a reading that makes the reversal grimmer contradicts the ' +
        'strip printed above it. What it names is holding on to something already ' +
        'finished.',
    },
    {
      kind: 'paragraph',
      text:
        'It seldom looks like denial. It looks like continuity — arrangements kept ' +
        'exactly as they were, out of decency rather than confusion. None of that is ' +
        'wrong, and all of it is a standing charge.',
    },
    {
      kind: 'paragraph',
      text:
        'The verdict flips to yes, and the yes is not for the old thing. It is for ' +
        'the next one, which has been waiting because starting it would function as ' +
        'a statement about the first, and nobody wants to make that statement on a ' +
        'Tuesday.',
    },
  ],

  yesno: {
    upright: 'no',
    reversed: 'yes',
    note:
      'Upright, no: what you are asking about rests on something that has already ' +
      'stopped standing. Reversed it flips to yes — not to the old thing, but to the ' +
      'next one, deferred because beginning it would say the first is over.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'The card with no name' },
    {
      kind: 'paragraph',
      text:
        'In the Marseille decks the thirteenth trump carries a number and NO TITLE. ' +
        'Every other card in the sequence is captioned; this one is left blank, and ' +
        'the blank is deliberate rather than a printing accident.',
    },
    {
      kind: 'paragraph',
      text:
        'The usual explanation is superstition, and the more interesting one is ' +
        'grammatical. A caption tells the reader what the picture is of. Withholding ' +
        'it on this card leaves the image to make the claim, which is the correct ' +
        'call for the one trump whose title people read as a prediction the moment ' +
        'they see it.',
    },
    {
      kind: 'paragraph',
      text:
        'Ours is captioned, because a modern deck that left one card blank would ' +
        'read as a missing file rather than as reticence. What the older decks were ' +
        'protecting is protected here by the writing instead.',
    },

    { kind: 'heading', level: 2, text: 'Scorpio, Nun, and a gate' },
    {
      kind: 'paragraph',
      text:
        'The sign is Scorpio: water, and fixed. Fixed water does not flow anywhere — ' +
        'it is deep rather than moving, and of the twelve combinations it is the ' +
        'least susceptible to being talked round. This card does not negotiate ' +
        'because its sign does not.',
    },
    {
      kind: 'paragraph',
      text:
        'Its letter is Nun, a fish: an animal that lives where the surface cannot see ' +
        'and surfaces without warning. The Golden Dawn title is Child of the Great ' +
        'Transformers, Lord of the Gate of Death — and the operative noun is gate. A ' +
        'gate is a place you pass through, not a place you stop.',
    },

    { kind: 'heading', level: 2, text: 'A field that is already over' },
    {
      kind: 'paragraph',
      text:
        'Our rider is skeletal, armoured, carrying a scythe, on a pale horse. So far ' +
        'the painting is doing what this card has done for six hundred years.',
    },
    {
      kind: 'paragraph',
      text:
        'The field is where it departs. He is not attacking anybody. Everything on ' +
        'the ground was on the ground before he arrived — shields, skulls, mud, ' +
        'banners already torn and leaning. The battle finished and he came afterwards.',
    },
    {
      kind: 'paragraph',
      text:
        'That single decision governs the whole reading. This figure is not a cause. ' +
        'He passes through and records, and the sun behind him is already low.',
    },

    { kind: 'heading', level: 2, text: 'Thirteen, and its root' },
    {
      kind: 'paragraph',
      text:
        'Thirteen folds to four, which is The Emperor. The pairing is uncomfortable ' +
        'and exact: the card that sets limits stands behind the card that closes ' +
        'something, because an ending is the one boundary nobody can renegotiate.',
    },
    { kind: 'cardRef', slug: 'the-tower', text: 'Read the lore for The Tower (XVI)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card it usually points at one small thing that has been renewed ' +
        'without a reason for a while, and could be closed today.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading, behind you it is almost always right and often a ' +
        'relief. Ahead of you it is not a forecast of loss; it marks a closure that ' +
        'is waiting to be said rather than to happen.',
    },
  ],

  questions: [
    {
      q: 'Does Death predict a death?',
      a:
        'No, and this page will not read it that way. It describes something that has ' +
        'already finished and has not been acknowledged. Questions about anybody’s ' +
        'health belong with a doctor; a card is not qualified and neither are we.',
    },
    {
      q: 'Why do the oldest decks leave this card unnamed?',
      a:
        'Superstition is the usual answer and it is probably part of it. The better ' +
        'reason is that a caption tells you what a picture is of, and this is the one ' +
        'trump whose caption gets read as a forecast the instant it is printed.',
    },
    {
      q: 'What if I have just lost somebody?',
      a:
        'Then the card is not telling you anything you do not know. The useful ' +
        'reading in that situation is rarely about the ending at all — it is about ' +
        'what is still being run exactly as it was.',
    },
    {
      q: 'Death or The Hanged Man when I need to let something go?',
      a:
        'The Hanged Man suspends a thing that could still resume. Death is for the ' +
        'one that has already finished; the only question left on it is whether ' +
        'anybody has said so.',
    },
  ],
};

export default deathEn;
