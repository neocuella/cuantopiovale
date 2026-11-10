// Control de la línea de tiempo: inicio a la izquierda, fin a la derecha (lineal en fechas),
// marcas de años, hitos y un cabezal que se arrastra. Arrastrar lleva directo a la fecha.

import { h, setChildren } from './dom.js';
import { fmtDate } from '../lib/format.js';

const DAY_MS = 86400000;

export function createTimeline(els, { start, totalDays, hitos, onSeek, onHito }) {
  const { track, ticks, fill, head, hitosEl, tip } = els;
  const end = new Date(start.getTime() + totalDays * DAY_MS);
  track.setAttribute('aria-valuemax', String(totalDays));

  const pct = (day) => `${((100 * day) / totalDays).toFixed(4)}%`;
  const dayOf = (date) => Math.round((date.getTime() - start.getTime()) / DAY_MS);

  function buildTicks() {
    const w = track.clientWidth || 300;
    const y0 = start.getUTCFullYear();
    const y1 = end.getUTCFullYear();
    const span = totalDays / 365.25;
    const out = [];
    if (span <= 3.2) {
      // meses chicos, año con etiqueta
      for (let y = y0; y <= y1; y++) {
        for (let m = 0; m < 12; m++) {
          const d = dayOf(new Date(Date.UTC(y, m, 1)));
          if (d <= 0 || d >= totalDays) continue;
          out.push(h('span', { class: m === 0 ? 'tick major' : 'tick', style: { left: pct(d) } }, m === 0 ? h('span', { class: 'tick-l' }, String(y)) : null));
        }
      }
    } else {
      const maxLabels = Math.max(2, Math.floor(w / 64));
      const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500];
      const step = steps.find((s) => span / s <= maxLabels) || 1000;
      const minorSteps = steps.filter((s) => s < step && step % s === 0);
      const minor = minorSteps.reverse().find((s) => (w * s) / span >= 7) || step;
      const first = Math.ceil(y0 / minor) * minor;
      for (let y = first; y <= y1; y += minor) {
        const d = dayOf(new Date(Date.UTC(y, 0, 1)));
        if (d <= 0 || d >= totalDays) continue;
        const major = y % step === 0;
        out.push(h('span', { class: major ? 'tick major' : 'tick', style: { left: pct(d) } }, major ? h('span', { class: 'tick-l' }, String(y)) : null));
      }
    }
    // sin etiquetas cortadas en los bordes de la barra (media etiqueta de aire)
    const room = (100 * 16) / w;
    for (const t of out) {
      const left = parseFloat(t.style.left);
      if ((left < room || left > 100 - room) && t.firstChild) t.firstChild.remove();
    }
    setChildren(ticks, out);
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
  setChildren(
    hitosEl,
    hitos.map((x) => {
      const label = x.approximate ? `${x.label} · ${x.when.getUTCFullYear()}` : `${x.label} · ${fmtDate(x.when)}`;
      const btn = h('button', { type: 'button', class: 'tl-hito', style: { left: pct(x.day) }, 'aria-label': label, 'data-label': label });
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
    })
  );

  // Arrastre del cabezal: posición → fecha.
  let dragging = null;
  const dayAtX = (clientX) => {
    const r = track.getBoundingClientRect();
    return Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * totalDays);
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

  const ro = new ResizeObserver(() => buildTicks());
  ro.observe(track);
  buildTicks();

  let lastDay = -1;
  let lastPct = '';
  return {
    setDay(dayF, label) {
      const p = pct(Math.min(totalDays, Math.max(0, dayF)));
      if (p !== lastPct) {
        lastPct = p;
        head.style.left = p;
        fill.style.width = p;
      }
      const d = Math.floor(dayF);
      if (d !== lastDay) {
        lastDay = d;
        track.setAttribute('aria-valuenow', String(d));
        track.setAttribute('aria-valuetext', label);
      }
    },
    destroy() {
      ro.disconnect();
      track.removeEventListener('pointerdown', onDown);
      track.removeEventListener('pointermove', onMove);
      track.removeEventListener('pointerup', onUp);
      track.removeEventListener('pointercancel', onUp);
      setChildren(hitosEl);
      setChildren(ticks);
      hideTip();
    },
  };
}
