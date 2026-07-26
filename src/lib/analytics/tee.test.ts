/**
 * The six paths a reading can take, plus the property the whole design exists
 * for. No database, no server, no provider -- just a fake stream and a reader.
 */
import { describe, expect, it, vi } from 'vitest';
import { fakeStream } from '@/lib/llm/fake';
import { MAX_BODY_CHARS, teeReading } from './tee';

const NOTICE = '\n\n[Bacaan terputus. Coba lagi sebentar.]';

/** Read the whole stream the way the browser does. */
async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

function tee(chunks: string[], streamOpts = {}, teeOpts = {}) {
  return teeReading(fakeStream(chunks, streamOpts), {
    startedAt: performance.now(),
    failureNotice: NOTICE,
    ...teeOpts,
  });
}

/** Nothing may hang: `done` is what the after() callback parks on. */
function within<T>(promise: Promise<T>, ms = 2000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`did not settle in ${ms}ms`)), ms)),
  ]);
}

describe('teeReading', () => {
  it('1. happy path: the client gets every byte and the body matches', async () => {
    const chunks = ['Kartu ', 'pertama ', 'bicara ', 'soal jeda.'];
    const { stream, done } = tee(chunks, { usage: { inputTokens: 900, outputTokens: 42 } });

    expect(await drain(stream)).toBe(chunks.join(''));

    const outcome = await within(done);
    expect(outcome.status).toBe('ok');
    expect(outcome.body).toBe(chunks.join(''));
    expect(outcome.truncated).toBe(false);
    expect(outcome.chars).toBe(chunks.join('').length);
    expect(outcome.firstTokenMs).toBeTypeOf('number');
    expect(outcome.errorKind).toBe(null);
    expect(outcome.usage).toEqual({ inputTokens: 900, outputTokens: 42 });
  });

  it('2. mid-stream failure: the notice reaches the screen and NEVER the body', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { stream, done } = tee(['satu', 'dua', 'tiga'], { failAfter: 2 });

    expect(await drain(stream)).toBe('satudua' + NOTICE);

    const outcome = await within(done);
    expect(outcome.status).toBe('partial');
    expect(outcome.body).toBe('satudua');
    /*
     * Explicitly, by substring, because this is the one that would be invisible
     * until W5 shipped: a stored body containing the apology means the chained
     * reading quotes "[Bacaan terputus...]" back at the querent as if the
     * reader had said it.
     */
    expect(outcome.body).not.toContain('Bacaan terputus');
    expect(outcome.errorKind).toBe('unknown');
    err.mockRestore();
  });

  it('3. failure before any text: the body is empty and the status says failed', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { stream, done } = tee(['satu'], { failAfter: 0 });

    expect(await drain(stream)).toBe(NOTICE);

    const outcome = await within(done);
    expect(outcome.status).toBe('failed');
    expect(outcome.body).toBe('');
    expect(outcome.chars).toBe(0);
    expect(outcome.firstTokenMs).toBe(null);
    err.mockRestore();
  });

  it('4. client cancel: done settles promptly, with what had been sent', async () => {
    /*
     * The failure this guards is a promise that never resolves, which in
     * production is an after() callback parked for 45 seconds on every
     * abandoned reading -- and Draw.tsx aborts on reset, on unmount and on
     * every fresh request, so abandonment is the common case, not the rare one.
     */
    const { stream, done } = tee(['satu', 'dua', 'tiga', 'empat'], { delayMs: 5 });
    const reader = stream.getReader();

    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe('satu');
    await reader.cancel();

    const outcome = await within(done, 1000);
    expect(outcome.status).toBe('aborted');
    expect(outcome.body).toBe('satu');
    expect(outcome.errorKind).toBe('client_disconnected');
  });

  it('5. truncation: the client gets all 30,000 and the row keeps 20,000', async () => {
    const chunks = Array.from({ length: 300 }, () => 'x'.repeat(100)); // 30,000
    const { stream, done } = tee(chunks);

    expect((await drain(stream)).length).toBe(30_000);

    const outcome = await within(done);
    expect(outcome.body.length).toBe(MAX_BODY_CHARS);
    expect(outcome.truncated).toBe(true);
    expect(outcome.chars).toBe(30_000);
    expect(outcome.status).toBe('ok');
  });

  it('5b. truncates mid-chunk exactly, without dropping the whole chunk', async () => {
    const { stream, done } = tee(['abcde', 'fghij'], {}, { maxBodyChars: 7 });
    await drain(stream);
    const outcome = await within(done);
    expect(outcome.body).toBe('abcdefg');
    expect(outcome.truncated).toBe(true);
    expect(outcome.chars).toBe(10);
  });

  it('6. settles exactly once, including a cancel during a failure', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    // The three call sites are: the finally, the cancel handler, and the
    // cancel-while-the-source-is-throwing race between them.
    const { stream, done } = tee(['satu', 'dua'], { failAfter: 1, delayMs: 5 });
    const reader = stream.getReader();
    await reader.read();
    const cancelled = reader.cancel();

    const outcome = await within(done, 1000);
    await cancelled;

    // Whichever path won, exactly one of them produced this object, and a
    // second settle() on an already-resolved promise would have been silently
    // ignored -- so the check that matters is that it resolved at all and
    // resolved coherently.
    expect(['aborted', 'partial']).toContain(outcome.status);
    expect(outcome.body).toBe('satu');
    err.mockRestore();
  });

  it('does not delay the client: chunks arrive as they are produced', async () => {
    /*
     * A soft assertion, and the only automated statement of the property the
     * whole file exists for. Ten chunks 5ms apart: if the tee were buffering,
     * the first read would land after ~50ms rather than after ~5ms.
     */
    const { stream } = tee(Array.from({ length: 10 }, (_, i) => `c${i}`), { delayMs: 5 });
    const reader = stream.getReader();

    const started = performance.now();
    await reader.read();
    const firstAt = performance.now() - started;

    expect(firstAt).toBeLessThan(40);
    await reader.cancel();
  });

  it('never rejects `done`, even if the source usage promise does', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = Object.assign(
      (async function* () {
        yield 'halo';
      })(),
      { usage: Promise.reject(new Error('provider bug')) },
    );
    // Mark it handled, so the rejection cannot become an unhandled rejection
    // before teeReading gets to it.
    broken.usage.catch(() => {});

    const { stream, done } = teeReading(broken, {
      startedAt: performance.now(),
      failureNotice: NOTICE,
    });
    await drain(stream);

    const outcome = await within(done);
    expect(outcome.usage).toEqual({ inputTokens: null, outputTokens: null });
    expect(outcome.body).toBe('halo');
    err.mockRestore();
  });
});
