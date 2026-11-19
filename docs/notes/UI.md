# UI notes

> **JavaScript port (2026-11-19):** written for the Godot version, so file names below (`.gd`, `.tres`, `res://`) are the old ones. The behaviour and numbers still apply. Now: HUD in `src/ui/hud.js`, menus/pause/result and saves (`localStorage`) in `src/ui/screens.js`. The port changed the look: one-page start menu, full-resolution HTML HUD instead of the 640x360 pixel panels; per-aircraft instrument panels restored (`src/ui/cockpit.js`); instructor portrait, cadet name plate and F1 debug label not ported yet (ROADMAP 2.8). Full map: `TECH.md` "Godot to JS map".

Start screen, HUD, instructor, result screen, GameState, and the visual/layout intent. Moved from CLAUDE.md "Working notes" (2026-11-18); keep up to date.

## Notes

- **Start screen backdrop:** `scenes/ui/menu_backdrop.gd` (golden-hour PAF airfield: sky, sun, mountains, hills, trees, tower, waving Pakistan flag, two shelters with a parked JF-17 and F-16, a K-8, runway; drifting clouds in two open sky lanes so they never pass behind the UI; a Mirage + two F-16 formation crossing the top every 9 s). Static parts on one layer drawn once; only clouds/flag/formation redraw. Subtitle and route line removed from the start screen (owner).
- **Instructor reacts** to gear/flap changes immediately (`hud.gd::_react_to_controls`), with different advice in the climb vs on approach.
- **HUD layout (current):** MessageBox top-left (4..216), Radar top-centre (222..366), InstrumentPanel top-right (370..636), `CadetBadge` under the instructor box at (4, 70) (moved from bottom-left because it hid the plane; `cadet_badge.gd`: compact horizontal plate, PAF pilot wings | gold rank over the white name, thin gold border; badge sprite `assets/sprites/paf_pilot_wings.png` built by `python tools/make_badge.py` from the owner's `docs/reference/paf_pilot_wings_source.png`).
- **HUD (chunk 1.5, `scenes/ui/`):** `hud.tscn` (CanvasLayer) holds `InstrumentPanel` (gauges, throttle, fuel, lights, warnings), `Radar` (`radar.gd`, top-centre: side-view route map with bases + plane blip, phase, km to go, progress segments; phase logic in `scripts/flight_phase.gd`; replaced the old PhaseBox attitude diagram and RouteBar at the owner's request), `MessageBox` (instructor portrait + typewriter text with a queue; `say(text, urgent)`), and a hidden `DebugLabel` toggled with **F1**. All of it is drawn in code as placeholder pixel art at final size. Instructor tutorial messages live in `hud.gd::_instructor()`. `flight.gd` calls `hud.setup(aircraft)`.
- **Font:** Chakra Petch SemiBold (SIL Open Font License, `assets/fonts/ChakraPetch-OFL.txt`, from Google Fonts), the project-wide UI font, imported with grayscale antialiasing and light hinting. Use sizes 8 or 16. Replaced the Silkscreen pixel font on 2026-11-18 (owner: text should be clearer and less pixelated); Pixelify Sans, Rajdhani and Share Tech Mono were also compared. Silkscreen files removed. Text now shows mixed case where the strings are mixed case (instructor lines).
- **Instructor:** placeholder portrait in `message_box.gd`: **black flying helmet with the sun visor down** (owner; eyes hidden, so no blink), green flight suit, PAF flag patch; mouth moves while text types.
- **Scene flow (as of chunk 1.7):** main scene = `scenes/ui/main_menu.tscn` (built in code in `main_menu.gd`; since 2026-11-18 in sequential steps, see the end of this note) → `scenes/flight/flight.tscn` (Sky gradient CanvasLayer, Mountains/Hills/Clouds/Trees parallax, Ground, DepartureBase, DestinationBase, Aircraft, Camera, HUD with Radar + CadetBadge, ResultScreen). R reloads the flight scene; MENU goes back to the start screen. `scenes/main.tscn` was removed. **Start screen (owner, 2026-11-18): sequential steps**, one per screen: START -> ENTER YOUR NAME -> CHOOSE YOUR AIRCRAFT (shows "rank name") -> CHOOSE YOUR ROUTE (RISALPUR > MASROOR / RISALPUR > MUSHAF) -> TIME OF DAY (DAY/NIGHT) -> FLY, with BACK/NEXT (Enter/Esc). `main_menu.gd` `Step` enum, one page per step; the title stays at the top, the selected card/route label turns gold. Backdrop clouds use one lane above the title.
- **Start screen, JS (owner 2026-11-19: one-page menu had too many options):** `src/ui/screens.js` `Menu` is sequential again: PILOT (name) -> AIRCRAFT -> MISSION (ferry / air to ground) -> ROUTE (ferry only, skipped and greyed in the progress row for air to ground) -> TIME OF DAY (summary "RANK NAME - aircraft - route", best score, FLY). Back/Next buttons, Enter = next/fly, Esc = back, left/right arrows change the choice, done steps in the progress row are clickable. Title is just SHAHEEN (owner: no "PAF Flight School"). Aircraft cards: name, role (Trainer / Strike fighter / Multirole fighter) and weapon (No weapons / Unguided bomb / Laser guided bomb / Air to ground missile); no descriptions (owner: no corny blurbs).
- **Instructor tone (owner):** aggressive, angry, hyper, short shouted lines, **English only** (owner removed the Urdu), with the occasional censored curse word (d*mn, h*ll, sh*tting, f*ck). Nothing corny. Lines live in `hud.gd` (`_instructor`, `_react_to_controls`, `_landing_checklist`, lift-off/touchdown) and `flight.gd` (bounce, wrong base, grades, crash). Keep each under ~110 characters so it fits the box.
- **GameState autoload** (`scripts/game_state.gd`): `pilot_name`, `night`, `pilot_title()` → "AVN CDT ALI" / "SQN LDR ALI", `pilot_call()` → "Avn Cdt Ali" / "Sqn Ldr Ali", `glow()`. In-memory only (no saving yet). Test scripts (`extends SceneTree`) can't use the `GameState` identifier directly; use `root.get_node("GameState")`.

## Project intro and inspiration (original CLAUDE.md text)

A 2D, side-view, pixel-art flight game centred on the **Pakistan Air Force (PAF)**. The player flies real PAF aircraft between named PAF bases: start the engine, take off, fly, and land at the destination. A career mode starts you in trainers; successful missions earn pay, which unlocks faster jets up to fighters like the JF-17 and F-16.

Inspiration:
- **TU-95** (browser game): a simple, charming, deliberately lo-fi "fly a big plane from A to B" game. We keep its indie, pixelated feel but make the controls **much less clunky** and add a lot more depth and options.
- **Air Offense Command** (Android): the plane is shown from the side and flies to the right across a scrolling landscape. We like its look and side-scrolling layout. Its ground-attack gameplay is a **later** feature, not part of the early builds.

Read these before doing any work:
- `docs/GAME_DESIGN.md`: the full vision (what the game becomes eventually)
- `docs/ROADMAP.md`: the phased plan, broken into small chunks
- `docs/PROTOTYPE_SPEC.md`: detailed spec for the **current** milestone (the prototype)
- `docs/DEPLOYMENT.md`: how builds are exported and shared


## Visual style rules

- Pixel art, low internal resolution: **640×360** base viewport (leaves room for the cockpit panel at the top), scaled up with integer scaling (2× = 1280×720, 3× = 1920×1080) and nearest-neighbour filtering (no blur).
  - Project Settings → Display → Window: viewport 640×360, stretch mode `viewport`, aspect `keep`, scale mode `integer`.
  - Rendering → Textures → Default texture filter: `Nearest`.
- Side view. The plane flies **left to right**. The camera follows the plane horizontally and vertically, with a little look-ahead in the direction of travel.
- Parallax background layers (sky gradient, distant mountains, mid hills, near trees and buildings) give a sense of speed and place.
- Each base has its own look (e.g. green Peshawar valley, Salt Range hills near Mianwali and Sargodha, coastal Karachi), but it's **stylised**: runway, hangars, control tower, landmarks. Never trace real base layouts or use satellite imagery.
- Until real art exists, use **simple placeholder shapes** (Polygon2D / ColorRect / tiny generated PNGs) at the correct final pixel size, so real sprites can be dropped in later without code changes.
- Pixel font for the HUD and menus.


## Screen layout (reference: `docs/reference/tu95_layout_reference.png`)

The reference screenshot is from TU-95. We want a **similar layout, not a copy**: our own art, aircraft and PAF setting.
**Current layout:** instructor message box top-left (small), positional radar top-centre (replaced the phase box), instrument panel top-right (one design per `cockpit_style`), cadet badge under the instructor box. Exact pixel ranges: "HUD layout" below.

Original reference layout (TU-95), kept for the intent; positions superseded by the swap:

- **Owner change (after chunk 1.8): the instrument panel and the instructor box are swapped.** The plane flies on the left of the screen and was hidden behind the tall panel when climbing, so now: instructor box top-left (small), radar top-centre, instrument panel top-right. The descriptions below are the original reference layout.
- **Top-left: cockpit instrument panel.** A grey metal panel with chunky pixel-art **analog round gauges** (airspeed, altimeter, vertical speed, engine/throttle). Above or beside them: throttle lever, flap and gear indicators, warning lights. It overlays the sky.
- **Top-centre: flight phase panel.** A small dark box showing the current phase (`TAKE OFF`, `CLIMB`, `CRUISE`, `DESCENT`, `APPROACH`, `LANDED`) with a tiny diagram of the plane's attitude or the phase.
- **Top-right: radio/instructor message box.** A pixel portrait (placeholder: a PAF instructor or ATC officer) plus short pixel-font messages, e.g. "Throttle up to begin your takeoff roll", "Gear up!", "Cleared to land, Peshawar". A row of small lights underneath is optional decoration.
- **Bottom ~60%: the world.** A wide, fairly **zoomed-out** side view: the plane is **small** relative to big base buildings (hangars, a long terminal/admin block, control tower), with green hills, clouds and a pale sky behind. Ground and runway along the bottom.
- The panels are part of the UI layer (`CanvasLayer`) and stay fixed. The world scrolls underneath.
- Prototype: **one shared panel design** for both aircraft, with gauge ranges taken from the aircraft data. Different cockpit panels per aircraft come later.

## Pause menu (chunk 2.2)
- Esc in a flight pauses the whole tree and shows `PauseMenu` (`scenes/ui/pause_menu.gd`, CanvasLayer 25, process mode ALWAYS): RESUME (ESC), RESTART (R), MAIN MENU; VOLUME sliders Master / Engine / Effects (0..1, 0 = muted); KEYS list (two pairs per row, keys in amber). Esc again or RESUME carries on.
- Disabled once the flight ends (result screen has its own buttons). Volumes live in `GameState.volumes`, applied to the audio buses at start-up and saved to `user://settings.cfg` when the menu closes.

## Flying name tag (owner, 2026-11-19)
- Replaces the old wings | rank / name plate, bottom-left of the HUD (hidden with touch controls). One embroidered navy cloth rectangle like a real PAF flying name tag: full rank top right (e.g. WING COMMANDER), pilot wings in the middle, name below in silver thread (Chakra Petch, the game font); long names shrink to fit (`NAMETAG_FONT_PX`, `NAMETAG_TEXT_W` in `src/ui/hud.js`). Styles: `.nameplate` in `src/style.css`.
- Wings: `public/sprites/paf_pilot_wings_{white,blue,red}.png` from `python tools/make_badge.py` (dark backing plate knocked out, crescent and star tinted). Colour per aircraft = `rankBadge` in `src/data/aircraft.js`: white FLT LT (and cadet: owner did not say, my pick), blue SQN LDR, red WG CDR.

## Debrief (result screen, owner 2026-11-19)
- Replaces the "GOOD LANDING" / stars screen. `Result` in `src/ui/screens.js`, `.debrief` styles in `src/style.css`: olive military report sheet, header PAKISTAN AIR FORCE | MISSION DEBRIEF (air to ground) or FERRY FLIGHT REPORT, a line with rank, name, aircraft and mission type, a tilted rubber stamp headline, dotted report rows, remarks (the crash/wrong-base reasons), score and buttons.
- Stamp: air to ground = MISSION SUCCESSFUL (all targets, green), PARTIAL SUCCESS (some, amber), MISSION FAILED (none, or aircraft lost; red). Ferry = FERRY FLIGHT COMPLETE (green), WRONG BASE (amber), AIRCRAFT LOST (red).
- Rows: air to ground = targets destroyed, weapons deployed (`r.weapons` used/total + name), recovery base and landing grade; ferry = route, landing grade and sink rate; both = flight time, fuel used. Score rules unchanged (`Flight.score`).

## Briefing (before take-off, owner 2026-11-19)
- `Briefing` in `src/ui/screens.js`, same `.debrief` sheet (plus `.brief`, `.bnotes`). Shown by `startFlight` before every flight (also Fly again / R); the sim waits (frame renders the parked jet, no steps) until Enter / Start (Esc / Main menu goes back). Ignores the Enter that opened it (300 ms).
- Air to ground: PAKISTAN AIR FORCE | MISSION BRIEFING, amber STRIKE MISSION stamp ("N GROUND TARGETS · CLEARED HOT"), rows: departure, target area distance, targets, known threats, loadout, gun, countermeasures, recovery (assigned after the attack, land), time; tactics notes. Ferry: FLIGHT ORDERS, green FERRY FLIGHT stamp, departure, destination, distance, refuel stop, fuel, approach speed, time.
