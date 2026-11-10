// Formato de números y fechas para es-PY: punto para miles, coma para decimales.
// Se arma a mano (sin Intl) para que salga igual en todos los navegadores, también con 4 cifras.

export function fmtNum(value, decimals = 0) {
  if (!Number.isFinite(value)) return '—';
  const neg = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  let [int, dec] = fixed.split('.');
  int = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + int + (dec ? ',' + dec : '');
}

/** Gs. 96.015.815 */
export function fmtGs(value) {
  return 'Gs. ' + fmtNum(Math.round(value));
}

/** Monto en palabras: "5,06 billones", "96,0 millones", "8,86 millones", "4.293 millones". */
export function amountWords(value) {
  const abs = Math.abs(value);
  if (abs >= 1e12) {
    const v = value / 1e12;
    return `${fmtNum(v, 2)} ${Math.abs(v) < 2 && fmtNum(v, 2) === '1,00' ? 'billón' : 'billones'}`;
  }
  if (abs >= 1e6) {
    const m = value / 1e6;
    const dec = Math.abs(m) < 10 ? 2 : Math.abs(m) < 1000 ? 1 : 0;
    const txt = fmtNum(m, dec);
    return `${txt} ${txt === '1' || txt === '1,0' || txt === '1,00' ? 'millón' : 'millones'}`;
  }
  return fmtNum(Math.round(value));
}

export function fmtGsWords(value) {
  return 'Gs. ' + amountWords(value);
}

export function fmtUsdWords(value) {
  return 'US$ ' + amountWords(value);
}

/** "5.061.751 millones" */
export function fmtMillions(value) {
  return fmtNum(Math.round(value / 1e6)) + ' millones';
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 7 de febrero de 2171 (fechas UTC) */
export function fmtDate(d) {
  return `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

export function fmtDateShort(d) {
  return { day: String(d.getUTCDate()), month: MONTHS_SHORT[d.getUTCMonth()], year: String(d.getUTCFullYear()) };
}

/** "2026-11-09" o "2026-09" → "9 de noviembre de 2026" / "septiembre de 2026" */
export function fmtISO(s) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s || '');
  if (!m) return s;
  const month = MONTHS[+m[2] - 1];
  return m[3] ? `${+m[3]} de ${month} de ${m[1]}` : `${month} de ${m[1]}`;
}

function plural(n, one, many) {
  return `${fmtNum(n)} ${n === 1 ? one : many}`;
}

/** Duración en palabras: "144 años", "9 años y 6 meses", "1 año y 4 meses", "5 meses", "12 días". */
export function fmtDuration({ years, months, days }) {
  if (years >= 10) return plural(years, 'año', 'años');
  if (years >= 1) return months ? `${plural(years, 'año', 'años')} y ${plural(months, 'mes', 'meses')}` : plural(years, 'año', 'años');
  if (months >= 1) return days ? `${plural(months, 'mes', 'meses')} y ${plural(days, 'día', 'días')}` : plural(months, 'mes', 'meses');
  return plural(days, 'día', 'días');
}

/** "por día" / "cada 30 días" */
export function fmtPeriod(periodDays) {
  return periodDays === 1 ? 'por día' : `cada ${fmtNum(periodDays)} días`;
}

export function unitsLabel(n, item) {
  return `${fmtNum(n)} ${n === 1 ? item.name : item.namePlural}`;
}
