import './styles.css';
import { model } from './lib/data.js';
import { runFor, hitosFor, todayUTC, addDays } from './lib/model.js';
import { fmtNum, fmtGsWords, fmtDate, fmtDateShort, fmtPeriod, unitsLabel } from './lib/format.js';
import { stateAt, progressForDay } from './lib/timeline.js';
import { buildCalendar } from './lib/calendar.js';
import { runSeconds } from './lib/config.js';
import { h, $, setChildren, capitalize } from './ui/dom.js';
import { renderHero, renderFacts, renderAbout } from './ui/sections.js';
import { buildEndCard } from './ui/endcard.js';
import { createTimeline } from './ui/timeline.js';
import { Stepper, LEVELS } from './ui/stepper.js';

const items = model.items.filter((i) => i.enabled && i.usedCount > 0);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const sidePanel = window.matchMedia('(min-width: 900px) and (min-aspect-ratio: 1/1)');
let hasWebGL = false;
let stage = null; // se crea la primera vez que hace falta
let thumbs = {};
let selected = items[0];
let current = null; // corrida en curso

// ——— Portada, tarjetas, datos ———

renderHero(model);
renderFacts(model);
renderAbout(model);

const params = new URLSearchParams(location.search);
const fromUrl = items.find((i) => i.id === params.get('item'));
if (fromUrl) selected = fromUrl;

const cardsEl = $('#cards');
function renderCards() {
  setChildren(
    cardsEl,
    items.map((item) =>
      h(
        'li',
        {},
        h(
          'button',
          {
            type: 'button',
            class: 'card',
            'data-id': item.id,
            'aria-pressed': String(item === selected),
            onclick: () => select(item),
          },
          h(
            'span',
            { class: 'card-art', 'aria-hidden': 'true' },
            thumbs[item.model] ? h('img', { src: thumbs[item.model], alt: '' }) : h('span', { class: 'card-emoji' }, item.emoji)
          ),
          h('span', { class: 'card-name' }, capitalize(item.name)),
          h('span', { class: 'card-cost' }, `${fmtGsWords(item.unitCost)} c/u`),
          item.periodDays !== 1 ? h('span', { class: 'card-period' }, `1 ${fmtPeriod(item.periodDays)}`) : null
        )
      )
    )
  );
}

function select(item) {
  selected = item;
  for (const b of cardsEl.querySelectorAll('.card')) b.setAttribute('aria-pressed', String(b.dataset.id === item.id));
  setChildren($('#start-label'), `Arrancar con ${item.namePlural}`);
  const url = new URL(location.href);
  url.searchParams.set('item', item.id);
  history.replaceState(null, '', url);
}

renderCards();
select(selected);

$('#go-picker').addEventListener('click', () => {
  $('#picker').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
  setTimeout(() => cardsEl.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true }), reducedMotion.matches ? 0 : 500);
});
$('#start-run').addEventListener('click', () => openRun(selected));

// Detectar WebGL y dibujar miniaturas sin bloquear la portada.
(async () => {
  const { webglAvailable } = await import('./scene/stage.js');
  hasWebGL = webglAvailable();
  if (!hasWebGL) return;
  try {
    const { renderThumbnails } = await import('./scene/thumbs.js');
    thumbs = await renderThumbnails(items.map((i) => i.model));
    renderCards();
    select(selected);
  } catch (e) {
    console.warn('No se pudieron dibujar las miniaturas', e);
  }
})();

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
let lastFocus = null;
let mode = 'time';

async function ensureStage() {
  if (stage) return stage;
  if (!hasWebGL) {
    const mod = await import('./scene/stage.js');
    hasWebGL = mod.webglAvailable();
    if (!hasWebGL) return null;
  }
  try {
    const { Stage } = await import('./scene/stage.js');
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
  lastFocus = document.activeElement;
  closeRunState();
  document.body.classList.add('running');
  runEl.hidden = false;
  runEl.classList.remove('ended', 'sheet-open');
  endEl.hidden = true;
  endEl.classList.remove('expanded');
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
    autoExplore: false,
    camTouched: false,
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
      startEl: $('#tl-start'),
      endEl: $('#tl-end'),
      tip: $('#tl-tip'),
    },
    {
      start,
      totalDays: run.totalDays,
      hitos,
      onSeek: (day, phase) => {
        userTook();
        // mientras se arrastra, la barra no cambia de ancho aunque se cierre la tarjeta
        if (phase === 'start' && c.endShown) runEl.classList.add('dock-narrow');
        if (phase === 'end') runEl.classList.remove('dock-narrow');
        if (phase === 'start' && mode === 'explore' && c.autoExplore && !c.camTouched) setMode('time');
        setP(progressForDay(day, item), { animate: phase !== 'start' && !reducedMotion.matches });
      },
    }
  );
  st.snap = reducedMotion.matches;
  st.prepare(item.model, c.cal);
  st.setHitos(hitos.map((x) => ({ day: x.day, label: x.label })));
  setMode('time');
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
  if (mode !== 'time') setMode('time');
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

// ——— Modos: tiempo / explorar ———

const modeCap = $('#mode-cap');
function setMode(m, { auto = false } = {}) {
  mode = m;
  runEl.dataset.mode = m;
  $('#mode-time').setAttribute('aria-pressed', String(m === 'time'));
  $('#mode-explore').setAttribute('aria-pressed', String(m === 'explore'));
  $('#nav').hidden = m !== 'explore';
  const touch = coarse.matches;
  modeCap.textContent =
    m === 'time'
      ? touch
        ? 'Deslizá arriba o abajo: mueve la fecha'
        : 'Scroll: mueve la fecha'
      : touch
        ? 'Arrastrá, pellizcá y girá con dos dedos'
        : 'Arrastrá: mover · scroll: zoom · botón derecho: girar';
  if (current) {
    current.autoExplore = auto;
    current.camTouched = false;
  }
  hideTip();
  stage?.setMode(m);
}
$('#mode-time').addEventListener('click', () => {
  userTook();
  setMode('time');
});
$('#mode-explore').addEventListener('click', () => {
  userTook();
  setMode('explore');
});
$('#nav-in').addEventListener('click', () => stage?.zoomStep(0.6));
$('#nav-out').addEventListener('click', () => stage?.zoomStep(1 / 0.6));
$('#nav-rot').addEventListener('click', () => stage?.rotateStep(Math.PI / 2));
$('#nav-all').addEventListener('click', () => stage?.viewAll());

// ——— Gestos sobre la escena ———

const pointers = new Map();
let gesture = null;

canvasEl.addEventListener('wheel', (e) => {
  if (!current || !stage) return;
  e.preventDefault();
  const now = performance.now();
  if (mode === 'time') {
    if (e.ctrlKey) return; // pellizco del trackpad: no hace nada en modo tiempo
    current.stepper.wheel(e, now);
  } else {
    current.camTouched = true;
    let d = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1);
    const k = e.ctrlKey ? 0.01 : 0.0018;
    stage.zoomAt(Math.exp(Math.max(-0.5, Math.min(0.5, d * k))), e.clientX, e.clientY);
  }
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
    gesture = { kind: mode === 'explore' ? (e.button === 2 || e.shiftKey ? 'rotate' : 'pan') : 'time', moved: false, vy: 0, lastT: performance.now() };
  } else if (pointers.size === 2 && mode === 'explore') {
    const [a, b] = [...pointers.values()];
    gesture = { kind: 'pinch', moved: true, d: Math.hypot(b.x - a.x, b.y - a.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
});

canvasEl.addEventListener('pointermove', (e) => {
  const pt = pointers.get(e.pointerId);
  if (!pt || !gesture || !current) {
    if (mode === 'explore' && e.pointerType === 'mouse' && !pointers.size) hoverTip(e);
    return;
  }
  const px = pt.x, py = pt.y;
  pt.x = e.clientX;
  pt.y = e.clientY;
  if (!gesture.moved && Math.hypot(pt.x - pt.x0, pt.y - pt.y0) > 6) gesture.moved = true;
  if (!gesture.moved) return;
  const now = performance.now();
  if (gesture.kind === 'time') {
    const dy = pt.y - py;
    const dt = Math.max(0.004, (now - gesture.lastT) / 1000);
    gesture.lastT = now;
    gesture.vy = gesture.vy * 0.6 + (-dy * 1.6 / dt) * 0.4;
    current.stepper.push(-dy * 1.6, now);
  } else if (gesture.kind === 'pan') {
    current.camTouched = true;
    stage.panBy(px, py, pt.x, pt.y);
  } else if (gesture.kind === 'rotate') {
    current.camTouched = true;
    stage.rotateBy((pt.x - px) * 0.008);
  } else if (gesture.kind === 'pinch' && pointers.size >= 2) {
    current.camTouched = true;
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
  if (gesture.kind === 'time' && gesture.moved) {
    current.stepper.release(performance.now() - gesture.lastT < 80 ? gesture.vy : 0);
    stage?.wake();
  }
  if (!gesture.moved && e.type === 'pointerup' && mode === 'explore') showTipAt(e.clientX, e.clientY);
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

// Fecha de la celda bajo el puntero (explorar).
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
    if (mode === 'explore' && !pointers.size) showTipAt(e.clientX, e.clientY);
  });
}
function hideTip() {
  tipEl.hidden = true;
}

document.addEventListener('keydown', (e) => {
  if (runEl.hidden) return;
  if (e.key === 'Escape') {
    closeRun();
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
  hintEl.textContent = coarse.matches ? 'Tocá ▶ o deslizá hacia arriba sobre el calendario para mover el tiempo.' : 'Tocá ▶ o hacé scroll sobre el calendario para mover el tiempo, día por día.';
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
    setChildren(
      endEl,
      buildEndCard({
        model,
        item: c.item,
        run: c.run,
        hitos: c.hitos,
        thumb: thumbs[c.item.model],
        noScene,
        onShare: share,
        onReplay: () => {
          toggleEnd(false);
          setP(0, { animate: true });
          play();
        },
        onOther: closeRun,
        onToggle: () => toggleEnd(),
      })
    );
  }
  setChildren(hud.live, `La plata se termina el ${fmtDate(c.run.end)}: ${unitsLabel(c.item.units, c.item)}.`);
  const open = () => {
    if (current !== c || !c.endShown) return;
    clearHitos();
    endEl.hidden = false;
    endEl.classList.toggle('expanded', noScene);
    runEl.classList.add('ended');
    endEl.scrollTop = 0;
    if (stage && !noScene) {
      applyInsets();
      if (mode === 'time') {
        stage.playEnding(reducedMotion.matches, () => {
          if (current === c && c.endShown && mode === 'time') setMode('explore', { auto: true });
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
  toggleEnd(false);
  runEl.classList.remove('ended');
  stage?.cancelEnding();
  if (mode === 'explore' && c.autoExplore && !c.camTouched) setMode('time');
  applyInsets();
}

/** Le dice a la escena qué partes de la pantalla tapan el encabezado, la barra de abajo y la tarjeta. */
function applyInsets() {
  if (!stage || runEl.hidden) return;
  const H = runEl.offsetHeight || window.innerHeight;
  const W = runEl.offsetWidth || window.innerWidth;
  const runTop = runEl.getBoundingClientRect().top;
  let top = $('#hud-top').getBoundingClientRect().bottom - runTop;
  const ended = !endEl.hidden;
  // En el celular, al final, el encabezado se oculta y arriba solo quedan los botones de exploración.
  const navEl = $('#nav');
  if (!sidePanel.matches && navEl && !navEl.hidden) {
    top = Math.max(top, navEl.getBoundingClientRect().bottom - runTop);
  }
  let b = dockEl.offsetHeight + 8;
  let r = 0;
  if (ended && sidePanel.matches) r = endEl.offsetWidth / W;
  else if (ended) {
    runEl.style.setProperty('--sheet-h', `${endEl.offsetHeight}px`);
    b += endEl.offsetHeight;
  }
  stage.setInsets({ t: Math.min(0.35, (top + 6) / H), b: Math.min(0.7, b / H), l: 0, r });
}

function toggleEnd(open = !endEl.classList.contains('expanded')) {
  endEl.classList.toggle('expanded', open);
  runEl.classList.toggle('sheet-open', open && !sidePanel.matches);
  const btn = $('#end-more');
  if (btn) {
    btn.setAttribute('aria-expanded', String(open));
    setChildren(btn.querySelector('.end-more-label'), open ? 'Menos detalle' : 'Ver detalle y fuentes');
  }
  if (!open) endEl.scrollTop = 0;
}

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
  document.body.classList.remove('running');
  $('#picker').scrollIntoView({ block: 'start' });
  const card = cardsEl.querySelector('[aria-pressed="true"]');
  (card || lastFocus)?.focus({ preventScroll: true });
}

async function share() {
  const c = current;
  if (!c) return;
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set('item', c.item.id);
  const text = `Según la imputación fiscal del caso ueno, el perjuicio preliminar estimado alcanza para 1 ${c.item.name} ${fmtPeriod(c.item.periodDays)} hasta el ${fmtDate(c.run.end)}.`;
  const status = $('#share-status');
  if (navigator.share) {
    try {
      await navigator.share({ title: '¿Cuánto es realmente?', text, url: url.href });
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

// Hoja de la tarjeta final en el celular: tocar o arrastrar la manija la abre o la cierra.
{
  let y0 = null;
  endEl.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.end-grab')) return;
    y0 = e.clientY;
  });
  endEl.addEventListener('pointerup', (e) => {
    if (y0 === null) return;
    const dy = e.clientY - y0;
    y0 = null;
    if (dy < -30) toggleEnd(true);
    else if (dy > 30) toggleEnd(false);
    else if (Math.abs(dy) < 8) toggleEnd();
  });
  endEl.addEventListener('pointercancel', () => (y0 = null));
}
new ResizeObserver(() => applyInsets()).observe(endEl);
new ResizeObserver(() => applyInsets()).observe(dockEl);
window.addEventListener('resize', () => applyInsets());
$('#close-run').addEventListener('click', closeRun);
if (import.meta.env.DEV) window.__run = { setP, jumpTo, setMode, userTook, get current() { return current; } };
