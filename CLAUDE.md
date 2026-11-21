# Project Shaheen (working title)

2D side-view flight game around the Pakistan Air Force: fly real PAF
aircraft between named PAF bases (start up, take off, fly, land). Inspired by
TU-95 (lo-fi "fly A to B", but much less clunky) and Air Offense Command (side
view, plane flies right over a scrolling landscape; its ground attack comes later).

Read before working: `docs/GAME_DESIGN.md` (long-term vision, NOT a to-do list),
`docs/ROADMAP.md` (phased chunks), `docs/PROTOTYPE_SPEC.md` (current milestone),
`docs/DEPLOYMENT.md`.

**The game is now JavaScript** (ported from Godot in 2026-11, PR #1; the Godot
version is tag `godot-final`). Older notes still name Godot files: the behaviour
still applies; `docs/notes/TECH.md` "Godot to JS map" says where it lives now.

## Current focus: prototype only
Career, money, unlocks, mission planner, weapons, weather, mobile, back end are
out of scope until the owner says otherwise.

## How we work
- One roadmap chunk (or owner request) at a time. Nothing from later phases
  "while you're at it": leave a TODO in the roadmap.
- End of each chunk: summarise, say how to test (keys, what should happen), stop.
- Keep the game runnable (`npm run dev`, `npm run build` clean) at every step.
- Feel over realism: arcade flight model, believable but fun and readable.
- Data-driven: aircraft in `src/data/aircraft.js` (air-to-air opponents in `src/data/opponents.js`), bases/routes/themes/times of
  day in `src/data/world.js`, not hard-coded in sim or render code.
- Every tunable number is exposed: a data field, or a named constant at the top
  of its module.
- Git: small commits per step; **always ask before pushing**. Remote `origin` =
  github.com/rohailnajmi007/Shaheen, branch `main`.
- **Deploy (Vercel) only when the owner asks**: it publishes publicly.
- Update `docs/ROADMAP.md` when a chunk or request is done, and the matching
  `docs/notes/*.md` file when a decision there changes.

## Tech
- JavaScript (ES modules), Vite 7, Canvas 2D for the world, HTML/CSS for HUD and
  menus, Web Audio for sound. Web first (Vercel, https://shaheen-green.vercel.app).
  No back end; saves in `localStorage`.
- `npm install`, `npm run dev` (http://localhost:5173), `npm run build` (-> `dist/`).
- Checks: `npm run build` must be clean. Headless sim tests: Node scripts in the
  scratchpad importing `src/sim/flight.js` (no DOM there). Visual checks need the
  browser. Details: `docs/notes/TECH.md`.

## Rules that bite often
- **Never rebuild static scenery every frame** (web lag). Scenery is drawn once
  into offscreen canvas tiles; frames only `drawImage` them and draw moving parts.
- `src/sim/` and `src/data/` must not touch the DOM (they run in Node for tests).
- Aircraft look must not change by accident: sprites in `public/sprites/` come
  from `tools/make_aircraft_sprites.py` / `tools/make_badge.py` (owner's art in
  `docs/reference/`); sprite positions (`pivot`, `gearTravel`, `lights`, ...) in
  `src/data/aircraft.js` are texture px.
- Units: physics SI; screen scale `v.S` px/m = viewport height / 720 * 7.2 * zoom.
  Aircraft origin = main wheel contact point (`pivot`).
- Layout: `src/sim` (physics, rules), `src/render` (canvas), `src/ui` (HTML HUD,
  menus), `src/data` (numbers), `public/` (static files), `tools/` (Python art
  tools), `docs/` (not part of the build).
- Controls (source of truth: `src/input.js`): Up/Down throttle (hold), Left nose
  up, Right nose down (WASD too), E engine, G gear (flaps follow the gear
  automatically: no flap key), B brake, Space fire weapon, V gun (hold),
  X flares/chaff, E eject (once shot down) (air-to-ground mission), Z zoom, H help, M mute,
  Esc/P pause, R restart, F3 FPS. (Old F1 debug label: not ported yet.)
- Instructor (2026-11-20: full coaching for the trainer, urgent lines only for fighters). Lines: aggressive, short shouted English, occasional censored curse
  (d*mn, h*ll, sh*tting, f*ck), nothing corny, under ~110 characters.
- Ranks (owner, 2026-11-19): Mushshak AVN CDT, Mirage V FLT LT (F-7PG FLT LT: my pick), JF-17 SQN LDR,
  F-16A/D WG CDR (J-10C WG CDR: my pick, owner to confirm). Name-tag crescent: white FLT LT (and cadet), blue SQN LDR, red WG CDR.
- Home bases (start of every flight): Mushshak Risalpur, Mirage V, F-16s and J-10C
  Mushaf (Sargodha), F-7PG Mushaf (my pick), JF-17 Masroor (Karachi). `homeBase` in `src/data/aircraft.js`.

## Visual style
Side view, plane flies left to right, camera follows with look-ahead and zooms out
with speed and on bomb runs, parallax layers, four times of day. Renders at full
window resolution (the port dropped the old 640x360 pixel scaling; owner accepted).
Aircraft are the owner's sprite art, unchanged from the Godot version. Stylised
bases, never real layouts or satellite imagery. Placeholders at final size.
Chakra Petch SemiBold font.

## Content and sensitivity
Real PAF base and aircraft names; scenery stylised and invented, no sensitive
detail. Use a stylised placeholder roundel; the real PAF emblem may need ISPR/PAF
permission (owner decides later).

## Detailed notes (read the one for the area you're touching)
- `docs/notes/FLIGHT_MODEL.md`: lift/drag/stall, flaps, takeoff and landing roll,
  tail strikes, bounce, landing judge and grades, crashes, G effects, measured numbers
- `docs/notes/AIRCRAFT.md`: aircraft list and order, per-aircraft data and art,
  sprite tool, gear/tailplane layers, cockpit styles, lights
- `docs/notes/WORLD.md`: shared world and bases, Masroor/Mushaf scenery,
  refuelling stop, parked aircraft, landmarks, night mode, camera framing
- `docs/notes/UI.md`: start screen steps, HUD layout and parts, radar,
  instructor portrait, result screen, saves
- `docs/notes/COMBAT.md`: air-to-ground mission, bombs, targets, bomb sight
- `docs/notes/TECH.md`: stack, project structure, Godot to JS map, rendering,
  performance rules, testing recipes, git, sprite tools
