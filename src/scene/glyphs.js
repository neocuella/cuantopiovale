// Texturas de texto para imprimir sobre el calendario: un atlas de cifras e iniciales de los días
// y otro con los nombres de los meses. El canal R es la letra y el G un halo claro alrededor (para
// que los números grandes se lean sobre los días pintados).

import * as THREE from 'three';

const FONT = 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const GLYPHS = '0123456789LMXJVSD';
export const GLYPH_COLS = 6;
export const GLYPH_ROWS = 3;
export const GLYPH_ADVANCE = 0.6; // avance entre cifras, en altos de letra
export const MONTH_NAMES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
export const MONTH_ASPECT = 3; // ancho/alto de cada celda del atlas de meses

function atlas(w, h, draw) {
  const fill = document.createElement('canvas');
  fill.width = w;
  fill.height = h;
  const halo = document.createElement('canvas');
  halo.width = w;
  halo.height = h;
  const gf = fill.getContext('2d');
  const gh = halo.getContext('2d');
  for (const g of [gf, gh]) {
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    g.lineJoin = 'round';
  }
  draw(gf, gh);
  const a = gf.getImageData(0, 0, w, h);
  const b = gh.getImageData(0, 0, w, h);
  const out = gf.createImageData(w, h);
  for (let i = 0; i < a.data.length; i += 4) {
    out.data[i] = a.data[i + 3];
    out.data[i + 1] = Math.max(a.data[i + 3], b.data[i + 3]);
    out.data[i + 2] = 0;
    out.data[i + 3] = 255;
  }
  gf.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(fill);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

/** Cifras 0–9 e iniciales L M X J V S D, en celdas cuadradas de S px. */
export function glyphAtlas(S = 128) {
  return atlas(GLYPH_COLS * S, GLYPH_ROWS * S, (gf, gh) => {
    for (const g of [gf, gh]) {
      g.font = `700 ${Math.round(S * 0.8)}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
    }
    gh.lineWidth = S * 0.16;
    for (let i = 0; i < GLYPHS.length; i++) {
      const x = (i % GLYPH_COLS) * S + S / 2;
      const y = Math.floor(i / GLYPH_COLS) * S + S * 0.84;
      gf.fillText(GLYPHS[i], x, y);
      gh.strokeText(GLYPHS[i], x, y);
    }
  });
}

/** Nombres cortos de los meses, alineados a la izquierda en celdas de 3S × S. */
export function monthAtlas(S = 128) {
  const cw = S * MONTH_ASPECT;
  return atlas(cw * 2, S * 6, (gf, gh) => {
    for (const g of [gf, gh]) {
      g.font = `800 ${Math.round(S * 0.78)}px ${FONT}`;
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
    }
    gh.lineWidth = S * 0.16;
    for (let i = 0; i < 12; i++) {
      const x = (i % 2) * cw + S * 0.08;
      const y = Math.floor(i / 2) * S + S * 0.84;
      gf.fillText(MONTH_NAMES[i], x, y);
      gh.strokeText(MONTH_NAMES[i], x, y);
    }
  });
}
