import { describe, expect, it } from 'vitest';
import { chooseMethod } from './wallpaperDownload';

/**
 * The four-case table, with both negative controls.
 *
 * The two that matter are the ones that are NOT "share if you can": a desktop
 * that can share files must still download, because a download is what the person
 * asked for; and a phone that cannot share files must still download, because the
 * anchor is the contract and the share path is only ever an upgrade.
 */
describe('chooseMethod', () => {
  it('shares on a touch device that can share files -- the iOS Photos path', () => {
    expect(chooseMethod({ canShareFiles: true, coarsePointer: true })).toBe('share');
  });

  it('downloads on a DESKTOP that can share files', () => {
    expect(chooseMethod({ canShareFiles: true, coarsePointer: false })).toBe('link');
  });

  it('downloads on a touch device that cannot share files', () => {
    expect(chooseMethod({ canShareFiles: false, coarsePointer: true })).toBe('link');
  });

  it('downloads when neither is available', () => {
    expect(chooseMethod({ canShareFiles: false, coarsePointer: false })).toBe('link');
  });
});
