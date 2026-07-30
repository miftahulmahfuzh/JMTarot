#!/usr/bin/env node
/**
 * A CDP driver for a REAL Chrome running inside WSL, for end-to-end testing
 * against production.
 *
 * ── WHY THIS EXISTS, AND WHY CLAUDE.md SAID IT COULD NOT ────────────────────
 *
 * CLAUDE.md's `## How to verify things here` says "There is no Playwright and
 * there must not be. Chromium cannot launch in this WSL image -- it needs
 * `libasound2t64`, which needs sudo." **The first clause still stands and the
 * second is now false.** Exactly ONE library was missing, and a `.deb` can be
 * unpacked into a user directory without sudo at all:
 *
 *     apt-get download libasound2t64          # no sudo
 *     dpkg-deb -x libasound2t64_*.deb ~/tools/chrome-libs
 *     LD_LIBRARY_PATH=~/tools/chrome-libs/usr/lib/x86_64-linux-gnu
 *
 * `tools/e2e/setup.sh` does that and is idempotent. `ldd` on the puppeteer
 * Chrome then reports nothing missing, and `--version` answers.
 *
 * So the two blockers `tools/shot.sh`'s header records are both gone:
 *
 *   - **The ~500px clamp is gone.** That was WINDOWS Chrome, which Windows
 *     refuses to size below ~500px, so a `--window-size=375` shot laid out at
 *     ~500 and merely cropped. A Linux Chrome has no window manager in the way
 *     and honours 390 exactly. Phone-width screenshots are now real.
 *   - **The CDP firewall problem is gone.** That was reaching a Windows Chrome
 *     from WSL across the NAT. This Chrome is a LOCAL process and CDP is on
 *     127.0.0.1, so there is no firewall in the path.
 *
 * `tools/shot.sh` is deliberately NOT deleted. It has no dependencies beyond a
 * Windows install and is the fallback if `~/.cache/puppeteer` is ever cleared.
 *
 * ── THE ONE THING THIS DRIVER MUST NEVER DO ─────────────────────────────────
 *
 * **IT NEVER TOUCHES THE QUERENT'S GOOGLE PASSWORD, AND THE DESIGN IS WHAT
 * GUARANTEES THAT RATHER THAN A PROMISE NOT TO.** There is no `type-password`
 * verb, no credential argument and no secret in any log. The sign-in step opens
 * a HEADED window on the Windows desktop through WSLg (`DISPLAY=:0`) and the
 * human types into it. This driver only polls for the resulting cookie.
 *
 * That is also why the profile is PERSISTENT (`--user-data-dir`). The password
 * is typed once; Google's session then lives in that profile for weeks and
 * every later run -- including headless ones -- reuses it. A fresh profile per
 * run would mean asking a human to authenticate on every single test, which is
 * how a test harness ends up with a password in an environment variable.
 *
 * ── WHY A DAEMON AND NOT ONE PROCESS PER COMMAND ────────────────────────────
 *
 * Each agent shell invocation is a new process, so a Chrome launched by one
 * command would die before the next. `launch` therefore detaches Chrome and
 * leaves CDP listening; every other verb ATTACHES over 127.0.0.1. State --
 * cookies, the current page, scroll position, a half-finished sign-in --
 * survives between commands, which is the whole point.
 *
 * Usage (via the wrapper, which sets LD_LIBRARY_PATH and finds the binary):
 *
 *   tools/e2e/run.sh launch [--headed] [--width N] [--height N] [--base URL]
 *   tools/e2e/run.sh login              # headed; waits for the human
 *   tools/e2e/run.sh whoami             # is there a session, and whose
 *   tools/e2e/run.sh goto /margaret
 *   tools/e2e/run.sh shot out.png [--full]
 *   tools/e2e/run.sh text               # visible text of the page
 *   tools/e2e/run.sh tap 'Sign in'      # REAL PointerEvents at the centre
 *   tools/e2e/run.sh eval 'location.href'
 *   tools/e2e/run.sh net                # requests since the last `net --clear`
 *   tools/e2e/run.sh wait '/margaret'   # until the URL contains a string
 *   tools/e2e/run.sh kill
 */
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.E2E_PORT || 9222);
const PROFILE = process.env.E2E_PROFILE || join(homedir(), '.cache', 'jmtarot-e2e-profile');
const STATE = join(PROFILE, '.e2e-state.json');
const DEFAULT_BASE = process.env.E2E_BASE || 'https://www.jmtarot.site';

/* ── tiny CDP client ─────────────────────────────────────────────────────── */

/**
 * `/json/version` rather than `/json/list`: it answers before any tab exists and
 * is the cheapest liveness probe. A connection refused here means "not running",
 * which is a normal state and not an error.
 */
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
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`, {
    signal: AbortSignal.timeout(3000),
  });
  const targets = await r.json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target -- run `launch` first');
  return page;
}

/**
 * One WebSocket per command invocation, closed at the end.
 *
 * Node 22+ has a global `WebSocket`, so this needs no dependency -- which
 * matters, because `npm test` must keep working with the dependency set it has
 * and a test-only browser library is exactly what CLAUDE.md rules out.
 */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
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

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, 30_000);
    });
  }

  close() {
    this.ws.close();
  }
}

async function withPage(fn) {
  const target = await pageTarget();
  const cdp = await Cdp.open(target.webSocketDebuggerUrl);
  try {
    return await fn(cdp, target);
  } finally {
    cdp.close();
  }
}

/** Evaluate an expression in the page and return its value. */
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

/* ── state ───────────────────────────────────────────────────────────────── */

function readState() {
  try {
    return JSON.parse(readFileSync(STATE, 'utf8'));
  } catch {
    return { base: DEFAULT_BASE };
  }
}

function writeState(patch) {
  const next = { ...readState(), ...patch };
  mkdirSync(PROFILE, { recursive: true });
  writeFileSync(STATE, JSON.stringify(next, null, 2));
  return next;
}

/* ── verbs ───────────────────────────────────────────────────────────────── */

function chromeBinary() {
  const explicit = process.env.E2E_CHROME;
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

  const headed = args.includes('--headed');
  const width = Number(flag(args, '--width') || 390);
  const height = Number(flag(args, '--height') || 844);
  const base = flag(args, '--base') || readState().base || DEFAULT_BASE;

  mkdirSync(PROFILE, { recursive: true });

  /*
   * ── TWO FLAGS THAT ARE DELIBERATELY ABSENT ───────────────────────────────
   *
   * **`--enable-automation`.** Puppeteer sets it, it makes `navigator.webdriver`
   * true, and Google's sign-in reads that and can answer "this browser or app
   * may not be secure". Raw CDP over `--remote-debugging-port` does not set it,
   * so the one flow this harness exists to drive is the specific thing that
   * flag would break.
   *
   * **`--no-sandbox`.** Every WSL Chrome recipe on the internet includes it and
   * IT IS NOT NEEDED HERE -- TESTED, not assumed: `max_user_namespaces` is
   * 47017 and a sandboxed `--headless=new` opened CDP and a page target with no
   * namespace error in the log. Two reasons not to carry it anyway. It turns
   * off the renderer sandbox while this browser visits a real sign-in page and
   * holds a real session cookie. And it makes Chrome show the yellow "You are
   * using an unsupported command-line flag" infobar, which a human reasonably
   * reads as the harness being broken -- it was mistaken for one during
   * development.
   *
   * `E2E_NO_SANDBOX=1` puts it back, for an image where the namespace is
   * genuinely unavailable. Prefer fixing the image.
   *
   * `--disable-dev-shm-usage` stays: WSL's /dev/shm is small and Chrome crashes
   * on a large page without it, which presents as a dead target.
   */
  const flags = [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate',
    `--window-size=${width},${height}`,
    /*
     * **`--disable-gpu` IN HEADED MODE TOO, AND IT IS NOT COPIED FROM THE
     * HEADLESS FLAGS.** WSLg advertises a GPU it cannot actually serve here.
     * Measured on the first headed launch:
     *
     *   ERROR:gpu/ipc/client/command_buffer_proxy_impl.cc:285]
     *     ContextResult::kTransientFailure: Failed to send
     *     GpuControl.CreateCommandBuffer.        (x3)
     *
     * The window still MAPS, so it looks like a working browser -- and then it
     * stops repainting under load, which presents as the window freezing while
     * somebody is typing. That is indistinguishable from "the site hung", and
     * it cost a wrong diagnosis of a production bug: the harness was suspected
     * of proving something about JMTarot when it was failing on its own
     * compositor. Software rendering (SwiftShader) is slower and does not
     * freeze, and nothing this harness measures is frame-rate sensitive.
     */
    '--disable-gpu',
  ];
  if (process.env.E2E_NO_SANDBOX === '1') flags.push('--no-sandbox');
  if (!headed) flags.push('--headless=new', '--hide-scrollbars');
  flags.push('about:blank');

  const bin = chromeBinary();
  const child = spawn(bin, flags, {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
    env: process.env,
  });
  child.unref();

  for (let i = 0; i < 40; i++) {
    const info = await browserInfo();
    if (info) {
      writeState({ base, headed, width, height });
      console.log(`launched ${headed ? 'HEADED' : 'headless'} ${info.Browser}`);
      console.log(`  viewport ${width}x${height}   profile ${PROFILE}`);
      console.log(`  base     ${base}`);
      if (headed) console.log('  a window should be visible on the Windows desktop (WSLg)');
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('chrome did not open a CDP port -- run tools/e2e/setup.sh');
}

function flag(args, name) {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
}

function resolveUrl(pathOrUrl) {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  const base = readState().base || DEFAULT_BASE;
  return base.replace(/\/$/, '') + (pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`);
}

async function goto(pathOrUrl) {
  const url = resolveUrl(pathOrUrl);
  await withPage(async (cdp) => {
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url });
    await settle(cdp);
  });
  console.log(`→ ${url}`);
  await status();
}

/**
 * Wait for the page to be usable, not merely loaded.
 *
 * **`readyState === 'complete'` IS NOT ENOUGH FOR THIS APP AND CLAUDE.md SAYS
 * SO.** `_onb.html`'s note is the same finding from the iframe harness: load
 * fires when the SSR HTML has parsed, before React has attached its delegated
 * listener -- so a real click lands on a real button and nothing happens, which
 * reads as a dead control rather than a race. Polling for React's
 * `__reactFiber$` key is what actually proves hydration.
 */
async function settle(cdp, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await evaluate(
      cdp,
      `(() => {
         if (document.readyState !== 'complete') return false;
         const el = document.querySelector('main,#__next,body>div');
         if (!el) return false;
         // Hydrated iff React has attached a fiber to some real node.
         const walk = document.querySelectorAll('button,a,main,div');
         for (const n of walk) {
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

async function status() {
  await withPage(async (cdp) => {
    const info = await evaluate(
      cdp,
      `({ url: location.href, title: document.title, lang: document.documentElement.lang })`,
    );
    console.log(`  url   ${info.url}`);
    console.log(`  title ${info.title}   lang=${info.lang}`);
  });
}

/**
 * Whether a session cookie exists, and who it belongs to.
 *
 * `authjs.session-token` is the JWE. It is **httpOnly**, so `document.cookie`
 * cannot see it and `Network.getAllCookies` is the only way -- reading it from
 * JS would silently report "signed out" for a perfectly good session.
 *
 * The cookie's VALUE is never printed. It is a bearer credential for the whole
 * account: anything that puts it in a log or a transcript has handed over the
 * session. Length and expiry are enough to tell it apart from absence.
 */
/**
 * Whether a cookie's domain covers a host, the way the browser decides it.
 *
 * A leading dot means "and every subdomain"; anything else is host-only. Written
 * out rather than approximated with `includes`, because `endsWith('jmtarot.site')`
 * would also accept `evil-jmtarot.site` and the whole point of this function is to
 * stop one origin's cookie being reported as another's.
 */
function domainCovers(domain, host) {
  const d = String(domain ?? '').replace(/^\./, '').toLowerCase();
  const h = host.toLowerCase();
  return d === h || h.endsWith(`.${d}`);
}

async function whoami() {
  await withPage(async (cdp) => {
    const { cookies } = await cdp.send('Network.getAllCookies');

    /*
     * ── SCOPED TO THE CURRENT ORIGIN, AND IT WAS NOT ON 2026-07-30 ─────────────
     *
     * `Network.getAllCookies` returns EVERY cookie in the profile, for every
     * domain it has ever visited. The old line was
     *
     *     cookies.find((c) => /authjs\.session-token/.test(c.name))
     *
     * with no domain filter, so a `localhost` session left over from
     * `E2E_BASE=http://localhost:3001` made `whoami` print **signed IN while
     * driving production**, where there was no session token at all. It cost a
     * production investigation its first wrong turn: the landing page was correct
     * behaviour for a signed-out visitor and this verb said the visitor was signed
     * in.
     *
     * **A HARNESS THAT LIES ABOUT STATE IS WORSE THAN ONE THAT CANNOT SEE IT**,
     * because every measurement taken afterwards is attributed to the wrong cause.
     * The domain is printed for the same reason -- so the next reader can tell
     * WHICH session they are holding without trusting this comment.
     *
     * Auth.js prefixes `__Secure-` on https, so the pattern must stay unanchored at
     * the front; a `^authjs\.` would report a production session as absent.
     */
    const url = await evaluate(cdp, 'location.href').catch(() => '');
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      /* about:blank and friends: no origin, so nothing can be in scope */
    }

    const session = host
      ? cookies.find((c) => /authjs\.session-token/.test(c.name) && domainCovers(c.domain, host))
      : undefined;

    if (!session) {
      const elsewhere = cookies.filter((c) => /authjs\.session-token/.test(c.name)).length;
      console.log(
        `signed OUT (no authjs.session-token for ${host || 'no origin -- goto something first'})`,
      );
      // Naming the count and not the domains: the point is "you are not signed in
      // HERE", and listing other hosts invites reading it as a session anyway.
      if (elsewhere > 0) {
        console.log(`  (${elsewhere} session cookie(s) in this profile for OTHER origins)`);
      }
      return;
    }

    const exp = session.expires > 0 ? new Date(session.expires * 1000).toISOString() : 'session';
    console.log(
      `signed IN  cookie=${session.name} ${session.value.length}B domain=${session.domain} expires=${exp}`,
    );
    console.log('  (value deliberately not printed -- it is a bearer credential)');

    const me = await evaluate(
      cdp,
      `fetch('/api/auth/session', { credentials: 'include' })
         .then((r) => r.text())
         .then((t) => t.slice(0, 300))`,
    ).catch((e) => `error: ${e.message}`);
    console.log(`  /api/auth/session → ${me}`);
  });
}

/**
 * Drive the real Google sign-in, with the human doing the only part a harness
 * must not do.
 *
 * Steps: open `/login` headed, press the button, then POLL for the session
 * cookie while the human authenticates in the visible window. The polling is
 * what makes this composable -- the command returns when sign-in actually
 * succeeded, so whatever runs next can assume a session.
 */
async function login(args) {
  const waitSeconds = Number(flag(args, '--wait') || 300);
  const info = await browserInfo();
  if (!info) throw new Error('not running -- `launch --headed` first');
  if (!readState().headed) {
    console.log('WARNING: this instance is HEADLESS. You cannot type into it.');
    console.log('         Run `kill` then `launch --headed`, then `login` again.');
  }

  await goto('/login');

  const clicked = await withPage((cdp) => tapIn(cdp, 'Sign in with Google', 'Masuk dengan Google'));
  console.log(clicked ? '  pressed the Google button' : '  could not find the Google button');

  console.log(`\nWaiting up to ${waitSeconds}s for you to finish signing in.`);
  console.log('Type your Google credentials into the Chrome window on your desktop.');
  console.log('This harness never sees them and has no verb that could.\n');

  const deadline = Date.now() + waitSeconds * 1000;
  let lastUrl = '';
  while (Date.now() < deadline) {
    const seen = await withPage(async (cdp) => {
      const { cookies } = await cdp.send('Network.getAllCookies');
      const url = await evaluate(cdp, 'location.href').catch(() => '');
      return { hasSession: cookies.some((c) => /authjs\.session-token/.test(c.name)), url };
    }).catch(() => ({ hasSession: false, url: '' }));

    if (seen.url && seen.url !== lastUrl) {
      lastUrl = seen.url;
      console.log(`  … now at ${seen.url.slice(0, 110)}`);
    }
    if (seen.hasSession) {
      console.log('\nSESSION ESTABLISHED.');
      await whoami();
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log('\nTimed out with no session cookie. Last URL above is the clue.');
  process.exitCode = 1;
}

/**
 * Click by visible text, using REAL pointer events at the element's centre.
 *
 * **NOT `element.click()`, and CLAUDE.md explains why it matters here.** A
 * synthetic click does not focus its target, which is precisely the Safari
 * behaviour `AccountMenu`'s `returnFocusTo` prop exists to work around -- so a
 * harness using `.click()` reproduces Safari by accident on some assertions and
 * diverges from every real browser on others. Dispatching through the Input
 * domain is what the browser itself does.
 */
async function tapIn(cdp, ...texts) {
  const box = await evaluate(
    cdp,
    `(() => {
       const wanted = ${JSON.stringify(texts.map((t) => t.trim().toLowerCase()))};
       const nodes = [...document.querySelectorAll('button,a,[role=button],input[type=submit]')]
         .filter((n) => {
           const r = n.getBoundingClientRect();
           return r.width > 0 && r.height > 0;
         })
         .map((n) => ({
           n,
           s: (n.innerText || n.value || n.getAttribute('aria-label') || '')
                .trim().toLowerCase(),
         }));

       /*
        * ── MATCH IN THREE TIERS, EXACT FIRST. ───────────────────────────────
        *
        * **A BARE lowercased \`includes()\` PICKED THE WRONG CONTROL AND
        * REPORTED SUCCESS**, which is worse than failing: the tap landed, the
        * verb printed \`tapped "EN"\`, and the assertion that followed was about
        * a button nobody pressed.
        *
        * Measured on the real account menu. \`tap 'EN'\` against
        * ["Buka menu akun", "Tentang kamu", "EN", "Keluar", …] matched
        * **"Buka menu akun"** first -- m-EN-u -- so it re-tapped the button that
        * opens the sheet and never touched the language toggle. "Tentang kamu"
        * (t-EN-tang) would have been next. A two-letter locale code is a
        * substring of ordinary Indonesian words, so this is not an edge case
        * here; it is the common case.
        *
        * Tier 1 exact, tier 2 word-boundary, tier 3 substring. Substring stays
        * because a button whose label wraps or carries a nested element is real,
        * but it can no longer outrank an exact hit that exists in the document.
        */
       const escape = (w) => w.replace(/[.*+?^\\\${}()|[\\]\\\\]/g, '\\\\$&');
       const exact = nodes.find((c) => wanted.some((w) => c.s === w));
       const word = nodes.find((c) =>
         wanted.some((w) => new RegExp('(^|\\\\W)' + escape(w) + '($|\\\\W)').test(c.s)));
       const loose = nodes.find((c) => wanted.some((w) => c.s.includes(w)));
       const hit = exact || word || loose;
       if (!hit) return null;
       const r = hit.n.getBoundingClientRect();
       return {
         x: r.left + r.width / 2,
         y: r.top + r.height / 2,
         matched: hit.s.slice(0, 60),
         tier: hit === exact ? 'exact' : hit === word ? 'word' : 'substring',
       };
     })()`,
  );
  if (!box) return false;
  // Report WHICH element and by which tier. A substring match on a short string
  // is the shape of the bug above, and silence is what let it through.
  lastTap = box;

  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', {
      type,
      x: box.x,
      y: box.y,
      button: 'left',
      clickCount: 1,
      pointerType: 'touch',
    });
  }
  return true;
}

/** Set by `tapIn`, so `tap` can report which element it actually hit. */
let lastTap = null;

async function tap(args) {
  const text = args[0];
  if (!text) throw new Error('usage: tap <visible text>');
  lastTap = null;
  const ok = await withPage(async (cdp) => {
    await cdp.send('Page.enable');
    const hit = await tapIn(cdp, text);
    if (hit) await settle(cdp, 8000);
    return hit;
  });
  if (ok && lastTap) {
    console.log(`tapped "${text}" -> [${lastTap.tier}] "${lastTap.matched}"`);
    if (lastTap.tier === 'substring') {
      console.log('  WARNING: substring match. Verify this is the control you meant.');
    }
  } else console.log(`NO element matching "${text}"`);
  if (!ok) process.exitCode = 1;
  else await status();
}

async function shot(args) {
  const out = args[0] || 'shot.png';
  const full = args.includes('--full');
  const data = await withPage(async (cdp) => {
    const r = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: full,
    });
    return r.data;
  });
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
  const expr = args.join(' ');
  if (!expr) throw new Error('usage: eval <expression>');
  const v = await withPage((cdp) => evaluate(cdp, expr));
  console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
}

/**
 * Requests the page made, with status and timing.
 *
 * This is the verb that answers CLAUDE.md's "does the UI agree with what it
 * sends?" question -- the one the iframe harnesses under `public/cards/` were
 * built for. Here it is first-class instead of a patched `fetch`.
 */
async function net(args) {
  const seconds = Number(flag(args, '--for') || 10);
  await withPage(async (cdp) => {
    await cdp.send('Network.enable');
    console.log(`recording for ${seconds}s …`);
    await new Promise((r) => setTimeout(r, seconds * 1000));

    const reqs = new Map();
    for (const ev of cdp.events) {
      if (ev.method === 'Network.requestWillBeSent') {
        reqs.set(ev.params.requestId, {
          url: ev.params.request.url,
          method: ev.params.request.method,
          body: ev.params.request.postData,
          t: ev.params.timestamp,
        });
      }
      if (ev.method === 'Network.responseReceived') {
        const r = reqs.get(ev.params.requestId);
        if (r) {
          r.status = ev.params.response.status;
          r.ms = Math.round((ev.params.timestamp - r.t) * 1000);
        }
      }
    }
    const rows = [...reqs.values()].filter((r) => !/\.(png|webp|woff2?|css|js|ico)(\?|$)/.test(r.url));
    if (!rows.length) return console.log('  (no document/xhr requests)');
    for (const r of rows) {
      console.log(`  ${String(r.status ?? '---').padEnd(4)} ${String(r.ms ?? '?').padStart(6)}ms  ${r.method} ${r.url}`);
      if (r.body) console.log(`         body: ${r.body.slice(0, 200)}`);
    }
  });
}

async function wait(args) {
  const needle = args[0];
  const seconds = Number(flag(args, '--for') || 60);
  if (!needle) throw new Error('usage: wait <substring of url or text>');
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const hit = await withPage((cdp) =>
      evaluate(
        cdp,
        `location.href.includes(${JSON.stringify(needle)}) ||
         (document.body.innerText || '').includes(${JSON.stringify(needle)})`,
      ),
    ).catch(() => false);
    if (hit) return console.log(`saw "${needle}"`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`TIMEOUT: never saw "${needle}"`);
  process.exitCode = 1;
}

async function kill() {
  const info = await browserInfo();
  if (!info) return console.log('not running');
  try {
    await fetch(`http://127.0.0.1:${PORT}/json/close`, { signal: AbortSignal.timeout(1000) });
  } catch {
    /* ignore */
  }
  spawn('pkill', ['-f', `remote-debugging-port=${PORT}`], { stdio: 'ignore' }).unref();
  await new Promise((r) => setTimeout(r, 700));
  console.log('killed');
}

/**
 * Delete the persistent profile, which SIGNS THE HUMAN OUT of Google in it.
 *
 * Separate verb and never part of `kill`, because the profile is the thing that
 * makes a password typed once last for weeks. Wiping it as a side effect of
 * stopping the browser would silently ask for authentication again on the next
 * run, which is the pressure that gets a credential written into a script.
 */
async function reset() {
  await kill();
  rmSync(PROFILE, { recursive: true, force: true });
  console.log(`removed ${PROFILE} -- the next \`login\` needs the human again`);
}

/* ── dispatch ────────────────────────────────────────────────────────────── */

const [verb, ...rest] = process.argv.slice(2);
const verbs = {
  launch,
  login,
  whoami,
  status,
  goto: (a) => goto(a[0] || '/'),
  shot,
  text,
  tap,
  eval: evalCmd,
  net,
  wait,
  kill,
  reset,
};

if (!verb || !verbs[verb]) {
  console.log(`verbs: ${Object.keys(verbs).join(', ')}`);
  console.log('see the header of this file for the full usage');
  process.exit(verb ? 1 : 0);
}

verbs[verb](rest).catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
