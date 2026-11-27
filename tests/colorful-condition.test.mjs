// Unique color per fighter in Red vs Blue (issue #425): a fighter's color comes from its
// team there before the setting is read, so the settings panel hides it outside Free for all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const project = JSON.parse(readFileSync(new URL('../wallpaper/project.json', import.meta.url), 'utf8'));
const MODES = project.general.properties.gamemode.options.map(o => o.value);

test('Unique color per fighter is shown in the settings panel only in Free for all', () => {
  const { condition } = project.general.properties.colorful;
  // Double quotes, as in Wallpaper Engine's docs for a combo condition (yourproperty.value == "example123")
  assert.equal(condition, 'gamemode.value == "ffa"');
  // Wallpaper Engine reads a condition as a JavaScript expression over the other settings
  const shown = new Function('gamemode', 'return (' + condition + ');');
  for (const mode of MODES) assert.equal(shown({ value: mode }), mode === 'ffa', mode);
});
