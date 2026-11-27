// The pictures of the settings in the three READMEs (README.md, README.zh-TW.md,
// README.zh-CN.md) come from the
// list in scripts/settings-shots.mjs, recorded by scripts/record-settings.mjs into docs/images/.
// These checks keep the list, the folder and the READMEs in step, and keep the list naming
// only settings the panel has.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { SHOTS } from '../scripts/settings-shots.mjs';
import { fileOf, parseNames, musicFrame, fixedDate, SHOWS } from '../scripts/record-settings.mjs';

const properties = JSON.parse(readFileSync(new URL('../wallpaper/project.json', import.meta.url), 'utf8')).general.properties;
const READMES = ['README.md', 'README.zh-TW.md', 'README.zh-CN.md'];
const images = text => [...text.matchAll(/\(docs\/images\/([\w-]+\.(?:png|gif))\)/g)].map(m => m[1]);

test('every picture in the list is in docs/images, and docs/images holds nothing else', () => {
  assert.deepEqual(readdirSync(new URL('../docs/images', import.meta.url)).sort(), SHOTS.map(fileOf).sort());
});

test('each README shows every picture in the list, once, and in the same order', () => {
  const want = SHOTS.map(fileOf);
  const seen = READMES.map(f => images(readFileSync(new URL('../' + f, import.meta.url), 'utf8')));
  for (const [k, list] of seen.entries()) {
    assert.deepEqual([...list].sort(), [...want].sort(), READMES[k]);
  }
  for (const k of [1, 2]) assert.deepEqual(seen[k], seen[0], READMES[k] + ' shows the pictures in another order than README.md');
});

test('README.md shows the pictures in the order of the list (#471)', () => {
  assert.deepEqual(images(readFileSync(new URL('../README.md', import.meta.url), 'utf8')), SHOTS.map(fileOf));
});

test('each README has its language-switch line in the same place (#471)', () => {
  const at = READMES.map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8').split('\n')
    .findIndex(l => l.includes('English') && l.includes('繁體中文') && l.includes('简体中文')));
  for (const [k, i] of at.entries()) assert.ok(i >= 0, READMES[k] + ' has no language-switch line');
  for (const k of [1, 2]) assert.equal(at[k], at[0], READMES[k] + ' has its language-switch line elsewhere than README.md');
});

test('each README links to the other two', () => {
  for (const f of READMES) {
    const text = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
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

// The fields scripts/settings-shots.mjs documents; a tile may set any of them but name, tiles
// and secs, since a grid of tiles is one still (#468)
const SHOT_FIELDS = ['name', 'seed', 'query', 'props', 'skip', 'ko', 'item', 'clicks', 'music', 'hour', 'tiles', 'secs', 'shows'];
const TILE_FIELDS = SHOT_FIELDS.filter(k => !['name', 'tiles', 'secs', 'shows'].includes(k));
// The move ids and item kinds main.js has, for the item and shows fields (#466)
const MAIN = readFileSync(new URL('../wallpaper/main.js', import.meta.url), 'utf8');
const MOVE_IDS = new Set([...MAIN.matchAll(/\bid: '(\w+)'/g)].map(m => m[1]));
const ITEM_KINDS = JSON.parse(MAIN.match(/const ITEM_KINDS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));

// What is wrong with a shot, as a list of messages; empty when nothing is
function shotProblems(shot) {
  const out = [];
  const name = shot.name;
  for (const k of Object.keys(shot)) if (!SHOT_FIELDS.includes(k)) out.push(name + ': unknown field ' + k);
  for (const [i, t] of (shot.tiles || []).entries()) {
    for (const k of Object.keys(t)) if (!TILE_FIELDS.includes(k)) out.push(name + ': tile ' + i + ': unknown field ' + k);
  }
  // Each picture the recorder makes: the shot itself, or each tile over the shared fields
  const pictures = (shot.tiles || [{}]).map(t => ({ ...shot, ...t, props: { ...(shot.props || {}), ...(t.props || {}) } }));
  for (const [i, p] of pictures.entries()) {
    const where = name + (shot.tiles ? ': tile ' + i : '');
    // Without hour the recorder leaves the clock running, and the picture shows the recording machine's time
    const theme = p.props.backgroundtheme ? p.props.backgroundtheme.value : properties.backgroundtheme.value;
    if (theme === 'daynight' && p.hour === undefined) out.push(where + ': Day and night needs an hour');
    if (p.hour !== undefined && !(Number.isInteger(p.hour) && p.hour >= 0 && p.hour <= 23)) out.push(where + ': hour ' + p.hour + ' is not a whole number 0-23');
    const starts = ['skip', 'ko', 'item'].filter(k => p[k] !== undefined);
    if (starts.length > 1) out.push(where + ': only one of skip, ko and item, not ' + starts.join(' and '));
    if (p.music && !(p.props.audioreactive && p.props.audioreactive.value === true)) out.push(where + ': music without audioreactive: true');
  }
  // item is the seconds before the first drop, or { kind, lead } for the first drop of that kind (#466)
  if (shot.item !== undefined) {
    const it = shot.item, lead = typeof it === 'object' && it ? it.lead : it;
    if (typeof it === 'object' && it && !ITEM_KINDS.includes(it.kind)) out.push(name + ': item kind ' + it.kind + ' is not one of ' + ITEM_KINDS.join(', '));
    if (typeof it === 'object' && it) for (const k of Object.keys(it)) if (!['kind', 'lead'].includes(k)) out.push(name + ': item: unknown field ' + k);
    if (!(typeof lead === 'number' && lead >= 0)) out.push(name + ': item lead ' + lead + ' is not a number of seconds');
  }
  // shows: what --check asserts happens in the clip, so it is for GIFs only (#466)
  if (shot.shows) {
    if (!shot.secs) out.push(name + ': shows is for a GIF, and a still has no clip to check');
    const s = shot.shows;
    for (const k of Object.keys(s)) if (!SHOWS.includes(k)) out.push(name + ': shows: unknown field ' + k);
    for (const id of s.moves || []) if (!MOVE_IDS.has(id)) out.push(name + ': shows: no move ' + id);
    for (const t of s.fx || []) if (!new RegExp("addFx\\(\\{ type: '" + t + "'").test(MAIN)) out.push(name + ': shows: no fx ' + t);
    if (s.item !== undefined && !ITEM_KINDS.includes(s.item)) out.push(name + ': shows: no item kind ' + s.item);
    if (s.launched !== undefined && !(Number.isInteger(s.launched) && s.launched > 0 && shot.clicks)) out.push(name + ': shows: launched needs clicks and a count');
    if (s.ko !== undefined && s.ko !== true) out.push(name + ': shows: ko is true or left out');
  }
  for (const [t] of shot.clicks || []) {
    if (!shot.secs || !(t >= 0 && t < shot.secs)) out.push(name + ': a click at ' + t + ' s is outside the ' + (shot.secs || 0) + ' s clip');
  }
  return out;
}

test('every shot sets only known fields, with values the recorder uses (#468)', () => {
  assert.deepEqual(SHOTS.flatMap(shotProblems), []);
});

test('the shot check catches the changes #468 names', () => {
  const shot = n => structuredClone(SHOTS.find(s => s.name === n));
  const dayNight = shot('day-and-night');
  dayNight.tiles = dayNight.tiles.map(({ hour }) => ({ hours: hour }));
  const backgrounds = shot('backgrounds');
  delete backgrounds.hour;
  const click = shot('click-blast');
  click.clicks = [[3.5, 640, 560]];
  const slow = shot('slow-motion');
  slow.skip = 40;
  const music = shot('music');
  delete music.props.audioreactive;
  const fractional = shot('backgrounds');
  fractional.hour = 21.5;
  const sword = shot('items');
  sword.item = { kind: 'sword', lead: 0.3 };
  const noLead = shot('items');
  noLead.item = { kind: 'boomerang' };
  const stillShows = shot('teams');
  stillShows.shows = { ko: true };
  const noMove = shot('styles-super');
  noMove.shows = { moves: ['kamehameha'] };
  const noFx = shot('reduce-motion-off');
  noFx.shows = { fx: ['sparkle'] };
  for (const bad of [dayNight, backgrounds, click, slow, music, fractional, sword, noLead, stillShows, noMove, noFx]) {
    assert.notDeepEqual(shotProblems(bad), [], bad.name + ' passes the check');
  }
});

// The captions these GIFs have in README.md name events a shifted random sequence can lose
// (#466); --check replays each clip and asserts that what shows lists happens
test('each GIF whose caption names an event lists it in shows, for --check (#466)', () => {
  const want = {
    'styles-super': { moves: ['blast', 'wallrun', 'slam'] },
    'styles-magic': { moves: ['fireball', 'lightning', 'ice', 'shield'], fx: ['bolt'] },
    'styles-ninjutsu': { moves: ['shuriken', 'clones', 'smoke'] },
    'reduce-motion-off': { fx: ['flash'] },
    'slow-motion': { ko: true },
    items: { item: 'boomerang' },
    'click-blast': { launched: 1 },
  };
  for (const [name, shows] of Object.entries(want)) assert.deepEqual(SHOTS.find(s => s.name === name).shows, shows, name);
  // The items clip waits for the boomerang its caption names, not for whatever drops first
  assert.equal(SHOTS.find(s => s.name === 'items').item.kind, 'boomerang');
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
