// Curva de avance de la animación.
// s va de 0 a 1 (tiempo de la animación). Devuelve cuántas unidades "pasaron" (0..N, continuo).
// Arranca en escala logarítmica, para que los primeros días se vean uno por uno, y frena al final.

export function unitsAt(s, N) {
  if (N <= 0) return 0;
  if (s >= 1) return N;
  const e = 1 - Math.pow(1 - Math.max(0, s), 2);
  const k = Math.log(N + 1);
  return Math.min(N, Math.exp(k * e) - 1);
}

/** Inversa de unitsAt: en qué punto de la curva se llega a u unidades. */
export function progressAt(u, N) {
  if (N <= 0 || u >= N) return 1;
  if (u <= 0) return 0;
  const e = Math.log(u + 1) / Math.log(N + 1);
  return 1 - Math.sqrt(Math.max(0, 1 - e));
}

/**
 * Estado de la corrida en el punto p (0..1) de la curva: unidades compradas (la del día 0
 * incluida) y día transcurrido (continuo, desde hoy).
 */
export function stateAt(p, item) {
  const N = item.units;
  const total = N * item.periodDays;
  if (p >= 1) return { bought: N, dayF: total, day: total };
  const u = unitsAt(p, N);
  const dayF = u * item.periodDays;
  return { bought: Math.min(N, Math.floor(u + 1e-7) + 1), dayF, day: Math.floor(dayF + 1e-6) };
}

/** Punto de la curva en el que el calendario marca el día d (entero, desde hoy). */
export function progressForDay(d, item) {
  const total = item.units * item.periodDays;
  if (d >= total) return 1;
  if (d <= 0) return 0;
  return progressAt(d / item.periodDays, item.units);
}
