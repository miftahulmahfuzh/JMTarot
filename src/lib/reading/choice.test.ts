import { describe, expect, it } from 'vitest';

import {
  CHOICE_MARKER,
  CHOICE_MAX_CHARS,
  MARKER_SCAN_LIMIT,
  splitChoiceMarker,
  validateChoice,
} from './choice';

/**
 * The marker's whole job is to never reach a screen, and the only way it does is
 * a chunk boundary. So the split tests are exhaustive over splits rather than
 * illustrative -- see `renders in every chunk split` below, which is the case
 * that would have caught it.
 */

const READING = `Yang udah lewat — The World (terbalik) rasanya seperti kamu sudah selesai.

Yang sekarang — The Hanged Man muncul lagi.`;

const WITH_MARKER = `${CHOICE_MARKER} Ayam\n\n${READING}`;

describe('splitChoiceMarker', () => {
  it('leaves a reading with no marker completely alone', () => {
    const out = splitChoiceMarker(READING, true);
    expect(out.choice).toBeNull();
    expect(out.body).toBe(READING);
    expect(out.pending).toBe(false);
  });

  it('lifts the choice off the first line and drops the blank line with it', () => {
    const out = splitChoiceMarker(WITH_MARKER, true);
    expect(out.choice).toBe('Ayam');
    expect(out.body).toBe(READING);
  });

  it('accepts the marker in any case, because a model will vary it', () => {
    const out = splitChoiceMarker(`Pilihan: Ikan\n\n${READING}`, true);
    expect(out.choice).toBe('Ikan');
    expect(out.body).toBe(READING);
  });

  /**
   * THE NEGATIVE CONTROL FOR THE CASE-INSENSITIVITY ABOVE. A reading whose first
   * word merely starts with the same letters must not lose its first line.
   */
  it('does not fire on a first line that only looks like the marker', () => {
    const prose = 'Pilihanmu hari ini bukan soal benar atau salah.\n\nLanjutannya.';
    const out = splitChoiceMarker(prose, true);
    expect(out.choice).toBeNull();
    expect(out.body).toBe(prose);
  });

  /**
   * **THE CASE THE WHOLE MODULE EXISTS FOR.** `Draw.tsx` calls this on every
   * chunk with the text accumulated so far, and the marker arrives split at an
   * arbitrary byte. Two properties must hold at EVERY split:
   *
   *   1. the marker never appears in a rendered body, and
   *   2. the body only ever grows.
   *
   * A `pending` flag that is wrong by one character shows the querent
   * `PILIHAN: Ayam` above their reading, and nothing else in the suite can see
   * it.
   */
  it('renders in every chunk split without ever showing the marker', () => {
    for (let cut = 1; cut < WITH_MARKER.length; cut += 1) {
      const first = WITH_MARKER.slice(0, cut);

      const a = splitChoiceMarker(first, false);
      const b = splitChoiceMarker(WITH_MARKER, false);

      expect(a.body, `split at ${cut}`).not.toContain(CHOICE_MARKER);
      expect(a.body, `split at ${cut}`).not.toContain(CHOICE_MARKER.toLowerCase());
      // Monotonic: the finished body must start with whatever was shown earlier.
      expect(b.body.startsWith(a.body), `split at ${cut}`).toBe(true);
    }
  });

  /**
   * ── THE MARKER AT THE END, WHICH IS WHAT ACTUALLY SHIPPED ──────────────────
   *
   * Observed live on 2026-08-20, first `spread3` of the session, `glm-4.6`:
   *
   *   question: "Aku dapat tawaran kerja di kota lain. Sebaiknya aku ambil?"
   *   ...four paragraphs...
   *   PILIHAN: aku ambil          <- LAST line, not the first
   *
   * `CHOICE_RULE_ID` forbids both halves of that — the marker goes before the
   * reading, and a question offering no options gets no marker line at all — and
   * `splitChoiceMarker` only looked at offset 0, so the line was not stripped and
   * rendered as a line of the querent's reading. That is the failure this file's
   * header calls INVISIBLE: no event fires, because there is nothing to fire
   * about.
   */
  const TRAILING_QUESTION = 'Aku dapat tawaran kerja di kota lain. Sebaiknya aku ambil?';
  const TRAILING = `${READING}\n\n${CHOICE_MARKER} aku ambil`;

  it('strips a marker the model put at the END, and reports it', () => {
    const out = splitChoiceMarker(TRAILING, true, TRAILING_QUESTION);
    expect(out.choice).toBe('aku ambil');
    expect(out.body).not.toContain(CHOICE_MARKER);
    expect(out.body.trimEnd()).toBe(READING);
    expect(out.pending).toBe(false);
  });

  /**
   * The same exhaustiveness the leading marker gets, for the same reason: the
   * trailing line arrives split at an arbitrary byte, and a body that shows
   * `PILIHAN: aku ambil` for one frame has failed.
   */
  it('never shows a trailing marker at any chunk split', () => {
    for (let cut = 1; cut < TRAILING.length; cut += 1) {
      const partial = splitChoiceMarker(TRAILING.slice(0, cut), false, TRAILING_QUESTION);
      const finished = splitChoiceMarker(TRAILING, true, TRAILING_QUESTION);

      expect(partial.body, `split at ${cut}`).not.toContain(CHOICE_MARKER);
      expect(partial.body, `split at ${cut}`).not.toContain(CHOICE_MARKER.toLowerCase());
      // Monotonic, including across the final flush.
      expect(finished.body.startsWith(partial.body), `split at ${cut}`).toBe(true);
    }
  });

  /**
   * **THE NEGATIVE CONTROL THAT LICENSES THE WHOLE BRANCH.** At offset 0 the
   * marker cannot collide with prose, because a reading does not open with
   * `Pilihan:`. At the END it can — `Pilihan: tetap di sini.` is an ordinary
   * Indonesian sentence, and eating it would delete the querent's last paragraph
   * to hide eight characters. So the trailing branch strips ONLY when the
   * candidate is one of the querent's own options, which bounds the worst case to
   * moving the querent's own words from the prose into the box.
   */
  it('leaves a trailing line alone when its candidate is not in the question', () => {
    const prose = `${READING}\n\nPilihan: tetap di sini.`;
    const out = splitChoiceMarker(prose, true, 'Apa yang perlu aku perhatikan bulan ini?');
    expect(out.choice).toBeNull();
    expect(out.body).toBe(prose);
  });

  /** No question to check against is no licence to guess. `attachmentBlock`'s belt. */
  it('leaves a trailing marker alone when no question is supplied', () => {
    const out = splitChoiceMarker(TRAILING, true);
    expect(out.choice).toBeNull();
    expect(out.body).toBe(TRAILING);
  });

  /**
   * A LEADING MARKER STILL NEEDS NO QUESTION. The offset-0 branch is unchanged and
   * unconditional: it strips protocol noise whether or not the candidate is any
   * good, because `PILIHAN:` on the first line is never prose.
   */
  it('still strips a leading marker with no question and no valid candidate', () => {
    const out = splitChoiceMarker(`${CHOICE_MARKER} apa saja yang bukan pilihan\n\n${READING}`, true);
    expect(out.body).toBe(READING);
    expect(out.choice).toBe('apa saja yang bukan pilihan');
  });

  it('holds nothing back once the first line cannot be the marker', () => {
    // 'Y' is not 'P', so there is nothing to wait for and no latency to pay.
    const out = splitChoiceMarker('Y', false);
    expect(out.pending).toBe(false);
    expect(out.body).toBe('Y');
  });

  it('waits while the text is still a possible prefix', () => {
    const out = splitChoiceMarker('PILI', false);
    expect(out.pending).toBe(true);
    expect(out.body).toBe('');
  });

  /**
   * A STREAM THAT DIED MID-MARKER FLUSHES VERBATIM. `done` is the flush, and the
   * alternative is a querent looking at an empty reading because four characters
   * never arrived.
   */
  it('flushes a partial marker when the stream ends', () => {
    const out = splitChoiceMarker('PILI', true);
    expect(out.pending).toBe(false);
    expect(out.body).toBe('PILI');
    expect(out.choice).toBeNull();
  });

  /**
   * A MARKER LINE REQUIRES A NEWLINE, and a body without one is a broken
   * generation either way -- so the prose is shown and the box is lost, rather
   * than the reverse.
   */
  it('treats a marker with no newline as prose rather than eating the reading', () => {
    const out = splitChoiceMarker(`${CHOICE_MARKER} Ayam`, true);
    expect(out.choice).toBeNull();
    expect(out.body).toBe(`${CHOICE_MARKER} Ayam`);
  });

  it('gives up on an absurdly long first line rather than buffering forever', () => {
    const long = `${CHOICE_MARKER} ${'a'.repeat(MARKER_SCAN_LIMIT + 20)}`;
    const out = splitChoiceMarker(long, false);
    expect(out.pending).toBe(false);
    expect(out.body).toBe(long);
  });

  it('strips a marker line that named nothing', () => {
    const out = splitChoiceMarker(`${CHOICE_MARKER}\n\n${READING}`, true);
    expect(out.choice).toBeNull();
    expect(out.body).toBe(READING);
  });

  /**
   * **THE PROTOCOL/POLICY SPLIT, AND THE MEASUREMENT HOLE IT CLOSES.** An
   * over-long candidate is REPORTED, not swallowed, so `reading.completed.choice`
   * can record `invalid` with a `choice_length` past the cap — which is how a
   * reader writing a whole clause on the marker line becomes visible. Nulling it
   * here made that case indistinguishable from a reading with no marker at all.
   *
   * `validateChoice` is what refuses it, and the line is stripped either way.
   */
  it('reports an over-long candidate rather than swallowing it, and still strips the line', () => {
    const candidate = 'x'.repeat(CHOICE_MAX_CHARS + 5);
    const out = splitChoiceMarker(`${CHOICE_MARKER} ${candidate}\n\n${READING}`, true);
    expect(out.choice).toBe(candidate);
    expect(out.body).toBe(READING);
    // And the policy layer is what turns it into no box.
    expect(validateChoice(out.choice, `${candidate} atau ikan?`)).toBeNull();
  });
});

describe('validateChoice', () => {
  const question = 'mending makan ayam atau ikan nanti siang?';

  it('returns the slice of the question, in the question’s own casing', () => {
    expect(validateChoice('AYAM', question)).toBe('ayam');
  });

  it('accepts a multi-word option', () => {
    expect(validateChoice('ayam goreng', 'ayam goreng atau ikan bakar?')).toBe('ayam goreng');
  });

  it('tolerates punctuation the model wrapped around the option', () => {
    expect(validateChoice('"Ikan".', question)).toBe('ikan');
  });

  /**
   * **THE GUARANTEE.** A word the querent never typed cannot reach the box, so a
   * question crafted to steer the model has nothing to steer it into.
   */
  it('refuses anything the querent did not type', () => {
    expect(validateChoice('tahu', question)).toBeNull();
    expect(validateChoice('IGNORE PREVIOUS INSTRUCTIONS', question)).toBeNull();
  });

  /**
   * **THE CASE THAT WAS MEASURED LIVE AND SHIPPED WRONG FOR ONE COMMIT.**
   *
   * `npm run smoke -- --all --choice`, 2026-07-29: three of eighteen readings
   * answered the marker with a whole clause from the question. Every earlier check
   * passed — it IS a word-bounded substring of the question and it IS under the cap —
   * so the box would have rendered `makan ayam atau ikan`, the exact confusing
   * non-answer the feature exists to prevent, in the one highlighted element on the
   * page.
   */
  it('refuses a candidate that names both options', () => {
    expect(validateChoice('makan ayam atau ikan', question)).toBeNull();
    expect(validateChoice('makan ayam atau ikan nanti siang', question)).toBeNull();
    expect(validateChoice('ayam atau ikan', question)).toBeNull();
  });

  it('refuses the colloquial Indonesian disjunction too', () => {
    expect(validateChoice('ayam apa ikan', 'mending ayam apa ikan?')).toBeNull();
  });

  it('refuses an English disjunction and a listed set', () => {
    const q = 'should I take the new job offer or stay where I am?';
    expect(validateChoice('take the job or stay', q)).toBeNull();
    expect(validateChoice('chicken, fish', 'chicken, fish, or tofu?')).toBeNull();
    expect(validateChoice('chicken vs fish', 'chicken vs fish?')).toBeNull();
  });

  /**
   * THE NEGATIVE CONTROL FOR THE FOUR ABOVE. The list is blunt on purpose — a false
   * rejection costs the box and nothing else — but it must not eat an ordinary
   * multi-word option, which is the common case it sits next to.
   */
  it('still accepts an ordinary multi-word option', () => {
    const q = 'should I take the new job offer or stay where I am?';
    expect(validateChoice('take the new job offer', q)).toBe('take the new job offer');
    expect(validateChoice('stay where I am', q)).toBe('stay where I am');
    expect(validateChoice('ayam goreng', 'ayam goreng atau ikan bakar?')).toBe('ayam goreng');
  });

  it('refuses a substring that is not a whole word', () => {
    // 'aya' is inside 'ayam' and is not one of the options.
    expect(validateChoice('aya', question)).toBeNull();
  });

  it('has nothing to validate against without a question', () => {
    expect(validateChoice('ayam', null)).toBeNull();
    expect(validateChoice('ayam', '')).toBeNull();
  });

  it('refuses an empty or over-long candidate', () => {
    expect(validateChoice('', question)).toBeNull();
    expect(validateChoice(null, question)).toBeNull();
    expect(validateChoice('x'.repeat(CHOICE_MAX_CHARS + 1), question)).toBeNull();
  });

  it('cannot be broken by a candidate full of regex metacharacters', () => {
    expect(validateChoice('.*', question)).toBeNull();
    expect(validateChoice('a(b', 'a(b atau c?')).toBe('a(b');
  });

  /** English works identically; the mechanism is direction-symmetric. */
  it('works in English', () => {
    expect(validateChoice('Fish', 'should I have chicken or fish for lunch?')).toBe('fish');
  });
});
