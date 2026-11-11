// Sonidos sintetizados en el momento con Web Audio: osciladores, ruido, filtros y envolventes.
// No hay archivos de audio. La idea (cada sonido es una receta corta) viene de
// github.com/m1ckc3s/procedural-sounds; las recetas de acá son propias.
//
// El navegador no deja sonar nada hasta el primer gesto del visitante: el contexto se crea (o se
// reanuda) en el primer toque o tecla, y hasta entonces cada sonido se descarta en silencio.
// El interruptor se guarda en localStorage.

const KEY = 'cer-sound';
const VOL = 0.55;

let ctx = null;
let master = null;
let noiseBuf = null;
let on = readPref();
let model = 'generico';

function readPref() {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function soundOn() {
  return on;
}

export function setSoundOn(v) {
  on = !!v;
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* sin almacenamiento: vale solo para esta visita */
  }
  if (master) master.gain.setTargetAtTime(on ? VOL : 0, ctx.currentTime, 0.03);
  if (on) unlock();
}

/** Crea o reanuda el contexto. Tiene que correr dentro de un gesto del visitante. */
export function unlock() {
  if (!on) return;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      return;
    }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = VOL;
    master.connect(comp).connect(ctx.destination);
    // un segundo de ruido blanco, compartido por todos los sonidos
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'pointerup', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
}

const ready = () => on && ctx && ctx.state === 'running';

/** Qué figura hay en el calendario: cambia el peso de las caídas y la sorpresa al tocarlas. */
export function setModel(key) {
  model = key || 'generico';
}

// ——— Piezas ———

/**
 * Un oscilador con envolvente: sube en `a`, se queda en `g` durante `hold` y cae con constante
 * d/3 (en `d` segundos queda en ~5 %). `f1`: barrido exponencial hasta ahí durante `sweep` (o d).
 * `fm`: { ratio, depth } modulador senoidal sumado a la frecuencia. `lp`: frecuencia de un pasabajos.
 */
function tone({ type = 'sine', f, f1, sweep, t = 0, a = 0.004, hold = 0, d = 0.1, g = 0.2, fm, lp, q = 0.7, detune = 0, out = master }) {
  const at = ctx.currentTime + t;
  const end = at + a + hold + d * 1.6 + 0.03;
  const o = ctx.createOscillator();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(f, at);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, at + (sweep ?? d));
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(g, at + a);
  if (hold) env.gain.setValueAtTime(g, at + a + hold);
  env.gain.setTargetAtTime(0.0001, at + a + hold, d / 3);
  let node = o;
  if (lp) {
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = lp;
    fl.Q.value = q;
    node = node.connect(fl);
  }
  node.connect(env).connect(out);
  if (fm) {
    const m = ctx.createOscillator();
    const mg = ctx.createGain();
    m.frequency.value = f * fm.ratio;
    mg.gain.value = fm.depth;
    m.connect(mg).connect(o.frequency);
    m.start(at);
    m.stop(end);
  }
  o.start(at);
  o.stop(end);
  return o;
}

/** Ruido blanco filtrado con envolvente. `f1`: el filtro barre hasta ahí. */
function noise({ type = 'bandpass', f = 1000, f1, q = 1, t = 0, a = 0.002, hold = 0, d = 0.05, g = 0.1, out = master }) {
  const at = ctx.currentTime + t;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, at);
  if (f1) fl.frequency.exponentialRampToValueAtTime(f1, at + a + hold + d);
  fl.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(g, at + a);
  if (hold) env.gain.setValueAtTime(g, at + a + hold);
  env.gain.setTargetAtTime(0.0001, at + a + hold, d / 3);
  src.connect(fl).connect(env).connect(out);
  // arranca en un punto al azar del buffer: dos golpes seguidos no suenan idénticos
  src.start(at, Math.random() * 0.8);
  src.stop(at + a + hold + d * 1.6 + 0.03);
}

/** Una campana: fundamental más un parcial inarmónico que se apaga antes. */
function bell(f, t, g = 0.12, d = 0.9) {
  tone({ f, t, a: 0.002, d, g, fm: { ratio: 3.5, depth: f * 0.12 } });
  tone({ f: f * 2.76, t, a: 0.002, d: d * 0.35, g: g * 0.25 });
}

const jitter = (amt) => 1 + (Math.random() * 2 - 1) * amt;

// ——— Caídas ———

// Peso de cada figura: 0 = liviana (aguda, corta), 1 = pesada (grave).
const WEIGHT = {
  moto: 0.1, cama_uti: 0.3, ambulancia: 0.5, camioneta: 0.5, deportivo: 0.45, todoterreno: 0.6,
  acelerador: 0.65, casa: 0.6, aula: 0.65, usf: 0.65, bus: 0.85, torre: 1, hospital: 1, generico: 0.5,
};

let lastLand = 0;

/**
 * Figuras que tocaron el papel en este cuadro (`n`).
 * `vis` (0-1): cuánto se ven las figuras (de lejos no se oyen).
 */
export function land(n, vis = 1) {
  if (!ready() || vis < 0.05) return;
  const now = ctx.currentTime;
  const w = WEIGHT[model] ?? 0.5;
  // De la familia del clic del armado (ver assemble), pero un solo toque, más corto y sin
  // escalones: el armado es una frase que sube; una caída es un golpecito.
  if (n > 0 && now - lastLand > 0.05) {
    lastLand = now;
    // muchas a la vez suenan un poco más fuerte, no n veces más
    const g = vis * Math.min(1, 0.75 + 0.1 * Math.log2(n));
    const f = 820 * Math.pow(0.85, w) * jitter(0.03); // las pesadas, apenas más graves
    tone({ f, a: 0.001, d: 0.012, g: 0.06 * g, fm: { ratio: 0.5, depth: 40 } });
    noise({ f: 3200, q: 2, d: 0.008, g: 0.025 * g });
  }
}

let lastAsm = -1;

/** Una de las primeras figuras se arma pieza por pieza (ASM_MS = 1,3 s en la escena). */
export function assemble() {
  if (!ready()) return;
  const now = ctx.currentTime;
  if (now - lastAsm < 0.5) return;
  lastAsm = now;
  // las piezas llegan entre 0,6 y 1,3 s: clics de madera que suben
  const steps = [0.6, 0.76, 0.9, 1.03, 1.15];
  steps.forEach((t, i) => {
    const f = 700 * Math.pow(1.13, i) * jitter(0.03);
    tone({ f, t, a: 0.001, d: 0.03, g: 0.07, fm: { ratio: 0.5, depth: 60 } });
    noise({ f: 3000, q: 2, t, d: 0.015, g: 0.03 });
  });
  // armada: un "pop" chiquito
  tone({ f: 520, f1: 880, t: 1.3, d: 0.12, g: 0.08 });
}

/** Se terminó la plata. */
export function end() {
  if (!ready()) return;
  bell(784, 0, 0.09, 1.2);
  bell(523, 0.32, 0.1, 1.8);
}

// ——— Sorpresas al tocar una figura ———

function horn(fs, t, hold, g = 0.08) {
  for (const f of fs) {
    tone({ type: 'sawtooth', f, t, a: 0.012, hold, d: 0.06, g, lp: 1900, q: 1.5 });
    tone({ type: 'square', f: f * 1.003, t, a: 0.012, hold, d: 0.06, g: g * 0.5, lp: 1200 });
  }
}

/** "La cucaracha" con la bocina, si alguien insiste. */
function cucaracha(fs) {
  const ratio = fs[1] / fs[0];
  const notes = [
    [392, 0, 0.09], [392, 0.15, 0.09], [392, 0.3, 0.09], [523, 0.45, 0.32], [659, 0.88, 0.4],
    [392, 1.45, 0.09], [392, 1.6, 0.09], [392, 1.75, 0.09], [523, 1.9, 0.32], [659, 2.33, 0.5],
  ];
  for (const [f, t, hold] of notes) horn([f, f * ratio], t, hold, 0.06);
}

function engine({ base, peak, t = 0, dur = 0.9, g = 0.1, lp = 1600 }) {
  const at = ctx.currentTime + t;
  const mix = ctx.createGain();
  mix.gain.setValueAtTime(0.0001, at);
  mix.gain.linearRampToValueAtTime(g, at + 0.04);
  mix.gain.setValueAtTime(g, at + dur * 0.55);
  mix.gain.setTargetAtTime(0.0001, at + dur * 0.55, dur * 0.18);
  const fl = ctx.createBiquadFilter();
  fl.type = 'lowpass';
  fl.Q.value = 2;
  fl.frequency.setValueAtTime(lp * 0.3, at);
  fl.frequency.exponentialRampToValueAtTime(lp, at + dur * 0.3);
  fl.frequency.exponentialRampToValueAtTime(lp * 0.45, at + dur);
  // los cilindros: el volumen late a la mitad de la frecuencia del motor
  const am = ctx.createGain();
  am.gain.value = 0.6;
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.4;
  lfo.connect(lfoG).connect(am.gain);
  am.connect(fl).connect(mix).connect(master);
  const stop = at + dur * 1.4;
  for (const [type, mul, det] of [['sawtooth', 1, 0], ['sawtooth', 1, 14], ['square', 0.5, 0]]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.detune.value = det;
    o.frequency.setValueAtTime(base * mul, at);
    o.frequency.exponentialRampToValueAtTime(peak * mul, at + dur * 0.3);
    o.frequency.exponentialRampToValueAtTime(peak * 0.7 * mul, at + dur * 0.55);
    o.frequency.exponentialRampToValueAtTime(base * 1.1 * mul, at + dur);
    o.connect(am);
    o.start(at);
    o.stop(stop);
  }
  lfo.frequency.setValueAtTime(base / 2, at);
  lfo.frequency.exponentialRampToValueAtTime(peak / 2, at + dur * 0.3);
  lfo.frequency.exponentialRampToValueAtTime(base * 0.55, at + dur);
  lfo.start(at);
  lfo.stop(stop);
}

const POKES = {
  // Hilux (y patrullera): bocinazo doble
  camioneta: (n) => (n >= 5 ? cucaracha([415, 523]) : (horn([415, 523], 0, 0.11), horn([415, 523], 0.2, 0.16))),
  // Brabus blindado: una bocina grave y larga
  todoterreno: (n) => (n >= 5 ? cucaracha([330, 415]) : horn([311, 392], 0, 0.42, 0.09)),
  // Lamborghini: acelerada con un par de petardeos al soltar
  deportivo: () => {
    engine({ base: 70, peak: 230, dur: 1.1, g: 0.11, lp: 2400 });
    for (const t of [0.95, 1.08, 1.17]) noise({ type: 'lowpass', f: 900, q: 0.5, t: t + Math.random() * 0.04, d: 0.05, g: 0.22 });
  },
  // moto 150: dos aceleradas cortas
  moto: () => {
    engine({ base: 95, peak: 300, dur: 0.45, g: 0.08, lp: 2600 });
    engine({ base: 110, peak: 360, t: 0.42, dur: 0.6, g: 0.09, lp: 2800 });
  },
  // ambulancia: sirena de dos tonos
  ambulancia: () => {
    const at = ctx.currentTime;
    const o = tone({ type: 'triangle', f: 960, a: 0.04, hold: 1.5, d: 0.25, g: 0.1 });
    const o2 = tone({ type: 'square', f: 960, a: 0.04, hold: 1.5, d: 0.25, g: 0.025, lp: 2500 });
    for (let i = 0; i < 6; i++) {
      const f = i % 2 ? 770 : 960;
      o.frequency.setValueAtTime(f, at + i * 0.3);
      o2.frequency.setValueAtTime(f, at + i * 0.3);
    }
  },
  // bus: el timbre de parada y la puerta neumática
  bus: () => {
    bell(1175, 0, 0.08, 0.5);
    noise({ type: 'highpass', f: 2600, f1: 4500, q: 0.6, t: 0.45, a: 0.01, hold: 0.12, d: 0.35, g: 0.12 });
    tone({ type: 'sine', f: 140, f1: 90, t: 0.45, d: 0.15, g: 0.06 });
  },
  // vivienda: timbre ding-dong
  casa: () => {
    bell(659, 0, 0.13, 1.0);
    bell(523, 0.42, 0.13, 1.4);
  },
  // aula: timbre del recreo
  aula: () => {
    const at = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 24;
    const lg = ctx.createGain();
    lg.gain.value = 0.5;
    const off = ctx.createConstantSource();
    off.offset.value = 0.5;
    lfo.connect(lg).connect(g.gain);
    off.connect(g.gain);
    g.connect(master);
    tone({ f: 2100, a: 0.01, hold: 0.75, d: 0.15, g: 0.05, fm: { ratio: 1.41, depth: 700 }, out: g });
    tone({ f: 2960, a: 0.01, hold: 0.75, d: 0.1, g: 0.02, out: g });
    lfo.start(at);
    off.start(at);
    lfo.stop(at + 1.2);
    off.stop(at + 1.2);
  },
  // unidad de salud: llamador de turnos
  usf: () => [0, 0.16, 0.32].forEach((t, i) => bell([1047, 1319, 1568][i], t, 0.08, 0.7)),
  hospital: () => [0, 0.16, 0.32].forEach((t, i) => bell([1047, 1319, 1568][i], t, 0.08, 0.7)),
  // terapia intensiva: el monitor
  cama_uti: () => [0, 0.55, 1.1].forEach((t) => tone({ f: 988, t, a: 0.004, hold: 0.07, d: 0.04, g: 0.08 })),
  // acelerador lineal: zumbido que sube y se descarga
  acelerador: () => {
    tone({ type: 'sawtooth', f: 100, a: 0.25, hold: 0.35, d: 0.2, g: 0.05, lp: 700 });
    tone({ f: 700, f1: 2600, sweep: 0.6, a: 0.2, hold: 0.4, d: 0.08, g: 0.035 });
    noise({ type: 'highpass', f: 3000, t: 0.62, d: 0.08, g: 0.1 });
    tone({ f: 1400, f1: 300, t: 0.62, d: 0.18, g: 0.07 });
  },
  // penthouse: el ascensor llegó
  torre: () => bell(1319, 0, 0.11, 1.4),
  generico: () => tone({ f: 400, f1: 150, d: 0.08, g: 0.2 }),
};

let pokeKey = -1;
let pokeN = 0;
let pokeT = 0;

/** Tocaron la figura `k`. Tocar la misma varias veces seguidas puede dar otra sorpresa. */
export function poke(k) {
  if (!ready()) return;
  const now = ctx.currentTime;
  pokeN = k === pokeKey && now - pokeT < 1.2 ? pokeN + 1 : 1;
  pokeKey = k;
  pokeT = now;
  (POKES[model] || POKES.generico)(pokeN);
  if (pokeN >= 5) pokeN = 0;
}
