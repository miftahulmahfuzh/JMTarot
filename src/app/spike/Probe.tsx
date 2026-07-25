'use client';

import { useEffect, useState } from 'react';

/**
 * Temporary measurement readout for the fan spike. Reports what the browser
 * actually computed, so geometry can be checked from a screenshot without
 * guessing at pixel colours. Deleted with the rest of /spike in Task 13.
 */
export function Probe() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    const read = () => {
      const out: string[] = [];
      const vw = document.documentElement.clientWidth;
      const sw = document.documentElement.scrollWidth;
      out.push(`viewport ${vw}  scrollWidth ${sw}${sw > vw ? '  <-- PAGE OVERFLOWS' : ''}`);

      const fans = document.querySelectorAll<HTMLElement>('[data-fan]');
      fans.forEach((fan, i) => {
        const r = fan.getBoundingClientRect();
        out.push(
          `fan[${i}] x ${r.left.toFixed(1)}..${r.right.toFixed(1)} ` +
            `w ${r.width.toFixed(1)} h ${r.height.toFixed(1)} ` +
            `| margins ${r.left.toFixed(1)} / ${(vw - r.right).toFixed(1)}`,
        );
        const cards = fan.querySelectorAll<HTMLElement>('[data-card]');
        if (cards.length > 1) {
          const boxes = [...cards].map((c) => c.getBoundingClientRect());
          const lo = Math.min(...boxes.map((b) => b.left));
          const hi = Math.max(...boxes.map((b) => b.right));
          out.push(`  ${cards.length} cards, union x ${lo.toFixed(1)}..${hi.toFixed(1)} (w ${(hi - lo).toFixed(1)})`);
          const first = boxes[0];
          out.push(`  card box ${first.width.toFixed(1)} x ${first.height.toFixed(1)}`);
        }
      });
      setLines(out);
    };
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);

  return (
    <pre
      style={{
        font: '11px ui-monospace, monospace',
        color: '#9c93b4',
        background: 'rgba(0,0,0,.45)',
        border: '1px solid rgba(201,162,39,.22)',
        padding: '8px',
        margin: 0,
        whiteSpace: 'pre-wrap',
      }}
    >
      {lines.join('\n') || 'measuring…'}
    </pre>
  );
}
