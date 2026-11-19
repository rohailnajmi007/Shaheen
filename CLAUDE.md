# Project Shaheen (working title)

2D side-view pixel-art flight game around the Pakistan Air Force: fly real PAF
aircraft between named PAF bases (start up, take off, fly, land). Inspired by
TU-95 (lo-fi "fly A to B", but much less clunky) and Air Offense Command (side
view, plane flies right over a scrolling landscape; its ground attack comes later).

Read before working: `docs/GAME_DESIGN.md` (long-term vision, NOT a to-do list),
`docs/ROADMAP.md` (phased chunks), `docs/PROTOTYPE_SPEC.md` (current milestone),
`docs/DEPLOYMENT.md`.

## Current focus: prototype only
Career, money, unlocks, mission planner, weapons, weather, mobile, back end are
out of scope until the owner says otherwise.

## How we work
- One roadmap chunk (or owner request) at a time. Nothing from later phases
  "while you're at it": leave a TODO in the roadmap.
- End of each chunk: summarise, say how to test (keys, what should happen), stop.
- Keep the game runnable in Godot at every step.
- Feel over realism: arcade flight model, believable but fun and readable.
- Data-driven: aircraft and bases are `.tres` resources, not hard-coded.
- Every tunable number is exposed (`@export` or resource field).
- Git: small commits per step; **always ask before pushing**. Remote `origin` =
  github.com/rohailnajmi007/Shaheen, branch `main`.
- **Deploy (Vercel) only when the owner asks**: it publishes publicly.
- Update `docs/ROADMAP.md` when a chunk or request is done, and the matching
  `docs/notes/*.md` file when a decision there changes.

## Tech
- Godot 4.7.2, GDScript only, Compatibility renderer, web first (Vercel,
  https://shaheen-green.vercel.app), Windows second. No back end.
- Executables: `godot` (editor, `godot -e`) and `godot_console` (CLI) under
  `C:\Users\rohai\AppData\Local\Microsoft\WinGet\Links\`.
- Headless check: `godot_console --headless --path . --import`, then
  `--headless --path . --quit-after 120`. Test scripts (`extends SceneTree`) go in
  the scratchpad, run with `-s`; screenshots need a window (not headless).
  Details: `docs/notes/TECH.md`.

## Rules that bite often
- **Never `queue_redraw()` static scenery every frame** (web lag). See TECH.md.
- The editor strips `.tres` values equal to script defaults when re-saving: keep
  aircraft `.tres` explicit; restore from git if stripped.
- Units: physics SI, drawing 4 px/m (`scripts/world_scale.gd`); altitude A m is
  drawn at y = -A*4. Aircraft origin = main wheel contact point.
- Layout: scene scripts next to their `.tscn`; shared scripts in `scripts/`;
  Resource classes in `scripts/data/`; data in `data/`. `docs/` is `.gdignore`d.
- Controls (source of truth: Input Map): Up/Down throttle (hold), Left nose up,
  Right nose down, E engine, F flaps, G gear, B brake, T fuel truck, Space drop
  bomb (air-to-ground mission), Esc pause,
  R restart, F1 debug.
- Instructor lines: aggressive, short shouted English, occasional censored curse
  (d*mn, h*ll, sh*tting, f*ck), nothing corny, under ~110 characters.
- Ranks: Mushshak AVN CDT, F-16A/D SQN LDR, Mirage V FLT LT.

## Visual style
640x360 base viewport, stretch `canvas_items`, integer scaling, nearest filter
(aircraft sprites use linear + mipmaps). Side view, plane flies left to right,
camera follows with look-ahead, parallax layers. Stylised bases, never real
layouts or satellite imagery. Placeholders at final size. Chakra Petch SemiBold
font, smoothed (sizes 8 or 16; owner wanted clearer text than the old pixel font).

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
  instructor portrait, result screen, GameState
- `docs/notes/COMBAT.md`: air-to-ground mission, bombs, targets, bomb sight
- `docs/notes/TECH.md`: project structure, rendering, smooth motion,
  performance rules and measurements, testing recipes, web deploy
