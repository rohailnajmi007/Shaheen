# Shaheen (JavaScript)

A side-view flight game in the browser, based on the Godot project
[rohailnajmi007/Shaheen](https://github.com/rohailnajmi007/Shaheen).
Take off from Risalpur, fly to a PAF base, land and stop. Or fly a strike
mission: hit ground targets, then land at the base that appears.

## Run

```
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## What is new compared to the Godot version

- Full-resolution graphics (no 640x360 pixel scaling), sharp on any screen.
- Four times of day: dawn, day, dusk, night.
- Camera zooms out with speed; the bomb run zooms out to show the ground.
- Height callouts on final (100 ... 10 FLARE).
- Air to air: a 1 v 1 guns-only dogfight against one bandit, both jets kept on screen.
- Glide-path lights (PAPI) at the destination runway.
- One-page start menu, score and best score per aircraft and route.
- Touch controls on phones, gamepad support.
- Sound made in code (Web Audio).

## Code map

- `src/sim/aircraft.js` flight model (ported from `aircraft.gd`)
- `src/sim/flight.js` mission rules, landing grades, weapons, instructor
- `src/render/` canvas drawing: cached scenery tiles, particles, aircraft
- `src/ui/` HTML cockpit display, menus
- `src/data/` aircraft numbers, bases, themes, times of day

Aircraft art in `public/sprites/` comes from the original project.

## Docs

- `CLAUDE.md`: project rules and conventions (start here).
- `docs/GAME_DESIGN.md`, `docs/ROADMAP.md`, `docs/PROTOTYPE_SPEC.md`: vision, plan, current milestone.
- `docs/DEPLOYMENT.md`: publishing to Vercel (`deploy.bat`).
- `docs/notes/`: detailed notes per area; `docs/notes/TECH.md` maps the old Godot files to this code.
- `tools/`: Python scripts that build `public/sprites/` from the art in `docs/reference/`.

The original Godot version is kept in git as tag `godot-final`.
