import { CardBack } from '@/components/CardBack';
import { CardFace } from '@/components/CardFace';
import { CARDS } from '@/data/deck';
import { DrawSpike } from './DrawSpike';
import { Frames } from './Frames';
import { Probe } from './Probe';
import styles from './page.module.css';

/*
 * Scratch route for exercising the draw in a real browser. Not linked from
 * anywhere, and Task 13 deletes it once the draw screen exists.
 *
 * The three faces below are chosen to show the art inconsistency rather than
 * hide it: The Fool (0) is from the warm cream generation, Death (13) from the
 * cool navy one, and The Star (17) shares the navy family's single backdrop. A
 * real three-card spread will mix them exactly like this.
 */
const SAMPLE = [CARDS[0], CARDS[13], CARDS[17]];

/* Adrian's framing, so the slot captions are the length they will really be. */
const LABELS = ['Yang udah lewat', 'Yang sekarang', 'Yang bakal dateng'];

export default async function Spike({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const demo = (await searchParams).demo === '1';

  return (
    <main className={styles.shell}>
      <h2 className={styles.heading}>The draw &mdash; pick, return, flip</h2>
      <p className={styles.note}>
        Tap or drag a card up to lift it into the next slot. Tap a slotted card
        to send it back. Pick three, return the middle one, pick another: the
        slots must stay filled left to right with no hole.
      </p>
      <DrawSpike labels={LABELS} demo={demo} />

      <h2 className={styles.heading}>Geometry regression &mdash; fixed widths</h2>
      <Frames />
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
