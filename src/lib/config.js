// Parámetros de presentación (no son datos del caso).

/** Duración de la animación, en segundos, según la cantidad de unidades (entre 20 y 30). */
export function runSeconds(units) {
  return Math.min(30, 20 + 1.6 * Math.log10(units + 1));
}
