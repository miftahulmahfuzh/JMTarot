import type { LoreDoc } from '@/content/types';

/**
 * The Moon (XVIII), English. **REWRITTEN, NOT TRANSLATED** (§8.2, and
 * `## Localization` rule 3 generalised).
 *
 * The pair's divergence, so a reviewer can check it in five seconds:
 *   - `anchor` is `path` here and `goldenDawnTitle` there. This document enters
 *     through Netzach -> Malkuth; that one enters through Flux and Reflux.
 *   - The interpretation's images are different: insufficient light on a road and
 *     a survey with half its answers missing, against two steps of visibility and
 *     two in the morning. The DIVERGENCE table forbids `step`, `night`, `guess`,
 *     `message`, `seven` in the two interpretation sections here.
 *   - The Q&A asks different questions -- lying, and timing -- not the same three.
 *
 * WHAT IS THE SAME AND MUST BE: the MEANING. Both agree with `cardMeaning()` and
 * both carry `yesno: no upright / yes reversed`, which `lore.test.ts` asserts
 * against `effectiveYesNo()`. Rewritten is about images and entry angle, never
 * about verdict.
 *
 * NO THERAPY OR DIAGNOSIS VOCABULARY and no generic-mystic tics. `anxiety` is not
 * forbidden and is not used here either.
 */
export const theMoonEn: LoreDoc = {
  slug: 'the-moon',
  locale: 'en',
  cardId: 18,
  anchor: 'path',

  title: 'The Moon (XVIII) Tarot Card Meaning — Upright & Reversed',
  description:
    'The Moon (XVIII) is the card of what you cannot see clearly yet: dreams, ' +
    'illusion, tides. Upright and reversed meanings, and the Pisces attribution ' +
    'behind it.',
  h1: 'The Moon (XVIII): Tarot Card Meaning',
  standfirst:
    'The eighteenth trump. Not the card of lies — the card of light too weak to see ' +
    'by, and of the decision you still have to make inside it.',
  imageAlt:
    'A full moon with a downturned face hangs between two ruined watchtowers; a wolf ' +
    'and a dog howl from either side of a cobbled road running out to a broken city, ' +
    'and a crayfish hauls itself from the dark pool in the foreground.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Upright, The Moon does not accuse anybody of deception. It reports ' +
        'insufficient light. The road has not changed and the destination has not ' +
        'moved; what has changed is how far ahead of yourself you can currently see.',
    },
    {
      kind: 'paragraph',
      text:
        'What the thing you cannot see clearly is telling you is usually partly ' +
        'right, and the partly is the whole problem. Discard it and you have thrown ' +
        'away a real signal. Act on all of it and you have built a plan on a survey ' +
        'with half the answers missing.',
    },
    {
      kind: 'paragraph',
      text:
        'So this card rarely asks you to wait for certainty. Certainty is often not ' +
        'coming. What it offers instead is permission to move while knowing you are ' +
        'estimating, which is considerably safer than estimating while feeling sure.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Reversed, the direction inverts. It is no longer the unclear thing speaking ' +
        'to you; it is your own fear speaking, and being read as an omen.',
    },
    {
      kind: 'paragraph',
      text:
        'The tell is not how it feels. A fear and a hunch are identical from the ' +
        'inside. The tell is what each one does under examination: a hunch holds its ' +
        'shape and gets more specific, and a fear changes its account every time you ' +
        'ask it a second question.',
    },
    {
      kind: 'paragraph',
      text:
        'Note also that a reversal flips this card’s verdict. Upright it answers ' +
        'no; reversed it answers yes, and the yes is conditional — what has been ' +
        'holding the thing up turns out to be a story rather than a circumstance, and ' +
        'a story is much the cheaper of the two to test.',
    },
  ],

  yesno: {
    upright: 'no',
    reversed: 'yes',
    note:
      'Upright the answer is no: there is not enough information in front of you to ' +
      'decide on. Reversed it flips to yes, conditionally — what has been in the way ' +
      'is an account you believe rather than a fact about the situation.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'The last path before the ground' },
    {
      kind: 'paragraph',
      text:
        'In the Hermetic scheme the eighteenth trump is laid on the path running from ' +
        'Netzach down into Malkuth — the final stretch before the material world, and ' +
        'the only one you cross at night. Whatever comes down that path arrives before ' +
        'anybody has had the chance to explain it.',
    },
    {
      kind: 'paragraph',
      text:
        'Its assigned letter is Qoph, tied by tradition to the back of the head and ' +
        'to sleep: the part of a person that receives before it reasons. The Golden ' +
        'Dawn’s own title for the card is Ruler of Flux and Reflux — not ruler of ' +
        'lies, ruler of what rises and falls without asking.',
    },

    { kind: 'heading', level: 2, text: 'Pisces, and why nothing here keeps a shape' },
    {
      kind: 'paragraph',
      text:
        'The sign is Pisces: water, and mutable. Water takes the shape of whatever ' +
        'holds it and remembers what held it; mutable means it will change form again ' +
        'rather than stop. That is an exact description of an unresolved situation and ' +
        'an equally exact description of your account of it, which is why readers ' +
        'reach for this card for both.',
    },

    { kind: 'heading', level: 2, text: 'What is actually in the picture' },
    {
      kind: 'paragraph',
      text:
        'Our Moon looks down and does not look back. Two watchtowers stand ruined on ' +
        'either side of a road that is still perfectly legible, running out to a city ' +
        'that is not. Torn banners hang along the walls, there is a skull on the ' +
        'right-hand stonework, and bone in the shallows.',
    },
    {
      kind: 'paragraph',
      text:
        'A wolf howls from the left and a dog from the right, and they are howling at ' +
        'the same thing. One was never tamed and one was. At this level of light you ' +
        'cannot tell a wild impulse from a trained habit, and both of them are yours.',
    },
    {
      kind: 'paragraph',
      text:
        'The oldest thing on the card is closest to the front: a crayfish dragging ' +
        'itself out of the pool. It intends nothing at all. It has surfaced because ' +
        'the water moved.',
    },
    {
      kind: 'quote',
      text: 'that which lies deeper than the savage beast',
      source: 'A. E. Waite, on the creature in The Moon’s pool',
    },

    { kind: 'heading', level: 2, text: 'Eighteen' },
    {
      kind: 'paragraph',
      text:
        'Eighteen folds to nine, and nine is The Hermit: the card that carries its own ' +
        'lamp, standing directly behind the card whose light was never its choice. The ' +
        'distance between those two is most of what this one means. The Hermit chose ' +
        'the dark.',
    },
    { kind: 'cardRef', slug: 'the-hermit', text: 'Read the lore for The Hermit (IX)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'As a Daily Card this is rarely a forecast of events. It is a note about the ' +
        'state of your visibility: a day to gather one checkable fact, and not a day ' +
        'to settle something large.',
    },
    {
      kind: 'paragraph',
      text:
        'In a three-card reading its position moves the meaning more than most cards ' +
        'do. Behind you, it says an earlier decision was made on incomplete ' +
        'information, which is an explanation and not a charge. Ahead of you, it is at ' +
        'its plainest: the information is not complete and will not become complete ' +
        'until you move.',
    },
  ],

  questions: [
    {
      q: 'Is The Moon a bad card?',
      a:
        'No. It does not predict loss. It reports that your information is ' +
        'incomplete, and that report is most useful precisely when you are about to ' +
        'decide something large.',
    },
    {
      q: 'Does The Moon mean someone is lying to me?',
      a:
        'Usually not. More often it means you do not yet know what the other person ' +
        'is dealing with, and that the account you assembled to fill the gap feels ' +
        'finished because you are the one who wrote it.',
    },
    {
      q: 'What does The Moon say about timing?',
      a:
        'Very little, and that is the honest answer. It is a card about not being ' +
        'able to see ahead, so a date read off it is a date invented. If a spread owes ' +
        'you a schedule, the other cards owe it, not this one.',
    },
    {
      q: 'The Moon or The High Priestess — what is the difference?',
      a:
        'The High Priestess is something you already know and have not said out loud. ' +
        'The Moon is something nobody in the room knows yet, including you.',
    },
  ],
};

export default theMoonEn;
