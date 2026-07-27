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

## 5. The honest recommendation

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

## 9. Where this leaves the decision

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

## 13. Verdicts, and where five OpenAI models now leave the decision

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
