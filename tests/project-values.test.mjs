// Checks that the settings panel in project.json offers what main.js acts on (issue #392):
// every combo option is a value main.js handles, every default equals the cfg default once
// converted, slider ranges equal the query string's clamps, every condition names a real
// setting, and every control type matches what applyUserProperties reads. The checks in
// project.test.mjs only cover labels and that each key is read at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const project = JSON.parse(readFileSync(new URL('../wallpaper/project.json', import.meta.url), 'utf8'));
const main = readFileSync(new URL('../wallpaper/main.js', import.meta.url), 'utf8');
const { properties, localization } = project.general;

// Loads main.js with no query string and a stub canvas, and returns the window
function load() {
  const stub = new Proxy(function () {}, { get: () => stub, set: () => true, apply: () => stub });
  const canvas = { getContext: () => stub, style: {}, width: 0, height: 0 };
  let seed = 12345;
  const math = Object.create(Math);
  math.random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  Object.assign(window, {
    window,
    document: { getElementById: () => canvas, createElement: () => canvas, body: { style: {} } },
    location: { search: '' },
    URLSearchParams,
    performance: { now: () => 0 },
    requestAnimationFrame() {},
    Math: math, Object, Set, Map, JSON, Array, Number, String, Infinity, NaN, Float32Array, Promise,
  });
  vm.runInNewContext(main, window);
  return window;
}

// The listener's body, and for each setting the cfg field it writes and how: '/100' for a
// slider shown in percent, 'weColor' for a color, 'parseNames' for the names text
const body = main.slice(main.indexOf('applyUserProperties(p) {'), main.indexOf('applyGeneralProperties('));
const handlers = {};
for (const m of body.matchAll(/if \(p\.(\w+)\) \{? ?cfg\.(\w+) = (weColor\(|parseNames\()?p\.\1\.value( \/ 100)?/g)) {
  handlers[m[1]] = { field: m[2], conv: m[4] ? '/100' : m[3] ? m[3].slice(0, -1) : '' };
}
// The style switches are read by one loop over cfg.styles
assert.ok(body.includes("cfg.styles[s] = p['style' + s].value"), 'the style loop changed; update this test');
for (const key of Object.keys(properties)) {
  if (key.startsWith('style') && !handlers[key]) handlers[key] = { field: 'styles.' + key.slice(5), conv: '' };
}
const get = (cfg, field) => field.split('.').reduce((o, k) => o?.[k], cfg);

test('every setting in project.json has a handler this test can read (#392)', () => {
  for (const key of Object.keys(properties)) assert.ok(handlers[key], 'no cfg handler found for ' + key);
});

test('every combo option is a value main.js handles (#392)', () => {
  const win = load();
  const cfg = win.__stickmanBrawl.cfg;
  for (const [key, p] of Object.entries(properties)) {
    if (p.type !== 'combo') continue;
    const { field } = handlers[key];
    // The cfg default's comment lists the values main.js knows, as 'a' | 'b' | ...
    const line = main.match(new RegExp('^  ' + field + ": '\\w+',.*$", 'm'));
    assert.ok(line, 'cfg.' + field + ' has no listed values');
    const known = [...line[0].split('//')[1].matchAll(/'(\w+)'/g)].map(m => m[1]);
    const offered = p.options.map(o => o.value);
    assert.deepEqual([...offered].sort(), [...known].sort(), key + ' offers other values than cfg.' + field + ' lists');
    // Every value but the default is compared with somewhere outside the cfg block
    const code = main.slice(main.indexOf('// ---------- Helpers'));
    for (const v of offered) {
      if (v !== get(cfg, field)) assert.ok(code.includes("'" + v + "'"), key + ': main.js never tests for ' + v);
    }
    // Setting each option lands in cfg as it is
    for (const v of offered) {
      win.wallpaperPropertyListener.applyUserProperties({ [key]: { value: v } });
      assert.equal(get(cfg, field), v, key + ' = ' + v);
    }
  }
});

test('every panel default equals the cfg default main.js starts with (#392)', () => {
  const win = load();
  const cfg = win.__stickmanBrawl.cfg;
  const weColor = c => 'rgb(' + c.split(' ').map(x => Math.round(Math.min(1, Math.max(0, +x)) * 255)).join(',') + ')';
  const hex = h => 'rgb(' + [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',') + ')';
  for (const [key, p] of Object.entries(properties)) {
    const { field, conv } = handlers[key];
    const want = get(cfg, field);
    if (conv === '/100') assert.equal(p.value / 100, want, key);
    else if (conv === 'weColor') assert.equal(weColor(p.value), hex(want), key);
    else if (conv === 'parseNames') { assert.equal(p.value, '', key); assert.deepEqual([...want], [], key); }
    else assert.equal(p.value, want, key);
  }
});

test('slider ranges equal the query string clamps (#392)', () => {
  let n = 0;
  for (const m of main.matchAll(/^cfg\.(\w+) = (?:Math\.round\()?qNum\('\w+', ([\d.]+), ([\d.]+), [^;]*?(\/ 100)?;$/gm)) {
    const [, field, lo, hi, inPanelUnits] = m;
    const key = Object.keys(handlers).find(k => handlers[k].field === field);
    assert.ok(key, 'no setting writes cfg.' + field);
    const p = properties[key];
    assert.equal(p.type, 'slider', key);
    // A clamp in cfg units is scaled the way the handler scales the slider
    const f = !inPanelUnits && handlers[key].conv === '/100' ? 100 : 1;
    assert.equal(p.min, +lo * f, key + ' min');
    assert.equal(p.max, +hi * f, key + ' max');
    n++;
  }
  assert.equal(n, 3, 'count, speed and volume have query clamps');
});

test('every condition names a setting of the right type (#392)', () => {
  for (const [key, p] of Object.entries(properties)) {
    if (!p.condition) continue;
    const bare = /^(\w+)\.value$/.exec(p.condition);
    // A combo value in double quotes, the form Wallpaper Engine's docs give
    const eq = /^(\w+)\.value == "(\w+)"$/.exec(p.condition);
    assert.ok(bare || eq, key + ': condition "' + p.condition + '" has an unknown form');
    const ref = properties[(bare || eq)[1]];
    assert.ok(ref, key + ': condition names no setting: ' + p.condition);
    if (bare) assert.equal(ref.type, 'bool', key + ': condition on a setting that is not a switch');
    else assert.ok(ref.options?.some(o => o.value === eq[2]), key + ': condition tests a value ' + eq[1] + ' does not offer');
  }
});

test('every control type matches what main.js reads (#392)', () => {
  const cfg = load().__stickmanBrawl.cfg;
  for (const [key, p] of Object.entries(properties)) {
    const { field, conv } = handlers[key];
    const v = get(cfg, field);
    const want = conv === 'weColor' ? 'color' : conv === 'parseNames' ? 'textinput'
      : typeof v === 'boolean' ? 'bool' : typeof v === 'number' ? 'slider' : 'combo';
    assert.equal(p.type, want, key);
    if (p.type === 'slider') assert.ok(p.min <= p.value && p.value <= p.max, key + ' default outside its range');
    if (p.type === 'combo') assert.ok(p.options.some(o => o.value === p.value), key + ' default is not an option');
  }
});

test('the Chinese translations are not left in English (#392)', () => {
  for (const lang of ['zh-cht', 'zh-chs']) {
    for (const [t, s] of Object.entries(localization[lang])) {
      assert.match(s, /\p{Script=Han}/u, lang + ' ' + t + ' has no Chinese: ' + s);
    }
  }
});
