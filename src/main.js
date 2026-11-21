import './style.css';
import { loadImages, buildSoftSprites } from './render/assets.js';
import { Renderer } from './render/renderer.js';
import { Flight } from './sim/flight.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Hud } from './ui/hud.js';
import { Menu, Pause, Result, Briefing, loadSettings, saveSettings, getBest, setBest } from './ui/screens.js';
import { AIRCRAFT, aircraftById } from './data/aircraft.js';
import { BASES } from './data/world.js';
import { EJECT } from './data/combat.js';

const STEP = 1 / 120;

const canvas = document.getElementById('game');
const settings = loadSettings();
const input = new Input();
const sound = new Sound();
sound.setVolumes(settings.vol);
const renderer = new Renderer(canvas);
renderer.quality = settings.quality;

let mode = 'menu';
let flight = null;
let flightOpts = null;
let acc = 0;
let last = performance.now();
let endTimer = -1;
let demoT = 0;
let fpsEl = null;
let fps = { n: 0, t: 0, v: 0 };

const hud = new Hud(document.getElementById('hud'), input);
const menu = new Menu(document.getElementById('menu'), settings, {
  onFly: (o) => startFlight(o),
  onChange: (o) => setupDemo(o),
  sound,
});
const pause = new Pause(document.getElementById('pause'), settings, {
  onResume: () => togglePause(false),
  onRestart: () => { togglePause(false); startFlight(flightOpts); },
  onMenu: () => toMenu(true),
  onVolume: (k, v) => { settings.vol[k] = v; sound.setVolumes(settings.vol); saveSettings(settings); },
  onQuality: (q) => { settings.quality = q; renderer.quality = q; saveSettings(settings); renderer.resize(); },
});
const result = new Result(document.getElementById('result'), {
  onRetry: () => startFlight(flightOpts),
  onMenu: () => toMenu(true),
});
const briefing = new Briefing(document.getElementById('briefing'), {
  onStart: () => { briefing.hide(); last = performance.now(); },
  onMenu: () => { briefing.hide(); toMenu(); },
});

function setupDemo(o) {
  // Backdrop: the selected aircraft's home base.
  const d = aircraftById(o.aircraft);
  const home = BASES[d.homeBase] || BASES.risalpur;
  renderer.setupWorld({
    bases: [{ ...home, x: 0, visible: true }],
    themeStops: [{ x: -1000, theme: home.theme }, { x: 99999, theme: home.theme }],
    timeId: o.time,
  });
  renderer.cam.zoom = 0.9;
  const others = AIRCRAFT.filter((a) => a.id !== d.id && a.id !== 'mushshak');
  demoPlanes = [d, others[0], others[1]];
}
let demoPlanes = [];

function startFlight(o) {
  renderer.resetScale();
  sound.unlock();
  flightOpts = o;
  flight = new Flight({ aircraftId: o.aircraft, mode: o.mode, dest: o.dest, name: o.name, opponent: o.opponent });
  renderer.setupWorld({ bases: flight.bases, themeStops: flight.themeStops, timeId: o.time });
  renderer.cam.zoom = 1; renderer.cam.look = 0; renderer.cam.lead = 0;
  renderer.burnX = null;
  sound.startFlight(flight.data);
  hud.start(flight, o);
  menu.hide(); result.hide(); pause.hide();
  briefing.show(flight, o);
  mode = 'flight';
  endTimer = -1;
  acc = 0;
}

// front: back to the mission page of the start screen, the one after the name (owner
// 2026-11-21: from a mission, not the sortie order); the briefing's Esc goes back to the order instead.
function toMenu(front = false) {
  sound.stopFlight();
  pause.hide(); result.hide(); hud.hide(); briefing.hide();
  flight = null;
  mode = 'menu';
  setupDemo(settings);
  if (front) menu.step = menu.named() ? 1 : 0; // the mission page (owner 2026-11-21), or the name if none yet
  menu.refresh();
  menu.show();
}

function togglePause(on = !pause.open) {
  if (mode !== 'flight') return;
  if (on) { pause.show(); sound.ctx?.suspend(); sound.pauseSong(true); } else { pause.hide(); sound.ctx?.resume(); sound.pauseSong(false); last = performance.now(); }
}

function soundFx(f) {
  for (const e of f.fx) {
    switch (e.type) {
      case 'touchdown': sound.thump(Math.min(1, e.fpm / f.data.hardFpm)); break;
      case 'explosion': sound.explosion(e.big ? 1 : 0.7); break;
      case 'crash': sound.explosion(0.5 + e.severity * 0.5); sound.playCrashSong(); break;
      case 'gear': sound.gearMotor(f.data.gearTransitS); break;
      case 'gearLocked': sound.clunk(); break;
      case 'missileLaunch': sound.whoosh(); break;
      case 'bombRelease': sound.clunk(); break;
      case 'engineStart': sound.click(); break;
      case 'revealed': sound.chime(true); break;
      case 'refuelDone': sound.chime(true); break;
      case 'aaaFire': sound.aaaThud(Math.max(0.15, 1 - e.dist / 2500)); break;
      case 'banditGun': sound.aaaThud(Math.max(0.2, 1 - e.dist / 2000)); break;
      case 'banditDown': sound.explosion(0.8); break;
      case 'samLaunch': sound.launch(); break;
      case 'countermeasure': sound.pop(); break;
      case 'eject': sound.launch(); sound.clunk(); break;
      case 'chute': sound.burst({ freq: 500, dur: 0.5, vol: 0.3 }); break;
      case 'sonicBoom': sound.sonicBoom(); break;
      case 'cleared': sound.chime(true); break;
      case 'acHit': sound.metalHit(e.bandit ? 0.45 : 1); break;
      case 'airBurst': sound.explosion(0.45 * (e.power || 1)); break;
      default: break;
    }
  }
}

function handleActions() {
  for (const a of input.actions()) {
    if (mode === 'menu') continue;
    if (briefing.open) {
      if (a === 'pause') { briefing.hide(); toMenu(); }
      continue;
    }
    if (result.open) {
      if (a === 'restart') startFlight(flightOpts);
      if (a === 'pause') toMenu(true);
      continue;
    }
    if (a === 'pause') { togglePause(); continue; }
    if (pause.open) { if (a === 'restart') { togglePause(false); startFlight(flightOpts); } continue; }
    if (a === 'restart') { startFlight(flightOpts); continue; }
    if (a === 'zoom') { const z = [1, 0.7, 1.35]; renderer.cam.userZoom = z[(z.indexOf(renderer.cam.userZoom) + 1) % z.length]; continue; }
    if (a === 'hud') { hud.toggleKeys(); continue; }
    if (a === 'mute') { sound.toggleMute(); continue; }
    flight.action(a);
  }
}

addEventListener('keydown', (e) => {
  sound.unlock();
  if (briefing.open && e.code === 'Enter' && !briefing.fresh) { e.preventDefault(); briefing.next(); return; }
  if (result.open && e.code === 'Enter') { e.preventDefault(); startFlight(flightOpts); }
  if (e.code === 'F3') { e.preventDefault(); fpsEl.classList.toggle('show'); }
});
addEventListener('pointerdown', () => sound.unlock());
addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'flight' && !result.open) togglePause(true); });

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  fps.n++; fps.t += dt;
  if (fps.t > 0.5) { fps.v = Math.round(fps.n / fps.t); fps.n = 0; fps.t = 0; fpsEl.textContent = `${fps.v} FPS · ${canvas.width}×${canvas.height}`; }
  handleActions();
  if (mode === 'menu') {
    demoT += dt;
    renderer.renderDemo(demoT, dt, demoPlanes);
    return;
  }
  if (pause.open) return;
  if (briefing.open) { renderer.renderFlight(flight, 0, dt); return; } // waits for the pilot
  acc += dt;
  const st = input.state();
  while (acc >= STEP) {
    flight.step(STEP, st);
    acc -= STEP;
  }
  renderer.renderFlight(flight, acc / STEP, dt);
  renderer.noteFrame(dt);
  soundFx(flight);
  for (const e of flight.fx) {
    if (e.type === 'end') endTimer = e.result.grade === 'CRASH' ? 3.5 : 1.2; // crash: time to watch the wreck settle
  }
  flight.fx.length = 0;
  const a = flight.ac;
  const cb = flight.armed ? flight.cb : null;
  sound.update(a, a.onGround, {
    // Engine silent once the flight is over or the jet crashed (owner 2026-11-21).
    engineOff: a.crashed || flight.state === 'done',
    stall: a.stalled && !a.onGround && !a.crashed, gear: a.gearWarning && !a.crashed,
    gun: !!cb && cb.firing, lock: !!cb && cb.radarLock, missile: !!cb && !a.crashed && cb.incoming().length > 0,
  });
  hud.update(dt, sound);
  if (endTimer > 0) {
    endTimer -= dt;
    // Ejected: hold the debrief until the pilot is down (or EJECT.resultWaitS).
    const e = flight.eject;
    if (endTimer <= 0 && e && !e.landed && e.t < EJECT.resultWaitS) endTimer = 0.1;
    if (endTimer <= 0) {
      const r = flight.result;
      const nb = setBest(flightOpts, r.score);
      result.show(r, flightOpts, nb && r.score > 0, getBest(flightOpts));
    }
  }
}

async function boot() {
  fpsEl = document.getElementById('fps');
  await Promise.all([loadImages(), document.fonts.load('600 16px "Chakra Petch"').catch(() => {}), document.fonts.load('16px "Black Ops One"').catch(() => {})]);
  buildSoftSprites();
  setupDemo(settings);
  document.getElementById('loading').remove();
  menu.show();
  requestAnimationFrame((t) => { last = t; frame(t); });
}
boot();

if (import.meta.env.DEV) window.__shaheen = { get flight() { return flight; }, renderer, hud, input };
