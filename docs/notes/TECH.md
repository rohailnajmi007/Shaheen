# Tech notes

Tools, project structure, rendering, performance, testing, git and deploy. Keep up to date.

**History:** the game was built in Godot 4.7.2 (GDScript) up to commit `dca728c`
(tag `godot-final`). In 2026-11 a friend (GitHub `reachrazamair`, PR #1) ported
it to plain JavaScript, and the owner made that the main version. The other notes
files still name some Godot files (`aircraft.gd`, `.tres`, `hud.gd` ...): the
behaviour they describe still applies; see "Godot to JS map" below for where it
lives now. To look at the old code: `git show godot-final:<path>`.

## Stack

- **Language:** JavaScript (ES modules), no framework, no TypeScript.
- **Build tool:** Vite 7 (`package.json`). Node 22 / npm 11 on the dev PC.
- **Rendering:** one HTML `<canvas>` with the Canvas 2D API for the world and
  aircraft; the HUD, menus, pause and result screens are HTML + CSS layered on top
  (`index.html`: `#game`, `#hud`, `#menu`, `#pause`, `#result`).
- **Sound:** Web Audio, synthesised in code (`src/audio.js`), no audio files, except the crash song (`public/audio/crash_song.mp3`, owner-supplied, optional: `CRASH_SONG`).
- **Saves:** `localStorage` keys `shaheen.settings` (name, aircraft, mode, route,
  time of day, quality, volumes) and `shaheen.best` (best score per aircraft/route).
- **Platforms:** web first (desktop browsers; touch and gamepad also work). No back end.
- **Hosting:** Vercel static site, see `docs/DEPLOYMENT.md`.

## Commands

```
npm install        # once, or after package.json changes
npm run dev        # dev server, http://localhost:5173 (also on the LAN: --host)
npm run build      # static site in dist/
npm run preview    # serve dist/ locally
```

In dev mode `window.__shaheen` exposes `flight`, `renderer`, `hud`, `input` in the
browser console. F3 toggles the FPS counter.

## Project structure

```
index.html            page shell, loads src/main.js
vite.config.js        pins the root to the real path (Windows c:/C: double module load)
src/
  main.js             boot, game loop (fixed 120 Hz physics step + interpolation), mode switching
  input.js            keyboard / gamepad / touch -> actions; KEY_HELP list (controls source of truth)
  audio.js            Web Audio synth: engine per aircraft, wind, warnings, thumps, explosions
  data/aircraft.js    AIRCRAFT: every per-aircraft number (COMMON defaults + overrides)
  data/world.js       BASES, FERRY_LAYOUT, ROUTES, THEMES (scenery colours), TIMES (dawn/day/dusk/night)
  sim/aircraft.js     flight model (lift, drag, stall, flaps, gear, ground roll, G)  [no DOM]
  sim/flight.js       one flight: world layout, mission rules, landing judge, grades,
                      score, refuelling, weapons, instructor lines             [no DOM]
  render/assets.js    loads the sprites in public/sprites
  render/scenery.js   builds scenery tiles (mountains, hills, trees, ground, city, sea)
  render/renderer.js  camera, world, bases, aircraft layers, lights, weapons, effects
  render/particles.js smoke, dust, sparks
  ui/hud.js           HUD: radar, instructor box, weapon card, height callouts, touch controls
  ui/cockpit.js       instrument panel, one look per aircraft (cockpitStyle)
  ui/weapon_aids.js   bomb sight (guided) and release cue (unguided)
  ui/screens.js       start menu, pause, result screen, settings/best-score storage
  style.css
public/               copied as-is: sprites/*.png, fonts/ChakraPetch-SemiBold.ttf (+ OFL licence)
tools/                Python sprite tools (see AIRCRAFT.md)
docs/                 design docs and these notes (not part of the build)
```

Rule: `src/sim` and `src/data` never touch the DOM, so they run in Node for tests.

## Godot to JS map

| Godot (old) | JavaScript (now) |
|---|---|
| `data/aircraft/*.tres`, `scripts/data/aircraft_data.gd` | `src/data/aircraft.js` (snake_case fields became camelCase, e.g. `stall_kt` -> `stallKt`) |
| `data/bases/*.tres`, `base.gd` | `src/data/world.js`, `src/render/scenery.js` (`buildBase`), `src/render/renderer.js` |
| `scenes/world/landmarks.gd` | `src/render/landmarks.js` |
| `scenes/world/crash_effect.gd`, crash shards in `aircraft.gd` | `src/render/renderer.js` (`crashFx`, `CRASH`) |
| `scenes/aircraft/aircraft.gd` | `src/sim/aircraft.js` |
| `scenes/flight/flight.gd`, `strike_mission.gd`, `scripts/flight_phase.gd` | `src/sim/flight.js` |
| `scenes/world/bomb.gd`, `missile.gd`, `ground_target.gd` | `src/sim/flight.js` (weapons) + `src/render/renderer.js` |
| `scenes/flight/follow_camera.gd` | `Renderer` camera in `src/render/renderer.js` |
| `scenes/ui/instrument_panel.gd` | `src/ui/cockpit.js` (three styles, static layer drawn once) |
| `scenes/ui/bomb_sight.gd`, `release_cue.gd` | `src/ui/weapon_aids.js` |
| `scenes/ui/hud.gd`, `radar.gd`, `message_box.gd` | `src/ui/hud.js` |
| `main_menu.gd`, `pause_menu.gd`, `result_screen.gd`, `GameState` | `src/ui/screens.js`, `src/main.js` |
| `scripts/sound_synth.gd`, `aircraft_audio.gd` | `src/audio.js` |
| Input Map in `project.godot` | `src/input.js` |
| `assets/sprites/`, `assets/fonts/` | `public/sprites/`, `public/fonts/` (same files, byte-identical) |
| `deploy.bat` (Godot export) | `deploy.bat` (npm build + Vercel) |

Not ported yet (TODO in ROADMAP 2.8): instructor portrait, cadet name plate, F1 debug label.

## Units and drawing

- Physics in SI (m, m/s, kg, N); knots/feet only for display and data (`KT`, `FT` in `sim/aircraft.js`).
- Screen scale: `v.S = (viewport height / 720) * 7.2 * zoom` px per metre, so the
  view shows the same amount of world at any window size. (Godot used a fixed 4 px/m
  on a 640x360 viewport.)
- Aircraft origin = **main wheel** contact point: `pivot` in the aircraft data, in
  sprite texture px (Mushshak 172, F-16A 202, same numbers as the old `sprite_main_wheel_x`).
  Sprite texture px are `texM` = 1/16 m (art drawn about 2x true size so it reads well).
- Smooth motion: physics steps at a fixed 1/120 s (`STEP` in `main.js`); each frame
  draws the aircraft interpolated between the last two steps (`Flight.renderState(alpha)`).
- Resolution: full window resolution times `devicePixelRatio`, capped by the
  quality setting (high 2, medium 1.5, low 1). No more 640x360 pixel scaling (owner
  accepted this with the port). Aircraft sprites are the same PNGs as before.

## Performance rules

The Godot lessons still hold in a new form (Godot measurements: redrawing static
scenery every frame took the browser build from ~60 to ~20-28 fps; per-frame
redraw of the analog panel cost ~1.1 ms of a 2.8 ms frame; bomb impact prediction
had to be made cheaper):

- **Static scenery is drawn once into offscreen canvases** (`buildLayer` /
  `buildGround` in `scenery.js`, built in `Renderer.setupWorld` per theme and time
  of day). Each frame only `drawImage`s those tiles. Never rebuild tiles per frame.
- Per frame, draw only moving or changing parts (aircraft, lights, particles,
  weapons, HUD numbers).
- HUD: update DOM text/styles only when the value changes; don't rebuild HTML per frame.
- Keep impact prediction (`predictImpact`) coarse-stepped; don't run it many times a frame.
- Check FPS with F3 in a production build (`npm run build && npm run preview`),
  in Chrome, before and after adding scenery.

## Testing

- **Build check:** `npm run build` must finish without errors.
- **Headless sim tests:** Node scripts (in the scratchpad, not the repo) can import
  `src/sim/flight.js` directly with `await import('file:///<project>/src/sim/flight.js')`,
  create `new Flight({ aircraftId, mode: 'ferry', dest: 'masroor', name })`, call
  `flight.action('engine')`, then `flight.step(1/120, { throttle, pitch, brake, throttleSet: null })`
  in a loop and read `flight.ac` (`pos`, `vel`, `onGround`, `crashed`) and `flight.result`.
  Clear `flight.fx` each step. Checked 2026-11-19: all four aircraft take off and climb.
- **Visual check:** `npm run dev` and play in the browser; nothing renders headless.

## Git

- This folder is its own repo (branch `main`). Small commits per step. **Always ask
  the owner before pushing.** Remote `origin` = https://github.com/rohailnajmi007/Shaheen.git.
- `node_modules/`, `dist/`, `.vercel/`, `.env.local` are git-ignored.

## Sprite tools

`tools/make_aircraft_sprites.py` and `tools/make_badge.py` (Python 3 + Pillow) cut
the owner's reference art in `docs/reference/` into the layered sprites in
`public/sprites/` and print the texture positions to copy into
`src/data/aircraft.js`. Verified 2026-11-19: they regenerate the current sprites
byte for byte. Details in `AIRCRAFT.md`.
