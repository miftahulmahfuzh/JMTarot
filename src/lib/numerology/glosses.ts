/**
 * One written line per correspondence, per locale. Thirty-one keys, sixty-two
 * strings.
 *
 * WHY THESE ARE NOT IN THE MESSAGE CATALOG (roadmap §5, plan N10). They are
 * DUAL-ROLE COPY: a prompt consumes them and `/account` displays them. That is
 * the `positionFraming` precedent (I14) and the `cardMeaning` precedent, and the
 * reason is the same both times — splitting one string across two systems
 * guarantees the screen and the prompt eventually disagree about what the number
 * means. This directory is also forbidden to import `@/lib/i18n/**`, so the
 * catalog is not even reachable from here.
 *
 * WRITTEN, NOT TRANSLATED, IN BOTH DIRECTIONS — W6's rule 3, applied again.
 * The mechanism, so a reviewer can check it in five seconds:
 *
 *     THE INDONESIAN HALF IS BUILT ON CONCRETE PHYSICAL IMAGES.
 *     THE ENGLISH HALF IS BUILT ON ACTION AND CONSEQUENCE.
 *     If an English gloss names the object its Indonesian counterpart names,
 *     it was translated, and one of the two has to be rewritten.
 *
 * Read three number keys. The Indonesian should let you SEE something — a rope,
 * a cart wheel, a lamp on a table late at night. The English should show you
 * nothing and tell you what the number DOES and what it COSTS. `glosses.test.ts`
 * holds a twelve-row DIVERGENCE table that fails if the English gloss contains
 * the English word for the Indonesian image.
 *
 * THE ELEMENT GLOSSES ARE EXEMPT FROM THAT TABLE, deliberately: they name the
 * element itself (`Api:` / `Fire`), which is a fixed term and not an image.
 * Their divergence is in the clause after the colon and is checked by eye.
 *
 * EVERY GLOSS NAMES A COST, NOT ONLY A VIRTUE. "Stable and reliable" is
 * horoscope filler and it is exactly the failure the v0.3.0 risk table logs
 * against this release — replacing a tally with vague cosmic language is a
 * longer version of the same problem, not a fix.
 *
 * IMPERSONAL. No "you", no imperative, no address. The prompt turns a gloss into
 * second person; `/account` prints it under a numeral, where an address would
 * read as a fortune cookie shouting at the reader. There is a test.
 *
 * NO THERAPY, DIAGNOSIS OR HEALING LANGUAGE IN EITHER LOCALE, and the constraint
 * binds harder here than in a reading: a gloss is REUSED, so one bad word appears
 * in every persona forever. `anxiety` is still not forbidden and is still not
 * used. The Malay grep, the therapy lists and the `en` tic list come from
 * `@/lib/copy/vocab` and run over these tables in `glosses.test.ts`, because
 * nothing else greps a static table.
 */
import type { Element, Locale, Localized } from '@/data/types';
import type { Modality, ZodiacSign } from './astrology';
import type { GlossNumber } from './reduce';

/**
 * `Record<GlossNumber, …>` and not `Record<number, …>`: a missing key is then a
 * compile error, which is the same argument `Localized<T>` makes one level down.
 * There is no fallback and there is no unknown key by construction, so
 * `catalogFor`'s I3 rule ("an unknown key returns THE KEY") does not apply.
 */
export const NUMBER_GLOSSES: Record<GlossNumber, Localized<string>> = {
  1: {
    id: 'Awal yang berdiri sendiri: satu langkah dulu, jalannya belakangan.',
    en: 'Acts first, and answers for whatever follows from acting first.',
  },
  2: {
    id: 'Dua tali yang harus ditarik bersamaan; satu tangan saja tidak cukup.',
    en: 'Nothing moves here until two people agree, so patience does most of the work.',
  },
  3: {
    id: 'Suara yang keluar duluan, sebelum kalimatnya selesai disusun.',
    en: 'Makes things by talking about them, and scatters about half of what it makes.',
  },
  4: {
    id: 'Batu, tiang, pagar — yang dipasang pelan supaya tidak roboh.',
    en: 'Slow work that holds, bought with freedom given up early.',
  },
  5: {
    id: 'Angin yang tidak betah diam; begitu ada celah, dia lewat.',
    en: 'Change arrives faster than the plan for it, and routine loses.',
  },
  6: {
    id: 'Beban yang dipikul karena sayang, bukan karena disuruh.',
    en: 'Takes responsibility for other people, and is tired in a way it chose.',
  },
  7: {
    id: 'Satu lampu di meja larut malam, dan pertanyaan yang dibawa masuk sendirian.',
    en: 'Prefers understanding to company, so the answers arrive late and arrive whole.',
  },
  8: {
    id: 'Roda gerobak yang berat: susah didorong, susah dihentikan.',
    en: 'Effort converts into result here, and the result is counted in public.',
  },
  9: {
    id: 'Panen terakhir, lalu ladangnya sengaja dikosongkan untuk yang berikutnya.',
    en: 'Finishes a thing and hands it on, which costs more than starting did.',
  },
  11: {
    id: 'Kawat telanjang: kabarnya lewat lebih dulu daripada penjelasannya.',
    en: 'Senses a thing before there is evidence for it, and lives with knowing early.',
  },
  22: {
    id: 'Gambar besar di kepala yang akhirnya berdiri jadi bangunan sungguhan.',
    en: 'An intention big enough that most people would have left it a daydream.',
  },
  33: {
    id: 'Rumah yang pintunya selalu terbuka, dan capeknya jarang dihitung.',
    en: 'Care given at a scale where it stops being personal and starts being work.',
  },
};

export const SIGN_GLOSSES: Record<ZodiacSign, Localized<string>> = {
  aries: {
    id: 'Pemantik yang menyala di gesekan pertama, sebelum sempat ditimbang.',
    en: 'Begins before the plan is finished, and is usually why anything began.',
  },
  taurus: {
    id: 'Genggaman yang tidak buru-buru dan tidak gampang dilepas.',
    en: 'Refuses to be hurried, and keeps whatever it has decided to keep.',
  },
  gemini: {
    id: 'Dua jendela dibuka sekaligus, dan anginnya masuk dari dua arah.',
    en: 'Thinks out loud in two directions, and changes its mind where people can see.',
  },
  cancer: {
    id: 'Cangkang keras di luar supaya yang di dalam boleh lunak.',
    en: 'Remembers what was said years ago, and stands in front of the people it keeps.',
  },
  leo: {
    id: 'Panggung kecil, dan orang yang benar-benar senang berdiri di atasnya.',
    en: 'Gives in the open, and notices exactly when nobody is looking.',
  },
  virgo: {
    id: 'Jarum dan benang: jahitan kecil yang tidak kelihatan tapi menahan.',
    en: 'Corrects the small wrong thing everyone else agreed to live with.',
  },
  libra: {
    id: 'Dua piring timbangan yang terus disamakan sampai tangannya pegal.',
    en: 'Weighs the other side so well that choosing becomes the hard part.',
  },
  scorpio: {
    id: 'Permukaannya tenang; yang dicari selalu ada di dasar.',
    en: 'Goes to the bottom of a thing, and does not report back until it has.',
  },
  sagittarius: {
    id: 'Anak panah yang dilepas jauh, kadang sebelum petanya dibuka.',
    en: 'Wants the larger point, and says the blunt part out loud on the way there.',
  },
  capricorn: {
    id: 'Tangga yang dinaiki satu-satu, tanpa banyak bunyi.',
    en: 'Plays a long game, and pays for it early rather than late.',
  },
  aquarius: {
    id: 'Berdiri agak jauh supaya seluruh ruangannya kelihatan.',
    en: 'Argues for how the thing should work for everybody, from slightly outside it.',
  },
  pisces: {
    id: 'Bentuknya ikut wadah, dan batasnya jadi samar.',
    en: 'Takes on the weather of whatever room it enters, then makes something of it.',
  },
};

export const ELEMENT_GLOSSES: Record<Element, Localized<string>> = {
  fire: {
    id: 'Api: cepat, terang, dan cepat habis kalau tidak dijaga.',
    en: 'Fire moves first and asks what it cost afterwards.',
  },
  earth: {
    id: 'Tanah: lambat, padat, dan menahan apa pun yang ditaruh di atasnya.',
    en: 'Earth wants the thing to still be standing next year.',
  },
  air: {
    id: 'Udara: bergerak lewat kata, jarak, dan alasan.',
    en: 'Air explains, argues, and needs a reason before it will move.',
  },
  water: {
    id: 'Air: ikut bentuk, ingat lama, dan merembes ke mana-mana.',
    en: 'Water reads the room before anyone speaks, and remembers what it read.',
  },
};

export const MODALITY_GLOSSES: Record<Modality, Localized<string>> = {
  cardinal: {
    id: 'Yang memulai: mendorong duluan, ributnya belakangan.',
    en: 'Starts the thing. Whether anyone was ready is a question it does not wait for.',
  },
  fixed: {
    id: 'Yang bertahan: sudah dipasang, susah digeser.',
    en: 'Keeps the position long after the argument for it has moved on.',
  },
  mutable: {
    id: 'Yang menyesuaikan: berubah bentuk supaya tetap bisa lewat.',
    en: 'Fits itself to what the situation turned into, which reads as inconsistency.',
  },
};

export function numberGloss(n: GlossNumber, locale: Locale): string {
  return NUMBER_GLOSSES[n][locale];
}

export function signGloss(sign: ZodiacSign, locale: Locale): string {
  return SIGN_GLOSSES[sign][locale];
}

export function elementGloss(element: Element, locale: Locale): string {
  return ELEMENT_GLOSSES[element][locale];
}

export function modalityGloss(modality: Modality, locale: Locale): string {
  return MODALITY_GLOSSES[modality][locale];
}
