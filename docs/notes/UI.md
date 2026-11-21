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

## Touch controls (owner 2026-11-20, after Air Offense Command)
- `src/ui/touch.js`, shown on touch (coarse pointer) screens or with `?touch=1` in the URL.
- **Pitch slider (left):** the finger sets where the handle should go; the handle follows on a damped spring (`PITCH_SLIDER`: stiffness 75, damping 17; owner found 30/11 too slow), so it has some weight. Pitch = handle offset from the middle (up = nose up), proportional. Let go: it settles back to the middle (softer spring).
- **Round buttons (right), by phase:** ground: ENGINE (big), BRAKE; airborne with gear down or landing (destination revealed, within `LANDING_PHASE_M` 6 km): GEAR, BRAKE; attack (strike, targets not done, gear up): FIRE (big; lights up red, steady, once locked / on target), GUN (hold, three-rounds icon), FLARES, nothing else (owner); cruise: GEAR, BRAKE (+ FLARES, GUN in a strike). ENGINE joins any airborne set if the engine is off. Icons + short text (GEAR UP / GEAR DN, ENG ON / ENG OFF).
- Throttle slider at the right edge, small pause button bottom left; weapon card moves to the bottom left. Shot down: tap the big EJECT cue.

## Instructor, briefing (owner 2026-11-20)
- Instructor for every aircraft. `instructorLines` (`src/data/aircraft.js`): 'full' coaching for the Mushshak; 'minimal' for fighters = urgent lines only (stall, pull up, gear, SAM, hits, results, eject); `Flight.say` drops the rest.
- Touch screens: the radar / targeting sight sits top left (it was hidden on phones); the instructor's line pops up as a slim strip under the warnings for `INSTRUCTOR_LIVE_S` (4 s) when he speaks.
- No pilot's-notes pages before the briefing (owner 2026-11-20: removed, "don't like it"). No landing guide card on final either (removed, "not helpful"); the height callouts and PAPI lights stay.
- Briefing simplified: strike rows TAKE OFF FROM, TARGETS, DISTANCE, THREATS, WEAPONS, LAND AT + one line of orders; ferry rows TAKE OFF FROM, LAND AT, DISTANCE, FUEL STOP. Supersedes the longer row list above.

## Start screen look (owner 2026-11-20: "more military, like the briefings")
- `.sheet` in `src/style.css` reuses the debrief paper (olive, scanlines, `.dhead` bar with PAKISTAN AIR FORCE / RESTRICTED). Stencil SHAHEEN + FLIGHT AUTHORISATION · SORTIE ORDER, numbered square section tabs (01 PILOT ...), SECTION nn · title, square khaki buttons (FLY turns green on the last step).
- `.mlog`: the order fills in as dotted rows (PILOT, AIRCRAFT · home base, MISSION, ROUTE (ferry), TIME OF DAY, BEST SCORE); sections not reached yet read PENDING. Hidden on short screens (phones sideways), where the aircraft grid goes 3 wide.

## Air to air screens (owner 2026-11-21)
- Start screen: MISSION step has **Air to air** (greyed out for an aircraft without a gun); then an **OPPONENT** step with three cards (owner's art): MiG-21 EASY, Su-30 MEDIUM, Rafale HARD, a line about each. The tab bar shows ROUTE or OPPONENT (whichever the mission has; air to ground keeps ROUTE struck out) and renumbers. Order sheet row OPPONENT. Best score kept per aircraft and opponent.
- Briefing: AIR COMBAT stamp, `n BANDITS · GUNS ONLY`; rows TAKE OFF FROM, BANDITS (n x type · difficulty), INTERCEPT (km out, one at a time), WEAPONS (gun, rounds), DODGE, LAND AT (shown after the fight).
- In flight: see COMBAT.md "Air to air" (gun card, warnings, phase line INTERCEPT / DOGFIGHT · ON HIS TAIL / BANDIT BEHIND / NEXT BANDIT INBOUND, then the usual phases to the landing).
- Debrief: MISSION SUCCESSFUL (all down) / PARTIAL SUCCESS / MISSION FAILED; rows BANDITS DESTROYED, OPPONENT, HITS ON BANDITS, GUN ROUNDS FIRED, BATTLE DAMAGE, RECOVERY (base · landing grade), FLIGHT TIME, FUEL USED. Score: landing + fuel as usual + per kill 400 (MiG-21) / 600 (Su-30) / 900 (Rafale).

## Briefing, simplified (owner 2026-11-21: "way too much information")
- Report look, few rows, no weapon names, no how-to/dodge lines, no orders line. Meta line: pilot · aircraft on the left, `SORTIE hhmm/dd` on the right.
- Ferry: DEPART, DESTINATION, DISTANCE, FUEL STOP (if any). Strike: DEPART, OBJECTIVE (destroy n targets), THREAT (SAM sites), LOADOUT by kind (`4 GUIDED BOMBS + GUN`, `2 CRUISE MISSILES + GUN`, from `weaponLabel`), RECOVERY (after the strike). Air to air: DEPART, OBJECTIVE (destroy n bandits), BANDIT (type · difficulty), LOADOUT (GUN), RECOVERY (after the fight).
- Weapon names stay where they're used: the aircraft cards on the start screen (weapon kind) and the HUD weapon card. Start-screen order sheet: AIRCRAFT row is just the aircraft name (no base).

## Start screen revamp (owner 2026-11-21: "way too cluttered and confusing for new users")
- **Supersedes** "Start screen look" and the start-screen part of "Air to air screens": no side panel, no step tabs, no running order log, no controls pop-up.
- The order sheet now **covers the whole screen** (`.sheet.full`): header bar (PAKISTAN AIR FORCE · FORM nn / nn · RESTRICTED), one question in the middle, BACK / NEXT at the bottom. Enter = next, Esc = back, left / right = change the choice, double click a box = next.
- Pages (`STEPS` in `src/ui/screens.js`): **1 name** (input only; the embroidered wings name tag appears once a name is typed; NEXT is off until then) -> **2 mission** (three boxes, line icon + name + one line: Ferry / Air to ground / Air to air) -> **3 aircraft** (only those that can fly that mission; picture, name, role, armament by kind, one line each, e.g. "4 laser guided bombs" then "20 mm cannon") -> **4 destination** (ferry) or **opponent** (air to air) -> **5 time of day** (four boxes with icons) -> **6 sortie order**: a paper form with sortie number and date, a SORTIE AUTHORISED stamp (mission underneath), the pilot's name tag (rank colour wings), rows PILOT (full rank + name), AIRCRAFT, MISSION, DESTINATION / OPPONENT, TIME OF DAY, BEST SCORE, and an "AUTHORISED ... OC FLYING WING" signature line. NEXT becomes FLY.
- Mission is picked before the aircraft now: picking a mission the current aircraft can't fly switches to the first one that can.

## Pause menu, simplified (owner 2026-11-21: "overcluttered")
- Supersedes "Pause menu (chunk 2.2)". Olive debrief style: RESUME (Esc) / RESTART (R) / MAIN MENU as three big buttons; **Volume**: one slider (master; engine and effects keep their saved mix) with an ON/OFF mute button; **Graphics**: Low / Medium / High as three buttons; the key list is hidden behind CONTROLS.
- **Name length (owner 2026-11-21):** only what fits on the flying name tag: measured in the tag's font (`fitsTag` in `src/ui/screens.js`, `TAG`), so about 8 capitals, more with narrow letters; extra letters are refused (the box shakes red). A longer saved name is trimmed when the menu opens.
- **Main menu from a mission (owner 2026-11-21):** "Main menu" in the pause menu and on the result screen (and Esc there) returns to the first page of the start screen (name), not the sortie order. Esc on the pre-flight briefing still goes back to the order.
- **Home base on the aircraft cards (owner 2026-11-21):** at the foot of each card, a gold map pin and the base the jet flies from (`BASES[homeBase].name`, e.g. "PAF BASE MUSHAF").
- **Aircraft page (owner 2026-11-21):** order Super Mushshak, F-7PG, Mirage V, JF-17, F-16A, F-16D, J-10C (the `AIRCRAFT` order). Every jet is listed in every mission; the ones that don't fly it are greyed out and can't be picked (`modes` per aircraft: Mushshak ferry only; Mirage ferry + air to ground; F-7PG and J-10C ferry + air to air; JF-17 and F-16s all three).
- Owner 2026-11-21: "Main menu" from a mission lands on the mission page (the one after the name), or on the name page if no name is saved. The air-to-air card names the gun by calibre only ("20 MM CANNON").
- **Tab icon (owner 2026-11-21):** the eagle from the Falcons' Hearth art (`public/favicon.png` 192 px, `favicon-32.png`), replacing the green jet SVG.
- **Engine sound (owner 2026-11-21):** fades out (about a second) once the jet crashes or the flight is over (`engineOff` passed to `Sound.update`).
- **Cockpit panel tiers (owner 2026-11-21, `cockpitStyle`):** trainers (Mushshak, K-8) `analog` basic grey dials; old fighters (Mirage V, F-7PG) `darkAnalog` fighter-style dials, amber; modern (JF-17, F-16A) `glass` green monochrome MFDs; top of the line (F-16D, J-10C) `colorGlass` colour PFD with horizon and engine page.
- **Instructor portrait (owner 2026-11-21):** owner's art of a pilot in helmet and oxygen mask (`public/instructor.png`, from `docs/reference/instructor_source.png`), nods while talking (replaces the SVG helmet).
- **Menu font (owner 2026-11-21):** Warband Stencil Regular (Sronstudio, commercial) for `#menu` and `.overlay` (pause, briefing, debrief); typed-record rows stay monospace; HUD stays Chakra Petch. `@font-face` in `src/style.css` loads `public/fonts/WarbandStencil-Regular.woff2` / `.otf`; the file is not in the repo yet (owner to add it, with a web-embedding licence), Chakra Petch shows until then.
