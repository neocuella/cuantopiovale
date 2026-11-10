// Lo que comparten la escena de la corrida, la portada y los retratos de las tarjetas: colores
// del calendario impreso, la luz y la sombra de contacto. Así las tres se ven iguales.

import * as THREE from 'three';

export const INK = '#3b3a40';
export const PAD = '#f3a15c'; // el cuadrado de color de cada día comprado
export const ACCENT = '#ff4f1f';
export const SHADOW = '#5b5548';

/** Luz de cielo + sol: la cara de arriba es la más clara, la izquierda (+z) media, la derecha (+x) la más oscura. */
export function addPaperLights(scene) {
  scene.add(new THREE.HemisphereLight('#fffdf8', '#d9d4c4', 1.6));
  const sun = new THREE.DirectionalLight('#fff3e2', 2.3);
  sun.position.set(0.4, 1, 0.8);
  scene.add(sun);
  return sun;
}

/** Rectángulo blanco difuminado (para la sombra de contacto bajo cada figura). */
export function softRectTexture() {
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
