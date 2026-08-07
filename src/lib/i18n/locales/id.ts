/**
 * The Indonesian message catalog. THE SOURCE CATALOG (I2).
 *
 * This file defines the key set. `en.ts` is typed *from* it, so a key added here
 * with no English counterpart is a red `npm run typecheck` — TS2739, naming the
 * missing key. That red is the feature: it is the only thing standing between us
 * and an English app with three Indonesian strings left in it.
 *
 * `as const satisfies Record<string, string>` is the whole trick. `as const` keeps
 * each value a string literal so `format.ts` can derive the required `{params}`
 * from the message itself; `satisfies` checks the values really are strings
 * without widening the keys back to `string`.
 *
 * ONE CONSEQUENCE OF `as const` WORTH KNOWING: a value built with `+` is NOT a
 * literal type, it is `string`, so its `{placeholders}` are not derived and
 * `t()` accepts any params for it. Every value below that carries a placeholder
 * is therefore a SINGLE literal, and the concatenated ones are all long prose
 * with no placeholders. If you add a placeholder to a concatenated value, join it
 * into one literal in the same edit or the compile-time check silently stops
 * covering it.
 *
 * KEYS ARE FLAT AND DOTTED (I1), `namespace.thing.variant`, `lowerCamelCase`
 * segments, variants last: `reading.error.rateLimit`, never
 * `reading.rateLimit.error`. The payoff is that `grep -rn "reading.error.rateLimit" src`
 * finds the definition and every call site, which is the property that matters
 * when six other workstreams are writing copy into the same file.
 *
 * PLURAL FAMILIES END IN `.one` / `.other` AND BOTH ARE DECLARED IN BOTH
 * CATALOGS (I5). For Indonesian the two must be IDENTICAL and there is a test
 * asserting it: CLDR gives `id` only the `other` category, so `.one` is never
 * selected and an Indonesian `.one` that differs is a string somebody edited
 * believing it renders.
 *
 * WHICH IS WHY `draw.hint.tap` IS DELIBERATELY *NOT* A PLURAL FAMILY. It is
 * `.single` / `.many`, chosen at the call site by `cardCount === 1`. A plural
 * family would force Indonesian through `.other` at every count and turn
 * `Ketuk satu kartu` into `Ketuk 1 kartu`, and Indonesian spells that number out.
 * `Intl.PluralRules` answers a GRAMMATICAL question — does the noun inflect —
 * and it is the right mechanism for `{count} card` / `{count} cards`, which is
 * what `picker.service.cardCount`, `draw.counter` and `reading.error.cardCount`
 * use it for. "Do I write the digit or the word" is a different question, in a
 * different language, and CLDR has no opinion about it. Do not "simplify" these
 * two keys into a plural family; the conditional in `Draw.tsx` is the correct
 * amount of code for a distinction the plural rules cannot express.
 *
 * INDONESIAN, NOT MALAY (CLAUDE.md). `karier` not `kerjaya`, `kamu` not `awak`,
 * `ngobrol` not `sembang`, `arah hidup` not `hala tuju`, `waktu`/`masa` not
 * `tempoh`. The eleven-word grep in `npm run smoke -- --all` covers generated
 * readings, not this file, so this file is on you.
 *
 * WHAT IS NEVER IN HERE: card names, card numerals and glyphs, reader names and
 * titles, `JMTarot`, the `Major Arcana` eyebrow's own words, the enum values
 * (`stage`, `polarity`, `element`, `yesno`), the `<pertanyaan>` delimiter, every
 * id and slug, and `todayKey()`'s output. Plan §7.13 is the full list. Copy that
 * the UI shows *and* a prompt consumes lives in the data files as `Localized<>`,
 * not here (I14): `positionFraming`, `service.name`, card `meaning` and
 * `keywords`. Long-form legal prose is `terms.{id,en}.tsx`, not a catalog value
 * (I15) — only the chrome around it is keyed.
 */
const id = {
  // --- Brand and metadata -------------------------------------------------
  //
  // `app.title` is keyed even though it is identical in both catalogs, and the
  // reason is the same one that gets `common.majorArcana` a key: the point is
  // that the *next* person does not hardcode it, and that the
  // identical-value test has somewhere to declare the exemption.
  'app.title': 'JMTarot',
  'meta.description': 'Bacaan tarot Major Arcana bersama tiga pembaca.',

  // --- Shared ---------------------------------------------------------------
  'common.majorArcana': 'Major Arcana',
  'common.disclaimer.short': 'Untuk hiburan semata.',
  'common.disclaimer.long':
    'Bacaan ini untuk hiburan semata, bukan nasihat medis, hukum, atau keuangan.',
  'common.retry': 'Coba lagi',
  'common.close': 'Tutup',
  /** Link labels. W7 owns the documents behind them (I15). */
  'common.terms': 'Syarat & Ketentuan',
  'common.privacy': 'Kebijakan Privasi',

  // --- Navigation -----------------------------------------------------------
  //
  // The arrow is part of the value, not the JSX. It is directional copy: a
  // future right-to-left locale flips it, and a locale that wants no arrow at
  // all can drop it without touching a component.
  'nav.back.readers': '← Pembaca lain',
  'nav.back.reader': '← {name}',

  // --- Reader picker --------------------------------------------------------
  'picker.reader.hint': 'Pilih pembaca yang cocok denganmu.',
  'picker.reader.portraitAlt': '{name}, {title}',

  /*
   * V5. The name of the BIO PANEL inside the reader swipe deck.
   *
   * The summary panel reuses `memory.summary.a11yLabel`, which already names its
   * reader -- so the two panels announce as two different things, which is the
   * whole reason they are named at all (D-V5-4). Neither panel is aria-hidden.
   */
  'picker.reader.bio.a11yLabel': 'Tentang {name}',

  /*
   * ── THE READERS' PRONOUNS ─────────────────────────────────────────────────
   *
   * **THE THREE READERS HAVE FIXED GENDERS AND THIS IS WHERE THE WORDS LIVE**
   * (Miftah's ruling, 2026-07-28): Thessaly female, Margaret female, Adrian male.
   * The GENDER is data — `readers.json`'s `gender`, beside the name it belongs to —
   * and only the WORD is copy, which is the split that makes both halves right:
   * a gender is a fact about a character and does not vary by locale, while `she`
   * and `dia` are two languages' answers to the same fact.
   *
   * **THE BUG THIS FIXES WAS "THESSALY REFERS TO HERSELF AS THEY".**
   * `account.reader.line`'s English read *"{reader} will go with you as far as they
   * can"* — a neutral singular chosen when the readers had no recorded gender, which
   * is the correct default for a person whose pronouns are unknown and the wrong one
   * for three fictional characters whose bios have said `She`, `Her` and `He` in
   * `readers.json` since the first release. The prose and the chrome disagreed about
   * the same three people.
   *
   * **INDONESIAN RENDERS ONE WORD FOR BOTH KEYS AND THAT IS NOT A MISTAKE.** `dia`
   * is genderless, so `female` and `male` are identical here; the pair exists so the
   * call site is locale-independent and so `en.ts` cannot be the only catalog whose
   * sentence takes a pronoun. A test asserts the Indonesian values match each other,
   * or somebody edits one and concludes the mechanism is broken.
   *
   * LOWERCASE IN THE CATALOG, capitalised by `readerPronoun` for sentence position.
   * A `.subject`/`.Subject` pair of keys would be four values a translator has to
   * keep consistent by hand for zero gain in either of these two locales.
   */
  'reader.pronoun.female': 'dia',
  'reader.pronoun.male': 'dia',

  // --- Service picker -------------------------------------------------------
  'picker.service.eyebrow': 'Pilih layanan',
  'picker.service.cardCount.one': '{count} kartu',
  'picker.service.cardCount.other': '{count} kartu',

  // --- Draw screen ----------------------------------------------------------
  'draw.hint.complete':
    'Kartumu sudah terbuka. Ketuk salah satu untuk melihatnya lebih besar.',
  /*
   * NOT a plural family, on purpose. See the header: Indonesian spells the one
   * out, and a `.one`/`.other` pair would render `Ketuk 1 kartu` because CLDR
   * never selects `one` for `id`.
   */
  'draw.hint.tap.single': 'Ketuk satu kartu, atau tarik ke atas.',
  'draw.hint.tap.many': 'Ketuk {count} kartu, atau tarik ke atas.',
  'draw.question.label': 'Pertanyaan (boleh dikosongkan)',
  'draw.question.placeholder': 'Ada yang mau kamu tanyakan?',
  'draw.counter.one': '{picked} / {total} kartu',
  'draw.counter.other': '{picked} / {total} kartu',
  'draw.reset': 'Kocok ulang',
  /** `{slot}` is 1-based, because it is read aloud. */
  'draw.card.aria.picked': 'Kartu {slot}: {name}, ketuk untuk lihat kartunya',
  'draw.card.aria.take': 'Ambil kartu',

  // --- Card detail ----------------------------------------------------------
  //
  // The `·` separator stays in the JSX; only the word is copy.
  //
  // **`card.upright` AND `card.reversed` ARE ONE PAIR AND THERE MUST NOT BE A
  // SECOND ONE.** S4 minted `arcana.upright` / `arcana.reversed` for the lore
  // page's two section headings while `card.reversed` had already existed since
  // W6; S3 needed the same pair for `/gallery`'s zoom sheet, which would have
  // been the THIRD spelling of one word. Both `arcana.*` keys are deleted and
  // the lore page reads these -- S3's delta 18 to S4, which argued it before
  // either shipped: two keys for one word is how the gallery and the lore page
  // end up disagreeing about what `Tegak` is called.
  //
  // Namespaced `card.` rather than `gallery.` for the same reason: the word is a
  // fact about a CARD's orientation, and three surfaces render it.
  'card.upright': 'Tegak',
  'card.reversed': 'Terbalik',
  'card.return': 'Kembalikan ke dek',
  // The bare-name alt gets a key so a locale can add "the card" if it needs to,
  // without a code change.
  'card.alt.upright': '{name}',
  'card.alt.reversed': '{name}, terbalik',

  // --- The reading ----------------------------------------------------------
  //
  // `reading.waiting` is not decoration. Measured time-to-first-token is 2.7s,
  // 5.4s and 11.6s across three smoke runs, so whatever this says has to hold a
  // screen for ten seconds without looking hung. "Memuat…" does not.
  'reading.waiting': 'Membaca kartu…',
  'reading.error.rateLimit': 'Terlalu banyak bacaan. Coba lagi nanti.',
  'reading.error.start': 'Bacaan tidak bisa dimulai. Coba lagi.',
  'reading.error.network': 'Koneksi terputus. Coba lagi.',
  'reading.error.badRequest': 'Permintaan tidak valid.',
  'reading.error.cardCount.one': 'Layanan ini butuh {count} kartu.',
  'reading.error.cardCount.other': 'Layanan ini butuh {count} kartu.',
  'reading.error.duplicateCard': 'Kartu tidak boleh berulang.',
  /*
   * THE SPECIAL ONE. The status code went out with the first byte, so a
   * mid-stream failure cannot become a 500 and the only honest option is to
   * append a visible notice to the body.
   *
   * THE LEADING `\n\n` AND THE SQUARE BRACKETS ARE PART OF THE VALUE, not the
   * JSX. They are what make it read as a system message rather than as the
   * reader suddenly saying something strange, and a translator who drops them
   * breaks that. There is a test asserting the framing survives in both
   * locales.
   */
  'reading.error.midStream': '\n\n[Bacaan terputus. Coba lagi sebentar.]',

  /*
   * --- The moderation refusal (W7) ----------------------------------------
   *
   * **TWO DOCUMENTS, NOT TEN.** W7 §3.5 designs exactly one generic refusal and
   * one self-harm refusal; the CATEGORY only decides which of the two renders
   * and which T&C clause the link points at. `refusalPayload()` therefore emits
   * `…generic` or `…selfHarm` as its `messageKey`, never a per-category key --
   * twenty near-identical strings per locale would be twenty chances to write a
   * bad one, and I3 means a key with no value renders as the key.
   *
   * **THE APP SPEAKS HERE, NEVER A READER** (W7-D9). No Thessaly, no Margaret,
   * no Adrian, no second person plural, no oracular register. A refusal
   * delivered in a reader's voice is grotesque, and for self-harm it is worse
   * than grotesque.
   *
   * Split around the link the way `login.legal.*` is, and for the same reason:
   * two of these words are an `<a>` and `t()` returns a string. The link label
   * is `common.terms`, which already exists -- a second copy of "Syarat &
   * Ketentuan" is a second thing to keep in step.
   */
  'moderation.blocked.generic.title': 'Kartu tidak dibuka untuk pertanyaan ini.',
  'moderation.blocked.generic.lead':
    'Permintaan seperti ini termasuk yang tidak bisa kami baca menurut',
  'moderation.blocked.generic.tail': 'Kamu bisa menulis pertanyaan lain.',

  /*
   * **RESOURCES FIRST, REFUSAL SECOND, THE CLAUSE LINK LAST AND SMALL**
   * (W7-D10). Every element Miftah asked for is here -- the app says it cannot
   * read the cards, and it links the Terms -- reordered, because you do not open
   * with a policy citation to a person describing suicidal ideation.
   *
   * `bicara dengan orang sungguhan` and not `cari bantuan profesional`: the
   * no-therapy rule binds this copy too, and "a real person tonight" is both
   * warmer and more actionable than a referral to a category of professional.
   */
  'moderation.blocked.selfHarm.lead':
    'Kalau kamu sedang berpikir untuk menyakiti diri sendiri, tolong bicara dengan orang sungguhan malam ini, bukan dengan kartu.',
  'moderation.blocked.selfHarm.resourcesLabel': 'Tempat bicara',
  'moderation.blocked.selfHarm.emergency':
    'Kalau ada bahaya langsung, hubungi layanan darurat setempat.',
  'moderation.blocked.selfHarm.closing':
    'Kami tidak membuka kartu untuk pertanyaan ini. Bukan karena pertanyaanmu salah, tapi karena jawaban yang kamu butuhkan tidak boleh datang dari tebakan. Alasannya ada di',

  /*
   * --- The legal documents (W7) --------------------------------------------
   *
   * ONLY THE CHROME IS KEYED (I15). The seventeen clauses themselves live in
   * `src/app/terms/terms.{id,en}.tsx` and the twelve privacy sections in
   * `src/app/privacy/privacy.{id,en}.tsx`, because a 2,000-word document as one
   * catalog value is unreviewable in a diff -- and these are legal documents,
   * where reviewing the diff is the entire point.
   */
  'legal.back': 'Kembali',
  'legal.effective': 'Berlaku sejak versi {version}.',

  // --- Sign in --------------------------------------------------------------
  'login.tagline':
    'Tiga pembaca, dua puluh dua Major Arcana, satu bacaan untuk hari ini.',
  'login.google': 'Masuk dengan Google',
  /*
   * The legal line is three keys and two link labels rather than one sentence,
   * because two of its words are `<a>` elements and `t()` returns a string.
   * The cost is real and worth naming: a locale that wants a different clause
   * order cannot get one from these parts. It is one sentence on one screen; if
   * a third locale needs to reorder it, the fix is a rich-text renderer here,
   * not five more segment keys.
   */
  'login.legal.lead': 'Dengan masuk, kamu setuju pada',
  'login.legal.and': 'dan',
  'login.disclaimer': 'Untuk hiburan. Bukan nasihat medis, hukum, atau keuangan.',
  /*
   * Deliberately vague about WHICH account problem: "that address is not
   * verified" tells a stranger which addresses exist here.
   */
  'login.error.accessDenied':
    'Akun itu tidak bisa dipakai untuk masuk. Coba akun Google lain.',
  'login.error.generic': 'Tidak bisa masuk sekarang. Coba lagi sebentar.',

  // --- Error pages ----------------------------------------------------------
  'error.notFound.title': 'Halaman itu tidak ada.',
  'error.notFound.body': 'Mungkin tautannya salah, atau halamannya sudah pindah.',
  'error.notFound.action': 'Kembali ke pembaca',
  'error.crash.title': 'Ada yang tidak beres.',
  'error.crash.body': 'Bukan salahmu. Coba muat ulang halaman ini.',
  'error.crash.action': 'Muat ulang',

  // --- The language switcher ------------------------------------------------
  //
  // Language names are written IN THEIR OWN LANGUAGE in both catalogs, which is
  // the universal convention and the only one that works for a user who cannot
  // read the locale they are currently in. Both are therefore identical across
  // catalogs and both are allowlisted in the identical-value test.
  'locale.name.id': 'Indonesia',
  'locale.name.en': 'English',
  'locale.switch.aria': 'Ganti bahasa',

  // ==========================================================================
  // W3 — onboarding. Migrated verbatim from `src/app/onboarding/copy.ts`, which
  // was a staging post for exactly this move and is now deleted. The keys are
  // unchanged, because the name IS the interface.
  //
  // WHY THE COPY READS THE WAY IT DOES, kept from that file because each line
  // is a fix for a specific way the brief was wrong as copy:
  //
  //   - NO MECHANISM. Never "that we build based on your answers". Explaining
  //     the machine reveals an engineer behind the curtain. The invitation says
  //     what the Lotus DOES -- the cards know which way to fall -- and never
  //     what it is or who makes it.
  //   - NO "WE". A reader and a querent are in the room; a company is not.
  //   - SHORT LINES. This is a phone.
  //   - PERMISSION TO REFUSE ARRIVES FIRST, before the first question rather
  //     than after the last.
  //
  // THE NAME IS "TERATAI BATIN", NOT "TERATAI LANGIT BATIN". Three stacked
  // nouns is not a name, and `langit` reaches for the meteorological before the
  // celestial. The "heavenly" part lives in the invitation's prose, where it
  // works as an image instead of as a modifier. In English it is the proper
  // noun "Inner Heavenly Lotus" and is the one onboarding key where the English
  // is fixed rather than written.
  // ==========================================================================
  'onboarding.lotusName': 'Teratai Batin',

  'onboarding.intro.eyebrow': 'TERATAI BATIN',
  'onboarding.intro.title': 'Sebelum kartu pertama',
  /*
   * The middle line is the whole trick: it says what the Lotus does and never
   * what it is.
   */
  'onboarding.intro.body':
    'Ada yang bilang setiap orang menumbuhkan satu teratai di langit dalam ' +
    'dirinya, dan bahwa dari bentuk teratai itulah kartu tahu harus jatuh ke ' +
    'arah mana.\n\n' +
    'Sembilan pertanyaan. Tiga tentang siapa kamu, enam tentang apa yang sudah ' +
    'kamu lewati. Kamu hanya ditanya sekali.',
  'onboarding.intro.note':
    'Tidak ada jawaban yang benar dan tidak ada yang salah. Pertanyaan apa pun ' +
    'boleh kamu lewati, dan bacaanmu tetap utuh.',
  'onboarding.intro.cta': 'Mulai',

  'onboarding.facts.title': 'Siapa kamu',
  'onboarding.facts.fullName.label': 'Nama lengkap',
  'onboarding.facts.fullName.hint': 'Nama yang diberikan kepadamu.',
  'onboarding.facts.nickname.label': 'Nama panggilan',
  'onboarding.facts.nickname.hint':
    'Nama yang kamu pakai sehari-hari. Ini yang akan dipakai pembacamu.',
  'onboarding.facts.birthDate.label': 'Tanggal lahir',
  /*
   * NO PROMISE ABOUT WHAT THE BIRTH DATE IS FOR. The birth card is still
   * deferred, and copy that promises a deferred feature ages into a lie.
   */
  'onboarding.facts.birthDate.hint': 'Hari kamu masuk ke dunia ini.',

  // Each of the six is a title (the question), one framing line (the mystical
  // register) and one hint (scope, and the practical truth). The hint is where
  // honesty lives; the framing is where atmosphere lives. They stay on separate
  // lines so neither contaminates the other.

  'onboarding.q.best_thing.title': 'Hal terbaik yang pernah ada dalam hidupmu',
  'onboarding.q.best_thing.framing':
    'Setiap orang menyimpan satu titik terang. Pembacamu ingin tahu di mana letak terangmu.',
  'onboarding.q.best_thing.hint':
    'Boleh sebuah benda, boleh seseorang, boleh satu pertemuan, satu perjalanan, satu buku.',

  /*
   * THE ENUMERATED EXAMPLES ARE DELIBERATELY ABSENT (reconciliation §7.4, at
   * Miftah's explicit direction). Roadmap §8 described this question as naming
   * rape, suicide, murder and domestic violence. It does not name them, and the
   * reason is recorded so nobody restores the list later as a missing
   * requirement: a list of extremes turns an open question into a menu and
   * primes the worst item on it. It also reads as ghoulish rather than solemn.
   * The question is answerable without them. THE ENGLISH DOES NOT NAME THEM
   * EITHER.
   *
   * PERMISSION TO DECLINE IS IN THE FRAMING LINE, NOT THE HINT, so it arrives
   * before the field is even focused. This is also the only step whose hint
   * names the encryption, and the only step where Skip sits beside Continue at
   * equal weight rather than below it. Nothing here is jocular and nothing
   * acknowledges the answer after it is given -- an "ouch, that's heavy" would
   * be the worst line in the app, in either language.
   */
  'onboarding.q.worst_thing.title': 'Hal paling berat yang pernah kamu saksikan',
  'onboarding.q.worst_thing.framing':
    'Yang gelap pun ikut membentuk. Tapi kamu tidak perlu menceritakannya di sini.',
  /*
   * ── AMENDED 2026-08-07 FOR v0.7.0's GROUP CHAT (`C-D8`, `[R14]`) ───────────
   *
   * **THIS STRING PROMISED THE OPPOSITE OF WHAT THE CHAT DOES, AND IT IS READ WHILE
   * THE QUERENT IS TYPING THE ANSWER.** It said *"tidak pernah dikutip di dalam
   * bacaanmu"*, which survives `C-D8` on the letter — a chat is not a *bacaan* — and
   * does not survive in spirit at all: **the whole point of the feature is Thessaly
   * quoting it back at you.**
   *
   * The reconciliation calls this the most serious finding of the exercise, and the
   * reason is placement: **nobody re-reads `/privacy`; everybody reads the hint.** So
   * amending `/privacy` was necessary and not sufficient, and this is the load-bearing
   * half of the pair.
   *
   * The new text keeps the two promises that are still true (locked at rest, never
   * displayed back) and states the one that changed, in the same breath, with the
   * remedy beside it. **It must not be softened into "may be used to personalise your
   * experience"** — that is the sentence this project exists not to write, and
   * `/privacy` clause 2.2 quotes the question itself word for word rather than calling
   * it "certain personal reflections" for exactly this reason.
   */
  'onboarding.q.worst_thing.hint':
    'Sesedikit atau sebanyak yang kamu mau. Jawaban ini disimpan terkunci dan tidak ' +
    'pernah ditampilkan lagi. Di dalam bacaan hanya ringkasan abstraknya yang dipakai; ' +
    'di ruang obrolan, para pembaca membacanya apa adanya. Melewatinya tidak ' +
    'mengurangi apa pun.',

  /*
   * The framing and the hint together are a promise the user can read, which is
   * a promise the code has to keep. `lotusSafetyCheck()`'s proper-name
   * rejection is what keeps it -- reconciliation §7.5 calls that check
   * load-bearing rather than defensive for this reason.
   */
  'onboarding.q.most_loved.title': 'Orang yang paling kamu cintai di hidup ini',
  'onboarding.q.most_loved.framing':
    'Setiap bacaan punya satu orang yang berdiri di belakangnya, walau namanya ' +
    'tidak pernah disebut.',
  /*
   * **AMENDED 2026-08-07** (`C-D8`, `[R14]`), and this one survived `C-D8` in spirit
   * as well as on the letter — F3's `validateTurn` mechanically refuses a proper name
   * lifted from an answer. It is amended anyway, because a promise that holds only
   * because of a validator somebody could relax is a promise worth restating in terms
   * of what actually happens.
   */
  'onboarding.q.most_loved.hint':
    'Cukup sebut siapa dia bagimu. Namanya tidak akan pernah muncul di dalam bacaan, ' +
    'dan para pembaca tidak akan menyebutnya di ruang obrolan.',

  'onboarding.q.introversion.title': 'Di mana kamu berdiri?',
  'onboarding.q.introversion.framing':
    'Tidak ada yang sepenuhnya menyendiri, tidak ada yang sepenuhnya ramai.',
  'onboarding.q.introversion.hint': 'Geser ke tempat kamu paling sering berada.',
  'onboarding.q.introversion.left': 'Menyendiri',
  'onboarding.q.introversion.right': 'Di antara orang',

  'onboarding.q.color.title': 'Pilih satu warna',
  'onboarding.q.color.framing': 'Hitam, putih, kelabu.',
  'onboarding.q.color.hint': 'Jangan dipikir lama. Yang pertama menarikmu itu jawabannya.',
  'onboarding.q.color.option.black': 'Hitam',
  'onboarding.q.color.option.white': 'Putih',
  'onboarding.q.color.option.grey': 'Kelabu',

  /*
   * Kept nearly verbatim from Miftah, who supplied it already as a story. It is
   * also the right LAST question: it points forward, which is where you want
   * someone facing when they walk into a reading.
   */
  'onboarding.q.willow_wish.title': 'Sebuah permintaan',
  'onboarding.q.willow_wish.framing':
    'Seorang asing menyodorkan setangkai dahan willow. Katanya: patahkan sambil ' +
    'meminta satu hal, dan hal itu akan terjadi.',
  'onboarding.q.willow_wish.hint': 'Apa yang kamu minta?',

  /*
   * NO "your avatar is being woven", NO progress indicator, here or on the
   * reader picker. The distillation runs in `after()` and may not have finished
   * when the user arrives: a line claiming it is ready would be false, a
   * spinner would be a wait we just decided not to impose, and "still working"
   * would draw attention to plumbing. "Sudah cukup" is true whenever it is
   * read, and so is "That is enough."
   */
  'onboarding.done.title': 'Sudah cukup.',
  'onboarding.done.body':
    'Yang kamu tulis tidak akan ditampilkan kembali di mana pun. Ia hanya ikut ' +
    'duduk di belakang pembacamu.',
  'onboarding.done.cta': 'Pilih pembacamu',

  'onboarding.actions.next': 'Lanjut',
  'onboarding.actions.back': 'Kembali',
  'onboarding.actions.skip': 'Lewati pertanyaan ini',
  'onboarding.actions.finish': 'Selesai',
  'onboarding.progress': '{n} / {total}',

  /*
   * The resume case needs a sentence that exists nowhere else: the server
   * deliberately never sends answer TEXT back to the browser, so a revisited
   * step shows an empty field and has to say why rather than looking like lost
   * data.
   */
  'onboarding.answerSaved':
    'Jawabanmu sudah tersimpan. Kalau kamu menulis lagi, yang baru menggantikannya.',

  'onboarding.error.saveFailed': 'Belum tersimpan. Coba lagi.',
  'onboarding.error.required': 'Bagian ini belum diisi.',
  'onboarding.error.tooLong': 'Terlalu panjang. Ringkas sedikit.',
  'onboarding.error.rateLimit': 'Terlalu banyak permintaan. Coba lagi nanti.',
  'onboarding.error.badRequest': 'Permintaan tidak valid.',
  'onboarding.error.notFound': 'Jawaban itu tidak ada.',

  /*
   * NOT IN THE PLAN'S §7 INVENTORY, because `SessionRepair.tsx` did not exist when
   * that inventory was counted. It is the screen shown when `profiles.completed_at`
   * is set but the session claim disagrees -- one nobody should ever see, and one
   * whose alternative is ERR_TOO_MANY_REDIRECTS.
   *
   * It deliberately says nothing about a lotus, nothing about progress and nothing
   * about what went wrong. Keep it that way in both locales: a line explaining the
   * mechanism here would be the only place in the app that admits there is one.
   */
  'onboarding.session.repairing': 'Sebentar…',
  'onboarding.session.repairFailed': 'Sesi belum tersegarkan.',

  // ==========================================================================
  // W5 — memory and engagement. Migrated from `src/lib/memory/copy.ts`, which
  // was already bilingual and is now deleted.
  //
  // THE WINDOW PHRASE IS INTERPOLATED INTO THE FREQUENCY PROMPT, not only
  // rendered on screen: the prompt tells the model to "name the stretch of time
  // in words, not dates", and this is the phrase it is handed. That is why
  // these read as something a person would say rather than as labels — and why
  // editing one changes a prompt as well as a screen.
  //
  // NO ERROR COPY AND NO EMPTY-STATE COPY, deliberately (M14). Both failure
  // paths render nothing at all, so there is no string here to translate and no
  // temptation to add one. An empty state announces that the feature exists and
  // that you are not interesting enough for it.
  // ==========================================================================
  'memory.summary.a11yLabel': 'Ringkasan hari ini dari {reader}',
  'memory.frequency.a11yLabel': 'Pola kartumu belakangan ini',

  'memory.frequency.windows.week': 'Minggu ini',
  'memory.frequency.windows.d3': 'Tiga hari terakhir',
  'memory.frequency.windows.d13': 'Tiga belas hari terakhir',
  'memory.frequency.windows.d666': '666 hari terakhir',
  'memory.frequency.windows.month': 'Bulan ini',
  'memory.frequency.windows.quarter': 'Kuartal ini',
  'memory.frequency.windows.year': 'Tahun ini',
  'memory.frequency.windows.birthday': 'Sejak ulang tahunmu yang terakhir',

  // ==========================================================================
  // V4 — the account shell.
  //
  // "Tentang kamu" AND NOT "Detail Pengguna". VD12 fixes what the item IS
  // (`/account`, V8); the wording is this file's job, and V8's page is the
  // querent's persona, their facts and the deletion button -- not a settings
  // form. "Detail Pengguna" is the register of a bank app and this is the
  // screen that tells someone which card the universe keeps handing them.
  //
  // "Keluar" AND NOT "Keluar akun" or "Logout". The menu row above it already
  // says the sheet is about the account, and `Logout` is the one English word
  // an Indonesian interface reaches for out of habit rather than need.
  // ==========================================================================
  'account.button.aria': 'Buka menu akun',
  'account.menu.title': 'Akun',
  'account.menu.details': 'Tentang kamu',
  'account.menu.language': 'Bahasa',
  'account.menu.history': 'Riwayat bacaan',
  /*
   * The two public pages, moved OUT of the public footer and INTO this sheet
   * (Miftah's ruling, 2026-07-29 -- `AccountMenu`'s header has the argument).
   *
   * **THEIR OWN KEYS RATHER THAN A REUSE OF `public.footer.{gallery,blog}`**,
   * whose Indonesian is today the identical word. V8's precedent for reuse is
   * `history.home`, and it holds there because "Home" cannot drift; a footer
   * label can. The footer's job is to name a destination to a stranger who has
   * never seen the app, and this sheet's is to name it to somebody signed in --
   * the day one of them wants "Lihat semua kartu" the other must not follow.
   * `gallery.card.zoomAria` is in the catalog for the same reason, one release
   * apart.
   */
  'account.menu.gallery': 'Galeri kartu',
  'account.menu.blog': 'Tulisan',
  'account.menu.signOut': 'Keluar',

  /*
   * ==========================================================================
   * v0.7.0 — THE ONE CHAT KEY F1 OWNS. F4 owns every other `chat.*` string, and
   * `[R14]` splits this one deliberately: **F4 owns the surface; F1 owns the copy.**
   *
   * ── WHY THIS SENTENCE EXISTS AT ALL ───────────────────────────────────────
   *
   * `C-D8` lets the three readers see the six raw onboarding answers, and `Q-F1-1`
   * asked whether that should bump `TERMS_VERSION` and force re-acceptance. Miftah
   * ruled **no**: a forced re-accept is a modal people dismiss, which buys **the
   * appearance of consent and not the thing.**
   *
   * **SO THE ROOM SAYS SO ITSELF, ONCE, ON FIRST OPEN.** One line above the first
   * bubble, with a link to `/privacy`, dismissed forever on any interaction. Shown to
   * the person, **at the moment it becomes true, on the screen where it happens** —
   * which is the only version of this worth anything, and the answer to the objection
   * that `/privacy` is read by nobody.
   *
   * It is deliberately NOT an apology and NOT a consent gate. It states a fact and
   * points at the document. **If it ever grows an "I agree" button it has become the
   * modal this ruling refused.**
   */
  'chat.first_open.notice':
    'Di ruang ini ketiga pembaca bisa melihat jawaban awalmu, bacaanmu, dan obrolan ' +
    'ini sendiri — supaya mereka menjawab kamu, bukan orang umum.',
  'chat.first_open.link': 'Selengkapnya',

  /*
   * ── v0.7.0 / F6 — THE ATTACHMENT. `Bahas di grup`, and the bubble it becomes ──
   *
   * **AUTHORED BY F6 AND TRANSCRIBED HERE BY F6, WHICH IS A DEVIATION FROM ITS OWN
   * PLAN'S D1** — that discrepancy hands these strings to F4 as prose, on S7's
   * `.env.example` pattern. It cannot work in this order: `MessageKey` is a union
   * derived from this object, so `AttachReadingLink` and `ReadingAttachment` (F6's
   * tasks 4 and 5, which land before F3, four workstreams ahead of F4) would not
   * typecheck against a key that does not exist yet. The strings are §2.1's table
   * verbatim; **F4 owns every other `chat.*` key and must not re-add these.**
   *
   * `Bahas di grup` AND NOT `Tanya di grup`: the roadmap names it *"bahas di grup"*
   * and *bahas* is the honest verb — requirement 7 makes the text optional, so the
   * querent may be SHOWING the reading rather than asking about it, and `Tanya` would
   * make the empty-text case read as a mistake.
   *
   * `grup` AND NOT `grup obrolan`. Indonesian, not padded: nobody says *grup
   * obrolan* in a message, and the two-word button fits at 320px where the
   * three-word one does not.
   *
   * **THE HINT NAMES THE THREE READERS, AND THAT IS THE DISCLOSURE THAT MAKES THE
   * BUTTON HONEST.** `[F6-11]`: this control sits directly above `ShareFooter`'s, it
   * looks like it, and the two must never converge — *attaching* shows a reading to
   * three characters who already hold the querent's six onboarding answers (`C-D8`);
   * *sharing* puts it on the public internet. Naming the readers is what keeps the
   * two apart at the moment of the tap.
   */
  'chat.attach.action': 'Bahas di grup',
  'chat.attach.hint': 'Kirim bacaan ini ke Thessaly, Margaret dan Adrian.',
  // The staged card above the composer, and the control that unstages it. F4 mounts
  // both; the copy is F6's because the card is.
  'chat.attach.staged': 'Bacaan terlampir',
  'chat.attach.remove': 'Lepas lampiran',
  // The whole bubble is one link to `/history/[id]`, so it needs a label a screen
  // reader can read instead of three card names and a date.
  'chat.attachment.open': 'Buka bacaannya',
  /*
   * The language chip, and it renders ONLY when the reading's prose is not in the
   * viewer's language (§7.1).
   *
   * **TWO KEYS RATHER THAN §2.1's ONE**, because the plan's table gives that single
   * key two values per locale and only ever renders one of them: with exactly two
   * locales the foreign language is always "the other one", so a single key would be
   * correct today and silently wrong the day a third locale exists. Keyed by the
   * PROSE's locale, chosen by the renderer.
   *
   * **NAMED IN THE VIEWER'S LANGUAGE, WHICH IS THE OPPOSITE OF `locale.name.*`.**
   * Those are written in their own language because a switcher has to be readable by
   * somebody who cannot read the locale they are in. This is a chip inside the
   * viewer's own chrome describing two foreign lines, so it belongs in the language
   * the rest of the card is in.
   *
   * `Bahasa Inggris` AND NOT `Inggris`: the chip names a language, and the bare
   * demonym reads as a country.
   */
  'chat.attachment.language.id': 'Bahasa Indonesia',
  'chat.attachment.language.en': 'Bahasa Inggris',
  /*
   * §8. **UNREACHABLE TODAY AND KEYED ANYWAY.** `readings` rows are deleted by
   * exactly one path — the hard delete thirty days after a soft account deletion —
   * and that path cascades `chat_messages` on `user_id` first, so
   * `attached_reading_id IS NULL` under a stored bubble is insurance in the schema
   * rather than a state the product produces.
   *
   * It is rendered by `ReadingAttachment`'s CALLER, in the querent's own bubble, and
   * only when there is no text either — a bubble with words in it is just a text
   * bubble, with no slot and no placeholder. **It is the app labelling an empty slot,
   * never a reader's voice** and never a `chat_messages` row a director could point a
   * beat at.
   */
  'chat.attachment.gone': 'Bacaan ini sudah tidak ada.',

  // The SHORT tags, for the two-item toggle inside the menu (R1/VD12). The long
  // names in `locale.name.*` stay exactly as they are and stay on /login -- see
  // LocaleSwitch's header for why both are correct in the place each applies.
  // Identical across catalogs for the same reason `locale.name.*` is: a
  // language's own tag is written the same way whoever is reading it.
  'locale.code.id': 'ID',
  'locale.code.en': 'EN',

  // ==========================================================================
  // V6 — history. `/history` is the route; `Jejak` is the word, because
  // `riwayat` is already the prompt fence tag in both locales (W5/R17) and one
  // word meaning two things in one codebase is how somebody greps the wrong
  // file at the worst moment. The account menu's own row is
  // `account.menu.history` and says `Riwayat bacaan`, which is V4's copy and
  // reads as a sentence rather than as a fence — that is fine and is not the
  // same string.
  //
  // UNLIKE W5's MEMORY BLOCK, THIS ONE HAS EMPTY-STATE AND ERROR COPY, and the
  // difference is deliberate. M14's silence is right for an AMBIENT feature the
  // querent did not ask for. The querent tapped a menu item called History;
  // silence there is a broken page, not tact.
  // ==========================================================================
  'history.title': 'Jejak',
  'history.hint': 'Bacaan yang pernah kamu ambil.',
  /*
   * THE WAY OUT, and it did not exist until now. `/history` mounted the account
   * circle and a title, and the only `href="/"` on the page was inside the EMPTY
   * state -- so a querent with readings had no route home but the browser's back
   * button. `/history/[id]` already had the affordance (`history.detail.back`), so
   * this is that one pattern across both history screens rather than two.
   *
   * `Beranda` rather than reusing `nav.back.readers` ("Pembaca lain"): from a list
   * of your own readings you were not looking at a reader, so "other readers" names
   * a place you have not been.
   */
  'history.home': '← Beranda',

  'history.filter.aria': 'Pilih hari',
  'history.filter.label': 'Tanggal',
  'history.filter.today': 'Hari ini',

  'history.count.one': '{count} bacaan',
  'history.count.other': '{count} bacaan',

  // Two empty states, and conflating them is the bug. The first tells someone
  // who HAS read that this particular day is quiet; the second tells someone
  // who never has that there is nothing here yet, which is a different sentence
  // and a different next step. Telling a first-time visitor "nothing on 27 July"
  // implies other days might have something and sends them hunting.
  'history.empty.day': 'Tidak ada bacaan pada {date}.',
  'history.empty.nearest': 'Lihat {date}',
  'history.empty.never.title': 'Belum ada jejak di sini.',
  'history.empty.never.body':
    'Setiap bacaan yang kamu ambil akan tersimpan di halaman ini, lengkap dengan kartunya.',
  'history.empty.never.action': 'Ambil bacaan pertama',

  'history.error': 'Jejakmu tidak bisa dibuka sekarang. Coba lagi sebentar.',

  // A row whose reading never finished. It is SHOWN -- the querent drew those
  // cards, and the frequency verdict already counts them -- so it has to say why
  // there is no text behind it, or opening it reads as a bug.
  'history.item.unfinished': 'Bacaan ini tidak selesai.',
  'history.item.shared': 'Dibagikan',

  'history.detail.back': '← Jejak',
  'history.detail.question': 'Pertanyaanmu',
  'history.detail.noBody': 'Tidak ada teks yang tersimpan untuk bacaan ini.',
  // The pulsing label while V2's translator streams. Same register and same job
  // as `reading.waiting`: it has to hold a screen for several seconds without
  // looking hung.
  'history.translating': 'Menerjemahkan…',

  // ── The yes/no verdict, rendered ──────────────────────────────────────────
  //
  // FROM `readings.verdict`, WHICH `effectiveYesNo()` DECIDED IN CODE AT DRAW
  // TIME. Never parsed out of the prose and never asked of the model — the same
  // rule that exists because letting the model choose produced answers
  // contradicting the card's own orientation. It matters most under translation:
  // a translated body's first word is whatever the translator produced, and this
  // is the fact that survives it untouched.

  // ── Sharing (V7) ──────────────────────────────────────────────────────────
  //
  // The one screen in this app a stranger can read, and the sheet that decides
  // what goes on it. Two things about this block are load-bearing:
  //
  //   - `share.sheet.lead` PROMISES the preview is exact, and it is: the sheet
  //     mounts the same `ReadingView` the public page mounts, with the toggles
  //     applied. If that ever stops being true, this string is a lie and it is
  //     the string a reviewer would read to catch it.
  //   - `share.sheet.warning` and `privacy.4.4` say the same sentence twice on
  //     purpose. Revoking does not un-send a screenshot, and that is the thing
  //     users would otherwise learn the hard way.
  'share.action': 'Bagikan',
  'share.sheet.title': 'Bagikan bacaan ini',
  'share.sheet.titlePersona': 'Bagikan Teratai Batinmu',
  'share.sheet.lead':
    'Siapa pun yang punya tautannya bisa membuka halaman ini. Beginilah tampilannya nanti.',
  // NOT a toggle any more (Miftah, 2026-07-28). The question is part of the
  // reading, so the copy STATES the exposure instead of offering a choice -- and
  // the preview underneath shows the exact text, which is what makes this
  // informed rather than merely announced.
  'share.sheet.questionIncluded':
    'Pertanyaanmu ikut ditampilkan, supaya yang membaca tahu bacaan ini tentang apa.',
  'share.sheet.includeNickname': 'Sertakan nama panggilanku',
  'share.sheet.includeNickname.hint': 'Ditampilkan sebagai "Bacaan untuk {nickname}".',
  'share.sheet.create': 'Buat tautan',
  'share.sheet.creating': 'Membuat tautan…',
  'share.sheet.cancel': 'Batal',
  'share.sheet.close': 'Tutup',
  'share.sheet.copy': 'Salin tautan',
  'share.sheet.copied': 'Tersalin',
  //   - `share.sheet.revoke` SAYS "SEMUA" ("all") SINCE 2026-07-28, and the word is
  //     the ruling. A reading can now hold one address per language, and revoke turns
  //     off every one of them -- a button reading "matikan tautan" beside a list of two
  //     would look like it killed the one it sits under. The string stays
  //     ENTITY-NEUTRAL ("tautan", not "bacaan ini") because this sheet also mounts with
  //     `entity="persona"`.
  'share.sheet.revoke': 'Matikan semua tautan',
  'share.sheet.revoking': 'Mematikan…',
  'share.sheet.revoked': 'Tautan itu sudah mati. Membagikan lagi akan membuat alamat baru.',
  'share.sheet.live': 'Tautan ini aktif.',
  //   - The three keys below are the per-language list (2026-07-28). `createIn` takes
  //     the LANGUAGE NAME from `locale.name.*`, which is written identically in both
  //     catalogs on purpose -- the label names the LINK's language, not the reader's.
  'share.sheet.links': 'Tautan yang aktif',
  'share.sheet.createIn': 'Buat tautan {language}',
  'share.sheet.loading': 'Memeriksa tautan…',
  'share.sheet.warning':
    'Mematikan tautan tidak menarik kembali tangkapan layar yang sudah diambil orang.',
  'share.error.notShareable': 'Bacaan ini tidak bisa dibagikan.',
  'share.error.generic': 'Tautan gagal dibuat. Coba lagi.',
  'share.error.rateLimit': 'Terlalu banyak tautan dalam satu jam. Coba lagi nanti.',
  'share.public.eyebrow': 'Bacaan yang dibagikan',
  'share.public.personaEyebrow': 'Teratai Batin yang dibagikan',
  'share.public.forNickname': 'Bacaan untuk {nickname}',
  'share.public.readBy': 'Dibacakan oleh {name}',
  'share.public.questionLabel': 'Pertanyaannya',
  // `share.public.otherLanguage` WAS HERE AND IS DELETED (Miftah's ruling,
  // 2026-07-28). It said "Bacaan ini ditulis dalam bahasa lain dan ditampilkan apa
  // adanya" and it described the pre-design-A mechanism: a share page rendering
  // whatever language the reading was GENERATED in. Design A pins the language the
  // SHARER was reading, so the sentence outlived the thing it explained. The `lang`
  // attribute on `/s/[slug]` carries the language now; `adapt.test.ts` asserts this
  // key stays absent. Do not add it back without reading that page's header.
  'share.public.cta': 'Coba sendiri',
  'share.public.ctaLead': 'Tiga pembaca, dua puluh dua kartu Major Arcana.',
  // ONE page for five different failures -- typo, revoked, deleted, never
  // existed, not shareable. It must say nothing about which, or a stranger with
  // one slug learns whether the account behind it still exists.
  'share.gone.title': 'Tautan ini tidak ada',
  'share.gone.body': 'Mungkin sudah dimatikan pemiliknya, atau alamatnya salah ketik.',
  'share.gone.action': 'Buka JMTarot',
  // The 429. A 404 here would tell somebody their friend's link is broken, which
  // is a lie they cannot act on; this is a fact they can.
  'share.busy.title': 'Terlalu banyak permintaan',
  'share.busy.body': 'Tunggu sebentar, lalu muat ulang halaman ini.',

  // ==========================================================================
  // V8 — `/account`. "Dirimu", not "Detail Pengguna": this is the screen that
  // tells someone which card the universe keeps handing them, and the register
  // of a bank app would undo it. `account.menu.details` already says "Tentang
  // kamu"; the page's own h1 is shorter because it has a heading's job.
  //
  // THE TWO GENERATED-LOOKING LINES ARE TEMPLATES (A8), and the reason is
  // register rather than cost: `frequency_verdicts` is generated because it
  // recurs on the picker daily and a template would read identically the fourth
  // time. `/account` is visited occasionally and its subject is IDENTITY, which
  // should be stable — a line that rephrased itself every visit would undercut
  // the claim it is making.
  //
  // `{topic}` COMES FROM THE READER'S OWN `specialties[locale][0]`, which is
  // already `Localized<>` in readers.json. Do not write a third copy of "what
  // Margaret is for".
  // ==========================================================================
  'account.title': 'Dirimu',
  'account.hint': 'Angka, tanda, dan kartu yang terus kembali kepadamu.',

  'account.facts.heading': 'Fakta',
  'account.facts.nickname': 'Nama panggilan',
  'account.facts.fullName': 'Nama lengkap',
  'account.facts.birthDate': 'Tanggal lahir',
  'account.facts.edit': 'Ubah',
  'account.facts.save': 'Simpan',
  'account.facts.cancel': 'Batal',
  'account.facts.saving': 'Menyimpan…',
  'account.facts.failed': 'Belum tersimpan. Coba lagi sebentar lagi.',
  'account.facts.invalid': 'Periksa lagi isinya.',

  'account.card.heading': 'Kartumu',
  'account.card.line':
    'Teratai Batinmu berwujud {card}. Kartu itu memilihmu berulang kali, dan yang dibawanya adalah {gloss}',
  'account.card.empty': 'Kartumu belum mengulang dirinya. Tariklah beberapa kali lagi.',
  // The zoom control's accessible name. Its only content is the artwork, whose own
  // alt text comes from `CardFace` — so this has to say what TAPPING does, not what
  // the image is, or a screen reader announces the card's name twice and the action
  // never. Same shape as `draw.card.aria.picked`, which is the slot row's version.
  'account.card.zoomAria': 'Lihat {name} lebih besar',

  // ── Your path (requirement 3), and the two things it now carries ───────────
  //
  // THE READER'S NAME IS A LINK on the page, to `/{reader.id}` — their own service
  // picker. It is still interpolated as ordinary text here and the page splits the
  // rendered string on it (`linkifyName`), so this value stays one sentence a
  // translator can read. Do NOT put markup or a placeholder pair in it.
  //
  // `{Subject}`/`{subject}` ARE A PRONOUN, capital and lowercase, and Indonesian is
  // the locale where that looks like pointless machinery: `dia` serves every reader,
  // so both params render the same word. It is here anyway because the ENGLISH half
  // needs the distinction and a per-locale template shape is how the two halves
  // silently stop being the same sentence. See `reader.pronoun.*` below.
  'account.reader.heading': 'Jalanmu',
  'account.reader.line':
    'Sebuah jalan terbuka ke {reader}, dan yang kamu bawa ke sana adalah {topic}. {Subject} akan menemanimu sejauh yang {subject} bisa.',
  // Requirement 3's last sentence, and it is the querent's own words. IT IS THE
  // ONLY LINE ON THE PAGE THAT IS ABOUT OBLIGATION RATHER THAN ABOUT THE
  // QUERENT, and that contrast is the point. Do not soften it and do not
  // translate it word for word — the English keeps its sense, not its grammar.
  'account.reader.closing':
    'Langit hanya membuka jalan bagi mereka yang sungguh-sungguh berusaha membuka gerbangnya sendiri.',
  'account.reader.empty': 'Jalanmu belum memilih pembacanya.',

  'account.persona.heading': 'Teratai Batin',
  'account.persona.a11yLabel': 'Gambaran tentang dirimu',
  // Unlike `FrequencyLine`, this block has a heading above it that the querent
  // came to read, so an empty space under it reads as broken (A9). M14's silence
  // is for a line that appears unbidden.
  'account.persona.loading': 'Membaca…',
  'account.persona.otherLanguage': 'Bagian ini ditulis dalam bahasa lain dan ditampilkan apa adanya.',

  'account.draw.cta': 'Tarik kartu',

  // ── Per-answer clearing (reconciliation §7.3) ─────────────────────────────
  //
  // IT SHIPS BECAUSE `/privacy` ALREADY PROMISES IT, TWICE, IN BOTH LOCALES —
  // clause 3 ("Bisa kamu hapus kapan saja, satu per satu, tanpa menghapus akun")
  // and clause 7. That made it a published promise of a control nobody could
  // perform, which is the exact mistake `/account` itself made for a release.
  //
  // ── SIX KEYS WERE DELETED HERE ON 2026-07-29 (Miftah's ruling) ────────────
  //
  // `answered` ("Tersimpan"), `empty`, `cleared`, `clear`, `clearing` and
  // `clearAria` are gone. The row is a button now: the question on the left, a
  // tick or an empty circle where the Clear control used to be, and a sheet with
  // the answer in it when you tap.
  //
  // **THE TWO STATE WORDS SURVIVE AS `state.*` AND ARE READ RATHER THAN SHOWN.**
  // An icon with no accessible name is a row that says nothing at all to a screen
  // reader, so removing the visible text made the label MANDATORY rather than
  // optional. Do not delete these two thinking the icon speaks for itself.
  //
  // `cleared` went with its state, and that is now correct: V8 tracked "just
  // cleared" for the life of the page because a row reverting to "Tidak dijawab"
  // read as if the button had done nothing. The sheet closes and the icon changes,
  // so there is nothing left to distinguish.
  //
  // THE HINT CHANGED TOO. It said the answers are not shown here ("Isinya tidak
  // ditampilkan di sini"), which is no longer true — leaving it would be the copy
  // contradicting the control directly beneath it.
  'account.answers.heading': 'Jawabanmu',
  'account.answers.hint':
    'Enam pertanyaan yang pernah kamu jawab. Ketuk salah satu untuk melihat, mengubah, atau menghapus jawabanmu.',
  'account.answers.state.answered': 'Sudah dijawab',
  'account.answers.state.empty': 'Belum dijawab',
  'account.answers.openAria': '{question} — {state}. Ketuk untuk membuka.',
  'account.answers.loading': 'Membuka…',
  'account.answers.emptyField': 'Belum ada jawaban.',
  'account.answers.save': 'Simpan',
  'account.answers.saving': 'Menyimpan…',
  'account.answers.remove': 'Hapus',
  'account.answers.removing': 'Menghapus…',
  'account.answers.cancel': 'Tutup',
  'account.answers.failed': 'Belum tersimpan. Coba lagi sebentar lagi.',
  // The Lotus is rewritten NOW; the Teratai Batin block waits for the next visit.
  // Said out loud because nobody would guess either half.
  'account.answers.note':
    'Mengubah atau menghapus satu jawaban langsung menulis ulang apa yang dibaca pembacamu. Teratai Batinmu menyusul saat kamu membuka halaman ini lagi.',

  // ==========================================================================
  // V8 — account deletion (VD13). The copy for a control `/privacy` §8 has
  // described for an entire release and nobody could perform.
  //
  // THE SHEET NAMES THE ONE THING THAT IS *NOT* RECOVERABLE, and that is the
  // whole reason there are three body strings instead of one. A page that
  // promises full restoration and then does not restore something is worse than
  // a page that says which part is gone -- and the part that is gone is the
  // moderation text, deleted now rather than in thirty days, because
  // `moderation_flags.user_id` is `on delete set null` and the row outlives the
  // account.
  //
  // `{days}` IS INTERPOLATED, NEVER TYPED AS 30. `profile.ts` exports
  // `ERASURE_GRACE_DAYS` precisely so the sweep and the copy cannot disagree,
  // and a hardcoded thirty here is how they would.
  //
  // IT SAYS "SIGN IN AGAIN WITH THE SAME GOOGLE ACCOUNT", NOT "CONTACT US",
  // because that is literally the mechanism `upsertUserOnSignIn` implements.
  // ==========================================================================
  'account.delete.trigger': 'Hapus akun',
  'account.delete.heading': 'Menghapus akunmu',
  'account.delete.body1':
    'Akunmu langsung berhenti bekerja. Bacaanmu, jawabanmu, dan Teratai Batinmu tidak lagi bisa dibuka.',
  'account.delete.body2':
    'Selama {days} hari kamu masih bisa memulihkannya: masuk lagi dengan akun Google yang sama. Setelah itu semuanya hilang dan tidak bisa dikembalikan.',
  'account.delete.body3':
    'Catatan moderasi yang pernah menyimpan tulisanmu dihapus sekarang juga, bukan setelah {days} hari.',
  // "Batal" and not "Jangan": the safe button cancels an action the querent
  // started, and Indonesian has a plain word for that. The ENGLISH one is
  // deliberately not `Cancel` -- see en.ts.
  'account.delete.cancel': 'Batal',
  'account.delete.confirm': 'Ya, hapus akunku',
  'account.delete.working': 'Menghapus…',
  'account.delete.failed': 'Belum berhasil. Coba lagi sebentar lagi.',

  // The goodbye line on `/login?deleted=1`. NOT threaded through
  // `errorMessage()`: a deletion is not an error and sharing that slot would
  // style it as one.
  'login.deleted.notice':
    'Akunmu sudah dihapus. Masuk lagi dalam {days} hari kalau kamu berubah pikiran.',

  'reading.verdict.yes': 'Ya',
  'reading.verdict.no': 'Tidak',
  'reading.verdict.maybe': 'Belum jelas',

  // --- The public surface (v0.4.0 / S1) -------------------------------------
  //
  // CHROME ONLY (S-D6). Lore and article prose live in `src/content/**`, one
  // module per locale, imported by the page that renders it -- because this
  // catalog is shipped ENTIRE, as JSON, to every visitor of every page including
  // the draw screen, and 22 lore documents x 2 locales is an order of magnitude
  // more than the 242 short strings here. `src/lib/i18n/prose.test.ts` makes that
  // mechanical: a value over 320 characters, or a catalog over 20,000 bytes,
  // fails.
  //
  // These are the shared keys. S3, S4, S5 and S6 add their own page's chrome to
  // THIS EDIT -- S1 folds every workstream's keys in, one file, one commit, the
  // same rule S-D13 applies to `events.ts`. A workstream does not open this file.

  /** The landing hero. `app.title` is the <h1>; this is the line under it. */
  'landing.tagline': 'Dua puluh dua Major Arcana, dibacakan oleh tiga pembaca.',
  'landing.lede':
    'Tarik kartumu, ajukan pertanyaanmu, dan dapatkan satu bacaan yang ditulis khusus untuk hari itu — dalam bahasa Indonesia atau Inggris.',
  'landing.signIn': 'Masuk untuk membaca',
  'landing.hero.alt': 'Kartu {name}',

  /** Four blocks, each at most one link. The order on screen is the order here. */
  'landing.gallery.title': 'Lihat dua puluh dua kartunya',
  'landing.gallery.body':
    'Setiap Major Arcana, digambar ulang untuk aplikasi ini. Ketuk satu kartu untuk melihatnya besar.',
  'landing.gallery.link': 'Buka galeri',
  'landing.arcana.title': 'Arti setiap kartu',
  'landing.arcana.body':
    'Satu halaman per kartu: angka, unsur, lambang, arti tegak dan terbalik, serta ceritanya.',
  'landing.arcana.link': 'Mulai dari The Moon',
  'landing.readers.title': 'Tiga pembaca, tiga suara',
  'landing.readers.body':
    'Thessaly, Margaret dan Adrian membaca kartu yang sama dengan cara yang tidak sama.',
  'landing.blog.title': 'Tulisan',
  'landing.blog.body': 'Cara membaca tarot, dijelaskan tanpa istilah yang membingungkan.',
  'landing.blog.link': 'Baca tulisannya',

  /**
   * The shared public footer (S1), mounted by every public content page.
   *
   * NO `otherLanguage` KEY HERE. R17 makes `PublicShell` mount S2's
   * `ContentLocaleLink`, which names each language IN ITS OWN LANGUAGE through
   * the existing `locale.name.*` pair -- because the reader of that control
   * cannot, by definition, read the locale they are currently in.
   */
  'public.footer.gallery': 'Galeri',
  'public.footer.arcana': 'Arti kartu',
  'public.footer.blog': 'Tulisan',
  'public.footer.app': 'Buka aplikasinya',
  'public.footer.brandLine': 'JMTarot — bacaan Major Arcana.',

  /** S-D8's control. NOT `/api/share` -- the page's own URL is already public. */
  'public.share.button': 'Bagikan halaman ini',
  'public.share.copied': 'Tautan disalin.',
  'public.share.failed': 'Tidak bisa menyalin. Salin dari bilah alamat.',

  /** Breadcrumb labels. English card names stay English (`## Card data`). */
  'public.crumb.home': 'JMTarot',
  'public.crumb.gallery': 'Galeri',
  'public.crumb.blog': 'Tulisan',

  /**
   * ── S3: `/gallery`, the twenty-two cards as a catalogue ───────────────────
   *
   * CHROME ONLY, and there is remarkably little of it: the page's subject is the
   * art, and every word ABOUT a card -- its name, its numeral, its keywords, both
   * glosses -- is already in `cards.json` and already localised. Nine keys render
   * twenty-two tiles.
   *
   * **`gallery.card.alt` IS A SINGLE LITERAL AND MUST NEVER BE BUILT WITH `+`.**
   * A concatenated value has type `string` rather than a literal type, so its
   * `{placeholders}` are not derived and `t()` silently stops checking the
   * params. This one has three, and it is the only value in this catalog whose
   * output is INDEXED CONTENT -- `alt` is what Google Images reads, and the art
   * is the one asset a competitor cannot copy. `src/app/gallery/alt.ts` derives
   * twenty-two distinct sentences per locale from it.
   *
   * **`gallery.card.zoomAria` IS NOT A REUSE OF `account.card.zoomAria`**, whose
   * Indonesian is today the identical sentence. V8's precedent for reuse is
   * `history.home`, and that holds because "Home" cannot drift; this one can and
   * will -- the moment somebody makes `/account`'s label say *"Lihat kartumu
   * lebih besar"* (**your** card), the gallery says "see your card larger" about
   * The Moon, on a public page, with nothing failing. A key named `account.*`
   * doing work on `/gallery` is a trap for whoever next edits `/account`.
   *
   * The two orientation labels the zoom sheet needs are `card.upright` /
   * `card.reversed`, up beside the card detail block. Not `gallery.*`: three
   * surfaces render them.
   */
  'gallery.meta.title': 'Galeri Major Arcana — 22 kartu tarot | JMTarot',
  'gallery.meta.description':
    'Lihat semua 22 kartu Major Arcana: gambar aslinya, arti tegak dan terbaliknya, serta kata kunci tiap kartu.',
  'gallery.eyebrow': 'Galeri',
  'gallery.title': '22 Kartu Major Arcana',
  'gallery.hint': 'Ketuk kartu untuk melihatnya lebih besar.',
  'gallery.card.alt': 'Kartu tarot {name}, Major Arcana {numeral}: {keywords}',
  'gallery.card.zoomAria': 'Lihat {name} lebih besar',
  'gallery.card.lore': 'Baca maknanya',

  /**
   * ── S4: `/arcana/<slug>`, the twenty-two lore pages ───────────────────────
   *
   * CHROME ONLY. Every word of the lore itself lives in `src/content/arcana/**`
   * and never here (S-D6): twenty-two documents per locale is an order of
   * magnitude more prose than this whole catalog, and `LocaleProvider` hands the
   * client ONE resolved bundle -- so a lore paragraph in here would be serialised
   * into the RSC payload of every visitor of every page, including the draw
   * screen.
   *
   * **KEEP EVERY LABEL ONE OR TWO SHORT WORDS.** `.label` is
   * `text-transform: uppercase` in the fact strip, which is what turned
   * `What you are called` into `WHAT YOU ARE CALLED` over two rows on `/account`.
   *
   * **THE VERDICT WORDS ARE `reading.verdict.*` AND ARE NOT DUPLICATED HERE.**
   * They must be the SAME WORDS the app prints after a real yes/no reading; a
   * second key is how the lore page and the reading eventually disagree about
   * what `maybe` is called.
   *
   * **THE SAME RULE TOOK `arcana.upright` / `arcana.reversed` AWAY** (S3). The
   * two orientation words are `card.upright` / `card.reversed`, up beside the
   * card detail block, because three surfaces render them: the draw screen's
   * overlay, `/gallery`'s zoom sheet and this page's two section headings.
   */
  'arcana.verdict': 'Ya atau tidak',
  'arcana.lore': 'Asal-usul kartu',
  'arcana.inSpread': 'Dalam bacaan',
  'arcana.questions': 'Pertanyaan yang sering muncul',
  'arcana.neighbours': 'Kartu sebelum dan sesudah',
  'arcana.related': 'Kartu yang berdekatan',
  'arcana.related.root': 'akar angkanya',
  'arcana.related.element': 'satu unsur',
  'arcana.related.stage': 'satu tahap',
  'arcana.gallery': 'Lihat semua 22 kartu',

  /** The fact strip. One or two words each -- see the block above. */
  'arcana.facts.numeral': 'Angka',
  'arcana.facts.element': 'Unsur',
  'arcana.facts.stage': 'Tahap',
  'arcana.facts.polarity': 'Muatan',
  'arcana.facts.attribution': 'Lambang',
  'arcana.facts.modality': 'Sifat',
  'arcana.facts.keywords': 'Kata kunci',

  /**
   * The enum VALUES stay English in the data and the displayed WORD is a key --
   * `reading.verdict.{yes,no,maybe}` is the existing precedent for exactly this.
   */
  'arcana.element.fire': 'Api',
  'arcana.element.earth': 'Tanah',
  'arcana.element.air': 'Udara',
  'arcana.element.water': 'Air',
  'arcana.stage.beginning': 'Permulaan',
  'arcana.stage.trial': 'Ujian',
  'arcana.stage.reckoning': 'Perhitungan',
  'arcana.polarity.light': 'Terang',
  'arcana.polarity.shadow': 'Bayangan',
  'arcana.polarity.neutral': 'Netral',
  'arcana.modality.cardinal': 'Kardinal',
  'arcana.modality.fixed': 'Tetap',
  // 'Mutable' is a loanword Indonesian astrology writing does use, and it is the
  // one modality whose borrowed form is identical in both catalogs -- which
  // catalog.test.ts reads, correctly, as a key pasted across to make the typecheck
  // go green. 'Berubah' is the ordinary word and says the same thing.
  'arcana.modality.mutable': 'Berubah',

  /**
   * ── S5: the wallpaper download control ────────────────────────────────────
   *
   * CHROME ONLY (S-D6). Eight keys, declared in
   * `docs/plans/2026-07-28-wallpapers.md`'s `## Deltas requested` D4 for S1 to
   * fold in; **S1 landed without them, so S5 wrote them itself** — the
   * single-owner rule exists to stop six agents editing this file in parallel,
   * and there is no longer a parallel agent to collide with.
   *
   * **THERE IS DELIBERATELY NO `wallpaper.failed`.** Every branch of the control
   * ends in a download — the share path falls back to the browser's own, and the
   * browser's own is the default — so the only string that could render there is
   * one that never legitimately does. The one outcome that produces no file is
   * the person tapping Cancel on the share sheet, which is not a failure and must
   * not be announced as one.
   *
   * `wallpaper.saveHint` NAMES iPhone EXPLICITLY, which is unusual for this app's
   * copy and is the point: iOS is the platform where `<a download>` lands the file
   * in Files while *Set Wallpaper* reads only from Photos, so this sentence IS the
   * fallback mechanism when the Web Share sheet is unavailable.
   *
   * The dimensions are in the aria labels rather than only in the `<span>` because
   * a screen reader user choosing between two downloads needs the same fact the
   * sighted label carries; `1024 kali 1536` rather than `1024x1536` because that
   * is how the number is read aloud.
   */
  'wallpaper.heading': 'Unduh gambarnya',
  'wallpaper.card': 'Gambar kartu',
  'wallpaper.phone': 'Wallpaper ponsel',
  'wallpaper.cardAria': 'Unduh gambar kartu {card}, 1024 kali 1536 piksel',
  'wallpaper.phoneAria': 'Unduh wallpaper ponsel {card}, 1440 kali 3120 piksel',
  'wallpaper.saveHint':
    'Di iPhone: buka gambarnya, tekan agak lama, lalu pilih Tambahkan ke Foto.',
  'wallpaper.licence':
    'Gambar kartu ini milik JMTarot. Kamu boleh menyimpannya dan memakainya sebagai ' +
    'wallpaper pribadi. Bukan untuk dijual, ditempel ke barang dagangan, atau dipakai ' +
    'secara komersial.',
  'wallpaper.licenceLink': 'Syarat & Ketentuan bagian 9',

  /*
   * ── The blog (S6, v0.4.0) ──────────────────────────────────────────────────
   *
   * **CHROME ONLY. NO PROSE** (S-D6, I9). An article's `title` and `description`
   * live on its `BlogDoc` in `src/content/blog/`, imported by the server page that
   * renders them and by nothing else. Putting them here would ship ~5,800 words of
   * article, in both languages, to every visitor of every page including the draw
   * screen — which is the exact cost S-D6 exists to refuse, and it would be four
   * values today and ninety the day the lore pages want the same thing.
   *
   * `blog.readingTime` IS A PLURAL FAMILY and the Indonesian pair is IDENTICAL on
   * purpose (I5): CLDR gives `id` only `other`, so an Indonesian `.one` that differed
   * would be a string somebody edited believing it renders. `catalog.test.ts` asserts
   * the pair matches.
   *
   * **THE SHARE CONTROL REUSES `public.share.*` AND MINTS NOTHING.** S6's plan §D4
   * asked for `content.share.action` / `.copied`; S1 had already shipped
   * `public.share.{button,copied,failed}` and `PublicShare` renders them, so a second
   * pair would be two words for one button — the `arcana.upright` mistake S3 records.
   */
  'blog.index.title': 'Tulisan',
  'blog.index.description':
    'Tulisan tentang tarot: cara membacanya, mitosnya, dan apa yang sebenarnya bisa dilakukan dengan setumpuk kartu.',
  'blog.index.lede':
    'Bacaan panjang tentang tarot, untuk dibaca sebelum atau sesudah menarik kartu.',
  'blog.readMore': 'Baca selengkapnya',
  'blog.published': 'Terbit {date}',
  'blog.updated': 'Diperbarui {date}',
  'blog.readingTime.one': 'sekitar {count} menit',
  'blog.readingTime.other': 'sekitar {count} menit',
  'blog.inThisArticle': 'Di dalam tulisan ini',
  'blog.backToIndex': 'Semua tulisan',
  'blog.notFound.title': 'Tulisan itu tidak ada',
  'blog.notFound.body':
    'Mungkin alamatnya salah, atau tulisan ini belum tersedia dalam bahasa yang kamu pakai.',
  'blog.orient.title': 'Kalau baru mulai',
  'blog.orient.gallery': 'Lihat ke-22 Major Arcana',
  'blog.orient.firstCard': 'Mulai dari The Fool',
  'blog.orient.feared': 'Kartu Death, dan kenapa ia tidak seperti dugaanmu',
} as const satisfies Record<string, string>;

export default id;

/** Every key in the app. The union, not a subtree walk (I1). */
export type MessageKey = keyof typeof id;

/**
 * The shape `en.ts` must satisfy exactly.
 *
 * `Record<MessageKey, string>` and not `typeof id`: the English values are
 * ordinary strings, not the Indonesian literals. A missing key is TS2739; an
 * extra key is TS2353, the excess-property check on an object literal against a
 * declared type. Both name the key, both at `npm run typecheck`.
 */
export type Catalog = Record<MessageKey, string>;

/**
 * The Indonesian catalog's literal types, for `format.ts`'s parameter
 * derivation. Exported as a type so `format.ts` can reach the literals without
 * a runtime import of this module — which is what keeps both catalogs out of the
 * client bundle. See `catalog.ts`'s header.
 */
export type Messages = typeof id;
