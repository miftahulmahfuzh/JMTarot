import { serializeJsonLd, type JsonLdNode } from '@/lib/seo/jsonld';

/**
 * One `<script type="application/ld+json">`, and the only one in the app.
 *
 * ── A PLAIN TEXT CHILD, AND `dangerouslySetInnerHTML` IS REFUSED (R1) ───────
 *
 * **S1's plan used `dangerouslySetInnerHTML` here and asked roadmap §5 rule 3 for
 * an exception. THE EXCEPTION WAS REFUSED, BECAUSE THE PREMISE WAS MEASURED AND
 * FALSE.** The plan argued that React HTML-escapes text children, so
 * `<script>{JSON.stringify(x)}</script>` turns every `"` into `&quot;` and the
 * block is invalid JSON no crawler parses. S6 independently argued the opposite
 * mechanism — that React escapes `&`, so `Syarat & Ketentuan` arrives doubled.
 *
 * **Both were wrong.** On this tree's react-dom 19.2.8, a plain text child of
 * `<script>` round-trips through `JSON.parse` intact: `&` stays literal, `"`
 * stays `\"`, and React applies *script-aware* escaping to `</script` instead,
 * which is still valid JSON and still neutralises the breakout. Neither predicted
 * failure mode exists. **The generalisable lesson is worth more than the fix:
 * framework escaping behaviour is measured here, never recalled** — two competent
 * agents produced two confidently-argued, mutually exclusive, both-wrong answers,
 * and neither ran the four lines that settle it.
 *
 * So rule 3 stands unamended and there is no `dangerouslySetInnerHTML` anywhere in
 * v0.4.0. `serializeJsonLd` pre-escapes `&`, `<` and `>` to `\uXXXX` ANYWAY — not
 * for correctness, but because the behaviour above is an unspecified React
 * implementation detail and a release must not depend on one. The escapes are
 * ordinary JSON, so nothing downstream can tell, and the output is correct under
 * both behaviours. `JsonLd.test.ts` renders this component and parses the result.
 *
 * ── AND WHY THIS MAKES TIGHTENING `script-src` EASIER, NOT HARDER ────────────
 *
 * `next.config.ts` ships `script-src 'self' 'unsafe-inline'` in REPORT-ONLY and
 * says the enforced version needs a per-request nonce generated in middleware. **A
 * block whose `type` is not a JavaScript MIME type is a data block, not a script,
 * and is not executed** — but the safe assumption is that a future strict policy
 * will want a nonce on it anyway.
 *
 * **THAT IS THE WHOLE REASON THIS IS A COMPONENT AND NOT INLINE JSX PER PAGE.**
 * When the nonce lands, it is ONE prop threaded into ONE file, not a hunt across
 * forty-four `generateMetadata` functions. `JsonLd.test.ts` asserts this is the
 * only file in `src/` that writes the tag, so that stays true as S3, S4 and S6 add
 * node types.
 *
 * ── IT IS A SERVER COMPONENT ────────────────────────────────────────────────
 *
 * No `'use client'`. Structured data is decided on the server and read only by
 * crawlers; a hydration bundle for a block nobody interacts with is waste on the
 * one page a stranger reads over mobile data. Same argument `Legal.tsx` makes.
 */
export function JsonLd({ node }: { node: JsonLdNode }) {
  return <script type="application/ld+json">{serializeJsonLd(node)}</script>;
}
