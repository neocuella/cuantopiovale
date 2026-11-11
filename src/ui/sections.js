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
  const section = (cls, title, ...kids) => h('section', { class: `about-sec ${cls}` }, h('h3', { class: 'about-h' }, title), ...kids);

  // La cifra: el total grande, sus dos partes lado a lado y la advertencia aparte.
  const parts = model.components.map((c) =>
    h(
      'div',
      { class: 'fig-part' },
      h('span', { class: 'fig-k' }, c.currency === 'USD' ? 'Parte en dólares' : 'Parte en guaraníes'),
      h('strong', { class: 'fig-amt' }, c.currency === 'USD' ? `US$ ${fmtNum(c.amount)}` : fmtGs(c.amount)),
      c.currency === 'USD' ? h('span', { class: 'fig-conv' }, `≈ ${fmtGsWords(c.pyg)}`) : null,
      h('span', { class: 'fig-desc' }, `${c.description}. Datos a ${fmtISO(c.asOf)}.`)
    )
  );
  const cifra = section(
    'about-cifra',
    'Qué es la cifra',
    h(
      'p',
      { class: 'about-p' },
      'Es el perjuicio patrimonial preliminar estimado por el Ministerio Público en la imputación del caso ueno. ',
      'Corresponde a depósitos de instituciones estatales y previsionales.'
    ),
    h(
      'div',
      { class: 'fig' },
      h(
        'div',
        { class: 'fig-total' },
        h('span', { class: 'fig-k' }, 'Total usado'),
        h('strong', { class: 'fig-big' }, fmtGs(model.total)),
        h('span', { class: 'fig-conv' }, `${fmtGsWords(model.total)} · ≈ US$ ${fmtMillions(model.totalUSD)}`)
      ),
      h('div', { class: 'fig-parts' }, parts)
    ),
    h(
      'p',
      { class: 'about-note' },
      h('strong', {}, 'No es un monto probado como perdido. '),
      'El caso está en etapa de investigación, las personas imputadas no fueron acusadas ni condenadas, y parte de los depósitos se está devolviendo a través del Fondo de Garantía.'
    )
  );

  // Cómo se calcula: los pasos y dos datos de referencia.
  const calculo = section(
    'about-calc',
    'Cómo se calcula',
    h(
      'ol',
      { class: 'steps' },
      h('li', {}, 'Se suman las dos partes de la cifra. La parte en dólares se pasa a guaraníes.'),
      h('li', {}, 'El costo de cada cosa es la mediana de los precios encontrados, con fuente. Se usan datos de 2024 en adelante, salvo cuando hay muy pocos.'),
      h('li', {}, 'Se divide la cifra por ese costo y se redondea hacia abajo.'),
      h('li', {}, 'Se compra una unidad por período (casi siempre, una por día), empezando hoy.')
    ),
    h(
      'dl',
      { class: 'about-kv' },
      h('dt', {}, 'Tipo de cambio'),
      h('dd', {}, h('strong', {}, `Gs. ${fmtNum(r.value, 2)} por dólar`), h('span', { class: 'muted' }, ` · ${r.type}, ${fmtISO(r.date)}. `), extLink(r.sourceUrl, 'Fuente: BCP')),
      h('dt', {}, 'Precios'),
      h('dd', {}, 'Nominales del año de cada dato. No están ajustados por inflación.')
    )
  );

  // De dónde sale la cifra: las notas de prensa, una por fila.
  const fuentes = section(
    'about-src',
    'De dónde sale la cifra',
    h('p', { class: 'about-p muted' }, 'La cifra sale de notas de prensa; el acta de imputación no fue encontrada publicada.'),
    h(
      'ul',
      { class: 'src-list' },
      model.sources.map((s) =>
        h(
          'li',
          {},
          h('span', { class: 'src-head' }, extLink(s.url, s.outlet), h('span', { class: 'muted' }, ` · ${fmtISO(s.published)}`)),
          h('span', { class: 'src-says' }, `${s.states}.`),
          s.notes ? h('span', { class: 'src-note' }, s.notes) : null
        )
      )
    )
  );

  // Los datos: los archivos, como casillas.
  const datos = section(
    'about-data',
    'Los datos',
    h('p', { class: 'about-p' }, 'Todo número de este sitio sale de estos archivos CSV. Se pueden descargar y revisar.'),
    h(
      'ul',
      { class: 'file-grid' },
      DATA_FILES.map(([file, label]) => h('li', {}, h('a', { href: `data/${file}`, download: file }, h('span', { class: 'file-name' }, file), h('span', { class: 'file-label' }, label))))
    ),
    h(
      'p',
      { class: 'about-foot muted' },
      '¿Encontraste un error? Corregí el CSV y mandá el cambio con la fuente. Sitio hermano: ',
      extLink('https://caso-ueno.rickovelar.com/', 'caso-ueno.rickovelar.com'),
      '. Código y datos con licencia MIT.'
    )
  );

  setChildren($('#about-body'), cifra, h('div', { class: 'about-pair' }, calculo, fuentes), datos);
}
