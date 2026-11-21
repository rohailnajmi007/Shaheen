// On-screen controls for touch screens (owner 2026-11-20, after Air Offense Command):
// - left: a pitch slider with heft. The finger sets where the handle should go; the
//   handle follows on a damped spring (not instantly), and pitch = how far it sits from
//   the middle (up = nose up). Let go and it settles back to the middle.
// - right: a few round buttons that change with the phase of flight (ground, take-off,
//   attack, cruise, landing), plus the throttle slider at the right edge.
// Shown on coarse-pointer (touch) screens, or on any screen with ?touch=1 in the URL.

// Slider feel. stiffness (1/s^2) and damping (1/s) of the spring pulling the handle to
// the finger; release* = the slower spring back to the middle. damping 2*sqrt(stiffness)
// = no overshoot. deadzone = handle offset that still counts as zero.
export const PITCH_SLIDER = {
  stiffness: 75, damping: 17, releaseStiffness: 32, releaseDamping: 11, deadzone: 0.04, // owner: 30/11 too slow
};
// Landing phase: the destination is revealed and this close ahead (m).
export const LANDING_PHASE_M = 6000;

const svg = (body, w = 2) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  engine: svg('<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>'),
  gear: svg('<path d="M12 3v7M8 3h8"/><circle cx="12" cy="15.5" r="5.5"/><circle cx="12" cy="15.5" r="1.6" fill="currentColor"/>'),
  brake: svg('<circle cx="12" cy="12" r="5.5"/><path d="M5.5 5.5a9.2 9.2 0 0 0 0 13M18.5 5.5a9.2 9.2 0 0 1 0 13"/>'), // brake warning symbol
  fire: svg('<circle cx="12" cy="12" r="7"/><path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
  gun: svg('<path d="M3 21V11Q3 6 5 3Q7 6 7 11V21Z"/><path d="M3 12h4"/><path d="M10 21V11Q10 6 12 3Q14 6 14 11V21Z"/><path d="M10 12h4"/><path d="M17 21V11Q17 6 19 3Q21 6 21 11V21Z"/><path d="M17 12h4"/>', 1.6), // three rounds
  flares: svg('<circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.8 2.8M16.2 16.2 19 19M5 19l2.8-2.8M16.2 7.8 19 5"/>'),
  pause: svg('<path d="M9 5v14M15 5v14"/>'),
};
// id: [label, icon, kind ('act' one press | 'hold'), input action]
const BUTTONS = {
  fire: ['FIRE', 'fire', 'act', 'drop'],
  gun: ['GUN', 'gun', 'hold', 'gun'],
  flares: ['FLARES', 'flares', 'act', 'countermeasure'],
  gear: ['GEAR', 'gear', 'act', 'gear'],
  engine: ['ENGINE', 'engine', 'act', 'engine'],
  brake: ['BRAKE', 'brake', 'hold', 'brake'],
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const isTouch = () => /[?&]touch=1/.test(location.search) || matchMedia('(pointer: coarse)').matches;

export class TouchControls {
  constructor(root, input) {
    this.root = root;
    this.input = input;
    root.innerHTML = `
      <div class="pslider">
        <span class="plab up">NOSE UP</span>
        <div class="ptrack"><i></i></div>
        <div class="pthumb"><b></b><b></b><b></b></div>
        <span class="plab dn">NOSE DOWN</span>
      </div>
      <button class="tpause" aria-label="Pause">${ICONS.pause}</button>
      <div class="tbtns">${Object.entries(BUTTONS).map(([id, [label, icon]]) =>
        `<button class="tb tb-${id}" data-id="${id}">${ICONS[icon]}<span>${label}</span></button>`).join('')}</div>
      <input class="tthr" type="range" min="0" max="100" value="0" aria-label="Throttle" />
      <span class="tthr-lab">THR</span>`;
    const q = (s) => root.querySelector(s);
    this.slider = q('.pslider');
    this.track = q('.ptrack');
    this.thumb = q('.pthumb');
    this.thr = q('.tthr');
    this.btn = {};
    for (const b of root.querySelectorAll('.tb')) this.btn[b.dataset.id] = b;
    this.pos = 0; this.vel = 0; this.target = 0; this.held = false; this.halfH = 1;
    this.phase = '';
    this.shown = '';
    this.on = isTouch();
    root.classList.toggle('on', this.on);
    new ResizeObserver(() => { this.halfH = Math.max(1, (this.track.clientHeight - this.thumb.clientHeight) / 2); }).observe(this.track);
    this.setupSlider();
    this.setupButtons();
    q('.tpause').addEventListener('pointerdown', (e) => { e.preventDefault(); input.press('pause'); });
    this.thr.addEventListener('input', () => { input.touch.throttleSet = this.thr.value / 100; });
  }

  setupSlider() {
    const s = this.slider;
    const aim = (e) => {
      const r = this.track.getBoundingClientRect();
      this.target = clamp((r.top + r.height / 2 - e.clientY) / Math.max(1, this.halfH), -1, 1);
    };
    s.addEventListener('pointerdown', (e) => { e.preventDefault(); s.setPointerCapture(e.pointerId); this.held = true; aim(e); });
    s.addEventListener('pointermove', (e) => { if (this.held) aim(e); });
    const up = () => { this.held = false; this.target = 0; };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) s.addEventListener(ev, up);
  }

  setupButtons() {
    const inp = this.input;
    for (const [id, b] of Object.entries(this.btn)) {
      const [, , kind, act] = BUTTONS[id];
      if (kind === 'act') {
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); inp.press(act); b.classList.add('active'); setTimeout(() => b.classList.remove('active'), 140); });
        continue;
      }
      const set = (v) => { inp.touch[act] = v; b.classList.toggle('active', v); };
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); set(true); });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
    }
  }

  // Which buttons this moment of the flight needs (first = the big one).
  buttonsFor(f) {
    const a = f.ac;
    if (f.state === 'done' || a.crashed || a.shotDown) return [];
    const strike = f.mode === 'strike';
    if (a.onGround) return f.state === 'preflight' || !a.engineOn ? ['engine', 'brake'] : ['brake', 'engine'];
    const list = [];
    if (!a.engineOn) list.push('engine');
    // Air to air (owner 2026-11-21), gear up until the fight is over: gun, and the
    // air brake to make him overshoot. Take-off and landing: the usual buttons.
    if (f.mode === 'dogfight' && !f.revealed && a.gearPos <= 0) return [...list, 'gun', 'flares', 'brake'];
    // Attack (owner): fire, gun, flares only.
    if (strike && !f.revealed && a.gearPos <= 0) return [...list, 'fire', 'gun', 'flares'];
    const toGo = f.dest.x - a.pos.x;
    const landing = f.revealed && toGo < LANDING_PHASE_M && toGo > -f.dest.runwayM;
    if (landing || a.gearDown) return [...list, 'gear', 'brake', ...(strike && !landing ? ['flares'] : [])];
    return [...list, ...(strike ? ['flares', 'gun'] : []), 'gear', 'brake'];
  }

  update(f, dt) {
    if (!this.on) return;
    const a = f.ac;
    // Pitch slider: damped spring toward the finger (or back to the middle).
    const P = PITCH_SLIDER;
    const k = this.held ? P.stiffness : P.releaseStiffness;
    const c = this.held ? P.damping : P.releaseDamping;
    const h = Math.min(dt, 0.05);
    this.vel += (k * (this.target - this.pos) - c * this.vel) * h;
    this.pos = clamp(this.pos + this.vel * h, -1, 1);
    if (Math.abs(this.pos) === 1) this.vel = 0;
    const p = Math.abs(this.pos) < P.deadzone ? 0 : this.pos;
    this.input.touch.pitch = p;
    this.thumb.style.transform = `translate(-50%, calc(-50% + ${(-this.pos * this.halfH).toFixed(1)}px))`;
    this.slider.classList.toggle('held', this.held);
    // Phase buttons: slot 0 is the big one, the rest arc round it.
    const list = this.buttonsFor(f);
    const key = list.join(',');
    if (key !== this.shown) {
      this.shown = key;
      for (const [id, b] of Object.entries(this.btn)) {
        const i = list.indexOf(id);
        b.classList.toggle('show', i >= 0);
        if (i >= 0) b.dataset.slot = i;
        // A hold button that disappears under the finger lets go.
        if (i < 0 && BUTTONS[id][2] === 'hold' && b.classList.contains('active')) { this.input.touch[BUTTONS[id][3]] = false; b.classList.remove('active'); }
      }
    }
    this.label('gear', a.gearDown ? 'GEAR UP' : 'GEAR DN');
    this.label('engine', a.engineOn ? 'ENG OFF' : 'ENG ON');
    this.btn.fire.classList.toggle('hot', f.mode === 'strike' && this.fireHot(f));
    if (document.activeElement !== this.thr) this.thr.value = Math.round(a.throttle * 100);
  }

  label(id, t) {
    const b = this.btn[id];
    if (b._t === t) return;
    b._t = t;
    b.querySelector('span').textContent = t;
  }

  // Lights up (steady) once the weapon is locked on / will hit.
  fireHot(f) {
    if (f.ac.bombsLeft <= 0) return false;
    if (f.data.weaponIsMissile) return f.missileState() === 'locked';
    const imp = f.ac.onGround ? null : f.bombImpact();
    return !!(imp && imp.onTarget);
  }
}
