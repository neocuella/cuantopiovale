// Retratos de las tarjetas: cada modelo parado en su día, sobre un pedacito de la
// grilla del calendario, con la misma luz y la misma cámara isométrica que la corrida. Se dibuja
// cada uno una vez y se guarda como imagen (fondo transparente).

import * as THREE from 'three';
import { loadModel } from './models.js';
import { INK, SHADOW, addPaperLights, softRectTexture } from './look.js';

const FOOT = 0.78; // huella de la figura dentro de la celda
const TALL = 1.35;
// mismo sol que la corrida: la sombra cae igual en la tarjeta y en el calendario
const SUN_DIR = new THREE.Vector3(-0.8, 1.3, 0.62).normalize();
const ASPECT = 1.25; // el recuadro de la tarjeta es 1 : 0,8

export async function renderPortraits(keys, size = 400) {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, Math.round(size / ASPECT), false);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const sun = addPaperLights(scene);
  sun.position.copy(SUN_DIR).multiplyScalar(8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -2.4, right: 2.4, top: 2.4, bottom: -2.4, near: 0.5, far: 20 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun.target);
  // plano que solo recibe la sombra proyectada, sobre el fondo transparente
  const catcherGeo = new THREE.PlaneGeometry(6, 6);
  catcherGeo.rotateX(-Math.PI / 2);
  const catcherMat = new THREE.ShadowMaterial({ color: '#2f3a52', opacity: 0.3, depthWrite: false });
  const catcher = new THREE.Mesh(catcherGeo, catcherMat);
  catcher.position.y = 0.004;
  catcher.receiveShadow = true;
  catcher.renderOrder = -3;
  scene.add(catcher);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.shadowSide = THREE.DoubleSide; // las figuras no tienen caras de abajo: sin esto, la sombra queda con un hueco

  // líneas finas de la grilla: la celda de la figura y sus vecinas
  const lines = [];
  for (const v of [-1.5, -0.5, 0.5, 1.5]) {
    lines.push(-1.5, 0.002, v, 1.5, 0.002, v, v, 0.002, -1.5, v, 0.002, 1.5);
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  const lineMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.45 });
  const grid = new THREE.LineSegments(lineGeo, lineMat);
  grid.renderOrder = -4;
  scene.add(grid);
  const shadowTex = softRectTexture();
  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, color: SHADOW, transparent: true, opacity: 0.16, depthWrite: false });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.renderOrder = -2;
  scene.add(shadow);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(20, 20, 20);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const _p = new THREE.Vector3();

  const out = {};
  for (const key of [...new Set(keys)]) {
    const model = loadModel(key);
    const s = Math.min(FOOT / Math.max(model.size.x, model.size.z), TALL / model.size.y);
    const g = model.geometry;
    g.translate(-model.center.x, -(model.center.y - model.size.y / 2), -model.center.z);
    g.scale(s, s, s);
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const sx = model.size.x * s, sz = model.size.z * s, h = model.size.y * s;
    shadow.scale.set(sx * 1.12 + 0.1, 1, sz * 1.12 + 0.1);
    shadow.position.set(-0.03, 0.006, -0.05);
    // encuadre: la figura entera y la punta de su sombra, con aire, en el formato de la tarjeta
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const add = (x, y, z) => {
      _p.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      x0 = Math.min(x0, _p.x); x1 = Math.max(x1, _p.x);
      y0 = Math.min(y0, _p.y); y1 = Math.max(y1, _p.y);
    };
    for (let c = 0; c < 4; c++) {
      const px = (c & 1 ? 0.5 : -0.5) * sx, pz = (c & 2 ? 0.5 : -0.5) * sz;
      add(px, 0, pz);
      add(px, h, pz);
      // donde cae la sombra de esa esquina de arriba
      add(px - (SUN_DIR.x / SUN_DIR.y) * h * 0.85, 0, pz - (SUN_DIR.z / SUN_DIR.y) * h * 0.85);
    }
    const halfH = Math.max((y1 - y0) / 2, (x1 - x0) / 2 / ASPECT) * 1.14;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    camera.left = cx - halfH * ASPECT; camera.right = cx + halfH * ASPECT;
    camera.top = cy + halfH; camera.bottom = cy - halfH;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    out[key] = canvas.toDataURL('image/png');
    scene.remove(mesh);
    model.geometry.dispose();
    model.lodGeometry.dispose();
    // ceder el hilo entre modelos
    await new Promise((res) => setTimeout(res, 0));
  }
  for (const x of [material, lineMat, shadowMat, catcherMat]) x.dispose();
  for (const x of [lineGeo, shadowGeo, catcherGeo]) x.dispose();
  shadowTex.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
