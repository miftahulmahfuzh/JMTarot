import { describe, expect, it } from 'vitest';
import { ONBOARDING_QUESTION_KEYS } from '@/data/onboarding';
import { ONBOARDING_COPY_ID, c } from './copy';

/*
 * These tests guard an INTERFACE, not prose quality. The key set is what W3
 * hands W6, and a missing key renders `undefined` into the page -- which looks
 * like a layout bug and is diagnosed as one.
 */

describe('the onboarding copy', () => {
  it('has a title, a framing line and a hint for every one of the six', () => {
    for (const key of ONBOARDING_QUESTION_KEYS) {
      for (const part of ['title', 'framing', 'hint'] as const) {
        const full = `onboarding.q.${key}.${part}`;
        expect(ONBOARDING_COPY_ID, full).toHaveProperty(full);
        expect(
          ONBOARDING_COPY_ID[full as keyof typeof ONBOARDING_COPY_ID].length,
          full,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('never enumerates the worst_thing examples', () => {
    /*
     * L6, ratified as reconciliation §7.4. Roadmap §8 described this question as
     * naming these; it must not. A list of extremes turns an open question into
     * a menu and primes the worst item on it. This test exists so that restoring
     * the list as a "missing requirement" fails rather than ships.
     */
    const step = [
      ONBOARDING_COPY_ID['onboarding.q.worst_thing.title'],
      ONBOARDING_COPY_ID['onboarding.q.worst_thing.framing'],
      ONBOARDING_COPY_ID['onboarding.q.worst_thing.hint'],
    ]
      .join(' ')
      .toLowerCase();

    for (const word of [
      'pemerkosaan',
      'perkosa',
      'bunuh diri',
      'pembunuhan',
      'kekerasan dalam rumah tangga',
      'kdrt',
      'perselingkuhan',
    ]) {
      expect(step, word).not.toContain(word);
    }
  });

  it('grants permission to decline before the field is focused', () => {
    // The framing line, not the hint: the framing is rendered above the input.
    expect(ONBOARDING_COPY_ID['onboarding.q.worst_thing.framing']).toContain(
      'tidak perlu menceritakannya',
    );
  });

  it('names the encryption on the one step that earns it, and only there', () => {
    expect(ONBOARDING_COPY_ID['onboarding.q.worst_thing.hint']).toContain('terkunci');
    expect(ONBOARDING_COPY_ID['onboarding.q.best_thing.hint']).not.toContain('terkunci');
  });

  it('promises in copy what lotusSafetyCheck enforces in code', () => {
    // L11 / §7.5: a promise the user can read is a promise the code has to keep.
    expect(ONBOARDING_COPY_ID['onboarding.q.most_loved.hint']).toContain('Namanya tidak akan');
  });

  it('carries no Malay', () => {
    /*
     * The same eleven-word class `npm run smoke -- --all` greps for. `boleh` on
     * its own is ordinary Indonesian and appears in the copy on purpose, so the
     * phrase forms are what is matched.
     */
    const all = Object.values(ONBOARDING_COPY_ID).join('\n');
    const malay =
      /\b(kerjaya|hala tuju|sembang|awak|tempoh|boleh tahan|bilik|cawangan|jom|kereta api|pejabat)\b/gi;
    expect(all.match(malay)).toBeNull();
  });

  it('interpolates the progress counter', () => {
    expect(c('onboarding.progress', { n: 3, total: 9 })).toBe('3 / 9');
  });

  it('leaves an unknown placeholder in place rather than printing undefined', () => {
    expect(c('onboarding.progress', { n: 3 })).toBe('3 / {total}');
  });
});
