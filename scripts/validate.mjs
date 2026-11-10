#!/usr/bin/env node
// Revisa los CSV de data/ y muestra la tabla de resultados para revisar los números a ojo.
// Uso: npm run validate

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCsv, num } from '../src/lib/csv.js';
import { buildModel, runFor, todayUTC, parseISODate, scaleFacts } from '../src/lib/model.js';
import { fmtNum, fmtGs, fmtGsWords, fmtUsdWords, fmtMillions, fmtDate, fmtDuration, fmtPeriod } from '../src/lib/format.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'data');

const REQUIRED = {
  caso: ['component_id', 'amount', 'currency', 'description_es', 'as_of', 'stated_by', 'document', 'status_es'],
  caso_fuentes: ['outlet', 'published', 'url', 'what_it_states_es', 'notes_es'],
  tipo_de_cambio: ['date', 'pyg_per_usd', 'type', 'source_url', 'use', 'notes_es'],
  items: ['id', 'enabled', 'order', 'category', 'name_es', 'name_plural_es', 'period_days', 'confidence', 'method_es', 'caveat_es', 'model', 'emoji'],
  precios: ['item_id', 'use', 'year', 'entity', 'description_es', 'tender_id', 'total', 'quantity', 'unit_price', 'currency', 'source_type', 'url', 'notes_es'],
  referencias: ['id', 'value', 'unit', 'description_es', 'as_of', 'confidence', 'source_url', 'notes_es'],
  hitos: ['type', 'date', 'offset_years', 'label_es', 'notes_es'],
};
const REQUIRED_REFS = ['salario_minimo_mensual', 'poblacion', 'billete_100_usd_espesor', 'billete_100_usd_peso', 'petra_tower_altura'];
const CURRENCIES = ['PYG', 'USD'];
const SOURCE_TYPES = ['dncp', 'anuncio_oficial', 'prensa', 'anuncio_comercial', 'precio_de_lista'];

const errors = [];
const warnings = [];
const err = (file, line, msg) => errors.push(`${file}${line ? `:${line}` : ''}  ${msg}`);
const warn = (file, line, msg) => warnings.push(`${file}${line ? `:${line}` : ''}  ${msg}`);
const isUrl = (s) => /^https?:\/\/\S+$/.test(s || '');
const is01 = (s) => s === '0' || s === '1';

// 1. Leer y revisar columnas
const tables = {};
for (const [name, cols] of Object.entries(REQUIRED)) {
  const file = `${name}.csv`;
  const path = join(dataDir, file);
  if (!existsSync(path)) {
    err(file, 0, 'no existe');
    continue;
  }
  const t = parseCsv(readFileSync(path, 'utf8'));
  tables[name] = t;
  for (const c of cols) if (!t.columns.includes(c)) err(file, 1, `falta la columna "${c}"`);
  for (const r of t.rows) {
    if (r.__width !== t.columns.length) err(file, r.__line, `tiene ${r.__width} campos y el encabezado ${t.columns.length}`);
  }
  if (!t.rows.length) err(file, 0, 'no tiene filas');
}
if (errors.length) finish();

// 2. Tipo de cambio
const usedRates = tables.tipo_de_cambio.rows.filter((r) => r.use === '1');
if (usedRates.length !== 1) err('tipo_de_cambio.csv', 0, `tiene que haber exactamente una fila con use=1 (hay ${usedRates.length})`);
for (const r of tables.tipo_de_cambio.rows) {
  if (!(num(r.pyg_per_usd) > 0)) err('tipo_de_cambio.csv', r.__line, `pyg_per_usd no es un número válido: "${r.pyg_per_usd}"`);
  if (!is01(r.use)) err('tipo_de_cambio.csv', r.__line, `use tiene que ser 0 o 1: "${r.use}"`);
  if (!parseISODate(r.date)) err('tipo_de_cambio.csv', r.__line, `fecha inválida: "${r.date}"`);
  if (!isUrl(r.source_url)) err('tipo_de_cambio.csv', r.__line, 'falta la URL de la fuente');
}

// 3. Caso
for (const r of tables.caso.rows) {
  if (!(num(r.amount) > 0)) err('caso.csv', r.__line, `amount no es un número válido: "${r.amount}"`);
  if (!CURRENCIES.includes(r.currency)) err('caso.csv', r.__line, `currency desconocida: "${r.currency}"`);
}
for (const r of tables.caso_fuentes.rows) {
  if (!isUrl(r.url)) err('caso_fuentes.csv', r.__line, 'falta la URL');
  if (!parseISODate(r.published)) err('caso_fuentes.csv', r.__line, `fecha inválida: "${r.published}"`);
}

// 4. Items
const itemIds = new Set();
for (const r of tables.items.rows) {
  if (!/^[a-z0-9_]+$/.test(r.id)) err('items.csv', r.__line, `id inválido: "${r.id}"`);
  if (itemIds.has(r.id)) err('items.csv', r.__line, `id repetido: "${r.id}"`);
  itemIds.add(r.id);
  if (!is01(r.enabled)) err('items.csv', r.__line, `enabled tiene que ser 0 o 1: "${r.enabled}"`);
  if (!Number.isInteger(num(r.order))) err('items.csv', r.__line, `order no es un entero: "${r.order}"`);
  const pd = num(r.period_days);
  if (!(Number.isInteger(pd) && pd > 0)) err('items.csv', r.__line, `period_days tiene que ser un entero positivo: "${r.period_days}"`);
  if (!r.name_es || !r.name_plural_es) err('items.csv', r.__line, 'faltan name_es o name_plural_es');
  if (r.enabled === '1') {
    if (!r.method_es || !r.caveat_es) err('items.csv', r.__line, 'falta method_es o caveat_es');
    if (!r.model) warn('items.csv', r.__line, `"${r.id}" no tiene model: se dibuja una caja genérica`);
  }
}

// 5. Precios
for (const r of tables.precios.rows) {
  const f = 'precios.csv';
  if (!itemIds.has(r.item_id)) err(f, r.__line, `item_id desconocido: "${r.item_id}"`);
  if (!is01(r.use)) err(f, r.__line, `use tiene que ser 0 o 1: "${r.use}"`);
  if (!/^\d{4}$/.test(r.year)) err(f, r.__line, `year inválido: "${r.year}"`);
  if (!(num(r.unit_price) > 0)) err(f, r.__line, `unit_price no es un número válido: "${r.unit_price}"`);
  if (!CURRENCIES.includes(r.currency)) err(f, r.__line, `currency desconocida: "${r.currency}"`);
  if (!isUrl(r.url)) err(f, r.__line, 'falta la URL (toda fila necesita una fuente)');
  if (!SOURCE_TYPES.includes(r.source_type)) err(f, r.__line, `source_type desconocido: "${r.source_type}"`);
  for (const c of ['total', 'quantity']) {
    if (r[c] !== '' && !(num(r[c]) > 0)) err(f, r.__line, `${c} no es un número válido: "${r[c]}"`);
  }
  if (r.source_type === 'dncp' && !r.tender_id) warn(f, r.__line, 'fuente dncp sin tender_id');
  const total = num(r.total);
  const qty = num(r.quantity);
  const unit = num(r.unit_price);
  if (total > 0 && qty > 0 && unit > 0) {
    const diff = Math.abs(total / qty - unit) / unit;
    if (diff > 0.005) warn(f, r.__line, `total/quantity (${fmtNum(total / qty)}) no coincide con unit_price (${fmtNum(unit)})`);
  }
  if (r.use === '0' && !r.notes_es) warn(f, r.__line, 'fila con use=0 sin notes_es que explique por qué');
}
for (const r of tables.items.rows) {
  if (r.enabled !== '1') continue;
  const n = tables.precios.rows.filter((p) => p.item_id === r.id && p.use === '1').length;
  if (n < 1) err('precios.csv', 0, `el item habilitado "${r.id}" no tiene ninguna fila con use=1`);
}

// 6. Referencias
const refIds = new Set(tables.referencias.rows.map((r) => r.id));
for (const id of REQUIRED_REFS) if (!refIds.has(id)) err('referencias.csv', 0, `falta la fila "${id}"`);
for (const r of tables.referencias.rows) {
  if (!(num(r.value) > 0)) err('referencias.csv', r.__line, `value no es un número válido: "${r.value}"`);
  if (!isUrl(r.source_url)) err('referencias.csv', r.__line, 'falta la URL de la fuente');
}

// 7. Hitos
for (const r of tables.hitos.rows) {
  if (r.type === 'absolute') {
    if (!parseISODate(r.date)) err('hitos.csv', r.__line, `fecha inválida: "${r.date}"`);
  } else if (r.type === 'offset') {
    if (!(num(r.offset_years) > 0)) err('hitos.csv', r.__line, `offset_years no es un número válido: "${r.offset_years}"`);
  } else {
    err('hitos.csv', r.__line, `type tiene que ser absolute u offset: "${r.type}"`);
  }
  if (!r.label_es) err('hitos.csv', r.__line, 'falta label_es');
}

finish();

function finish() {
  if (!errors.length) printReport();
  if (warnings.length) {
    console.log(`\nAvisos (${warnings.length}):`);
    for (const w of warnings) console.log('  - ' + w);
  }
  if (errors.length) {
    console.error(`\nErrores (${errors.length}):`);
    for (const e of errors) console.error('  ✗ ' + e);
    process.exit(1);
  }
  console.log('\n✓ Los datos están bien.');
  process.exit(0);
}

function printReport() {
  const model = buildModel(tables);
  const start = todayUTC();
  console.log(`Tipo de cambio usado: G. ${fmtNum(model.rate.value, 2)} por dólar (${model.rate.type}, ${model.rate.date})`);
  for (const c of model.components) {
    console.log(`  ${c.id}: ${c.currency} ${fmtNum(c.amount)} → ${fmtGs(c.pyg)}`);
  }
  console.log(`Total: ${fmtGs(model.total)} = G. ${fmtMillions(model.total)} = ${fmtGsWords(model.total)} ≈ ${fmtUsdWords(model.totalUSD)}`);
  console.log(`Inicio de la línea de tiempo (hoy): ${fmtDate(start)}\n`);

  const rows = model.items
    .filter((i) => i.enabled)
    .map((i) => {
      const run = runFor(i, start);
      return [
        i.id,
        String(i.usedCount),
        fmtGs(i.unitCost),
        fmtGsWords(i.unitCost),
        fmtNum(i.units),
        fmtPeriod(i.periodDays),
        fmtDate(run.end),
        fmtDuration(run.duration),
        fmtNum(i.totalDays / 365.2425, 1),
      ];
    });
  const head = ['item', 'n', 'costo unitario', 'en palabras', 'unidades', 'ritmo', 'se termina el', 'duración', 'años'];
  const widths = head.map((h, j) => Math.max(h.length, ...rows.map((r) => r[j].length)));
  const right = new Set([1, 2, 3, 4, 8]);
  const line = (cells) => cells.map((c, j) => (right.has(j) ? c.padStart(widths[j]) : c.padEnd(widths[j]))).join('  ');
  console.log(line(head));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(line(r));

  const facts = scaleFacts(model);
  console.log('\nDatos de escala:');
  if (facts.salario) console.log(`  Salario mínimo: ${fmtNum(facts.salario.years)} años de sueldo (12 por año, ${fmtGs(facts.salario.monthly)} por mes)`);
  if (facts.billetes) {
    const b = facts.billetes;
    console.log(`  Billetes de US$ ${b.denomination}: ${fmtNum(b.bills)} billetes, ${fmtNum(b.tonnes, 1)} toneladas, pila de ${fmtNum(b.meters)} m = ${fmtNum(b.petras, 1)} Petra Tower`);
  }
  if (facts.habitante) console.log(`  Por habitante: ${fmtGs(facts.habitante.perPerson)} (${fmtNum(facts.habitante.population)} personas)`);
}
