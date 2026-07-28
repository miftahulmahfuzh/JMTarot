/**
 * The English message catalog.
 *
 * TYPED FROM `id.ts`, NOT PARALLEL TO IT (I2). `Catalog` is
 * `Record<MessageKey, string>`, so a missing key is TS2739/TS2740 and an extra
 * one is TS2353, both naming the key at `npm run typecheck`. Write the
 * Indonesian first, always; the red typecheck is then the checklist.
 *
 * **THIS IS WRITTEN, NOT TRANSLATED.** D7 and roadmap §10 make that a hard
 * requirement for the reader personas and a strong preference everywhere else,
 * and the onboarding copy is where it matters most after the personas: those six
 * questions are the spookiest copy in the product, and a machine translation of
 * "the most terrible thing you have witnessed" reads like a form. There is a test
 * asserting no English value is byte-identical to its Indonesian counterpart,
 * with a short allowlist of the ones that are the same on purpose (the brand, the
 * `Major Arcana` eyebrow, the language names, and the placeholder-only values).
 * It exists to catch the commonest real failure: a key pasted in with its
 * Indonesian value to make the typecheck go green, intending to come back to it.
 * Nobody comes back.
 *
 * SPELLING IS BRITISH, because I7 fixes `en -> en-GB` for `Intl`: `colour`, not
 * `color`. Nothing depends on it, but one file disagreeing with itself about
 * `colour` is the kind of thing a reader notices and cannot name. Note that the
 * message KEY is still `onboarding.q.color.*` — the key is a machine token that
 * matches `onboarding_answers.question_key` in the database, and renaming it to
 * match the prose would rename a column value.
 *
 * WHERE ENGLISH IS SHORTER, AND WHY THAT IS A PROBLEM RATHER THAN A RELIEF:
 * `Pertanyaan (boleh dikosongkan)` (30 chars) becomes `Question (optional)` (19),
 * but `Kocok ulang` (11) becomes `Shuffle again` (13) and `Untuk hiburan
 * semata.` (21) becomes `For entertainment only.` (23). The direction is not
 * predictable, so the layout is measured rather than reasoned about — Task 12's
 * Vitest length budget covers every key that sits in a `nowrap` or fixed-width
 * box.
 */
import type { Catalog } from './id';

const en: Catalog = {
  // --- Brand and metadata -------------------------------------------------
  'app.title': 'JMTarot',
  'meta.description': 'Major Arcana tarot readings with three readers.',

  // --- Shared ---------------------------------------------------------------
  'common.majorArcana': 'Major Arcana',
  'common.disclaimer.short': 'For entertainment only.',
  'common.disclaimer.long':
    'This reading is for entertainment only. It is not medical, legal or financial advice.',
  'common.retry': 'Try again',
  'common.close': 'Close',
  'common.terms': 'Terms & Conditions',
  'common.privacy': 'Privacy Policy',

  // --- Navigation -----------------------------------------------------------
  'nav.back.readers': '← Other readers',
  'nav.back.reader': '← {name}',

  // --- Reader picker --------------------------------------------------------
  'picker.reader.hint': 'Choose the reader who suits you.',
  'picker.reader.portraitAlt': '{name}, {title}',
  'picker.reader.bio.a11yLabel': 'About {name}',

  // --- Service picker -------------------------------------------------------
  'picker.service.eyebrow': 'Choose a reading',
  'picker.service.cardCount.one': '{count} card',
  'picker.service.cardCount.other': '{count} cards',

  // --- Draw screen ----------------------------------------------------------
  'draw.hint.complete': 'Your cards are out. Tap one to see it properly.',
  /*
   * `.single` / `.many` rather than `.one` / `.other`, because Indonesian spells
   * the one out and CLDR cannot express that. English gets the article for free
   * out of the same split: "Tap a card", not "Tap 1 card".
   */
  'draw.hint.tap.single': 'Tap a card, or drag it upward.',
  'draw.hint.tap.many': 'Tap {count} cards, or drag them upward.',
  'draw.question.label': 'Question (optional)',
  'draw.question.placeholder': 'Anything you want to ask?',
  'draw.counter.one': '{picked} / {total} card',
  'draw.counter.other': '{picked} / {total} cards',
  'draw.reset': 'Shuffle again',
  'draw.card.aria.picked': 'Card {slot}: {name}, tap to see it',
  'draw.card.aria.take': 'Take a card',

  // --- Card detail ----------------------------------------------------------
  'card.reversed': 'Reversed',
  /*
   * `Put it back`, not `Put it back in the deck`. The longer version was 23 characters
   * against `Kembalikan ke dek`'s 17 and failed the length budget -- it is a BUTTON,
   * sitting beside Close in the card detail overlay, and 23 characters of Cinzel with
   * button tracking is a two-line button on a 375px screen. "in the deck" is also the
   * only place it could go: you are looking at a card you drew, from a deck that is on
   * the same screen.
   */
  'card.return': 'Put it back',
  'card.alt.upright': '{name}',
  'card.alt.reversed': '{name}, reversed',

  // --- The reading ----------------------------------------------------------
  //
  // Ten seconds of waiting, sometimes twelve. "Loading…" does not hold that.
  'reading.waiting': 'Reading the cards…',
  'reading.error.rateLimit': 'Too many readings. Try again later.',
  'reading.error.start': 'The reading could not start. Try again.',
  'reading.error.network': 'The connection dropped. Try again.',
  'reading.error.badRequest': 'That request was not valid.',
  'reading.error.cardCount.one': 'This reading needs {count} card.',
  'reading.error.cardCount.other': 'This reading needs {count} cards.',
  'reading.error.duplicateCard': 'The same card cannot come up twice.',
  // The leading `\n\n` and the brackets are load-bearing. See `id.ts`.
  'reading.error.midStream': '\n\n[The reading was interrupted. Try again in a moment.]',

  /*
   * --- The moderation refusal (W7) ----------------------------------------
   * NATIVELY WRITTEN, NOT TRANSLATED. See `id.ts` for the two-documents rule and
   * for why the app speaks here rather than a reader.
   */
  'moderation.blocked.generic.title': 'The cards stay closed for this one.',
  'moderation.blocked.generic.lead': 'Questions like this sit outside what we will read, under our',
  'moderation.blocked.generic.tail': 'You are welcome to ask something else.',

  'moderation.blocked.selfHarm.lead':
    'If you are thinking about hurting yourself, please talk to a person tonight, not to a deck of cards.',
  'moderation.blocked.selfHarm.resourcesLabel': 'Someone to talk to',
  'moderation.blocked.selfHarm.emergency':
    'If someone is in immediate danger, contact your local emergency number.',
  'moderation.blocked.selfHarm.closing':
    'We will not turn cards on this question. Not because the question is wrong, but because the answer you need must not come from a guess. Our terms explain why:',

  // --- The legal documents (W7). Chrome only; see `id.ts` and I15. ----------
  'legal.back': 'Back',
  'legal.effective': 'In effect from version {version}.',

  // --- Sign in --------------------------------------------------------------
  'login.tagline': 'Three readers, twenty-two Major Arcana, one reading for today.',
  'login.google': 'Sign in with Google',
  'login.legal.lead': 'By signing in you agree to the',
  'login.legal.and': 'and the',
  'login.disclaimer': 'For entertainment. Not medical, legal or financial advice.',
  'login.error.accessDenied':
    'That account cannot be used to sign in. Try a different Google account.',
  'login.error.generic': 'Cannot sign in just now. Try again in a moment.',

  // --- Error pages ----------------------------------------------------------
  'error.notFound.title': 'That page is not here.',
  'error.notFound.body': 'The link may be wrong, or the page may have moved.',
  'error.notFound.action': 'Back to the readers',
  'error.crash.title': 'Something went wrong.',
  'error.crash.body': 'Not your fault. Try loading this page again.',
  'error.crash.action': 'Reload',

  // --- The language switcher ------------------------------------------------
  //
  // Each language named in its own language, in both catalogs. Identical on
  // purpose and allowlisted.
  'locale.name.id': 'Indonesia',
  'locale.name.en': 'English',
  'locale.switch.aria': 'Change language',

  // ==========================================================================
  // W3 — onboarding.
  //
  // WRITTEN, NOT TRANSLATED, and the rules from `id.ts` bind here identically:
  // no mechanism, no "we", short lines, and permission to refuse arriving
  // before the first question rather than after the last. The register is the
  // readers' own — Margaret's patience without her subordinate clauses, since
  // this copy is in no single reader's voice.
  //
  // `onboarding.lotusName` is the one key here that is fixed rather than
  // written: it is a proper noun, and W3's file named it in advance.
  // ==========================================================================
  'onboarding.lotusName': 'Inner Heavenly Lotus',

  'onboarding.intro.eyebrow': 'INNER HEAVENLY LOTUS',
  'onboarding.intro.title': 'Before the first card',
  /*
   * Same trick as the Indonesian: it says what the Lotus does and never what it
   * is. "the cards read its shape to know which way to fall" gives the
   * mechanism a shape without admitting there is one.
   */
  'onboarding.intro.body':
    'Some say every person grows a lotus in the sky inside them, and that the ' +
    'cards read its shape to know which way to fall.\n\n' +
    'Nine questions. Three about who you are, six about what you have already ' +
    'come through. You are only asked once.',
  'onboarding.intro.note':
    'There are no right answers here and no wrong ones. Any question can be ' +
    'left alone, and your reading stays whole.',
  'onboarding.intro.cta': 'Begin',

  'onboarding.facts.title': 'Who you are',
  'onboarding.facts.fullName.label': 'Full name',
  'onboarding.facts.fullName.hint': 'The name you were given.',
  'onboarding.facts.nickname.label': 'What you are called',
  'onboarding.facts.nickname.hint':
    'The name you go by day to day. This is the one your reader will use.',
  'onboarding.facts.birthDate.label': 'Date of birth',
  // Still promises nothing. The birth card is still deferred.
  'onboarding.facts.birthDate.hint': 'The day you arrived in the world.',

  'onboarding.q.best_thing.title': 'The best thing that has ever been in your life',
  'onboarding.q.best_thing.framing':
    'Everyone keeps one bright point. Your reader wants to know where yours sits.',
  'onboarding.q.best_thing.hint':
    'It can be a thing, or a person, or one meeting, one journey, one book.',

  /*
   * THE ENUMERATED EXAMPLES ARE ABSENT IN ENGLISH TOO, and that is the whole
   * point of writing this rather than translating it — an English list of
   * extremes would be just as much a menu, and just as ghoulish. See `id.ts`.
   *
   * "watched happen" and not "experienced": the question is about what you saw,
   * which is answerable, rather than about what happened to you, which on a
   * phone in an entertainment app is not a question anyone should be asked.
   */
  'onboarding.q.worst_thing.title': 'The heaviest thing you have watched happen',
  'onboarding.q.worst_thing.framing':
    'The dark shapes a person too. But you do not have to tell it here.',
  'onboarding.q.worst_thing.hint':
    'As little or as much as you want. This answer is kept locked, is never ' +
    'shown again, and is never quoted inside your reading. Leaving it takes ' +
    'nothing away.',

  'onboarding.q.most_loved.title': 'The person you love most in this life',
  'onboarding.q.most_loved.framing':
    'Every reading has one person standing behind it, even when their name is ' +
    'never said.',
  'onboarding.q.most_loved.hint':
    'Just say who they are to you. Their name will never appear in a reading.',

  'onboarding.q.introversion.title': 'Where do you stand?',
  'onboarding.q.introversion.framing':
    'Nobody is entirely on their own, and nobody is entirely in the crowd.',
  'onboarding.q.introversion.hint': 'Slide to where you spend most of your time.',
  'onboarding.q.introversion.left': 'On my own',
  'onboarding.q.introversion.right': 'Among people',

  'onboarding.q.color.title': 'Choose one colour',
  'onboarding.q.color.framing': 'Black, white, grey.',
  'onboarding.q.color.hint':
    'Do not think it over. The first one that pulls you is the answer.',
  'onboarding.q.color.option.black': 'Black',
  'onboarding.q.color.option.white': 'White',
  'onboarding.q.color.option.grey': 'Grey',

  /*
   * Kept as a story, the way it arrived. Still the right last question: it
   * points forward, which is where you want someone facing when they walk into
   * a reading.
   */
  'onboarding.q.willow_wish.title': 'One request',
  'onboarding.q.willow_wish.framing':
    'A stranger holds out a willow branch. Break it, they say, and ask for one ' +
    'thing as you do, and that thing will happen.',
  'onboarding.q.willow_wish.hint': 'What do you ask for?',

  // "That is enough." is true whenever it is read, which is the requirement.
  // No spinner, no "being woven", no progress claim.
  'onboarding.done.title': 'That is enough.',
  'onboarding.done.body':
    'What you wrote will not be shown back to you anywhere. It only sits behind ' +
    'your reader.',
  'onboarding.done.cta': 'Choose your reader',

  'onboarding.actions.next': 'Continue',
  'onboarding.actions.back': 'Back',
  'onboarding.actions.skip': 'Leave this one',
  'onboarding.actions.finish': 'Done',
  'onboarding.progress': '{n} / {total}',

  'onboarding.answerSaved':
    'Your answer is saved. If you write again, the new one takes its place.',

  'onboarding.error.saveFailed': 'Not saved yet. Try again.',
  'onboarding.error.required': 'This one is still empty.',
  'onboarding.error.tooLong': 'Too long. Trim it a little.',
  'onboarding.error.rateLimit': 'Too many requests. Try again later.',
  'onboarding.error.badRequest': 'That request was not valid.',
  'onboarding.error.notFound': 'There is no such answer.',

  // `SessionRepair.tsx`. Says nothing about a lotus, nothing about progress and
  // nothing about what went wrong -- see `id.ts`.
  'onboarding.session.repairing': 'One moment…',
  'onboarding.session.repairFailed': 'The session did not refresh.',

  // ==========================================================================
  // W5 — memory and engagement. Migrated from `src/lib/memory/copy.ts`, where
  // the English was already written for exactly this move.
  //
  // THE WINDOW PHRASES GO INTO THE FREQUENCY PROMPT as well as onto the screen.
  // Editing one edits a prompt.
  // ==========================================================================
  'memory.summary.a11yLabel': 'What {reader} remembers about today',
  'memory.frequency.a11yLabel': 'The pattern in your recent cards',

  'memory.frequency.windows.week': 'This week',
  'memory.frequency.windows.d3': 'The last three days',
  'memory.frequency.windows.d13': 'The last thirteen days',
  'memory.frequency.windows.d666': 'The last 666 days',
  'memory.frequency.windows.month': 'This month',
  'memory.frequency.windows.quarter': 'This quarter',
  'memory.frequency.windows.year': 'This year',
  'memory.frequency.windows.birthday': 'Since your last birthday',

  // ==========================================================================
  // V4 — the account shell. See id.ts for why "About you" and not "User
  // details", and why the sign-out row is one word.
  // ==========================================================================
  'account.button.aria': 'Open account menu',
  'account.menu.title': 'Account',
  'account.menu.details': 'About you',
  'account.menu.language': 'Language',
  'account.menu.history': 'Reading history',
  'account.menu.signOut': 'Sign out',

  'locale.code.id': 'ID',
  'locale.code.en': 'EN',
};

export default en;
