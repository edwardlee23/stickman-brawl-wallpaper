// The pictures of the settings in the three READMEs (README.md, README.zh-TW.md,
// README.zh-CN.md) come from the
// list in scripts/settings-shots.mjs, recorded by scripts/record-settings.mjs into docs/images/.
// These checks keep the list, the folder and the READMEs in step, and keep the list naming
// only settings the panel has.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { SHOTS } from '../scripts/settings-shots.mjs';
import { fileOf, parseNames, musicFrame, fixedDate } from '../scripts/record-settings.mjs';

const properties = JSON.parse(readFileSync('wallpaper/project.json', 'utf8')).general.properties;
const READMES = ['README.md', 'README.zh-TW.md', 'README.zh-CN.md'];
const images = text => [...text.matchAll(/\(docs\/images\/([\w-]+\.(?:png|gif))\)/g)].map(m => m[1]);

test('every picture in the list is in docs/images, and docs/images holds nothing else', () => {
  assert.deepEqual(readdirSync('docs/images').sort(), SHOTS.map(fileOf).sort());
});

test('each README shows every picture in the list, once, and in the same order', () => {
  const want = SHOTS.map(fileOf);
  const seen = READMES.map(f => images(readFileSync(f, 'utf8')));
  for (const [k, list] of seen.entries()) {
    assert.deepEqual([...list].sort(), [...want].sort(), READMES[k]);
  }
  for (const k of [1, 2]) assert.deepEqual(seen[k], seen[0], READMES[k] + ' shows the pictures in another order than README.md');
});

test('each README links to the other two', () => {
  for (const f of READMES) {
    const text = readFileSync(f, 'utf8');
    for (const g of READMES) if (g !== f) assert.ok(text.includes('](' + g + ')'), f + ' does not link to ' + g);
  }
});

test('the list names only settings the panel has, with values it can take', () => {
  const names = new Set();
  for (const shot of SHOTS) {
    assert.ok(!names.has(shot.name), 'two pictures named ' + shot.name);
    names.add(shot.name);
    assert.match(shot.query, /^\?count=\d+&mode=(ffa|teams)$/, shot.name);
    for (const t of [shot, ...(shot.tiles || [])]) {
      for (const [key, { value }] of Object.entries(t.props || {})) {
        const p = properties[key];
        assert.ok(p, shot.name + ': no setting ' + key);
        if (p.options) assert.ok(p.options.some(o => o.value === value), shot.name + ': ' + key + ' has no option ' + value);
        if (p.type === 'bool') assert.equal(typeof value, 'boolean', shot.name + ': ' + key);
        if (p.type === 'slider') assert.ok(value >= p.min && value <= p.max, shot.name + ': ' + key + ' ' + value);
      }
    }
    if (shot.tiles) assert.ok([2, 4].includes(shot.tiles.length), shot.name + ': 2 or 4 tiles');
    if (shot.tiles) assert.ok(!shot.secs, shot.name + ': tiles make a still');
  }
});

test('the recorder records only pictures the list has', () => {
  assert.equal(parseNames([]).length, SHOTS.length);
  assert.deepEqual(parseNames(['items']).map(s => s.name), ['items']);
  assert.throws(() => parseNames(['nothing']), /No picture named nothing/);
});

test('the music the recorder feeds has a bass beat twice a second', () => {
  const beat = musicFrame(0), between = musicFrame(5);
  assert.equal(beat.length, 128);
  assert.ok(beat[0] > 0.5 && beat[64] > 0.5 && between[0] < 0.1, 'bass on the beat, quiet between');
  assert.equal(musicFrame(10)[0], beat[0]);
});

test('a still of the Day and night background stops the local clock at its hour', () => {
  const win = {};
  new Function('window', fixedDate(18))(win);
  assert.equal(new win.Date().getHours(), 18);
  assert.equal(new win.Date(2020, 0, 1).getFullYear(), 2020);
});
