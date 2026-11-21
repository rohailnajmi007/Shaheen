# Roadmap

Work proceeds in small chunks. Only work on the current chunk. Tick boxes when done. Later phases are rough and will be detailed into chunks when we get there.

## Phase 1: Prototype (done)
Detailed in `PROTOTYPE_SPEC.md`.
- [x] 1.1 Project setup (settings, folders, input map, git)
- [x] 1.2 Plane on a runway (throttle, brakes, rolling, camera, debug text)
- [x] 1.3 Takeoff and flight (lift, pitch, stall, drag)
- [x] 1.4 Flaps, gear, engine, fuel (E engine with spool-up, F flaps UP/TO/LDG, G gear for retractable aircraft, B air brake in flight, fuel burn and flame-out)
- [x] 1.5 Cockpit HUD layout (gauge panel, phase box, instructor message box)
- [x] 1.6 Two bases and parallax scenery
  - Route: **Risalpur (start, PAF Academy Asghar Khan) → Peshawar**, 9 km between thresholds (compressed). Buildings, windsock, name boards, approach lights, parallax mountains/hills/trees/clouds, scenery blending from Risalpur's green plains to Peshawar's big mountains, distance bar, APPROACH phase and landing calls.
  - Also done alongside 1.6 at the owner's request: pixel-art Super Mushshak sprite (sharper, ~2x true scale), animated retractable gear on the Mushshak, instructor redrawn in helmet + green flight suit (talks and blinks), camera keeps the ground in view when low.
- [x] 1.7 Landing detection, grading, result screen
  - Grades PERFECT/GOOD/FIRM/HARD from touchdown sink rate (limits in AircraftData), CRASH for: off-runway touchdown, gear up, nose-first, too hard, running off a runway end; WRONG BASE for landing back at Risalpur; overrun at low speed = one grade lower. Crash effect (fireball, debris, smoke). Result screen with Retry / Menu.
  - Also: route shortened to **5 km** (owner: 9 km felt too long); start screen with **name entry**, shown as **"AVN CDT <NAME>"** (Aviation Cadet) bottom-left in flight, on the result screen and in the instructor's calls.
- [x] 1.8 Second aircraft (F-16) and aircraft-select screen
  - F-16 built from the owner's art (`docs/reference/f16_sprite_source.png`), gear drawn in code (art shows it retracted). Afterburner above 85% throttle (flame, A/B light, 3x fuel). Harder than the Mushshak: stall 125 kt, rotate 145 kt, approach ~145 kt, 4 s engine spool, twitchier pitch, weaker brakes, stricter landing limits.
  - Also: stalls no longer drop the nose (owner: "fall in the same position"); crashes break the fuselage into 2 or 3 tumbling pieces depending on impact severity.
  - Follow-up (owner feedback): smoother on-screen motion (render interpolation + camera locked to the plane; a softer F-16 handling model was tried and reverted, owner prefers the original crisp handling), much bigger afterburner flame, nose gear moved under the intake. Centre attitude indicator and route bar replaced by a **positional radar** (side-view map of the route with both bases and the plane blip, phase + km to go + progress segments). **Per-aircraft cockpit:** `cockpit_style` Analog (Mushshak, round dials) / Glass (F-16, green speed/altitude tapes, Mach, G, VS bar, three gear lights).
  - Ninth follow-up: big performance fix for the browser (static scenery no longer redrawn every frame; parallax bands batched into one draw call each: ~10x faster); start screen gets a golden-hour airfield backdrop with a formation flypast; start-screen cards ordered Mushshak, Mirage, F-16; subtitle and route line removed.
  - Eighth follow-up: Mirage V rebuilt from the owner's gear-down art (real retracting gear layer); night aircraft lights come on with the engine; parked front-view aircraft at both bases (12 K-8s at Risalpur, 12 JF-17s at Masroor), some in hardened shelters; Masroor squadron boards (No. 2 "Minhasians", No. 8 "Haider") and a "Welcome to Masroor, the Home of Warriors" board at the far end of the runway.
  - Seventh follow-up: aircraft flies itself off once the nose wheel is up at rotate speed; nose wheel comes down by itself on the landing roll when slow; fighter brakes much stronger; brighter aircraft and afterburner at night; landmarks bigger and Mazar-e-Quaid redrawn. Web export preset + `deploy.bat` added (chunk 1.9 prep).
  - Sixth follow-up (owner requests): **Mirage V** added as a third aircraft (dark analog cockpit, stall 140 kt); takeoff pitch limit until 500 ft; destination is now **PAF Base Masroor, Karachi** with a sandy coastal look and background Karachi landmarks (sea and port, Teen Talwar, Bahria Icon Tower, Mazar-e-Quaid, Masjid-e-Tooba, skyline); aircraft cards show only name and role.
  - Fifth follow-up: aggressive instructor with Urdu phrases; rank per aircraft (AVN CDT in the Mushshak, SQN LDR in the F-16); name plate moved under the instructor box (it hid the plane); DAY/NIGHT choice on the start screen with a full night mode (stars, runway/approach lights, lit tower, aircraft nav/strobe/landing lights).
  - Fourth follow-up: the aircraft pivots on its main wheels on the ground (only the nose wheel lifts); pitch limits removed (loops/inverted possible, lift model covers any angle incl. negative stalls); tail-strike and upside-down touchdowns crash.
  - Third follow-up: instructor box and instrument panel swapped (instructor top-left, panel top-right) so the plane isn't hidden when climbing; bottom-left name plate now shows the PAF pilot wings badge above "AVN CDT" and the name.
  - Second follow-up: crashes shatter the airframe into many small irregular shards that slide to a stop (no bounce); big crashes explode (fireball, debris, ground fire), small ones scrape along with dust and thin smoke; nose lifts gradually on the takeoff roll from 70% of rotate speed; F-16 moving tailplane (elevator) follows the pitch keys; F-16 blackout (high positive G) and redout (strong negative G) screen effects above 250 kt.
- [x] 1.9 Tuning pass and web deploy to Vercel for friends (closed 2026-11-18 when the owner started Phase 2; leftovers moved to 2.3 and 2.6)
  - Web deploy done: https://shaheen-green.vercel.app (2026-11-17). Tuning pass from friends' feedback still to do.
  - Tuning so far: instructor English-only (censored curses), black helmet with visor down; firm-but-legal landings make a small realistic hop (one per landing), smooth landings don't, too hard still crashes. Takeoff pitch limit removed (any pitch, any time); over-rotating near the runway = tail-strike crash, with a NOSE TOO HIGH warning. Landings made forgiving (owner: crashing on every landing): slight nose-wheel-first = grade penalty not crash, nose lowers itself after touchdown so brakes work, higher gear limits, crashes at landing speed are scrapes not explosions.
  - Second destination: **PAF Base Mushaf, Sargodha** (7 km, beyond Masroor): green plains, banyan trees, kinnow orchards, villages; F-16s on the apron, No. 9 "Griffins" and No. 29 "Aggressors" boards, blue-and-gold "Welcome to Mushaf, the Home of Eagles" monuments at both runway ends, IAF MiG-21 and Su-30 tail-section trophies. **F-16A** added (same numbers as the F-16D, own art, moving tailplane, gear in code).
  - **One shared world:** all bases stand along the route, so you can divert and land anywhere; the flight passes only at the destination chosen before take-off (else WRONG BASE). Radar shows every base. Mushaf squadron boards red and gold.
  - **Start screen in steps:** START, name, aircraft, route, day/night, FLY (BACK/NEXT).
  - **Refuelling stop:** land at a base on the way (Masroor en route to Mushaf), engine off, T: a fuel truck drives up, hoses in, fills the tank and leaves; take off again. New F-16D art (gear-down picture, gear retracts as a layer, moving tailplane).
  - Moved to Phase 2: landing readability (2.3), audio (2.1), friends' feedback tuning (2.6).

### Open questions (owner to decide after playtesting)
- **Camera:** keep the moving look-ahead camera? Should it zoom out as speed increases?
- **Throttle:** keep "hold ↑/↓ to move the lever" (lever stays where you leave it), or switch to a different scheme (e.g. fixed steps)?
- Throttle response was sped up in 1.3 and again in 1.4 (thrust and drag both ×1.75: same top speed, much punchier speed changes; brakes 0.4 g → 0.6 g), then before 1.5 via `speed_response` = 2 (speed changes 2× faster again, same top speed/climb) and brakes 0.9 g. Re-check feel.
- **Stall behaviour (decided):** owner chose NO auto nose-drop: the aircraft keeps its attitude and falls until the player pushes the nose down (`stall_nose_drop_deg_s` = 0 for both aircraft). An options toggle for auto-recovery could still come in Phase 2.
- **Gear on the Super Mushshak:** the real aircraft has fixed gear; the owner asked for working gear up/down, so `retractable_gear = true` in `super_mushshak.tres` (one flag to flip back).

## Phase 2: Feedback and polish (current, started 2026-11-18)
One chunk at a time, in this order (owner chose sound first).
- [x] 2.1 Sound, generated in code (no audio files): engine per aircraft type (piston buzz for the Mushshak; turbine whine + roar for the jets, afterburner rumble), wind with airspeed, tyre rumble on the ground, touchdown thump and squeal, stall horn, gear warning, gear motor and lock clunk, crash.
  - Done 2026-11-18: `scripts/sound_synth.gd` builds every sound once per session (~135 ms on the dev PC); `scenes/aircraft/aircraft_audio.gd` drives them from the aircraft state. Per-aircraft engine numbers in AircraftData "Sound", the rest of the mix in aircraft_audio.gd exports. Not yet heard in a browser (web uses Godot's sample playback). Owner: F-16 too whiny, so its engine note lowered (pitch 0.45-0.8) and the whine's 3 kHz overtone softened.
- [x] 2.2 Pause menu and simple options: Esc pause (Resume / Restart / Menu), volume sliders, key list.
  - Done 2026-11-18: `scenes/ui/pause_menu.gd` (added by flight.gd, off once the flight ends). Audio buses Master / Engine / Effects (`default_bus_layout.tres`); slider volumes saved by GameState to `user://settings.cfg`. A short thump plays when a slider is let go, so the level can be heard while paused.
  - Owner request (2026-11-18): clearer, less pixelated text everywhere: project font Silkscreen -> Chakra Petch SemiBold, smoothed.
  - Owner fixes (2026-11-18): F-16A/D moving tailplane now uncovers the real art underneath (each F-16's body is the owner's picture without the tailplane) instead of a blank/grey block; menus show body + tailplane; start-screen preview shows the F-16A and F-16D at the same size.
- [ ] 2.3 Landing readability: sink-rate cue on the HUD, short-final callouts, fairer nose-down rule. (Sink-rate cue and callouts came with the JS port, 2.8; nose-down rule still to review.)
- [x] 2.4 PAF liveries: already in the aircraft art (owner, 2026-11-18); nothing to do.
- [x] 2.5 Gamepad support. (Came with the JS port, 2.8.)
- [ ] 2.6 Friends' feedback: gather it from the live build, tune controls and flight feel, settle the open questions above.

- [x] 2.7 Air-to-ground mission (owner request 2026-11-18, pulled forward from Phase 6): MISSION step on the start screen, jets only, 2 free-fall bombs (Space), 2-3 random ground targets, bomb sight + impact marker, landing base (random Masroor/Mushaf) appears after the attack, targets destroyed on the result screen. Details: `docs/notes/COMBAT.md`.
  - Follow-up (owner): F-16s guided bombs (bomb sight moved into the radar's place during the target run, bombs steer within 250 m); Mirage V unguided bombs (no sight, small scatter, simple release cue next to the aircraft); cards show the bomb type.
  - Follow-up (owner): attack-run camera zooms out (0.4) after take-off so bombs falling and targets exploding are visible; back to normal for the landing.
  - Follow-up (owner): weapon art: AGM-88 HARM missile on the F-16D (rocket motor, missile flight path), GBU-12 guided bomb on the F-16A, Mk 82 on the Mirage; HUD shows the selected weapon; cards: guided air-to-ground missile / guided air-to-ground bomb / unguided bomb.
  - TODO later (Phase 6): anti-air threats, more weapons (rockets), mission planner loadouts, scoring/pay.

- [x] 2.8 JavaScript port (owner request 2026-11-19): a friend (`reachrazamair`, PR #1) rewrote the game in JavaScript (Vite, Canvas 2D, HTML HUD, Web Audio); the owner made it `main`. Godot version kept as tag `godot-final` (`dca728c`). Docs restored and rewritten for JS (`CLAUDE.md`, `docs/notes/TECH.md`, `docs/DEPLOYMENT.md`, new `deploy.bat`); sprite tools restored and pointed at `public/sprites/` (regenerate the sprites byte for byte). Same aircraft art and data numbers.
  - The port also brought: full-resolution rendering, four times of day (dawn/day/dusk/night), speed and bomb-run camera zoom, landing guide on final (glide path, sink rate, speed, height callouts; covers much of 2.3), PAPI lights, one-page start menu with best score per aircraft/route, touch controls, gamepad (2.5).
  - Owner fixes (2026-11-19): per-aircraft instrument panels back (analog Mushshak, dark analog Mirage, glass F-16s; `src/ui/cockpit.js`); bomb sight back for the guided F-16 weapons (radar's place during the attack run) and release cue for the Mirage (`src/ui/weapon_aids.js`); ground marker for guided bombs only; HARM no longer locks on the runway (see COMBAT.md "Missile lock").
  - Owner fixes (2026-11-19, second round): crash breakup redone (many small scorched shards, sliding debris field, burning pieces, camera follows the wreck; FLIGHT_MODEL.md); base scenery restored (Karachi landmarks, Sargodha landmarks, Mushaf trophies/banyans/welcome monuments; WORLD.md); sequential start screen, title just SHAHEEN, plain aircraft role/weapon text (UI.md).
  - Owner requests (2026-11-19, third round): attack-run camera fixed (COMBAT.md); home bases per aircraft (WORLD.md); JF-17 Thunder added, weapons TBD (AIRCRAFT.md).
  - Owner fixes (2026-11-19, fourth round): JF-17 no longer greyed out in the menu; crash fire/smoke fixed (dev-server double module load); structural crash breakup; JF-17 colour glass cockpit.
  - Owner requests (2026-11-19, fifth round): JF-17 armed with the Ra'ad cruise missile (COMBAT.md); tail-top double-flash strobe on all aircraft (AIRCRAFT.md); no mountains at Karachi (WORLD.md).
  - Owner requests (2026-11-19, sixth round): embroidered flying name tag on the HUD (rank, crescent-coloured wings, name; UI.md); ranks now Mirage FLT LT, JF-17 SQN LDR, F-16s WG CDR (AIRCRAFT.md). Result screen is now a military debrief: MISSION SUCCESSFUL / PARTIAL SUCCESS / MISSION FAILED stamp with targets destroyed and weapons deployed for air-to-ground, FERRY FLIGHT COMPLETE for ferry flights; landing grade is just one line (UI.md).
  - Owner request (2026-11-19, seventh round): air-to-ground expanded (COMBAT.md "Air defences and the gun"): 4-5 targets (satcom station, radar, fuel depot, bunker, missile launcher, tank, APC); AAA guns and radar/IR SAMs that shoot back with real ballistics and guided missiles; Q target switching for every weapon; aircraft gun (V) with real ballistics and a ground pipper; flares (X) and chaff (C); battle damage and being shot down; debrief rows for defences, rounds, missiles evaded, damage.
  - Owner requests (2026-11-19, eighth round): pre-flight briefing in the debrief's style before every take-off (UI.md); 4 weapons per jet except the JF-17 (2 Ra'ad); one AAA gun, drawn bigger; flares/chaff only work together with breaking across the missile (COMBAT.md). Take-off and landing stay part of every mission.
  - Owner fixes (2026-11-20): only 2 stores drawn under the jet (4 still carried); flares and chaff on one key (X), one SAM type, each battery fires only 2 missiles; background layers now sink out of view as you climb (no cap), high-altitude sky darkening fades instead of a hard line (WORLD.md, COMBAT.md).
  - Owner requests (2026-11-20): J-10C added (sixth aircraft, last in the list) with moving canards, ferry only until its weapon is picked (AIRCRAFT.md); eject (E) once shot down: seat, canopy, parachute, camera follows the pilot, debrief says PILOT EJECTED / PILOT LOST (COMBAT.md).
  - Owner requests (2026-11-20, second round): Q target switching removed (weapons pick the nearest target; LOCK box / impact marker / release cue show it); flaps automatic with the gear (F key, flap lamps gone; cockpit WPN lamp shows SAFE/ARM/FIRE/GUN/EMPTY/EJECT instead); fuel truck drives up on its own at a refuelling stop (T key gone); big EJECT cue on screen (tap it on touch); weapon card says FIRE, not SPACE; touch DROP button is FIRE; controls lists cut to the crucial keys; J-10C canards turn against the pitch key; no AAA gun in air-to-ground; each SAM fires once. Lag: the cockpit, radar and release-cue canvases read clientWidth every frame (forced layout after each HUD write); now cached by ResizeObserver.
  - Owner request (2026-11-20): touch controls redone after Air Offense Command (UI.md "Touch controls"): weighted pitch slider on the left, round icon buttons on the right that change with the phase of flight (ground: engine, brake; take-off/landing: gear, brake; attack: FIRE, gun, flares only; FIRE lights up once locked), throttle slider at the right edge, small pause button. `?touch=1` shows them on a desktop. Physical gamepad mapping unchanged (TODO: gun and flares on a pad).
  - Owner requests (2026-11-20, later): touch EJECT button under the cockpit panel in air-to-ground (eject any time airborne: two taps, one once shot down; debrief AIRCRAFT LOST · PILOT EJECTED); longer run to the targets (`strikeAreaStartM`: Mirage/F-16A 8 km, F-16D 12 km, JF-17 15 km).
  - Owner requests (2026-11-20, guide round): instructor box and lines only for the trainer (`instructor` in `src/data/aircraft.js`, Mushshak); fighters show the radar / targeting sight in its place (also on phones, where it was hidden). Fighters get PILOT'S NOTES before the briefing: step-by-step pages (take off, gear up, find the target per weapon, fire, gun, survive the SAM, land; ferry: take off, gear, fly, land), keyboard or touch wording, Skip. Briefing simplified (take off from, targets, distance, threats, weapons, land at; one line of orders). New brake icon on the touch BRAKE button.
  - Owner follow-up (2026-11-20): instructor back for every aircraft; fighters only get his urgent lines (`instructorLines: 'minimal'`, trainer 'full'). Pilot's notes cut to 3 pages, strike missions in fighters only. Touch screens: the sight keeps the top-left spot, the instructor's line pops up for 4 s as a strip. SAMs: at most 1 missile fired per attack run (`STRIKE.maxSamLaunches`); a missile chasing a decoy now fuses on the decoy only (before, flares next to the jet still set off the fuse on the jet), decoys a bit stronger. Measured (F-16A, 300 ft): no flares 10/10 hit (~35% damage, never shot down); flares 22/24 defeated.
  - Owner request (2026-11-20): pilot's-notes pages before the briefing removed (straight to the briefing), and the LANDING GUIDE card on final removed (height callouts and PAPI lights kept).
  - Owner request (2026-11-20): start screen restyled as a military order sheet like the briefing/debrief (PAKISTAN AIR FORCE / RESTRICTED header, stencil SHAHEEN, numbered section tabs, square khaki controls, the order filling in as dotted rows: PILOT, AIRCRAFT, MISSION, ROUTE, TIME OF DAY, BEST SCORE; sections not reached read PENDING). Next (owner): a small dogfight mode.
  - Owner requests (2026-11-21): targets closer (`strikeAreaStartM`: Mirage/F-16A 6 km, F-16D 9 km, JF-17 11 km); blackout/redout harder to get (blackout 7-11 G, redout -2.5 to -5.5 G, was 5-9 / -1.5 to -4); crash song: after a crash `public/audio/crash_song.mp3` plays in the background, faded in, looped, stopped on restart/menu, paused with the game (`CRASH_SONG` in `src/audio.js`). TODO (owner): supply that file (commercial recording: not bundled; check the rights before deploying it).
  - Owner request (2026-11-21): **air to air** (small dogfight mode), COMBAT.md "Air to air". MISSION step "Air to air" (aircraft with a gun); start airborne; one bandit (same type, red-tinted) ahead of you or on your six; guns only; dodge by climbing, diving or changing speed so he overshoots (he reads your speed late); camera frames both jets; ends on SPLASH ONE, WINCHESTER or DISENGAGED; HUD gun card with IN RANGE · GUNS cue, GUNS · BREAK / BANDIT SIX warnings, bandit on the radar, touch GUN + BRAKE. TODO (owner): air-to-air missiles, landing after the fight, more bandits.
  - Owner requests (2026-11-21, second round): air to air reworked (COMBAT.md "Air to air"): opponents from the owner's art as difficulty levels (MiG-21 easy, Su-30 medium, Rafale hard; OPPONENT step on the start screen), 2-3 bandits per mission one after another, normal take-off and landing (the landing base appears after the fight). Radar shows tracks: your bombs/missiles with their predicted path and impact point, SAMs and what they chase, bandits (zooms to a window around you while they're in the air). Gamepad left as is (owner: ignore for now; PWA later). TODO (owner): air-to-air missiles, several bandits at once, PWA.
  - Owner requests (2026-11-21, later): small pieces fly off any jet when a round hits it, and still off a falling bandit; Mushaf trophies: fins only, side by side on one black base; hit sound redone as filtered noise only (the pitched ring sounded comical). Base name stencilled on the hangars (Black Ops One); JF-17 smoke fainter, thick at the nozzle and thinning behind.
  - Owner request (2026-11-21): start screen revamped for new players (UI.md "Start screen revamp"): full screen, name (wings appear) -> mission (3 boxes with icons) -> aircraft -> destination / opponent -> time -> sortie order -> FLY. J-10C role: air superiority fighter.
  - Owner request (2026-11-21): dogfight lag (TECH.md "Dogfight lag": backdrop zoom floor, cached vignette, fewer audio updates, adaptive resolution); bandits from 4 km (was 9); pause menu simplified (one volume slider + mute, graphics as three buttons, controls behind a button).
  - Owner request (2026-11-21): name limited to what fits on the wings tag; OP. SWIFT RETORT under the Mushaf trophies; bomb sight stays on the radar after firing; next-target arrow on the right screen edge (air to ground).
  - Owner requests (2026-11-21, third round): briefings simplified to a short report (no weapon names, no dodge instructions, loadout by kind; UI.md); base removed from the order sheet's AIRCRAFT row; air-to-air handling per jet (`airCombat`: power Mirage < JF-17 < F-16A < F-16D = J-10C, F-16s/J-10C most agile, Mirage sluggish; AIRCRAFT.md); stall relaxed (`stallMarginDeg` 8 buffet margin, stall shout max once per 10 s; FLIGHT_MODEL.md).
  - Owner requests (2026-11-21, fourth round): rounds hitting metal sound (crack, ring, thunk); battle damage takes thrust and pitch away gradually (you and bandits); damage smoke grows from a thin wisp to dense black; JF-17 thin black engine trail; bandits shed pieces when shot down (camera holds them 5 s); Mushaf display tails from the opponent art (COMBAT.md, AIRCRAFT.md, WORLD.md).
  - TODO (owner): J-10C rank (WG CDR for now), home base (Mushaf for now; real: Minhas, Kamra) and air-to-ground weapon.
  - Next (owner): gamepad controls so it can be played on mobile too (the new gun / target / flare / chaff actions have keyboard and touch buttons, no gamepad buttons yet).
  - TODO (not ported yet, owner to pick what to bring back): instructor portrait in the message box, F1 debug label. Not yet played/checked in detail against the Godot feel: landing grades, bounce, refuelling stop, night lights, parked aircraft.

**Everything below Phase 2 is on hold.** Don't start any of it until the owner says so. It's listed only so the code stays easy to extend.

## Phase 3: Career mode
- Main menu, career save (local, `user://`).
- Money and pay per mission based on landing grade, time and fuel.
- Mission select: list of routes between unlocked bases with pay offered.
- Hangar: buy or unlock aircraft.
- Add aircraft: K-8P Karakoram, F-7PG, JF-17 (art plus data each). (Mirage V and F-16A already added in the prototype.)
- Add bases: Mianwali, Kamra, Rawalpindi, Peshawar (data exists) and more, each with its own scenery theme. (Masroor and Mushaf/Sargodha already added in the prototype.)

## Phase 4: Mission planner
- Pre-flight screen to choose fuel load. Weight affects takeoff roll, climb and stall speed.
- Fuel management matters: diversions if low.
- Prepare a data structure for stores and weapons (not used yet).

## Phase 5: Conditions and challenge
- Time of day (dawn, day, dusk, night) with runway lights.
- Weather: wind/turbulence, rain, fog, dust haze.
- Emergencies: engine failure, gear failure, low-fuel diversion.
- Rank and reputation, more mission types (formation, ferry flights).

## Phase 6: Ground attack (Air Offense Command inspired)
(Basic air-to-ground mission already added as 2.7; the rest below is still to do.)
- Weapons via the mission planner (bombs, rockets).
- Ground targets, anti-air threats, mission objectives.
- Separate mission type alongside normal flights.

## Phase 7: Mobile
- On-screen touch controls (throttle slider, pitch, flaps, gear, brake buttons).
- Android export, Google Play listing.

## Phase 8: Online and release
- Back end (Supabase or Firebase): cloud saves, leaderboards per route.
- Decide on PAF insignia permission (ISPR/PAF) before any paid or major public release.
- Public release (hosting and stores to be decided then; the prototype stays on Vercel).
- Per-aircraft cockpit panels (each aircraft gets its own instrument layout).

## Parking lot (ideas not yet scheduled)
- Aerial refueling, air show mode, transport and AEW aircraft (C-130, Erieye)
- Replays, photo mode
- Key rebinding UI
