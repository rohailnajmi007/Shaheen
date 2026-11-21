// Keyboard, gamepad and touch input mapped to game actions.

const HOLD = {
  throttleUp: ['ArrowUp', 'KeyW'],
  throttleDown: ['ArrowDown', 'KeyS'],
  pitchUp: ['ArrowLeft', 'KeyA'],
  pitchDown: ['ArrowRight', 'KeyD'],
  brake: ['KeyB'],
  gun: ['KeyV'],
};
const PRESS = {
  engine: ['KeyE'], gear: ['KeyG'], drop: ['Space'], countermeasure: ['KeyX'],
  pause: ['Escape', 'KeyP'], restart: ['KeyR'], zoom: ['KeyZ'], hud: ['KeyH'], mute: ['KeyM'],
};

// Only the controls that matter (owner 2026-11-20). Z zoom, H help, M mute, R restart
// still work. Third field: shown in air-to-ground only.
export const KEY_HELP = [
  ['↑ / ↓', 'Throttle (hold)'], ['← / →', 'Nose up / down'], ['E', 'Engine · eject when hit'],
  ['G', 'Gear (flaps follow)'], ['B', 'Brakes / air brake (hold)'],
  ['Space', 'Fire weapon', 'strike'], ['Space', 'Smoke on / off', 'smoke'], ['V', 'Gun (hold)', 'armed'], ['X', 'Flares + chaff', 'strike'], ['Esc', 'Pause'],
];

export class Input {
  constructor() {
    this.down = new Set();
    this.queue = [];
    this.touch = { pitch: 0, brake: false, gun: false, throttleSet: null };
    this.padPrev = [];
    this.usedTouch = false;
    this.enabled = true;
    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (Object.values(HOLD).flat().includes(e.code) || Object.values(PRESS).flat().includes(e.code)) e.preventDefault();
      if (!e.repeat) for (const [a, codes] of Object.entries(PRESS)) if (codes.includes(e.code)) this.queue.push(a);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
  }

  held(action) { return HOLD[action].some((c) => this.down.has(c)); }

  press(action) { this.queue.push(action); }

  // Drain one-shot actions.
  actions() {
    this.pollPad();
    const q = this.queue;
    this.queue = [];
    return q;
  }

  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = [...pads].find((x) => x && x.connected);
    this.pad = null;
    if (!p) return;
    const b = (i) => !!p.buttons[i]?.pressed;
    const map = { 0: 'drop', 2: 'countermeasure', 3: 'gear', 4: 'engine', 9: 'pause', 8: 'restart', 5: 'zoom' };
    for (const [i, a] of Object.entries(map)) {
      if (b(+i) && !this.padPrev[i]) this.queue.push(a);
    }
    this.padPrev = p.buttons.map((x) => x.pressed);
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    this.pad = {
      pitch: dz(p.axes[1] || 0),
      throttle: (p.buttons[7]?.value || 0) - (p.buttons[6]?.value || 0) + (b(12) ? 1 : 0) - (b(13) ? 1 : 0),
      brake: b(1),
    };
  }

  // Continuous controls for the flight model.
  state() {
    const k = (a) => (this.held(a) ? 1 : 0);
    let throttle = k('throttleUp') - k('throttleDown');
    let pitch = k('pitchUp') - k('pitchDown');
    let brake = this.held('brake');
    const gun = this.held('gun') || this.touch.gun; // gamepad buttons for the new controls: next chunk
    if (this.pad) {
      throttle += this.pad.throttle;
      pitch += this.pad.pitch;
      brake = brake || this.pad.brake;
    }
    pitch += this.touch.pitch;
    brake = brake || this.touch.brake;
    const st = { throttle: Math.max(-1, Math.min(1, throttle)), pitch: Math.max(-1, Math.min(1, pitch)), brake, gun, throttleSet: null };
    if (this.touch.throttleSet != null) { st.throttleSet = this.touch.throttleSet; this.touch.throttleSet = null; }
    return st;
  }
}
