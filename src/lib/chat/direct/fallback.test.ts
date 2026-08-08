import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_READER } from '@/data/readers';
import { fallbackSheet, type FallbackInput } from './fallback';

const BASE: FallbackInput = {
  trigger: 'user_message',
  triggerMessageId: 'm-user',
  lead: null,
  awaiting: null,
  lastReadingReader: null,
  hasMaterial: false,
};

/**
 * §8's decision table, one case per row. **Every row returns EXACTLY ONE BEAT except the
 * no-material proactive one**, and that is `[F2-13]`: *a fallback that is louder than the
 * real thing is the wrong failure*, and a three-beat fallback would fire on exactly the runs
 * where the model was confused — disproportionately the odd, hard or hostile messages.
 */
describe('fallbackSheet', () => {
  it('sends the affinity lead when there is one', () => {
    const beats = fallbackSheet({ ...BASE, lead: 'adrian', awaiting: 'thessaly' });
    expect(beats).toEqual([
      { reader: 'adrian', to: 'user', replyTo: 'm-user', intent: 'answer', angle: null },
    ]);
  });

  it('falls to the reader who is waiting for an answer', () => {
    expect(fallbackSheet({ ...BASE, awaiting: 'margaret' })[0].reader).toBe('margaret');
  });

  it('falls to the reader of the last reading', () => {
    expect(fallbackSheet({ ...BASE, lastReadingReader: 'margaret' })[0].reader).toBe('margaret');
  });

  it('falls to the default reader when it knows nothing at all', () => {
    const beats = fallbackSheet(BASE);
    expect(beats).toHaveLength(1);
    expect(beats[0].reader).toBe(DEFAULT_READER.id);
  });

  it('asks rather than answers on a proactive run, because an unprompted answer answers nothing', () => {
    const beats = fallbackSheet({
      ...BASE,
      trigger: 'reading_completed',
      triggerMessageId: null,
      hasMaterial: true,
      lastReadingReader: 'thessaly',
    });
    expect(beats).toEqual([
      { reader: 'thessaly', to: 'user', replyTo: null, intent: 'ask', angle: null },
    ]);
  });

  /**
   * `C-N2e`. F5 guarantees material, so this arm is BELT — and it is the correct belt: a
   * proactive beat with nothing to be about produces *"hai, apa kabar?"*, which the roadmap
   * names as the emptiest thing this feature could ship.
   */
  it('says nothing on a proactive run with no material', () => {
    expect(fallbackSheet({ ...BASE, trigger: 'idle_nudge', hasMaterial: false })).toEqual([]);
  });

  it('is one beat on every arm that speaks', () => {
    const arms: FallbackInput[] = [
      BASE,
      { ...BASE, lead: 'thessaly' },
      { ...BASE, awaiting: 'adrian' },
      { ...BASE, lastReadingReader: 'margaret' },
      { ...BASE, trigger: 'cron', hasMaterial: true },
      { ...BASE, trigger: 'unanswered', hasMaterial: true, awaiting: 'margaret' },
    ];
    for (const arm of arms) expect(fallbackSheet(arm)).toHaveLength(1);
  });

  /**
   * A deterministic angle is a template, and a template angle handed to three different
   * voices across three different failures produces three variants of one sentence — the
   * flattening `[F2-2]` exists to prevent, arriving through the failure path.
   */
  it('never writes an angle', () => {
    for (const beats of [
      fallbackSheet({ ...BASE, lead: 'adrian' }),
      fallbackSheet({ ...BASE, trigger: 'cron', hasMaterial: true }),
    ]) {
      for (const beat of beats) expect(beat.angle).toBeNull();
    }
  });

  it('is deterministic', () => {
    const input = { ...BASE, lead: 'adrian' as const, lastReadingReader: 'margaret' as const };
    expect(fallbackSheet(input)).toEqual(fallbackSheet(input));
  });
});

/**
 * `[F2-17]` THERE IS NO RANDOM NUMBER GENERATOR ANYWHERE UNDER `direct/**`.
 *
 * The tempting shortcut is a coin flip — silence 20% of the time, two beats 35% of the time.
 * It is refused, and the refusal is a rule rather than a preference:
 *
 *  - **A room that is quiet at random is not quiet for a reason**, and a querent notices
 *    within a week: the silences land on the messages that deserved an answer and the
 *    three-beat runs land on *"ok"*.
 *  - **It destroys the only instrument this release has.** `npm run smoke -- --chat` read
 *    blind is the acceptance test; a director with a dice roll in it produces a different
 *    sheet for the same input every run, so *"did my prompt change help"* stops being
 *    answerable.
 *  - **It hides a broken director behind a plausible distribution.** A model that has stopped
 *    returning JSON and a model that is deciding well produce the same histogram once a coin
 *    flip is in front of them.
 *
 * **Variety comes from the provider's default temperature (`[F2-18]`), not from code.**
 */
describe('the director is deterministic by construction', () => {
  /**
   * **ASSERTED ON THE SOURCE WITH COMMENTS STRIPPED**, `adminCopy.test.ts`'s idiom and for
   * its reason: this file's own header names `Math.random` in order to refuse it, and a grep
   * that could not tell prose from code would fail on the rule that forbids the thing.
   */
  function sourcesUnderDirect(): Array<{ file: string; code: string }> {
    const dir = join(process.cwd(), 'src/lib/chat/direct');
    return readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((file) => ({
        file,
        code: readFileSync(join(dir, file), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, ''),
      }));
  }

  it('no module under direct/** reads Math.random', () => {
    expect(sourcesUnderDirect().filter((s) => s.code.includes('Math.random')).map((s) => s.file)).toEqual(
      [],
    );
  });

  /**
   * `[F2-14]` A RUN NEVER CHAINS INTO ANOTHER RUN, AND THE DIRECTOR MAY NOT MINT ONE.
   *
   * *Failure mode:* not a bug — a loop. Beat 4 of run 1 mints run 2, whose beat 4 mints run
   * 3. Nothing throws, nothing 500s, the ceiling absorbs it for a while, and then every
   * reading in the fleet starts being shed. Every legitimate reason to keep going is already
   * a trigger (`C-D7`), which is why F5 builds triggers rather than a second pipeline.
   */
  it('no module under direct/** reaches the engine or its mint', () => {
    const offenders = sourcesUnderDirect()
      .filter((s) => /\bmintRun\b|from '\.\.\/run'/.test(s.code))
      .map((s) => s.file);
    expect(offenders).toEqual([]);
  });
});
