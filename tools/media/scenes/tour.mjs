/**
 * The stills: one session, every surface a README needs, in the order a querent
 * meets them.
 *
 * All of it is the real app against real rows -- the readings are the ones the
 * seed and the live draws actually produced, the persona is generated on the
 * spot by a real model call, and the share link is minted by pressing the
 * button rather than inserted into the table.
 */
export default async function tour(api) {
  const shots = [];
  const grab = async (name, opts) => {
    shots.push(await api.shot(name, opts));
  };

  // 1. The reader picker, with the week's frequency verdict at the top.
  await api.goto('/');
  await api.sleep(900);
  await grab('tmp-picker.png', { full: true });

  // 2. The reader, bio and services.
  await api.goto('/thessaly');
  await api.sleep(900);
  api.log('reader panels:', await api.ev(`document.querySelectorAll('[data-panel], [role=tabpanel]').length`));
  await grab('tmp-reader.png', { full: true });

  // 3. History, and one reading reconstructed exactly as it was.
  await api.goto('/history');
  await api.sleep(1200);
  api.log('history:', (await api.text()).split('\n').slice(0, 12).join(' | '));
  await grab('tmp-history.png');

  const href = await api.ev(
    `(() => { const a = [...document.querySelectorAll('a[href^="/history/"]')][0]; return a ? a.getAttribute('href') : null; })()`,
  );
  api.log('first history href:', href);
  if (href) {
    await api.goto(href);
    await api.sleep(1000);
    await grab('tmp-detail.png', { full: true });
  }

  // 4. The account: three editable facts, the generated persona, the six answers.
  await api.goto('/account');
  await api.sleep(1500);
  api.log('account:', (await api.text()).replace(/\n+/g, ' / ').slice(0, 400));
  await grab('tmp-account.png');
  await api.scrollTo(700);
  await grab('tmp-account-2.png');

  // 5. Public content: the gallery and one card's lore page.
  await api.goto('/gallery');
  await api.sleep(1200);
  await grab('tmp-gallery.png');
  await api.goto('/arcana/the-moon');
  await api.sleep(1000);
  api.log('arcana:', (await api.text()).split('\n').slice(0, 8).join(' | '));
  await grab('tmp-arcana.png');

  api.log('shots:', shots.join(' '));
}
