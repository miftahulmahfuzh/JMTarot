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
