import type { Locale } from '@/data/types';

/**
 * Crisis resources. **THE ONE FILE IN THIS CODEBASE WHERE BEING OUT OF DATE IS A
 * SAFETY FAILURE RATHER THAN A COSMETIC ONE.**
 *
 * **NO PHONE NUMBER, HOTLINE URL OR SERVICE NAME APPEARS ANYWHERE ELSE IN
 * `src/`.** Not in the i18n catalog, not in a component, not in a test fixture.
 * `resources.test.ts` derives the digit strings from this file and greps the
 * rest of the tree for them, so a copy-pasted number fails the suite rather than
 * quietly going stale in a component nobody rereads.
 *
 * **NOTHING UNVERIFIED IS ENTERED. An empty list is a correct answer**; it
 * renders as "contact your local emergency service", which invents nothing and
 * is true in every jurisdiction. Adding an entry means opening the page,
 * reading it, and recording `sourceUrl` + `verifiedOn`.
 *
 * DELIBERATELY NOT `server-only` (W7-D14's third exception). The refusal renders
 * these in the browser, and a hotline number is public information. It is the
 * one moderation module a client component may import.
 *
 * ---
 *
 * WHAT WAS CHECKED, AND WHAT THAT CHANGED. Every line below was re-verified on
 * **2026-07-27** against a live page, and doing so overturned three things W7's
 * plan asserted:
 *
 *   1. **The plan's Kemenkes URL is dead.** It cited
 *      `.../konten/158/151/0/layanan-sehat-jiwa-healing-119`, which now 404s.
 *      The live ministry page is the `cegah-bunuh-diri-...` slug below. A
 *      citation that has silently rotted is precisely what the staleness test
 *      exists to surface, and it surfaced on the first run.
 *   2. **`gratis` IS confirmed and may be written.** The plan said not to claim
 *      it until confirmed. The ministry page says the hotline is "disediakan
 *      secara gratis", so it is now sourced rather than assumed.
 *   3. **The hours are NOT "24 jam", and the disagreement is live.** InfoPublik
 *      and Detik both describe a 24-hour service; the ministry's own page says
 *      "Layanan ini akan beroperasi dari pagi hingga malam hari". **Where a
 *      news report and the ministry disagree, the ministry wins** -- promising
 *      somebody in crisis that a line is staffed at 3am when it is not is the
 *      worst failure this file can have.
 *
 * NOT ENTERED, and each absence is deliberate:
 *
 *   - **findahelpline.com** -- the plan's international directory. Returned
 *     HTTP 403 on two attempts on 2026-07-27, so its contents could not be
 *     read. A 403 is probably a bot block rather than a dead site, but "probably
 *     fine" is not the standard this file holds. Re-check by hand and add it;
 *     it would be a genuinely useful entry for a querent outside Indonesia.
 *   - **112**, the Indonesian national emergency number. Never verified by
 *     anyone on this project. The copy says "layanan darurat setempat" / "your
 *     local emergency number" with no digits, which is correct everywhere and
 *     invents nothing.
 *   - **The Healing119 WhatsApp number.** Detik prints one. The ministry page
 *     does not -- it says to visit the site and press the button -- so the
 *     entry points at the site, which is also the form that survives the number
 *     changing.
 */
export type CrisisResource = {
  id: string;
  /** Which UI locales show it. */
  locales: Locale[];
  kind: 'phone' | 'chat' | 'directory';
  /** e.g. "Healing119, Kementerian Kesehatan". Rendered as written. */
  label: Record<Locale, string>;
  /** The dialable number or the domain. The thing a person acts on. */
  value: string;
  href?: string;
  /**
   * Hours, caveats, cost. **NEVER AN UNVERIFIED CLAIM**, and never softened:
   * if the source says the line is not staffed overnight, so does this.
   */
  note?: Record<Locale, string>;
  sourceUrl: string;
  /** `YYYY-MM-DD`. The date somebody actually opened `sourceUrl` and read it. */
  verifiedOn: string;
};

const RESOURCES: CrisisResource[] = [
  {
    id: 'healing119',
    locales: ['id', 'en'],
    kind: 'phone',
    label: {
      id: 'Healing119, Kementerian Kesehatan',
      en: 'Healing119, Indonesian Ministry of Health',
    },
    value: '119 ext. 8',
    /*
     * The ministry's own wording on hours, translated but not upgraded. The
     * English says "daytime into the evening" rather than inventing a clock
     * range the source does not give.
     */
    note: {
      id: 'Gratis. Beroperasi dari pagi hingga malam hari.',
      en: 'Free. Open from morning through the evening — not overnight.',
    },
    sourceUrl:
      'https://kesprimkom.kemkes.go.id/konten/158/151/0/cegah-bunuh-diri-dukung-kesehatan-jiwa-kenali-layanan-healing119-id',
    verifiedOn: '2026-07-27',
  },
  {
    id: 'healing119-web',
    locales: ['id', 'en'],
    kind: 'chat',
    label: {
      id: 'Healing119 lewat WhatsApp atau panggilan suara',
      en: 'Healing119 by WhatsApp or voice call',
    },
    value: 'healing119.id',
    href: 'https://www.healing119.id',
    /*
     * The site, not the WhatsApp number. The ministry publishes a button rather
     * than digits, and pointing at the button is also the form that survives the
     * number being changed without anyone telling us.
     */
    sourceUrl: 'https://www.healing119.id',
    verifiedOn: '2026-07-27',
  },
  {
    id: 'into-the-light',
    locales: ['id', 'en'],
    kind: 'directory',
    label: {
      id: 'Into The Light Indonesia — daftar layanan kesehatan jiwa',
      en: 'Into The Light Indonesia — directory of mental health services',
    },
    value: 'intothelightid.org',
    href: 'https://www.intothelightid.org/tentang-bunuh-diri/daftar-penyedia-layanan-kesehatan-mental/',
    /*
     * **THE CAVEAT IS NOT OPTIONAL.** The site states in its own words that it
     * does not run a crisis line: "Situs ini tidak memberikan layanan konseling
     * bunuh diri atau layanan krisis 24 jam". Listing it beside a hotline
     * without saying so would send somebody in crisis to a page that cannot
     * help them tonight.
     */
    note: {
      id: 'Daftar layanan, bukan layanan krisis. Mereka tidak menerima panggilan darurat.',
      en: 'A directory of services, not a crisis line. They do not take emergency calls.',
    },
    sourceUrl: 'https://www.intothelightid.org',
    verifiedOn: '2026-07-27',
  },
];

/** What the UI shows for one locale. Order is the order they are rendered in. */
export function crisisResources(locale: Locale): CrisisResource[] {
  return RESOURCES.filter((r) => r.locales.includes(locale));
}

/** Every entry, for the staleness and no-stray-digits tests. */
export const ALL_CRISIS_RESOURCES: readonly CrisisResource[] = RESOURCES;
