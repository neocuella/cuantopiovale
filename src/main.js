import { model } from './lib/data.js';
import { runFor, hitosFor, todayUTC, addDays } from './lib/model.js';
import { fmtNum, fmtGsWords, fmtDate, fmtDateShort, fmtPeriod, unitsLabel } from './lib/format.js';
import { stateAt, progressForDay } from './lib/timeline.js';
import { buildCalendar } from './lib/calendar.js';
import { runSeconds } from './lib/config.js';
import { h, $, setChildren } from './ui/dom.js';
import { renderHero, renderAbout } from './ui/sections.js';
import { buildResult, buildDetails } from './ui/endcard.js';
import { createTimeline } from './ui/timeline.js';
import { createPicker } from './ui/picker.js';
import { Stepper, LEVELS } from './ui/stepper.js';
import { SITE_NAME, itemPath, itemIdFromPath } from './lib/share.js';

const items = model.items.filter((i) => i.enabled && i.usedCount > 0);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let hasWebGL = false;
let stage = null; // se crea la primera vez que hace falta
let hero = null; // la figura de la portada
let thumbs = {};
let selected = items[0];
let current = null; // corrida en curso
let picking = false; // las tarjetas están abiertas

// ——— Portada y datos ———

renderHero(model);
renderAbout(model);

// c/<id>/ (un enlace compartido) o ?item=<id>: esa tarjeta queda marcada al abrir las
// tarjetas, pero siempre se elige desde ahí; el botón nunca arranca directo con una cosa.
// ?item= gana porque es el que se actualiza al elegir otra cosa en la misma página.
const params = new URLSearchParams(location.search);
const wantId = params.get('item') || itemIdFromPath(location.pathname);
selected = items.find((i) => i.id === wantId) || selected;

/** Raíz del sitio, también desde c/<id>/ (las páginas por cosa que arma el build). */
const siteRoot = new URL(location.pathname.replace(/(?:c\/[^/]+\/?)?(?:index\.html)?$/, ''), location.origin);

const ctaBtn = $('#go-run');
ctaBtn.addEventListener('click', () => openPicker(selected));

// Los números y meses impresos en el calendario se dibujan una sola vez en una textura: antes hay
// que esperar a que Geist esté cargada (si tarda o falla, se usa la fuente del sistema).
const fontReady = Promise.race([
  document.fonts ? Promise.all([document.fonts.load('700 64px Geist'), document.fonts.load('800 64px Geist')]) : Promise.resolve(),
  new Promise((r) => setTimeout(r, 2500)),
]).catch(() => {});

// La figura de la portada se carga después de pintar el texto.
function heroFallback() {
  $('#hero-canvas').hidden = true;
  $('#hero-fallback').hidden = false;
  setChildren($('#hero-fallback-day'), fmtDateShort(todayUTC()).day);
  setChildren($('#hero-fallback-emoji'), items[0].emoji);
}
async function startHero() {
  let HeroStage;
  try {
    ({ HeroStage } = await import('./scene/hero.js'));
    await fontReady;
    hero = new HeroStage($('#hero-canvas'), { items, today: todayUTC(), reducedMotion: reducedMotion.matches });
    hero.setSuspended(!runEl.hidden);
    hasWebGL = true;
    if (import.meta.env.DEV) window.__hero = hero;
  } catch (e) {
    console.warn('La portada se muestra sin 3D', e);
    heroFallback();
    return;
  }
  // retratos de las tarjetas, sin apuro
  (window.requestIdleCallback || ((f) => setTimeout(f, 400)))(() => loadPortraits(), { timeout: 2500 });
}
(window.requestIdleCallback || ((f) => setTimeout(f, 30)))(() => startHero(), { timeout: 400 });

let portraitsP = null;
function loadPortraits() {
  if (!portraitsP) {
    portraitsP = (async () => {
      try {
        const { renderPortraits } = await import('./scene/thumbs.js');
        thumbs = await renderPortraits(items.map((i) => i.model));
        picker.setThumbs(thumbs);
      } catch (e) {
        console.warn('No se pudieron dibujar los retratos', e);
      }
    })();
  }
  return portraitsP;
}

// ——— La corrida ———
//
// Todo lo que se ve depende de un solo valor, p (0..1): el punto de la curva de la animación.
// De p salen las unidades compradas y la fecha (stateAt). Play avanza p con la curva de siempre;
// arrastrar la línea de tiempo lleva p a una fecha; el scroll avanza o retrocede de a días,
// semanas, meses o años según la velocidad.

const DAY_MS = 86400000;
const runEl = $('#run');
const canvasEl = $('#scene');
const dockEl = $('#dock');
const endEl = $('#end');
const hud = {
  day: $('#hud-day'),
  year: $('#hud-year'),
  units: $('#hud-units'),
  unitsName: $('#hud-units-name'),
  spent: $('#hud-spent'),
  left: $('#hud-left'),
  bar: $('#hud-bar-fill'),
  hitos: $('#hud-hitos'),
  live: $('#run-live'),
  step: $('#step-unit'),
};
const playBtn = $('#tl-play');
const hintEl = $('#run-hint');
const tipEl = $('#cell-tip');
const coarse = window.matchMedia('(pointer: coarse)');

// ——— Tarjetas para elegir, sobre el calendario ———

const pickEl = $('#pick');
const closeBtn = $('#close-run');
const picker = createPicker({ list: $('#cc-list'), counter: $('#pick-count'), items, onPick: pick, reducedMotion });
let pickToken = 0;

async function openPicker(focusItem = selected) {
  const token = ++pickToken;
  closeRunState();
  clearHitos();
  hideHint();
  hideTip();
  stage?.cancelEnding();
  document.body.classList.add('running');
  hero?.setSuspended(true);
  runEl.hidden = false;
  runEl.classList.remove('ended', 'playing', 'from-pick', 'dealing');
  endEl.hidden = true;
  closeInfo();
  picking = true;
  runEl.classList.add('picking');
  pickEl.hidden = false;
  pickEl.classList.remove('leaving');
  closeBtn.setAttribute('aria-label', 'Volver al inicio');
  picker.reset();
  picker.dealIn();
  picker.focusItem(focusItem.id);
  picker.updateCounter();
  loadPortraits();
  const st = await ensureStage();
  if (token !== pickToken || !picking) return;
  runEl.classList.toggle('no-scene', !st);
  if (st) {
    // el calendario de hoy, quieto y sin figuras, detrás de las tarjetas
    st.snap = true;
    st.prepare(focusItem.model, buildCalendar(focusItem, todayUTC()));
    st.setMode('time');
    applyInsets();
    st.setTime(0, 0, false);
    runEl.classList.remove('faded');
  }
}

function closePicker() {
  picking = false;
  pickEl.hidden = true;
  pickEl.classList.remove('leaving');
  runEl.classList.remove('picking', 'dealing');
  closeBtn.setAttribute('aria-label', 'Salir de la simulación');
}

async function pick(item) {
  if (!picking || runEl.classList.contains('dealing')) return;
  const token = pickToken;
  selected = item;
  const url = new URL(location.href);
  url.searchParams.set('item', item.id);
  history.replaceState(null, '', url);
  runEl.classList.add('dealing');
  pickEl.classList.add('leaving');
  await picker.dealOut(item.id);
  if (token !== pickToken || !picking) return;
  closePicker();
  runEl.classList.add('from-pick');
  setTimeout(() => runEl.classList.remove('from-pick'), 700);
  openRun(item);
}

async function ensureStage() {
  if (stage) return stage;
  if (!hasWebGL) {
    const mod = await import('./scene/stage.js');
    hasWebGL = mod.webglAvailable();
    if (!hasWebGL) return null;
  }
  try {
    const { Stage } = await import('./scene/stage.js');
    await fontReady;
    stage = new Stage(canvasEl, $('#pins'));
    stage.setHook(tick);
    if (import.meta.env.DEV) window.__stage = stage; // para inspeccionar en desarrollo
    return stage;
  } catch (e) {
    console.warn('WebGL no disponible', e);
    hasWebGL = false;
    return null;
  }
}

/** Nivel de paso más grande que tiene sentido para la duración de la corrida. */
function maxLevelFor(totalDays) {
  const sizes = [1, 7, 30, 365, 3652, 36524];
  let L = 0;
  while (L < sizes.length - 1 && sizes[L + 1] <= totalDays / 6) L++;
  return L;
}

async function openRun(item) {
  closeRunState();
  if (picking) closePicker();
  hero?.setSuspended(true);
  document.body.classList.add('running');
  runEl.hidden = false;
  runEl.classList.remove('ended');
  endEl.hidden = true;
  closeInfo();
  clearHitos();
  const st = await ensureStage();
  runEl.classList.toggle('no-scene', !st);

  const start = todayUTC();
  const run = runFor(item, start);
  const hitos = hitosFor(model, start, run.end);
  const c = {
    item,
    run,
    hitos,
    start,
    T: runSeconds(item.units),
    p: 0,
    pTarget: null,
    easeK: 0,
    playing: false,
    bought: 0,
    day: -1,
    endShown: false,
    endBuilt: false,
    autoFree: false, // la cámara quedó libre sola, al terminar
    camTouched: false, // el visitante movió la cámara: deja de seguir la fecha
    scrubDay: null,
    lastText: {},
    lastLeft: -1,
    nextHito: 0,
  };
  current = c;
  setChildren(hud.unitsName, item.namePlural);
  setChildren(hud.live, `Empieza: 1 ${item.name} ${fmtPeriod(item.periodDays)} desde hoy.`);

  if (!st) {
    showEnd(true);
    return;
  }
  c.cal = buildCalendar(item, start);
  c.stepper = new Stepper({
    maxLevel: maxLevelFor(run.totalDays),
    onStep: (dir, level) => stepBy(dir, level),
    onLevel: (level) => showStep(level),
  });
  c.timeline = createTimeline(
    {
      track: $('#tl-track'),
      ticks: $('#tl-ticks'),
      fill: $('#tl-fill'),
      head: $('#tl-head'),
      hitosEl: $('#tl-hitos'),
      tip: $('#tl-tip'),
    },
    {
      start,
      totalDays: run.totalDays,
      hitos,
      onSeek: (day, phase) => {
        userTook();
        // mientras se arrastra, la barra no cambia de ancho aunque se cierre la tarjeta
        if (phase === 'start' && c.autoFree && !c.camTouched) followDate();
        // los pasos siguientes (scroll, flechas) arrancan desde donde quedó la línea de tiempo
        c.scrubDay = null;
        c.pTarget = null;
        setP(progressForDay(day, item), { animate: phase !== 'start' && !reducedMotion.matches });
      },
    }
  );
  st.snap = reducedMotion.matches;
  st.prepare(item.model, c.cal);
  st.setHitos(hitos.map((x) => ({ day: x.day, label: x.label })));
  followDate();
  applyInsets();
  runEl.classList.remove('faded');

  if (reducedMotion.matches) {
    setP(1, { animate: false });
    return;
  }
  setP(0, { animate: true });
  showHint();
  // si no hace nada, arranca solo (como la animación de antes)
  c.autoplay = setTimeout(() => {
    if (current === c && !c.touched) play(true);
  }, 3200);
  playBtn.focus({ preventScroll: true });
}

/** Lleva la corrida al punto p de la curva. */
function setP(p, { animate = false, fromPlay = false } = {}) {
  const c = current;
  if (!c) return;
  p = Math.min(1, Math.max(0, p));
  c.p = p;
  const s = stateAt(p, c.item);
  const forward = s.day > c.day;
  const prevDay = c.day;
  c.bought = s.bought;
  c.day = s.day;
  updateHud(s, forward, prevDay);
  if (stage) stage.setTime(s.bought, s.day, animate && forward && !reducedMotion.matches);
  if (p >= 1 && !c.endShown) showEnd(false, fromPlay);
  else if (p < 1 && c.endShown) hideEnd();
}

function updateHud(s, forward, prevDay) {
  const c = current;
  const date = addDays(c.run.start, s.day);
  const d = fmtDateShort(date);
  setText('day', `${d.day} ${d.month}`);
  setText('year', d.year);
  setText('units', fmtNum(s.bought));
  const spent = s.bought * c.item.unitCost;
  setText('spent', fmtGsWords(spent));
  setText('left', fmtGsWords(model.total - spent));
  const left = Math.max(0, 1 - spent / model.total);
  if (c.lastLeft !== left) {
    c.lastLeft = left;
    hud.bar.style.transform = `scaleX(${left})`;
  }
  c.timeline?.setDay(s.dayF, fmtDate(date));
  // hitos: se anuncian al pasar hacia adelante; hacia atrás solo se reacomoda el índice
  const hs = c.hitos;
  if (forward) {
    // si un salto pasa varios de golpe, se anuncia solo el último
    let last = null;
    while (c.nextHito < hs.length && hs[c.nextHito].day <= s.day) {
      if (hs[c.nextHito].day > prevDay) last = hs[c.nextHito];
      c.nextHito++;
    }
    if (last) queueHito(last);
  } else {
    while (c.nextHito > 0 && hs[c.nextHito - 1].day > s.day) c.nextHito--;
  }
}

function setText(key, value) {
  if (current.lastText[key] === value) return;
  current.lastText[key] = value;
  hud[key].textContent = value;
}

// ——— Play, scroll, teclado ———

/** Cada cuadro (lo llama la escena). Devuelve true si el tiempo se sigue moviendo. */
function tick(now, dt) {
  const c = current;
  if (!c || !stage) return false;
  let busy = false;
  if (c.playing) {
    const np = Math.min(1, c.p + dt / c.T);
    setP(np, { animate: true, fromPlay: true });
    if (np >= 1) setPlaying(false);
    busy = true;
  } else if (c.pTarget !== null) {
    if (c.easeK <= 0 || Math.abs(c.pTarget - c.p) < 1e-6) {
      setP(c.pTarget, { animate: true });
      c.pTarget = null;
    } else {
      setP(c.p + (c.pTarget - c.p) * (1 - Math.exp(-dt * c.easeK)), { animate: true });
      busy = true;
    }
  }
  if (c.stepper.tick(dt, now)) busy = true;
  return busy;
}

function setPlaying(on) {
  const c = current;
  if (!c) return;
  c.playing = on;
  runEl.classList.toggle('playing', on);
  playBtn.setAttribute('aria-label', on ? 'Pausa' : 'Reproducir');
  if (on) stage?.wake();
}

function play(auto = false) {
  const c = current;
  if (!c || !stage) return;
  if (!auto) userTook();
  if (c.p >= 1) setP(0, { animate: true });
  c.pTarget = null;
  c.scrubDay = null;
  followDate();
  setPlaying(true);
}

/** Cualquier gesto del visitante: pausa, apaga el aviso y cancela el arranque automático. */
function userTook() {
  const c = current;
  if (!c) return;
  c.touched = true;
  clearTimeout(c.autoplay);
  hideHint();
  if (c.playing) setPlaying(false);
}

function addCalendar(day, level, dir) {
  const c = current;
  if (level <= 1) return day + dir * (level ? 7 : 1);
  const d = new Date(c.start.getTime() + day * DAY_MS);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), dd = d.getUTCDate();
  let ny = y, nm = m;
  if (level === 2) nm += dir;
  else ny += dir * [1, 10, 100][level - 3];
  const dim = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const t = Date.UTC(ny, nm, Math.min(dd, dim));
  return Math.round((t - c.start.getTime()) / DAY_MS);
}

/** Un paso de calendario desde la fecha a la que apunta el scroll. */
function stepBy(dir, level) {
  const c = current;
  if (!c) return;
  userTook();
  if (c.scrubDay === null) c.scrubDay = c.day;
  const total = c.run.totalDays;
  const next = Math.min(total, Math.max(0, addCalendar(c.scrubDay, level, dir)));
  if (next === c.scrubDay) return;
  c.scrubDay = next;
  c.pTarget = progressForDay(next, c.item);
  c.easeK = level === 0 || reducedMotion.matches ? 0 : 18;
  showStep(level, dir);
  stage?.wake();
}

let stepTimer = 0;
function showStep(level, dir) {
  const arrow = dir < 0 ? '◂ ' : dir > 0 ? '▸ ' : '';
  hud.step.textContent = `${arrow}${LEVELS[level]}`;
  hud.step.classList.add('on');
  clearTimeout(stepTimer);
  stepTimer = setTimeout(() => {
    hud.step.classList.remove('on');
    if (current) current.scrubDay = null;
  }, 900);
}

/** Salto exacto (teclado, inicio/fin). */
function jumpTo(day) {
  const c = current;
  if (!c) return;
  c.scrubDay = Math.min(c.run.totalDays, Math.max(0, day));
  c.pTarget = progressForDay(c.scrubDay, c.item);
  c.easeK = 0;
  stage?.wake();
}

playBtn.addEventListener('click', () => {
  const c = current;
  if (!c) return;
  if (c.playing) {
    userTook();
  } else play();
});

// ——— Cámara ———
// El tiempo se mueve con la línea de abajo (y el teclado). Sobre el calendario, los gestos siempre
// mueven la cámara. Mientras nadie la toque, la cámara sigue la fecha marcada; apenas el visitante
// la mueve, queda donde la dejó, hasta que vuelve a tocar ▶.

/** La cámara vuelve a encuadrar lo transcurrido hasta la fecha marcada. */
function followDate() {
  if (current) {
    current.camTouched = false;
    current.autoFree = false;
  }
  stage?.setMode('time');
}

/** El visitante tomó la cámara: deja de seguir la fecha. */
function freeCamera() {
  if (current) current.camTouched = true;
  stage?.setMode('explore');
}

$('#nav-in').addEventListener('click', () => {
  freeCamera();
  stage?.zoomStep(0.6);
});
$('#nav-out').addEventListener('click', () => {
  freeCamera();
  stage?.zoomStep(1 / 0.6);
});
$('#nav-rot').addEventListener('click', () => {
  freeCamera();
  stage?.rotateStep(Math.PI / 2);
});
$('#nav-all').addEventListener('click', () => {
  freeCamera();
  stage?.viewAll();
});

// ——— Gestos sobre la escena ———

const pointers = new Map();
let gesture = null;

canvasEl.addEventListener('wheel', (e) => {
  if (!current || !stage) return;
  e.preventDefault();
  if (!current.camTouched) freeCamera();
  const d = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1);
  const k = e.ctrlKey ? 0.01 : 0.0018;
  stage.zoomAt(Math.exp(Math.max(-0.5, Math.min(0.5, d * k))), e.clientX, e.clientY);
}, { passive: false });

// Scroll sobre la línea de tiempo: mueve la fecha, de a un día, o de a semanas, meses o años si
// se hace rápido.
$('#tl').addEventListener('wheel', (e) => {
  if (!current?.stepper || !stage) return;
  e.preventDefault();
  if (e.ctrlKey) return;
  current.stepper.wheel(e, performance.now());
}, { passive: false });

canvasEl.addEventListener('contextmenu', (e) => e.preventDefault());

canvasEl.addEventListener('pointerdown', (e) => {
  if (!current || !stage) return;
  try {
    canvasEl.setPointerCapture(e.pointerId);
  } catch {
    /* puntero sintético */
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now() });
  hideTip();
  if (pointers.size === 1) {
    gesture = { kind: e.button === 2 || e.shiftKey ? 'rotate' : 'pan', moved: false };
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture = { kind: 'pinch', moved: true, d: Math.hypot(b.x - a.x, b.y - a.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
});

canvasEl.addEventListener('pointermove', (e) => {
  const pt = pointers.get(e.pointerId);
  if (!pt || !gesture || !current) {
    if (e.pointerType === 'mouse' && !pointers.size) hoverTip(e);
    return;
  }
  const px = pt.x, py = pt.y;
  pt.x = e.clientX;
  pt.y = e.clientY;
  if (!gesture.moved && Math.hypot(pt.x - pt.x0, pt.y - pt.y0) > 6) gesture.moved = true;
  if (!gesture.moved) return;
  if (!current.camTouched) freeCamera();
  if (gesture.kind === 'pan') {
    stage.panBy(px, py, pt.x, pt.y);
  } else if (gesture.kind === 'rotate') {
    stage.rotateBy((pt.x - px) * 0.008);
  } else if (gesture.kind === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    stage.panBy(gesture.mx, gesture.my, mx, my);
    if (d > 0 && gesture.d > 0) stage.zoomAt(gesture.d / d, mx, my);
    let da = ang - gesture.ang;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    if (Math.abs(da) > 0.002) stage.rotateBy(-da);
    Object.assign(gesture, { d, ang, mx, my });
  }
});

function endPointer(e) {
  const pt = pointers.get(e.pointerId);
  if (!pt) return;
  pointers.delete(e.pointerId);
  if (!gesture || !current) return;
  if (!gesture.moved && e.type === 'pointerup') showTipAt(e.clientX, e.clientY);
  if (pointers.size === 1 && gesture.kind === 'pinch') {
    // queda un dedo: sigue como arrastre
    gesture = { kind: 'pan', moved: true };
    const rest = [...pointers.values()][0];
    rest.x0 = rest.x;
    rest.y0 = rest.y;
  } else if (!pointers.size) gesture = null;
}
canvasEl.addEventListener('pointerup', endPointer);
canvasEl.addEventListener('pointercancel', endPointer);
canvasEl.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && hideTip());

// Fecha de la celda bajo el puntero.
function showTipAt(x, y) {
  const c = current;
  const d = stage?.dayAtPoint(x, y);
  if (!c || d === null || d === undefined) return hideTip();
  const date = new Date(c.start.getTime() + d * DAY_MS);
  const bought = d >= 0 && d < c.run.totalDays && d % c.item.periodDays === 0;
  const k = d / c.item.periodDays + 1;
  let txt = fmtDate(date);
  if (d < 0) txt += ' · antes de hoy';
  else if (bought) txt += k <= c.bought ? ` · ${c.item.name} n.º ${fmtNum(k)}` : ` · ${c.item.name} n.º ${fmtNum(k)} (todavía no)`;
  else if (d >= c.run.totalDays) txt += ' · ya no alcanza';
  tipEl.textContent = txt;
  tipEl.hidden = false;
  const r = runEl.getBoundingClientRect();
  tipEl.style.transform = `translate(${Math.round(x - r.left)}px, ${Math.round(y - r.top)}px)`;
}
let hoverRaf = 0;
function hoverTip(e) {
  if (hoverRaf) return;
  hoverRaf = requestAnimationFrame(() => {
    hoverRaf = 0;
    if (!pointers.size) showTipAt(e.clientX, e.clientY);
  });
}
function hideTip() {
  tipEl.hidden = true;
}

document.addEventListener('keydown', (e) => {
  if (runEl.hidden || infoDlg.open) return;
  if (e.key === 'Escape') {
    closeRun();
    return;
  }
  if (picking) {
    // flechas: de tarjeta en tarjeta
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') picker.move(1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') picker.move(-1);
    else return;
    e.preventDefault();
    return;
  }
  const c = current;
  if (!c || !stage || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  const inEnd = t instanceof Element && t.closest('#end');
  const onControl = t instanceof Element && t.closest('button, a, summary, input');
  if (e.key === ' ' && !onControl && !inEnd) {
    e.preventDefault();
    c.playing ? userTook() : play();
    return;
  }
  if (inEnd) return;
  const base = c.scrubDay ?? c.day;
  let target = null;
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') target = addCalendar(base, e.shiftKey ? 2 : 0, 1);
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') target = addCalendar(base, e.shiftKey ? 2 : 0, -1);
  else if (e.key === 'PageDown') target = addCalendar(base, 3, 1);
  else if (e.key === 'PageUp') target = addCalendar(base, 3, -1);
  else if (e.key === 'Home') target = 0;
  else if (e.key === 'End') target = c.run.totalDays;
  if (target === null) return;
  if (onControl && t.id !== 'tl-play') return;
  e.preventDefault();
  userTook();
  if (e.key.startsWith('Arrow')) showStep(e.shiftKey ? 2 : 0, e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1);
  else if (e.key.startsWith('Page')) showStep(3, e.key === 'PageDown' ? 1 : -1);
  jumpTo(target);
});

// ——— Aviso de la primera vez ———

let hintTimer = 0;
function showHint() {
  let seen = false;
  try {
    seen = sessionStorage.getItem('cer-hint') === '1';
    sessionStorage.setItem('cer-hint', '1');
  } catch {
    /* sin almacenamiento: se muestra igual */
  }
  if (seen) return;
  hintEl.textContent = coarse.matches
    ? 'Tocá ▶ o arrastrá la línea de tiempo. Sobre el calendario: arrastrá para mover y pellizcá para acercar.'
    : 'Tocá ▶ o arrastrá la línea de tiempo. Sobre el calendario: arrastrá para mover y hacé scroll para acercar.';
  hintEl.hidden = false;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(hideHint, 7000);
}
function hideHint() {
  hintEl.hidden = true;
}

// ——— Hitos (carteles arriba) ———
// De a uno, en orden cronológico. Si llegan muchos juntos, cada uno dura menos.
const hitoQueue = [];
let hitoTimer = 0;
let hitoChip = null;

function queueHito(x) {
  hitoQueue.push(x);
  if (hitoQueue.length > 2) hitoQueue.shift();
  if (!hitoChip && !hitoTimer) nextHito();
}

function nextHito() {
  hitoTimer = 0;
  const x = hitoQueue.shift();
  if (!x) return;
  const chip = h('li', { class: 'hito' }, h('span', { class: 'hito-label' }, x.label), x.approximate ? null : h('span', { class: 'hito-date' }, fmtDate(x.when)));
  setChildren(hud.hitos, chip);
  hitoChip = chip;
  const stay = hitoQueue.length > 1 ? 1400 : hitoQueue.length ? 2000 : 2800;
  hitoTimer = setTimeout(() => {
    chip.classList.add('out');
    hitoTimer = setTimeout(() => {
      chip.remove();
      if (hitoChip === chip) hitoChip = null;
      nextHito();
    }, 360);
  }, stay);
}

function clearHitos() {
  hitoQueue.length = 0;
  clearTimeout(hitoTimer);
  hitoTimer = 0;
  if (hitoChip) {
    const chip = hitoChip;
    chip.classList.add('out');
    setTimeout(() => chip.remove(), 360);
  }
  hitoChip = null;
}

// ——— Tarjeta final ———

function showEnd(noScene = false, fromPlay = false) {
  const c = current;
  if (!c) return;
  c.endShown = true;
  if (!c.endBuilt) {
    c.endBuilt = true;
    const onOther = () => openPicker(c.item);
    setChildren(endEl, buildResult({ model, item: c.item, run: c.run, noScene, onMore: openInfo, onShare: share, onOther }));
    setChildren(
      infoBody,
      buildDetails({
        model,
        item: c.item,
        run: c.run,
        hitos: c.hitos,
        thumb: thumbs[c.item.model],
        onShare: share,
        onReplay: () => {
          closeInfo();
          setP(0, { animate: true });
          play();
        },
        onOther,
      })
    );
  }
  setChildren(hud.live, `La plata se termina el ${fmtDate(c.run.end)}: ${unitsLabel(c.item.units, c.item)}.`);
  const open = () => {
    if (current !== c || !c.endShown) return;
    clearHitos();
    endEl.hidden = false;
    runEl.classList.add('ended');
    if (stage && !noScene) {
      applyInsets();
      if (!c.camTouched) {
        stage.playEnding(reducedMotion.matches, () => {
          if (current === c && c.endShown && !c.camTouched) {
            stage.setMode('explore');
            c.autoFree = true;
          }
        });
      }
    }
    if (fromPlay || noScene) $('#end-title')?.focus({ preventScroll: true });
  };
  if (fromPlay && !reducedMotion.matches) setTimeout(open, 700);
  else open();
}

function hideEnd() {
  const c = current;
  if (!c) return;
  c.endShown = false;
  endEl.hidden = true;
  closeInfo();
  runEl.classList.remove('ended');
  stage?.cancelEnding();
  if (c.autoFree && !c.camTouched) followDate();
  applyInsets();
}

/** Le dice a la escena qué partes de la pantalla tapan el encabezado (o el resultado) y la barra de abajo. */
function applyInsets() {
  if (!stage || runEl.hidden) return;
  const H = runEl.offsetHeight || window.innerHeight;
  const runTop = runEl.getBoundingClientRect().top;
  const ended = !endEl.hidden;
  // al final, el bloque del resultado reemplaza al encabezado
  let top = (ended ? endEl : $('#hud-top')).getBoundingClientRect().bottom - runTop;
  const navEl = $('#nav');
  if (ended && navEl && !navEl.hidden && navEl.getBoundingClientRect().top < top) {
    top = Math.max(top, navEl.getBoundingClientRect().bottom - runTop);
  }
  const b = dockEl.offsetHeight + 8;
  stage.setInsets({ t: Math.min(0.5, (top + 6) / H), b: Math.min(0.5, b / H), l: 0, r: 0 });
}

// ——— «Más info»: el detalle del resultado, en una ventana aparte ———

const infoDlg = $('#info-dlg');
const infoBody = $('#info-body');
function openInfo() {
  if (infoDlg.open) return;
  userTook();
  infoDlg.showModal();
  infoDlg.scrollTop = 0;
}
function closeInfo() {
  if (infoDlg.open) infoDlg.close();
}
$('#info-close').addEventListener('click', closeInfo);
infoDlg.addEventListener('click', (e) => {
  if (e.target === infoDlg) closeInfo();
});

/** Limpia lo que queda de una corrida anterior. */
function closeRunState() {
  const c = current;
  if (!c) return;
  clearTimeout(c.autoplay);
  c.timeline?.destroy();
  c.playing = false;
  runEl.classList.remove('playing');
  current = null;
}

function closeRun() {
  pickToken++;
  closePicker();
  picker.reset();
  runEl.classList.remove('from-pick');
  closeRunState();
  if (stage) {
    stage.pause();
    stage.clearItem(); // libera la GPU al cambiar de cosa
  }
  clearHitos();
  hideHint();
  hideTip();
  runEl.hidden = true;
  endEl.hidden = true;
  closeInfo();
  document.body.classList.remove('running');
  hero?.setSuspended(false);
  ctaBtn.focus({ preventScroll: true });
}

async function share() {
  const c = current;
  if (!c) return;
  // c/<id>/ tiene su propia vista previa (título e imagen de esa cosa) en WhatsApp, X, etc.
  const url = new URL(itemPath(c.item.id), siteRoot);
  const text = `Según la imputación fiscal del caso ueno, el perjuicio preliminar estimado alcanza para 1 ${c.item.name} ${fmtPeriod(c.item.periodDays)} hasta el ${fmtDate(c.run.end)}.`;
  const status = $('#share-status');
  if (navigator.share) {
    try {
      await navigator.share({ title: SITE_NAME, text, url: url.href });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url.href}`);
    status.textContent = 'Enlace copiado.';
  } catch {
    status.textContent = `Copiá este enlace: ${url.href}`;
  }
}

new ResizeObserver(() => applyInsets()).observe(endEl);
new ResizeObserver(() => applyInsets()).observe(dockEl);
window.addEventListener('resize', () => applyInsets());
$('#close-run').addEventListener('click', closeRun);
if (import.meta.env.DEV) window.__run = { setP, jumpTo, followDate, freeCamera, userTook, get current() { return current; } };

// ——— "Sobre los datos": un panel aparte que se abre con el botón de información o con #sobre ———
const aboutEl = $('#sobre');
function openAbout() {
  if (aboutEl.open) return;
  aboutEl.showModal();
  aboutEl.scrollTop = 0;
  hero?.setSuspended(true);
}
$('#about-open').addEventListener('click', openAbout);
$('#about-close').addEventListener('click', () => aboutEl.close());
// un clic fuera del panel (en el fondo) lo cierra
aboutEl.addEventListener('click', (e) => {
  if (e.target === aboutEl) aboutEl.close();
});
aboutEl.addEventListener('close', () => {
  hero?.setSuspended(!runEl.hidden);
  if (location.hash === '#sobre') history.replaceState(null, '', location.pathname + location.search);
  $('#about-open').focus();
});
window.addEventListener('hashchange', () => {
  if (location.hash === '#sobre') openAbout();
});
if (location.hash === '#sobre') openAbout();
