# z.ai vs OpenAI, measured 2026-07-27

**Why this exists.** V9's Task 0 established that z.ai's GLM Coding Plan is
*"strictly limited to use within officially supported tools and products"*, and
JMTarot is not one of them. The exposure is not an overage charge — it is **key
revocation, which takes the whole application down at once**, because one key is
behind readings, moderation, gists, day summaries, frequency verdicts, the Lotus
distillation and (soon) translations. `src/lib/llm/openai.ts` exists so that risk
is one env var rather than an outage.

**This file records what the second provider actually does**, so the decision is
made on numbers instead of nerves. Everything below was measured with the app's
own tools — `npm run smoke -- --all --locale id` and `npm run probe:moderation` —
not from documentation.

**Nothing is switched.** `LLM_PROVIDER=zai` remains the default.

> **THIS FILE GREW BY ACCRETION AND CONTAINS FOUR RECOMMENDATION SECTIONS. §19
> IS THE CURRENT ONE.** §5, §9 and §13 are kept because their reasoning is still
> sound and their measurements are still true, but each was written when fewer
> models had been tested and **each names a different emergency fallback than the
> one now chosen.** §9 gives the slot to `gpt-5.4-nano` on cost and speed; that
> was reversed once reading quality was set above both, because nano's 1.05
> sentence ratio is three readers sharing one architecture. §13 gives it to
> `gpt-5.6-luna`; that was reversed by a provider §13 had not tested.
>
> **The decision, in one line: the emergency fallback is
> `gemini-3.5-flash-lite` (`LLM_PROVIDER=gemini`, PAID TIER — §18), and the
> default stays z.ai.** Ladder below it: `gpt-5.6-luna` with
> `OPENAI_REASONING_EFFORT=none`, then `gpt-4.1-mini`, then
> `gemini-3.1-flash-lite`, then `gpt-5.4-nano`, and never `gpt-5.4-mini`.
>
> **AND EVERY OVERLAP NUMBER ABOVE §14 IS PARTLY MEASURING VERBOSITY.** §15.2–15.3
> found that `jaccard()` has no length normalisation, so a model writing shorter
> paragraphs scores better on that ground alone — and that z.ai's `0.050`, used as
> the pass mark in §§4, 8, 11 and 13, is a single favourable measurement that came
> back at **0.068** when re-run. Three rounds of evaluation treated a datapoint as
> a threshold. **Quote the length-controlled figures in §15.3, or none.**
>
> **The title is now wrong.** §§14-19 are about Google Gemini, which is neither
> z.ai nor OpenAI, and `gemini-3.5-flash-lite` is the first model in this file to
> reach z.ai's reader-overlap bar. Retitle when someone is passing.

---

## 1. The short version

| | z.ai (`glm-4.6` / `glm-4.5-flash`) | OpenAI (`gpt-4.1-mini` / `gpt-4.1-nano`) |
|---|---|---|
| Reading TTFT, p50 | **4591 ms** | **546 ms** |
| Classifier p95 | 903 ms | **813 ms** |
| Classifier corpus | 36/42 | **20/20** |
| Classifier JSON stability @ t=0 | 10/10 identical | **10/10 identical** |
| `input_tokens` reported | **no** (always `0` → NULL) | **yes** |
| Reader overlap, `spread3` | **0.050** | 0.079 – 0.093 |
| Word-ceiling / framing failures | 0 | **3 per run, Adrian, reproducible** |
| Malay leakage in `id` | none | none |
| Cost model | prepaid quota, no cap possible | pay-as-you-go, **cap possible** |

**OpenAI is faster, cheaper to reason about, and better instrumented. It is
currently WORSE at the one thing this product is built on: three readers who do
not sound like each other.**

---

## 2. Speed: OpenAI is not slightly faster, it is eight times faster

```
                       z.ai        OpenAI
reading TTFT p50      4591 ms       546 ms
reading TTFT p95         —          851 ms
classifier p50         617 ms       602 ms
classifier p95         903 ms       813 ms
```

**This inverts W7's D8 premise, and `probe:moderation` reports it as a FAILURE
that is not one.** D8 says the moderation classifier must return before the
reading's first token, so the gate hides behind latency the querent is paying
anyway. On z.ai that was easy: 903 ms against 4591 ms. On OpenAI the reading
starts in 546 ms, so nothing hides behind it and the probe prints
`*** D8 PREMISE FAILS ON THIS MODEL ***`.

**Read what that actually means.** The premise fails because the *reading got
dramatically faster*, not because the gate got slower. Absolute time to the
querent's first word:

```
z.ai     max(903, 4591)  ≈ 4591 ms
OpenAI   max(813,  546)  ≈  813 ms
```

Five times better, while still being fully moderated. The gate stops being free
and starts costing ~270 ms — and that is a real cost, honestly stated, against a
4-second saving.

**`MODERATION_TIMEOUT_MS=1500` would need re-deriving.** It came from z.ai's p95
of 903 ms. On OpenAI, ~900 ms covers the classifier's p95 with headroom. Do not
set it to the probe's suggested 546 ms: that is the reading's p50, and using it
would time the classifier out on roughly a third of calls, pushing W7's
asymmetric fail rule into service constantly.

---

## 3. Cost: a tenth of a US cent per reading

Measured token counts, from a real `--all --locale id` run:

```
service    input tokens   output tokens
daily        1163–1274        128–173
spread3      1628–1742        220–287
yesno        1209–1274         70–110
```

At `gpt-4.1-mini` ($0.40 / $1.60 per 1M) and `gpt-4.1-nano` ($0.10 / $0.40):

```
one reading      ~1400 in + ~170 out    ≈ $0.00083
one classifier    ~700 in +  ~20 out    ≈ $0.00008
one gist          ~600 in +  ~40 out    ≈ $0.00030
                                        ─────────
a full visit                            ≈ $0.0012   (~0.12 US cents)
```

So **1000 readings a day is roughly $36/month**, and the app's actual traffic is
nowhere near that. At a hundred readings a day it is under $4.

**AND THE SPEND CAP THAT DOES NOT EXIST ON Z.AI DOES EXIST HERE.** V9 rewrote
`DEPLOY-VERCEL.md` §2b around the fact that a prepaid subscription has no bill to
cap. That is a z.ai fact, not a general one: an OpenAI project takes a hard
monthly budget limit. **If the provider is ever switched, §2b's premise flips
back and a cap becomes a required deployment step again.**

**`LLM_WINDOW_CALL_CEILING=280` would also need re-deriving.** It is
400-prompts-per-5-hours × 70%, which is a z.ai quota fact. On OpenAI there is no
5-hour cycle; the constraint is money, so the ceiling would be sized from dollars
per day instead. The mechanism in `src/lib/llm/meter.ts` still applies unchanged
— only the number's justification changes.

---

## 4. Quality: the one place OpenAI is worse, and it is the important one

### Reader distinctness regressed, and it is not variance

```
mean pairwise reader overlap, spread3, plain
  z.ai      0.050
  OpenAI    0.093  (run 1)
            0.079  (run 2)
```

CLAUDE.md states the rule this threatens: *"If the three readers ever stop being
distinguishable with the names covered, fix those persona paragraphs, not the
code."* Roughly **1.7× more overlap** is a real move in the wrong direction on the
metric the product is built on.

The sentence-length proxy shows where it comes from:

```
mean sentence words     thessaly   margaret   adrian     margaret/thessaly
z.ai                      10.2       19.1      13.8          1.87
OpenAI run 1              12.3       19.1      16.5          1.55
OpenAI run 2              12.4       19.5      17.3          1.57
```

Margaret is unchanged. **Thessaly and Adrian both drift UP toward her**, so the
three voices compress into two-and-a-bit. Adrian at 17.3 words per sentence is
supposed to be the short, casual one; he is now closer to Margaret than to
Thessaly. The `Margaret ≥ 1.5 × Thessaly` proxy still passes, at 1.55–1.57
against 1.87 — passing, with much less room.

### Three contract failures, reproducible across both runs

```
FAIL  id adrian/spread3: position framing missing: "Yang bakal dateng"
FAIL  id adrian/spread3: paragraph 4 is 43 words, ceiling is 40
FAIL  id adrian/daily:   paragraph 2 is 61 words, ceiling is 55
```

The framing one is the substantive failure and it **reproduced in both runs**, so
it is systematic. The prompt fixes the position labels (`Yang menanti di depan`);
the model substituted a colloquial paraphrase because Adrian's persona rules push
it that way. It is in-voice and it is still a contract violation — the labels are
an interface, and `positionFraming` is dual-role copy the screen also renders.

The word-ceiling overshoots are 1–6 words and are the ordinary kind of drift the
ceilings exist to catch.

### What did NOT regress

- **No Malay leakage.** The eleven-word `id` grep is clean across both runs.
- **No therapy language**, no card-name translation, no invented "Pulan".
- **Classifier quality is better**: 20/20 on the corpus where `glm-4.5-flash`
  managed 36/42, with byte-identical JSON at temperature 0.

---

## 5. The honest recommendation *(SUPERSEDED BY §13 — two models had been tested when this was written)*

**Do not flip the default today. Do make the switch a rehearsed one-liner, which
it now is.**

1. **Keep `LLM_PROVIDER=zai`** for readings while the voices are tuned. The
   overlap regression is the product, and shipping it to fix a risk that has not
   materialised trades a certain loss for an uncertain one.
2. **The revocation risk is still real and still unaddressed by that choice.**
   What has changed is that the fallback is now built, tested and measured: on
   the day the key dies, `LLM_PROVIDER=openai` + `LLM_MODEL=gpt-4.1-mini` is a
   dashboard edit, and the app comes back with three slightly-less-distinct
   readers instead of no app.
3. **Consider a SPLIT before a full switch.** The classifier is the strongest
   case for moving now: `gpt-4.1-nano` is faster, more accurate on the corpus,
   and costs ~$0.00008 a call — and moving it alone takes load off the z.ai quota
   without touching a single word of reader prose. `MODERATION_MODEL` already
   overrides per call; what it cannot yet do is override the *provider*, which is
   the one interface change a split would need.
4. **If the readings do move, the tuning work is in the persona paragraphs**, per
   CLAUDE.md — specifically Adrian's, whose sentence length and position-framing
   drift are both his. Not in the adapter, and not in the ceilings.

---

## 6. What the adapter does and does not do

`src/lib/llm/openai.ts`, ~230 lines, **no new dependency** — plain `fetch`
against Chat Completions. A second vendor SDK for one adapter is not worth it in
a project with eleven runtime dependencies; the cost of that choice is that the
SSE parsing is ours, which is why `openai.test.ts` drives it with hand-built
chunk boundaries including a frame split mid-line. That test fails against the
naive `chunk.split('\n')` parser everyone writes first — verified.

Four things it does differently from `anthropic.ts`, each because the wire format
demands it: `max_completion_tokens` rather than `max_tokens` (the newer models
reject the old name), `system` as a message, `stream_options: {include_usage:
true}` or usage never arrives, and no `nonZero()` — OpenAI's `input_tokens` are
real, so a zero would be a fact worth seeing rather than noise worth hiding.

**Not done:** the provider is global, so a split (OpenAI classifier + z.ai
readings) is not yet expressible. `LLM_BASE_URL` remains Anthropic-only and the
OpenAI adapter reads `OPENAI_BASE_URL`; pointing the first at OpenAI will not
work and the `.env.example` comment says so.

---

# The GPT-5 reasoning family: `gpt-5.6-luna` and `gpt-5.4-nano`, measured 2026-07-27

**Why this addendum exists.** Sections 1–6 above evaluated `gpt-4.1-mini` and
concluded that the fallback works but costs reader distinctness. The obvious next
question is whether a newer OpenAI model closes that gap. Two were tested, in the
order Miftah named them: `gpt-5.6-luna` first, then `gpt-5.4-nano`.

**The instruction that framed this evaluation, and it changes what counts as a
result:** *reading quality is the top priority, above cost and above speed.* A
model that is cheap and fast and flattens the three readers is a failure for this
product, and is reported as one below.

Everything here was measured with the app's own tools — two full
`npm run smoke -- --all --locale id` runs per model, `npm run probe:moderation`,
plus direct `curl`/`fetch` probes against `/v1/chat/completions` for the things the
app's tooling cannot see. Where a number is derived rather than measured it says so.

---

## 7. `gpt-5.6-luna` is BLOCKED, twice over, and the blocks are not tuning problems

### 7.1 It spends the app's token ceiling on reasoning, and readings come back truncated or blank

**This is the finding that ends the evaluation, and it is a compatibility failure
rather than a quality one.** `MAX_TOKENS` in `src/lib/prompt/services.ts` is 500 /
650 / 350 for `daily` / `spread3` / `yesno`, sized as runaway guards at roughly
double the intended prose length. On a reasoning model `max_completion_tokens`
bounds **reasoning tokens plus visible content together**, and `gpt-5.6-luna`
reasons by default. The reasoning comes first. When it does not finish in budget,
there is no content left to emit.

Measured by posting the app's own nine `id` prompts — built through `buildPrompt`,
at each service's real ceiling — non-streamed, so `completion_tokens_details` is
visible:

```
                       ceiling  completion  reasoning  finish   chars
thessaly/daily            500       214        102     stop      493
margaret/daily            500       500        500     length      0   <-- BLANK
adrian/daily              500       199         81     stop      525
thessaly/spread3          650       587        378     stop      939
margaret/spread3          650       635        333     stop     1249
adrian/spread3            650       650        650     length      0   <-- BLANK
thessaly/yesno            350       137         54     stop      330
margaret/yesno            350       171         75     stop      394
adrian/yesno              350       145         60     stop      357
```

**Two of nine returned zero characters.** Not a short reading, not a degraded
reading — an empty string, with `finish_reason: "length"` and the entire budget
consumed by reasoning the user never sees. There is nothing in the app that would
report this as an error: `streamReading` yields no chunks, the stream closes
normally, and `[Bacaan terputus...]` is not appended because nothing was
interrupted. The querent picks three cards and gets a blank page.

The streaming path in the real smoke runs confirms it at the app's own boundary.
**Four of eighteen readings across the two runs hit their ceiling exactly and were
cut off mid-word**, which is the visible half of the same problem:

```
run 1  margaret/spread3  out=650/650   543 chars, ends "...Ada vitalitas yang"
run 1  adrian/spread3    out=650/650   583 chars, ends "...yang kamu geng"
run 2  margaret/spread3  out=650/650   170 chars, ONE sentence of a four-paragraph spread
run 2  margaret/daily    out=500/500   515 chars, ends "...Setelah itu, bi"
```

Run 2's `margaret/spread3` is the worst case and it is worth reading twice: 650
tokens spent, 170 characters delivered, one opening clause where a four-paragraph
reading was contracted. The mechanical checks caught it as five separate
violations — two missing card names, two missing position framings, a 24-word
total against a 105–210 budget — none of which is a prompt problem. The prompt was
fine. The model never got to the prose.

**`reasoning_effort: "none"` fixes it completely.** Same nine prompts, same
ceilings, one extra request field:

```
                       ceiling  completion  reasoning  finish   chars
thessaly/daily            500       103          0     stop      488
margaret/daily            500       145          0     stop      662
adrian/daily              500       121          0     stop      562
thessaly/spread3          650       181          0     stop      866
margaret/spread3          650       305          0     stop     1323
adrian/spread3            650       213          0     stop      944
thessaly/yesno            350        76          0     stop      353
margaret/yesno            350        90          0     stop      380
adrian/yesno              350        72          0     stop      316
```

Nine of nine `stop`, zero reasoning tokens, every reading complete and comfortably
inside budget. **So the fix is real and it is one field — but it is a field
`src/lib/llm/openai.ts` does not send, and cannot send today**, because
`LLMCallOpts` has no place to put it. `"minimal"` is rejected; the API's own error
enumerates the accepted set as `'none', 'low', 'medium', 'high', 'xhigh'`, and
`"low"` still reasons (49 tokens on a small probe), so `"none"` is the only value
that makes the ceilings safe. **Any future attempt to run a GPT-5-family model as
the reading model has to make this an adapter change first.** Measuring quality
before that change is measuring a broken configuration.

**A warning about how this hides.** A trivial probe does not reproduce it. A
5-token probe returns empty content and looks like a hard incompatibility; a
650-token probe on a one-line Indonesian prompt returns 79 tokens with
`reasoning_tokens: 0` and looks completely healthy. Reasoning volume scales with
prompt complexity, and JMTarot's system prompts are long, heavily-constrained,
three-layer assemblies. **The failure only appears on the real prompts**, which is
why the probe above was built against `buildPrompt` rather than against a
hand-written test sentence.

### 7.2 It cannot run the moderation classifier at all — `temperature: 0` is rejected

Independent of the ceilings, and a hard 400:

```
Unsupported value: 'temperature' does not support 0 with this model.
Only the default (1) value is supported.
```

`src/lib/moderation/classify.ts:317` sets `temperature: 0`, and W7's whole
justification for trusting a small model's JSON rests on that zero — section 3 of
the classifier's own header records 10/10 byte-identical output at temperature 0 as
the reason the tolerant parser is a safety net rather than a load-bearing part.
`npm run probe:moderation` with `MODERATION_MODEL=gpt-5.6-luna` dies on probe 1:

```
Error: openai: HTTP 400
    at post (src/lib/llm/openai.ts:105:11)
```

**And note what that error does not say.** The adapter deliberately reads the
error body and throws it away, because an OpenAI error echoes the request and the
request contains the querent's question — the rule `flush.ts` and the moderation
path both state in caps. That is the right call and it should not change. The
consequence, worth writing down, is that **an unsupported-parameter 400 is
indistinguishable in production logs from a bad key, a rate limit or a malformed
body.** Anyone changing `MODERATION_MODEL` should `curl` the model once by hand
before deploying, because the app will not tell them which 400 they have.

`gpt-5.4-nano` accepts `temperature: 0` normally, so this is a `5.6`-family
restriction and not an OpenAI-wide one.

### 7.3 What quality signal there is, and why it should not be trusted

The two smoke runs completed and printed numbers. They are recorded here for
completeness and they should not be used to decide anything, because a third of
the `spread3` corpus was truncated and **truncation mechanically deflates the
overlap metric** — a reading of 24 words shares few tokens with anything.

```
                          run 1    run 2     z.ai    gpt-4.1-mini
reader overlap, spread3   0.072    0.052    0.050    0.079-0.093
mean sentence words
  thessaly                 14.9     15.2     10.2       12.4
  margaret                 21.6     18.3     19.1       19.5
  adrian                   16.6     16.6     13.8       17.3
```

Run 2's 0.052 sits right on z.ai's 0.050 and is the single most tempting number in
this document. It is an artefact: the reading that contributed to it was one
clause long. The 0.072/0.052 spread across two runs of the same configuration is
itself the evidence that neither is a measurement of anything stable.

Both blind reads scored **3/3** (guesses recorded before the key: A=margaret,
B=adrian, C=thessaly, both runs). That is also compromised. In run 2 Margaret's
reading was identifiable partly *because* it was the broken one — a single
literary clause with nothing after it. Getting three of three by recognising the
truncation is not the test passing.

**Malay leakage: zero across both runs.** The eleven-word `id` grep is clean, as
it was for z.ai and `gpt-4.1-mini`. The prose that did arrive was good Indonesian
in the right register; nothing about §7 is a complaint about luna's writing.

One cosmetic oddity, seen once and not reproduced: an early one-line probe
appended the fragment `Cepat jawab.` ("answer quickly") to an otherwise clean
paragraph — an instruction leaking into output. It did not appear in any of the
eighteen real readings and is noted only so a future session that sees it knows it
has been seen before.

### 7.4 The reasoning tokens also destroy the speed advantage, and they are billed

Time to first token, from the 18 smoke readings (`[N chunks, first after Xms]`):

```
                    p50 TTFT     min      max
gpt-5.6-luna         3232 ms    1204     5629
  by service:  yesno  ~1300 ms
               daily  ~2500 ms
             spread3  ~4130 ms
gpt-5.4-nano          650 ms     559     1101
z.ai / glm-4.6       4591 ms       —        —
```

**The correlation with reasoning volume is the whole story.** `yesno` reasons
lightly and starts in 1.3s; `spread3` reasons hardest and starts in 4.1s, which is
indistinguishable from z.ai's 4591ms. Section 2 above sold OpenAI as "eight times
faster"; on a reasoning model at the app's longest service, **that advantage is
gone.** Reasoning tokens are emitted before the first content delta, so the user
waits through all of them.

They are also paid for. Measured, not assumed: `completion_tokens` *includes*
`reasoning_tokens` — the blank `adrian/spread3` above reports
`completion=650, reasoning=650` — and `completion_tokens` is the number the output
price applies to. **So on `gpt-5.6-luna` the app would be billed $6/1M for tokens
the querent never sees, and on two of nine calls it would be billed the entire
ceiling for a blank page.**

### 7.5 Verdict on `gpt-5.6-luna`

**NOT USABLE as the reading model today, and not usable as the classifier at all.**
Two independent blockers, neither of them about writing quality:

1. Reasoning tokens consume `MAX_TOKENS`, producing truncated and sometimes
   **completely empty** readings, silently. Fixable only by teaching the adapter
   to send `reasoning_effort: "none"`.
2. `temperature: 0` is rejected, so `MODERATION_MODEL=gpt-5.6-luna` is a hard 400.
   Not fixable without removing the determinism W7 depends on.

Its writing is not the problem and may well be the best of the three OpenAI models
tried — that question is simply **unanswered**, because it cannot be asked until
(1) is fixed. If someone wants the answer, the order is: add `reasoningEffort` to
`LLMCallOpts`, send `"none"`, re-run `--all --locale id` twice, and only then read
the overlap number.

---

## 8. `gpt-5.4-nano` runs correctly and flattens the readers worse than `gpt-4.1-mini`

### 8.1 No compatibility problems

Nine of nine real prompts at their real ceilings: `reasoning_tokens: 0` by default,
`finish_reason: stop` every time, output 84–313 tokens against ceilings of 350–650.
`temperature: 0` accepted. `reasoning_effort: "none"` accepted and makes no
difference, because it is already the effective behaviour. No truncation in any of
the 18 streamed readings. **Mechanically, this model is a drop-in.**

### 8.2 The voices collapse, and this is the finding that decides it

```
mean pairwise reader overlap, spread3, plain
  z.ai            0.050          <-- the bar
  gpt-4.1-mini    0.079, 0.093
  gpt-5.4-nano    0.082, 0.077
```

`gpt-5.4-nano` lands **squarely inside `gpt-4.1-mini`'s band**, 1.6× z.ai's
overlap. Two runs, tight agreement, so this is not variance. On the metric this
product is built on, the newer cheaper model is **not an improvement over the model
section 5 already declined to ship.**

The sentence-length proxy is where it gets worse rather than merely equal:

```
mean sentence words     thessaly   margaret   adrian    margaret/thessaly
z.ai                      10.2       19.1      13.8         1.87
gpt-4.1-mini run 1        12.3       19.1      16.5         1.55
gpt-4.1-mini run 2        12.4       19.5      17.3         1.57
gpt-5.4-nano run 1        15.3       16.9      16.4         1.10
gpt-5.4-nano run 2        15.5       16.2      16.4         1.05
```

**Read the last column.** Section 4 described `gpt-4.1-mini`'s failure mode as
Thessaly and Adrian drifting up toward Margaret while Margaret held at 19.1. On
`gpt-5.4-nano` the drift continues *and Margaret comes down to meet them*. At
16.2 / 15.5 / 16.4 the three readers have **the same sentence architecture**, and
in run 2 Adrian writes the longest sentences of the three — Adrian, whose entire
persona is the short casual one.

CLAUDE.md states the rule this breaks: *"mean sentence length (Margaret must stay
1.5× Thessaly)"*, and calls the three voice proxies checks that "FAIL loudly".
**A ratio of 1.05 fails that rule by a wide margin. It did not print.** See §8.5 —
the check exists, it fires, and its output is thrown away.

### 8.3 The blind read scores 3/3 anyway, and that is worth being careful about

Guesses recorded before the key, both runs: **A=margaret, B=adrian, C=thessaly.
3/3 and 3/3.**

**Do not read that as the quality gate passing.** What separated the three was
almost entirely *lexical register*: Adrian's `nggak / udah lewat / pengin /
bakal dateng`, Thessaly's imperatives and measurable weekly framing
(`jadwalkan evaluasi singkat tiap akhir minggu`), Margaret's card-image openings
(`Tokohnya menghadap...`). Those survive because they are stated as explicit
vocabulary rules in the persona blocks.

What did *not* survive is the thing the personas describe as their core: Margaret's
long subordinated sentences. Recognising her by "she mentions the picture on the
card" instead of by how she writes is a narrower margin than 3/3 suggests, and it
is the margin that erodes next. **The overlap number and the ratio are the leading
indicators here; the blind read is the lagging one.** Trusting the blind read alone
would have passed this model.

### 8.4 The mechanical failures, both runs

```
run 1                                                          run 2
FAIL id margaret/daily: paragraph 1 is 69 words, ceiling 55    FAIL id thessaly/spread3: paragraph 4 is 47 words, ceiling 40
FAIL id margaret/daily: total 122 words, budget 50-115         FAIL id margaret/daily: paragraph 1 is 64 words, ceiling 55
FAIL id adrian/spread3: paragraph 4 is 44 words, ceiling 40    FAIL id margaret/daily: total 119 words, budget 50-115
                                                               FAIL id margaret/spread3: paragraph 4 is 57 words, ceiling 55
```

`margaret/daily` overshooting its 55-word paragraph ceiling is the one that
reproduces across both runs (69 and 64 words), and it drags the reading total over
its band both times. Everything else is the ordinary 4–17 word drift the ceilings
exist to catch. **Notably absent: the `position framing missing: "Yang bakal
dateng"` failure that `gpt-4.1-mini` produced reproducibly on adrian/spread3.**
`gpt-5.4-nano` renders the position labels correctly, and section 4's substantive
contract failure does not reproduce here. That is a genuine improvement, on a
smaller axis than the one that matters.

**Malay leakage: zero across both runs.**

### 8.5 A bug in the smoke script that this evaluation depended on noticing

**`scripts/smoke-llm.ts` collects the three voice-proxy failures into `failures`
AFTER it has already printed and counted that array.** `MECHANICAL CHECKS` prints
at line 385; the `Margaret's sentences are not 1.5x Thessaly's` push is at line
502, the reader-forbidden-word push at 483, and the contraction pushes at 522/525.
Nothing reads `failures` again afterwards, and violations do not set an exit code
either — all four runs in this evaluation exited 0.

So CLAUDE.md's *"Three voice proxies print every run and FAIL loudly"* is half
true: they print, and they cannot fail. Nobody noticed because every model tried
until now passed the ratio anyway — z.ai at 1.87, `gpt-4.1-mini` at 1.55–1.57.
**`gpt-5.4-nano` at 1.05 is the first configuration to actually trip it, and the
app told nobody.** This was caught by reading the printed proxies against the rule
by hand.

Fixing it is out of scope here — it is one moved block — but it should be fixed
before the next model evaluation, because the next one may not have a human
comparing three printed numbers against a sentence in CLAUDE.md.

### 8.6 Classifier: good, and slower than the incumbent

`npm run probe:moderation` with `MODERATION_MODEL=gpt-5.4-nano`:

```
                    p50      p95     corpus    JSON at t=0
glm-4.5-flash      617ms    903ms    36/42     10/10 identical
gpt-4.1-nano       602ms    813ms    20/20     10/10 identical
gpt-5.4-nano       926ms   1315ms    20/20     10/10 identical
```

20/20 corpus agreement and one distinct output across ten runs at temperature 0,
with zero parse failures — quality-wise it is as good as `gpt-4.1-nano`. It is
**~60% slower at p95**, which matters in one concrete way: `MODERATION_TIMEOUT_MS`
is currently 1500, and a p95 of 1315ms leaves 185ms of headroom. **That is not
enough**; it would need to go to ~1800, or the classifier would time out into W7's
asymmetric fail rule on a noticeable slice of calls. `gpt-4.1-nano` remains the
better choice for this role, and it is cheaper.

**The probe printed `*** D8 PREMISE FAILS ON THIS MODEL ***`, and section 2's
reading of that stands unchanged.** It failed because the reading got fast, not
because the gate got slow: classifier p95 1315ms against a reading TTFT p50 of
741ms. Absolute time to the querent's first word is `max(1315, 741) ≈ 1315ms`
against z.ai's ~4591ms — still three and a half times better, fully moderated.
Do not take the probe's `suggested MODERATION_TIMEOUT_MS = 741`; that is the
reading's p50 and it would time out the classifier most of the time.

### 8.7 Cost

Published pricing per 1M tokens, read 2026-07-27 from
`developers.openai.com/api/docs/pricing`:

```
                  input   cached input   output
gpt-5.6-luna      $1.00      $0.10       $6.00
gpt-5.4-nano      $0.20      $0.02       $1.25
gpt-4.1-mini      $0.40         —        $1.60
gpt-4.1-nano      $0.10         —        $0.40
```

Measured means over the 18 `id` readings per model, and **`reasoning_tokens` are
inside `completion_tokens`, so they are billed at the output rate** — measured,
per §7.4, not assumed:

```
                  mean input   mean output   $ / reading
gpt-5.6-luna         1374          390        $0.00371     (~105 of those output tokens
                                                            per reading are invisible
                                                            reasoning, ~$0.0006 wasted;
                                                            on a blank reading, all of it)
gpt-5.4-nano         1371          172        $0.00049
```

Full visit, one reading + one classifier call (~700 in / ~20 out) + one gist
(~600 in / ~40 out):

```
gpt-4.1-mini + gpt-4.1-nano   ≈ $0.0012    (section 3, for reference)
gpt-5.4-nano throughout       ≈ $0.00082
gpt-5.6-luna throughout       ≈ $0.0060    (hypothetical -- it cannot run the
                                            classifier, and its readings truncate)
```

**`gpt-5.4-nano` is the cheapest configuration measured, ~30% under the
`gpt-4.1-mini` pairing.** `gpt-5.6-luna` is ~5× more expensive than that pairing,
before counting that some of what it bills is a blank page.

Cost is the least interesting section of this document and it is placed last on
purpose. Reading quality is the priority; a 30% saving on 0.12 US cents is not a
reason to ship converged readers.

### 8.8 Verdict on `gpt-5.4-nano`

**MECHANICALLY USABLE, PRODUCT-WISE A REGRESSION. Do not adopt it as the reading
model.** It runs cleanly, it is the cheapest and fastest thing tested, it fixes
`gpt-4.1-mini`'s position-framing bug, and it has zero Malay leakage. And it
delivers **0.077–0.082 overlap against z.ai's 0.050**, with the
Margaret-to-Thessaly sentence ratio collapsed from 1.87 to **1.05** — three readers
with one sentence architecture, distinguishable now only by slang and imperatives.

It is a **fine emergency fallback** — better than nothing, and better than
`gpt-4.1-mini` on contract compliance — and it would be a bad default.

---

## 9. Where this leaves the decision *(SUPERSEDED BY §13 — it names `gpt-5.4-nano` as the fallback on cost; reading quality reversed that)*

**Nothing changes. `LLM_PROVIDER=zai`, `LLM_MODEL=glm-4.6` remains the default,
and z.ai's 0.050 overlap is still unbeaten by any OpenAI model tried.** The three
candidates now measured:

| | overlap, `spread3` | margaret/thessaly ratio | blind read | runs correctly |
|---|---|---|---|---|
| z.ai `glm-4.6` | **0.050** | **1.87** | 3/3 | yes |
| `gpt-4.1-mini` | 0.079 / 0.093 | 1.55 / 1.57 | — | yes, 3 contract FAILs |
| `gpt-5.4-nano` | 0.082 / 0.077 | **1.05 / 1.10** | 3/3 (register only) | yes |
| `gpt-5.6-luna` | not measurable | — | 3/3 (compromised) | **no** |

Three things are worth carrying forward.

**First, the fallback ladder should be reordered.** Section 5 named
`LLM_PROVIDER=openai` + `LLM_MODEL=gpt-4.1-mini` as the day-the-key-dies edit.
`gpt-5.4-nano` is a better emergency choice on everything except the sentence
ratio: it is 60% cheaper, faster, and does not reproduce the `Yang bakal dateng`
framing failure. Both are fallbacks and neither is a default.

**Second, the GPT-5 family needs an adapter change before it can be evaluated at
all.** `reasoningEffort` on `LLMCallOpts`, sent as `"none"`, is the prerequisite.
Until then, any reasoning model behind `MAX_TOKENS` of 350–650 will silently
return blank readings — and `gpt-5.6-luna`'s actual writing quality, which may be
the best of the three, remains an open question rather than a negative result.

**Third, every OpenAI model tried converges the readers, and the pattern is now
three-for-three.** That is starting to look like a property of the family rather
than of any one model: z.ai's `glm-4.6` separates these personas better than
`gpt-4.1-mini`, `gpt-4.1-nano`'s sibling, or `gpt-5.4-nano`. CLAUDE.md's
instruction — *"if the three readers ever stop being distinguishable, fix the
persona paragraphs, not the code"* — is the right response if the provider ever has
to change. The paragraphs are calibrated against one model's instruction-following,
and Margaret's long-subordinated-sentence rule is the one that does not transfer.

---

# The GPT-5 family, re-measured with `reasoning_effort: none`: `gpt-5.6-luna` and `gpt-5.4-mini`, 2026-07-27

**Why this addendum exists.** Section 7 ended with a question it could not ask.
`gpt-5.6-luna` was blocked by two things that were not about writing —
reasoning tokens eating `MAX_TOKENS`, and a `temperature: 0` rejection — and §7.5
said the order of work was: teach the adapter to send `reasoning_effort`, then
re-run, then read the overlap number. **That has now happened.** `LLMCallOpts`
carries `reasoningEffort`, `src/lib/llm/openai.ts` sends `reasoning_effort`, and
`OPENAI_REASONING_EFFORT=none` was set for every measurement below.

Two models this round: `gpt-5.6-luna`, whose quality §7 left as an open question,
and `gpt-5.4-mini`, which sits between `gpt-5.4-nano` and luna in the same family.

**The framing instruction is unchanged and it decides the verdicts:** *reading
quality is the top priority, above cost and above speed.* Both models below are
fast and both are competent. Neither of those facts appears in the verdicts,
because neither is what this section is measuring.

**Three `npm run smoke -- --all --locale id` runs per model, not two.** The plan
called for two; a third was added after `gpt-5.4-mini`'s second run returned an
overlap of 0.121 against 0.092, which is too wide a spread to build a verdict on.
The third run resolved it, and it also caught something no previous evaluation
had seen — see §10.3.

---

## 10. Both compatibility blockers are gone, and the second one dissolved for a reason worth writing down

### 10.1 `reasoning_effort: none` holds at the real ceilings, on both models

The §7.1 probe re-run against `buildPrompt`'s real nine `id` prompts, at each
service's real `MAX_TOKENS`, non-streamed so `completion_tokens_details` is
visible, with `reasoning_effort: "none"` on every request:

```
                       ceiling   in   completion  reasoning  finish   chars
gpt-5.6-luna
  thessaly/daily          500   1158      97          0      stop      422
  margaret/daily          500   1272     127          0      stop      592
  adrian/daily            500   1208     126          0      stop      584
  thessaly/spread3        650   1633     202          0      stop      951
  margaret/spread3        650   1751     253          0      stop     1073
  adrian/spread3          650   1683     198          0      stop      895
  thessaly/yesno          350   1159      66          0      stop      298
  margaret/yesno          350   1273     100          0      stop      419
  adrian/yesno            350   1209      73          0      stop      332
gpt-5.4-mini
  thessaly/daily          500   1158     116          0      stop      512
  margaret/daily          500   1272     185          0      stop      815
  adrian/daily            500   1208     149          0      stop      638
  thessaly/spread3        650   1633     248          0      stop     1063
  margaret/spread3        650   1751     304          0      stop     1285
  adrian/spread3          650   1683     247          0      stop     1017
  thessaly/yesno          350   1159      73          0      stop      342
  margaret/yesno          350   1273     100          0      stop      400
  adrian/yesno            350   1209     107          0      stop      441
```

**Eighteen of eighteen `stop`. `reasoning_tokens: 0` everywhere. Zero blank
readings.** Compare §7.1's table, where two of nine came back as an empty string
with the entire budget spent on reasoning.

The streaming path agrees across all six smoke runs — 54 readings, 27 per model.
Widest output against ceiling: `spread3` 200–336 against 650, `daily` 105–216
against 500, `yesno` 73–119 against 350. **Nothing came within 300 tokens of a
ceiling**, so there is no truncation to quantify and `EmptyReasoningError` was
never thrown. §7.1's failure mode is closed, on the real prompts, on both models.

### 10.2 The `temperature: 0` rejection was never a model restriction — it is a *reasoning-mode* restriction

This one was expected to still be broken. §7.2 recorded a hard 400 from luna on
`src/lib/moderation/classify.ts`'s `temperature: 0`, called it unfixable without
giving up the determinism W7 depends on, and the brief for this evaluation said
to expect `npm run probe:moderation` to die on probe 1 and move on.

**It did not die. It ran clean, 20/20 on the corpus.** Isolated with three
one-line `curl`s against `gpt-5.6-luna`, identical but for one field:

```
reasoning_effort absent   ->  400  "Unsupported value: 'temperature' does not
                                    support 0 with this model. Only the default
                                    (1) value is supported."
reasoning_effort "none"   ->  200  content "OK"
reasoning_effort "low"    ->  400  same message
```

So the constraint is not *"this model rejects temperature 0"*. It is **"this
model rejects temperature 0 while it is reasoning"**, and `"none"` takes it out
of reasoning mode. `"low"` still reasons, and still refuses — the same split
§7.1 found for the token ceilings, where `"low"` burned 49 tokens on a trivial
probe and only `"none"` was safe.

**The consequence is that one env var fixed two independent-looking blockers**,
and the second was misdiagnosed as a property of the model. Worth carrying
forward as a general caution: an OpenAI 400 on a reasoning model may be a
statement about the *mode*, not about the model, and the adapter's deliberate
policy of reading the error body and discarding it (right, for the reason
§7.2 gives) means the app can never tell you which. `curl` the model by hand.

---

## 11. Reading quality: `gpt-5.6-luna` is the best OpenAI model measured and still does not reach z.ai

### 11.1 Reader overlap, the number that decides it

```
mean pairwise reader overlap, spread3, plain, three runs each
  z.ai glm-4.6      0.050                     <-- the bar
  gpt-5.6-luna      0.077  0.085  0.075       mean 0.079
  gpt-5.4-mini      0.092  0.121  0.093       mean 0.102
  gpt-4.1-mini      0.079  0.093              (§4, n=2)
  gpt-5.4-nano      0.082  0.077              (§8, n=2)
```

**`gpt-5.6-luna` is the tightest OpenAI result in this document, and it is still
1.6× z.ai's overlap.** Three runs inside 0.075–0.085 is a genuinely stable
measurement, which none of the earlier two-run numbers were. It is also, honestly,
only a hair better than `gpt-4.1-mini`'s 0.079/0.093 — the two distributions
overlap, and anyone reading 0.079 against 0.086 as a real improvement is reading
noise. What separates them is elsewhere (§11.3 and §11.4), not here.

**`gpt-5.4-mini` is the worst OpenAI result in this document.** 0.102 mean, 2×
z.ai. One caveat stated rather than buried: the 0.121 run drew The Sun in all
three hands, and the metric is Jaccard over content words, so shared card names
inflate it. That is why a third run was added. At 0.092 and 0.093 the other two
runs are still above every other model tried, so the caveat softens the outlier
without rescuing the model.

### 11.2 Mean sentence words, and two different ways to fail the same rule

```
mean sentence words        thessaly   margaret   adrian    margaret/thessaly
z.ai glm-4.6                 10.2       19.1      13.8         1.87
gpt-5.6-luna run 1           12.3       20.6      14.8         1.68
gpt-5.6-luna run 2           11.9       19.3      14.6         1.62
gpt-5.6-luna run 3           13.6       19.8      16.4         1.46   <-- FAILS
gpt-5.4-mini run 1           12.5       22.6      15.6         1.81
gpt-5.4-mini run 2           12.5       21.7      18.3         1.74
gpt-5.4-mini run 3           12.3       24.2      20.6         1.97
```

**These two models fail the same rule from opposite directions, and the shapes are
worth separating.**

`gpt-5.6-luna` reproduces §4's `gpt-4.1-mini` pattern almost exactly: Margaret
holds near 19–20, Thessaly and Adrian creep up toward her. On run 3 Thessaly
reached 13.6 while Margaret slipped to 19.8, and the ratio landed at **1.46 —
below the 1.5 floor, and the voice proxy failed the run.** One failure in three
is not a stable pass; it is a configuration sitting on the line.

`gpt-5.4-mini` passes the ratio comfortably — 1.74 to 1.97, and run 3's 1.97 is
*better than z.ai's 1.87* — and this is the clearest example in this document of
why that ratio cannot be read alone. **Margaret does not hold at 19; she inflates
to 24.2. And Adrian follows her to 20.6.** Adrian, whose entire persona is the
short casual one, is writing longer sentences on `gpt-5.4-mini` than Margaret does
on `gpt-5.6-luna`. The ratio passes because both ends moved, and the rule it
encodes — three distinguishable sentence architectures — is being broken while the
proxy reports green. §8.2 recorded the mirror image of this on `gpt-5.4-nano`,
where Margaret came *down* to 16.2 and the ratio collapsed to 1.05. Between them
the two cases show the proxy is directional evidence, not a gate.

### 11.3 Mechanical failures — this is where the two models genuinely separate

Every FAIL from all six runs, deduplicated and attributed. Nothing else fired: no
Malay, no card-name translation, no therapy language, no emoji, no missing card
name, no missing position framing, no verdict-opener failure, no reader using
their own forbidden vocabulary.

```
gpt-5.6-luna   run 1   FAIL id adrian/spread3: paragraph 4 is 45 words, ceiling is 40
               run 2   all clean
               run 3   FAIL id margaret/daily: paragraph 1 is 61 words, ceiling is 55
               run 3   FAIL id: Margaret's sentences (19.8) are not 1.5x Thessaly's (13.6)
                                                                    --- 3 violations / 27 readings

gpt-5.4-mini   run 1   FAIL id thessaly/spread3: paragraph 2 is 41 words, ceiling is 40
                       FAIL id thessaly/spread3: paragraph 3 is 45 words, ceiling is 40
                       FAIL id thessaly/spread3: paragraph 4 is 41 words, ceiling is 40
                       FAIL id thessaly/spread3: total 167 words, budget 105-155
                       FAIL id margaret/daily:   paragraph 1 is 57 words, ceiling is 55
                       FAIL id margaret/yesno:   paragraph 1 is 73 words, ceiling is 70
                       FAIL id margaret/yesno:   total 73 words, budget 30-72
               run 2   FAIL id margaret/daily:   paragraph 1 is 73 words, ceiling is 55
                       FAIL id margaret/daily:   paragraph 2 is 59 words, ceiling is 55
                       FAIL id margaret/daily:   total 132 words, budget 50-115
                       FAIL id margaret/spread3: paragraph 4 is 56 words, ceiling is 55
                       FAIL id adrian/spread3:   paragraph 1 is 42 words, ceiling is 40
                       FAIL id adrian/spread3:   paragraph 4 is 54 words, ceiling is 40
                       FAIL id adrian/spread3:   total 168 words, budget 105-155
               run 3   FAIL id thessaly/spread3: paragraph 4 is 50 words, ceiling is 40
                       FAIL id thessaly/spread3: total 160 words, budget 105-155
                       FAIL id margaret/daily:   paragraph 1 is 71 words, ceiling is 55
                       FAIL id margaret/daily:   paragraph 2 is 62 words, ceiling is 55
                       FAIL id margaret/daily:   total 133 words, budget 50-115
                       FAIL id margaret/spread3: paragraph 4 is 58 words, ceiling is 55
                       FAIL id adrian/daily:     paragraph 2 is 62 words, ceiling is 55
                       FAIL id adrian/spread3:   paragraph 1 is 45 words, ceiling is 40
                       FAIL id adrian/spread3:   paragraph 2 is 44 words, ceiling is 40
                       FAIL id adrian/spread3:   paragraph 4 is 47 words, ceiling is 40
                       FAIL id adrian/spread3:   total 173 words, budget 105-155
                                                                   --- 25 violations / 27 readings
```

**Three against twenty-five.** `gpt-5.4-mini` overshoots a word ceiling on
roughly every second reading, and `margaret/daily` blows its 55-word paragraph
ceiling in all three runs (57, 73, 71) and drags the whole reading past its band
twice. `LENGTH_BUDGET` is the mechanism CLAUDE.md credits with getting the three
readers to 128–169 words, and the model is simply not counting. `gpt-5.6-luna`
obeys it: one 5-word overshoot and one 6-word overshoot across 27 readings, and a
completely clean middle run.

**Notably absent from both: `gpt-4.1-mini`'s reproducible `position framing
missing: "Yang bakal dateng"`.** Both GPT-5 models render the position labels
verbatim, every time. §8.4 found the same on `gpt-5.4-nano`, so that appears to be
a family improvement over `gpt-4.1-mini` and it is a real one — those labels are
an interface the screen also renders.

**Malay leakage: zero, all six runs, both models.** Five for five across every
OpenAI model this document has tested.

### 11.4 The blind read, and the harder question underneath it

Guesses recorded before scrolling to the key, all six runs. **Both models, 3/3,
every run.** The shuffle came out `A=margaret, B=adrian, C=thessaly` in all six.

**That is deliberate, and the trade-off it makes has a cost nobody wrote down.**
`blindPrint` uses `const order = loc === 'id' ? [1, 2, 0] : [2, 0, 1]`, and its
comment gives the reason: *"A FIXED SHUFFLE, derived from the locale rather than
from `Math.random()`… a deterministic one means two runs of the script can be
diffed against each other."* Diffability is a real benefit and this document has
leaned on it repeatedly — same hands, two runs, compare.

The unwritten cost is that **the blind read is blind exactly once per operator.**
After a single run you know `A` is Margaret, and every subsequent 3/3 is memory
rather than evidence. So the score cannot be treated as a measurement, and this
evaluation does not treat it as one — §11.5's vocabulary-swap question is what
carries the analysis. If the score is ever wanted as a number again, the fix is a
per-run seed printed alongside the key, so a run stays diffable against another
run with the same seed while a fresh seed stays blind. Not changed here: it is
`smoke-llm.ts`'s call, not this document's, and nothing in this evaluation
depended on it.

**The brief asked the right follow-up: would the three still be separable if the
distinctive vocabulary were swapped?** §8.3 recorded a 3/3 on `gpt-5.4-nano` whose
voices had measurably collapsed, because Adrian's `nggak / udah / bikin` and
Margaret's card-image openings carried the whole identification. Answering
honestly, per model:

**`gpt-5.6-luna`: yes, with less confidence on Adrian vs Thessaly.** Margaret is
never in doubt — her paragraphs open on the image (*"The Tower membawa kilat yang
membelah menara"*, *"The Magician berdiri menghadap meja dengan alat-alat di
hadapannya"*) and every sentence hangs a subordinate clause off the last, with
`melainkan` / `meski` / `namun` doing the joining and no imperative anywhere in
four paragraphs. Strip the vocabulary and the syntax alone still names her.
Adrian and Thessaly are the close pair, and what separates them beyond register is
**what the closing paragraph is for**: Thessaly closes on something measurable
(*"tetapkan batas waktu nyata"*, *"tulis bukti konkretnya setiap akhir pekan"*),
Adrian closes on something relational (*"katakan jujur apa yang kamu rasakan,
tanpa menuntut jawaban langsung"*). That is a difference in rhetorical purpose,
not in slang, and it survived all three runs. I relied on it, and I would still
have got them — slower, and by the last paragraph rather than the first line.

**`gpt-5.4-mini`: Margaret yes, Adrian no.** Margaret holds and is arguably more
herself than on luna. Adrian does not. Run 2's synthesis paragraph, his:

> *"Kalau dibaca bareng, The Sun bikin kamu tahu standar rasanya terang, The Star
> menjaga kamu tetap berharap tanpa memaksa, dan The Fool (terbalik) mengingatkan
> bahwa awal baru paling kuat justru saat kamu nggak pura-pura berani."*

That is one 38-word tripartite subordinated sentence with `bikin` and `nggak`
sprinkled on it. Remove the two slang words and it is Margaret's architecture in
Adrian's slot — which is exactly what the 20.6 words-per-sentence in run 3 is
measuring. **On `gpt-5.4-mini` I scored 3/3 and the honest answer to the follow-up
question is that one of those three was carried entirely by vocabulary.** That is
§8.3's failure repeating on a different model, and it is the reason the blind read
cannot be the gate.

---

## 12. Speed, the classifier, and cost

### 12.1 Reading TTFT: the reasoning penalty is gone

Across 27 streamed readings per model (`[N chunks, first after Xms, ...]`):

```
                      p50      p95      min      max
gpt-5.6-luna         731ms   1204ms    643ms   1384ms
gpt-5.4-mini         616ms    890ms    503ms   1168ms
gpt-5.6-luna, §7.4  3232ms       —    1204ms   5629ms   (reasoning on)
z.ai glm-4.6        4591ms       —         —        —
```

**§7.4's finding is reversed.** With reasoning on, luna's `spread3` started in
~4130ms and was indistinguishable from z.ai; with `reasoning_effort: none` its
slowest service is `yesno` at a 767ms p50 and the spread is essentially flat
across services. Both models are back in `gpt-4.1-mini` territory (546ms p50,
§2), about six to seven times faster to first word than z.ai.

### 12.2 Classifier

`npm run probe:moderation`, two runs per model:

```
                    p50           p95            corpus    JSON at t=0
glm-4.5-flash       617ms         903ms          36/42     10/10 identical
gpt-4.1-nano        602ms         813ms          20/20     10/10 identical
gpt-5.4-nano        926ms        1315ms          20/20     10/10 identical
gpt-5.6-luna    832 / 835ms   1188 / 1240ms      20/20     10/10 identical (x2)
gpt-5.4-mini    710 / 670ms   3734 / 5072ms      20/20     10/10 identical (x2)
```

**`gpt-5.6-luna` can now run the classifier, contradicting §7.2's verdict**, and it
runs it well: 20/20 corpus agreement, one distinct output over ten runs at
temperature 0 with zero parse failures, and a p95 that reproduced within 52ms
across two runs. Against `MODERATION_TIMEOUT_MS=1500` that leaves ~260ms of
headroom — thin, and it would want ~1600. It is also the most expensive classifier
in the table by a wide margin (§12.3), for a role a nano model already does at
20/20.

**`gpt-5.4-mini`'s p95 is the problem and it reproduced.** With n=20 the p95 is
effectively the slowest call, so this is one call in twenty at 3.7s and then one in
twenty at 5.1s — **two and a half to three and a half times `MODERATION_TIMEOUT_MS`.**
Its p50 is the fastest of the GPT-5 models tested, so this is a tail, not a mean.
Some of it may be environmental: run 2 also showed a reading TTFT p95 of 6241ms,
which suggests a slow patch on the account. Run 1 does not have that excuse — the
reading TTFT p95 there was a clean 825ms while the classifier still hit 3734ms.
**Treat a ~5% rate of blowing the moderation timeout as real until someone
re-measures it on a quiet connection.** That would push W7's asymmetric fail rule
into service on one call in twenty, which is not a rate this gate was designed for.

**Both probes printed `*** D8 PREMISE FAILS ON THIS MODEL ***` and §2's reading
of that stands.** The premise fails because the reading is fast. Absolute time to
the querent's first word is `max(classifier p95, reading p50)`: ~1204ms on luna,
~3734ms on `gpt-5.4-mini` in the worst run, against z.ai's ~4591ms. **Do not take
either probe's suggested `MODERATION_TIMEOUT_MS`** — 740 and 592 respectively —
those are reading p50s and would time the classifier out most of the time.

### 12.3 Cost

Published pricing per 1M tokens, read 2026-07-27 from
`developers.openai.com/api/docs/pricing`:

```
                  input   cached input   output
gpt-5.6-luna      $1.00      $0.10       $6.00
gpt-5.4-mini      $0.75      $0.075      $4.50
gpt-5.4-nano      $0.20      $0.02       $1.25
gpt-4.1-mini      $0.40         —        $1.60
gpt-4.1-nano      $0.10         —        $0.40
```

Measured means over 27 `id` readings per model:

```
                  mean input   mean output   $ / reading
gpt-5.6-luna         1375          153        $0.00229
gpt-5.4-mini         1374          178        $0.00183
gpt-5.6-luna, §7.4   1374          390        $0.00371   (reasoning on)
```

**`reasoning_effort: none` takes 38% off luna's per-reading cost** — mean output
falls from 390 tokens to 153, and every one of those 237 saved tokens was
invisible reasoning billed at $6/1M. §7.4's *"billed for tokens the querent never
sees"* is now a historical note rather than a live cost.

Full visit — one reading, one classifier call (~700 in / ~20 out) and one gist
(~600 in / ~40 out), the same basket §3 and §8.7 used:

```
gpt-4.1-mini + gpt-4.1-nano   ≈ $0.0012    (§3)
gpt-5.4-nano throughout       ≈ $0.00082   (§8.7)
gpt-5.6-luna throughout       ≈ $0.0040    (was ≈$0.0060 and hypothetical;
                                            now real, the classifier runs)
gpt-5.4-mini throughout       ≈ $0.0031
```

So luna is **~3.3× the `gpt-4.1-mini` pairing** and `gpt-5.4-mini` is ~2.6×. At a
hundred readings a day that is $12/month against $3.60 — a difference small enough
that it should not decide anything, which is the point of putting cost last again.

---

## 13. Verdicts, and where five OpenAI models now leave the decision *(SUPERSEDED BY §19 — it names `gpt-5.6-luna` as the fallback; Gemini had not been tested)*

### 13.1 `gpt-5.6-luna`

**USABLE — as the emergency fallback, not as the default. §7.5's two blockers are
both closed and its writing is, as §7.5 suspected, the best of the OpenAI models
tried.** It obeys `LENGTH_BUDGET` (3 violations in 27 readings against
`gpt-5.4-mini`'s 25), renders the position labels correctly, leaks no Malay, and
holds the readers at 0.075–0.085 overlap across three tight runs. Its blind read
survives the vocabulary-swap question on Margaret outright and on Adrian by
rhetorical purpose rather than slang.

**It does not reach z.ai.** 0.079 mean against 0.050 is still 1.6× the overlap on
the metric this product is built on, and the Margaret-to-Thessaly ratio failed
outright once in three runs at 1.46. Its margin over `gpt-4.1-mini` on overlap
(0.079 vs 0.086) is inside the noise; the real margin is contract compliance and
the fact that it can also run the classifier.

### 13.2 `gpt-5.4-mini`

**NOT RECOMMENDED, for either role.** It is mechanically sound — no blank
readings, no truncation, `temperature: 0` accepted, 20/20 on the classifier corpus
— and it is the worst reader in this document. **0.102 mean overlap is the highest
of the five OpenAI models tested, twice z.ai's.** It ignores the word ceilings at
a rate of roughly one violation per reading. And its passing sentence ratio
(1.74–1.97) is the most misleading number in this evaluation: it passes because
Margaret inflates to 24.2 *and Adrian follows her to 20.6*, which is the persona
convergence the ratio exists to detect, arriving in a form the ratio cannot see.
Its classifier tail — a p95 of 3.7s and 5.1s across two runs against a 1500ms
timeout — rules it out of that role separately.

There is nothing it is the best at. It costs 2.6× the `gpt-4.1-mini` pairing to be
worse than it.

### 13.3 Does either beat z.ai? No. That is now five for five.

```
                    overlap, spread3          margaret/thessaly    runs correctly
z.ai glm-4.6        0.050                     1.87                 yes
gpt-5.6-luna        0.075 / 0.077 / 0.085     1.68 / 1.62 / 1.46   yes (needs effort=none)
gpt-4.1-mini        0.079 / 0.093             1.55 / 1.57          yes, 3 contract FAILs
gpt-5.4-nano        0.082 / 0.077             1.05 / 1.10          yes
gpt-5.4-mini        0.092 / 0.121 / 0.093     1.81 / 1.74 / 1.97   yes, ~8 FAILs per run
```

**`LLM_PROVIDER=zai`, `LLM_MODEL=glm-4.6` remains the default and z.ai's 0.050 is
still unbeaten.** §9's observation that convergence looks like a family property
rather than a per-model one now has five data points instead of three, and the best
of them still sits 50% above the bar. The gap has narrowed — `gpt-5.6-luna` is the
first OpenAI model whose *prose discipline* is not visibly worse than z.ai's — but
it has not closed.

### 13.4 The fallback slot should move to `gpt-5.6-luna`

§9 handed the day-the-key-dies slot to `gpt-5.4-nano`, on cost, speed and contract
compliance, with the sentence ratio as the known cost. **Given that reading quality
outranks cost, that ordering is wrong and should be reversed.** `gpt-5.4-nano`
delivers three readers with one sentence architecture (ratio 1.05); that is the
failure the product cannot absorb, and $0.00082 a visit does not buy it back.

Recommended ladder, on quality first:

1. **`gpt-5.6-luna`** — best OpenAI overlap, best contract compliance, and it can
   run the classifier too, so a full switch is one provider variable plus
   `OPENAI_REASONING_EFFORT=none`. Costs ~$0.0040 a visit.
2. **`gpt-4.1-mini`** — the incumbent fallback. Comparable overlap, a steadier 1.55
   ratio, a third of the cost, and one reproducible position-framing bug. Needs no
   `reasoning_effort` and would break if it were sent one.
3. **`gpt-5.4-nano`** — cheapest and fastest, and it flattens the readers. Use it
   only if cost has become the binding constraint.
4. **`gpt-5.4-mini`** — no reason to reach for it.

**`OPENAI_REASONING_EFFORT=none` is a hard requirement of option 1 and it is easy
to lose.** Unset, luna returns blank readings on roughly two calls in nine and
rejects the classifier's `temperature: 0`, and neither failure names the cause.
`.env.example` should carry it next to `LLM_MODEL` with that sentence attached.

### 13.5 The two smoke-script fixes both hold, and one of them fired for real

**No blank readings, in any of the 54 streamed readings or the 18 probe calls.**
§7.1's failure mode is closed.

**The `-- VERDICT --` block prints and the exit code works.** It appears under
`VOICE PROXIES` on every run, and `gpt-5.6-luna` run 3 became the first
configuration in this project's history to actually trip it:

```
-- VERDICT --
FAIL  id: Margaret's sentences (19.8) are not 1.5x Thessaly's (13.6) -- the voices are converging

1 violation(s). **THIS IS THE READERS CONVERGING**, and
CLAUDE.md is explicit about the fix: the persona paragraphs, not the code.
```

and the run ended `2 violation(s): 1 mechanical, 1 voice property. Exiting 1.`
with `echo $?` returning **1**. §8.5's bug — proxies that print and cannot fail —
is fixed and now demonstrated against a configuration that fails them, which is
the only way that fix could be confirmed. `gpt-5.4-mini`'s clean voice verdicts
across three runs while Adrian drifted to 20.6 words per sentence are the reminder
that a green verdict is not the same as a passing model; read §11.2's table
alongside it.

### 13.6 What this evaluation did not measure

`--locale id` only, per the brief. **The English half is untested for both models**,
which means the `en` tic list, the English worked examples, and — importantly —
the contraction proxy (`en` only: Adrian > 0, Margaret == 0) were never exercised.
That proxy is the third of CLAUDE.md's three, and on a model where Adrian is
drifting toward Margaret's syntax it is exactly the check most likely to have
something to say. Anyone taking `gpt-5.6-luna` further should run
`npm run smoke -- --all` in full before trusting §13.4.

---

# Google Gemini: `gemini-3.1-flash-lite` and `gemini-3.5-flash-lite`, measured 2026-07-27

**This is the first section in this file about a provider that is not OpenAI, and
it is the first one that has anything good to say about the number this whole
document is organised around.** §13.3 recorded "five for five" — every OpenAI
model tested sat above z.ai's 0.050 reader overlap. `gemini-3.5-flash-lite` comes
in at **0.049 and 0.047 across two runs**, and it holds up under a length control
that this document has never applied before and that §11.1 should have.

**If Gemini earns a place here the file needs retitling.** It is currently "z.ai
vs OpenAI" and that is no longer what it contains.

**No new adapter was needed and none was written.** Google exposes an
OpenAI-compatible endpoint at
`https://generativelanguage.googleapis.com/v1beta/openai` and `src/lib/llm/openai.ts`
drives it unchanged — `max_completion_tokens`, `system` as a message,
`stream: true` with `stream_options: {include_usage: true}`, and `temperature: 0`
all accepted. The configuration used for this evaluation was deliberately odd —
`LLM_PROVIDER=openai` with `OPENAI_BASE_URL` pointed at Google — precisely so no
`gemini` provider case was built for a model that might not clear the bar. It
cleared it; wiring a proper alias is now worth doing.

## 14. Two things to check before reading any number below

### 14.1 The model list is wider than the two names in the brief

`GET /v1beta/openai/models` on 2026-07-27 returns, in the text-generation tiers:

```
gemini-2.0-flash        gemini-2.5-flash        gemini-3.1-flash-lite
gemini-2.0-flash-lite   gemini-2.5-flash-lite   gemini-3.1-flash-lite-preview
                        gemini-2.5-pro          gemini-3.1-pro-preview
                                                gemini-3.5-flash
                                                gemini-3.5-flash-lite
                                                gemini-3.6-flash
                                                gemini-3-pro-preview
                                                gemini-flash-latest
                                                gemini-flash-lite-latest
```

**There is no `gemini-3.6-flash-lite`.** `gemini-3.6-flash` is the newest model
Google exposes here and it is the non-lite tier; `gemini-3.5-flash` sits beside it.
**Neither was tested and both are untested for this product.** The listing is
recorded here rather than described, because the reason `gemini-3.5-flash-lite`
was in this evaluation at all is that a previous round had assumed a naming
pattern and missed a generation. The pattern is not stable enough to assume: the
`-lite` suffix stops at 3.5, and `gemini-flash-lite-latest` is an alias whose
target is not stated.

### 14.2 BOTH SCRIPTS PRINT THE WRONG BASE URL, AND IT SAYS `api.anthropic.com`

`scripts/smoke-llm.ts:153` and `scripts/probe-moderation.ts:231` both print
`process.env.LLM_BASE_URL ?? 'api.anthropic.com'`. The OpenAI adapter reads
`OPENAI_BASE_URL`. So **every run in this section printed
`baseURL=api.anthropic.com` at the top while every request went to Google**, and
the model name in the same banner is the only thing that was true.

This is cosmetic and it is dangerous in both directions. Someone reading a saved
log will conclude the run was mis-targeted when it was fine; worse, someone
switching providers by editing `OPENAI_BASE_URL` and glancing at the banner has no
way to tell from it that anything changed. It was not fixed here — this evaluation
was scoped to two files — but it is a two-line change and it should be made.

## 15. Reading quality

### 15.1 The headline: `gemini-3.5-flash-lite` is the first model in this file to reach 0.050

```
mean pairwise reader overlap, spread3, plain, --locale id
  z.ai glm-4.6, as recorded            0.050        <-- the bar
  z.ai glm-4.6, re-run 2026-07-27      0.068        <-- see 15.2
  gemini-3.1-flash-lite      0.087  0.089    mean 0.088
  gemini-3.5-flash-lite      0.049  0.047    mean 0.048
```

`gemini-3.1-flash-lite` — **the model actually asked for** — lands at 0.088, which
is `gpt-4.1-mini` territory (0.086) and worse than `gpt-5.6-luna`'s 0.079. It is
the sixth model to fail this bar.

`gemini-3.5-flash-lite` lands at 0.048, twice, tightly. **Taken at face value that
is the first pass in this document.** It should not be taken at face value, and
§15.3 is why.

### 15.2 A z.ai control run was taken the same afternoon, and z.ai did not reproduce its own number

Because the 0.050 in §1 was measured on a different day against a different hand
of cards, one `npm run smoke -- --all --locale id` was run on the restored z.ai
configuration, on the same machine, within the same hour as the Gemini runs:

```
z.ai glm-4.6, 2026-07-27, one run
  overlap                     0.068
  mean sentence words         thessaly 9.7   margaret 22.4   adrian 18.3   ratio 2.31
  mechanical                  1 FAIL -- id margaret/daily: card name missing or altered: "The Chariot"
  spread3 totals              113 / 168 / 108
```

**0.068, not 0.050.** One run is not a distribution and the hands differ, so this
does not overturn the recorded baseline — but it does mean **the 0.050 in this
file's headline table is a single favourable measurement being used as a
threshold**, and every "does not reach z.ai" verdict in §§4, 8, 11 and 13 was
scored against it. That is worth saying plainly: on the day, z.ai's own overlap
was closer to `gpt-5.6-luna`'s 0.079 than to its own published bar. Anyone
re-running this comparison should re-measure z.ai in the same session rather than
quoting §1.

The control also caught z.ai dropping a card name, which is a mechanical FAIL
neither Gemini model produced in four runs.

### 15.3 THE LOW OVERLAP IS SUBSTANTIALLY A LENGTH ARTIFACT, AND THE METRIC HAS NEVER BEEN CONTROLLED FOR IT

`jaccard()` in `smoke-llm.ts` builds a **set** of content words longer than three
characters and divides the intersection by the union. For texts sampled from a
large vocabulary the expected Jaccard scales roughly linearly with length: halve
both texts and you roughly halve the score. **The metric therefore rewards a model
for writing less**, and nothing in this document has previously said so.

`gemini-3.5-flash-lite` writes materially less. Total `spread3` words:

```
                          thessaly  margaret  adrian    mean
z.ai control                113       168      108      130
gemini-3.1  run 1           119       186      154      153
            run 2           139       178      146      154
gemini-3.5  run 1           116        94      118      109
            run 2            83        93       95       90
CLAUDE.md's recorded band for the three readers: 128-169
```

So the comparison as printed is 90-word readings against 130-word readings. To
separate voice distinctness from brevity, every `spread3` text was truncated to
its first *N* words and the same Jaccard recomputed:

```
                     full     @120     @100      @83
z.ai control        0.068    0.070    0.071    0.061
gemini-3.1 run 1    0.087    0.065    0.062    0.050
gemini-3.1 run 2    0.089    0.060    0.054    0.057
gemini-3.5 run 1    0.049    0.049    0.041    0.039
gemini-3.5 run 2    0.047    0.047    0.047    0.032
```

**Read the `@83` column: that is every reading cut to the length of the shortest
one in the set, so length is held constant and only the writing differs.**

Three findings, and they do not all point the same way.

1. **The length effect is large and it is the biggest single term in the raw
   numbers.** `gemini-3.1` falls from 0.088 to 0.054 purely by truncation. Any
   raw overlap comparison between models that write different amounts is partly
   measuring the amount.
2. **`gemini-3.5-flash-lite`'s advantage survives the control.** At 83 words it is
   0.039 and 0.032 against `gemini-3.1`'s 0.050 and 0.057 and the z.ai control's
   0.061 — roughly 40% below both. **This is a real difference in how differently
   the three readers write, not only a difference in how much.** It is the one
   genuinely positive result about reading quality in this entire document.
3. **`gemini-3.1-flash-lite` also beats the z.ai control once length is
   controlled** (0.054 mean against 0.061), which is a result to distrust rather
   than celebrate: the z.ai side is n=1, it scored 0.068 raw against a documented
   0.050, and truncating a 168-word Margaret to 83 words throws away most of what
   makes her Margaret. Do not promote `gemini-3.1` on the strength of that cell.

**None of this rescues the headline into a clean claim.** The honest statement is:
*`gemini-3.5-flash-lite` produces the most distinguishable three readers of any
model measured in this file, and it does so partly by writing readings that are
too short.*

### 15.4 Mean sentence words: both models pass the ratio, and 3.5 passes it the right way

```
                     thessaly  margaret  adrian   margaret/thessaly
z.ai, as recorded      10.2      19.1     13.8         1.87
z.ai control run        9.7      22.4     18.3         2.31
gemini-3.1  run 1      14.9      22.5     18.4         1.51   <-- on the line
            run 2      12.1      20.2     17.8         1.67
gemini-3.5  run 1      12.7      23.2     15.9         1.83
            run 2      12.9      23.5     17.9         1.82
```

**`gemini-3.1-flash-lite` is §11.2's `gpt-5.4-mini` failure repeating.** The ratio
passes — 1.51 and 1.67 — and it passes because *everything inflates together*.
Thessaly, whose whole persona is the clipped one, runs at 14.9 and 12.1 against
z.ai's 10.2 and 9.7. Adrian runs at 18.4 and 17.8 against z.ai's 13.8. Run 1's
1.51 clears the 1.5 floor by nine hundredths of a point, which is not a pass, it
is a coin landing on its edge. §11.2's warning applies verbatim: a passing ratio
is directional evidence and not a gate.

**`gemini-3.5-flash-lite` passes it the way z.ai does**, with Thessaly held down
at 12.7/12.9 and Margaret up at 23.2/23.5. Adrian at 15.9 and 17.9 is still above
z.ai's recorded 13.8 but sits between the two, which is where he belongs. This is
the shape the proxy exists to reward.

### 15.5 Mechanical failures: 3.1 is spotless and 3.5 cannot hit a word budget

```
gemini-3.1-flash-lite   run 1   all clean          EXIT=0
                        run 2   all clean          EXIT=0
                                            --- 0 violations / 18 readings

gemini-3.5-flash-lite   run 1   FAIL id thessaly/daily:   paragraph 1 is 60 words, ceiling is 55
                                FAIL id margaret/daily:   paragraph 1 is 59 words, ceiling is 55
                                FAIL id margaret/spread3: total 94 words, budget 105-210
                        run 2   FAIL id thessaly/spread3: total 83 words, budget 105-155
                                FAIL id margaret/spread3: total 93 words, budget 105-210
                                FAIL id margaret/yesno:   paragraph 1 is 90 words, ceiling is 70
                                FAIL id margaret/yesno:   total 90 words, budget 30-72
                                FAIL id adrian/spread3:   total 95 words, budget 105-155
                                            --- 8 violations / 18 readings   EXIT=1 both runs
```

**`gemini-3.1-flash-lite` is the only configuration in this entire document with
two consecutive fully clean runs.** Not one word-ceiling overshoot, not one
missing card name, not one mangled position label, across 18 readings. The z.ai
control run in the same session dropped a card name. That is a genuine strength
and it is worth recording even though the model loses on voice.

**`gemini-3.5-flash-lite`'s failures are almost all UNDERSHOOTS, which is a failure
mode this file has not seen before.** Five of the eight are a reading coming in
*below* its band — `margaret/spread3` at 94 and 93 against a 105 floor, in both
runs. Margaret's spread on this model is four paragraphs of exactly one sentence
each. Every other model in this document overshoots; `LENGTH_BUDGET` was built to
stop models writing 330-word readings and it is being missed from the other side.

**This matters more than the count suggests, because it is the same fact as
§15.3.** The brevity that produces the best overlap number in this file is also
the thing failing the budget. They cannot be separated: fixing the undershoot
would lengthen the readings and, on the truncation curve above, raise the overlap
toward 0.047 → somewhere near 0.049 at 120 words. Whether it would rise *past*
z.ai is not measured and cannot be inferred.

The one genuine overshoot, `margaret/yesno` at 90 words against a 70-word ceiling
and a 72-word band, is the same reading that contains the Malay leak in §15.7. On
that call the model appears to have ignored the contract generally rather than one
clause of it.

### 15.6 `Anda` vs `kamu`: ZERO occurrences, both models, all four runs

The brief flagged a hand-run smoke reading that used the formal `Anda`, which
would be a register violation affecting every reader at once. **It did not
reproduce.** `grep -ci '\bAnda\b'` returns **0** over all 36 readings across both
models and both runs, and every reading uses `kamu` throughout. `kaukehendaki`
appears once (`gemini-3.5`, `margaret/yesno`) — that is the literary `kau-`
proclitic, which is informal-register Indonesian and arguably correct for
Margaret's archaic voice, not a formality problem.

The likely explanation is that the hand-run probe went through a bare API call
rather than `src/lib/prompt/base.id.ts`, which states the register rule. Nothing
needs changing, and there is no evidence of a systematic contract violation here.

### 15.7 Malay: one leak, and THE ELEVEN-WORD GREP DID NOT CATCH IT

The mechanical check reported zero Malay across all four runs. Reading the
readings by hand found one:

> *"Perhatikan bagaimana alat-alat itu sudah tersedia di sekitarmu, menanti
> keberanianmu untuk **memulakannya**."*
> — `gemini-3.5-flash-lite`, run 1, `margaret/yesno`

**`memulakan` is Malay.** Indonesian is `memulai`. The word is not in
`smoke-llm.ts`'s eleven-item list (`kerjaya`, `hala tuju`, `sembang`, `awak`,
`tempoh`, `kerana`, `iaitu`, `ianya`, `manakala`, `seronok`, `kelmarin`), so the
grep passed a reading with Malay in it.

**Take this as a signal about the corpus, not as one bad word.** Five OpenAI
models produced zero Malay and the list was calibrated against them and against
z.ai. Gemini is trained on a different Indonesian/Malay mixture, and the first
thing it did was produce a Malay verb affix — `me-...-kan` where Indonesian takes
`me-...-i` — which is a *morphological* leak rather than a lexical one. A word
list cannot catch a productive affix pattern. One instance in 36 readings is a low
rate, but it was found by reading, and nothing in the harness would have found it.

**Anyone shipping either Gemini model must widen that list first**, and the honest
version of the check is probably a small set of Malay-only affix patterns rather
than more words. This is the sixth model tested and the first Malay leak; it is
exactly the risk the brief predicted.

### 15.8 The blind read, and the vocabulary-swap question

3/3 on all four runs. As §11.4 records, the shuffle is deterministic
(`A=margaret, B=adrian, C=thessaly` for `id`) and the score is therefore worth
almost nothing after the first run of one's life. The follow-up question carries
the analysis.

**`gemini-3.5-flash-lite`: yes, and this is the cleanest separation in the
document.** Run 2's three, stripped of vocabulary, still separate on syntax and on
rhetorical purpose:

- **Margaret** writes one sentence per paragraph and **does not address the
  querent at all** in three of four paragraphs — no `kamu`, no imperative, only
  the image (*"The High Priestess yang duduk di antara dua tiang rahasia dengan
  gulungan kitab yang tersembunyi rapat di balik jubah birunya"*). Nothing else in
  the set does that.
- **Thessaly** writes two flat declarative sentences per paragraph anchored to
  concrete workplace nouns (*proyek*, *kantor*, *minggu ini*) and closes on a
  directive.
- **Adrian** works by simile (*"kayak lagi bawa air pakai tangan kosong"*, *"rem
  tangan masih ketarik rapat"*) and closes on permission rather than instruction
  (*"luangkan waktu duduk diam tanpa harus langsung memutuskan apa-apa"*).

Remove `nggak`/`udah`/`bikin` from Adrian and the similes and the soft close still
name him. I relied on those, not on the slang.

**`gemini-3.1-flash-lite`: no, and run 2 shows why.** Adrian's run-2 spread is
almost entirely formal Indonesian — *"menunjukkan kamu sempat terjebak dalam pola
yang bikin kecanduan"*, *"menghambat langkah"*, *"meski saat itu rasanya sulit
sekali untuk melepaskan diri"* — with `bikin` the single slang token in four
paragraphs. Thessaly's is the same register in three-sentence paragraphs. **What
separated them for me was the position labels**, *"Yang udah lewat"* against *"Yang
sudah berlalu"* — and those are **supplied by the prompt, per reader, in the user
turn** (`src/lib/prompt/build.test.ts:477`). They are not the model's voice. Score
the run on authored prose alone and Adrian versus Thessaly is a guess. That is
§8.3's and §11.4's failure repeating, and it is consistent with the 0.090
Adrian-Thessaly pair overlap in that run.

## 16. Streaming granularity, and why it is close to disqualifying for readings

This is the finding that most surprised the evaluation, and the numbers are not
marginal.

```
                        chunks/reading            chars     TTFT (n=18)         total
                     min   p50   max   mean     per chunk   min  p50  p95    p50    max
gemini-3.1-flash-lite  5     6    13    7.4        93       647 1099 1316   1656   2374
gemini-3.5-flash-lite  5     6     9    6.6        83       590  750 1067   1284   1560
z.ai glm-4.6 control  77   160   341   173         ~4      1342    -    -   2482   9166
z.ai, as recorded     354 chunks, first at 2.7s, only 2 gaps over 50ms
OpenAI, §2 era        52-128 chunks for comparable length
```

**A typical Gemini reading arrives in six chunks of about eighty characters
each.** Eighty characters is roughly one sentence. So a four-paragraph spread
arrives as **six sentence-sized blocks over about 600ms of streaming after a
~750ms wait** — the whole reading is on screen 1.3 seconds after the request.

**Judged as a product question rather than a number, this is worse than it sounds
and better than it sounds, in that order.**

Worse: the app's entire reading experience is prose appearing while a person
watches. `smoke-llm.ts`'s own header says a reply arriving in one burst *"looks
like no streaming at all"*, and six bursts is nearer to that than to streaming.
z.ai delivers ~4 characters per chunk — genuinely token-by-token, the text visibly
writing itself — and Gemini delivers whole clauses appearing at once. Whatever
typewriter feel the draw screen has today, Gemini removes it. That is a real
regression in the one screen this product is.

Better: **the total time is so short that there may be nothing left to watch.**
z.ai's recorded behaviour is 2.7s to the first token and a long, slow, satisfying
crawl; Gemini is 750ms to the first token and finished at 1.3s. Nobody experiences
1.3 seconds as a stall. The failure mode of coarse chunking is a progress bar that
jumps — and a progress bar that completes in 1.3 seconds does not need to be
smooth.

**Which of those wins is a product judgement and not a measurement, and it should
be made by looking at it.** It cannot be settled from a WSL shell: the honest test
is `npm run dev` with `LLM_PROVIDER` switched and a real reading taken on a phone,
which is ten seconds of work and was outside this evaluation's scope. My reading of
it is that **six chunks is acceptable at 1.3 seconds and would not be at four
seconds**, and that if the ritual of watching a reading appear is considered part
of the product, a client-side reveal animation decoupled from chunk arrival is the
fix — not a different model. **This does not disqualify Gemini. It is the strongest
argument for keeping z.ai as the default beyond reading quality**, and it should be
weighed with eyes on the screen.

Two smaller notes. **Gemini reports `prompt_tokens` and z.ai does not** — every
Gemini reading logged `tokens in=~1320` where the z.ai control logged
`tokens in=null`, so switching would complete the cost model CLAUDE.md describes as
"half a cost model, not none". And **z.ai's control run produced one 9166ms TTFT**
on `adrian/yesno`; Gemini's slowest of 36 was 1316ms.

## 17. Classifier

`npm run probe:moderation`, one run per model:

```
                        p50      p95     max     corpus    JSON at t=0
glm-4.5-flash          617ms    903ms      -     36/42     10/10 identical
gpt-4.1-nano           602ms    813ms      -     20/20     10/10 identical
gemini-3.5-flash-lite  719ms   1057ms   1057ms   20/20     10/10 identical, 0 parse failures
gemini-3.1-flash-lite 1113ms   1199ms   1199ms   20/20     10/10 identical, 0 parse failures
gpt-5.6-luna           832ms   1188ms      -     20/20     10/10 identical
gpt-5.4-mini           670ms   5072ms      -     20/20     10/10 identical
```

**Both Gemini models pass, and `gemini-3.5-flash-lite` is the better classifier of
the two by a clear margin** — a 719ms p50 against 1113ms, and a p95 of 1057ms
leaving ~440ms of headroom against `MODERATION_TIMEOUT_MS=1500`. `gemini-3.1`'s
1199ms p95 leaves ~300ms, which is the same thin margin §12.2 flagged on
`gpt-5.6-luna` and would want the timeout raised to ~1600.

**Neither reaches `glm-4.5-flash`'s 903ms p95 or `gpt-4.1-nano`'s 813ms**, and
`glm-4.5-flash` remains the only model in this file measured on the full 42-row
corpus (36/42); the 20/20 results are on the shorter one and are not the same
test. `temperature: 0` is accepted by both — the `gpt-5.6-luna` block of §7.2 does
not recur.

**`gemini-3.5-flash-lite` printed `*** D8 PREMISE FAILS ***` and `gemini-3.1` did
not**, and §12.2's reading of that line stands: the premise fails on 3.5 because
its *reading* is fast (725ms p50 TTFT against a 1057ms classifier p95), not because
the classifier is slow. Absolute time to the querent's first word is
`max(classifier p95, reading p50)` — **~1057ms on `gemini-3.5-flash-lite` against
z.ai's ~4591ms.** Do not take either probe's suggested `MODERATION_TIMEOUT_MS`
(1221 and 725); those are reading p50s.

**Both Gemini models are better classifiers than they are readers**, in the sense
that the classifier role has an objective pass mark and both clear it, while the
reading role is a judgement both only partly win. If z.ai's key survives and only
one component moves, the classifier is the safe one to move.

## 18. Cost, and a free tier that should not be used

Published pricing per 1M tokens, read 2026-07-27 from `ai.google.dev/gemini-api/docs/pricing`:

```
                        input   output
gemini-3.1-flash-lite   $0.25    $1.50
gemini-3.5-flash-lite   $0.30    $2.50
gemini-3.5-flash        $1.50    $9.00   (untested)
```

Measured means over 18 `id` readings per model:

```
                        mean input   mean output   $ / reading
gemini-3.1-flash-lite      1316          145        $0.00055
gemini-3.5-flash-lite      1328          121        $0.00070
```

Full visit — one reading, one classifier call (~700 in / ~20 out) and one gist
(~600 in / ~40 out), the same basket §3, §8.7 and §12.3 used:

```
gpt-5.4-nano throughout        ≈ $0.00082   (§8.7, cheapest previously)
gemini-3.1-flash-lite          ≈ $0.00096
gpt-4.1-mini + gpt-4.1-nano    ≈ $0.0012    (§3)
gemini-3.5-flash-lite          ≈ $0.00124
gpt-5.4-mini throughout        ≈ $0.0031
gpt-5.6-luna throughout        ≈ $0.0040
```

**Cost does not separate anything here.** `gemini-3.5-flash-lite` costs the same as
the `gpt-4.1-mini` pairing and a third of `gpt-5.6-luna`; at a hundred readings a
day that is $3.70/month against $12. Note that `gemini-3.5-flash-lite`'s output
price is 67% higher than `gemini-3.1`'s and it is still barely more expensive per
visit, because it writes 17% fewer output tokens — which is §15.5's undershoot
showing up as a cost saving. That is not a saving worth having.

**There is a free tier and it should not be used for this product.** Both models
are on it, at roughly 15 RPM / 1000 RPD for the flash-lite tier. Two things rule it
out. First, the limits are a production outage waiting to happen and the whole
reason a second provider exists is availability risk. Second and decisively,
**Google's terms mark free-tier content as used to improve its products, and paid
tier as not.** JMTarot's requests carry the querent's typed question — the same
strings W7 refuses to put in a platform log, the same strings that reach the
moderation classifier because they may be about self-harm. Sending those to a
free tier that trains on them would contradict `/privacy` directly. **If Gemini is
adopted, it is on the paid tier, and `docs/DEPLOY-VERCEL.md` §2b's spend-cap step
applies to Google as it does to z.ai.**

## 19. Verdicts

### 19.1 `gemini-3.1-flash-lite` — NOT RECOMMENDED as the reading model

**The model that was asked for is the weaker of the two, and it fails on the
metric that outranks everything else.** 0.088 overlap raw is the second-worst
result in this document, behind only `gpt-5.4-mini`'s 0.102. Its 1.51 sentence
ratio in run 1 is a pass by nine hundredths. Adrian and Thessaly both inflate
toward Margaret and Adrian loses his register outright in run 2, where the only
thing separating him from Thessaly was a position label the prompt supplied.

**What it is genuinely good at is contract compliance: two consecutive perfectly
clean runs, 0 violations in 18 readings, the only such result in this file.** If
the failure being solved for were "the model ignores `LENGTH_BUDGET`", this is the
best model tested. That is not the failure being solved for.

Usable as a classifier (20/20, 1199ms p95, thin but workable) and as a
break-glass reader if nothing else is available. Not a default and not the
fallback.

### 19.2 `gemini-3.5-flash-lite` — the best reader measured here, and not yet ready to be the default

**Yes, it is usable as the reading model, and it is the first model in this file
whose reader distinctness is arguably better than z.ai's rather than worse.** 0.048
raw against a 0.050 bar; 0.036 against z.ai's 0.061 with length held constant; the
sentence ratio passing in the right shape (Thessaly held at 12.8, Margaret at 23.4)
rather than by joint inflation; and a blind read that survives the vocabulary-swap
question on all three readers, which §11.4 could only claim for Margaret.

**Three things stand between it and the default, and the first two are the same
thing.**

1. **It writes too little.** Five of its eight mechanical failures are readings
   below their word band, including `margaret/spread3` at 94 and 93 words against a
   105 floor in both runs — four one-sentence paragraphs. A querent paying
   attention to a three-card spread gets 90 words.
2. **The overlap win is partly bought with that brevity.** §15.3's truncation table
   shows length is the largest single term in the raw number. The advantage
   survives the control and is real, but it is smaller than 0.048-vs-0.050 makes it
   look, and **fixing the undershoot would move the overlap up by an unmeasured
   amount.** Anyone tuning `LENGTH_BUDGET` upward for this model must re-measure
   overlap afterwards; the two are coupled and this document has just demonstrated
   how tightly.
3. **It leaked Malay** — `memulakannya`, once in 36 readings, through a grep that
   could not see it. §15.7. Fix the check before shipping, not after.

**And the streaming (§16) is a separate open question that a screenshot cannot
answer.** Six chunks per reading is qualitatively different from z.ai's 173, and
the mitigating fact — that the whole thing lands in 1.3 seconds — needs somebody to
look at it on a phone before it is believed.

### 19.3 Does Gemini change the default? Not yet. Does it change the fallback? Yes.

```
                       overlap raw   overlap @83   marg/thess   mech FAILs/18   classifier p95
z.ai glm-4.6           0.050 / 0.068     0.061     1.87 / 2.31        1              903ms
gemini-3.5-flash-lite  0.049 / 0.047     0.036     1.83 / 1.82        8             1057ms
gemini-3.1-flash-lite  0.087 / 0.089     0.054     1.51 / 1.67        0             1199ms
gpt-5.6-luna           0.079 (n=3)         -       1.46-1.68          3 (n=27)      1188ms
```

**`LLM_PROVIDER=zai`, `LLM_MODEL=glm-4.6` should remain the default**, for two
reasons that are not "z.ai writes better": the streaming granularity question in
§16 is unresolved, and the Malay grep does not currently cover this model's failure
mode. Neither is a reason to reject Gemini; both are reasons not to switch a live
product on the strength of two smoke runs and a truncation table. z.ai's own
control run at 0.068 with a dropped card name means the incumbent's margin is
thinner than §13.3 believed, and a third and fourth Gemini run plus a phone check
could reasonably reverse this.

**The emergency fallback should move from `gpt-5.6-luna` to `gemini-3.5-flash-lite`.**
§13.4 gave luna the slot on quality-first reasoning and Gemini beats it on exactly
that basis: 0.048 against 0.079 overlap, a sentence ratio that never dips under 1.5
where luna's did once in three runs, a blind read that survives the vocabulary swap
on all three readers where luna's survived on two, a classifier that is equal or
better (1057ms against 1188ms, both 20/20, both stable at `temperature: 0`), and a
third of the cost. It also needs no `reasoning_effort` flag — §13.4's own warning is
that luna's fallback status depends on an env var that is easy to lose, and that
failure mode disappears here.

Recommended ladder, quality first, replacing §13.4's:

1. **`gemini-3.5-flash-lite`** — best reader distinctness measured; needs a wider
   Malay check and a decision about the word-budget undershoot. ~$0.00124/visit.
   No special flags.
2. **`gpt-5.6-luna` with `OPENAI_REASONING_EFFORT=none`** — §13.4's choice,
   unchanged, and the safest option if the streaming granularity turns out to
   matter, since it chunks like OpenAI rather than like Gemini.
3. **`gpt-4.1-mini`** — cheap, steady, one reproducible position-framing bug.
4. **`gemini-3.1-flash-lite`** — flawless contract compliance, converging readers.
   Reach for it only if mechanical failures are the problem being solved.
5. **`gpt-5.4-nano`**, then **`gpt-5.4-mini`** — as §13.4.

**For the moderation classifier specifically**, `glm-4.5-flash` stays best on the
numbers, and `gemini-3.5-flash-lite` is a better second choice than
`gpt-4.1-nano` if the intent is to move both roles to one provider at once.

### 19.4 What this evaluation did not measure

- **`--locale id` only**, as with §13.6. The `en` tic list, the English worked
  examples and the contraction proxy (Adrian > 0, Margaret == 0) were never
  exercised on either model. On a model where Adrian is drifting formal — which
  `gemini-3.1` demonstrably is — that proxy is the check most likely to have
  something to say.
- **Two runs per model, not three.** §11.1 added a third run for a reason. The two
  Gemini runs agreed closely on every headline number, which is some comfort, but
  `gemini-3.1`'s 1.51 ratio in particular deserves a third data point before it is
  called a pass or a fail.
- **`gemini-3.5-flash` and `gemini-3.6-flash` are untested** (§14.1). Both are the
  non-lite tier, `gemini-3.5-flash` at $1.50/$9.00 — six times the input price and
  3.6× the output price of `gemini-3.5-flash-lite`. Given that the lite model is
  already the best reader in this document, the flash tier is the obvious next
  experiment and it was outside this brief.
- **The streaming question was measured and not judged on a screen** (§16).
- **Nothing was run against the real app.** No `npm run dev`, no reading taken
  through `/api/reading`, no moderation refusal exercised end to end. Both models
  were driven only through `smoke-llm.ts` and `probe-moderation.ts`.
