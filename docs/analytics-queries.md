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
