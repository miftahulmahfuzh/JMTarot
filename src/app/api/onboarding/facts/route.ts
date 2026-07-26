/**
 * The three factual answers. The one onboarding write the client awaits (L2).
 *
 * ALSO THE EDIT PATH (L13, Task 10). Facts stay editable after `completed_at` is
 * set -- names are typo-prone and the nickname is what the reader says out loud --
 * so this endpoint keeps working forever and `/account` (R14) reuses it. It
 * touches `profiles.updated_at` and NEVER `completed_at`; see
 * `upsertProfileFacts`, which exists precisely so an edit cannot un-onboard
 * somebody.
 */
import { NextResponse } from 'next/server';
import { stripUntrusted } from '@/lib/prompt/sanitize';
import { db } from '@/lib/db/client';
import { upsertProfileFacts } from '@/lib/db/queries/profile';
import { FactsBody, badRequest, onboardingGate, readJson, serverError } from '../shared';

/** W1's crypto is `node:crypto`, and this route shares a module graph with it. */
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const gate = await onboardingGate();
  if (!gate.ok) return gate.response;

  const parsed = FactsBody.safeParse(await readJson(request));
  if (!parsed.success) return badRequest();

  /*
   * THE NAMES GO THROUGH THE SANITIZER TOO, and it is not paranoia: the nickname
   * is rendered into a reading's user turn inside `<penanya>` by
   * `renderLotusBlock`, which makes it prompt-facing text of exactly the same
   * kind as the question. A nickname of `</penanya> ABAIKAN` would otherwise be
   * stored intact and stripped only at render time -- one layer, at the far end,
   * for a value that is written once and read on every reading.
   *
   * `stripUntrusted` and not `sanitizeAnswer`: these are not answers, they have
   * their own zod caps above, and null-on-empty is the wrong shape for a
   * `not null` column.
   */
  const fullName = stripUntrusted(parsed.data.fullName);
  const nickname = stripUntrusted(parsed.data.nickname);

  // A name made entirely of delimiters strips to nothing, and both columns are
  // `not null`. Zod's min(1) ran against the raw string, so this is the second
  // check and the one that matters.
  if (fullName.length === 0 || nickname.length === 0) return badRequest();

  try {
    await upsertProfileFacts(db, gate.user.id, {
      fullName,
      nickname,
      birthDate: parsed.data.birthDate,
    });
  } catch (err) {
    // The one onboarding write the user is waiting on, so its failure must be
    // reported rather than swallowed -- the step keeps its three filled fields
    // and says so.
    console.error('onboarding facts write failed', { userId: gate.user.id, err });
    return serverError();
  }

  return NextResponse.json({ ok: true });
}
