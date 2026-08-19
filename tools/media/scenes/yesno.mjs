/**
 * The Yes/No verdict, which is the one answer in this app the model does not get
 * to choose.
 *
 * `effectiveYesNo()` derives it from the card and its orientation -- including the
 * reversal flip -- and the prompt is handed the WORD and told to open with it.
 * Letting the model decide produced answers that contradicted the card on screen.
 * So this capture is worth a tile of its own: the box is the invariant, and it is
 * the same mechanism the choice verdict and the chat's address forms use.
 */
export default async function yesno(api) {
  await api.goto('/adrian/yesno');
  await api.sleep(900);
  await api.type('Apakah aku sudah siap pindah kerja sekarang?', { into: 'input', delay: 34 });
  await api.sleep(400);
  await api.tapSel('[data-card]', 9, { after: 1200 });
  api.log('counter:', (await api.text()).match(/\d\s*\/\s*\d\s*KARTU/i)?.[0]);
  await api.waitText('Adrian', 90).catch(() => {});
  await api.sleep(11000);
  api.log('reading:', (await api.text()).replace(/\n+/g, ' / ').slice(0, 420));
  await api.scrollTo(430, false);
  await api.sleep(500);
  await api.shot('tmp-yesno.png');
  await api.shot('tmp-yesno-full.png', { full: true });
}
