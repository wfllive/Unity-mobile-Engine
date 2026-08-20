// WFL Engine — главный класс движка
import * as THREE from 'three';
import { Time } from './core/time.js';
import { EventEmitter } from './core/events.js';
import { Scene } from './core/scene.js';
import { GameObject } from './core/gameobject.js';
import { InputSystem, detectMobile } from './input/input.js';
import { TouchControls } from './input/touch-controls.js';
import { PhysicsWorld, LayerMask } from './physics/physics.js';
import { Renderer, QualityLevel } from './rendering/renderer.js';
import { CameraComponent } from './rendering/components.js';
import { AssetManager } from './assets/assets.js';
import { Audio } from './audio/audio.js';
import { UIManager } from './ui/ui.js';
import { Tweens } from './animation/animation.js';

export class Engine extends EventEmitter {
  /**
   * @param {object} opts
   * @param {HTMLElement|string} opts.container контейнер или селектор
   */
  constructor(opts = {}) {
    super();
    this.options = {
      quality: opts.quality,
      targetFPS: opts.targetFPS ?? 0,
      fixedTimeStep: opts.fixedTimeStep ?? 1 / 60,
      autoStart: opts.autoStart ?? false,
      touchControls: opts.touchControls ?? 'auto',
      pauseOnBlur: opts.pauseOnBlur ?? true,
      antialias: opts.antialias,
      adaptiveQuality: opts.adaptiveQuality,
      ...opts,
    };

    this.isMobile = detectMobile();
    this.container = resolveContainer(opts.container);
    this.container.style.position ||= 'relative';
    this.container.style.overflow = 'hidden';

    this.canvas = opts.canvas ?? document.createElement('canvas');
    if (!this.canvas.parentElement) {
      Object.assign(this.canvas.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none' });
      this.container.appendChild(this.canvas);
    }

    this.renderer = new Renderer(this.canvas, {
      isMobile: this.isMobile,
      quality: this.options.quality,
      antialias: this.options.antialias,
      adaptiveQuality: this.options.adaptiveQuality,
    });

    this.input = new InputSystem(this);
    this.input.attach(this.canvas);

    this.physics = new PhysicsWorld({ fixedTimeStep: this.options.fixedTimeStep });
    this.assets = new AssetManager(this);
    this.audio = Audio;
    this.ui = new UIManager(this);
    this.tweens = Tweens;
    /** @type {Map<string, GameObject>} реестр префабов */
    this.prefabs = new Map();

    /** @type {Scene|null} */
    this.scene = null;
    this.scenes = new Map();

    this.isRunning = false;
    this.isPaused = false;
    this._rafId = null;
    this._accumulator = 0;
    this._lastFrameTime = 0;

    /** @type {TouchControls|null} */
    this.touchControls = null;
    const wantsTouch = this.options.touchControls === true
      || (this.options.touchControls === 'auto' && (this.isMobile || this.input.isTouchDevice));
    if (wantsTouch) {
      this.touchControls = new TouchControls(this);
      this.touchControls.setupDefault();
    }

    this._setupResize();
    this._setupVisibility();
    this.stats = { fps: 0, frameMs: 0, updateMs: 0, physicsMs: 0, renderMs: 0, objects: 0 };
    this._frameHooks = [];

    Time.reset();
    Time.fixedDeltaTime = this.options.fixedTimeStep;

    if (this.options.autoStart) this.start();
  }

  // ---- Сцены ----
  createScene(name = 'Scene') {
    const scene = new Scene(name);
    scene.engine = this;
    scene.physics = this.physics;
    this.scenes.set(name, scene);
    return scene;
  }

  loadScene(sceneOrName) {
    const scene = typeof sceneOrName === 'string' ? this.scenes.get(sceneOrName) : sceneOrName;
    if (!scene) { console.error(`[Engine] сцена не найдена: ${sceneOrName}`); return null; }
    if (this.scene && this.scene !== scene) {
      this.emit('sceneUnloading', this.scene);
      this.scene.unload();
      this.physics.clear();
    }
    this.scene = scene;
    scene.engine = this;
    scene.physics = this.physics;
    if (!this.scenes.has(scene.name)) this.scenes.set(scene.name, scene);
    scene.load();
    this._resize();
    this.emit('sceneLoaded', scene);
    return scene;
  }

  loadSceneFromJSON(json, activate = true) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const scene = Scene.deserialize(data, this);
    scene.physics = this.physics;
    this.scenes.set(scene.name, scene);
    if (activate) this.loadScene(scene);
    return scene;
  }

  get mainCamera() {
    if (this.scene?.mainCamera?.isActiveAndEnabled) return this.scene.mainCamera;
    const cams = this.scene?.findObjectsOfType(CameraComponent) ?? [];
    const active = cams.filter((c) => c.isActiveAndEnabled).sort((a, b) => b.depth - a.depth);
    if (active.length) { if (this.scene) this.scene.mainCamera = active[0]; return active[0]; }
    return null;
  }

  // ---- Цикл ----
  start() {
    if (this.isRunning) return this;
    this.isRunning = true;
    this.isPaused = false;
    Time.reset();
    this._lastFrameTime = performance.now();
    this._loop(this._lastFrameTime);
    this.emit('started');
    return this;
  }

  stop() {
    this.isRunning = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
    this.emit('stopped');
    return this;
  }

  pause() { this.isPaused = true; this.emit('paused'); return this; }
  resume() {
    if (!this.isPaused) return this;
    this.isPaused = false;
    Time._lastMs = performance.now();
    this.emit('resumed');
    return this;
  }

  /** Один шаг вручную (для тестов и покадрового режима) */
  tick(nowMs = performance.now()) { this._frame(nowMs); }

  _loop(now) {
    if (!this.isRunning) return;
    this._rafId = requestAnimationFrame((t) => this._loop(t));
    if (this.options.targetFPS > 0) {
      const minDelta = 1000 / this.options.targetFPS;
      if (now - this._lastFrameTime < minDelta - 0.5) return;
    }
    this._lastFrameTime = now;
    this._frame(now);
  }

  _frame(now) {
    const frameStart = performance.now();
    const dt = Time._tick(now);
    if (this.isPaused) {
      this.input._update(Time.unscaledDeltaTime);
      this.input._endFrame();
      this._render();
      return;
    }

    this.input._update(Time.unscaledDeltaTime);
    this.touchControls?.update();

    const scene = this.scene;
    if (scene) {
      // Физика с фиксированным шагом
      const p0 = performance.now();
      this._accumulator += dt;
      const step = this.physics.fixedTimeStep;
      let steps = 0;
      while (this._accumulator >= step && steps < this.physics.maxSubSteps) {
        Time.fixedDeltaTime = step;
        scene.fixedUpdate(step);
        this._accumulator -= step;
        steps++;
      }
      if (steps === this.physics.maxSubSteps) this._accumulator = 0;
      this.stats.physicsMs = performance.now() - p0;

      const u0 = performance.now();
      this.tweens.update(dt, Time.unscaledDeltaTime);
      scene.update(dt);
      for (const hook of this._frameHooks) hook(dt);
      scene.lateUpdate(dt);
      this.stats.updateMs = performance.now() - u0;
      this.stats.objects = scene.gameObjects.length;
    }

    this._render();
    this.input._endFrame();

    this.stats.fps = Time.fps;
    this.stats.frameMs = performance.now() - frameStart;
    this.renderer.updateAdaptive(Time.fps, Time.unscaledDeltaTime);
    this.emit('frame', dt);
  }

  _render() {
    const cam = this.mainCamera;
    if (!this.scene || !cam) return;
    const r0 = performance.now();
    cam.setAspect(this.renderer.width / Math.max(1, this.renderer.height));
    this.scene.onRender(this.renderer, cam);
    this.renderer.render(this.scene.root, cam.camera);
    this.stats.renderMs = performance.now() - r0;
  }

  addFrameHook(fn) { this._frameHooks.push(fn); return () => this.removeFrameHook(fn); }
  removeFrameHook(fn) {
    const i = this._frameHooks.indexOf(fn);
    if (i >= 0) this._frameHooks.splice(i, 1);
  }

  // ---- Размеры ----
  _setupResize() {
    this._resize = () => {
      const rect = this.container.getBoundingClientRect();
      const w = Math.max(1, rect.width || this.container.clientWidth || window.innerWidth);
      const h = Math.max(1, rect.height || this.container.clientHeight || window.innerHeight);
      this.renderer.setSize(w, h);
      const cam = this.mainCamera;
      if (cam) cam.setAspect(w / h);
      this.emit('resize', w, h);
    };
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => this._resize());
      this._resizeObserver.observe(this.container);
    }
    window.addEventListener('resize', this._resize);
    window.addEventListener('orientationchange', () => setTimeout(this._resize, 120));
    this._resize();
  }

  _setupVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this._wasRunningBeforeHide = !this.isPaused;
        if (this.options.pauseOnBlur) this.pause();
        this.emit('backgrounded');
      } else {
        if (this.options.pauseOnBlur && this._wasRunningBeforeHide) this.resume();
        this.emit('foregrounded');
      }
    });
  }

  // ---- Утилиты ----
  /** Луч из точки экрана (координаты в пикселях, Y снизу) */
  screenPointToRay(x, y) {
    const cam = this.mainCamera;
    if (!cam) return null;
    return cam.screenPointToRay(x, y, this.renderer.width, this.renderer.height);
  }

  /** Пикинг объекта под указателем */
  pick(screenX, screenY, maxDistance = 1000) {
    const ray = this.screenPointToRay(screenX, screenY);
    if (!ray) return null;
    return this.physics.raycast(ray.origin, ray.direction, maxDistance, LayerMask.everything, true);
  }

  /** Пикинг средствами three.js (по видимой геометрии, без коллайдеров) */
  pickVisual(screenX, screenY) {
    const cam = this.mainCamera;
    if (!cam || !this.scene) return null;
    const ndc = new THREE.Vector2(
      (screenX / this.renderer.width) * 2 - 1,
      (screenY / this.renderer.height) * 2 - 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, cam.camera);
    const hits = rc.intersectObjects(this.scene.root.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.gameObject) o = o.parent;
      if (o?.userData.gameObject && !o.userData.gameObject._destroyed) {
        return { gameObject: o.userData.gameObject, point: h.point.clone(), distance: h.distance, object: h.object };
      }
    }
    return null;
  }

  setQuality(level) { this.renderer.setQuality(level); return this; }

  async requestFullscreen() {
    const el = this.container;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      if (screen.orientation?.lock) {
        try { await screen.orientation.lock('landscape'); } catch {}
      }
      return true;
    } catch { return false; }
  }

  exitFullscreen() {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }

  screenshot(mime = 'image/png') {
    this._render();
    return this.canvas.toDataURL(mime);
  }

  dispose() {
    this.stop();
    this.scene?.unload();
    this.input.detach();
    this.touchControls?.clear();
    this._resizeObserver?.disconnect();
    window.removeEventListener('resize', this._resize);
    this.renderer.dispose();
    this.assets.unloadAll();
    this.ui?.dispose();
    this.tweens?.clear();
    this.physics.clear();
    this.emit('disposed');
  }
}

function resolveContainer(c) {
  if (!c) {
    const div = document.createElement('div');
    Object.assign(div.style, { position: 'fixed', inset: '0' });
    document.body.appendChild(div);
    return div;
  }
  if (typeof c === 'string') {
    const el = document.querySelector(c);
    if (!el) throw new Error(`[Engine] контейнер не найден: ${c}`);
    return el;
  }
  return c;
}

export { QualityLevel };
