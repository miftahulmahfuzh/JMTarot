import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/server';
import { getProvider } from '@/lib/llm';
import { buildPrompt } from '@/lib/prompt/build';
import { getLotusBlock, scheduleLotusRefresh } from '@/lib/prompt/lotus.generate';
import { MAX_QUESTION_LENGTH } from '@/lib/prompt/sanitize';
import { hit } from '@/lib/ratelimit';
import { isReaderId } from '@/data/readers';
import { isServiceId, serviceById } from '@/data/services';

export const runtime = 'nodejs';

/**
 * Headroom for `after()` past the end of the stream (reconciliation §6).
 *
 * The Lotus repair runs after the response is flushed, and a reading can take
 * ten seconds to start and several more to finish. Without this the invocation
 * can end at the platform default while a distillation is mid-flight, which
 * shows up as a `lotus_avatars` row that never appears and no error anywhere.
 */
export const maxDuration = 60;

/*
 * The client sends card IDS AND ORIENTATION, NOTHING ELSE. Every word of card
 * text -- names, keywords, stage, polarity -- is looked up server-side from
 * cards.json inside buildPrompt. A tampered client cannot inject invented card
 * content into the prompt, which is the whole reason the schema looks this
 * thin.
 */
const Body = z.object({
  reader: z.string().refine(isReaderId, 'unknown reader'),
  service: z.string().refine(isServiceId, 'unknown service'),
  picks: z
    .array(
      z.object({
        id: z.number().int().min(0).max(21),
        reversed: z.boolean(),
      }),
    )
    .min(1)
    .max(3),
  question: z.string().max(MAX_QUESTION_LENGTH).optional(),
});

export async function POST(request: Request) {
  /*
   * Middleware already rejected anonymous and un-onboarded callers, so these two
   * guards are belt and braces -- but this is also where the identity comes from,
   * and the rate limiter needs one rather than an IP: a household behind one NAT
   * is one address and three people, and a phone hopping cell towers is one
   * person and three addresses.
   *
   * The two `{ ok }` shapes are deliberately identical so the guards read the
   * same way. THE KEY IS `users.id`, not the Google sub and no longer a username:
   * everything else in this system joins on `users.id`, and a second identity for
   * one purpose is a bug waiting to be written.
   */
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const gate = hit(auth.user.id);
  if (!gate.ok) {
    return NextResponse.json(
      { error: 'Terlalu banyak bacaan. Coba lagi nanti.' },
      { status: 429, headers: { 'retry-after': String(gate.retryAfterSeconds) } },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid.' }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Permintaan tidak valid.' }, { status: 400 });
  }

  const { reader, service, picks, question } = parsed.data;

  // The pick count has to match the service, or a "three-card spread" arrives
  // with one card and the prompt quietly describes a reading nobody drew.
  const svc = serviceById(service);
  if (!svc || picks.length !== svc.cardCount) {
    return NextResponse.json(
      { error: `Layanan ini butuh ${svc?.cardCount ?? '?'} kartu.` },
      { status: 400 },
    );
  }

  // No duplicate cards: one physical deck, one draw.
  if (new Set(picks.map((p) => p.id)).size !== picks.length) {
    return NextResponse.json({ error: 'Kartu tidak boleh berulang.' }, { status: 400 });
  }

  /*
   * THE LOTUS BLOCK. One cached read, and its failure is NON-FATAL.
   *
   * Roadmap §6 permits this read on the request path -- it is per-user, it
   * changes rarely, and it is behind a short-lived in-process cache with one
   * indexed lookup as the miss path. `getLotusBlock` swallows a database error
   * and returns null rather than throwing, because a reading without the block
   * is a valid reading and a DB hiccup must not cost the user their reading.
   *
   * NULL IS NORMAL, not an error: not yet distilled (they beat the `after()` from
   * onboarding by a few seconds), distillation failed, or they skipped every
   * question. All three produce exactly the reading an un-personalised user gets.
   */
  const lotus = await getLotusBlock(auth.user.id, auth.user.locale);

  /*
   * THE LAZY REPAIR (L15), and this is the one place the cooldown belongs.
   *
   * A missing or out-of-date block schedules a regeneration AFTER the response is
   * flushed, so nobody waits for their lotus to be re-grown -- the current
   * reading uses what there is, and the next one gets the fresh block. The
   * ten-minute cooldown inside `scheduleLotusRefresh` is what stops a user whose
   * generation keeps failing from paying for an attempt on every reading.
   *
   * Absence of the row is the "needs generation" signal, which is why
   * `lotus_avatars` has no status column and needs no cron.
   */
  if (!lotus || lotus.stale) {
    after(() => scheduleLotusRefresh(auth.user.id));
  }

  let prompt;
  try {
    // buildPrompt re-derives every card from cards.json and, for yes/no,
    // derives the verdict from effectiveYesNo. The model explains it; it does
    // not choose it.
    prompt = buildPrompt({
      reader,
      service,
      picks,
      question,
      // An empty summary means "there is a profile but nothing distilled yet".
      // Passing it through would render an empty `<penanya>` block, which is
      // noise in the prompt and a rule the reader would apply to nothing.
      context: { lotus: lotus && lotus.summary ? lotus : null },
    });
  } catch (err) {
    console.error('prompt build failed', err);
    return NextResponse.json({ error: 'Permintaan tidak valid.' }, { status: 400 });
  }

  const provider = getProvider();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const chunk of provider.streamReading(prompt)) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        /*
         * The status code went out with the first byte, so a mid-stream
         * failure CANNOT become a 500. Appending a visible Indonesian notice
         * is the only honest option left. The blank lines and brackets are
         * there so it reads as a system message rather than as the reader
         * saying something strange.
         */
        console.error('reading stream failed', err);
        controller.enqueue(encoder.encode('\n\n[Bacaan terputus. Coba lagi sebentar.]'));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      // Plain chunked text, not SSE: there is one stream of one thing, so SSE
      // framing would be ceremony the client has to undo.
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      // Tells any proxy in the way not to buffer the stream into one lump.
      'x-accel-buffering': 'no',
    },
  });
}
