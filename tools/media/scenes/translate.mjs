/**
 * The consequence of the switch, on its own: an Indonesian reading opened in the
 * English app, translating as you watch.
 *
 * SEPARATE FROM `locale.mjs` because the cache makes this a one-shot capture --
 * `translations` keeps the verified English body, so the SECOND view of this
 * reading is instant and there is nothing to film. Re-recording it means
 * deleting that row first, which is a decision to take deliberately rather than
 * a scene step.
 *
 * The recording starts BEFORE the navigation, so the frame where the Indonesian
 * prose has not yet been replaced is in shot. `api.goto` re-applies the device
 * override afterwards, without which every frame after the navigation is a 500px
 * window rather than a phone.
 */
export default async function translate(api) {
  const id = process.env.MEDIA_READING_ID;
  if (!id) throw new Error('set MEDIA_READING_ID');
  // Navigate FIRST, then record: a navigation ends a screencast (see `rec`), and
  // the whole subject of this capture is what happens after the page arrives.
  await api.goto(`/history/${id}`);
  const rec = api.rec('translate', { fps: 10 });
  await api.scrollTo(480, false);
  for (let i = 0; i < 13; i++) {
    await api.sleep(1000);
    if (i === 1) api.log('t+2s:', (await api.text()).replace(/\n+/g, ' / ').slice(120, 320));
  }
  await rec.stop();
  api.log('final:', (await api.text()).replace(/\n+/g, ' / ').slice(0, 380));
  await api.shot('tmp-en-reading.png');
}
