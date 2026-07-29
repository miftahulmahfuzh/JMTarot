# Analytics queries

SQL an operator runs by hand. Not code, and deliberately not a dashboard: there
is no production database yet (roadmap D5), and a dashboard built before anyone
has asked a question of the data is a dashboard nobody reads.

**Every query below has been executed** against the local database with real
readings in it. A query in a document that has never been run is a liability
rather than documentation.

```sh
npm run db:up
docker exec -it jmtarot-pg psql -U jmtarot -d jmtarot
```

Two facts to have in mind before reading any of these:

- **`token_input` is NULL on z.ai and `token_output` is not.** Measured
  2026-07-27 against `glm-4.6`: `input_tokens` comes back as `0`, which the
  adapter stores as NULL so no average is silently wrong; `output_tokens` is
  reported honestly. Any cost query is therefore half-blind while
  `LLM_PROVIDER=zai`.
- **`local_date` is the querent's calendar day, never the server's.** Group by
  it, never by `created_at::date`, or every window is seven hours wrong for a
  Jakarta user — the specific bug roadmap §7 exists to prevent.

---

## 1. The alarm: readings the client saw that the server never stored

**This is the one that matters.** `after()` is not a guarantee: Vercel can end
an invocation, and when it does the `readings` row, its cards and that request's
whole event batch vanish together. You cannot count what was never written, so
count the *intent* instead, on a different transport.

The client fires its own `reading.completed` through `/api/events` — a different
request with a different `after()`. A client event with no matching row is
exactly the signal.

```sql
select
  e.props->>'reading_id' as reading_id,
  e.user_id,
  e.created_at
from events e
left join readings r
  on r.id = nullif(e.props->>'reading_id', '')::uuid
where e.name = 'reading.completed'
  and e.props->>'source' = 'client'
  and e.created_at > now() - interval '7 days'
  and r.id is null
order by e.created_at desc;
```

Should be empty. A sustained non-zero rate above roughly 1% is the threshold at
which the plan's decision A18 flips and a real queue becomes worth its cost.

The rate, rather than the list:

```sql
select
  count(*) filter (where r.id is null)::float
    / nullif(count(*), 0) as loss_rate,
  count(*) as client_completions
from events e
left join readings r
  on r.id = nullif(e.props->>'reading_id', '')::uuid
where e.name = 'reading.completed'
  and e.props->>'source' = 'client'
  and e.created_at > now() - interval '7 days';
```

---

## 2. Readings per user per day, and the status breakdown

```sql
select local_date, count(*) as readings, count(distinct user_id) as users
from readings
where local_date > (current_date - 14)
group by local_date
order by local_date desc;
```

```sql
select status, count(*), round(100.0 * count(*) / sum(count(*)) over (), 1) as pct
from readings
where created_at > now() - interval '30 days'
group by status
order by 2 desc;
```

`ok` and `partial` both produced prose. `failed` produced none. `aborted` means
the querent navigated away, which is a product signal and not an error.
`blocked` is W7's refusal and writes no `reading_cards` rows at all.

---

## 3. Latency by service, and by prompt version

This is the query that makes the `prompt_version` hash pay for itself: a prompt
change that slows the first token by 400ms is otherwise invisible.

```sql
select
  service_id,
  count(*),
  percentile_cont(0.5) within group (order by latency_ms) as p50,
  percentile_cont(0.95) within group (order by latency_ms) as p95
from readings
where latency_ms is not null
  and created_at > now() - interval '30 days'
group by service_id
order by p95 desc;
```

```sql
select
  prompt_version,
  count(*),
  percentile_cont(0.5) within group (order by latency_ms) as p50,
  percentile_cont(0.95) within group (order by latency_ms) as p95,
  min(created_at)::date as first_seen
from readings
where latency_ms is not null
group by prompt_version
order by first_seen desc;
```

`latency_ms` is **time to first token** (plan A12) — the wait, not the total.
Total generation time is `props->>'total_ms'` on `reading.completed`.

Note that `yesno` has three `prompt_version` values per reader per locale, not
one: the verdict is part of the static system prompt, so the three really are
different prompts.

---

## 4. The funnel

```sql
with per_day as (
  select
    local_date,
    count(*) filter (where name = 'reader.viewed')      as viewed,
    count(*) filter (where name = 'service.chosen')     as chose_service,
    count(*) filter (where name = 'draw.started')       as started_draw,
    count(*) filter (where name = 'reading.completed'
                       and props->>'source' = 'server') as completed
  from events
  where created_at > now() - interval '14 days'
  group by local_date
)
select *,
  round(100.0 * completed / nullif(started_draw, 0), 1) as draw_to_reading_pct
from per_day
order by local_date desc;
```

Count the **server** copy of `reading.completed` here, not both, or every
reading is counted twice — the client's copy exists for query 1 and nothing
else.

---

## 5. Self-diagnostics: is a client broken?

```sql
select props->>'reason' as reason, props->>'surface' as surface, count(*)
from events
where name = 'analytics.local_date_fallback'
  and created_at > now() - interval '7 days'
group by 1, 2
order by 3 desc;
```

Should be ~zero. Volume here means a client is sending a bad `x-jm-local-date`,
and every one of those readings is filed under the server's UTC day.

```sql
select props->>'reason' as reason, sum((props->>'count')::int) as events_lost
from events
where name = 'analytics.events_dropped'
  and created_at > now() - interval '7 days'
group by 1
order by 2 desc;
```

`queue_overflow` is a phone that was offline. `unknown_name` is a client one
deploy behind — normal briefly after a rename, a bug if it persists.
`oversize_batch` should never appear from our own client.

---

## 6. Top cards — a dry run of W5's frequency verdict

```sql
select card_id, count(*) as drawn, count(*) filter (where reversed) as reversed
from reading_cards
where user_id = '<uuid>'
  and local_date > (current_date - 7)
group by card_id
order by drawn desc, card_id
limit 5;
```

Single-table scan, served by `reading_cards_user_date_card_idx`. It filters on
`local_date` — the copy denormalized onto this table (delta D-C) — and never
joins to `readings`, which is the whole reason the column is there.

Reconciliation R7: failed and aborted readings **do** count. The querent drew
those cards. Blocked ones write no rows at all.

---

## 7. Reconstructing one session

The query you actually run when somebody reports that the app did something
strange. Served by `events_session_created_idx`.

```sql
select created_at, name, props
from events
where session_id = '<uuid from the report>'
order by created_at, (props->>'seq')::int;
```

Order by `seq` **within** `created_at`: every event in one batch shares a
timestamp, because they are one insert. `seq` is the client's monotonic counter
and is the only within-batch ordering there is.

The readings from that same session:

```sql
select id, reader_id, service_id, status, latency_ms, local_date
from readings
where session_id = '<uuid>'
order by created_at;
```

---

## 8. Retention, when W7 schedules it

Roadmap reconciliation R19/§7.9b: `events` is kept **180 days**
(`EVENTS_RETENTION_DAYS`); `readings` is deliberately **not** on that clock,
because every memory feature reads it and the privacy policy says so in those
words.

```sql
-- What the sweep would delete today. Look before running the delete.
select count(*), min(created_at)::date as oldest
from events
where created_at < now() - interval '180 days';
```

---

## 9. Is either global control firing, and is the limiter degraded? (V9)

**THE ONLY WAY ANYBODY FINDS OUT.** There is no billing alert any more, because
there is no bill: `LLM_API_KEY` is a subscription, so abuse produces an exhausted
quota rather than an invoice. A quota running out looks like readings failing,
for everybody, with nothing in any dashboard — so these two names are the whole
early-warning system. Run it weekly.

```sql
select
  date_trunc('hour', created_at)                              as hour,
  count(*) filter (where name = 'llm.ceiling_reached'
                     and props->>'tier' = 'soft')             as soft,
  count(*) filter (where name = 'llm.ceiling_reached'
                     and props->>'tier' = 'hard')             as hard,
  count(*) filter (where name = 'ratelimit.backend_degraded') as degraded_minutes,
  count(*) filter (where name = 'reading.rate_limited')       as rate_limited
from events
where created_at > now() - interval '7 days'
  and name in ('llm.ceiling_reached', 'ratelimit.backend_degraded', 'reading.rate_limited')
group by 1
order by 1 desc;
```

**`degraded_minutes` IS A COUNT OF MINUTES, NOT OF REQUESTS**, because the event
is throttled to one per instance per minute — and since the instance count is
unknown, it is a lower bound on instances-times-minutes. **A steady non-zero
value here means the fleet-wide limiter is not fleet-wide**, and everything else
on this page is measuring per-instance windows. The likeliest cause is not an
Upstash outage: it is `UPSTASH_REDIS_REST_URL` never having been set in
production, or a token mangled by the `$` trap, both of which look exactly like
working.

`tier: 'soft'` appearing is the **warning** — deferred work is being shed and no
querent has noticed anything. `tier: 'hard'` is the **outage** — readings are
being refused.

### Which ceiling refused the reading

`reading.rate_limited` alone cannot tell "one user is hammering" from "the
window's quota is gone", which are the two most different things it can mean.
V9's `limit` prop separates them.

```sql
select
  props->>'limit'                             as which,
  count(*)                                    as refusals,
  count(distinct user_id)                     as users,
  round(avg((props->>'retry_after_s')::int))  as avg_retry_after_s
from events
where name = 'reading.rate_limited'
  and created_at > now() - interval '7 days'
group by 1
order by 2 desc;
```

**`which = 'unknown'` IS THE CLIENT'S COPY AND IS NOT A GAP.** `Draw.tsx` fires
this name off a 429 whose body and headers deliberately do not say which ceiling
it was — telling the querent would tell a prober which one to work around. So
filter on `limit <> 'unknown'` to attribute a cause, and on `limit = 'unknown'`
to count what querents actually experienced. The two should track each other; a
large gap means server-side events are being lost, which is query 1's alarm.

### How close the window is running

**SUPERSEDED BY QUERY 14, AND THE SENTENCE THAT USED TO BE HERE IS NOW FALSE.** It
said *"there is no counter to read — the ceiling lives in Redis, not in Postgres —
so this is the closest thing to a fuel gauge."* Since A2 (v0.5.0) there **is** a
ledger, and **query 14 reconstructs the counter properly**: a rolling five-hour
window over `llm_calls.created_at`, which is the same quantity Redis holds rather
than a proxy for it.

This one still works and is kept, because it counts a different thing — *events*
per hour, which survives a night when the ledger write was lost. Read it as a
cross-check on 14, not as the gauge. **Both are lower bounds**, and this one is
the looser of the two: it counts the model calls that produced an `events` row,
not the ones that did not.

```sql
select
  date_trunc('hour', created_at) as hour,
  count(*) filter (where name = 'reading.requested')          as readings,
  count(*) filter (where name = 'memory.gist_failed')         as gists_failed,
  count(*) filter (where name = 'memory.summary_generated')   as summaries,
  count(*) filter (where name = 'memory.frequency_generated') as verdicts
from events
where created_at > now() - interval '2 days'
group by 1
order by 1 desc;
```

## 10. Crawler storm, or a broken beacon: `view_count` against `share.viewed`

**THE TWO NUMBERS COUNT DIFFERENT THINGS ON PURPOSE, AND THE PAIR IS THE
DIAGNOSIS.** `share_links.view_count` is incremented in `after()` on every
rendered GET, crawlers included -- it is a LOAD AND ABUSE signal.
`share.viewed` fires from a browser that ran JavaScript -- it is the AUDIENCE
metric. Same shape as `reading.completed` existing twice from two sides.

`view_count` far ABOVE the event count is a crawler storm, or somebody walking a
slug. Far BELOW it is a broken beacon. Neither is visible from either number
alone.

```sql
select l.id,
       l.entity,
       l.view_count                                  as renders,
       count(e.id)                                   as browser_views,
       l.created_at::date                            as minted_on,
       l.revoked_at is not null                      as revoked
from share_links l
left join events e
       on e.name = 'share.viewed'
      and e.props ->> 'share_id' = l.id::text
group by l.id
having l.view_count > 0
order by l.view_count desc
limit 50;
```

**BOTH QUERIES WERE EXECUTED, and query 10 returned the signal it exists to
show.** Against the dev database after driving `/s/<slug>` with `curl`:

```
 id        | entity  | renders | browser_views | minted_on  | revoked
 78e6cd38… | reading |       3 |             0 | 2026-07-28 | f
```

Three renders, zero browser views — because `curl` runs no JavaScript. That is the
crawler shape exactly, and it doubles as the proof that `bumpShareViewCount` really
does run in `after()`. Query 11 returns no rows there, because those links were
minted with SQL rather than through `POST /api/share`, so no `share.created` event
exists to anchor the funnel.

**`view_count` IS APPROXIMATE AND THE COLUMN SAYS SO.** It is the one
unauthenticated write in the release, so it runs in `after()` behind the per-IP
limiter and a failure is swallowed. Do not build anything on it that has to be
exact.

## 11. Did sharing do anything? Mint to view to click

The whole funnel for the feature, in one query. `share.created` is fired by the
SERVER inside the request that wrote the row, so it cannot disagree with the
table; the other two come from browsers.

```sql
with minted as (
  select props ->> 'share_id' as share_id,
         props ->> 'entity'   as entity,
         (props ->> 'rotated')::boolean as rotated,
         min(created_at)      as minted_at
  from events where name = 'share.created' group by 1, 2, 3
)
select m.entity,
       count(*)                                              as links,
       count(*) filter (where m.rotated)                     as re_shares,
       count(distinct v.props ->> 'share_id')                as links_ever_viewed,
       count(v.id)                                           as views,
       count(c.id)                                           as cta_clicks,
       round(100.0 * count(c.id) / greatest(count(v.id), 1), 1) as cta_pct
from minted m
left join events v on v.name = 'share.viewed'      and v.props ->> 'share_id' = m.share_id
left join events c on c.name = 'share.cta_clicked' and c.props ->> 'share_id' = m.share_id
group by m.entity;
```

**`links_ever_viewed` IS THE NUMBER THAT DECIDES WHETHER THIS FEATURE EARNED ITS
KEEP.** Links minted and never opened means the querent shared into a void; views
with no `cta_clicks` means the public page is pleasant and not persuasive, which
is a copy problem in `share.public.ctaLead` rather than a mechanism problem.

Note what is NOT joinable: `share.viewed` carries no `user_id` and no
`session_id`, by construction (`/privacy` §4.4), so "who viewed this" has no
answer and is not meant to.

## 12. Is the translation cache actually caching? (V2, first read 2026-07-28)

**NOBODY HAS EVER READ THIS NUMBER, AND THAT IS THE POINT OF THE QUERY.**
`translation.generated` fires from `translateStream`'s `settle()`, which runs inside
the `ReadableStream`'s `pull()` — outside any request scope — so **every streamed
translation lost its event and its deferred repair pass, silently, for as long as V2
had shipped.** `bindAnalyticsScope()` fixed it on 2026-07-28. So this table starts
being meaningful from that date and is empty before it.

That matters because V2 wrote its own rule and then could not follow it: *"if the
measured `invalid` rate exceeds ~2%, fix the prompt, not the architecture."* The
measurement was not being recorded.

```sql
select
  outcome,
  count(*)                                              as n,
  round(100.0 * count(*) / sum(count(*)) over (), 1)     as pct,
  round(avg((props->>'chars')::int))                    as avg_chars,
  round(avg((props->>'total_ms')::int))                  as avg_ms
from events
where name = 'translation.generated'
  and created_at >= now() - interval '30 days'
group by outcome
order by n desc;
```

**How to read it.**

| outcome | what it means | what a high share tells you |
|---|---|---|
| `cached` | a row was there, no model call | **high is the goal.** This is the feature working. |
| `ok` | generated, verified, persisted | steady-state cost of new prose |
| `repaired` | first pass dirty, the deferred repair verified and persisted | the repair pass is earning its keep |
| `invalid` | dirty twice, **nothing persisted** | see below |
| `failed` | the call threw or the ceiling refused; the SOURCE was returned | provider health, not prompt quality |

**`invalid` IS THE ONE TO WATCH, AND ITS COST IS UNBOUNDED.** Nothing is written when
both the generation and the repair fail the contract, so **every view of that field
pays a fresh model call, forever, invisibly** — the same shape as the persona budget
bug (`TRANSLATABLE['persona.body'].budget` was `'summary'`, so a correct 88-word
translation was rejected against a 50-word ceiling on every single page view, for two
releases, with nothing red).

Split it by field before concluding anything, because one misconfigured ceiling looks
like a prompt problem in aggregate:

```sql
select props->>'entity' as entity, props->>'field' as field,
       props->>'locale' as target, props->>'violation' as violation,
       count(*) as n
from events
where name = 'translation.generated' and outcome = 'invalid'
  and created_at >= now() - interval '30 days'
group by 1, 2, 3, 4
order by n desc;
```

**The decision this query exists to make**, in order:

1. `invalid` concentrated on ONE `(entity, field)` → a ceiling or a spec bug in
   `TRANSLATABLE`, not the prompt. Check the RESOLVED number, not the tag's spelling.
2. `invalid` above ~2% across fields → **fix the prompt**, per V2's rule.
3. `invalid` near zero → the unbounded-cost hole is theoretical. **Do not build a
   circuit breaker for it**; one was designed and deferred on 2026-07-28 precisely
   because it would permanently disable a translation that a transient provider blip
   failed.

`streamed` is on the event as well, and the split matters: the residual cost V2
accepted — the first viewer of a failed translation seeing it once — is paid **only**
on the streamed path, so an `invalid` rate that cannot be split by it does not tell you
whether anybody actually saw a bad translation.

```sql
select (props->>'streamed')::boolean as streamed, outcome, count(*)
from events
where name = 'translation.generated' and created_at >= now() - interval '30 days'
group by 1, 2 order by 1, 3 desc;
```

### The first reading of it — local only, 2026-07-28

Two rows, which is not a rate and is recorded so nobody mistakes it for one:

```
 outcome | n | avg_chars | avg_ms | streamed
---------+---+-----------+--------+----------
 cached  | 1 |       105 |      3 | f
 ok      | 1 |       105 |    937 | t
```

`invalid` and `failed` are both **absent**, so the unbounded-cost hole above is
unobserved rather than measured — n=2 supports no conclusion about a ~2% threshold.

What the two rows DO show, and it is the useful part: **the `ok` is `streamed` and the
`cached` is not.** Loading `/history/<id>` in English streamed the translation through
`/api/translate` (937ms, one model call), and the share mint's `resolvePin` then found
that row and cost **3ms with no model call**. That is `createShareLink`'s "the common
case costs nothing" claim, observed rather than asserted — the sharer is reading in the
locale they are sharing, so the pin is a cache hit.

**THE PRODUCTION READ IS STILL OWED AND IS NOT DONE HERE.** It needs Neon's direct
connection string, and the table only starts being meaningful from 2026-07-28 when
`bindAnalyticsScope()` landed — so expect very few rows and do not read a rate off them
either. Run it after the app has served real translations for a while; that is the
number the `invalid > 2%` decision needs.

---

# The ledger (A2 + A3, v0.5.0)

**Six queries over `llm_calls`, the fact table v0.5.0 exists for.** Before A2 this
application made nine distinct LLM calls and recorded the token cost of exactly one
of them.

**PROVENANCE OF THE PASTED OUTPUT BELOW, STATED PLAINLY BECAUSE THIS FILE'S OPENING
RULE DEMANDS IT.** Every query here was executed against the local Postgres 16 on
2026-07-30 and the output is real. **The ROWS are not**: the dev ledger was empty, so
44 rows were hand-seeded across the nine `op` values, two models and ten days to give
the queries something to answer. So the *shapes*, the *types* and the *SQL* are
measured; **no rate, ratio or percentile below is a fact about traffic.** A2 verified
all nine ops live against the running app and read them out of psql; this is the
reporting layer over that, and the production read is owed the same way query 12's is.

Two things to have in mind, both of which change how these read:

- **`input_tokens` is structurally half-blind on z.ai.** The provider reports
  `input_tokens: 0`, which both adapters store as NULL (A2-D5 fixed the buffered
  path so the two agree). So `null_input_calls` is very nearly every row and a
  cost figure built on `input_tokens` alone is missing the prompt side entirely.
  **Every query below that touches tokens carries that count beside them.**
- **A fleet-wide `group by local_date` sums two calendar systems** (R25). A call
  with no querent behind it — a cron-driven repair pass, or one of the three W3
  onboarding routes R49 left unattributed — stores the **UTC** date, while every
  other row stores the querent's own day. Filter `user_id is not null` where the
  number has to be homogeneous.

## 13. Calls, tokens and status by `op`, over 30 days

**The nine-value table.** Roadmap §5.3 renders this as a *table* rather than a chart
on purpose: nine categories exceeds the >7-classes rule, and a pie of nine `op`
values is unreadable.

```sql
select op,
       count(*)                                                      as calls,
       coalesce(sum(input_tokens),  0)                                as input_tokens,
       coalesce(sum(output_tokens), 0)                                as output_tokens,
       count(*) filter (where input_tokens is null)                   as null_input,
       count(*) filter (where status = 'failed')                      as failed,
       count(*) filter (where status = 'aborted')                     as aborted,
       round(percentile_cont(0.5)  within group (order by total_ms))  as p50_ms,
       round(percentile_cont(0.95) within group (order by total_ms))  as p95_ms
  from llm_calls
 where created_at >= now() - interval '30 days'
 group by 1
 order by calls desc, op;
```

```
         op         | calls | input_tokens | output_tokens | null_input | failed | aborted | p50_ms | p95_ms
--------------------+-------+--------------+---------------+------------+--------+---------+--------+--------
 reading            |    13 |            0 |          5246 |         13 |      0 |       1 |   5740 |   6226
 gist               |    12 |            0 |           336 |         12 |      0 |       0 |    984 |   1049
 moderation         |    12 |            0 |           144 |         12 |      0 |       0 |    712 |    766
 day_summary        |     2 |            0 |            96 |          2 |      1 |       0 |   2300 |   3020
 frequency          |     1 |            0 |            74 |          1 |      0 |       0 |   2400 |   2400
 lotus              |     1 |            0 |           210 |          1 |      0 |       0 |   4100 |   4100
 persona            |     1 |         1840 |           190 |          0 |      0 |       0 |   3800 |   3800
 translation        |     1 |            0 |           320 |          1 |      0 |       0 |   2900 |   2900
 translation_repair |     1 |            0 |           310 |          1 |      0 |       0 |   3300 |   3300
```

**How to read it.**

- **`input_tokens: 0` with `null_input` equal to `calls` is the z.ai signature, not a
  free prompt.** The one row with a real input figure is on `gpt-5.6-luna`, because
  that provider reports it. Do not divide by `input_tokens` here.
- **`ORDER BY calls desc, op` — the `op` tiebreak makes the order TOTAL.** Without it
  the five one-row `op`s swap places between runs and it reads as the data changing.
  Same reason `topCardAllTime` breaks its tie on `card_id`.
- **`p95_ms` IS TOTAL TIME, NOT TIME TO FIRST TOKEN.** `readings.latency_ms` is TTFT
  and query 3 is the one that reads it. One word, two meanings, one schema — and
  `llm_calls.total_ms` for a reading is timed from above `gateReading` rather than
  from the top of the handler, so **expect it to be smaller than
  `reading.completed.total_ms` and do not reconcile the two** (R5).
- **A `reading` row and a `moderation` row and a `gist` row are ONE reading.** Three
  ops per reading is the expected shape; `calls` is not a reading count.

## 14. The worst rolling five-hour window, and how close it came to 280

**THIS IS THE FUEL GAUGE, AND IT REPLACES QUERY 9's VERSION.** `llm:window` is
**calls per rolling five hours, fleet-wide** — z.ai meters prompts per rolling
5-hour cycle and there is deliberately no date in the Redis key. This query
reconstructs exactly that quantity from the ledger, which nothing could do before A2.

```sql
with w as (
  select created_at,
         count(*) over (order by created_at
                        range between interval '5 hours' preceding and current row) as in_window
    from llm_calls
   where created_at >= now() - interval '7 days'
     and status <> 'refused'
)
select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as window_end,
       in_window                                                             as calls,
       280                                                                   as ceiling,
       round(100.0 * in_window / 280, 1)                                     as pct_of_ceiling
  from w
 order by in_window desc, created_at
 limit 1;
```

```
      window_end      | calls | ceiling | pct_of_ceiling
----------------------+-------+---------+----------------
 2026-07-29T10:58:23Z |    24 |     280 |            8.6
```

**A WINDOW FRAME, NOT A BUCKET, AND THAT IS THE DESIGN.** A five-hour window
straddles midnight, so any daily bucketing splits the worst window in the range and
hides it. `RANGE BETWEEN INTERVAL ... PRECEDING` is plain Postgres 11+ and runs
identically on the Docker 16 and on Neon 16 — the two are the same major on purpose.

**Four caveats, and every one of them makes this OPTIMISTIC**, which is the direction
that matters:

1. **The ledger is a lower bound on the counter.** The write is inside `after()`,
   which is not a guarantee — query 1 exists because Vercel can end an invocation.
2. **`reserveModelCall` charges the window BEFORE the call**, so a call that then
   threw charged the counter whether or not it left a row.
3. **This can only see windows that ENDED inside the range.**
4. **280 is not the provider's limit; it is 70% of it, with a soft tier at 196.**
   `meter.ts`: *"we could not observe what quota exhaustion looks like on the wire
   without causing it."* So crossing 280 is a *degradation* — deferred work is shed
   first — before it is an outage.

**DO NOT COMPARE A CALLS-PER-DAY FIGURE TO 280.** 280 per 5h is **1344/day** if
traffic were perfectly flat, so a day with 300 calls reads as "at the ceiling" while
sitting at 22% of it — wrong by 4.8× in the alarmist direction. Dividing by 4.8
instead assumes uniform traffic, which a consumer app with an evening certainly is
not, and *that* one is wrong in the dangerous direction. The honest bridge is a
**measured** burstiness `k = peak5h / (meanCallsPerDay × 5/24)`, then
`dailyEquivalentCeiling = 1344 / k`; `burstiness()` and `dailyEquivalentCeiling()` in
`src/lib/analytics/rollup.ts` are that arithmetic, unit-tested.

## 15. Tokens by day and model, with the unpriced count

**PER MODEL, AND THAT IS A CONSTRAINT RATHER THAN A CONVENIENCE.** `prices.ts` is
keyed by model **and** `effective_from`, so a single `sum(output_tokens)` for a day
that spanned two models is **unpriceable** — and the number that would be produced
anyway is the one that silently understates the bill.

```sql
select local_date::text                              as day,
       model,
       count(*)                                      as calls,
       coalesce(sum(input_tokens),  0)                as input_tokens,
       coalesce(sum(output_tokens), 0)                as output_tokens,
       count(*) filter (where input_tokens  is null)  as null_input_calls,
       count(*) filter (where output_tokens is null)  as null_output_calls
  from llm_calls
 where local_date >= current_date - 7
 group by 1, 2
 order by 1 desc, 2;
```

```
    day     |     model     | calls | input_tokens | output_tokens | null_input_calls | null_output_calls
------------+---------------+-------+--------------+---------------+------------------+-------------------
 2026-07-29 | glm-4.5-flash |     9 |            0 |           108 |                9 |                 0
 2026-07-29 | glm-4.6       |    18 |            0 |          3987 |               18 |                 0
 2026-07-28 | glm-4.5-flash |     2 |            0 |            24 |                2 |                 0
 2026-07-28 | glm-4.6       |     5 |            0 |          1059 |                5 |                 0
 2026-07-27 | glm-4.5-flash |     1 |            0 |            12 |                1 |                 0
 2026-07-27 | glm-4.6       |     3 |            0 |           566 |                3 |                 0
 2026-07-26 | glm-4.6       |     2 |            0 |           630 |                2 |                 0
 2026-07-26 | gpt-5.6-luna  |     1 |         1840 |           190 |                0 |                 0
 2026-07-24 | glm-4.6       |     2 |            0 |           140 |                2 |                 1
```

- **`::text` ON `local_date` IS REQUIRED WHENEVER YOU SLICE IT.** `dateCol` is
  `date(name, { mode: 'string' })` and **`mode: 'string'` is a Drizzle-side mapping —
  the Postgres column is still `date`** — so `substring(local_date, 1, 7)` fails with
  *"function substring(date, integer, integer) does not exist"*. It fails loudly,
  which makes it the friendliest member of this family of bugs.
- **The comparison above needs no cast** because `current_date - 7` is already a
  `date`; comparing to a `'YYYY-MM-DD'` *string* works too, since Postgres coerces the
  literal and the comparison is exact for zero-padded ISO.
- **`null_output_calls` non-zero means a stream that failed before reporting**, which
  is the `aborted` row on 2026-07-24 here. A ledger row with null tokens is a fact; a
  request held open for a token count would be a bug.

## 16. The A-D17 consistency check — **expected: 0 rows**

`readings.token_input` / `token_output` **stay**, and `llm_calls` records the same
call. Two copies of one fact is how they drift, so the check lives beside the schema
with a stated expected answer — the `onboarding_answers` encryption-audit precedent.

```sql
select r.id                as reading_id,
       r.token_input,  c.input_tokens,
       r.token_output, c.output_tokens
  from readings r
  join llm_calls c on c.reading_id = r.id and c.op = 'reading'
 where r.token_input  is distinct from c.input_tokens
    or r.token_output is distinct from c.output_tokens;
```

```
 reading_id | token_input | input_tokens | token_output | output_tokens
------------+-------------+--------------+--------------+---------------
(0 rows)
```

### **`IS DISTINCT FROM`, NEVER `<>`, AND THE TRAP IS IN THE CHECK ITSELF**

Both columns are nullable and z.ai makes NULL the common case for `input_tokens`.
`where r.token_input <> c.input_tokens` is **NULL-blind**: it evaluates to NULL
wherever either side is NULL, NULL is not true, the row is filtered out, and **the
query returns 0 rows whether or not the ledger agrees with anything.** A check that
cannot fail is indistinguishable from a check that passes, and the roadmap said only
*"must return 0 rows"*. R15 is the ruling; this is the demonstration.

**Measured, in a rolled-back transaction, with ONE `NULL vs 0` disagreement injected
— which is exactly the shape roadmap §12.6 described, a buffered z.ai call storing
`0` where its streamed twin stored NULL:**

```
=== IS DISTINCT FROM ===        === the SAME data, with <> ===
 rows_found                      rows_found
------------                    ------------
          1                               0
```

`c.op = 'reading'` is load-bearing: A2 sets `reading_id` on the **gist** call too
(R51), and the gist's tokens are its own. Dropping the predicate makes every reading
look inconsistent.

**And the figure this pair protects is "biaya generasi" — generation cost — not "what
this reading cost."** The moderation classifier runs *before* the `readings` row
exists, so it can never carry a `reading_id`; a true per-reading total would need a
request id threaded through both, which nobody asked for.

## 17. Cost league: tokens per user per model

Roadmap §5.3 renders this as a **table with an inline bar**, not a chart: it has as
many classes as there are users. Per `(user, model)` for query 15's reason.

```sql
select coalesce(user_id::text, '(deleted or system)') as user_id,
       model,
       count(*)                                        as calls,
       coalesce(sum(input_tokens),  0)                  as input_tokens,
       coalesce(sum(output_tokens), 0)                  as output_tokens
  from llm_calls
 where created_at >= now() - interval '30 days'
 group by 1, 2
 order by output_tokens desc, user_id, model
 limit 20;
```

```
               user_id                |     model     | calls | input_tokens | output_tokens
--------------------------------------+---------------+-------+--------------+---------------
 c5f98d79-f2e2-4107-895a-823fd4eff399 | glm-4.6       |    22 |         3819 |          1887
 32df3c74-e67e-491f-83b8-a1aa4dbc6e16 | glm-4.6       |     4 |            0 |           446
 8e777084-d17e-4f43-bcb0-436c94a1c0c2 | glm-4.6       |     2 |            0 |           394
 (deleted or system)                  | glm-4.6       |     1 |            0 |           310
 e2f710e1-f10b-424c-b74d-e4c0e44bbff8 | glm-4.6       |     2 |            0 |           245
 8e777084-d17e-4f43-bcb0-436c94a1c0c2 | gpt-5.6-luna  |     1 |         1840 |           190
 c5f98d79-f2e2-4107-895a-823fd4eff399 | glm-4.5-flash |    11 |            0 |           132
 e2f710e1-f10b-424c-b74d-e4c0e44bbff8 | glm-4.5-flash |     1 |            0 |            12
```

- **`(deleted or system)` IS A REAL ROW, NOT A GAP, AND IT MUST NEVER BE DROPPED.**
  `llm_calls.user_id` is `on delete set null`, so a hard-deleted user's cost history
  survives with the attribution gone — **the tokens were spent.** The same row appears
  for a cron-driven repair pass, which never had a querent.
- **THE DENOMINATOR SHIFTS OVER TIME AND THE PAGE HAS TO SAY SO.** Every hard delete
  moves history from an attributed row into that one, so a "cost per user" figure
  falls monotonically with no change in behaviour. **A metric that only ever improves
  is a metric that gets trusted**, which is the failure worth naming.
- **R49's unattributed rows land here too.** Three W3 onboarding routes have a real
  querent and no `withAnalytics` scope, so their `lotus` calls arrive with a NULL
  `user_id` — accepted for v0.5.0 rather than spending A2's diff on three W3 handlers.
  This is the query that names them:

```sql
select op, count(*) as unattributed
  from llm_calls
 where user_id is null and created_at >= now() - interval '30 days'
 group by 1 order by 2 desc;
```

A `lotus` row in that result is R49; a `translation_repair` row is a genuine
cron-driven pass with no querent and is correct.

## 18. Ledger size and age — the retention probe, by hand

The sweep logs this **every night** as `[llm_calls] rows= bytes= mb= oldest=`. This is
the same numbers on demand.

```sql
select count(*)                                            as rows,
       pg_total_relation_size('llm_calls')                 as bytes,
       pg_size_pretty(pg_total_relation_size('llm_calls')) as total_with_indexes,
       pg_size_pretty(pg_relation_size('llm_calls'))       as heap_only,
       min(created_at)::text                               as oldest,
       round((100.0 * pg_total_relation_size('llm_calls') / (0.5 * 1024^3))::numeric, 4)
                                                           as pct_of_neon_free
  from llm_calls;
```

```
 rows | bytes  | total_with_indexes | heap_only |            oldest            | pct_of_neon_free
------+--------+--------------------+-----------+------------------------------+------------------
   44 | 147456 | 144 kB             | 16 kB     | 2026-07-20 11:49:02.51194+00 |           0.0275
```

- **`pg_total_relation_size`, NOT `pg_relation_size`.** It includes the indexes, and
  there are five of them; a heap-only figure understates this table. **At 44 rows the
  ratio is 9×, not the ~2× the retention arithmetic assumes** — every index costs at
  least a page whether or not it holds anything, so the small-table figure is
  overhead-dominated and says nothing about the steady state. Both are printed above
  so nobody reads one for the other.
- **`LLM_CALLS_RETENTION_DAYS=400`, and the binding input is Neon free's 0.5 GB**, not
  a row rate that does not exist yet. At ~450 B/row all-in, 400 days at 1,000
  calls/day is ~400k rows ≈ 180 MB, 36% of the plan; at a realistic early 50/day it is
  ~9 MB.
- **400 equals `HISTORY_DAY_LIMIT` and `MAX_RANGE_DAYS` on purpose**, so the dashboard
  can never offer a range whose data has already been swept — which would look like a
  bug in the chart rather than like a retention policy.
- **REVISIT AT 100 MB, or at 25% of the plan's storage, whichever comes first.** The
  options in order: a shorter window; then dropping `llm_calls_op_created_idx` (query
  13 is monthly, not per-request); then a daily rollup table for rows older than 90
  days, which is a v0.6.0 schema and is named here only so nobody invents it in an
  emergency.
- **`admin_access_log` HAS NO EQUIVALENT AND MUST NOT ACQUIRE ONE.** An audit trail
  with a delete path is the audit trail's absence, and a retention policy is a delete
  path with a timer on it. `/privacy` clause 6's row for it reads *kept indefinitely*.
