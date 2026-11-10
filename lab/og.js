// Dibuja las imágenes de vista previa (og:image) con los mismos retratos 3D de las tarjetas.
// Solo para desarrollo: el botón las manda a vite.config.js (/__og), que las guarda en public/og/.

import { model } from '../src/lib/data.js';
import { fmtGs, fmtMillions, fmtNum } from '../src/lib/format.js';
import { renderPortraits } from '../src/scene/thumbs.js';
import { ogImagePath } from '../src/lib/share.js';
import geistUrl from '../src/fonts/Geist-Variable.woff2'; // la misma tipografía del sitio

const W = 1200, H = 630, PAD = 64;
const INK = '#17161c', INK2 = '#4a4650', MUTED = '#6b6570', ACCENT = '#ff4f1f', ACCENT_INK = '#b8340c';
const FONT = "'Geist', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";
const DOMAIN = 'cuantopiovale.rickovelar.com';
const FINE = 'Según la imputación fiscal. No es una pérdida probada.';

const items = model.items.filter((i) => i.enabled && i.usedCount > 0);
const usd = `US$ ${fmtMillions(model.totalUSD)}`;

function font(weight, size) {
  return `${weight} ${size}px ${FONT}`;
}

/** Tamaño más grande (hasta max) con el que el texto entra en el ancho. */
function fit(ctx, text, weight, max, width, spacing = 0) {
  let size = max;
  for (; size > 12; size -= 2) {
    ctx.font = font(weight, size);
    ctx.letterSpacing = `${spacing * size}px`;
    if (ctx.measureText(text).width <= width) break;
  }
  return size;
}

/** Corta el texto en líneas que entren en el ancho. */
function wrap(ctx, text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function base(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#cfe4f6');
  g.addColorStop(0.42, '#e4f0fa');
  g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // pie: aclaración y dirección
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = '0px';
  ctx.font = font(600, 22);
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'left';
  ctx.fillText(FINE, PAD, H - 40);
  ctx.font = font(800, 24);
  ctx.fillStyle = INK;
  ctx.textAlign = 'right';
  ctx.fillText(DOMAIN, W - PAD, H - 40);
  ctx.textAlign = 'left';
}

function figure(ctx, portrait, emoji) {
  const size = 500, x = W - PAD - size + 20, y = 34;
  if (portrait) {
    // el retrato trae su propia proporción (thumbs.js); se respeta para no deformarlo
    const s = Math.min(560 / portrait.naturalWidth, 500 / portrait.naturalHeight);
    const w = portrait.naturalWidth * s, h = portrait.naturalHeight * s;
    // corrido hacia el borde derecho (la grilla puede salirse) para separarlo del título
    ctx.drawImage(portrait, W - PAD - w + 84, (H - 80 - h) / 2 + 8, w, h);
  } else if (emoji) {
    ctx.font = `260px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, x + size / 2, y + size / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

// Mismo texto que la tarjeta del resultado (endcard.js) y que el título al compartir (share.js).
function drawItem(ctx, item, portrait) {
  base(ctx);
  figure(ctx, portrait, item.emoji);
  const colW = 600;
  let y = 112;
  ctx.fillStyle = INK;
  ctx.font = font(900, 46);
  ctx.letterSpacing = `${-0.03 * 46}px`;
  ctx.fillText('¿Cuánto pio vale?', PAD, y);

  y += 62;
  ctx.fillStyle = INK2;
  ctx.font = font(800, 32);
  ctx.letterSpacing = `${-0.01 * 32}px`;
  ctx.fillText(`Los ${usd} del`, PAD, y);
  y += 42;
  ctx.fillText('caso ueno podrían comprar:', PAD, y);

  const n = fmtNum(item.units);
  const big = fit(ctx, n, 900, 172, colW, -0.05);
  y += big * 0.86;
  ctx.fillStyle = ACCENT;
  ctx.fillText(n, PAD - big * 0.04, y);

  const name = item.units === 1 ? item.name : item.namePlural;
  let size = 60;
  let lines;
  for (; size > 30; size -= 2) {
    ctx.font = font(900, size);
    ctx.letterSpacing = `${-0.03 * size}px`;
    lines = wrap(ctx, name, colW);
    if (lines.length <= 2) break;
  }
  ctx.fillStyle = INK;
  for (const line of lines) {
    y += size * 1.04;
    ctx.fillText(line, PAD, y);
  }
}

function drawHome(ctx, portrait) {
  base(ctx);
  figure(ctx, portrait);
  const colW = 640;
  let y = 150;
  ctx.fillStyle = INK;
  const t = fit(ctx, '¿Cuánto pio vale?', 900, 84, colW, -0.035);
  ctx.fillText('¿Cuánto pio vale?', PAD, y);
  y += t * 0.25;
  for (const line of [`US$ ${fmtNum(Math.round(model.totalUSD / 1e6))}`, 'millones']) {
    const s = fit(ctx, line, 900, 150, colW, -0.05);
    y += s * 0.92;
    ctx.fillText(line, PAD, y);
  }
  ctx.font = font(800, 36);
  ctx.letterSpacing = `${-0.01 * 36}px`;
  ctx.fillStyle = ACCENT_INK;
  ctx.fillText(fmtGs(model.total), PAD, y + 62);
}

function toBlob(canvas) {
  return new Promise((res) => canvas.toBlob(res, 'image/png'));
}

const cards = []; // { id, blob }

async function main() {
  // la misma tipografía del sitio: hay que esperar a que esté cargada antes de dibujar en el canvas
  const geist = new FontFace('Geist', `url(${geistUrl})`, { weight: '100 900' });
  document.fonts.add(await geist.load());
  const keys = items.map((i) => i.model).filter(Boolean);
  const urls = await renderPortraits(keys, 700);
  const portraits = {};
  for (const [k, u] of Object.entries(urls)) portraits[k] = await loadImage(u);

  const grid = document.getElementById('grid');
  const jobs = [{ id: 'inicio', draw: (ctx) => drawHome(ctx, portraits[items[0]?.model]) }];
  for (const item of items) jobs.push({ id: item.id, draw: (ctx) => drawItem(ctx, item, portraits[item.model]) });

  for (const job of jobs) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    job.draw(ctx);
    const blob = await toBlob(canvas);
    cards.push({ id: job.id, blob });
    const fig = document.createElement('figure');
    const img = new Image(W, H);
    img.src = URL.createObjectURL(blob);
    img.alt = job.id;
    const cap = document.createElement('figcaption');
    cap.textContent = ogImagePath(job.id);
    fig.append(img, cap);
    grid.append(fig);
  }
  document.getElementById('save').disabled = false;
}

document.getElementById('save').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const status = document.getElementById('status');
  btn.disabled = true;
  let ok = 0;
  for (const c of cards) {
    const r = await fetch(`/__og?id=${encodeURIComponent(c.id)}`, { method: 'POST', body: c.blob });
    if (r.ok) ok++;
    status.textContent = `${ok} de ${cards.length}`;
  }
  status.textContent = ok === cards.length ? `Listo: ${ok} imágenes en public/og/.` : `Se guardaron ${ok} de ${cards.length}.`;
  btn.disabled = false;
});

main();
