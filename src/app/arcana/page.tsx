import { notFound } from 'next/navigation';

/**
 * `/arcana` IS A REAL 404, AND THIS FILE EXISTS SO THAT IT IS ONE.
 *
 * **The roadmap contradicted itself here and reconciliation R6 settled it.** §3.1
 * says *"`/arcana` with no slug is a 404, deliberately"*; §6.1 listed `/arcana`
 * among `gate.test.ts`'s negative controls, i.e. NOT public -- and a non-public
 * path inside the middleware matcher is a **302 to `/login`**, not a 404. Those
 * cannot both hold.
 *
 * **S4 won, and the stake is exact:** `/arcana` is the parent of twenty-two
 * indexed URLs, a crawler will try it, and people hand-edit URLs to it. Google
 * reads a login redirect on a content path as a **soft 404 attributed to
 * `/login`** -- which pollutes the one page roadmap §1 already complains is our
 * whole indexable surface. So `isPublic()` names `/arcana` exactly, and the
 * negative controls became `/arcanax` and `/arcana-foo`.
 *
 * **S1's OBJECTION IS ANSWERED RATHER THAN DISMISSED.** It argued that widening
 * the allowlist for a path with no page is how `isPublic` stops being readable.
 * Correct -- so the path now HAS a page, and this is it. Next would 404 an absent
 * route anyway; the file is here so that the allowlist entry has something to
 * point at and so that this paragraph has somewhere to live.
 *
 * §3.1's note stands: if a future release wants `/arcana` to be a real index, it
 * **301s to `/gallery`**. It does not grow a second index of one collection --
 * two indexes compete with each other, which is the whole reason `/gallery` is the
 * one.
 */
export default function ArcanaIndex(): never {
  notFound();
}
