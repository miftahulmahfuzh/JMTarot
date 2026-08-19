/**
 * The choice verdict: how a multiple-choice question gets one answer, and how
 * that answer is prevented from being anything the querent did not type.
 *
 * PURE, NO `server-only`, NO `process.env`. Both halves matter. This module runs
 * in the BROWSER — `Draw.tsx` strips the marker incrementally as the reading
 * streams — and on the server, in `/api/reading`'s `defer()` block, over the
 * finished body. **One function, two callers**, which is the only reason the
 * screen and the stored row cannot disagree about where the prose starts.
 *
 * ── WHY THE MARKER CROSSES THE WIRE AT ALL ───────────────────────────────────
 *
 * The tempting design puts a transform between the provider's stream and
 * `teeReading`, so the marker never leaves the server. It cannot work: the choice
 * arrives long after the response headers, so a server that strips it has no way
 * left to tell the client what it was — and the draw screen is where the querent
 * actually reads their reading. `text/plain` chunked has no trailer this app
 * reads and no second channel.
 *
 * So the marker is on the wire, and **the failure mode is a chunk-boundary bug
 * rendering `PILIHAN: Ayam` above a reading.** `choice.test.ts` feeds one body in
 * EVERY possible split and asserts the marker never appears and the body never
 * shrinks. Nothing else in the suite can see that class of bug, and a screenshot
 * cannot either — it would have to catch the one frame.
 *
 * ── WHY THE VALIDATION IS MECHANICAL AND NOT A PROMPT RULE ───────────────────
 *
 * `services.{id,en}.ts` tells the reader to copy the option verbatim. That is
 * exactly the shape of rule V2 already learned not to trust on its own: the
 * card-name rule alone produced "Pulan" for The Moon, and `namesIn` is mechanical
 * because of it. Here the stakes are higher than a wrong name — the box renders
 * on `/s/<slug>`, which strangers open, so a question crafted to steer the model
 * would be steering text into a highlighted box on a public page.
 *
 * `validateChoice` closes that by construction: it returns **a slice of the
 * question**, never the model's copy of it. The box can only ever contain the
 * querent's own words. A model naming a third option, a whole sentence, or an
 * instruction gets no box at all, and the reading is unaffected.
 *
 * ── THE ONE THING THIS CANNOT MEASURE ────────────────────────────────────────
 *
 * A marker the model spells differently enough to miss the matcher is
 * INVISIBLE — it renders as prose and no event fires, because there is nothing
 * to fire about. `reading.choice_offered.valid` measures a model that named the
 * wrong thing, not a model that named it in the wrong shape. The instrument for
 * the second is `npm run smoke -- --all` with choice questions in both locales:
 * read the eighteen and check the format is obeyed. Do that before believing the
 * production rate.
 */

/**
 * The protocol token, ONE STRING IN BOTH LOCALES.
 *
 * The same call R17 made for `<pertanyaan>` and `<riwayat>`: one thing to parse,
 * one thing to test, and no way to get a locale/token pairing wrong. It is
 * model-facing vocabulary that no querent ever sees, so it belongs beside the
 * prompt layer and NOT in `src/lib/i18n/locales/*` — the same rule `TURN_LABELS`
 * follows.
 *
 * MATCHED CASE-INSENSITIVELY, because a model will offer `Pilihan:` and the cost
 * of refusing it is a lost box. The negative control is in the test: a reading
 * opening with `Pilihanmu hari ini…` must keep its first line, which it does
 * because the token is matched as a whole eight characters including the colon.
 */
export const CHOICE_MARKER = 'PILIHAN:';

/**
 * A box, not a sentence.
 *
 * The rendered element is the one `reading.verdict` already uses — it holds `Ya`,
 * `Tidak` and `Belum jelas` — so anything past a couple of words does not fit and
 * would not read as a verdict if it did. A model that answers the marker line
 * with a clause has not followed the rule, and no box is the honest outcome.
 */
export const CHOICE_MAX_CHARS = 40;

/**
 * How far into the stream the marker line may run before we stop waiting.
 *
 * This bounds LATENCY, not correctness. Without it, a model that opens with
 * `PILIHAN:` and then writes a whole paragraph before its first newline would
 * have that paragraph withheld from the screen until the newline arrived. 96 is
 * comfortably past `CHOICE_MARKER.length + CHOICE_MAX_CHARS` and comfortably
 * short of a paragraph.
 */
export const MARKER_SCAN_LIMIT = 96;

export type ChoiceSplit = {
  /**
   * What the model NAMED, or null. **NOT VALIDATED** — pass it through
   * `validateChoice` before it reaches a screen or a column.
   */
  choice: string | null;
  /** Everything safe to render or store right now. Grows monotonically. */
  body: string;
  /**
   * True while the leading text could still become a marker line and more input
   * is needed to decide. The caller renders `body` and holds off.
   */
  pending: boolean;
};

/**
 * Split the accumulated text into its marker line and its prose.
 *
 * **TAKES THE WHOLE TEXT SO FAR, NOT A DELTA.** That is what makes it pure and
 * idempotent, and it is what lets one function serve a browser calling it on
 * every chunk and a server calling it once at the end. There is no state to
 * carry and nothing to reset between readings.
 *
 * `done` IS THE FLUSH. At end of stream nothing may be held back: a reading
 * whose four remaining marker characters never arrived must still be shown, so
 * `pending` is never true when `done` is.
 */
export function splitChoiceMarker(
  text: string,
  done = false,
  question?: string | null,
): ChoiceSplit {
  const none = (body: string): ChoiceSplit => ({ choice: null, body, pending: false });

  if (text.length === 0) return none('');

  if (text.length < CHOICE_MARKER.length) {
    /*
     * Still short enough to be a prefix of the token. Wait only if it actually
     * is one -- a first character that is not `P` costs the querent nothing,
     * which is what keeps the ordinary reading's time-to-first-word unchanged.
     */
    const possible = CHOICE_MARKER.startsWith(text.toUpperCase());
    if (!possible) return none(text);
    return done ? none(text) : { choice: null, body: '', pending: true };
  }

  if (text.slice(0, CHOICE_MARKER.length).toUpperCase() !== CHOICE_MARKER) {
    /* Not at the front. It may still be at the back -- see `splitTrailingMarker`. */
    return splitTrailingMarker(text, done, question ?? null);
  }

  const nl = text.indexOf('\n');

  if (nl === -1) {
    /*
     * **A MARKER LINE REQUIRES A NEWLINE, AND AT EOF THAT MEANS NO BOX.** The
     * alternative -- treat the whole body as a marker and render nothing -- would
     * hand a querent an empty reading to protect them from seeing eight
     * characters. A body with no newline at all is a broken generation for both
     * services this rule applies to, so showing it is strictly better.
     */
    if (done || text.length > MARKER_SCAN_LIMIT) return none(text);
    return { choice: null, body: '', pending: true };
  }

  const raw = text.slice(CHOICE_MARKER.length, nl).trim();

  /*
   * **THIS FUNCTION IS THE PROTOCOL AND `validateChoice` IS THE POLICY, AND THE
   * LENGTH RULE BELONGS TO THE SECOND.** The first version applied
   * `CHOICE_MAX_CHARS` here and returned null past it -- which made a model that
   * wrote a whole clause on the marker line INDISTINGUISHABLE from a model that
   * wrote no marker at all. Both arrived as `choice: null`, so
   * `reading.completed.choice` recorded `none` for a rule the reader had actually
   * broken, and the one measurement that says whether `CHOICE_RULE_*` works had a
   * hole in exactly the case worth seeing.
   *
   * So: report what was on the line, and let the caller judge it. The candidate is
   * bounded anyway -- `MARKER_SCAN_LIMIT` above gives up before the line can exceed
   * 96 characters -- so "report it verbatim" is not unbounded.
   *
   * The line itself is stripped EITHER WAY. It is protocol noise, not prose:
   * rendering `PILIHAN:` because the model named nothing after it would be the
   * exact failure this module exists to prevent, arriving through the lenient
   * branch.
   */
  const choice = raw.length > 0 ? raw : null;

  /*
   * The blank line the prompt asks for goes with the marker. Leading whitespace
   * generally, because a model that emits one newline instead of two has still
   * followed the rule that matters, and a reading never begins with a space.
   *
   * MONOTONIC, which the split test asserts: `nl` is fixed once found, the slice
   * grows with `text`, and stripping a leading run can only ever reveal more.
   */
  return { choice, body: text.slice(nl + 1).replace(/^\s+/, ''), pending: false };
}

/**
 * ── THE MARKER ON THE LAST LINE, WHICH IS WHERE IT ACTUALLY TURNED UP ────────
 *
 * Observed live 2026-08-20, the first `spread3` of the session, `glm-4.6`, on a
 * question that offered no options at all:
 *
 *     ...four paragraphs...
 *     PILIHAN: aku ambil
 *
 * `CHOICE_RULE_ID` forbids both of those independently — the marker line goes
 * BEFORE the reading, and a question with nothing to choose between gets no
 * marker at all — and the model broke both at once. Because this module only ever
 * looked at offset 0, the line was not protocol as far as the code was concerned,
 * so it was rendered as a line of the querent's reading and stored in
 * `readings.body`. **That is the failure this file's header calls INVISIBLE: no
 * event fires, because from the code's point of view nothing happened.**
 * `CHOICE_RULE_*` was tightened in the same commit; this is the mechanical half,
 * because *"the card-name check is MECHANICAL, not only a prompt rule"* is the
 * house rule for exactly this shape.
 *
 * ── WHY THIS BRANCH NEEDS THE QUESTION AND THE LEADING ONE DOES NOT ──────────
 *
 * **The leading branch strips unconditionally and must keep doing so.** A reading
 * does not open with `Pilihan:`, so at offset 0 the token cannot collide with
 * prose and stripping it costs nothing even when the candidate is rubbish.
 *
 * **At the end it CAN collide.** `Pilihan: tetap di sini.` is an ordinary
 * Indonesian sentence, and a model told to name the choice in its closing
 * paragraph is *more* likely than usual to write one. Stripping on shape alone
 * would delete the querent's last paragraph to hide eight characters — strictly
 * worse than the bug. So this branch strips only when the candidate is **one of
 * the querent's own options**, which bounds the worst case to moving the
 * querent's own words out of the prose and into the box that was built to hold
 * them. `validateChoice` is policy and this is protocol, so calling it from here
 * is a deliberate exception to that separation, and the negative control in the
 * test is what keeps it honest.
 *
 * **A MARKER IN THE MIDDLE OF THE BODY IS NOT STRIPPED, AND THAT IS SCOPE, NOT
 * AN OVERSIGHT.** Two positions have been observed; removing arbitrary interior
 * lines raises the prose-eating risk with no evidence to pay for it. The
 * instrument if it ever happens is the one the header already names:
 * `npm run smoke -- --all --choice`, and read the markers.
 */
function splitTrailingMarker(
  text: string,
  done: boolean,
  question: string | null,
): ChoiceSplit {
  const none = (body: string): ChoiceSplit => ({ choice: null, body, pending: false });

  const lastNl = text.lastIndexOf('\n');
  if (lastNl === -1) return none(text);

  const tail = text.slice(lastNl + 1);
  /* Ends on a newline: there is no partial line to hold back. */
  if (tail.length === 0) return none(text);

  const upper = tail.toUpperCase();
  const isMarker = upper.startsWith(CHOICE_MARKER);
  /*
   * Could still BECOME the marker. Same trade as the leading branch: the first
   * character that is not `P` releases the line immediately, so an ordinary
   * paragraph pays at most one chunk, once, and only if it opens with a prefix of
   * the token.
   */
  const couldBe = !isMarker && CHOICE_MARKER.startsWith(upper);
  if (!isMarker && !couldBe) return none(text);

  /*
   * `MARKER_SCAN_LIMIT` bounds LATENCY here exactly as it does at the front: a
   * paragraph that merely opens with `Pilihan:` and runs on must not be withheld
   * from the screen until its newline arrives.
   */
  if (tail.length > MARKER_SCAN_LIMIT) return none(text);

  /*
   * **THE NEWLINE STAYS IN THE BODY AND THE BODY IS NEVER RIGHT-TRIMMED**, because
   * `body` must grow monotonically across chunks and trimming it at the flush
   * would make the final body shorter than one already painted. Trailing
   * whitespace renders as nothing, so the invariant is free.
   */
  const kept = text.slice(0, lastNl + 1);

  if (!done) return { choice: null, body: kept, pending: true };

  /* Flushed mid-token: the line never became a marker, so it is prose. */
  if (!isMarker) return none(text);

  const raw = tail.slice(CHOICE_MARKER.length).trim();
  if (raw.length === 0) return none(text);
  if (!validateChoice(raw, question)) return none(text);

  return { choice: raw, body: kept, pending: false };
}

/** Regex-safe, so a candidate full of metacharacters is a literal. */
function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * **A CANDIDATE THAT NAMES MORE THAN ONE OPTION IS NOT A CHOICE, AND THIS IS THE
 * CHECK THAT COST THE MOST TO LEARN.**
 *
 * Measured live, `npm run smoke -- --all --choice`, 2026-07-29: three of eighteen
 * readings answered the marker line with a whole clause out of the question —
 * `PILIHAN: makan ayam atau ikan nanti siang`, `PILIHAN: makan ayam atau ikan`.
 * Every word-bounded and length check passed, because a clause from the question IS
 * a word-bounded substring of the question and 32 characters is inside the cap. So
 * the box would have rendered **`makan ayam atau ikan`** — which is precisely the
 * confusing non-answer this whole feature was built to stop, promoted out of the
 * prose and into the one highlighted element on the page.
 *
 * `validateChoice`'s guarantee was "the box contains only the querent's words". That
 * was true and insufficient: it has to be **one of the querent's OPTIONS**.
 *
 * BIASED TOWARDS REJECTING, and the asymmetry is why the list can afford to be
 * blunt: a false rejection costs the box and nothing else — the reading still names
 * the choice in its prose, because the prompt asks for both — while a false
 * acceptance ships the reported bug. `apa` is an ordinary Indonesian word and is on
 * the list anyway, because `A apa B` is the colloquial disjunction and a candidate
 * short enough to be an option has no other reason to contain it.
 *
 * A COMMA IS ON THE LIST TOO: `ayam, ikan, atau tahu` is three options, and a
 * three-way question is exactly where a model lists rather than chooses.
 */
const MULTI_OPTION = /[,;/]|\b(?:atau|ataukah|apa|apakah|or|versus|vs)\b/iu;

/**
 * The candidate, resolved against the question the querent actually typed — or
 * null.
 *
 * **RETURNS A SLICE OF `question`, NEVER THE MODEL'S COPY.** That is the whole
 * guarantee and it is why the return type is a string rather than a boolean: a
 * caller handed `true` would render the model's text, and the box would be
 * model-controlled again one refactor later.
 *
 * WORD-BOUNDED WITH EXPLICIT LOOKAROUNDS AND NOT `\b`, which is ASCII-only and
 * would misjudge any question containing a non-ASCII letter beside an option.
 * The bounds are what stop `aya` matching inside `ayam` and reporting a choice
 * the querent never offered.
 *
 * Punctuation the model wrapped around the option is trimmed first — `"Ikan".`
 * is a model obeying the rule with quotes on, and refusing it would cost a
 * correct box. The trim is on the OUTSIDE only, so an option that genuinely
 * contains a space or a hyphen still has to appear that way in the question.
 */
export function validateChoice(choice: string | null, question: string | null): string | null {
  if (!choice || !question) return null;
  if (choice.length > CHOICE_MAX_CHARS) return null;

  const cleaned = choice.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (cleaned.length === 0) return null;

  /* Named both options, or listed three. See `MULTI_OPTION`. */
  if (MULTI_OPTION.test(cleaned)) return null;

  const bounded = new RegExp(
    `(?<![\\p{L}\\p{N}])${escape(cleaned)}(?![\\p{L}\\p{N}])`,
    'iu',
  );
  const found = bounded.exec(question);
  if (!found) return null;

  return question.slice(found.index, found.index + found[0].length);
}
