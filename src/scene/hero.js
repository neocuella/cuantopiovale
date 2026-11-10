// Portada: el día de hoy impreso en el calendario de papel, con una figura de juguete parada en
// su cuadrado naranja. Cada tanto la figura se desarma pieza por pieza y en el mismo lugar se arma
// otra (las mismas figuras y el mismo piso que la corrida, pero un solo modelo y un pedacito de
// calendario, con un renderer chico).
//
// El piso se funde con el fondo de la página: el lienzo es transparente y el papel pierde opacidad
// hacia los bordes.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildParts, GROUND_COLOR } from './models.js';
import { INK, PAD, ACCENT, SHADOW, addPaperLights, softRectTexture } from './look.js';
import { glyphAtlas, monthAtlas, GLYPH_FN, digitWidths } from './glyphs.js';

const MAX_DPR = 2;
const SIN_E = 1 / Math.sqrt(3); // isométrico
const AXIS = 0.816496580927726; // largo en pantalla de una celda
const FOOT = 0.7; // huella máxima de la figura, en celdas
const TALL = 0.95; // alto máximo
const SHIFT = 0.1; // la figura se corre hacia el fondo de la celda; adelante queda impresa la fecha
const DUR = { build: 1700, hold: 3800, break: 760, gap: 240, still: 5200, fade: 300 };
const BUILD_SPAN = 1300; // ms en que llegan todas las piezas (el resto es el anillo)

// ——— Piso: el día de hoy y sus vecinos, como en el calendario de la corrida ———

const FLOOR_VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  // mundo → plano de lectura (x a la derecha, z hacia abajo); la celda de hoy es [0,1) × [0,1)
  vP = vec2(-w.z + 0.5, w.x + 0.5);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FLOOR_FRAG = /* glsl */ `
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uPad;
uniform float uPx;    // píxeles por celda
uniform float uDom;   // día del mes de hoy
uniform float uDim;   // días del mes
uniform float uFirst; // día de la semana del 1.º (lunes = 0)
uniform float uMonth; // 0..11
uniform float uR;     // radio del papel, en celdas
uniform sampler2D uMonths;
${GLYPH_FN}
varying vec2 vP;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float box(vec2 f, float inset, float r) {
  vec2 q = abs(f - 0.5) - (0.5 - inset - r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
// nombre corto del mes, del atlas de meses (celdas de 3 × 1)
float monthGlyph(float m, vec2 g, vec2 dgx, vec2 dgy) {
  if (g.x < 0.0 || g.x > 3.0 || g.y < 0.0 || g.y > 1.0) return 0.0;
  float c = mod(m, 2.0);
  float r = floor(m / 2.0);
  vec2 uv = vec2((c + g.x / 3.0) / 2.0, 1.0 - (r + 1.0 - g.y) / 6.0);
  vec2 k = vec2(1.0 / 6.0, 1.0 / 6.0);
  return textureGrad(uMonths, uv, dgx * k, dgy * k).r;
}
float number(float n, vec2 o, vec2 gx, vec2 gy) { return number2(n, o, gx, gy); }

void main() {
  vec2 p = vP;
  float fade = 1.0 - smoothstep(uR * 0.3, uR, length(p - 0.5));
  if (fade <= 0.003) discard;
  float n = noise(p * 0.7) * 0.6 + noise(p * 3.1 + 7.0) * 0.4;
  float gr = hash(floor(gl_FragCoord.xy)) - 0.5;
  vec3 col = uPaper * (0.985 + 0.02 * n) + gr * 0.012;
  vec2 dpx = dFdx(p);
  vec2 dpy = dFdy(p);
  vec2 cell = floor(p);
  vec2 f = p - cell;
  float todayCol = mod(uFirst + uDom - 1.0, 7.0);
  float todayRow = floor((uFirst + uDom - 1.0) / 7.0);
  float c = todayCol + cell.x;
  float row = todayRow + cell.y;
  float rows = ceil((uFirst + uDim) / 7.0);
  bool inBlock = c >= 0.0 && c <= 6.0 && row >= 0.0 && row < rows;
  float dom = uDom + cell.x + 7.0 * cell.y;
  bool valid = inBlock && dom >= 1.0 && dom <= uDim;
  if (cell.x == 0.0 && cell.y == 0.0) {
    // hoy: solo las líneas y la fecha impresa adelante ("9 NOV"), sin cuadrado de color
    float sd = box(f, 0.06, 0.05);
    float aa = max(fwidth(sd), 1e-4);
    float hL = 0.2;
    vec2 o = vec2(f.x - 0.08, 0.95 - f.y) / hL;
    vec2 gx = dpx / hL, gy = -dpy / hL;
    float t = number(uDom, o, gx, gy);
    t = max(t, monthGlyph(uMonth, o - vec2(number2W(uDom) + 0.2, 0.0), gx, gy));
    col = mix(col, uInk, t * 0.85);
  } else if (valid) {
    // número del día, arriba a la izquierda (igual que en la corrida)
    float hN = 0.31;
    vec2 o = vec2(f.x - 0.06, 0.05 + hN - f.y) / hN;
    col = mix(col, uInk, number(dom, o, dpx / hN, -dpy / hN) * 0.8);
  }
  if (inBlock) {
    vec2 e = min(f, 1.0 - f);
    float ed = min(e.x, e.y);
    float lw = max(0.012, 0.6 / uPx);
    float aa = max(fwidth(ed), 1e-4);
    col = mix(col, uInk, (1.0 - smoothstep(lw - aa, lw + aa, ed)) * 0.5);
  }
  gl_FragColor = vec4(col, fade);
  #include <colorspace_fragment>
}
`;

// ——— Figura que se arma y se desarma ———
//
// Cada pieza lleva su centro (aPivot) y aAnim = (orden 0..1 de abajo hacia arriba, dirección x,
// dirección z, giro). uBuild 0→1 trae las piezas desde arriba y un poco afuera, escalonadas, con un
// rebote al llegar; uBreak 0→1 las levanta y las abre, primero las de arriba.

const ASSEMBLY_HEAD = `#include <common>
attribute vec3 aPivot;
attribute vec4 aAnim;
uniform float uBuild;
uniform float uBreak;
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
float backOut(float t) { float u = t - 1.0; return 1.0 + 2.70158 * u * u * u + 1.70158 * u * u; }`;
const ASSEMBLY_ANIM = `float kc = clamp((uBuild - aAnim.x * 0.55) / 0.45, 0.0, 1.0);
float kb = clamp((uBreak - (1.0 - aAnim.x) * 0.5) / 0.5, 0.0, 1.0);
float away = (1.0 - kc) * (1.0 - kc);
float kb2 = kb * kb;
float aSc = backOut(kc) * (1.0 - kb2);
float aAng = aAnim.w * (away - kb2 * 0.8);
vec3 aOff = vec3(aAnim.y * 0.3, 0.8, aAnim.z * 0.3) * away + vec3(aAnim.y * 0.5, 0.6, aAnim.z * 0.5) * kb2;`;
const ASSEMBLY_POS = 'vec3 transformed = aPivot + rotY(position - aPivot, aAng) * aSc + aOff;';

function assemblyMaterial(u) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  // Las figuras no tienen caras de abajo (la cámara nunca las ve). Por defecto three.js dibuja
  // solo las caras de atrás en el mapa de sombras, y sin piso la sombra queda con un hueco pegado
  // a la figura: se dibujan las dos caras.
  m.shadowSide = THREE.DoubleSide;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBuild = u.uBuild;
    sh.uniforms.uBreak = u.uBreak;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', ASSEMBLY_HEAD)
      .replace(
        '#include <beginnormal_vertex>',
        `${ASSEMBLY_ANIM}
vec3 objectNormal = rotY(vec3(normal), aAng);
#ifdef USE_TANGENT
vec3 objectTangent = vec3(tangent.xyz);
#endif`
      )
      .replace(
        '#include <begin_vertex>',
        `${ASSEMBLY_POS}
#ifdef USE_ALPHAHASH
vPosition = vec3(position);
#endif`
      );
  };
  m.customProgramCacheKey = () => 'hero-assembly';
  return m;
}

/** El mismo movimiento de las piezas, para el mapa de sombras: así la sombra se arma y se desarma con la figura. */
function assemblyDepthMaterial(u) {
  const m = new THREE.MeshDepthMaterial();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBuild = u.uBuild;
    sh.uniforms.uBreak = u.uBreak;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', ASSEMBLY_HEAD).replace('#include <begin_vertex>', `${ASSEMBLY_ANIM}\n${ASSEMBLY_POS}`);
  };
  m.customProgramCacheKey = () => 'hero-assembly-depth';
  return m;
}

// Sombra proyectada: un solo mapa chico, que solo se recalcula en los cuadros en que la figura se mueve.
const SHADOW_MAP = 1024;
const CAST_SHADOW = '#2f3a52';

function hash1(n) {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Geometría de una figura, escalada a su lugar en la celda, con los datos de cada pieza. */
function itemGeometry(key) {
  const parts = buildParts(key);
  const bb = new THREE.Box3();
  for (const g of parts) {
    g.computeBoundingBox();
    bb.union(g.boundingBox);
  }
  const size = bb.getSize(new THREE.Vector3());
  const ctr = bb.getCenter(new THREE.Vector3());
  const s = Math.min(FOOT / Math.max(size.x, size.z), TALL / size.y);
  const ox = -SHIFT, oz = -SHIFT; // hacia el fondo de la celda (la cámara mira desde +x +z)
  const info = parts.map((g, i) => {
    g.translate(-ctr.x, -bb.min.y, -ctr.z);
    g.scale(s, s, s);
    g.translate(ox, 0, oz);
    g.computeBoundingBox();
    const b = g.boundingBox;
    return { g, i, key: b.min.y + (b.min.y + b.max.y) * 0.25, c: b.getCenter(new THREE.Vector3()) };
  });
  const order = [...info].sort((a, b) => a.key - b.key);
  const n = order.length;
  order.forEach((p, rank) => {
    const r1 = hash1(p.i * 3 + 1), r2 = hash1(p.i * 3 + 2), r3 = hash1(p.i * 3 + 3);
    let dx = p.c.x - ox, dz = p.c.z - oz;
    const len = Math.hypot(dx, dz);
    if (len < 0.04) {
      const a = r1 * Math.PI * 2;
      dx = Math.cos(a);
      dz = Math.sin(a);
    } else {
      dx /= len;
      dz /= len;
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
  const geometry = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return { geometry, sx: size.x * s, sz: size.z * s, h: size.y * s };
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class HeroStage {
  /**
   * items: [{ model, ... }] en el orden en que se muestran. today: fecha UTC.
   * onItem(item): se llama cuando empieza a armarse cada figura.
   */
  constructor(canvas, { items, today, reducedMotion = false, onItem }) {
    this.canvas = canvas;
    this.items = items;
    this.reduced = reducedMotion;
    this.onItem = onItem;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    this.renderer.setClearColor(0x000000, 0);

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    // El sol de la portada viene de atrás a la izquierda: la sombra cae larga hacia la derecha,
    // sobre el calendario, y los aleros y salientes se sombrean sobre la propia figura.
    const sun = addPaperLights(this.scene);
    sun.position.set(-0.85, 1.15, 0.7).multiplyScalar(5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    const sc = sun.shadow.camera;
    sc.left = -1.9; sc.right = 1.9; sc.top = 1.9; sc.bottom = -1.9; sc.near = 0.5; sc.far = 16;
    sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.012;
    sun.shadow.radius = 3;

    // piso
    const y = today.getUTCFullYear(), mo = today.getUTCMonth();
    const first = new Date(Date.UTC(y, mo, 1));
    this.glyphTex = glyphAtlas();
    this.monthTex = monthAtlas();
    this.floorU = {
      uPaper: { value: new THREE.Color(GROUND_COLOR) },
      uInk: { value: new THREE.Color(INK) },
      uPad: { value: new THREE.Color(PAD) },
      uPx: { value: 100 },
      uDom: { value: today.getUTCDate() },
      uDim: { value: new Date(Date.UTC(y, mo + 1, 0)).getUTCDate() },
      uFirst: { value: (first.getUTCDay() + 6) % 7 },
      uMonth: { value: mo },
      uR: { value: 1.5 },
      uGlyphs: { value: this.glyphTex },
      uDW: { value: digitWidths().w },
      uDGap: { value: digitWidths().gap },
      uMonths: { value: this.monthTex },
    };
    const fg = new THREE.PlaneGeometry(9, 9);
    fg.rotateX(-Math.PI / 2);
    this.floor = new THREE.Mesh(fg, new THREE.ShaderMaterial({ uniforms: this.floorU, vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, transparent: true, depthWrite: false }));
    this.floor.renderOrder = -10;
    this.scene.add(this.floor);

    // sombra de contacto
    this.shadowTex = softRectTexture();
    const sg = new THREE.PlaneGeometry(1, 1);
    sg.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: this.shadowTex, color: SHADOW, transparent: true, opacity: 0, depthWrite: false }));
    this.shadow.renderOrder = -5;
    this.scene.add(this.shadow);

    // la sombra proyectada cae sobre un plano transparente, apenas encima del piso impreso
    const cg = new THREE.PlaneGeometry(6, 6);
    cg.rotateX(-Math.PI / 2);
    this.catcher = new THREE.Mesh(cg, new THREE.ShadowMaterial({ color: CAST_SHADOW, opacity: 0.34, depthWrite: false }));
    this.catcher.position.y = 0.006;
    this.catcher.renderOrder = -6;
    this.catcher.receiveShadow = true;
    this.scene.add(this.catcher);

    // anillo que marca cuando la figura termina de armarse (como cuando cae una en la corrida)
    const rg = new THREE.RingGeometry(0.72, 1, 48);
    rg.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, depthWrite: false }));
    this.ring.position.set(0, 0.02, 0);
    this.ring.renderOrder = -4;
    this.ring.visible = false;
    this.scene.add(this.ring);

    // figura
    this.u = { uBuild: { value: 0 }, uBreak: { value: 0 } };
    this.material = assemblyMaterial(this.u);
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.depthMaterial = assemblyDepthMaterial(this.u);
    this.mesh.customDepthMaterial = this.depthMaterial;
    this.scene.add(this.mesh);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.set(1, 1, 1).multiplyScalar(20);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();

    // Alto con el que se encuadra: la mediana de las figuras (no el alto máximo), así el conjunto
    // —día impreso y figura— queda centrado en la altura de la columna de texto. Es uno solo para
    // todas, para que el calendario no salte al cambiar de figura.
    const hs = this.items.map((it) => {
      const g = itemGeometry(it.model);
      g.geometry.dispose();
      return g.h;
    }).sort((a, b) => a - b);
    this.frameH = hs.length ? hs[Math.floor(hs.length / 2)] : TALL;
    this.idx = 0;
    this.setItem(0);
    this.phase = this.reduced ? 'still' : 'build';
    this.phaseT = 0;
    this.started = false;
    if (this.reduced) {
      this.u.uBuild.value = 1;
      this.started = true;
      this.onItem?.(this.items[0]);
    }
    this.apply();

    this.inView = false;
    this.suspended = false;
    this.active = false;
    this.raf = 0;
    this.timer = 0;
    this.frame = this.frame.bind(this);
    this.onVisibility = () => this.update();
    document.addEventListener('visibilitychange', this.onVisibility);
    this.io = new IntersectionObserver((es) => {
      this.inView = es[es.length - 1].isIntersecting;
      this.update();
    });
    this.io.observe(canvas);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
  }

  setItem(i) {
    this.idx = i;
    const it = itemGeometry(this.items[i].model);
    const old = this.mesh.geometry;
    this.mesh.geometry = it.geometry;
    old.dispose();
    this.shadow.scale.set(it.sx * 1.12 + 0.1, 1, it.sz * 1.12 + 0.1);
    this.shadow.position.set(-SHIFT - 0.03, 0.012, -SHIFT - 0.05);
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.heightPx = h;
    this.fit(w / h, w < 300);
    this.render();
  }

  /** Encuadre fijo: la celda de hoy y la figura más alta posible, con aire para el halo. */
  fit(aspect, small = false) {
    const cam = this.camera;
    const inv = cam.matrixWorldInverse;
    const pts = [];
    for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) pts.push(new THREE.Vector3(x, 0, z));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pts.push(new THREE.Vector3(-SHIFT + (x * FOOT) / 2, this.frameH ?? TALL, -SHIFT + (z * FOOT) / 2));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      p.applyMatrix4(inv);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    // en un lienzo chico (celular) la figura llena más; el halo queda más corto
    const kH = small ? 1.16 : 1.32, kW = small ? 1.22 : 1.5;
    const hh = Math.max(((y1 - y0) / 2) * kH, ((x1 - x0) / 2) * kW / aspect);
    const hw = hh * aspect;
    cam.left = cx - hw; cam.right = cx + hw;
    cam.top = cy + hh; cam.bottom = cy - hh;
    cam.updateProjectionMatrix();
    // el papel se apaga antes de llegar al borde del lienzo (el centro de la celda está en 0,0)
    const R = Math.min(hw - Math.abs(cx), (hh - Math.abs(cy)) / SIN_E) * 0.97;
    this.floorU.uR.value = Math.max(0.8, R);
    this.floorU.uPx.value = (AXIS * this.heightPx) / (2 * hh);
  }

  /** Uniformes según la fase y el tiempo dentro de ella. */
  apply() {
    const t = this.phaseT;
    let build = 1, brk = 0;
    if (this.phase === 'build') build = Math.min(1, t / BUILD_SPAN);
    else if (this.phase === 'break') brk = Math.min(1, t / DUR.break);
    else if (this.phase === 'gap') build = 0;
    this.u.uBuild.value = build;
    this.u.uBreak.value = brk;
    this.shadow.material.opacity = 0.16 * smooth(0.2, 0.9, build) * (1 - smooth(0.1, 0.7, brk));
    // anillo
    const rt = this.phase === 'build' ? (t - BUILD_SPAN * 0.86) / 520 : -1;
    this.ring.visible = rt > 0 && rt < 1;
    if (this.ring.visible) {
      const s = 0.62 * (0.5 + 0.75 * (1 - Math.pow(1 - rt, 3)));
      this.ring.scale.set(s, 1, s);
      this.ring.material.opacity = 0.9 * (1 - rt) * (1 - rt);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** La portada quedó tapada (la corrida abierta): se congela. */
  setSuspended(on) {
    this.suspended = on;
    this.update();
  }

  update() {
    const want = this.inView && !document.hidden && !this.suspended;
    if (want === this.active) return;
    this.active = want;
    if (want) {
      if (!this.started) {
        this.started = true;
        this.onItem?.(this.items[this.idx]);
      }
      this.schedule();
    } else {
      cancelAnimationFrame(this.raf);
      clearTimeout(this.timer);
      this.raf = this.timer = 0;
      if (this.holdT0) {
        this.phaseT += performance.now() - this.holdT0;
        this.holdT0 = 0;
      }
    }
  }

  schedule() {
    if (!this.active) return;
    const dur = DUR[this.phase];
    if (this.phase === 'hold' || this.phase === 'still') {
      // quieta: nada que dibujar hasta la próxima fase
      this.holdT0 = performance.now();
      this.timer = setTimeout(() => {
        this.timer = 0;
        this.phaseT += performance.now() - this.holdT0;
        this.holdT0 = 0;
        this.advance();
      }, Math.max(0, dur - this.phaseT));
    } else {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  frame(now) {
    this.raf = 0;
    if (!this.active) return;
    this.phaseT += Math.min(100, Math.max(0, now - this.last));
    this.last = now;
    if (this.phaseT >= DUR[this.phase]) {
      this.advance();
      return;
    }
    this.apply();
    this.render();
    this.schedule();
  }

  advance() {
    const next = (this.idx + 1) % this.items.length;
    this.phaseT = 0;
    switch (this.phase) {
      case 'build':
        this.phase = 'hold';
        break;
      case 'hold':
        this.phase = 'break';
        break;
      case 'break':
        this.phase = 'gap';
        this.setItem(next);
        break;
      case 'gap':
        this.phase = 'build';
        this.onItem?.(this.items[this.idx]);
        break;
      case 'still':
        // movimiento reducido: un fundido corto en vez de armar y desarmar
        this.phase = 'fade';
        this.canvas.style.opacity = '0';
        break;
      case 'fade':
        this.phase = 'still';
        this.setItem(next);
        this.onItem?.(this.items[this.idx]);
        this.canvas.style.opacity = '';
        break;
    }
    this.apply();
    this.render();
    this.schedule();
  }

  dispose() {
    this.active = false;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timer);
    this.io.disconnect();
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.mesh.geometry.dispose();
    this.floor.geometry.dispose();
    this.shadow.geometry.dispose();
    this.catcher.geometry.dispose();
    this.ring.geometry.dispose();
    for (const m of [this.material, this.depthMaterial, this.floor.material, this.shadow.material, this.catcher.material, this.ring.material]) m.dispose();
    for (const t of [this.glyphTex, this.monthTex, this.shadowTex]) t.dispose();
    this.renderer.dispose();
  }
}
