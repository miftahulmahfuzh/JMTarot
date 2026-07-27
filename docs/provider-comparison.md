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
