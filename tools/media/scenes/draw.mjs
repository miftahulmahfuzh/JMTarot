/**
 * THE HERO CAPTURE: a real three-card reading, end to end.
 *
 * TWO recordings out of ONE continuous session, deliberately, because the honest
 * middle of this flow is dead air: after the third card there is a real z.ai
 * round trip before the first token, and a GIF that includes it is four seconds
 * of a still page. So `draw` ends at the flip and `reading` starts at the first
 * prose. Neither is sped up and nothing is staged -- the question is typed one
 * key at a time and the reading is a live model call.
 */
export default async function draw(api) {
  await api.goto('/thessaly/spread3');
  await api.sleep(1000);

  const fan = api.rec('draw', { fps: 12 });
  await api.sleep(500);
  /*
   * A question that offers NO options, deliberately.
   *
   * The first take asked "...Sebaiknya aku ambil?" and glm-4.6 answered it with a
   * `PILIHAN: aku ambil` line at the END of the prose. `CHOICE_RULE_ID` says the
   * marker goes BEFORE the reading and says not to write one at all when the
   * question offers nothing to choose between, and `splitChoiceMarker` only
   * recognises the token at offset 0 -- so a trailing marker is not stripped and
   * renders as a line of prose, which is the failure `choice.ts`'s header calls
   * INVISIBLE. It is a live defect, filed rather than worked around in the app;
   * what a README may not do is ship a screenshot of it as if it were the design.
   */
  await api.type('Apa yang perlu aku perhatikan soal pekerjaanku bulan ini?', {
    into: 'input',
    delay: 36,
  });
  await api.sleep(600);

  // Three cards from across the arc rather than three neighbours: the fan is the
  // point of this screen, and 0,1,2 would not show it.
  for (const i of [4, 12, 18]) {
    const hit = await api.tapSel('[data-card]', i, { after: 900 });
    api.log(`asked for card ${i}, hit ${hit.hit}`);
  }
  await api.sleep(1400);
  api.log('counter:', (await api.text()).match(/\d\s*\/\s*\d\s*KARTU/i)?.[0]);
  await fan.stop();

  await api.shot('tmp-picked.png');

  /*
   * The prose recording starts IMMEDIATELY, not after the first token.
   *
   * The first take waited for prose to exist and then recorded, and every frame
   * showed a finished reading: by the time there was something to wait for,
   * there was nothing left to watch. The wait is not dead air either -- the
   * cards are lit and `Membaca kartu…` is pulsing -- so the honest capture is one
   * continuous take from the third card to the last paragraph, at real speed.
   *
   * It follows the stream rather than scrolling to a fixed offset, because the
   * page GROWS as the text arrives: a fixed target that is correct at the end is
   * empty space at the start.
   */
  const prose = api.rec('reading', { fps: 10 });
  await api.sleep(1200);
  await api.scrollTo(560);
  for (let i = 0; i < 11; i++) {
    await api.sleep(1100);
    await api.ev(
      `scrollTo({ top: Math.max(560, document.documentElement.scrollHeight - 980), behavior: 'smooth' })`,
    );
  }
  await api.sleep(1200);
  await prose.stop();

  api.log('final:', (await api.text()).replace(/\n+/g, ' / ').slice(-420));
  await api.shot('tmp-reading.png');
  await api.shot('tmp-reading-full.png', { full: true });
}
