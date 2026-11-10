// Simula cómo se ve un enlace compartido. La portada lee las etiquetas de index.html tal cual;
// las páginas por cosa usan los mismos textos que vite.config.js pone en c/<id>/.

import { model } from '../src/lib/data.js';
import { fmtDate, fmtPeriod } from '../src/lib/format.js';
import { runFor, todayUTC } from '../src/lib/model.js';
import { SITE_URL, itemPath, ogImagePath, itemTitle, itemDescription } from '../src/lib/share.js';

const items = model.items.filter((i) => i.enabled && i.usedCount > 0);
const host = new URL(SITE_URL).host;

async function homeMeta() {
  const html = await (await fetch('/')).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const get = (k) => doc.querySelector(`meta[property="${k}"]`)?.content || '';
  return { title: get('og:title'), desc: get('og:description'), img: '/' + ogImagePath(), url: SITE_URL, text: '' };
}

function itemMeta(item) {
  const run = runFor(item, todayUTC());
  // el mismo texto que arma share() en main.js al tocar Compartir
  const text = `Según la imputación fiscal del caso ueno, el perjuicio preliminar estimado alcanza para 1 ${item.name} ${fmtPeriod(item.periodDays)} hasta el ${fmtDate(run.end)}.`;
  return { title: itemTitle(model, item), desc: itemDescription(item), img: '/' + ogImagePath(item.id), url: SITE_URL + itemPath(item.id), text };
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function render(m) {
  const msg = m.text ? `${esc(m.text)} <a>${esc(m.url)}</a>` : `<a>${esc(m.url)}</a>`;
  document.getElementById('row').innerHTML = `
    <section>
      <h2>Chat (tipo mensajería)</h2>
      <div class="chat"><div class="bubble">
        <div class="card"><img src="${m.img}" alt="" /><div class="meta">
          <div class="t">${esc(m.title)}</div><div class="d">${esc(m.desc)}</div><div class="u">${host}</div>
        </div></div>
        <div class="msg">${msg}</div><div class="time">10:42</div>
      </div></div>
    </section>
    <section>
      <h2>Tarjeta grande (solo título sobre la imagen)</h2>
      <div class="big"><img src="${m.img}" alt="" /><div class="t">${esc(m.title)}</div></div>
      <div class="big-u">De ${host}</div>
    </section>
    <section>
      <h2>Tarjeta con texto abajo</h2>
      <div class="fb"><img src="${m.img}" alt="" /><div class="meta">
        <div class="u">${host}</div><div class="t">${esc(m.title)}</div><div class="d">${esc(m.desc)}</div>
      </div></div>
    </section>`;
  document.getElementById('note').textContent = `Título: ${m.title} — Descripción: ${m.desc}`;
}

const pick = document.getElementById('pick');
pick.innerHTML = `<option value="">Portada</option>` + items.map((i) => `<option value="${i.id}">c/${i.id}/</option>`).join('');
const home = await homeMeta();
const show = () => render(pick.value ? itemMeta(items.find((i) => i.id === pick.value)) : home);
pick.addEventListener('change', show);
const want = new URLSearchParams(location.search).get('item');
if (want && items.some((i) => i.id === want)) pick.value = want;
show();
