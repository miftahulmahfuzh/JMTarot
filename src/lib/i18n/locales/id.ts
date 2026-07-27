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
 * believing it renders. The practical consequence is that Indonesian cannot
 * spell a count as a word inside a plural family — `Ketuk satu kartu` had to
 * become `Ketuk {count} kartu` — and that is the price of not pushing
 * `n === 1 ?` into six workstreams' components.
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

  // --- Service picker -------------------------------------------------------
  'picker.service.eyebrow': 'Pilih layanan',
  'picker.service.cardCount.one': '{count} kartu',
  'picker.service.cardCount.other': '{count} kartu',

  // --- Draw screen ----------------------------------------------------------
  'draw.hint.complete':
    'Kartumu sudah terbuka. Ketuk salah satu untuk melihatnya lebih besar.',
  'draw.hint.tap.one': 'Ketuk {count} kartu, atau tarik ke atas.',
  'draw.hint.tap.other': 'Ketuk {count} kartu, atau tarik ke atas.',
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
  'onboarding.q.worst_thing.hint':
    'Sesedikit atau sebanyak yang kamu mau. Jawaban ini disimpan terkunci, tidak ' +
    'pernah ditampilkan lagi, dan tidak pernah dikutip di dalam bacaanmu. ' +
    'Melewatinya tidak mengurangi apa pun.',

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
  'onboarding.q.most_loved.hint':
    'Cukup sebut siapa dia bagimu. Namanya tidak akan pernah muncul di dalam bacaan.',

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
