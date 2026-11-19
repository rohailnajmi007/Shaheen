// Air-to-ground aiming aids, ported from the Godot bomb_sight.gd and release_cue.gd.
// Both draw in the Godot HUD's own units (8 px text) and are scaled to their canvas.
//
// BOMB SIGHT (guided weapons: F-16A GBU-12, F-16D HARM), shown in the radar's place
// during the target run. In side view a bomb's impact point is far off screen, so
// this shows a zoomed stretch of ground centred on where a bomb released NOW would
// land: cross = impact point, bracket = how far a guided bomb can steer, targets
// slide in from the right, white bars = where falling bombs will hit. Target in the
// bracket = IN RANGE: press Space. Missile (HARM): the ground ahead of the jet
// instead (jet symbol on the left), the bracket is the missile's range band, and
// the seeker state (SAFE / SEARCH / SEEKING / LOCKED).
//
// RELEASE CUE (unguided: Mirage V Mk 82): a timing bar instead of a sight. The
// marker slides toward the green window (the real hit window at this speed);
// "DROP IN x.x", flashing DROP! in the window, LATE after it.

const FONT8 = '600 8px "Chakra Petch", sans-serif';
const FONT16 = '600 16px "Chakra Petch", sans-serif';
const rgba = (r, g, b, a = 1) => `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;

export const SIGHT = {
  rangeM: 900, // metres of ground shown each side of the impact point (bombs)
  logicalH: 70, // sight height in Godot px (its width follows the canvas)
  glass: rgba(0.03, 0.07, 0.04), frame: rgba(0.22, 0.24, 0.23), frameLight: rgba(0.4, 0.43, 0.41),
  ink: [0.45, 1, 0.45], target: rgba(1, 0.45, 0.3), inRange: [1, 0.85, 0.3],
};

export const CUE = {
  showFromS: 8, // seconds before release when the cue appears
  barSeconds: 6, // the bar's full length
  w: 150, h: 48, // Godot px
  panel: rgba(0.06, 0.07, 0.08, 0.82), frame: rgba(0.45, 0.47, 0.5),
  ink: [1, 0.85, 0.45], drop: [0.45, 1, 0.45], late: [1, 0.35, 0.25],
};

const ink = (c, a = 1) => rgba(c[0], c[1], c[2], a);
const dprOf = () => Math.min(window.devicePixelRatio || 1, 2);

function text(c, x, y, s, col, font = FONT8, align = 'left') {
  c.font = font; c.textAlign = align; c.textBaseline = 'alphabetic'; c.fillStyle = col; c.fillText(s, x, y);
}
function poly(c, pts, col) {
  c.fillStyle = col; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill();
}

// Draws the bomb sight over the whole canvas (the radar's canvas, already sized).
export function drawBombSight(cv, f, time) {
  const c = cv.getContext('2d');
  const k = cv.height / SIGHT.logicalH;
  const W = cv.width / k, H = SIGHT.logicalH;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, cv.width, cv.height);
  c.setTransform(k, 0, 0, k, 0, 0);
  const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  R(0, 0, W, H, SIGHT.frame);
  R(1, 1, W - 2, H - 2, SIGHT.frameLight);
  R(2, 2, W - 4, H - 4, SIGHT.frame);
  const sr = { x: 5, y: 5, w: W - 10, h: H - 10 };
  R(sr.x, sr.y, sr.w, sr.h, SIGHT.glass);

  const a = f.ac;
  const d = f.data;
  const m = d.missile;
  const missile = d.weaponIsMissile;
  const aim = missile ? null : f.bombImpact();
  // Bombs: centred on the impact point. Missile: from just behind the jet to past max range.
  const centreX = missile ? a.pos.x + m.rangeMax * 0.5 : aim ? aim.x : a.pos.x;
  const span = missile ? m.rangeMax * 0.5 + 500 : SIGHT.rangeM;
  const groundY = sr.y + sr.h - 7;
  const halfW = sr.w * 0.5 - 3;
  const mid = sr.x + sr.w * 0.5;
  const toX = (mm) => mid + ((mm - centreX) / span) * halfW;
  R(sr.x + 2, groundY, sr.w - 4, 1, ink(SIGHT.ink, 0.6));
  // Tick every 100 m (500 m for the missile), longer every 5th, so the ground's speed shows.
  const tick = missile ? 500 : 100;
  for (let mm = Math.ceil((centreX - span) / tick) * tick; mm <= centreX + span; mm += tick) {
    R(Math.round(toX(mm)), groundY + 1, 1, Math.round(mm) % (tick * 5) === 0 ? 4 : 2, ink(SIGHT.ink, 0.45));
  }

  const have = a.bombsLeft > 0;
  const mState = missile ? f.missileState() : null;
  const inRange = have && (missile ? mState === 'locked' : !!(aim && f.guidedTargetNear(aim.x)));
  // Bracket: guided-bomb reach around the impact point, or the missile's range band.
  if (have && (!missile || mState !== 'safe')) {
    const col = inRange ? ink(SIGHT.inRange) : ink(SIGHT.ink, 0.7);
    const edges = missile
      ? [toX(a.pos.x + m.rangeMin), toX(a.pos.x + m.rangeMax)]
      : [mid - (d.guidanceReachM / span) * halfW, mid + (d.guidanceReachM / span) * halfW];
    edges.forEach((e, i) => {
      const bx = Math.round(e);
      R(bx, groundY - 9, 1, 8, col);
      R(bx - (i === 1 ? 2 : 0), groundY - 9, 3, 1, col);
    });
  }

  // Targets (arrows at the edges when off the screen).
  const lo = sr.x + 4, hi = sr.x + sr.w - 4;
  const seekT = missile ? f.seeker.target : null;
  for (const t of f.targets) {
    const tx = toX(t.x);
    if (!t.alive) {
      if (tx > lo && tx < hi) {
        c.strokeStyle = ink(SIGHT.ink, 0.35); c.lineWidth = 1; c.beginPath();
        c.moveTo(tx - 2, groundY - 4); c.lineTo(tx + 2, groundY - 1); c.moveTo(tx - 2, groundY - 1); c.lineTo(tx + 2, groundY - 4); c.stroke();
      }
      continue;
    }
    if (tx < lo) poly(c, [[lo - 1, groundY - 3], [lo + 3, groundY - 6], [lo + 3, groundY]], SIGHT.target);
    else if (tx > hi) poly(c, [[hi + 1, groundY - 3], [hi - 3, groundY - 6], [hi - 3, groundY]], SIGHT.target);
    else {
      const half = Math.max(((t.w / 2) / span) * halfW, 1.5);
      R(Math.round(tx - half), groundY - 5, Math.round(half * 2), 5, SIGHT.target);
      // Missile seeker box on its target: blinking while seeking, solid when locked.
      if (t === seekT && (mState === 'locked' || time % 0.3 < 0.18)) {
        c.strokeStyle = mState === 'locked' ? ink(SIGHT.inRange) : ink(SIGHT.ink, 0.9); c.lineWidth = 1;
        c.strokeRect(Math.round(tx) - 4.5, groundY - 9.5, 9, 10);
      }
    }
  }

  // Weapons already falling: where they will hit.
  for (const x of f.fallingImpacts()) {
    const bx = toX(x);
    if (bx > sr.x + 2 && bx < sr.x + sr.w - 2) R(bx - 1, groundY - 13, 2, 8, 'rgba(255,255,255,0.85)');
  }

  // Jet symbol (missile view), or the impact cross (bombs).
  if (missile) {
    const jx = Math.round(toX(a.pos.x));
    R(jx - 4, sr.y + 26, 9, 1, ink(SIGHT.ink));
    R(jx - 4, sr.y + 24, 1, 2, ink(SIGHT.ink));
    R(jx - 1, sr.y + 27, 3, 1, ink(SIGHT.ink));
  } else if (have) {
    const col = inRange ? SIGHT.inRange : SIGHT.ink;
    const cx = Math.round(mid);
    R(cx, sr.y + 22, 1, groundY - sr.y - 22, ink(col, 0.4));
    R(cx - 4, groundY - 3, 9, 1, ink(col));
    R(cx - 1, groundY - 5, 3, 5, ink(col));
  }

  // Text: title / status, distance to the next target, weapons left.
  const blink = time % 0.5 < 0.32;
  let title = d.weaponName || 'BOMB SIGHT';
  let titleCol = ink(SIGHT.ink, 0.85);
  if (inRange) {
    title = blink ? (missile ? 'LOCKED - FIRE!' : 'IN RANGE - DROP!') : '';
    titleCol = ink(SIGHT.inRange);
  } else if (!have) title = missile ? 'MISSILE AWAY' : 'BOMBS FALLING';
  else if (missile) {
    if (mState === 'safe') { title = 'SAFE - GEAR UP'; titleCol = ink(SIGHT.inRange, 0.85); }
    else if (mState === 'seeking') title = blink ? 'SEEKING...' : '';
  }
  text(c, sr.x + 3, sr.y + 9, title, titleCol);
  const dist = f.distanceToNextTarget();
  text(c, sr.x + 3, sr.y + 19, dist < Infinity ? `TGT ${(dist / 1000).toFixed(1)} KM` : 'NO TARGETS', ink(SIGHT.ink, 0.7));
  text(c, sr.x + sr.w - 3, sr.y + 19, `${a.bombsLeft} LEFT`, ink(SIGHT.ink, 0.7), FONT8, 'right');
}

// Unguided release cue: its own small canvas, fixed on screen right of the aircraft.
export class ReleaseCue {
  constructor(canvas) {
    this.cv = canvas;
    this.time = 0;
    this.shown = false;
  }

  // The cue for this frame, or null (hidden).
  cueFor(f) {
    const a = f.ac;
    if (f.mode !== 'strike' || f.revealed || f.data.bombGuided || a.bombsLeft <= 0 || a.onGround || a.crashed) return null;
    const cue = f.nextRelease();
    return cue && cue.seconds < CUE.showFromS ? cue : null;
  }

  update(f, dt) {
    this.time += dt;
    const cue = this.cueFor(f);
    if (!!cue !== this.shown) { this.shown = !!cue; this.cv.classList.toggle('show', this.shown); }
    if (!cue) return;
    const cv = this.cv;
    const dpr = dprOf();
    const w = Math.round(cv.clientWidth * dpr), h = Math.round(w * CUE.h / CUE.w);
    if (w > 0 && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
    const k = cv.width / CUE.w;
    const c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    c.setTransform(k, 0, 0, k, 0, 0);
    const W = CUE.w, H = CUE.h;
    const s = cue.seconds, win = cue.window;
    c.fillStyle = CUE.panel; c.fillRect(0, 0, W, H);
    c.strokeStyle = CUE.frame; c.lineWidth = 1; c.strokeRect(0.5, 0.5, W - 1, H - 1);
    // Bar: left = barSeconds to go, the green window near the right end.
    const bar = { x: 6, y: H - 13, w: W - 12, h: 7 };
    const toX = (sec) => bar.x + bar.w * (1 - (sec + 1) / (CUE.barSeconds + 1));
    c.fillStyle = rgba(0.18, 0.19, 0.2); c.fillRect(bar.x, bar.y, bar.w, bar.h);
    const g0 = toX(win), g1 = toX(-win);
    c.fillStyle = ink(CUE.drop, 0.55); c.fillRect(g0, bar.y, Math.max(g1 - g0, 2), bar.h);
    const mx = Math.min(Math.max(toX(s), bar.x), bar.x + bar.w - 1);
    const inWindow = Math.abs(s) <= win;
    const late = s < -win;
    const col = ink(inWindow ? CUE.drop : late ? CUE.late : CUE.ink);
    c.fillStyle = col; c.fillRect(Math.round(mx) - 1, bar.y - 3, 3, bar.h + 6);
    const blink = this.time % 0.4 < 0.26;
    let t = inWindow ? 'DROP!' : late ? 'LATE' : `DROP IN ${s.toFixed(1)}`;
    if (inWindow && !blink) t = '';
    text(c, 6, 10, 'RELEASE CUE', ink(CUE.ink, 0.7));
    text(c, W / 2, 27, t, col, FONT16, 'center');
  }

  hide() { this.shown = false; this.cv.classList.remove('show'); }
}
