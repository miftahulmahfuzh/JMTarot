/**
 * The tripwire on the one file where being out of date is a safety failure.
 *
 * Two jobs. The first is staleness: **warn past 180 days, FAIL past 365.** The
 * fix is five minutes of opening two web pages, and the failure is intentional
 * -- a hotline number nobody has looked at in a year is a number this app should
 * not be printing next to the words "please talk to a person tonight".
 *
 * **365 rather than 180 for the hard fail** so that an unrelated hotfix at 3am
 * is not blocked by a stale date, while the warning still nags for half a year
 * first. That gap is the whole design: the warn is for the person who has time,
 * the fail is for the project that has run out of it.
 *
 * The second job is the no-stray-digits grep, which is the mechanical half of
 * "no number appears anywhere else in this codebase".
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_CRISIS_RESOURCES, crisisResources } from './resources';
import { LOCALES } from '@/lib/i18n/locale';

const WARN_DAYS = 180;
const FAIL_DAYS = 365;

const daysSince = (iso: string) => (Date.now() - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000;

describe('every entry is verifiable', () => {
  it('carries a sourceUrl and an ISO verifiedOn', () => {
    for (const r of ALL_CRISIS_RESOURCES) {
      expect({ id: r.id, source: r.sourceUrl.startsWith('https://') }).toEqual({
        id: r.id,
        source: true,
      });
      expect({ id: r.id, date: /^\d{4}-\d{2}-\d{2}$/.test(r.verifiedOn) }).toEqual({
        id: r.id,
        date: true,
      });
      expect({ id: r.id, parsed: Number.isFinite(Date.parse(r.verifiedOn)) }).toEqual({
        id: r.id,
        parsed: true,
      });
    }
  });

  it('is not verified in the future, which would defeat the whole mechanism', () => {
    // A typo'd year is the easy way to silence this file for a decade.
    for (const r of ALL_CRISIS_RESOURCES) {
      expect({ id: r.id, ahead: daysSince(r.verifiedOn) < -1 }).toEqual({ id: r.id, ahead: false });
    }
  });

  it('has a label and, where present, a note in every locale', () => {
    for (const r of ALL_CRISIS_RESOURCES) {
      for (const locale of LOCALES) {
        expect({ id: r.id, locale, label: Boolean(r.label[locale]?.trim()) }).toEqual({
          id: r.id,
          locale,
          label: true,
        });
        if (r.note) {
          expect({ id: r.id, locale, note: Boolean(r.note[locale]?.trim()) }).toEqual({
            id: r.id,
            locale,
            note: true,
          });
        }
      }
    }
  });
});

describe('staleness', () => {
  it('fails past a year since anybody last read the source', () => {
    /*
     * WHEN THIS FAILS, THE FIX IS TO OPEN THE PAGE -- NOT TO BUMP THE DATE.
     * Editing `verifiedOn` without reading `sourceUrl` converts the one safety
     * check in this file into a comment.
     *
     * It has already earned its keep once: the plan's cited Kemenkes URL
     * (`.../layanan-sehat-jiwa-healing-119`) had 404'd by the time these
     * entries were written, and the ministry's stated hours turned out to
     * contradict two news reports that said "24 jam".
     */
    const rotten = ALL_CRISIS_RESOURCES.filter((r) => daysSince(r.verifiedOn) > FAIL_DAYS).map(
      (r) => `${r.id} (${r.verifiedOn}, ${r.sourceUrl})`,
    );
    expect(rotten).toEqual([]);
  });

  it('warns past six months', () => {
    const stale = ALL_CRISIS_RESOURCES.filter((r) => daysSince(r.verifiedOn) > WARN_DAYS);
    if (stale.length > 0) {
      console.warn(
        `\n[resources] ${stale.length} crisis resource(s) unverified for over ${WARN_DAYS} days.\n` +
          `Open each sourceUrl, confirm the number and the hours, then update verifiedOn:\n` +
          stale.map((r) => `  - ${r.id}: ${r.sourceUrl}`).join('\n') +
          `\nThis becomes a hard failure at ${FAIL_DAYS} days.\n`,
      );
    }
    // Always passes. The warn is a nag with a deadline, not a gate.
    expect(true).toBe(true);
  });
});

describe('crisisResources()', () => {
  it('returns something for both locales', () => {
    /*
     * An empty list is a CORRECT answer for this module -- it renders as
     * "contact your local emergency service" and invents nothing. It is not a
     * correct answer for Indonesia, where a verified ministry hotline exists, so
     * an empty `id` list means an entry was dropped rather than that none is
     * available.
     */
    for (const locale of LOCALES) {
      expect({ locale, n: crisisResources(locale).length }).not.toEqual({ locale, n: 0 });
    }
  });

  it('puts the phone line first', () => {
    // W7-D10 ordering: a person in crisis reads the top of the block. A
    // directory above a staffed phone number is the wrong way round.
    for (const locale of LOCALES) {
      expect(crisisResources(locale)[0].kind).toBe('phone');
    }
  });
});

// ---------------------------------------------------------------------------

const SRC = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('no hotline detail lives anywhere but this file', () => {
  /**
   * **THE NEEDLES ARE DERIVED, NOT HARDCODED** -- the same principle as the
   * secrets audit (W7-D16). Adding a resource above automatically starts
   * guarding its number and domain, with no edit here. A hand-maintained list
   * would go stale the first time somebody added an entry, and a stale tripwire
   * reads as green.
   */
  const NEEDLES = [
    ...new Set(
      ALL_CRISIS_RESOURCES.flatMap((r) => [
        r.value,
        ...(r.href ? [new URL(r.href).hostname.replace(/^www\./, '')] : []),
      ]),
    ),
  ];

  const OTHERS = walk(SRC)
    .filter((p) => !p.endsWith(join('moderation', 'resources.ts')))
    .filter((p) => !p.endsWith(join('moderation', 'resources.test.ts')))
    .map((path) => ({ path: path.slice(SRC.length + 1), source: readFileSync(path, 'utf8') }));

  it('found the needles, so the test is not vacuously passing', () => {
    expect(NEEDLES.length).toBeGreaterThan(2);
  });

  for (const needle of NEEDLES) {
    it(`does not repeat ${JSON.stringify(needle)} outside resources.ts`, () => {
      /*
       * The copy-paste this catches: somebody hardcodes `119 ext. 8` into a
       * component or the i18n catalog "just for the refusal", the ministry
       * changes the extension, this file is updated, and the component keeps
       * printing the old one to people in crisis.
       */
      const offenders = OTHERS.filter((f) => f.source.includes(needle)).map((f) => f.path);
      expect({ needle, offenders }).toEqual({ needle, offenders: [] });
    });
  }
});
