// Texturas de texto para imprimir sobre el calendario: un atlas de cifras e iniciales de los días
// y otro con los nombres de los meses. El canal R es la letra y el G un halo claro alrededor (para
// que los números grandes se lean sobre los días pintados).

import * as THREE from 'three';

const FONT = '"Geist", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const GLYPHS = '0123456789LMXJVSD';
export const GLYPH_COLS = 6;
export const GLYPH_ROWS = 3;
export const GLYPH_ADVANCE = 0.5; // avance entre cifras, en altos de letra (ajustado a las cifras de Geist, más angostas)
export const MONTH_NAMES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
export const MONTH_ASPECT = 3; // ancho/alto de cada celda del atlas de meses

/** GLSL: una letra del atlas de cifras (`glyphAtlas`), con derivadas para que se vea nítida. */
export const GLYPH_FN = /* glsl */ `
uniform sampler2D uGlyphs;
uniform float uDW[10]; // ancho de cada cifra, en cajas de letra (ver digitWidths)
uniform float uDGap;
// g: coordenadas dentro de la caja cuadrada de la letra (0..1, y hacia arriba)
float glyph(float idx, vec2 g, vec2 dgx, vec2 dgy) {
  if (g.x < 0.0 || g.x > 1.0 || g.y < 0.0 || g.y > 1.0) return 0.0;
  float c = mod(idx, 6.0);
  float r = floor(idx / 6.0);
  vec2 uv = vec2((c + g.x) / 6.0, 1.0 - (r + 1.0 - g.y) / 3.0);
  vec2 k = vec2(1.0 / 6.0, 1.0 / 3.0);
  return textureGrad(uGlyphs, uv, dgx * k, dgy * k).r;
}
float digW(float d) { return uDW[int(d + 0.5)]; }
// distancia entre los centros de dos cifras seguidas: cada una ocupa lo que mide (el 1 es angosto)
float digAdv(float a, float b) { return (digW(a) + digW(b)) * 0.5 + uDGap; }
// número de una o dos cifras, alineado a la izquierda (o: en altos de letra, y hacia arriba)
float number2(float n, vec2 o, vec2 gx, vec2 gy) {
  float d1 = n < 10.0 ? n : floor(n / 10.0);
  float L = (digW(0.0) - digW(d1)) * 0.5; // un 1 adelante no deja hueco a su izquierda
  float t = glyph(d1, o + vec2(0.2 + L, 0.0), gx, gy);
  if (n >= 10.0) {
    float d2 = mod(n, 10.0);
    t = max(t, glyph(d2, o + vec2(0.2 + L - digAdv(d1, d2), 0.0), gx, gy));
  }
  return t;
}
// ancho de ese número, desde su borde izquierdo
float number2W(float n) {
  if (n < 10.0) return digW(n);
  float d1 = floor(n / 10.0), d2 = mod(n, 10.0);
  return digW(d1) * 0.5 + digAdv(d1, d2) + digW(d2) * 0.5;
}
`;

let _dw = null;
/**
 * Ancho real de cada cifra (0–9) con la fuente del atlas, en cajas de letra, y el aire entre
 * cifras. Geist tiene cifras proporcionales: con un paso fijo, el 1 quedaba con huecos.
 * Se mide después de que la fuente cargó (lo esperan la portada y la corrida).
 */
export function digitWidths(S = 128) {
  if (_dw) return _dw;
  const g = document.createElement('canvas').getContext('2d');
  g.font = `700 ${Math.round(S * 0.8)}px ${FONT}`;
  const w = [...'0123456789'].map((d) => g.measureText(d).width / S);
  // aire tal que dos ceros queden a GLYPH_ADVANCE (el paso de antes, para las cifras anchas)
  _dw = { w, gap: GLYPH_ADVANCE - w[0] };
  return _dw;
}

/** Posición (en cajas de letra) de cada cifra de un texto numérico, para los rótulos de años. */
export function digitOffsets(str) {
  const { w, gap } = digitWidths();
  const out = [0];
  for (let j = 1; j < str.length; j++) out.push(out[j - 1] + (w[+str[j - 1]] + w[+str[j]]) / 2 + gap);
  return out;
}

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
