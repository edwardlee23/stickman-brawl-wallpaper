// Records demo.gif, the README's animated demo, from wallpaper/index.html.
//
// The page runs on a fixed 1/20 s time step with a seeded Math.random, so every frame
// is captured and a seed gives the same fight each time. Six fighters, free-for-all,
// 14 seconds at 1280x720, scaled to 640x360 with a 64-colour palette.
//
// Needs Playwright and ffmpeg, which the wallpaper itself does not use:
//
//   npm install --no-save playwright-core
//   node scripts/record-demo.mjs --scan 1-40   # count the move styles each seed shows
//   node scripts/record-demo.mjs --seed <n>    # record a seed that shows all eight to demo.gif
//
// A change to main.js can shift the random sequence, so scan again before each recording:
// a seed that showed every style once may miss some now. Chrome draws the canvas in
// software (no GPU), so with the same Chrome and ffmpeg a seed gives the same GIF.
//
// The browser is the installed Google Chrome; set CHROME to another Chromium's
// executable to use that instead. Set FFMPEG if ffmpeg is not on PATH.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FPS = 20, SECS = 14, WIDTH = 1280, HEIGHT = 720;
const QUERY = '?count=6&mode=ffa&sound=0';

// main.js keeps its fighters inside a closure; the recorder serves a copy that also
// hands them to the page, so a scan can see which moves start. The file is not changed.
export function exposeFighters(src) {
  const end = /requestAnimationFrame\(frame\);\s*\}\)\(\);\s*$/;
  if (!end.test(src)) throw new Error('main.js no longer ends with requestAnimationFrame(frame); })();');
  return src.replace(end, 'window.__fighters = () => fighters;\nrequestAnimationFrame(frame);\n})();\n');
}

// Runs before main.js: a seeded Math.random (mulberry32), and a clock and
// requestAnimationFrame that only move when the recorder calls __advance(ms).
export const fixedClock = seed => `(() => {
  let s = ${seed >>> 0};
  Math.random = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let now = 1000, queue = [];
  performance.now = () => now;
  window.requestAnimationFrame = cb => queue.push(cb);
  window.__advance = ms => { now += ms; const q = queue; queue = []; for (const cb of q) cb(now); };
})();`;

// query replaces the demo's query string; init is more code run before main.js, after the clock
export async function openPage(browser, seed, { query = QUERY, init = '' } = {}) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  await page.addInitScript(fixedClock(seed) + init);
  await page.route('**/main.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: exposeFighters(fs.readFileSync(path.join(ROOT, 'wallpaper', 'main.js'), 'utf8')),
  }));
  await page.goto(pathToFileURL(path.join(ROOT, 'wallpaper', 'index.html')).href + query);
  await page.waitForFunction(() => typeof window.__fighters === 'function');
  return page;
}

// Counts the moves started in each style over the recording's length. It runs inside the
// page, so it uses only its arguments: advance(ms) moves the clock, fighters() lists them.
export function countMoveStyles(advance, fighters, frames, fps) {
  const last = new Map(), counts = {};
  for (let i = 0; i < frames; i++) {
    advance(1000 / fps);
    fighters().forEach((f, k) => {
      const m = f.state === 'attack' ? f.move : null;
      if (m && last.get(k) !== m) counts[m.style] = (counts[m.style] || 0) + 1;
      last.set(k, m);
    });
  }
  return counts;
}

async function scan(browser, seed) {
  const page = await openPage(browser, seed);
  const counts = await page.evaluate(`(${countMoveStyles})(window.__advance, window.__fighters, ${FPS * SECS}, ${FPS})`);
  await page.close();
  return counts;
}

async function record(browser, seed, out) {
  const page = await openPage(browser, seed);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stickman-demo-'));
  try {
    for (let i = 0; i < FPS * SECS; i++) {
      const png = await page.evaluate(FPS => {
        window.__advance(1000 / FPS);
        return document.querySelector('canvas').toDataURL('image/png');
      }, FPS);
      fs.writeFileSync(path.join(dir, String(i).padStart(4, '0') + '.png'), Buffer.from(png.split(',')[1], 'base64'));
    }
    execFileSync(process.env.FFMPEG || 'ffmpeg', [
      '-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, '%04d.png'),
      '-vf', 'scale=640:360:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle',
      '-loop', '0', out,
    ], { stdio: 'inherit' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function parseArgs(argv) {
  const opt = { seed: null, scan: null, out: path.join(ROOT, 'demo.gif') };
  for (let i = 0; i < argv.length; i += 2) {
    const a = argv[i], v = argv[i + 1];
    if (!['--seed', '--scan', '--out'].includes(a)) throw new Error('Unknown argument: ' + a);
    if (v === undefined) throw new Error(a + ' needs a value');
    if (a === '--seed') {
      opt.seed = Number(v);
      // The page seeds Math.random with a 32-bit value; a larger seed would wrap to another.
      if (!/^\d+$/.test(v) || opt.seed > 0xFFFFFFFF) throw new Error('--seed takes a whole number from 0 to 4294967295');
    } else if (a === '--scan') {
      const m = /^(\d+)(?:-(\d+))?$/.exec(v);
      const lo = m && Number(m[1]), hi = m && Number(m[2] ?? m[1]);
      // The same 32-bit limit as --seed: a larger seed would scan another seed's fight.
      if (!m || lo > hi || hi > 0xFFFFFFFF) throw new Error('--scan takes a seed or a range such as 1-12, from 0 to 4294967295');
      // The two ends only: listing every seed of a range such as 0-4294967295 would not fit.
      opt.scan = { from: lo, to: hi };
    } else opt.out = path.resolve(v);
  }
  if (opt.scan && opt.seed !== null) throw new Error('--seed and --scan cannot be used together: scan first, then record one seed');
  if (!opt.scan && opt.seed === null) throw new Error('--seed is needed: run --scan first and pick a seed that shows all eight move styles');
  return opt;
}

// The canvas is drawn in software: on the GPU, a few frames can differ by one in a colour
// value from one run of the same seed to the next.
export function launchOptions(env) {
  const args = ['--disable-accelerated-2d-canvas', '--disable-gpu'];
  return env.CHROME ? { executablePath: env.CHROME, args } : { channel: 'chrome', args };
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch { throw new Error('playwright-core is missing: run npm install --no-save playwright-core'); }
  const browser = await chromium.launch(launchOptions(process.env));
  try {
    if (opt.scan) {
      for (let seed = opt.scan.from; seed <= opt.scan.to; seed++) console.log(seed, JSON.stringify(await scan(browser, seed)));
    } else {
      await record(browser, opt.seed, opt.out);
      console.log('Wrote ' + path.relative(process.cwd(), opt.out) + ' (seed ' + opt.seed + ', ' + (fs.statSync(opt.out).size / 1048576).toFixed(1) + ' MB)');
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
