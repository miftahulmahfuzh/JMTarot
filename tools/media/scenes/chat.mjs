/**
 * The group chat: three readers and the querent in one room.
 *
 * A run is the unit -- one posted message produces one `chat_runs` row, a beat
 * sheet from the director, and 1-4 bubbles from 1-3 readers, each delivered
 * WHOLE rather than streamed (`C-D3`: watching Adrian type character by
 * character is a chatbot tell). So the GIF's job is to show turns ARRIVING, which
 * means recording through the whole run rather than sampling the end of it.
 *
 * Silence is a legitimate outcome here (`C-R7`, `C-R6`): a zero-beat plan is
 * valid and there is no error bubble. If this scene records a room that says
 * nothing, that is the product working, and the honest fix is to run it again
 * rather than to make the room chattier for the camera.
 */
export default async function chat(api) {
  await api.goto('/chat');
  await api.sleep(1200);
  api.log('empty room:', (await api.text()).replace(/\n+/g, ' / ').slice(0, 200));
  await api.shot('tmp-chat-empty.png');

  const rec = api.rec('chat', { fps: 10 });
  await api.sleep(600);
  await api.type('aku baru dapat bacaan soal kerjaan, katanya aku kelamaan nunggu. kalian setuju?', {
    into: 'textarea, input',
    delay: 34,
  });
  await api.sleep(500);
  await api.tap('Kirim', 600);

  // Follow the room for a whole run. Each poll keeps the newest bubble in frame,
  // because the page grows from the bottom as beats land.
  for (let i = 0; i < 26; i++) {
    await api.sleep(1200);
    await api.ev(`scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })`);
    const bubbles = await api.ev(`document.querySelectorAll('[data-author], article, li').length`);
    if (i % 6 === 0) api.log(`t+${(i * 1.2).toFixed(0)}s nodes=${bubbles}`);
  }
  await rec.stop();

  api.log('room now:', (await api.text()).replace(/\n+/g, ' / ').slice(0, 700));
  await api.shot('tmp-chat.png');
  await api.shot('tmp-chat-full.png', { full: true });
}
