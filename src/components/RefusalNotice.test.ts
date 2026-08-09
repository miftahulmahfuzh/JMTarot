import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Locale } from '@/data/types';
import { catalogFor } from '@/lib/i18n/catalog';
import { LocaleProvider } from '@/lib/i18n/LocaleProvider';
import type { RefusalPayload } from '@/lib/moderation/types';
import { RefusalNotice } from './RefusalNotice';

/**
 * The dismiss control, and the one rule that survives it.
 *
 * **THE REFUSAL IS DISMISSIBLE ONLY WHERE A CALLER SAYS SO** (2026-08-09, the
 * chat room's report: *"it just wont disappear"*). On the draw screen the
 * refusal REPLACES the reading panel, so closing it would leave a blank slot
 * with nothing to say; in the chat room it sits above the composer, over a room
 * the querent is still using, and it stayed there through every subsequent look
 * at the screen. So the control is an OPTIONAL prop rather than a default: no
 * `onDismiss`, no button, and `ReadingPanel` is untouched.
 *
 * **THE BUTTON IS THE LAST CHILD IN DOM ORDER, IN BOTH BRANCHES.** W7-D10 is
 * *resources first, refusal second, the clause link last and small*, and that
 * ordering is a product decision about what a person in crisis reads first. A
 * close button placed above the lead is the first thing a screen reader
 * announces. It is painted into the top-right corner by CSS instead.
 *
 * Rendering is `renderToStaticMarkup` inside a `LocaleProvider`, as
 * `ReadingView.test.ts` and `legal.test.ts` already do.
 */

const GENERIC: RefusalPayload = {
  error: 'moderation_blocked',
  category: 'other',
  clause: '6.2',
  messageKey: 'moderation.blocked.generic.title',
  showCrisisResources: false,
};

const CRISIS: RefusalPayload = { ...GENERIC, category: 'self_harm', showCrisisResources: true };

function render(payload: RefusalPayload, onDismiss?: () => void, locale: Locale = 'id'): string {
  return inProvider(locale, createElement(RefusalNotice, { payload, onDismiss }));
}

function inProvider(locale: Locale, children: ReactNode): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, { locale, messages: catalogFor(locale), children }),
  );
}

describe('RefusalNotice dismiss control', () => {
  it('renders no button at all without an onDismiss', () => {
    expect(render(GENERIC)).not.toContain('<button');
    expect(render(CRISIS)).not.toContain('<button');
  });

  for (const [name, payload] of [
    ['generic', GENERIC],
    ['crisis', CRISIS],
  ] as const) {
    it(`renders a labelled dismiss button on the ${name} refusal when handed one`, () => {
      const html = render(payload, () => {});
      expect(html).toContain('<button');

      for (const locale of ['id', 'en'] as const) {
        const label = catalogFor(locale)['moderation.blocked.dismiss'];
        // An unknown key returns THE KEY (I3), so this also proves the catalog entry exists.
        expect(label).not.toBe('moderation.blocked.dismiss');
        expect(inProvider(locale, createElement(RefusalNotice, { payload, onDismiss: () => {} })))
          .toContain(`aria-label="${label}"`);
      }
    });

    it(`keeps the ${name} dismiss button LAST in DOM order (W7-D10)`, () => {
      const html = render(payload, () => {});
      const button = html.indexOf('<button');
      const closing = html.lastIndexOf('</section>');
      expect(button).toBeGreaterThan(-1);
      // Nothing but the section close after it.
      expect(html.slice(button).indexOf('</button>')).toBeGreaterThan(-1);
      expect(button).toBeLessThan(closing);
      expect(html.slice(html.indexOf('</button>') + '</button>'.length, closing).trim()).toBe('');
    });
  }
});
