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

  // The readers' pronouns. See id.ts for the ruling, the split between data and
  // copy, and the "Thessaly refers to herself as they" bug this closes. THIS is the
  // locale the pair exists for: Indonesian renders `dia` for both.
  'reader.pronoun.female': 'she',
  'reader.pronoun.male': 'he',

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
  'card.upright': 'Upright',
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

  'moderation.blocked.dismiss': 'Dismiss this notice',

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

  /* The overlay page. See `id.ts`: the first version instructed a `Done` button
     that measurably is not there, so the link we own is the primary control and
     the OS button is a hedged hint. */
  'handoff.ready.title': 'You are signed in.',
  'handoff.return': 'Return to JMTarot',
  'handoff.ready.hint': 'If there is a Done button at the top of the screen, that works too.',
  'handoff.stale.body': 'This link has expired. Go back to JMTarot and try signing in again.',

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
  /*
   * **AMENDED 2026-08-07 FOR v0.7.0's GROUP CHAT** (`C-D8`, `[R14]`). The Indonesian
   * catalog carries the full account; the short version is that this string promised
   * the opposite of what the chat does, **while the querent was typing the answer**,
   * and nobody re-reads `/privacy` but everybody reads this.
   *
   * REWRITTEN, NOT TRANSLATED, per this project's rule for the English half — but the
   * three facts it must carry are the same three: locked at rest, abstracted in a
   * reading, verbatim in the room.
   */
  'onboarding.q.worst_thing.hint':
    'As little or as much as you want. This answer is kept locked and is never shown ' +
    'back to you. A reading uses only an abstract summary of it; in the group chat, ' +
    'the readers see it as you wrote it. Leaving it takes nothing away.',

  'onboarding.q.most_loved.title': 'The person you love most in this life',
  'onboarding.q.most_loved.framing':
    'Every reading has one person standing behind it, even when their name is ' +
    'never said.',
  /** **AMENDED 2026-08-07** (`C-D8`, `[R14]`). See the Indonesian catalog. */
  'onboarding.q.most_loved.hint':
    'Just say who they are to you. Their name will never appear in a reading, and ' +
    'the readers will not use it in the chat.',

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
  /* Written, not translated: `Galeri kartu` is "the card gallery" and this is the
     phrase an English reader expects for the same destination. */
  'account.menu.gallery': 'Card gallery',
  'account.menu.blog': 'Writing',
  'account.menu.signOut': 'Sign out',

  /*
   * v0.7.0. **F1 OWNS THIS COPY; F4 OWNS THE SURFACE** (`[R14]`). The Indonesian
   * catalog carries the full account of why the room says this rather than a modal
   * asking you to agree to it. REWRITTEN, not translated.
   */
  /*
   * AMENDED FOR R2. The Indonesian catalog carries the full account, including why
   * this is the load-bearing half of the pair and why it is still a notice rather
   * than a consent modal. It read: *"In this room the three readers can see your
   * opening answers, your readings, and this conversation — so they answer you
   * rather than anybody."*
   */
  'chat.first_open.notice':
    'In this room the three readers can see your opening answers, your readings and ' +
    'this conversation. They also keep notes about you — you can read and delete ' +
    'those on the About You page.',
  'chat.first_open.link': 'What that means',

  /*
   * v0.7.0 / F6 — the attachment. WRITTEN, not translated; `id.ts` carries the full
   * account of each choice.
   *
   * `Discuss in the group` and not `Ask the group`, for `Bahas`'s reason: an
   * attachment with no text is a normal move, and `Ask` would make it read as a slip.
   *
   * `In Indonesian` / `In English` rather than the bare language name: the chip sits
   * inside an English card describing two foreign lines, and the preposition is what
   * makes it a label rather than a heading.
   */
  'chat.attach.action': 'Discuss in the group',
  'chat.attach.hint': 'Send this reading to Thessaly, Margaret and Adrian.',
  'chat.attach.staged': 'Reading attached',
  'chat.attach.remove': 'Remove attachment',
  'chat.attachment.open': 'Open the reading',
  'chat.attachment.language.id': 'In Indonesian',
  'chat.attachment.language.en': 'In English',
  'chat.attachment.gone': 'That reading is gone.',

  /*
   * v0.7.0 / F4 — the room. **REWRITTEN, NOT TRANSLATED**, and `id.ts` carries the
   * argument for every one of these.
   *
   * The register question is the same one and the answer is different: Indonesian
   * says `Grup` because that is what people call the thing, and English says
   * `The group` for the same reason — `Chat` names a medium, `The group` names the
   * people in it, and this room is three people.
   *
   * `typing…` rather than `is writing a message`: the first is what every messenger
   * on the platform says and is therefore invisible; the aria string spells it out
   * because a screen reader reads it once, out of context.
   *
   * The English tic list binds this block. No `let me know if…`, no `dear one`, no
   * `your journey` — and note that the empty state deliberately does not offer help:
   * *"Say hi"* is an instruction, not a closing offer.
   */
  'chat.title': 'The group',
  /* `chat.hint` is deleted — see `id.ts`, which carries the reason. */
  'chat.back': '← Home',
  'chat.list.aria': 'Group conversation',

  'chat.button.aria': 'Open the group',
  'chat.button.aria.unread.one': 'Open the group, {count} new message',
  'chat.button.aria.unread.other': 'Open the group, {count} new messages',

  'chat.composer.label': 'Write a message',
  'chat.composer.placeholder': 'Say something…',
  'chat.composer.send': 'Send',
  'chat.composer.sending': 'Sending…',
  'chat.composer.closed': 'The group is closed for a moment. Everything already said is still here.',

  'chat.reply.action': 'Reply',
  'chat.reply.cancel': 'Cancel reply',
  'chat.reply.you': 'you',

  'chat.typing.reader': '{name} is typing…',
  'chat.typing.aria': '{name} is writing a message',

  'chat.newMessages': 'New messages ↓',

  'chat.older': 'Load older',
  'chat.older.loading': 'Loading…',

  'chat.error.load': 'The conversation will not open right now. Try again in a moment.',
  'chat.error.send': 'That message has not been sent.',
  'chat.error.rateLimit': 'Too many messages at once. Give it a moment.',
  'chat.error.retry': 'Send again',
  'chat.offline': 'You are offline. That message has not been sent.',

  'chat.empty.title': 'Nobody has said anything here yet.',
  /* Names the three since 2026-08-09, taking over from the deleted `chat.hint` —
     `id.ts` carries the reason. */
  'chat.empty.body': 'Say hi. Thessaly, Margaret and Adrian will answer.',

  'chat.day.today': 'Today',
  'chat.day.yesterday': 'Yesterday',

  'locale.code.id': 'ID',
  'locale.code.en': 'EN',

  // ==========================================================================
  // V6 — history. See id.ts for why the Indonesian word is `Jejak` and not
  // `Riwayat`, and for why this block carries empty-state copy when W5's does
  // not.
  //
  // `history.count.one` and `.other` DIFFER HERE and are identical in id.ts.
  // That is the case `Intl.PluralRules` actually exists for, unlike
  // `draw.hint.tap`: English inflects the noun and CLDR gives `id` only
  // `other`, so the Indonesian pair must match and a test asserts it.
  // ==========================================================================
  'history.title': 'History',
  'history.hint': 'Every reading you have taken.',
  'history.home': '← Home',

  'history.filter.aria': 'Choose a day',
  'history.filter.label': 'Date',
  'history.filter.today': 'Today',

  'history.count.one': '{count} reading',
  'history.count.other': '{count} readings',

  'history.empty.day': 'Nothing was read on {date}.',
  'history.empty.nearest': 'Go to {date}',
  'history.empty.never.title': 'Nothing here yet.',
  'history.empty.never.body': 'Every reading you take is kept on this page, cards and all.',
  'history.empty.never.action': 'Take the first one',

  'history.error': 'Your history will not open just now. Try again in a moment.',

  // The second sentence is the whole of the list's retry hint (2026-08-28), and a
  // string rather than a control -- see id.ts for why the row cannot hold a button.
  'history.item.unfinished': 'This reading did not finish. Open it to try again.',
  'history.item.shared': 'Shared',
  // See id.ts for why this copy names the share link and refuses both
  // "permanent" and any promise of a restore.
  //
  // `Keep it`, NOT `Cancel` — `account.delete.cancel`'s ruling: on a
  // destructive sheet the safe button says what it DOES.
  'history.item.delete.aria': 'Delete this reading',
  'history.item.delete.heading': 'Deleting this reading',
  'history.item.delete.body1':
    'This reading goes from your history — the cards, your question and the text. Any link you shared for it stops working too.',
  'history.item.delete.body2': 'There is no way to bring it back from here.',
  'history.item.delete.cancel': 'Keep it',
  'history.item.delete.confirm': 'Yes, delete this reading',
  'history.item.delete.working': 'Deleting…',
  'history.item.delete.failed': 'That did not go through. Try again in a moment.',

  'history.detail.back': '← History',
  'history.detail.question': 'What you asked',
  'history.detail.noBody': 'No text was kept for this reading.',
  'history.translating': 'Translating…',

  // ── The refill (2026-08-28) ───────────────────────────────────────────────
  //
  // NOT `common.retry`. That one sits under an error and means "send that request
  // again"; this sits under a reading that never arrived. See id.ts.
  'history.retry.action': 'Try again',
  'history.retry.hint': 'The cards stay as they were. Only the text is written again.',
  'history.retry.waiting': 'Writing the reading…',
  'history.retry.otherLanguage':
    'This came back in the language the reading was written in. Open the page again to see it translated.',
  // TERMINAL: the button is gone by the time this renders, so it must not say
  // "try again". See id.ts for why it does not say which cause it was.
  'history.retry.stale': 'This reading can no longer be retried. Reload the page.',


  // ── Sharing (V7) ──────────────────────────────────────────────────────────
  'share.action': 'Share',
  'share.sheet.title': 'Share this reading',
  'share.sheet.titlePersona': 'Share your Inner Lotus',
  'share.sheet.lead':
    'Anyone with the link can open this page. This is exactly what they will see.',
  'share.sheet.questionIncluded':
    'Your question is shown too, so whoever reads this knows what it was about.',
  'share.sheet.includeNickname': 'Include my nickname',
  'share.sheet.includeNickname.hint': 'Shown as "A reading for {nickname}".',
  'share.sheet.create': 'Create link',
  'share.sheet.creating': 'Creating link…',
  'share.sheet.cancel': 'Cancel',
  'share.sheet.close': 'Close',
  'share.sheet.copy': 'Copy link',
  'share.sheet.copied': 'Copied',
  // "ALL", since 2026-07-28 -- revoke turns off every language's address at once, and
  // this button sits under a list. Entity-neutral, because the sheet also mounts with
  // `entity="persona"`. See `id.ts` for the ruling.
  'share.sheet.revoke': 'Turn all links off',
  'share.sheet.revoking': 'Turning it off…',
  // "That link" stays singular and is still correct: this is the state after a revoke,
  // and the sentence is about the address the querent was just looking at. What
  // "sharing again" mints is a new address FOR THAT LANGUAGE.
  'share.sheet.revoked': 'That link is dead. Sharing again mints a new address.',
  'share.sheet.live': 'This link is live.',
  'share.sheet.links': 'Live links',
  /*
   * **"IN {language}" AND NOT "A {language} LINK", BECAUSE THE ARTICLE CANNOT BE
   * INTERPOLATED.** The first version read `Create a {language} link` and rendered
   * "CREATE A ENGLISH LINK" — found by loop 5 at 390px, and invisible to every test
   * in the suite, because the string and the parameter are both individually
   * correct. Any phrasing where a language name follows an indefinite article is a
   * coin flip on the name's first letter, so the fix is to have no article near it
   * rather than to special-case the vowel.
   *
   * The Indonesian counterpart never had the problem: `Buat tautan {language}` needs
   * no article at all, which is why it is not phrased the same way. Do not "align"
   * them.
   */
  'share.sheet.createIn': 'Create a link in {language}',
  'share.sheet.loading': 'Checking for links…',
  'share.sheet.warning':
    'Turning a link off does not un-send a screenshot somebody already took.',
  'share.error.notShareable': 'This reading cannot be shared.',
  'share.error.generic': 'The link could not be created. Try again.',
  'share.error.rateLimit': 'Too many links in one hour. Try again later.',
  'share.public.eyebrow': 'A shared reading',
  'share.public.personaEyebrow': 'A shared Inner Lotus',
  'share.public.forNickname': 'A reading for {nickname}',
  'share.public.readBy': 'Read by {name}',
  'share.public.questionLabel': 'The question',
  // `share.public.otherLanguage` was here and is deleted; see id.ts for why.
  'share.public.cta': 'Try it yourself',
  'share.public.ctaLead': 'Three readers, twenty-two Major Arcana cards.',
  'share.gone.title': 'This link does not exist',
  'share.gone.body':
    'It may have been turned off by whoever made it, or the address may be mistyped.',
  'share.gone.action': 'Open JMTarot',
  'share.busy.title': 'Too many requests',
  'share.busy.body': 'Wait a moment, then reload this page.',

  // V8 — `/account`. See id.ts for why the two generated-looking lines are
  // templates and where `{topic}` comes from.
  'account.title': 'About You',
  'account.hint': 'The numbers, the signs, and the card that keeps coming back.',

  'account.facts.heading': 'Facts',
  /*
   * "Nickname", and this REVERSES a decision recorded right here.
   *
   * It said: *"What you are called" rather than "Nickname": the questionnaire asked
   * what the reader should call them, not for a handle.* That reading of the register
   * was right and it lost to a measurement — `.label` in `AccountFacts.module.css` is
   * `text-transform: uppercase`, so five words became `WHAT YOU ARE CALLED` and took
   * TWO ROWS on Miftah's phone, beside a one-word value. A label that wraps where the
   * two rows either side of it do not reads as a layout bug, and the nuance it was
   * buying is not visible to anybody who never saw the other version.
   *
   * The Indonesian stays `Nama panggilan` — two words, one row, and it never had the
   * problem.
   */
  'account.facts.nickname': 'Nickname',
  'account.facts.fullName': 'Full name',
  'account.facts.birthDate': 'Date of birth',
  'account.facts.edit': 'Change',
  'account.facts.save': 'Save',
  'account.facts.cancel': 'Cancel',
  'account.facts.saving': 'Saving…',
  'account.facts.failed': 'That did not save. Try again in a moment.',
  'account.facts.invalid': 'Check what you entered.',

  'account.card.heading': 'Your card',
  'account.card.line':
    'Your Inner Lotus takes the form of {card}. It has come back to you again and again, and what it carries is {gloss}',
  'account.card.empty': 'No card has repeated itself for you yet. Draw a few more times.',
  // Says what tapping does, not what the image is; see id.ts.
  'account.card.zoomAria': 'See {name} larger',

  // `{Subject}`/`{subject}` replaced a second `{reader}` AND the word `they`. The
  // ruling, the data/copy split and the bug are all recorded at `reader.pronoun.*`
  // in id.ts. The name is still plain text here — the page linkifies it.
  'account.reader.heading': 'Your path',
  'account.reader.line':
    'A path opened toward {reader}, and what you carry there is {topic}. {Subject} will go with you as far as {subject} can.',
  // The sense of the Indonesian, not its grammar. Requirement 3's last sentence.
  'account.reader.closing':
    'Heaven only opens a path for those who are truly trying to open the gate themselves.',
  'account.reader.empty': 'Your path has not chosen its reader yet.',

  'account.persona.heading': 'The Inner Lotus',
  'account.persona.a11yLabel': 'A picture of who you are',
  'account.persona.loading': 'Reading…',
  'account.persona.otherLanguage':
    'This part was written in another language and is shown as it was written.',

  'account.draw.cta': 'Draw a card',

  // Read, edit and remove (2026-07-29). See id.ts for the six keys that were
  // deleted, why the two state words survive as `state.*` aria-labels, and why the
  // hint could not stay as it was.
  //
  // `state.answered` IS "Answered" AND NOT "Saved". The word being replaced was
  // shown next to a Clear button, where "Saved" answered "did my typing land?".
  // It is now read aloud beside a question, where the querent's question is "have
  // I done this one?" — and `account.facts.nickname` is the precedent for a label
  // that was right for its old context and wrong for its new one.
  'account.answers.heading': 'Your answers',
  'account.answers.hint':
    'The six questions you were asked. Tap one to read, change or remove what you wrote.',
  'account.answers.state.answered': 'Answered',
  'account.answers.state.empty': 'Not answered',
  'account.answers.openAria': '{question} — {state}. Tap to open.',
  'account.answers.loading': 'Opening…',
  'account.answers.emptyField': 'Nothing written yet.',
  'account.answers.save': 'Save',
  'account.answers.saving': 'Saving…',
  'account.answers.remove': 'Remove',
  'account.answers.removing': 'Removing…',
  'account.answers.cancel': 'Close',
  'account.answers.failed': 'That did not save. Try again in a moment.',
  'account.answers.note':
    'Changing or removing an answer rewrites what your reader knows straight away. Your Inner Lotus follows the next time you open this page.',

  // R2 — what the room has noted about the querent. `id.ts` carries the full
  // account: why the register is plain rather than mystical, why the hint is the
  // load-bearing string, why there is no edit control, and why `Cancel` and
  // `Deleting…` are reused from `account.facts` and `history` rather than minted
  // again here.
  'account.memory.heading': 'Notes about you',
  'account.memory.hint':
    'Written by a language model from what you type in the group, not by you. It can be wrong, and you can delete it.',
  'account.memory.reveal': 'Show the notes',
  'account.memory.loading': 'Opening…',
  'account.memory.empty': 'Nothing noted yet.',
  'account.memory.failed': 'That did not open. Try again shortly.',
  'account.memory.itemAria': 'Delete this note: {text}',
  'account.memory.remove': 'Delete',
  'account.memory.forgetAll': 'Forget all of it',
  'account.memory.forgetAllConfirm': 'Yes, forget all of it',

  // V8 — account deletion (VD13). See id.ts for why there are three body
  // strings and why `{days}` is interpolated.
  'account.delete.trigger': 'Delete account',
  'account.delete.heading': 'Deleting your account',
  'account.delete.body1':
    'Your account stops working straight away. Your readings, your answers and your Inner Lotus can no longer be opened.',
  'account.delete.body2':
    'For {days} days you can still get it back: sign in again with the same Google account. After that it is gone and cannot be recovered.',
  'account.delete.body3':
    'Any moderation record that held something you wrote is removed right now, not in {days} days.',
  // `Keep it`, NOT `Cancel`. On a destructive sheet the safe button should say
  // what it DOES, not what it does not do -- "Cancel" next to "Yes, delete my
  // account" is two negatives and a decision to re-read. Indonesian keeps
  // `Batal`, which does not carry the same ambiguity.
  'account.delete.cancel': 'Keep it',
  'account.delete.confirm': 'Yes, delete my account',
  'account.delete.working': 'Deleting…',
  'account.delete.failed': 'That did not go through. Try again in a moment.',

  'login.deleted.notice':
    'Your account is deleted. Sign in again within {days} days if you change your mind.',

  /* Rewritten, not translated -- see the Indonesian for the rule it follows. */
  'reading.actions.home.aria': 'Back to the readers',
  'reading.verdict.yes': 'Yes',
  'reading.verdict.no': 'No',
  'reading.verdict.maybe': 'Not yet clear',

  // --- The public surface (v0.4.0 / S1) -------------------------------------
  //
  // REWRITTEN, NOT TRANSLATED (§8.2, and `## Localization` rule 3). The
  // enforcement is that a reviewer can see a translation in five seconds, so the
  // English lede leads with a different fact than the Indonesian one does and the
  // gallery heading is a different sentence rather than the same sentence in
  // English.

  'landing.tagline': 'The twenty-two Major Arcana, read aloud by three readers.',
  'landing.lede':
    'Pick your cards, ask what you came to ask, and read one interpretation written for that draw and no other — in English or Indonesian.',
  'landing.signIn': 'Sign in to read',
  'landing.hero.alt': 'The {name} card',

  'landing.gallery.title': 'See all twenty-two',
  'landing.gallery.body':
    'Every Major Arcana, drawn for this app. Tap any card to see it full size.',
  'landing.gallery.link': 'Open the gallery',
  'landing.arcana.title': 'What each card means',
  'landing.arcana.body':
    'One page per card: the numeral, the element, the glyph, upright and reversed, and where the card sits in the sequence.',
  'landing.arcana.link': 'Start with The Moon',
  'landing.readers.title': 'Three readers, three voices',
  'landing.readers.body':
    'Thessaly, Margaret and Adrian read the same three cards and do not say the same thing.',
  'landing.blog.title': 'Writing',
  'landing.blog.body': 'How to read tarot, explained without the vocabulary.',
  'landing.blog.link': 'Read it',

  'public.footer.gallery': 'Gallery',
  'public.footer.arcana': 'Card meanings',
  'public.footer.blog': 'Writing',
  'public.footer.app': 'Open the app',
  'public.footer.brandLine': 'JMTarot — Major Arcana readings.',

  'public.share.button': 'Share this page',
  'public.share.copied': 'Link copied.',
  'public.share.failed': "Couldn't copy. Take it from the address bar.",

  'public.crumb.home': 'JMTarot',
  'public.crumb.gallery': 'Gallery',
  'public.crumb.blog': 'Writing',

  // ── S4: /arcana/<slug> ─────────────────────────────────────────────────────
  /*
   * S3, `/gallery`. **THE ENGLISH IS WRITTEN, NOT TRANSLATED** (§8.2). "Read the
   * lore" is not a rendering of "Baca maknanya", and "the original artwork" is not
   * one of "gambar aslinya" in the other direction either.
   *
   * `gallery.card.alt` KEEPS THE WORD ORDER ENGLISH SEARCH USES: "{name} tarot
   * card", because `the moon tarot card` is what somebody types, where the
   * Indonesian phrase is `kartu tarot the moon`. The card NAME and the NUMERAL stay
   * English in both locales (`## Card data`); only the frame and the keywords are
   * translated, which is why the two locales differ on every one of the 22 and why
   * `alt.test.ts` asserts they do.
   */
  'gallery.meta.title': 'Major Arcana Gallery — All 22 Tarot Cards | JMTarot',
  'gallery.meta.description':
    'See all 22 Major Arcana cards: the original artwork, the upright and reversed meanings, and the keywords for each.',
  'gallery.eyebrow': 'Gallery',
  'gallery.title': 'The 22 Major Arcana Cards',
  'gallery.hint': 'Tap a card to see it larger.',
  'gallery.card.alt': '{name} tarot card, Major Arcana {numeral}: {keywords}',
  'gallery.card.zoomAria': 'See {name} larger',
  'gallery.card.lore': 'Read the lore',

  'arcana.verdict': 'Yes or no',
  'arcana.lore': 'Where the card comes from',
  'arcana.inSpread': 'In a reading',
  'arcana.questions': 'Common questions',
  'arcana.neighbours': 'Before and after',
  'arcana.related': 'Cards nearby',
  'arcana.related.root': 'its root number',
  'arcana.related.element': 'same element',
  'arcana.related.stage': 'same stage',
  'arcana.gallery': 'See all 22 cards',

  'arcana.facts.numeral': 'Numeral',
  'arcana.facts.element': 'Element',
  'arcana.facts.stage': 'Stage',
  'arcana.facts.polarity': 'Charge',
  'arcana.facts.attribution': 'Sign',
  'arcana.facts.modality': 'Mode',
  'arcana.facts.keywords': 'Keywords',

  'arcana.element.fire': 'Fire',
  'arcana.element.earth': 'Earth',
  'arcana.element.air': 'Air',
  'arcana.element.water': 'Water',
  'arcana.stage.beginning': 'Beginning',
  'arcana.stage.trial': 'Trial',
  'arcana.stage.reckoning': 'Reckoning',
  'arcana.polarity.light': 'Light',
  'arcana.polarity.shadow': 'Shadow',
  'arcana.polarity.neutral': 'Neutral',
  'arcana.modality.cardinal': 'Cardinal',
  'arcana.modality.fixed': 'Fixed',
  'arcana.modality.mutable': 'Mutable',

  /*
   * S5. REWRITTEN, not translated (§8.2 / `## Localization` rule 3).
   *
   * `Take the artwork with you` rather than a translated `Download the image`,
   * because a heading is the cheapest place to prove the rule — and it is what a
   * person is actually doing. The Indonesian `Unduh gambarnya` is the plain verb,
   * which is what that register wants.
   */
  'wallpaper.heading': 'Take the artwork with you',
  'wallpaper.card': 'The card image',
  'wallpaper.phone': 'Phone wallpaper',
  'wallpaper.cardAria': 'Download the {card} card image, 1024 by 1536 pixels',
  'wallpaper.phoneAria': 'Download the {card} phone wallpaper, 1440 by 3120 pixels',
  'wallpaper.saveHint': 'On iPhone: open the image, press and hold, then choose Add to Photos.',
  'wallpaper.licence':
    'This artwork belongs to JMTarot. You may keep it and set it as your own wallpaper. ' +
    'Not for resale, not on merchandise, and not for commercial use.',
  'wallpaper.licenceLink': 'Terms & Conditions, clause 9',

  /*
   * ── The blog (S6, v0.4.0) ──────────────────────────────────────────────────
   *
   * WRITTEN, NOT TRANSLATED. `blog.index.title` is `Writing` rather than `Articles`:
   * `Tulisan` is what the landing page and the account menu already say in
   * Indonesian, and `Writing` is the register that matches — a place somebody writes
   * rather than a container of items.
   *
   * `blog.readingTime` REALLY DOES NEED TWO FORMS HERE, unlike the Indonesian pair,
   * which is identical because CLDR gives `id` only `other` (I5).
   */
  'blog.index.title': 'Writing',
  'blog.index.description':
    'Long-form writing about tarot: how to read it, what the myths get wrong, and what a deck of pictures is actually good for.',
  'blog.index.lede': 'Long reads about tarot, for before or after you draw.',
  'blog.readMore': 'Read the article',
  'blog.published': 'Published {date}',
  'blog.updated': 'Updated {date}',
  'blog.readingTime.one': 'about {count} minute',
  'blog.readingTime.other': 'about {count} minutes',
  'blog.inThisArticle': 'In this article',
  'blog.backToIndex': 'All writing',
  'blog.notFound.title': 'No such article',
  'blog.notFound.body':
    'The address may be wrong, or this piece may not exist in the language you are reading.',
  'blog.orient.title': 'New to this?',
  'blog.orient.gallery': 'See all 22 Major Arcana',
  'blog.orient.firstCard': 'Start at The Fool',
  'blog.orient.feared': 'Death, and why it is not what you think',
};

export default en;
