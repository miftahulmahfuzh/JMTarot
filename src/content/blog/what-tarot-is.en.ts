import { bullets, cardRef, em, h2, h3, link, para, s, steps, strong } from '../blocks';
import type { BlogDoc } from '../types';

/**
 * `what-tarot-is`, English. **AUTHORED, NOT TRANSLATED** (roadmap §8.2).
 *
 * Four deliberate differences from `./what-tarot-is.id.ts`, three of them asserted by
 * `blog.content.test.ts`:
 *
 *   1. It opens on the OBJECTION rather than on the definition — the sentence a sceptical
 *      reader is already forming — where the Indonesian opens by saying plainly what a
 *      deck is.
 *   2. It carries `#how-it-works` and `#skeptics`, and drops the Indonesian's
 *      `#origins` and `#not-for` sections. The historical material is one paragraph
 *      inside `#how-it-works` here rather than a section of its own; the "what it is not
 *      for" material is folded into `#what-its-for`, because in English the honest
 *      disclaimer reads better attached to the claim than standing beside it.
 *   3. Its worked card is Justice. The Indonesian's is The Fool.
 *   4. It recommends a different set of card pages — The Empress, Death, The Star against
 *      Wheel of Fortune, The Lovers, The Magician.
 *
 * FORBIDDEN-VOCABULARY CHECK, and the English list is longer. **No `sacred`, no
 * `abundance`, no `the Universe`, no `manifest`** — the four words an article explaining
 * tarot to a beginner reaches for first, and `EN_TICS` matches them as substrings and
 * case-insensitively. No therapy or diagnosis vocabulary, and no `healing`: this article
 * says what a deck of pictures *does* instead, which is the concrete register the whole
 * lint exists to force.
 */
export const whatTarotIsEn: BlogDoc = {
  slug: 'what-tarot-is',
  locale: 'en',
  title: 'What Is Tarot? Myths, Facts, and What It Is Actually For',
  description:
    'A plain explanation of tarot for someone who has never held a deck: what the cards are, which myths are wrong, and the three things a reading genuinely does.',
  hero: { cardUrlSlug: 'the-high-priestess', alt: 'The High Priestess' },
  body: [
    h2('what-tarot-is', 'What tarot is'),
    para(
      s(
        'The reasonable objection comes first, so let us take it first: a deck of cards cannot know anything about your life. That is true, and nothing below disputes it. What follows is an explanation of tarot that survives it.',
      ),
    ),
    para(
      s(
        'Tarot is a deck of pictures used to think about something more clearly. That is the shortest honest answer, and it is deliberately no grander than that.',
      ),
    ),
    para(
      s(
        'A full deck holds 78 cards. Fifty-six of them are called the Minor Arcana and are arranged like an ordinary pack: four suits running Ace to Ten, plus four figure cards each. The remaining 22 are the Major Arcana, and these are the ones people recognise — The Fool, The Lovers, Death, The Star, The World.',
      ),
    ),
    para(
      s(
        'The Majors belong to no suit and carry no number you can add up. Each is a scene on its own: someone stepping off a ledge, two figures standing under a light, a tower coming apart. Lay all 22 out in order from zero to twenty-one and you get something close to the shape of one human life from beginning to end, which is why a lot of readers — us included — work with the Majors alone.',
      ),
    ),
    cardRef('justice', 'Justice, number eleven: the card about consequence, not about courts.'),
    para(
      s('If you want to see all 22 before reading another word, the '),
      link('/gallery', 'gallery has them on one page'),
      s(
        '. Looking first is the sensible way in, because the pictures are what does the work.',
      ),
    ),

    h2('myths-and-facts', 'Myths and facts'),
    para(
      s(
        'Almost everything people believe about tarot arrives through films, and a film needs a fortune teller. Five corrections, and the first one makes the other four easier to see.',
      ),
    ),
    bullets(
      [
        strong('Myth: a reading tells you what will happen.'),
        s(
          ' It does not. A reading describes what is already in motion and where it is pointed if nothing changes. A good one ends in something you could do this week, not in a date you have to wait for.',
        ),
      ],
      [
        strong('Myth: some cards are good and some are bad.'),
        s(' None are. '),
        link('/arcana/death', 'Death'),
        s(
          ' is the card people flinch at, and it almost always means something that has finished and will not come back — a job, a habit, a version of yourself you have already walked out of. Read next to the cards around it, it is far more often a relief than a sentence.',
        ),
      ],
      [
        strong('Myth: you need a gift for it.'),
        s(
          ' You need attention and honesty. The person who finds this hardest is not the one without a gift; it is the one who already knows which answer they want before the card is turned over.',
        ),
      ],
      [
        strong('Myth: it requires believing something.'),
        s(
          ' It does not require believing anything at all. Some people use a deck as a spiritual practice and some use it the way they use a notebook, and the second group gets a great deal out of it. The section below is about why.',
        ),
      ],
      [
        strong('Myth: if the cards look bad, draw again.'),
        s(
          ' If a card can be cancelled, no reading ever meant anything. Re-drawing does not correct a spread; it is the politest available way of choosing your own answer and then calling it the deck’s.',
        ),
      ],
    ),
    para(
      strong('And the fact that goes missing most often:'),
      s(
        ' a card has no fixed meaning. The same picture can say "be patient" in one reading and "you are stalling" in the next. A list of card meanings is somewhere to start talking, not a dictionary to look things up in.',
      ),
    ),

    h2('what-its-for', 'What it is for'),
    para(
      s(
        'This is the question worth answering directly, because it is where tarot gets oversold. Three things a deck genuinely does, and then the honest limit on all three.',
      ),
    ),
    para(
      strong('It gives a name to something that has not got one.'),
      s(
        ' There is usually a feeling you have been carrying for weeks and have never said as a single sentence. A picture gives you a handle for saying it, and once a thing has a name it can be discussed — with yourself, or with the person it concerns.',
      ),
    ),
    para(
      strong('It forces you to state the question.'),
      s(
        ' Before you can draw, you have to decide what you are actually asking. That sounds trivial and it is frequently the whole of the value: half of it arrives before the first card turns over. This is also the one benefit that survives complete disbelief in the cards, which is why the sceptics section below is short.',
      ),
    ),
    para(
      strong('It puts a small distance between you and the subject.'),
      s(
        ' Talking about a picture on the table is easier than talking about yourself. People say things about their own lives while pointing at ',
      ),
      link('/arcana/the-empress', 'The Empress'),
      s(' that they would not say if you asked them outright. That much distance turns out to be enough.'),
    ),
    para(
      strong('And the limit:'),
      s(
        ' tarot is not a substitute for medical, legal or financial advice, and it never pretended to be. If a question has a findable answer — what your contract says, what the test showed, what is left on the loan — go and find it. A spread is allowed to change your mind; it is not allowed to replace it. There is also one courtesy that is not superstition: do not read for somebody who did not ask.',
      ),
    ),

    h2('how-it-works', 'Why a deck of pictures works at all'),
    para(
      s(
        'Here is the mechanism, with nothing supernatural in it, and it is worth understanding because it also tells you when a reading is going wrong.',
      ),
    ),
    para(
      s(
        'A picture is ambiguous on purpose. Handed an ambiguous image and a question you care about, you do not see nothing — you see the part of your own situation that fits. That is not a flaw in the method, it is the method: the card is an invitation to say a sentence you already had and had not said out loud. What the deck contributes is 22 different angles, arriving in an order you did not choose, so you cannot keep circling the one angle you are comfortable with.',
      ),
    ),
    para(
      s(
        'That also explains the failure mode. If you decide what a card means before you turn it over, the ambiguity is doing no work and you are simply reading yourself back to yourself. The discipline that prevents it is small and boring: say three things you can literally see in the picture — a colour, a posture, an object — before you say what it means.',
      ),
    ),
    h3('history', 'A note on where it came from'),
    para(
      s(
        'Cards like these appear in northern Italy in the middle of the fifteenth century, and at first they were not for reading at all: they were a court card game with one illustrated trump suit, still played in parts of Europe today under names descended from the Italian ',
      ),
      em('tarocchi'),
      s(
        '. Reading with them develops in France towards the end of the eighteenth century, and takes its modern form in England in the early twentieth, when one redrawn deck became so widely copied that most decks since quote its compositions. The claim that tarot comes from ancient Egypt was invented in the eighteenth century by somebody selling it. Five hundred years is long enough, and it has the advantage of being true.',
      ),
    ),

    h2('major-minor', 'Major and Minor Arcana'),
    para(
      s(
        'The difference is easiest to put like this: the Minors are about events, and the Majors are about what the events mean.',
      ),
    ),
    bullets(
      [
        strong('Minor Arcana'),
        s(
          ' — four suits, each with its own register: work and money, feeling, thought and speech, drive and nerve. They speak about countable, ordinary things. An invoice. A conversation. An offer.',
        ),
      ],
      [
        strong('Major Arcana'),
        s(
          ' — 22 cards belonging to no suit. They speak about chapters: something finishing, something starting, the nerve that finally arrives, the lie that finally surfaces. A spread full of Majors is usually not about this week; it is about this year.',
        ),
      ],
    ),
    para(
      s('We work with the 22 Majors only, and it is a considered choice. Twenty-two is few enough to learn one at a time over a few weeks — '),
      link('/arcana/the-star', 'The Star'),
      s(
        ' is a good one to read first, because it is the card most often needed and least often understood — and broad enough for nearly any question that actually keeps somebody awake.',
      ),
    ),

    h2('skeptics', 'If you do not believe in any of it'),
    para(
      s(
        'Then use it as a notebook with 22 pages and no index. Draw a card, describe it, and write down which part of your situation the description landed on. You have not committed to a claim about the world; you have committed to ten minutes of describing your own circumstances in language you did not choose, which is harder to do unaided than it sounds.',
      ),
    ),
    para(
      s(
        'What you should not do is split the difference — half-believing, half-hedging, treating a card as evidence when it flatters you and as a picture when it does not. That is the version that wastes your time. Pick either frame and be consistent inside it.',
      ),
    ),

    h2('first-steps', 'First steps, if you want to try'),
    para(
      s('There is nothing to buy and nothing to memorise before you begin.'),
    ),
    steps(
      [
        s('Look at the pictures. Open the '),
        link('/gallery', 'gallery of all 22'),
        s(' and stop at whichever card makes you want to keep looking.'),
      ],
      [
        s(
          'Read that card’s own page. Each one carries its upright and reversed meanings, its place in the sequence, and where the imagery comes from.',
        ),
      ],
      [
        s('Write one question that cannot be answered yes or no. '),
        link('/blog/how-to-read-tarot', 'The how-to guide'),
        s(' has a section on this with before-and-after examples.'),
      ],
      [
        s(
          'Draw three cards and finish talking about each one before you turn over the next.',
        ),
      ],
    ),
    h3('one-more-thing', 'One last thing'),
    para(
      s(
        'A first reading almost always feels like a let-down, and that is normal. Not because the cards were wrong, but because reading a picture is a trained skill, like reading music: at first you spell it out, and then one day you stop spelling. Give it a month at one card a day and look again.',
      ),
    ),
  ],
};
