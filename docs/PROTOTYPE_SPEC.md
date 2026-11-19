# Prototype Spec (Phase 1)

**Goal:** prove the core is fun: a plane in side view that you can start, take off, fly, and land on a second runway, with controls that feel good. Then put it in a browser so friends can try it.

Everything else (career, money, menus beyond the basics, many bases, weather, weapons) is **out of scope** for this phase.

## Scope

### In
- 2 aircraft, both defined as data (`AircraftData` resource):
  - **Super Mushshak** (slow, forgiving trainer). Built first. Livery reference for later art: `docs/reference/super_mushshak_livery_reference.png` (white body, red and blue cheat-line stripes, red wing top and tail band, Pakistan flag on the fin, serial number on the fuselage).
  - **F-16** (fast, powerful, higher stall and landing speed)
  - The point of having two is to prove that different numbers give a clearly different feel.
- 2 bases, both defined as data (`BaseData` resource), e.g. **Risalpur** (departure) and **Peshawar** (destination):
  - Runway (length, position), a hangar, a control tower, a windsock. Placeholder art is fine.
  - Different background tint or colour so you can tell them apart.
- One flat-ish ground line between them with parallax background layers (sky, far mountains, near trees).
- A very simple start screen: enter your name (shown in game as "AVN CDT <NAME>", Aviation Cadet), pick an aircraft → Fly.
- HUD and a landing result screen.
- Web export that runs in a browser.

### Out (later phases)
Career and pay, unlocks, mission planner, weapons, weather, night, emergencies, sound beyond a basic engine hum (optional), mobile touch controls, saving, back end.

## Technical setup

- Godot 4 (latest stable), GDScript, **Compatibility** renderer.
- Viewport 640×360, stretch mode `viewport`, aspect `keep`, scale mode `integer`, default texture filter `Nearest`.
- Window size for desktop testing: 1280×720 (2× scale).
- Input actions defined in Project Settings → Input Map (owner's key layout):
  `throttle_up` ↑, `throttle_down` ↓, `pitch_up` ←, `pitch_down` →, `engine_toggle` E, `flaps_cycle` F, `gear_toggle` G, `brake` B (wheel brakes on the ground, air brake in the air), `pause` Esc, `restart` R.

## Aircraft data (`AircraftData` resource, all exported)

Suggested fields (Claude Code may refine them):
- `display_name`
- `mass`
- `max_thrust`
- `drag_coefficient` (base drag)
- `lift_coefficient`
- `stall_speed`, `rotate_speed` (speed to lift the nose), `max_speed`
- `pitch_rate` (deg/s), max pitch up/down
- `flap_lift_bonus` per setting, `flap_drag` per setting, `gear_drag`
- `fuel_capacity`, `fuel_burn_at_full_throttle`
- `brake_strength`, `ground_friction`
- `safe_touchdown_vspeed` (m/s): limits for Perfect / Firm / Hard / Crash
- `sprite` (texture) and size

Starting values are guesses. They must be easy to tune in the editor.

## Flight model (arcade, custom, not RigidBody)

Use a `CharacterBody2D` (or `Node2D` with manual movement) updated in `_physics_process`:
- State: position, velocity (Vector2), pitch angle, throttle (0–1), flap setting (0/1/2), gear down (bool), engine on (bool), fuel, on_ground (bool).
- **Thrust** along the nose direction × throttle (zero if the engine is off or fuel is empty).
- **Drag** opposite to velocity ∝ speed² × (base + flaps + gear).
- **Lift** perpendicular to velocity ∝ speed² × lift coefficient × (1 + flap bonus). It drops off sharply below stall speed or at very high pitch versus the flight path (stall).
- **Gravity** down.
- **On the ground:** wheels on the ground line, friction plus brakes. The nose can only rise once speed ≥ `rotate_speed`. Leaves the ground when lift > weight.
- **Stall:** nose drops automatically and the HUD shows a STALL warning.
- **Pitch input** rotates the nose at `pitch_rate`. Use slight smoothing so it doesn't feel jerky (the main complaint about TU-95's controls).
- Units: physics runs in SI (m, m/s, kg, N). Drawing uses **4 px per metre** (`WorldScale.PX_PER_M` in `scripts/world_scale.gd`): Super Mushshak ≈ 28 px long, F-16 ≈ 60 px. HUD shows knots and feet.

## World layout

- **Risalpur is the starting point** (PAF Academy Asghar Khan), Peshawar the destination; `route_distance_m` = 5,000 m on the flight scene (owner shortened it from 9 km).
- Departure runway on the left, destination runway several km to the right (compressed so a flight takes ~2–3 minutes in the trainer). Distance comes from data.
- Ground: flat line at y = 0 with slight cosmetic undulation between bases (no collision complexity yet). Flying into the ground away from a runway = crash.
- Ceiling: soft limit (e.g. thin air reduces thrust above X) so the player can't fly to infinity.
- Camera: follows the plane with look-ahead to the right. Zoom stays fixed (pixel art).
- Parallax layers scroll at different speeds.
- Optional: a small minimap or distance bar showing progress between the two bases.

## HUD / cockpit layout

Follow the layout in `CLAUDE.md` and `reference/tu95_layout_reference.png`: similar arrangement, our own art. Placeholder art is fine, but put elements in the right places and at the right sizes from the start.

**Top-left: instrument panel** (grey metal panel, pixel art):
- Analog round gauges with moving needles: **airspeed** (kt), **altimeter** (ft), **vertical speed** (ft/min). Needle ranges come from aircraft data (an F-16 airspeed gauge goes much higher than a Mushshak's).
- Throttle lever graphic (or bar) showing throttle %, plus a small fuel gauge.
- Indicator lights or labels: Flaps UP / TO / LDG, Gear DOWN (green) / UP (off) / in transit (amber), Engine ON/OFF.
- Warning lights: STALL, GEAR (low and slow with gear up), LOW FUEL.

**Layout change (owner):** instructor box top-left, radar top-centre, instrument panel top-right (the plane flies on the left side and was hidden behind the panel). Bottom-left: PAF pilot wings badge above "AVN CDT <NAME>".

**Top-centre: positional radar** (changed after chunk 1.8, owner request): an amber side-view map of the whole route showing both bases (runway, tower, hangar), the ground and the plane as a blip at its real distance and altitude (auto altitude range, sweep line). Under it: the current phase (TAKE OFF, CLIMB, CRUISE, DESCENT, APPROACH, LANDED, worked out from altitude, vertical speed and distance to the destination), km to go and progress segments.

**Cockpit panel per aircraft:** the Super Mushshak keeps the grey analog panel; the F-16 has a dark glass cockpit (green speed and altitude tapes, Mach, G, vertical speed bar, three gear lights). Chosen by `AircraftData.cockpit_style`.

**Top-right: instructor message box**: placeholder portrait plus short messages triggered by events: start-up hint, "rotate now", "gear up", "you're approaching Peshawar, gear down, flaps LDG", landing result. Keep the messages simple; this is mainly so friends can play without being told the controls.

Also: a small distance-to-destination readout somewhere unobtrusive, and a one-line key list visible on the start screen.

## Landing and results

- Touchdown is detected when wheels contact the destination runway.
- Graded on vertical speed at touchdown, gear state, pitch (no nose-first landings), and whether you're on the runway.
- After touchdown the player brakes to a stop. Rolling off the runway end = overrun (penalty or crash).
- Result screen: grade (Perfect / Good / Firm / Hard / Crash), touchdown vertical speed, flight time, fuel used. Buttons: Retry, Change aircraft.
- Landing back at the departure runway (or anywhere else) counts as "wrong base" (no crash, just not a success).

## Chunks for this phase

Do these one at a time and stop after each for testing:

1. **Project setup**: Godot project, settings above, folder structure, input map, git init, an empty main scene that runs.
2. **Plane on a runway**: placeholder plane sprite on a ground line, throttle and brakes, rolls along the runway, camera follows (zoomed out, plane small on screen). Temporary debug text for speed and throttle is fine.
3. **Takeoff and flight**: lift, pitch, stall, gravity, drag. You can take off, climb, level off, and descend.
4. **Flaps, gear, engine, fuel**: their effects on lift and drag.
5. **Cockpit HUD layout**: instrument panel with analog gauges (top-left), phase box (top-centre), instructor message box (top-right), as in the reference screenshot. Replaces the debug text.
6. **Two bases and scenery**: `BaseData`, destination runway, big base buildings (hangars, admin block, tower), windsock, parallax hills and clouds, distance indicator.
7. **Landing and results**: touchdown detection, grading, crash handling, result screen, retry.
8. **Second aircraft and start screen**: F-16 data, aircraft select, verify they feel different.
9. **Tuning pass and web deploy**: tune the numbers for feel, export to web, deploy to Vercel (see `DEPLOYMENT.md`).

## Done when

A friend can open a link in their browser, pick the Super Mushshak or the F-16, take off from Risalpur, fly to Peshawar, land, and see a landing grade, without needing the controls explained beyond a one-line key list on screen.
