/**
 * PURE. The one policy decision in the download control, and the only part
 * `npm test` can reach.
 *
 * Extracted exactly as `src/lib/swipeDeck.ts` is extracted from `SwipeDeck.tsx`:
 * the component needs a DOM, the decision does not, and the decision is the part
 * that can be wrong.
 *
 * **WHY THERE IS A DECISION AT ALL.** The control is a real `<a href download>`:
 * it works with no JavaScript, needs no session, and is a crawlable link to an
 * image. But on iOS `<a download>` puts the file in **Files**, and *Set
 * Wallpaper* can only read from **Photos** -- so on the one platform this app is
 * built for, the default behaviour produces a file the person cannot use for the
 * thing they downloaded it for. `navigator.share({ files })` surfaces iOS's
 * "Save Image", which lands it in Photos in one tap. S-D8 already sanctions the
 * Web Share API on a public page.
 *
 * **AND WHY IT IS NOT SIMPLY "SHARE IF AVAILABLE".** Desktop Chrome can also
 * share files, and on a desktop a download is exactly what the person asked for;
 * hijacking it into an OS share sheet is worse than the default. So the gate is
 * two capability tests and NEVER a user-agent string:
 *
 *   - `navigator.canShare({ files })` -- can this browser share a file at all
 *   - `(pointer: coarse)` -- is the primary pointer a finger, i.e. is this a
 *     device where "the file system" is not somewhere the person can act
 *
 * No UA sniff, and nothing derived from a UA ever reaches an analytics prop.
 */
export type DownloadMethod = 'share' | 'link';

export function chooseMethod(env: {
  canShareFiles: boolean;
  coarsePointer: boolean;
}): DownloadMethod {
  return env.canShareFiles && env.coarsePointer ? 'share' : 'link';
}
