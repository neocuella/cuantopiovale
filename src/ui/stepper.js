// Scroll y deslizamiento como pasos de calendario. Despacio, cada muesca de la rueda (o cada
// tramo chico del trackpad o del dedo) mueve un día; más rápido, una semana, un mes, un año, una
// década o un siglo. La velocidad se suaviza y los cambios de nivel tienen histéresis para que no
// titile. Un deslizamiento con el dedo sigue por inercia y frena solo.

export const LEVELS = ['día', 'semana', 'mes', 'año', 'década', 'siglo'];

// Velocidad (px de scroll por segundo, suavizada) para subir de nivel desde cada uno.
export const UP = [1100, 2600, 5200, 9000, 15000];
const DOWN = 0.55; // para bajar, la velocidad tiene que caer por debajo de UP × DOWN
const STEP_PX = 40; // scroll continuo (trackpad, dedo): un paso cada tantos px
const NOTCH_PX = 50; // un evento de rueda de este tamaño o más cuenta como una muesca
const TAU = 0.12; // segundos de suavizado de la velocidad
const IDLE = 0.18; // segundos sin eventos para empezar a frenar
const FLING_FRICTION = 3.2; // inercia del dedo (1/s)

export class Stepper {
  /**
   * maxLevel: el nivel más alto que tiene sentido para esta corrida.
   * onStep(dir, levelIndex): un paso hacia adelante (+1) o hacia atrás (-1).
   * onLevel(levelIndex): se mostró o cambió el nivel.
   */
  constructor({ maxLevel, onStep, onLevel }) {
    this.maxLevel = maxLevel;
    this.onStep = onStep;
    this.onLevel = onLevel;
    this.reset();
  }

  reset() {
    this.v = 0;
    this.level = 0;
    this.acc = 0;
    this.dir = 0;
    this.last = -1;
    this.fling = 0;
  }

  /** delta en px (positivo = hacia adelante). */
  push(delta, now, notch = false) {
    if (!delta) return;
    const dt = this.last < 0 ? 0.016 : Math.min(0.25, Math.max(0.004, (now - this.last) / 1000));
    if (this.last >= 0 && now - this.last > 400) this.v = 0; // arranque nuevo
    this.last = now;
    const dir = Math.sign(delta);
    if (dir !== this.dir) {
      this.acc = 0;
      this.dir = dir;
      this.v = 0;
      this.level = 0;
    }
    const inst = Math.abs(delta) / dt;
    this.v += (inst - this.v) * (1 - Math.exp(-dt / TAU));
    this.updateLevel();
    if (notch) {
      this.acc = 0;
      this.onStep(dir, this.level);
      return;
    }
    this.acc += Math.abs(delta);
    while (this.acc >= STEP_PX) {
      this.acc -= STEP_PX;
      this.onStep(dir, this.level);
    }
  }

  /** Evento de rueda del navegador. */
  wheel(e, now) {
    let d = e.deltaY;
    if (e.deltaMode === 1) d *= 40;
    else if (e.deltaMode === 2) d *= 400;
    const notch = e.deltaMode !== 0 || (Math.abs(d) >= NOTCH_PX && Number.isInteger(e.deltaY) && Math.abs(e.deltaX) < 1);
    this.push(d, now, notch);
  }

  updateLevel() {
    let L = this.level;
    while (L < this.maxLevel && this.v > UP[L]) L++;
    while (L > 0 && this.v < UP[L - 1] * DOWN) L--;
    if (L !== this.level) {
      this.level = L;
      this.onLevel(L);
    }
  }

  /** El dedo se soltó con velocidad v (px/s, positivo = adelante). */
  release(v) {
    this.fling = Math.abs(v) > 250 ? v : 0;
  }

  /** Cada cuadro: inercia del dedo y frenado de la velocidad sin eventos. Devuelve si sigue activo. */
  tick(dt, now) {
    if (this.fling) {
      this.push(this.fling * dt, now);
      this.fling *= Math.exp(-dt * FLING_FRICTION);
      if (Math.abs(this.fling) < 120) this.fling = 0;
      return true;
    }
    if (this.last >= 0 && now - this.last > IDLE * 1000 && this.v > 0) {
      this.v *= Math.exp(-dt * 8);
      if (this.v < 20) this.v = 0;
      this.updateLevel();
      return this.v > 0;
    }
    return false;
  }
}
