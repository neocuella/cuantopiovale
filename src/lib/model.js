// Todos los cálculos del sitio, a partir de las tablas CSV ya parseadas.
// Reglas en data/README.md. Este módulo no tiene cifras propias: todo sale de las tablas.
// Lo usan el navegador y scripts/validate.mjs.

import { num } from './csv.js';

const DAY_MS = 86400000;

export function median(values) {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return NaN;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Hoy, como fecha UTC a medianoche (se evita el horario de verano en las cuentas). */
export function todayUTC(now = new Date()) {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function parseISODate(s) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s || '');
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 1));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function addYears(date, years) {
  const d = new Date(date.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

export function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/** Diferencia de calendario en años, meses y días. */
export function diffYMD(a, b) {
  let y = b.getUTCFullYear() - a.getUTCFullYear();
  let m = b.getUTCMonth() - a.getUTCMonth();
  let d = b.getUTCDate() - a.getUTCDate();
  if (d < 0) {
    m -= 1;
    const prevMonthDays = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 0)).getUTCDate();
    d += prevMonthDays;
  }
  if (m < 0) {
    y -= 1;
    m += 12;
  }
  return { years: y, months: m, days: d };
}

/** El tipo de cambio marcado con use=1. */
export function exchangeRate(tables) {
  const rows = tables.tipo_de_cambio.rows.filter((r) => r.use === '1');
  if (rows.length !== 1) throw new Error(`Tiene que haber exactamente un tipo de cambio con use=1 (hay ${rows.length}).`);
  const r = rows[0];
  return { value: num(r.pyg_per_usd), date: r.date, type: r.type, sourceUrl: r.source_url, notes: r.notes_es };
}

export function toPYG(amount, currency, rate) {
  if (currency === 'PYG') return amount;
  if (currency === 'USD') return amount * rate;
  return NaN;
}

/** Construye el modelo de datos completo. */
export function buildModel(tables) {
  const rate = exchangeRate(tables);

  const components = tables.caso.rows.map((r) => ({
    id: r.component_id,
    amount: num(r.amount),
    currency: r.currency,
    pyg: toPYG(num(r.amount), r.currency, rate.value),
    description: r.description_es,
    asOf: r.as_of,
    statedBy: r.stated_by,
    document: r.document,
    status: r.status_es,
  }));
  const total = components.reduce((s, c) => s + c.pyg, 0);

  const prices = tables.precios.rows.map((r) => ({
    itemId: r.item_id,
    use: r.use === '1',
    year: r.year,
    entity: r.entity,
    description: r.description_es,
    tenderId: r.tender_id,
    total: num(r.total),
    quantity: num(r.quantity),
    unitPrice: num(r.unit_price),
    currency: r.currency,
    unitPYG: toPYG(num(r.unit_price), r.currency, rate.value),
    sourceType: r.source_type,
    url: r.url,
    notes: r.notes_es,
    component: r.component_es || '',
  }));

  const items = tables.items.rows
    .map((r) => {
      const itemPrices = prices.filter((p) => p.itemId === r.id);
      const used = itemPrices.filter((p) => p.use);
      // Si los precios están separados por partes (la cama de terapia intensiva: respirador,
      // monitor y cama), el costo es la suma de la mediana de cada parte; si no, la mediana.
      const names = [...new Set(used.map((p) => p.component).filter(Boolean))];
      const components = names.map((name) => {
        const list = used.filter((p) => p.component === name);
        return { name, count: list.length, median: median(list.map((p) => p.unitPYG)) };
      });
      const unitCost = components.length ? components.reduce((s, c) => s + c.median, 0) : median(used.map((p) => p.unitPYG));
      const units = unitCost > 0 ? Math.floor(total / unitCost) : 0;
      const periodDays = num(r.period_days);
      return {
        id: r.id,
        enabled: r.enabled === '1',
        order: num(r.order),
        category: r.category,
        name: r.name_es,
        namePlural: r.name_plural_es,
        periodDays,
        confidence: r.confidence,
        method: r.method_es,
        caveat: r.caveat_es,
        model: r.model || '',
        emoji: r.emoji || '',
        prices: [...used, ...itemPrices.filter((p) => !p.use)],
        usedCount: used.length,
        components,
        unitCost,
        units,
        totalDays: units * periodDays,
      };
    })
    .sort((a, b) => a.order - b.order);

  const refs = {};
  for (const r of tables.referencias.rows) {
    refs[r.id] = { value: num(r.value), unit: r.unit, description: r.description_es, asOf: r.as_of, sourceUrl: r.source_url, notes: r.notes_es };
  }

  const hitos = tables.hitos.rows.map((r) => ({
    type: r.type,
    date: r.date,
    offsetYears: num(r.offset_years),
    label: r.label_es,
    notes: r.notes_es,
    approximate: /aproximad/i.test(r.notes_es || ''),
  }));

  const sources = tables.caso_fuentes.rows.map((r) => ({
    outlet: r.outlet,
    published: r.published,
    url: r.url,
    states: r.what_it_states_es,
    notes: r.notes_es,
  }));

  return { rate, components, total, totalUSD: total / rate.value, prices, items, refs, hitos, sources };
}

/** Línea de tiempo de una cosa a partir de una fecha de inicio. */
export function runFor(item, start) {
  const end = addDays(start, item.units * item.periodDays);
  return { start, end, units: item.units, totalDays: item.totalDays, duration: diffYMD(start, end) };
}

/** Hitos que caen dentro de la corrida, con su día (contado desde el inicio). */
export function hitosFor(model, start, end) {
  const out = [];
  for (const h of model.hitos) {
    let date = null;
    if (h.type === 'absolute') date = parseISODate(h.date);
    else if (h.type === 'offset' && Number.isFinite(h.offsetYears)) date = addYears(start, h.offsetYears);
    if (!date) continue;
    if (date > start && date <= end) out.push({ ...h, when: date, day: daysBetween(start, date) });
  }
  return out.sort((a, b) => a.day - b.day);
}

/**
 * Datos de escala de referencias.csv. La denominación del billete sale del id de la fila
 * (billete_<denominación>_usd_peso), para no escribir cifras en el código.
 */
export function scaleFacts(model) {
  const { refs, total, rate } = model;
  const MONTHS_PER_YEAR = 12; // calendario, no es un dato
  const wage = refs.salario_minimo_mensual;
  const pop = refs.poblacion;
  const weightKey = Object.keys(refs).find((k) => /^billete_\d+_usd_peso$/.test(k));
  const thickKey = Object.keys(refs).find((k) => /^billete_\d+_usd_espesor$/.test(k));
  const petra = refs.petra_tower_altura;
  const facts = {};
  if (wage) {
    facts.salario = {
      monthly: wage.value,
      years: total / (wage.value * MONTHS_PER_YEAR),
      source: wage,
    };
  }
  if (weightKey && thickKey && petra) {
    const denomination = Number(/^billete_(\d+)_usd/.exec(weightKey)[1]);
    const bills = model.totalUSD / denomination;
    const grams = bills * refs[weightKey].value; // unidad g
    const meters = (bills * refs[thickKey].value) / 1000; // unidad mm
    facts.billetes = {
      denomination,
      bills,
      tonnes: grams / 1e6,
      meters,
      petraHeight: petra.value,
      petras: meters / petra.value,
      sources: [refs[weightKey], refs[thickKey], petra],
    };
  }
  if (pop) facts.habitante = { population: pop.value, perPerson: total / pop.value, asOf: pop.asOf, source: pop };
  facts.rate = rate;
  return facts;
}
