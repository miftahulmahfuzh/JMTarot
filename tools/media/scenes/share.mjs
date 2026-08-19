/**
 * The public share page -- the first URL in this project a stranger can open --
 * and it is captured WITH NO SESSION, which is the only honest way to capture it.
 *
 * `page.contract.test.ts` fences that subtree because `currentUser()` on `/s/`
 * renders correct HTML on the server and throws during hydration: `curl` reports
 * 200 with the reading in the body while the page is dead in a browser. So a
 * screenshot taken while signed in would be evidence of nothing. The cookies are
 * cleared before the visit, in the browser, and the shot is what a stranger sees.
 *
 * The link is MINTED BY PRESSING THE BUTTON, not inserted into `share_links`,
 * because the mint is where the locale pin is resolved rather than trusted.
 */
export default async function share(api) {
  const id = process.env.MEDIA_READING_ID;
  if (!id) throw new Error('set MEDIA_READING_ID to a reading uuid');

  await api.goto(`/history/${id}`);
  await api.sleep(1000);
  await api.tap('BAGIKAN', 1400);
  api.log('sheet:', (await api.bodyText()).replace(/\n+/g, ' / ').slice(0, 400));
  await api.shot('tmp-share-sheet.png');

  await api.tap('BUAT TAUTAN', 2500);
  api.log('after mint:', (await api.bodyText()).replace(/\n+/g, ' / ').slice(0, 500));
  await api.shot('tmp-share-minted.png');

  // Whatever the sheet renders the URL into -- an input, a code element or the
  // text itself. Read it rather than constructing it: the slug is the mint's
  // answer, and a constructed one would silently be the wrong link.
  const url = await api.ev(`(() => {
    const inp = [...document.querySelectorAll('input,textarea')].map(n => n.value).find(v => v && v.includes('/s/'));
    if (inp) return inp;
    const m = (document.body.innerText || '').match(/https?:\\/\\/[^\\s]+\\/s\\/[A-Za-z0-9_-]+/);
    return m ? m[0] : null;
  })()`);
  api.log('minted url:', url);
  if (!url) {
    api.log('NO url on the sheet -- capturing the sheet only');
    return;
  }

  const slug = url.split('/s/')[1].split(/[^A-Za-z0-9_-]/)[0];
  await api.clearCookies();
  await api.goto(`/s/${slug}`);
  await api.sleep(1200);
  api.log('signed-out page:', (await api.text()).replace(/\n+/g, ' / ').slice(0, 400));
  await api.shot('tmp-share.png');
  await api.shot('tmp-share-full.png', { full: true });
  api.log('slug:', slug);
}
