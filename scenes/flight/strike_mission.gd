class_name StrikeMission
extends Node2D
## Air-to-ground mission (GameState.Mission.STRIKE), added by the flight scene.
## Take off from the departure base; 2-3 ground targets stand at random spots
## a few km out; the jet carries data.bomb_count free-fall bombs (Space drops
## one). The landing base (random real base) stands beyond the targets but is
## hidden until the attack is over: every target destroyed, every bomb gone
## off, or the plane past the last target. Then it "appears" and the flight
## lands there as usual (landing judge in flight.gd).
## Draws the aiming marker (where a bomb dropped now would hit) itself.

signal revealed

@export_group("Layout (metres from the departure threshold)")
## First target this far out.
@export var area_start_m := 4500.0
## Gap between targets (random in this range).
@export var spacing_min_m := 700.0
@export var spacing_max_m := 1300.0
@export var target_count_min := 2
@export var target_count_max := 3
## Landing base threshold this far beyond the last target.
@export var recovery_gap_m := 3000.0
## The attack counts as over once the plane is this far past the last target.
@export var pass_margin_m := 300.0

@export_group("Aiming marker")
@export var show_impact_marker := true
@export var marker_color := Color(0.45, 1.0, 0.45)
@export var marker_on_target_color := Color(1.0, 0.3, 0.2)

@export_group("Attack-run camera")
## Camera zoom during the attack run (1 = normal): shows more ground so bombs
## can be seen falling and targets exploding. Back to 1 once the landing base
## appears (and the last explosion has been seen).
@export var attack_zoom := 0.4
## Look-ahead multiplier during the run (lower = plane nearer the middle, so
## the ground just behind it, where the bombs land, is in view).
@export var attack_look_ahead := 0.35
## Zoom out once this high after take-off (m).
@export var attack_zoom_from_m := 25.0
## Keep the wide view this long after the last bomb goes off (s).
@export var explosion_watch_s := 3.0
## Falling bombs and bomb explosions are drawn this much bigger than true
## scale so they read at the wide zoom.
@export var bomb_draw_scale := 1.6
@export var explosion_scale := 2.0

@export_group("Instructor")
## "Targets ahead" call at this distance from the first live target.
@export var targets_ahead_call_m := 3000.0

var aircraft: Aircraft
var hud: CanvasLayer
var targets: Array[GroundTarget] = []
var target_x_m := PackedFloat32Array()
var recovery_x_m := 0.0
var is_revealed := false
var bombs_in_air := 0
var _kinds: Array = []
var _rng := RandomNumberGenerator.new()
var _said := {}
## Where a bomb released now would land (m), and whether the marker is shown.
var impact_x := 0.0
## Seconds a bomb released now would fall.
var fall_time_s := 0.0
var _marker_visible := false
## Bombs still falling (plain Array: a bomb is freed when it goes off).
var _falling: Array = []
var _attack_started := false
var _since_impact := INF
var _boom: AudioStreamPlayer
var _release: AudioStreamPlayer


var targets_destroyed: int:
	get:
		var n := 0
		for t in targets:
			if t.destroyed:
				n += 1
		return n


## Random layout for this mission (call before the world is built).
func plan() -> void:
	_rng.randomize()
	var n := _rng.randi_range(target_count_min, target_count_max)
	var kinds := GroundTarget.KINDS.duplicate()
	kinds.shuffle()
	var x := area_start_m + _rng.randf_range(0.0, 500.0)
	for i in n:
		target_x_m.append(x)
		_kinds.append(kinds[i % kinds.size()])
		x += _rng.randf_range(spacing_min_m, spacing_max_m)
	recovery_x_m = target_x_m[n - 1] + recovery_gap_m


## Places the targets in the world (as children of `world`, drawn behind
## `draw_before`) and hooks up the aircraft.
func setup(world: Node2D, draw_before: Node, a: Aircraft, h: CanvasLayer) -> void:
	aircraft = a
	hud = h
	for i in target_x_m.size():
		var t := GroundTarget.new()
		t.kind = _kinds[i]
		t.x_m = target_x_m[i]
		t.show_marker = false   # drawn here instead, at a constant on-screen size
		world.add_child(t)
		world.move_child(t, draw_before.get_index())
		targets.append(t)
	a.bombs_left = a.data.bomb_count
	a.bomb_released.connect(_on_bomb_released.bind(world, draw_before))
	_boom = _player(SoundSynth.crash())
	_release = _player(SoundSynth.thump())
	z_index = 1


func _player(stream: AudioStream) -> AudioStreamPlayer:
	var p := AudioStreamPlayer.new()
	p.stream = stream
	p.bus = &"Effects"
	add_child(p)
	return p


## Metres to the next target still standing ahead (or the nearest one), INF if none.
func distance_to_next_target() -> float:
	var best := INF
	for t in targets:
		if not t.destroyed and t.x_m > aircraft.pos_m.x - 50.0:
			best = minf(best, t.x_m - aircraft.pos_m.x)
	return best


## True while the attack-run camera (zoomed out) should be used.
func attack_view() -> bool:
	if aircraft == null or aircraft.crashed:
		return false
	if not _attack_started and not aircraft.on_ground and aircraft.pos_m.y > attack_zoom_from_m:
		_attack_started = true
	return _attack_started and (not is_revealed or bombs_in_air > 0 or _since_impact < explosion_watch_s)


func _physics_process(delta: float) -> void:
	if aircraft == null:
		return
	_since_impact += delta
	var a := aircraft
	if not is_revealed and not a.crashed:
		var d := distance_to_next_target()
		if not a.on_ground and d < targets_ahead_call_m:
			if a.data.weapon_is_missile:
				_once("ahead", "Targets %.1f km! Wait for IN RANGE on the sight, then SPACE to fire!" % (d / 1000.0))
			elif a.data.bomb_guided:
				_once("ahead", "Targets %.1f km! Down to 300 ft. Target in the bracket, then SPACE!" % (d / 1000.0))
			else:
				_once("ahead", "Targets %.1f km! Down to 300 ft. Watch the RELEASE CUE, drop on DROP!" % (d / 1000.0))
		var all_hit := targets_destroyed == targets.size()
		var dry := a.bombs_left == 0 and bombs_in_air == 0
		var past := a.pos_m.x > target_x_m[target_x_m.size() - 1] + pass_margin_m
		if all_hit or dry or past:
			_reveal()
	# Where a bomb released now would land (bomb sight, release cue, marker).
	if a.bombs_left > 0 and not a.on_ground and not a.crashed:
		var hp := a.data.bomb_hardpoints[mini(a.bombs_left - 1, a.data.bomb_hardpoints.size() - 1)]
		var pos := a.hardpoint_m(hp + Vector2(0.0, a.weapon_size().y * 0.5))
		var down := Vector2(sin(a.pitch), -cos(a.pitch)) * a.data.bomb_eject_ms
		var hit := Bomb.predict_impact(pos, a.velocity_m + down, a.data.bomb_drag)
		impact_x = hit.x
		fall_time_s = hit.y
	# The ground marker is a sighting aid: guided-bomb jets only (owner: the
	# Mirage's unguided bombs get just the release cue).
	_marker_visible = show_impact_marker and a.data.bomb_guided and not a.data.weapon_is_missile \
			and a.bombs_left > 0 and not a.on_ground and not a.crashed
	queue_redraw()


## Markers at a constant size on screen, whatever the camera zoom.
func _draw() -> void:
	var u := 1.0 / maxf(get_viewport().get_canvas_transform().get_scale().x, 0.05)
	# Red marker above each target still standing.
	for t in targets:
		if t.destroyed:
			continue
		var top := Vector2(t.x_m * WorldScale.PX_PER_M, -t.half_width_m * 2.0 * WorldScale.PX_PER_M - 6.0 * u)
		draw_colored_polygon(PackedVector2Array([top + Vector2(-5, -8) * u, top + Vector2(5, -8) * u, top]),
				GameState.glow(Color(0.95, 0.2, 0.15)))
	if not _marker_visible:
		return
	var on := target_at(impact_x) != null
	var col := GameState.glow(marker_on_target_color if on else marker_color)
	var p := Vector2(impact_x * WorldScale.PX_PER_M, -1.0 * u)
	var d := PackedVector2Array([p + Vector2(0, -7) * u, p + Vector2(6, 0) * u, p + Vector2(0, 7) * u, p + Vector2(-6, 0) * u])
	draw_colored_polygon(d, Color(col, 0.35))
	draw_polyline(d + PackedVector2Array([d[0]]), col, 1.5 * u)
	for k in 6:
		draw_rect(Rect2(p.x - 0.5 * u, p.y - (12 + k * 6) * u, 1.0 * u, 3.0 * u), Color(col, 0.8 - k * 0.12))


## True if a bomb already falling will take this target out (guided onto it,
## or predicted to land on it), so the sight and the cue move on to the next.
func _claimed(t: GroundTarget) -> bool:
	var r := aircraft.data.bomb_blast_radius_m + t.half_width_m
	for b in _falling:
		if not is_instance_valid(b) or b.is_queued_for_deletion():
			continue
		if not is_nan(b.guide_x) and is_equal_approx(b.guide_x, t.x_m):
			return true
		if is_nan(b.guide_x) and absf(b.predicted_x - t.x_m) <= r:
			return true
	return false


## Missiles: the nearest live target (not already taken) between the minimum
## and maximum range ahead of the jet, or null.
func missile_target() -> GroundTarget:
	var d := aircraft.data
	var best: GroundTarget = null
	for t in targets:
		var dx := t.x_m - aircraft.pos_m.x
		if not t.destroyed and dx >= d.missile_range_min_m and dx <= d.missile_range_max_m and not _claimed(t) \
				and (best == null or t.x_m < best.x_m):
			best = t
	return best


## Guided bombs: the live target nearest x within the guidance reach (not
## already taken by a falling bomb), or null.
func guided_target_near(x: float) -> GroundTarget:
	var best: GroundTarget = null
	var reach := aircraft.data.bomb_guidance_reach_m
	for t in targets:
		if not t.destroyed and absf(t.x_m - x) <= reach and not _claimed(t) \
				and (best == null or absf(t.x_m - x) < absf(best.x_m - x)):
			best = t
	return best


## Unguided release cue for the next live target ahead: {seconds} until a bomb
## released now would land on its middle (negative = late), {window} = +- seconds
## that still hit it. Empty if there is none.
func next_release() -> Dictionary:
	var vx := aircraft.velocity_m.x
	if vx < 1.0:
		return {}
	var out := {}
	for t in targets:
		if t.destroyed or _claimed(t):
			continue
		var window := (aircraft.data.bomb_blast_radius_m + t.half_width_m) / vx
		var s := (t.x_m - impact_x) / vx
		if s > -window - 1.5 and (out.is_empty() or s < out.seconds):
			out = {"seconds": s, "window": window, "target": t}
	return out


## The live target a bomb hitting x would destroy, or null.
func target_at(x: float) -> GroundTarget:
	var r := aircraft.data.bomb_blast_radius_m
	for t in targets:
		if not t.destroyed and absf(x - t.x_m) <= r + t.half_width_m:
			return t
	return null


func _on_bomb_released(pos: Vector2, vel: Vector2, world: Node2D, draw_before: Node) -> void:
	var d := aircraft.data
	var b: Bomb
	if d.weapon_is_missile:
		var m := Missile.new()
		var t := missile_target()
		if t:
			m.guide_x = t.x_m
		m.drop_s = d.missile_drop_s
		m.burn_s = d.missile_burn_s
		m.speed_ms = d.missile_speed_ms
		m.accel = d.missile_accel
		m.turn_deg_s = d.missile_turn_deg_s
		m.loft = d.missile_loft
		m.loft_max_m = d.missile_loft_max_m
		b = m
	else:
		b = Bomb.new()
		if d.bomb_guided:
			var t := guided_target_near(Bomb.predict_impact_x(pos, vel, d.bomb_drag))
			if t:
				b.guide_x = t.x_m
				b.guide_accel = d.bomb_guidance_accel
		elif d.bomb_scatter_ms > 0.0:
			vel.x += _rng.randf_range(-d.bomb_scatter_ms, d.bomb_scatter_ms)
	b.pos_m = pos
	b.vel_m = vel
	b.drag = d.bomb_drag
	b.texture = d.weapon_sprite
	b.draw_scale = d.sprite_scale * bomb_draw_scale
	b.impacted.connect(_on_impact)
	world.add_child(b)
	world.move_child(b, draw_before.get_index())
	_falling.append(b)
	bombs_in_air += 1
	_release.pitch_scale = 1.6
	_release.volume_db = -10.0
	_release.play()
	if d.weapon_is_missile:
		if is_nan(b.guide_x):
			hud.messages.say("Fired with NO target?! Wasted! Wait for IN RANGE!", true)
		else:
			hud.messages.say("MAGNUM! %s away!" % d.weapon_name, true)
	elif not _said.has("first_drop"):
		_said["first_drop"] = true
		hud.messages.say("Bomb away! Watch it fall...", true)


## Predicted impact x (m) of every bomb still falling.
func falling_impacts() -> PackedFloat32Array:
	var out := PackedFloat32Array()
	for b in _falling:
		if is_instance_valid(b) and not b.is_queued_for_deletion():
			if b is Missile:
				if not is_nan(b.guide_x):
					out.append(b.guide_x)
			else:
				out.append(b.predicted_x)
	return out


func _on_impact(x: float) -> void:
	bombs_in_air -= 1
	var still: Array = []
	for b in _falling:
		if is_instance_valid(b) and not b.is_queued_for_deletion():
			still.append(b)
	_falling = still
	var fx := Node2D.new()
	fx.set_script(preload("res://scenes/world/crash_effect.gd"))
	fx.severity = 0.85
	fx.position = Vector2(x * WorldScale.PX_PER_M, 0.0)
	fx.scale = Vector2(explosion_scale, explosion_scale)
	get_parent().add_child(fx)
	_since_impact = 0.0
	_boom.volume_db = -4.0
	_boom.play()
	if aircraft.crashed:
		return
	var hit := target_at(x)
	if hit:
		hit.destroy()
		var left := targets.size() - targets_destroyed
		if left == 0:
			hud.messages.say("ALL TARGETS DESTROYED! Sh*t hot, %s! Now don't crash on the way home!" % GameState.pilot_call(), true)
		else:
			hud.messages.say("TARGET DESTROYED! %d to go. Next one under the cross!" % left, true)
	else:
		var miss := INF
		for t in targets:
			if not t.destroyed:
				miss = minf(miss, absf(x - t.x_m) - t.half_width_m)
		if miss < INF:
			hud.messages.say("MISSED by %d m! %s" % [roundi(maxf(miss, 1.0)), ("Fire only when IN RANGE!" if aircraft.data.weapon_is_missile else "Target IN the bracket, then drop!") if aircraft.data.bomb_guided else "Drop ON the cue, d*mn it!"], true)


func _reveal() -> void:
	is_revealed = true
	revealed.emit()
	var dest: String = hud.destination.short_name.capitalize()
	var km := maxf(recovery_x_m - aircraft.pos_m.x, 0.0) / 1000.0
	var hits := targets_destroyed
	var lead := "Attack over, %d of %d hit." % [hits, targets.size()] if hits < targets.size() else "Job done."
	# Short message so the bomb-hit call before it can still be read.
	await get_tree().create_timer(2.5 if hits > 0 else 0.5).timeout
	if is_instance_valid(hud) and not hud.flight_over:
		hud.messages.say("%s Land at %s, %.1f km ahead. Gear, flaps, GO!" % [lead, dest, km], true)


func _once(key: String, text: String) -> void:
	if not _said.has(key):
		_said[key] = true
		hud.messages.say(text, true)
