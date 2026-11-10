// Portada, datos de escala y "Sobre los datos". Todas las cifras salen del modelo.

import { h, setChildren, extLink, $ } from './dom.js';
import { fmtNum, fmtGs, fmtGsWords, fmtUsdWords, fmtISO } from '../lib/format.js';
import { scaleFacts } from '../lib/model.js';
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
  setChildren($('#fig-gs'), fmtGsWords(model.total));
  setChildren($('#fig-full'), `${fmtNum(Math.round(model.total))} guaraníes`);
  setChildren($('#fig-usd'), `≈ ${fmtUsdWords(model.totalUSD)}`);
  setChildren(
    $('#lede'),
    'Es el ',
    h('strong', {}, 'perjuicio patrimonial preliminar estimado'),
    ' en el caso ueno, según la imputación fiscal. ',
    h('span', { class: 'muted' }, `Fuente: ${doc}, citada por la prensa.`)
  );
}

export function renderFacts(model) {
  const f = scaleFacts(model);
  const cards = [];
  if (f.salario) {
    cards.push(
      fact(
        `${fmtNum(f.salario.years)} años`,
        'de sueldo mínimo',
        `Es lo que tendría que trabajar una persona que gana el salario mínimo (${fmtGs(f.salario.monthly)} por mes, sin aguinaldo) para juntar esa plata sin gastar nada.`
      )
    );
  }
  if (f.billetes) {
    const b = f.billetes;
    cards.push(
      fact(
        `${fmtNum(b.tonnes, 1)} toneladas`,
        `en billetes de US$ ${b.denomination}`,
        `Son ${fmtNum(b.bills)} billetes. Apilados, forman una torre de ${fmtNum(b.meters)} metros: ${fmtNum(b.petras, 1)} veces la Petra Tower (${fmtNum(b.petraHeight)} m), el edificio más alto del país.`,
        petraBars(b)
      )
    );
  }
  if (f.habitante) {
    cards.push(
      fact(
        fmtGs(f.habitante.perPerson),
        'por habitante',
        `Si se repartiera entre los ${fmtNum(f.habitante.population)} habitantes del país (censo ${f.habitante.asOf}), a cada persona le tocaría eso.`
      )
    );
  }
  setChildren($('#facts-list'), cards);
}

function fact(big, unit, text, extra) {
  return h('li', { class: 'fact' }, h('p', { class: 'fact-big' }, big), h('p', { class: 'fact-unit' }, unit), extra, h('p', { class: 'fact-text' }, text));
}

/** La pila de billetes al lado de una Petra Tower, en proporción. */
function petraBars(b) {
  return h(
    'div',
    { class: 'petra-chart', 'aria-hidden': 'true' },
    h('span', { class: 'bar-col' }, h('span', { class: 'track' }, h('span', { class: 'stack' })), h('span', { class: 'bar-label' }, `pila, ${fmtNum(b.meters)} m`)),
    h(
      'span',
      { class: 'bar-col' },
      h('span', { class: 'track' }, h('span', { class: 'petra', style: { height: `${(100 / b.petras).toFixed(2)}%` } })),
      h('span', { class: 'bar-label' }, `Petra Tower, ${fmtNum(b.petraHeight)} m`)
    )
  );
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
        h('strong', {}, `G. ${fmtNum(r.value, 2)} por dólar`),
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
  setChildren($('#rate-line'), `Tipo de cambio: G. ${fmtNum(r.value, 2)} por dólar, BCP, ${fmtISO(r.date)}.`);
}
