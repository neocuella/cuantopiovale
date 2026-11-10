// Tarjeta final: fecha en que se termina la plata, de dónde sale el número y botones.

import { h, extLink, capitalize } from './dom.js';
import { fmtNum, fmtGs, fmtGsWords, fmtDate, fmtDuration, fmtPeriod, unitsLabel } from '../lib/format.js';
import { SOURCE_TYPES } from './sections.js';

export function buildEndCard({ model, item, run, hitos, thumb, noScene, onShare, onReplay, onOther, onToggle }) {
  const priceRows = item.prices.map((p) => {
    const price = p.currency === 'USD' ? `US$ ${fmtNum(p.unitPrice)} (≈ ${fmtGs(p.unitPYG)})` : fmtGs(p.unitPrice);
    const qty = Number.isFinite(p.quantity) && p.quantity !== 1 && Number.isFinite(p.total)
      ? ` · total ${p.currency === 'USD' ? 'US$ ' + fmtNum(p.total) : fmtGs(p.total)} ÷ ${fmtNum(p.quantity, p.quantity % 1 ? 1 : 0)}`
      : '';
    return h(
      'li',
      { class: p.use ? 'price used' : 'price unused' },
      h('p', { class: 'price-head' }, h('strong', {}, price), h('span', { class: 'tag' }, p.use ? 'se usa' : 'no se usa')),
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
    { class: 'end-inner' },
    h('div', { class: 'end-grab', 'aria-hidden': 'true' }, h('span', {})),
    h(
      'div',
      { class: 'end-top' },
      thumb ? h('img', { class: 'end-thumb', src: thumb, alt: '' }) : h('span', { class: 'end-emoji', 'aria-hidden': 'true' }, item.emoji),
      h('p', { class: 'kicker' }, `${capitalize(item.namePlural)} · 1 ${fmtPeriod(item.periodDays)} desde hoy`)
    ),
    noScene ? h('p', { class: 'notice' }, 'Tu navegador no puede mostrar la animación en 3D. Acá está el resultado.') : null,
    h('h2', { class: 'end-title', id: 'end-title', tabindex: '-1' }, 'La plata se termina el ', h('span', { class: 'end-date' }, fmtDate(run.end))),
    h(
      'dl',
      { class: 'stats' },
      stat('Unidades', unitsLabel(item.units, item)),
      stat('Tiempo', fmtDuration(run.duration)),
      stat('Cada una cuesta', fmtGsWords(item.unitCost)),
      stat('Ritmo', `1 ${fmtPeriod(item.periodDays)}`)
    ),
    h(
      'div',
      { class: 'end-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: onShare, id: 'share-btn' }, 'Compartir'),
      h('button', { class: 'btn', type: 'button', onclick: onReplay }, 'Ver de nuevo'),
      h('button', { class: 'btn', type: 'button', onclick: onOther },
        h('span', { class: 'lbl-long' }, 'Probar con otra cosa'),
        h('span', { class: 'lbl-short' }, 'Otra cosa')
      )
    ),
    h('p', { class: 'share-status', id: 'share-status', role: 'status' }),
    h(
      'p',
      { class: 'fineprint' },
      `Perjuicio patrimonial preliminar estimado según la imputación fiscal del caso ueno: ${fmtGsWords(model.total)}. `,
      'No es una pérdida probada; el caso está en investigación.'
    ),
    h(
      'button',
      { class: 'end-more', id: 'end-more', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'end-detail', onclick: onToggle },
      h('span', { class: 'end-more-label' }, 'Ver detalle y fuentes'),
      h('span', { class: 'end-more-icon', 'aria-hidden': 'true' }, '↑')
    ),
    h(
      'div',
      { class: 'end-detail', id: 'end-detail' },
      h('p', { class: 'muted small' }, `Sobran ${fmtGsWords(leftover)}, que no alcanzan para una más.`),
      h('div', { class: 'method' }, h('h3', {}, 'Cómo sale el costo'), h('p', {}, item.method), h('p', { class: 'caveat' }, h('strong', {}, 'Ojo: '), item.caveat), h('p', { class: 'muted small' }, `Confianza en el dato: ${item.confidence}.`)),
      hitos.length
        ? h(
            'div',
            { class: 'passed' },
            h('h3', {}, 'Mientras tanto'),
            h('ul', { class: 'plain' }, hitos.map((x) => h('li', {}, x.label, x.approximate ? '' : h('span', { class: 'muted' }, ` · ${fmtDate(x.when)}`))))
          )
        : null,
      h(
        'details',
        { class: 'sources' },
        h('summary', {}, '¿De dónde sale este número?'),
        h(
          'p',
          { class: 'small' },
          `Mediana de ${item.usedCount} ${item.usedCount === 1 ? 'precio' : 'precios'} con fuente: ${fmtGs(item.unitCost)}. `,
          'Los que no se usan quedan como referencia, con el motivo.'
        ),
        h('ul', { class: 'plain prices' }, priceRows)
      )
    )
  );
}

function stat(label, value) {
  return h('div', { class: 'stat' }, h('dt', {}, label), h('dd', {}, value));
}
