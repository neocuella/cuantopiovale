// Modelos de juguete, armados en código con bloques de bordes redondeados, prismas y ruedas.
//
// Cada modelo es una función que devuelve una lista de partes; se fusionan en una sola
// BufferGeometry (color en un atributo de vértice) que se dibuja con un InstancedMesh. Para
// reemplazar un modelo por un glTF CC0 alcanza con devolver una geometría equivalente desde
// `loadModel` (fusionando las mallas del glTF y pasando el color del material a un atributo
// `color`, y `paint` en 0): el resto de la escena solo usa lo que devuelve `loadModel`.
//
// Atributo `paint` por vértice: 0 = color fijo, 1 = se pinta con la paleta A de la figura,
// 2 = paleta B. Así cada casa puede tener otro techo y cada auto otra pintura sin más geometría.
//
// Convenciones: 1 unidad ≈ una casa. Origen en el centro de la huella, y = 0 es el suelo.
// El frente mira a +z y a +x (las caras que ve la cámara isométrica).
//
// Estilo: bloques de juguete mate. Los bordes son chaflanes chicos cuyas normales pasan de una
// cara a la otra, así la luz los redondea con pocos triángulos (una caja redondeada son 42, o 30
// si apoya en el suelo). Ventanas, cruces y franjas son calcomanías planas (2 a 10 triángulos):
// no parpadean de lejos como las piezas finas. La cámara siempre mira desde arriba, así que las
// caras que miran al piso no se arman.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const GROUND_COLOR = '#f6f5f1'; // papel del calendario

const _c = new THREE.Color();

const GLASS = '#8fc8e6';
const DARK_GLASS = '#2b3442';
const TYRE = '#23262d';
const HUB = '#a3a8b0';
const HEALTH_GREEN = '#1f8f5f';
const LAMP = '#fff4b0';

/** Prepara una parte: posición, normal, color por vértice y `paint`, sin índices ni uv. */
function finish(geo, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, paint = 0 } = {}) {
  if (rx) geo.rotateX(rx);
  if (ry) geo.rotateY(ry);
  if (rz) geo.rotateZ(rz);
  geo.translate(x, y, z);
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  _c.set(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  const pa = new Float32Array(n).fill(paint);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.setAttribute('paint', new THREE.BufferAttribute(pa, 1));
  return g;
}

/** Varias partes ya preparadas (cada una con su color) en una sola pieza. */
function join(...parts) {
  const list = parts.flat();
  const g = mergeGeometries(list, false);
  for (const p of list) p.dispose();
  return g;
}

// ——— Geometría base ———

/**
 * Triángulos sueltos → geometría. Cada vértice es { p: [x, y, z], n: [x, y, z] }. Da vuelta los
 * triángulos que quedaron hacia adentro (según sus normales), saltea los degenerados y, si
 * `drop`, los que miran al piso.
 */
function tris(list, drop = true) {
  const pos = [], nor = [];
  for (const [A, B, C] of list) {
    const ux = B.p[0] - A.p[0], uy = B.p[1] - A.p[1], uz = B.p[2] - A.p[2];
    const vx = C.p[0] - A.p[0], vy = C.p[1] - A.p[1], vz = C.p[2] - A.p[2];
    let gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    const g = Math.hypot(gx, gy, gz);
    if (g < 1e-9) continue;
    const flip = gx * (A.n[0] + B.n[0] + C.n[0]) + gy * (A.n[1] + B.n[1] + C.n[1]) + gz * (A.n[2] + B.n[2] + C.n[2]) < 0;
    if (flip) gy = -gy;
    if (drop && gy / g < -0.9) continue;
    for (const P of flip ? [A, C, B] : [A, B, C]) {
      pos.push(P.p[0], P.p[1], P.p[2]);
      nor.push(P.n[0], P.n[1], P.n[2]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return geo;
}

function quad(list, A, B, C, D) {
  list.push([A, B, C], [A, C, D]);
}

/** Caja de bordes redondeados, centrada. `sit`: apoya en el suelo (sin chaflán abajo). */
function rboxGeo(w, h, d, r, sit = false, drop = true) {
  r = Math.max(0.002, Math.min(r, w * 0.45, h * 0.45, d * 0.45));
  const H = [w / 2, h / 2, d / 2];
  const I = [w / 2 - r, h / 2 - r, d / 2 - r];
  const yb = sit ? -h / 2 : -h / 2 + r;
  const P = (a, s) => {
    const p = [s[0] * I[0], s[1] > 0 ? I[1] : yb, s[2] * I[2]];
    p[a] = s[a] * H[a];
    const n = [0, 0, 0];
    n[a] = s[a];
    return { p, n };
  };
  const oct = (a, sa, b, sb, c, sc) => {
    const s = [0, 0, 0];
    s[a] = sa; s[b] = sb; s[c] = sc;
    return s;
  };
  const list = [];
  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3, c = (a + 2) % 3;
    for (const s of [-1, 1]) {
      // cara
      quad(list, P(a, oct(a, s, b, -1, c, -1)), P(a, oct(a, s, b, 1, c, -1)), P(a, oct(a, s, b, 1, c, 1)), P(a, oct(a, s, b, -1, c, 1)));
      // borde entre a y b, a lo largo de c
      for (const t of [-1, 1]) {
        const o0 = oct(a, s, b, t, c, -1), o1 = oct(a, s, b, t, c, 1);
        quad(list, P(a, o0), P(a, o1), P(b, o1), P(b, o0));
      }
    }
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const s = [sx, sy, sz];
    list.push([P(0, s), P(1, s), P(2, s)]);
  }
  return tris(list, drop);
}

/**
 * Prisma: perfil (puntos [x, y] o [x, y, radio de la esquina]) extruido a lo ancho en z,
 * centrado, con chaflán `c` en los bordes de las dos tapas.
 */
function prismGeo(pts, width, c) {
  let P = pts.map(([x, y, r = 0]) => ({ x, y, r }));
  let area = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    area += a.x * b.y - b.x * a.y;
  }
  if (area < 0) P = P.reverse();
  // esquinas redondeadas: dos puntos y una faceta cuyas normales siguen a las caras vecinas
  const V = [];
  const n0 = P.length;
  for (let i = 0; i < n0; i++) {
    const p = P[i];
    if (p.r > 0) {
      const a = P[(i - 1 + n0) % n0], b = P[(i + 1) % n0];
      const la = Math.hypot(a.x - p.x, a.y - p.y), lb = Math.hypot(b.x - p.x, b.y - p.y);
      const r = Math.min(p.r, la * 0.45, lb * 0.45);
      V.push({ x: p.x + ((a.x - p.x) / la) * r, y: p.y + ((a.y - p.y) / la) * r, bevel: true });
      V.push({ x: p.x + ((b.x - p.x) / lb) * r, y: p.y + ((b.y - p.y) / lb) * r, bevel: false });
    } else V.push({ x: p.x, y: p.y, bevel: false });
  }
  const m = V.length;
  const E = V.map((v, j) => {
    const w = V[(j + 1) % m];
    const L = Math.hypot(w.x - v.x, w.y - v.y);
    return [(w.y - v.y) / L, -(w.x - v.x) / L];
  });
  const NA = [], NB = [];
  for (let j = 0; j < m; j++) {
    if (V[j].bevel) {
      NA[j] = E[(j - 1 + m) % m];
      NB[j] = E[(j + 1) % m];
    } else NA[j] = NB[j] = E[j];
  }
  // tapa: el perfil metido `c` hacia adentro
  const I = V.map((v, j) => {
    const a = E[(j - 1 + m) % m], b = E[j];
    const k = c / Math.max(0.2, 1 + a[0] * b[0] + a[1] * b[1]);
    return { x: v.x - (a[0] + b[0]) * k, y: v.y - (a[1] + b[1]) * k };
  });
  const zf = width / 2, zi = width / 2 - c;
  const list = [];
  const vtx = (x, y, z, n) => ({ p: [x, y, z], n });
  for (let j = 0; j < m; j++) {
    const k = (j + 1) % m;
    const na = [NA[j][0], NA[j][1], 0], nb = [NB[j][0], NB[j][1], 0];
    quad(list, vtx(V[j].x, V[j].y, zi, na), vtx(V[k].x, V[k].y, zi, nb), vtx(V[k].x, V[k].y, -zi, nb), vtx(V[j].x, V[j].y, -zi, na));
    if (c > 0) {
      for (const s of [1, -1]) {
        const nz = [0, 0, s];
        quad(list, vtx(V[j].x, V[j].y, s * zi, na), vtx(V[k].x, V[k].y, s * zi, nb), vtx(I[k].x, I[k].y, s * zf, nz), vtx(I[j].x, I[j].y, s * zf, nz));
      }
    }
  }
  const capPts = c > 0 ? I : V;
  const faces = THREE.ShapeUtils.triangulateShape(capPts.map((v) => new THREE.Vector2(v.x, v.y)), []);
  for (const s of [1, -1]) {
    const nz = [0, 0, s];
    for (const [a, b, d] of faces) list.push([vtx(capPts[a].x, capPts[a].y, s * zf, nz), vtx(capPts[b].x, capPts[b].y, s * zf, nz), vtx(capPts[d].x, capPts[d].y, s * zf, nz)]);
  }
  return tris(list);
}

/** Rueda con el eje en z: banda redonda, chaflán en la cara de afuera (+z; `both`: en las dos). */
function wheelGeo(r, w, seg, c, both, drop = true) {
  const list = [];
  const ang = (k) => ((k + 0.5) / seg) * Math.PI * 2 - Math.PI / 2;
  const z0 = both ? -w / 2 + c : -w / 2, z1 = w / 2 - c;
  const ring = (rad, z, n) => Array.from({ length: seg }, (_, k) => ({ p: [Math.cos(ang(k)) * rad, Math.sin(ang(k)) * rad, z], n: n(k) }));
  const radial = (k) => [Math.cos(ang(k)), Math.sin(ang(k)), 0];
  const a = ring(r, z0, radial), b = ring(r, z1, radial);
  const f = ring(r - c, w / 2, () => [0, 0, 1]);
  const back = ring(both ? r - c : r, -w / 2, () => [0, 0, -1]);
  for (let k = 0; k < seg; k++) {
    const q = (k + 1) % seg;
    quad(list, a[k], a[q], b[q], b[k]);
    quad(list, b[k], b[q], f[q], f[k]);
    if (both) quad(list, a[k], a[q], back[q], back[k]);
  }
  for (let k = 1; k < seg - 1; k++) {
    list.push([f[0], f[k], f[k + 1]]);
    list.push([back[0], back[k], back[k + 1]]);
  }
  return tris(list, drop);
}

function polyGeo(points) {
  return new THREE.ShapeGeometry(new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y))));
}

/** Gira una calcomanía (hecha en el plano xy, mirando a +z) para que mire a una cara. */
function orient(geo, face) {
  if (face === 'x') geo.rotateY(Math.PI / 2);
  else if (face === '-x') geo.rotateY(-Math.PI / 2);
  else if (face === '-z') geo.rotateY(Math.PI);
  else if (face === 'y') geo.rotateX(-Math.PI / 2);
  return geo;
}

// ——— Piezas ———

/** Caja común apoyada en y0 (piezas finas, versiones de lejos). */
function box(w, h, d, color, x = 0, y0 = 0, z = 0, paint = 0) {
  return finish(new THREE.BoxGeometry(w, h, d), color, { x, y: y0 + h / 2, z, paint });
}

/** Caja común centrada en (x, y, z) y girada. */
function tilted(w, h, d, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, paint = 0 }) {
  return finish(new THREE.BoxGeometry(w, h, d), color, { x, y, z, rx, ry, rz, paint });
}

/**
 * Bloque de bordes redondeados apoyado en y0. Los bordes de abajo quedan rectos (30 triángulos)
 * salvo con `under` (42): losas y carrocerías cuyo borde inferior se ve.
 */
function rb(w, h, d, color, x = 0, y0 = 0, z = 0, { r = Math.min(0.04, 0.28 * Math.min(w, h, d)), paint = 0, under = false } = {}) {
  return finish(rboxGeo(w, h, d, r, !under), color, { x, y: y0 + h / 2, z, paint });
}

/** Perfil lateral (puntos en x,y; tercer valor opcional = esquina redondeada) extruido a lo ancho en z. */
function profile(points, width, color, z = 0, paint = 0, c = 0.03) {
  return finish(prismGeo(points, width, c), color, { z, paint });
}

/** Perfil en el plano z,y extruido a lo largo de x, centrado en x0. */
function profileZ(points, length, color, y0 = 0, x0 = 0, paint = 0, c = 0.03) {
  return finish(prismGeo(points.map(([z, y, r]) => [-z, y, r]), length, c), color, { ry: Math.PI / 2, y: y0, x: x0, paint });
}

/** Rueda con taza: eje en z, apoyada en el suelo; `side` = de qué lado queda la cara de afuera; `both`: taza de los dos lados (moto). */
function wheel(r, width, color, x, z, { side = 1, seg = 8, hub = HUB, y = r, both = false, ry = side < 0 ? Math.PI : 0 } = {}) {
  const c = Math.min(0.025, width * 0.3);
  const at = { x, y, z, ry };
  const parts = [finish(wheelGeo(r, width, seg, c, false), color, at)];
  const disc = () => polyGeo(Array.from({ length: seg }, (_, k) => [Math.cos(((k + 0.5) / seg) * Math.PI * 2 - Math.PI / 2) * r * 0.52, Math.sin(((k + 0.5) / seg) * Math.PI * 2 - Math.PI / 2) * r * 0.52]));
  parts.push(finish(disc().translate(0, 0, width / 2 + 0.003), hub, at));
  if (both) parts.push(finish(orient(disc(), '-z').translate(0, 0, -width / 2 - 0.003), hub, at));
  return join(parts);
}

/** Calcomanía rectangular en una cara ('x', '-x', 'z', '-z', 'y'), centrada en (x, y, z). */
function decal(w, h, color, face, x, y, z, paint = 0) {
  return finish(orient(new THREE.PlaneGeometry(w, h), face), color, { x, y, z, paint });
}

/** Calcomanía con forma (puntos en x,y) en un costado del vehículo, a la altura z (±). */
function side(points, z, color, paint = 0) {
  if (z >= 0) return finish(polyGeo(points), color, { z, paint });
  return finish(orient(polyGeo(points.map(([x, y]) => [-x, y])), '-z'), color, { z, paint });
}

/** Ventana con marco: calcomanía clara y vidrio encima. */
function win(w, h, face, x, y, z, { glass = GLASS, frame = '#ffffff', f = 0.045 } = {}) {
  const o = 0.003;
  const off = { x: [o, 0, 0], '-x': [-o, 0, 0], z: [0, 0, o], '-z': [0, 0, -o] }[face];
  return join(
    decal(w + f, h + f, frame, face, x + off[0], y, z + off[2]),
    decal(w, h, glass, face, x + 2 * off[0], y, z + 2 * off[2])
  );
}

/** Vidrio sobre una cara inclinada del perfil (parabrisas): del punto p al q, de t0 a t1, ancho 2·hw. */
function slant(p, q, t0, t1, hw, color, { zc = 0, paint = 0 } = {}) {
  const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
  let nx = dy / L, ny = -dx / L;
  if (ny < 0) { nx = -nx; ny = -ny; }
  const e = 0.004;
  const a = [p[0] + dx * t0 + nx * e, p[1] + dy * t0 + ny * e];
  const b = [p[0] + dx * t1 + nx * e, p[1] + dy * t1 + ny * e];
  const n = [nx, ny, 0];
  const list = [];
  quad(list, { p: [a[0], a[1], zc - hw], n }, { p: [b[0], b[1], zc - hw], n }, { p: [b[0], b[1], zc + hw], n }, { p: [a[0], a[1], zc + hw], n });
  return finish(tris(list, false), color, { paint });
}

/** Cruz plana (verde de salud) centrada en (x, y, z), en una cara ('z', '-z', 'x', '-x', 'y' = techo). */
function cross(size, bar, face, x, y, z, color = HEALTH_GREEN) {
  const s = size / 2, b = bar / 2;
  const pts = [[-b, -s], [b, -s], [b, -b], [s, -b], [s, b], [b, b], [b, s], [-b, s], [-b, b], [-s, b], [-s, -b], [-b, -b]];
  return finish(orient(polyGeo(pts), face), color, { x, y, z });
}

// ——— Modelos ———

function casa() {
  const y0 = 0.05, Hw = 0.56, D = 0.78, L = 1.0;
  const k = 0.78; // pendiente del techo (≈ 38°)
  const half = D / 2 + 0.11; // alero al frente y atrás
  const ridgeU = y0 + Hw + (D / 2) * k; // cara de abajo del techo en la cumbrera
  const eaveU = ridgeU - half * k;
  const t = 0.1;
  const fz = D / 2 + 0.002, fx = L / 2 + 0.002;
  return [
    rb(1.1, y0, 0.92, '#cfc6b4', 0, 0, 0, { r: 0.02 }), // vereda
    // paredes y triángulos del frente en una sola pieza
    profileZ([[-D / 2, 0], [D / 2, 0], [D / 2, Hw], [0, Hw + (D / 2) * k - 0.015], [-D / 2, Hw]], L, '#f6ead2', y0, 0, 2, 0.04),
    profileZ([[-half, eaveU], [-half, eaveU + t, 0.035], [0, ridgeU + t, 0.06], [half, eaveU + t, 0.035], [half, eaveU], [0, ridgeU]], 1.18, '#d9583b', 0, 0, 1, 0.02),
    rb(0.13, 0.32, 0.13, '#9a5b45', -0.27, ridgeU + t - 0.22 * k - 0.08, -0.22, { r: 0.025 }), // chimenea
    // frente: puerta con alero, ventana
    decal(0.2, 0.34, '#7a4128', 'z', 0.22, y0 + 0.17, fz),
    rb(0.34, 0.04, 0.15, '#7c4a35', 0.22, y0 + 0.39, D / 2 + 0.06, { r: 0.016 }),
    win(0.25, 0.2, 'z', -0.2, y0 + 0.3, fz),
    // costado y fondo
    win(0.22, 0.2, 'x', fx, y0 + 0.3, 0),
    join(win(0.22, 0.2, '-z', 0.2, y0 + 0.3, -fz), win(0.22, 0.2, '-x', -fx, y0 + 0.3, 0)),
  ];
}
function casaLod() {
  return [
    box(1.0, 0.61, 0.78, '#f6ead2', 0, 0, 0, 2),
    profileZ([[-0.5, 0], [0.5, 0], [0, 0.42]], 1.18, '#d9583b', 0.58, 0, 1, 0),
  ];
}

function aula() {
  const y0 = 0.05, W = 1.6, zb = -0.47, zf = 0.3;
  const k = 0.3, zr = 0.56, eave = 0.57;
  const ridge = eave + zr * k; // cara de abajo del techo en la cumbrera
  const under = (z) => ridge - k * Math.abs(z);
  const t = 0.08;
  const ff = zf + 0.002, fx = W / 2 + 0.002;
  const posts = [-0.72, 0.0, 0.72].map((x) => rb(0.075, under(0.5) - y0, 0.075, '#ffffff', x, y0, 0.5, { r: 0.018 }));
  const windows = [-0.6, -0.24, 0.12].map((x) => win(0.25, 0.22, 'z', x, y0 + 0.31, ff));
  return [
    rb(1.82, y0, 1.32, '#cfc6b4', 0, 0, 0.08, { r: 0.02 }),
    // bloque largo y bajo con los triángulos del techo
    profileZ([[zb, 0], [zf, 0], [zf, under(zf) - y0 - 0.01], [0, ridge - y0 - 0.01], [zb, under(zb) - y0 - 0.01]], W, '#fbe7b0', y0, 0, 2, 0.04),
    // techo de chapa a dos aguas que cubre la galería
    profileZ([[-zr, eave], [-zr, eave + t, 0.03], [0, ridge + t, 0.05], [zr, eave + t, 0.03], [zr, eave], [0, ridge]], 1.8, '#8f949c', 0, 0, 0, 0.02),
    join(posts),
    // zócalo de color al frente y al costado
    join(decal(W - 0.08, 0.09, '#e0573a', 'z', 0, y0 + 0.045, ff - 0.001, 1), decal(zf - zb - 0.08, 0.09, '#e0573a', 'x', fx - 0.001, y0 + 0.045, (zf + zb) / 2, 1)),
    decal(0.2, 0.38, '#2f5d46', 'z', 0.56, y0 + 0.19, ff + 0.002), // puerta verde pizarrón
    join(windows),
    join(win(0.3, 0.22, 'x', fx, y0 + 0.31, (zf + zb) / 2), win(0.3, 0.22, '-x', -fx, y0 + 0.31, (zf + zb) / 2)),
    join([-0.5, 0, 0.5].map((x) => win(0.28, 0.2, '-z', x, y0 + 0.31, zb - 0.002))),
    // mástil con bandera
    rb(0.055, 1.2, 0.055, '#7b808a', -0.84, y0, 0.68, { r: 0.016 }),
    join(box(0.4, 0.09, 0.03, '#d52b1e', -0.62, 1.14, 0.68), box(0.4, 0.09, 0.03, '#ffffff', -0.62, 1.05, 0.68), box(0.4, 0.09, 0.03, '#0038a8', -0.62, 0.96, 0.68)),
  ];
}
function aulaLod() {
  return [
    box(1.6, 0.6, 0.7, '#fbe7b0', 0, 0, -0.12, 2),
    profileZ([[-0.56, 0], [0.56, 0], [0, 0.2]], 1.8, '#8f949c', 0.58, 0, 0, 0),
    box(0.06, 1.2, 0.06, '#7b808a', -0.84, 0, 0.68),
  ];
}

function usf() {
  const y0 = 0.05, D = 1.0, W = 1.2;
  const fz = D / 2 + 0.002, fx = W / 2 + 0.002;
  return [
    rb(1.38, y0, 1.48, '#d9d4c7', 0, 0, 0.15, { r: 0.02 }),
    rb(W, 0.57, D, '#ffffff', 0, y0, 0, { r: 0.04, paint: 2 }),
    rb(1.26, 0.15, 1.06, HEALTH_GREEN, 0, 0.6, 0, { r: 0.04, under: true }), // remate verde
    rb(1.14, 0.04, 0.94, '#e8ebee', 0, 0.725, 0, { r: 0.015 }), // techo plano, dentro del remate
    cross(0.5, 0.15, 'y', -0.05, 0.768, -0.05),
    // alero de entrada con dos pilares
    // más ancho y más profundo que los dos pilares, para que los cubra con aire
    rb(0.66, 0.05, 0.44, HEALTH_GREEN, 0.27, 0.44, 0.71, { r: 0.02, under: true }),
    join(rb(0.055, 0.39, 0.055, '#d4d8de', 0.5, y0, 0.83, { r: 0.014 }), rb(0.055, 0.39, 0.055, '#d4d8de', 0.02, y0, 0.83, { r: 0.014 })),
    decal(0.26, 0.36, GLASS, 'z', 0.26, y0 + 0.18, fz),
    join(win(0.24, 0.22, 'x', fx, 0.35, 0.18), win(0.24, 0.22, 'x', fx, 0.35, -0.22)),
    join(win(0.24, 0.22, '-x', -fx, 0.35, 0), win(0.24, 0.22, '-z', 0.3, 0.35, -fz), win(0.24, 0.22, '-z', -0.2, 0.35, -fz)),
    // cartel blanco con la cruz verde al frente
    rb(0.44, 0.44, 0.04, '#ffffff', -0.3, 0.12, D / 2 + 0.02, { r: 0.016 }),
    cross(0.3, 0.09, 'z', -0.3, 0.34, D / 2 + 0.044), // centrada en el cartel (0,12–0,56)
  ];
}
function usfLod() {
  return [box(1.2, 0.6, 1.0, '#ffffff', 0, 0, 0, 2), box(1.3, 0.16, 1.1, '#d3e9dd', 0, 0.6, 0)];
}

function ambulancia() {
  const W = 0.6, WC = 0.54;
  const zs = W / 2 + 0.003, zc = WC / 2 + 0.003;
  const cab = [[0.16, 0.14], [0.64, 0.14], [0.64, 0.32, 0.05], [0.5, 0.37], [0.36, 0.57, 0.03], [0.16, 0.58]];
  const glass = [[0.22, 0.4], [0.465, 0.4], [0.345, 0.54], [0.22, 0.54]];
  const stripe = (z) => [decal(0.78, 0.075, '#f26a1b', z > 0 ? 'z' : '-z', -0.22, 0.3, z, 1)];
  return [
    // caja trasera alta y cabina más baja y angosta adelante (mira a +x)
    rb(0.84, 0.58, W, '#ffffff', -0.22, 0.14, 0, { r: 0.045, under: true }),
    profile(cab, WC, '#ffffff', 0, 0, 0.03),
    join(side(glass, zc, DARK_GLASS), side(glass, -zc, DARK_GLASS), slant([0.5, 0.37], [0.36, 0.57], 0.08, 0.86, WC / 2 - 0.04, DARK_GLASS)),
    // franja de color a lo largo
    join(stripe(zs), stripe(-zs), side([[0.18, 0.2625], [0.6, 0.2625], [0.6, 0.3375], [0.18, 0.3375]], zc, '#f26a1b', 1), side([[0.18, 0.2625], [0.6, 0.2625], [0.6, 0.3375], [0.18, 0.3375]], -zc, '#f26a1b', 1), decal(0.5, 0.075, '#f26a1b', '-x', -0.643, 0.3, 0, 1)),
    // balizas sobre la caja
    join(rb(0.13, 0.07, 0.22, '#e0312b', 0.1, 0.72, 0.12, { r: 0.022 }), rb(0.13, 0.07, 0.22, '#2f6fde', 0.1, 0.72, -0.12, { r: 0.022 })),
    // cruz verde a los costados (entre la franja y el techo) y en el techo
    join(cross(0.22, 0.07, 'z', -0.26, 0.515, zs), cross(0.22, 0.07, '-z', -0.26, 0.515, -zs)),
    cross(0.3, 0.09, 'y', -0.28, 0.723, 0),
    // puertas de atrás
    join(decal(0.18, 0.14, DARK_GLASS, '-x', -0.643, 0.55, 0.12), decal(0.18, 0.14, DARK_GLASS, '-x', -0.643, 0.55, -0.12)),
    // trompa: paragolpes y faros
    join(rb(0.07, 0.07, 0.5, '#3a3f48', 0.63, 0.11, 0, { r: 0.025 }), decal(0.09, 0.05, LAMP, 'x', 0.643, 0.235, 0.17), decal(0.09, 0.05, LAMP, 'x', 0.643, 0.235, -0.17), rb(0.05, 0.06, 0.58, '#3a3f48', -0.64, 0.12, 0, { r: 0.02 })),
    wheel(0.12, 0.09, TYRE, 0.38, 0.265),
    wheel(0.12, 0.09, TYRE, -0.38, 0.265),
    wheel(0.12, 0.09, TYRE, 0.38, -0.265, { side: -1 }),
    wheel(0.12, 0.09, TYRE, -0.38, -0.265, { side: -1 }),
  ];
}
function ambulanciaLod() {
  return [
    box(0.84, 0.58, 0.6, '#ffffff', -0.22, 0.14, 0),
    box(0.46, 0.4, 0.54, '#ffffff', 0.4, 0.14, 0),
    box(1.28, 0.075, 0.61, '#f26a1b', -0.0, 0.26, 0, 1),
    box(0.12, 0.12, 0.62, TYRE, 0.38, 0, 0),
    box(0.12, 0.12, 0.62, TYRE, -0.38, 0, 0),
  ];
}

function camioneta() {
  const W = 0.62, WC = W - 0.04;
  const PAINT = '#c8ccd2';
  const zc = WC / 2 + 0.003;
  const body = [[-0.7, 0.15], [0.7, 0.15], [0.7, 0.33, 0.045], [0.6, 0.41, 0.02], [-0.19, 0.42], [-0.19, 0.28], [-0.7, 0.28]];
  const cab = [[-0.2, 0.41], [0.27, 0.41], [0.13, 0.67, 0.035], [-0.2, 0.67, 0.035]];
  const front = [[0.01, 0.455], [0.215, 0.455], [0.127, 0.625], [0.01, 0.625]];
  const rear = [[-0.165, 0.455], [-0.02, 0.455], [-0.02, 0.625], [-0.165, 0.625]];
  return [
    // chasis con capó y caja (mira a +x)
    profile(body, W, PAINT, 0, 1, 0.03),
    // caja abierta: barandas y piso oscuro
    join(
      rb(0.53, 0.15, 0.05, PAINT, -0.445, 0.27, W / 2 - 0.025, { r: 0.018, paint: 1 }),
      rb(0.53, 0.15, 0.05, PAINT, -0.445, 0.27, -W / 2 + 0.025, { r: 0.018, paint: 1 }),
      rb(0.05, 0.15, W, PAINT, -0.675, 0.27, 0, { r: 0.018, paint: 1 })
    ),
    decal(0.48, W - 0.1, '#33373e', 'y', -0.43, 0.283, 0),
    // cabina doble
    profile(cab, WC, PAINT, 0, 1, 0.03),
    join(
      side(front, zc, DARK_GLASS), side(rear, zc, DARK_GLASS), side(front, -zc, DARK_GLASS), side(rear, -zc, DARK_GLASS),
      slant([0.27, 0.41], [0.13, 0.67], 0.1, 0.88, WC / 2 - 0.035, DARK_GLASS),
      decal(WC - 0.1, 0.15, DARK_GLASS, '-x', -0.203, 0.55, 0)
    ),
    // trompa: parrilla, faros, paragolpes
    join(
      decal(0.3, 0.08, '#2b2f36', 'x', 0.703, 0.25, 0),
      decal(0.1, 0.055, LAMP, 'x', 0.703, 0.265, 0.21),
      decal(0.1, 0.055, LAMP, 'x', 0.703, 0.265, -0.21),
      rb(0.07, 0.065, W + 0.02, '#3a3f48', 0.69, 0.11, 0, { r: 0.025 })
    ),
    wheel(0.145, 0.1, TYRE, 0.42, W / 2 - 0.035),
    wheel(0.145, 0.1, TYRE, -0.44, W / 2 - 0.035),
    wheel(0.145, 0.1, TYRE, 0.42, -W / 2 + 0.035, { side: -1 }),
    wheel(0.145, 0.1, TYRE, -0.44, -W / 2 + 0.035, { side: -1 }),
  ];
}
function camionetaLod() {
  return [
    box(1.4, 0.27, 0.62, '#c8ccd2', 0, 0.15, 0, 1),
    box(0.47, 0.26, 0.58, DARK_GLASS, 0.03, 0.42, 0),
    box(0.03, 0.14, 0.62, '#c8ccd2', -0.69, 0.42, 0, 1),
    box(0.14, 0.14, 0.64, TYRE, 0.42, 0, 0),
    box(0.14, 0.14, 0.64, TYRE, -0.44, 0, 0),
  ];
}

function todoterreno() {
  const W = 0.64, WC = W - 0.04;
  const BODY = '#1b1d22';
  const TRIM = '#0e0f12';
  const TINT = '#566170'; // vidrio blindado: más claro que la chapa, para que se lea en negro
  const zc = WC / 2 + 0.003;
  const top = [[-0.6, 0.5], [0.3, 0.5], [0.27, 0.83, 0.03], [-0.6, 0.83, 0.03]];
  const wins = [
    [[0.06, 0.56], [0.25, 0.56], [0.235, 0.77], [0.06, 0.77]],
    [[-0.26, 0.56], [0.02, 0.56], [0.02, 0.77], [-0.26, 0.77]],
    [[-0.555, 0.56], [-0.3, 0.56], [-0.3, 0.77], [-0.555, 0.77]],
  ];
  return [
    // carrocería cuadrada y alta (mira a +x): parte baja y techo casi vertical
    rb(1.22, 0.32, W, BODY, 0, 0.19, 0, { r: 0.045, paint: 1, under: true }),
    profile(top, WC, BODY, 0, 1, 0.035),
    join(
      wins.map((p) => side(p, zc, TINT)),
      wins.map((p) => side(p, -zc, TINT)),
      slant([0.3, 0.5], [0.27, 0.83], 0.15, 0.88, WC / 2 - 0.045, TINT),
      decal(WC - 0.12, 0.18, TINT, '-x', -0.603, 0.67, 0)
    ),
    // portaequipaje y barra de luces
    join(rb(0.64, 0.035, WC - 0.1, TRIM, -0.17, 0.83, 0, { r: 0.012 }), rb(0.07, 0.05, 0.46, LAMP, 0.2, 0.83, 0, { r: 0.018 })),
    // guardabarros anchos
    rb(0.42, 0.07, W + 0.1, TRIM, 0.4, 0.31, 0, { r: 0.025 }),
    rb(0.42, 0.07, W + 0.1, TRIM, -0.4, 0.31, 0, { r: 0.025 }),
    // trompa: parrilla, faros, paragolpes
    join(
      decal(0.26, 0.14, TRIM, 'x', 0.613, 0.37, 0),
      decal(0.09, 0.09, LAMP, 'x', 0.613, 0.38, 0.22),
      decal(0.09, 0.09, LAMP, 'x', 0.613, 0.38, -0.22),
      rb(0.09, 0.09, W + 0.04, '#3a3f48', 0.62, 0.14, 0, { r: 0.03 }),
      rb(0.07, 0.08, W, '#3a3f48', -0.62, 0.15, 0, { r: 0.025 })
    ),
    // rueda de auxilio atrás
    wheel(0.15, 0.1, TYRE, -0.67, 0, { y: 0.39, ry: -Math.PI / 2, hub: '#3a3f48' }),
    wheel(0.17, 0.12, TYRE, 0.4, W / 2 - 0.03),
    wheel(0.17, 0.12, TYRE, -0.4, W / 2 - 0.03),
    wheel(0.17, 0.12, TYRE, 0.4, -W / 2 + 0.03, { side: -1 }),
    wheel(0.17, 0.12, TYRE, -0.4, -W / 2 + 0.03, { side: -1 }),
  ];
}
function todoterrenoLod() {
  return [
    box(1.22, 0.64, 0.62, '#1b1d22', 0, 0.19, 0, 1),
    box(0.88, 0.22, 0.63, '#566170', -0.15, 0.56, 0),
    box(0.1, 0.3, 0.3, TYRE, -0.67, 0.24, 0),
    box(0.17, 0.17, 0.7, TYRE, 0.4, 0, 0),
    box(0.17, 0.17, 0.7, TYRE, -0.4, 0, 0),
  ];
}

function deportivo() {
  const W = 0.72;
  const PAINT = '#f2c200';
  const zs = W / 2 + 0.003;
  const intake = [[-0.1, 0.1], [-0.46, 0.1], [-0.46, 0.2], [-0.2, 0.2]];
  return [
    // cuña baja y ancha (mira a +x)
    profile([[-0.66, 0.06], [0.68, 0.06], [0.7, 0.15, 0.03], [0.3, 0.22], [-0.58, 0.25, 0.02], [-0.67, 0.22, 0.02]], W, PAINT, 0, 1, 0.028),
    // cabina de vidrio, más angosta
    profile([[0.34, 0.205], [0.02, 0.335, 0.05], [-0.3, 0.325, 0.04], [-0.55, 0.235]], 0.5, DARK_GLASS, 0, 0, 0.035),
    // tomas de aire laterales, faros y luz trasera
    join(
      side(intake, zs, '#1c1f26'), side(intake, -zs, '#1c1f26'),
      slant([0.7, 0.15], [0.3, 0.22], 0.08, 0.26, 0.09, '#ffffff', { zc: 0.2 }),
      slant([0.7, 0.15], [0.3, 0.22], 0.08, 0.26, 0.09, '#ffffff', { zc: -0.2 }),
      decal(0.5, 0.04, '#d6322b', '-x', -0.672, 0.17, 0)
    ),
    // alerón
    join(rb(0.13, 0.035, 0.7, '#1c1f26', -0.6, 0.31, 0, { r: 0.012 }), box(0.04, 0.07, 0.04, '#1c1f26', -0.6, 0.245, 0.22), box(0.04, 0.07, 0.04, '#1c1f26', -0.6, 0.245, -0.22)),
    // ruedas debajo de la carrocería: el capó baja hacia adelante, así que las de adelante son
    // más chicas y van un poco más atrás, donde la cuña ya es más alta que la rueda
    wheel(0.1, 0.12, TYRE, 0.36, W / 2 - 0.045),
    wheel(0.115, 0.13, TYRE, -0.42, W / 2 - 0.045),
    wheel(0.1, 0.12, TYRE, 0.36, -W / 2 + 0.045, { side: -1 }),
    wheel(0.115, 0.13, TYRE, -0.42, -W / 2 + 0.045, { side: -1 }),
  ];
}
function deportivoLod() {
  return [
    box(1.36, 0.17, 0.72, '#f2c200', 0, 0.06, 0, 1),
    box(0.62, 0.1, 0.5, DARK_GLASS, -0.1, 0.23, 0),
    box(0.1, 0.07, 0.74, TYRE, 0.36, 0, 0),
    box(0.115, 0.08, 0.74, TYRE, -0.42, 0, 0),
  ];
}

function moto() {
  const RED = '#d6322b';
  return [
    wheel(0.14, 0.075, TYRE, 0.29, 0, { both: true, seg: 9 }),
    wheel(0.14, 0.075, TYRE, -0.29, 0, { both: true, seg: 9 }),
    rb(0.25, 0.13, 0.11, '#4a4f58', 0.0, 0.1, 0, { r: 0.03 }), // motor
    // tanque y colín
    profile([[-0.08, 0.23], [0.15, 0.23], [0.21, 0.33], [0.1, 0.41, 0.04], [-0.07, 0.375]], 0.17, RED, 0, 1, 0.03),
    profile([[-0.39, 0.32], [-0.14, 0.23], [-0.1, 0.33], [-0.33, 0.355]], 0.12, RED, 0, 1, 0.025),
    rb(0.3, 0.055, 0.15, '#22252c', -0.17, 0.335, 0, { r: 0.025 }), // asiento
    tilted(0.2, 0.05, 0.05, '#b9bec6', { x: -0.17, y: 0.15, z: 0.085, rz: 0.22 }), // escape
    tilted(0.045, 0.32, 0.075, '#8a8f99', { x: 0.255, y: 0.28, z: 0, rz: 0.24 }), // horquilla
    rb(0.05, 0.05, 0.4, '#22252c', 0.22, 0.42, 0, { r: 0.018 }), // manubrio
    box(0.06, 0.08, 0.1, LAMP, 0.275, 0.33, 0), // faro
  ];
}
function motoLod() {
  return [box(0.86, 0.14, 0.08, TYRE, 0, 0.02, 0), box(0.55, 0.22, 0.16, '#d6322b', -0.05, 0.16, 0, 1), box(0.05, 0.05, 0.4, '#22252c', 0.22, 0.42, 0)];
}

// La torre es pálida, casi blanca: lo que se compra es el penthouse, el último piso entero (en el
// color del modelo) con su azotea encima. Así se ve el edificio pero se lee que la cosa es arriba.
function torre() {
  const T = 0.82, H = 2.15, y0 = 0.05;
  const e = T / 2 + 0.002, w = T - 0.12;
  const bands = [];
  for (let i = 0; i < 6; i++) {
    const y = 0.5 + i * 0.29;
    bands.push(decal(w, 0.15, '#c9d3dd', 'z', 0, y, e), decal(w, 0.15, '#c9d3dd', 'x', e, y, 0), decal(w, 0.15, '#c9d3dd', '-z', 0, y, -e), decal(w, 0.15, '#c9d3dd', '-x', -e, y, 0));
  }
  return [
    pale(rb(1.1, y0, 1.1, '#d9d4c7', 0, 0, 0, { r: 0.02 })),
    pale(rb(T, H, T, '#f4f6f8', 0, y0, 0, { r: 0.05 })),
    pale(join(bands)),
    pale(join(decal(0.28, 0.26, '#b9b2a6', 'z', 0, y0 + 0.13, e), rb(0.44, 0.045, 0.18, '#ffffff', 0, 0.33, e + 0.07, { r: 0.016 }))),
    ...penthouse(y0 + H, T),
  ];
}
/** El penthouse: un piso entero en color, con ventanales, y arriba la azotea con un salón vidriado y la piscina. */
function penthouse(y, T) {
  const FH = 0.4; // alto del piso: más que los de abajo, para que se lea como un piso y no como un techo
  const e = (T + 0.02) / 2 + 0.003, w = T - 0.1; // ventanales sobre la cara del piso (que es algo más ancho que la torre)
  const glass = '#4b3657';
  return [
    rb(T + 0.02, FH, T + 0.02, '#8a6c9c', 0, y, 0, { r: 0.04, paint: 1 }),
    join(decal(w, 0.22, glass, 'z', 0, y + 0.2, e), decal(w, 0.22, glass, 'x', e, y + 0.2, 0), decal(w, 0.22, glass, '-z', 0, y + 0.2, -e), decal(w, 0.22, glass, '-x', -e, y + 0.2, 0)),
    // losa de la azotea, salón vidriado retirado y piscina
    rb(T + 0.1, 0.05, T + 0.1, '#d7c6e0', 0, y + FH, 0, { r: 0.022, under: true }),
    rb(0.4, 0.24, 0.4, '#7a5c8c', -0.16, y + FH + 0.05, -0.16, { r: 0.03 }),
    join(decal(0.32, 0.14, glass, 'z', -0.16, y + FH + 0.17, 0.04 + 0.002), decal(0.32, 0.14, glass, 'x', 0.04 + 0.002, y + FH + 0.17, -0.16)),
    rb(0.46, 0.04, 0.46, '#b9a2c8', -0.16, y + FH + 0.29, -0.16, { r: 0.018, under: true }),
    decal(0.24, 0.3, '#8fb8d8', 'y', 0.22, y + FH + 0.053, 0.16),
  ];
}
function torreLod() {
  return [pale(box(0.82, 2.2, 0.82, '#f4f6f8', 0, 0, 0)), box(0.84, 0.4, 0.84, '#8a6c9c', 0, 2.2, 0, 1), box(0.4, 0.34, 0.4, '#7a5c8c', -0.16, 2.6, -0.16)];
}

function hospital() {
  const MX = -0.3, MZ = -0.15; // bloque alto
  const mf = MZ + 0.55 + 0.002, mr = MX + 0.75 + 0.002, ml = MX - 0.75 - 0.002, mb = MZ - 0.55 - 0.002;
  const wf = 0.7 + 0.002, wr = 1.2 + 0.002, wb = -0.7 - 0.002;
  const g = [];
  const band = (w, face, x, y, z) => g.push(decal(w, 0.16, GLASS, face, x, y, z));
  // bloque alto: cuatro pisos de ventanas corridas; arriba, el cartel parte las del frente
  for (let f = 0; f < 4; f++) {
    const y = 0.3 + f * 0.33;
    if (f < 2) band(1.36, 'z', MX, y, mf);
    else {
      band(0.36, 'z', MX - 0.5, y, mf);
      band(0.36, 'z', MX + 0.5, y, mf);
    }
    if (f >= 2) band(0.94, 'x', mr, y, MZ);
    band(0.94, '-x', ml, y, MZ);
    band(1.36, '-z', MX, y, mb);
  }
  // ala baja
  for (const y of [0.27, 0.56]) {
    band(1.24, 'x', wr, y, 0);
    band(0.86, '-z', 0.7, y, wb);
  }
  band(0.84, 'z', 0.7, 0.58, wf);
  g.push(decal(0.44, 0.33, GLASS, 'z', 0.7, 0.215, wf)); // puerta de emergencias
  return [
    rb(2.5, 0.05, 1.9, '#d9d4c7', 0.1, 0, 0.1, { r: 0.025 }),
    rb(1.5, 1.5, 1.1, '#ffffff', MX, 0.05, MZ, { r: 0.05, paint: 2 }),
    rb(1.0, 0.7, 1.4, '#f1f3f6', 0.7, 0.05, 0.0, { r: 0.045, paint: 2 }),
    rb(1.53, 0.11, 1.13, HEALTH_GREEN, MX, 1.43, MZ, { r: 0.035, under: true }), // franja verde en el remate
    rb(1.58, 0.07, 1.18, '#9aa3ad', MX, 1.54, MZ, { r: 0.025, under: true }),
    rb(1.06, 0.07, 1.46, '#9aa3ad', 0.7, 0.75, 0.0, { r: 0.025, under: true }),
    // helipuerto con H
    finish(wheelGeo(0.36, 0.035, 14, 0.012, false, false), '#3f4650', { rx: -Math.PI / 2, x: MX, y: 1.61 + 0.0175, z: MZ }),
    finish(orient(polyGeo([[-0.12, -0.15], [-0.06, -0.15], [-0.06, -0.03], [0.06, -0.03], [0.06, -0.15], [0.12, -0.15], [0.12, 0.15], [0.06, 0.15], [0.06, 0.03], [-0.06, 0.03], [-0.06, 0.15], [-0.12, 0.15]]), 'y'), '#ffffff', { x: MX, y: 1.648, z: MZ }),
    join(g),
    // cartel con la cruz verde en la fachada
    rb(0.52, 0.52, 0.04, '#ffffff', MX, 0.74, mf + 0.018, { r: 0.018 }),
    cross(0.38, 0.11, 'z', MX, 1.0, mf + 0.042), // centrada en el cartel (0,74–1,26)
    // entrada de emergencias
    // alero más ancho y más profundo que los dos pilares, para que los cubra con aire
    rb(0.8, 0.06, 0.44, '#e8ebee', 0.7, 0.42, 0.92, { r: 0.022, under: true }),
    join(box(0.05, 0.37, 0.05, '#c9ced6', 0.98, 0.05, 1.0), box(0.05, 0.37, 0.05, '#c9ced6', 0.42, 0.05, 1.0)),
  ];
}

// Cama de terapia intensiva: cama articulada con colchón y frazada, monitor en su pie y respirador
// en un carrito, del lado de la cabecera.
function camaUti() {
  const FRAME = '#9aa3ad', DARK = '#2f343c';
  return [
    rb(1.0, 0.07, 0.5, FRAME, 0, 0.13, 0, { r: 0.02, under: true }), // bastidor
    join(
      box(0.04, 0.13, 0.04, DARK, 0.44, 0, 0.2), box(0.04, 0.13, 0.04, DARK, -0.44, 0, 0.2),
      box(0.04, 0.13, 0.04, DARK, 0.44, 0, -0.2), box(0.04, 0.13, 0.04, DARK, -0.44, 0, -0.2)
    ),
    rb(0.96, 0.1, 0.46, '#ffffff', 0, 0.2, 0, { r: 0.04, paint: 1 }), // colchón
    rb(0.5, 0.035, 0.48, '#7aa7d8', 0.17, 0.295, 0, { r: 0.015, paint: 2 }), // frazada
    rb(0.2, 0.06, 0.34, '#f4f6f8', -0.34, 0.3, 0, { r: 0.025 }), // almohada
    rb(0.05, 0.34, 0.5, '#cfd6de', -0.505, 0.13, 0, { r: 0.02 }), // cabecera
    rb(0.05, 0.22, 0.5, '#cfd6de', 0.505, 0.13, 0, { r: 0.02 }), // pie
    join(rb(0.46, 0.05, 0.03, '#cfd6de', 0.0, 0.34, 0.255, { r: 0.012 }), rb(0.46, 0.05, 0.03, '#cfd6de', 0.0, 0.34, -0.255, { r: 0.012 })), // barandas
    // monitor en su pie, atrás de la cabecera
    join(rb(0.05, 0.62, 0.05, FRAME, -0.43, 0, -0.38, { r: 0.015 }), rb(0.18, 0.03, 0.18, DARK, -0.43, 0, -0.38, { r: 0.01 })),
    join(rb(0.06, 0.2, 0.28, DARK, -0.43, 0.6, -0.38, { r: 0.02 }), decal(0.22, 0.14, '#9fe0c4', 'x', -0.398, 0.7, -0.38)),
    // respirador en su carrito, adelante de la cabecera
    rb(0.2, 0.32, 0.2, '#e9edf2', -0.42, 0.04, 0.4, { r: 0.03 }),
    join(box(0.2, 0.04, 0.2, DARK, -0.42, 0, 0.4), tilted(0.04, 0.14, 0.18, DARK, { x: -0.38, y: 0.43, z: 0.4, rz: -0.35 }), decal(0.12, 0.08, '#9fe0c4', 'x', -0.316, 0.26, 0.4)),
  ];
}
function camaUtiLod() {
  return [box(1.0, 0.3, 0.5, '#ffffff', 0, 0, 0, 1), box(0.5, 0.04, 0.5, '#7aa7d8', 0.17, 0.3, 0, 2), box(0.06, 0.8, 0.28, '#2f343c', -0.43, 0, -0.38)];
}

// Acelerador lineal para radioterapia: el soporte con el brazo que gira sobre el paciente, el
// cabezal oscuro y la camilla.
function acelerador() {
  const SHELL = '#f1f3f6', DARK = '#3b3f48';
  return [
    rb(1.04, 0.04, 0.9, '#d9d4c7', 0.02, 0, 0, { r: 0.02 }), // piso
    rb(0.34, 0.74, 0.62, SHELL, -0.34, 0.04, 0, { r: 0.05, paint: 2 }), // soporte
    wheel(0.26, 0.05, '#cfd6de', -0.145, 0, { y: 0.44, ry: Math.PI / 2, seg: 16, hub: '#b9c0c8' }), // disco del gantry
    rb(0.52, 0.17, 0.42, SHELL, -0.06, 0.66, 0, { r: 0.05, paint: 2 }), // brazo sobre la camilla
    join(rb(0.26, 0.13, 0.32, DARK, 0.06, 0.53, 0, { r: 0.03 }), decal(0.16, 0.16, '#6f7680', 'y', 0.06, 0.528, 0)), // cabezal
    decal(0.4, 0.06, '#5f86b3', 'x', -0.168, 0.25, 0, 1), // franja de color en el soporte
    join(rb(0.16, 0.2, 0.16, '#9aa3ad', 0.34, 0.04, 0, { r: 0.03 }), rb(0.3, 0.04, 0.3, '#9aa3ad', 0.34, 0.04, 0, { r: 0.015 })), // pie de la camilla
    rb(0.74, 0.05, 0.26, '#ffffff', 0.26, 0.24, 0, { r: 0.022, paint: 1 }), // camilla
  ];
}
function aceleradorLod() {
  return [box(0.34, 0.78, 0.62, '#f1f3f6', -0.34, 0, 0, 2), box(0.52, 0.17, 0.42, '#f1f3f6', -0.06, 0.66, 0, 2), box(0.74, 0.29, 0.26, '#ffffff', 0.26, 0, 0, 1)];
}


// Bus eléctrico de 12 metros: carrocería larga y baja, banda de ventanas, dos puertas del lado de
// la vereda, las baterías en el techo y el cartel de destino adelante (mira a +x).
function bus() {
  const L = 1.3, W = 0.34, y0 = 0.07, H = 0.36;
  const e = W / 2 + 0.002, fx = L / 2 + 0.002;
  const BAND = '#3f9e5a';
  return [
    rb(L, H, W, '#f4f6f8', 0, y0, 0, { r: 0.05, paint: 1 }), // carrocería
    join(decal(L - 0.06, 0.045, BAND, 'z', 0, y0 + 0.06, e, 2), decal(L - 0.06, 0.045, BAND, '-z', 0, y0 + 0.06, -e, 2), decal(W - 0.06, 0.045, BAND, 'x', fx, y0 + 0.06, 0, 2)), // franja
    join(decal(1.02, 0.14, DARK_GLASS, 'z', -0.1, y0 + 0.24, e), decal(1.02, 0.14, DARK_GLASS, '-z', -0.1, y0 + 0.24, -e)), // ventanas
    join(decal(W - 0.06, 0.2, DARK_GLASS, 'x', fx, y0 + 0.21, 0), decal(0.2, 0.035, '#ffb347', 'x', fx + 0.001, y0 + 0.335, 0)), // parabrisas y cartel
    join(decal(0.11, 0.25, '#2b3442', 'z', 0.5, y0 + 0.145, e + 0.001), decal(0.11, 0.25, '#2b3442', 'z', 0.02, y0 + 0.145, e + 0.001)), // puertas
    join(decal(0.05, 0.03, LAMP, 'x', fx + 0.001, y0 + 0.04, 0.12), decal(0.05, 0.03, LAMP, 'x', fx + 0.001, y0 + 0.04, -0.12)), // faros
    rb(0.62, 0.06, 0.24, '#cfd6de', -0.12, y0 + H, 0, { r: 0.02 }), // baterías en el techo
    wheel(0.075, 0.07, TYRE, 0.42, W / 2 - 0.025),
    wheel(0.075, 0.07, TYRE, -0.36, W / 2 - 0.025),
    wheel(0.075, 0.07, TYRE, 0.42, -W / 2 + 0.025, { side: -1 }),
    wheel(0.075, 0.07, TYRE, -0.36, -W / 2 + 0.025, { side: -1 }),
  ];
}
function busLod() {
  return [box(1.3, 0.36, 0.34, '#f4f6f8', 0, 0.07, 0, 1), box(1.02, 0.14, 0.35, '#2b3442', -0.1, 0.24, 0), box(0.62, 0.06, 0.24, '#cfd6de', -0.12, 0.43, 0)];
}

function hospitalLod() {
  return [box(1.5, 1.49, 1.1, '#ffffff', -0.3, 0.05, -0.15, 2), box(1.0, 0.77, 1.4, '#f1f3f6', 0.7, 0.05, 0.0, 2), box(1.58, 0.07, 1.18, '#c7ccd2', -0.3, 1.54, -0.15)];
}

function generico() {
  return [box(0.8, 0.8, 0.8, '#c9a46b', 0, 0, 0, 1), box(0.82, 0.08, 0.2, '#8a6a3a', 0, 0.4, 0)];
}
function genericoLod() {
  return [box(0.8, 0.8, 0.8, '#c9a46b', 0, 0, 0, 1)];
}

/**
 * Catálogo.
 * - paintA / paintB: paletas por figura (cada unidad toma un color de cada una).
 * - hood: los colores varían por zonas (barrios) en vez de al azar.
 * - fit: lado de la celda del calendario que ocupa la huella del modelo (1 = la celda entera).
 * - jitter: giro al azar, en radianes (las motos no quedan todas alineadas).
 */
const CATALOG = {
  casa: {
    build: casa, lod: casaLod, fit: 0.8,
    paintA: ['#e08a3c', '#d9583b', '#c4462f', '#a8432f', '#b9683f', '#8e5643', '#7d4b3a', '#6f7c8a'],
    paintB: ['#f8efc0', '#f2dcae', '#fbe1bf', '#f4d8cf', '#f7efe0', '#ffffff', '#ece2ef', '#e3edf0'],
    hood: true,
  },
  aula: {
    build: aula, lod: aulaLod, fit: 0.86,
    paintA: ['#e0573a', '#2f6fde', '#e8a21a', '#8a4fb0', '#d23b5f'],
    paintB: ['#fbe7b0', '#f6f0e2', '#fde0c2', '#e9eef2'],
  },
  usf: {
    build: usf, lod: usfLod, fit: 0.82,
    paintA: ['#ffffff'],
    paintB: ['#ffffff', '#f4f6f1', '#eef2f5', '#fbf6ec'],
  },
  ambulancia: {
    build: ambulancia, lod: ambulanciaLod, fit: 0.84,
    paintA: ['#f26a1b', '#e33b2a', '#2f6fde', '#f2b21b'],
    paintB: ['#ffffff'],
  },
  camioneta: {
    build: camioneta, lod: camionetaLod, fit: 0.86,
    paintA: ['#c8ccd2', '#f4f4f2', '#2b2f36', '#7b2a2a', '#5a6b7c', '#a9a49a', '#e6e7e8'],
    paintB: ['#ffffff'],
  },
  todoterreno: {
    build: todoterreno, lod: todoterrenoLod, fit: 0.86,
    paintA: ['#1b1d22', '#15171b', '#24262c', '#1b1d22', '#2e3138', '#1b1d22', '#3a2f2f'],
    paintB: ['#ffffff'],
  },
  deportivo: {
    build: deportivo, lod: deportivoLod, fit: 0.86,
    paintA: ['#f2c200', '#ff6a13', '#e02f2f', '#f5f5f5', '#2a2d34', '#3a6fd8', '#f2c200'],
    paintB: ['#ffffff'],
  },
  moto: {
    build: moto, lod: motoLod, fit: 0.8, jitter: 0.5,
    paintA: ['#d6322b', '#1f4fa8', '#1d1f24', '#f2f2f2', '#f08a1c', '#d6322b', '#7a7f88'],
    paintB: ['#ffffff'],
  },
  torre: {
    build: torre, lod: torreLod, fit: 0.78,
    // el piso del penthouse varía un poco de tono entre unidades; la torre queda pálida
    paintA: ['#8a6c9c', '#7d6090', '#9677a8', '#856a99'],
    paintB: ['#ffffff'],
  },
  hospital: {
    // Un hospital por mes: el resto del mes queda vacío, así que el edificio puede ser más
    // grande que su día y asomarse a las celdas vecinas.
    build: hospital, lod: hospitalLod, fit: 2.2,
    paintA: ['#ffffff'],
    paintB: ['#ffffff', '#f3f5f7', '#f7f3ec'],
  },
  cama_uti: {
    build: camaUti, lod: camaUtiLod, fit: 0.86,
    paintA: ['#ffffff', '#f4f6f8', '#eef2f5'],
    paintB: ['#7aa7d8', '#6a97c8', '#8ab7e0'],
  },
  acelerador: {
    build: acelerador, lod: aceleradorLod, fit: 0.84,
    paintA: ['#ffffff', '#f6f6f6'],
    paintB: ['#f1f3f6', '#eef1f4', '#f6f7f9'],
  },
  bus: {
    build: bus, lod: busLod, fit: 0.9,
    paintA: ['#f4f6f8', '#eef2f5', '#f8f8f6'],
    paintB: ['#3f9e5a', '#358a4e', '#4aa864'],
  },
  generico: {
    build: generico, lod: genericoLod, fit: 0.8,
    paintA: ['#c9a46b', '#b88f58', '#d8b67f'], paintB: ['#ffffff'],
  },
};


// ——— Tratamiento monocromo ———
// Cada modelo se ve en tonos de un solo color, como piezas de juguete mate. Cada parte conserva
// qué tan clara u oscura era (techo, ventanas, ruedas se siguen leyendo), pero toma el tono del
// color del modelo. Las paletas de cada figura (paintA/B) pasan por lo mismo: varían en claridad,
// no en color. Un color base oscuro (el Brabus) usa tonos oscuros; uno casi blanco (el hospital),
// tonos muy claros.
const MONO = {
  casa: '#e8786a', // coral
  aula: '#8d9fd8', // azul lavanda
  usf: '#98d3c3', // menta
  hospital: '#efe4cf', // crema: se distingue de la unidad de salud
  ambulancia: '#f29a5c', // naranja suave
  camioneta: '#a9b4c2', // gris plata
  deportivo: '#eec24a', // amarillo mostaza
  todoterreno: '#2c2d32', // negro grafito
  moto: '#cf4a44', // rojo
  torre: '#b48ec6', // lila
  cama_uti: '#e59bb0', // rosa
  acelerador: '#4f9aa5', // verde azulado oscuro
  bus: '#a6c86b', // verde lima
  generico: '#c9a46b',
};

const _mono = new THREE.Color();
const _hsl = { h: 0, s: 0, l: 0 };

/** Función que lleva un color (lineal) a un tono del color base. */
function monoTone(base) {
  _mono.set(base);
  _mono.getHSL(_hsl, THREE.SRGBColorSpace);
  const { h, s, l: bl } = _hsl;
  const dark = bl < 0.3, light = bl > 0.82;
  const lo = dark ? 0.12 : light ? 0.66 : 0.5;
  const span = dark ? 0.3 : light ? 0.27 : 0.34;
  return (r, g, b, out) => {
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b; // luminancia
    const l = Math.pow(y, 1 / 2.2); // claridad percibida, 0..1
    out.setHSL(h, s * (0.7 + 0.2 * (1 - l)), lo + span * l, THREE.SRGBColorSpace);
    return out;
  };
}

function monoGeometry(geo, tone) {
  const col = geo.attributes.color;
  // las partes marcadas `pale` quedan casi blancas, con apenas el color del modelo: dejan que se
  // destaque otra parte (el penthouse arriba del edificio)
  const pale = geo.userData.pale;
  for (let i = 0; i < col.count; i++) {
    tone(col.getX(i), col.getY(i), col.getZ(i), _mono);
    if (pale) {
      _mono.getHSL(_hsl, THREE.SRGBColorSpace);
      _mono.setHSL(_hsl.h, _hsl.s * 0.45, 0.87 + (_hsl.l - 0.5) * 0.18, THREE.SRGBColorSpace);
    }
    col.setXYZ(i, _mono.r, _mono.g, _mono.b);
  }
  col.needsUpdate = true;
  return geo;
}
function pale(g) {
  g.userData.pale = true;
  return g;
}

function monoHex(hex, tone) {
  const c = new THREE.Color(hex);
  return '#' + tone(c.r, c.g, c.b, c).getHexString();
}

function toneFor(key) {
  return monoTone(MONO[key] || MONO.generico);
}

function hashA(n) {
  const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Datos para armar la figura pieza por pieza (como en la portada): cada vértice sabe el centro de
 * su pieza (aPivot) y aAnim = (orden 0..1 de abajo hacia arriba, dirección x, dirección z, giro).
 */
function addAssembly(parts) {
  const bb = new THREE.Box3();
  for (const g of parts) {
    g.computeBoundingBox();
    bb.union(g.boundingBox);
  }
  const ox = (bb.min.x + bb.max.x) / 2, oz = (bb.min.z + bb.max.z) / 2;
  const info = parts.map((g, i) => {
    const b = g.boundingBox;
    return { g, i, key: b.min.y + (b.min.y + b.max.y) * 0.25, c: b.getCenter(new THREE.Vector3()) };
  });
  const order = [...info].sort((a, b) => a.key - b.key);
  const n = order.length;
  order.forEach((p, rank) => {
    const r1 = hashA(p.i * 3 + 1), r2 = hashA(p.i * 3 + 2), r3 = hashA(p.i * 3 + 3);
    let dx = p.c.x - ox, dz = p.c.z - oz;
    const len = Math.hypot(dx, dz);
    if (len < 0.04) {
      const a = r1 * Math.PI * 2;
      dx = Math.cos(a);
      dz = Math.sin(a);
    }
    const a = Math.atan2(dz, dx) + (r2 - 0.5) * 0.9;
    const d = n > 1 ? (rank / (n - 1)) * 0.88 + r3 * 0.12 : 0;
    const cnt = p.g.attributes.position.count;
    const piv = new Float32Array(cnt * 3);
    const anim = new Float32Array(cnt * 4);
    for (let k = 0; k < cnt; k++) {
      piv[k * 3] = p.c.x; piv[k * 3 + 1] = p.c.y; piv[k * 3 + 2] = p.c.z;
      anim[k * 4] = d; anim[k * 4 + 1] = Math.cos(a); anim[k * 4 + 2] = Math.sin(a); anim[k * 4 + 3] = (r1 - 0.5) * 1.6;
    }
    p.g.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3));
    p.g.setAttribute('aAnim', new THREE.BufferAttribute(anim, 4));
  });
  return parts;
}

/**
 * Color con que se pintan los días comprados cuando las figuras son demasiado chicas para
 * dibujarse (de lejos): el color del modelo. Si es casi blanco (el hospital), se oscurece un poco
 * para que se vea sobre el papel.
 */
export function modelColor(key) {
  const c = new THREE.Color(MONO[key] || MONO.generico);
  c.getHSL(_hsl, THREE.SRGBColorSpace);
  if (_hsl.l > 0.74) c.setHSL(_hsl.h, Math.min(1, _hsl.s * 1.25), 0.72, THREE.SRGBColorSpace);
  return c;
}

/**
 * Las partes sueltas del modelo detallado, sin fusionar (cada una con posición, normal, color y
 * `paint`). Las usa la portada para armar y desarmar la figura pieza por pieza.
 */
export function buildParts(key) {
  const def = CATALOG[key] || CATALOG.generico;
  const tone = toneFor(CATALOG[key] ? key : 'generico');
  return def.build().map((g) => monoGeometry(g, tone));
}

function merge(parts) {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

/**
 * Devuelve { geometry, lodGeometry, height, size, center, fit, jitter, paintA, paintB, hood }.
 * Punto de reemplazo: un glTF podría devolverse acá con la misma forma.
 */
export function loadModel(key) {
  const def = CATALOG[key] || CATALOG.generico;
  const tone = toneFor(CATALOG[key] ? key : 'generico');
  const geometry = merge(addAssembly(def.build()).map((g) => monoGeometry(g, tone)));
  const lodGeometry = merge(def.lod().map((g) => monoGeometry(g, tone)));
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const size = new THREE.Vector3();
  bb.getSize(size);
  const center = new THREE.Vector3();
  bb.getCenter(center);
  return {
    geometry,
    lodGeometry,
    height: size.y,
    size,
    center,
    fit: def.fit || 0.8,
    jitter: def.jitter || 0,
    paintA: def.paintA.map((c) => monoHex(c, tone)),
    paintB: def.paintB.map((c) => monoHex(c, tone)),
    hood: !!def.hood,
  };
}
