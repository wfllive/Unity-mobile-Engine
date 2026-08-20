// WFL Engine — экранные элементы управления для мобильных: джойстики, кнопки, зоны обзора
import { Mathf } from '../core/math.js';

const NS = 'http://www.w3.org/2000/svg';

/** Виртуальный джойстик, пишет значения в оси InputSystem */
export class VirtualJoystick {
  constructor(input, opts = {}) {
    this.input = input;
    this.axisX = opts.axisX ?? 'Horizontal';
    this.axisY = opts.axisY ?? 'Vertical';
    this.radius = opts.radius ?? 60;
    this.deadZone = opts.deadZone ?? 0.12;
    this.dynamic = opts.dynamic ?? false;   // появляется под пальцем
    this.side = opts.side ?? 'left';
    this.value = { x: 0, y: 0 };
    this.pointerId = null;

    const root = document.createElement('div');
    root.className = 'wfl-joystick wfl-joystick-' + this.side;
    root.innerHTML = `
      <div class="wfl-joystick-base"></div>
      <div class="wfl-joystick-knob"></div>`;
    Object.assign(root.style, {
      position: 'absolute', width: this.radius * 2 + 'px', height: this.radius * 2 + 'px',
      touchAction: 'none', pointerEvents: 'auto', userSelect: 'none',
      [this.side]: '24px', bottom: '28px',
    });
    if (this.dynamic) root.style.opacity = '0';
    this.el = root;
    this.base = root.querySelector('.wfl-joystick-base');
    this.knob = root.querySelector('.wfl-joystick-knob');
    this.center = { x: 0, y: 0 };

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
  }

  mount(container) {
    container.appendChild(this.el);
    const target = this.dynamic ? container : this.el;
    this._target = target;
    target.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
    return this;
  }

  unmount() {
    this._target?.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    this.el.remove();
  }

  _onDown(e) {
    if (this.pointerId !== null) return;
    if (this.dynamic) {
      const rect = this._target.getBoundingClientRect();
      const half = rect.width / 2;
      const isLeft = e.clientX - rect.left < half;
      if ((this.side === 'left') !== isLeft) return;
      this.el.style.left = (e.clientX - rect.left - this.radius) + 'px';
      this.el.style.top = (e.clientY - rect.top - this.radius) + 'px';
      this.el.style.right = 'auto'; this.el.style.bottom = 'auto';
      this.el.style.opacity = '1';
    }
    this.pointerId = e.pointerId;
    const r = this.el.getBoundingClientRect();
    this.center.x = r.left + r.width / 2;
    this.center.y = r.top + r.height / 2;
    this._update(e.clientX, e.clientY);
    e.preventDefault();
  }

  _onMove(e) {
    if (e.pointerId !== this.pointerId) return;
    this._update(e.clientX, e.clientY);
    e.preventDefault();
  }

  _onUp(e) {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.value.x = 0; this.value.y = 0;
    this.knob.style.transform = 'translate(0px, 0px)';
    this.input.clearVirtualAxis(this.axisX);
    this.input.clearVirtualAxis(this.axisY);
    if (this.dynamic) this.el.style.opacity = '0';
  }

  _update(cx, cy) {
    let dx = cx - this.center.x;
    let dy = cy - this.center.y;
    const dist = Math.hypot(dx, dy);
    const max = this.radius;
    if (dist > max) { dx = (dx / dist) * max; dy = (dy / dist) * max; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    let nx = dx / max, ny = -dy / max;
    const mag = Math.hypot(nx, ny);
    if (mag < this.deadZone) { nx = 0; ny = 0; }
    else {
      const scaled = (mag - this.deadZone) / (1 - this.deadZone);
      nx = (nx / mag) * scaled; ny = (ny / mag) * scaled;
    }
    this.value.x = nx; this.value.y = ny;
    this.input.setVirtualAxis(this.axisX, nx);
    this.input.setVirtualAxis(this.axisY, ny);
  }
}

/**
 * Значки экранных кнопок. Рисуем SVG, а не символы юникода:
 * шрифтовые глифы по-разному выглядят на разных устройствах.
 */
const svg = (body) => '<svg viewBox="0 0 24 24" width="45%" height="45%" fill="none"'
  + ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
  + body + '</svg>';

export const TOUCH_ICON = {
  jump: svg('<path d="M12 20V5"/><path d="M6 11l6-6 6 6"/>'),
  fire: svg('<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/>'),
  sprint: svg('<path d="M5 7l6 5-6 5"/><path d="M13 7l6 5-6 5"/>'),
  crouch: svg('<path d="M12 4v15"/><path d="M6 13l6 6 6-6"/>'),
};

/** Экранная кнопка */
export class TouchButton {
  constructor(input, opts = {}) {
    this.input = input;
    this.buttonName = opts.button ?? 'Jump';
    this.label = opts.label ?? this.buttonName;
    this.size = opts.size ?? 64;
    this.haptic = opts.haptic ?? true;
    this.onPress = opts.onPress ?? null;
    this.onRelease = opts.onRelease ?? null;

    const el = document.createElement('div');
    el.className = 'wfl-touch-button';
    // Иконка предпочтительнее подписи: она читается на любом языке
    if (opts.icon) el.innerHTML = opts.icon;
    else el.textContent = this.label;
    Object.assign(el.style, {
      position: 'absolute', width: this.size + 'px', height: this.size + 'px',
      touchAction: 'none', pointerEvents: 'auto', userSelect: 'none',
      ...(opts.style ?? {}),
    });
    this.el = el;
    this.pointerId = null;

    el.addEventListener('pointerdown', (e) => {
      if (this.pointerId !== null) return;
      this.pointerId = e.pointerId;
      el.classList.add('active');
      this.input.setVirtualButton(this.buttonName, true);
      if (this.haptic) this.input.vibrate(15);
      this.onPress?.();
      e.preventDefault(); e.stopPropagation();
    });
    const up = (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      el.classList.remove('active');
      this.input.setVirtualButton(this.buttonName, false);
      this.onRelease?.();
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  mount(container) { container.appendChild(this.el); return this; }
  unmount() { this.el.remove(); }
}

/** Зона свайпа для поворота камеры — пишет в оси LookX/LookY */
export class TouchLookArea {
  constructor(input, opts = {}) {
    this.input = input;
    this.sensitivity = opts.sensitivity ?? 0.25;
    this.axisX = opts.axisX ?? 'LookX';
    this.axisY = opts.axisY ?? 'LookY';
    this.side = opts.side ?? 'right'; // right | full
    this.invertY = opts.invertY ?? false;
    this.pointerId = null;
    this.last = { x: 0, y: 0 };
    this.delta = { x: 0, y: 0 };

    const el = document.createElement('div');
    el.className = 'wfl-look-area';
    Object.assign(el.style, {
      position: 'absolute', top: '0', bottom: '0',
      left: this.side === 'right' ? '50%' : '0', right: '0',
      touchAction: 'none', pointerEvents: 'auto',
    });
    this.el = el;

    el.addEventListener('pointerdown', (e) => {
      if (this.pointerId !== null) return;
      this.pointerId = e.pointerId;
      this.last.x = e.clientX; this.last.y = e.clientY;
      e.preventDefault();
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.delta.x += (e.clientX - this.last.x) * this.sensitivity;
      this.delta.y += (e.clientY - this.last.y) * this.sensitivity * (this.invertY ? -1 : 1);
      this.last.x = e.clientX; this.last.y = e.clientY;
    });
    const up = (e) => { if (e.pointerId === this.pointerId) this.pointerId = null; };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  mount(container) { container.appendChild(this.el); return this; }
  unmount() { this.el.remove(); }

  /** Считать и обнулить накопленную дельту (вызывается движком каждый кадр) */
  consume() {
    const d = { x: this.delta.x, y: this.delta.y };
    this.delta.x = 0; this.delta.y = 0;
    this.input.setVirtualAxis(this.axisX, Mathf.clamp(d.x, -1, 1));
    this.input.setVirtualAxis(this.axisY, Mathf.clamp(-d.y, -1, 1));
    return d;
  }
}

/** Менеджер мобильного HUD */
export class TouchControls {
  constructor(engine, opts = {}) {
    this.engine = engine;
    this.input = engine.input;
    this.container = document.createElement('div');
    this.container.className = 'wfl-touch-controls';
    Object.assign(this.container.style, {
      position: 'absolute', inset: '0', pointerEvents: 'none',
      zIndex: '20', overflow: 'hidden',
      // безопасные зоны для «чёлки»
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    });
    this.joysticks = [];
    this.buttons = [];
    this.lookAreas = [];
    this.visible = false;
    this._injectStyles();
    if (opts.autoMount !== false) this.mount(engine.container);
  }

  _injectStyles() {
    if (document.getElementById('wfl-touch-styles')) return;
    const s = document.createElement('style');
    s.id = 'wfl-touch-styles';
    s.textContent = `
.wfl-joystick-base{position:absolute;inset:0;border-radius:50%;
  background:radial-gradient(circle at 50% 50%, rgba(255,255,255,.10), rgba(255,255,255,.04) 60%, transparent 72%);
  border:2px solid rgba(255,255,255,.22);backdrop-filter:blur(6px);box-shadow:0 6px 24px rgba(0,0,0,.35) inset;}
.wfl-joystick-knob{position:absolute;left:50%;top:50%;width:44%;height:44%;margin:-22% 0 0 -22%;
  border-radius:50%;background:linear-gradient(160deg,rgba(255,255,255,.92),rgba(200,215,255,.7));
  box-shadow:0 4px 14px rgba(0,0,0,.45);transition:transform .04s linear;}
.wfl-touch-button{display:flex;align-items:center;justify-content:center;border-radius:50%;
  font:600 13px/1 system-ui,-apple-system,'Segoe UI',sans-serif;color:#eaf0ff;letter-spacing:.02em;
  background:radial-gradient(circle at 40% 35%, rgba(255,255,255,.20), rgba(90,120,220,.18));
  border:2px solid rgba(255,255,255,.28);backdrop-filter:blur(6px);
  box-shadow:0 4px 18px rgba(0,0,0,.35);transition:transform .08s ease, background .08s ease;}
.wfl-touch-button svg{display:block;opacity:.95}
.wfl-touch-button.active{transform:scale(.9);background:radial-gradient(circle at 40% 35%, rgba(120,200,255,.55), rgba(60,110,240,.4));}
.wfl-touch-controls *{-webkit-tap-highlight-color:transparent;}
`;
    document.head.appendChild(s);
  }

  mount(parent) {
    (parent ?? document.body).appendChild(this.container);
    return this;
  }

  addJoystick(opts) {
    const j = new VirtualJoystick(this.input, opts);
    j.mount(this.container);
    this.joysticks.push(j);
    return j;
  }

  addButton(opts) {
    const b = new TouchButton(this.input, opts);
    b.mount(this.container);
    this.buttons.push(b);
    return b;
  }

  addLookArea(opts) {
    const l = new TouchLookArea(this.input, opts);
    l.mount(this.container);
    this.lookAreas.push(l);
    return l;
  }

  /** Стандартная раскладка: движение слева, обзор справа, кнопки действий */
  setupDefault(opts = {}) {
    this.addLookArea({ side: 'right', sensitivity: opts.lookSensitivity ?? 0.3 });
    this.addJoystick({ side: 'left', dynamic: opts.dynamicJoystick ?? false, radius: opts.joystickRadius ?? 62 });
    this.addButton({
      button: 'Jump', label: 'Прыжок', icon: TOUCH_ICON.jump,
      style: { right: '28px', bottom: '40px', width: '72px', height: '72px' },
    });
    this.addButton({
      button: 'Fire1', label: 'Действие', icon: TOUCH_ICON.fire,
      style: { right: '112px', bottom: '104px', width: '60px', height: '60px' },
    });
    this.addButton({
      button: 'Sprint', label: 'Бег', icon: TOUCH_ICON.sprint,
      style: { right: '112px', bottom: '32px', width: '54px', height: '54px' },
    });
    return this;
  }

  clear() {
    for (const j of this.joysticks) j.unmount();
    for (const b of this.buttons) b.unmount();
    for (const l of this.lookAreas) l.unmount();
    this.joysticks = []; this.buttons = []; this.lookAreas = [];
  }

  show() { this.container.style.display = ''; this.visible = true; }
  hide() { this.container.style.display = 'none'; this.visible = false; }
  setVisible(v) { v ? this.show() : this.hide(); }

  update() {
    for (const l of this.lookAreas) l.consume();
  }
}
