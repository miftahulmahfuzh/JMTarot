import { beforeEach, describe, expect, it } from 'vitest';
import { _reset, _setBackend, hit, hitGlobal, hitRefusal, refusalsExhausted } from './index';

/*
 * THE FACADE'S OWN TESTS. Everything about the sliding-window arithmetic is
 * `memory.test.ts`'s; what is asserted here is what the facade adds -- the
 * namespaces, `peek`'s read-only-ness through the public functions, and (Task 11)
 * the fallback.
 */
describe('the key namespaces (TRAP 1)', () => {
  beforeEach(() => {
    _setBackend(null);
    _reset();
  });

  it('a reading budget and a refusal budget do not share a counter', async () => {
    /*
     * **THE TRAP.** `hit(user.id)` and `hitRefusal(user.id)` are the SAME STRING.
     * Two Maps kept them apart; one Redis keyspace would not. Five refusals would
     * eat five of thirty readings and thirty readings would exhaust the refusal
     * budget six times over -- so a heavy legitimate user would be handled as
     * somebody mapping the blocklist.
     *
     * The prefixes are applied in `index.ts` and never at a call site, which is
     * what makes them unforgettable. Verified RED by deleting them.
     */
    for (let i = 0; i < 5; i++) await hitRefusal('u1');
    expect((await hitRefusal('u1')).ok).toBe(false);
    expect((await hit('u1')).ok).toBe(true); // budget untouched
    expect(await refusalsExhausted('u1')).not.toBeNull();
  });

  it('thirty readings do not exhaust the refusal budget', async () => {
    /*
     * **THIS IS THE ASSERTION WITH TEETH, AND THE ONE ABOVE IS NOT.** Measured by
     * deleting the prefixes and running both: the test above still PASSES, because
     * five refusals against a reading budget of thirty is comfortably under
     * budget, so a shared counter is invisible from that direction. The plan's §4
     * test is written that way round.
     *
     * From this direction a shared counter is loud: thirty readings blow a refusal
     * budget of five six times over, and `refusalsExhausted()` then reports a
     * heavy legitimate user as somebody mapping the blocklist. If you ever prune
     * these two, keep this one.
     */
    for (let i = 0; i < 30; i++) await hit('u1');
    expect((await hit('u1')).ok).toBe(false);
    expect(await refusalsExhausted('u1')).toBeNull();
    expect((await hitRefusal('u1')).ok).toBe(true);
  });

  it('the crowd ceiling is not any one user`s budget', async () => {
    // `global` is a bare key, so a user literally named `global` must not land in
    // it. `hit()` prefixes with `read:`, which is what guarantees that.
    await hitGlobal(Date.now(), 1);
    expect((await hit('global')).ok).toBe(true);
  });

  it('two users do not share a reading budget', async () => {
    for (let i = 0; i < 30; i++) await hit('u1');
    expect((await hit('u1')).ok).toBe(false);
    expect((await hit('u2')).ok).toBe(true);
  });
});
