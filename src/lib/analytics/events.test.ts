import { describe, expect, it } from 'vitest';
import { ADMIN_PAGES } from '@/app/admin/pages';
import { EVENT_NAMES, isEventName } from './events';

describe('the event taxonomy', () => {
  it('accepts every declared name', () => {
    for (const name of EVENT_NAMES) expect(isEventName(name)).toBe(true);
  });

  it('rejects everything else', () => {
    // `reader_chosen` is the exact drift A1 is about: the same event, named the
    // way a different file would have named it.
    for (const bad of ['reader_chosen', '', 'reading.', 'Reading.Completed', null, 42, {}, []]) {
      expect(isEventName(bad), String(bad)).toBe(false);
    }
  });

  it('rejects prototype keys', () => {
    // A Set has no prototype chain to walk, unlike the object-literal lookup
    // someone will eventually refactor it into. This test is what fails then.
    expect(isEventName('__proto__')).toBe(false);
    expect(isEventName('constructor')).toBe(false);
    expect(isEventName('toString')).toBe(false);
  });

  it('has no duplicates', () => {
    // A duplicated string literal compiles fine and quietly makes the union
    // narrower than the array, so the second copy is unreachable in EventMap.
    expect(new Set(EVENT_NAMES).size).toBe(EVENT_NAMES.length);
  });

  it('names every event domain.verb_object', () => {
    // The test that stops the taxonomy drifting into three naming conventions.
    for (const name of EVENT_NAMES) {
      expect(name, name).toMatch(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/);
    }
  });

  it('is big enough to be the real list', () => {
    // A glob-shaped test that passes against an empty array is not a test.
    expect(EVENT_NAMES.length).toBeGreaterThan(30);
  });

  /*
   * V0.3.0's REGISTER (reconciliation §4): 44 at v0.2.0, plus the fifteen names
   * roadmap §6 fixes, plus V9's two, is 61 when that release is complete.
   *
   * **v0.4.0's REGISTER IS FIVE MORE, AND THE CEILING MOVED ONCE, DELIBERATELY**
   * (S-D13): `public.page_viewed`, `public.link_clicked`, `public.link_shared`,
   * `public.card_zoomed`, `wallpaper.downloaded`. **S1 is the SINGLE OWNER of
   * `events.ts` for the whole release** — every other workstream declares its
   * events in its own plan's `## Analytics deltas` and S1 folds them in, in one
   * edit. Six agents editing the data dictionary in parallel is the "seven agents
   * inventing `user_id`" failure the v0.2.0 roadmap names.
   *
   * A BOUND RATHER THAN AN EXACT COUNT, because an exact number makes every
   * workstream edit this line — which is how a count assertion becomes a number
   * people bump without reading. What is asserted exactly is the ceiling: nothing
   * may take the taxonomy past 66 without the register being revisited. **If S3,
   * S4, S5 or S6 needs a name, the answer is almost always a prop on one of the
   * five above**, and that plan says so rather than raising this number.
   */
  /*
   * **THE CEILING MOVED 66 -> 67 ON 2026-07-29, ONCE, AND THE REGISTER WAS
   * REVISITED RATHER THAN THE NUMBER BUMPED.** That is the process this assertion
   * exists to force, so here is the accounting:
   *
   *   DRAFTED, four names:  `reading.choice_offered`, `account.answer_revealed`,
   *                         `account.answer_edited`, `account.answer_cleared`.
   *   LANDED, one:          `account.answer_changed`.
   *
   * `reading.choice_offered` became `choice` + `choice_length` on
   * `reading.completed`, which is the "prop on an existing event" answer above and
   * gives a better query shape besides — numerator and denominator in one scan.
   * The two answer-write names became one with a closed `action`. `revealed` was
   * dropped outright: request volume in the platform log answers the privacy
   * question, and a look-and-close changes no decision.
   *
   * So the taxonomy grew by ONE for a change that touched two features, and the
   * guidance in this comment is what did the work. **The next person here should
   * expect to fold rather than add**, and should write down what they folded.
   */
  /*
   * **AND IT MOVED 67 -> 70 ON 2026-07-30, FOR v0.5.0 / A1, WITH THE SAME
   * ACCOUNTING PERFORMED FIRST.** A-D18's register:
   *
   *   DRAFTED, six names:  `admin.page_viewed`, `admin.blog_saved`,
   *                        `admin.blog_status_changed`, `admin.pii_revealed`,
   *                        `admin.user_viewed`, `llm.call_recorded`.
   *   LANDED, three:       the first three.
   *
   * `admin.pii_revealed` was dropped because `admin_access_log` is the record of
   * truth for a reveal, and a second copy would put a resource key into the one
   * table whose rows survive that subject's erasure. `admin.user_viewed` was
   * dropped on the `revealed` argument. `llm.call_recorded` was dropped because it
   * is a row in `llm_calls`: **a fact table and an event stream recording the same
   * fact is how they drift**, and it is why A2 imports nothing from `events.ts`.
   *
   * Three of six, and the two that landed with a `blog` prefix are A6's
   * declarations transcribed rather than narrowed (§11 seam 1).
   */
  it('stays inside the fixed name budget', () => {
    expect(EVENT_NAMES.length).toBeGreaterThanOrEqual(44);
    expect(EVENT_NAMES.length).toBeLessThanOrEqual(70);
  });

  it("admin.page_viewed's pages are route TEMPLATES, not resolved paths (A1-18, R32)", () => {
    /*
     * A uuid-shaped segment here is a subject identifier in a table whose rows
     * survive that subject's erasure with `user_id` nulled -- so the closed list
     * is not a tidiness preference, it is what keeps `events` honest about the one
     * promise it makes. `usePathname()` on `/admin/users/<uuid>` is the
     * implementation this forbids.
     */
    for (const { path } of ADMIN_PAGES) {
      expect(path, path).toMatch(/^\/admin(\/(\[[a-z]+\]|[a-z][a-z-]*))*$/);
      expect(path, path).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
    }
  });

  it('gives every admin page a template and every nav item a label', () => {
    // Not vacuous: a glob-free hardcoded list can go empty in a refactor, and an
    // entry whose label is `null` is deliberately not in the nav (A5's user
    // detail, A6's editor) rather than an omission.
    expect(ADMIN_PAGES.length).toBeGreaterThanOrEqual(7);
    expect(ADMIN_PAGES.filter((p) => p.label !== null).length).toBeGreaterThanOrEqual(4);
  });

  /*
   * V3 CONTRIBUTES ZERO NAMES, which is a claim its plan makes and this is where
   * it is checked. It widened two prop shapes instead -- `shadow_card_id` and
   * friends on `memory.frequency_generated`, `echo_count` on
   * `memory.summary_generated` -- because a derived value about an existing
   * event is a property of that event and not a new thing that happened.
   *
   * There are exactly SEVEN `memory.*` names and there were seven at W5. If an
   * eighth appears with a V3 commit, the register in reconciliation §4 is out by
   * one and nobody will notice until the count is supposed to reach 61.
   */
  it('adds no memory.* name at V3', () => {
    const memory = EVENT_NAMES.filter((n) => n.startsWith('memory.'));
    expect(memory).toEqual([
      'memory.chain_offered',
      'memory.chain_used',
      'memory.gist_failed',
      'memory.summary_shown',
      'memory.summary_generated',
      'memory.frequency_shown',
      'memory.frequency_generated',
    ]);
  });

  /*
   * V2's one name, and the absence of the one it deliberately does not have.
   *
   * `translation.failed` would be the sixteenth fixed name and break the register.
   * The failure rides on `outcome` instead — `memory.gist_failed`'s `fell_back` is
   * the precedent — and `outcome: 'invalid'` is the rate that decides whether the
   * translation prompt needs work.
   */
  it('carries translation.generated and no translation.failed', () => {
    expect(isEventName('translation.generated')).toBe(true);
    expect(isEventName('translation.failed')).toBe(false);
  });
});
