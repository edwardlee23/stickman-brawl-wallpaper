// The pictures of the settings in README.md, README.zh-TW.md and README.zh-CN.md, recorded
// into docs/images/ by scripts/record-settings.mjs. Each one is a GIF of a few seconds (secs)
// or a still PNG (no secs). Fields:
//   name      file name in docs/images/, without the extension
//   seed      seeds Math.random, as for demo.gif; scan again after a change to main.js
//   query     the page's query string (count and mode; sound stays off)
//   props     settings passed to applyUserProperties, as Wallpaper Engine passes them
//   skip      seconds of fight run before the picture, so rounds, items or a knockout come
//   ko        instead of skip: start this many seconds before the first knockout
//   item      instead of skip: start this many seconds before the first item drops, or
//             { kind, lead }: lead seconds before the first item of that kind drops
//   clicks    for Click to blast, [seconds into the clip, x, y] of each click
//   music     feed a bass beat twice a second, as "React to music" hears from the desktop
//   hour      the local time of day, for the Day and night background
//   shows     for a GIF, the events its caption in README.md names, which
//             record-settings.mjs --check asserts happen in the clip: moves (move ids that
//             start), fx (effect types drawn), item (a kind that drops and is picked up),
//             launched (at least this many fighters launched by the clicks), ko (a knockout)
//   tiles     several pictures side by side (2 or 4, 4 as a 2 x 2 grid), each with its own
//             fields over the shared ones
// A still is 640 x 360 (each tile of a grid too); a GIF 480 x 270.
const v = x => ({ value: x });
const ALL_STYLES_OFF = { styleboxing: v(false), stylemuaythai: v(false), styletaekwondo: v(false), stylejudo: v(false),
  stylewrestling: v(false), stylesuper: v(false), stylemagic: v(false), styleninjutsu: v(false) };

export const SHOTS = [
  { name: 'fighters-16', seed: 1, query: '?count=16&mode=ffa', skip: 3 },
  { name: 'teams', seed: 1, query: '?count=8&mode=teams', skip: 3 },
  { name: 'figure-size', seed: 1, query: '?count=4&mode=ffa', skip: 3,
    tiles: [{ props: { figurescale: v(50) } }, { props: { figurescale: v(200) } }] },
  { name: 'styles-super', seed: 4, query: '?count=4&mode=ffa', skip: 4.5, secs: 5, props: { ...ALL_STYLES_OFF, stylesuper: v(true) },
    shows: { moves: ['blast', 'wallrun', 'slam'] } },
  { name: 'styles-magic', seed: 9, query: '?count=4&mode=ffa', skip: 5, secs: 5, props: { ...ALL_STYLES_OFF, stylemagic: v(true) },
    shows: { moves: ['fireball', 'lightning', 'ice', 'shield'], fx: ['bolt'] } },
  { name: 'styles-ninjutsu', seed: 4, query: '?count=4&mode=ffa', skip: 3, secs: 5, props: { ...ALL_STYLES_OFF, styleninjutsu: v(true) },
    shows: { moves: ['shuriken', 'clones', 'smoke'] } },
  { name: 'health-and-colors', seed: 1, query: '?count=6&mode=ffa', skip: 3,
    tiles: [{ props: { showhealth: v(true), colorful: v(true) } }, { props: { showhealth: v(false), colorful: v(false) } }] },
  { name: 'reduce-motion-off', seed: 4, query: '?count=6&mode=ffa', skip: 2, secs: 5, props: { reducemotion: v(false) },
    shows: { fx: ['flash'] } },
  { name: 'show-score', seed: 2, query: '?count=4&mode=teams', skip: 90, props: { showscore: v(true) } },
  { name: 'names-headgear', seed: 1, query: '?count=4&mode=ffa', skip: 2,
    props: { fighternames: v('Ann, Bo, Cy, Dee'), headgear: v(true), figurescale: v(160) } },
  { name: 'backgrounds', seed: 1, query: '?count=4&mode=ffa', skip: 3, hour: 21,
    tiles: [{ props: { backgroundtheme: v('dojo') } }, { props: { backgroundtheme: v('rooftop') } },
      { props: { backgroundtheme: v('comic') } }, { props: { backgroundtheme: v('daynight') } }] },
  { name: 'day-and-night', seed: 1, query: '?count=4&mode=ffa', skip: 3, props: { backgroundtheme: v('daynight') },
    tiles: [{ hour: 6 }, { hour: 12 }, { hour: 18 }, { hour: 23 }] },
  { name: 'colors', seed: 1, query: '?count=4&mode=ffa', skip: 3,
    props: { colorful: v(false) },
    tiles: [{ props: { backgroundcolor: v('0.94 0.92 0.86'), linecolor: v('0.1 0.1 0.12') } },
      { props: { backgroundcolor: v('0.05 0.08 0.2'), linecolor: v('1 0.85 0.3') } }] },
  { name: 'slow-motion', seed: 1, query: '?count=2&mode=ffa', ko: 1, secs: 3,
    props: { slowmofinish: v(true), reducemotion: v(false) }, shows: { ko: true } },
  { name: 'king', seed: 1, query: '?count=5&mode=ffa', skip: 3, props: { roundrules: v('king') } },
  { name: 'ladder', seed: 1, query: '?count=5&mode=ffa', skip: 2, secs: 5, props: { roundrules: v('ladder') } },
  { name: 'items', seed: 4, query: '?count=4&mode=ffa', item: { kind: 'boomerang', lead: 0.3 }, secs: 5, props: { items: v(true) },
    shows: { item: 'boomerang' } },
  { name: 'platforms', seed: 1, query: '?count=6&mode=ffa', skip: 2, secs: 5, props: { platforms: v(true) } },
  { name: 'music', seed: 1, query: '?count=6&mode=ffa', skip: 2, secs: 4, music: true,
    props: { audioreactive: v(true), audiostrength: v(100), reducemotion: v(false) } },
  { name: 'click-blast', seed: 1, query: '?count=6&mode=ffa', skip: 2, secs: 3, clicks: [[0.5, 920, 410]],
    props: { clickblast: v(true), reducemotion: v(false) }, shows: { launched: 1 } },
];
