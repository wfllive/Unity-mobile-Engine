// WFL Engine — математика (обёртка над three.js, Unity-подобный API)
import * as THREE from 'three';

export { THREE };
export const Vector2 = THREE.Vector2;
export const Vector3 = THREE.Vector3;
export const Vector4 = THREE.Vector4;
export const Quaternion = THREE.Quaternion;
export const Matrix4 = THREE.Matrix4;
export const Euler = THREE.Euler;
export const Color = THREE.Color;
export const Ray = THREE.Ray;
export const Box3 = THREE.Box3;
export const Sphere = THREE.Sphere;
export const Plane = THREE.Plane;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export const Mathf = {
  PI: Math.PI,
  Infinity: Infinity,
  Epsilon: 1e-6,
  Deg2Rad: DEG2RAD,
  Rad2Deg: RAD2DEG,

  clamp(v, min, max) { return v < min ? min : v > max ? max : v; },
  clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; },
  lerp(a, b, t) { return a + (b - a) * Mathf.clamp01(t); },
  lerpUnclamped(a, b, t) { return a + (b - a) * t; },
  inverseLerp(a, b, v) { return a === b ? 0 : Mathf.clamp01((v - a) / (b - a)); },
  moveTowards(a, b, maxDelta) {
    const d = b - a;
    if (Math.abs(d) <= maxDelta) return b;
    return a + Math.sign(d) * maxDelta;
  },
  smoothStep(a, b, t) { t = Mathf.clamp01((t - a) / (b - a)); return t * t * (3 - 2 * t); },
  repeat(t, len) { return Mathf.clamp(t - Math.floor(t / len) * len, 0, len); },
  pingPong(t, len) { t = Mathf.repeat(t, len * 2); return len - Math.abs(t - len); },
  deltaAngle(cur, target) {
    let d = Mathf.repeat(target - cur, 360);
    if (d > 180) d -= 360;
    return d;
  },
  lerpAngle(a, b, t) { return a + Mathf.deltaAngle(a, b) * Mathf.clamp01(t); },
  approximately(a, b) { return Math.abs(b - a) < 1e-5; },
  sign(v) { return v >= 0 ? 1 : -1; },
  abs: Math.abs, sqrt: Math.sqrt, pow: Math.pow, min: Math.min, max: Math.max,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, atan2: Math.atan2, acos: Math.acos, asin: Math.asin,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, exp: Math.exp, log: Math.log,

  // Плавное демпфирование (аналог Mathf.SmoothDamp)
  smoothDamp(current, target, state, smoothTime, deltaTime, maxSpeed = Infinity) {
    smoothTime = Math.max(0.0001, smoothTime);
    const omega = 2 / smoothTime;
    const x = omega * deltaTime;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    let change = current - target;
    const maxChange = maxSpeed * smoothTime;
    change = Mathf.clamp(change, -maxChange, maxChange);
    const temp = (state.velocity + omega * change) * deltaTime;
    state.velocity = (state.velocity - omega * temp) * exp;
    let output = current - change + (change + temp) * exp;
    if (target - current > 0 === output > target) {
      output = target;
      state.velocity = (output - target) / deltaTime;
    }
    return output;
  },
};

/** Детерминированный ГПСЧ (для процедурной генерации и воспроизводимости) */
export class RandomState {
  constructor(seed = 12345) { this.seed = seed >>> 0; }
  next() {
    // xorshift32
    let x = this.seed;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    this.seed = x;
    return x / 4294967296;
  }
  range(min, max) { return min + this.next() * (max - min); }
  rangeInt(min, max) { return Math.floor(this.range(min, max)); }
  insideUnitSphere() {
    const v = new Vector3(this.range(-1, 1), this.range(-1, 1), this.range(-1, 1));
    return v.normalize().multiplyScalar(Math.cbrt(this.next()));
  }
}

export const Random = {
  _state: new RandomState((Math.random() * 0xffffffff) >>> 0),
  set seed(v) { this._state = new RandomState(v >>> 0); },
  value() { return this._state.next(); },
  range(min, max) { return this._state.range(min, max); },
  rangeInt(min, max) { return this._state.rangeInt(min, max); },
  insideUnitSphere() { return this._state.insideUnitSphere(); },
  insideUnitCircle() {
    const a = this._state.range(0, Math.PI * 2);
    const r = Math.sqrt(this._state.next());
    return new Vector2(Math.cos(a) * r, Math.sin(a) * r);
  },
  onUnitSphere() { return this._state.insideUnitSphere().normalize(); },
  rotation() {
    return new Quaternion().setFromEuler(new Euler(
      this._state.range(0, Math.PI * 2),
      this._state.range(0, Math.PI * 2),
      this._state.range(0, Math.PI * 2)));
  },
  colorHSV(hMin = 0, hMax = 1, sMin = 0.5, sMax = 1, vMin = 0.5, vMax = 1) {
    return new Color().setHSL(this._state.range(hMin, hMax), this._state.range(sMin, sMax), this._state.range(vMin, vMax));
  },
  pick(arr) { return arr[this._state.rangeInt(0, arr.length)]; },
};

/** Классический шум Перлина (2D/3D) для процедурных ландшафтов */
const PERM = new Uint8Array(512);
(() => {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  const rs = new RandomState(2718281);
  for (let i = 255; i > 0; i--) {
    const j = rs.rangeInt(0, i + 1);
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const grad3 = (hash, x, y, z) => {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
};

export const Noise = {
  perlin3(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z;
    const B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
    const lerp = (a, b, t) => a + t * (b - a);
    return lerp(
      lerp(lerp(grad3(PERM[AA], x, y, z), grad3(PERM[BA], x - 1, y, z), u),
        lerp(grad3(PERM[AB], x, y - 1, z), grad3(PERM[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(grad3(PERM[AA + 1], x, y, z - 1), grad3(PERM[BA + 1], x - 1, y, z - 1), u),
        lerp(grad3(PERM[AB + 1], x, y - 1, z - 1), grad3(PERM[BB + 1], x - 1, y - 1, z - 1), u), v),
      w);
  },
  perlin2(x, y) { return Noise.perlin3(x, y, 0); },
  fbm(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * Noise.perlin2(x * freq, y * freq);
      norm += amp;
      amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  },
};

export function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
