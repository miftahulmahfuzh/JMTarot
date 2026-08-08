/**
 * The run engine's decision, as a pure function. **`run.ts` DOES THE EFFECTS; THIS
 * DECIDES WHAT THEY ARE.**
 *
 * ── ITS OWN FILE BECAUSE `run.ts` CANNOT BE IMPORTED UNDER VITEST ──────────
 *
 * `run.ts` reaches `@/lib/db/client`, which starts with `import 'server-only'`, so a
 * test that imports it dies on `Missing required environment variable: DATABASE_URL`
 * before a single assertion runs. **Extracting the decision is the only way the state
 * machine gets a table behind it**, and a state machine with no table behind it is how
 * a run resumes at the wrong beat.
 *
 * `gate.decide()`, `swipeDeck.ts`, `choice.ts` and `rollup.ts` are the four precedents,
 * and the reason is always the same one this codebase gives: **it separates the pure
 * part from the part that touches the world, because the pure part is what tests can
 * reach.**
 *
 * PURE. No clock, no handle, no env, no `server-only`. Its only import is a type.
 */
import type { Beat, BeatSheet, RunStatus } from './types';

/** What `advance()` should do next, decided without touching the world. */
export type Action =
  | { kind: 'plan' }
  | { kind: 'execute'; beat: Beat; index: number; total: number }
  /** The sheet is exhausted but the status still says `running` — finish it. */
  | { kind: 'finish' }
  | { kind: 'idle' };

/** The three fields of a claimed run this decision reads, and nothing else. */
export type RunView = {
  status: RunStatus;
  beats: BeatSheet | null;
  beatsDone: number;
};

/**
 * **THE STATE MACHINE, AS A FUNCTION OF THE CLAIMED ROW AND NOTHING ELSE.**
 *
 * | status               | beats | beatsDone | →           |
 * |----------------------|-------|-----------|-------------|
 * | `done` / `abandoned` | any   | any       | `idle`      |
 * | `pending`            | null  | 0         | `plan`      |
 * | `planning`           | null  | 0         | `plan`      |
 * | `running`            | sheet | `< n`     | `execute`   |
 * | `running`            | sheet | `>= n`    | `finish`    |
 *
 * **`beats_done` INDEXES INTO `beats`, WHICH IS WHY `[F1-4]` AND `[F1-5]` EXIST.** A
 * sheet written twice, or written after a beat has executed, makes this function read
 * a different array than the one the run has been executing — and the run resumes at
 * the wrong beat and re-posts one it already posted. **Both guards are in SQL, in the
 * `WHERE`, not here**, because a guard in TypeScript is a guard two concurrent
 * executors both pass.
 */
export function nextAction(run: RunView): Action {
  if (run.status === 'done' || run.status === 'abandoned') return { kind: 'idle' };

  /*
   * **`pending` AND `planning` BOTH PLAN, AND KEEPING THEM APART IS STILL WORTH IT.**
   * `pending` is minted and unclaimed; `planning` is a run whose executor died
   * mid-plan — and `[F1-4]` makes `planning` with a sheet unrepresentable, so a
   * reclaimed one is provably sheetless and must be planned again. Collapsing the two
   * would lose the ability to tell "nobody has advanced this yet" from "an executor
   * died", which is exactly the distinction the lease reclaim reasons about.
   */
  if (run.beats === null) return { kind: 'plan' };

  const total = run.beats.beats.length;
  /*
   * `>=` and not `===`. A row where `beats_done` overshoots its sheet — a lost status
   * flip, a skip past the last beat — must not hand `undefined` to a voice, which
   * would generate against a beat that is not there.
   */
  if (run.beatsDone >= total) return { kind: 'finish' };

  return { kind: 'execute', beat: run.beats.beats[run.beatsDone], index: run.beatsDone, total };
}
