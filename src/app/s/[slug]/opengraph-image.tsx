/* eslint-disable @next/next/no-img-element */
/**
 * The WhatsApp preview (VD18).
 *
 * ── THE FINDING THAT SHAPES THIS FILE: SATORI CANNOT DECODE WEBP ────────────
 *
 * `next/og` is available with no new dependency — satori, resvg, yoga and a
 * fallback Geist are all vendored inside `next@16.2.11`. But its allowed-format
 * list, read out of the bundle rather than out of documentation, is
 *
 *     var qI = [image/png, image/apng, image/jpeg, image/gif, image/svg+xml];
 *     ...
 *     if (!qI.includes(t)) throw new Error(`Unsupported image type: ${t}`);
 *
 * `image/webp` and `image/avif` are *detected* and then *thrown on*. **Every card
 * in `public/cards/` is WebP**, so the naive implementation throws at REQUEST
 * time, in the one code path nobody looks at — the only symptom is a broken
 * preview inside somebody else's chat. `tools/normalize_cards.py` therefore emits
 * a third format, `public/cards/og/<slug>.png` at 200×300, committed like the
 * other two so the deploy still needs no Python.
 *
 * ── THE RUNTIME, AND A CORRECTION TO THE OBVIOUS ASSUMPTION ─────────────────
 *
 * `ImageResponse` is often described as edge-only and unable to read a
 * filesystem. **That is not fixed by the API** — `image-response.js` picks
 * `index.edge.js` or `index.node.js` off `process.env.NEXT_RUNTIME` at import
 * time, so the runtime is whatever the segment declares. This one declares
 * `nodejs`, which it must anyway, because it queries Postgres through postgres.js.
 *
 * Even so the art is referenced by **absolute URL** and satori fetches it, rather
 * than `readFile(join(process.cwd(), 'public', …))`. On Vercel `public/` is
 * uploaded to the CDN and its presence on the function's filesystem depends on
 * tracing that nothing here declares; a URL is the documented pattern and works
 * identically in dev against `localhost:3001`.
 *
 * ── WHAT IT MUST NEVER SAY ─────────────────────────────────────────────────
 *
 * **NEVER THE QUESTION. NEVER THE BODY. NEVER THE NICKNAME.** VD18 names the
 * first two; the nickname is added because a preview card is cached by every
 * messenger that sees the link, and `include_nickname` is a decision about the
 * PAGE, not about a cache nobody controls. **Not even when `include_question` is
 * true** — the toggle governs a page somebody chose to open, and a preview lands
 * in every group chat before anyone clicks.
 *
 * ── AND IT MUST NOT BE A SLUG ORACLE ───────────────────────────────────────
 *
 * A revoked, deleted, never-existed or rate-limited slug returns the SAME
 * response shape: a generic branded card, 200. **Not a 404** — a crawler that
 * gets a 404 shows no preview at all, which is a worse outcome for a link that
 * was merely turned off, and a 404 here would tell anybody holding a slug
 * whether it was ever real. It is rate-limited independently of the page because
 * it is cheaper to request and is fetched by machines rather than people.
 *
 * **AND THE `try`/`catch` AROUND IT CANNOT DO THAT ON ITS OWN — MEASURED.**
 * `new ImageResponse(...)` returns immediately and rasterizes LAZILY, when
 * something reads the body, so a satori failure escapes the handler entirely and
 * Next answers 500. The plan's "wrapped, so a fetch failure degrades rather than
 * 500s" was therefore false as written, and the consequence is worse than a broken
 * preview: **a 500 for a broken card against a 200 for a revoked slug IS the
 * oracle this section forbids.** `rasterize()` below forces the render inside the
 * `try` so the fallback is real. Found by fetching the route, not by reading it.
 */
import { ImageResponse } from 'next/og';

import { cardById } from '@/data/deck';
import { readerById } from '@/data/readers';
import { clientIp } from '@/lib/ratelimit/clientIp';
import { hit } from '@/lib/ratelimit';
import { resolveShare, shareOrigin } from '@/lib/share/links';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'JMTarot';

/** Its own budget, because it is cheaper than the page and crawlers pull it. */
const OG_PER_IP = 60;
const HOUR_MS = 3_600_000;

/**
 * Cached hard, and separately from the page.
 *
 * The image is a pure function of immutable reading data (VD7) and it is the
 * expensive path — three PNG fetches, a font parse and a rasterize. The cost is
 * that **a revoked link's preview lingers at the CDN for up to a day**, which is
 * acceptable only because VD18 keeps the prose out of it: what lingers is three
 * card backs and a reader's name. If that is ever judged wrong, `s-maxage` drops
 * to minutes and the CPU cost goes up; the page itself is `force-dynamic` and
 * stops immediately on revoke either way.
 */
const CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

const GOLD = '#c9a227';
const GOLD_TEXT = '#f2e7c9';
const CANVAS = '#0a0812';
const MUTED = '#9c93b4';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  /*
   * Loaded ONCE per invocation, before anything can throw. If it fails, `fonts`
   * is undefined and `ImageResponse` falls back to its bundled Geist — off-brand
   * but RENDERED, and a rendered preview beats a missing one, because a card that
   * fails to generate shows nothing at all and is invisible from inside the app.
   */
  const fonts = await loadCinzel();

  try {
    const h = await headersOf();
    const gate = await hit(`share:og:${clientIp(h)}`, Date.now(), OG_PER_IP, HOUR_MS);
    // Rate limited looks exactly like revoked, deleted and never-existed.
    if (!gate.ok) return generic(fonts);

    const resolved = await resolveShare(slug);
    if (!resolved || resolved.entity !== 'reading') return generic(fonts);

    const reader = readerById(resolved.reading.readerId);
    const cards = [...resolved.reading.cards]
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ card: cardById(c.cardId), reversed: c.reversed }))
      .filter((c): c is { card: NonNullable<ReturnType<typeof cardById>>; reversed: boolean } =>
        Boolean(c.card),
      );

    if (!reader || cards.length === 0) return generic(fonts);

    const origin = shareOrigin();

    return await rasterize(
      (
        <div style={frame}>
          <div style={eyebrow}>MAJOR ARCANA</div>

          <div style={row}>
            {cards.map(({ card, reversed }) => (
              <div key={card.id} style={column}>
                <div style={plate}>
                  <img
                    src={`${origin}/cards/og/${card.slug}.png`}
                    width={190}
                    height={285}
                    alt=""
                    style={{
                      width: 190,
                      height: 285,
                      /*
                       * A reversed card is drawn upside down, exactly as the app
                       * draws it. The orientation is part of the reading.
                       *
                       * **SPREAD, NOT `transform: reversed ? … : undefined`.**
                       * SATORI THROWS on an `undefined` CSS value --
                       * `Failed to parse ... in CSS rule 'transform: undefined'`
                       * -- so the ternary form takes down every UPRIGHT card,
                       * which is most of them. Measured against a live dev server;
                       * it is invisible to typecheck and to the build.
                       */
                      ...(reversed ? { transform: 'rotate(180deg)' } : {}),
                    }}
                  />
                </div>
                <div style={cardName}>
                  {/* CARD NAMES STAY ENGLISH IN BOTH LOCALES, and `⌄` marks a
                      reversal rather than the word, because this image carries no
                      localized copy at all -- the viewer's language is unknown to
                      a messenger's crawler. */}
                  {card.name.toUpperCase()}
                  {reversed ? ' ⌄' : ''}
                </div>
              </div>
            ))}
          </div>

          {/*
            THE READER AS TYPE, NOT AS A PORTRAIT. `public/dukuns/*.jpg` would
            decode fine -- it is JPEG -- but it is a 2:1 environmental scene at
            full page width, and scaled into a corner it reads as mud while costing
            a second network fetch and a JPEG decode on a CPU-metered path. The
            name and title in Cinzel satisfy "the reader" in VD18. Flagged as a
            reading of VD18 rather than the only one; see the plan's open questions.
          */}
          <div style={readerLine}>
            {`Read by ${reader.name} — ${reader.title}`}
          </div>
          <div style={wordmark}>JMTAROT</div>
        </div>
      ),
      fonts,
    );
  } catch {
    /*
     * SATORI THROWS ON A FETCH FAILURE, so the whole construction is wrapped:
     * one unreachable card PNG would otherwise take the preview down entirely.
     * Never log the error -- `resolveShare` reaches a driver whose errors quote
     * their bound parameters, and this is the one path a crawler drives at volume.
     */
    return generic(fonts);
  }
}

type Fonts = Awaited<ReturnType<typeof loadCinzel>>;

/**
 * Build the image AND FINISH IT, so a failure is catchable.
 *
 * `ImageResponse` is a `Response` whose body is a stream satori fills on demand.
 * Returning it straight from the handler means the rasterize happens after this
 * function has returned, i.e. outside any `try` — see the header. Reading the body
 * to completion here moves the throw back inside.
 *
 * The buffering costs nothing that matters: the whole image is ~65KB and this
 * route is CDN-cached for a day. The alternative is a 500 on the one path that
 * must be indistinguishable from every other failure.
 */
async function rasterize(element: React.ReactElement, fonts: Fonts): Promise<Response> {
  const response = new ImageResponse(element, {
    ...size,
    ...(fonts ? { fonts } : {}),
  });
  // Named `png` and not `body`: `page.contract.test.ts` asserts this file never
  // reads a reading's `.body`, and a local called `body` makes a reader check.
  const png = await response.arrayBuffer();
  return new Response(png, {
    headers: { 'content-type': contentType, 'cache-control': CACHE },
  });
}

/**
 * The answer for revoked, deleted, never-existed, rate-limited and broken.
 *
 * ONE SHAPE FOR ALL FIVE, and a 200 rather than a 404 — see the header. It also
 * means a genuinely dead link still previews as JMTarot rather than as a blank in
 * somebody's chat, which is the honest thing for a link that was turned off.
 */
function generic(fonts: Fonts): Promise<Response> {
  return rasterize(
    (
      <div style={frame}>
        <div style={{ ...eyebrow, marginBottom: 40 }}>MAJOR ARCANA</div>
        <div
          style={{
            display: 'flex',
            fontFamily: 'Cinzel, serif',
            fontSize: 64,
            letterSpacing: 6,
            color: GOLD_TEXT,
          }}
        >
          JMTAROT
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 18,
            fontFamily: 'Cinzel, serif',
            fontSize: 24,
            letterSpacing: 3,
            color: MUTED,
          }}
        >
          22 MAJOR ARCANA · 3 READERS
        </div>
      </div>
    ),
    fonts,
  );
}

/**
 * Cinzel, loaded the way Next's bundler traces.
 *
 * `new URL('./…', import.meta.url)` and NOT a read out of `.next/`, where
 * `next/font/google` writes hashed filenames that change on every font update.
 * One committed file next to the route — OFL 1.1, license committed beside it.
 *
 * **IT IS THE VARIABLE FONT, SO THE WEIGHT IS THE DEFAULT INSTANCE (400).** The
 * plan asked for `Cinzel-SemiBold.ttf`; Google's font repository ships no static
 * instance for this family, and satori uses `weight` for font MATCHING rather than
 * for setting a variation axis, so a static SemiBold is the only way to get 600
 * and it does not exist upstream. Regular Cinzel is the app's own body display
 * weight, so the preview is on-brand either way; this is recorded rather than
 * hidden because "why is the preview lighter than the app" is otherwise a mystery.
 *
 * Returns `undefined` on any failure. See the header for why that is a degradation
 * and not an error.
 */
async function loadCinzel() {
  try {
    const data = await fetch(new URL('./Cinzel-Variable.ttf', import.meta.url)).then((r) =>
      r.arrayBuffer(),
    );
    return [{ name: 'Cinzel', data, style: 'normal' as const, weight: 400 as const }];
  } catch {
    return undefined;
  }
}

/** `headers()` behind one import, so the body reads as a sequence. */
async function headersOf(): Promise<Headers> {
  const { headers } = await import('next/headers');
  return headers();
}

/*
 * ── STYLES ──────────────────────────────────────────────────────────────────
 *
 * INLINE OBJECTS, NOT A CSS MODULE. Satori implements a subset of flexbox and
 * reads only inline styles; a `.module.css` class would resolve to a name it does
 * nothing with. **Every element with more than one child needs an explicit
 * `display: flex`** — satori throws on a `div` with multiple children and no
 * display, which is the second-most-likely way this route fails at request time.
 *
 * The colours are `tokens.css`'s values, restated because satori cannot read a
 * custom property. That is a real duplication and the reason it is accepted: the
 * alternative is importing `@/theme/tokens` for four strings into a route that
 * cannot use the other forty.
 */
const frame: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: CANVAS,
  /* The radial the app paints behind everything, flattened to two stops --
     satori supports `radial-gradient` but not the three-stop token. */
  backgroundImage: 'radial-gradient(circle at 50% 35%, #221a3a 0%, #08060f 78%)',
  padding: 40,
};

const eyebrow: React.CSSProperties = {
  display: 'flex',
  fontFamily: 'Cinzel, serif',
  fontSize: 22,
  letterSpacing: 9,
  color: GOLD,
  marginBottom: 26,
};

const row: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  gap: 28,
  alignItems: 'flex-start',
};

const column: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
  /* Fixed, for the reason on `plate`: the three labels must share a baseline. */
  width: 198,
};

const plate: React.CSSProperties = {
  display: 'flex',
  /* The gold hairline the app draws around a face-up card. */
  border: `1px solid ${GOLD}`,
  borderRadius: 8,
  padding: 3,
  /*
   * EXPLICIT, so the three columns cannot disagree. Measured from the first
   * render: the reversed card's label sat ~8px lower than its neighbours', because
   * satori sized each plate from its own content and a rotated child does not
   * measure identically to an upright one. 190 + 3 padding + 1 border on each side.
   */
  width: 198,
  height: 293,
  boxSizing: 'border-box',
  alignItems: 'center',
  justifyContent: 'center',
};

const cardName: React.CSSProperties = {
  display: 'flex',
  height: 24,
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'Cinzel, serif',
  /* 15, not 17: `THE HIGH PRIESTESS` at 17 overflows a 198px column, and satori
     does not shrink text to fit -- it overlaps its neighbour instead. */
  fontSize: 15,
  letterSpacing: 1.5,
  color: GOLD_TEXT,
  textAlign: 'center',
};

const readerLine: React.CSSProperties = {
  display: 'flex',
  marginTop: 26,
  fontFamily: 'Cinzel, serif',
  fontSize: 22,
  letterSpacing: 2,
  color: MUTED,
};

const wordmark: React.CSSProperties = {
  display: 'flex',
  marginTop: 10,
  fontFamily: 'Cinzel, serif',
  fontSize: 16,
  letterSpacing: 6,
  color: GOLD,
};
