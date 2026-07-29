/**
 * The Indonesian formatters. **`id-ID` separators are the OPPOSITE of English in both
 * positions**, so every assertion here is one a reader would otherwise misread by a factor of
 * a thousand.
 */
import { describe, expect, it } from 'vitest';
import { compact, day, dayWithYear, deltaGlyph, int, ms, oneDp, pct, shortId, signedPct, usd } from './format';

describe('int / compact -- `.` for thousands, `,` for a decimal', () => {
  it('formats a thousand as 1.284, not 1,284', () => {
    // The whole reason this module exists rather than a `toLocaleString()` at each call site:
    // `1,284` is read as one-point-two-eight-four by the one person who uses this page.
    expect(int(1284)).toBe('1.284');
    expect(int(1_284_567)).toBe('1.284.567');
  });

  it('keeps the exact number below 10k and compacts above it', () => {
    /*
     * `9.842` says more than `9,8 rb` and is the same width.
     *
     * **THE SEPARATOR BEFORE `rb` IS U+00A0, A NON-BREAKING SPACE, AND THE FIRST DRAFT OF
     * THIS TEST FAILED WITH TWO IDENTICAL-LOOKING STRINGS.** `Intl`'s compact notation emits
     * it deliberately -- `12,9` and `rb` must not be split across a line -- and it is the
     * right thing on screen. It is pinned explicitly here because the failure output is
     * `Expected: "12,9 rb" / Received: "12,9 rb"`, which reads as a test framework bug and is
     * not one. Anything that ever compares or greps these strings needs to know.
     */
    expect(compact(9842)).toBe('9.842');
    expect(compact(12_900)).toBe('12,9 rb');
    expect(compact(1_200_000)).toBe('1,2 jt');
  });

  it('uses `rb` and `jt`, which are the platform`s Indonesian and not invented', () => {
    expect(compact(2500)).not.toContain('K');
    expect(compact(2_500_000)).toContain('jt');
  });

  it('renders a null as the empty cell, never as 0', () => {
    // A3 keeps "no measurement" and "zero" apart deliberately; this is the last step where
    // that distinction could be thrown away.
    expect(int(null)).toBe('—');
    expect(compact(null)).toBe('—');
    expect(int(Number.NaN)).toBe('—');
    expect(int(0)).toBe('0');
  });
});

describe('pct / signedPct / deltaGlyph', () => {
  it('renders a fraction as a percentage', () => {
    expect(pct(0.25)).toBe('25%');
    expect(pct(0.128)).toBe('12,8%');
  });

  it('renders a null delta as the empty cell -- never ∞%, never 100%', () => {
    /*
     * `periodDelta` returns `null` when the previous period was 0, and A3's reason reaches
     * the screen here: *the two plausible wrong answers are both worse than an empty state --
     * `Infinity` renders as `∞%` and `100%` reads as "doubled" when the truth is "started".*
     */
    expect(signedPct(null)).toBe('—');
    expect(deltaGlyph(null)).toBeUndefined();
  });

  it('signs a delta with U+2212, which aligns with digits', () => {
    expect(signedPct(0.25)).toBe('+25%');
    expect(signedPct(-0.08)).toBe('−8%');
    // A hyphen-minus is narrower than a digit and makes a column of deltas ragged.
    expect(signedPct(-0.08)).not.toContain('-');
  });

  it('gives no glyph and no sign for exactly zero', () => {
    // `+0%` reads as a rise that rounded away. Zero change is zero change.
    expect(signedPct(0)).toBe('0%');
    expect(deltaGlyph(0)).toBeUndefined();
  });

  it('pairs the glyph with the sign', () => {
    expect(deltaGlyph(0.1)).toBe('↑');
    expect(deltaGlyph(-0.1)).toBe('↓');
  });
});

describe('usd', () => {
  it('is unambiguous about the currency on an Indonesian page', () => {
    expect(usd(4.2)).toBe('US$4,20');
    expect(usd(1234.5)).toBe('US$1.234,50');
  });

  it('renders a null cost as the empty cell', () => {
    // `NOTIONAL_MODEL` is unset today, so this is the live case -- and the tile prints the
    // reason beside it, because A-D7 forbids a cost figure without its denominator.
    expect(usd(null)).toBe('—');
  });
});

describe('day -- the string is formatted in UTC, never in the server zone', () => {
  it('renders a local_date as its own calendar day', () => {
    /*
     * **THE `local_date` TRAP.** It is the querent's calendar day as a STRING, and a `Date`
     * rendered in the server's zone is A DAY OUT for anyone in Jakarta between midnight and
     * 07:00. `timeZone: 'UTC'` is what keeps the label the same day the column holds.
     */
    expect(day('2026-07-30')).toBe('30 Jul');
    expect(day('2026-01-01')).toBe('1 Jan');
    expect(dayWithYear('2026-07-30')).toContain('2026');
  });

  it('renders a malformed date as the empty cell rather than "Invalid Date"', () => {
    expect(day('not-a-day')).toBe('—');
    expect(dayWithYear('')).toBe('—');
  });
});

describe('ms', () => {
  it('switches unit at a second, because that is where a person`s comparison changes', () => {
    expect(ms(840)).toBe('840 ms');
    expect(ms(1240)).toBe('1,2 s');
    expect(ms(null)).toBe('—');
  });
});

describe('shortId -- no email, no nickname, anywhere on these two pages (§1.11)', () => {
  it('truncates to eight characters', () => {
    // Enough to tell two rows apart and to recognise one you have seen. An email here would
    // owe an `admin_access_log` row per RENDERED ROW, which is absurd -- and omitting the
    // audit would breach A-D16.
    expect(shortId('9f3c1a2b-4d5e-6789-abcd-ef0123456789', 'x')).toBe('9f3c1a2b');
  });

  it('labels a null id rather than dropping the row', () => {
    // `llm_calls.user_id` is `on delete set null`, so a hard-deleted user's tokens survive
    // with the attribution gone -- and they were still spent. Dropping the row would make
    // the league disagree with the KPI tile.
    expect(shortId(null, '(terhapus / sistem)')).toBe('(terhapus / sistem)');
  });
});
