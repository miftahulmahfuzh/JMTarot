# Changelog

All notable changes to JMTarot are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.7.0] - 2026-08-09

**Three readers and the querent in one room, that keeps going when nobody is looking at
it.** Seven workstreams, one roadmap, one reconciliation that outranked it, and
thirty-nine commits. Every release before this one made the app answer a question; this
one makes it start a conversation. **It is measured by two things and nothing else — how
NATURAL and how PROACTIVE the room feels — and every trade in these documents was taken
in their favour, including the ones that look like infrastructure.**

**The design that carries most of it is a RUN ENGINE rather than a request/response
endpoint.** One trigger produces one `chat_runs` row, which produces a beat sheet, which
the voices execute **one beat per short request**. It fits Vercel's 60s ceiling, and — the
load-bearing part — **it makes an abandoned run and a proactive run the same object.**
Close the tab mid-conversation and the remaining bubbles land later behind a red dot; F5
therefore built **triggers, not a second pipeline**, and a design in which unprompted
messages have their own route, table or renderer is wrong.

**Seven plans written in parallel, none able to see the others, found six factual errors
in the contract they were written against — and every one was found by the workstream it
would have hurt.** The taxonomy was already 70 names against the roadmap's 67, so the
first new name is red for the right reason. `<jawaban>` was the third of six fences that
already existed rather than a sixth to add; what is genuinely new is `<obrolan>` and
`<lampiran>`, and **`sanitize.ts` had no owner — flagged independently by two agents that
could not see each other.** Vercel Hobby allows 100 cron jobs, not "a small number". Vercel
cron is always UTC, so `sweep`'s `17 3 * * *` is 10:17 WIB and an argument about a terrible
hour to message somebody rested on nothing. Three routes were given `maxDuration: default`
two paragraphs above a citation of `POST /api/locale`, which is the route that ten-second
default killed. And the build order was inverted, so **F6 splits and runs twice.**

**The finding no agent could have made alone is the consent one.** F3 went to read the
onboarding catalog to get the querent's register right, and found that
`onboarding.q.worst_thing.hint` promises — *while the querent is typing the answer* — that
it is "tidak pernah dikutip di dalam bacaanmu", which is the exact thing this feature
exists to do. It survives on the letter, because a chat is not a *bacaan*, and does not
survive in spirit at all. **A workstream about prose style found the release's consent
problem.** Miftah ruled the same day: granted, with all five of `C-D8`'s conditions intact,
`/privacy` **and both onboarding hints** amended in both locales, `TERMS_VERSION` not
bumped, and `CHAT_ANSWERS_ENABLED` shipped as the reversal that needs no prompt-layer
redeploy. **Nobody re-reads `/privacy`; everybody reads the hint** — which is why the hint
is the load-bearing edit and the reconciliation called it that.

**And the lesson that generalises past this release: read the header line the runner
already prints.** Every measurement F5 took ran on `glm-4.6`, because `C-D4` puts the whole
chat on `CHAT_MODEL=glm-5.2` and a `.env.local` written before v0.7.0 does not set it. The
runner printed `chat model=glm-4.6 (CHAT_MODEL=unset)` at the top of all three runs and it
was read past all three times. On the wrong model, everything else identical, **three
defects appeared that do not exist on the right one**: a voice emitted a whole transcript
inside one bubble, complete with a fake querent line and another reader's name, in a room
where every stored bubble is context for the next turn; two readers produced the same
sentence verbatim in one blind read; and it invented nouns more often. The fix is not a
better header line — it is a **warning that names those three consequences**, because a
faithful line nobody reads is worth nothing.

3593 unit tests across 189 files; 642 integration across 45. **One migration** (`0014`),
taking the schema from eighteen tables to **twenty-one**. `LLMOp` **11 → 13**, kill switches
**5 → 7**, prompt fences **6 → 8**, the event taxonomy **70 → 76**. **No new dependency.**

### Added

- **`/chat` — the room.** `src/app/chat/**`, `ChatRoom.tsx` and seven `Chat*` components.
  `page.tsx` **reads nothing**: the default day separator is the querent's calendar day and
  the server cannot compute it, because `toISOString()` rolls over at 07:00 in Jakarta. It is
  `noindex`, not in `isPublic()`, inside the middleware matcher, and **`/en/chat` 404s** per
  contract G2. `gate.test.ts` carries the negative control named for the worst outcome
  available in this release.
- **`src/lib/chat/**` — the spine, the director, the voices and the triggers.** `types.ts`,
  `machine.ts`, `run.ts`, `budget.ts`, `model.ts`, `log.ts`, `context.ts`, `address.ts`,
  `validate.ts`, plus `prompt/**` (the contract and three voices, both locales), `direct/**`
  (the beat sheet), `voices/**` (the turn and its pacing) and `proactive/**` (eligibility,
  material, detection, minting, the two note tables and the fixtures).
- **Three tables and migration `0014`** — `chat_threads`, `chat_runs`, `chat_messages`,
  eighteen tables to twenty-one — **including the six columns five workstreams each
  independently proved they needed**:
  `client_key`, `intent`, `model`, `material_key`, `plan_source` and `utc_offset_minutes`.
  Most sharply F4's client idempotency key, without which the one permitted timeout retry
  double-posts the querent's sentence **and both copies are context for every future turn.**
- **Five routes and one cron.** `/api/chat/{state,messages,read,message,advance}` at 30 / 15 /
  15 / 20 / 60 seconds, and `/api/cron/nudge` with its own `vercel.json` entry at `0 12 * * *`.
  **`GET /api/chat/state` answers 200 with an empty state when the database is down** — it is
  deliberately not the fourth route in this app that 500s.
- **A turn is buffered and delivered whole, never streamed** (`C-D3`). A naturalness decision
  and not a performance one: watching Adrian type character by character is a chatbot tell. It
  also buys validation before display and one code path for turns nobody is watching.
  **`ReadingView`'s streaming machinery is not reused and must not be.**
- **`LLM_WINDOW_CHAT_CEILING`, the chat's own sub-budget, PEEKED before the fleet ceiling and
  CONSUMED after it**, so a call refused by either window is charged to neither. It **defaults
  to half the hard ceiling and is derived in `meter.ts` rather than written as a literal**, so
  February 2027's credit re-derivation moves both together. Chat calls are `deferred`, and
  that is a promise to the reading: a run is 2–5 calls and sixty runs would exhaust the app's
  whole five-hour quota. **A shed beat is not an error** — the run stays `running` and the next
  visit delivers it.
- **`LLM_WINDOW_CALL_CEILING` re-derived 2026-08-07 and UNCHANGED at 280.** "Re-derived and
  unchanged" is a real outcome of the exercise rather than a skipped task. **A bigger number
  does not create quota** — the denominator is a property of the plan, not of the app; the
  balance on the account is zero, so the far side is `1113 Insufficient Balance` on the first
  call, instantly, for everybody; and the right instrument for "the chat multiplies calls
  5–10×" is the sub-budget.
- **`chat_plan` and `chat_turn` are the twelfth and thirteenth `LLMOp`s.** **Two, not one**,
  because averaging a tiny JSON reply with a two-sentence one makes both figures meaningless;
  **two, not three**, because a proactive turn is a `chat_turn` and what made it proactive is
  `chat_runs.trigger`. **`llm_calls.reading_id` is NULL for both** — `readingCostsFor` folds
  every `reading_id`-bearing row with no `op` predicate, so a non-null there would silently
  inflate the cost of the reading that triggered the conversation.
- **`src/lib/admin/ops.ts` — the machine-checked list of the four ops with no querent behind
  them**: `insight`, `blog_format`, `chat_plan`, `chat_turn`. It carries a compile guard that
  makes a **fourteenth** op an error until somebody classifies it, and it exists because the
  same rule was stated in prose four times and **three of the four were stale.**
- **`CHAT_ENABLED` and `CHAT_PROACTIVE_ENABLED`, on `ANALYTICS_ENABLED`'s rule** — only the
  literal `'0'` disables. **Off gates the model call, never the cached read**: the room still
  opens and every past message still renders.
- **`CHAT_MODEL`, one variable for the director and all three voices, set to `glm-5.2`.**
  `ADMIN_MODEL`'s shape pointing the opposite way: that one points *away* from `LLM_MODEL`
  because nothing on the admin surface is in a reader's voice, this one because **everything
  on the chat surface is.** By accident it is already on the right side of the ~February 2027
  renewal line.
- **`address.ts` — code derives the address forms and the model picks one from the list**
  (`C-D10`), which is `effectiveYesNo()`'s and `validateChoice`'s rule in a third place. PURE,
  a LEAF, **zero imports asserted over the source**; the full nickname is always candidate
  zero; and **an empty candidate list is a correct outcome, never an error** — a derivation
  refined until it always produces something is how a person ends up being called `Ne`.
- **`voices/pace.ts` — the wait before a bubble is the previous bubble's length, the next
  reader's temperament, and how much that reader is about to write.** Three bubbles exactly
  2000ms apart is something no group chat has ever produced, and a person notices it inside
  four bubbles without being able to say why. **The jitter is derived by FNV-1a over the beat's
  own fields, never `Math.random`**, which is what lets `npm test` assert anything about pacing
  at all.
- **`<obrolan>` and `<lampiran>` are the seventh and eighth fences.** `<obrolan>` is the
  sharpest of the eight: forty messages the querent typed, handed to a model whose next output
  goes straight onto a screen. **The Indonesian-looking word is the safe one** for R17's reason
  — an English querent will never type "obrolan" and would absolutely type "chat".
  `<lampiran>` gets its own alternative **even though it nests inside `<obrolan>`**, because the
  stripper works on the alternation and a nested tag it cannot name is a hole in exactly the
  block that carries the querent's own text.
- **`CHAT_LENGTH_BUDGET`, `chatBudgetFor` and `CHAT_MAX_TOKENS` in `budget.ts`** — a second
  table rather than a row in `LENGTH_BUDGET`, because `maxParagraphWords` is meaningless for a
  thing that is one paragraph by definition. **The floor is zero in both locales and exists as
  a constant rather than being absent**: "wkwk", "iya sih" and "hm" are how a group chat reads,
  and a floor that forbids them makes three readers who each deliver a paragraph.
  `MARGARET_MULTIPLIER` reaches the ceilings and never the floor.
- **`Bahas di grup` on `/history/[id]` and under a finished reading**, with `<lampiran>`, the
  staged card in the composer and the attachment drawn in the log. On the draw screen the
  control sits **inside the completed-reading condition**: a one-tap exit from a streaming page
  aborts the reading and books it as the querent's choice. Ownership is a `where` predicate on
  `readingWithCards`, never a remembered check.
- **`/admin/chat` — nine panels, one `withAdminRead`, and no control of any kind.** It measures
  and never restrains: no pause button, no ceiling editor. Its one `Hero` is the proactive reply
  rate, **whose denominator is runs whose 24-hour window has CLOSED** — an open run is in neither
  the numerator nor the denominator and is reported separately as `menunggu`, because including
  it makes the release's own scorecard fall every time the operator picks a range ending today,
  which is the default filter.
- **`/admin/users/[id]` gets a chat section with counts and no text.** `A-D16`'s audited reveal
  was built for a thing you read *one* of; a conversation would be two hundred audit rows for one
  act of reading. **And the asymmetry cuts the opposite way from the obvious one:** the six
  onboarding answers are encrypted at rest and `chat_messages.body` is plaintext, so the
  protection there is that nothing reads it — a property of the code, which a reveal component is
  precisely the code to change. An integration test serialises the whole return value and asserts
  a fixture body is absent.
- **`tools/make_avatars.py` and `public/readers/*`** — three faces cropped out of the 2:1
  landscape scenes in `public/dukuns/`, which at 28px are a smudge. The crop table is three
  hand-written boxes reviewed against a contact sheet, not face detection: **Adrian's left edge
  moved 566 → 554 after the first sheet, because a face 3% off centre is invisible in a square
  and is not in a circle.** 7.9KB for all three, byte-identical on a re-run.
- **`LotusMark.tsx`, extracted from `AccountButton`** so the querent's chat avatar is *the same
  glyph* rather than a second `<svg>` with the same four `d` strings, with a byte-identity test
  holding the two drawings in step. **The readers are photographs and the querent is a glyph**,
  and that asymmetry is the point: three authored characters with portraits in this repo, and a
  person about whom this app deliberately holds no picture.
- **`corner` in `tokens.ts`** — the geometry `AccountButton.module.css` already shipped as the
  literals 10, 44 and 8, named, because F4 may not edit that stylesheet and `ChatButton` has to
  sit beside it. `tokens.css` mirrors it and derives slot 1 in CSS, so `10 + 44 + 8 = 62` has one
  home. **The coupling is one-way and asserted rather than shared.**
- **Six event names, 70 → 76**: `chat.opened`, `chat.message_sent`, `chat.run_planned`,
  `chat.turn_generated`, `chat.run_finished` and `chat.proactive_skipped`. **The ritual held** —
  `chat.button_clicked` was folded away with the sentence *the click IS the open*, and
  `chat.opened.from` narrowed to three values.
- **Three smoke commands, and they are the release gate.** `npm run smoke -- --chat` (a scripted
  multi-turn group chat with the names covered), `--chat --proactive` (an unprompted opening) and
  `--chat --director` (the beat sheets alone). **`npm run smoke -- --chat --director --voices` is
  the joined run**, and it had to exist: `--chat` cans the sheets and `--chat --director` cans the
  voices, each so a failure in one is not read as a failure in the other, and **neither can see a
  sheet that reads well and produces three paragraphs that sound alike**, because that failure
  only exists where the two meet.
- **A brevity check that is the only inverted instrument in the repository**: it FAILS when the
  *shortest* bubble in a whole conversation is over six words. Every other length check here fails
  on output being too long once; this one fails when brevity never happens, which is `C-D19`'s
  named worst outcome and which no existing check can see because every ceiling was met.

### Changed

- **The readers see the six raw onboarding answers, and this amends `A5` by name** (`C-D8`,
  granted with all five conditions intact). One decrypt site, in F3's assembler through
  `queries/onboarding.ts`; **not one decrypted byte reaches the browser**; `<jawaban>` fences it;
  and **a skipped answer stays skipped**, because a reader who asks about the thing you refused to
  answer is the worst version of this feature. A skipped answer's *key* appears nowhere either, so
  the model cannot learn the question exists and was declined.
- **`/privacy` amended at all seven touch points and both onboarding hints amended, in both
  locales.** The reconciliation's most serious finding rather than a footnote.
- **`prose.test.ts`'s payload ceiling moves 20,000 → 23,000, the first widening it has ever had,
  with the written reason that file demands.** v0.7.0 adds a whole screen and 39 `chat.*` keys
  across three workstreams — 1,848 bytes, 8.7% of the catalog; `id` measures 21,161 over 376 keys.
  **Nothing was relaxed to fit**: every one of the 39 is chrome, the longest is 84 characters,
  `MAX_VALUE` did not move, and `/chat` renders no authored document. **The new headroom is
  deliberately tighter than the 21% this started with**, so the next screen meets the same test.
- **A chat message is never translated** (`C-D9`). `TRANSLATABLE` gets no entry and `translations`
  no `entity`: translating one would make Thessaly say something she did not say, in a room where
  the querent can see the original. The chrome still follows `t()`; a bubble carries its own `lang`
  and the page does not.
- **`CHAT_LENGTH_BUDGET.en.maxWords` moved 22 → 24 and then 24 → 27, both times on evidence, both
  times for one reader in one locale.** At 24, Margaret's English came in at 25–31 against a
  resolved 31 and **two runs of three lost a bubble to `too_long` — both casualties reader-to-reader
  beats, the most distinctive mechanic this release has.** The confirmation run had no `too_long` at
  all, delivered her at 31, 32 and 34, and overlap stayed at 0.017–0.076, so **the readers did not
  converge when the ceiling moved**, which was the risk. `maxChars` deliberately did not move — her
  longest stored English bubble was 164 characters against 312, so moving both would have been a
  change with evidence for half of it. **If a third round moves it again the lever is wrong**, and
  the answer is a per-(locale, reader) multiplier rather than a third raise.
- **`CHAT_SENTENCE_RATIO` back to 1.5 from the plan's 1.25.** The plan lowered it fearing that at a
  22-word bubble the ratio compresses. Measured 1.96–4.94 across six runs: it does not.
- **`sweep`'s cron header corrected in place** — `17 3 * * *` is 10:17 WIB, not 03:17, because
  Vercel cron is always UTC; and the claim that the free plan allows "a small number of cron
  invocations" is 100, verified 2026-08-07.
- **`ADMIN_MODEL` is one variable for all three admin model calls and points the other way**
  (2026-08-01, Miftah's ruling; `src/lib/admin/model.ts`, a LEAF). The Insight button, Auto Format
  and `Terjemahkan otomatis` are the only sites whose caller is the operator, and
  `flagCoverage.test.ts` already named them as one class — **so three variables would be three
  chances for one dashboard to answer in two different voices.** `insight.ts`'s header used to be
  titled *"NO INSIGHT_MODEL VARIABLE"* and left the door open in as many words; the reason it
  predicted is the reason this landed.
- **The Insight prompt asks for a finding, not a summary.** It asked *"apa yang dikatakan
  angkanya"* and got a tally back — true, and worth nothing under a chart the operator had just
  read. It now asks for problem → one piece of evidence → one concrete step, bounds a suggestion to
  what this dashboard can do, and **names *"tidak ada masalah"* as a CORRECT answer** so the model
  does not invent a finding to be useful. **The false-positive half is the expensive one** and gets
  a list of what is NOT a problem plus *if you are unsure, it is not*: an operator sent to chase a
  healthy panel stops reading the box.
- **`validateInsight` grew a `tally` refusal and it is still shape, not truth** — every sentence
  carrying a digit over ≥3 sentences, or any one sentence carrying ≥5 numbers, both tuned to
  ACCEPT. `NUMBER`'s class holds the hyphen, or a finding that cites its own date counts as three
  numbers and is refused.
- **`prices.ts` carries a `glm-5.2` row at zero, dated the day a human opened the pricing page**
  rather than backdated like its neighbours, with the verified pay-as-you-go figures in the note as
  a **counterfactual and not as the rate** — that would make `costUsd` quote a bill nobody receives.
- **CLAUDE.md gains `## The z.ai plan`, and it exists because the wrong inference was already drawn
  once.** A session that reads z.ai's current docs and stops there concludes this repo's prices and
  its call ceiling are wrong. They are not: the plan is a **legacy annual Pro Coding Plan bought
  February 2026**, `devpack/transition` cancelled auto-renew for exactly that class on 30 April
  2026, and it predates GLM-5.2 entirely. **The argument works by modus tollens** — an out-of-plan
  call would `1113` against an unfunded balance, production readings work, therefore the calls are
  plan-served and zero is true. **The generalisation is the mirror of this repo's own trap**: not a
  fact that rots because nobody re-runs it, but a fact the repo *can* re-run, re-runs correctly, and
  still gets wrong, because the page describes what is sold today and the account is on something
  older.

### Fixed

- **An integration fixture had been red for eight days and it was a time bomb, not a defect.**
  `userList.integration.test.ts` seeded a ledger row with `local_date: '2026-07-20'` and left
  `created_at` at its `now()` default; `userCostLeague` windows on `created_at`, so the row was
  inside the range while the clock was still in July and **stopped being on 2026-08-01** — the
  aggregate came back `null` and read as `adminUserListPage` having broken.
  `metrics.integration.test.ts`'s `row()` helper documents this exact trap in its header and pins
  both clocks for every fixture; **this is the same lesson paid for twice.** Now pinned, plus a
  **negative control that turns the seam into an assertion** — a row inside the range by
  `local_date` and outside it by `created_at` must not be counted — which is what stops the next
  person "fixing" the fixture by switching the query, and which states the real consequence: a call
  at 23:00 WIB on the 31st can make the same querent's figures differ between `/admin/users` and
  `/admin/users/[id]`. A scan across every other integration fixture found no second bomb.
- **`now()` is frozen inside a transaction, so two bubbles from one beat shared a microsecond and
  ordered by random uuid.** The room would have rendered a reader's two sentences in either order,
  differently on each page load, with nothing looking broken. Found by the keyset-pagination test;
  the context integration test writes explicit timestamps for the same reason, and failed one run in
  three before the fix.
- **`greatest(col, $date)` in a raw `sql` template throws at runtime on a green typecheck** — there
  is no column for drizzle to hang an encoder on. The neighbour of `answersUpdatedAt`'s
  `sql<T>`-is-an-assertion rule.
- **A histogram on `/admin/chat` is `InlineBars`, not `StackedBar`, and only a 1440px screenshot
  showed it.** `stackSegments` normalises every row to 100% of its own total, so a one-segment row
  is always full width: rendered live, the beat histogram was `0 beat` at full width beside five
  empty outlines and the intent histogram was six identical empty outlines. **The distribution,
  which is the entire content of those panels, encoded nothing** — and the plan had asserted the
  opposite. The same property makes `chat.cast`'s bar *lengths* meaningless, so its copy now says to
  compare the numbers at the row ends. Two more the shot caught: the tiles sat flush against the
  bars, and the two quota meters came out different widths because `.lead` is `max-content 1fr`,
  right for a hero beside a meter and wrong for a meter beside a meter on a panel built for
  comparison.
- **`chat.opened.from = 'attach'` could never have fired.** F4 matched a literal `?from=attach`,
  but one URL key carries two features and the presence of `?attach=` is what means it — so every
  attach-initiated open would have reported `'direct'`, the one entry point that prop exists to
  distinguish. Decided on the server and read from a ref, because the event fires after two awaited
  fetches and by then the URL has been tidied.
- **The draw screen's attach would have 400'd on every press.** The plan said `from: 'reading'`;
  F1 had folded the event into `chat.message_sent.attached_from` with the union
  `'history' | 'draw' | null` and the route's zod enum matches — wrong on exactly one of the two
  surfaces, and the one a querent reaches most often.
- **`chat.typing.one` could not exist.** `PluralKey` is derived as `StripOne<MessageKey>`, so a key
  ending in `.one` declares a plural family and `catalog.test.ts` then demands a matching `.other`.
  It was never a plural — the room shows one indicator at a time, because beats execute serially.
  **In this catalog a suffix is a TYPE, not a name.**
- **`usianya` contains `ianya`, so an ordinary Indonesian word failed the Malay grep**, and
  `datamu` matched inside `biodatamu` and refused the best sentence in a calibration run — a reader
  *denying* that it holds a file on you. The source tells are now bounded at the head and open at
  the tail: closed at the head because a prefix is where the accidents are, open at the tail because
  a real run produced "kamu pernah ceritain sendiri".
- **The reader-to-reader lever was measuring nothing, and the fix was to retire the number rather
  than push the prompt.** It was recorded as "0% across five runs and ~40 beats". Both halves were
  wrong: joined runs measure 5–13%, and **the zero was an artefact of the fixture** — with no voices
  attached the room never accumulates generated bubbles, so the director had four hand-written
  reader lines to point at instead of a thread growing under it. **A director-only run is the wrong
  instrument for a lever about the room answering itself.** And the prose does it far more often
  than `to` says: *"he's right though"* and *"she said it like a checklist"* are both the room
  talking to itself and both score as help-desk beats. **Two prompt pushes were spent on this before
  the join existed and the second had to be reverted.**
- **Rule 1 was biased hard toward one beat and the model obeyed it exactly** — *"Kebanyakan run
  cukup SATU. Dua sudah ramai"* plus *"kalau ragu, artinya tidak perlu"* produced a 1:7 / 2:0 cast
  mix, which is three readers taking turns being the only reader. Rewritten to name the *case* for a
  second beat, with "if in doubt, no" scoped to the third.
- **Rule 6 needed the actual strings.** *"wkwk iya sih"* was answered with an `answer` quoting a
  four-minute-old message. Naming the shapes — *tawa* ("wkwk", "haha"), *tanda setuju pendek* ("iya
  sih", "oke") — moved it to `beats: []` in every run since. **A description of brevity does not
  produce brevity; a list of the words does.**
- **The director did not know what `BAHAN` was for.** `assemble.ts` had rendered `BAHAN:` /
  `MATERIAL:` above the window since F2 and the ten rules never named it. On a `user_message` run
  that costs nothing — the newest line in the window obviously *is* the trigger — but **on a
  proactive run it is the whole feature**, because the newest line is hours or days old and the
  reason the room was woken is not in the window at all. Measured across three runs: 3 of 6, then 4
  of 6 with the note table calibrated, then **5 of 6 with rule 11 and a third worked example, and it
  reaches the BUBBLES**. The fix was a **worked example, not a longer rule** — the blog editor's
  `at:` lesson, one release on.
- **`OP_ORDER`'s header said "The ten" over an eleven-member array, `analytics-queries.md` said
  ten and named only `insight`, and `copy.ts` said "Sepuluh op".** Seam S10 asked for a
  cost-per-reading denominator to be corrected; **a full sweep found no such arithmetic anywhere in
  this repository.** What exists is the *rule* about one, stated in prose four times, **three of
  them already stale** — so the honest reading was to fix the rule and give it one machine-checked
  home rather than invent a tile in order to have something to correct.

### Removed

- **`attachmentBlock.ts`'s private fixpoint loop, and the scaffolding comment that asked for its
  own deletion.** Its `</lampiran>` guarantee was **stated and false** while the tag was not in
  `sanitize.ts`'s alternation; it is now true for the same reason every other fence here is.
- **The plan's `direct/plan.ts` facade, `direct.ts` and `index.ts`, drafted and never built.**
  F1's `plan.ts` is already the former and is named **by string** in `callClass.test.ts` and
  `flagCoverage.test.ts`; an index would be a second import surface with one consumer. The facade
  is `system.ts` / `system.{id,en}.ts` and **the exported function names stay the plan's**, so the
  prose remains greppable against the document that specifies it.
- **The reader-directed *rate* as a tuning target.** The runner now labels it **a floor, not a
  rate**, with *"DO NOT TUNE THE PROMPT AGAINST THIS"* beside it, and the release question it
  belonged to was rewritten to ask it of the prose. **Nothing in the prompt was changed for this,
  and that is the point.**
- **`ChatSurface`'s four-value union, drafted and never built** — it lost its consumer when
  `chat.button_clicked` was folded away with the sentence *the click IS the open* and
  `chat.opened.from` narrowed to three values. **`ChatButton` tracks nothing**; the entry point
  travels as `?from=button` and the room fires the event once.
- **`top` from the `recurring` proactive facts**, so the card's name appears exactly once — the
  `reading` note's reasoning inverted for a material whose subject IS the card.
- **A `CHAT_PLANNER_MODEL`, refused rather than added for symmetry.** Its only effect would be
  letting somebody make the director dumber than the readers it directs, at 2am, and never notice.
- **A `CHAT_ATTACHMENT_BODY_CHARS`, refused for the same class of reason**: F6 shipped
  `ATTACHMENT_BODY_MAX_CHARS` with a measurement behind it, and a second cap on one string is two
  numbers that must agree.

### Security

- **`audit-secrets.ts` walks `src/lib/chat/**`, and it was verified by making it fail** — a
  tripwire nobody has seen fire is a tripwire nobody knows is connected. Before this, the
  non-negotiable was **unenforced for every string F3 would write**, and the "derived ZERO needles"
  guard could not fire because the two old directories kept the count non-zero. `lib/chat/` also
  joined `FORBIDDEN_IMPORTS`, which catches the leak in the **source**, transitively, in one second,
  with the whole chain named. Both directions were checked and reverted, and the **two-hop** one is
  the one that matters: `clientBoundary.test.ts` fences the direct import and does not know the
  `type` keyword.
- **`chat_messages.body` is text a person typed, in plaintext** (`C-D20`) — `readings.question`'s
  neighbour in every privacy commitment. **Never log a driver error from any path that runs a chat
  query**, `events.props` carries a length and never a body, and **nothing in
  `queries/admin/chat.ts` selects the column at all.**
- **A posted message goes through the W7 gate, and a refusal is never in a reader's voice**
  (`C-D13`): `RefusalNotice`, not a bubble, because a reader who refuses you is a friend who refuses
  you. **The classifier is not "tightened" for this surface** — grief, illness and a frightening
  partner are what the room is for — and **a reader's own output is not classified.** Verified live:
  Tier-A harm refused 403 with nothing stored, and *"haruskah aku pergi dari suamiku yang kasar"*
  allowed through, which is the whole point.
- **Four prompt rules make `C-D8` survivable and each is asserted separately because each is
  separately deletable**: you may ASK, you may not COPY a sentence, you may not NAME a person from
  `<jawaban>`, and **you may never say how you know.** The failure this release can produce is not a
  forbidden word — it is *"kamu pernah bilang neneknya meninggal waktu SMA"*: true, sourced,
  correctly recalled, and the ugliest sentence available. The prompt is one of four guards;
  `validateTurn`, the smoke greps and the blind read are the others.
- **The director sees the room and nothing about the person, enforced by construction.**
  `PlanInput` has no field for a nickname, a birth date, the Lotus or an onboarding answer — a
  director that also read the six answers would make condition 1 false on the day it shipped, for
  zero gain, since its job is *who speaks*. A contract test asserts it on the source: no
  `getAnswers`, no `decryptField`, no `<jawaban>`, no `profile: 'voice'`.
- **The block order is the injection answer.** Four fenced blocks and exactly one unfenced one, so
  *"abaikan aturan di atas"* lands inside `<obrolan>`, which the contract has already declared to be
  material. The test asserts every angle bracket in the user turn belongs to one of the fences, and
  **the builder strips its own material**, because `chat_messages.body` stores what a person typed
  verbatim.
- **There is no random number generator anywhere under `direct/**`, asserted as a grep with
  comments stripped.** The tempting shortcut is a coin flip — silence 20% of the time, two beats 35%
  — and it is refused on three grounds. **A room that is quiet at random is not quiet for a reason**,
  and the silences land on the messages that deserved an answer. It destroys the only instrument this
  release has, because a dice roll produces a different sheet for the same input and *"did my prompt
  change help"* stops being answerable. And **it hides a broken director behind a plausible
  distribution**: a model that has stopped returning JSON and a model that is deciding well produce
  the same histogram once a coin flip is in front of them.
- **A run never chains**, asserted as a second grep: nothing under `direct/**` may reach `mintRun`
  or the engine. **The failure mode is not a bug, it is a loop** — beat 4 of run 1 mints run 2, whose
  beat 4 mints run 3, nothing throws, and then every reading in the fleet starts being shed. Every
  legitimate reason to keep going is already a trigger.
- **`/readers/*` gets a middleware-matcher entry and its own cache header.** Without the first,
  middleware runs on every avatar and puts a `Set-Cookie` on a static image — **per message
  rendered**, since this is the one asset class a signed-in querent hits on every chat render. The
  header is `max-age=86400` plus a week of `stale-while-revalidate` and **not `/cards/*`'s year of
  `immutable`**: the crop table will be tuned after somebody sees it on a phone, and three
  non-content-hashed filenames plus `immutable` means every install keeps a bad crop until 2027.
  That exact mistake was made once already, with `/wallpapers/`.

### Known gaps at this tag

- **THIS IS THE FIRST RELEASE THAT WAS ALREADY LIVE BEFORE ANYBODY DECIDED TO DEPLOY IT, AND THE
  DRAFT OF THIS BULLET SAID THE OPPOSITE.** It read *"Nothing here has been deployed"*, copied
  forward from v0.5.0 and v0.6.0 where it was true. **Auto-deploy on `main` is on**, so the merge
  push shipped v0.7.0 to production and applied migration `0014` — the second build reported
  `[migrate:deploy] schema is up to date`, which is how the first one is known to have run it. The
  rail worked exactly as designed and **nobody had decided to pull the lever.** Everything v0.6.0
  listed as undeployed, including `0013`, went out on the same push. **The generalisation, and it
  is the one worth keeping: a release checklist that ends in "deploy" is wrong in a repository
  where `git push` IS the deploy** — the changelog step comes after the merge, so the entry is
  written by a session whose own push already shipped what it is describing.
- **FIVE environment variables, not six, and the sixth was the mistake.** `CHAT_MODEL`,
  `ADMIN_MODEL`, `CHAT_ENABLED`, `CHAT_PROACTIVE_ENABLED` and `CHAT_ANSWERS_ENABLED` are set on
  Production and verified by reading them back. **`LLM_WINDOW_CHAT_CEILING` is deliberately UNSET
  and this entry's draft was wrong to list it** — `meter.ts` derives it as half the hard ceiling
  precisely so February 2027's credit re-derivation moves both together, and writing `140` into a
  dashboard is the literal that rule forbids, agreeing with the derived value today and drifting
  from it silently on the day the ceiling moves. **A default that exists to couple two numbers is
  not a variable somebody has forgotten to set.**
- **The four chat variables are stored `--no-sensitive`, and that is a change of what "verified"
  means here.** They are configuration `.env.example` already publishes, not credentials, so
  `vercel env pull` reads back `CHAT_MODEL="glm-5.2"` rather than `[SENSITIVE]`. **`CHAT_MODEL` was
  re-asserted rather than trusted** for exactly that reason: it was already set and unreadable, and
  a wrong value there is not benign — it is the three defects named above. `LLM_API_KEY`,
  `AUTH_SECRET`, `FIELD_ENCRYPTION_KEY`, `DATABASE_URL` and `CRON_SECRET` stay sensitive.
- **Preview has no `CHAT_MODEL`, so a preview deployment is the different room.** Production-only
  follows the precedent of `ADMIN_MODEL` and the five older kill switches; it is a real gap the
  first time somebody judges the chat on a preview URL.
- **Loop 6 is deliberately unspent, and it is the largest gap in this release.** Miftah is the only
  user of this app and is testing the phone half directly on production. Unmeasured on hardware: the
  composer with the keyboard up — it is a grid row and not `position: fixed`, which is the decision
  most likely to be wrong and the one WSL cannot judge; the bubble and the whole-card tap target at
  375; the staged attachment; and the three avatar crops, which is what their cache header is short
  for. **The iOS standalone Google sign-in remains the largest unverified risk in the project.**
- **The voices still invent an occasional specific, and `base.{id,en}.ts` already forbids it in as
  many words.** `glm-5.2` lowered the rate without reaching zero — *"How many days since you last
  talked to your mum"*, *"that first year on your own"*. **Not shape-testable, and it must not be
  faked with a test that pretends to be**: `validateTurn` refuses shape, not truth. A reader who
  invents your mother is worse than one who says nothing, so **this is the sharpest naturalness risk
  left and it is loop 6's to judge.**
- **`recurring` is the one of six proactive materials that does not reliably land**, across four
  measured runs in two locales, and it is recorded rather than chased: two prompt pushes were already
  spent chasing a number before the join existed and the second had to be reverted. **A third would
  be chasing variance.**
- **Two director numbers are out of band and were not tuned.** The English ask rate is 56% against a
  25–35% target and the Indonesian silence rate swings 11–33%. The fixture is nine probes chosen to
  test **rules** rather than to be representative traffic, and temperature is unset by design.
  **Measure on real traffic before moving rule 6 or rule 7.**
- **The director's persona sketches are three one-line summaries and the cost is drift.** The full
  blocks are not imported, for two sufficient reasons — a director holding 2,400 characters of
  persona instruction is being invited to draft the message, and it runs on every run against a quota
  where sixty runs exhaust the app's five hours. **If the director starts routing wrongly the
  sketches are the first thing to read.**
- **`LLM_WINDOW_CHAT_CEILING` is unexercised outside the route.** The smoke script calls `complete()`
  directly, so it charges the fleet meter and never `reserveChatCall`. Related, and measured: **five
  smoke runs in twenty minutes tripped the fleet soft ceiling** and a run died mid-transcript at
  exactly 196 calls — 280 × 0.7 — on the **local** SRH counter. The reset before a calibration session
  is a `DEL` of the two `llm:window` keys; raising the ceiling would work too and is worse, because it
  changes the thing being measured.
- **`GET /api/chat/messages` fans out one lookup per distinct attached reading in the page.** If it
  ever matters the repair is a **batched read and never a cap**, because a cap draws
  `chat.attachment.gone` under a reading that is right there in the table.
- **A reply target that has scrolled out of the forty-row window resolves to null**, and the
  three-line recoveries `voices/pace.ts` and `context.ts` make for inputs their signatures do not
  carry are written into their headers rather than solved. `checkPlan` **cannot** refuse a zero-beat
  proactive plan through `validatePlan`; the trigger-aware refusal ships at the four call sites
  instead.
- **`'persona'` is still a live `share_links` union value resolving to null**, `share.viewed` has
  still not been observed firing, `src/content/blog/**` is still committed and still no longer the
  source, and the four launch rows keep their old hero `alt` until `blog-import.ts` is re-run.
- **`npm run test:all` still fails ~12–22 of V9's limiter tests** — the harness race on the one
  shared `serverless-redis-http`, not a regression. `npm test` passes **3593** across 189 files and
  `npm run test:integration` passes **642** across 45; run the two projects separately for a true
  answer.

## [v0.6.0] - 2026-07-31

**v0.5.0 built the surface the operator can see. v0.6.0 is what happened when the
operator used it.** No roadmap, no reconciliation, no workstream numbers: seven reports
from Miftah driving `/admin` and `/admin/blog` by hand, two designs written in response
(`docs/plans/2026-07-31-admin-panel-insights-design.md` and
`2026-07-31-blog-markdown-editor-design.md`), and **four defects that a plan could not
have found because each one needed somebody to press the thing.**

**The report that sets the tone is one sentence long: *"i clicked 14 hari but the date
range didn't do shit."*** The presets and the two date inputs shared one
`<form method="get">`, and a submit sends every field in its form — so pressing *14 hari*
sent `d=14` together with the `from`/`to` pair already on screen, and `parseRange` gives
an explicit pair precedence over `d`. **Every preset navigated to a URL that re-selected
the range it was already showing**, and the highlight and the date values were faithful
renderings of a range the button had failed to change. The grep-shaped fences over
`src/app/admin/**` cannot see that class of bug: they read source text, and this is a
property of the rendered form tree.

**The worst of the four is silent content loss behind a screen where nothing looks
wrong.** The locale tabs on `/admin/blog/[slug]` are `<Link>`s, so pressing one is a soft
navigation within the same route segment — the server re-renders and the preview updates,
which is exactly how it was reported — but React reconciled `BlockEditor` as the same
element and every field inside it was a `useState` initialiser. Open `?locale=id`, press
**English**, press **Simpan**, and **the Indonesian body was stored as the English one.**
Same class as the two initialiser traps this repo already records.

**The second thesis: nobody composes an article in a block editor.** One arrives already
written, from Gemini or ChatGPT, in markdown, on the clipboard. `BlockEditor.tsx` — 880
lines of form controls over the `Block[]` union — is **deleted**, replaced by Judul,
Gambar Utama, Konten and two buttons. **Markdown is a projection of the document, never
the record of it:** `body` stays `Block[]`, `Prose` stays the one renderer, there is no
markdown block kind and no `dangerouslySetInnerHTML`, and **no migration and no column.**
`parseMarkdown ∘ serializeMarkdown` is identity over the four committed articles, and
that property is what licensed the deletion.

**And the lesson that generalises past this release: when a model produces something
useless, measure the input before blaming the model.** Miftah pasted three paragraphs of
Gemini-written Indonesian, pressed *Format otomatis*, got one enormous paragraph with a
heading repeated after it, and concluded glm-4.6 was not capable enough. It was not the
model. Measured on the real bytes: **3 lines, 0 blank lines.** A chat UI separates
paragraphs with one newline and markdown says a single newline *continues* a paragraph, so
the parser produced a single 2,292-character block — and **a heading can only go BETWEEN
blocks, so a one-block document offered exactly one legal position.** The model was asked
to find the sections of a document with no internal boundaries and did the only thing
available.

**Two new `LLMOp` values in one day, 9 → 11**, and the rule was never that ten is a magic
number — it is that a new value is a question for Miftah, asked and granted twice. **Two
of the eleven now measure the dashboard and the CMS rather than the app**, so a
cost-per-reading denominator must exclude both.

3016 unit tests across 162 files; 503 integration across 37. **One migration** (`0013`),
taking the schema from seventeen tables to **eighteen**. **Zero new event names** — one
prop shape widened instead, which is this register's own rule. **No new dependency**: the
markdown parser is hand-rolled, deliberately.

### Added

- **An `Insight` button on all thirteen subpanels of `/admin` and `/admin/tokens` (A7)**,
  with the model's reading of that panel in a box under it and the time it was written
  beside the button. `src/app/admin/insight/panels.ts` is the registry — six overview
  panels, seven token panels, `PANEL_IDS` in render order — with `InsightBox.tsx`,
  `src/lib/admin/{insightPrompt,insight}.ts`, `queries/admin/insights.ts` and
  `POST /api/admin/insight`. **The page imports the id list rather than spelling its own
  strings**, so the registry and `panels.test.ts`'s grep can drift in membership but not
  in spelling.
- **`admin_insights` (migration `0013`)** — cached per `(panel_id, range_from, range_to)`,
  so a reload serves the prose without reaching a model. **R21 survives**: the cached row
  is read in each page's own `withAdminRead`, so the box's first frame is server-rendered
  and the only fetch is the press.
- **`insight` is the tenth `LLMOp` and `blog_format` the eleventh.** Roadmap seam 3's
  *nine, closed, no tenth and no alias* was put as a question and granted, twice: each is a
  recurring model call with no querent behind it, and `/admin/tokens`' own cost-by-purpose
  table has to be able to state its price. **Folding either into an existing op would make
  the dashboard hide the cost of its own newest feature.** `OP_ORDER`'s `AssertNever` makes
  a twelfth a compile error.
- **`stamp()` in `src/app/admin/format.ts` — the one formatter in that file pinned to
  Jakarta rather than UTC.** `day` and `dayWithYear` render `local_date`, a string, and UTC
  is what keeps the label the same day the column holds; this renders a real instant
  answering *"when did I last press this button?"*. **The explicit zone is also what makes
  it hydration-safe** in a client component whose first frame is server-rendered.
- **`ChartFrame` takes an `insight` slot — a `ReactNode`, never a panel id.** It renders
  below the footnote and above the table, and it is **optional**, which is the difference
  from `table`: a chart cannot be constructed without its accessible relief (I-13) and can
  perfectly well be constructed without a button. The moment that file takes an id it needs
  the registry, the copy and a fetch, and I-16's *hardcodes no user-visible string* stops
  being true of the one primitive every chart goes through.
- **`src/lib/content/markdown.ts` — `parseMarkdown` and `serializeMarkdown`, five block
  kinds, hand-rolled.** No markdown library: a general parser produces tables, images, HTML
  blocks and footnotes this union would have to drop **silently**, where a parser that knows
  five kinds refuses nothing silently — anything it cannot classify is a paragraph, which is
  visible in the preview. `{#anchor-id}` is parsed and emitted, because the four articles
  carry English ids on Indonesian headings that `slugify` cannot derive and **an anchor is a
  permanent address**.
- **`Format otomatis`** — `src/lib/content/formatAdvice.ts`, `src/lib/admin/blogFormat.ts`
  and `POST /api/admin/blog/[slug]/format`. Four phases behind one button: parse to
  `Block[]` (pure, no model, no network); consult a model **only when `adviceNeeded()` has
  something to ask**; validate; write the draft through `saveDocument`, so machine output
  gets no shortcut past zod, the lint, the resolution or the derived hero alt.
- **The model returns metadata and never the author's words** — headings, anchor ids, a
  description, a title — and code splices them. That is `effectiveYesNo()`'s and
  `validateChoice`'s instinct in a new direction of travel. `parseMarkdown`'s output is
  already a valid document, so **rejecting all the advice is a correct outcome**, and the
  property is asserted directly: every block that came out of the parser is still in the
  result, byte-identical and in order.
- **`'no-title'` is a fourth `AdviceReason`.** An operator asks Gemini for an article and
  pastes the body; the title is a separate question nobody thought to copy, and an empty
  Judul used to be a dead end — `documentSchema` requires `title.min(1)`, so the press
  produced *"markup / title / Too small"* in the lint panel. Accurate and useless. It is
  asked for **only when the field is empty and used only when the field is empty**, checked
  in the route as well as in `adviceNeeded`, because whether to ASK and whether to USE are
  different questions and a model can ignore *"return an empty string"*.
- **`src/lib/content/heroAlt.ts` — the hero `alt` is derived from `LoreDoc.imageAlt` and
  there is no field for it.** One description per card per locale, already asserted ≥60
  characters, already asserted not to open with the card name, written by somebody looking
  at **our** painting. `heroAltFor()` returns `null` as a **refusal**, never `''`.
- **`ArticleToc.tsx` — one component, two mounts, its label a prop.** The table of contents
  was **always automatic** since S6; what was missing was the preview, which mounted `Prose`
  alone without the page chrome — so the one surface somebody looks at while writing was the
  one that did not show it. The label is a prop because `adminCopy.test.ts` forbids `t()`
  across the admin tree.
- **`Simpan & terbitkan`, which chains two existing endpoints and is not a mode on
  `Simpan`.** A combined route would restate `changeStatus`'s rules — no path back to draft,
  `id` before `en`, and a publish refused for **any** violation including warnings, which is
  the one place an operator meets a violation that let them save seconds earlier. The publish
  is skipped after a create, because that save navigates.
- **The `Publik` chip is a link to the article it says is public**, in a new tab, 44px.
  `blogPostPath` is new in `src/lib/seo/blog.ts` and `blogPostingUrl` delegates to it: **the
  href is relative and built on the server** — relative because `blogPostingUrl`'s absolute
  form would send a preview's operator to whatever `NEXT_PUBLIC_SITE_ORIGIN` names, which
  reads as a failed publish; on the server because `StatusControl` is a client component and
  `adminCopy.test.ts`'s A-D12 grep forbids that subtree from importing `@/lib/i18n/prefix` at
  all. `draft` and `unpublished` keep the plain 20px chip, because a link to a 404 offered
  **as** the status says the opposite of what the chip says.
- **The `/admin/tokens` league row is a drill-down across its whole width**, landing on
  `/admin/users/<id>#token` with the range carried over, so the total on the destination is
  the total on the row clicked. **The anchor IS the grid row** rather than a link around
  eight hex characters, which retires `page.module.css`'s recorded *"the row being 44px does
  not make the link 44px"* trap by construction.
- **`rangeQuery()` emits `from`/`to` and never `d`.** `d=30` resolves against the
  **receiving** page's own `todayUtc()`, so a drill-down carrying it would land on a
  different window whenever the two renders straddle UTC midnight, with both pages looking
  perfectly healthy. It also carries a custom range, which `d` cannot express, and the
  destination's pressed state still lights up because `presetFor(dayCount(from, to))`
  recovers it.
- **`ScrollToHash` and `--admin-anchor-offset`.** `#token` did not work, and not simply
  because of `<Suspense>`: the body streams inside `<div hidden>` and is revealed by script,
  so the parser meets the id with no scroll box — **but Chrome still wins that race about
  half the time**, and when it does it ignores the sticky table of contents. Two loads of one
  URL gave `y=0` and `y=2699`. Scrolling alone lost to Chrome's late scroll; publishing the
  measured sticky height and letting `scroll-margin-top` govern **both** paths makes the race
  harmless. Fixes `#bacaan` in passing and stops the fourteen TOC links landing behind the
  bar.
- **`splitRun`, and the discriminator is not a guess:** within a run of consecutive non-blank
  lines, **if every line ends a sentence then each line is its own paragraph, otherwise the
  run is joined.** Hard-wrapped prose breaks mid-sentence so it cannot satisfy that, and the
  hard-wrapped shape is pinned by a test **from the other side**, so the fix cannot regress
  into splitting text it should join.
- **`src/lib/content/fixtures/pastedArticle.ts` keeps the real paste verbatim**, along with
  the bad reply the model returned, and `blogFormat.integration.test.ts` runs the route's real
  order — parse, `adviceNeeded`, `validateAdvice`, `applyAdvice`, `saveDocument` — over it.
  Removing `splitRun` turns 7 of 11 red; removing the duplicate-id refusal turns 2 red.
- **`RangeFilter.test.ts`, which did not exist**, asserting that **no form holds both a preset
  and a date input** — so merging them back is red. Plus `ScrollToHash.test.ts`,
  `range.test.ts` for `rangeQuery`, `insights.integration.test.ts`,
  `blogSave.integration.test.ts`, `markdown.test.ts`, `formatAdvice.test.ts`,
  `heroAlt.test.ts` and `insightPrompt.test.ts`.

### Changed

- **The translation pushes to the other language rather than pulling from it, and that was a
  design error rather than a defect.** `Terjemahkan otomatis` was mounted on the **target**
  tab, so using it meant: finish the Indonesian, navigate to an **empty** English tab, press a
  button that fills the form, press Simpan. **The starting point is that the other article does
  not exist yet**, and nobody navigates to a blank tab to create one. It now lives on the
  source tab and names the destination. **The route needed no new parameter** — `from` was
  always derived as the locale that is not `to`, so the caller passes the OTHER locale.
- **It writes now, through `saveDocument`, and lands as a draft** because `id`-before-`en`
  still binds. `canTranslate` asks whether **this** locale has a stored body, and
  `targetHasBody` drives the overwrite guard — which now protects a stored article in a tab
  the operator **cannot see**, strictly more worth confirming than a form they can.
  **`translate()` must touch no form state**: a push that still called `setTitle`/`setMarkdown`
  would overwrite the article being edited with a translation of itself, and a contract test
  greps the function for those setters.
- **The lint panel renders only when it has something to say, and the lint itself is
  unchanged.** It still refuses saves and publishes and is still the only place its words
  appear — measured live as `malay / tempoh` and `bare-path / /history`, both error class, both
  storing nothing. What went is the permanent empty panel: beside a form with dozens of fields
  a standing *"Bersih."* was reassurance, and beside three fields it is furniture that teaches
  an operator to stop reading that part of the screen. **Silence is now the successful state.**
- **`admin.blog_saved` gained `via` and `model_called`; the taxonomy stays at 70 names.**
  `via` is `'form' | 'auto_format' | 'auto_translate'` — a third value on a prop, never a
  third event name. **`model_called` is the one that decides whether the eleventh `op` was
  worth it:** an already-`##`-sectioned paste should reach no provider, so **false on nearly
  every press confirms the design and true on nearly every press means the parser is missing
  something** — and that is the fix rather than a bigger prompt.
- **Five distinguishable failures now read as five different sentences.** *"Format otomatis
  gagal."* covered all of them: a 422 now names the count and the fields and points at the
  panel, a non-2xx names the status, a 503 adds the stage and the driver code, a non-JSON body
  says the route probably crashed before answering, and a throw that is not a timeout says the
  request never arrived. **`Simpan` got the same treatment** rather than being left generic.
- **`heroSchema` carries a slug and no `alt`, and `.strict()` is what makes the deletion
  real.** A6-11's *both fields or null* is intact and now satisfied by **construction** rather
  than by validation; a client still sending `alt` gets a **422** rather than having it
  silently stripped and then silently overwritten. **`hero.alt` left the translation segment
  walk** and joined `heading.id` as structure — it is the target locale's lore description, so
  translating it would mint a third description of one painting.
- **`changeStatus` lints the DERIVED alt**, so the four legacy rows can still be published:
  refusing them for a defect already fixed on the write path would be the gate punishing
  somebody for the old bug.
- **The stale flag on an insight fires only on a CLOSED range.** Pressing the button **changes
  the panel it describes** — the insight's own `llm_calls` row is dated today, so the total went
  53 → 54 four seconds apart and the box flagged itself stale under prose it had just written.
  On a live range the timestamp does the work. Excluding `op: 'insight'` from the metric queries
  would fix it and would undo the whole reason the tenth op was spent.
- **The insight prose column is `28em`, measured — `45ch` is not 45 characters.** Cormorant
  Garamond's zero is 6.2px at 13px against a 5.19px average advance, so the column rendered at
  279px under a 1126px chart.
- **`RangeFilter` is two forms, and nothing else moved.** A preset now sends `d` alone and the
  next render puts the window it chose into Dari and Sampai. `.filter` became a `div` carrying
  the gap its children used to get from the form; wrapped height is identical at 320/360/390
  with no overflow. `parseRange`'s precedence is deliberately **not** flipped: making a preset
  win was the other candidate fix, and it leaves `?d=14&from=…&to=…` in the address bar with
  `from`/`to` naming a range nobody is looking at.
- **`adviceNeeded` takes an object.** Four positional arguments of which two are adjacent
  strings — title and description — is the swap bug waiting to happen, and TypeScript cannot
  see it.
- **The format prompt's index rule needs a worked example, not a definition.** *"disisipkan
  SEBELUM blok itu"* was accurate and read backwards; it now shows `[0] → at:0` explicitly and
  forbids repeats and trailing headings in words. Three live runs after the change:
  `heading,paragraph` × 3 every time, zero rejections, prose byte-identical.
- **The prompt's language rule is stated twice on purpose.** The whole prompt is Indonesian
  because the operator is, so a model reading it has every reason to answer in Indonesian —
  exactly wrong for an English article. Measured both ways: the `id` article got *"Asal Usul
  Major Arcana dan Cara Kerja Tarot"*, the `en` article got *"Understanding the True Nature of
  Tarot Cards"*.
- **`docs/analytics-queries.md` opens with three things to have in mind, not two**, and the
  seeded-run paragraph above it is left exactly as it was — it describes what was true that day.

### Fixed

- **The range presets sent the dates they were meant to replace.** One `<form method="get">`
  carrying `["d","d","d","d","from","to"]`; after, two forms, and a tap on *14 hari* lands on
  `/admin?d=14` with *14 hari* pressed and 17–30 Jul in the inputs. Measured in a real browser
  by stashing the fix against the running dev server.
- **The locale tabs wrote one locale's body into the other's row.** `key={locale}` makes the
  remount the soft navigation already implies. **The assertion is source-level** because the
  behaviour needs a soft navigation, which is loop 5 and not Vitest — and the mechanism is one
  character that carries no visible behaviour on first paint, so nothing looks different the
  moment a refactor drops it. A second case asserts the editor still seeds from a prop, so the
  guard and its precondition fail together rather than the guard rotting alone.
- **`sqlstate()` has been logging a blank SQLSTATE for every analytics failure since it was
  written, and `DRIVER_TRANSIENT` could never match.** Measured against a closed port: drizzle
  wraps the driver error in a `DrizzleQueryError` whose own keys are `query`, `params` and
  `cause` — **the code is one level down.** So the transient/permanent split was being decided
  on a value that was always absent. One level only: walking an arbitrary chain is how a logger
  acquires a cycle.
- **`errorClass` read `err.name` and got `'Error'`.** The useful string is the constructor
  name. Both of those were measured, not recalled.
- **A chat-UI paste made one 2,292-character paragraph, and the model was blamed for it.**
  `splitRun` is the fix; three live runs after it gave three accurate sections, English anchor
  ids, descriptions 104–121 characters all in band, card names preserved, and **the author's
  paragraphs byte-identical in all three.**
- **`at === body.length` is refused: a heading titles what FOLLOWS it.** The first version
  allowed it in as many words — *"a heading appended after the last block is legitimate"* — and
  a live call returned `at: 1,2,3` on a three-block body, **storing a trailing heading whose
  entire section was the page disclaimer.** The legal range is `[0, body.length - 1]`.
- **A repeated heading `id` or `text` is refused, and seeded from the body rather than only
  from the reply.** glm-4.6 returned `## Three Septenaries` three times with one id: a duplicate
  DOM id, which is invalid HTML, and **a table of contents whose three rows all jump to the
  first section.** The old validator accepted it because it only refused a repeated `at`, and
  that reply used three different indices.
- **Four indexed pages shipped a broken hero `alt`.** `what-tarot-is.id` carried
  `alt: 'The World'` and the other three carried their own card's name — nine to eighteen
  characters against a 60-character floor, opening with the card name: **both halves of
  `hero-pair`.** The generalisation is not about alt text: `hero-pair` is **warning class** and
  `blog-import.ts` sets `status: 'published'` directly rather than through `changeStatus`, **so
  the gate that would have caught it was never on the path that made the rows.** A
  warning-class rule plus a write path that bypasses the gate is a rule that does not exist.
- **`#token` and `#bacaan` landed at `y=0` about half the time**, and behind the sticky bar the
  rest. Five loads then landed identically.
- **The preview never showed the table of contents, and no operator had ever seen it.** A
  preview that renders **less** than the page is a feature report waiting to be filed.
- **Two round-trip holes the property found by being written down.** A regex read `2 * 3 * 4`
  as an em span, and a paragraph beginning *"- lima kesalahan"* came back as a list — the block
  changes kind and the only witness is a preview nobody is looking at, because this fires when
  somebody opens a stored article to fix a typo. Fixed with a hand-rolled scanner over
  `ESCAPABLE` rather than placeholder substitution, which is a second escaping scheme to keep
  correct.
- **`cardRef` is recognised exactly, not heuristically** — a paragraph whose **entire** content
  is an `/arcana/<slug>` link. The tempting version, *"contains such a link"*, would swallow the
  six mid-sentence `/arcana/` links in the launch articles and tear those sentences in half.
  Removing the exactness turns 7 tests red including the four-article round trip.
- **The heading-cap test passed for the wrong reason.** 20 headings over a 3-block body collide
  on index, so the one-per-position rule fired and the cap never ran. Fixed with a 24-block body.

### Removed

- **`src/app/admin/blog/BlockEditor.tsx`, 880 lines.** A6's own header recorded the evidence
  without drawing the conclusion: the span control was a `<textarea>` because *"the launch
  articles are mostly ONE span per paragraph, three hundred characters long"*, and `plainToggle`
  existed because a paragraph with no emphasis in `Inline[]` form is *"ceremony around one text
  node"*. **Both are the union leaking through a form.**
- **The `Teks Alternatif Gambar` field.** It asked an admin to write a string that already
  exists 44 times, and **a second set of 44 strings would be a second description of one image
  with only the first one linted** — the shared-`@id` failure S3 and S4 each paid for.
- **`lintClean`, deleted so nothing re-adds a render for the empty panel.**
- **`previewStale`, deleted rather than reworded.** It said *"satu simpan di belakang"* and both
  buttons now navigate, so a hint describing a staleness the pane no longer has would teach an
  operator to distrust what they are looking at. **`previewHref` stays.**
- **A6-31's middle-dot strip and glued-pair outline, with the fence rewritten rather than
  removed** so that does not read as the rule being dropped. The strip existed because a form
  field shows a trailing space no more than it trims one; **in markdown the space is IN the
  text, in the position a diff would show it**, and `markdown.test.ts` asserts over the four real
  documents that a parse cannot emit an adjacent pair `spansSeparate` would object to. The
  predicate and the save-time refusal are untouched, and a case asserts they still exist so the
  absence assertions cannot pass vacuously.
- **`admin.blog_formatted`, drafted with five props and never added.** Trying to justify it
  surfaced a defect in the route instead: **Auto Format WRITES, so a separate name meant a save
  that fired no `admin.blog_saved` and an undercounted save metric.** `headings_added` and
  `advice_rejected` are diagnostics the operator already reads in the response, and `outcome`
  duplicates the fact that a refused save fires no event at all.
- **No markdown column, no sixth block kind, no `raw`, no `dangerouslySetInnerHTML`** — and no
  markdown dependency.

### Security

- **The *never the driver's words* rule held, and measuring made it sharper.** A
  `DrizzleQueryError`'s own keys are `query`, `params` **and** `cause` — **it carries the bound
  values, so returning or logging the object is easier to do by accident than with the raw
  driver.** What crosses the wire is a stage literal we wrote, the constructor name, and the
  short code.
- **Machine output gets no shortcut past the gate.** Both model buttons write through
  `saveDocument`, so zod's `.strict()`, the copy lint, the locale resolution and the derived
  `hero_alt` all run on a translation and on a format exactly as they run on a hand-typed save.
- **`heroAlt.ts` carries no `server-only` marker and is one hop from 44 lore documents.**
  `@/content/arcana` statically imports all 44, and `clientBoundary.test.ts` checks **direct**
  imports only — so `heroAlt.test.ts` asserts no client component reaches it, and **that
  assertion is the whole protection for that hop.**
- **`insight` and `blog_format` get no entry in `flags.ts`**, joining `blogAutoTranslate` in
  `flagCoverage.test.ts`'s `EXEMPT` table. **`callClass: 'deferred'` on a site whose caller IS
  the operator means the fleet-wide ceiling sheds the press before any querent call, so the tier
  is the switch** and it cannot be left off at 2am.
- **`validateInsight` and `validateAdvice` refuse shape, not truth, and say so.** Empty,
  over-long, answered in markdown, a repeated heading, a trailing heading, an out-of-range index
  — none of that is stored. **There is no cheap test for *"this sentence about a trend is
  true"***, and the honest instruments are the timestamp, the stale line, and the table view
  directly underneath.
- **The insight route re-derives the numbers and never trusts the posted body**, which carries
  `{ panel, from, to, force }` and no figures. W3's completion-route rule, applied to a prompt.
- **`POST /api/admin/blog/[slug]/translate` writing the target locale did not widen the
  surface**: it is the same session, the same `requireAdmin`, the same `saveDocument`, and the
  target lands as a **draft** because `id`-before-`en` still binds.

### Known gaps at this tag

- **Nothing here has been deployed.** Migration `0013` is committed and unapplied in production,
  which is the exact shape of the worst outage this project has had — `npm run build` runs the
  deploy migration first and fails rather than skipping, so the rail is there. **Everything
  v0.5.0 listed as undeployed is still undeployed**, including `ADMIN_EMAILS`,
  `LLM_CALLS_RETENTION_DAYS` and the five kill switches.
- **The four launch rows keep their old hero `alt` until `blog-import.ts` is re-run.** Deriving
  on **write** keeps the column populated and needed no migration; a row written before this and
  never re-saved renders its stored alt. Deriving on **read** would fix it everywhere and would
  cost `blogRow.ts` its purity, and that module is A6-35's byte-identity oracle.
- **`validateAdvice` refuses shape, not truth, and one live run proves what that costs.** The
  model wrote *"Kartu Arcana Major"*, reversing *Major Arcana* — card **names** are protected by
  a prompt rule and by the `card-names` lint, and Major Arcana is a **term** neither covered. It
  is now forbidden by name in the prompt, and **the honest instrument is still somebody reading
  the preview.**
- **The `.content` textarea is unmeasured on a phone**, and so is `/account`'s answer sheet. A
  `textarea` with the keyboard up is geometry WSL cannot answer.
- **`flagCoverage.test.ts`'s admin-only exemption now has three members and is owed a class
  switch.** The debt has a trigger: **the fourth admin-only call site must bring one
  `ADMIN_MODEL_CALLS_ENABLED` and collapse all three entries into it.**
- **`src/content/blog/**` is still committed and is still no longer the source.** The deletion
  is gated on the import having run in production; until then two representations of four
  articles exist, and the rows are the one that renders.
- **Nobody has read the whole dashboard on a screen**, and the insight boxes were checked at
  1440px only. Loop 6 has still not run on anything: the iOS standalone Google sign-in remains
  the largest unverified risk in the project, no public content route is cached in production so
  all eight `next.config.ts` content entries remain inert, and the Google consent screen is
  still in **Testing** mode.
- **`npm run test:all` still fails ~12–22 of V9's limiter tests** — the harness race on the one
  shared `serverless-redis-http`, not a regression. `npm test` passes **3016** and
  `npm run test:integration` passes **503**; run the two projects separately for a true answer.

## [v0.5.0] - 2026-07-30

Six workstreams (A1–A6) planned in `PUBLIC_RELEASE_ROADMAP_v0.5.0.md`, reconciled in
`docs/plans/2026-07-30-RECONCILIATION-v0.5.0.md` — which found **51 defects in the
roadmap it was reconciling**, nineteen of them verified against running code, and
**four that would have shipped** — plus five changes on 2026-07-30 that came from an
operator using the thing rather than from a plan.

**v0.4.0 built the surface a stranger can see. v0.5.0 builds the surface the operator
can see.** One `/admin` tree that no crawler, no querent and no signed-in user without
an allowlisted email may know exists: a signed-in non-admin gets the same **404** as a
typo, on every page and every API route.

**The thesis, and the one number that explains it: this application made nine distinct
LLM calls and recorded the token cost of exactly one of them.** `/api/reading` threaded
`usage` through `tee.ts` into `readings.token_input`/`token_output`; the moderation
classifier, the gist, the day summary, the frequency verdict, the Lotus distillation,
the persona and both translation paths each received a fully-populated `usage` object
from the adapter and destructured it away. **The provider layer was already correct** —
both adapters resolve `usage` on every exit path, including a consumer `break`. What was
missing was a table and eight reads. Until `llm_calls` existed there was no answer to
"what does a user cost", which is the question a public release starts asking every day.

**The second thesis: `LLM_API_KEY` is a fixed annual subscription sold for coding, not a
wallet, and there is no hard spend cap and never was.** `LLM_WINDOW_CALL_CEILING=280` is
a count, not a cost, and it is fleet-wide — so nobody could answer "which user burned the
window", "is consumption growing", or "when does the current trajectory hit the ceiling".
The risk is quota exhaustion, a denial of service against the querent with no billing
alert attached, and the comedown is worse: enforcement means key revocation, which takes
the whole app down at once. A trajectory chart with a stated band is the only early
warning this project can have.

**The third: prose that only a git commit can change is prose that does not get
written.** The two launch articles were authored by an agent in a worktree. The blog tab
exists so the next twenty are authored by a person in a browser — **and it holds the copy
lint while doing it**, because the lint is the reason the prose is data and a lint needs
exact strings.

**And the release's own lesson, which was in no plan: a provider fact this repository
asserts in prose and cannot re-run will rot, and one did for a whole release.** Twelve
places said *"z.ai reports `input_tokens: 0` and honours no caching"*. Both halves were
false. The request that uncovered it was for a client-side tokenizer to estimate the
numbers — a workaround for a premise that four `fetch` calls disproved before a line of
it was written.

2835 unit tests across 155 files; 478 integration tests across 35. Four migrations on
top of v0.4.0's eight, taking the schema from thirteen tables to **seventeen**. **No new
dependency** — the entire chart system is hand-rolled.

### Added

- **`/admin`, invisible rather than protected (A1).** `src/lib/admin/allowlist.ts` is a
  **zero-import leaf** (the parse and a constant-time compare) and
  `src/lib/admin/identity.ts` holds `requireAdmin` / `requireAdminPage` /
  `adminNotFound`. **One file cannot hold both**, because `requireAdmin()` →
  `currentUser()` → `auth.ts` → `NextAuth()` at module scope → `@/lib/db/client` →
  `import 'server-only'`, which throws under Vitest — the `origin.ts` / `keys.ts` /
  `lines.ts` precedent. Identity is `ADMIN_EMAILS`, a list: **no column, no claim, no
  role model**, and an empty value admits nobody. `/admin` carries `noindex`, is in no
  sitemap, and `contentAlternates('/admin')` throws.
- **`admin_access_log` (migration `0009`), and the ordering that makes a reveal fail
  when its audit row cannot be written.** `recordAdminAccess()` is the one write in this
  release that **must not swallow** (R30): it throws, and `src/lib/admin/reveal.ts`
  writes the row *before* responding, so an audit failure costs the reveal rather than
  producing an unlogged read of the most sensitive string in the product.
- **`llm_calls` (migration `0010`) — fifteen columns, five indexes, no `updated_at`, and
  one row per model call (A2).** Nine closed `op` values — `reading`, `moderation`,
  `gist`, `day_summary`, `frequency`, `lotus`, `persona`, `translation`,
  `translation_repair` — with `op` **required** on `CompleteOpts`, so a tenth call site
  cannot ship unattributed. `metered()` records the six buffered sites at one chokepoint
  with no caller edits; the three streaming sites are threaded by hand.
  `callClass.test.ts` asserts the `op` at all nine, in both directions.
- **`src/lib/llm/prices.ts` — PURE, zero imports, hand-maintained, with a 365-day
  tripwire.** Tokens are stored and **cost is computed at read time** from a committed,
  versioned table, so a price change never rewrites history. `NOTIONAL_MODEL` is `null`
  today and an unknown model prices `null`, never zero.
- **The aggregation layer, and it renders nothing (A3).** `src/lib/analytics/series.ts`
  (PURE, zero imports: bucket keys, day enumeration, zero-fill, `MAX_RANGE_DAYS`),
  `forecast.ts` (PURE: OLS, a T95 residual band, `crossing()`, `MIN_FORECAST_DAYS = 14`),
  and `rollup.ts` for the pure folds — **which live outside `queries/**` because
  `queries/contract.test.ts` enforces handle-first on every export there and a pure fold
  has no handle** (R22; the same wall W3 hit with the Lotus cache and W5 with
  `windowBounds`). Then `queries/admin/{metrics,users,rollup,timeout}.ts`: ten fleet-wide
  metrics, per-user aggregates, and one eight-statement composite so the page that wakes
  a suspended Neon compute does it once.
- **`withAdminRead` — every admin read runs in a read-only transaction**, in
  `queries/admin/timeout.ts`, with its own savepoint (see *Fixed*).
- **A chart system with no charting library and no new dependency (A4).**
  `src/theme/chart.ts` (PURE, one import so two identities are compiler-enforced:
  `CHART_SURFACE === color.bgRadial[1]` and `DIVERGING.mid === color.label`), the
  `tokens.css` mirror, `chart.palette.test.ts`, and `src/components/chart/**` —
  fourteen files, **exactly one `'use client'`**. The architecture is the decision
  everything falls out of: **paths and polygons in SVG, everything with an intrinsic
  size in HTML/CSS**, because a uniformly-scaled `viewBox` scales the things whose
  specification *is* a pixel count — an 11px tick renders at 14–23px, a 24px bar cap
  becomes 31–50px, and **there is no `vector-effect` for a radius**. So `tickPx` is one
  constant, and loop 4 measures it as `[11]` at 320, 360, 390 and 1200.
- **`/admin` and `/admin/tokens`** — the KPI row, the hero figure, the trajectory with
  its band, per-op and per-model breakdowns, a fuel gauge against the rolling five-hour
  ceiling, and a cache-hit rate. **Every chart has a table view, every ≥2-series chart
  has a legend and no 1-series chart does, and colour follows the entity under
  filtering** rather than the slot. `RangeFilter` is a **server** `<form method="get">`:
  a range change is a navigation.
- **`/admin/users` and `/admin/users/[id]` — fourteen sections holding everything (A5).**
  Identity, facts, the six answers, the Lotus, the persona, readings with their cards and
  their generation cost, summaries, verdicts, translations, share links, the moderation
  history, the event stream, and the subject's own access log. Four audited API routes,
  including `GET /api/admin/users/[id]/reading/[readingId]` — **`resource =
  'reading_body'` was declared with no route that could ever write it, and a dead audit
  value reads as a capability that exists** (R28).
- **`AdminReadingDetail`, which is deliberately not `ReadingView` (R27).** The admin page
  needs `status`, `model`, `prompt_version`, tokens, `total_ms`, `session_id` and
  `shared_at`, and **adding any of those to `ReadingViewProps` puts operator-only fields
  on the component that renders `/s/<slug>` to strangers** — a props type carrying
  `session_id` is one spread away from a public RSC payload. It keeps the two rules worth
  keeping: `lang` on the body, none on `choice`, and cards assigned into a sparse array
  by `position`.
- **A blog CMS: `blog_posts` + `blog_post_locales` (migration `0011`), a structured block
  editor, and `/admin/blog/**` (A6).** Create, edit, publish and unpublish an article
  without a deploy. `src/lib/content/lint.ts` is PURE with **three** callers, not the
  two the roadmap costed (R43) — the Malay list runs against the `id` half only and the
  English tic list against the `en` half only, because **running the Malay words against
  English is theatre**. A zod body schema guards the `Block` union, `link.path` with an
  `/en/` prefix is refused on save, and `scripts/blog-import.ts` (`npm run blog:import`)
  moves the four committed documents in.
- **An auto-translate button on the editor that fills the form and stores nothing.** It
  is in tension with `## Localization` rule 3 — the English is rewritten, not translated
  — and **what resolves it is where the output goes**: `POST /api/admin/blog` is still
  the only writer, so machine output passes the same parse, the same lint and the same
  resolution as a hand-typed save. **The model never sees the structure**, so it cannot
  invent a sixth kind, drop a `heading.id` or translate a `link.path`: the document is
  flattened to a numbered list of human-readable strings and rebuilt positionally, and
  `parseSegments` reads the **declared** number, so a dropped segment is a hole and
  therefore a refusal. The round trip is the test —
  `applySegments(doc, extractSegments(doc))` deep-equals `doc` on every shape the union
  can take and on all four committed articles.
- **Five model-call kill switches, in `src/lib/llm/flags.ts` (a LEAF: env only, zero
  imports).** `GIST_ENABLED`, `FREQUENCY_VERDICT_ENABLED`, `DAILY_SUMMARY_ENABLED`,
  `PERSONA_GENERATION_ENABLED`, `LOTUS_GENERATION_ENABLED`, all on
  `ANALYTICS_ENABLED`'s rule: only the literal `'0'` disables, so a typo cannot switch a
  feature off by accident. **Every flag gates the model call, never the cached read** —
  off means *write nothing new*, never *hide what exists*. `docs/DEPLOY-VERCEL.md` §2d
  is the runbook and orders them by what to reach for first.
- **`ScrollTop` and a folder-tab admin nav**, plus `npm run probe:usage` — four live
  calls answering what the provider actually reports about tokens — and
  `tools/admin/probe.sh`, the three-identity gate probe.
- **`/privacy` gains clauses 3.1 and 8.1 in both locales**, written last, from the
  shipped code: one key per request, no bulk read, no export, the audit row that gates
  the reveal, and that a question which was *refused* can be read too.

### Changed

- **`SESSION_TTL_HOURS` 24 → 168, and the sign-in control moved onto `/`.** Miftah
  reported that a signed-in visitor met the landing page instead of the reader picker.
  **The routing was correct and had been since S-D5** — verified live with a real Auth.js
  JWE, which renders the picker — and four other hypotheses died on measurement: CDN
  caching, the two NextAuth instances disagreeing, the `__Secure-` prefix, and cookie
  chunking. What he hit was **the 24-hour idle timeout, and S-D5 changed what expiry
  looks like**: it used to be a `/login` form one tap from restored, and it is now a page
  addressed to a stranger. So seven days, and `SignInForm` on `/` and `/login` rather
  than a link between them — **one owner, because it owns the consent line** and a second
  copy is how two surfaces end up naming different documents. The absolute 30-day cap
  did not move, and `ttl.ts`'s header now records the three things the wider window
  widens: a stolen cookie, **admin revocation** (`requireAdmin()` reads the session
  token, not `users.deleted_at`), and erasure on a second device.
- **`readings.token_input` / `token_output` stay, and `llm_calls` is the ledger beside
  them** (A-D17). Two mechanisms, no third, and `tokenLedgerDrift` compares them with
  `IS DISTINCT FROM` — **`!=` can never fail against a NULL**, which is the state that
  matters (R15).
- **The closed event taxonomy grows 67 → 70**, A1 owning it for this release, and
  `admin.page_viewed` reports a **template name from a closed list**, never a resolved
  path: a uuid in `events.props` on `/admin/users/<uuid>` would outlive that subject's
  erasure (R32). `usePathname()` is banned across the whole `/admin` tree and
  `adminSurface.test.ts` enforces it, so each page names its own tab one line from where
  it already names its own template.
- **Admin copy is Indonesian, hardcoded, and never in the i18n catalog** (A-D12), with
  ~150 strings in `src/app/admin/users/copy.ts` alone. The rule stands on the grep
  (R33): nothing under `/admin` may call `t()`, and two fences assert it by name so they
  cannot disagree about one rule.
- **The four admin nav pages lost their `<h1>` to the tab row — hidden, not deleted.**
  Every one was a character-for-character copy of its own nav label, so each page said
  its name twice and marked it zero times. The separating hairline detours up and around
  the active tab, the titles are `srOnly` because a page with no level-1 heading leaves a
  screen-reader operator with no *where am I*, and `aria-current="page"` is the other
  half of the highlight. Where a title said something a tab cannot — the subject's email,
  the blog slug, *Tulisan baru* — it is demoted to a line rather than hidden.
- **`sitemap.ts` stops being a full leaf, and exactly one half of the rule bent** (R39,
  the roadmap's largest single omission: A-D15 made this file's contents a query result
  while a committed test forbade the import that would make it one). *Must not acquire
  the message catalog, the auth stack or the share subsystem* is **fully intact**; *must
  never 500* is now **preserved by a catch rather than by an absence**. There is exactly
  one database import, named in the test's allowlist, so a second one fails. The
  asymmetry with the pages is the point: **an outage costs the blog rows and never the
  file**, while `/blog/<slug>` lets a driver error propagate, because a 404 on an
  indexable URL is a de-indexing event and a 500 is a retry.
- **`ReadingUsage.inputTokens` is the total, cache reads included**, and
  `cachedInputTokens` is a breakdown of it, never a sibling to add. **The two wire
  formats are opposite and each adapter converts itself**: Anthropic's `input_tokens`
  excludes cache reads and is summed, OpenAI's `prompt_tokens` includes them and must
  not be. Both directions carry a named negative control in the unit tests — the OpenAI
  one expects `1000`, not `1800`, and is what fails when somebody later makes the
  adapters "consistent".
- **`llm_calls.cache_read_tokens` has three meaningful states** (migration `0012`): NULL
  (nothing reported), `0` (reported, nothing cached — **a measurement**) and `> 0` (a
  hit). The cache-hit rate is rated over `sum(input_tokens) filter (where
  cache_read_tokens is not null)` and never over total input; deleting the filter clause
  fails the integration test with `expected 6000 to be 1000`.
- **`npm run smoke` and `npm run probe:moderation` now set `ANALYTICS_ENABLED=0`**, so a
  smoke run cannot write ledger rows into whatever database the shell happens to point
  at.
- **The five kill switches are `1` in Production and Preview, set rather than left
  unset** — a switch nobody can find is not a switch — and `1` rather than `true`,
  because only `'0'` disables and a row reading `true` invites `false`, which does
  nothing and reports nothing. **Vercel injects at build time**, so a `0` does not reach
  a lambda that is already running: save, then redeploy.
- **`CLAUDE.md` grew 102k → 109k** and stayed under the 150k ceiling by its own
  convention: the rules and the invariants here, the evidence and the measurements in
  `docs/workstream-notes.md`, which gained six workstream sections and three postmortems.
- **`resetDb()`'s TRUNCATE list learned the four new tables** (R7 — §6 omitted it), and
  `llm_calls` joined the nightly sweep with a 400-day retention, `LLM_CALLS_RETENTION_DAYS`.
  **The binding input is Neon's 0.5 GB, not the row rate** (R19).

### Fixed

- **`input_tokens` were on the wire the whole time, in an event the adapter had already
  opened.** `anthropic.ts` read them from `message_start`, where `usage` is a placeholder
  sent *before the prompt has been counted* and is always `{input_tokens: 0,
  output_tokens: 0}`; the real figures arrive in the final `message_delta` — the event
  the adapter already parsed to read `output_tokens` from. Measured on `glm-4.6`: a fresh
  prompt reports 1935/0 cached, the same prompt re-sent reports 15 with 1920 cached, and
  `15 + 1920 = 1935`. **z.ai honours prompt caching**, which three files and CLAUDE.md
  denied, and there is a minimum cacheable length — an 81-token prompt caches nothing.
  **The buffered path was never broken**, which is why this survived a release: half the
  ledger looked plausible, so the other half read as a provider limitation rather than as
  a defect. The refutation was even in the notes — W4's own entry said *"the buffered
  path does report input tokens — variably"* — written down and never followed up.
- **`admin_access_log.admin_user_id` was `NOT NULL` with an `on delete set null` FK, and
  that combination aborts the hard delete of any user an admin had ever read about**
  (R3). `/privacy` clause 8's erasure promise failing for exactly the population most
  likely to invoke it, visible only in a cron log. Reproduced on a scratch table against
  the real Postgres 16: **the `23502` names the audit table and its column, never the
  `delete from users` that triggered it** — the general shape being that an
  `ON DELETE SET NULL` cascade reports the constraint it violated, never the delete
  behind it. Both FK columns are nullable now, and the first two cases in
  `audit.integration.test.ts` fail against the roadmap's literal schema.
- **The chart palette was validated against a surface `Backdrop` does not paint** (R8,
  the release's closest call). `#a3423a` measures **2.66:1** against the `#221a3a` at the
  top of the viewport versus **3.04:1** on an opaque panel — below the 3:1 mark floor —
  and a test written from the roadmap's §5 would have been green. The chart panel paints
  `CHART_SURFACE` **opaquely** now, and that is an invariant with the identity
  compiler-enforced.
- **`defer()` from inside a deferred job was silently orphaned, and it would have voided
  a third of the ledger** (R17). `drain()` does `store.deferred.splice(0)` and then
  iterates the spliced copy; `gist`, `translation_repair` and `frequency` all run there,
  so **three of nine ops would have recorded nothing, with a green suite**. A2 owns its
  own buffer, flushed *after* the deferred loop.
- **`getUserById` filters `isNull(deleted_at)`, so a soft-deleted user was invisible on
  the admin page that exists to show them** (R29) — and the 30-day restore window would
  have been invisible with it, as a 404 that reads like a bad id.
  `adminUserById`/`adminUserList` do not filter, and a soft-deleted user is visible **and
  labelled**.
- **`postgres.js` never issues `RELEASE SAVEPOINT`, and that made `withAdminRead` leak.**
  Its `scope()` emits `savepoint sN` and, on the error path only, `rollback to sN` — on
  success it simply returns. So a `SET LOCAL` made inside a nested Drizzle transaction
  persisted to the end of the *outer* one, and the integration suite is one big
  rolled-back transaction: it went read-only after its first admin read and failed with
  `cannot execute INSERT in a read-only transaction` on a line nowhere near this file,
  naming no cause. A psql check said the opposite **because the `RELEASE` was written by
  hand, which is exactly what the driver does not do** — *a savepoint experiment in psql
  does not model this driver's nested transactions.* It cannot be undone by setting the
  GUC back either: that raises an error and **aborts the transaction**, which is worse
  than the leak. `withAdminRead` opens and releases its own savepoint, with a regression
  test named for the outcome.
- **`/admin` rendered a TTFT number under a label reading *"Total waktu panggilan, bukan
  waktu ke token pertama."*** A3 shipped both halves of the seam and took real trouble
  over them — two functions, neither called `latency`, each with the warning in its
  header, plus a test forbidding one chart from plotting both — and then `ServiceShare`'s
  table borrowed the total-duration tile's copy as the header for `rollup.ttft`'s p95.
  **Every test passed and no test could have failed:** a label and the provenance of the
  number beneath it are not comparable by grep. Found by reading the code with the
  question *"which query does this number come from"*. `ttftByService` grew
  `group by rollup (service_id)` so the fleet percentile and the three service
  percentiles come from one predicate — and **`rollup` returns the grand total for an
  empty input where a plain `group by` returns no rows**, measured before a line was
  written, so the naive version would have grown a phantom fleet row on any range with no
  readings.
- **`nonZero()` was not applied on the buffered path**, so a reported zero and an
  unreported count were the same row (R16). Two lines in `anthropic.ts`, and A-D17's
  consistency check depended on it.
- **`blog.contract.test.ts` failed on the correct implementation** (R40), and
  `generateStaticParams` + `dynamicParams = false` had to go with the file source (R41).
  **Publishing `en` first was a 500 on a sitemapped URL** — A-D15 named the unpublish
  direction and missed its opposite (R42) — and `ContentLocaleLink` linked
  `/en/blog/<slug>` unconditionally, whether or not an English row existed (R45).
- **Four `jsonb` round-trip hashes differed on documents nothing had touched.** Postgres
  parses `jsonb`, **normalises object key order** (by key length, then bytewise), drops
  duplicates and canonicalises numbers, so `JSON.stringify(row.body)` is a different
  *string* from `JSON.stringify(doc.body)` while being the same *value*. Deep equality
  holds on all four. This is why the transform's oracle is a unit test with no database
  on its path and the row-level one is `toEqual` — the hash is the obvious thing to reach
  for and it is wrong.
- **The up-arrow's threshold was unreachable on the page whose scrolling was the
  report.** At 1440×1200 `/admin/users/[id]` is 2774px tall, so its maximum `scrollY` is
  ~1717 and the 1800 that "1.5 screens" demands never arrives. One viewport now, which
  still keeps the button off a short form — and `ScrollTop` reads `data-still` itself,
  because **a JS `scrollTo({ behavior })` overrides CSS `scroll-behavior`** rather than
  defaulting from it, exactly as `SwipeDeck.module.css` predicted by name.
- **Auto-translate's confirmation fired on an empty form**, because `formHasContent`
  looked for letters in stripped JSON and a new empty paragraph's remaining `"text"`
  *keys* are letters — **a dialog that always fires is the one people click through**,
  which is the opposite of the ask. It uses `extractSegments` now. The heading also read
  *"dari bahasa Inggris"* on the English tab, and `Batal` had no CSS rule at all, so a
  cancel that did not look pressable made a confirmation with one option.
- **`tools/e2e/run.sh whoami` reported "signed IN" while driving production, from a
  cookie scoped to `localhost`.** It matched `authjs.session-token` across every domain
  with no origin filter, and it cost the session investigation its first wrong turn. It
  is origin-scoped now and names the domain.
- **Three admin-nav rendering defects invisible at a glance**, found with an 8× crop of
  real 1× pixels: `position: absolute` insets resolve against the **padding** box, so
  every rule slice fell 1px short at both ends and the hairline was broken between every
  pair of tabs; each fillet landed beside a tab's border instead of on it; and the rule
  stopped dead after the last tab.

### Removed

- **`AUTH_USERS` is deleted from Vercel.** Checked before deleting: its only reader is
  inside the `DEV_PASSWORD_LOGIN`-gated provider, already wrapped in a `try`/`catch` that
  returns `null`, so its absence cannot reach production.
- **`/api/admin/metrics/[metric]` is deleted from the route table** (R21) — never built,
  and a route in a table nobody implements reads as a capability.
- **`generateStaticParams` and `dynamicParams = false` on `/blog/[slug]`**, and nothing
  is lost (R41): the rows are the source now, and a draft's URL must 404 rather than
  resolve from a build-time list.
- **The disclaimer under *About You*.** `common.disclaimer.short` stays in the catalog —
  five other surfaces render it — and only the account page's copy goes, with the
  `.disclaimer` rule that had exactly one consumer. The invariant is *under every reading
  and on both pickers*, and `/account` crosses neither.
- **`llm_calls.status` is four values; `'refused'` is struck** (R4), and there is no
  `updated_at` on a fact table.
- **No tokenizer, and no backfill.** Every streamed row before 2026-07-30 keeps NULL
  input tokens: that is the honest record of when this app started measuring.

### Security

- **`/admin` answers 404 to a non-admin, never 403** (A-D2). A 403 confirms the surface
  exists; a 404 does not — **and a 405 confirms it just as surely**, which is why all six
  admin API routes were closed against the wrong-method leak that A6 found on them.
- **Full PII access, one key per request, every reveal audited** (A-D16). Nothing bulk:
  no CSV, no JSON dump, no *download all users*. The list payload carries **no `body`,
  no `gist` and no decrypted answer**, asserted on the returned object (`'body' in item`
  is false, the V6 precedent), and the binding reason is VD8 rather than bytes.
  `queries/admin/moderation.ts` is **the one decrypt site** for
  `moderation_flags.question`, redacted flags render as redacted, and no path un-redacts.
- **`/admin` is not a write surface over querent data.** An admin may not edit a reading,
  a profile, an answer or a persona: there is no honest UI for *we changed what you
  said*, and the `input_hash` mechanisms behind the Lotus and the persona would silently
  disagree with the rows they were built from. The only admin writes are blog rows and
  the audit log.
- **`/privacy` needed five clauses amended, not the two A-D16 named** (R31), and each of
  the three it missed is a sentence a reader would call a lie: clause 4's *"three
  parties, and no others"*, clause 5's honest-limit paragraph — there is now a second
  limit, and that is the worst place to omit one — and clause 6's retention list, which
  had no row for a table the sweep is forbidden to touch, so its honest row reads *kept
  indefinitely*. **No anchor was renumbered**: `/privacy` §4.4 is cited by name in
  `middleware.ts`, and `legal.test.ts`'s pre-existing anchor-set equality is what makes
  "both locales" mechanical.
- **`ADMIN_EMAILS` is Production-only and must not be set on Preview** (R37) — a ruling
  nobody had made. Preview serves `/admin` over production data.
- **The reading and the translation get no kill switch, and `flagCoverage.test.ts`
  asserts the absence by name** — plus that the set of model call sites is **exactly** its
  two tables, so a tenth site cannot quietly ship unswitchable. A reading is the product
  and a translation is the bug V2 exists to prevent; the honest tool there is a
  maintenance page. The moderation classifier is exempt for the opposite reason: it
  already has `MODERATION_CLASSIFIER_ENABLED`, in `gate.ts`, named there so it cannot
  read as *moderation off*.
- **`LOTUS_GENERATION_ENABLED=0` writes nothing; `PERSONA_GENERATION_ENABLED=0` stores
  the template. The asymmetry is a fact about the two hashes and must not be "tidied".**
  `lotusInputHash` is the birth year plus the six answers and **never moves again**, so a
  stored fallback matches its own hash forever — every querent who onboarded during the
  outage would feed a template into every reading they ever take, after the flag went
  back to `1`, silently. `personaInputHash` ends with `readings:<ids>`, so it moves on the
  next reading and heals, and it must write because `/api/persona`'s no-row branch 500s
  otherwise. Persona also **never overwrites an existing paragraph**, which is the whole
  difference between a kill switch and a data-degrading one.
- **`reason: 'disabled'` is not `'unchanged'`, and `persona.generated` stays silent for
  it** — the `drift` branch calls the generator on every `/account` view, so emitting the
  event would inflate exactly the metric an operator scans to confirm the flag worked.
- **The audit trail records the admin, the subject, the resource and the time, and both
  FK columns are nullable** so neither party's erasure can be blocked by it.

### Known gaps at this tag

- **Nothing here has been deployed.** Four migrations, three of them new tables, are
  committed and unapplied in production — which is the exact shape of the worst outage
  this project has had. `npm run build` runs the deploy migration first and fails rather
  than skipping, so the rail is there; **`ADMIN_EMAILS` and `LLM_CALLS_RETENTION_DAYS`
  still have to be set, and the five switches redeployed to take effect.**
- **`src/content/blog/**` is still committed and is no longer the source.** Task 26 is
  deliberately not done: the plan gates the deletion on the import having run in
  production. Until then two representations of four articles exist, and the rows are the
  one that renders.
- **Nobody has read this dashboard on a screen** — §0.5 of the roadmap, undischarged, and
  R8 is the evidence that a surface question cannot be answered from a plan. Loop 3 at
  1440px ran for the nav and the up-arrow; it has not run over the whole overview.
- **`drain()`'s orphaning is worked around, not fixed** (R17). The next `defer()` from
  inside a deferred job hits it.
- **The audit trail has deliberately no `resource` value for the user LIST page.** Fifty
  audit rows per page load would make the audit panel unreadable, so a list view writes
  none — **recorded as a stated gap for subject-access answers**, and it is the one place
  this release's audit is incomplete on purpose.
- **A per-reading total cost including moderation is not answerable** (R51). The
  classifier runs *before* the `readings` row exists, so it can never carry a
  `reading_id`; the figure on the page is *biaya generasi*, and it says so.
- **`llm_calls` retention is a calculation, not a measurement** (R19) — 400 days at
  ~1,000 calls/day is ~180 MB of a 0.5 GB plan. Revisit at 100 MB. The `readings`
  fleet-wide `local_date` index is **declared and unbuilt** (R24), the weekday × hour
  heatmap's Jakarta-pinned axis is a **labelled approximation** (R12), and two calendar
  systems in one bucket are stated on screen rather than reconciled (R25).
- **`/api/memory/summary` may be losing `memory.summary_generated` today** (R18).
  Pre-existing, W5's, and not A2's to fix.
- **Everything v0.4.0 left open is still open**, and the two that matter most are
  unchanged: **signing in with Google from a home-screen installed instance** is still
  the largest unverified risk in the project, and **no public content route is cached in
  production**, so all eight `next.config.ts` content entries remain inert. The Google
  consent screen is still in Testing mode; the branding blocker stays closed.
- **`npm run test:all` still fails ~12–22 of V9's limiter tests** — a harness race on the
  one shared `serverless-redis-http`, not a regression. `npm test` passes 2835 and
  `npm run test:integration` passes 478; run the two projects separately for a true
  answer.

## [v0.4.0] - 2026-07-29

Six workstreams (S1–S6) planned in `PUBLIC_RELEASE_ROADMAP_v0.4.0.md`, reconciled
in `docs/plans/2026-07-28-RECONCILIATION-v0.4.0.md` — which found **six defects in
the roadmap it was reconciling** — and merged in dependency order across 106 tasks,
plus a two-part change on 2026-07-29 that came from reading real output rather than
from a plan.

**The thesis: before this release a search engine could see three pages of this
application and one of them was a login form.** `/` was a 302 to `/login` for
anybody without a cookie, and the two legal documents carried `noindex`. Everything
worth reading — the deck, the readers, the craft — was behind a gate. Six
workstreams built the indexable surface: the gate change and a signed-out homepage,
`/en/` as a middleware rewrite, 22 card lore pages from 44 authored documents, the
gallery, 44 wallpaper derivatives and two blog articles. **54 indexable pages
where there were three.**

**The second thesis: two languages cannot occupy one address in a search index.**
D6 said locale is never a URL segment and it was right for the nine app routes; it
is wrong for content, so `/gallery` is Indonesian and `/en/gallery` is English,
reached by a middleware **rewrite** rather than a route segment, so there is still
one route tree. That is an amendment, not an oversight — and a stripping bug making
the gated app reachable under `/en/` is the worst outcome this release had
available, which is why there is a test named for it.

**The third: the closed OAuth branding blocker.** Google's consent screen needs an
app homepage that is not a login page. Signed out, `/` now renders a landing page.

2130 unit tests across 123 files; 252 integration tests across 16. One migration on
top of v0.3.0's seven — a **column**, `readings.choice`, and no new table.

### Added

- **The public surface and the technical SEO foundation (S1).** `src/lib/seo/` —
  `origin.ts` is the **origin leaf**: env only, zero imports, and `shareOrigin()`
  delegates to it so the two cannot disagree. `jsonld.ts` holds pure builders and
  `JsonLd.tsx` is the **one `ld+json` mount in the app**, with a plain text child
  plus `serializeJsonLd` pre-escaping `& < >` — not for correctness, but because
  React's escaping of a `<script>` text child is an unspecified implementation
  detail and a release must not depend on one. `sitemap.ts` and `robots.ts` are
  leaves; `/terms` and `/privacy` become indexable (R4); `metadataBase` lands, and
  the secrets tripwire learns its first `NEXT_PUBLIC_` variable.
  `PublicShell.tsx` is the chrome, `PublicShare.tsx` the share control (S-D8),
  and `PublicPageViewed.tsx` reports a referrer no server component could know.
- **A signed-out landing page, and `/` dual-renders by session (S-D5).** No
  session read, no database, no model call on the signed-out arm. **`'/'` is
  deliberately NOT in `isPublic()`** — that function short-circuits `decide()`
  *above* the onboarding check, so the allowlist would land a half-onboarded
  querent on a picker that assumes a completed `profiles` row. The clause is
  `!signedIn && pathname === '/'`, below the public check.
- **Locale-addressable public content (S2).** `src/lib/i18n/prefix.ts` — the
  `/en/` parser, the content route table and `contentRewrite()` — **edge-safe,
  with no `server-only`, no `next/*` and no `process.env`**, because `gate.ts`
  imports it. The rewrite runs **before** the D6 chain and before the gate
  (contract G1), pins the locale into `x-jmt-locale` and writes **no cookie**, so
  a cookie, an `Accept-Language` and `?lang=` are all inert on a content route —
  measured, in every `NODE_ENV`. `contentAlternates()` is the **only** way to emit
  a canonical or an `hreflang` in this codebase, it takes the locales that
  actually exist rather than `LOCALES`, and it throws on a prefixed path, on a
  non-content path and on a canonical for a locale with no document, because a
  wrong canonical de-indexes the correct page and nothing reports it.
  `sitemapLanguages()` is the same function, so the two sets cannot disagree.
  `ContentLocaleLink.tsx` is a server-rendered `<a href>` to the sibling URL —
  on a content route the URL is the only input, so the switcher is a **link**.
- **22 card lore pages, from 44 authored documents (S4).** `/arcana/<slug>` in
  both trees: the fact strip, the upright and reversed readings, the
  correspondences, and `Article` + `ImageObject` + `BreadcrumbList` structured
  data. `src/content/types.ts` holds the block union and `LoreDoc`;
  `src/components/Prose.tsx` is the **one block renderer**, server-side and
  exhaustive; `src/lib/arcana/correspondence.ts` bridges the glyph attributions to
  V1's engine; `cardUrlSlug` / `cardByUrlSlug` are asserted against roadmap §3.2.
  **Prose is data, not TSX, because the copy lint needs strings** — in a `.tsx`
  document a sentence splits across text nodes at `{' '}`, punctuation arrives as
  `&ldquo;`, and `\btempoh\b` can straddle a JSX boundary and never match.
  `doc.yesno` is asserted against `effectiveYesNo()`, because the reversal flip is
  counter-intuitive — The Moon and The Hermit both answer `no` upright — and a
  writer following the artwork gets it backwards.
- **`/arcana` is public though its page only calls `notFound()`.** It is the
  parent of 22 indexed URLs and Google reads a login redirect on a content path as
  a soft 404, so its 404 has to be a real one. **The file existing is the ruling
  (R6)**; the negative controls are `/arcanax` and `/arcana-foo`.
- **The Gallery (S3).** A 2×11 grid of all 22 Majors at `/gallery`, every card
  upright, with a zoom sheet that **labels both glosses** — an unlabelled pair
  under upright art is exactly the contradiction `cardMeaning()` exists to
  prevent. The 22 lore hrefs are built on the server and each tile is
  `prefetch={false}`. `galleryAlt` is its own module with its own test;
  `CardFace` takes an alt override; `CardDetail` gains both glosses and a
  `children` slot. Measured at 320/360/375/390 in both locales, negative-controlled.
- **44 HQ wallpapers, committed (S5).** 22 × { 1024×1536 card, 1440×3120 phone },
  JPEG q90 4:4:4, 23.77MB, from `tools/make_wallpapers.py`; `src/lib/wallpaper.ts`
  is the asset contract and `WallpaperDownload.tsx` the control, mounted in the
  gallery. **The oracle was written before the wallpapers** —
  `tools/check_wallpapers.py` holds its own expectations and asserts colour with a
  **tolerance**, because JPEG quantization moves `#0a0812` by one unit and an
  oracle written with `==` fails on correct output, which is how a check gets
  deleted. **Nothing is upscaled or cropped**: `make_wallpapers.py` uses
  `normalize_cards.py`'s `fit_to_ratio` as an *assertion* and reads the untouched
  source pixels, because that helper would otherwise LANCZOS 1020 → 1024 (S-D9).
  **JPEG rather than WebP, deliberately** — the one thing a wallpaper must do is
  reach the iOS Photos library, and *Set Wallpaper* reads from nowhere else — with
  an `<a download>` anchor as the contract, `navigator.share` as an upgrade, and
  **no `content-disposition`** (W-D10), or the image cannot be *viewed*, which is
  the precondition for long-press → Add to Photos. T&C clause 9 grants the licence.
- **The blog (S6).** `/blog` and `/blog/[slug]` in both trees, `Blog` and
  `BlogPosting` nodes with the organisation as author, `src/lib/seo/blog.ts`, and
  two authored articles — *what tarot is* and *how to read tarot* — in
  `src/content/blog/**`. The `Block` union widened under R16 and `Prose` renders
  the article union; **`heading.id` and `list.ordered` are optional, and that is
  why 44 lore documents needed no edit.** The sitemap entries landed **after** the
  pages existed, which is the ordering rule rather than a coincidence (R9): a path
  in a sitemap with no page behind it is a 404 Search Console reports against the
  whole file.
- **`/account`'s six onboarding answers are readable and editable** (2026-07-29).
  Each row is one 44px button — question on the left, a tick or an empty circle —
  and tapping it opens a sheet holding the answer. **`worst_thing`'s plaintext
  leaves the server ONLY through `GET /api/onboarding/answer/<key>`: one key per
  request, `private, no-store`, and there must NEVER be a bulk variant**, because
  a six-answer read for a browser puts the most sensitive string in the product
  into the response to *opening a page*. Nothing is decrypted on a render path —
  `answerPresence` still reads the column's nullity. **L13 is what died** (*"the
  six are deletable and NOT editable"*): reconciliation §7.3 asked for the text
  not to be shown *until asked*, V8 made "asked" unreachable, and a tap on a
  question is asking.
- **A choice verdict: a question offering options gets answered with one of
  them** (2026-07-29), in the box the yes/no verdict already had. The report was a
  four-paragraph reading of *"mending makan ayam atau ikan nanti siang?"* that
  never said ayam or ikan. `src/lib/reading/choice.ts` is **pure** — no
  `server-only`, no `process.env` — because the marker crosses the wire and a
  server-side stream transform cannot work: the choice arrives long after the
  response headers, so a server that strips it cannot tell the client what it was.
  `Draw.tsx` strips incrementally, `/api/reading`'s `defer()` strips once over the
  finished body, **with the same function**, and `choice.test.ts` feeds one body in
  every possible split. **`validateChoice` returns a word-bounded SLICE of
  `readings.question`, never the model's copy** — which is why it returns a string
  rather than a boolean, since a caller handed `true` would render the model's
  text. `CHOICE_RULE_{ID,EN}` is in `daily` and `spread3` and **never `yesno`**,
  whose answer is already forced by `effectiveYesNo()`; `ReadingView` uses
  `else if` as the belt to that brace. Migration `0008` adds `readings.choice`.
- **`npm run smoke -- --all --choice`** — eighteen live readings all asking a
  two-option question, and **the only instrument for the marker's format.**
  `npm run wallpapers` joins the idempotent asset scripts.
- **Six committed measurement harnesses under `tools/seo/`** — `crawl.sh` (the
  signed-out crawl, which is the release's acceptance test), and `fit.sh`,
  `galleryfit.sh`, `wallpaperfit.sh`, `blogfit.sh`, `answersfit.sh` as loop-4
  instances: a fixed-width container plus `scrollWidth > clientWidth`, exact for
  container-driven layout, because **neither Chrome available here gives a real
  phone width** — both floor at ~500px.
- **`src/lib/analytics/referrer.ts`** — `referrerKind` becomes a leaf at its
  third caller.

### Changed

- **The gate opens the content surface.** `isPublic()` now admits `/gallery`,
  `/arcana/*`, `/blog/*` and their `/en/` twins — **and its content clause strips
  the prefix where the other clauses must not** (contract G2), because
  unconditional stripping would make `/en/api/events` public. `/en/history` is
  `false`, with a test named for the worst outcome available in this release.
- **`src/middleware.ts` gains an outer wrapper, and that is the only place the
  last two cookies could be removed.** See *Fixed*. `content.kind !==
  'passthrough'` is the whole fence: a signed-in visitor on `/` is `passthrough`,
  so stripping there would drop the `jmt_locale` sync D6 needs *and* the sliding
  session cookie on the busiest screen in the app, and `/login` and
  `/api/auth/*` being `passthrough` keeps the csrf token available to the sign-in
  POST. It costs the sliding refresh on content pages, deliberately: browsing
  public content is not app activity.
- **D6 is amended rather than overturned, and the amendment is narrow.** Locale is
  still never a URL segment for the nine app routes; inside the app
  `router.push('/en/...')` is still wrong and no `<Link>` is locale-aware.
  `/en/history` is not a route — it reaches `decide()` spelled as the request
  spelled it and matches nothing.
- **A slug is one bare path in both trees** — `what-tarot-is`, never a per-locale
  pair — because `contentAlternates()` derives the `/en/` twin from one path. Same
  ruling that kept `/history` from becoming `/jejak`.
- **The closed event taxonomy grows 61 → 66 in one edit, then 66 → 67 once**, and
  the second time the register was **revisited rather than the number bumped**:
  four names were drafted and one landed. `reading.choice_offered` became two
  *props* on `reading.completed` so numerator and denominator come out of one
  scan; two answer-write names became one `account.answer_changed` with a closed
  `action`; and `revealed` was dropped, because request volume in the platform log
  answers the privacy question and a look-and-close changes no decision. **Expect
  to fold rather than add.**
- **The message catalogs grow 242 → 337 keys.** `id.ts` still owns the key set and
  a missing English string is still a red typecheck.
- **Every reading is 30% shorter — ceilings AND floors** (Miftah's ruling: too
  long to read on a phone). `daily` 55 → 39 per paragraph, `spread3` 40 → 28,
  `yesno` 70 → 49, with the totals scaled to match, because scaling one end of a
  band narrows it rather than shortening it and would fail the smoke script on
  output that obeyed the prompt. The sentence counts came down with them.
  **`spread3` keeps four paragraphs** — dropping the synthesis would leave three
  unconnected card notes — and **`MAX_TOKENS` and `MARGARET_MULTIPLIER = 1.3` did
  not move**: the first is a runaway guard, and scaling the second would cut
  Margaret twice.
- **An answer edit now DEFERS the persona and keeps the Lotus eager, and the
  asymmetry is an erasure duty.** `lotus_avatars.summary` is read into **every
  reading prompt**, so deferring it would let a reading taken before the next
  `/account` visit still be generated from the answer just deleted, which
  `/privacy` clause 3 promises against twice in both locales. `personas.body` is
  read by `/account` alone, so it waits. One model call per edit instead of two.
  **A13's rule is intact and only its enforcement point moved**, to
  `personaStaleness`, via `max(onboarding_answers.updated_at) >
  personas.updated_at` — no schema delta.
- **The account menu grows from four items to six**, and `AccountMenu`'s header
  comment forbidding a fifth is **inverted rather than deleted** — it is still
  right about the case it was made for, which is a share control. `Galeri kartu`
  and `Tulisan` carry their own `account.menu.*` keys, never a reuse of
  `public.footer.*`.
- **`CLAUDE.md` was cut a second time, 167k → 94k**, by the same method as the
  first: the invariants stay, the evidence moves to `docs/workstream-notes.md`,
  and every compressed section's full prior text is preserved verbatim in that
  file's Part II. The file is loaded every session and rejected above 150k, so
  prose that argues rather than binds costs every future session its context.
- **Upstash has a Singapore region, and five places in this repository said it
  does not** and told the reader to use Tokyo. All corrected —
  `ap-southeast-1`, the same region as the functions (`sin1`) and as Neon, so
  every hop is intra-region.
- **`ReadingView` gains the choice box**, and `readings.choice` **rides on
  `include_question` in `publicReadingQuery`, in the same ternary**: it is a slice
  of the question, so a link excluding the question and selecting this column
  would publish a fragment of the excluded string through the one field that reads
  as a verdict rather than as user text. It is **never translated** — the one
  piece of reading chrome that does not follow `t` — and rendered with **no `lang`
  attribute**, matching the question block.

### Fixed

- **A public content response carried two cookies, and neither of them was ours.**
  `authjs.csrf-token` and `authjs.callback-url` are appended by the `auth()`
  wrapper around middleware **after** the handler returns, so no line inside that
  handler could have prevented them — which is why S-D10 read as satisfied while
  being false on **every public page**. The fix is an outer `middleware()` around
  the `auth()`-wrapped gate: the inner handler marks a content response with an
  internal header, the outer deletes every `Set-Cookie` and then the marker.
- **`sql<Date>` lied, and a green typecheck and a green unit suite could not see
  it.** `answersUpdatedAt` was written as `sql<Date | null>` over
  `max(timestamptz)`. Drizzle maps a timestamp to a `Date` when it knows the
  **column**; inside a raw `sql` template there is no mapper and postgres.js
  returns a **string**. `personaStaleness` compared that with `>` against a real
  `Date`, which coerces through `ToPrimitive` and answers *something* — so **every
  answer edit was judged wrongly**, invisibly, because the unit tests pass real
  `Date`s in, which is what the type claimed. Caught by an integration test
  calling `.getTime()`. The column is now typed `unknown` and converted by hand.
  The rule was already written one file over, on `readingsForDay`'s `hasBody`.
- **The choice box shipped the exact bug it was built to prevent, for one
  commit.** `validateChoice` guaranteed the box holds only the querent's own words
  — word-bounded, capped at 40 characters, sliced out of `readings.question`.
  Three of eighteen live readings answered the marker with a whole clause,
  `PILIHAN: makan ayam atau ikan nanti siang`, which passed every check because a
  clause from the question *is* a word-bounded substring of it and 32 characters
  is inside the cap. The guarantee was true and insufficient: it has to be one of
  the querent's **options**. `MULTI_OPTION` refuses a candidate containing
  `atau` / `apa` / `or` / `versus` or a comma, biased towards rejecting, because a
  false rejection costs the box and a false acceptance ships the report.
- **`/` and `/en` shared one canonical**, which is the de-indexing failure S-D15
  exists to prevent.
- **`/gallery` and `/arcana/<slug>` disagreed on two fields of a shared `@id`,
  twice, and both were found by reading the JSON off the wire with a green
  suite.** A shared `@id` makes a consumer **merge** the two nodes and pick one
  value for any duplicated field, silently. It broke on `url` and on `caption`.
  By field now: the lore page keeps `caption`, the gallery carries `description`,
  `url` is the image file on both, and `imageJoin.test.ts` imports S4's
  `arcanaGraph` **on purpose**, because its subject *is* the agreement between two
  owners.
- **`/wallpapers/*` shipped for one commit with `/cards/*`'s year of
  `immutable`**, reasoning carried over from content-hashed filenames to files
  that are not. It is one day plus a week of `stale-while-revalidate` now.
- **`referrer_kind` was the literal `'direct'` on two public surfaces.**
  `TrackView` cannot get it right — its props come from a server component, where
  `document.referrer` does not exist. `PublicPageViewed` is the fix and all three
  surfaces mount it.
- **Safari does not focus a `<button>` when it is tapped**, so
  `document.activeElement` on the way into `CardDetail` captured `<body>` on the
  one platform this app is built for, and restoring focus there dropped the
  querent at the top of the document. The opener is a prop (`returnFocusTo`) now.
  **Loop 5 can reproduce it** — a programmatic `.click()` does not focus a button
  either — which CLAUDE.md previously denied.
- **A loop-4 negative control was defeated exactly as `galleryfit`'s header warns
  it can be.** `min-width: 420px` injected at the top of `.question` lost the
  cascade to the block's closing `min-width: 0`, so `overflow` stayed false and
  the harness looked fine. `getComputedStyle` read `0px`. **A control that cannot
  fail is indistinguishable from a harness that cannot see.**
- **The public footer grew a link to itself** when `PublicShell`'s `LINKS` table
  was emptied rather than deleted, taking the filter with it.

### Removed

- **`PublicShell`'s `LINKS` table**, deleted rather than emptied. *Gallery* and
  *Writing* moved out of the public footer and into the account menu.
- **Six `account.answers.*` catalog keys** — `answered`, `empty`, `cleared`,
  `clear`, `clearing`, `clearAria`, `failed` — as the row became one button and
  the two state words moved into the icon's `aria-label`, because a glyph with no
  accessible name says nothing at all to a screen reader.
- **`arcana.upright` and `arcana.reversed`.** The two orientation words are
  `card.upright` and `card.reversed`, because three surfaces render them.
- **No `callout` block kind. S6 asked and R16 refused**, with
  `types.contract.test.ts` asserting the absence, because the failure mode of a
  refused ask is somebody granting it quietly.

### Security

- **A stranger on a public content page now leaves with an empty cookie jar.** See
  *Fixed* — and note that `wallpapers/`, `cards/` and `dukuns/` are excluded in
  the **middleware matcher** and must never be "fixed" in `isPublic()` instead
  (R7): both give a 200, but only the matcher stops middleware running, and
  middleware running means a `Set-Cookie` on a ~550KB static response.
- **The most sensitive string in the product has exactly one exit.**
  `worst_thing`'s plaintext leaves the server only through
  `GET /api/onboarding/answer/<key>` — one key per request, `private, no-store`,
  no bulk variant — and `queries/onboarding.ts` is still the only module that
  encrypts or decrypts that column. A skip is still `answer_text IS NULL`, never
  an encrypted empty string.
- **The persona prompt still never receives a raw onboarding answer**, now with
  the reveal control that made "until asked" reachable. It gets the engine facts,
  the closed values and the Lotus summary; `<sosok>` remains the sixth fence, as
  defence in depth *because* of that, with the canary in `prompt.test.ts`.
- **`account.answer_changed` carries a `length` and a closed `action`, never
  text.** `events` rows survive account erasure with `user_id` nulled, and that is
  only honest because `sanitizeProps()` provably strips everything identifying.
- **The secrets tripwire learned its first `NEXT_PUBLIC_` variable.**
  `NEXT_PUBLIC_SITE_ORIGIN` is the only one this project declares, and
  `scripts/audit-secrets.ts` runs inside `npm run build`.
- **`/s/<slug>` keeps `x-robots-tag: noindex, nofollow, noarchive` and
  `referrer-policy: no-referrer`**, and `crawl.sh` checks it as the script's own
  **negative control**: if that line printed nothing, the crawl above it would
  prove less than it looks like it does. `x-frame-options` stays `SAMEORIGIN` and
  `frame-ancestors 'self'`, never `DENY`.
- **No `x-robots-tag` on any content route (S-D12).** Next applies every matching
  entry and a later one with the same key wins, so a broadly-matching entry
  carrying that header would silently `noindex` the site. `headers.test.ts`
  asserts these entries carry `cache-control` and nothing else, and that
  `/s/:path*` is the only entry in the file with an `x-robots-tag`.

### Known gaps at this tag

- **No public content route is cached in production, and all eight
  `next.config.ts` content entries are inert.** R21 is closed and the answer is
  "none of it": measured against the real Vercel CDN on 2026-07-29, every content
  route in both trees answers `private, no-cache, no-store` with `x-vercel-cache:
  MISS` twice running. The discriminator is the middleware matcher — an excluded
  path gets its configured headers verbatim, and on a matched path every *other*
  config header arrives, so `headers()` runs and `cache-control` alone loses to
  the rendered response. **`headers.test.ts` cannot see this and no config-level
  test can**; `curl -D -` against a deployed URL is the only instrument, and
  `next start` is not Vercel — an intermediate local measurement said something
  different and was a local artifact. The candidate fix is one line in the
  middleware wrapper that already discriminates a content response exactly.
- **Whether a downloaded `-phone.jpg` reaches the iOS Photos library and *Set
  Wallpaper* accepts it is a release blocker and needs a real iPhone.** So does
  the answer sheet's geometry — a textarea with the keyboard up inside a `90dvh`
  sheet is a question WSL cannot answer.
- **Nobody has read the two articles or the 22 lore pages on a phone.** No lint
  can tell whether a page is worth reading.
- **`contentUrl` on the 22 `ImageObject`s is still the 800×1200 WebP**, and moving
  it means moving `url`, `width`, `height` and `encodingFormat` too, changing the
  image identity of 22 pages.
- **Two known defects in `PublicShare`, on twenty-three pages:** the button is
  36px tall, under the 44px iOS minimum, and it renders in the server HTML, so
  with JavaScript off the control is present and dead. Left alone deliberately
  under §6 file ownership — and **reconciliation §7 records this as already
  settled the other way**, which it is not.
- **No RSS.**
- **`GET /api/persona`, `/api/memory/frequency` and `/api/memory/summary` return
  500 when the database is down**, not 204. One omission in three files.
- **`PERSONA_MIN_AGE_SECONDS=3600` is still a guess**, and
  `account.details_viewed` still always reports `from: 'direct'`.
- **The Google consent screen is still in Testing mode.** The branding blocker is
  closed — signed out, `/` renders a landing page — so what remains is pressing
  Publish.
- **`daily` did not land the 30% cut**, and it is recorded rather than fixed:
  Margaret wrote 53, 84 and 67-word openings against her 51-word ceiling on
  identical hands. **The English `spread3` calibration is still unconverged** at
  157–243 words across runs. Measure before moving either.
- **`npm run test:all` still fails ~12–22 of V9's limiter tests** — a harness race
  on the one shared `serverless-redis-http`, not a regression. Run the two
  projects separately for a true answer.
- **The largest unverified risk in the project is unchanged:** signing in with
  Google from a home-screen installed instance, in standalone mode. Only a real
  iPhone against a Vercel preview can test it.

## [v0.3.0] - 2026-07-28

Nine workstreams (V1–V9) planned in `PUBLIC_RELEASE_ROADMAP_v0.3.0.md`,
reconciled in `docs/plans/2026-07-27-RECONCILIATION-v0.3.0.md`, and merged in
order — plus a run of phone-found fixes on 2026-07-28 that reversed several of
this repository's own written arguments.

**The thesis: the app stops doing arithmetic out loud.** v0.2.0's memory feature
said *"This week The Empress is shown three times whilst The Chariot is shown two
times."* Nobody opens a tarot app to be told a tally. A count is an input, never
an output — so the counts are **deleted from both generated prompts rather than
forbidden in them**, and the model is handed the Shadow Arcana instead. A model
cannot recite a count it was never given.

**The second thesis: the app becomes something a person can hand to somebody
else.** `/s/<slug>` is the first URL in this project's history that a stranger
with no account and no session can open, and it arrives with a distributed rate
limiter and a global model-call ceiling underneath it, because the day a link is
posted anywhere public is the day a per-instance limiter stops meaning anything.

1632 unit tests across 88 files; 137 integration tests. Seven migrations on top
of the baseline; three new tables (`translations`, `share_links`, `personas`).

### Added

- **The correspondence engine (V1).** `src/lib/numerology/**` — digit reduction
  with a master-number halt, the Pythagorean gematria table behind a
  diacritic-folding normalizer, expression / soul-urge / personality / nickname
  pulse with the Y-vowel rule, a string-only birth-date parser (never a `Date`,
  for `todayKey()`'s reason), the sun-sign table, the life path, number → Major
  Arcana, and **the Shadow Arcana** — `arcanaFor(a + b)`, the traditional
  quintessence. Deterministic, pure, and fenced: a purity test asserts the whole
  directory takes no handle, reads no clock and imports nothing impure.
- **Locale-tagged generation and on-demand translation (V2).** Every piece of
  generated prose records the language it came out in, and a language switch
  **translates** what already exists instead of showing Indonesian text inside an
  English app. A `translations` table, a `TRANSLATABLE` registry, and a contract
  that is a *re-issue of the target locale's rules* rather than a translator's
  brief. `<terjemahan>` is a fifth fence — what it guards is model output
  generated from user text, handed to a second model as material, going straight
  to a screen. Verification happens **after** the stream and never poisons the
  cache: a dirty generation is seen once and a `defer()`ed repair pass lands the
  clean row. `POST /api/translate` streams iff the registry says so, and `204` is
  a real answer. `users.locale_source` tells a negotiated locale apart from a
  default, read through `effectiveLocaleSource()` because NULL means `'chosen'`.
- **Mystical memory verdicts (V3).** `src/lib/memory/shadow.ts` and the rewritten
  frequency and day-summary prompts, with all six worked examples replaced. The
  model receives two card names, the Shadow Arcana, one written pulse line and one
  dominance word — never `m`, never `n`. `dominanceOf` is a **ratio**, not a
  difference, so `10:8` is narrow where a difference would call it wider than
  `4:2`. `tally.ts` is a two-tier detector with a false-positive corpus
  (`sekali` also means "very"; `once` also means "as soon as") that runs in the
  smoke script and **never at request time** — a heuristic may fail a build, it
  may not fail a person. `MEMORY_PROMPT_VERSION` goes to `memory-v2`.
- **The account shell (V4).** A circular account button top right, a bottom
  sheet holding User Details, Language and History, and **the first sign-out
  control this app has ever had** — `auth.signed_out` had been in the closed
  taxonomy since W4 with nothing firing it. The language toggle leaves the
  `/login` footer and moves into the menu (R1). Mounted per owning page, never in
  a layout, with a denylist keeping it off the draw screen.
- **The reader swipe deck (V5).** On `/[reader]` the bio and today's summary are
  two panels of one horizontal scroll-snap track; the summary **slides itself in
  once**, on the first byte, and the querent can swipe back. `SwipeDeck` is
  generic over N panels and knows nothing about readers or fetching;
  `src/lib/swipeDeck.ts` holds `panelIndexAt` and `shouldAutoSlide` — five ways
  to say no, one to say yes — as the pure part `npm test` can reach.
- **History (V6).** `/history` lists the querent's own readings filtered by day
  and defaulting to today; `/history/[id]` reconstructs the draw exactly as it
  was, read-only. `ReadingView` is the one renderer three surfaces mount, and it
  imports nothing from `@/lib/db/**` — not even as `import type`. Its rule 4 is
  the invariant: it **never** renders a body whose locale differs from the
  viewer's without a translation, so a caller cannot ship that bug by forgetting
  a prop. `/api/history` and `/api/history/days`, three new events, and a
  `readings.shared_at` column added here and written by V7.
- **Sharing (V7).** `/s/<12 chars>` — Crockford base32 over `byte & 0x1f`, a
  view-only page that looks exactly like the reading did, a *Try It Yourself*
  button, an OG preview image, and a share sheet that previews the real page.
  `share_links` with per-artifact revocation. The public route **reads and never
  generates**: it is the one route with no session and no per-user budget, so a
  model call there would be the ceiling with no gate on it.
- **`/account` and the Inner Heavenly Lotus persona (V8).** Four blocks — the
  three editable facts, the card the universe keeps handing them, the reader
  whose path opened, and a generated four-sentence reading *of the person* in
  house voice. **The deletion button `/privacy` §8 described for a whole
  release**, and **per-answer clearing**, which `/privacy` promises twice in both
  locales and nobody could perform. `<sosok>` is the sixth fence, and it is
  defence in depth: the persona prompt receives engine facts, closed values and
  the Lotus summary, and **never a raw onboarding answer** — enforced by
  construction with a canary test, not by prompting. `GET /api/persona` buffers
  and must not stream, because a safety check before the first byte means the
  body is buffered anyway.
- **Distributed rate limiting and a global model-call ceiling (V9).**
  `src/lib/ratelimit/**` on Upstash Redis, choosing a backend per key, with a
  shared `clientIp()` and IPv6 normalised to /64. `LLM_WINDOW_CALL_CEILING`
  meters **model calls per rolling five hours** — a provider quota is not a
  calendar day, and it is the one counter in this app that is not the querent's
  — in two tiers, with deferred work shed first and the reading path reserving
  against the window. Redis failures fall back to memory, never to unlimited, and
  say so once a minute through `ratelimit.backend_degraded`. Fleet-wide numbers:
  the old `400` meant 400 *per instance*.
- **A second LLM provider, built and measured but not switched on.**
  `src/lib/llm/openai.ts`, one interface, five models measured against z.ai.
  `gemini` is a named provider rather than `openai` plus a base URL, because it
  is the failover path and forgetting the base URL would send a Google key to
  OpenAI. The adapter **refuses to start** on a `gpt-5`/`gpt-6`/`o`-series model
  with `OPENAI_REASONING_EFFORT` unset. `docs/provider-comparison.md` has the
  measurements — including the two of its own that were wrong.
- **A regenerated deck: 22 cards, one treatment, full bleed, no text.** The card
  name is drawn by the app rather than baked into the art. Plus
  `.claude/skills/generate-tarot-card/` with its locked style contract,
  `tools/gen_card_art.py` and `tools/check_card_art.py`.
- **A real Chrome in WSL, driven over CDP** — `tools/e2e/{setup,run}.sh` and
  `chrome.mjs`, no Playwright, no Puppeteer at runtime, no new dependency. The
  three-workstream-old claim that Chromium cannot launch here was a correct
  diagnosis with a wrong conclusion: `ldd` names exactly one missing library and
  a `.deb` unpacks into a home directory with no privileges. It holds a
  persistent Google session and **never holds a credential** — no verb accepts a
  password and `whoami` prints the cookie's length, never its value. Loop 5 found
  the production sign-in outage of 2026-07-28.
- **`scripts/db-migrate-deploy.ts`, run first inside `npm run build`.** It needs
  `MIGRATE_DATABASE_URL` (Neon's *direct* string), refuses a `-pooler` host,
  skips off Vercel, and **fails the build rather than skipping** when it cannot
  run.
- **New environment variables:** `TRANSLATION_MODEL`, `PERSONA_MODEL`,
  `PERSONA_STUB`, `PERSONA_MIN_AGE_SECONDS`, `SHARING_ENABLED`, `SHARE_BASE_URL`,
  `UPSTASH_REDIS_REST_URL` / `_TOKEN` (and their `TEST_` counterparts),
  `RATELIMIT_BACKEND` / `_TIMEOUT_MS` / `_GLOBAL_HOURLY` / `_EVENTS_BACKEND` /
  `_SESSION_BACKEND`, `LLM_WINDOW_CALL_CEILING` / `_SOFT`, `OPENAI_BASE_URL`,
  `OPENAI_REASONING_EFFORT`.
- **New commands:** `npm run smoke -- --translate` (six real translations, both
  directions) and `-- --persona` (one real persona per locale),
  `npm run db:migrate:deploy`, and a `srh:wait` probe folded into `db:up`.
- **Documentation:** the v0.3.0 roadmap and reconciliation, nine workstream
  plans, two share-design documents from 2026-07-28,
  `docs/provider-comparison.md`, and `docs/workstream-notes.md`.

### Changed

- **`CLAUDE.md` was split at 157k into a 95k core plus `docs/workstream-notes.md`.**
  The core keeps the rules and the invariants; the notes keep the evidence — the
  traps that were paid for, how each bug was found, the live measurements and the
  internals of the verification harnesses. New traps go in the notes, so the file
  loaded every session stays worth loading.
- **The closed event taxonomy grows from 44 names to 61**, and the message
  catalogs roughly double, 127 keys to 242. `id.ts` still owns the key set and a
  missing English string is still a red typecheck.
- **`MARGARET_MULTIPLIER = 1.3` replaces the hand-set `spread3: 55`** and reaches
  every reader-voiced ceiling, because her length is a fact about the reader and
  not about one service (VD19). Ceilings only — a floor scaled by verbosity would
  demand length rather than permit it.
- **Gold now means exactly one thing on the draw screen.** `cardFaceBorder`
  (full-strength `#c9a227`) becomes `cardEdge`, a pewter hairline keyed to the
  artwork: the regenerated deck paints its own frame, so a gold ring on top was a
  second border competing with the first, and on the darkest cards it was the
  brightest thing in the cell. `--gold-hairline` stays on the *empty* slot, so
  empty and filled stopped sharing a signal. A `danger` token is added — a
  desaturated brick, used as a border and a label and never as a fill — with
  `/account`'s deletion sheet as its only consumer.
- **The three readers carry a fixed `gender`** in `readers.json` — Thessaly
  female, Margaret female, Adrian male — meeting `reader.pronoun.{female,male}`
  in exactly one place. Indonesian renders `dia` for both, and a test asserts
  that is deliberate by cross-checking each `bio.en`.
- **There are six verification loops now, not four**, and the one that used to be
  described as giving a true 390px viewport does not: measured 2026-07-28,
  `innerWidth` and `outerWidth` are both 500 in the WSL Chrome profile. Loop 5
  answers "does the UI agree with what it sends"; **loop 4** — fixed-width
  containers and `getBoundingClientRect` — is what answers "does it fit a phone".
- **The question is on the public share page by default**, reversing VD9: a
  stranger who sees three cards and four paragraphs with no question cannot tell
  what any of it is about. The sheet's switch is gone and the preview is now the
  only consent mechanism for it. **The OG image still carries neither the
  question nor the prose** (VD18), and that matters *more*, not less — a page is
  opened by somebody who chose to, while a preview image is cached by every
  messenger that merely sees the link.
- **A share link carries the language it was shared in**, and a reading holds one
  address **per language** — `unique nulls not distinct (user_id, entity,
  entity_id, locale)`. Re-sharing rotates the slug *within one language*; a
  different language takes the insert branch and the first address stays alive.
  Revoke is per-artifact and kills every language: two kinds of "stop sharing" is
  a UI in which somebody taps the wrong one and believes a reading is private
  when it is not.
- **`/s/<slug>` is monolingual, in the reading's language** — chrome included —
  reversing "chrome follows the viewer", a rule that stood for two workstreams.
  A page in two languages reads as half-translated, not as considerate. The
  mechanism is a nested `LocaleProvider`, never a `locale` prop, so `ReadingView`,
  `TryItYourself` and `Eyebrow` are untouched. The cost was accepted, not missed:
  an Indonesian visitor opening an English link now has nothing on the page they
  can read.
- **`RATELIMIT_SESSION_BACKEND` defaults to memory, on purpose** — for latency,
  not cost. `refreshSession()` spends one `hit()` on the request path of a
  language switch, and with no Upstash Singapore region that is a `sin1`→Tokyo
  hop between a database write and a database read.
- **`POST /api/locale` declares a runtime and a `maxDuration`**, and
  `ShareFooter` bounds all three of its requests at 8s against a 30s lambda. A
  bigger server budget without a client bound only makes a hang longer.
- **`package.json` version → `0.3.0`; `API_VERSION` → `0.3.0`.**
- Dependencies added: `@upstash/ratelimit`, `@upstash/redis`.

### Fixed

- **A committed migration that nobody applied took production down, and the app
  looked perfectly healthy while it did.** `0001` was applied locally and never to
  Neon, so `upsertUserOnSignIn` threw on a missing `locale_source` column,
  `auth.ts` refused the session, and the gate bounced every querent to `/login` —
  while **Google's consent screen succeeded every time**. The same column killed
  the language switch: one unapplied migration presenting as two unrelated-looking
  bugs, neither naming a migration. `npm run build` now applies migrations first
  and fails rather than skipping.
- **`MEMORY_PROMPT_VERSION` invalidated nothing.** `fresh` short-circuited the
  `||` before the version was ever compared, so any user whose window had not
  moved was served the cached `memory-v1` row forever — fatal for a release whose
  entire deliverable is replacing that text. Fixed in its own one-line commit,
  with the test written first and watched failing (§0.1).
- **Four of the six day-summary worked examples recited a tally** — *"Tiga kali
  hari ini…"*, *"turned up twice"* — teaching the model the exact behaviour this
  release exists to remove, in the file whose own header says the example does
  more work than the description (§0.2). And `scripts/smoke-llm.ts` hardcoded the
  word ceilings as `25` and `45` rather than importing them, in the one file whose
  job is catching drift (§0.3).
- **A `ReadableStream`'s `pull()` is not in a request scope, and every streamed
  translation lost its analytics event and its repair pass** — silently, for as
  long as V2 had shipped, which is why the "fix the prompt if `invalid` exceeds
  ~2%" rule could not be followed: the measurement was not being written.
  `bindAnalyticsScope()` is called synchronously inside `translateStream`, the one
  line guaranteed still to be in the handler. The unit mock now models the scope
  with a depth counter — a mock that only records calls cannot see this class of
  bug, and the suite was green throughout.
- **Every persona translation failed, on every page view.**
  `TRANSLATABLE['persona.body'].budget` was `'summary'` (50 words) where a persona
  is 95, and `ceilingFor` feeds both the prompt and `verifyTranslation` — so the
  model was told to squeeze 95 words into 50 and then judged against 50. Measured
  live: a correct 88-word translation rejected, never persisted, a fresh model
  call every time. Invisible for two releases because nothing translated a
  persona. The contract test now asserts the resolved number, not the tag's
  spelling.
- **The language switch could not fail safely, and the querent's own description
  was the diagnosis** — *"it only takes effect after we change to another page"*.
  A timeout is the one outcome meaning **unknown**, so it is now the only one
  retried, once, with the marker kept, while `!response.ok` and offline still
  revert because those are answers. Reported dead on an iPhone while fine on a
  desktop: 1348ms warm from WSL told us nothing, because Docker Postgres never
  sleeps and a Neon compute does.
- **Both Upstash SDK defaults are wrong for this app, and both are wrong by being
  absent.** `@upstash/ratelimit`'s `timeout` defaults to 5s and **fails open to
  unlimited**; `@upstash/redis` retries five times with exponential backoff — about
  4.3s — in a layer whose own contract says it does not retry. Measured by
  pointing the URL at a closed port: with the defaults an unreachable Upstash
  burned the whole `RATELIMIT_TIMEOUT_MS` on every request.
- **`resolveBaseUrl` consulted `OPENAI_BASE_URL` before the provider**, so
  `npm run smoke` and `npm run probe:moderation` printed
  `baseURL=api.anthropic.com` while talking somewhere else entirely — through a
  whole Gemini evaluation.
- **Three defects on `/account` that a green build did not notice**, and five more
  found by loading pages on a phone rather than reading them — among them
  `WHAT YOU ARE CALLED` wrapping over two uppercase rows beside a one-word value,
  a 2:1 landscape reader portrait cropped to a 60px stamp, a card with no name
  under it, Thessaly referring to herself as *they*, and a page with no way out.
  Four of the five reverse an argument the code itself had written down.
- **`CREATE A ENGLISH LINK`.** Found by driving the real page and invisible to the
  whole suite, because the string and the parameter are each correct on their own.
  Any phrasing with an indefinite article beside an interpolated language name is
  a coin flip.
- **The browser tab was the last string resolved from `accept-language`** on a
  Bahasa-pinned share link, so everything followed the pin except `<title>` — and
  `og:title` shares it, so chat previews had it too. Fixed by moving the rate-limit
  gate *into* the cached resolve (`gateAndResolve`), which both `generateMetadata`
  and the page call: the limiter-before-database ordering is the whole defence on
  that route, and it was verified by counting executions rather than trusted from
  the docs.
- **The share sheet had no read path at all**, which is why the per-language bug
  arrived silently: `liveShareLinkFor` had zero production callers, so a reading
  shared yesterday looked unshared. `GET /api/share?entity=&entity_id=` is fetched
  on sheet open, and a failed read falls through to the create flow.
- **The 429's `retry-after` from the ceiling is not the window length** — measured
  at 291 seconds on a tripped five-hour ceiling, because a sliding window reports
  `reset` as the start of the next sub-window. Both backends are honest and neither
  is ever zero, which is the property that matters. Documented rather than
  "fixed" to a hardcoded value.
- **The Empress had no right arm**, and the gold ring made the chrome the brightest
  thing on the darkest cards. Both went with the deck regeneration.
- The event taxonomy count in `CLAUDE.md` was 43 where the file held 44; the e2e
  harness's `tap` matched the wrong control and reported success; and `.gitignore`
  ignored a `node_modules` directory but not a `node_modules` symlink.

### Removed

- **`src/lib/ratelimit.ts` and its test**, replaced by `src/lib/ratelimit/**`.
- **The other-language notice on `/s/<slug>`**, which this repository said in
  capitals must not be removed. Design A changed what the page shows underneath a
  sentence describing the old mechanism: the page no longer renders "whatever
  language the reading was generated in", so the notice described a mechanism that
  had stopped running. **Three tests were inverted rather than deleted**, because
  the failure mode of removing chrome is somebody adding it back in six months.
  `account.persona.otherLanguage` is a different key on a different page and still
  renders — as the *failure* state, gated on `prose.kind === 'as-written'`.
- **The `include_question` switch on the share sheet** (migration `0004`).
- **The 22 original source PNGs under `assets/major_arcanas/`**, replaced by the
  regenerated deck. Still in history.
- **The z.ai spend cap, as an idea.** `LLM_API_KEY` is a fixed annual subscription
  sold for coding, not a wallet; three documents naming a spend cap as the primary
  control were corrected. The replacement is `LLM_WINDOW_CALL_CEILING` and query 9.
  The residual risk is worse than the cap was: the same FAQ restricts the plan to
  officially supported tools, and the consequence of enforcement is key revocation.

### Security

- **The rate limiter on the app's only public write endpoint was bypassable with a
  request header.** `/api/events` read the **leftmost** `x-forwarded-for` entry —
  the one the caller supplies — so a different value per request was a different
  limiter key per request. It also preferred the spoofable header over
  `x-real-ip`, which is the wrong way round. The function's comment argued the
  endpoint was not worth abusing; that was a defensible v0.2.0 position and this
  release retires it, because V7 makes the app publicly linkable and fires
  `share.viewed` through that endpoint anonymously (§0.4).
- **The sign-in failure path logged the querent's email and real name**, and the
  rule forbidding it had already been written twice. A postgres error quotes its
  bound parameters and `upsertUserOnSignIn` binds nine, four of which identify a
  person. **The leak scaled with the outage** — the failure that exposed it was
  schema drift, the case where *every* sign-in fails, so a rule harmless for weeks
  started writing one row of PII per attempt at the exact moment nobody was
  watching. `logSignInFailure` logs SQLSTATE and the error's class in production.
  The generalisation: every `catch` that touches the database is a potential PII
  sink, and the audit is "which of my bound parameters came from a person".
- **`currentUser()` is never called anywhere under `/s/[slug]`**, and `curl` cannot
  see the failure: a client component reaching for a session context renders
  correct HTML on the server and throws during hydration, so `curl` reports 200
  with the reading in the body and the page is dead in a browser. A contract test
  fences `currentUser`, `requireUser`, `ViewerProvider`, `useViewer`, `cookies()`
  and `@/lib/auth/*` across the whole subtree.
- **Account deletion runs `redactForUser()` and `revokeAllForUser()` inside the
  same transaction that sets `deleted_at`, in that order.**
  `moderation_flags.user_id` is `on delete set null` and `share_links.user_id`
  cascades only at the hard delete thirty days later, so both rows outlive the soft
  delete — a self-harm disclosure and a public URL. Redaction runs *before* the
  flag, so a failure aborts the whole thing rather than marking an account deleted
  with its text intact. The route also clears the session cookie itself, by name,
  because there is no server-side revocation on the JWT path.
- **The persona prompt never receives a raw onboarding answer**, enforced by
  construction: it gets machine-built engine facts, closed-set values, and a Lotus
  summary that `lotusSafetyCheck` already passed.
- **Re-sharing rotates the slug rather than un-revoking the row.** The obvious
  one-liner — `revoked_at = null` — resurrects a capability the querent
  deliberately killed: the old URL, in the group chat they revoked it because of,
  starts working again for whoever still has it. The regression test is the one
  asserting the *old* slug stays dead.
- **`x-frame-options: SAMEORIGIN` and `frame-ancestors 'self'` survive**, and
  `/s/:path*`'s header block sits **after** the catch-all in `next.config.ts` on
  purpose — Next applies every matching entry and a later one with the same key
  wins, which is what makes `referrer-policy: no-referrer` override the global
  value on `/s/` and only there. Reversing the two entries is a silent no-op that
  reads as correct; `headers.test.ts` asserts the ordering.

## [v0.2.0] - 2026-07-27

The public-release run: seven workstreams (W1–W7) planned in
`PUBLIC_RELEASE_ROADMAP.md`, reconciled in
`docs/plans/2026-07-26-RECONCILIATION.md`, and merged in order. JMTarot goes
from a two-user demo with no persistence to an app with real accounts, a
database, memory, two languages and a trust-and-safety layer.

**This release reverses two decisions v0.1.0 documented.** There is a Postgres
database now, and readings are stored. `localStorage` stops being the source of
truth for the profile and becomes a cache of what the server already knows.

### Added

- **The data layer (W1).** Postgres 16 — Docker locally, Neon in production —
  with Drizzle ORM over postgres.js. Ten tables realised from the
  reconciliation's §3 in one baseline migration; `drizzle-kit push` is banned
  and only `generate` + `migrate` are used. `src/lib/db/client.ts` is the only
  place the driver is named. Every function under `src/lib/db/queries/**` takes
  its database handle as the first argument, enforced by
  `queries/contract.test.ts`, so nothing needs the `server-only` singleton.
  AES-256-GCM field encryption (`v1.<iv>.<ct>.<tag>`, base64url) covers the two
  most sensitive columns.
- **Google sign-in (W2).** Auth.js v5 with JWT sessions and no database read on
  the request path: one `users` row per Google account, a 24-hour sliding idle
  timeout inside a 30-day hard cap, and a pure routing decision in
  `src/lib/auth/gate.ts` that Vitest owns. `requireUser()` / `currentUser()` are
  the only sanctioned way to ask "who is this, on the server".
  `POST /api/auth/dev-session` mints a genuine Auth.js JWE for local
  verification and 404s unless `DEV_PASSWORD_LOGIN=1`.
- **Onboarding and the Lotus distillation (W3).** Nine screens asked exactly
  once — the invitation, three facts, six personal questions, a closing card —
  with the resume point *derived* (the first key with no row) rather than
  stored, so a skipped question is never skipped forever. Answers are encrypted
  at rest; a skip is `answer_text IS NULL`, never an encrypted empty string.
  `profiles.completed_at` is the only completion marker, and the completion
  route reads the answer set back from the database rather than trusting the
  client to say it finished. The Lotus is a pure prompt/parser/safety module
  plus a separate impure generator that calls the model, caches, and repairs.
- **Analytics and reading persistence (W4).** A closed event taxonomy of 44
  names with a prop shape each and two compile-time guards; server-side buffering
  onto one `after()` per request; a batched client collector (2s debounce, flush
  at 20, queue capped at 200, `sendBeacon` on the hide path); a public
  `/api/events` that always answers 204. Readings and their cards are one
  transaction with a bounded retry. The reading body is captured by a manual
  fan-out — never `tee()` — with the client branch enqueued first, so nothing is
  on the path of a byte the user is waiting for. Eight operator queries in
  `docs/analytics-queries.md`, every one of them executed.
- **The three memory features (W5).** A card-frequency verdict on the reader
  picker, readings that reference the last reading through a `<riwayat>` block,
  and a per-day summary in the chosen reader's own voice — all reading from
  `readings` and `reading_cards`. Eight window specs, an M4 gate, a
  regeneration throttle, and a recall path that never throws (it returns
  `null`). Plus `/api/memory/frequency` and `/api/memory/summary`.
- **English and Indonesian, interface and readings (W6).** Two locales, `id`
  the default and the source language. Locale is never a URL segment: nine
  routes stay nine, and resolution happens once in middleware — session `loc`
  claim → `jmt_locale` cookie → `Accept-Language` → `id`. `locales/id.ts` owns
  the key set (118 keys) and `en.ts` is typed *from* it, so a missing string is
  a red typecheck rather than `undefined`. The prompt layer forks per locale
  behind a facade holding a `Record<Locale, …>`. An optional language toggle
  behind `LOCALE_SWITCHER`.
- **Trust, safety and secrets (W7).** A moderation gate that refuses harm
  without refusing sensitivity — eight categories where the answer itself would
  be the harm, a small proximity-anchored blocklist with a near-miss test per
  pattern, and a classifier on `glm-4.5-flash` at temperature 0 behind a
  1500ms timeout, both numbers measured against live z.ai rather than guessed.
  The gate primes the reading before awaiting the verdict, so the classifier is
  not the latency. Crisis resources carry a `verifiedOn` date that warns at 180
  days and fails at 365. `/terms` (17 clauses) and `/privacy` (12 sections),
  both locales, both public. `scripts/audit-secrets.ts` runs inside
  `npm run build` and fails it if a prompt or a key ever reaches the browser.
  One daily cron doing three deletes: expired soft-deleted accounts, moderation
  question redaction, and the 180-day `events` TTL.
- **`error.tsx` and `not-found.tsx`**, so a thrown render and a bad URL are not
  Next's unstyled defaults.
- **Development commands.** `db:up` / `db:migrate` / `db:seed` / `db:studio` /
  `db:down` / `db:nuke`, a test suite split into a `unit` project that needs no
  Docker and an `integration` project that does, `npm run audit:secrets`,
  `npm run probe:moderation`, and new smoke modes: `--all` (eighteen readings,
  both locales), `--lotus`, `--memory`, `--gist`, `--fixed`, `--summary`,
  `--frequency`. `npm run smoke -- --all` ends with a blind read — three
  readings per locale, names covered, shuffled — and fails loudly on three voice
  proxies.
- **Release documentation.** `PUBLIC_RELEASE_ROADMAP.md`, seven workstream
  plans and the reconciliation under `docs/plans/`, plus
  `src/lib/db/migrations/README.md` and `docs/analytics-queries.md`.

### Changed

- **Readings are persisted and the profile lives on the server.** v0.1.0's "no
  database: profile and daily state live in `localStorage`, and a reading is not
  persisted at all" is reversed. `todayKey()` stays and its comment is
  load-bearing: `local_date` is the *querent's* calendar day, sent by the
  client, and is `string` rather than `Date` on purpose — a `Date` renders in
  the server's zone and is a day out for anyone in Jakarta before 07:00. An
  integration test fails if anyone "fixes" the column.
- **Every word ceiling moved into one place.** `LENGTH_BUDGET` in
  `src/lib/prompt/budget.ts` is interpolated into the prompt and asserted by the
  smoke script, so the two cannot drift. `daily` and `yesno` gained ceilings
  they never had — a sentence count alone does not bind — and Margaret carries a
  per-reader override of 55 words on `spread3`, from measurement, because her
  voice rules mandate long subordinated sentences.
- **The English prompt layer is rewritten, not translated.** Each worked example
  deliberately uses a different card from its Indonesian counterpart (id: The
  Tower, The Hermit, The Lovers reversed; en: The Hierophant, The High
  Priestess, The Devil reversed) so a translated example is visible in five
  seconds. There is a test asserting it. The English forbidden-vocabulary list
  is longer than the Indonesian one, and the English half of the smoke grep has
  its own tic list — running the Malay words against English is theatre.
- **The rate limiter and the middleware were largely rewritten** for the
  Auth.js gate, locale resolution, and per-route limits.
- **`next.config.ts` sets security headers**, with `x-frame-options:
  SAMEORIGIN` and `frame-ancestors 'self'` — never `DENY` / `'none'`, because
  this project's only way to drive its own UI is a same-origin iframe harness.
  `src/lib/headers.test.ts` asserts both.
- **`npm run build` now runs the secrets audit**, and every npm script that
  touches the network sets `RES_OPTIONS=no-aaaa` — AAAA lookups hang 4–12s in
  this WSL image, which broke Google sign-in with a 10s undici connect timeout
  and looks exactly like a bad client secret.
- **The production database decision (roadmap D5) is resolved: Neon**, free
  plan, Singapore, Postgres 16. The pooled connection string is for Vercel only;
  migrations, `db:studio` and `pg_dump` take the direct one. `client.ts`'s three
  knobs (`max 1`, `prepare false`, `ssl require`) are conditional on `VERCEL`,
  not on `NODE_ENV`, because a preview build is also `NODE_ENV=production`.
- **The domain is `www.jmtarot.site`**, bought and live; the apex 308-redirects
  to the `www` host, and only one is ever served — an OAuth redirect URI is a
  string comparison.
- Dependencies added: `drizzle-orm`, `drizzle-kit`, `next-auth@5.0.0-beta.32`,
  `postgres`, `server-only`, `dotenv`.

### Fixed

- **`token.sub` is not the provider's `sub`.** @auth/core overwrites `user.id`
  with a fresh `crypto.randomUUID()` on every sign-in, so using it as
  `google_sub` meant the upsert's conflict target never matched and **every
  sign-in inserted a new row** — silently, with memory features reading an empty
  history forever. `readExternalSub()` reads `account.providerAccountId` and
  refuses a uuid-shaped value.
- **An infinite redirect loop between `/` and `/login`**, from putting a pure
  `session` callback only in `auth.ts`: middleware builds its NextAuth instance
  from `authConfig` alone, so the callback was absent on the edge and every
  session looked signed out. Nothing logged. Anything pure now lives in
  `config.ts`, which both import.
- **A silently stripped session.** Middleware re-issues the session cookie from
  whatever the `jwt` callback returns, so a plausible `return { ...token, x }`
  in the edge config dropped `uid` and `onb` on the user's next navigation.
- **A stale `onb` claim could not be fixed by redirecting** — a server
  component cannot write cookies, so `redirect('/')` bounced off middleware's
  identical stale claim and looped. The completion path re-mints first and
  navigates only when the claim is actually true.
- **The Lotus cooldown swallowed user-caused regenerations.** Its ten minutes
  are meant to bound the *speculative* repair the reading path fires; armed by
  the first of six onboarding writes, it silently discarded an answer edit
  minutes later — which made the delete button a lie. Write paths now call
  `generateLotus` directly.
- **`order by created_at desc` is not a total order.** `created_at` is
  transaction-start time, so rows written in one transaction share it exactly;
  `recallableReadings` orders by `created_at desc, id desc`. Two integration
  tests failed on this.
- **Drizzle's `$onUpdate()` does not fire inside `onConflictDoUpdate`**, so
  every upsert sets `updatedAt` by hand. For `daily_summaries` that is exactly
  the column the regeneration throttle compares against.
- **Every abandoned reading was recorded as failing for an unknown reason.**
  `tee.ts`'s `finish()` read its outcome fields *after* an `await`, by which
  time a cancelled controller had made the next `enqueue` throw and the catch
  block had overwritten `errorKind`. Mutable state is snapshotted before the
  await now, and the cancel test asserts `errorKind` and not only `status`.
- **JSX strips the leading whitespace of a text node that spans more than one
  line**, so `www.jmtarot.siteand` and `happen."We` appeared and disappeared
  with code formatting. It shipped three times. A render test does not catch it —
  Vite's JSX transform keeps the space and Next's SWC drops it — so the guard is
  a source-level check in `legal.test.ts` requiring an explicit `{' '}` at every
  wrapping boundary.
- **The first real Vercel deploy failed on nineteen findings from the
  platform's own environment.** Vercel duplicates its system env under a
  `NEXT_PUBLIC_` prefix; the audit was enumerating a `process.env` this
  repository does not own. It now warns on that prefix in one line, and the read
  grep over `src/**` — the half that matters, since Next inlines a value where
  something *reads* it — is untouched and verified by a control.
- **`[object Object]` in all nine system prompts, with a green typecheck.** A
  template literal stringifies a `Localized<>` object happily. Grep for
  `${…​.name|tagline|bio}` after any such change.
- **`Intl.PluralRules` answers whether the noun inflects, and nothing else.**
  CLDR gives `id` only `other`, so a plural family rendered `Ketuk 1 kartu` at
  every count; `draw.hint.tap` is `.single`/`.many` with an explicit
  `cardCount === 1` check, which keeps the spelled-out `satu`.
- **`?lang=` only affects the request that carries it**, so client components
  that fetch resolved from the session claim instead and showed an Indonesian
  frequency verdict under an English hint. And `POST /api/locale` must write
  `users.locale` *before* `refreshSession()`, never in `after()` — the jwt
  update branch re-reads the row, so a deferred write makes the switch silently
  revert.
- **A bare `lagi` in the callback detector fires on most sentences of casual
  Indonesian** — it is also the progressive aspect marker — and reported a ~90%
  callback rate that was entirely noise, on the ratio deciding whether chaining
  gets cut. Every Indonesian pattern is now multi-word or hyphenated. Same class
  as the Malay grep missing `tempoh`, which is also fixed (eleven words now, not
  four).
- **The blocklist runs both locales' patterns under both locales.** `locale` is
  the UI preference, not a declaration of what language the querent types.
  Caught on the live route: `gimana cara bunuh diri` under `en` fell through
  Tier A and cost a classifier call instead of a free deny.
- **`server-only` no longer breaks Vitest**: `vitest.config.ts` aliases the
  package to its own `empty.js`, the file the bundler picks under the
  `react-server` condition. Nothing is weakened — the throw's value is the build
  error, which is untouched.

### Removed

- **The two hardcoded users and the signed-cookie login.**
  `src/lib/auth/session.ts` and its test, `/api/auth/login` and
  `/api/auth/logout` are deleted: with Auth.js owning sessions nothing called
  the jose helpers, and a function named `verifySession` in this codebase would
  send someone to the wrong file at the worst moment. `AUTH_USERS` survives as
  fuel for a dev-only Credentials provider and nothing else.
- `src/lib/prompt/side.ts`, folded into the per-locale prompt fork by W6.
- Both W3/W5 staging-post copy modules, migrated into the i18n catalogs.
- `docs/seed-meanings.en.json`.
- **The `backup/main-ios-2026-07-25` branch**, as redundant — the rewrite was a
  linear continuation, so `feat/ios` is an ancestor of `main` and the whole iOS
  history is reachable from `main` regardless. v0.1.0's entry above names that
  branch as a preservation point; it is no longer one. Recreate the label with
  `git branch backup/main-ios-2026-07-25 cfa9f29` if you want it back.

### Security

- **Field encryption at rest** for onboarding answers and birth date.
  Losing `FIELD_ENCRYPTION_KEY` does not break the app — encrypted answers
  decrypt to `null` and read as "skipped" — but the data is gone for good, and
  there is deliberately no re-encryption path.
- **No free text in `events.props`, ever.** `events` rows survive account
  erasure with `user_id` nulled, and that is only honest because
  `sanitizeProps()` provably strips everything that could identify anybody: it
  drops non-scalars, truncates strings to 120 characters, caps at 24 keys, and
  rejects `__proto__`, `constructor` and `prototype` by name.
- **Never log a driver error from an analytics or moderation path.** A postgres
  error quotes the failing statement *and its bound parameters*, and the
  querent's typed question is one of them — so `console.error('…', err)` would
  put it in the platform log. Production logs ids, attempt and SQLSTATE;
  development prints everything, because there is nobody to leak it to. Asserted
  by canary tests in `log.test.ts` and `leak.test.ts`.
- **The querent's question stays in the user turn only**, inside delimiters the
  sanitizer strips, never in the system prompt. Verified against a real
  injection attempt.
- **A build-time tripwire** (`scripts/audit-secrets.ts`) that fails the build if
  a prompt layer or a secret reaches the client bundle, with source-side fences
  (`clientBoundary.test.ts`) covering what a bundle scan cannot see because it
  was tree-shaken.
- `CRON_SECRET` guards the daily sweep; `TEST_DATABASE_URL` is a separate
  variable and both the harness and the global setup refuse any value whose
  database name does not end in `_test`, because the integration suite
  `TRUNCATE`s.
- `client_secret*.json` and `public/cards/_*.html` are gitignored — the OAuth
  client download lands in whatever directory you were in, and anything under
  `public/` is served to the internet.

### Known gaps at this tag

- **`/account` does not exist.** `/privacy` §8 describes a deletion the user
  cannot yet perform. Everything underneath it exists — `users.deleted_at`, the
  cascade, the lazy purge, `redactForUser()`, the daily sweep — but the button
  does not. Whoever builds it must call `redactForUser()` in the same
  transaction that sets `deleted_at`.
- **The OAuth consent screen is still in Testing mode**, so only manually-added
  test accounts can sign in. Google's remaining branding requirement is an app
  homepage that is not a login page.
- **Signing in with Google from a home-screen installed instance, in standalone
  mode, is unverified** and is the largest untested risk in the project. It
  cannot be tested in WSL — only on a real iPhone against a Vercel preview.
  Touch behaviour, safe-area insets and Add to Home Screen are likewise
  unverified on hardware.
- **T&C clauses 10, 11 and 12 need a lawyer**, and the Jakarta district in
  `src/app/terms/operator.ts` needs confirming against the operator's deed.
- **Margaret's English `spread3` length is not converged** (157–243 words across
  runs), and her 312-word Indonesian control run is a pre-existing regression
  against the 128–169 band v0.1.0 recorded.
- **A hard spend cap at z.ai is a required deployment step** and nothing in this
  repo can enforce it.

## [v0.1.0] - 2026-07-25

First tagged release. The tree began as an Expo/React Native iOS app and was
rewritten mid-history into a mobile-first website; this entry describes the web
app as it now stands. The iOS tree is preserved on `feat/ios` and
`backup/main-ios-2026-07-25`.

### Added

- **Next.js app** (App Router, TypeScript, `src/`) replacing the Expo scaffold:
  reader picker (`/`), service picker (`/[reader]`) and the draw screen
  (`/[reader]/[service]`).
- **Authentication.** Two hardcoded users behind a signed-cookie login —
  `src/lib/auth/session.ts` (HMAC session tokens), `src/lib/auth/users.ts`
  (bcrypt password checking), `/api/auth/login`, `/api/auth/logout`, and a
  login page.
- **Route gate** at `src/middleware.ts`, redirecting unauthenticated requests
  to `/login`.
- **The draw interaction.** A 22-card fan with settled geometry (88x132, 64°
  span, 272px pivot, verified against `getBoundingClientRect`), pick, return,
  a one-rotation 3D card flip using `preserve-3d`, filled slots, and a
  reduced-motion grid fallback (`FanGrid`, `StillMode`).
- **Card detail overlay** (`CardDetail`). Tapping a picked card opens its full
  art and its Indonesian meaning; returning it to the deck moved into a button
  inside the overlay, offered only while the reading is idle.
- **Card data** for the 22 Major Arcana in Fool's Journey order, with
  reversals, `stage`/`polarity`/`element` grounding, and a distinct pair of
  Indonesian one-line meanings per card (upright and reversed) read through
  `cardMeaning()`.
- **Derived yes/no verdict.** `effectiveYesNo()` decides it in code, including
  the reversal flip, and hands the model the word — never the reverse.
- **LLM provider interface** (`src/lib/llm/`) — one adapter serving both
  `anthropic` and `zai`, streaming, proven against the live endpoint.
- **Three-layer prompt builder** (`src/lib/prompt/`): `base.ts` (format,
  language, safety) + `readers.ts` (persona, one worked example paragraph each)
  + `services.ts` (the task), assembled by `build.ts`. The querent's question
  goes in the user turn only, inside `<pertanyaan>` delimiters, after
  sanitization.
- **Streaming reading endpoint** at `/api/reading`, with a best-effort
  in-process rate limiter.
- **Web app manifest** (`src/app/manifest.ts`) and a generated home-screen
  icon, making the site installable to the iPhone home screen.
- **Design tokens** as the single source of truth — `src/theme/tokens.ts`
  mirrored into `src/theme/tokens.css` — plus self-hosted fonts via
  `next/font/google` and the starfield backdrop.
- **Vitest suite** covering deck maths, `togglePick`, prompt assembly, question
  sanitization, session tokens, password checking and the rate limiter.
- **Verification tooling in place of Playwright** (Chromium cannot launch in
  this WSL image): `tools/shot.sh` drives Windows Chrome headless against the
  WSL dev server.
- **Asset pipeline.** Idempotent `tools/normalize_cards.py` (source PNGs →
  800x1200 and 240x360 WebP, padding rather than cropping),
  `tools/generate_cards.py` (rebuilds `src/data/cards.json`) and
  `tools/make_icons.py`. `public/cards/` is committed so the deploy needs no
  Python.
- **Documentation.** `docs/plans/2026-07-25-jmtarot-web-rewrite.md` (every
  decision and why), `docs/DEPLOY-VERCEL.md` (a from-scratch Vercel deploy),
  `docs/art-inconsistency.md` (the measured art inconsistency), plus a
  rewritten `CLAUDE.md` and `README.md`.
- `npm run smoke` — one live LLM call to check key/baseURL/model — and
  `npm run smoke -- --all`, which generates all nine reader x service readings
  and greps them for eleven Malay-only words.

### Changed

- **Reading length is controlled per paragraph, not per reading.** A
  whole-reading word budget did not hold: Margaret ran 238–298 words against a
  stated 140–180 while Adrian obeyed at 128. A ceiling the model can count as
  it writes — 2–3 sentences and at most 40 words per paragraph — landed all
  three readers at 128–169 words, and `MAX_TOKENS.spread3` came down from 1100
  to 650 as a runaway guard rather than a length control.
- **Card names stay English** because the artwork has its title rendered into
  the image. This is an explicit prompt rule; the model otherwise invents names
  like "Pulan" for The Moon.
- All reader-facing copy is Indonesian, not Malay: `karier`, `arah hidup`,
  `ngobrol`, `kamu`.
- The no-therapy/no-diagnosis constraint moved from authoring time to
  generation time, enforced in `src/lib/prompt/base.ts`.
- `next.config.ts` serves `/cards/*` with a one-year `immutable` cache.

### Fixed

- **The draw screen read the wrong cards.** Caught by driving the real page in
  a same-origin iframe and diffing the outgoing request body against the
  rendered `alt` text — the page looked correct and the request was wrong.
- **Hydration mismatch from shuffling in a `useState` initialiser.**
  `shuffleDeck()` is impure, so it produced one deck on the server and another
  on the client; the querent saw one spread and was read a different one. The
  deck now starts in fixed order and shuffles in an effect.
- **The fan was dead in development.** A side effect inside a `setState`
  updater fired twice under StrictMode and cancelled itself out. The drag is
  read from a ref instead.
- **`container-type` does not make an element its own container.** `CardBack`
  is split into `.back` (declares the container) and `.plate` (a descendant, so
  its `cqw` resolves as intended).
- The production build was unblocked by pinning TypeScript to 5.x — 7.x ships
  no full compiler JS API and dies in `next build` after a green `typecheck`.
- Control characters in the committed design export are written as escapes.

### Removed

- The Expo/React Native toolchain, EAS, TestFlight and the App Store path,
  along with `docs/TESTING-MACOS.md`. All still present on `feat/ios`.
- Two superseded design exports; the Clickable export is the single visual
  reference. Both remain in history at `d7fdd89`.

[v0.7.0]: https://github.com/miftahulmahfuzh/JMTarot/releases/tag/v0.7.0
[v0.6.0]: https://github.com/miftahulmahfuzh/JMTarot/releases/tag/v0.6.0
[v0.5.0]: https://github.com/miftahulmahfuzh/JMTarot/releases/tag/v0.5.0
[v0.4.0]: https://github.com/miftahulmahfuzh/JMTarot/releases/tag/v0.4.0
[v0.3.0]: https://github.com/miftahulmahfuzh/JMTarot/releases/tag/v0.3.0
[v0.2.0]: https://github.com/miftahulmahfuzh/JMTarot/releases/tag/v0.2.0
[v0.1.0]: https://github.com/miftahulmahfuzh/JMTarot/releases/tag/v0.1.0
