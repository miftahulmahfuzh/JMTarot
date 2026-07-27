/**
 * Who operates JMTarot, in one place.
 *
 * **THE LEGAL ENTITY, THE CONTACT AND THE FORUM APPEAR IN FOUR DOCUMENTS** --
 * the Indonesian and English terms, and the Indonesian and English privacy
 * policy. Four hand-typed copies of a company name is four chances for three of
 * them to be right, and the failure mode is a privacy policy naming an entity
 * that does not match the terms.
 *
 * Settled by reconciliation §7.3 and NOT open for reinterpretation. Two items
 * carry a caveat:
 *
 *   - **`forum` NEEDS CONFIRMATION against the deed of establishment.** Jakarta
 *     has five district courts. `Pengadilan Negeri Jakarta Pusat` is the
 *     conventional default and is what §7.3 drafts; if PT Citra Suka Buana's
 *     domicile is a different Jakarta district, change this one string. Note the
 *     correction §7.3 already applied: Miftah answered "Pengadilan Tinggi
 *     Jakarta", and a *Pengadilan Tinggi* is an appellate court that cannot be a
 *     filing venue, so the court type was corrected and the city kept.
 *
 *   - **`domain` is the product domain, and it is NOT the company's.**
 *     `citrasukabuana.co.id` is the operator; `www.jmtarot.site` is where the app
 *     is served. That is deliberate (§7.2) and worth not being surprised by.
 *
 * Plain data, no `server-only`: the legal pages are server components today, but
 * a company name is public by definition and fencing it would be theatre.
 */
export const OPERATOR = {
  legalName: 'PT Citra Suka Buana',
  contactEmail: 'cs@citrasukabuana.co.id',
  /** Serve one host, never both -- an OAuth redirect URI is a string comparison. */
  domain: 'www.jmtarot.site',
  /** See the caveat above. A first-instance court, per §7.3's correction. */
  forum: 'Pengadilan Negeri Jakarta Pusat',
} as const;
