#!/usr/bin/env node
/**
 * A CDP driver for CAPTURING MEDIA -- phone-width stills and GIF frame runs --
 * from the LOCAL DEV SERVER, for `README.md`.
 *
 * ── WHY A SECOND DRIVER AND NOT A FLAG ON `tools/e2e/chrome.mjs` ────────────
 *
 * Three reasons, and the first is the one that matters:
 *
 *  1. **THIS ONE EMULATES A DEVICE; THAT ONE DELIBERATELY DOES NOT.**
 *     `tools/e2e/chrome.mjs` sizes a WINDOW (`--window-size`) and the skill file
 *     records the measurement that killed it: `--width 390` gives
 *     `innerWidth === outerWidth === 500`, so the shot is a ~500px layout
 *     cropped to look narrow. **`Emulation.setDeviceMetricsOverride` is a
 *     different mechanism** -- it overrides the layout viewport inside the
 *     renderer, with no window in the path at all -- and `measure` prints
 *     `innerWidth` on every launch so that claim is re-checked rather than
 *     trusted. See `## Verifying it` in CLAUDE.md: framework behaviour is
 *     measured here, never recalled.
 *  2. **IT MUST NEVER TOUCH THE PROFILE THAT HOLDS THE HUMAN'S GOOGLE SESSION.**
 *     That profile is what makes one typed password last for weeks, and a media
 *     run wants a clean, throwaway, reproducible browser. Separate
 *     `--user-data-dir`, separate CDP port, so the two cannot collide -- and a
 *     media capture can never be the thing that signs somebody out.
 *  3. It authenticates through `POST /api/auth/dev-session`, which is
 *     `localhost`-only by construction. There is no credential here to protect,
 *     which is why this file may plant a cookie and that one may not.
 *
 * ── THE ONE RULE ────────────────────────────────────────────────────────────
 *
 * **EVERYTHING IT CAPTURES IS THE REAL APP.** Real routes, real Postgres rows,
 * real streamed z.ai readings. No mockups and no fixtures dressed as output --
 * a README screenshot is a claim about the product, and a fabricated one is a
 * lie that outlives the session that made it.
 *
 * Usage (via `run.sh`, which puts Node 24 and the Chrome libs on the path):
 *
 *   tools/media/run.sh launch [--width 390] [--height 844] [--dsf 2]
 *   tools/media/run.sh session [miftah]      # plant a real dev session cookie
 *   tools/media/run.sh measure               # innerWidth/dpr -- the loop-4 check
 *   tools/media/run.sh goto /history
 *   tools/media/run.sh shot out.png [--full] [--clip x,y,w,h]
 *   tools/media/run.sh text | eval <expr> | wait <substring> [--for 30]
 *   tools/media/run.sh tap 'Mulai'           # real Input-domain touch events
 *   tools/media/run.sh type 'apa kabar'      # into the focused element
 *   tools/media/run.sh scroll 400
 *   tools/media/run.sh rec <dir> --for 8 [--fps 10]
 *   tools/media/run.sh kill
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.MEDIA_PORT || 9333);
const PROFILE = process.env.MEDIA_PROFILE || join(homedir(), '.cache', 'jmtarot-media-profile');
const BASE = (process.env.MEDIA_BASE || 'http://localhost:3001').replace(/\/$/, '');
const METRICS = join(PROFILE, '.media-metrics.json');

/* ── tiny CDP client (the shape `tools/e2e/chrome.mjs` uses) ──────────────── */

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Set();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, timer } = this.pending.get(msg.id);
        clearTimeout(timer);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        for (const h of this.handlers) h(msg);
      }
    });
  }
  static async open(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('CDP connect failed')), { once: true });
    });
    return new Cdp(ws);
  }
  /**
   * **`clearTimeout` ON THE REPLY IS NOT TIDINESS, IT IS THE DIFFERENCE BETWEEN
   * A 1s VERB AND A 61s ONE.** A pending `setTimeout` keeps Node's event loop
   * alive, so the first version of this class -- which registered the deadline
   * and never cancelled it -- printed the right answer and then sat there for the
   * full timeout before the process could exit. Every verb cost 61 seconds and
   * looked like a slow browser rather than a live timer. Measured, twice, at
   * exactly 1:01.
   */
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, 60_000);
      this.pending.set(id, { resolve, reject, timer });
    });
  }
  on(fn) {
    this.handlers.add(fn);
  }
  close() {
    this.ws.close();
  }
}

async function browserInfo() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`, {
      signal: AbortSignal.timeout(2000),
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function pageTarget() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(3000) });
  const targets = await r.json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target -- run `launch` first');
  return page;
}

/**
 * Open a session, RE-APPLY THE DEVICE OVERRIDE, run, close.
 *
 * **The re-apply is the load-bearing line in this file.** See `launch`'s header:
 * an Emulation override belongs to the CDP session that set it and is reverted
 * when that session disconnects, so a driver whose every verb is its own
 * connection has no override at all by the time it captures anything. Applying
 * it here -- rather than once at launch -- is what makes a per-command verb and a
 * long-running scene equally honest, and it costs one round trip.
 */
async function withPage(fn) {
  const target = await pageTarget();
  const cdp = await Cdp.open(target.webSocketDebuggerUrl);
  try {
    const m = readMetrics();
    await applyMetrics(cdp, m.width, m.height, m.dsf);
    return await fn(cdp, target);
  } finally {
    cdp.close();
  }
}

/**
 * The geometry lives in a file beside the profile because it has to outlive the
 * process: every verb is a new process AND a new CDP session, and both halves of
 * that are why it cannot live in either.
 */
function readMetrics() {
  try {
    return JSON.parse(readFileSync(METRICS, 'utf8'));
  } catch {
    return { width: 390, height: 844, dsf: 2 };
  }
}

async function evaluate(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || 'evaluate threw');
  }
  return r.result?.value;
}

function flag(args, name, fallback = null) {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
}

/**
 * Wait for the page to be USABLE, not merely loaded -- ported verbatim in intent
 * from `tools/e2e/chrome.mjs`, whose header explains why `readyState` is not
 * enough for this app: a real tap lands on a real button before React has
 * attached its delegated listener and NOTHING HAPPENS, which reads as a dead
 * control rather than a race. Polling for `__reactFiber$` is what proves it.
 */
async function settle(cdp, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await evaluate(
      cdp,
      `(() => {
         if (document.readyState !== 'complete') return false;
         for (const n of document.querySelectorAll('button,a,main,div')) {
           if (Object.keys(n).some((k) => k.startsWith('__reactFiber$'))) return true;
         }
         return false;
       })()`,
    ).catch(() => false);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/* ── the device override, which is the whole point of this file ───────────── */

/**
 * `mobile: true` is not cosmetic. It makes the renderer report a mobile
 * viewport, which is what `@media (hover: none)` and `(pointer: coarse)` answer
 * from -- and this app's fan, its sheets and its tap targets are all written
 * against those. A 390px-wide DESKTOP viewport is a different page from a 390px
 * phone, so capturing one and calling it the other would be the ~500px crop
 * mistake wearing a better number.
 */
async function applyMetrics(cdp, width, height, dsf) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: dsf,
    mobile: true,
    screenWidth: width,
    screenHeight: height,
  });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setEmitTouchEventsForMouse', {
    enabled: true,
    configuration: 'mobile',
  });
}

function metricsFromArgs(args) {
  return {
    width: Number(flag(args, '--width', 390)),
    height: Number(flag(args, '--height', 844)),
    dsf: Number(flag(args, '--dsf', 2)),
  };
}

/* ── verbs ───────────────────────────────────────────────────────────────── */

function chromeBinary() {
  const explicit = process.env.MEDIA_CHROME || process.env.E2E_CHROME;
  if (explicit && existsSync(explicit)) return explicit;
  const root = join(homedir(), '.cache', 'puppeteer', 'chrome');
  if (!existsSync(root)) throw new Error('no chrome in ~/.cache/puppeteer -- see tools/e2e/setup.sh');
  for (const dir of readdirSync(root).sort().reverse()) {
    const p = join(root, dir, 'chrome-linux64', 'chrome');
    if (existsSync(p)) return p;
  }
  throw new Error('chrome binary not found under ~/.cache/puppeteer/chrome');
}

async function launch(args) {
  const existing = await browserInfo();
  if (existing) {
    console.log(`already running: ${existing.Browser} on :${PORT}`);
    return;
  }
  if (args.includes('--fresh')) rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });

  const m = metricsFromArgs(args);
  writeFileSync(METRICS, JSON.stringify(m));

  /*
   * ── THE GEOMETRY IS AN `Emulation` OVERRIDE AND NOT A WINDOW SIZE, AND BOTH
   *    HALVES OF THAT WERE MEASURED HERE, NOT RECALLED ───────────────────────
   *
   * `.claude/skills/test-prod-using-headless-chrome/SKILL.md` carries a corrected
   * row saying a phone width is unreachable in this image -- `--width 390` gives
   * `innerWidth === outerWidth === 500` -- with the cause unconfirmed and "a
   * saved window bound in the persistent profile" as the guess. **Both readings
   * were reproduced while writing this file, and the guess was wrong:**
   *
   *   `--window-size=390,844` + a FRESH profile  ->  innerWidth 500, dpr 2
   *   `Emulation.setDeviceMetricsOverride 390`   ->  innerWidth 390, exactly
   *
   * So it is not the profile and it is not Windows: **Chrome will not make a
   * browser window narrower than ~500px, and `--headless=new` emulates a real
   * browser window.** `--window-size` is therefore the wrong instrument for a
   * phone layout on any platform, and the renderer-level override is the right
   * one -- it never asks for a window at all.
   *
   * The window is left at a roomy 500x900 deliberately: it is only the surface
   * the override draws inside, and asking it for 390 is what produced the
   * clamped reading above.
   *
   * `--touch-events=enabled` is a PROCESS flag on purpose. Its session-scoped
   * twin, `Emulation.setTouchEmulationEnabled`, would evaporate exactly as the
   * metrics did, and `Input.dispatchTouchEvent` is refused outright when
   * `maxTouchPoints` is zero -- so the fan would stop taking taps between one
   * verb and the next, for a reason nothing in the output would name.
   *
   * `--disable-gpu` for the reason `chrome.mjs` records at length: WSLg
   * advertises a GPU it cannot serve and the compositor stops repainting under
   * load. Here that would present as a GIF of identical frames.
   */
  const flags = [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--window-size=500,900',
    '--touch-events=enabled',
    '--headless=new',
    'about:blank',
  ];
  const child = spawn(chromeBinary(), flags, {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
    env: process.env,
  });
  child.unref();

  for (let i = 0; i < 40; i++) {
    const info = await browserInfo();
    if (info) {
      console.log(`launched ${info.Browser} on :${PORT}  base=${BASE}`);
      await measure();
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('chrome did not open a CDP port -- run tools/e2e/setup.sh');
}

/**
 * The loop-4 check, printed on every launch.
 *
 * CLAUDE.md's rule is that a width claim in this repo is a MEASUREMENT, and the
 * skill file's corrected row exists because somebody asserted 390 and shipped a
 * 500px crop for three workstreams. So this prints `innerWidth` rather than
 * repeating the number that was asked for.
 */
async function measure() {
  const m = await withPage((cdp) =>
    evaluate(
      cdp,
      `({ innerWidth: innerWidth, innerHeight: innerHeight, outerWidth: outerWidth,
          dpr: devicePixelRatio, coarse: matchMedia('(pointer: coarse)').matches,
          noHover: matchMedia('(hover: none)').matches })`,
    ),
  );
  console.log(
    `  layout ${m.innerWidth}x${m.innerHeight} @${m.dpr}x  (outerWidth ${m.outerWidth})  ` +
      `coarse=${m.coarse} hover:none=${m.noHover}`,
  );
  if (m.innerWidth !== 390) {
    console.log(`  NOTE innerWidth is ${m.innerWidth}, not 390 -- do not call this a phone shot.`);
  }
}

/**
 * Plant a REAL session cookie, minted by the app itself.
 *
 * `POST /api/auth/dev-session` returns a genuine Auth.js JWE against a genuine
 * `users` row through the same upsert the Google callback uses -- see that
 * route's header for why a fake cookie would defeat the purpose. The cookie is
 * httpOnly, so `document.cookie` cannot plant it and `Network.setCookie` is the
 * only way in.
 */
async function session(args) {
  const username = args.find((a) => !a.startsWith('--')) || 'miftah';
  const res = await fetch(`${BASE}/api/auth/dev-session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) throw new Error(`dev-session ${res.status} -- is DEV_PASSWORD_LOGIN=1 and dev up?`);
  const cookies = res.headers.getSetCookie();
  const host = new URL(BASE).hostname;
  let planted = 0;
  await withPage(async (cdp) => {
    await cdp.send('Network.enable');
    for (const raw of cookies) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      await cdp.send('Network.setCookie', { name, value, domain: host, path: '/', httpOnly: true });
      planted++;
    }
  });
  // Names only. The session token is a bearer credential for the whole account,
  // and `chrome.mjs`'s `whoami` prints a length rather than a value for the same
  // reason: anything that logs it has handed the account over.
  console.log(`planted ${planted} cookies for ${host}: ${cookies.map((c) => c.split('=')[0]).join(', ')}`);
}

function resolveUrl(p) {
  if (/^https?:\/\//.test(p)) return p;
  return BASE + (p.startsWith('/') ? p : `/${p}`);
}

async function goto(args) {
  const url = resolveUrl(args[0] || '/');
  await withPage(async (cdp) => {
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url });
    await settle(cdp);
  });
  await status();
}

async function status() {
  await withPage(async (cdp) => {
    const i = await evaluate(
      cdp,
      `({ url: location.href, title: document.title, lang: document.documentElement.lang })`,
    );
    console.log(`  ${i.url}  [lang=${i.lang}]  ${i.title}`);
  });
}

/**
 * Find a control by its visible text and tap it.
 *
 * **IT SCROLLS THE CONTROL INTO VIEW FIRST, AND THAT IS A BUG FIX.** A
 * `getBoundingClientRect` on an element below the fold returns coordinates
 * outside the viewport, and `Input.dispatchTouchEvent` at those coordinates hits
 * whatever is actually on screen -- or nothing. Measured on `BAGIKAN`, which sits
 * ~2400px down a finished three-card reading: the verb reported `tapped
 * "BAGIKAN"` and the share sheet never opened, so the failure was a silent
 * success. Coordinates are re-read AFTER the scroll settles, because the numbers
 * from before it are the ones that were wrong.
 */
async function tapIn(cdp, text) {
  const locate = () => evaluate(
    cdp,
    `(() => {
       const want = ${JSON.stringify(String(text).trim().toLowerCase())};
       const nodes = [...document.querySelectorAll('button,a,[role=button],label,input[type=submit],[data-card]')]
         .filter((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
         .map((n) => ({ n, s: (n.innerText || n.value || n.getAttribute('aria-label') || '').trim().toLowerCase() }));
       // Exact, then word-boundary, then substring -- chrome.mjs's tiering, and
       // for its measured reason: a bare includes() matched "Buka menu akun" for
       // "EN" and reported success on a button nobody pressed.
       const esc = (w) => w.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
       const exact = nodes.find((c) => c.s === want);
       const word = nodes.find((c) => new RegExp('(^|\\\\W)' + esc(want) + '($|\\\\W)').test(c.s));
       const loose = nodes.find((c) => c.s.includes(want));
       const hit = exact || word || loose;
       if (!hit) return null;
       const r = hit.n.getBoundingClientRect();
       const offscreen = r.top < 0 || r.bottom > innerHeight;
       if (offscreen) hit.n.scrollIntoView({ block: 'center', behavior: 'instant' });
       return { x: r.left + r.width / 2, y: r.top + r.height / 2, offscreen,
                matched: hit.s.slice(0, 60), tier: hit === exact ? 'exact' : hit === word ? 'word' : 'substring' };
     })()`,
  );

  let box = await locate();
  if (!box) return null;
  if (box.offscreen) {
    await new Promise((r) => setTimeout(r, 450));
    box = await locate();
    if (!box) return null;
  }
  await tapAt(cdp, box.x, box.y);
  return box;
}

async function tapAt(cdp, x, y) {
  for (const type of ['touchStart', 'touchEnd']) {
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 12, radiusY: 12, force: 1 }],
    });
  }
}

async function tap(args) {
  const hit = await withPage(async (cdp) => {
    await cdp.send('Page.enable');
    const h = await tapIn(cdp, args[0]);
    if (h) await new Promise((r) => setTimeout(r, Number(flag(args, '--after', 600))));
    return h;
  });
  if (!hit) {
    console.log(`NO element matching "${args[0]}"`);
    process.exitCode = 1;
    return;
  }
  console.log(`tapped "${args[0]}" -> [${hit.tier}] "${hit.matched}"`);
  if (hit.tier === 'substring') console.log('  WARNING substring match -- verify it was the control you meant');
  await status();
}

/** Tap a CSS selector by index, for things with no text -- a card in the fan. */
async function tapSel(args) {
  const sel = args[0];
  const nth = Number(args[1] || 0);
  const ok = await withPage(async (cdp) => {
    const box = await evaluate(
      cdp,
      `(() => {
         const n = document.querySelectorAll(${JSON.stringify(sel)})[${nth}];
         if (!n) return null;
         const r = n.getBoundingClientRect();
         return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
       })()`,
    );
    if (!box) return null;
    await tapAt(cdp, box.x, box.y);
    await new Promise((r) => setTimeout(r, Number(flag(args, '--after', 500))));
    return box;
  });
  console.log(ok ? `tapped ${sel}[${nth}] at ${Math.round(ok.x)},${Math.round(ok.y)}` : `NO ${sel}[${nth}]`);
  if (!ok) process.exitCode = 1;
}

async function typeText(args) {
  const text = args[0];
  const sel = flag(args, '--into');
  await withPage(async (cdp) => {
    if (sel) {
      const box = await evaluate(
        cdp,
        `(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null;
                  const r = n.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()`,
      );
      if (!box) throw new Error(`no element ${sel}`);
      await tapAt(cdp, box.x, box.y);
      await new Promise((r) => setTimeout(r, 250));
    }
    // Per-character key events rather than one insertText: this app's composer
    // and question box are controlled React inputs, and a single paste is not
    // what a person does -- for a GIF the difference is visible.
    const perChar = Number(flag(args, '--delay', 45));
    for (const ch of text) {
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp' });
      await new Promise((r) => setTimeout(r, perChar));
    }
  });
  console.log(`typed ${text.length} chars${sel ? ` into ${sel}` : ''}`);
}

async function scroll(args) {
  const dy = Number(args[0] || 300);
  await withPage(async (cdp) => {
    await evaluate(cdp, `scrollBy({ top: ${dy}, behavior: 'smooth' })`);
    await new Promise((r) => setTimeout(r, 600));
  });
  console.log(`scrolled ${dy}`);
}

async function shot(args) {
  const out = args[0] || 'shot.png';
  const full = args.includes('--full');
  const clip = flag(args, '--clip');
  const params = { format: 'png', captureBeyondViewport: full };
  if (clip) {
    const [x, y, width, height] = clip.split(',').map(Number);
    params.clip = { x, y, width, height, scale: Number(flag(args, '--dsf', 2)) };
    params.captureBeyondViewport = true;
  }
  const data = await withPage((cdp) => cdp.send('Page.captureScreenshot', params).then((r) => r.data));
  writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(`${out} (${statSync(out).size} bytes)`);
}

async function text() {
  const t = await withPage((cdp) =>
    evaluate(cdp, `(document.querySelector('main') || document.body).innerText`),
  );
  console.log(t);
}

async function evalCmd(args) {
  const v = await withPage((cdp) => evaluate(cdp, args.join(' ')));
  console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
}

async function waitFor(args) {
  const needle = args[0];
  const seconds = Number(flag(args, '--for', 30));
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const hit = await withPage((cdp) =>
      evaluate(
        cdp,
        `location.href.includes(${JSON.stringify(needle)}) ||
         ((document.querySelector('main')||document.body).innerText || '').includes(${JSON.stringify(needle)})`,
      ),
    ).catch(() => false);
    if (hit) {
      console.log(`saw "${needle}" after ${((Date.now() - (deadline - seconds * 1000)) / 1000).toFixed(1)}s`);
      return;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`TIMEOUT waiting for "${needle}" (${seconds}s)`);
  process.exitCode = 1;
}

/**
 * Record PNG frames into a directory, with the wall-clock offset in each name.
 *
 * The offset is in the FILENAME rather than a sidecar because the assembler
 * (`tools/media/gif.py`) turns it into a per-frame delay: a fixed delay would
 * make a 300ms stall and a 60ms flip the same length, and the flip is the thing
 * worth seeing. `captureScreenshot` costs 60-120ms here, so ~8-10fps is the
 * honest ceiling -- do not ask for 30 and believe the number.
 */
async function rec(args) {
  const dir = args[0];
  if (!dir) throw new Error('usage: rec <dir> --for <seconds> [--fps 10]');
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (f.endsWith('.png')) rmSync(join(dir, f));
  const seconds = Number(flag(args, '--for', 6));
  const fps = Number(flag(args, '--fps', 10));
  const interval = 1000 / fps;
  const t0 = Date.now();
  let n = 0;
  await withPage(async (cdp) => {
    while (Date.now() - t0 < seconds * 1000) {
      const due = t0 + n * interval;
      const wait = due - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const off = Date.now() - t0;
      const r = await cdp.send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
      if (r) {
        writeFileSync(join(dir, `${String(n).padStart(4, '0')}-${String(off).padStart(6, '0')}.png`), Buffer.from(r.data, 'base64'));
      }
      n++;
    }
  });
  console.log(`${n} frames -> ${dir} over ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

async function kill() {
  await withPage((cdp) => cdp.send('Browser.close')).catch(() => {});
  console.log('killed');
}

/* ── the scene runner ────────────────────────────────────────────────────── */

/**
 * Run a scripted capture in ONE process holding ONE CDP session.
 *
 * **A GIF cannot be recorded by the per-verb path and the reason is not
 * performance.** Two things break. The device override belongs to the session,
 * so every verb boundary reverts the page to a 980px mobile-default layout and
 * back -- which is a reflow the fan's geometry can see. And a frame loop in one
 * process cannot interleave with taps issued by another, so the recording would
 * be a series of still poses with a second of dead air between them, which is
 * what a mockup looks like.
 *
 * So a scene gets the session for its whole life, and `rec()` runs its frame
 * loop CONCURRENTLY with the taps on the same socket -- CDP is just messages, so
 * a screenshot in flight does not stop an input event being dispatched.
 *
 * A scene module default-exports `async (api) => {}`. Everything it can do is on
 * that object; there is no second way in, so a scene cannot reach around the
 * override that makes its output a phone.
 */
async function runScene(args) {
  const file = args[0];
  if (!file) throw new Error('usage: scene <path/to/scene.mjs> [--out dir]');
  const outDir = flag(args, '--out', 'docs/media');
  const framesRoot = flag(args, '--frames', join('/tmp', 'jmtarot-frames'));
  mkdirSync(outDir, { recursive: true });

  const target = await pageTarget();
  const cdp = await Cdp.open(target.webSocketDebuggerUrl);
  const m = readMetrics();
  await applyMetrics(cdp, m.width, m.height, m.dsf);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /*
   * **A NAVIGATION ENDS A SCREENCAST.** Measured: a take that spanned one `goto`
   * kept 6 frames of 14 seconds and discarded 3 -- the stream simply stopped,
   * because the new document gets a new RenderWidget and the cast was bound to
   * the old one. So a scene must START its recording after the navigation, and
   * anything that wants the navigation itself in shot has to accept that it
   * cannot have both. The flag exists so that mistake is reported instead of
   * silently producing a two-second GIF.
   */
  let recording = null;
  const api = {
    metrics: m,
    outDir,
    sleep,
    log: (...a) => console.log('  ', ...a),

    /**
     * Navigate, then RE-APPLY the override.
     *
     * **A cross-document navigation drops it.** Measured: a recording that
     * spanned a `goto` produced 390x844 frames before it and 500x757 frames
     * after, in one directory -- the second half being Chrome's minimum window
     * rather than a phone. The override is bound to the RenderWidget, and a
     * navigation can get a new one; nothing reports the change.
     */
    async goto(path) {
      if (recording) {
        console.log(
          `   WARNING navigating while recording "${recording}" -- the screencast ends here; ` +
            `start the recording AFTER the goto`,
        );
      }
      await cdp.send('Page.navigate', { url: resolveUrl(path) });
      await settle(cdp);
      await applyMetrics(cdp, m.width, m.height, m.dsf);
      console.log(`   → ${path}`);
    },

    ev: (expr) => evaluate(cdp, expr),

    /**
     * Drop every cookie in the browser -- how a scene becomes a stranger.
     *
     * `Network.clearBrowserCookies` and not `document.cookie = ''`: the session
     * token is httpOnly, so script cannot see it, and a scene that "signed out"
     * by clearing what JS can reach would still be signed in for every request.
     */
    async clearCookies() {
      await cdp.send('Network.enable');
      await cdp.send('Network.clearBrowserCookies');
      console.log('   cookies cleared -- this session is now a stranger');
    },

    async text() {
      return evaluate(cdp, `(document.querySelector('main')||document.body).innerText`);
    },

    /**
     * `document.body`, not `main`.
     *
     * The share sheet and the account menu are PORTALS -- deliberately, so a
     * transform on an ancestor cannot take the sheet with it -- so they render
     * OUTSIDE `main`. A scene that read `main` reported the page unchanged while
     * the sheet was open and filling the screen, which read as a dead button.
     */
    async bodyText() {
      return evaluate(cdp, `document.body.innerText`);
    },

    async tap(label, after = 500) {
      const hit = await tapIn(cdp, label);
      if (!hit) throw new Error(`scene: no element matching "${label}"`);
      await sleep(after);
      return hit;
    },

    /**
     * Tap the nth match of a selector -- a fan card has no text to match on.
     *
     * **`xf` DEFAULTS TO THE LEFT SLIVER, NOT THE CENTRE, AND THE FAN IS WHY.**
     * `## Fan geometry` in CLAUDE.md: 22 cards in a 363px box expose 12.5-14.5px
     * of each. So a card's own centre is under a LATER card, and a centre tap
     * picks a different card than the one asked for -- hit-tested here, card 12's
     * centre resolves to card 16. `xf: 0.3` lands on the exposed part; the tap
     * still returns what it actually hit, so a scene can check.
     */
    async tapSel(sel, nth = 0, { after = 400, xf = 0.3, yf = 0.5 } = {}) {
      const box = await evaluate(
        cdp,
        `(() => { const all = document.querySelectorAll(${JSON.stringify(sel)});
                  const n = all[${nth}]; if (!n) return null;
                  const r = n.getBoundingClientRect();
                  const x = r.left + r.width * ${xf}, y = r.top + r.height * ${yf};
                  const el = document.elementFromPoint(x, y);
                  const owner = el && el.closest ? el.closest(${JSON.stringify(sel)}) : null;
                  return { x, y, hit: owner ? [...all].indexOf(owner) : null }; })()`,
      );
      if (!box) throw new Error(`scene: no ${sel}[${nth}]`);
      await tapAt(cdp, box.x, box.y);
      await sleep(after);
      return box;
    },

    async tapAt(x, y, after = 400) {
      await tapAt(cdp, x, y);
      await sleep(after);
    },

    /**
     * Type like a person, one key event per character.
     *
     * `Input.insertText` would be one paste, and on a GIF that is the difference
     * between somebody writing a question and a form being filled by a script.
     */
    async type(text, { into = null, delay = 55 } = {}) {
      if (into) {
        const box = await evaluate(
          cdp,
          `(() => { const n = document.querySelector(${JSON.stringify(into)}); if (!n) return null;
                    const r = n.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()`,
        );
        if (!box) throw new Error(`scene: no ${into}`);
        await tapAt(cdp, box.x, box.y);
        await sleep(250);
      }
      for (const ch of text) {
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp' });
        await sleep(delay);
      }
    },

    async waitText(needle, seconds = 40) {
      const deadline = Date.now() + seconds * 1000;
      while (Date.now() < deadline) {
        const hit = await evaluate(
          cdp,
          `((document.querySelector('main')||document.body).innerText||'').includes(${JSON.stringify(needle)})`,
        ).catch(() => false);
        if (hit) return true;
        await sleep(300);
      }
      throw new Error(`scene: timed out waiting for text "${needle}"`);
    },

    async scrollTo(y, smooth = true) {
      await evaluate(cdp, `scrollTo({ top: ${y}, behavior: '${smooth ? 'smooth' : 'auto'}' })`);
      await sleep(smooth ? 700 : 150);
    },

    async shot(name, { full = false } = {}) {
      const out = name.includes('/') ? name : join(outDir, name);
      const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
      writeFileSync(out, Buffer.from(r.data, 'base64'));
      console.log(`   ${out} (${statSync(out).size} bytes)`);
      return out;
    },

    /**
     * Record frames with `Page.startScreencast`, NOT with a `captureScreenshot`
     * loop, AND THAT IS A BUG FIX RATHER THAN AN OPTIMISATION.
     *
     * **A capture loop silently ate every tap.** Measured here twice, in one
     * scene, against the same card: with no recorder running the fan reported
     * `1 / 3 KARTU`; with the loop running it reported `0 / 3` -- while a typed
     * `halo` landed in the question box in BOTH runs. So the failure was
     * touch-only and total, and it presents as an app whose fan does not respond
     * to taps: the recording came out as a GIF of somebody failing to use the
     * product, with nothing in any log to say why. (A capture at 780x1688 under
     * SwiftShader costs ~250ms and forces a synchronous compositor frame; touch
     * hit-testing needs that same compositor, and the event is discarded rather
     * than queued. Key events do not go through it, which is exactly the
     * asymmetry that was measured.)
     *
     * A screencast is PUSHED by the browser as it paints, so nothing in this
     * process is ever holding the compositor when a tap arrives. It also only
     * emits when something actually changed, which is why the assembler reads
     * its delays from the frame offsets: a still second is one frame with a
     * one-second delay, not ten identical files.
     */
    rec(name, { fps = 12, quality = 92 } = {}) {
      const dir = join(framesRoot, name);
      mkdirSync(dir, { recursive: true });
      for (const f of readdirSync(dir)) if (f.endsWith('.jpg') || f.endsWith('.png')) rmSync(join(dir, f));
      const t0 = Date.now();
      let n = 0;
      let stopped = false;
      const minGap = 1000 / fps;
      let lastAt = 0;

      let checked = false;
      let offSize = 0;
      const onFrame = (msg) => {
        if (msg.method !== 'Page.screencastFrame') return;
        const { data, sessionId, metadata } = msg.params;
        /*
         * **CHECK THE FIRST FRAME'S GEOMETRY, LOUDLY.**
         *
         * A screencast reports the size of the surface it is capturing, and it
         * has been observed here delivering 500x757 -- the un-overridden window,
         * i.e. Chrome's ~500px minimum -- in a session where `captureScreenshot`
         * in the SAME session returned a correct 390-wide still. So the override
         * is not a guarantee for this API, and the failure is invisible in the
         * frames themselves: they look like a phone until you measure one.
         * Assembling those into a GIF beside honest 390px stills is exactly the
         * mistake the e2e skill file's corrected row is about, so a run that
         * drifts must SAY so while it is still cheap to redo.
         */
        const fw = Math.round(metadata?.deviceWidth ?? 0);
        const fh = Math.round(metadata?.deviceHeight ?? 0);
        if (!checked) {
          checked = true;
          console.log(
            fw === m.width && fh === m.height
              ? `   screencast surface ${fw}x${fh} -- matches the override`
              : `   WARNING screencast surface ${fw}x${fh}, expected ${m.width}x${m.height}`,
          );
        }
        // DISCARDED, not resized. A frame at the wrong surface size is a frame of
        // a different layout; scaling it to match would produce a tidy GIF of two
        // devices. Counted so a take that lost frames says so.
        if (fw !== m.width || fh !== m.height) {
          offSize++;
          return;
        }
        // Ack FIRST and unconditionally: an un-acked frame stops the stream, so a
        // frame dropped by the fps cap must still be acknowledged or the
        // recording ends silently at the first skip.
        cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
        if (stopped) return;
        const now = Date.now();
        if (now - lastAt < minGap) return;
        lastAt = now;
        writeFileSync(
          join(dir, `${String(n).padStart(4, '0')}-${String(now - t0).padStart(6, '0')}.jpg`),
          Buffer.from(data, 'base64'),
        );
        n++;
      };

      cdp.on(onFrame);
      recording = name;
      const started = cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality,
        maxWidth: m.width * m.dsf,
        maxHeight: m.height * m.dsf,
        everyNthFrame: 1,
      });

      return {
        dir,
        async stop() {
          await started;
          stopped = true;
          recording = null;
          await cdp.send('Page.stopScreencast').catch(() => {});
          console.log(
            `   ${n} frames -> ${dir} over ${((Date.now() - t0) / 1000).toFixed(1)}s` +
              (offSize ? `  (${offSize} discarded at the wrong surface size)` : ''),
          );
          return { dir, frames: n };
        },
      };
    },
  };

  const mod = await import(pathToFileURL(isAbsolute(file) ? file : join(process.cwd(), file)).href);
  const fn = mod.default;
  if (typeof fn !== 'function') throw new Error(`${file} must default-export an async function`);
  console.log(`scene ${file} @ ${m.width}x${m.height}@${m.dsf}x`);
  try {
    await fn(api);
  } finally {
    cdp.close();
  }
  console.log('scene done');
}

/* ── dispatch ────────────────────────────────────────────────────────────── */

const [, , cmd, ...rest] = process.argv;
const verbs = {
  launch,
  measure,
  session,
  goto,
  tap,
  'tap-sel': tapSel,
  type: typeText,
  scroll,
  shot,
  text,
  eval: evalCmd,
  wait: waitFor,
  rec,
  scene: runScene,
  status,
  kill,
};
const fn = verbs[cmd];
if (!fn) {
  console.error(`unknown verb "${cmd ?? ''}" -- one of: ${Object.keys(verbs).join(', ')}`);
  process.exit(2);
}
fn(rest).catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
