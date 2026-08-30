import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `C-D8`'s five conditions, as source-level assertions.
 *
 * **THIS FILE IS THE AUDIT.** The question the release has to keep answerable is *"does
 * anything else open the `answer_text` column?"*, and the only way it stays answerable by
 * reading one file is if a test says so. `persona/prompt.test.ts`'s canary asserts the
 * answers are ABSENT from that prompt; this asserts they enter the chat in exactly one
 * place and leave it in none.
 */

const CHAT_DIR = join(process.cwd(), 'src/lib/chat');

function sourcesUnder(dir: string): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourcesUnder(full));
      continue;
    }
    if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue;
    if (entry.name.includes('.test.')) continue;
    out.push({ path: full.slice(process.cwd().length + 1), text: readFileSync(full, 'utf8') });
  }
  return out;
}

const SOURCES = sourcesUnder(CHAT_DIR);

/** A mention in prose is not a call. Only a call site counts. */
function calls(text: string, fn: string): boolean {
  return new RegExp(`(?<![\\w.\`])${fn}\\s*\\(`).test(
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''),
  );
}

describe('the one decrypt (C-D8 condition 1)', () => {
  /**
   * `[F3-4]`. **`getAnswers` IS CALLED FROM EXACTLY ONE FILE UNDER `src/lib/chat/`**, and
   * that file is the assembler. A second call site *"appears for a good-looking reason"*
   * and then the audit question needs a grep instead of a read.
   */
  it('calls getAnswers from exactly one file, and that file is context.ts', () => {
    const callers = SOURCES.filter((s) => calls(s.text, 'getAnswers')).map((s) => s.path);
    expect(callers).toEqual(['src/lib/chat/context.ts']);
  });

  /**
   * `queries/onboarding.ts` stays *"the only module that encrypts or decrypts that
   * column"*. A second decrypt path here would be invisible to the first assertion,
   * because it would not need `getAnswers` at all.
   */
  it('names neither decryptField nor answerAad anywhere', () => {
    for (const source of SOURCES) {
      expect({ path: source.path, decrypt: source.text.includes('decryptField') }).toEqual({
        path: source.path,
        decrypt: false,
      });
      expect({ path: source.path, aad: source.text.includes('answerAad') }).toEqual({
        path: source.path,
        aad: false,
      });
    }
  });

  /** No `getAnswersForChat`, no widened parameter — `C-D8` condition 1's other half. */
  it('adds no new export to the onboarding query module', () => {
    const onboarding = readFileSync(
      join(process.cwd(), 'src/lib/db/queries/onboarding.ts'),
      'utf8',
    );
    expect(onboarding).not.toContain('ForChat');
    expect(onboarding).not.toContain('forChat');
  });
});

describe('not one decrypted byte reaches the browser (C-D8 condition 2)', () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

  /** Fence 1. The other three are `clientBoundary.test.ts`, `audit-secrets.ts` and the shape. */
  it('marks the assembler and the whole prompt layer server-only', () => {
    for (const path of [
      'src/lib/chat/context.ts',
      'src/lib/chat/prompt/build.ts',
      'src/lib/chat/prompt/base.ts',
      'src/lib/chat/prompt/base.id.ts',
      'src/lib/chat/prompt/base.en.ts',
      'src/lib/chat/prompt/readers.ts',
      'src/lib/chat/prompt/readers.id.ts',
      'src/lib/chat/prompt/readers.en.ts',
      'src/lib/chat/voices/prompt.ts',
    ]) {
      expect({ path, fenced: read(path).includes("import 'server-only'") }).toEqual({
        path,
        fenced: true,
      });
    }
  });

  /**
   * `[F3-1]` and the `clientBoundary.test.ts` exemption F3 asked F1 for: **the two leaves
   * carry no marker and must not acquire one**, because they hold no prose and F4 may
   * legitimately want the pace.
   */
  it('leaves address.ts and pace.ts unmarked, and prose-free', () => {
    for (const path of ['src/lib/chat/address.ts', 'src/lib/chat/voices/pace.ts']) {
      expect({ path, fenced: read(path).includes("import 'server-only'") }).toEqual({
        path,
        fenced: false,
      });
    }
  });

  /**
   * **FENCE 4, THE STRUCTURAL ONE (`[F3-5]`).** `turn.ts` returns four fields of prose. If
   * its return type ever named a context or a prompt turn, a debugging session could ship
   * `worst_thing` to a browser through the one route that is allowed to answer with a
   * bubble.
   */
  it('keeps the context and the prompt turns out of turn.ts’s surface', () => {
    const turn = read('src/lib/chat/voices/turn.ts');
    expect(turn).not.toContain('ChatContext');
    expect(turn).not.toMatch(/\bsystem:/);
    expect(turn).not.toMatch(/\buser:/);
  });

  /**
   * The same rule one layer out: no route may serialise a context. Asserted over the whole
   * API tree rather than over the chat routes alone, because the mistake would be made by
   * whoever is debugging, not by whoever owns the file.
   */
  it('names ChatContext in no route handler', () => {
    const routes = sourcesUnder(join(process.cwd(), 'src/app/api'));
    for (const route of routes) {
      expect({ path: route.path, names: route.text.includes('ChatContext') }).toEqual({
        path: route.path,
        names: false,
      });
    }
  });
});

describe('the assembler’s reads (F3-23)', () => {
  /**
   * **NO NEW QUERY MODULE.** A `queries/chatContext.ts` would duplicate five reads and
   * drift from all five; the assembler composes what exists.
   */
  it('adds no query module of its own', () => {
    const queries = readdirSync(join(process.cwd(), 'src/lib/db/queries'));
    expect(queries).not.toContain('chatContext.ts');
  });

  /** Every read takes its handle first, so the assembler is drivable with a stub. */
  it('takes the handle first, like every query it calls', () => {
    const context = readFileSync(join(CHAT_DIR, 'context.ts'), 'utf8');
    expect(context).toMatch(/assembleChatContext\(\s*db: DbOrTx,/);
  });

  /**
   * `[F3-17]`. The gist is what W5 built for this; `readings.body` would put five readings
   * in a prompt whose output is 22 words, and `readings.question` is raw user text that the
   * gist deliberately is not.
   */
  it('reads recallableReadings and never a reading body or question for the window', () => {
    const context = readFileSync(join(CHAT_DIR, 'context.ts'), 'utf8');
    expect(calls(context, 'recallableReadings')).toBe(true);
    /* `readingWithCards` IS called — for an ATTACHMENT, which the querent pointed at. */
    expect(calls(context, 'readingWithCards')).toBe(true);
    expect(context).not.toContain('readingsForDay');
  });
});

describe('the profile memory (R2)', () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

  /**
   * **THE DIRECTOR READS NO MEMORY, AND THE ASSERTION IS ON THE READ RATHER THAN ON THE
   * RENDER.** `buildChatPrompt` is only ever called by `voices/prompt.ts`, so a director test
   * over the rendered prompt is defence in depth; this is the load-bearing half — the row is
   * not fetched at all on the `chat_plan` path.
   */
  it('reads the memory only for the voice profile', () => {
    const context = read('src/lib/chat/context.ts');
    expect(context).toMatch(/forVoice \? getUserMemory\(/);
  });

  /**
   * **THE CALLERS ARE THREE AND THEY ARE NAMED, AND R3 IS WHY THE LIST GREW FROM ONE.**
   *
   * This read *"exactly one file, like `getAnswers`"* while R2 was the only consumer. R3's
   * `profile` material needs the row too — `detect.ts` to find an item whose key is free
   * this month, `brief.ts` to re-read it at plan time so a line the querent deleted on
   * `/account` is gone from the material and not merely blocked from being minted again.
   *
   * **WHAT THE FENCE IS ACTUALLY FOR SURVIVES THE WIDENING INTACT: the memory PROSE reaches
   * the voice and never the director.** Those two callers read `item.text` to establish that
   * an item is real and drop it; `ProfileMaterial` has no field to put it in, and
   * `material.test.ts` asserts that key set exactly. The list is spelled out rather than
   * relaxed to a glob so that a **fourth** caller is a red test and a decision, which is what
   * this assertion was worth in the first place.
   */
  it('calls getUserMemory from three named files and no others', () => {
    const callers = SOURCES.filter((s) => calls(s.text, 'getUserMemory')).map((s) => s.path);
    expect([...callers].sort()).toEqual([
      'src/lib/chat/context.ts',
      'src/lib/chat/proactive/brief.ts',
      'src/lib/chat/proactive/detect.ts',
    ]);
  });

  /**
   * **AND THE TWO PROACTIVE CALLERS CARRY NO SENTENCE OUT.** The `BAHAN:` line sits in
   * `assemble.ts`'s header, above `<obrolan>` and outside every fence, which is exactly where
   * `build.ts`'s rule says untrusted text may not go — and `user_memory` is model prose
   * rebuilt continuously from whatever the querent types, so it is unlimited attempts at that
   * line where the Lotus summary is one.
   *
   * The type is the real enforcement (there is nowhere to put the text). This is the cheap
   * grep underneath it: neither file may assign a `text:` property at all, so a
   * `ProfileMaterial` that grew one, or a `facts: { text }`, fails here as well.
   */
  it('lets no proactive caller assign the remembered sentence anywhere', () => {
    for (const path of ['src/lib/chat/proactive/detect.ts', 'src/lib/chat/proactive/brief.ts']) {
      const code = read(path)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect({ path, assigns: /\btext\s*:/.test(code) }).toEqual({ path, assigns: false });
    }
  });

  /**
   * `[F3-5]`, extended. The memory is model-written prose about a person; a route that
   * serialised a context would ship it to a browser through the one route allowed to answer
   * with a bubble. The `ChatContext` assertion above already fences the API tree — this
   * fences the field name too, because a debugging session reaches for the field, not the type.
   */
  it('names the memory field in no route handler', () => {
    const routes = sourcesUnder(join(process.cwd(), 'src/app/api'));
    for (const route of routes) {
      expect({ path: route.path, names: route.text.includes('memoryNotes') }).toEqual({
        path: route.path,
        names: false,
      });
    }
  });
});
