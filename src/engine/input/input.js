// WFL Engine — единая система ввода: клавиатура, мышь, тач, геймпад, гироскоп
import * as THREE from 'three';
import { Mathf } from '../core/math.js';
import { EventEmitter } from '../core/events.js';

export class Touch {
  constructor(id) {
    this.fingerId = id;
    this.position = new THREE.Vector2();
    this.rawPosition = new THREE.Vector2();
    this.deltaPosition = new THREE.Vector2();
    this.startPosition = new THREE.Vector2();
    this.phase = 'began'; // began | moved | stationary | ended | canceled
    this.startTime = 0;
    this.pressure = 1;
    this.tapCount = 1;
  }
}

class AxisDef {
  constructor(name, opts = {}) {
    this.name = name;
    this.positiveKeys = opts.positiveKeys ?? [];
    this.negativeKeys = opts.negativeKeys ?? [];
    this.gravity = opts.gravity ?? 3;
    this.sensitivity = opts.sensitivity ?? 3;
    this.snap = opts.snap ?? true;
    this.deadZone = opts.deadZone ?? 0.001;
    this.value = 0;
    this.rawValue = 0;
    /** внешние источники (виртуальный джойстик, геймпад) */
    this.external = 0;
  }
}

export class InputSystem extends EventEmitter {
  constructor(engine) {
    super();
    this.engine = engine;
    this.element = null;

    this._keys = new Set();
    this._keysDown = new Set();
    this._keysUp = new Set();

    this._mouseButtons = new Set();
    this._mouseDown = new Set();
    this._mouseUp = new Set();
    this.mousePosition = new THREE.Vector2();
    this.mouseDelta = new THREE.Vector2();
    this.mouseScrollDelta = new THREE.Vector2();
    this._pendingMouseDelta = new THREE.Vector2();
    this._pendingScroll = new THREE.Vector2();

    /** @type {Map<number, Touch>} */
    this._touchMap = new Map();
    /** @type {Touch[]} */
    this.touches = [];
    this.touchCount = 0;
    this.multiTouchEnabled = true;

    this.gyro = { enabled: false, alpha: 0, beta: 0, gamma: 0, quaternion: new THREE.Quaternion() };
    this.acceleration = new THREE.Vector3();

    this.gamepads = [];
    this.gamepadDeadZone = 0.15;

    this.axes = new Map();
    this._virtualAxes = new Map();
    this._virtualButtons = new Set();
    this._virtualButtonsDown = new Set();
    this._virtualButtonsUp = new Set();

    this.isMobile = detectMobile();
    this.isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

    this._setupDefaultAxes();
    this._bound = {};
    this._pointerLocked = false;
    this._simulateMouseWithTouch = true;
  }

  _setupDefaultAxes() {
    this.defineAxis('Horizontal', {
      positiveKeys: ['KeyD', 'ArrowRight'], negativeKeys: ['KeyA', 'ArrowLeft'],
    });
    this.defineAxis('Vertical', {
      positiveKeys: ['KeyW', 'ArrowUp'], negativeKeys: ['KeyS', 'ArrowDown'],
    });
    this.defineAxis('Mouse X', { sensitivity: 1 });
    this.defineAxis('Mouse Y', { sensitivity: 1 });
  }

  defineAxis(name, opts) {
    const a = new AxisDef(name, opts);
    this.axes.set(name, a);
    return a;
  }

  attach(element) {
    this.element = element;
    const target = element;
    const win = window;

    this._bound.keydown = (e) => {
      if (e.repeat) return;
      this._keys.add(e.code);
      this._keysDown.add(e.code);
      this.emit('keydown', e.code, e);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) {
        if (document.activeElement === document.body || document.activeElement === target) e.preventDefault();
      }
    };
    this._bound.keyup = (e) => {
      this._keys.delete(e.code);
      this._keysUp.add(e.code);
      this.emit('keyup', e.code, e);
    };
    this._bound.blur = () => {
      this._keys.clear(); this._mouseButtons.clear();
      this._touchMap.clear(); this.touches = []; this.touchCount = 0;
    };

    this._bound.mousedown = (e) => {
      this._mouseButtons.add(e.button);
      this._mouseDown.add(e.button);
      this._updateMousePos(e);
      this.emit('mousedown', e.button, e);
    };
    this._bound.mouseup = (e) => {
      this._mouseButtons.delete(e.button);
      this._mouseUp.add(e.button);
      this.emit('mouseup', e.button, e);
    };
    this._bound.mousemove = (e) => {
      this._updateMousePos(e);
      this._pendingMouseDelta.x += e.movementX ?? 0;
      this._pendingMouseDelta.y += e.movementY ?? 0;
    };
    this._bound.wheel = (e) => {
      this._pendingScroll.x += e.deltaX;
      this._pendingScroll.y += e.deltaY;
      if (e.cancelable) e.preventDefault();
    };
    this._bound.contextmenu = (e) => e.preventDefault();

    this._bound.touchstart = (e) => this._handleTouch(e, 'began');
    this._bound.touchmove = (e) => this._handleTouch(e, 'moved');
    this._bound.touchend = (e) => this._handleTouch(e, 'ended');
    this._bound.touchcancel = (e) => this._handleTouch(e, 'canceled');

    target.addEventListener('mousedown', this._bound.mousedown);
    win.addEventListener('mouseup', this._bound.mouseup);
    win.addEventListener('mousemove', this._bound.mousemove);
    target.addEventListener('wheel', this._bound.wheel, { passive: false });
    target.addEventListener('contextmenu', this._bound.contextmenu);
    win.addEventListener('keydown', this._bound.keydown);
    win.addEventListener('keyup', this._bound.keyup);
    win.addEventListener('blur', this._bound.blur);
    target.addEventListener('touchstart', this._bound.touchstart, { passive: false });
    target.addEventListener('touchmove', this._bound.touchmove, { passive: false });
    win.addEventListener('touchend', this._bound.touchend, { passive: false });
    win.addEventListener('touchcancel', this._bound.touchcancel, { passive: false });

    document.addEventListener('pointerlockchange', () => {
      this._pointerLocked = document.pointerLockElement === this.element;
      this.emit('pointerlockchange', this._pointerLocked);
    });
  }

  detach() {
    if (!this.element) return;
    const t = this.element, w = window;
    t.removeEventListener('mousedown', this._bound.mousedown);
    w.removeEventListener('mouseup', this._bound.mouseup);
    w.removeEventListener('mousemove', this._bound.mousemove);
    t.removeEventListener('wheel', this._bound.wheel);
    t.removeEventListener('contextmenu', this._bound.contextmenu);
    w.removeEventListener('keydown', this._bound.keydown);
    w.removeEventListener('keyup', this._bound.keyup);
    w.removeEventListener('blur', this._bound.blur);
    t.removeEventListener('touchstart', this._bound.touchstart);
    t.removeEventListener('touchmove', this._bound.touchmove);
    w.removeEventListener('touchend', this._bound.touchend);
    w.removeEventListener('touchcancel', this._bound.touchcancel);
    this.element = null;
  }

  _updateMousePos(e) {
    const rect = this.element?.getBoundingClientRect();
    if (!rect) return;
    this.mousePosition.set(e.clientX - rect.left, rect.height - (e.clientY - rect.top));
  }

  _handleTouch(e, phase) {
    const rect = this.element?.getBoundingClientRect();
    if (!rect) return;
    if (e.cancelable && e.target === this.element) e.preventDefault();
    const list = e.changedTouches;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const x = t.clientX - rect.left;
      const y = rect.height - (t.clientY - rect.top);
      let touch = this._touchMap.get(t.identifier);
      if (phase === 'began') {
        if (!this.multiTouchEnabled && this._touchMap.size >= 1) continue;
        touch = new Touch(t.identifier);
        touch.position.set(x, y);
        touch.rawPosition.set(x, y);
        touch.startPosition.set(x, y);
        touch.startTime = performance.now() / 1000;
        touch.phase = 'began';
        this._touchMap.set(t.identifier, touch);
        this.emit('touchstart', touch);
      } else if (touch) {
        touch.deltaPosition.set(x - touch.position.x, y - touch.position.y);
        touch.position.set(x, y);
        touch.rawPosition.set(x, y);
        touch.phase = phase;
        touch.pressure = t.force || 1;
        if (phase === 'ended' || phase === 'canceled') this.emit('touchend', touch);
        else this.emit('touchmove', touch);
      }
    }
    this._syncTouches();
    // эмуляция мыши для единого кода
    if (this._simulateMouseWithTouch && this.touches.length) {
      this.mousePosition.copy(this.touches[0].position);
      if (phase === 'began') { this._mouseButtons.add(0); this._mouseDown.add(0); }
      if (phase === 'ended' || phase === 'canceled') {
        if (this._touchMap.size === 0) { this._mouseButtons.delete(0); this._mouseUp.add(0); }
      }
      if (phase === 'moved') {
        this._pendingMouseDelta.x += this.touches[0].deltaPosition.x;
        this._pendingMouseDelta.y -= this.touches[0].deltaPosition.y;
      }
    }
  }

  _syncTouches() {
    this.touches = Array.from(this._touchMap.values());
    this.touchCount = this.touches.length;
  }

  // ---- Гироскоп / акселерометр ----
  async enableGyro() {
    if (typeof DeviceOrientationEvent === 'undefined') return false;
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') return false;
      }
    } catch { return false; }
    window.addEventListener('deviceorientation', (e) => {
      this.gyro.alpha = e.alpha ?? 0;
      this.gyro.beta = e.beta ?? 0;
      this.gyro.gamma = e.gamma ?? 0;
      const euler = new THREE.Euler(
        (e.beta ?? 0) * Mathf.Deg2Rad,
        (e.alpha ?? 0) * Mathf.Deg2Rad,
        -(e.gamma ?? 0) * Mathf.Deg2Rad, 'YXZ');
      this.gyro.quaternion.setFromEuler(euler);
    });
    window.addEventListener('devicemotion', (e) => {
      const a = e.accelerationIncludingGravity;
      if (a) this.acceleration.set(a.x ?? 0, a.y ?? 0, a.z ?? 0);
    });
    this.gyro.enabled = true;
    return true;
  }

  vibrate(pattern = 30) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch {} }
  }

  requestPointerLock() { this.element?.requestPointerLock?.(); }
  exitPointerLock() { document.exitPointerLock?.(); }
  get pointerLocked() { return this._pointerLocked; }

  // ---- Виртуальные оси/кнопки (мобильный UI) ----
  setVirtualAxis(name, value) { this._virtualAxes.set(name, Mathf.clamp(value, -1, 1)); }
  clearVirtualAxis(name) { this._virtualAxes.delete(name); }
  setVirtualButton(name, pressed) {
    const was = this._virtualButtons.has(name);
    if (pressed && !was) { this._virtualButtons.add(name); this._virtualButtonsDown.add(name); }
    else if (!pressed && was) { this._virtualButtons.delete(name); this._virtualButtonsUp.add(name); }
  }

  // ---- Публичный API (Unity-подобный) ----
  getKey(code) { return this._keys.has(normKey(code)); }
  getKeyDown(code) { return this._keysDown.has(normKey(code)); }
  getKeyUp(code) { return this._keysUp.has(normKey(code)); }
  getMouseButton(b) { return this._mouseButtons.has(b); }
  getMouseButtonDown(b) { return this._mouseDown.has(b); }
  getMouseButtonUp(b) { return this._mouseUp.has(b); }
  getTouch(i) { return this.touches[i]; }

  getButton(name) {
    if (this._virtualButtons.has(name)) return true;
    const map = DEFAULT_BUTTONS[name];
    if (map) {
      for (const k of map.keys ?? []) if (this._keys.has(k)) return true;
      for (const gb of map.gamepad ?? []) if (this._gamepadButton(gb)) return true;
    }
    return false;
  }
  getButtonDown(name) {
    if (this._virtualButtonsDown.has(name)) return true;
    const map = DEFAULT_BUTTONS[name];
    if (map) for (const k of map.keys ?? []) if (this._keysDown.has(k)) return true;
    return false;
  }
  getButtonUp(name) {
    if (this._virtualButtonsUp.has(name)) return true;
    const map = DEFAULT_BUTTONS[name];
    if (map) for (const k of map.keys ?? []) if (this._keysUp.has(k)) return true;
    return false;
  }

  getAxis(name) {
    if (name === 'Mouse X') return this.mouseDelta.x * (this.axes.get('Mouse X')?.sensitivity ?? 1);
    if (name === 'Mouse Y') return this.mouseDelta.y * (this.axes.get('Mouse Y')?.sensitivity ?? 1);
    const a = this.axes.get(name);
    if (!a) return this._virtualAxes.get(name) ?? 0;
    return a.value;
  }

  getAxisRaw(name) {
    if (name === 'Mouse X') return this.mouseDelta.x;
    if (name === 'Mouse Y') return this.mouseDelta.y;
    const a = this.axes.get(name);
    if (!a) return this._virtualAxes.get(name) ?? 0;
    return a.rawValue;
  }

  /** Двумерный вектор перемещения — учитывает клавиши, джойстик, геймпад */
  getMoveVector() {
    return new THREE.Vector2(this.getAxis('Horizontal'), this.getAxis('Vertical'));
  }

  _gamepadButton(index) {
    for (const gp of this.gamepads) {
      if (gp?.buttons?.[index]?.pressed) return true;
    }
    return false;
  }

  _pollGamepads() {
    if (!navigator.getGamepads) return;
    this.gamepads = Array.from(navigator.getGamepads()).filter(Boolean);
  }

  _update(dt) {
    this._pollGamepads();
    this.mouseDelta.copy(this._pendingMouseDelta);
    this._pendingMouseDelta.set(0, 0);
    this.mouseScrollDelta.copy(this._pendingScroll);
    this._pendingScroll.set(0, 0);

    // стационарные тачи
    for (const t of this.touches) {
      if (t.phase === 'moved') t.phase = 'stationary';
      else if (t.phase === 'began') t.phase = 'stationary';
    }

    // расчёт осей
    for (const a of this.axes.values()) {
      if (a.name === 'Mouse X' || a.name === 'Mouse Y') continue;
      let raw = 0;
      for (const k of a.positiveKeys) if (this._keys.has(k)) { raw = 1; break; }
      if (raw === 0) for (const k of a.negativeKeys) if (this._keys.has(k)) { raw = -1; break; }

      const virt = this._virtualAxes.get(a.name);
      if (virt !== undefined && Math.abs(virt) > a.deadZone) raw = virt;

      const gpVal = this._gamepadAxisFor(a.name);
      if (gpVal !== null && Math.abs(gpVal) > this.gamepadDeadZone) raw = gpVal;

      a.rawValue = raw;
      if (raw !== 0) {
        if (a.snap && Math.sign(raw) !== Math.sign(a.value) && a.value !== 0) a.value = 0;
        a.value = Mathf.moveTowards(a.value, raw, a.sensitivity * dt);
      } else {
        a.value = Mathf.moveTowards(a.value, 0, a.gravity * dt);
      }
    }
  }

  _gamepadAxisFor(name) {
    const gp = this.gamepads[0];
    if (!gp) return null;
    if (name === 'Horizontal') return gp.axes[0] ?? null;
    if (name === 'Vertical') return -(gp.axes[1] ?? 0);
    if (name === 'LookX') return gp.axes[2] ?? null;
    if (name === 'LookY') return -(gp.axes[3] ?? 0);
    return null;
  }

  /** Сброс "нажато в этом кадре" — вызывается в конце кадра */
  _endFrame() {
    this._keysDown.clear();
    this._keysUp.clear();
    this._mouseDown.clear();
    this._mouseUp.clear();
    this._virtualButtonsDown.clear();
    this._virtualButtonsUp.clear();
    for (const [id, t] of this._touchMap) {
      if (t.phase === 'ended' || t.phase === 'canceled') this._touchMap.delete(id);
      else t.deltaPosition.set(0, 0);
    }
    this._syncTouches();
  }
}

const DEFAULT_BUTTONS = {
  Jump: { keys: ['Space'], gamepad: [0] },
  Fire1: { keys: ['ControlLeft', 'Mouse0'], gamepad: [7] },
  Fire2: { keys: ['AltLeft'], gamepad: [6] },
  Sprint: { keys: ['ShiftLeft', 'ShiftRight'], gamepad: [10] },
  Crouch: { keys: ['KeyC', 'ControlLeft'], gamepad: [1] },
  Interact: { keys: ['KeyE'], gamepad: [2] },
  Cancel: { keys: ['Escape'], gamepad: [1] },
  Submit: { keys: ['Enter'], gamepad: [0] },
};

function normKey(code) {
  if (code.length === 1) {
    const c = code.toUpperCase();
    if (c >= 'A' && c <= 'Z') return 'Key' + c;
    if (c >= '0' && c <= '9') return 'Digit' + c;
  }
  const aliases = {
    space: 'Space', escape: 'Escape', esc: 'Escape', enter: 'Enter', return: 'Enter',
    shift: 'ShiftLeft', ctrl: 'ControlLeft', alt: 'AltLeft', tab: 'Tab',
    up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
  };
  return aliases[String(code).toLowerCase()] ?? code;
}

export function detectMobile() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
  if (navigator.userAgentData?.mobile) return true;
  return (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)); // iPadOS
}
