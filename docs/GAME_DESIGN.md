# Game Design: Project Shaheen (working title)

This is the full long-term vision. Most of it is **not** built in the prototype. See `ROADMAP.md` for what gets built when.

## 1. Core idea

You are a PAF pilot, starting as an Aviation Cadet: the player enters their name and is addressed as "Avn Cdt <name>" (rank could rise with the career later). **Rank follows the aircraft (owner decision):** flying the Super Mushshak you are **Aviation Cadet (AVN CDT)**; flying the F-16 you are **Squadron Leader (SQN LDR)**. Set per aircraft in `AircraftData.pilot_rank` / `pilot_rank_call`. In career mode this should become rank progression.

**Instructor tone (owner decision):** the instructor is a real, hard flight instructor: aggressive, angry, hyper, impatient, short shouted lines, with natural Urdu where an instructor would use it ("Jaldi karo!", "Kya kar rahe ho?", "Abhi!", "Aram se", "Dhyan se", "Shabash", "Phir se karo"). Nothing corny, no jokes, no profanity.

**Background landmarks:** each base can show real local landmarks in the distance as you fly in (scenery only, never interactive). Karachi (Masroor): the sea and port, Teen Talwar, Bahria Icon Tower, Mazar-e-Quaid, Masjid-e-Tooba. More cities later.

**Day or night** is chosen on the start screen. Night: dark world, stars, runway edge/threshold/end lights and sequenced approach lights, lit tower and windows, aircraft nav lights (green near wingtip, red far wingtip), white tail light, anti-collision strobe and a landing light on the nose gear (off when the gear is up). Each mission: you're on the runway at one PAF base, you start up, take off, fly to another named PAF base, and land. Landing well (gentle touchdown, gear down, on the runway, not wasting fuel) earns pay and reputation. Pay unlocks better aircraft. You progress from basic trainers to front-line fighters.

The game should feel like TU-95 (simple, lo-fi, a bit charming), but with:
- **Better controls**: responsive, readable, with clear instrument feedback. No fighting the interface.
- **Much more depth**: career progression, many aircraft, many bases, and later a mission planner, weather, emergencies and ground attack.

## 2. View and presentation

- 2D side view. The plane flies left to right across a scrolling landscape (similar layout to Air Offense Command).
- Pixel art at a 640×360 internal resolution, scaled up crisply.
- Parallax backgrounds per base and region. Time of day and weather tint the scene (later).
- Screen layout like TU-95 (see `reference/tu95_layout_reference.png` and the layout section in `CLAUDE.md`): cockpit gauge panel top-left (different per aircraft type), positional radar with the flight phase top-centre, instructor/radio message box with portrait top-right, zoomed-out world below with a small plane and big base buildings.
- Eventually each aircraft gets its own cockpit panel (Mushshak gauges look different from F-16 instruments). The prototype uses one shared panel.

## 3. Flight model (arcade)

Not real aerodynamics, but it should *behave* believably. The owner wants the motion to follow a realistic flight path: energy matters, too slow means a stall, more speed means more lift and a climb, friction and drag always act.
- **Engine** must be started (E) before the throttle does anything; it takes a moment to spool up.
- **Throttle** sets thrust. Heavier, slower aircraft accelerate slowly. Fighters are punchy.
- **Pitch** (nose up and down) is the main control. The plane climbs when pitched up with enough speed.
- **Lift** grows with speed. Below stall speed the plane loses lift and the nose drops.
- **Flaps** (Up / Takeoff / Landing) give more lift at low speed but add drag.
- **Landing gear** must be down to land. Gear down adds drag. Retract it after takeoff. Some aircraft (e.g. the Super Mushshak) have **fixed gear**: always down, G does nothing.
- **Air brake:** B in the air adds a lot of drag to slow down (B on the ground = wheel brakes).
- **Brakes** slow the plane on the ground.
- **Fuel** burns with throttle. Running out means the engine stops (glide).
- **Weight** (later, via the mission planner): more fuel or stores means a longer takeoff roll, slower climb and higher stall speed.

Each aircraft has its own numbers (thrust, mass, drag, stall speed, max speed, pitch rate, fuel capacity, burn rate, takeoff and landing speeds), stored as data.

## 4. Mission flow

1. **Briefing / mission select**: departure base → destination base, distance, pay offered, aircraft.
2. *(Later)* **Mission planner**: choose fuel load. Later still, weapons and stores. All of these affect weight.
3. **Flight**: start engine → taxi/roll → rotate → climb → cruise → descend → approach → land → stop on the runway.
4. **Result screen**: landing grade, time, fuel used, pay earned, any penalties.

### Landing grading (initial idea)
- **Perfect**: gentle touchdown, gear down, on the runway, sensible pitch.
- **Good / Firm**: acceptable but a bit hard.
- **Hard landing**: damage, pay reduced.
- **Crash**: gear up, too fast a descent, nose-first, or off the runway. No pay, mission failed.

Also scored: time taken, fuel efficiency, and stopping before the runway end.

## 5. Career and progression

- Start at **PAF Academy Asghar Khan, Risalpur** (where PAF pilots get primary flying training) in a basic trainer.
- Successful missions pay money. Money unlocks aircraft (and later upgrades). Rank and reputation could gate unlocks too.
- Rough aircraft progression (owner to confirm the final list and stats):

| Tier | Aircraft | Role in game |
|---|---|---|
| 1 | MFI-17 Mushshak / Super Mushshak | Basic trainer, slow and forgiving. The starting aircraft. |
| 2 | K-8P Karakoram | Jet trainer. First jet. |
| 3 | F-7PG / FT-7 | Light, fast fighter. Twitchy. |
| 3 | Mirage III / 5 | Classic delta. High landing speed. |
| 4 | JF-17 Thunder | Modern multirole. Well-balanced. |
| 5 | F-16 Fighting Falcon | Powerful, fast, high-performance. |
| 5+ | J-10CE | Endgame unlock. |

Possible later additions: transport or AEW aircraft (C-130, Saab Erieye) as special missions.

## 6. Bases (stylised, real names)

Candidate bases. Each gets a runway length, a scenery theme, landmarks, and later typical weather:
- PAF Academy Asghar Khan, Risalpur: training start, green Khyber Pakhtunkhwa plains
- PAF Base Peshawar: valley, mountains in the distance
- PAF Base M.M. Alam, Mianwali: training base, Salt Range and Indus area
- PAF Base Mushaf, Sargodha: Punjab plains, Kirana Hills
- PAF Base Minhas, Kamra: near the Indus and Attock
- PAF Base Nur Khan, Rawalpindi: city backdrop, Margalla Hills
- PAF Base Murid, Chakwal: Potohar plateau
- PAF Base Rafiqui, Shorkot: flat farmland
- PAF Base Shahbaz, Jacobabad: hot, dry plains
- PAF Base Samungli, Quetta: high, arid mountains
- PAF Base Masroor and PAF Base Faisal, Karachi: coastal, sea backdrop

Distances between bases are compressed so flights take a few minutes, not real-world times.

## 7. Later features (not in early phases)

- **Mission planner**: fuel load, then weapons and stores (weight and drag effects).
- **Weather and time**: night landings, crosswind or gusts (as turbulence), rain, fog, dust haze.
- **Emergencies**: engine failure, gear won't extend, low fuel diversion to the nearest base.
- **Ground attack** (Air Offense Command inspired): targets on the ground, bombs and rockets, anti-air. A separate mission type once the flying core is solid.
- **Other mission types**: formation flights, aerial refueling (stretch goal), air show routines.
- **Mobile version**: on-screen touch controls (throttle slider, pitch buttons or tilt, flaps/gear/brake buttons).
- **Online**: cloud saves and leaderboards (best landings and times per route). Needs a back end (likely Supabase or Firebase).
- **Audio**: engine sounds per aircraft type, ATC-style radio calls, warnings ("gear!", stall horn).

## 8. Controls (desktop, initial)

| Action | Keys |
|---|---|
| Throttle up / down (hold); past the red mark = afterburner on jets | ↑ / ↓ |
| Pitch nose up / down | ← / → |
| Engine start / stop | E |
| Flaps: step one notch (flights start in TO; order TO → UP → TO → LDG → TO …) | F |
| Gear toggle | G |
| Brakes (hold): wheel brakes on the ground, air brake / speed brake in the air | B |
| Pause | Esc |
| Restart mission | R |
| Debug readout (tuning numbers) | F1 |

All controls go through Godot InputMap actions (no hard-coded keys in scripts), so gamepad and touch can be mapped later. Rebinding in an options menu comes later.
