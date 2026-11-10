// Miniaturas de las tarjetas: se dibuja cada modelo una vez y se guarda como imagen.

import * as THREE from 'three';
import { loadModel } from './models.js';

export async function renderThumbnails(keys, size = 220) {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#9aa77a', 1.9));
  const sun = new THREE.DirectionalLight('#fff6e6', 2.1);
  sun.position.set(-3, 8, 5);
  scene.add(sun);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const dir = new THREE.Vector3(1, 0.85, 1).normalize();

  const out = {};
  for (const key of [...new Set(keys)]) {
    const model = loadModel(key);
    const mesh = new THREE.Mesh(model.geometry, material);
    scene.add(mesh);
    const sphere = new THREE.Sphere();
    model.geometry.computeBoundingSphere();
    sphere.copy(model.geometry.boundingSphere);
    const r = sphere.radius * 1.02;
    camera.left = -r; camera.right = r; camera.top = r; camera.bottom = -r;
    camera.position.copy(sphere.center).addScaledVector(dir, 20);
    camera.lookAt(sphere.center);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    out[key] = canvas.toDataURL('image/png');
    scene.remove(mesh);
    model.geometry.dispose();
    model.lodGeometry.dispose();
    // ceder el hilo entre modelos
    await new Promise((r) => setTimeout(r, 0));
  }
  material.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
