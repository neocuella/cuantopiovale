// Control de la línea de tiempo: inicio a la izquierda, lineal en fechas, con marcas de años,
// hitos y un cabezal que se arrastra. Arrastrar lleva directo a la fecha.
//
// La primera vez que se ve una cosa, la línea no muestra dónde termina: solo dibuja lo recorrido
// (más un margen que se pierde en una niebla con "?") y se estira a medida que se avanza. Los hitos
// aparecen cuando se llega a ellos y no se puede arrastrar más allá de lo ya visto. Al llegar al
// final, `reveal()` la lleva a su escala completa.
//
// Las posiciones van en días: cada marca guarda su día en --d y el contenedor la escala en --k
// (porcentaje por día), así que reescalar es cambiar una sola variable.

import { h, setChildren } from './dom.js';
import { fmtDate } from '../lib/format.js';

const DAY_MS = 86400000;
const MIN_VIEW = 730; // con la niebla, la línea muestra al menos dos años
const AHEAD = 1.3; // y lo recorrido ocupa más o menos el 77 % del ancho

export function createTimeline(els, { start, totalDays, hitos, mystery = false, onSeek, onHito }) {
  const { track, ticks, hitosEl, tip, fog } = els; // el cabezal y el relleno se mueven con CSS (--day)
  const body = track.parentElement;
  let hidden = mystery; // el final todavía no se ve
  let maxDay = 0; // hasta dónde se llegó
  let view = 1; // días que entran en el ancho de la línea
  let built = null; // { key, range, w } de las marcas armadas
  let labeled = []; // [día, etiqueta] de las marcas con año
  let trackW = track.clientWidth || 300; // se mide solo al cambiar de tamaño

  const dayOf = (date) => Math.round((date.getTime() - start.getTime()) / DAY_MS);
  const targetView = () => (hidden ? Math.max(MIN_VIEW, maxDay * AHEAD + 30) : totalDays);

  /** Paso de las etiquetas para lo que entra en el ancho. */
  function layoutFor(v) {
    const w = trackW;
    const span = v / 365.25;
    if (span <= 3.2) return { months: true, step: 1, minor: 1, key: 'm', w };
    const maxLabels = Math.max(2, Math.floor(w / 64));
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500];
    const step = steps.find((s) => span / s <= maxLabels) || 1000;
    const minorSteps = steps.filter((s) => s < step && step % s === 0);
    const minor = minorSteps.reverse().find((s) => (w * s) / span >= 7) || step;
    return { months: false, step, minor, key: `y${step}/${minor}`, w };
  }

  function buildTicks() {
    const L = layoutFor(view);
    // con la niebla se arman marcas de sobra, para que la línea pueda crecer sin rearmarlas
    const range = hidden ? view * 1.6 : totalDays;
    const y0 = start.getUTCFullYear();
    const y1 = new Date(start.getTime() + range * DAY_MS).getUTCFullYear();
    const out = [];
    const mark = (d, major, label) =>
      out.push(h('span', { class: major ? 'tick major' : 'tick', style: { '--d': d } }, label ? h('span', { class: 'tick-l' }, label) : null));
    if (L.months) {
      for (let y = y0; y <= y1; y++) {
        for (let m = 0; m < 12; m++) {
          const d = dayOf(new Date(Date.UTC(y, m, 1)));
          if (d <= 0 || d >= range) continue;
          mark(d, m === 0, m === 0 ? String(y) : null);
        }
      }
    } else {
      const first = Math.ceil(y0 / L.minor) * L.minor;
      for (let y = first; y <= y1; y += L.minor) {
        const d = dayOf(new Date(Date.UTC(y, 0, 1)));
        if (d <= 0 || d >= range) continue;
        const major = y % L.step === 0;
        mark(d, major, major ? String(y) : null);
      }
    }
    setChildren(ticks, out);
    labeled = out.filter((t) => t.firstChild).map((t) => [+t.style.getPropertyValue('--d'), t.firstChild]);
    built = { key: L.key, range, w: L.w };
    edgeLabels();
  }

  /** Sin etiquetas cortadas en los bordes de la barra (media etiqueta de aire). */
  function edgeLabels() {
    const room = (16 * view) / trackW; // en días
    for (const [d, l] of labeled) {
      // a la derecha, con la niebla, la tapa ella
      const cut = d < room || (!hidden && d > view - room);
      if (l.hidden !== cut) l.hidden = cut;
    }
  }

  function setView(v) {
    view = Math.max(1, v);
    body.style.setProperty('--k', String(100 / view));
    const L = layoutFor(view);
    if (!built || built.key !== L.key || built.w !== L.w || view > built.range || (!hidden && built.range !== totalDays)) buildTicks();
    else edgeLabels();
  }

  // Hitos: puntos arriba de la barra; pasar el mouse o tocarlos muestra el nombre.
  let tipFor = null;
  function showTip(btn, x) {
    tip.textContent = btn.dataset.label;
    tip.hidden = false;
    const r = tip.parentElement.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const left = Math.min(r.width - tip.offsetWidth / 2 - 4, Math.max(tip.offsetWidth / 2 + 4, (x ?? b.left + b.width / 2) - r.left));
    tip.style.left = `${left}px`;
    tipFor = btn;
  }
  function hideTip(btn) {
    if (btn && tipFor !== btn) return;
    tip.hidden = true;
    tipFor = null;
  }
  const hitoBtns = hitos.map((x) => {
    const label = x.approximate ? `${x.label} · ${x.when.getUTCFullYear()}` : `${x.label} · ${fmtDate(x.when)}`;
    const btn = h('button', { type: 'button', class: 'tl-hito', style: { '--d': x.day }, 'aria-label': label, 'data-label': label });
    btn.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && showTip(btn));
    btn.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && hideTip(btn));
    btn.addEventListener('focus', () => showTip(btn));
    btn.addEventListener('blur', () => hideTip(btn));
    btn.addEventListener('click', () => {
      if (tipFor === btn && !tip.hidden) hideTip(btn);
      else showTip(btn);
      onHito?.(x);
    });
    return btn;
  });
  setChildren(hitosEl, hitoBtns);
  /** Con la niebla, solo se ven los hitos a los que ya se llegó. */
  function showHitos() {
    hitos.forEach((x, i) => {
      const ahead = hidden && x.day > maxDay;
      const btn = hitoBtns[i];
      if (btn.classList.contains('ahead') !== ahead) {
        btn.classList.toggle('ahead', ahead);
        btn.tabIndex = ahead ? -1 : 0;
        if (ahead && tipFor === btn) hideTip();
      }
    });
  }

  // Arrastre del cabezal: posición → fecha (con la niebla, nunca más allá de lo recorrido).
  let dragging = null;
  const dayAtX = (clientX) => {
    const r = track.getBoundingClientRect();
    const d = Math.round(Math.max(0, (clientX - r.left) / r.width) * view);
    return Math.min(d, hidden ? maxDay : totalDays);
  };
  const onDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    dragging = e.pointerId;
    try {
      track.setPointerCapture(e.pointerId);
    } catch {
      /* puntero sintético */
    }
    track.classList.add('dragging');
    onSeek(dayAtX(e.clientX), 'start');
    e.preventDefault();
  };
  const onMove = (e) => {
    if (dragging !== e.pointerId) return;
    onSeek(dayAtX(e.clientX), 'move');
  };
  const onUp = (e) => {
    if (dragging !== e.pointerId) return;
    dragging = null;
    track.classList.remove('dragging');
    onSeek(dayAtX(e.clientX), 'end');
  };
  track.addEventListener('pointerdown', onDown);
  track.addEventListener('pointermove', onMove);
  track.addEventListener('pointerup', onUp);
  track.addEventListener('pointercancel', onUp);

  function setMax(d) {
    maxDay = d;
    body.style.setProperty('--max', String(d));
    track.setAttribute('aria-valuemax', String(hidden ? d : totalDays));
    showHitos();
  }

  fog.hidden = !hidden;
  fog.classList.remove('out');
  setMax(0);
  setView(targetView());
  const ro = new ResizeObserver(() => {
    trackW = track.clientWidth || trackW;
    buildTicks();
  });
  ro.observe(track);

  let lastDay = -1;
  let raf = 0;
  return {
    setDay(dayF, label) {
      const day = Math.min(totalDays, Math.max(0, dayF));
      body.style.setProperty('--day', day.toFixed(3));
      if (hidden && day > maxDay) {
        setMax(Math.floor(day));
        setView(targetView());
      }
      const d = Math.floor(dayF);
      if (d !== lastDay) {
        lastDay = d;
        track.setAttribute('aria-valuenow', String(d));
        track.setAttribute('aria-valuetext', label);
      }
    },
    /** Se terminó la plata: la línea pasa a su escala completa y se va la niebla. */
    reveal(animate = true) {
      if (!hidden) return;
      hidden = false;
      setMax(totalDays);
      fog.classList.add('out');
      const from = view;
      const t0 = performance.now();
      const dur = animate ? 1100 : 0;
      buildTicks(); // ya sin marcas más allá del final
      const step = (t) => {
        const k = dur ? Math.min(1, (t - t0) / dur) : 1;
        const e = 1 - Math.pow(1 - k, 3);
        setView(from + (totalDays - from) * e);
        if (k < 1) raf = requestAnimationFrame(step);
        else fog.hidden = true;
      };
      step(t0);
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      track.removeEventListener('pointerdown', onDown);
      track.removeEventListener('pointermove', onMove);
      track.removeEventListener('pointerup', onUp);
      track.removeEventListener('pointercancel', onUp);
      setChildren(hitosEl);
      setChildren(ticks);
      fog.hidden = true;
      hideTip();
    },
  };
}
