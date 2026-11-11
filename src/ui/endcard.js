// Resultado de una corrida, en dos partes:
// - buildResult: el bloque chico que queda sobre el calendario (fecha, tres datos y botones).
// - buildDetails: el resto (de dónde sale el costo, fuentes, hitos), que se abre en una ventana.

import { h, extLink, capitalize } from './dom.js';
import { fmtNum, fmtGs, fmtGsWords, fmtDate, fmtDuration, fmtPeriod, fmtMillions, unitsLabel } from '../lib/format.js';
import { SOURCE_TYPES } from './sections.js';

export function buildResult({ model, item, run, noScene, onMore, onShare, onOther }) {
  return h(
    'div',
    { class: 'result-inner' },
    noScene ? h('p', { class: 'notice' }, 'Tu navegador no puede mostrar la animación en 3D. Acá está el resultado.') : null,
    h(
      'h2',
      { class: 'result-title', id: 'end-title', tabindex: '-1' },
      // como en las imágenes para compartir: la cantidad grande y sola, y la cosa debajo
      `Los US$ ${fmtMillions(model.totalUSD)} del caso ueno podrían comprar: `,
      h('span', { class: 'result-num' }, fmtNum(item.units)),
      ' ',
      h('span', { class: 'result-item' }, item.units === 1 ? item.name : item.namePlural)
    ),
    h('p', { class: 'result-when' }, `Comprando 1 ${fmtPeriod(item.periodDays)}, la plata se termina el ${fmtDate(run.end)}.`),
    h(
      'dl',
      { class: 'result-stats' },
      stat('Gastado en', fmtDuration(run.duration)),
      stat('Cada unidad cuesta', fmtGsWords(item.unitCost))
    ),
    h(
      'div',
      { class: 'result-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: onMore, 'aria-haspopup': 'dialog', 'aria-controls': 'info-dlg' }, 'Más info'),
      h('button', { class: 'btn', type: 'button', onclick: onShare, id: 'share-btn' }, 'Compartir'),
      h('button', { class: 'btn', type: 'button', onclick: onOther }, 'Otra cosa')
    ),
    h('p', { class: 'result-fine' }, 'Según la imputación fiscal. No es una pérdida probada.')
  );
}

export function buildDetails({ model, item, run, hitos, thumb, onShare, onReplay, onOther }) {
  const used = item.prices.filter((p) => p.use);
  const unused = item.prices.length - used.length;
  const priceRows = used.map((p) => {
    const price = p.currency === 'USD' ? `US$ ${fmtNum(p.unitPrice)} (≈ ${fmtGs(p.unitPYG)})` : fmtGs(p.unitPrice);
    const qty = Number.isFinite(p.quantity) && p.quantity !== 1 && Number.isFinite(p.total)
      ? ` · total ${p.currency === 'USD' ? 'US$ ' + fmtNum(p.total) : fmtGs(p.total)} ÷ ${fmtNum(p.quantity, p.quantity % 1 ? 1 : 0)}`
      : '';
    return h(
      'li',
      { class: 'price used' },
      h('p', { class: 'price-head' }, p.component ? h('span', { class: 'price-part' }, `${capitalize(p.component)} · `) : null, h('strong', {}, price)),
      h('p', {}, `${p.description}. ${p.entity}, ${p.year}.`),
      h(
        'p',
        { class: 'muted small' },
        SOURCE_TYPES[p.sourceType] || p.sourceType,
        p.tenderId ? ` · ID ${p.tenderId}` : '',
        qty,
        ' · ',
        extLink(p.url, 'ver fuente')
      ),
      p.notes ? h('p', { class: 'note small' }, p.notes) : null
    );
  });

  const leftover = model.total - item.units * item.unitCost;

  return h(
    'div',
    { class: 'info-inner' },
    h(
      'div',
      { class: 'end-top' },
      thumb ? h('img', { class: 'end-thumb', src: thumb, alt: '' }) : h('span', { class: 'end-emoji', 'aria-hidden': 'true' }, item.emoji),
      h('p', { class: 'kicker' }, `${capitalize(item.namePlural)} · 1 ${fmtPeriod(item.periodDays)} desde hoy`)
    ),
    h('h2', { class: 'info-title', id: 'info-title' }, `${capitalize(unitsLabel(item.units, item))} hasta el ${fmtDate(run.end)}`),
    h(
      'p',
      { class: 'info-lede' },
      `Cada unidad cuesta ${fmtGsWords(item.unitCost)}. Comprando 1 ${fmtPeriod(item.periodDays)}, la plata dura ${fmtDuration(run.duration)}. `,
      `Sobran ${fmtGsWords(leftover)}, que no alcanzan para una más.`
    ),
    h('div', { class: 'method' }, h('h3', {}, 'Cómo sale el costo'), h('p', {}, item.method), h('p', { class: 'caveat' }, h('strong', {}, 'Ojo: '), item.caveat), h('p', { class: 'muted small' }, `Confianza en el dato: ${item.confidence}.`)),
    h(
      'div',
      { class: 'sources' },
      h('h3', {}, '¿De dónde sale este número?'),
      h(
        'p',
        { class: 'small' },
        item.components?.length
          ? `Es la suma de la mediana de cada parte: ${item.components.map((c) => `${c.name} ${fmtGs(c.median)} (${c.count} precios)`).join(', ')}. Total: ${fmtGs(item.unitCost)}.`
          : item.usedCount === 1
            ? `Un solo precio con fuente: ${fmtGs(item.unitCost)}.`
            : `Es la mediana de estos ${item.usedCount} precios con fuente: ${fmtGs(item.unitCost)}.`
      ),
      h('ul', { class: 'plain prices' }, priceRows),
      unused
        ? h(
            'p',
            { class: 'muted small prices-more' },
            `Además encontramos ${unused === 1 ? 'otro precio que quedó' : `otros ${unused} precios que quedaron`} afuera, por ser anteriores a 2024 o no comparables. `,
            h('a', { href: 'data/precios.csv', download: 'precios.csv' }, 'Están en precios.csv'),
            ', con el motivo de cada uno.'
          )
        : null
    ),
    hitos.length
      ? h(
          'div',
          { class: 'passed' },
          h('h3', {}, 'Antes de que se termine la plata'),
          h('ul', { class: 'plain' }, hitos.map((x) => h('li', {}, x.label, x.approximate ? '' : h('span', { class: 'muted' }, ` · ${fmtDate(x.when)}`))))
        )
      : null,
    h(
      'p',
      { class: 'fineprint' },
      `Perjuicio patrimonial preliminar estimado según la imputación fiscal del caso ueno: ${fmtGsWords(model.total)}. `,
      'No es una pérdida probada; el caso está en investigación.'
    ),
    h(
      'div',
      { class: 'end-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: onShare }, 'Compartir'),
      h('button', { class: 'btn', type: 'button', onclick: onReplay }, 'Ver de nuevo'),
      h('button', { class: 'btn', type: 'button', onclick: onOther }, 'Probar con otra cosa')
    )
  );
}

function stat(label, value) {
  return h('div', { class: 'stat' }, h('dt', {}, label), h('dd', {}, value));
}
