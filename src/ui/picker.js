// Tarjetas coleccionables para elegir una cosa, encima del calendario de la corrida.
// Cada tarjeta es un botón: retrato en 3D, nombre, costo, ritmo y la categoría como "rareza".
// Con mouse se inclinan siguiendo el puntero (con un brillo); en pantallas táctiles flotan un poco
// y se hunden al tocarlas. Al elegir una, las demás se van y la elegida sube y se desvanece.

import { h, setChildren, capitalize } from './dom.js';
import { fmtGsWords, fmtPeriod } from '../lib/format.js';

export const CATEGORIES = { publico: 'Público', cotidiano: 'Cotidiano', lujo: 'Lujo' };

export function createPicker({ list, counter, items, onPick, reducedMotion }) {
  let thumbs = {};
  const buttons = new Map();
  const n = items.length;
  const pad2 = (x) => String(x).padStart(2, '0');

  function art(item) {
    return thumbs[item.model]
      ? h('img', { src: thumbs[item.model], alt: '', draggable: 'false' })
      : h('span', { class: 'cc-emoji' }, item.emoji);
  }

  function render() {
    buttons.clear();
    setChildren(
      list,
      items.map((item, i) => {
        const cat = CATEGORIES[item.category] || capitalize(item.category || '');
        const cost = fmtGsWords(item.unitCost);
        const pace = `1 ${fmtPeriod(item.periodDays)}`;
        const btn = h(
          'button',
          {
            type: 'button',
            class: `cc cat-${item.category}`,
            'data-id': item.id,
            style: { '--i': String(i) },
            'aria-label': `${capitalize(item.name)}. Cuesta ${cost} cada una; ${pace}. Categoría: ${cat.toLowerCase()}.`,
          },
          h(
            'span',
            { class: 'cc-card' },
            h('span', { class: 'cc-top' }, h('span', { class: 'cc-tag' }, h('span', { class: 'cc-gem' }), cat), h('span', { class: 'cc-no' }, `${pad2(i + 1)}/${pad2(n)}`)),
            h('span', { class: 'cc-art' }, art(item)),
            h(
              'span',
              { class: 'cc-name' },
              capitalize(item.name),
              // el título ya dice "1 por día"; solo se aclara cuando el ritmo es otro (el hospital)
              item.periodDays !== 1 ? h('span', { class: 'cc-pace' }, pace) : null
            ),
            h(
              'span',
              { class: 'cc-stats' },
              h('span', { class: 'cc-stat' }, h('span', { class: 'cc-k' }, 'Cuesta'), h('span', { class: 'cc-v' }, cost))
            ),
            h('span', { class: 'cc-sheen' })
          )
        );
        btn.addEventListener('click', () => onPick(item, btn));
        buttons.set(item.id, btn);
        return h('li', { class: 'cc-slot' }, btn);
      })
    );
    updateCounter();
  }

  function setThumbs(t) {
    thumbs = t || {};
    for (const item of items) {
      const b = buttons.get(item.id);
      const box = b?.querySelector('.cc-art');
      if (box) setChildren(box, art(item));
    }
  }

  // ——— Inclinación con el puntero ———
  let raf = 0;
  let last = null;
  list.addEventListener('pointermove', (e) => {
    if ((e.pointerType !== 'mouse' && e.pointerType !== 'pen') || reducedMotion.matches) return;
    const btn = e.target.closest('.cc');
    if (!btn || btn.disabled) return;
    last = { btn, x: e.clientX, y: e.clientY };
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!last) return;
      const { btn: b, x, y } = last;
      const r = b.getBoundingClientRect();
      const px = Math.min(1, Math.max(0, (x - r.left) / r.width));
      const py = Math.min(1, Math.max(0, (y - r.top) / r.height));
      const card = b.firstElementChild;
      card.style.setProperty('--rx', `${((0.5 - py) * 16).toFixed(2)}deg`);
      card.style.setProperty('--ry', `${((px - 0.5) * 18).toFixed(2)}deg`);
      card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
      b.classList.add('tilting');
    });
  });
  list.addEventListener('pointerout', (e) => {
    const btn = e.target.closest('.cc');
    if (!btn || (e.relatedTarget instanceof Node && btn.contains(e.relatedTarget))) return;
    untilt(btn);
  });
  function untilt(btn) {
    if (last?.btn === btn) last = null;
    btn.classList.remove('tilting');
    const card = btn.firstElementChild;
    card.style.removeProperty('--rx');
    card.style.removeProperty('--ry');
  }

  // ——— Contador del carrusel (celular) ———
  let sraf = 0;
  list.addEventListener('scroll', () => {
    if (sraf) return;
    sraf = requestAnimationFrame(() => {
      sraf = 0;
      updateCounter();
    });
  }, { passive: true });
  // Se mide con la posición de diseño (offsetLeft), no con la que se ve: mientras las tarjetas
  // entran animadas están corridas, y medir lo que se ve daba un número equivocado.
  function currentIndex() {
    const mid = list.scrollLeft + list.clientWidth / 2;
    let best = 0, bd = Infinity;
    [...list.children].forEach((li, i) => {
      const left = li.offsetParent === list ? li.offsetLeft : li.offsetLeft - list.offsetLeft - list.clientLeft;
      const d = Math.abs(left + li.offsetWidth / 2 - mid);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  function updateCounter() {
    if (counter) counter.textContent = `${currentIndex() + 1} de ${n}`;
  }

  // ——— Foco y teclado ———
  function scrollTo(btn, smooth) {
    const li = btn.parentElement;
    if (list.scrollWidth > list.clientWidth + 2) {
      // carrusel: centrar la tarjeta sin mover el resto de la página
      const lr = list.getBoundingClientRect(), r = li.getBoundingClientRect();
      const left = list.scrollLeft + (r.left + r.width / 2) - (lr.left + list.clientLeft + list.clientWidth / 2);
      list.scrollTo({ left, behavior: smooth && !reducedMotion.matches ? 'smooth' : 'auto' });
    } else {
      li.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
  function focusItem(id) {
    const b = buttons.get(id) || buttons.values().next().value;
    if (!b) return;
    b.focus({ preventScroll: true });
    scrollTo(b, false);
  }
  function move(dir) {
    const btns = [...buttons.values()];
    let i = btns.indexOf(document.activeElement);
    i = i < 0 ? 0 : (i + dir + btns.length) % btns.length;
    btns[i].focus({ preventScroll: true });
    scrollTo(btns[i], true);
  }

  // ——— Entrar y salir ———
  function dealIn() {
    for (const li of list.children) for (const a of li.getAnimations()) a.cancel();
    if (reducedMotion.matches) return;
    [...list.children].forEach((li, i) => {
      li.animate(
        [
          { transform: `translateY(80px) rotate(${i % 2 ? 7 : -7}deg) scale(0.9)`, opacity: 0 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 560, delay: 80 + i * 45, easing: 'cubic-bezier(0.2, 1.15, 0.35, 1)', fill: 'backwards' }
      );
    });
  }

  /** Reparte las tarjetas hacia afuera; la elegida sube y se desvanece. */
  async function dealOut(id) {
    for (const b of buttons.values()) {
      b.disabled = true;
      untilt(b);
    }
    if (reducedMotion.matches) return;
    const chosen = buttons.get(id)?.parentElement;
    const cr = chosen.getBoundingClientRect();
    const ccx = cr.left + cr.width / 2, ccy = cr.top + cr.height / 2;
    const W = window.innerWidth, H = window.innerHeight;
    const anims = [];
    for (const li of list.children) {
      const r = li.getBoundingClientRect();
      if (li === chosen) {
        anims.push(
          li.animate(
            [
              { transform: 'none', opacity: 1 },
              { transform: 'translateY(-14px) scale(1.07)', opacity: 1, offset: 0.35 },
              { transform: 'translateY(-46px) scale(1.16)', opacity: 0 },
            ],
            { duration: 640, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'forwards' }
          )
        );
        continue;
      }
      if (r.right < 0 || r.left > W) {
        li.style.opacity = '0'; // fuera de pantalla (carrusel)
        continue;
      }
      const dx = r.left + r.width / 2 - ccx, dy = r.top + r.height / 2 - ccy;
      const dist = Math.hypot(dx, dy);
      const sx = Math.sign(dx) || (dy < 0 ? -1 : 1);
      anims.push(
        li.animate(
          [
            { transform: 'none', opacity: 1 },
            { transform: `translate(${(dx * 0.4 + sx * 160).toFixed(0)}px, ${Math.max(H * 0.75, 460).toFixed(0)}px) rotate(${(sx * (16 + dist * 0.012)).toFixed(1)}deg)`, opacity: 0 },
          ],
          { duration: 520, delay: Math.min(200, dist * 0.22), easing: 'cubic-bezier(0.55, 0, 0.85, 0.35)', fill: 'forwards' }
        )
      );
    }
    await Promise.race([Promise.all(anims.map((a) => a.finished.catch(() => {}))), new Promise((res) => setTimeout(res, 1100))]);
  }

  function reset() {
    for (const li of list.children) {
      for (const a of li.getAnimations()) a.cancel();
      li.style.opacity = '';
    }
    for (const b of buttons.values()) b.disabled = false;
  }

  render();
  return { render, setThumbs, dealIn, dealOut, reset, focusItem, move, updateCounter };
}
