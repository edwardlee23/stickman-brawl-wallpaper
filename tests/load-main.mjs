// Loads wallpaper/main.js in a vm sandbox with a fake window, canvas and document, for the
// tests (issue #432). Every option has the default most tests want:
//   search      the query string main.js reads from location ('?count=2&mode=ffa')
//   width, height, dpr   the window's size and devicePixelRatio (1280 x 720 at 1)
//   ctx         the screen's 2D context (a stub that answers every call)
//   canvas      the screen canvas (one that hands out ctx)
//   seed        seeds Math.random with an LCG kept in context.__seed, so a test can reseed it (1)
//   random      a fixed number for Math.random, a function to use as it, or null for the real one;
//               it wins over seed
//   window      properties added to the fake window (AudioContext, addEventListener, ...)
//   document    properties added to the fake document (createElement, body, ...)
//   globals     properties added to the sandbox's global object (performance, requestAnimationFrame, ...)
//   prelude     code run in the sandbox after Math.random is set and before main.js
//   patch       a function that changes main.js's source before it runs
//   expose      code run inside main.js's closure at its end, as in 'window.__in = { hitStop };'
//   properties  settings passed to applyUserProperties after main.js has loaded
//   stiff       draw the game joints f.W as they are, without the spring offset of f.V, for
//               tests that pin drawing against f.W (livelier motion)
// Returns the debug hook (game), the window, the sandbox (context), the canvas and ctx.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const source = readFileSync(new URL('../wallpaper/main.js', import.meta.url), 'utf8');
const END = 'requestAnimationFrame(frame);\n})();';

// A 2D context that takes every call and every property; a gradient it returns takes colour stops
export const stubContext = () => new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });

// The LCG the tests seed Math.random with (issue #161), as a function outside the sandbox
export function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

// A mulberry32 generator, the other seeded Math.random some tests use
export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function loadMain({
  search = '?count=2&mode=ffa', width = 1280, height = 720, dpr = 1,
  ctx = stubContext(), canvas = { width: 0, height: 0, style: {}, getContext: () => ctx },
  seed = 1, random, window: win = {}, document = {}, globals = {}, prelude, patch, expose, properties, stiff,
} = {}) {
  const window = { innerWidth: width, innerHeight: height, devicePixelRatio: dpr, addEventListener() {}, ...win };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search },
    document: { getElementById: () => canvas, body: { style: {} }, ...document },
    requestAnimationFrame() {},
    ...globals,
  });
  // Seeding the real Math would change Math.random for the whole test process
  if (globals.Math === Math && random !== null) throw new Error('pass random: null with the real Math');
  if (typeof random === 'number') vm.runInContext('Math.random = () => ' + random + ';', context);
  else if (typeof random === 'function') vm.runInContext('Math', context).random = random;
  else if (random !== null) {
    context.__seed = seed >>> 0;
    vm.runInContext('Math.random = () => (__seed = (Math.imul(__seed, 1664525) + 1013904223) >>> 0) / 4294967296', context);
  }
  if (prelude) vm.runInContext(prelude, context);
  let code = patch ? patch(source) : source;
  if (stiff) {
    for (const VIEW of ['f.V = f.rag ? f.rag.pts : f.viewJoints();', 'f.V = f.viewJoints();']) {
      if (!code.includes(VIEW)) throw new Error('main.js no longer sets ' + VIEW);
      code = code.replaceAll(VIEW, 'f.V = null;');
    }
  }
  if (expose !== undefined) {
    if (!code.includes(END)) throw new Error('main.js no longer ends with ' + JSON.stringify(END));
    code = code.replace(END, () => 'requestAnimationFrame(frame);\n' + expose + '\n})();');
  }
  vm.runInContext(code, context, { filename: 'wallpaper/main.js' });
  if (properties) window.wallpaperPropertyListener.applyUserProperties(properties);
  return { game: window.__stickmanBrawl, window, context, canvas, ctx };
}
