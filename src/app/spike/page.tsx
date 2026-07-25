import { CardBack } from '@/components/CardBack';
import { CardFace } from '@/components/CardFace';
import { Fan } from '@/components/Fan';
import { CARDS } from '@/data/deck';
import type { Draw } from '@/data/types';
import { Probe } from './Probe';
import styles from './page.module.css';

/*
 * Scratch route for judging geometry in a real browser. Not linked from
 * anywhere, and Task 13 deletes it once the draw screen exists.
 *
 * The three faces are chosen to show the art inconsistency rather than hide
 * it: The Fool (0) is from the warm cream generation, Death (13) from the cool
 * navy one, and The Star (17) shares the navy family's shared backdrop. A real
 * three-card spread will mix them exactly like this.
 */
const SAMPLE = [CARDS[0], CARDS[13], CARDS[17]];

/* Unshuffled on purpose. The arc is what is being judged, and a Math.random()
   shuffle here would differ between the server and client renders. */
const DECK: Draw[] = CARDS.map((card) => ({ card, reversed: false }));

export default function Spike() {
  return (
    <main className={styles.shell}>
      {/* Full-bleed, at whatever the real viewport is. Resize the window, or
          emulate a device, and the fan tracks it. Judge the horizontal sliver
          of each card: it computes to 12.5px at the edges and 14.5px at the
          centre, 14-16% of an 88px card. Too tight and it reads as one smear. */}
      <h2 className={styles.heading}>The fan &mdash; at this window&rsquo;s real width</h2>
      <div className={styles.bleed}>
        <Fan deck={DECK} />
      </div>

      {/* Fixed-width containers standing in for the three phone widths.
          This is an exact emulation for the fan and not an approximation: the
          fan's only input is its container's inline size, so a 375px container
          renders precisely what a 375px viewport would. Stacked vertically --
          side by side they wrapped unpredictably and the widest one forced the
          document wider, which silently rescaled the others. */}
      {[375, 390, 430].map((w) => (
        <div key={w} className={styles.frame} style={{ width: w }}>
          <div className={styles.frameLabel}>{w}px</div>
          <div className={styles.framePad}>
            <Fan deck={DECK} />
          </div>
        </div>
      ))}

      <Probe />

      <h2 className={styles.heading}>Back &amp; faces &mdash; 88&times;132</h2>
      <p className={styles.note}>Fan and slot size. The face on the right is reversed.</p>
      <div className={styles.row}>
        <div className={styles.small}>
          <CardBack />
        </div>
        {SAMPLE.map((card, i) => (
          <div key={card.id} className={styles.small}>
            <CardFace card={card} reversed={i === SAMPLE.length - 1} size="thumb" />
          </div>
        ))}
      </div>

      <h2 className={styles.heading}>Back &amp; faces &mdash; 160&times;240</h2>
      <p className={styles.note}>
        Roughly the result-panel size. The medallion and crosshatch should look
        like the same deck, not a different one.
      </p>
      <div className={styles.row}>
        <div className={styles.large}>
          <CardBack />
        </div>
        {SAMPLE.map((card, i) => (
          <div key={card.id} className={styles.large}>
            <CardFace card={card} reversed={i === SAMPLE.length - 1} size="full" />
          </div>
        ))}
      </div>
    </main>
  );
}
