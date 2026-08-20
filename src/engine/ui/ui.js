// WFL Engine — UI-система (DOM-оверлей поверх canvas, адаптивная под мобильные)
import { EventEmitter } from '../core/events.js';
import { Component, registerComponent } from '../core/component.js';
import { Mathf } from '../core/math.js';
import { Audio } from '../audio/audio.js';

const UI_STYLE_ID = 'wfl-ui-styles';

const BASE_CSS = `
.wfl-ui-root{position:absolute;inset:0;pointer-events:none;z-index:15;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
  color:#e8edf5;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;overflow:hidden}
.wfl-ui-root *{box-sizing:border-box}
.wfl-el{position:absolute;pointer-events:auto}
.wfl-panel{background:rgba(14,18,28,.82);border:1px solid rgba(255,255,255,.09);border-radius:14px;
  backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 12px 40px rgba(0,0,0,.45)}
.wfl-text{white-space:pre-wrap;line-height:1.35;pointer-events:none}
.wfl-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 20px;border-radius:11px;border:1px solid rgba(255,255,255,.14);
  background:linear-gradient(180deg,rgba(70,130,255,.95),rgba(40,92,215,.95));color:#fff;font-size:15px;font-weight:600;cursor:pointer;
  transition:transform .08s ease,filter .15s ease,box-shadow .15s ease;box-shadow:0 6px 18px rgba(30,70,180,.35);touch-action:manipulation}
.wfl-btn:hover{filter:brightness(1.12)}
.wfl-btn:active{transform:scale(.955);filter:brightness(.92)}
.wfl-btn[disabled]{opacity:.42;cursor:not-allowed;filter:grayscale(.6)}
.wfl-btn.ghost{background:rgba(255,255,255,.07);box-shadow:none}
.wfl-btn.danger{background:linear-gradient(180deg,rgba(240,80,80,.95),rgba(190,40,40,.95));box-shadow:0 6px 18px rgba(180,40,40,.32)}
.wfl-btn.success{background:linear-gradient(180deg,rgba(60,200,130,.95),rgba(28,150,95,.95));box-shadow:0 6px 18px rgba(30,150,95,.32)}
.wfl-bar{position:relative;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.1)}
.wfl-bar>i{display:block;height:100%;border-radius:999px;transition:width .18s ease;background:linear-gradient(90deg,#3ecf8e,#2bb673)}
.wfl-bar>span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;text-shadow:0 1px 2px rgba(0,0,0,.6)}
.wfl-img{display:block;object-fit:contain;pointer-events:none}
.wfl-slider{-webkit-appearance:none;appearance:none;height:6px;border-radius:999px;background:rgba(255,255,255,.18);outline:none}
.wfl-slider::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:#4a86ff;cursor:pointer;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)}
.wfl-slider::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:#4a86ff;cursor:pointer;border:2px solid #fff}
.wfl-toggle{display:inline-flex;align-items:center;gap:10px;cursor:pointer;font-size:14px}
.wfl-toggle input{display:none}
.wfl-toggle .tr{width:44px;height:24px;border-radius:999px;background:rgba(255,255,255,.18);position:relative;transition:background .2s ease;flex:0 0 auto}
.wfl-toggle .tr::after{content:'';position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .2s ease}
.wfl-toggle input:checked + .tr{background:#3ecf8e}
.wfl-toggle input:checked + .tr::after{transform:translateX(20px)}
.wfl-joy-hint{font-size:12px;opacity:.65}
.wfl-fade{transition:opacity .28s ease}
.wfl-hidden{opacity:0;pointer-events:none!important}
.wfl-screen{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;pointer-events:auto}
.wfl-screen.dim{background:rgba(6,9,16,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.wfl-title{font-size:clamp(28px,7vw,54px);font-weight:800;letter-spacing:-.02em;text-shadow:0 4px 24px rgba(0,0,0,.6);margin:0}
.wfl-sub{font-size:clamp(13px,3.2vw,17px);opacity:.75;margin:0;text-align:center;max-width:80%}
.wfl-toast{position:absolute;left:50%;transform:translateX(-50%);padding:10px 18px;border-radius:10px;background:rgba(18,22,32,.92);
  border:1px solid rgba(255,255,255,.12);font-size:14px;font-weight:600;box-shadow:0 8px 26px rgba(0,0,0,.5);pointer-events:none;
  animation:wfl-toast-in .22s ease}
@keyframes wfl-toast-in{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
.wfl-crosshair{position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;pointer-events:none}
.wfl-crosshair::before,.wfl-crosshair::after{content:'';position:absolute;background:rgba(255,255,255,.85);box-shadow:0 0 4px rgba(0,0,0,.7)}
.wfl-crosshair::before{left:50%;top:0;width:2px;height:100%;margin-left:-1px}
.wfl-crosshair::after{top:50%;left:0;height:2px;width:100%;margin-top:-2px}
.wfl-stats{position:absolute;left:8px;top:8px;padding:7px 10px;border-radius:8px;background:rgba(0,0,0,.55);font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre;pointer-events:none}
@media (max-width:640px){.wfl-btn{padding:13px 22px;font-size:16px}}
@media (prefers-reduced-motion:reduce){.wfl-btn,.wfl-bar>i,.wfl-fade{transition:none}}
`;

function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(UI_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = UI_STYLE_ID;
  s.textContent = BASE_CSS;
  document.head.appendChild(s);
}

/** Якорь: 9 позиций + stretch */
const ANCHORS = {
  'top-left': [0, 0], 'top-center': [0.5, 0], 'top-right': [1, 0],
  'middle-left': [0, 0.5], 'center': [0.5, 0.5], 'middle-right': [1, 0.5],
  'bottom-left': [0, 1], 'bottom-center': [0.5, 1], 'bottom-right': [1, 1],
};

/** Базовый UI-элемент */
export class UIElement extends EventEmitter {
  constructor(tag = 'div', className = '') {
    super();
    ensureStyles();
    this.el = document.createElement(tag);
    this.el.className = `wfl-el ${className}`.trim();
    this.children = [];
    this.parent = null;
    this.name = '';
    this._anchor = 'top-left';
    this._x = 0; this._y = 0;
  }
  /** Позиция относительно якоря, в px (или строках вида '50%') */
  setPosition(x, y, anchor = this._anchor) {
    this._x = x; this._y = y; this._anchor = anchor;
    const [ax, ay] = ANCHORS[anchor] ?? ANCHORS['top-left'];
    const s = this.el.style;
    s.left = s.right = s.top = s.bottom = 'auto';
    const px = (v) => (typeof v === 'number' ? `${v}px` : v);
    if (ax === 0) s.left = px(x);
    else if (ax === 1) s.right = px(x);
    else { s.left = '50%'; }
    if (ay === 0) s.top = px(y);
    else if (ay === 1) s.bottom = px(y);
    else { s.top = '50%'; }
    const tx = ax === 0.5 ? `calc(-50% + ${px(x)})` : '0';
    const ty = ay === 0.5 ? `calc(-50% + ${px(y)})` : '0';
    s.transform = (ax === 0.5 || ay === 0.5) ? `translate(${tx},${ty})` : '';
    return this;
  }
  setSize(w, h) {
    if (w != null) this.el.style.width = typeof w === 'number' ? `${w}px` : w;
    if (h != null) this.el.style.height = typeof h === 'number' ? `${h}px` : h;
    return this;
  }
  /** Растянуть на весь родитель с отступами */
  stretch(m = 0) {
    const s = this.el.style;
    const px = (v) => (typeof v === 'number' ? `${v}px` : v);
    s.left = s.top = s.right = s.bottom = px(m);
    s.width = s.height = 'auto';
    s.transform = '';
    return this;
  }
  style(props) { Object.assign(this.el.style, props); return this; }
  addClass(c) { this.el.classList.add(c); return this; }
  removeClass(c) { this.el.classList.remove(c); return this; }
  add(child) {
    this.children.push(child);
    child.parent = this;
    this.el.appendChild(child.el);
    return child;
  }
  remove(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    child.el.remove();
    child.parent = null;
    return this;
  }
  get visible() { return !this.el.classList.contains('wfl-hidden'); }
  set visible(v) {
    this.el.classList.add('wfl-fade');
    this.el.classList.toggle('wfl-hidden', !v);
  }
  show() { this.visible = true; return this; }
  hide() { this.visible = false; return this; }
  toggle() { this.visible = !this.visible; return this; }
  destroy() {
    for (const c of [...this.children]) c.destroy();
    this.parent?.remove(this);
    this.el.remove();
    this.clear();
  }
}

export class UIPanel extends UIElement {
  constructor(opts = {}) {
    super('div', `wfl-panel ${opts.className ?? ''}`);
    if (opts.padding != null) this.el.style.padding = typeof opts.padding === 'number' ? `${opts.padding}px` : opts.padding;
    if (opts.layout) {
      this.el.style.display = 'flex';
      this.el.style.flexDirection = opts.layout === 'horizontal' ? 'row' : 'column';
      this.el.style.gap = `${opts.gap ?? 10}px`;
      this.el.style.alignItems = opts.align ?? 'stretch';
      this.el.style.justifyContent = opts.justify ?? 'flex-start';
    }
    if (opts.width || opts.height) this.setSize(opts.width, opts.height);
    if (opts.position) this.setPosition(opts.position[0], opts.position[1], opts.anchor);
  }
}

export class UIText extends UIElement {
  constructor(text = '', opts = {}) {
    super('div', 'wfl-text');
    this.el.textContent = text;
    this.style({
      fontSize: typeof opts.size === 'number' ? `${opts.size}px` : (opts.size ?? '15px'),
      fontWeight: opts.weight ?? 500,
      color: opts.color ?? '#e8edf5',
      textAlign: opts.align ?? 'left',
      textShadow: opts.shadow === false ? 'none' : '0 1px 3px rgba(0,0,0,.55)',
      opacity: opts.opacity ?? 1,
    });
    if (opts.position) this.setPosition(opts.position[0], opts.position[1], opts.anchor);
  }
  get text() { return this.el.textContent; }
  set text(v) { this.el.textContent = v; }
  setText(v) { this.el.textContent = v; return this; }
  setHTML(v) { this.el.innerHTML = v; return this; }
}

export class UIButton extends UIElement {
  constructor(label = 'Кнопка', onClick = null, opts = {}) {
    super('button', `wfl-btn ${opts.variant ?? ''}`);
    this.el.type = 'button';
    this.el.textContent = label;
    if (opts.width || opts.height) this.setSize(opts.width, opts.height);
    if (opts.position) this.setPosition(opts.position[0], opts.position[1], opts.anchor);
    this.onClick = onClick;
    const handler = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (this.el.disabled) return;
      if (opts.sound !== false) Audio.synth('blip', { frequency: 720, duration: 0.05, volume: 0.12 });
      if (navigator.vibrate && opts.haptic !== false) { try { navigator.vibrate(8); } catch {} }
      this.emit('click', this);
      this.onClick?.(this);
    };
    this.el.addEventListener('click', handler);
    this.el.addEventListener('touchend', handler, { passive: false });
  }
  get label() { return this.el.textContent; }
  set label(v) { this.el.textContent = v; }
  setLabel(v) { this.el.textContent = v; return this; }
  get disabled() { return this.el.disabled; }
  set disabled(v) { this.el.disabled = !!v; }
}

export class UIProgressBar extends UIElement {
  constructor(opts = {}) {
    super('div', 'wfl-bar');
    this.setSize(opts.width ?? 180, opts.height ?? 14);
    this.fill = document.createElement('i');
    this.el.appendChild(this.fill);
    this.labelEl = document.createElement('span');
    this.el.appendChild(this.labelEl);
    this.showLabel = opts.showLabel ?? false;
    this.color = opts.color ?? null;
    if (this.color) this.fill.style.background = this.color;
    if (opts.position) this.setPosition(opts.position[0], opts.position[1], opts.anchor);
    this._value = opts.value ?? 1;
    this.value = this._value;
  }
  get value() { return this._value; }
  set value(v) {
    this._value = Mathf.clamp01(v);
    this.fill.style.width = `${this._value * 100}%`;
    this.labelEl.textContent = this.showLabel ? `${Math.round(this._value * 100)}%` : '';
    if (!this.color) {
      const hue = this._value * 120;
      this.fill.style.background = `linear-gradient(90deg,hsl(${hue} 65% 52%),hsl(${hue} 70% 42%))`;
    }
  }
  setValue(v) { this.value = v; return this; }
}

export class UIImage extends UIElement {
  constructor(src = '', opts = {}) {
    super('img', 'wfl-img');
    this.el.src = src;
    this.el.alt = opts.alt ?? '';
    this.el.draggable = false;
    if (opts.width || opts.height) this.setSize(opts.width, opts.height);
    if (opts.position) this.setPosition(opts.position[0], opts.position[1], opts.anchor);
    if (opts.fit) this.el.style.objectFit = opts.fit;
  }
  setSrc(v) { this.el.src = v; return this; }
}

export class UISlider extends UIElement {
  constructor(opts = {}) {
    super('input', 'wfl-slider');
    this.el.type = 'range';
    this.el.min = opts.min ?? 0;
    this.el.max = opts.max ?? 1;
    this.el.step = opts.step ?? 0.01;
    this.el.value = opts.value ?? 0.5;
    this.setSize(opts.width ?? 180, opts.height ?? 24);
    if (opts.position) this.setPosition(opts.position[0], opts.position[1], opts.anchor);
    this.el.addEventListener('input', () => {
      this.emit('change', this.value);
      opts.onChange?.(this.value);
    });
  }
  get value() { return parseFloat(this.el.value); }
  set value(v) { this.el.value = v; }
}

export class UIToggle extends UIElement {
  constructor(label = '', opts = {}) {
    super('label', 'wfl-toggle');
    this.input = document.createElement('input');
    this.input.type = 'checkbox';
    this.input.checked = !!opts.value;
    const track = document.createElement('span');
    track.className = 'tr';
    const text = document.createElement('span');
    text.textContent = label;
    this.el.append(this.input, track, text);
    if (opts.position) this.setPosition(opts.position[0], opts.position[1], opts.anchor);
    this.input.addEventListener('change', () => {
      this.emit('change', this.value);
      opts.onChange?.(this.value);
    });
  }
  get value() { return this.input.checked; }
  set value(v) { this.input.checked = !!v; }
}

/** Экран (меню, пауза, game over) */
export class UIScreen extends UIElement {
  constructor(opts = {}) {
    super('div', `wfl-screen ${opts.dim === false ? '' : 'dim'}`);
    this.el.style.position = 'absolute';
    this.el.style.inset = '0';
    if (opts.title) {
      const h = document.createElement('h1');
      h.className = 'wfl-title';
      h.textContent = opts.title;
      this.el.appendChild(h);
      this.titleEl = h;
    }
    if (opts.subtitle) {
      const p = document.createElement('p');
      p.className = 'wfl-sub';
      p.textContent = opts.subtitle;
      this.el.appendChild(p);
      this.subtitleEl = p;
    }
  }
  setTitle(v) { if (this.titleEl) this.titleEl.textContent = v; return this; }
  setSubtitle(v) { if (this.subtitleEl) this.subtitleEl.textContent = v; return this; }
  addButton(label, onClick, opts) {
    const b = new UIButton(label, onClick, opts);
    b.el.style.position = 'relative';
    b.el.style.minWidth = '210px';
    return this.add(b);
  }
}

/** Корневой менеджер UI */
export class UIManager {
  constructor(engine) {
    ensureStyles();
    this.engine = engine;
    this.root = new UIElement('div', '');
    this.root.el.className = 'wfl-ui-root';
    this.root.el.style.position = 'absolute';
    (engine?.container ?? document.body).appendChild(this.root.el);
    this.screens = new Map();
    this._toasts = [];
    this._statsEl = null;
    this._crosshair = null;
    this.scaleFactor = 1;
    this._applyScale();
    window.addEventListener('resize', () => this._applyScale());
  }

  _applyScale() {
    const w = this.root.el.clientWidth || window.innerWidth;
    // адаптивный масштаб шрифта на маленьких экранах
    this.scaleFactor = Mathf.clamp(w / 900, 0.78, 1.25);
    this.root.el.style.fontSize = `${16 * this.scaleFactor}px`;
  }

  add(el) { return this.root.add(el); }
  remove(el) { this.root.remove(el); return this; }

  text(t, opts) { return this.add(new UIText(t, opts)); }
  button(label, cb, opts) { return this.add(new UIButton(label, cb, opts)); }
  panel(opts) { return this.add(new UIPanel(opts)); }
  progressBar(opts) { return this.add(new UIProgressBar(opts)); }
  image(src, opts) { return this.add(new UIImage(src, opts)); }
  slider(opts) { return this.add(new UISlider(opts)); }
  toggle(label, opts) { return this.add(new UIToggle(label, opts)); }

  /** Именованный экран */
  screen(name, opts = {}) {
    if (this.screens.has(name)) return this.screens.get(name);
    const s = new UIScreen(opts);
    this.screens.set(name, s);
    this.add(s);
    s.hide();
    return s;
  }
  showScreen(name, exclusive = true) {
    for (const [k, s] of this.screens) {
      if (k === name) s.show();
      else if (exclusive) s.hide();
    }
    return this.screens.get(name) ?? null;
  }
  hideScreen(name) { this.screens.get(name)?.hide(); }
  hideAllScreens() { for (const s of this.screens.values()) s.hide(); }

  /** Всплывающее уведомление */
  toast(message, duration = 2, opts = {}) {
    const el = document.createElement('div');
    el.className = 'wfl-toast';
    el.textContent = message;
    el.style.bottom = `${(opts.offset ?? 90) + this._toasts.length * 46}px`;
    if (opts.color) el.style.borderColor = opts.color;
    this.root.el.appendChild(el);
    this._toasts.push(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s ease, transform .3s ease';
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%, -8px)';
      setTimeout(() => {
        el.remove();
        this._toasts = this._toasts.filter((t) => t !== el);
      }, 320);
    }, duration * 1000);
    return el;
  }

  crosshair(enabled = true) {
    if (enabled && !this._crosshair) {
      this._crosshair = document.createElement('div');
      this._crosshair.className = 'wfl-crosshair';
      this.root.el.appendChild(this._crosshair);
    } else if (!enabled && this._crosshair) {
      this._crosshair.remove();
      this._crosshair = null;
    }
    return this;
  }

  /** Оверлей статистики (FPS, draw calls) */
  showStats(enabled = true) {
    if (enabled && !this._statsEl) {
      this._statsEl = document.createElement('div');
      this._statsEl.className = 'wfl-stats';
      this.root.el.appendChild(this._statsEl);
      this._statsHook = () => {
        const s = this.engine.stats;
        const r = this.engine.renderer.stats;
        this._statsEl.textContent =
          `FPS  ${s.fps.toFixed(0)}\n` +
          `кадр ${s.frameMs.toFixed(2)} мс\n` +
          `лог  ${s.updateMs.toFixed(2)} мс\n` +
          `физ  ${s.physicsMs.toFixed(2)} мс\n` +
          `рен  ${s.renderMs.toFixed(2)} мс\n` +
          `объ  ${s.objects}\n` +
          `draw ${r.drawCalls}  tri ${r.triangles}`;
      };
      this.engine.addFrameHook(this._statsHook);
    } else if (!enabled && this._statsEl) {
      this.engine.removeFrameHook(this._statsHook);
      this._statsEl.remove();
      this._statsEl = null;
    }
    return this;
  }

  clear() {
    for (const c of [...this.root.children]) c.destroy();
    this.screens.clear();
  }

  dispose() {
    this.clear();
    this.root.el.remove();
  }
}

/* ============== Компонент: HUD, привязанный к сцене ============== */

/** Плавающая метка над объектом в мире (health bar, имя) */
export class WorldLabel extends Component {
  static componentName = 'WorldLabel';
  static inspector = {
    text: { type: 'string', default: '', label: 'Текст' },
    offsetY: { type: 'number', default: 2, step: 0.1, label: 'Смещение Y' },
    maxDistance: { type: 'number', default: 40, step: 1, label: 'Макс. дистанция' },
    showHealthBar: { type: 'boolean', default: false, label: 'Полоса здоровья' },
    fontSize: { type: 'number', default: 13, step: 1, label: 'Размер шрифта' },
  };
  constructor() {
    super();
    this.text = '';
    this.offsetY = 2;
    this.maxDistance = 40;
    this.showHealthBar = false;
    this.fontSize = 13;
    this._el = null;
    this._bar = null;
  }
  start() {
    const ui = this.engine.ui;
    if (!ui) return;
    this._el = document.createElement('div');
    this._el.style.cssText = `position:absolute;transform:translate(-50%,-100%);pointer-events:none;
      font-size:${this.fontSize}px;font-weight:600;text-shadow:0 1px 3px #000;text-align:center;white-space:nowrap;transition:opacity .2s`;
    this._el.textContent = this.text;
    if (this.showHealthBar) {
      this._bar = document.createElement('div');
      this._bar.style.cssText = 'width:56px;height:5px;border-radius:3px;background:rgba(255,255,255,.2);margin:3px auto 0;overflow:hidden';
      const f = document.createElement('i');
      f.style.cssText = 'display:block;height:100%;background:#3ecf8e;width:100%';
      this._bar.appendChild(f);
      this._barFill = f;
      this._el.appendChild(this._bar);
    }
    ui.root.el.appendChild(this._el);
  }
  lateUpdate() {
    if (!this._el) return;
    const cam = this.scene?.mainCamera?.camera;
    if (!cam) return;
    const pos = this.transform.position.clone();
    pos.y += this.offsetY;
    const camPos = this.scene.mainCamera.transform.position;
    const dist = camPos.distanceTo(pos);
    const p = pos.project(cam);
    const behind = p.z > 1 || dist > this.maxDistance;
    this._el.style.opacity = behind ? '0' : String(Mathf.clamp01(1 - dist / this.maxDistance) * 0.6 + 0.4);
    if (behind) return;
    const w = this.engine.renderer.width, h = this.engine.renderer.height;
    this._el.style.left = `${(p.x * 0.5 + 0.5) * w}px`;
    this._el.style.top = `${(-p.y * 0.5 + 0.5) * h}px`;
    if (this._barFill) {
      const hp = this.getComponent('Health');
      if (hp) this._barFill.style.width = `${hp.normalized * 100}%`;
    }
  }
  setText(v) { this.text = v; if (this._el) this._el.firstChild ? (this._el.childNodes[0].nodeValue = v) : (this._el.textContent = v); }
  onDestroy() { this._el?.remove(); this._el = null; }
}
registerComponent(WorldLabel);
