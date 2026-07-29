/**
 * §4.5 — `personas`. v0.5.0 / A5.
 *
 * **STALENESS IS SHOWN, NOT COMPUTED, AND NOTHING HERE CALLS A GENERATOR.**
 * `answers_updated_at > personas.updated_at` is the **user-edit arm** of `personaStaleness`,
 * and both timestamps are already on this page — so the comparison is a label
 * (*"menunggu regenerasi"*) and A5 imports nothing from `@/lib/persona/**` (fence A5-24).
 *
 * **`model = 'fallback'` IS LABELLED**, because an operator asking *"why does this read like a
 * template"* must land on the right thing rather than on the prompt.
 *
 * **`facts` IS THE ROW'S AUDIT TRAIL** — the engine's structured output. *If a persona ever
 * says something impossible, the first question is whether the engine or the model produced
 * it*, and this is the only place that is answerable.
 *
 * **AND THERE IS NO REGENERATE BUTTON** (§11.2). Every generated artifact on this page has an
 * `input_hash` and a staleness rule behind it; an admin-triggered regeneration satisfies none
 * of those preconditions, moves `updated_at` for a reason the mechanism cannot name, and — for
 * the Lotus — changes the block injected into every subsequent reading prompt for a querent who
 * did not ask. It would also spend a model call from a surface with no per-user budget on it.
 */
import type { Persona as PersonaRow } from '@/lib/db/schema';
import { DETAIL } from '../../copy';
import styles from '../detail.module.css';
import { Badge, Empty, Field, Fields, Json, Panel, Prefix } from './kit';

export function Persona({
  persona,
  answersUpdatedAt,
}: {
  persona: PersonaRow | null;
  answersUpdatedAt: Date | null;
}) {
  const c = DETAIL.persona;
  if (!persona) {
    return (
      <Panel id="sosok" heading={c.heading}>
        <Empty>{c.noRow}</Empty>
      </Panel>
    );
  }

  const stale =
    answersUpdatedAt !== null && answersUpdatedAt.getTime() > persona.updatedAt.getTime();

  return (
    <Panel id="sosok" heading={c.heading}>
      <Fields>
        <Field label={c.locale} value={persona.locale} />
        <Field label={c.model} value={persona.model === 'fallback' ? c.fallback : persona.model} />
        <Field label={c.promptVersion} value={persona.promptVersion} />
        <Field label={c.inputHash} value={<Prefix value={persona.inputHash} />} />
        <Field label={c.sourceVersion} value={String(persona.sourceVersion)} />
        <Field
          label={c.updatedAt}
          value={persona.updatedAt.toISOString().replace('T', ' ').slice(0, 19)}
        />
        <Field
          label="Status"
          value={stale ? <Badge tone="warn">{c.stale}</Badge> : <Badge tone="good">{c.fresh}</Badge>}
        />
      </Fields>
      {/* `lang` is `persona.locale` -- the language the PROSE came out in, never the viewer's. */}
      <p className={styles.prose} lang={persona.locale}>
        {persona.body}
      </p>
      <h3 className={styles.h3}>{c.facts}</h3>
      <Json value={persona.facts} />
      <p className={styles.note}>{c.noRegen}</p>
    </Panel>
  );
}
