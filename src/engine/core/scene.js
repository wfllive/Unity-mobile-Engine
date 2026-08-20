// WFL Engine — Scene: граф объектов, жизненный цикл, корутины
import * as THREE from 'three';
import { GameObject } from './gameobject.js';
import { resolveComponent, ComponentRegistry } from './component.js';
import { EventEmitter } from './events.js';
import { Time } from './time.js';
import { uuid } from './math.js';

export class Scene extends EventEmitter {
  constructor(name = 'Scene') {
    super();
    this.id = uuid();
    this.name = name;
    /** @type {import('../engine.js').Engine|null} */
    this.engine = null;
    /** @type {THREE.Scene} */
    this.root = new THREE.Scene();
    this.root.name = name;
    /** @type {GameObject[]} */
    this.gameObjects = [];
    this._byTag = new Map();
    this._componentsByType = new Map();
    this._pendingStart = [];
    this._coroutines = [];
    this._invokes = [];
    this._destroyQueue = [];
    this._loaded = false;
    /** @type {import('../physics/physics.js').PhysicsWorld|null} */
    this.physics = null;
    /** @type {import('../rendering/camera.js').CameraComponent|null} */
    this.mainCamera = null;
    this.ambientColor = new THREE.Color(0x404040);
    this.environment = { fog: null, background: new THREE.Color(0x0b0e14) };
    this.root.background = this.environment.background;
  }

  // ---- Объекты ----
  add(go) {
    if (go.scene === this) return go;
    if (go.scene) go.scene.remove(go, false);
    go.scene = this;
    this.gameObjects.push(go);
    if (!go.transform.parent) this.root.add(go.transform.object3D);
    this._indexTag(go);
    for (const c of go.components) this._registerComponent(c);
    if (this._loaded && go.activeInHierarchy) {
      for (const c of go.components) {
        if (!c._awoken) { c._awoken = true; c.awake?.(); }
        if (c._enabled) c.onEnable?.();
      }
    }
    return go;
  }

  _adopt(go) {
    if (go.scene === this) return;
    this.add(go);
    for (const child of go.transform.children) this._adopt(child.gameObject);
  }

  remove(go, invokeCallbacks = true) {
    const i = this.gameObjects.indexOf(go);
    if (i >= 0) this.gameObjects.splice(i, 1);
    this._unindexTag(go);
    for (const c of go.components) {
      this._unregisterComponent(c);
      if (invokeCallbacks) { c.onDisable?.(); c.onDestroy?.(); }
    }
    go.transform.object3D.removeFromParent();
    go.scene = null;
    return go;
  }

  createGameObject(name = 'GameObject', opts = {}) {
    const go = new GameObject(name, this);
    // position/scale принимают Vector3, массив [x,y,z] или {x,y,z};
    // rotation — кватернион, либо углы Эйлера в градусах (массив/объект).
    if (opts.position) go.transform.localPosition = toVec3(opts.position);
    if (opts.rotation) {
      const r = opts.rotation;
      if (r.isQuaternion || typeof r.w === 'number') go.transform.localRotation = r;
      else go.transform.localEulerAngles = toVec3(r);
    }
    if (opts.scale) {
      go.transform.localScale = typeof opts.scale === 'number'
        ? new THREE.Vector3(opts.scale, opts.scale, opts.scale)
        : toVec3(opts.scale);
    }
    if (opts.parent) go.transform.setParent(opts.parent.transform ?? opts.parent, false);
    if (opts.tag) go.tag = opts.tag;
    if (opts.components) for (const c of opts.components) {
      Array.isArray(c) ? go.addComponent(c[0], c[1]) : go.addComponent(c);
    }
    return go;
  }

  /** Instantiate(prefabOrGameObject, position?, rotation?, parent?) */
  instantiate(source, position = null, rotation = null, parent = null) {
    let go;
    if (source instanceof GameObject) go = GameObject.deserialize(source.serialize(), this);
    else if (source && source.__isPrefab) go = source.instantiate(this);
    else if (source && source.name && source.components) go = GameObject.deserialize(source, this);
    else throw new Error('[Scene] instantiate: неподдерживаемый источник');
    go.id = uuid();
    reassignIds(go);
    if (position) go.transform.position = position;
    if (rotation) go.transform.rotation = rotation;
    if (parent) go.transform.setParent(parent.transform ?? parent);
    return go;
  }

  destroy(target, delay = 0) {
    if (!target) return;
    if (delay > 0) {
      this._invokes.push({ time: Time.time + delay, fn: () => this.destroy(target, 0), owner: null });
      return;
    }
    if (target.gameObject && !(target instanceof GameObject)) {
      // это компонент
      target.gameObject.removeComponent(target);
      return;
    }
    if (target._destroyed) return;
    target._destroyed = true;
    this._destroyQueue.push(target);
  }

  _flushDestroy() {
    while (this._destroyQueue.length) {
      const go = this._destroyQueue.shift();
      for (const child of [...go.transform.children]) {
        child.gameObject._destroyed = true;
        this._destroyQueue.push(child.gameObject);
      }
      go.transform.setParent(null, false);
      this.remove(go, true);
      this.emit('gameObjectDestroyed', go);
    }
  }

  // ---- Поиск ----
  find(name) { return this.gameObjects.find((g) => g.name === name) ?? null; }
  findAll(name) { return this.gameObjects.filter((g) => g.name === name); }
  findByTag(tag) { return (this._byTag.get(tag) ?? [])[0] ?? null; }
  findAllByTag(tag) { return [...(this._byTag.get(tag) ?? [])]; }
  findById(id) { return this.gameObjects.find((g) => g.id === id) ?? null; }
  findObjectOfType(type) {
    const Ctor = resolveComponent(type);
    const set = this._componentsByType.get(Ctor);
    if (set) for (const c of set) if (!c._destroyed) return c;
    for (const go of this.gameObjects) {
      const c = go.getComponent(Ctor);
      if (c) return c;
    }
    return null;
  }
  findObjectsOfType(type) {
    const Ctor = resolveComponent(type);
    const out = [];
    for (const go of this.gameObjects) out.push(...go.getComponents(Ctor));
    return out;
  }

  _indexTag(go) {
    if (!this._byTag.has(go.tag)) this._byTag.set(go.tag, []);
    this._byTag.get(go.tag).push(go);
  }
  _unindexTag(go) {
    const arr = this._byTag.get(go.tag);
    if (arr) {
      const i = arr.indexOf(go);
      if (i >= 0) arr.splice(i, 1);
    }
  }
  _registerComponent(c) {
    const Ctor = c.constructor;
    if (!this._componentsByType.has(Ctor)) this._componentsByType.set(Ctor, new Set());
    this._componentsByType.get(Ctor).add(c);
    if (!c._started) this._pendingStart.push(c);
  }
  _unregisterComponent(c) {
    this._componentsByType.get(c.constructor)?.delete(c);
    const i = this._pendingStart.indexOf(c);
    if (i >= 0) this._pendingStart.splice(i, 1);
  }

  // ---- Корутины ----
  startCoroutine(genFn, owner = null) {
    const it = typeof genFn === 'function' ? genFn() : genFn;
    const co = { it, owner, done: false, waitUntil: 0, waitPredicate: null, waitPromise: null };
    this._coroutines.push(co);
    this._stepCoroutine(co, undefined);
    return co;
  }

  stopCoroutine(co) {
    if (!co) return;
    co.done = true;
    const i = this._coroutines.indexOf(co);
    if (i >= 0) this._coroutines.splice(i, 1);
  }

  stopAllCoroutines(owner = null) {
    for (const co of [...this._coroutines]) {
      if (!owner || co.owner === owner) this.stopCoroutine(co);
    }
  }

  _stepCoroutine(co, sendValue) {
    let res;
    try { res = co.it.next(sendValue); } catch (e) { console.error('[Coroutine]', e); co.done = true; return; }
    if (res.done) { co.done = true; return; }
    const y = res.value;
    if (y == null) { co.waitUntil = 0; co.waitPredicate = null; return; }
    if (typeof y === 'number') { co.waitUntil = Time.time + y; return; }
    if (typeof y === 'function') { co.waitPredicate = y; return; }
    if (y instanceof Promise || typeof y?.then === 'function') {
      co.waitPromise = y;
      y.then((v) => { co.waitPromise = null; co._resume = v; }, (e) => { console.error('[Coroutine]', e); co.done = true; });
      return;
    }
    if (y.type === 'waitForSeconds') { co.waitUntil = Time.time + y.seconds; return; }
    if (y.type === 'waitForSecondsRealtime') { co.waitUntil = -(Time.unscaledTime + y.seconds); return; }
  }

  _updateCoroutines() {
    for (let i = this._coroutines.length - 1; i >= 0; i--) {
      const co = this._coroutines[i];
      if (co.done || (co.owner && co.owner._destroyed)) { this._coroutines.splice(i, 1); continue; }
      if (co.waitPromise) continue;
      if (co.waitUntil > 0 && Time.time < co.waitUntil) continue;
      if (co.waitUntil < 0 && Time.unscaledTime < -co.waitUntil) continue;
      if (co.waitPredicate && !co.waitPredicate()) continue;
      co.waitUntil = 0; co.waitPredicate = null;
      const v = co._resume; co._resume = undefined;
      this._stepCoroutine(co, v);
      if (co.done) this._coroutines.splice(i, 1);
    }
  }

  invoke(fn, delay = 0, owner = null) {
    const entry = { time: Time.time + delay, fn, owner };
    this._invokes.push(entry);
    return entry;
  }
  cancelInvoke(entry) {
    const i = this._invokes.indexOf(entry);
    if (i >= 0) this._invokes.splice(i, 1);
  }
  _updateInvokes() {
    for (let i = this._invokes.length - 1; i >= 0; i--) {
      const inv = this._invokes[i];
      if (inv.owner && inv.owner._destroyed) { this._invokes.splice(i, 1); continue; }
      if (Time.time >= inv.time) {
        this._invokes.splice(i, 1);
        try { inv.fn(); } catch (e) { console.error('[Invoke]', e); }
      }
    }
  }

  // ---- Жизненный цикл ----
  load() {
    if (this._loaded) return;
    this._loaded = true;
    this._forEachComponent((c) => {
      if (!c._awoken && c.isActiveAndEnabled) { c._awoken = true; c.awake?.(); }
    });
    this._forEachComponent((c) => { if (c.isActiveAndEnabled) c.onEnable?.(); });
    this.emit('loaded');
  }

  unload() {
    this.stopAllCoroutines();
    this._invokes.length = 0;
    for (const go of [...this.gameObjects]) this.remove(go, true);
    this._loaded = false;
    this.emit('unloaded');
  }

  _forEachComponent(fn) {
    for (const go of [...this.gameObjects]) {
      for (const c of [...go.components]) {
        if (c._destroyed) continue;
        fn(c);
      }
    }
  }

  _runStarts() {
    if (!this._pendingStart.length) return;
    const list = this._pendingStart;
    this._pendingStart = [];
    for (const c of list) {
      if (c._destroyed) continue;
      if (!c.isActiveAndEnabled) { this._pendingStart.push(c); continue; }
      c._started = true;
      try { c.start?.(); } catch (e) { console.error(`[Start] ${c.constructor.componentName}`, e); }
    }
  }

  fixedUpdate(dt) {
    this._forEachComponent((c) => { if (c.isActiveAndEnabled && c.fixedUpdate) safeCall(c, 'fixedUpdate', dt); });
    this.physics?.step(dt);
  }

  update(dt) {
    this._runStarts();
    this._forEachComponent((c) => { if (c.isActiveAndEnabled && c.update) safeCall(c, 'update', dt); });
    this._updateCoroutines();
    this._updateInvokes();
  }

  lateUpdate(dt) {
    this._forEachComponent((c) => { if (c.isActiveAndEnabled && c.lateUpdate) safeCall(c, 'lateUpdate', dt); });
    this._flushDestroy();
  }

  onRender(renderer, camera) {
    this._forEachComponent((c) => { if (c.isActiveAndEnabled && c.onRender) safeCall(c, 'onRender', renderer, camera); });
  }

  // ---- Сериализация ----
  serialize() {
    return {
      version: 1,
      name: this.name,
      settings: {
        background: '#' + (this.root.background?.getHexString?.() ?? '0b0e14'),
        fog: this.root.fog ? {
          type: this.root.fog.isFogExp2 ? 'exp2' : 'linear',
          color: '#' + this.root.fog.color.getHexString(),
          near: this.root.fog.near, far: this.root.fog.far, density: this.root.fog.density,
        } : null,
      },
      objects: this.gameObjects.filter((g) => !g.transform.parent).map((g) => g.serialize()),
    };
  }

  static deserialize(data, engine = null) {
    const scene = new Scene(data.name ?? 'Scene');
    scene.engine = engine;
    if (data.settings?.background) scene.root.background = new THREE.Color(data.settings.background);
    const f = data.settings?.fog;
    if (f) {
      scene.root.fog = f.type === 'exp2'
        ? new THREE.FogExp2(f.color, f.density ?? 0.02)
        : new THREE.Fog(f.color, f.near ?? 10, f.far ?? 200);
    }
    for (const od of data.objects ?? []) GameObject.deserialize(od, scene);
    return scene;
  }
}

function safeCall(c, method, ...args) {
  try { c[method](...args); }
  catch (e) { console.error(`[${method}] ${c.constructor.componentName ?? c.constructor.name}`, e); }
}

function reassignIds(go) {
  go.id = uuid();
  for (const c of go.components) c.id = uuid();
  for (const child of go.transform.children) reassignIds(child.gameObject);
}

// Утилиты корутин (Unity-стиль)
export const WaitForSeconds = (s) => ({ type: 'waitForSeconds', seconds: s });
export const WaitForSecondsRealtime = (s) => ({ type: 'waitForSecondsRealtime', seconds: s });
export const WaitUntil = (pred) => pred;
export const WaitWhile = (pred) => () => !pred();
export const WaitForNextFrame = () => null;

/** Привести значение к THREE.Vector3: Vector3 | [x,y,z] | {x,y,z} */
function toVec3(v) {
  if (v?.isVector3) return v;
  if (Array.isArray(v)) return new THREE.Vector3(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
  return new THREE.Vector3(v?.x ?? 0, v?.y ?? 0, v?.z ?? 0);
}
