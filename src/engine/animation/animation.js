// WFL Engine — система анимации: скелетные клипы, аниматор со стейт-машиной, твины
import * as THREE from 'three';
import { Component, registerComponent } from '../core/component.js';
import { Mathf } from '../core/math.js';
import { EventEmitter } from '../core/events.js';

/* ============================ Easing ============================ */
export const Easing = {
  linear: (t) => t,
  quadIn: (t) => t * t,
  quadOut: (t) => t * (2 - t),
  quadInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  cubicIn: (t) => t ** 3,
  cubicOut: (t) => --t * t * t + 1,
  cubicInOut: (t) => (t < 0.5 ? 4 * t ** 3 : (t - 1) * (2 * t - 2) ** 2 + 1),
  quartOut: (t) => 1 - (--t) ** 4,
  expoIn: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  expoOut: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  sineIn: (t) => 1 - Math.cos((t * Math.PI) / 2),
  sineOut: (t) => Math.sin((t * Math.PI) / 2),
  sineInOut: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  backIn: (t) => 2.70158 * t ** 3 - 1.70158 * t * t,
  backOut: (t) => 1 + 2.70158 * (--t) ** 3 + 1.70158 * t * t,
  elasticOut: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  bounceOut: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

/* ============================ Tween ============================ */
let _tweenId = 0;

export class Tween {
  constructor(target, to, duration = 0.3, opts = {}) {
    this.id = ++_tweenId;
    this.target = target;
    this.to = to;
    this.from = {};
    this.duration = Math.max(0.0001, duration);
    this.ease = typeof opts.ease === 'function' ? opts.ease : (Easing[opts.ease] ?? Easing.quadOut);
    this.delay = opts.delay ?? 0;
    this.loop = opts.loop ?? 0;          // 0 = без повторов, -1 = бесконечно
    this.yoyo = opts.yoyo ?? false;
    this.onUpdate = opts.onUpdate ?? null;
    this.onComplete = opts.onComplete ?? null;
    this.useUnscaledTime = opts.useUnscaledTime ?? false;
    this.elapsed = 0;
    this._loopsDone = 0;
    this._reversed = false;
    this._started = false;
    this.isPlaying = true;
    this.isComplete = false;
  }

  _capture() {
    for (const k in this.to) {
      const cur = this.target[k];
      if (typeof cur === 'number') this.from[k] = cur;
      else if (cur && cur.isVector3) this.from[k] = cur.clone();
      else if (cur && cur.isVector2) this.from[k] = cur.clone();
      else if (cur && cur.isColor) this.from[k] = cur.clone();
      else if (cur && cur.isQuaternion) this.from[k] = cur.clone();
    }
    this._started = true;
  }

  update(dt) {
    if (!this.isPlaying || this.isComplete) return false;
    if (this.delay > 0) { this.delay -= dt; if (this.delay > 0) return false; dt = -this.delay; this.delay = 0; }
    if (!this._started) this._capture();
    this.elapsed += dt;
    let t = Mathf.clamp01(this.elapsed / this.duration);
    const e = this.ease(this._reversed ? 1 - t : t);
    this._apply(e);
    this.onUpdate?.(e, this.target);
    if (t >= 1) {
      if (this.loop === -1 || this._loopsDone < this.loop) {
        this._loopsDone++;
        this.elapsed = 0;
        if (this.yoyo) this._reversed = !this._reversed;
      } else {
        this.isComplete = true;
        this.onComplete?.(this.target);
        return true;
      }
    }
    return false;
  }

  _apply(e) {
    for (const k in this.to) {
      const from = this.from[k], to = this.to[k];
      if (from === undefined) continue;
      if (typeof from === 'number') this.target[k] = from + (to - from) * e;
      else if (from.isQuaternion) this.target[k] = from.clone().slerp(to, e);
      else if (from.isColor) this.target[k] = from.clone().lerp(to, e);
      else if (from.lerpVectors) this.target[k] = from.clone().lerp(to, e);
    }
  }

  kill(complete = false) {
    if (complete) { this._apply(1); this.onComplete?.(this.target); }
    this.isComplete = true;
  }
  pause() { this.isPlaying = false; return this; }
  play() { this.isPlaying = true; return this; }
}

/** Глобальный менеджер твинов — обновляется движком каждый кадр */
export class TweenManager {
  constructor() { this.tweens = []; }
  add(tween) { this.tweens.push(tween); return tween; }
  to(target, props, duration, opts) { return this.add(new Tween(target, props, duration, opts)); }
  /** Твин произвольного числа через колбэк */
  value(from, to, duration, onUpdate, opts = {}) {
    const box = { v: from };
    return this.add(new Tween(box, { v: to }, duration, {
      ...opts,
      onUpdate: (e) => onUpdate(box.v, e),
    }));
  }
  /** Твин позиции трансформа */
  move(transform, to, duration, opts) {
    const proxy = {
      get position() { return transform.position; },
      set position(v) { transform.position = v; },
    };
    return this.to(proxy, { position: to.clone ? to.clone() : new THREE.Vector3().copy(to) }, duration, opts);
  }
  killAllOf(target) {
    for (const t of this.tweens) if (t.target === target) t.isComplete = true;
  }
  update(dt, unscaledDt = dt) {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const t = this.tweens[i];
      t.update(t.useUnscaledTime ? unscaledDt : dt);
      if (t.isComplete) this.tweens.splice(i, 1);
    }
  }
  clear() { this.tweens.length = 0; }
  get count() { return this.tweens.length; }
}

export const Tweens = new TweenManager();

/* ============================ Animator ============================ */

/** Состояние анимационной стейт-машины */
export class AnimatorState {
  constructor(name, clipName, opts = {}) {
    this.name = name;
    this.clipName = clipName;
    this.speed = opts.speed ?? 1;
    this.loop = opts.loop ?? true;
    this.transitions = [];
  }
  /** Добавить переход: to — имя состояния, condition — функция(params) => bool */
  addTransition(to, condition, duration = 0.2, opts = {}) {
    this.transitions.push({
      to, condition, duration,
      hasExitTime: opts.hasExitTime ?? false,
      exitTime: opts.exitTime ?? 0.9,
      priority: opts.priority ?? 0,
    });
    this.transitions.sort((a, b) => b.priority - a.priority);
    return this;
  }
}

/**
 * Аниматор поверх THREE.AnimationMixer.
 * Поддерживает: воспроизведение клипов, crossfade, стейт-машину с параметрами,
 * события анимации и слои с масками.
 */
export class Animator extends Component {
  static componentName = 'Animator';
  static allowMultiple = false;
  static inspector = {
    defaultState: { type: 'string', default: '', label: 'Стартовое состояние' },
    speed: { type: 'number', default: 1, step: 0.1, label: 'Скорость' },
    applyRootMotion: { type: 'boolean', default: false, label: 'Root motion' },
    autoPlayFirst: { type: 'boolean', default: true, label: 'Играть первый клип' },
  };

  constructor() {
    super();
    this.defaultState = '';
    this.speed = 1;
    this.applyRootMotion = false;
    this.autoPlayFirst = true;
    /** @type {THREE.AnimationMixer|null} */
    this.mixer = null;
    /** @type {Map<string, THREE.AnimationClip>} */
    this.clips = new Map();
    /** @type {Map<string, THREE.AnimationAction>} */
    this.actions = new Map();
    /** @type {Map<string, AnimatorState>} */
    this.states = new Map();
    this.parameters = {};
    this.currentState = null;
    this.currentAction = null;
    this.events = new EventEmitter();
    this._triggers = new Set();
    this._eventMarkers = new Map(); // clipName -> [{time, name, fired}]
    this._lastTime = 0;
  }

  awake() {
    const root = this.transform.object3D;
    this.mixer = new THREE.AnimationMixer(root);
    this.mixer.addEventListener('finished', (e) => {
      this.events.emit('finished', e.action.getClip().name);
      this.gameObject.sendMessage('onAnimationFinished', e.action.getClip().name);
    });
    // подхватываем клипы из загруженной GLTF-модели
    this._collectClips(root);
    if (this.defaultState && this.states.has(this.defaultState)) this.setState(this.defaultState);
    else if (this.autoPlayFirst && this.clips.size) this.play([...this.clips.keys()][0]);
  }

  _collectClips(root) {
    const found = root.userData?.animations ?? root.animations ?? [];
    for (const clip of found) this.addClip(clip.name, clip);
    root.traverse?.((o) => {
      if (o !== root && Array.isArray(o.animations)) {
        for (const clip of o.animations) this.addClip(clip.name, clip);
      }
    });
  }

  /** Регистрирует клип (THREE.AnimationClip) */
  addClip(name, clip) {
    if (!clip || this.clips.has(name)) return this;
    clip.name = name;
    this.clips.set(name, clip);
    if (this.mixer) {
      const action = this.mixer.clipAction(clip);
      this.actions.set(name, action);
    }
    return this;
  }

  /** Подключает клипы из загруженного ассета gltf */
  addClipsFromAsset(asset) {
    const anims = asset?.animations ?? asset?.scene?.animations ?? [];
    for (const c of anims) this.addClip(c.name, c);
    return this;
  }

  getAction(name) {
    if (this.actions.has(name)) return this.actions.get(name);
    const clip = this.clips.get(name);
    if (!clip || !this.mixer) return null;
    const a = this.mixer.clipAction(clip);
    this.actions.set(name, a);
    return a;
  }

  /** Воспроизвести клип с кроссфейдом */
  play(clipName, fade = 0.2, { loop = true, speed = 1, restart = false } = {}) {
    const action = this.getAction(clipName);
    if (!action) { console.warn(`[Animator] клип не найден: ${clipName}`); return null; }
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    action.timeScale = speed;
    if (this.currentAction === action && !restart) return action;
    action.reset().setEffectiveWeight(1).play();
    if (this.currentAction && this.currentAction !== action && fade > 0) {
      this.currentAction.crossFadeTo(action, fade, false);
    } else if (this.currentAction && this.currentAction !== action) {
      this.currentAction.stop();
    }
    this.currentAction = action;
    const markers = this._eventMarkers.get(clipName);
    if (markers) for (const m of markers) m.fired = false;
    this.events.emit('play', clipName);
    return action;
  }

  stop(clipName = null) {
    if (clipName) this.getAction(clipName)?.stop();
    else { this.mixer?.stopAllAction(); this.currentAction = null; }
  }

  isPlaying(clipName) {
    const a = this.actions.get(clipName);
    return !!a && a.isRunning();
  }

  /** Нормализованное время текущего клипа [0..1] */
  get normalizedTime() {
    const a = this.currentAction;
    if (!a) return 0;
    const dur = a.getClip().duration || 1;
    return (a.time % dur) / dur;
  }

  /* ---------- Стейт-машина ---------- */
  addState(name, clipName, opts) {
    const s = new AnimatorState(name, clipName ?? name, opts);
    this.states.set(name, s);
    if (!this.defaultState) this.defaultState = name;
    return s;
  }
  getState(name) { return this.states.get(name) ?? null; }

  setState(name, fade = 0.2) {
    const s = this.states.get(name);
    if (!s) { console.warn(`[Animator] состояние не найдено: ${name}`); return; }
    if (this.currentState === s) return;
    const prev = this.currentState;
    this.currentState = s;
    this.play(s.clipName, fade, { loop: s.loop, speed: s.speed, restart: true });
    this.events.emit('stateChanged', name, prev?.name ?? null);
    this.gameObject?.sendMessage('onAnimatorStateChanged', name, prev?.name ?? null);
  }

  setFloat(k, v) { this.parameters[k] = v; }
  setInt(k, v) { this.parameters[k] = Math.round(v); }
  setBool(k, v) { this.parameters[k] = !!v; }
  setTrigger(k) { this._triggers.add(k); this.parameters[k] = true; }
  resetTrigger(k) { this._triggers.delete(k); this.parameters[k] = false; }
  getParam(k) { return this.parameters[k]; }

  /** Событие в конкретный момент клипа */
  addAnimationEvent(clipName, time, eventName) {
    if (!this._eventMarkers.has(clipName)) this._eventMarkers.set(clipName, []);
    this._eventMarkers.get(clipName).push({ time, name: eventName, fired: false });
    return this;
  }

  update(dt) {
    if (!this.mixer) return;
    const scaled = dt * this.speed;
    this.mixer.update(scaled);
    this._evaluateTransitions();
    this._fireAnimationEvents();
    for (const t of this._triggers) this.parameters[t] = false;
    this._triggers.clear();
  }

  _evaluateTransitions() {
    const s = this.currentState;
    if (!s) return;
    for (const tr of s.transitions) {
      if (tr.hasExitTime && this.normalizedTime < tr.exitTime) continue;
      let ok = false;
      try { ok = tr.condition ? !!tr.condition(this.parameters, this) : true; }
      catch (e) { console.error('[Animator] ошибка условия перехода', e); }
      if (ok) { this.setState(tr.to, tr.duration); return; }
    }
  }

  _fireAnimationEvents() {
    const a = this.currentAction;
    if (!a) return;
    const clipName = a.getClip().name;
    const markers = this._eventMarkers.get(clipName);
    if (!markers) return;
    const t = a.time;
    for (const m of markers) {
      if (!m.fired && t >= m.time) {
        m.fired = true;
        this.events.emit(m.name, this);
        this.gameObject.sendMessage(m.name, this);
      }
      if (t < m.time - 0.05) m.fired = false; // зациклился
    }
  }

  onDestroy() {
    this.mixer?.stopAllAction();
    this.mixer?.uncacheRoot(this.transform.object3D);
    this.mixer = null;
  }

  serialize() {
    const d = super.serialize();
    d.states = [...this.states.values()].map((s) => ({
      name: s.name, clipName: s.clipName, speed: s.speed, loop: s.loop,
    }));
    d.parameters = { ...this.parameters };
    return d;
  }
  deserialize(data) {
    super.deserialize(data);
    if (Array.isArray(data?.states)) {
      for (const s of data.states) this.addState(s.name, s.clipName, { speed: s.speed, loop: s.loop });
    }
    if (data?.parameters) this.parameters = { ...data.parameters };
    return this;
  }
}
registerComponent(Animator);

/* ============================ Покадровая спрайт-анимация ============================ */
export class SpriteAnimator extends Component {
  static componentName = 'SpriteAnimator';
  static inspector = {
    columns: { type: 'number', default: 4, min: 1, step: 1, label: 'Колонок' },
    rows: { type: 'number', default: 4, min: 1, step: 1, label: 'Строк' },
    fps: { type: 'number', default: 12, min: 0.1, step: 1, label: 'FPS' },
    loop: { type: 'boolean', default: true, label: 'Зацикленно' },
    playing: { type: 'boolean', default: true, label: 'Играет' },
  };
  constructor() {
    super();
    this.columns = 4;
    this.rows = 4;
    this.fps = 12;
    this.loop = true;
    this.playing = true;
    this.frame = 0;
    this.clips = new Map(); // name -> {from, to, fps, loop}
    this.currentClip = null;
    this._acc = 0;
    this._texture = null;
  }
  start() {
    const sr = this.getComponent('SpriteRenderer') ?? this.getComponent('MeshRenderer');
    const mat = sr?.material ?? sr?.sprite?.material;
    this._texture = mat?.map ?? null;
    if (this._texture) {
      this._texture.wrapS = this._texture.wrapT = THREE.RepeatWrapping;
      this._texture.repeat.set(1 / this.columns, 1 / this.rows);
    }
  }
  addClip(name, from, to, opts = {}) {
    this.clips.set(name, { from, to, fps: opts.fps ?? this.fps, loop: opts.loop ?? true });
    return this;
  }
  play(name) {
    const c = this.clips.get(name);
    if (!c) return;
    this.currentClip = name;
    this.frame = c.from;
    this._acc = 0;
    this.playing = true;
  }
  update(dt) {
    if (!this.playing || !this._texture) return;
    const c = this.currentClip ? this.clips.get(this.currentClip) : null;
    const fps = c?.fps ?? this.fps;
    const first = c?.from ?? 0;
    const last = c?.to ?? this.columns * this.rows - 1;
    const loop = c?.loop ?? this.loop;
    this._acc += dt * fps;
    while (this._acc >= 1) {
      this._acc -= 1;
      this.frame++;
      if (this.frame > last) {
        if (loop) this.frame = first;
        else { this.frame = last; this.playing = false; this.gameObject.sendMessage('onSpriteAnimationEnd', this.currentClip); }
      }
    }
    const col = this.frame % this.columns;
    const row = Math.floor(this.frame / this.columns) % this.rows;
    this._texture.offset.set(col / this.columns, 1 - (row + 1) / this.rows);
  }
}
registerComponent(SpriteAnimator);

/* ============================ Анимация по ключевым кадрам (без скелета) ============================ */
export class KeyframeAnimation extends Component {
  static componentName = 'KeyframeAnimation';
  static inspector = {
    duration: { type: 'number', default: 2, min: 0.01, step: 0.1, label: 'Длительность' },
    loop: { type: 'select', default: 'loop', options: ['once', 'loop', 'pingpong'], label: 'Режим' },
    playing: { type: 'boolean', default: true, label: 'Играет' },
    ease: { type: 'select', default: 'quadInOut', options: Object.keys(Easing), label: 'Сглаживание' },
  };
  constructor() {
    super();
    this.duration = 2;
    this.loop = 'loop';
    this.playing = true;
    this.ease = 'quadInOut';
    /** ключи: [{t: 0..1, position?:[x,y,z], rotation?:[x,y,z], scale?:[x,y,z]}] */
    this.keys = [];
    this.time = 0;
    this._dir = 1;
  }
  addKey(t, { position, rotation, scale } = {}) {
    this.keys.push({ t, position, rotation, scale });
    this.keys.sort((a, b) => a.t - b.t);
    return this;
  }
  update(dt) {
    if (!this.playing || this.keys.length < 2) return;
    this.time += dt * this._dir / this.duration;
    if (this.time >= 1) {
      if (this.loop === 'loop') this.time -= 1;
      else if (this.loop === 'pingpong') { this.time = 1; this._dir = -1; }
      else { this.time = 1; this.playing = false; this.gameObject.sendMessage('onAnimationComplete'); }
    } else if (this.time <= 0 && this._dir < 0) {
      if (this.loop === 'pingpong') { this.time = 0; this._dir = 1; }
      else this.time = 0;
    }
    this._sample(this.time);
  }
  _sample(t) {
    let a = this.keys[0], b = this.keys[this.keys.length - 1];
    for (let i = 0; i < this.keys.length - 1; i++) {
      if (t >= this.keys[i].t && t <= this.keys[i + 1].t) { a = this.keys[i]; b = this.keys[i + 1]; break; }
    }
    const span = b.t - a.t || 1;
    const local = (Easing[this.ease] ?? Easing.linear)(Mathf.clamp01((t - a.t) / span));
    if (a.position && b.position) {
      this.transform.localPosition = new THREE.Vector3(
        Mathf.lerpUnclamped(a.position[0], b.position[0], local),
        Mathf.lerpUnclamped(a.position[1], b.position[1], local),
        Mathf.lerpUnclamped(a.position[2], b.position[2], local));
    }
    if (a.rotation && b.rotation) {
      this.transform.localEulerAngles = new THREE.Vector3(
        Mathf.lerpAngle(a.rotation[0], b.rotation[0], local),
        Mathf.lerpAngle(a.rotation[1], b.rotation[1], local),
        Mathf.lerpAngle(a.rotation[2], b.rotation[2], local));
    }
    if (a.scale && b.scale) {
      this.transform.localScale = new THREE.Vector3(
        Mathf.lerpUnclamped(a.scale[0], b.scale[0], local),
        Mathf.lerpUnclamped(a.scale[1], b.scale[1], local),
        Mathf.lerpUnclamped(a.scale[2], b.scale[2], local));
    }
  }
  serialize() { const d = super.serialize(); d.keys = this.keys; return d; }
  deserialize(data) { super.deserialize(data); if (Array.isArray(data?.keys)) this.keys = data.keys; return this; }
}
registerComponent(KeyframeAnimation);
