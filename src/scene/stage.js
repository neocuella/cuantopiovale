// Escena Three.js: un calendario impreso sobre un piso de papel, visto en isométrico (cámara
// ortográfica), con un modelo de juguete parado en el día en que se compra cada unidad.
//
// Todo lo que se ve depende de dos números: cuántas unidades se compraron y qué día marca el
// calendario (setTime). Así la línea de tiempo se puede mover hacia adelante y hacia atrás.
//
// Niveles de detalle, según cuántos píxeles mide una celda (un día) en pantalla:
// - Años: un rectángulo por año con sus 12 meses pintados según lo lleno que está cada mes.
// - Meses: un rectángulo por mes que dibuja en el shader la grilla de días, los números, las
//   iniciales de la semana y el cuadrado de color de cada día comprado.
// - Días: los modelos 3D, solo para los meses que se ven (se recargan cuando la vista sale de lo
//   cargado); primero la versión simple y de cerca la detallada.
// Los rectángulos de años y meses son unos pocos miles de instancias; los modelos nunca pasan de
// un tope fijo (según el tamaño de la pantalla).

import * as THREE from 'three';
import { loadModel, GROUND_COLOR } from './models.js';
import { glyphAtlas, monthAtlas, GLYPH_ADVANCE, MONTH_ASPECT } from './glyphs.js';
import { LAYOUT, MONTH_W, YEAR_W, YEAR_H, YEAR_PX, YEAR_PZ } from '../lib/calendar.js';

const MAX_DPR = 2;
const DROP_MS = 520;
const DROP_HEIGHT = 2.2;
const MAX_ANIMATED = 90;
const DROP_CAP = MAX_ANIMATED * 2;
const RING_GAP_MS = 220;
const RING_MS = 760;
const ACCENT = '#ff4f1f';
const INK = '#3b3a40';
const PAD = '#f3a15c'; // el cuadrado de color de cada día comprado
const PRE = '#ebe9e3'; // días anteriores a hoy
const AXIS = 0.816496580927726; // largo en pantalla de una celda (cualquiera de los dos ejes)
const ELEV = Math.asin(1 / Math.sqrt(3)); // isométrico
const PIN_MAX = 24;

// Umbrales en píxeles por celda.
const PX_MONTHS = 1.0; // por debajo: solo años
const PX_MODELS_IN = [4.5, 6.5]; // los modelos aparecen entre estos dos
const PX_DETAIL = [9, 15]; // versión simple → detallada
const PX_LABEL = 4.5; // carteles de los hitos

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

function bounce(t) {
  if (t < 0.62) {
    const u = t / 0.62;
    return 1 - u * u;
  }
  const u = (t - 0.62) / 0.38;
  return 0.16 * Math.sin(Math.PI * u) * (1 - u * 0.3);
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function hash1(n) {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function valueNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

// ——— Materiales de las figuras ———

const DITHER = /* glsl */ `
uniform float uFade;
uniform float uFadeInvert;
uniform float uVis;
float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  return (m[i] + 0.5) / 16.0;
}
`;

/** Lambert con colores por vértice, pintura por figura (paletas A y B) y fundido punteado. */
function unitMaterial(invert, vis) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.userData.fade = { value: 1 };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFade = m.userData.fade;
    shader.uniforms.uVis = vis;
    shader.uniforms.uFadeInvert = { value: invert ? 1 : 0 };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <color_pars_vertex>',
        `#include <color_pars_vertex>
attribute float paint;
#ifdef USE_INSTANCING_COLOR
attribute vec3 instanceColorB;
#endif`
      )
      .replace(
        '#include <color_vertex>',
        `vColor = vec4(1.0);
vec3 base = color;
#ifdef USE_INSTANCING_COLOR
base = mix(base, instanceColor.rgb, step(0.5, paint) * (1.0 - step(1.5, paint)));
base = mix(base, instanceColorB, step(1.5, paint));
#endif
vColor.rgb = base;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DITHER}`)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
float bd = bayer4(gl_FragCoord.xy);
if (uFadeInvert > 0.5) { if (bd < uFade) discard; } else { if (bd >= uFade) discard; }
if (bayer4(gl_FragCoord.xy + vec2(2.0, 1.0)) >= uVis) discard;`
      );
  };
  m.customProgramCacheKey = () => 'unit';
  return m;
}

/** Sombra de contacto: se queda en el suelo aunque la figura esté cayendo, y se aclara con la altura. */
function shadowMaterial(map, vis) {
  const m = new THREE.MeshBasicMaterial({ map, color: '#5b5548', transparent: true, opacity: 0.3, depthWrite: false });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uVis = vis;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vLift;')
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
mat4 im = instanceMatrix;
vLift = im[3][1];
im[3][1] = 0.0;
mvPosition = im * mvPosition;
#else
vLift = 0.0;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLift;\nuniform float uVis;')
      .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>\ndiffuseColor.a *= uVis * (1.0 - 0.8 * clamp(vLift / ${DROP_HEIGHT.toFixed(2)}, 0.0, 1.0));`);
  };
  m.customProgramCacheKey = () => 'contact-shadow';
  return m;
}

function softRectTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.filter = 'blur(7px)';
  g.fillStyle = '#fff';
  g.beginPath();
  g.roundRect(13, 13, s - 26, s - 26, 10);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// ——— Piso de papel ———

const GROUND_VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vP = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const GROUND_FRAG = /* glsl */ `
uniform vec3 uBase;
varying vec2 vP;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  // papel: manchas muy suaves y un grano fino fijo en pantalla
  float n = noise(vP * 0.02) * 0.6 + noise(vP * 0.09 + 7.0) * 0.4;
  float g = hash(floor(gl_FragCoord.xy)) - 0.5;
  vec3 c = uBase * (0.985 + 0.02 * n) + g * 0.012;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

// ——— Calendario impreso ———

const COMMON = /* glsl */ `
uniform float uPx;      // píxeles por celda
uniform float uBought;  // unidades compradas
uniform float uDay;     // día que marca el calendario
uniform float uPeriod;
uniform float uN;
uniform float uTotal;   // días de la corrida
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uPad;
uniform vec3 uPre;
uniform vec3 uAccent;
`;

const MONTH_VERT = /* glsl */ `
${COMMON}
attribute vec2 aOrigin;
attribute vec3 aMonth; // 1.º del mes (día desde hoy), días del mes, día de la semana del 1.º
varying vec2 vP;
varying vec3 vM;
varying float vFrac;
varying float vPre;
const float MH = ${LAYOUT.monthHead.toFixed(2)};
const float WR = ${LAYOUT.weekRow.toFixed(2)};
void main() {
  vP = vec2(position.x * 7.0, -WR + position.y * (6.0 + WR));
  vec3 lp = vec3(aOrigin.x + vP.x, 0.0, aOrigin.y + MH + vP.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(lp, 1.0);
  float s = aMonth.x;
  float dim = aMonth.y;
  float fk = min(uN, ceil(max(s, 0.0) / uPeriod));
  float lk = min(uN, ceil(max(s + dim, 0.0) / uPeriod));
  float slots = lk - fk;
  vFrac = slots > 0.5 ? clamp(uBought - fk, 0.0, slots) / slots : 0.0;
  vPre = s + dim <= 0.0 ? 1.0 : 0.0;
  vM = aMonth;
}
`;

const GLYPH_FN = /* glsl */ `
uniform sampler2D uGlyphs;
// g: coordenadas dentro de la caja cuadrada de la letra (0..1, y hacia arriba)
float glyph(float idx, vec2 g, vec2 dgx, vec2 dgy) {
  if (g.x < 0.0 || g.x > 1.0 || g.y < 0.0 || g.y > 1.0) return 0.0;
  float c = mod(idx, 6.0);
  float r = floor(idx / 6.0);
  vec2 uv = vec2((c + g.x) / 6.0, 1.0 - (r + 1.0 - g.y) / 3.0);
  vec2 k = vec2(1.0 / 6.0, 1.0 / 3.0);
  return textureGrad(uGlyphs, uv, dgx * k, dgy * k).r;
}
`;

const MONTH_FRAG = /* glsl */ `
${COMMON}
${GLYPH_FN}
varying vec2 vP;
varying vec3 vM;
varying float vFrac;
varying float vPre;

float box(vec2 f, float inset, float r) {
  vec2 q = abs(f - 0.5) - (0.5 - inset - r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 p = vP;
  float pxc = 1.0 / uPx; // un píxel, en celdas
  vec2 dpx = dFdx(p);
  vec2 dpy = dFdy(p);
  float detail = smoothstep(1.2, 3.0, uPx);

  if (p.y < 0.0) {
    // fila de iniciales: L M X J V S D
    float a = smoothstep(9.0, 13.0, uPx);
    if (a <= 0.0) discard;
    float c = floor(p.x);
    float hs = 0.62;
    vec2 g = vec2((fract(p.x) - 0.5) / hs + 0.5, (-0.1 - p.y) / hs);
    float t = glyph(10.0 + c, g, dpx / hs, -dpy / hs);
    float al = t * a * 0.62;
    if (al < 0.004) discard;
    gl_FragColor = vec4(uInk, al);
    #include <colorspace_fragment>
    return;
  }

  vec2 cell = floor(p);
  vec2 f = p - cell;
  float rowsUsed = ceil((vM.z + vM.y) / 7.0);
  if (cell.y >= rowsUsed) discard;
  float dom = cell.y * 7.0 + cell.x - vM.z;
  bool valid = dom >= 0.0 && dom < vM.y;
  float d = vM.x + dom;

  vec3 col = uPaper;
  float alpha = valid ? 1.0 : 0.0;
  if (valid) {
    if (d < 0.0) col = uPre;
    bool slot = d >= 0.0 && d < uTotal && mod(d, uPeriod) < 0.5;
    if (slot && d / uPeriod < uBought - 0.5) {
      float sd = box(f, 0.06, 0.05);
      float aa = max(fwidth(sd), 1e-4);
      col = mix(col, uPad, 1.0 - smoothstep(-aa, aa, sd));
    }
    // número del día, arriba a la izquierda
    float na = smoothstep(15.0, 24.0, uPx);
    if (na > 0.0) {
      float n = dom + 1.0;
      float hN = 0.31;
      vec2 o = vec2(f.x - 0.06, 0.05 + hN - f.y) / hN; // y hacia arriba
      float t;
      vec2 gx = dpx / hN, gy = -dpy / hN;
      if (n < 10.0) {
        t = glyph(n, o + vec2(0.2, 0.0), gx, gy);
      } else {
        t = max(glyph(floor(n / 10.0), o + vec2(0.2, 0.0), gx, gy), glyph(mod(n, 10.0), o + vec2(0.2 - ${GLYPH_ADVANCE.toFixed(2)}, 0.0), gx, gy));
      }
      col = mix(col, uInk, t * na * (d < 0.0 ? 0.4 : 0.8));
    }
    // hoy: borde de color
    if (abs(d - uDay) < 0.5) {
      float sd = box(f, 0.035, 0.06);
      float w = max(0.05, 2.2 * pxc);
      float aa = max(fwidth(sd), 1e-4);
      float ring = (1.0 - smoothstep(-aa, aa, sd)) * smoothstep(-w - aa, -w + aa, sd);
      col = mix(col, uAccent, ring);
    }
  }
  // líneas finas de la grilla (solo en las filas usadas)
  vec2 e = min(f, 1.0 - f);
  float ed = min(e.x, e.y);
  float lw = max(0.012, 0.6 * pxc);
  float aa = max(fwidth(ed), 1e-4);
  float line = (1.0 - smoothstep(lw - aa, lw + aa, ed)) * 0.5 * smoothstep(2.0, 5.0, uPx);
  col = mix(col, uInk, line);
  alpha = max(alpha, line);

  // de lejos: el mes entero con un solo tono según lo lleno que está
  vec3 far = vPre > 0.5 ? uPre : mix(uPaper, uPad, vFrac);
  col = mix(far, col, detail);
  alpha = mix(1.0, alpha, detail);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;

const YEAR_VERT = /* glsl */ `
${COMMON}
attribute vec2 aOrigin;
attribute vec3 aYear; // 1.º de enero (día desde hoy), bisiesto, día de la semana del 1.º de enero
varying vec2 vQ;
varying vec3 vY;
const float W = ${YEAR_W.toFixed(3)};
const float H = ${YEAR_H.toFixed(3)};
void main() {
  vQ = vec2(position.x * W, position.y * H);
  vec3 lp = vec3(aOrigin.x + vQ.x, 0.0, aOrigin.y + vQ.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(lp, 1.0);
  vY = aYear;
}
`;

const YEAR_FRAG = /* glsl */ `
${COMMON}
varying vec2 vQ;
varying vec3 vY;
const float W = ${YEAR_W.toFixed(3)};
const float H = ${YEAR_H.toFixed(3)};
const float PAD = ${LAYOUT.yearPad.toFixed(3)};
const float YH = ${LAYOUT.yearHead.toFixed(3)};
const float MH = ${LAYOUT.monthHead.toFixed(3)};
const float GX = ${LAYOUT.monthGapX.toFixed(3)};
const float GZ = ${LAYOUT.monthGapZ.toFixed(3)};
float cum(float m, float leap) {
  float c[13] = float[13](0., 31., 59., 90., 120., 151., 181., 212., 243., 273., 304., 334., 365.);
  return c[int(m)] + (m >= 2.0 ? leap : 0.0);
}
void main() {
  float pxc = 1.0 / uPx;
  // marco finito alrededor del año
  vec2 q = abs(vQ - vec2(W, H) * 0.5) - vec2(W, H) * 0.5 + 0.8;
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.8;
  float aa = max(fwidth(sd), 1e-4);
  float lw = max(0.05, 0.7 * pxc);
  float frame = (1.0 - smoothstep(lw - aa, lw + aa, abs(sd + lw))) * mix(0.08, 0.22, smoothstep(0.3, 0.9, uPx));
  vec3 col = uInk;
  float alpha = frame;

  // de muy lejos: los 12 meses como baldosas de color
  float farA = 1.0 - smoothstep(1.0, 1.6, uPx);
  if (farA > 0.0) {
    float mc = floor((vQ.x - PAD) / (7.0 + GX));
    float mr = floor((vQ.y - YH) / (MH + 6.0 + GZ));
    if (mc >= 0.0 && mc <= 3.0 && mr >= 0.0 && mr <= 2.0) {
      float m = mr * 4.0 + mc;
      float lx = vQ.x - PAD - mc * (7.0 + GX);
      float lz = vQ.y - YH - mr * (MH + 6.0 + GZ) - MH;
      float c0 = cum(m, vY.y);
      float dim = cum(m + 1.0, vY.y) - c0;
      float fw = mod(vY.z + c0, 7.0);
      float rows = ceil((fw + dim) / 7.0);
      if (lx >= 0.0 && lx <= 7.0 && lz >= 0.0 && lz <= rows) {
        float s = vY.x + c0;
        float fk = min(uN, ceil(max(s, 0.0) / uPeriod));
        float lk = min(uN, ceil(max(s + dim, 0.0) / uPeriod));
        float slots = lk - fk;
        float frac = slots > 0.5 ? clamp(uBought - fk, 0.0, slots) / slots : 0.0;
        vec3 tile = s + dim <= 0.0 ? uPre : mix(uPaper, uPad, frac);
        col = mix(col, tile, farA);
        alpha = max(alpha, farA);
      }
    }
  }
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;

const LABEL_VERT = /* glsl */ `
attribute vec4 aLab;   // x, z (abajo a la izquierda), índice de letra, posición dentro de la palabra
attribute float aRank; // años: el número redondo más grande que lo divide (para verlo de lejos)
uniform float uH;      // alto de la caja de la letra, en celdas
uniform float uAspect; // ancho/alto de la caja
uniform float uAdvance;
uniform float uPx;
uniform float uMinPx;
uniform float uStep;
uniform float uBase;   // opacidad de los carteles comunes
uniform float uCols;
uniform float uRows;
varying vec2 vUv;
varying float vA;
varying float vHalo;
void main() {
  float h = uH;
  float a = uBase;
  float halo = 0.0;
  if (uStep > 0.0 && aRank >= uStep) {
    float hm = uMinPx / uPx;
    if (hm > h) { halo = clamp((hm - h) / h * 3.0, 0.0, 1.0); h = hm; a = 1.0; }
  }
  vA = a;
  vHalo = halo;
  if (a <= 0.001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float x = aLab.x + (aLab.w * uAdvance + position.x * uAspect) * h;
  float z = aLab.y - position.y * h;
  float c = mod(aLab.z, uCols);
  float r = floor(aLab.z / uCols);
  vUv = vec2((c + position.x) / uCols, 1.0 - (r + 1.0 - position.y) / uRows);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(x, 0.0, z, 1.0);
}
`;
const LABEL_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uAlpha;
varying vec2 vUv;
varying float vA;
varying float vHalo;
void main() {
  vec4 t = texture2D(uTex, vUv);
  float fill = t.r;
  float halo = t.g * vHalo;
  float a = max(fill, halo) * vA * uAlpha;
  if (a < 0.004) discard;
  vec3 c = mix(uPaper, uInk, fill / max(max(fill, halo), 1e-4));
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}
`;

function quadGeometry(count) {
  const g = new THREE.InstancedBufferGeometry();
  // esquinas 0..1 (x hacia la derecha, y hacia arriba de la letra o hacia abajo del mes)
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.instanceCount = count;
  return g;
}

/** Pin de hito: poste, banderita y base. */
function pinGeometry() {
  const parts = [];
  const add = (geo, color, x, y, z) => {
    geo.translate(x, y, z);
    const g = geo.index ? geo.toNonIndexed() : geo;
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute('uv');
    parts.push(g);
  };
  add(new THREE.CylinderGeometry(0.22, 0.26, 0.06, 12), '#3b3a40', 0, 0.03, 0);
  add(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 6), '#3b3a40', 0, 1.15, 0);
  add(new THREE.BoxGeometry(0.04, 0.5, 0.75), ACCENT, 0, 2.02, 0.4);
  add(new THREE.SphereGeometry(0.08, 8, 6), '#3b3a40', 0, 2.32, 0);
  const n = parts.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _cell = [0, 0];
const _g0 = [0, 0];
const _g1 = [0, 0];

export class Stage {
  constructor(canvas, pinLayer) {
    this.canvas = canvas;
    this.pinLayer = pinLayer;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: window.devicePixelRatio < 2, powerPreference: 'default', alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    this.renderer.setClearColor(GROUND_COLOR);

    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#fffdf8', '#d9d4c4', 1.6));
    const sun = new THREE.DirectionalLight('#fff3e2', 2.3);
    sun.position.set(0.4, 1, 0.8); // la cara de arriba es la más clara, la izquierda (+z) media, la derecha (+x) la más oscura
    this.scene.add(sun);

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({ uniforms: { uBase: { value: new THREE.Color(GROUND_COLOR) } }, vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, depthWrite: false })
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.renderOrder = -10;
    this.scene.add(this.ground);

    // El plano del calendario: x local = derecha de la lectura (hacia arriba a la derecha en
    // pantalla), z local = hacia abajo (abajo a la derecha). Los modelos se giran al revés para
    // que sigan mirando a la cámara con sus dos caras de frente.
    this.cal = new THREE.Group();
    this.cal.rotation.y = Math.PI / 2;
    this.scene.add(this.cal);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.camDir = new THREE.Vector3();
    // rotación de la vista sin giro (para encuadrar)
    const c0 = new THREE.OrthographicCamera();
    c0.position.set(1, 1, 1);
    c0.lookAt(0, 0, 0);
    c0.updateMatrixWorld();
    this.viewRot0 = new THREE.Matrix4().extractRotation(c0.matrixWorldInverse);

    // Uniformes compartidos por las capas impresas.
    this.u = {
      uPx: { value: 10 },
      uBought: { value: 0 },
      uDay: { value: 0 },
      uPeriod: { value: 1 },
      uN: { value: 1 },
      uTotal: { value: 1 },
      uPaper: { value: new THREE.Color(GROUND_COLOR) },
      uInk: { value: new THREE.Color(INK) },
      uPad: { value: new THREE.Color(PAD) },
      uPre: { value: new THREE.Color(PRE) },
      uAccent: { value: new THREE.Color(ACCENT) },
    };
    this.glyphTex = glyphAtlas();
    this.monthTex = monthAtlas();
    const flat = { transparent: true, depthWrite: false, side: THREE.DoubleSide };
    this.monthMat = new THREE.ShaderMaterial({ ...flat, uniforms: { ...this.u, uGlyphs: { value: this.glyphTex } }, vertexShader: MONTH_VERT, fragmentShader: MONTH_FRAG });
    this.yearMat = new THREE.ShaderMaterial({ ...flat, uniforms: this.u, vertexShader: YEAR_VERT, fragmentShader: YEAR_FRAG });
    const labelUniforms = (tex, h, aspect, advance, cols, rows) => ({
      uTex: { value: tex },
      uInk: this.u.uInk,
      uPaper: this.u.uPaper,
      uPx: this.u.uPx,
      uH: { value: h },
      uAspect: { value: aspect },
      uAdvance: { value: advance },
      uMinPx: { value: 22 },
      uStep: { value: 0 },
      uBase: { value: 1 },
      uAlpha: { value: 1 },
      uCols: { value: cols },
      uRows: { value: rows },
    });
    this.yearLabMat = new THREE.ShaderMaterial({ ...flat, uniforms: labelUniforms(this.glyphTex, 6.4, 1, GLYPH_ADVANCE, 6, 3), vertexShader: LABEL_VERT, fragmentShader: LABEL_FRAG });
    this.monthLabMat = new THREE.ShaderMaterial({ ...flat, uniforms: labelUniforms(this.monthTex, 1.9, MONTH_ASPECT, 0, 2, 6), vertexShader: LABEL_VERT, fragmentShader: LABEL_FRAG });

    this.vis = { value: 0 };
    this.nearMat = unitMaterial(false, this.vis);
    this.lodMat = unitMaterial(true, this.vis);
    this.shadowTex = softRectTexture();
    this.shadowMat = shadowMaterial(this.shadowTex, this.vis);

    this.pinGeo = pinGeometry();
    this.pinMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.pins = new THREE.InstancedMesh(this.pinGeo, this.pinMat, PIN_MAX);
    this.pins.count = 0;
    this.pins.frustumCulled = false;
    this.cal.add(this.pins);
    this.pinEls = [];
    this.pinPos = new Float32Array(PIN_MAX * 2);

    // Anillos que marcan dónde cae la figura nueva (se ven aunque el calendario esté lejos).
    this.ringGeo = new THREE.RingGeometry(0.72, 1, 48);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, depthTest: false, depthWrite: false }));
      r.renderOrder = 10;
      r.visible = false;
      r.userData = { t0: -1 };
      this.cal.add(r);
      this.rings.push(r);
    }
    this.lastRing = -Infinity;

    // Cámara: giro, semi-alto del encuadre y punto del plano local que queda al centro.
    this.az = 0; this.h = 10; this.tx = 0; this.tz = 0;
    this.taz = 0; this.th = 10; this.ttx = 0; this.ttz = 0;
    this.insets = { t: 0, b: 0, l: 0, r: 0 };
    this.mode = 'time';
    this.snap = false; // movimiento reducido: la cámara salta en vez de deslizarse
    this.ending = null;

    this.dI = new Int32Array(DROP_CAP);
    this.dT = new Float64Array(DROP_CAP);
    this.dn = 0;
    this.loaded = new Float32Array(4); // recuadro de meses con figuras cargadas
    this.hasLoaded = false;
    this.bought = 0;
    this.day = 0;
    this.running = false;
    this.busyHook = null;
    this.idleFrames = 0;
    this.lastT = 0;
    this.camDirty = true;

    this.resize = this.resize.bind(this);
    this.ro = new ResizeObserver(this.resize);
    this.ro.observe(canvas);
    this.onVisibility = () => {
      if (document.hidden) this.pause();
      else this.wake();
    };
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resize();
  }

  // ——— Tamaño y cámara ———

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.widthPx = w;
    this.heightPx = h;
    this.aspect = w / h;
    this.rect = this.canvas.getBoundingClientRect();
    // tope de figuras vivas según el tamaño de la pantalla
    this.cap = Math.round(Math.min(14000, Math.max(4000, (w * h) / 70)));
    if (this.cal.children.length && this.c) {
      if (this.mesh && this.mesh.instanceMatrix.count < this.cap) this.buildUnits();
      this.hasLoaded = false;
      if (this.mode === 'time' && !this.ending) this.follow(true);
    }
    this.applyCamera();
    this.wake();
  }

  /** Píxeles que mide una celda con el semi-alto h. */
  pxPerCell(h = this.h) {
    return (AXIS * this.heightPx) / (2 * h);
  }

  applyCamera() {
    const h = this.h;
    const w = h * (this.aspect || 1);
    const cam = this.camera;
    const { t, b, l, r } = this.insets;
    const cx = w * (l - r);
    const cy = h * (b - t);
    cam.left = -w - cx; cam.right = w - cx;
    cam.top = h - cy; cam.bottom = -h - cy;
    const a = Math.PI / 4 + this.az;
    this.camDir.set(Math.sin(a) * Math.cos(ELEV), Math.sin(ELEV), Math.cos(a) * Math.cos(ELEV));
    const dist = h * 4 + 40;
    // local (x, z) → mundo (z, −x)
    _v.set(this.tz, 0, -this.tx);
    cam.position.copy(_v).addScaledVector(this.camDir, dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(_v);
    cam.near = 0.1;
    cam.far = dist * 2 + 80;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.camDirty = true;
    this.updateLod();
  }

  /** Encuadre (semi-alto y centro) de un rectángulo del plano local, sin giro. */
  frameRect(x0, z0, x1, z1, H, out) {
    const R = this.viewRot0.elements;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let c = 0; c < 8; c++) {
      const lx = c & 1 ? x1 : x0;
      const lz = c & 2 ? z1 : z0;
      _v.set(lz, c & 4 ? H : 0, -lx).applyMatrix4(this.viewRot0);
      if (_v.x < minX) minX = _v.x;
      if (_v.x > maxX) maxX = _v.x;
      if (_v.y < minY) minY = _v.y;
      if (_v.y > maxY) maxY = _v.y;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    // punto del suelo (mundo gx, gz) que la vista lleva a (cx, cy)
    const a = R[0], b = R[8], c = R[1], d = R[9];
    const det = a * d - b * c;
    const gx = (cx * d - b * cy) / det;
    const gz = (a * cy - c * cx) / det;
    const { t, b: ib, l, r } = this.insets;
    const fw = Math.max(0.2, 1 - l - r);
    const fh = Math.max(0.2, 1 - t - ib);
    const m = 1.06;
    out.h = Math.max(((maxY - minY) / 2) * m / fh, ((maxX - minX) / 2) * m / (this.aspect * fw), this.minH());
    out.tx = -gz;
    out.tz = gx;
    return out;
  }

  minH() {
    return (AXIS * this.heightPx) / (2 * 150); // ~150 px por celda
  }

  maxH() {
    if (!this.c) return 100;
    const f = this.frameRect(0, 0, this.c.width, this.c.depth, this.modelH || 1, {});
    return f.h * 1.6;
  }

  setInsets(ins) {
    Object.assign(this.insets, ins);
    if (!this.c) return;
    if (this.mode === 'time' && !this.ending) this.follow(true);
    else if (this.ending) this.ending.full = this.fullFrame();
    this.applyCamera();
    this.wake();
  }

  fullFrame() {
    const c = this.c;
    return this.frameRect(0, 0, c.width, c.depth, this.modelH, {});
  }

  /** En modo tiempo, la cámara encuadra lo transcurrido (desde hoy hasta la fecha marcada). */
  follow(jump = false) {
    const c = this.c;
    if (!c) return;
    let f;
    if (this.day >= c.totalDays) {
      f = this.fullFrame();
    } else {
      const i = Math.max(c.startMonth, c.monthOfDay(this.day));
      const p = c.prefix;
      f = this.frameRect(p[i * 4], p[i * 4 + 1] - 0.2, p[i * 4 + 2], p[i * 4 + 3], this.modelH, {});
    }
    this.th = f.h; this.ttx = f.tx; this.ttz = f.tz; this.taz = 0;
    if (jump || this.snap) {
      this.h = this.th; this.tx = this.ttx; this.tz = this.ttz; this.az = 0;
      this.applyCamera();
    }
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'time') {
      this.ending = null;
      this.follow(this.snap);
    } else {
      this.th = this.h; this.ttx = this.tx; this.ttz = this.tz; this.taz = this.az;
    }
    this.wake();
  }

  // ——— Gestos de exploración ———

  /** Punto del plano local bajo un punto de la pantalla (coordenadas de cliente). */
  groundAt(clientX, clientY, out) {
    const r = this.rect;
    const nx = ((clientX - r.left) / r.width) * 2 - 1;
    const ny = -((clientY - r.top) / r.height) * 2 + 1;
    _v.set(nx, ny, -1).unproject(this.camera);
    const t = -_v.y / -this.camDir.y;
    const wx = _v.x - this.camDir.x * t;
    const wz = _v.z - this.camDir.z * t;
    out[0] = -wz;
    out[1] = wx;
    return out;
  }

  clampView() {
    const c = this.c;
    if (!c) return;
    this.h = Math.min(this.maxH(), Math.max(this.minH(), this.h));
    const m = 10;
    this.tx = Math.min(c.width + m, Math.max(-m, this.tx));
    this.tz = Math.min(c.depth + m, Math.max(-m, this.tz));
  }

  /** Lo que mueve un gesto pasa directo a la cámara (sin suavizado). */
  direct() {
    this.ending = null;
    this.clampView();
    this.applyCamera();
    this.th = this.h; this.ttx = this.tx; this.ttz = this.tz; this.taz = this.az;
    this.wake();
  }

  panBy(x0, y0, x1, y1) {
    this.groundAt(x0, y0, _g0);
    this.groundAt(x1, y1, _g1);
    this.tx -= _g1[0] - _g0[0];
    this.tz -= _g1[1] - _g0[1];
    this.direct();
  }

  zoomAt(factor, clientX, clientY) {
    this.groundAt(clientX, clientY, _g0);
    this.h *= factor;
    this.h = Math.min(this.maxH(), Math.max(this.minH(), this.h));
    this.applyCamera();
    this.groundAt(clientX, clientY, _g1);
    this.tx += _g0[0] - _g1[0];
    this.tz += _g0[1] - _g1[1];
    this.direct();
  }

  rotateBy(rad) {
    this.az += rad;
    this.direct();
  }

  /** Botones: zoom y giro animados alrededor del centro. */
  zoomStep(factor) {
    this.ending = null;
    this.th = Math.min(this.maxH(), Math.max(this.minH(), this.th * factor));
    if (this.snap) this.h = this.th;
    this.applyCamera();
    this.wake();
  }

  rotateStep(rad) {
    this.ending = null;
    this.taz += rad;
    if (this.snap) this.az = this.taz;
    this.applyCamera();
    this.wake();
  }

  viewAll() {
    this.ending = null;
    const f = this.fullFrame();
    this.th = f.h; this.ttx = f.tx; this.ttz = f.tz;
    this.taz = Math.round(this.az / (Math.PI * 2)) * Math.PI * 2;
    if (this.snap) {
      this.h = this.th; this.tx = this.ttx; this.tz = this.ttz; this.az = this.taz;
      this.applyCamera();
    }
    this.wake();
  }

  // ——— La cosa ———

  /** Prepara el calendario y las figuras de una cosa. */
  prepare(modelKey, cal) {
    this.clearItem();
    this.c = cal;
    const model = loadModel(modelKey);
    this.model = model;
    // Escala: la huella entra en la celda (el hospital, más grande). Origen al centro de la huella.
    const s = model.fit / Math.max(model.size.x, model.size.z);
    for (const g of [model.geometry, model.lodGeometry]) {
      g.translate(-model.center.x, 0, -model.center.z);
      g.scale(s, s, s);
    }
    model.sx = model.size.x * s;
    model.sz = model.size.z * s;
    this.modelH = model.height * s;
    const u = this.u;
    u.uPeriod.value = cal.period;
    u.uN.value = cal.N;
    u.uTotal.value = cal.totalDays;

    // Años
    {
      const g = quadGeometry(cal.years);
      const org = new Float32Array(cal.years * 2);
      const yr = new Float32Array(cal.years * 3);
      for (let yi = 0; yi < cal.years; yi++) {
        cal.yearOrigin(yi, _cell);
        org[yi * 2] = _cell[0];
        org[yi * 2 + 1] = _cell[1];
        yr[yi * 3] = cal.yStart[yi];
        yr[yi * 3 + 1] = cal.yLeap[yi];
        yr[yi * 3 + 2] = cal.mFirst[yi * 12];
      }
      g.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(org, 2));
      g.setAttribute('aYear', new THREE.InstancedBufferAttribute(yr, 3));
      this.years = new THREE.Mesh(g, this.yearMat);
      this.years.renderOrder = -6;
    }
    // Meses
    {
      const g = quadGeometry(cal.M);
      const org = new Float32Array(cal.M * 2);
      const mo = new Float32Array(cal.M * 3);
      for (let i = 0; i < cal.M; i++) {
        org[i * 2] = cal.mX[i];
        org[i * 2 + 1] = cal.mZ[i];
        mo[i * 3] = cal.mStart[i];
        mo[i * 3 + 1] = cal.mDays[i];
        mo[i * 3 + 2] = cal.mFirst[i];
      }
      g.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(org, 2));
      g.setAttribute('aMonth', new THREE.InstancedBufferAttribute(mo, 3));
      this.months = new THREE.Mesh(g, this.monthMat);
      this.months.renderOrder = -5;
    }
    // Nombres de los meses
    {
      const g = quadGeometry(cal.M);
      const lab = new Float32Array(cal.M * 4);
      for (let i = 0; i < cal.M; i++) {
        lab[i * 4] = cal.mX[i] - 0.05;
        lab[i * 4 + 1] = cal.mZ[i] + 2.05;
        lab[i * 4 + 2] = i % 12;
        lab[i * 4 + 3] = 0;
      }
      g.setAttribute('aLab', new THREE.InstancedBufferAttribute(lab, 4));
      g.setAttribute('aRank', new THREE.InstancedBufferAttribute(new Float32Array(cal.M), 1));
      this.monthLabels = new THREE.Mesh(g, this.monthLabMat);
      this.monthLabels.renderOrder = -4;
    }
    // Números de los años, cifra por cifra
    {
      const n = cal.years * 4;
      const g = quadGeometry(n);
      const lab = new Float32Array(n * 4);
      const rank = new Float32Array(n);
      let k = 0;
      const ranks = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
      for (let yi = 0; yi < cal.years; yi++) {
        const y = cal.y0 + yi;
        cal.yearOrigin(yi, _cell);
        const str = String(y);
        // los años siguientes se cuentan desde el primero, para que "cada 5" empiece en el inicio
        const rk = yi === 0 ? 10000 : ranks.find((r) => y % r === 0) || 1;
        for (let j = 0; j < str.length; j++) {
          lab[k * 4] = _cell[0] + LAYOUT.yearPad - 0.25;
          lab[k * 4 + 1] = _cell[1] + LAYOUT.yearHead - 0.9;
          lab[k * 4 + 2] = +str[j];
          lab[k * 4 + 3] = j;
          rank[k] = rk;
          k++;
        }
      }
      g.instanceCount = k;
      g.setAttribute('aLab', new THREE.InstancedBufferAttribute(lab, 4));
      g.setAttribute('aRank', new THREE.InstancedBufferAttribute(rank, 1));
      this.yearLabels = new THREE.Mesh(g, this.yearLabMat);
      this.yearLabels.renderOrder = -3;
    }
    for (const m of [this.years, this.months, this.monthLabels, this.yearLabels]) {
      m.frustumCulled = false;
      this.cal.add(m);
    }

    this.buildUnits();

    // piso
    const cx = cal.width / 2, cz = cal.depth / 2;
    this.ground.position.set(cz, 0, -cx);
    const gs = Math.max(cal.width, cal.depth) * 8 + 400;
    this.ground.scale.set(gs, gs, 1);

    this.bought = 0;
    this.day = 0;
    this.dn = 0;
    this.hasLoaded = false;
    this.ending = null;
    this.az = this.taz = 0;
    for (const r of this.rings) r.visible = false;
    this.lastRing = -Infinity;
    this.follow(true);
  }

  /** Mallas de figuras con capacidad para el tope actual. */
  buildUnits() {
    const model = this.model;
    if (this.mesh) {
      this.cal.remove(this.mesh, this.lod, this.shadow);
      this.mesh.dispose();
      this.lod.dispose();
      this.shadow.dispose();
      this.shadow.geometry.dispose();
    }
    const cap = this.cap;
    const mesh = new THREE.InstancedMesh(model.geometry, this.nearMat, cap);
    const lod = new THREE.InstancedMesh(model.lodGeometry, this.lodMat, cap);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    const attrB = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    model.geometry.setAttribute('instanceColorB', attrB);
    model.lodGeometry.setAttribute('instanceColorB', attrB);
    this.colB = attrB;
    lod.instanceMatrix = mesh.instanceMatrix;
    lod.instanceColor = mesh.instanceColor;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const sg = new THREE.PlaneGeometry(model.sx * 1.12 + 0.1, model.sz * 1.12 + 0.1);
    sg.rotateX(-Math.PI / 2);
    sg.translate(-0.03, 0.012, -0.05);
    const shadow = new THREE.InstancedMesh(sg, this.shadowMat, cap);
    shadow.instanceMatrix = mesh.instanceMatrix;
    shadow.renderOrder = -2;
    for (const m of [mesh, lod, shadow]) {
      m.frustumCulled = false;
      m.count = 0;
      this.cal.add(m);
    }
    this.mesh = mesh;
    this.lod = lod;
    this.shadow = shadow;
    this.ks = new Int32Array(cap); // unidad de cada figura cargada (en orden)
    this.nLoaded = 0;
    this.hasLoaded = false;
    this.palA = model.paintA.map((c) => new THREE.Color(c));
    this.palB = model.paintB.map((c) => new THREE.Color(c));
  }

  clearItem() {
    for (const m of [this.years, this.months, this.monthLabels, this.yearLabels]) {
      if (!m) continue;
      this.cal.remove(m);
      m.geometry.dispose();
    }
    this.years = this.months = this.monthLabels = this.yearLabels = null;
    if (this.mesh) {
      this.cal.remove(this.mesh, this.lod, this.shadow);
      this.shadow.geometry.dispose();
      this.mesh.dispose();
      this.lod.dispose();
      this.shadow.dispose();
      this.model.geometry.dispose();
      this.model.lodGeometry.dispose();
      this.mesh = this.lod = this.shadow = null;
    }
    this.setHitos([]);
    this.ending = null;
    this.c = null;
  }

  // ——— Hitos ———

  setHitos(list) {
    for (const el of this.pinEls) el.remove();
    this.pinEls = [];
    const n = Math.min(PIN_MAX, list.length);
    this.pins.count = n;
    for (let i = 0; i < n; i++) {
      this.c.cellOfDay(list[i].day, _cell);
      this.pinPos[i * 2] = _cell[0] + 0.25;
      this.pinPos[i * 2 + 1] = _cell[1] - 0.25;
      if (this.pinLayer) {
        const el = document.createElement('div');
        el.className = 'pin-label';
        el.textContent = list[i].label;
        el.hidden = true;
        this.pinLayer.append(el);
        this.pinEls.push(el);
      }
    }
    this.pinScale = -1;
    this.camDirty = true;
  }

  updatePins() {
    const n = this.pins.count;
    if (!n) return;
    const px = this.pxPerCell();
    const s = Math.max(1, 34 / (2.4 * px));
    if (s !== this.pinScale) {
      this.pinScale = s;
      for (let i = 0; i < n; i++) {
        _m4.makeRotationY(-Math.PI / 2 - this.az * 0);
        _m4.scale(_v2.set(s, s, s));
        _m4.setPosition(this.pinPos[i * 2], 0, this.pinPos[i * 2 + 1]);
        this.pins.setMatrixAt(i, _m4);
      }
      this.pins.instanceMatrix.needsUpdate = true;
    }
    const show = px >= PX_LABEL;
    for (let i = 0; i < this.pinEls.length; i++) {
      const el = this.pinEls[i];
      // punto alto del pin, en mundo
      _v.set(this.pinPos[i * 2 + 1], 2.3 * s, -this.pinPos[i * 2]).project(this.camera);
      const on = show && _v.x > -1.05 && _v.x < 1.05 && _v.y > -1.05 && _v.y < 1.05;
      if (el.hidden === on) el.hidden = !on;
      if (on) {
        const x = ((_v.x + 1) / 2) * this.widthPx;
        const y = ((1 - _v.y) / 2) * this.heightPx;
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      }
    }
  }

  // ——— Tiempo ———

  /**
   * Fija el estado del calendario: unidades compradas y día marcado. Si avanza poco, las figuras
   * nuevas caen con un rebote y un anillo marca la última.
   */
  setTime(bought, day, animate, now = performance.now()) {
    const prev = this.bought;
    this.bought = bought;
    this.day = day;
    this.u.uBought.value = bought;
    this.u.uDay.value = day;
    if (this.mesh && this.hasLoaded) this.applyCount(prev, animate, now);
    if (animate && bought > prev && bought - prev <= 400 && now - this.lastRing > RING_GAP_MS) this.spawnRing(bought - 1, now);
    if (this.mode === 'time' && !this.ending) this.follow();
    this.wake();
  }

  /** Cuántas figuras cargadas ya se compraron: las cargadas están en orden de compra. */
  applyCount(prev, animate, now) {
    const ks = this.ks;
    let lo = 0, hi = this.nLoaded;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ks[mid] < this.bought) lo = mid + 1;
      else hi = mid;
    }
    const n = lo;
    const old = this.mesh.count;
    const arr = this.mesh.instanceMatrix.array;
    if (n < old) {
      // hacia atrás: las que quedan aterrizan de golpe
      for (let k = 0; k < this.dn; k++) arr[this.dI[k] * 16 + 13] = 0;
      if (this.dn) this.markRange(0, old - 1);
      this.dn = 0;
    } else if (n > old && animate && this.bought > prev) {
      const from = Math.max(old, n - MAX_ANIMATED);
      const add = n - from;
      if (this.dn + add > DROP_CAP) {
        const drop = this.dn + add - DROP_CAP;
        for (let k = 0; k < drop; k++) arr[this.dI[k] * 16 + 13] = 0;
        this.markRange(this.dI[0], this.dI[drop - 1]);
        this.dI.copyWithin(0, drop, this.dn);
        this.dT.copyWithin(0, drop, this.dn);
        this.dn -= drop;
      }
      for (let i = from; i < n; i++) {
        this.dI[this.dn] = i;
        this.dT[this.dn] = now;
        this.dn++;
        arr[i * 16 + 13] = DROP_HEIGHT;
      }
      this.markRange(from, n - 1);
    }
    this.mesh.count = this.lod.count = this.shadow.count = n;
  }

  spawnRing(k, now) {
    this.lastRing = now;
    const r = this.rings.find((x) => !x.visible) || this.rings.reduce((a, b) => (a.userData.t0 < b.userData.t0 ? a : b));
    this.c.cellOfDay(k * this.c.period, _cell);
    r.position.set(_cell[0], 0.03, _cell[1]);
    r.userData.t0 = now;
    r.visible = true;
  }

  markRange(a, b) {
    if (b < a) return;
    this.rangeMin = Math.min(this.rangeMin ?? a, a);
    this.rangeMax = Math.max(this.rangeMax ?? b, b);
  }

  // ——— Nivel de detalle ———

  updateLod() {
    if (!this.c) return;
    const px = this.pxPerCell();
    this.u.uPx.value = px;
    this.months.visible = px >= PX_MONTHS;
    const ma = smooth(5, 8, px);
    this.monthLabMat.uniforms.uAlpha.value = ma;
    this.monthLabels.visible = ma > 0;
    // números de año: comunes cuando se leen; de lejos, solo los redondos y a tamaño fijo
    const yl = this.yearLabMat.uniforms;
    yl.uBase.value = smooth(2.2, 3.2, px) * (1 - 0.65 * smooth(14, 30, px)); // de muy cerca, más suave
    const viewArea = ((this.widthPx * this.heightPx) / (px * px)) / 1.15; // celdas en pantalla, aprox.
    const calArea = this.c.width * this.c.depth;
    const visibleYears = Math.max(1, (Math.min(viewArea, calArea) / (YEAR_PX * YEAR_PZ)));
    let step = 1;
    for (const st of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]) {
      step = st;
      if (visibleYears / st <= 24) break;
    }
    yl.uStep.value = step;
    yl.uMinPx.value = 26;
    // figuras
    const vis = smooth(PX_MODELS_IN[0], PX_MODELS_IN[1], px);
    this.vis.value = vis;
    const f = smooth(PX_DETAIL[0], PX_DETAIL[1], px);
    this.nearMat.userData.fade.value = f;
    this.lodMat.userData.fade.value = f;
    if (this.mesh) {
      const on = vis > 0;
      this.mesh.visible = on && f > 0;
      this.lod.visible = on && f < 1;
      this.shadow.visible = on;
    }
  }

  /** Recuadro (plano local) que se ve en pantalla. */
  viewBox(out) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    const r = this.rect;
    for (let i = 0; i < 4; i++) {
      this.groundAt(r.left + (i & 1 ? r.width : 0), r.top + (i & 2 ? r.height : 0), _g0);
      x0 = Math.min(x0, _g0[0]); x1 = Math.max(x1, _g0[0]);
      z0 = Math.min(z0, _g0[1]); z1 = Math.max(z1, _g0[1]);
    }
    const m = this.modelH * 1.5 + 1; // lo alto de las figuras asoma desde abajo de la pantalla
    out[0] = x0 - m; out[1] = z0 - m; out[2] = x1 + m; out[3] = z1 + m;
    return out;
  }

  /** Carga las figuras de los meses que se ven (si la vista salió de lo cargado). */
  updateChunks() {
    if (!this.mesh) return;
    if (this.vis.value <= 0) {
      if (this.hasLoaded) {
        this.hasLoaded = false;
        this.nLoaded = 0;
        this.mesh.count = this.lod.count = this.shadow.count = 0;
        this.dn = 0;
      }
      return;
    }
    const vb = this.viewBox(this._vb || (this._vb = new Float32Array(4)));
    const L0 = this.loaded;
    if (this.hasLoaded && vb[0] >= L0[0] && vb[1] >= L0[1] && vb[2] <= L0[2] && vb[3] <= L0[3]) return;
    const mx = (vb[2] - vb[0]) * 0.35, mz = (vb[3] - vb[1]) * 0.35;
    if (!this.loadBox(vb[0] - mx, vb[1] - mz, vb[2] + mx, vb[3] + mz)) {
      if (!this.loadBox(vb[0], vb[1], vb[2], vb[3])) {
        // demasiadas figuras en pantalla: se ven los cuadrados de color hasta acercarse más
        this.hasLoaded = false;
        this.nLoaded = 0;
        this.mesh.count = this.lod.count = this.shadow.count = 0;
        this.vis.value = 0;
        this.updateLodVis();
      }
    }
  }

  updateLodVis() {
    this.mesh.visible = this.lod.visible = this.shadow.visible = this.vis.value > 0;
  }

  loadBox(x0, z0, x1, z1) {
    const c = this.c;
    const months = this._months || (this._months = new Int32Array(4096));
    let nm = 0, total = 0;
    const col0 = Math.max(0, Math.floor(x0 / YEAR_PX)), col1 = Math.min(c.cols - 1, Math.floor(x1 / YEAR_PX));
    const row0 = Math.max(0, Math.floor(z0 / YEAR_PZ)), row1 = Math.min(c.rows - 1, Math.floor(z1 / YEAR_PZ));
    for (let row = row0; row <= row1; row++) {
      for (let col = col0; col <= col1; col++) {
        const yi = row * c.cols + col;
        if (yi >= c.years) continue;
        for (let m = 0; m < 12; m++) {
          const i = yi * 12 + m;
          const units = c.kFirst[i + 1] - c.kFirst[i];
          if (!units) continue;
          if (c.mX[i] + MONTH_W < x0 || c.mX[i] > x1 || c.mZ[i] + LAYOUT.monthHead + 6 < z0 || c.mZ[i] > z1) continue;
          if (nm >= months.length) return false;
          months[nm++] = i;
          total += units;
          if (total > this.cap) return false;
        }
      }
    }
    // escribir figuras en orden de compra
    const arr = this.mesh.instanceMatrix.array;
    const colA = this.mesh.instanceColor.array;
    const colB = this.colB.array;
    const { jitter, hood } = this.model;
    const palA = this.palA, palB = this.palB;
    const pick = (pal, n) => pal[Math.min(pal.length - 1, Math.floor(Math.max(0, n) * pal.length))];
    let n = 0;
    for (let q = 0; q < nm; q++) {
      const i = months[q];
      const hA = hood ? valueNoise(c.mX[i] / 30, c.mZ[i] / 30) : 0;
      const hB = hood ? valueNoise(c.mX[i] / 30 + 31.7, c.mZ[i] / 30 - 12.3) : 0;
      for (let k = c.kFirst[i]; k < c.kFirst[i + 1]; k++) {
        const d = k * c.period;
        const cc = d - c.mStart[i] + c.mFirst[i];
        const x = c.mX[i] + (cc % 7) + 0.5;
        const z = c.mZ[i] + LAYOUT.monthHead + Math.floor(cc / 7) + 0.5;
        const r1 = hash1(k * 3 + 1), r2 = hash1(k * 3 + 2), r3 = hash1(k * 3 + 3);
        const ang = -Math.PI / 2 + (jitter ? (r3 - 0.5) * jitter : 0);
        const cs = Math.cos(ang), sn = Math.sin(ang);
        const o = n * 16;
        arr[o] = cs; arr[o + 1] = 0; arr[o + 2] = -sn; arr[o + 3] = 0;
        arr[o + 4] = 0; arr[o + 5] = 1; arr[o + 6] = 0; arr[o + 7] = 0;
        arr[o + 8] = sn; arr[o + 9] = 0; arr[o + 10] = cs; arr[o + 11] = 0;
        arr[o + 12] = x; arr[o + 13] = 0; arr[o + 14] = z; arr[o + 15] = 1;
        const a = hood ? pick(palA, hA * 1.3 - 0.15 + (r1 - 0.5) * 0.55) : palA[Math.floor(r1 * palA.length)];
        const b = hood ? pick(palB, hB * 1.3 - 0.15 + (r2 - 0.5) * 0.7) : palB[Math.floor(r2 * palB.length)];
        const j = 0.94 + hash1(k * 7.3) * 0.08;
        colA[n * 3] = a.r * j; colA[n * 3 + 1] = a.g * j; colA[n * 3 + 2] = a.b * j;
        colB[n * 3] = b.r * j; colB[n * 3 + 1] = b.g * j; colB[n * 3 + 2] = b.b * j;
        this.ks[n] = k;
        n++;
      }
    }
    this.nLoaded = n;
    this.dn = 0;
    const im = this.mesh.instanceMatrix;
    im.clearUpdateRanges();
    im.needsUpdate = true;
    this.rangeMin = this.rangeMax = undefined;
    this.mesh.instanceColor.needsUpdate = true;
    this.colB.needsUpdate = true;
    this.loaded[0] = x0; this.loaded[1] = z0; this.loaded[2] = x1; this.loaded[3] = z1;
    this.hasLoaded = true;
    this.mesh.count = 0;
    this.applyCount(this.bought, false, 0);
    return true;
  }

  // ——— Cuadro a cuadro ———

  get animating() {
    return !!this.ending || this.dn > 0 || this.rings.some((r) => r.visible) || this.cameraMoving();
  }

  cameraMoving() {
    return Math.abs(Math.log(this.th / this.h)) > 1e-4 || Math.abs(this.ttx - this.tx) > 1e-3 || Math.abs(this.ttz - this.tz) > 1e-3 || Math.abs(this.taz - this.az) > 1e-4;
  }

  frame(now, dt) {
    if (!this.c) return;
    // cámara
    if (this.ending) {
      this.stepEnding(dt);
    } else if (this.cameraMoving()) {
      if (this.snap) {
        this.h = this.th; this.tx = this.ttx; this.tz = this.ttz; this.az = this.taz;
      } else {
        const k = 1 - Math.exp(-dt * 3.2);
        this.h = Math.exp(Math.log(this.h) + Math.log(this.th / this.h) * k);
        this.tx += (this.ttx - this.tx) * k;
        this.tz += (this.ttz - this.tz) * k;
        this.az += (this.taz - this.az) * Math.min(1, k * 1.6);
      }
      this.applyCamera();
    }
    this.updateChunks();
    // caídas
    if (this.mesh && this.dn) {
      const arr = this.mesh.instanceMatrix.array;
      let lo = Infinity, hi = -1, keep = 0;
      for (let k = 0; k < this.dn; k++) {
        const i = this.dI[k];
        const t = (now - this.dT[k]) / DROP_MS;
        if (t >= 1 || i >= this.mesh.count) {
          arr[i * 16 + 13] = 0;
        } else {
          arr[i * 16 + 13] = DROP_HEIGHT * bounce(Math.max(0, t));
          this.dI[keep] = i;
          this.dT[keep] = this.dT[k];
          keep++;
        }
        if (i < lo) lo = i;
        if (i > hi) hi = i;
      }
      this.dn = keep;
      this.markRange(lo, hi);
    }
    if (this.mesh && this.rangeMin !== undefined) {
      const attr = this.mesh.instanceMatrix;
      attr.clearUpdateRanges();
      attr.addUpdateRange(this.rangeMin * 16, (this.rangeMax - this.rangeMin + 1) * 16);
      attr.needsUpdate = true;
      this.rangeMin = this.rangeMax = undefined;
    }
    // anillos
    for (const r of this.rings) {
      if (!r.visible) continue;
      const t = (now - r.userData.t0) / RING_MS;
      if (t >= 1 || t < 0) {
        r.visible = false;
        continue;
      }
      const s = Math.max(0.6, this.h * 0.05) * (0.45 + 0.9 * easeOut(t));
      r.scale.set(s, 1, s);
      r.material.opacity = 0.95 * (1 - t) * (1 - t);
    }
    if (this.camDirty) {
      this.camDirty = false;
      this.updatePins();
    }
    this.render();
  }

  /**
   * Cierre de cámara: todo el calendario a la vista y después se acerca al último día comprado,
   * hasta que las figuras se reconocen. `still` (movimiento reducido): solo encuadra todo.
   */
  playEnding(still, onDone) {
    if (!this.c) return;
    const full = this.fullFrame();
    const close = this.minH() * (150 / 34); // ~34 px por celda
    if (still || close > full.h * 0.8) {
      this.ending = null;
      this.th = this.h = full.h; this.ttx = this.tx = full.tx; this.ttz = this.tz = full.tz; this.taz = this.az = 0;
      this.applyCamera();
      this.wake();
      onDone?.();
      return;
    }
    const c = this.c;
    c.cellOfDay(Math.max(0, (c.N - 1) * c.period), _cell);
    this.ending = { t: 0, full, fromH: this.h, fromX: this.tx, fromZ: this.tz, fromAz: this.az, close, settle: close * 1.25, px: _cell[0] + 1.5, pz: _cell[1] - 1, onDone };
    this.wake();
  }

  cancelEnding() {
    this.ending = null;
  }

  stepEnding(dt) {
    const e = this.ending;
    e.t += dt;
    const t = e.t;
    const HOLD = 0.8, PUSH = 2.0, SETTLE = 1.0;
    let h, x, z;
    const f = e.full;
    if (t < HOLD) {
      const k = easeOut(clamp01(t / 0.6));
      h = e.fromH + (f.h - e.fromH) * k;
      x = e.fromX + (f.tx - e.fromX) * k;
      z = e.fromZ + (f.tz - e.fromZ) * k;
      this.az = e.fromAz * (1 - k);
    } else if (t < HOLD + PUSH) {
      const k = easeInOut((t - HOLD) / PUSH);
      h = f.h * Math.pow(e.close / f.h, k);
      const m = Math.log(f.h / h) / Math.log(f.h / e.close);
      x = f.tx + (e.px - f.tx) * m;
      z = f.tz + (e.pz - f.tz) * m;
      this.az = 0;
    } else {
      const k = easeOut(clamp01((t - HOLD - PUSH) / SETTLE));
      h = e.close + (e.settle - e.close) * k;
      x = e.px;
      z = e.pz;
    }
    this.h = h; this.tx = x; this.tz = z;
    this.th = h; this.ttx = x; this.ttz = z; this.taz = this.az;
    this.applyCamera();
    if (t >= HOLD + PUSH + SETTLE) {
      this.ending = null;
      e.onDone?.();
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** Celda bajo un punto de la pantalla: día desde hoy, o null. */
  dayAtPoint(clientX, clientY) {
    if (!this.c) return null;
    this.groundAt(clientX, clientY, _g0);
    return this.c.dayAt(_g0[0], _g0[1]);
  }

  // ——— Bucle ———

  /** `hook(now, dt)` corre antes de cada cuadro y devuelve true si todavía hay algo andando. */
  setHook(hook) {
    this.busyHook = hook;
  }

  wake() {
    this.idleFrames = 0;
    if (this.running || document.hidden) return;
    this.running = true;
    this.lastT = performance.now();
    this.renderer.setAnimationLoop((t) => {
      const dt = Math.min(0.1, (t - this.lastT) / 1000);
      this.lastT = t;
      const busy = this.busyHook ? this.busyHook(t, dt) : false;
      this.frame(t, dt);
      if (busy || this.animating) this.idleFrames = 0;
      else if (++this.idleFrames > 2) this.pause();
    });
  }

  pause() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  dispose() {
    this.pause();
    this.clearItem();
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    for (const m of [this.nearMat, this.lodMat, this.shadowMat, this.monthMat, this.yearMat, this.yearLabMat, this.monthLabMat, this.pinMat]) m.dispose();
    for (const t of [this.shadowTex, this.glyphTex, this.monthTex]) t.dispose();
    this.pinGeo.dispose();
    this.ringGeo.dispose();
    for (const r of this.rings) r.material.dispose();
    this.renderer.dispose();
  }
}
