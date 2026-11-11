// Portada y "Sobre los datos". Todas las cifras salen del modelo.

import { h, setChildren, extLink, $ } from './dom.js';
import { fmtNum, fmtGs, fmtGsWords, fmtMillions, fmtISO } from '../lib/format.js';
import { DATA_FILES } from '../lib/data.js';

export const SOURCE_TYPES = {
  dncp: 'Contrataciones Públicas (DNCP)',
  anuncio_oficial: 'Anuncio oficial',
  prensa: 'Prensa',
  anuncio_comercial: 'Anuncio comercial',
  precio_de_lista: 'Precio de lista',
};

export function renderHero(model) {
  const doc = model.components[0]?.document || '';
  // el monto en dólares, sin decimales ("US$ 813 millones"), y el monto completo en guaraníes
  setChildren($('#fig-usd'), `US$ ${fmtMillions(model.totalUSD)}`);
  // el mismo monto en la pregunta de las tarjetas ("los 813 palos verdes")
  setChildren($('#pick-usd'), fmtNum(Math.round(model.totalUSD / 1e6)));
  // el asterisco lleva a la nota de abajo, que empieza con el mismo asterisco
  setChildren($('#fig-gs'), fmtGs(model.total), h('span', { class: 'ast', 'aria-hidden': 'true' }, '*'));
  setChildren(
    $('#lede'),
    h('span', { class: 'ast', 'aria-hidden': 'true' }, '* '),
    'Es el ',
    h('strong', {}, 'perjuicio patrimonial preliminar estimado'),
    ' en el caso ueno, según la imputación fiscal.'
  );
  setChildren($('#fig-src'), `Fuente: ${doc}, citada por la prensa.`);
}

export function renderAbout(model) {
  const r = model.rate;
  const comps = model.components.map((c) =>
    h(
      'li',
      {},
      h('strong', {}, c.currency === 'USD' ? `US$ ${fmtNum(c.amount)}` : fmtGs(c.amount)),
      c.currency === 'USD' ? ` (≈ ${fmtGsWords(c.pyg)})` : '',
      ` — ${c.description}. Al ${fmtISO(c.asOf)}.`
    )
  );
  const sources = model.sources.map((s) =>
    h('li', {}, extLink(s.url, `${s.outlet}, ${fmtISO(s.published)}`), `: ${s.states}.`, s.notes ? h('span', { class: 'muted' }, ` ${s.notes}`) : '')
  );
  const files = DATA_FILES.map(([file, label]) =>
    h('li', {}, h('a', { href: `data/${file}`, download: file }, file), h('span', { class: 'muted' }, ` · ${label}`))
  );
  setChildren(
    $('#about-body'),
    h(
      'div',
      { class: 'about-col' },
      h('h3', {}, 'Qué es la cifra'),
      h(
        'p',
        {},
        'Es el perjuicio patrimonial preliminar estimado por el Ministerio Público en la imputación del caso ueno. ',
        'Corresponde a depósitos de instituciones estatales y previsionales. ',
        h('strong', {}, 'No es un monto probado como perdido: '),
        'el caso está en etapa de investigación, las personas imputadas no fueron acusadas ni condenadas, y parte de los depósitos se está devolviendo a través del Fondo de Garantía.'
      ),
      h('p', {}, `Total usado: ${fmtGs(model.total)} (${fmtGsWords(model.total)}). Se suma:`),
      h('ul', { class: 'plain' }, comps),
      h('p', { class: 'muted' }, 'La cifra sale de notas de prensa; el acta de imputación no fue encontrada publicada.'),
      h('ul', { class: 'plain small' }, sources)
    ),
    h(
      'div',
      { class: 'about-col' },
      h('h3', {}, 'Cómo se calcula'),
      h(
        'ol',
        { class: 'steps' },
        h('li', {}, 'Se suman las dos partes de la cifra. La parte en dólares se pasa a guaraníes.'),
        h('li', {}, 'El costo de cada cosa es la mediana de los precios encontrados, con fuente. Se usan datos de 2024 en adelante, salvo cuando hay muy pocos.'),
        h('li', {}, 'Se divide la cifra por ese costo y se redondea hacia abajo.'),
        h('li', {}, 'Se compra una unidad por período (casi siempre, una por día), empezando hoy.')
      ),
      h(
        'p',
        {},
        'Tipo de cambio: ',
        h('strong', {}, `Gs. ${fmtNum(r.value, 2)} por dólar`),
        ` (${r.type}, ${fmtISO(r.date)}). `,
        extLink(r.sourceUrl, 'Fuente: BCP')
      ),
      h('p', { class: 'muted' }, 'Los precios son nominales del año de cada dato. No están ajustados por inflación.'),
      h('h3', {}, 'Los datos'),
      h('p', {}, 'Todo número de este sitio sale de estos archivos CSV. Se pueden descargar y revisar.'),
      h('ul', { class: 'plain files' }, files),
      h(
        'p',
        { class: 'muted' },
        '¿Encontraste un error? Corregí el CSV y mandá el cambio con la fuente. Sitio hermano: ',
        extLink('https://caso-ueno.rickovelar.com/', 'caso-ueno.rickovelar.com'),
        '. Código y datos con licencia MIT.'
      )
    )
  );
  setChildren($('#rate-line'), `Tipo de cambio: Gs. ${fmtNum(r.value, 2)} por dólar, BCP, ${fmtISO(r.date)}.`);
}
