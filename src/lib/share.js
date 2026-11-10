// Textos y direcciones para compartir. Los usa el navegador (botón Compartir) y vite.config.js,
// que arma en el build una página por cosa (c/<id>/index.html) con su vista previa propia.
// No importa nada del DOM.

import { fmtMillions, fmtPeriod, unitsLabel } from './format.js';

/** Dirección pública del sitio (para og:url y og:image, que tienen que ser absolutas). */
export const SITE_URL = 'https://cuantopiovale.rickovelar.com/';

export const SITE_NAME = '¿Cuánto pio vale?';

/** Ruta de la página de una cosa, relativa a la raíz del sitio: "c/vivienda/". */
export function itemPath(id) {
  return `c/${encodeURIComponent(id)}/`;
}

/** Imagen de vista previa, relativa a la raíz del sitio (están en public/og/). */
export function ogImagePath(id = 'inicio') {
  return `og/${id}.png`;
}

/** Si la ruta es c/<id>/, devuelve el id. */
export function itemIdFromPath(pathname) {
  const m = /\/c\/([^/]+)\/?(?:index\.html)?$/.exec(pathname || '');
  return m ? decodeURIComponent(m[1]) : null;
}

/** "Los US$ 813 millones del caso ueno podrían comprar 1.234 viviendas sociales" (igual que la tarjeta del resultado) */
export function itemTitle(model, item) {
  return `Los US$ ${fmtMillions(model.totalUSD)} del caso ueno podrían comprar ${unitsLabel(item.units, item)}`;
}

export function itemDescription(item) {
  return `Si compráramos 1 ${item.name} ${fmtPeriod(item.periodDays)} desde hoy, ¿hasta cuándo alcanza? Según la imputación fiscal; no es una pérdida probada.`;
}
