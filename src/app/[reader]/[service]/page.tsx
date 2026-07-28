import { notFound } from 'next/navigation';
import { READERS, readerById } from '@/data/readers';
import { SERVICES, serviceById } from '@/data/services';
import { currentUser } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import { getProfile } from '@/lib/db/queries/profile';
import { Draw } from './Draw';

/** Nine combinations, all known at build time. */
export function generateStaticParams() {
  return READERS.flatMap((r) => SERVICES.map((s) => ({ reader: r.id, service: s.id })));
}

export default async function DrawScreen({
  params,
}: {
  params: Promise<{ reader: string; service: string }>;
}) {
  const { reader: readerId, service: serviceId } = await params;
  const reader = readerById(readerId);
  const service = serviceById(serviceId);
  if (!reader || !service) notFound();

  /*
   * V7+. THE NICKNAME, AND IT IS HERE TO CLOSE A CONSENT GAP RATHER THAN TO DRAW A
   * LABEL.
   *
   * `ShareFooter` was mounted from `Draw.tsx` with no `nickname` prop for two
   * workstreams. The sheet's toggle reads `disabled={... || !nickname}`, so on this
   * screen it was dead — while its STATE stayed `true`, so the mint posted
   * `include_nickname: true`, the resolver projected the column, and the public page
   * rendered a nickname the sharer could neither see in the preview nor switch off.
   * `effectiveIncludeNickname` is the other half of the fix; this is the half that
   * gives the querent the choice they were supposed to have.
   *
   * ── WHY THE COST IS ACCEPTABLE ON THE ONE SCREEN THAT STREAMS ───────────────
   *
   * It is ONE indexed primary-key read, and it does not make this route dynamic:
   * the root layout already awaits `getLocale()` for `<html lang>`, so every route
   * in the app builds as ƒ and has since W6. `generateStaticParams` stays because it
   * still enumerates the nine valid combinations.
   *
   * **WRAPPED AND SWALLOWED**, exactly as `history/[id]/page.tsx` does it and for
   * the same reason: the draw is the page and may take the page down with it, while
   * this is a label inside a sheet nobody has opened yet. A null nickname disables
   * the toggle — which is now honest, because `effectiveIncludeNickname` makes the
   * wire agree with the disabled control.
   *
   * NEVER logged with the error object. `getProfile` binds a user id, and the rule
   * that every `catch` touching the database is a potential PII sink was paid for
   * twice in production.
   */
  let nickname: string | null = null;
  const viewer = await currentUser();
  if (viewer) {
    try {
      nickname = (await getProfile(db, viewer.id))?.nickname ?? null;
    } catch (err) {
      console.warn('[draw] nickname unavailable', { name: (err as Error)?.name });
    }
  }

  return <Draw reader={reader} service={service} nickname={nickname} />;
}
