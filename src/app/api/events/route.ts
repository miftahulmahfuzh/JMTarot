/**
 * The collector. POST only, always `204`, no session required.
 *
 * NOT IN ROADMAP §4's MODULE MAP -- W4 adds it and W7 reviews it as an attack
 * surface (reconciliation §2), because it is the one publicly reachable
 * endpoint in the app that writes to the database.
 *
 * WHY IT MUST BE PUBLIC. `terms.viewed`, `app.launched` and a failed sign-in
 * all happen before there is a session, and roadmap §3 explicitly allows
 * `events.user_id` to be null. The exemption is one line in `isPublic()`.
 *
 * WHY IT ALWAYS ANSWERS 204. `sendBeacon` cannot read a response, so a `400` on
 * the hide path is a message to nobody, and a `429` tells a scraper exactly
 * where the limit is while telling the app nothing it can act on. Failures are
 * logged server-side, where somebody can see them.
 *
 * WHY THE VALIDATION IS LENIENT. A client one deploy behind will send a name
 * this server has since renamed. Rejecting the whole batch for it throws away
 * nineteen good events; the drops are counted and re-emitted as one
 * `analytics.events_dropped`, which is a metric rather than a silence.
 */
import { z } from 'zod';
import { currentUser } from '@/lib/auth/server';
import { isEventName } from '@/lib/analytics/events';
import { parseLocalDate, validSessionId } from '@/lib/analytics/localdate';
import { sanitizeProps } from '@/lib/analytics/flush';
import { track, trackRaw, withAnalytics, type AnalyticsContext } from '@/lib/analytics/track';
import { hit } from '@/lib/ratelimit';

/** ALS, and therefore `after()` batching, need the Node runtime. */
export const runtime = 'nodejs';

/** The caps that protect the server, as opposed to the ones that shape the data. */
const MAX_EVENTS = 50;
const MAX_BODY_BYTES = 32 * 1024;

/** Batches per IP per hour. Generous for a human, useless for a firehose. */
const RATE_MAX = 60;
const RATE_WINDOW_MS = 60 * 60 * 1000;

const Envelope = z.object({
  session_id: z.unknown().optional(),
  local_date: z.unknown().optional(),
  /** Informational. Recorded nowhere; kept in the shape so the client can send it. */
  tz_offset: z.number().optional(),
  sent_at: z.number().optional(),
  events: z.array(
    z.object({
      name: z.string(),
      seq: z.number().int().optional(),
      t: z.number().optional(),
      /** Checked at runtime by sanitizeProps, not here: the values came off the
       *  wire and a schema per event name would have to be kept in step with
       *  the taxonomy by hand. */
      props: z.unknown().optional(),
    }),
  ),
});

const NO_CONTENT = () => new Response(null, { status: 204 });

/**
 * Best-effort client address.
 *
 * The same honest caveat `src/lib/ratelimit.ts` carries applies twice over
 * here: the limiter is per-instance, and an IP is a household behind one NAT or
 * a phone hopping cell towers. The real protection is that there is nothing
 * worth doing with this endpoint -- only names in the closed taxonomy are ever
 * written, and `user_id` comes from the session and never from the body.
 */
function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export async function POST(request: Request) {
  try {
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > MAX_BODY_BYTES) return NO_CONTENT();

    const gate = hit(`events:${clientIp(request)}`, Date.now(), RATE_MAX, RATE_WINDOW_MS);
    if (!gate.ok) return NO_CONTENT();

    const text = await request.text();
    // Again after the read: content-length is a claim, not a measurement.
    if (text.length > MAX_BODY_BYTES) return NO_CONTENT();

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      console.warn('[analytics] events body was not JSON');
      return NO_CONTENT();
    }

    const parsed = Envelope.safeParse(raw);
    if (!parsed.success) {
      console.warn('[analytics] bad events envelope');
      return NO_CONTENT();
    }

    // Nullable on purpose: an event before sign-in is the reason this route is
    // public. NEVER read a user id from the body -- there must be no way to
    // attribute an event to somebody else.
    const user = await currentUser();

    const localDate = parseLocalDate(parsed.data.local_date);
    const ctx: AnalyticsContext = {
      userId: user?.id ?? null,
      sessionId: validSessionId(parsed.data.session_id),
      // W6 will replace this with resolveLocale(request), which reads the
      // cookie and Accept-Language. Until then a signed-out visitor's events
      // are recorded in the app's only locale, which is what they saw.
      locale: user?.locale ?? 'id',
      localDate: localDate.date,
    };

    await withAnalytics(ctx, async () => {
      if (localDate.source === 'fallback') {
        track('analytics.local_date_fallback', {
          reason: localDate.reason,
          received: localDate.received,
          surface: 'events',
        });
      }

      const batch = parsed.data.events;
      if (batch.length > MAX_EVENTS) {
        // The whole batch goes, but the fact that it existed does not: a client
        // sending 100 at a time is either broken or hostile, and both are worth
        // being able to count.
        track('analytics.events_dropped', { count: batch.length, reason: 'oversize_batch' });
        return;
      }

      let dropped = 0;
      for (const event of batch) {
        if (!isEventName(event.name)) {
          dropped += 1;
          continue;
        }
        trackRaw(event.name, {
          ...sanitizeProps(event.props),
          // Within-batch ordering, since every row in the batch gets the same
          // created_at from the one insert.
          ...(typeof event.seq === 'number' ? { seq: event.seq } : {}),
        });
      }

      if (dropped > 0) {
        track('analytics.events_dropped', { count: dropped, reason: 'unknown_name' });
      }
    });

    return NO_CONTENT();
  } catch (err) {
    /*
     * NOTHING HERE MAY BECOME A USER-VISIBLE FAILURE, and there is nobody to
     * tell anyway -- the caller is a beacon that cannot read a response.
     */
    console.error('[analytics] events route failed', err);
    return NO_CONTENT();
  }
}
