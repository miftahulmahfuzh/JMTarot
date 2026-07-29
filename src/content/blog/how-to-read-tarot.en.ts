import { bullets, cardRef, em, h2, h3, link, para, s, steps, strong } from '../blocks';
import type { BlogDoc } from '../types';

/**
 * `how-to-read-tarot`, English. **AUTHORED, NOT TRANSLATED** (roadmap §8.2).
 *
 * Four things are deliberately different from `./how-to-read-tarot.id.ts`, and
 * `blog.content.test.ts` asserts three of them:
 *
 *   1. It opens on a SCENE — the posture a beginner takes in a first reading — where the
 *      Indonesian opens on a definition.
 *   2. It teaches the ONE-CARD DRAW FIRST (`#one-card`), and the three-card row second.
 *      The Indonesian goes straight to the three-card row after a preparation section.
 *   3. Its worked example is The Empress / The Tower reversed / Temperance. The
 *      Indonesian's is The Moon / The Chariot reversed / Wheel of Fortune. **No card is
 *      shared, and a test fails if one ever is** — the same enforcement the prompt
 *      layer's worked examples carry.
 *   4. It has a section the Indonesian does not: `#a-good-reading`. And the myth list
 *      corrects different myths — The Tower rather than Death, "never read for yourself"
 *      and "the cards decide" rather than the gifted-deck superstition.
 *
 * FORBIDDEN-VOCABULARY CHECK, and the English list is LONGER not shorter. No therapy or
 * diagnosis vocabulary; no generic-mystic tic — which for this article specifically means
 * **no `abundance` about The Empress and no `sacred` about anything**, the two words
 * English tarot writing reaches for first. No closing offer of further help. The word
 * `prompt` is avoided as an ordinary English verb too, because the product-secret lint
 * matches it as a substring and a lint that cries wolf is a lint somebody deletes.
 */
export const howToReadTarotEn: BlogDoc = {
  slug: 'how-to-read-tarot',
  locale: 'en',
  title: 'How to Read Tarot Cards: A Method You Can Use Tonight',
  description:
    "A practical beginner's method for reading tarot: the one-card draw, framing a question worth asking, the three-card row, reversals, and the mistakes to skip.",
  hero: { cardUrlSlug: 'the-high-priestess', alt: 'The High Priestess' },
  body: [
    h2('what-tarot-is', 'What tarot actually is'),
    para(
      s(
        'The first time somebody lays three cards in front of you, the instinct is to sit very still and wait to be told something. That instinct is why most first readings go nowhere. A deck is not a machine that returns a verdict — it is a set of pictures you are expected to talk about, out loud, badly at first.',
      ),
    ),
    para(
      s(
        'Mechanically it is simple. A full deck holds 78 cards: 56 Minor Arcana in four suits, and 22 Major Arcana that stand alone, running from The Fool at zero to The World at twenty-one. This guide uses the 22 Majors only. That is few enough to learn one at a time, and broad enough for almost any question that actually keeps somebody awake.',
      ),
    ),
    para(
      s(
        'What has kept the deck in use for five centuries is not accuracy. It is coverage. Between them those 22 pictures name most of the large things that happen to a person — falling in love, losing someone, the courage that arrives too late, the lie that finally surfaces, the change nobody asked for — and they name them in a form you can put a finger on.',
      ),
    ),
    para(
      s(
        'So reading is three moves, in this order: look at the picture, say what you see, then connect it to the question you brought. Memory is the easy part. The hard part is not flinching when the answer is one you already suspected. If you would rather start slower, ',
      ),
      link('/blog/what-tarot-is', 'what tarot is and what it is for'),
      s(' covers the ground underneath this article first.'),
    ),

    h2('myths-and-facts', 'Myths and facts'),
    para(
      s(
        'Most of what people believe about tarot comes from films, and a film needs a fortune teller. Six corrections, first one first.',
      ),
    ),
    bullets(
      [
        strong('Myth: a reading tells you what will happen.'),
        s(
          ' It does not. A reading describes what is already in motion and where it is pointed if nothing changes. That gap — between prediction and description — is what everything below is built on.',
        ),
      ],
      [
        strong('Myth: The Tower means catastrophe.'),
        s(
          ' The Tower means a structure coming down, and structures come down because they were built wrong. Read next to the cards on either side of it, it is far more often a relief than a sentence.',
        ),
      ],
      [
        strong('Myth: you must never read for yourself.'),
        s(
          ' Reading for yourself is harder than reading for a stranger, because you already know what you want the cards to say. It is also the only way to get good at this. Read for yourself constantly — just write the reading down before you decide what it meant.',
        ),
      ],
      [
        strong('Myth: a reversed card is a bad card.'),
        s(' A reversed card makes a different statement, not a worse one. See '),
        link('#reversals', 'reversals'),
        s(' below.'),
      ],
      [
        strong('Myth: the cards decide.'),
        s(
          ' They decide nothing, and a reader who suggests otherwise has handed you a reason to stop choosing. Treat a spread as an argument you are allowed to lose to, and allowed to win.',
        ),
      ],
      [
        strong('Myth: you have to learn all 78 before you can begin.'),
        s(' You can begin tonight with one card. Two sections down is how.'),
      ],
    ),
    para(
      strong('One rule that is not a myth:'),
      s(
        ' do not read for somebody who did not ask. An unrequested reading, delivered, is a way of making a person listen to your opinion of their life inside a wrapper that looks neutral.',
      ),
    ),

    h2('what-its-for', 'What it is good for'),
    para(s('Three things a deck does well, and one it should never be asked for.')),
    para(
      strong('It gives shape to something shapeless.'),
      s(
        ' There is usually a feeling you have not got round to naming. A picture gives you a handle for it, and once a thing has a name it can be discussed — with yourself, or with the person it concerns.',
      ),
    ),
    para(
      strong('It forces you to state the question in a full sentence.'),
      s(
        ' The most underrated effect on the list. Half the value arrives before the first card turns over, in the two minutes you spend working out what you are actually asking.',
      ),
    ),
    para(
      strong('It hands you words for something you already knew.'),
      s(
        ' Most readings that land are not delivering news. They name something you had been carrying unsaid, in language strange enough that you cannot go back to ignoring it.',
      ),
    ),
    para(
      strong('And what it is not for:'),
      s(
        ' any decision that ought to be made with numbers, documents, or advice from somebody qualified to give it. Tarot is not a substitute for medical, legal or financial advice and has never pretended to be. If a question has a findable answer, go and find it.',
      ),
    ),

    h2('one-card', 'Begin with one card a day'),
    para(
      s(
        'Before any spread at all, do this for a week. Shuffle, cut, draw one card, and look at it for a full minute before you look anything up. Say three things you can actually see — a colour, a posture, an object in the background. Only then reach for a meaning.',
      ),
    ),
    para(
      s(
        'In the evening write one line about how the day went. Do not try to make it match. After seven days you have seven pairs, and some of them will not connect at all — which is the useful part, because it teaches you the difference between a reading that landed and a reading you talked yourself into.',
      ),
    ),
    para(
      s(
        'This one exercise does more for a beginner than any spread, because it builds the only skill that matters underneath all of them: describing a picture before interpreting it.',
      ),
    ),

    h2('the-question', 'A question worth asking'),
    para(
      s(
        'A good question is open, specific, and about you. Three conditions, and the third is the one people break.',
      ),
    ),
    para(
      s(
        'Compare each pair below. The first form can only be answered yes or no, and a deck of pictures is a poor instrument for yes or no. The second can be answered with an image.',
      ),
    ),
    bullets(
      [
        em('"Will I get the job?"'),
        s(' becomes '),
        strong('"What am I bringing to this application that I have not noticed?"'),
      ],
      [
        em('"Does she still think about me?"'),
        s(' becomes '),
        strong('"What is still unfinished here, on my side?"'),
      ],
      [
        em('"Should I take the offer?"'),
        s(' becomes '),
        strong('"What does taking it cost me, and what does refusing it cost me?"'),
      ],
    ),
    para(
      s(
        'One question per reading. Three questions stacked into one three-card row force every card to answer three things at once, and the result always sounds clever and is never usable.',
      ),
    ),

    h2('three-card', 'The three-card row'),
    para(
      s(
        'Three cards in a line, read left to right. It is the first spread worth learning and, for a lot of readers, the last one they ever need. Decide the positions before you draw — assigning meaning to a position after seeing the card is the most polite way to read what you were hoping for.',
      ),
    ),
    steps(
      [
        strong('What has passed.'),
        s(' The one cause still making itself felt. Not a full history.'),
      ],
      [
        strong('What is underway.'),
        s(' Today, including the part you have been avoiding naming.'),
      ],
      [
        strong('What waits ahead.'),
        s(' Where this is headed if nothing changes. Not a forecast — a continuation.'),
      ],
    ),
    h3('worked-example', 'A worked example'),
    para(
      s('The question: '),
      em('"What should I know about the move I keep postponing?"'),
      s(' The cards, in order: The Empress, The Tower reversed, Temperance.'),
    ),
    cardRef(
      'temperance',
      'Temperance in the third position: the slow answer, not the dramatic one.',
    ),
    para(
      s(
        'The Empress first. Something in the present arrangement is genuinely good for you — comfort, ease, a place that has been kind. That is what brought you to this point, and it is also why you keep postponing: there is something real to lose.',
      ),
    ),
    para(
      s(
        'The Tower reversed in the middle. Upright, The Tower is a structure coming down. Reversed, it is a structure that has not come down yet and is being held up. Notice that this answers the first card: the comfort is being maintained by effort you have stopped counting.',
      ),
    ),
    para(
      s(
        'Temperance in the third position. Not a dramatic exit, and not staying forever: a measured, unglamorous, gradual move — a lease not renewed rather than a door slammed. Temperance is the least cinematic card in the deck and it is very often the honest one.',
      ),
    ),
    para(
      strong('Strung together:'),
      s(
        ' you are holding up something comfortable that has already begun to fail, and the way out of it is gradual rather than sudden.',
      ),
    ),
    para(
      s('Notice what the reading does '),
      em('not'),
      s(
        ' do. It names no month, no city and no outcome. It ends in something you could start this week, and a reading that ends in an action you can take is a reading doing its job.',
      ),
    ),

    h2('reversals', 'Reversals'),
    para(
      s(
        'A card that comes out upside down is not the opposite of that card, and it is not bad news. It makes a different statement.',
      ),
    ),
    para(
      s(
        'The Hermit upright is a chosen withdrawal — stepping back far enough to see clearly. The Hermit reversed is very rarely "stop withdrawing". More often it is a withdrawal that stopped being a choice some time ago and became a habit. Same picture, different angle, different sentence.',
      ),
    ),
    para(
      s(
        'If you are new, read every card upright for the first couple of months. Add reversals once you know all 22 the right way up, because a reversal asks you to know what is being inverted before you can say anything about the inversion.',
      ),
    ),

    h2('stringing', 'Reading the row as one sentence'),
    para(s('This is what separates reading cards from reciting meanings. Three habits.')),
    bullets(
      [
        strong('Say the row as one sentence.'),
        s(
          ' If you cannot get all three cards into a single sentence that makes sense, you have not read the spread — you have read three cards that happen to be adjacent.',
        ),
      ],
      [
        strong('Notice repetition.'),
        s(
          ' Two fire cards in a row raise the temperature of the whole reading. Two cards from the early part of the sequence say the problem is younger than you assumed. Repetition is emphasis.',
        ),
      ],
      [
        strong('Notice what is missing.'),
        s(
          ' A money question answered by three cards that are all about other people has already answered you, and the answer is that the problem is not money.',
        ),
      ],
    ),

    h2('a-good-reading', 'What a good reading feels like'),
    para(s('Worth naming, because the counterfeit is common and convincing.')),
    para(
      s(
        'A good reading is slightly uncomfortable and completely specific. It says one thing you did not want to write down. It ends somewhere you could act. It survives being read back a week later.',
      ),
    ),
    para(
      s(
        'A bad reading is flattering, general, and impossible to be wrong about. It could be about anybody. It predicts something far enough away that nobody will check. If your reading could be pasted into somebody else’s notebook without changing a word, start again — and that is the real argument for keeping a notebook, because a week later you can tell which kind you wrote.',
      ),
    ),

    h2('mistakes', 'The mistakes almost everybody makes first'),
    steps(
      [
        strong('Re-drawing until you like the answer.'),
        s(
          ' If the third card can be cancelled, no reading ever meant anything. Close the spread and walk away from it.',
        ),
      ],
      [
        strong('Asking the same thing twice in one day.'),
        s(
          ' The same question on the same day gets the same answer in different pictures. What changed is your patience, not your situation.',
        ),
      ],
      [
        strong('Deciding what a card means before turning it over.'),
        s(' The hardest mistake to catch, because it feels like fluency.'),
      ],
      [
        strong('Reading for somebody who did not ask.'),
        s(' Said above. Said twice on purpose.'),
      ],
      [
        strong('Learning the list and stopping looking at the picture.'),
        s(' The picture is doing the work. The list only helps you start talking.'),
      ],
    ),

    h2('practice', 'How to get better'),
    para(
      s(
        'One card a day, a notebook, and the 22 Majors one at a time. That is the entire curriculum, and it takes about a month before something clicks.',
      ),
    ),
    para(
      s('One addition worth the trouble: when a reading lands hard, write down '),
      em('why'),
      s(
        ' — which detail, in which picture, did it. That note is worth more than a chapter of card meanings, because it is what that card means to you, in your handwriting, with a date on it.',
      ),
    ),

    h2('next', 'Where to go next'),
    para(
      s('Start with the pictures. The '),
      link('/gallery', 'Major Arcana gallery'),
      s(' has all 22 on one page, and every card has a page of its own: '),
      link('/arcana/the-fool', 'The Fool'),
      s(' for where the sequence begins, '),
      link('/arcana/the-tower', 'The Tower'),
      s(' for the card this article defends, '),
      link('/arcana/temperance', 'Temperance'),
      s(' for the least dramatic and most useful card in the deck, and '),
      link('/arcana/the-hermit', 'The Hermit'),
      s(' for the one about knowing when to step back.'),
    ),
    para(
      s('Or draw three cards now, with a question shaped the way the '),
      link('#the-question', 'question section'),
      s(' describes.'),
    ),
  ],
};
