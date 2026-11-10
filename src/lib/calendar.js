// Calendario de la corrida: una celda por día, semanas de lunes a domingo, meses en bloques de
// 7 × 6 y años en bloques de 4 × 3 meses, como un almanaque de pared.
//
// Todo en "unidades de celda" sobre un plano local: x crece hacia la derecha de la lectura y z
// hacia abajo (la escena gira este plano para verlo en isométrico). No usa three.js, así que se
// puede probar en Node.
//
// Los días se cuentan desde el inicio de la corrida (día 0 = hoy). La unidad k se compra el día
// k × period_days, igual que en src/lib/model.js.

const DAY_MS = 86400000;

// Medidas (en celdas).
export const LAYOUT = {
  monthHead: 3.0, // nombre del mes (1,9) + iniciales de los días (0,8) + aire
  weekRow: 0.8, // alto de la fila de iniciales, justo encima de la grilla
  monthGapX: 1.4,
  monthGapZ: 1.2,
  yearPad: 1.5,
  yearHead: 8.0, // el número del año
  yearGapX: 4.0,
  yearGapZ: 4.0,
};
const L = LAYOUT;
export const MONTH_W = 7;
export const MONTH_H = L.monthHead + 6;
export const YEAR_W = 2 * L.yearPad + 4 * MONTH_W + 3 * L.monthGapX;
export const YEAR_H = L.yearHead + 3 * MONTH_H + 2 * L.monthGapZ + L.yearPad;
export const YEAR_PX = YEAR_W + L.yearGapX;
export const YEAR_PZ = YEAR_H + L.yearGapZ;

/** Lunes = 0 … domingo = 6, para un día contado desde 1970-01-01 (que fue jueves). */
const weekdayOfEpochDay = (e) => (((e + 3) % 7) + 7) % 7;

/**
 * Años por fila: el calendario completo queda más o menos cuadrado sobre el suelo, que es lo que
 * mejor llena la pantalla con una cámara isométrica (el recuadro en pantalla de cualquier
 * rectángulo del suelo tiene siempre la misma proporción; lo único que cambia es cuánto lo llena).
 */
export function yearsPerRow(years) {
  return Math.max(1, Math.ceil(Math.sqrt((years * YEAR_PZ) / YEAR_PX)));
}

export function buildCalendar({ units, periodDays }, start) {
  const period = periodDays;
  const N = units;
  const totalDays = N * period;
  const startMs = start.getTime();
  const startEpoch = Math.round(startMs / DAY_MS);
  const y0 = start.getUTCFullYear();
  const endDate = new Date(startMs + totalDays * DAY_MS);
  const y1 = endDate.getUTCFullYear();
  const years = y1 - y0 + 1;
  const M = years * 12;
  const cols = yearsPerRow(years);
  const rows = Math.ceil(years / cols);

  const mStart = new Int32Array(M + 1); // día (desde hoy) del 1.º de cada mes; negativo antes de hoy
  const mDays = new Uint8Array(M);
  const mFirst = new Uint8Array(M); // día de la semana del 1.º (lunes = 0)
  const kFirst = new Int32Array(M + 1); // primera unidad que cae en cada mes
  const mX = new Float32Array(M); // esquina superior izquierda del bloque del mes
  const mZ = new Float32Array(M);
  for (let i = 0; i <= M; i++) {
    const y = y0 + Math.floor(i / 12);
    const m = i % 12;
    const e = Math.round(Date.UTC(y, m, 1) / DAY_MS);
    mStart[i] = e - startEpoch;
    if (i < M) mFirst[i] = weekdayOfEpochDay(e);
  }
  for (let i = 0; i < M; i++) {
    mDays[i] = mStart[i + 1] - mStart[i];
    kFirst[i] = Math.min(N, Math.ceil(Math.max(mStart[i], 0) / period));
    const yi = Math.floor(i / 12);
    const m = i % 12;
    const yx = (yi % cols) * YEAR_PX;
    const yz = Math.floor(yi / cols) * YEAR_PZ;
    mX[i] = yx + L.yearPad + (m % 4) * (MONTH_W + L.monthGapX);
    mZ[i] = yz + L.yearHead + Math.floor(m / 4) * (MONTH_H + L.monthGapZ);
  }
  kFirst[M] = N;

  const yStart = new Int32Array(years);
  const yLeap = new Uint8Array(years);
  for (let yi = 0; yi < years; yi++) {
    yStart[yi] = mStart[yi * 12];
    yLeap[yi] = mStart[yi * 12 + 12] - mStart[yi * 12] === 366 ? 1 : 0;
  }

  const startMonth = start.getUTCMonth(); // índice del mes de hoy (año 0)

  // Recuadro de lo transcurrido hasta cada mes (desde el mes de hoy), para encuadrar la cámara.
  const prefix = new Float32Array(M * 4);
  let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
  for (let i = 0; i < M; i++) {
    if (i === 12) {
      // pasado el primer año, se encuadra también su tarjeta entera (con el número del año)
      bx0 = Math.min(bx0, 0);
      bz0 = Math.min(bz0, 0);
    }
    if (i >= startMonth) {
      bx0 = Math.min(bx0, mX[i]);
      bz0 = Math.min(bz0, mZ[i]);
      bx1 = Math.max(bx1, mX[i] + MONTH_W);
      bz1 = Math.max(bz1, mZ[i] + MONTH_H);
    }
    prefix[i * 4] = bx0; prefix[i * 4 + 1] = bz0; prefix[i * 4 + 2] = bx1; prefix[i * 4 + 3] = bz1;
  }

  const width = Math.min(years, cols) * YEAR_PX - L.yearGapX;
  const depth = rows * YEAR_PZ - L.yearGapZ;

  /** Mes (índice) que contiene el día d. */
  function monthOfDay(d) {
    let lo = 0, hi = M - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (mStart[mid] <= d) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Centro de la celda del día d (escribe en out[0], out[1]). */
  function cellOfDay(d, out) {
    const i = monthOfDay(d);
    const c = d - mStart[i] + mFirst[i];
    out[0] = mX[i] + (c % 7) + 0.5;
    out[1] = mZ[i] + L.monthHead + Math.floor(c / 7) + 0.5;
    return i;
  }

  /** Día (desde hoy) de la celda que está en el punto (x, z), o null si ahí no hay un día. */
  function dayAt(x, z) {
    const col = Math.floor(x / YEAR_PX);
    const row = Math.floor(z / YEAR_PZ);
    if (col < 0 || col >= cols || row < 0) return null;
    const yi = row * cols + col;
    if (yi >= years) return null;
    const qx = x - col * YEAR_PX - L.yearPad;
    const qz = z - row * YEAR_PZ - L.yearHead;
    const mc = Math.floor(qx / (MONTH_W + L.monthGapX));
    const mr = Math.floor(qz / (MONTH_H + L.monthGapZ));
    if (mc < 0 || mc > 3 || mr < 0 || mr > 2) return null;
    const i = yi * 12 + mr * 4 + mc;
    const cx = Math.floor(x - mX[i]);
    const cz = Math.floor(z - mZ[i] - L.monthHead);
    if (cx < 0 || cx > 6 || cz < 0 || cz > 5) return null;
    const dom = cz * 7 + cx - mFirst[i];
    if (dom < 0 || dom >= mDays[i]) return null;
    return mStart[i] + dom;
  }

  function yearOrigin(yi, out) {
    out[0] = (yi % cols) * YEAR_PX;
    out[1] = Math.floor(yi / cols) * YEAR_PZ;
    return out;
  }

  return {
    start, period, N, totalDays, y0, y1, years, M, cols, rows,
    mStart, mDays, mFirst, kFirst, mX, mZ, yStart, yLeap, startMonth, prefix,
    width, depth,
    monthOfDay, cellOfDay, yearOrigin, dayAt,
  };
}
