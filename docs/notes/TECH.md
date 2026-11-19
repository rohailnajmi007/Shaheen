# Tech notes

Tools, project structure, rendering, performance, testing, git and deploy. Moved from CLAUDE.md "Working notes" (2026-11-18); keep up to date.

## Notes

- **Godot 4.7.2** installed via winget. Executables: `C:\Users\rohai\AppData\Local\Microsoft\WinGet\Links\godot.exe` (editor) and `godot_console.exe` (headless/CLI). Both are on the user PATH as `godot` / `godot_console` (VS Code must be restarted to see it).
  - Open the editor: `godot -e` from the project root. Run the game: F5.
  - Headless checks: `godot_console --headless --path . --import` then `godot_console --headless --path . --quit-after 120`. Throwaway test scripts (`extends SceneTree`) go in the scratchpad, run with `-s <script>`.
- **Performance (owner reported heavy lag in the browser, 2026-11-17):** the cause was redrawing static scenery every frame (desktop flight ran at only ~28 fps uncapped; web GDScript is several times slower). Rules now: **never `queue_redraw()` static scenery every frame.** Parallax bands redraw only when their tile window, colour or height changes, and send each band as ONE `RenderingServer.canvas_item_add_triangle_array` (shapes pre-triangulated in `_tris`) instead of one draw call per cloud puff/tree. Bases draw once; the windsock and tower beacon live on a small child layer (`_anim`) that redraws per frame. Landmarks draw once (night: 6-7 redraws/s for beacons). Runway night lights 15/s, stars 10/s. Measured uncapped on the dev PC: takeoff 28 → ~310-350 fps, night 20 → ~200 fps, draw calls ~885 → ~120. Re-measure with a vsync-off windowed test script if adding scenery.
- **Performance, second pass (owner: live build lagging, 2026-11-18):** measured in Chrome on the dev PC with a temporary probe build (scripted flights reporting frame times to a local server). Sound made no difference. Two costs found: (1) the **analog instrument panel** (Mushshak, Mirage) redrew every dial face, tick and label every frame: ~1.1 ms of a 2.8 ms desktop frame. Now `instrument_panel.gd` draws everything static once on a child layer behind it (`_static`, show_behind_parent; redrawn only when the aircraft or size changes) and redraws only needles, readouts, tapes, lever, fuel bar and lamps; helpers draw on `_ci` (the layer being drawn). Pixel-identical, ~0.15 ms. (2) **Air-to-ground impact prediction** (bomb sight, release cue, guided bombs, target claiming) simulated whole bomb falls several times a frame: now 0.1 s midpoint steps (more accurate, ~3x cheaper) and each falling bomb keeps its `predicted_x`. Chrome, Mirage bombing: 54.7 -> 58.2 fps, frames over 20 ms 21% -> 12%, worst 49 -> 38 ms. Rule: anything drawn per frame must be only the moving parts; keep static drawing on a layer drawn once.
- **Web deploy:** live at **https://shaheen-green.vercel.app** (Vercel project `shaheen`, owner's account). `export_presets.cfg` "Web" preset (threads off, `build/web/index.html`); `deploy.bat` exports headless, deletes `build/web/.env.local` (token written by `vercel link`, must never be uploaded) and runs `vercel deploy build/web --prod --yes`. Web templates installed (`web_nothreads_*.zip` extracted from the official 4.7.2 archive because the editor download stalled). Vercel CLI 65 logged in. Deploying publishes publicly: only when the owner asks.
- **Sound (chunk 2.1):** no audio files. `scripts/sound_synth.gd` (`SoundSynth`) synthesises short mono 16-bit `AudioStreamWAV` buffers at 22,050 Hz and caches them in a static dictionary (built once per session, ~135 ms on the dev PC; slower in the browser). Loops are seamless (tones fit whole cycles, noise is cross-faded), so `AircraftAudio` (`scenes/aircraft/aircraft_audio.gd`, added by `flight.gd`) only varies `volume_db` and `pitch_scale` each frame and stops silent loops. Per-aircraft engine sound in AircraftData "Sound" (`engine_sound` Piston/Jet, pitch idle/full, volume, idle drop, afterburner volume); wind, rumble, warnings, touchdown and crash levels are exports on AircraftAudio. Events: `Aircraft.touched_down`, `Aircraft.wrecked(severity)`; GEAR warning logic is `Aircraft.gear_warning` (shared with the panel lamp). Buses (chunk 2.2, `default_bus_layout.tres`): engine, roar and afterburner on "Engine", everything else on "Effects", both into "Master"; GameState sets the bus volumes from the saved options. Test scripts run with `-s` can't use typed `Aircraft`/`GameState` references (they compile before autoloads): keep test code untyped and load scenes at runtime.
- **Git:** this folder is its own repo (branch `main`). Small commits per step. **Always ask the owner before pushing.** Remote `origin` = https://github.com/rohailnajmi007/Shaheen.git (added 2026-11-17).
- **Controls** (owner's layout, source of truth is the Input Map in `project.godot`): ↑/↓ throttle (hold), ← pitch nose up, → pitch nose down, E engine, F flaps, G gear, B brake (ground and air), T fuel truck (refuelling stop), Space drop bomb (air-to-ground mission), Esc pause, R restart.
- **Data files:** the Godot editor drops .tres values equal to the script defaults when it re-saves a resource. Keep `super_mushshak.tres` explicit (restore from git if it gets stripped) so the Mushshak's numbers don't silently change when a script default changes.
- **Smooth motion:** the aircraft remembers its transform at the last two physics ticks and each rendered frame draws it in between (`_sync_node`, `_process`, `Engine.get_physics_interpolation_fraction()`), so it doesn't judder on screens faster than 60 Hz. The camera (`follow_camera.gd`) runs every frame after the aircraft (process_priority aircraft -10, camera -5, scenery 0), is locked horizontally to the plane and eases only the look-ahead and the height (Godot's own position smoothing is off).
- **Rendering:** stretch mode is `canvas_items` (layout is 640x360, but sprites/text render at window resolution, 2x at 1280x720), integer scaling. Cleaner rotation and text than `viewport` mode. Base buildings: `building_scale` = 1.
- **Testing note:** screenshot test scripts must run windowed (`godot_console --path . -s ...`), headless can't read the viewport. After teleporting the plane in a test (setting `pos_m`), call `aircraft._sync_node(true)` and `camera.snap()`, or the shot shows the camera still catching up.
- **Units:** physics in SI; drawing at 4 px/m (`scripts/world_scale.gd`). Aircraft node origin = **main wheel** contact point (`sprite_main_wheel_x`: F-16 202, Mushshak 172), so on the takeoff roll the aircraft pivots on its main wheels and only the nose wheel lifts; nose points +x. Altitude A m is drawn at y = -A × 4.
- **Layout conventions:** scene scripts live next to their `.tscn`; shared/global scripts in `scripts/`; Resource classes (`AircraftData`, later `BaseData`) in `scripts/data/`; `.tres` data in `data/`. `docs/` has a `.gdignore` so Godot doesn't import it.

## Tech stack (original CLAUDE.md text)

- **Engine:** Godot 4 (latest stable 4.x release).
- **Language:** GDScript only. Godot 4 can't export C# projects to the web, and the web build is how we share the game.
- **Renderer:** Compatibility (OpenGL / WebGL 2). Required for reliable web export and older phones.
- **Platforms:** Web (HTML5) first. Windows desktop as a secondary export. Android later.
- **Back end:** none for now. Saves are local (Godot `user://`, which maps to browser storage on web). Cloud saves and leaderboards come much later (likely Supabase or Firebase).
- **Hosting:** Vercel, as a static site serving the Godot web export (see `docs/DEPLOYMENT.md`). No other hosts for now.


## Suggested project structure

```
res://
  project.godot
  scenes/
    main.tscn              # entry point
    flight/flight.tscn     # one flight: world + aircraft + HUD
    aircraft/aircraft.tscn
    world/runway.tscn, base.tscn, parallax_bg.tscn
    ui/hud.tscn, result_screen.tscn, main_menu.tscn
  scripts/                 # or keep scripts next to their scenes
  data/
    aircraft/*.tres        # AircraftData resources
    bases/*.tres           # BaseData resources
  assets/
    sprites/ fonts/ audio/
docs/
```
