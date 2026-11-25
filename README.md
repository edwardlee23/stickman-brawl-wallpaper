# Stickman Brawl 火柴人格鬥

[![CI](https://github.com/edwardlee23/stickman-brawl-wallpaper/actions/workflows/ci.yml/badge.svg)](https://github.com/edwardlee23/stickman-brawl-wallpaper/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A comic-style stickman brawl for [Wallpaper Engine](https://www.wallpaperengine.io/).
Fighters mix boxing, Muay Thai, taekwondo, judo and wrestling with comic
specials (energy blasts, wall running, and hits that slam them into walls),
magic (fireballs, lightning strikes, ice shards that freeze the target, and
shields that stop a hit) and ninjutsu: shuriken, shadow clones, smoke escapes,
and a log left behind to take a hit. A knockout turns the loser into a
ragdoll, and a new round starts when one side is left.

![Six fighters brawling in free-for-all mode](demo.gif)

## Install

Subscribe to it on the
[Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3845187060),
and Wallpaper Engine downloads it.

To run it from this repository instead:

1. Download or clone this repository.
2. In Wallpaper Engine, choose **Open Wallpaper → Open from File** and pick
   `wallpaper/project.json`. The `wallpaper/` folder holds only the files the
   wallpaper needs, so a Workshop upload from it leaves out the rest of the
   repository.

## Settings

The settings panel is available in English, Traditional Chinese and
Simplified Chinese. It sets the number of fighters (2 to 16), free-for-all or
red vs blue teams, speed, figure size, which fighting styles are used, health
bars, per-fighter colors, the background and line colors, and "Reduce
flashing and screen shake". That last one is on by default: it hides the
full-screen white flash of energy blasts and lightning and the speed lines of
big hits, and stops the screen shaking. Turn it off for the full comic look.
With every style turned off, fighters use all five martial-arts styles,
without the specials, magic or ninjutsu.

"Show score" (off by default) keeps a running tally of round wins in the top
left corner: `RED 5 : 3 BLUE` in teams mode, or the top three fighters as
`#3 ×4  #1 ×2` in free-for-all. Draws are not counted, and the tally starts
over when the number of fighters or the mode changes.

"Fighter names" takes comma-separated names, given to fighters in order
(`Ann, Bo, Cy`): a named fighter shows its name above its health bar and in
the win text (`ANN WINS!`). Names are cut to 12 characters, and an empty entry
keeps `#n`. "Head gear" gives each fighter a headband, ninja mask, cap or
topknot, the same one every round. Both are off by default.

"Background" draws a dark scene behind the fight in place of the flat
background color: a dojo, a rooftop at night, comic halftone dots, or a sky
that follows the local clock from dawn to night. All of them are drawn in
code. The default, Plain, keeps the flat color.

"Slow-motion finish" (off by default) slows the fight to a quarter speed for
about a second when the knockout that ends a round lands, and zooms in on the
fighter knocked out. With "Reduce flashing and screen shake" on, the fight
still slows but the view does not move.

"Sound effects" plays short comic sounds for hits, blocks, specials,
knockouts and the end of a round, with its own volume. It is off by default.
The sounds are made in code when they play, so the wallpaper loads no audio
files and works offline.

Opened in a plain browser, `wallpaper/index.html` also reads `count`, `mode`,
`speed`, `reducemotion`, `sound` and `volume` from the query string, for
example `index.html?count=8&mode=teams` or `index.html?sound=1&volume=50`.
`count` (2 to 16), `speed` (0.25 to 3, where 1 is 100%) and `volume` (0 to
100) are clamped to the panel's ranges and must be plain numbers, `mode` is
`ffa` or `teams`, `reducemotion` and `sound` are turned on by `1`, `true`,
`on` or `yes` and off by `0`, `false`, `off` or `no` (in any case), and any
other value keeps the default. A browser plays sound only after the page has
been clicked once.

## Development

There is no build step: `wallpaper/index.html` loads `wallpaper/main.js`
directly. See [AGENTS.md](AGENTS.md) for the commands and rules, and
[CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

[MIT](LICENSE)
