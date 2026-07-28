import type { Locale } from '@/data/types';
import { cardKeywords } from '@/data/deck';
import type { ArcanaFacts as Facts } from '@/lib/arcana/correspondence';
import { getLocale, getT } from '@/lib/i18n/t';
import styles from './page.module.css';

/**
 * The fact strip: everything about a card that is DERIVED rather than authored.
 *
 * A server component, like the page. It reads the catalog and the engine and
 * nothing else -- no session, no database, no state.
 *
 * ── RENDER NOTHING FOR A NULL (W5's M14 RULE) ───────────────────────────────
 *
 * Ten of the twenty-two cards have no zodiac sign: nine planetary attributions
 * plus The Fool's aether mark. **Their strip is shorter and there is no
 * placeholder**, because V1 has no planet table and inventing nine glosses to
 * even up a layout is the "vague cosmic language" the v0.3.0 risk table logs
 * against exactly this page. A row that says "—" is a row claiming we looked and
 * found nothing.
 *
 * ── TWO LABEL TRAPS, BOTH ALREADY PAID FOR IN THIS CODEBASE ─────────────────
 *
 * `.factLabel` is `text-transform: uppercase`, which is what turned
 * `What you are called` into `WHAT YOU ARE CALLED` over two rows on `/account`.
 * Every label here is one word. And `The High Priestess` is eighteen characters
 * in a value column, so `.factValue` carries `overflow-wrap: anywhere` -- measured
 * at 320px with loop 4, not guessed.
 */
export async function ArcanaFacts({ facts }: { facts: Facts }) {
  const t = await getT();
  const locale: Locale = await getLocale();
  const { card, attribution } = facts;

  /*
   * The enum VALUES stay English in the data and the displayed WORD comes from
   * the catalog -- `reading.verdict.*` is the existing precedent. Spelled out
   * rather than interpolated into a template literal, because `t()` is typed over
   * `keyof typeof id` and a template literal widens to `string`: a red typecheck
   * if you are lucky, and `arcana.element.fire` rendered as the element on a
   * public page if the signature is ever loosened (I3 returns THE KEY on purpose).
   */
  const ELEMENT = {
    fire: 'arcana.element.fire',
    earth: 'arcana.element.earth',
    air: 'arcana.element.air',
    water: 'arcana.element.water',
  } as const;
  const STAGE = {
    beginning: 'arcana.stage.beginning',
    trial: 'arcana.stage.trial',
    reckoning: 'arcana.stage.reckoning',
  } as const;
  const POLARITY = {
    light: 'arcana.polarity.light',
    shadow: 'arcana.polarity.shadow',
    neutral: 'arcana.polarity.neutral',
  } as const;
  const MODALITY = {
    cardinal: 'arcana.modality.cardinal',
    fixed: 'arcana.modality.fixed',
    mutable: 'arcana.modality.mutable',
  } as const;

  return (
    <>
    <dl className={styles.facts}>
      <div className={styles.fact}>
        <dt className={styles.factLabel}>{t('arcana.facts.numeral')}</dt>
        <dd className={styles.factValue}>{card.numeral}</dd>
      </div>

      <div className={styles.fact}>
        <dt className={styles.factLabel}>{t('arcana.facts.attribution')}</dt>
        <dd className={styles.factValue}>
          <span className={styles.glyph} aria-hidden="true">{attribution.glyph}</span>
          {attribution.label[locale]}
        </dd>
      </div>

      <div className={styles.fact}>
        <dt className={styles.factLabel}>{t('arcana.facts.element')}</dt>
        <dd className={styles.factValue}>
          {t(ELEMENT[card.element])}
          <span className={styles.gloss}>{facts.elementGloss}</span>
        </dd>
      </div>

      {/* Twelve cards only. See the header: no placeholder for the other ten. */}
      {facts.modality !== null && facts.modalityGloss !== null ? (
        <div className={styles.fact}>
          <dt className={styles.factLabel}>{t('arcana.facts.modality')}</dt>
          <dd className={styles.factValue}>
            {t(MODALITY[facts.modality])}
            <span className={styles.gloss}>{facts.modalityGloss}</span>
          </dd>
        </div>
      ) : null}

      <div className={styles.fact}>
        <dt className={styles.factLabel}>{t('arcana.facts.stage')}</dt>
        <dd className={styles.factValue}>{t(STAGE[card.stage])}</dd>
      </div>

      <div className={styles.fact}>
        <dt className={styles.factLabel}>{t('arcana.facts.polarity')}</dt>
        <dd className={styles.factValue}>{t(POLARITY[card.polarity])}</dd>
      </div>

      <div className={styles.fact}>
        <dt className={styles.factLabel}>{t('arcana.facts.keywords')}</dt>
        <dd className={styles.factValue}>{cardKeywords(card, locale).join(' · ')}</dd>
      </div>

    </dl>

    {/*
      OUTSIDE THE `<dl>`, and that is not a layout preference. A `<dd>` with no
      `<dt>` is invalid, and the sign gloss is a written SENTENCE rather than the
      value of a term -- the twelve cards that have one get a line of prose, the
      other ten get nothing at all.
    */}
    {facts.signGloss !== null ? (
      <p className={styles.signGloss}>{facts.signGloss}</p>
    ) : null}
    </>
  );
}
