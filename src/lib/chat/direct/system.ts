import 'server-only';

import type { Locale } from '@/data/types';
import type { PlanCaps } from './caps';
import { planPromptEn } from './system.en';
import { planPromptId } from './system.id';

/**
 * The director's prompt layer, forked per locale behind a facade.
 *
 * `Record<Locale, …>`, so **forgetting a locale is a COMPILE ERROR** rather than
 * `undefined` handed to a model — which does not throw and returns a fluent, confident
 * beat sheet generated with no contract at all. `services.ts`'s shape, and its reason is
 * sharper here: a reading with a missing task layer still reads as a reading, while a plan
 * with a missing contract is JSON-shaped garbage that `checkPlan` sends to the fallback on
 * every single run, forever, quietly.
 *
 * `server-only` on all three files, matching `services.*` and `readers.*`. Vitest aliases
 * the marker (the W6 trap), so `system.test.ts` can still import them and grep the rules;
 * **`audit-secrets.ts` inside `npm run build` is the real fence either way**, and it
 * already walks `src/lib/chat/**` for its needles and forbids a client component from
 * reaching anything here.
 */
const BY_LOCALE = {
  id: planPromptId,
  en: planPromptEn,
} satisfies Record<Locale, (caps: PlanCaps) => string>;

export function planSystemPrompt(locale: Locale, caps: PlanCaps): string {
  return BY_LOCALE[locale](caps);
}
