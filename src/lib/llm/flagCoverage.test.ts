import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { DEFERRABLE_FLAGS } from './flags';

/**
 * **EVERY MODEL CALL SITE IN THE APP HAS EITHER A KILL SWITCH OR A WRITTEN REASON
 * IT MUST NOT HAVE ONE.**
 *
 * A GREP OVER THE SOURCE, IN `callClass.test.ts`'s IDIOM, AND FOR ITS EXACT
 * REASON: none of these six files can be imported under Vitest — every one of
 * them reaches `@/lib/llm`, which starts with `import 'server-only'` — so a test
 * that instantiates them is not available, and the property worth protecting is
 * anyway not "does the flag work" (`flags.test.ts` owns that) but **"did anybody
 * decide?"**
 *
 * The failure this catches is the tenth model call site, added in some future
 * workstream, that quietly cannot be switched off. Nothing else in the suite
 * would ever say so: it would pass typecheck, pass every unit test, stream
 * correctly, and simply keep costing quota during the outage the flags were built
 * for. So the list of call sites is asserted to be EXACTLY this table, and a new
 * one fails here until somebody writes down which column it belongs in.
 *
 * `callClass.test.ts` asserts the same set for a different property. Two tables
 * over one set of files is duplication on purpose — they fail for different
 * reasons and a merged one would make a `callClass` edit look like a flag edit.
 */

/** The exact source text that switches a site off, per flag. */
const FLAGGED: Array<{
  file: string;
  env: (typeof DEFERRABLE_FLAGS)[number]['env'];
  /** The guard, verbatim. A test that guessed the form would pass on a file that
   *  had merely imported the predicate and never called it. */
  marker: string;
  /** What the querent sees with it off. Prose, so the trade is legible here. */
  off: string;
}> = [
  {
    file: 'src/app/api/memory/summary/route.ts',
    env: 'DAILY_SUMMARY_ENABLED',
    marker: 'if (!dailySummaryEnabled())',
    off: 'a cached summary still serves; otherwise 204, and the deck is one panel (M14)',
  },
  {
    file: 'src/app/api/memory/frequency/route.ts',
    env: 'FREQUENCY_VERDICT_ENABLED',
    marker: 'if (!frequencyVerdictEnabled())',
    off: 'a cached line still serves; otherwise 204, and FrequencyLine renders nothing (M14)',
  },
  {
    file: 'src/lib/persona/generate.ts',
    env: 'PERSONA_GENERATION_ENABLED',
    marker: 'if (!personaGenerationEnabled())',
    off: 'an existing paragraph is never overwritten; a first visit gets fallbackPersona',
  },
  {
    file: 'src/lib/prompt/lotus.generate.ts',
    env: 'LOTUS_GENERATION_ENABLED',
    marker: 'if (!lotusGenerationEnabled())',
    off: 'nothing is written at all, so the flag is self-healing; readings go un-personalised',
  },
  {
    file: 'src/lib/memory/gist.generate.ts',
    env: 'GIST_ENABLED',
    marker: 'if (!gistEnabled())',
    off: 'readings.gist stays null and those readings are excluded from recall, permanently',
  },
];

/**
 * The call sites that MUST NOT acquire a flag from `flags.ts`, and why.
 *
 * **THIS COLUMN IS THE PRODUCT RULING** (Miftah, 2026-07-30): the reading and the
 * translation are the backbone. The moderation classifier is exempt for the
 * opposite reason — it already has a switch, in the file that owns it, named so it
 * cannot be misread as "moderation off".
 */
const EXEMPT: Array<{ file: string; why: string; ownSwitch?: string }> = [
  {
    file: 'src/app/api/reading/route.ts',
    why: 'THE PRODUCT. Switching readings off does not degrade JMTarot, it ends it — the honest tool is a maintenance page, not an env var somebody sets at 2am and forgets.',
  },
  {
    file: 'src/lib/translate/translate.ts',
    why: 'THE BACKBONE. V2 exists because the alternative was shipping Indonesian prose to an English querent; a switch here reinstates the bug the workstream was built to remove.',
  },
  {
    /*
     * **A6's BLOG AUTO-TRANSLATE. EXEMPT FOR A REASON UNLIKE THE OTHER THREE**, and it
     * is worth stating rather than filing under "backbone", which it is not.
     *
     * A flag here would be a manual switch for a call that ALREADY sheds automatically:
     * it is the only `deferred` site whose caller is the operator, so under ceiling
     * pressure it is shed before every querent-facing call by construction. **The tier
     * IS the switch**, and it cannot be forgotten in a dashboard at 2am.
     *
     * The other half: with it off, the button reports a failure the operator reads and
     * they type the English themselves — which §8.2 says they should be doing anyway.
     * There is no degraded querent experience to protect, so there is nothing for a flag
     * to buy.
     */
    file: 'src/lib/admin/blogAutoTranslate.ts',
    why: 'ADMIN-ONLY AND ALREADY SHED FIRST. `callClass: deferred` on the one site whose caller is the operator means the ceiling sheds it before any querent call; a manual flag would duplicate that and could be left off.',
  },
  {
    /*
     * **A7's DASHBOARD INSIGHT, 2026-07-31. THE SECOND MEMBER OF THE ADMIN-ONLY CLASS**,
     * and the row above it is the precedent rather than a coincidence: there are now two
     * `deferred` sites whose caller IS the operator, and the argument generalises exactly.
     *
     * The ceiling sheds `deferred` before `interactive`, fleet-wide, so an insight is
     * already shed before any querent's reading — **the tier IS the switch**, and unlike
     * an env var it cannot be left off in a dashboard at 2am. With it shed the button
     * reports a stated failure and the operator reads the chart themselves, which is what
     * they were doing the day before this shipped. **There is no degraded querent
     * experience for a flag to protect**, which is the property every entry in the FLAGGED
     * table above has and this one does not.
     *
     * If a third admin-only site ever lands, the honest move is a single
     * `ADMIN_MODEL_CALLS_ENABLED` covering the class — not three flags, and not this
     * exemption stretched a third time without saying so.
     */
    file: 'src/lib/admin/insight.ts',
    why: 'ADMIN-ONLY AND ALREADY SHED FIRST, exactly as blogAutoTranslate: `callClass: deferred` means the fleet-wide ceiling drops it before any querent call, so the tier is the switch. A refused press is a sentence the operator reads; no querent sees anything change.',
  },
  {
    /*
     * **AUTO FORMAT, 2026-07-31. THE THIRD MEMBER OF THE ADMIN-ONLY CLASS, AND THE ENTRY
     * ABOVE SAID WHAT TO DO IF ONE ARRIVED:** *"If a third admin-only site ever lands, the
     * honest move is a single `ADMIN_MODEL_CALLS_ENABLED` covering the class — not three
     * flags, and not this exemption stretched a third time without saying so."*
     *
     * **IT IS BEING STRETCHED A THIRD TIME, AND THIS IS THE SAYING SO.** The reason is that
     * `blogFormat` is not a third INDEPENDENT site: it lives on the same surface as
     * `blogAutoTranslate`, behind the same `requireAdmin()`, in the same editor, and an
     * operator who cannot format also cannot translate. A flag that covered one and not the
     * other would be a switch nobody could reason about.
     *
     * **SO THE CLASS SWITCH IS NOW OWED RATHER THAN OPTIONAL.** The next admin-only model
     * call — the FOURTH, on any surface — must arrive with `ADMIN_MODEL_CALLS_ENABLED` in
     * `flags.ts` and these three entries collapsed into it. Written as a debt with a
     * trigger, because "we will do it next time" is what the entry above already said.
     *
     * The tier argument is unchanged and still load-bearing: `callClass: 'deferred'` on a
     * site whose caller IS the operator means the fleet-wide ceiling sheds it before any
     * querent call, so it cannot be left off at 2am. And Auto Format sheds more gracefully
     * than either neighbour — `adviceNeeded()` skips the call entirely on an already-
     * sectioned paste, so the common press does not reach a model at all.
     */
    file: 'src/lib/admin/blogFormat.ts',
    why: 'ADMIN-ONLY AND ALREADY SHED FIRST, on the same surface and the same gate as blogAutoTranslate. `callClass: deferred` is the switch. THIS IS THE THIRD STRETCH OF THIS EXEMPTION: the fourth admin-only call site must bring ADMIN_MODEL_CALLS_ENABLED and collapse all three into it.',
  },
  {
    file: 'src/lib/moderation/classify.ts',
    why: 'ALREADY SWITCHABLE, and its switch is deliberately not in flags.ts: MODERATION_CLASSIFIER_ENABLED lives in gate.ts, named there so it cannot be read as "moderation off" — Tier A stays terminal either way.',
    ownSwitch: "process.env.MODERATION_CLASSIFIER_ENABLED !== '0'",
  },
];

const read = (f: string) => readFileSync(f, 'utf8');

/** Every non-test file under `src/` that reaches a model, by either door. */
function callSites(): string[] {
  const out = execSync(
    `grep -rlE "getProvider\\(\\)\\.(complete|streamReading)" src --include=*.ts --include=*.tsx || true`,
    { encoding: 'utf8' },
  );
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.includes('.test.'))
    .filter((f) => !f.startsWith('src/lib/llm/'))
    .sort();
}

describe('every model call site is accounted for', () => {
  it('the set of call sites is exactly the one these two tables describe', () => {
    /*
     * THE ASSERTION THAT MAKES THE REST MEANINGFUL, and the one to keep. A new
     * call site is unswitchable by default: it costs quota during exactly the
     * outage these flags exist for, and nothing else in this repo would notice.
     * Adding one must therefore be a DECISION — flagged, or exempt with a reason
     * somebody wrote down.
     */
    const described = [...FLAGGED.map((f) => f.file), ...EXEMPT.map((e) => e.file)].sort();
    expect(callSites()).toEqual(described);
  });

  it('describes each file exactly once', () => {
    const all = [...FLAGGED.map((f) => f.file), ...EXEMPT.map((e) => e.file)];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe.each(FLAGGED)('$file', ({ file, env, marker }) => {
  it(`guards its model call on ${env}`, () => {
    expect(read(file)).toContain(marker);
  });

  it('imports the predicate from the flags leaf', () => {
    /*
     * The import and the guard are asserted separately on purpose: a file could
     * hold the guard text inside a comment, and a file could import the predicate
     * and never call it. Both together are the property.
     */
    expect(read(file)).toMatch(/from '@\/lib\/llm\/flags'/);
  });
});

describe.each(EXEMPT)('$file is exempt', ({ file, why, ownSwitch }) => {
  it('reaches no flag in flags.ts', () => {
    const source = read(file);
    for (const flag of DEFERRABLE_FLAGS) {
      expect(source).not.toContain(flag.env);
    }
    expect(source).not.toContain("from '@/lib/llm/flags'");
    expect(why.length).toBeGreaterThan(40); // the reason is the exemption
  });

  if (ownSwitch) {
    it('carries its own switch instead', () => {
      /*
       * `classify.ts` does the CALL; `gate.ts` holds the switch that decides
       * whether to reach it. Asserted on the pair, because a reader of this table
       * who checks only `classify.ts` concludes the classifier is unswitchable and
       * adds a duplicate here.
       */
      expect(read('src/lib/moderation/gate.ts')).toContain(ownSwitch);
    });
  }
});

describe('the register and the wiring agree', () => {
  it('every registered flag has exactly one call site wired to it', () => {
    expect(FLAGGED.map((f) => f.env).sort()).toEqual(
      DEFERRABLE_FLAGS.map((f) => f.env).sort(),
    );
  });

  it('no flag is declared and left unwired', () => {
    /*
     * The inverse failure, and the quieter one: a variable documented in
     * `.env.example` and in DEPLOY-VERCEL that governs nothing reads as a working
     * kill switch to whoever sets it at 2am, and it will be believed.
     */
    for (const flag of DEFERRABLE_FLAGS) {
      const wired = FLAGGED.find((f) => f.env === flag.env);
      expect(wired, `${flag.env} is registered but no call site checks it`).toBeDefined();
      expect(read(wired!.file)).toContain(wired!.marker);
    }
  });
});
