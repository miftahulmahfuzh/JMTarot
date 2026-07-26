/**
 * The onboarding copy, in Indonesian.
 *
 * THIS FILE IS A STAGING POST FOR W6's MESSAGE CATALOG, AND MIGRATING IT MUST BE
 * A FIND-AND-REPLACE. The keys below are exactly the `onboarding.*` keys W3's
 * plan §4 hands W6, spelled identically, so when `src/lib/i18n/locales/id.ts`
 * lands the move is: copy these entries in, replace `c('onboarding.x')` with
 * `t('onboarding.x')`, delete this file. Do not rename a key here to something
 * that reads better locally -- the name IS the interface.
 *
 * **THE ENGLISH IS W6's TO WRITE NATIVELY, NOT TO TRANSLATE.** Same rule as the
 * reader personas, for the same reason: this copy is doing atmospheric work, and
 * translated atmosphere reads as translated. The one exception is
 * `onboarding.lotusName`, which is a proper noun -- `"Teratai Batin"` in `id`,
 * `"Inner Heavenly Lotus"` in `en` -- and is the single key W6 should not
 * exercise judgement on.
 *
 * WHY THE COPY READS THE WAY IT DOES (plan §4). Miftah's brief was exactly
 * right as a brief and wrong as copy, in four ways, and the fixes are the
 * reusable part:
 *
 *   - NO MECHANISM. Never "that we build based on your answers". Explaining the
 *     machine reveals an engineer behind the curtain. The invitation says what
 *     the Lotus DOES -- the cards know which way to fall -- and never what it is
 *     or who makes it.
 *   - NO "WE". A reader and a querent are in the room; a company is not.
 *   - SHORT LINES. This is a phone.
 *   - PERMISSION TO REFUSE ARRIVES FIRST, before the first question rather than
 *     after the last.
 *
 * The register is the readers' own -- Margaret's patience without her
 * subordinate clauses, since this copy is in no single reader's voice.
 *
 * THE NAME IS "TERATAI BATIN", NOT "TERATAI LANGIT BATIN". Three stacked nouns
 * is not a name, and `langit` in Indonesian reaches for the meteorological
 * before it reaches for the celestial. The "heavenly" part moved into the prose
 * of the invitation, where it works as an image instead of as a modifier.
 *
 * INDONESIAN, NOT MALAY (CLAUDE.md). `karier` not `kerjaya`, `kamu` not `awak`,
 * `ngobrol` not `sembang`, `arah hidup` not `hala tuju`. Note that `boleh` on
 * its own is ordinary Indonesian and appears below on purpose; the Malay tells
 * are the phrase forms.
 */

/**
 * A flat record rather than a nested object, because the keys are dotted paths
 * in W6's catalog and nesting them here would mean un-nesting them there.
 */
export const ONBOARDING_COPY_ID = {
  // --- The name -----------------------------------------------------------
  'onboarding.lotusName': 'Teratai Batin',

  // --- Step 0: the invitation ---------------------------------------------
  'onboarding.intro.eyebrow': 'TERATAI BATIN',
  'onboarding.intro.title': 'Sebelum kartu pertama',
  /*
   * The middle line is the whole trick: it says what the Lotus does and never
   * what it is. "dari bentuk teratai itulah kartu tahu harus jatuh ke arah
   * mana" gives the mechanism a shape without admitting there is a mechanism.
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

  // --- Step 1: the facts --------------------------------------------------
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

  // --- Steps 2-7: the six -------------------------------------------------
  //
  // Each is a title (the question), one framing line (the mystical register)
  // and one hint (scope, and the practical truth). The hint is where honesty
  // lives; the framing is where atmosphere lives. They stay on separate lines
  // so neither contaminates the other.

  'onboarding.q.best_thing.title': 'Hal terbaik yang pernah ada dalam hidupmu',
  'onboarding.q.best_thing.framing':
    'Setiap orang menyimpan satu titik terang. Pembacamu ingin tahu di mana letak terangmu.',
  'onboarding.q.best_thing.hint':
    'Boleh sebuah benda, boleh seseorang, boleh satu pertemuan, satu perjalanan, satu buku.',

  /*
   * THE ENUMERATED EXAMPLES ARE DELIBERATELY ABSENT (L6, ratified as
   * reconciliation §7.4 at Miftah's explicit direction). Roadmap §8 described
   * this question as naming rape, suicide, murder and domestic violence. It
   * does not name them, and the reason is recorded so nobody restores the list
   * later as a missing requirement: a list of extremes turns an open question
   * into a menu and primes the worst item on it. It also reads as ghoulish
   * rather than solemn. The question is answerable without them.
   *
   * PERMISSION TO DECLINE IS IN THE FRAMING LINE, NOT THE HINT, so it arrives
   * before the field is even focused. This is also the only step whose hint
   * names the encryption -- this is the question where a user is entitled to
   * ask what happens to the string -- and the only step where Skip sits beside
   * Continue at equal weight rather than below it.
   *
   * Nothing here is jocular, nothing is decorated, and nothing acknowledges the
   * answer after it is given. An "ouch, that's heavy" would be the worst line
   * in the app.
   */
  'onboarding.q.worst_thing.title': 'Hal paling berat yang pernah kamu saksikan',
  'onboarding.q.worst_thing.framing':
    'Yang gelap pun ikut membentuk. Tapi kamu tidak perlu menceritakannya di sini.',
  'onboarding.q.worst_thing.hint':
    'Sesedikit atau sebanyak yang kamu mau. Jawaban ini disimpan terkunci, tidak ' +
    'pernah ditampilkan lagi, dan tidak pernah dikutip di dalam bacaanmu. ' +
    'Melewatinya tidak mengurangi apa pun.',

  /*
   * The framing and the hint together are L11 stated as copy rather than as an
   * engineering note, and that is deliberate: a promise the user can read is a
   * promise the code has to keep. `lotusSafetyCheck()`'s proper-name rejection
   * is what keeps it, which is why reconciliation §7.5 calls that check
   * load-bearing rather than defensive.
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

  // --- Step 8: the close --------------------------------------------------
  //
  // NO "your avatar is being woven", NO progress indicator, here or on the
  // reader picker. The distillation runs in after() and may not have finished
  // when the user arrives: a line claiming it is ready would be false, a
  // spinner would be a wait we just decided not to impose, and "still working"
  // would draw attention to plumbing. "Sudah cukup" is true whenever it is read.
  'onboarding.done.title': 'Sudah cukup.',
  'onboarding.done.body':
    'Yang kamu tulis tidak akan ditampilkan kembali di mana pun. Ia hanya ikut ' +
    'duduk di belakang pembacamu.',
  'onboarding.done.cta': 'Pilih pembacamu',

  // --- Controls -----------------------------------------------------------
  'onboarding.actions.next': 'Lanjut',
  'onboarding.actions.back': 'Kembali',
  'onboarding.actions.skip': 'Lewati pertanyaan ini',
  'onboarding.actions.finish': 'Selesai',
  /** Takes `{n}` and `{total}`. */
  'onboarding.progress': '{n} / {total}',

  // --- Errors -------------------------------------------------------------
  'onboarding.error.saveFailed': 'Belum tersimpan. Coba lagi.',
  'onboarding.error.required': 'Bagian ini belum diisi.',
  'onboarding.error.tooLong': 'Terlalu panjang. Ringkas sedikit.',

  /*
   * NOT in plan §4's key list, and added because the resume case needs a
   * sentence that does not exist anywhere else: the server deliberately never
   * sends answer TEXT back to the browser (Task 3), so a revisited step shows
   * an empty field and has to say why rather than looking like lost data.
   * Flagged for W6 as an addition rather than smuggled in.
   */
  'onboarding.answerSaved': 'Jawabanmu sudah tersimpan. Kalau kamu menulis lagi, yang baru menggantikannya.',
} as const;

export type OnboardingCopyKey = keyof typeof ONBOARDING_COPY_ID;

/**
 * Look up a string, with `{placeholder}` interpolation.
 *
 * Named `c()` and not `t()` ON PURPOSE. When W6 lands, `t()` will be the real
 * catalog lookup with a locale behind it, and having this stand-in share the
 * name would make the migration invisible in a diff -- the call sites would
 * already compile and would silently keep reading Indonesian. A different name
 * means the compiler lists every site that still has to move.
 */
export function c(
  key: OnboardingCopyKey,
  vars?: Record<string, string | number>,
): string {
  const raw = ONBOARDING_COPY_ID[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}
