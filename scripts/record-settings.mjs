// Records the pictures of the settings shown in README.md and README.zh-TW.md into
// docs/images/, from the list in scripts/settings-shots.mjs. Like demo.gif, each is drawn on
// the fixed 1/20 s time step with a seeded Math.random, so a picture comes out the same each time.
//
// Needs Playwright and ffmpeg, which the wallpaper itself does not use:
//
//   npm install --no-save playwright-core
//   node scripts/record-settings.mjs                 # every picture
//   node scripts/record-settings.mjs items platforms # only these
//
// After a change to main.js, record them again and look at each: a seed that showed a
// knockout or an item drop may not any more, and the list's seed or skip then needs changing.
// CHROME and FFMPEG work as for scripts/record-demo.mjs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FPS, openPage, launchOptions } from './record-demo.mjs';
import { SHOTS } from './settings-shots.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = path.join(ROOT, 'docs', 'images');
export const fileOf = shot => shot.name + (shot.secs ? '.gif' : '.png');

// Run before main.js: the local clock stopped at that hour, for the Day and night background
export const fixedDate = hour => `(() => {
  const RealDate = Date, at = new RealDate(2026, 5, 15, ${hour}, 0, 0).getTime();
  window.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [at])); }
    static now() { return at; }
  };
})();`;

// Run before main.js: Wallpaper Engine's audio listener, fed by __advance through __music
export const musicHook = 'window.wallpaperRegisterAudioListener = cb => { window.__music = cb; };';

// 128 levels as Wallpaper Engine hands them (64 left, 64 right, low to high): a bass beat on
// every tenth frame, twice a second at 20 frames a second, over a steady quieter level
export function musicFrame(frame) {
  const beat = frame % 10 === 0;
  return Array.from({ length: 128 }, (_, i) => (i % 64 < 6 ? (beat ? 0.9 : 0.05) : 0.2));
}

export function parseNames(argv) {
  const names = SHOTS.map(s => s.name);
  for (const a of argv) if (!names.includes(a)) throw new Error('No picture named ' + a + '; the list has ' + names.join(', '));
  return argv.length ? SHOTS.filter(s => argv.includes(s.name)) : SHOTS;
}

// A page for one picture, with its settings applied and its fight run up to the picture
async function prepare(browser, shot, startFrame) {
  const init = (shot.hour !== undefined ? fixedDate(shot.hour) : '') + (shot.music ? musicHook : '');
  const page = await openPage(browser, shot.seed, { query: shot.query + '&sound=0', init });
  await page.evaluate(props => window.wallpaperPropertyListener.applyUserProperties(props), shot.props || {});
  // One step of the fight; with music, the frame of levels Wallpaper Engine would hand over first
  if (shot.music) await page.evaluate(`window.__musicFrame = ${musicFrame}`);
  await page.evaluate(({ music, fps }) => {
    window.__frame = 0;
    window.__step = () => {
      if (music && window.__music) window.__music(window.__musicFrame(window.__frame));
      window.__advance(1000 / fps); window.__frame++;
    };
  }, { music: !!shot.music, fps: FPS });
  await page.evaluate(n => { for (let i = 0; i < n; i++) window.__step(); }, startFrame);
  return page;
}

// The frame on which the first fighter is knocked out (ko), or the first item drops (item)
const EVENTS = {
  ko: '() => window.__fighters().some(f => !f.alive)',
  item: '() => window.__stickmanBrawl.items.length > 0',
};
async function eventFrame(browser, shot, kind) {
  const page = await prepare(browser, shot, 0);
  const f = await page.evaluate(`(() => { const seen = ${EVENTS[kind]};
    for (let i = 0; i < ${FPS * 180}; i++) { window.__step(); if (seen()) return i; }
    return -1; })()`);
  await page.close();
  if (f < 0) throw new Error(shot.name + ': no ' + kind + ' in 180 s');
  return f;
}

async function frames(page, n, clicks = []) {
  const at = new Map(clicks.map(([t, x, y]) => [Math.round(t * FPS), [x, y]]));
  const out = [];
  for (let i = 0; i < n; i++) {
    const png = await page.evaluate(click => {
      if (click) window.dispatchEvent(new PointerEvent('pointerdown', { clientX: click[0], clientY: click[1], button: 0, isPrimary: true }));
      window.__step();
      return document.querySelector('canvas').toDataURL('image/png');
    }, at.get(i) || null);
    out.push(Buffer.from(png.split(',')[1], 'base64'));
  }
  return out;
}

const ffmpeg = args => execFileSync(process.env.FFMPEG || 'ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });

async function recordShot(browser, shot, dir) {
  const out = path.join(OUT_DIR, fileOf(shot));
  const kind = ['ko', 'item'].find(k => shot[k] !== undefined);
  const start = kind
    ? Math.max(0, (await eventFrame(browser, shot, kind)) - Math.round(shot[kind] * FPS))
    : Math.round((shot.skip || 0) * FPS);
  if (shot.secs) {
    const page = await prepare(browser, shot, start);
    (await frames(page, shot.secs * FPS, shot.clicks)).forEach((b, i) => fs.writeFileSync(path.join(dir, String(i).padStart(4, '0') + '.png'), b));
    await page.close();
    ffmpeg(['-framerate', String(FPS), '-i', path.join(dir, '%04d.png'),
      '-vf', 'scale=480:270:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle',
      '-loop', '0', out]);
    return out;
  }
  const tiles = shot.tiles || [{}];
  const inputs = [];
  for (const [k, t] of tiles.entries()) {
    const one = { ...shot, ...t, props: { ...(shot.props || {}), ...(t.props || {}) } };
    const page = await prepare(browser, one, start);
    const [png] = await frames(page, 1);
    await page.close();
    const f = path.join(dir, 'tile' + k + '.png');
    fs.writeFileSync(f, png);
    inputs.push('-i', f);
  }
  const scale = tiles.map((_, k) => `[${k}:v]scale=640:360:flags=lanczos[t${k}]`).join(';');
  const join = tiles.length === 1 ? '[t0]null'
    : tiles.length === 2 ? '[t0][t1]hstack=inputs=2'
    : '[t0][t1][t2][t3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0';
  ffmpeg([...inputs, '-filter_complex', scale + ';' + join, '-frames:v', '1', out]);
  return out;
}

async function main() {
  const shots = parseNames(process.argv.slice(2));
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch { throw new Error('playwright-core is missing: run npm install --no-save playwright-core'); }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch(launchOptions(process.env));
  try {
    for (const shot of shots) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stickman-shot-'));
      try {
        const out = await recordShot(browser, shot, dir);
        console.log('Wrote ' + path.relative(process.cwd(), out) + ' (' + (fs.statSync(out).size / 1024).toFixed(0) + ' KB)');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
