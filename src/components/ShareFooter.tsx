'use client';

/**
 * The share control, and the sheet it opens. THREE MOUNTS, ONE COMPONENT: after a
 * completed reading on the draw screen, on the history detail screen, and — when
 * V8 lands — on `/account` with `entity="persona"`.
 *
 * ── THE SHEET RENDERS THE REAL PAGE, WHICH IS MECHANISM 3 OF §5's FOUR ──────
 *
 * `share.sheet.lead` promises *"this is exactly what they will see"*, and the
 * sheet makes that true BY CONSTRUCTION rather than by review: it mounts the same
 * `ReadingView` the public page mounts (VD10), with the toggles applied, from data
 * the host already has on screen. No query, no round trip, no second renderer —
 * and it stays true when somebody adds a field to `ReadingView` next quarter.
 *
 * **AND SINCE 2026-07-28 THE PREVIEW IS THE ONLY CONSENT MECHANISM FOR THE
 * QUESTION**, because Miftah reversed VD9 and the question is now always part of
 * the shared page. There is no switch for it; there is a line of copy saying it
 * goes public, above a preview showing the exact text. `schema.ts`'s comment on
 * `include_question` records what that costs.
 *
 * **THE PREVIEW IS BUILT BY THE SAME FUNCTION THE PUBLIC PAGE USES.**
 * `previewReadingView` mirrors `src/app/s/[slug]/adapt.ts` and passes
 * `{ kind: 'as-written' }` for the same reason — a preview that showed the
 * translating spinner would be a preview of a bug rather than of the page.
 *
 * ── THE URL IS NEVER CONSTRUCTED HERE ───────────────────────────────────────
 *
 * It arrives in the POST response. `SHARE_BASE_URL` carries no `NEXT_PUBLIC_`
 * prefix, so a client component building the URL would read `undefined` for the
 * origin — the trap `localeSwitcherEnabled()`'s header records, which "lived in
 * `LocaleSwitch.tsx` for about ten minutes". `clientBoundary.test.ts` asserts no
 * client file imports `@/lib/share/links`, which is where the builder lives.
 *
 * ── STRUCTURALLY `AccountMenu`, DELIBERATELY ────────────────────────────────
 *
 * The same scrim, the same portal to `document.body`, the same Tab trap, the same
 * body-scroll lock, the same explicit `returnFocusTo` prop. **The focus prop is
 * not a stylistic copy: SAFARI DOES NOT FOCUS A `<button>` WHEN IT IS TAPPED**, so
 * `document.activeElement` on the way in is `<body>` on the one platform this app
 * is built for, and restoring to it drops the querent at the top of the document
 * with no idea where the sheet went. `AccountMenu`'s header has the full account
 * of how that was found.
 *
 * The portal matters here more than it did there: this sheet is opened from inside
 * the draw screen, which is full of `transform`s, and `position: fixed` positions
 * against the nearest transformed ancestor rather than the viewport.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ReadingView, type ReadingProse, type ReadingViewData } from './ReadingView';
import { LOCAL_DATE_HEADER, SESSION_HEADER } from '@/lib/analytics/localdate';
import { getSessionId, track } from '@/lib/analytics/track.client';
import { useLocale, useT } from '@/lib/i18n/LocaleProvider';
import type { Locale } from '@/data/types';
import type { ShareEntity } from '@/lib/share/slug';
import { todayKey } from '@/lib/storage';
import styles from './ShareFooter.module.css';

/**
 * How long the client waits on any of the three requests.
 *
 * **THIS IS THE HALF OF `maxDuration` THAT LIVES IN THE BROWSER, AND CLAUDE.md SAYS
 * WHY IT IS NOT OPTIONAL:** the mint's server budget went 20s -> 30s when it started
 * resolving the pinned locale, and *"a bigger `maxDuration` is not a latency
 * regression — but it MUST be paired with a bound on the client, or you have only
 * made the hang longer."* That was `POST /api/locale`'s lesson, paid for on a real
 * iPhone.
 *
 * 8s rather than `LocaleSwitch`'s 6: this path can legitimately include a model call,
 * where that one could not. It is a bound on the querent's patience, not on the
 * lambda -- the mint runs to its own budget and its row still lands, and the next
 * open of the sheet reads it back through `GET`.
 */
const REQUEST_TIMEOUT_MS = 8000;

/** What the sheet knows about a link that exists. NEVER stored, only displayed. */
type LiveLink = {
  /** `share_links.id`. The analytics key and the revoke key. Never the slug. */
  id: string;
  /** Built by the server. See the header. */
  url: string;
  /**
   * The language this address renders, as STORED — `null` means as-written.
   *
   * Not the locale the querent was in when they minted it: the mint resolves the
   * pin and falls back to `null` when it cannot produce a translation, so labelling
   * from the UI's own locale would call an as-written link "English".
   */
  locale: Locale | null;
};

type Phase =
  | 'idle'
  /**
   * The GET is in flight.
   *
   * **THE SHEET OPENS INTO THIS RATHER THAN WAITING FOR THE FETCH.** A mint is one
   * of the few actions likely to be the request that wakes a suspended Neon compute
   * (CLAUDE.md), and the read that precedes it now shares that risk — so a sheet
   * that only appeared once the links were known would be a dead Share button for
   * however long the compute takes.
   */
  | 'loading'
  | 'sheet'
  | 'creating'
  | 'live'
  | 'revoking'
  | 'revoked'
  | 'error';

export type ShareFooterProps = {
  entity: ShareEntity;
  entityId: string;
  /**
   * The reading as the host already has it, question INCLUDED.
   *
   * The host passes the unfiltered truth and the sheet decides what the preview
   * shows. Since the question is always shared, the two now agree — but the
   * ordering is kept, because it is what let the sheet show the difference a
   * switch made and it is what would let it again.
   */
  preview: ReadingViewData;
  /**
   * **WHAT THE HOST IS CURRENTLY RENDERING, so the preview can be the page.**
   *
   * REQUIRED, not optional, and that is the point. Since design A the link pins
   * the locale the sharer is reading and the public page renders that translation
   * — so a sheet that only had `preview.body` would show the ORIGINAL while the
   * page showed the translation, silently breaking the one promise the sheet
   * makes. An optional prop would let a mount reintroduce that by omission.
   *
   * A host with nothing to translate passes `{ kind: 'original' }`; see
   * `previewReadingView` for the mapping and why it is not a pass-through.
   */
  prose: ReadingProse;
  /** For the "A reading for {nickname}" line, mirroring the public page's chrome. */
  nickname?: string | null;
};

export function ShareFooter({ entity, entityId, preview, prose, nickname }: ShareFooterProps) {
  const t = useT();
  const viewing = useLocale();
  const [phase, setPhase] = useState<Phase>('idle');
  /**
   * EVERY live address, not one. See `openSheet`.
   *
   * A reading can hold an address per language since 2026-07-28, so a single-link
   * state would have to pick one — and picking the newest is exactly the bug that
   * was reported, moved from the server into the client.
   */
  const [links, setLinks] = useState<LiveLink[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<
    'share.error.generic' | 'share.error.notShareable' | 'share.error.rateLimit'
  >('share.error.generic');

  /**
   * The address for the language the querent is reading RIGHT NOW, if it exists.
   *
   * **A `null`-pinned link does NOT satisfy this, deliberately.** It renders
   * as-written, so for a reading in the other language it is not the link the
   * querent is asking for — and treating it as one would suppress the offer to mint
   * the language they are actually reading.
   */
  const currentLink = links.find((l) => l.locale === viewing) ?? null;

  /**
   * A link's language, in the querent's language.
   *
   * `locale.name.*` is written identically in both catalogs, which is correct here:
   * the label names the LINK's language, so an English link reads "English" to an
   * Indonesian querent.
   *
   * **A SWITCH AND NOT `t(\`locale.name.${l}\`)`.** A `Localized<>` value inside a
   * template literal is one of the traps W6 paid for, and the key set is closed and
   * two long.
   *
   * A `null` pin renders as-written, i.e. in the reading's own language, so it is
   * labelled with `preview.locale`. Truthful, and it means two links can carry the
   * same label when a legacy unpinned address sits beside a pinned one for the same
   * language — which is right, because they render the same prose.
   */
  function languageName(locale: Locale | null): string {
    return (locale ?? preview.locale) === 'en' ? t('locale.name.en') : t('locale.name.id');
  }

  /*
   * **THE QUESTION IS ALWAYS INCLUDED AND THERE IS NO SWITCH FOR IT.** Miftah's
   * ruling, 2026-07-28, reversing VD9: a stranger who sees three cards and four
   * paragraphs with no question cannot tell what any of it is about, so a shared
   * reading without its question is not worth sharing.
   *
   * `INCLUDE_QUESTION` IS A CONSTANT RATHER THAN A DELETED ARGUMENT, so the wire
   * format still states the decision explicitly and the route's schema can keep
   * requiring the field. `schema.ts`'s comment on the column records what the
   * reversal costs and what still guards it -- the short version is that the
   * PREVIEW below is now the consent mechanism: the querent reads the exact
   * question that is about to be public, before the link exists.
   *
   * `include_nickname` keeps its switch, because a nickname is a name rather than
   * context and nothing in the reading depends on it.
   */
  const INCLUDE_QUESTION = true;
  const [includeNickname, setIncludeNickname] = useState(true);

  const opener = useRef<HTMLButtonElement | null>(null);

  const open = phase !== 'idle';

  return (
    <div className={styles.footer}>
      <button
        ref={opener}
        type="button"
        className={styles.action}
        onClick={() => void openSheet()}
      >
        {t('share.action')}
      </button>

      {open ? (
        <ShareSheet
          entity={entity}
          returnFocusTo={opener}
          onClose={() => {
            setPhase('idle');
            setCopiedId(null);
          }}
          title={t(entity === 'persona' ? 'share.sheet.titlePersona' : 'share.sheet.title')}
          preview={<ReadingView {...previewReadingView(preview, INCLUDE_QUESTION, prose)} />}
          nicknameLine={
            includeNickname && nickname
              ? t('share.public.forNickname', { nickname })
              : null
          }
        >
          {phase === 'loading' ? (
            <p className={styles.lead} aria-live="polite">
              {t('share.sheet.loading')}
            </p>
          ) : null}

          {phase === 'sheet' || phase === 'creating' || phase === 'error' ? (
            <>
              <p className={styles.lead}>{t('share.sheet.lead')}</p>

              {/*
                NOT A SWITCH. The question goes public and the querent is told so
                in words, next to a preview that shows the exact text. Rendered
                only when there IS a question -- a `daily` draw often has none, and
                a notice about a field that does not exist reads as a bug.
              */}
              {preview.question ? (
                <p className={styles.notice}>{t('share.sheet.questionIncluded')}</p>
              ) : null}

              <Toggle
                label={t('share.sheet.includeNickname')}
                hint={t('share.sheet.includeNickname.hint', { nickname: nickname ?? '' })}
                checked={includeNickname}
                disabled={phase === 'creating' || !nickname}
                onChange={setIncludeNickname}
              />

              <p className={styles.warning}>{t('share.sheet.warning')}</p>

              {phase === 'error' ? <p className={styles.error}>{t(errorKey)}</p> : null}

              <button
                type="button"
                className={styles.primary}
                disabled={phase === 'creating'}
                onClick={() => void create()}
              >
                {t(phase === 'creating' ? 'share.sheet.creating' : 'share.sheet.create')}
              </button>
            </>
          ) : null}

          {phase === 'live' || phase === 'revoking' ? (
            <>
              <p className={styles.lead}>
                {links.length > 1 ? t('share.sheet.links') : t('share.sheet.live')}
              </p>

              {/*
                ONE BLOCK PER LANGUAGE. Labelled, because two bare URLs beside each
                other are indistinguishable and the querent has to know which one to
                send to which person. The label is rendered even when there is only
                one link -- an unlabelled single link plus a labelled pair would mean
                the label appears only in the state the querent reaches least often.
              */}
              {links.map((l) => (
                <div key={l.id} className={styles.linkRow}>
                  <p className={styles.linkLabel}>{languageName(l.locale)}</p>
                  {/*
                    A read-only input rather than a `<p>`: on iOS a long URL in a
                    paragraph cannot be selected reliably, and `manual` is the copy
                    path of last resort. `readOnly` and not `disabled`, because a
                    disabled input is not selectable either.
                  */}
                  <input
                    className={styles.url}
                    value={l.url}
                    readOnly
                    aria-label={`URL — ${languageName(l.locale)}`}
                  />
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={phase === 'revoking'}
                    onClick={() => void copy(l)}
                  >
                    {t(copiedId === l.id ? 'share.sheet.copied' : 'share.sheet.copy')}
                  </button>
                </div>
              ))}

              {/*
                THE OFFER, AND ONLY WHEN THE LANGUAGE ON SCREEN HAS NO ADDRESS. This
                is the control the reported bug had no way to express: the querent
                could previously only replace the link they had. It routes back
                through `sheet` rather than minting on the spot, because the preview
                is the consent mechanism and a NEW language means a new preview --
                "this is exactly what they will see" is about the prose, which is
                about to be different.
              */}
              {!currentLink ? (
                <button
                  type="button"
                  className={styles.primary}
                  disabled={phase === 'revoking'}
                  onClick={() => setPhase('sheet')}
                >
                  {t('share.sheet.createIn', { language: languageName(viewing) })}
                </button>
              ) : null}

              <p className={styles.warning}>{t('share.sheet.warning')}</p>

              {/*
                ONE REVOKE, ARTIFACT-WIDE. Miftah's consent ruling: a per-link kill
                would let the querent tap the wrong one, believe the reading is
                private, and leave an address serving the public internet. The string
                says "all" for the same reason.
              */}
              <button
                type="button"
                className={styles.revoke}
                disabled={phase === 'revoking'}
                onClick={() => void revoke()}
              >
                {t(phase === 'revoking' ? 'share.sheet.revoking' : 'share.sheet.revoke')}
              </button>
            </>
          ) : null}

          {phase === 'revoked' ? (
            <>
              {/*
                THE COPY SAYS "SHARING AGAIN MINTS A NEW ADDRESS" BECAUSE THE
                SERVER ROTATES THE SLUG. Un-revoking the row would be the one-line
                version and it resurrects a capability the querent deliberately
                killed -- the old URL, in the group chat they revoked it because
                of, starts working again. The sentence on screen is what makes the
                server's behaviour legible.
              */}
              <p className={styles.lead}>{t('share.sheet.revoked')}</p>
              <button type="button" className={styles.primary} onClick={() => setPhase('sheet')}>
                {t('share.sheet.create')}
              </button>
            </>
          ) : null}
        </ShareSheet>
      ) : null}
    </div>
  );

  /**
   * Open the sheet, and find out what already exists.
   *
   * **THE SHEET HAD NO READ PATH BEFORE THIS, AND THAT IS WHY THE 2026-07-28 BUG
   * ARRIVED WITH NO WARNING.** `links` only ever held something minted in this
   * mount, so a reading shared yesterday looked unshared: the querent got the create
   * flow, minted, and the address they had already sent somebody was replaced with
   * nothing on screen having said so.
   *
   * **ON THE OPEN AND NOT ON MOUNT.** This component renders under every completed
   * reading and on every history detail page; fetching per mount would put a request
   * on a screen the querent may never share from. The cost is paid when they tap.
   *
   * **A FAILED READ FALLS THROUGH TO THE CREATE FLOW RATHER THAN ERRORING.** The
   * querent's goal is a link; the list is an improvement on not knowing. Refusing to
   * open the sheet because a read failed would make an outage in the new code path
   * break the feature that worked before it.
   */
  async function openSheet() {
    setPhase('loading');
    const links = await fetchLinks();
    setLinks(links);
    setPhase(links.length > 0 ? 'live' : 'sheet');
  }

  /** The GET. Returns `[]` for every failure — see `openSheet`. */
  async function fetchLinks(): Promise<LiveLink[]> {
    try {
      const query = new URLSearchParams({ entity, entity_id: entityId });
      const res = await fetch(`/api/share?${query}`, {
        headers: { [SESSION_HEADER]: getSessionId() },
        // BOUNDED, for `create()`'s reason: this read can wake a Neon compute too.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return [];
      const body = (await res.json()) as { links?: LiveLink[] };
      return body.links ?? [];
    } catch {
      return [];
    }
  }

  async function create() {
    setPhase('creating');
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SESSION_HEADER]: getSessionId(),
          [LOCAL_DATE_HEADER]: todayKey(),
        },
        /*
         * **BOUNDED ON THE CLIENT, BECAUSE THE SERVER'S BUDGET WENT UP.** The mint
         * now resolves the pinned locale, which can mean a model call, so
         * `maxDuration` moved 20 -> 30 — and CLAUDE.md's `POST /api/locale` lesson is
         * that raising a server budget without a client bound does not fix a hang, it
         * lengthens one.
         *
         * **GIVING UP HERE DOES NOT LOSE THE LINK.** The lambda runs to its own
         * budget, so the row still lands; the next open of the sheet reads it back
         * through `GET` and shows it. That is only true because the read path exists
         * — before it, an abandoned mint was an address the querent could never see.
         */
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          entity,
          entity_id: entityId,
          // ALWAYS BOTH, EXPLICITLY. The route requires them; see its schema.
          include_question: INCLUDE_QUESTION,
          // NOT the raw state -- see `effectiveIncludeNickname`. A disabled toggle
          // keeps its value, and that value was being posted as consent.
          include_nickname: effectiveIncludeNickname(includeNickname, nickname),
        }),
      });

      if (!res.ok) {
        setErrorKey(
          res.status === 403
            ? 'share.error.notShareable'
            : res.status === 429
              ? 'share.error.rateLimit'
              : 'share.error.generic',
        );
        setPhase('error');
        return;
      }

      const body = (await res.json()) as { id: string; url: string; locale: Locale | null };
      /*
       * **THE STORED PIN, NOT `viewing`.** The mint falls back to a `null` pin when it
       * cannot produce a translation, so labelling this from the UI's locale would put
       * "English" under an address that renders Indonesian.
       *
       * Merged rather than assigned: this may be the SECOND address for the reading,
       * and replacing the list would hide the first one until the sheet is reopened.
       * Keyed on `id`, so a rotation of an existing address replaces its row instead
       * of appearing twice.
       */
      setLinks((prev) => {
        const next = prev.filter((l) => l.id !== body.id);
        return [...next, { id: body.id, url: body.url, locale: body.locale ?? null }];
      });
      setPhase('live');
      /*
       * NO `share.created` HERE. The SERVER fires it, inside the request that
       * minted the row, so it cannot disagree with what was written. A client copy
       * would double-count the only funnel this feature has -- the same reasoning
       * `AccountMenu` records for using plain `Link`s rather than `TrackLink`s.
       */
    } catch {
      // Offline, or a body that is not JSON. One message: the querent's next
      // action is the same either way.
      setErrorKey('share.error.generic');
      setPhase('error');
    }
  }

  /**
   * Stop sharing — **every language at once**.
   *
   * The body names ONE id and the server expands it to the artifact (Miftah's consent
   * ruling). `links[0]` is the anchor: any live row of this artifact identifies it,
   * and the ownership check is the route's, so which one is sent does not matter.
   *
   * `setLinks([])` on success rather than re-fetching. The server just told us it
   * revoked; a second round trip to learn the same thing would put the querent on a
   * spinner after the destructive action had already completed.
   */
  async function revoke() {
    const anchor = links[0];
    if (!anchor) return;
    setPhase('revoking');
    try {
      const res = await fetch('/api/share', {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
          [SESSION_HEADER]: getSessionId(),
          [LOCAL_DATE_HEADER]: todayKey(),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({ id: anchor.id }),
      });
      if (!res.ok) {
        setErrorKey('share.error.generic');
        setPhase('error');
        return;
      }
      setLinks([]);
      setCopiedId(null);
      setPhase('revoked');
    } catch {
      setErrorKey('share.error.generic');
      setPhase('error');
    }
  }

  /**
   * Copy, preferring what "send it to WhatsApp" actually is on a phone.
   *
   * `navigator.share` FIRST on a device that has it: the querent's goal is a chat
   * bubble, and the OS sheet gets them there in one tap instead of copy-then-paste.
   * `navigator.clipboard` second. `manual` last — the URL is already in a
   * selectable read-only input, so "both APIs refused" still leaves a way through,
   * and `method` records which one carried it.
   *
   * **THE CALL MUST STAY INSIDE THE CLICK HANDLER.** Both APIs require transient
   * activation, so awaiting anything before them loses the gesture and the share
   * sheet silently never opens.
   */
  async function copy(link: LiveLink) {
    /*
     * **THE LINK IS AN ARGUMENT AND NOT READ FROM STATE**, which matters now that
     * there are several: a `copy()` that reached for `links[0]` would silently copy
     * the wrong language's address from the second button down, and the querent would
     * find out in the chat they had already sent it to.
     */
    const url = link.url;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ url });
        track('share.copied', { share_id: link.id, entity, method: 'webshare' });
        return;
      } catch {
        /*
         * A CANCEL AND A FAILURE ARE INDISTINGUISHABLE HERE -- `AbortError` is what
         * a dismissed OS sheet throws -- so falling through to the clipboard is the
         * only behaviour that is right for both. The cost is a clipboard write the
         * querent did not ask for, which is harmless; the alternative costs a
         * genuine failure its fallback.
         */
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        // PER LINK, so "Copied" appears under the button that was pressed.
        setCopiedId(link.id);
        track('share.copied', { share_id: link.id, entity, method: 'clipboard' });
        return;
      } catch {
        // Denied permission, or an insecure context. The input is still selectable.
      }
    }

    track('share.copied', { share_id: link.id, entity, method: 'manual' });
  }
}

/**
 * The reading as the public page will render it, with the toggles applied.
 *
 * **MIRRORS `src/app/s/[slug]/adapt.ts` AND MUST KEEP MIRRORING IT.** It cannot
 * BE that function: the adapter's input is a `PublicReading` the server built, and
 * the sheet's input is the `ReadingViewData` the host already has on screen — which
 * is the whole reason the preview needs no query. What both must agree on is the
 * two decisions that change what a viewer sees:
 *
 *   - `question` is nulled when `includeQuestion` is false. **NO CALLER PASSES
 *     FALSE ANY MORE** -- the question is always included since Miftah's ruling --
 *     and the parameter stays because it is the mechanism if that is revisited,
 *     and because a preview that hardcoded the answer could not show the
 *     difference if a switch ever comes back.
 *   - `prose` is `{ kind: 'as-written' }`, because that is what the public page
 *     passes. Omitting it would show the translating spinner to a sharer whose UI
 *     language differs from their reading's — a preview of a bug rather than of
 *     the page.
 *
 * `sharedAt` is nulled for the adapter's reason: a stranger never sees the badge.
 */
export function previewReadingView(
  reading: ReadingViewData,
  includeQuestion: boolean,
  hostProse: ReadingProse,
): { reading: ReadingViewData; prose: ReadingProse } {
  return {
    reading: {
      ...reading,
      question: includeQuestion ? reading.question : null,
      sharedAt: null,
    },
    /*
     * **THE HOST'S PROSE, MAPPED TO WHAT THE PUBLIC PAGE WILL ACTUALLY DO.**
     *
     * `'translated'` passes through: the link pins the locale the sharer is
     * reading, the row exists (V2 wrote it before this state was reached), and the
     * resolver will find it. That is the case design A exists for and the case
     * this preview used to get wrong -- it hardcoded `as-written`, so a sharer
     * reading English previewed the Indonesian source and then sent a link showing
     * English.
     *
     * EVERY OTHER STATE MAPS TO `as-written`, because none of them will have a row
     * for the resolver to find. `original` and `as-written` mean the source is
     * already what is on screen. `translating` is mid-stream and V2 persists on
     * completion. `unavailable` means the translation failed and V2 never persists
     * an unverified generation. In all four the page falls back to the source, so
     * the source is what an honest preview shows -- passing the host's state
     * straight through would put a spinner or an error into a preview of a page
     * that renders prose perfectly well.
     */
    prose: hostProse.kind === 'translated' ? hostProse : { kind: 'as-written' },
  };
}

/**
 * What `include_nickname` should actually be on the wire.
 *
 * **WHAT THE SHARER COULD NOT SEE, THEY DID NOT CONSENT TO.** The toggle is
 * disabled when there is no nickname, but a disabled checkbox keeps its state — so
 * for two workstreams the draw screen, which was mounted with no `nickname` prop at
 * all, posted `include_nickname: true` with the control dead. The resolver then
 * projected the column and the public page rendered a nickname the sharer could not
 * switch off and had never seen, because `nicknameLine` is `includeNickname &&
 * nickname` and had silently left it out of the preview.
 *
 * The draw screen now fetches the nickname, which fixes the visible half. This is
 * the other half, and both are needed: either alone leaves the wire able to state a
 * consent that never happened.
 *
 * **THE `trim()` MATCHES `sharedNickname` DELIBERATELY.** That function treats blank
 * and whitespace as absent, so if these two disagreed the sheet would offer a switch
 * governing a line the page cannot render.
 */
export function effectiveIncludeNickname(
  checked: boolean,
  nickname: string | null | undefined,
): boolean {
  return checked && typeof nickname === 'string' && nickname.trim() !== '';
}

/** One switch plus its hint line. A real `<input type="checkbox">`, so the
 *  platform gives us the label association, the keyboard and the a11y role. */
function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={styles.toggle} data-disabled={disabled ? '' : undefined}>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.toggleText}>
        <span className={styles.toggleLabel}>{label}</span>
        <span className={styles.toggleHint}>{hint}</span>
      </span>
    </label>
  );
}

/**
 * The bottom sheet. `AccountMenu`'s modal idiom, extracted only as far as this
 * file needs — one modal idiom in this app, not two, and not three.
 */
function ShareSheet({
  title,
  preview,
  nicknameLine,
  children,
  onClose,
  returnFocusTo,
}: {
  title: string;
  preview: React.ReactNode;
  nicknameLine: string | null;
  children: React.ReactNode;
  onClose: () => void;
  returnFocusTo: React.RefObject<HTMLButtonElement | null>;
  entity: ShareEntity;
}) {
  const t = useT();
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const returnFocusRef = useRef(returnFocusTo);
  returnFocusRef.current = returnFocusTo;

  useEffect(() => {
    // The CONTAINER, not the first control: Chrome applies `:focus-visible` to
    // programmatic focus, so focusing a row puts a gold ring on it for a thumb
    // user who has never touched a keyboard. `AccountMenu` measured this.
    sheetRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const sheet = sheetRef.current;
      if (!sheet) return;
      const items = [
        ...sheet.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled])',
        ),
      ];
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;

      /*
       * `active === sheet` is the ENTRY case and is not redundant with
       * `!contains`: the effect above focuses the container, and the container is
       * inside itself, so a Shift+Tab as the very first keystroke would otherwise
       * escape into the browser chrome with a scrim over the page. Reachable only
       * on the first keypress after opening, which is why it is easy to miss.
       */
      if (e.shiftKey && (active === first || active === sheet || !sheet.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      // See `AccountMenu`: a PROP and not `document.activeElement`, because Safari
      // does not focus a button when it is tapped.
      returnFocusRef.current.current?.focus?.();
    };
  }, []);

  return createPortal(
    <div className={styles.scrim} onClick={onClose}>
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-sheet-title"
        tabIndex={-1}
        // The scrim closes on tap; the sheet is the part that must not.
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.grip} aria-hidden="true" />
        <h2 className={styles.title} id="share-sheet-title">
          {title}
        </h2>

        {/*
          THE PREVIEW, AND IT IS THE POINT OF THE SHEET. Scrollable and visually
          inset so it reads as "a page inside a page" rather than as this sheet's
          own content -- `aria-label` says so for a screen reader, because a
          preview announced as the document would be confusing rather than
          reassuring.
        */}
        <div className={styles.previewWrap} aria-label={t('share.sheet.lead')}>
          {nicknameLine ? <p className={styles.previewNickname}>{nicknameLine}</p> : null}
          <div className={styles.preview}>{preview}</div>
        </div>

        {children}

        <button type="button" className={styles.close} onClick={onClose}>
          {t('share.sheet.close')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
