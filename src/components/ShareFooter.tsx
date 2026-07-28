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
import { useT } from '@/lib/i18n/LocaleProvider';
import type { ShareEntity } from '@/lib/share/slug';
import { todayKey } from '@/lib/storage';
import styles from './ShareFooter.module.css';

/** What the sheet knows about a link that exists. NEVER stored, only displayed. */
type LiveLink = {
  /** `share_links.id`. The analytics key and the revoke key. Never the slug. */
  id: string;
  /** Built by the server. See the header. */
  url: string;
};

type Phase = 'idle' | 'sheet' | 'creating' | 'live' | 'revoking' | 'revoked' | 'error';

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
  /** For the "A reading for {nickname}" line, mirroring the public page's chrome. */
  nickname?: string | null;
};

export function ShareFooter({ entity, entityId, preview, nickname }: ShareFooterProps) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>('idle');
  const [link, setLink] = useState<LiveLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorKey, setErrorKey] = useState<
    'share.error.generic' | 'share.error.notShareable' | 'share.error.rateLimit'
  >('share.error.generic');

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
        onClick={() => setPhase(link ? 'live' : 'sheet')}
      >
        {t('share.action')}
      </button>

      {open ? (
        <ShareSheet
          entity={entity}
          returnFocusTo={opener}
          onClose={() => {
            setPhase('idle');
            setCopied(false);
          }}
          title={t(entity === 'persona' ? 'share.sheet.titlePersona' : 'share.sheet.title')}
          preview={<ReadingView {...previewReadingView(preview, INCLUDE_QUESTION)} />}
          nicknameLine={
            includeNickname && nickname
              ? t('share.public.forNickname', { nickname })
              : null
          }
        >
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
              <p className={styles.lead}>{t('share.sheet.live')}</p>
              {/*
                A read-only input rather than a `<p>`: on iOS a long URL in a
                paragraph cannot be selected reliably, and `manual` is the copy
                path of last resort. `readOnly` and not `disabled`, because a
                disabled input is not selectable either.
              */}
              <input className={styles.url} value={link?.url ?? ''} readOnly aria-label="URL" />

              <button
                type="button"
                className={styles.primary}
                disabled={phase === 'revoking'}
                onClick={() => void copy()}
              >
                {t(copied ? 'share.sheet.copied' : 'share.sheet.copy')}
              </button>

              <p className={styles.warning}>{t('share.sheet.warning')}</p>

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
        body: JSON.stringify({
          entity,
          entity_id: entityId,
          // ALWAYS BOTH, EXPLICITLY. The route requires them; see its schema.
          include_question: INCLUDE_QUESTION,
          include_nickname: includeNickname,
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

      const body = (await res.json()) as { id: string; url: string };
      setLink({ id: body.id, url: body.url });
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

  async function revoke() {
    if (!link) return;
    setPhase('revoking');
    try {
      const res = await fetch('/api/share', {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
          [SESSION_HEADER]: getSessionId(),
          [LOCAL_DATE_HEADER]: todayKey(),
        },
        body: JSON.stringify({ id: link.id }),
      });
      if (!res.ok) {
        setErrorKey('share.error.generic');
        setPhase('error');
        return;
      }
      setLink(null);
      setCopied(false);
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
  async function copy() {
    if (!link) return;
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
        setCopied(true);
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
): { reading: ReadingViewData; prose: ReadingProse } {
  return {
    reading: {
      ...reading,
      question: includeQuestion ? reading.question : null,
      sharedAt: null,
    },
    prose: { kind: 'as-written' },
  };
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
