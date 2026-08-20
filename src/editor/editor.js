// WFL Engine Editor — редактор сцены, рассчитанный на пальцы.
//
// Раскладка одинакова на телефоне и на планшете: узкая панель инструментов
// сверху, рабочая область по центру, выдвижная панель снизу (иерархия,
// инспектор, консоль). Никаких горячих клавиш как единственного пути:
// всё, что можно сделать, доступно тапом.
//
// Управление камерой: один палец — орбита, два пальца — панорама и зум.

import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
// Через общий модуль — чтобы реестр компонентов был заполнен,
// даже если редактор открыли раньше всего остального.
import { ComponentRegistry, GameObject, GEOMETRY_FACTORY, Mathf } from '../engine/index.js';
import { icon, iconForThing } from '../ui/icons.js';

const EDITOR_STYLE_ID = 'wfl-editor-styles';

const ED_CSS = `
.wfl-ed{position:absolute;inset:0;z-index:60;pointer-events:none;
  font:13.5px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#dde5f2;
  -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.wfl-ed *{box-sizing:border-box}
.wfl-ed .wfl-i{display:block}
.wfl-ed input,.wfl-ed select,.wfl-ed textarea{-webkit-user-select:text;user-select:text}

/* ---------- Верхняя панель ---------- */
.wfl-ed .bar{position:absolute;top:0;left:0;right:0;pointer-events:auto;display:flex;align-items:center;
  gap:7px;padding:max(8px,env(safe-area-inset-top)) 10px 8px;background:rgba(10,14,23,.9);
  -webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-bottom:1px solid #1b2438}
.wfl-ed .bar .name{flex:1;min-width:0;font-size:13.5px;font-weight:700;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;padding:0 2px}
.wfl-ed .bar .name small{display:block;font-size:10.5px;font-weight:500;color:#6f7d99;margin-top:1px}
.wfl-tb{width:42px;height:42px;flex:0 0 auto;border-radius:12px;border:1px solid #202b45;background:#141c2e;
  color:#c2cee3;display:grid;place-items:center;cursor:pointer;position:relative}
.wfl-tb:active{transform:scale(.93);background:#1d2740}
.wfl-tb.on{background:#2f6df0;border-color:#4a86ff;color:#fff}
.wfl-tb.play{background:linear-gradient(135deg,#22a06b,#16855a);border-color:transparent;color:#fff}
.wfl-tb.wide{width:auto;padding:0 15px;gap:8px;display:inline-flex;align-items:center;font:700 13px/1 inherit}
.wfl-tb[disabled]{opacity:.4;pointer-events:none}

/* ---------- Инструменты слева ---------- */
.wfl-ed .tools{position:absolute;left:10px;top:calc(58px + env(safe-area-inset-top));pointer-events:auto;
  display:flex;flex-direction:column;gap:7px}

/* ---------- Плавающие действия справа ---------- */
.wfl-ed .quick{position:absolute;right:10px;top:calc(58px + env(safe-area-inset-top));pointer-events:auto;
  display:flex;flex-direction:column;gap:7px}

/* ---------- Подсказка выбора ---------- */
.wfl-ed .sel-tag{position:absolute;left:50%;transform:translateX(-50%);
  top:calc(58px + env(safe-area-inset-top));pointer-events:none;padding:7px 13px;border-radius:11px;
  background:rgba(10,14,23,.82);-webkit-backdrop-filter:blur(9px);backdrop-filter:blur(9px);
  border:1px solid #202b45;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:7px;
  max-width:60vw;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.wfl-ed .sel-tag.empty{color:#78859f;font-weight:500}

/* ---------- Нижняя панель ---------- */
.wfl-ed .dock{position:absolute;left:0;right:0;bottom:0;pointer-events:auto;display:flex;flex-direction:column;
  background:rgba(11,15,25,.96);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);
  border-top:1px solid #1b2438;border-radius:18px 18px 0 0;box-shadow:0 -12px 34px rgba(0,0,0,.45);
  transition:transform .22s cubic-bezier(.32,.72,0,1);max-height:min(62vh,540px)}
.wfl-ed .dock.closed{transform:translateY(calc(100% - 62px - env(safe-area-inset-bottom)))}
.wfl-ed .tabs{display:flex;gap:6px;padding:9px 10px;flex:0 0 auto;align-items:center}
.wfl-tab{flex:1;min-height:44px;border-radius:12px;border:1px solid #1e2941;background:#131b2c;color:#95a3bd;
  display:flex;align-items:center;justify-content:center;gap:7px;font:600 12.5px/1 inherit;cursor:pointer}
.wfl-tab.on{background:#1f2c48;border-color:#33477a;color:#dce6f7}
.wfl-tab:active{transform:scale(.97)}
.wfl-tab .lbl{display:none}
@media(min-width:520px){.wfl-tab .lbl{display:inline}}
.wfl-ed .dock-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;
  /* контейнер сцены глушит жесты, панели должны прокручиваться */
  touch-action:pan-y;padding:0 10px calc(12px + env(safe-area-inset-bottom))}
.wfl-ed .dock.closed .dock-body{overflow:hidden}

/* ---------- Иерархия ---------- */
.wfl-row{display:flex;align-items:center;gap:9px;padding:11px 12px;border-radius:12px;margin-bottom:6px;
  background:#111926;border:1px solid #1b2438;cursor:pointer;min-height:48px}
.wfl-row.sel{background:#1d2c4c;border-color:#3a5bA0}
.wfl-row:active{transform:scale(.99)}
.wfl-row .ic{color:#7f97c4;flex:0 0 auto}
.wfl-row.sel .ic{color:#9dc0ff}
.wfl-row .nm{flex:1;min-width:0;font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis}
.wfl-row .nm i{display:block;font-style:normal;font-size:11px;color:#6f7d99;font-weight:500;margin-top:2px}
.wfl-row.off .nm{opacity:.45}
.wfl-row .vis{width:38px;height:38px;flex:0 0 auto;border-radius:10px;border:1px solid #1e2941;
  background:#0e1524;color:#7c8aa5;display:grid;place-items:center;cursor:pointer}
.wfl-row .vis:active{background:#18213a}
.wfl-row .tw{width:30px;height:38px;flex:0 0 auto;display:grid;place-items:center;color:#6f7d99;
  border-radius:9px}
.wfl-row .tw:active{background:#18213a}

/* ---------- Инспектор ---------- */
.wfl-card2{background:#111926;border:1px solid #1b2438;border-radius:14px;margin-bottom:9px;overflow:hidden}
.wfl-card2 .hd{display:flex;align-items:center;gap:9px;padding:12px;cursor:pointer;min-height:48px}
.wfl-card2 .hd .t{flex:1;font-size:13.5px;font-weight:700}
.wfl-card2 .hd .ic{color:#7f97c4}
.wfl-card2 .hd .x{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;color:#8a6a74;
  border:1px solid #2c1e26;background:#1c1319}
.wfl-card2 .hd .x:active{background:#2a1a22;color:#ffa8b4}
.wfl-card2 .bd{padding:0 12px 12px}
.wfl-f{margin-bottom:11px}
.wfl-f > label{display:block;font-size:11px;font-weight:700;color:#7f8da8;letter-spacing:.04em;
  text-transform:uppercase;margin-bottom:6px}
.wfl-f input[type=text],.wfl-f input[type=number],.wfl-f select,.wfl-f textarea{width:100%;
  padding:11px 12px;border-radius:11px;border:1px solid #23304c;background:#0b1120;color:#e2eaf7;
  font:14px/1.2 inherit;outline:none;-webkit-appearance:none;min-height:44px}
.wfl-f textarea{min-height:130px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;
  resize:vertical;line-height:1.5}
.wfl-f input:focus,.wfl-f select:focus,.wfl-f textarea:focus{border-color:#3f6fdd}
.wfl-f input[type=color]{width:100%;height:44px;padding:3px;border-radius:11px;border:1px solid #23304c;
  background:#0b1120}
.wfl-f .v3{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.wfl-f .v3 label{display:block;font-size:10px;color:#66738c;text-align:center;margin-bottom:3px}
.wfl-f .v3 input{text-align:center;padding:11px 4px}
.wfl-sw{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:46px;
  padding:4px 0}
.wfl-sw > span{font-size:13.5px;color:#c3cee2}
.wfl-sw .tr{width:52px;height:31px;border-radius:999px;background:#222d47;position:relative;flex:0 0 auto;
  transition:background .18s;cursor:pointer}
.wfl-sw .tr::after{content:'';position:absolute;top:3px;left:3px;width:25px;height:25px;border-radius:50%;
  background:#8592ab;transition:transform .18s,background .18s}
.wfl-sw.on .tr{background:#2f6df0}
.wfl-sw.on .tr::after{transform:translateX(21px);background:#fff}

/* ---------- Консоль ---------- */
.wfl-log2{font:11.5px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;
  word-break:break-word;padding:4px 2px}
.wfl-log2 div{padding:3px 0;border-bottom:1px solid #141c2c}
.wfl-log2 .err{color:#ff9b9b}.wfl-log2 .warn{color:#ffd08a}.wfl-log2 .ok{color:#82e0ad}
.wfl-log2 .dim{color:#5f6c85}

/* ---------- Пусто ---------- */
.wfl-none{padding:32px 18px;text-align:center;color:#6c7a94;font-size:13px;line-height:1.6}
.wfl-none .ic{width:52px;height:52px;margin:0 auto 12px;border-radius:16px;display:grid;place-items:center;
  background:rgba(91,140,255,.1);color:#7fa3ff}

/* ---------- Лист добавления ---------- */
.wfl-add-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
.wfl-add-item{padding:13px 8px;border-radius:13px;background:#0f1626;border:1px solid #1e2941;
  display:flex;flex-direction:column;align-items:center;gap:7px;font-size:11.5px;font-weight:600;
  color:#c3cee2;cursor:pointer;text-align:center}
.wfl-add-item:active{transform:scale(.96);border-color:#3a52a1}
.wfl-add-item .ic{color:#8fb0ff}
.wfl-list-item{display:flex;align-items:center;gap:11px;padding:13px;border-radius:12px;background:#0f1626;
  border:1px solid #1e2941;margin-bottom:7px;cursor:pointer;min-height:50px}
.wfl-list-item:active{transform:scale(.99);border-color:#3a52a1}
.wfl-list-item .ic{color:#8fb0ff;flex:0 0 auto}
.wfl-list-item .t{flex:1;font-size:13.5px;font-weight:600}
`;

function ensureStyles() {
  if (document.getElementById(EDITOR_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = EDITOR_STYLE_ID;
  s.textContent = ED_CSS;
  document.head.appendChild(s);
}

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Человеческие названия компонентов для инспектора */
const RU_COMPONENT = {
  Camera: 'Камера', Light: 'Источник света', MeshRenderer: 'Меш',
  ModelRenderer: 'Модель', SpriteRenderer: 'Спрайт', ParticleSystem: 'Частицы',
  Skybox: 'Небо', Terrain: 'Ландшафт', Rigidbody: 'Физическое тело',
  BoxCollider: 'Коллайдер-куб', SphereCollider: 'Коллайдер-сфера',
  CapsuleCollider: 'Коллайдер-капсула', PlaneCollider: 'Коллайдер-плоскость',
  MeshCollider: 'Коллайдер по мешу', CharacterController: 'Контроллер персонажа',
  PlayerController: 'Управление игроком', OrbitCamera: 'Орбитальная камера',
  FollowCamera: 'Камера следования', Rotator: 'Вращение', Floater: 'Покачивание',
  Health: 'Здоровье', ChaseAI: 'Преследование', Projectile: 'Снаряд',
  Pickup: 'Подбираемый предмет', Spawner: 'Спавнер', KillZone: 'Смертельная зона',
  ScriptBehaviour: 'Скрипт', Blueprint: 'Блюпринт', AudioSource: 'Звук',
  AudioListener: 'Слушатель звука', WorldLabel: 'Подпись в мире',
};
const compTitle = (n) => RU_COMPONENT[n] ?? n;

/** Русские названия примитивов */
const RU_PRIM = {
  box: 'Куб', sphere: 'Сфера', capsule: 'Капсула', cylinder: 'Цилиндр', cone: 'Конус',
  plane: 'Плоскость', torus: 'Тор', torusKnot: 'Узел', icosahedron: 'Икосаэдр',
  dodecahedron: 'Додекаэдр', octahedron: 'Октаэдр', tetrahedron: 'Тетраэдр',
  ring: 'Кольцо', circle: 'Круг',
};

export class Editor {
  /**
   * @param {import('../engine/engine.js').Engine} engine
   * @param {object} [opts]
   * @param {object} [opts.project] метаданные проекта
   * @param {Function} [opts.onPlay] запросить запуск игры
   * @param {Function} [opts.onExit] выйти на главную
   * @param {Function} [opts.onChange] сцена изменилась (для автосохранения)
   */
  constructor(engine, opts = {}) {
    ensureStyles();
    this.engine = engine;
    this.project = opts.project ?? null;
    this.onPlay = opts.onPlay ?? (() => {});
    this.onExit = opts.onExit ?? (() => {});
    this.onChange = opts.onChange ?? (() => {});

    this.selected = null;
    this.mode = 'translate';
    this.snap = false;
    this.panel = 'hierarchy';
    this.dockOpen = false;
    this.logLines = [];
    this._collapsed = new Set();
    this._dirty = false;

    this._buildDOM();
    this._setupCamera();
    this._setupGizmo();
    this.attachTools();
    this._hookConsole();
    this.refresh();
    this.log('Редактор открыт. Тапните по объекту, чтобы выбрать его.', 'ok');

    // Автосохранение раз в 20 секунд, если что-то менялось
    this._saveTimer = setInterval(() => {
      if (this._dirty) { this._dirty = false; this.onChange(); }
    }, 20000);
  }

  /* ==================== DOM ==================== */
  _buildDOM() {
    this.root = el('div', 'wfl-ed');

    /* Верхняя панель */
    const bar = el('div', 'bar');
    this.backBtn = this._tb(bar, 'back', 'На главную', () => this.confirmExit());
    bar.appendChild(el('div', 'name',
      `${esc(this.project?.name ?? 'Сцена')}<small>Редактор сцены</small>`));
    this.playBtn = this._tb(bar, 'play', 'Запустить игру', () => {
      this.onChange();
      this.onPlay();
    }, 'play wide');
    this.playBtn.innerHTML = `${icon('play', 17)}<span>Играть</span>`;
    this.root.appendChild(bar);

    /* Инструменты трансформации */
    const tools = el('div', 'tools');
    this.moveBtn = this._tb(tools, 'move', 'Перемещение', () => this.setMode('translate'), 'on');
    this.rotBtn = this._tb(tools, 'rotate', 'Поворот', () => this.setMode('rotate'));
    this.scaleBtn = this._tb(tools, 'scale', 'Масштаб', () => this.setMode('scale'));
    this.snapBtn = this._tb(tools, 'snap', 'Привязка к сетке', () => this.toggleSnap());
    this.focusBtn = this._tb(tools, 'focus', 'Показать объект', () => this.focusSelected());
    this.root.appendChild(tools);

    /* Быстрые действия */
    const quick = el('div', 'quick');
    this._tb(quick, 'plus', 'Добавить объект', () => this.showAddSheet());
    this._tb(quick, 'copy', 'Дублировать', () => this.duplicateSelected());
    this._tb(quick, 'trash', 'Удалить', () => this.deleteSelected());
    this._tb(quick, 'more', 'Ещё', () => this.showMoreSheet());
    this.root.appendChild(quick);

    /* Ярлык выделения */
    this.selTag = el('div', 'sel-tag empty', `${icon('target', 15)}<span>Ничего не выбрано</span>`);
    this.root.appendChild(this.selTag);

    /* Нижняя панель */
    const dock = el('div', 'dock closed');
    const tabs = el('div', 'tabs');
    this.tabBtns = {};
    const mkTab = (id, ico, label) => {
      const b = el('div', 'wfl-tab', `${icon(ico, 18)}<span class="lbl">${label}</span>`);
      b.onclick = () => this.openPanel(id);
      tabs.appendChild(b);
      this.tabBtns[id] = b;
    };
    mkTab('hierarchy', 'hierarchy', 'Объекты');
    mkTab('inspector', 'inspector', 'Свойства');
    mkTab('console', 'console', 'Консоль');
    this.dockToggle = el('div', 'wfl-tb', icon('down', 18));
    this.dockToggle.onclick = () => this.toggleDock();
    tabs.appendChild(this.dockToggle);
    dock.appendChild(tabs);

    this.dockBody = el('div', 'dock-body');
    dock.appendChild(this.dockBody);
    this.dock = dock;
    this.root.appendChild(dock);

    this.engine.container.appendChild(this.root);
    this.openPanel('hierarchy', false);
  }

  _tb(parent, ico, title, onClick, cls = '') {
    const b = el('div', `wfl-tb ${cls}`.trim(), icon(ico, 19));
    b.title = title;
    b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onClick(); };
    parent.appendChild(b);
    return b;
  }

  /* ==================== Панели ==================== */
  openPanel(id, open = true) {
    this.panel = id;
    for (const [k, b] of Object.entries(this.tabBtns)) b.classList.toggle('on', k === id);
    if (open) this.setDock(true);
    this.refreshPanel();
  }

  toggleDock() { this.setDock(!this.dockOpen); }

  setDock(open) {
    this.dockOpen = open;
    this.dock.classList.toggle('closed', !open);
    this.dockToggle.innerHTML = icon(open ? 'down' : 'up', 18);
  }

  refreshPanel() {
    if (this.panel === 'hierarchy') this._renderHierarchy();
    else if (this.panel === 'inspector') this._renderInspector();
    else this._renderConsole();
  }

  refresh() {
    this._updateSelTag();
    this.refreshPanel();
  }

  _updateSelTag() {
    if (this.selected) {
      this.selTag.className = 'sel-tag';
      this.selTag.innerHTML = `${icon(iconForThing(this.selected.name), 15)}<span>${esc(this.selected.name)}</span>`;
    } else {
      this.selTag.className = 'sel-tag empty';
      this.selTag.innerHTML = `${icon('target', 15)}<span>Ничего не выбрано</span>`;
    }
  }

  /* ==================== Камера ==================== */
  _setupCamera() {
    const engine = this.engine;
    this.camGO = engine.scene.createGameObject('__EditorCamera');
    this.camGO._editorOnly = true;
    this.editorCamera = this.camGO.addComponent('Camera', {
      fieldOfView: 60, nearClipPlane: 0.05, farClipPlane: 900, depth: 100,
    });
    this._gameCamera = engine.scene.mainCamera;
    engine.scene.mainCamera = this.editorCamera;
    this.editorCamera.isMainCamera = true;

    this._orbit = { target: new THREE.Vector3(0, 1, 0), distance: 22, yaw: 35, pitch: 26 };
    this._applyOrbit();

    // Сетка-ориентир только в редакторе
    this._grid = new THREE.GridHelper(120, 60, 0x3c5a96, 0x1e2b46);
    this._grid.position.y = 0.01;
    this._grid.material.transparent = true;
    this._grid.material.opacity = 0.35;
    engine.scene.root.add(this._grid);

    // Симуляция выключена: сцена рендерится, но не «живёт»
    this.setSimulation(false);
  }

  _applyOrbit() {
    const o = this._orbit;
    const py = o.pitch * Mathf.Deg2Rad, yw = o.yaw * Mathf.Deg2Rad;
    this.camGO.transform.position = new THREE.Vector3(
      o.target.x + o.distance * Math.cos(py) * Math.sin(yw),
      o.target.y + o.distance * Math.sin(py),
      o.target.z + o.distance * Math.cos(py) * Math.cos(yw));
    this.camGO.transform.lookAt(o.target);
  }

  /**
   * Жесты управления камерой и выбором. Работают одинаково для пальца,
   * стилуса и мыши — используем Pointer Events.
   */
  attachTools() {
    if (this._attached) return;
    this._attached = true;
    const canvas = this.engine.canvas;
    const pointers = new Map();
    let mode = null;           // 'orbit' | 'pinch'
    let last = null;
    let startDist = 0, startMid = null, moved = 0;

    const pos = (e) => ({ x: e.clientX, y: e.clientY });
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    this._onDown = (e) => {
      if (this._gizmoActive) return;
      pointers.set(e.pointerId, pos(e));
      if (pointers.size === 1) { mode = 'orbit'; last = pos(e); moved = 0; }
      else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        mode = 'pinch';
        startDist = dist(a, b);
        startMid = mid(a, b);
        this._startDistance = this._orbit.distance;
        moved = 999;
      }
    };

    this._onMove = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, pos(e));
      if (this._gizmoActive) return;

      if (mode === 'orbit' && pointers.size === 1) {
        const p = pos(e);
        const dx = p.x - last.x, dy = p.y - last.y;
        moved += Math.abs(dx) + Math.abs(dy);
        this._orbit.yaw -= dx * 0.32;
        this._orbit.pitch = Mathf.clamp(this._orbit.pitch + dy * 0.32, -88, 88);
        last = p;
        this._applyOrbit();
      } else if (mode === 'pinch' && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const d = dist(a, b);
        if (startDist > 0) {
          this._orbit.distance = Mathf.clamp(this._startDistance * (startDist / Math.max(d, 1)), 1, 400);
        }
        const m = mid(a, b);
        const t = this.camGO.transform;
        const k = this._orbit.distance * 0.0022;
        this._orbit.target.addScaledVector(t.right, -(m.x - startMid.x) * k);
        this._orbit.target.addScaledVector(t.up, (m.y - startMid.y) * k);
        startMid = m;
        this._applyOrbit();
      }
    };

    this._onUp = (e) => {
      const had = pointers.has(e.pointerId);
      pointers.delete(e.pointerId);
      // Короткий тап одним пальцем = выбор объекта
      if (had && mode === 'orbit' && pointers.size === 0 && moved < 9) this._pickAt(e);
      if (pointers.size === 0) mode = null;
      else if (pointers.size === 1) { mode = 'orbit'; last = [...pointers.values()][0]; moved = 999; }
    };

    this._onWheel = (e) => {
      e.preventDefault();
      this._orbit.distance = Mathf.clamp(this._orbit.distance * (1 + e.deltaY * 0.0012), 1, 400);
      this._applyOrbit();
    };

    canvas.addEventListener('pointerdown', this._onDown);
    canvas.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
  }

  detachTools() {
    if (!this._attached) return;
    this._attached = false;
    const canvas = this.engine.canvas;
    canvas.removeEventListener('pointerdown', this._onDown);
    canvas.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    canvas.removeEventListener('wheel', this._onWheel);
  }

  _pickAt(e) {
    const rect = this.engine.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = rect.height - (e.clientY - rect.top);
    const hit = this.engine.pickVisual(x, y);
    this.select(hit?.gameObject ?? null);
  }

  /* ==================== Гизмо ==================== */
  _setupGizmo() {
    const cam = this.editorCamera?.camera;
    if (!cam) return;
    this.gizmo = new TransformControls(cam, this.engine.canvas);
    this.gizmo.setSize(1.5);            // крупнее — чтобы попадать пальцем
    this.gizmo.addEventListener('dragging-changed', (ev) => {
      this._gizmoActive = ev.value;
      if (!ev.value) { this.markDirty(); this.refreshPanel(); }
    });
    this.gizmo.addEventListener('objectChange', () => this._syncVectors());
    this._gizmoHelper = this.gizmo.getHelper ? this.gizmo.getHelper() : this.gizmo;
    this.engine.scene.root.add(this._gizmoHelper);
  }

  setMode(m) {
    this.mode = m;
    this.gizmo?.setMode(m);
    this.moveBtn.classList.toggle('on', m === 'translate');
    this.rotBtn.classList.toggle('on', m === 'rotate');
    this.scaleBtn.classList.toggle('on', m === 'scale');
  }

  toggleSnap() {
    this.snap = !this.snap;
    this.snapBtn.classList.toggle('on', this.snap);
    this.gizmo?.setTranslationSnap(this.snap ? 0.5 : null);
    this.gizmo?.setRotationSnap(this.snap ? Math.PI / 12 : null);
    this.gizmo?.setScaleSnap(this.snap ? 0.25 : null);
    this.log(this.snap ? 'Привязка к сетке включена (0.5 м)' : 'Привязка выключена');
  }

  /* ==================== Симуляция ==================== */
  /**
   * Включить/выключить «жизнь» сцены. В редакторе объекты должны стоять
   * на месте, поэтому методы обновления подменяются пустышками.
   *
   * Сохранённые методы привязаны к конкретной сцене: после перезагрузки
   * (например, возврата из игры) объект сцены другой, и восстанавливать
   * старые функции нельзя — иначе редактор молча начнёт симулировать.
   */
  setSimulation(on) {
    const scene = this.engine.scene;
    if (!scene) return;
    const saved = this._savedUpdate;

    // Сцену подменили — прошлое состояние больше не актуально
    if (saved && saved.scene !== scene) this._savedUpdate = null;

    if (!on && !this._savedUpdate) {
      this._savedUpdate = {
        scene, u: scene.update, f: scene.fixedUpdate, l: scene.lateUpdate,
      };
      const noop = function () {};
      scene.update = noop;
      scene.fixedUpdate = noop;
      scene.lateUpdate = noop;
    } else if (on && this._savedUpdate) {
      const s = this._savedUpdate;
      s.scene.update = s.u;
      s.scene.fixedUpdate = s.f;
      s.scene.lateUpdate = s.l;
      this._savedUpdate = null;
    }
  }

  /* ==================== Видимость ==================== */
  setVisible(v) {
    this.root.style.display = v ? '' : 'none';
    if (this._grid) this._grid.visible = v;
    if (this._gizmoHelper) this._gizmoHelper.visible = v && !!this.selected;
    if (v) {
      // Сцену могли перезагрузить, пока шла игра
      this._reattachToScene();
      this.setSimulation(false);
    }
  }

  /** После перезагрузки сцены редактору нужна своя камера и сетка заново */
  _reattachToScene() {
    const scene = this.engine.scene;
    if (!scene) return;
    if (this.camGO?.scene !== scene) {
      this.camGO = scene.createGameObject('__EditorCamera');
      this.camGO._editorOnly = true;
      this.editorCamera = this.camGO.addComponent('Camera', {
        fieldOfView: 60, nearClipPlane: 0.05, farClipPlane: 900, depth: 100,
      });
      this._applyOrbit();
      if (this.gizmo) this.gizmo.camera = this.editorCamera.camera;
    }
    scene.mainCamera = this.editorCamera;
    this.editorCamera.isMainCamera = true;
    if (this._grid && this._grid.parent !== scene.root) scene.root.add(this._grid);
    if (this._gizmoHelper && this._gizmoHelper.parent !== scene.root) scene.root.add(this._gizmoHelper);
    this.selected = null;
    this.gizmo?.detach();
    this._updateSelTag();
  }

  /* ==================== Выделение ==================== */
  select(go) {
    if (go === this.camGO) go = null;
    this.selected = go;
    if (this.gizmo) {
      if (go) { this.gizmo.attach(go.transform.object3D); this._gizmoHelper.visible = true; }
      else { this.gizmo.detach(); this._gizmoHelper.visible = false; }
    }
    this._updateSelTag();
    if (go && this.panel === 'hierarchy') this.openPanel('inspector');
    else this.refreshPanel();
  }

  focusSelected() {
    if (!this.selected) { this.log('Сначала выберите объект', 'warn'); return; }
    this._orbit.target.copy(this.selected.transform.position);
    this._orbit.distance = 7;
    this._applyOrbit();
  }

  markDirty() { this._dirty = true; }

  /* ==================== Объекты ==================== */
  createObject(primitive = 'box') {
    const scene = this.engine.scene;
    const t = this._orbit.target;
    const go = scene.createGameObject(this._uniqueName(RU_PRIM[primitive] ?? primitive), {
      position: new THREE.Vector3(Math.round(t.x), Math.max(0.5, Math.round(t.y)), Math.round(t.z)),
    });
    go.addComponent('MeshRenderer', { geometryType: primitive });
    go.addComponent(primitive === 'sphere' ? 'SphereCollider' : 'BoxCollider');
    this.select(go);
    this.markDirty();
    this.log(`Создан объект «${go.name}»`, 'ok');
    return go;
  }

  createSpecial(kind) {
    const scene = this.engine.scene;
    const t = this._orbit.target;
    let go;
    if (kind === 'light') {
      go = scene.createGameObject(this._uniqueName('Свет'), {
        position: new THREE.Vector3(t.x, t.y + 6, t.z + 3),
      });
      go.addComponent('Light', { lightType: 'point', intensity: 1.4, range: 22 });
    } else if (kind === 'camera') {
      go = scene.createGameObject(this._uniqueName('Камера'), {
        position: new THREE.Vector3(t.x, t.y + 4, t.z + 10),
      });
      go.addComponent('Camera', { fieldOfView: 60 });
      go.transform.lookAt(t);
    } else if (kind === 'particles') {
      go = scene.createGameObject(this._uniqueName('Частицы'), { position: t.clone() });
      go.addComponent('ParticleSystem');
    } else if (kind === 'empty') {
      go = scene.createGameObject(this._uniqueName('Объект'), { position: t.clone() });
    }
    if (go) {
      this.select(go);
      this.markDirty();
      this.log(`Создан объект «${go.name}»`, 'ok');
    }
    return go;
  }

  _uniqueName(base) {
    const names = new Set(this.engine.scene.gameObjects.map((g) => g.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  }

  duplicateSelected() {
    if (!this.selected) { this.log('Сначала выберите объект', 'warn'); return; }
    const data = this.selected.serialize();
    data.name = this._uniqueName(this.selected.name);
    const clone = GameObject.deserialize(data, this.engine.scene, this.selected.transform.parent);
    clone.transform.position = clone.transform.position.clone().add(new THREE.Vector3(1.5, 0, 0));
    this.select(clone);
    this.markDirty();
    this.log(`Дублирован объект «${clone.name}»`, 'ok');
  }

  async deleteSelected() {
    if (!this.selected) { this.log('Сначала выберите объект', 'warn'); return; }
    const name = this.selected.name;
    const { confirmSheet } = await import('../shell/home.js');
    const yes = await confirmSheet({
      title: 'Удалить объект?',
      message: `Объект «${name}» и все его дочерние объекты будут удалены из сцены.`,
    });
    if (!yes) return;
    this.gizmo?.detach();
    this.engine.scene.destroy(this.selected);
    this.selected = null;
    this._gizmoHelper && (this._gizmoHelper.visible = false);
    this.markDirty();
    setTimeout(() => { this._updateSelTag(); this.refreshPanel(); }, 40);
    this.log(`Удалён объект «${name}»`, 'warn');
  }

  /* ==================== Иерархия ==================== */
  _renderHierarchy() {
    const scene = this.engine.scene;
    const box = this.dockBody;
    box.innerHTML = '';
    if (!scene) return;

    const roots = scene.gameObjects.filter((g) => !g.transform.parent && g !== this.camGO);
    if (!roots.length) {
      const e = el('div', 'wfl-none');
      e.appendChild(el('div', 'ic', icon('cube', 26)));
      e.appendChild(el('div', null,
        'В сцене пока нет объектов.<br>Нажмите «+» справа сверху, чтобы добавить первый.'));
      box.appendChild(e);
      return;
    }

    const build = (go, depth) => {
      const kids = go.transform.children.filter((c) => c.gameObject && c.gameObject !== this.camGO);
      const row = el('div', `wfl-row${go === this.selected ? ' sel' : ''}${go.activeSelf ? '' : ' off'}`);
      row.style.marginLeft = `${depth * 14}px`;

      if (kids.length) {
        const tw = el('div', 'tw', icon(this._collapsed.has(go.id) ? 'forward' : 'down', 14));
        tw.onclick = (e) => {
          e.stopPropagation();
          this._collapsed.has(go.id) ? this._collapsed.delete(go.id) : this._collapsed.add(go.id);
          this._renderHierarchy();
        };
        row.appendChild(tw);
      }

      row.appendChild(el('div', 'ic', icon(iconForThing(this._objIcon(go)), 18)));
      const comps = go.components.map((c) => compTitle(c.constructor.componentName)).slice(0, 2).join(', ');
      row.appendChild(el('div', 'nm', `${esc(go.name)}${comps ? `<i>${esc(comps)}</i>` : ''}`));

      const vis = el('div', 'vis', icon(go.activeSelf ? 'eye' : 'eye-off', 16));
      vis.onclick = (e) => {
        e.stopPropagation();
        go.setActive(!go.activeSelf);
        this.markDirty();
        this._renderHierarchy();
      };
      row.appendChild(vis);

      row.onclick = () => this.select(go);
      box.appendChild(row);

      if (!this._collapsed.has(go.id)) for (const c of kids) build(c.gameObject, depth + 1);
    };
    for (const g of roots) build(g, 0);
  }

  _objIcon(go) {
    const mesh = go.getComponent?.('MeshRenderer');
    if (mesh?.geometryType) return mesh.geometryType;
    const first = go.components[0]?.constructor.componentName;
    return first ?? go.name;
  }

  /* ==================== Инспектор ==================== */
  _renderInspector() {
    const box = this.dockBody;
    box.innerHTML = '';
    this._vecInputs = [];
    const go = this.selected;

    if (!go) {
      const e = el('div', 'wfl-none');
      e.appendChild(el('div', 'ic', icon('inspector', 26)));
      e.appendChild(el('div', null,
        'Объект не выбран.<br>Тапните по нему в сцене или во вкладке «Объекты».'));
      box.appendChild(e);
      return;
    }

    /* Общие свойства */
    const head = this._card(box, 'project', 'Объект', null, false);
    this._text(head, 'Имя', go.name, (v) => {
      go.name = v || go.name;
      this.markDirty();
      this._updateSelTag();
    });
    this._text(head, 'Тег', go.tag ?? '', (v) => { go.tag = v; this.markDirty(); });
    this._switch(head, 'Активен', go.activeSelf, (v) => {
      go.setActive(v);
      this.markDirty();
    });

    /* Трансформ */
    const tr = this._card(box, 'move', 'Трансформ', null, false);
    this._vec3(tr, 'Позиция', go.transform.localPosition, () => {
      go.transform.object3D.updateMatrix();
      this.markDirty();
    });
    const euler = go.transform.localEulerAngles.clone();
    this._vec3(tr, 'Поворот, °', euler, () => {
      go.transform.localEulerAngles = euler;
      this.markDirty();
    });
    this._vec3(tr, 'Масштаб', go.transform.localScale, () => this.markDirty());

    /* Компоненты */
    for (const comp of [...go.components]) {
      const cname = comp.constructor.componentName ?? comp.constructor.name;
      const key = `${go.id}:${cname}`;
      const collapsed = this._collapsed.has(key);
      const bd = this._card(box, iconForThing(cname), compTitle(cname), () => {
        collapsed ? this._collapsed.delete(key) : this._collapsed.add(key);
        this._renderInspector();
      }, true, () => {
        go.removeComponent(comp);
        this.markDirty();
        this._renderInspector();
        this.log(`Удалён компонент «${compTitle(cname)}»`, 'warn');
      }, collapsed);
      if (!collapsed && bd) this._componentFields(bd, comp, comp.constructor);
    }

    /* Добавить компонент */
    const add = el('div', 'wfl-list-item');
    add.innerHTML = `<span class="ic">${icon('plus', 18)}</span><span class="t">Добавить компонент</span>`;
    add.onclick = () => this.showComponentSheet();
    box.appendChild(add);
  }

  /**
   * Карточка в инспекторе.
   * @returns {HTMLElement|null} тело карточки (null, если свёрнута)
   */
  _card(parent, ico, title, onToggle, removable, onRemove, collapsed = false) {
    const card = el('div', 'wfl-card2');
    const hd = el('div', 'hd');
    hd.appendChild(el('span', 'ic', icon(ico, 18)));
    hd.appendChild(el('span', 't', esc(title)));
    if (onToggle) {
      hd.appendChild(el('span', 'ic', icon(collapsed ? 'forward' : 'down', 15)));
      hd.onclick = onToggle;
    }
    if (removable) {
      const x = el('span', 'x', icon('trash', 15));
      x.onclick = (e) => { e.stopPropagation(); onRemove?.(); };
      hd.appendChild(x);
    }
    card.appendChild(hd);
    parent.appendChild(card);
    if (collapsed) return null;
    const bd = el('div', 'bd');
    card.appendChild(bd);
    return bd;
  }

  _componentFields(wrap, comp, Ctor) {
    const spec = Ctor.inspector ?? {};
    for (const [key, def] of Object.entries(spec)) {
      const cur = comp[key];
      const label = def.label ?? key;
      switch (def.type) {
        case 'number':
          this._num(wrap, label, cur, (v) => { comp[key] = v; this._afterEdit(comp); }, def);
          break;
        case 'boolean':
          this._switch(wrap, label, !!cur, (v) => { comp[key] = v; this._afterEdit(comp); });
          break;
        case 'string':
          this._text(wrap, label, cur ?? '', (v) => { comp[key] = v; this._afterEdit(comp); });
          break;
        case 'color': {
          const hex = cur?.getHexString ? `#${cur.getHexString()}` : (cur ?? '#ffffff');
          this._color(wrap, label, hex, (v) => {
            if (comp[key]?.set) comp[key].set(v); else comp[key] = new THREE.Color(v);
            this._afterEdit(comp);
          });
          break;
        }
        case 'select':
          this._select(wrap, label, def.options ?? [], cur, (v) => {
            const num = Number(v);
            comp[key] = (!Number.isNaN(num) && String(num) === v && typeof def.default === 'number') ? num : v;
            this._afterEdit(comp);
          });
          break;
        case 'vector3':
          if (cur?.isVector3) this._vec3(wrap, label, cur, () => this._afterEdit(comp));
          break;
        case 'code':
          this._textarea(wrap, label, cur ?? '', (v) => { comp[key] = v; comp.compile?.(); this.markDirty(); });
          break;
        case 'blueprint': {
          const f = el('div', 'wfl-f');
          f.appendChild(el('label', null, esc(label)));
          const b = el('div', 'wfl-list-item');
          b.innerHTML = `<span class="ic">${icon('blueprint', 18)}</span>`
            + `<span class="t">Открыть граф<i style="display:block;font-style:normal;font-size:11px;`
            + `color:#6f7d99;font-weight:500;margin-top:2px">${esc(comp.summary ?? '')}</i></span>`
            + `<span class="ic">${icon('forward', 15)}</span>`;
          b.onclick = () => this.openBlueprint(comp);
          f.appendChild(b);
          wrap.appendChild(f);
          break;
        }
        default:
          if (typeof cur === 'number') this._num(wrap, label, cur, (v) => { comp[key] = v; this._afterEdit(comp); });
          else if (typeof cur === 'boolean') this._switch(wrap, label, cur, (v) => { comp[key] = v; this._afterEdit(comp); });
          else if (typeof cur === 'string') this._text(wrap, label, cur, (v) => { comp[key] = v; this._afterEdit(comp); });
      }
    }
  }

  _afterEdit(comp) {
    comp.rebuild?.();
    comp._build?.();
    comp.updateBounds?.();
    comp.onValidate?.();
    this.markDirty();
  }

  /* ---------- Поля ---------- */
  _fieldWrap(parent, label) {
    const f = el('div', 'wfl-f');
    if (label) f.appendChild(el('label', null, esc(label)));
    parent.appendChild(f);
    return f;
  }

  _text(parent, label, value, onChange) {
    const f = this._fieldWrap(parent, label);
    const i = document.createElement('input');
    i.type = 'text';
    i.value = value ?? '';
    i.oninput = () => onChange(i.value);
    f.appendChild(i);
    return i;
  }

  _num(parent, label, value, onChange, def = {}) {
    const f = this._fieldWrap(parent, label);
    const i = document.createElement('input');
    i.type = 'number';
    i.inputMode = 'decimal';
    i.value = value ?? 0;
    if (def.step != null) i.step = def.step;
    if (def.min != null) i.min = def.min;
    if (def.max != null) i.max = def.max;
    i.oninput = () => onChange(parseFloat(i.value) || 0);
    f.appendChild(i);
    return i;
  }

  _color(parent, label, value, onChange) {
    const f = this._fieldWrap(parent, label);
    const i = document.createElement('input');
    i.type = 'color';
    i.value = value;
    i.oninput = () => onChange(i.value);
    f.appendChild(i);
    return i;
  }

  _select(parent, label, options, value, onChange) {
    const f = this._fieldWrap(parent, label);
    const s = document.createElement('select');
    for (const o of options) s.appendChild(new Option(String(o), String(o)));
    s.value = String(value);
    s.onchange = () => onChange(s.value);
    f.appendChild(s);
    return s;
  }

  _textarea(parent, label, value, onChange) {
    const f = this._fieldWrap(parent, label);
    const t = document.createElement('textarea');
    t.value = value;
    t.spellcheck = false;
    t.onchange = () => onChange(t.value);
    f.appendChild(t);
    return t;
  }

  _switch(parent, label, value, onChange) {
    const row = el('div', `wfl-sw${value ? ' on' : ''}`);
    row.appendChild(el('span', null, esc(label)));
    row.appendChild(el('span', 'tr'));
    row.onclick = () => {
      const on = !row.classList.contains('on');
      row.classList.toggle('on', on);
      onChange(on);
    };
    parent.appendChild(row);
    return row;
  }

  _vec3(parent, label, vec, onChange) {
    const f = this._fieldWrap(parent, label);
    const grid = el('div', 'v3');
    const inputs = [];
    ['x', 'y', 'z'].forEach((axis) => {
      const cell = el('div');
      cell.appendChild(el('label', null, axis.toUpperCase()));
      const i = document.createElement('input');
      i.type = 'number';
      i.inputMode = 'decimal';
      i.step = '0.1';
      i.value = Number(vec[axis].toFixed(3));
      i.oninput = () => { vec[axis] = parseFloat(i.value) || 0; onChange?.(); };
      cell.appendChild(i);
      grid.appendChild(cell);
      inputs.push(i);
    });
    f.appendChild(grid);
    this._vecInputs = this._vecInputs ?? [];
    this._vecInputs.push({ vec, inputs });
    return inputs;
  }

  _syncVectors() {
    if (!this._vecInputs) return;
    for (const { vec, inputs } of this._vecInputs) {
      ['x', 'y', 'z'].forEach((axis, i) => {
        if (document.activeElement !== inputs[i]) inputs[i].value = Number(vec[axis].toFixed(3));
      });
    }
  }

  /* ==================== Консоль ==================== */
  _renderConsole() {
    const box = this.dockBody;
    box.innerHTML = '';
    const log = el('div', 'wfl-log2');
    for (const { text, kind } of this.logLines.slice(-200)) {
      log.appendChild(el('div', kind, esc(text)));
    }
    if (!this.logLines.length) {
      const e = el('div', 'wfl-none');
      e.appendChild(el('div', 'ic', icon('console', 26)));
      e.appendChild(el('div', null, 'Сообщений пока нет.'));
      box.appendChild(e);
      return;
    }
    box.appendChild(log);
    box.scrollTop = box.scrollHeight;
  }

  _hookConsole() {
    const orig = { warn: console.warn, error: console.error };
    this._origConsole = orig;
    console.warn = (...a) => { orig.warn(...a); this.log(a.map(String).join(' '), 'warn'); };
    console.error = (...a) => { orig.error(...a); this.log(a.map(String).join(' '), 'err'); };
  }

  log(msg, kind = 'dim') {
    const time = new Date().toLocaleTimeString('ru-RU', { hour12: false });
    this.logLines.push({ text: `${time}  ${msg}`, kind });
    if (this.logLines.length > 400) this.logLines.shift();
    if (this.panel === 'console' && this.dockOpen) this._renderConsole();
  }

  /* ==================== Листы ==================== */
  async _sheet(opts) {
    const { sheet } = await import('../shell/home.js');
    return sheet(opts);
  }

  async showAddSheet() {
    const s = await this._sheet({
      title: 'Добавить объект',
      subtitle: 'Объект появится в центре видимой области.',
    });
    const special = [
      ['empty', 'component', 'Пустой объект'],
      ['light', 'light', 'Источник света'],
      ['camera', 'camera', 'Камера'],
      ['particles', 'particles', 'Частицы'],
    ];
    for (const [kind, ico, label] of special) {
      const it = el('div', 'wfl-list-item',
        `<span class="ic">${icon(ico, 18)}</span><span class="t">${label}</span>`);
      it.onclick = () => { s.close(); this.createSpecial(kind); };
      s.body.appendChild(it);
    }
    s.body.appendChild(el('div', null,
      '<div style="font-size:11px;font-weight:700;color:#7f8da8;letter-spacing:.04em;'
      + 'text-transform:uppercase;margin:16px 0 9px">Примитивы</div>'));
    const grid = el('div', 'wfl-add-grid');
    for (const g of Object.keys(GEOMETRY_FACTORY)) {
      const it = el('div', 'wfl-add-item',
        `<span class="ic">${icon(iconForThing(g), 24)}</span><span>${RU_PRIM[g] ?? g}</span>`);
      it.onclick = () => { s.close(); this.createObject(g); };
      grid.appendChild(it);
    }
    s.body.appendChild(grid);
  }

  async showComponentSheet() {
    if (!this.selected) { this.log('Сначала выберите объект', 'warn'); return; }
    const s = await this._sheet({
      title: 'Добавить компонент',
      subtitle: `Объект «${this.selected.name}»`,
    });
    const names = [...ComponentRegistry.keys()].sort((a, b) => compTitle(a).localeCompare(compTitle(b), 'ru'));
    const search = document.createElement('input');
    search.type = 'text';
    search.placeholder = 'Поиск компонента';
    search.style.cssText = 'width:100%;padding:13px 14px;border-radius:12px;border:1px solid #26334f;'
      + 'background:#0c1220;color:#e8edf7;font:15px/1 inherit;outline:none;margin-bottom:12px';
    s.body.appendChild(search);
    const list = el('div');
    s.body.appendChild(list);

    const draw = (filter = '') => {
      list.innerHTML = '';
      const f = filter.trim().toLowerCase();
      for (const n of names) {
        const title = compTitle(n);
        if (f && !title.toLowerCase().includes(f) && !n.toLowerCase().includes(f)) continue;
        const it = el('div', 'wfl-list-item',
          `<span class="ic">${icon(iconForThing(n), 18)}</span>`
          + `<span class="t">${esc(title)}<i style="display:block;font-style:normal;font-size:11px;`
          + `color:#6f7d99;font-weight:500;margin-top:2px">${esc(n)}</i></span>`);
        it.onclick = () => {
          try {
            this.selected.addComponent(n);
            this.markDirty();
            this.log(`Добавлен компонент «${title}»`, 'ok');
            s.close();
            this.openPanel('inspector');
          } catch (e) { this.log(String(e), 'err'); }
        };
        list.appendChild(it);
      }
      if (!list.childElementCount) list.appendChild(el('div', 'wfl-none', 'Ничего не найдено'));
    };
    search.oninput = () => draw(search.value);
    draw();
  }

  async showMoreSheet() {
    const s = await this._sheet({
      title: 'Сцена и сборка',
      subtitle: this.project?.name ?? '',
    });
    const mk = (ico, label, hint, fn) => {
      const it = el('div', 'wfl-list-item',
        `<span class="ic">${icon(ico, 18)}</span><span class="t">${esc(label)}`
        + `<i style="display:block;font-style:normal;font-size:11px;color:#6f7d99;font-weight:500;`
        + `margin-top:2px">${esc(hint)}</i></span>`);
      it.onclick = fn;
      s.body.appendChild(it);
    };
    mk('save', 'Сохранить проект', 'Записать текущую сцену', () => {
      this.onChange();
      s.close();
      this.log('Проект сохранён', 'ok');
    });
    mk('android', 'Собрать APK', 'Установочный файл для Android', () => { s.close(); this.buildAPK(); });
    mk('blueprint', 'Блюпринт объекта', 'Визуальные скрипты без кода', () => { s.close(); this.openBlueprint(); });
    mk('download', 'Экспорт сцены в JSON', 'Файл .wflscene.json', () => { s.close(); this.exportJSON(); });
    mk('grid', 'Показать сетку', this._grid?.visible ? 'Сейчас включена' : 'Сейчас выключена', () => {
      if (this._grid) this._grid.visible = !this._grid.visible;
      s.close();
    });
    mk('home', 'Выйти на главную', 'Проект сохранится автоматически', () => { s.close(); this.confirmExit(); });
  }

  async confirmExit() {
    this.onChange();
    this.onExit();
  }

  /* ==================== Данные сцены ==================== */
  /** Сцена без служебных объектов редактора */
  sceneData() {
    const data = this.engine.scene.serialize();
    data.objects = (data.objects ?? []).filter((o) => o.name !== '__EditorCamera');
    if (this.project?.name) data.name = this.project.name;
    return data;
  }

  exportJSON() {
    const data = this.sceneData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(data.name ?? 'scene').replace(/\s+/g, '-')}.wflscene.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    this.log('Сцена экспортирована в JSON', 'ok');
  }

  async openBlueprint(comp = null) {
    let target = comp;
    if (!target) {
      if (!this.selected) { this.log('Сначала выберите объект', 'warn'); return; }
      target = this.selected.getComponent('Blueprint');
      if (!target) {
        const Ctor = ComponentRegistry.get('Blueprint');
        if (!Ctor) { this.log('Компонент Blueprint не зарегистрирован', 'err'); return; }
        target = this.selected.addComponent(Ctor);
        this.log(`Добавлен компонент «Блюпринт» на «${this.selected.name}»`, 'ok');
        this._renderInspector();
      }
    }
    if (!target.graph) target.compile();
    try {
      const { BlueprintEditor } = await import('./blueprint-editor.js');
      this._bpEditor?.dispose();
      this._bpEditor = new BlueprintEditor({
        component: target,
        host: this,
        onClose: () => {
          this._bpEditor = null;
          this.markDirty();
          this._renderInspector();
        },
      }).mount(this.engine.container);
    } catch (e) {
      this.log(`Не удалось открыть редактор блюпринтов: ${e}`, 'err');
      console.error(e);
    }
  }

  async buildAPK() {
    this.onChange();
    try {
      const { openBuildDialog } = await import('./build-dialog.js');
      openBuildDialog(this.engine, {
        sceneData: this.sceneData(),
        project: this.project,
      });
    } catch (e) {
      this.log(`Не удалось открыть диалог сборки: ${e}`, 'err');
    }
  }

  /* ==================== Закрытие ==================== */
  close() {
    clearInterval(this._saveTimer);
    this._bpEditor?.dispose();
    this._bpEditor = null;
    this.detachTools();
    this.setSimulation(true);
    this.gizmo?.detach();
    this._gizmoHelper?.removeFromParent();
    this.gizmo?.dispose?.();
    this._grid?.removeFromParent();
    if (this._origConsole) {
      console.warn = this._origConsole.warn;
      console.error = this._origConsole.error;
    }
    if (this.camGO?.scene) this.engine.scene.remove(this.camGO);
    if (this._gameCamera) {
      this._gameCamera.isMainCamera = true;
      this.engine.scene.mainCamera = this._gameCamera;
    }
    this.root.remove();
    this.engine._editor = null;
  }
}

/** Открыть редактор поверх движка (совместимость со старым API) */
export function openEditor(engine, opts = {}) {
  if (engine._editor) { engine._editor.close(); return null; }
  engine._editor = new Editor(engine, opts);
  return engine._editor;
}
