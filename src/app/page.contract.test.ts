import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(join(process.cwd(), 'src/app/page.tsx'), 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('/ dual render (S-D5)', () => {
  it('branches on currentUser() and on nothing else', () => {
    /*
     * `currentUser()` AND NOT `auth()`: `src/lib/auth/server.ts` is explicit that
     * everything needing "who is this, on the server" goes through it, and
     * `/login` records what happens when two surfaces use two predicates -- a
     * redirect loop with nothing logged.
     *
     * It is DATABASE-FREE (that file says so), which is what makes this branch
     * legal on a public page at all: roadmap §10 forbids a database read on the
     * request-render path of a public route.
     */
    expect(CODE).toContain('currentUser()');
    expect(CODE).not.toContain('auth()');
    expect(CODE).not.toContain('cookies()');
    expect(CODE).toContain('<Landing');
  });

  it('does NOT read the session inside generateMetadata', () => {
    /*
     * The <title>, the description and the canonical must be the same for both
     * arms. A session read there would be a second decode that can disagree with
     * the page's, and it would make the ONE piece of this route that a crawler
     * caches vary by cookie.
     */
    const meta = CODE.slice(CODE.indexOf('generateMetadata'));
    const body = meta.slice(0, meta.indexOf('export default'));
    expect(body).not.toContain('currentUser');
  });

  it('sets a self-referential canonical', () => {
    // Relative, resolved by `metadataBase`. S2 replaces it with S-D15's helper,
    // which adds the hreflang pair -- one line, in this file.
    expect(CODE).toContain('canonical');
  });

  it('keeps the picker arm intact', () => {
    // Byte-for-byte behaviour, asserted on the pieces that would go missing in a
    // careless refactor: the account button with its surface, the frequency line,
    // the three reader banners and the disclaimer.
    expect(CODE).toContain('surface="reader_picker"');
    expect(CODE).toContain('showLanguage={localeSwitcherEnabled()}');
    expect(CODE).toContain('<FrequencyLine />');
    expect(CODE).toContain('READERS.map');
    expect(CODE).toContain("t('common.disclaimer.short')");
  });

  it('keeps the two arms in two components, so neither can grow the other half', () => {
    /*
     * The dispatcher is three lines and the picker moved into a named function
     * rather than staying inline behind a ternary. That is what makes
     * `Landing.test.ts`'s "no session, no database" assertions meaningful: the
     * signed-out arm is a separate file with its own fence, not a branch inside a
     * component that already imports `AccountButton`.
     */
    expect(CODE).toContain('async function ReaderPicker()');
    expect(CODE).toMatch(/if \(!user\) return <Landing \/>;/);
  });
});
