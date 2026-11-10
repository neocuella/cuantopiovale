// Modelos de juguete, armados en código con cajas, prismas y cilindros de colores planos.
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

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const GROUND_COLOR = '#f6f5f1'; // papel del calendario

const _c = new THREE.Color();

const GLASS = '#8fc8e6';
const DARK_GLASS = '#2b3442';
const TYRE = '#23262d';
const HEALTH_GREEN = '#1f8f5f';

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

/** Caja apoyada en y0. */
function box(w, h, d, color, x = 0, y0 = 0, z = 0, paint = 0) {
  return finish(new THREE.BoxGeometry(w, h, d), color, { x, y: y0 + h / 2, z, paint });
}

/** Caja centrada en (x, y, z) y girada (para techos inclinados, puertas abiertas...). */
function tilted(w, h, d, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, paint = 0 }) {
  return finish(new THREE.BoxGeometry(w, h, d), color, { x, y, z, rx, ry, rz, paint });
}

/** Rueda: cilindro con el eje en z. */
function wheel(r, width, color, x, z, seg = 8) {
  return finish(new THREE.CylinderGeometry(r, r, width, seg), color, { rx: Math.PI / 2, x, y: r, z });
}

/** Cilindro vertical apoyado en y0. */
function post(r, h, color, x, y0, z, seg = 6, paint = 0) {
  return finish(new THREE.CylinderGeometry(r, r, h, seg), color, { x, y: y0 + h / 2, z, paint });
}

/** Perfil lateral (puntos en x,y) extruido a lo ancho en z, centrado. */
function profile(points, width, color, z = 0, paint = 0) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 });
  return finish(geo, color, { z: z - width / 2, paint });
}

/** Perfil en el plano z,y extruido a lo largo de x, centrado en x0. */
function profileZ(points, length, color, y0 = 0, x0 = 0, paint = 0) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(-z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -length / 2);
  return finish(geo, color, { ry: Math.PI / 2, y: y0, x: x0, paint });
}

/** Techo a dos aguas con alero: dos faldones inclinados y una cumbrera. */
function gableRoof(len, halfSpan, rise, y0, color, paint, thick = 0.05) {
  const L = Math.hypot(halfSpan, rise);
  const a = Math.atan2(rise, halfSpan);
  const yc = y0 + rise / 2 + thick / 2;
  return [
    tilted(len, thick, L, color, { y: yc, z: halfSpan / 2, rx: a, paint }),
    tilted(len, thick, L, color, { y: yc, z: -halfSpan / 2, rx: -a, paint }),
  ];
}

/** Cruz plana (verde de salud) en un plano: 'z' = mira a +z, 'x' = mira a +x, 'y' = en el techo. */
function cross(size, bar, plane, x, y, z, color = HEALTH_GREEN, t = 0.02) {
  if (plane === 'z') return [box(bar, size, t, color, x, y - size / 2, z), box(size, bar, t, color, x, y - bar / 2, z)];
  if (plane === 'x') return [box(t, size, bar, color, x, y - size / 2, z), box(t, bar, size, color, x, y - bar / 2, z)];
  return [box(bar, t, size, color, x, y, z), box(size, t, bar, color, x, y, z)];
}

// ——— Modelos ———

function casa() {
  const H = 0.56;
  return [
    box(1.04, 0.05, 0.84, '#cfc6b4'), // vereda / zócalo
    box(1.0, H, 0.78, '#f6ead2', 0, 0.05, 0, 2),
    profileZ([[-0.39, 0], [0.39, 0], [0, 0.32]], 1.0, '#f6ead2', H + 0.05, 0, 2),
    ...gableRoof(1.16, 0.5, 0.38, H + 0.01, '#d9583b', 1),
    box(1.18, 0.05, 0.07, '#7c4a35', 0, H + 0.39, 0),
    // frente: puerta, ventana con postigo, alero chico sobre la puerta
    box(0.2, 0.36, 0.03, '#7a4128', 0.22, 0.05, 0.395),
    box(0.3, 0.03, 0.12, '#7c4a35', 0.22, 0.44, 0.44),
    box(0.24, 0.2, 0.03, GLASS, -0.2, 0.24, 0.395),
    box(0.3, 0.03, 0.05, '#ffffff', -0.2, 0.22, 0.41),
    // costado y fondo
    box(0.03, 0.2, 0.22, GLASS, 0.505, 0.24, 0),
    box(0.22, 0.2, 0.03, GLASS, 0.2, 0.24, -0.395),
    box(0.11, 0.26, 0.11, '#9a5b45', -0.28, H + 0.32, -0.16),
  ];
}
function casaLod() {
  return [
    box(1.0, 0.61, 0.78, '#f6ead2', 0, 0, 0, 2),
    profileZ([[-0.5, 0], [0.5, 0], [0, 0.4]], 1.16, '#d9583b', 0.58, 0, 1),
  ];
}

function aula() {
  const W = 1.6, D = 0.72, H = 0.55;
  const parts = [
    box(1.76, 0.05, 1.02, '#cfc6b4'),
    box(W, H, D, '#fbe7b0', 0, 0.05, -0.08, 2),
    box(W, 0.1, 0.02, '#e0573a', 0, 0.05, D / 2 - 0.07, 1), // zócalo de color
    // galería con techo y pilares
    box(1.78, 0.06, 1.04, '#8f949c', 0, H + 0.05, 0.02),
    post(0.025, H, '#ffffff', 0.74, 0.05, 0.46),
    post(0.025, H, '#ffffff', 0.0, 0.05, 0.46),
    post(0.025, H, '#ffffff', -0.74, 0.05, 0.46),
    box(0.2, 0.38, 0.03, '#2f5d46', 0.56, 0.05, D / 2 - 0.065), // puerta verde pizarrón
  ];
  for (let i = 0; i < 3; i++) parts.push(box(0.26, 0.22, 0.03, GLASS, -0.58 + i * 0.36, 0.25, D / 2 - 0.065));
  parts.push(box(0.03, 0.22, 0.3, GLASS, W / 2 + 0.01, 0.25, -0.08));
  // mástil con bandera
  parts.push(post(0.018, 1.2, '#7b808a', -0.82, 0.05, 0.42, 5));
  parts.push(box(0.02, 0.06, 0.32, '#d52b1e', -0.82, 1.07, 0.6));
  parts.push(box(0.02, 0.06, 0.32, '#ffffff', -0.82, 1.01, 0.6));
  parts.push(box(0.02, 0.06, 0.32, '#0038a8', -0.82, 0.95, 0.6));
  return parts;
}
function aulaLod() {
  return [box(1.6, 0.6, 0.72, '#fbe7b0', 0, 0, -0.08, 2), box(1.78, 0.06, 1.04, '#8f949c', 0, 0.6, 0.02), box(0.06, 1.2, 0.06, '#7b808a', -0.82, 0, 0.42)];
}

function usf() {
  return [
    box(1.36, 0.05, 1.16, '#d9d4c7'),
    box(1.2, 0.64, 1.0, '#ffffff', 0, 0.05, 0, 2),
    box(1.22, 0.1, 1.02, HEALTH_GREEN, 0, 0.6, 0),
    box(1.3, 0.05, 1.1, '#e8ebee', 0, 0.7, 0),
    // alero de entrada con dos pilares
    box(0.52, 0.05, 0.34, HEALTH_GREEN, 0.26, 0.44, 0.64),
    post(0.022, 0.39, '#d4d8de', 0.48, 0.05, 0.78),
    post(0.022, 0.39, '#d4d8de', 0.04, 0.05, 0.78),
    box(0.24, 0.36, 0.03, GLASS, 0.26, 0.05, 0.5),
    box(0.03, 0.22, 0.24, GLASS, 0.6, 0.24, 0.18),
    box(0.03, 0.22, 0.24, GLASS, 0.6, 0.24, -0.22),
    // cartel con cruz verde al frente y cruz grande en el techo
    box(0.42, 0.42, 0.03, '#ffffff', -0.3, 0.14, 0.5),
    ...cross(0.32, 0.1, 'z', -0.3, 0.51, 0.52),
    ...cross(0.5, 0.15, 'y', -0.05, 0.75, -0.05),
  ];
}
function usfLod() {
  return [box(1.2, 0.6, 1.0, '#ffffff', 0, 0, 0, 2), box(1.3, 0.15, 1.1, '#d3e9dd', 0, 0.6, 0)];
}

function ambulancia() {
  const W = 0.56;
  return [
    // caja trasera alta y cabina más baja adelante (mira a +x)
    profile([[-0.6, 0.12], [0.6, 0.12], [0.62, 0.32], [0.46, 0.36], [0.34, 0.56], [0.2, 0.58], [0.2, 0.7], [-0.6, 0.7]], W, '#ffffff'),
    profile([[0.36, 0.38], [0.47, 0.37], [0.34, 0.54], [0.25, 0.55], [0.25, 0.38]], W + 0.01, DARK_GLASS),
    // franja de color a lo largo
    box(1.22, 0.07, W + 0.01, '#f26a1b', -0.0, 0.27, 0, 1),
    // barral de luces
    box(0.08, 0.05, 0.42, '#e0312b', 0.12, 0.7, 0.0),
    box(0.08, 0.05, 0.14, '#2f6fde', 0.12, 0.7, 0.14),
    // cruz verde al costado y en el techo
    ...cross(0.22, 0.07, 'z', -0.22, 0.62, W / 2 + 0.006),
    ...cross(0.3, 0.09, 'y', -0.25, 0.705, 0),
    box(0.03, 0.04, 0.4, '#3a3f48', 0.615, 0.13, 0), // paragolpes
    box(0.02, 0.05, 0.08, '#fff4b0', 0.62, 0.22, 0.18),
    box(0.02, 0.05, 0.08, '#fff4b0', 0.62, 0.22, -0.18),
    wheel(0.12, 0.08, TYRE, 0.36, W / 2 - 0.03),
    wheel(0.12, 0.08, TYRE, -0.36, W / 2 - 0.03),
    wheel(0.12, 0.08, TYRE, 0.36, -W / 2 + 0.03),
    wheel(0.12, 0.08, TYRE, -0.36, -W / 2 + 0.03),
  ];
}
function ambulanciaLod() {
  return [box(1.2, 0.58, 0.56, '#ffffff', 0, 0.12, 0), box(1.22, 0.07, 0.57, '#f26a1b', 0, 0.27, 0, 1), box(0.12, 0.12, 0.5, TYRE, 0.36, 0, 0), box(0.12, 0.12, 0.5, TYRE, -0.36, 0, 0)];
}

function camioneta() {
  const W = 0.6;
  return [
    // chasis largo con capó (mira a +x)
    profile([[-0.68, 0.14], [0.66, 0.14], [0.68, 0.34], [0.6, 0.4], [-0.68, 0.4]], W, '#c8ccd2', 0, 1),
    // cabina doble
    profile([[-0.24, 0.4], [0.3, 0.4], [0.17, 0.66], [-0.24, 0.66]], W - 0.04, '#c8ccd2', 0, 1),
    profile([[-0.21, 0.43], [0.27, 0.43], [0.16, 0.63], [-0.21, 0.63]], W - 0.02, DARK_GLASS),
    box(0.025, 0.2, W - 0.02, '#c8ccd2', 0.0, 0.43, 0, 1), // parante entre puertas
    // caja abierta: piso oscuro y barandas
    box(0.42, 0.02, W - 0.06, '#33373e', -0.46, 0.4, 0),
    box(0.42, 0.12, 0.03, '#c8ccd2', -0.46, 0.4, W / 2 - 0.015, 1),
    box(0.42, 0.12, 0.03, '#c8ccd2', -0.46, 0.4, -W / 2 + 0.015, 1),
    box(0.03, 0.12, W, '#c8ccd2', -0.665, 0.4, 0, 1),
    // trompa: parrilla, faros, paragolpes
    box(0.02, 0.1, 0.34, '#2b2f36', 0.675, 0.24, 0),
    box(0.02, 0.05, 0.1, '#fff4b0', 0.672, 0.3, 0.22),
    box(0.02, 0.05, 0.1, '#fff4b0', 0.672, 0.3, -0.22),
    box(0.06, 0.05, W + 0.02, '#3a3f48', 0.67, 0.13, 0),
    wheel(0.14, 0.09, TYRE, 0.4, W / 2 - 0.02),
    wheel(0.14, 0.09, TYRE, -0.42, W / 2 - 0.02),
    wheel(0.14, 0.09, TYRE, 0.4, -W / 2 + 0.02),
    wheel(0.14, 0.09, TYRE, -0.42, -W / 2 + 0.02),
  ];
}
function camionetaLod() {
  return [
    box(1.36, 0.28, 0.6, '#c8ccd2', 0, 0.12, 0, 1),
    box(0.5, 0.26, 0.56, DARK_GLASS, 0.02, 0.4, 0),
    box(0.14, 0.14, 0.62, TYRE, 0.4, 0, 0),
    box(0.14, 0.14, 0.62, TYRE, -0.42, 0, 0),
  ];
}

function deportivo() {
  const W = 0.64;
  const hinge = { x: 0.2, y: 0.24 }; // bisagra delantera de la puerta tijera
  const doorLen = 0.38;
  const a = 1.05; // ángulo de apertura
  return [
    // cuña baja (mira a +x)
    profile([[-0.64, 0.07], [0.66, 0.07], [0.67, 0.13], [0.24, 0.24], [-0.04, 0.34], [-0.42, 0.32], [-0.62, 0.25], [-0.64, 0.16]], W, '#f2c200', 0, 1),
    profile([[0.2, 0.25], [-0.04, 0.33], [-0.32, 0.315], [-0.32, 0.25]], W - 0.12, DARK_GLASS),
    // tomas de aire laterales y alerón
    box(0.2, 0.06, W + 0.01, '#1c1f26', -0.34, 0.12, 0),
    box(0.16, 0.025, W + 0.04, '#1c1f26', -0.58, 0.33, 0),
    box(0.03, 0.06, 0.03, '#1c1f26', -0.58, 0.27, 0.22),
    box(0.03, 0.06, 0.03, '#1c1f26', -0.58, 0.27, -0.22),
    // puerta tijera levantada del lado que mira a la cámara
    tilted(doorLen, 0.14, 0.02, '#f2c200', {
      x: hinge.x - Math.cos(a) * doorLen / 2,
      y: hinge.y + Math.sin(a) * doorLen / 2,
      z: W / 2 + 0.03,
      rz: -a,
      paint: 1,
    }),
    box(0.02, 0.03, 0.18, '#ffffff', 0.665, 0.1, 0.2),
    box(0.02, 0.03, 0.18, '#ffffff', 0.665, 0.1, -0.2),
    box(0.02, 0.03, 0.2, '#d6322b', -0.645, 0.2, 0.0),
    wheel(0.12, 0.1, TYRE, 0.38, W / 2 - 0.04),
    wheel(0.12, 0.1, TYRE, -0.4, W / 2 - 0.04),
    wheel(0.12, 0.1, TYRE, 0.38, -W / 2 + 0.04),
    wheel(0.12, 0.1, TYRE, -0.4, -W / 2 + 0.04),
  ];
}
function deportivoLod() {
  return [box(1.3, 0.17, 0.64, '#f2c200', 0, 0.07, 0, 1), box(0.5, 0.1, 0.52, DARK_GLASS, -0.06, 0.24, 0), box(0.12, 0.08, 0.66, TYRE, 0.38, 0, 0), box(0.12, 0.08, 0.66, TYRE, -0.4, 0, 0)];
}

function moto() {
  return [
    wheel(0.13, 0.06, TYRE, 0.27, 0),
    wheel(0.13, 0.06, TYRE, -0.27, 0),
    // tanque y carenado
    profile([[-0.16, 0.2], [0.16, 0.2], [0.24, 0.32], [0.12, 0.4], [-0.06, 0.38]], 0.15, '#d6322b', 0, 1),
    profile([[-0.34, 0.26], [-0.14, 0.2], [-0.12, 0.3], [-0.3, 0.32]], 0.1, '#d6322b', 0, 1),
    box(0.26, 0.05, 0.13, '#22252c', -0.14, 0.34, 0), // asiento
    box(0.22, 0.09, 0.08, '#4a4f58', 0.0, 0.14, 0), // motor
    tilted(0.2, 0.025, 0.025, '#b9bec6', { x: -0.17, y: 0.15, z: 0.07, rz: 0.25 }), // escape
    tilted(0.025, 0.28, 0.025, '#8a8f99', { x: 0.25, y: 0.27, z: 0, rz: -0.35 }), // horquilla
    box(0.03, 0.03, 0.32, '#22252c', 0.3, 0.42, 0), // manubrio
    box(0.04, 0.06, 0.07, '#fff4b0', 0.33, 0.34, 0),
  ];
}
function motoLod() {
  return [box(0.7, 0.12, 0.08, TYRE, 0, 0.02, 0), box(0.5, 0.22, 0.15, '#d6322b', 0.0, 0.14, 0, 1), box(0.03, 0.03, 0.3, '#22252c', 0.3, 0.4, 0)];
}

function torre() {
  const parts = [box(1.2, 0.05, 1.2, '#d9d4c7'), box(0.92, 2.5, 0.92, '#e9edf2', 0, 0.05, 0, 2)];
  // bandas de vidrio por piso en las dos caras visibles
  for (let i = 0; i < 7; i++) {
    const y = 0.32 + i * 0.31;
    parts.push(box(0.8, 0.16, 0.02, '#5f86b3', 0, y, 0.465, 1));
    parts.push(box(0.02, 0.16, 0.8, '#5f86b3', 0.465, y, 0, 1));
    parts.push(box(0.8, 0.16, 0.02, '#5f86b3', 0, y, -0.465, 1));
    parts.push(box(0.02, 0.16, 0.8, '#5f86b3', -0.465, y, 0, 1));
  }
  parts.push(box(0.3, 0.24, 0.03, '#7a5a3a', 0, 0.05, 0.47)); // entrada
  // penthouse: losa, piso vidriado retirado, terraza con piscina y baranda
  parts.push(box(1.0, 0.05, 1.0, '#ffffff', 0, 2.55));
  parts.push(box(0.56, 0.3, 0.56, '#9fd6ee', -0.16, 2.6, -0.16));
  parts.push(box(0.64, 0.05, 0.64, '#ffffff', -0.16, 2.9, -0.16));
  parts.push(box(0.28, 0.02, 0.4, '#2fb3e0', 0.28, 2.6, 0.22));
  parts.push(box(0.02, 0.1, 1.0, '#ffffff', 0.49, 2.6, 0));
  parts.push(box(1.0, 0.1, 0.02, '#ffffff', 0, 2.6, 0.49));
  return parts;
}
function torreLod() {
  return [box(0.92, 2.55, 0.92, '#a9bdd3', 0, 0, 0, 1), box(1.0, 0.05, 1.0, '#ffffff', 0, 2.55), box(0.56, 0.35, 0.56, '#9fd6ee', -0.16, 2.6, -0.16)];
}

function hospital() {
  const parts = [
    box(2.5, 0.05, 1.9, '#d9d4c7', 0.1, 0, 0.1),
    box(1.5, 1.4, 1.1, '#ffffff', -0.3, 0.05, -0.15, 2),
    box(1.0, 0.7, 1.4, '#f1f3f6', 0.7, 0.05, 0.0, 2),
    box(1.56, 0.07, 1.16, '#9aa3ad', -0.3, 1.45, -0.15),
    box(1.06, 0.07, 1.46, '#9aa3ad', 0.7, 0.75, 0.0),
    // franja verde en el remate
    box(1.52, 0.08, 1.12, HEALTH_GREEN, -0.3, 1.36, -0.15),
    // helipuerto con H
    post(0.34, 0.03, '#3f4650', -0.3, 1.52, -0.15, 12),
    box(0.06, 0.01, 0.3, '#ffffff', -0.41, 1.55, -0.15),
    box(0.06, 0.01, 0.3, '#ffffff', -0.19, 1.55, -0.15),
    box(0.22, 0.01, 0.06, '#ffffff', -0.3, 1.55, -0.15),
    // cruz verde en la fachada
    box(0.5, 0.5, 0.03, '#ffffff', -0.3, 0.78, 0.41),
    ...cross(0.4, 0.12, 'z', -0.3, 1.23, 0.43),
    // entrada de emergencias
    box(0.6, 0.06, 0.34, '#e8ebee', 0.7, 0.42, 0.86),
    post(0.025, 0.37, '#c9ced6', 0.96, 0.05, 1.0),
    post(0.025, 0.37, '#c9ced6', 0.44, 0.05, 1.0),
    box(0.44, 0.34, 0.03, GLASS, 0.7, 0.05, 0.71),
  ];
  for (let f = 0; f < 3; f++) {
    const y = 0.2 + f * 0.36;
    if (f > 0) for (let i = 0; i < 2; i++) parts.push(box(0.26, 0.16, 0.02, GLASS, -0.72 + i * 0.84, y, 0.41));
    parts.push(box(0.02, 0.16, 0.8, GLASS, 0.46, y + (f === 0 ? 0 : 0), -0.18));
    if (f < 2) parts.push(box(0.02, 0.16, 1.1, GLASS, 1.21, 0.2 + f * 0.26, 0.0));
  }
  return parts;
}
function hospitalLod() {
  return [box(1.5, 1.45, 1.1, '#ffffff', -0.3, 0.05, -0.15, 2), box(1.0, 0.75, 1.4, '#f1f3f6', 0.7, 0.05, 0.0, 2), box(1.56, 0.08, 1.16, '#c7ccd2', -0.3, 1.45, -0.15)];
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
    paintA: ['#4c97b3', '#5f86b3', '#3f6f8f', '#6d79a6'],
    paintB: ['#f4efe6', '#efe6da', '#e9edf2', '#dfe6ee'],
    hood: true,
  },
  hospital: {
    // Un hospital por mes: el resto del mes queda vacío, así que el edificio puede ser más
    // grande que su día y asomarse a las celdas vecinas.
    build: hospital, lod: hospitalLod, fit: 2.2,
    paintA: ['#ffffff'],
    paintB: ['#ffffff', '#f3f5f7', '#f7f3ec'],
  },
  generico: {
    build: generico, lod: genericoLod, fit: 0.8,
    paintA: ['#c9a46b', '#b88f58', '#d8b67f'], paintB: ['#ffffff'],
  },
};

export function hasModel(key) {
  return key in CATALOG;
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
  const geometry = merge(def.build());
  const lodGeometry = merge(def.lod());
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
    paintA: def.paintA,
    paintB: def.paintB,
    hood: !!def.hood,
  };
}
