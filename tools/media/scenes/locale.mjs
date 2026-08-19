/**
 * The language switch: what makes it different from every other i18n toggle.
 *
 * Tapping `EN` does not re-render Indonesian prose inside an English shell and it
 * does not regenerate anything. It TRANSLATES what already exists -- a real
 * second model call, mechanically checked against the card names, cached in
 * `translations` and reused from then on. That is the whole point of V2 and it is
 * only visible in motion: the chrome flips at once, the prose arrives after it.
 *
 * TWO recordings, because the switch and its consequence are on different
 * screens. The switcher is in the account menu, which only the app shell mounts
 * -- a reading detail page has no header chrome, which is why the first version
 * of this scene could not find the control at all. The menu is also a PORTAL, so
 * anything reading it needs `bodyText`.
 */
export default async function locale(api) {
  const id = process.env.MEDIA_READING_ID;
  if (!id) throw new Error('set MEDIA_READING_ID');

  await api.goto('/');
  await api.sleep(1200);

  const rec = api.rec('locale', { fps: 10 });
  await api.sleep(800);
  await api.tap('Buka menu akun', 1000);
  await api.shot('tmp-menu.png');
  api.log('menu:', (await api.bodyText()).replace(/\n+/g, ' / ').slice(-260));
  await api.tap('EN', 900);
  for (let i = 0; i < 9; i++) await api.sleep(1000);
  await rec.stop();

  api.log('lang now:', await api.ev('document.documentElement.lang'));
  api.log('picker:', (await api.text()).replace(/\n+/g, ' / ').slice(0, 260));
  await api.shot('tmp-en-picker.png', { full: true });

  // Now the consequence: the same stored Indonesian reading, in English.
  const rec2 = api.rec('translate', { fps: 10 });
  await api.goto(`/history/${id}`);
  await api.sleep(600);
  await api.scrollTo(520, false);
  for (let i = 0; i < 12; i++) {
    await api.sleep(1000);
    if (i === 2) api.log('t+3s:', (await api.text()).replace(/\n+/g, ' / ').slice(0, 200));
  }
  await rec2.stop();

  api.log('english reading:', (await api.text()).replace(/\n+/g, ' / ').slice(0, 450));
  await api.shot('tmp-en-reading.png');
  await api.shot('tmp-en-reading-full.png', { full: true });
}
