// WFL Engine — визуальный редактор графов Blueprints.
// Полноэкранный оверлей: холст с узлами, кривые связей на SVG, палитра узлов,
// панорамирование/зум колесом и щипком, работа мышью и пальцем.
import { BlueprintGraph } from '../engine/blueprint/graph.js';
import {
  getNodeDef, nodesByCategory, CATEGORY_COLORS, canConnectTypes, pinType, PIN_TYPE_LABELS,
} from '../engine/blueprint/nodes.js';

const STYLE_ID = 'wfl-bp-styles';

const BP_CSS = `
.wfl-bp{position:absolute;inset:0;z-index:70;display:flex;flex-direction:column;background:#0b0e14;
  font:13px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#d7dee9;
  user-select:none;-webkit-user-select:none;touch-action:none}
.wfl-bp-top{display:flex;align-items:center;gap:6px;padding:0 10px;height:44px;flex:0 0 auto;
  background:#12161f;border-bottom:1px solid #232b3a;overflow-x:auto;scrollbar-width:thin}
.wfl-bp-title{font-weight:800;color:#c69bff;margin-right:6px;white-space:nowrap}
.wfl-bp-name{background:#0d1119;border:1px solid #263045;color:#dbe3ef;border-radius:5px;
  padding:5px 8px;font-size:12px;width:170px;font-family:inherit}
.wfl-bp-body{flex:1;display:flex;overflow:hidden;position:relative}
.wfl-bp-canvas{flex:1;position:relative;overflow:hidden;cursor:grab;
  background-color:#0d1017;
  background-image:linear-gradient(#161b26 1px,transparent 1px),linear-gradient(90deg,#161b26 1px,transparent 1px),
    linear-gradient(#12161f 1px,transparent 1px),linear-gradient(90deg,#12161f 1px,transparent 1px)}
.wfl-bp-canvas.panning{cursor:grabbing}
.wfl-bp-world{position:absolute;left:0;top:0;transform-origin:0 0;width:0;height:0}
.wfl-bp-svg{position:absolute;left:-20000px;top:-20000px;width:40000px;height:40000px;overflow:visible;pointer-events:none}
.wfl-bp-svg path{fill:none;stroke-linecap:round}
.wfl-bp-svg path.hit{stroke:transparent;stroke-width:14;pointer-events:stroke;cursor:pointer}

.wfl-bp-node{position:absolute;min-width:150px;background:#171d29;
  border:1px solid #2b3548;border-radius:9px;box-shadow:0 6px 20px rgba(0,0,0,.45);overflow:hidden}
.wfl-bp-node.sel{border-color:#6ea8ff;box-shadow:0 0 0 2px rgba(110,168,255,.35),0 6px 20px rgba(0,0,0,.5)}
.wfl-bp-node.err{border-color:#e05263}
.wfl-bp-node-hd{padding:6px 10px;font-size:12px;font-weight:700;color:#fff;cursor:move;
  display:flex;align-items:center;gap:6px;white-space:nowrap}
.wfl-bp-node-hd .fold{opacity:.6;font-size:10px;cursor:pointer;padding:0 2px}
.wfl-bp-node-body{padding:4px 0 7px}
.wfl-bp-row{display:flex;align-items:center;gap:6px;min-height:22px;padding:1px 8px;position:relative}
.wfl-bp-row.out{justify-content:flex-end;text-align:right}
.wfl-bp-plabel{font-size:11.5px;color:#9aa7ba;white-space:nowrap}
.wfl-bp-pin{width:11px;height:11px;border-radius:50%;border:2px solid #0d1017;flex:0 0 auto;cursor:crosshair;
  box-sizing:content-box;transition:transform .1s,box-shadow .1s,opacity .1s;position:relative}
.wfl-bp-pin:hover,.wfl-bp-pin.hot{transform:scale(1.45)}
.wfl-bp-pin.exec{border-radius:2px;width:10px;height:12px;
  clip-path:polygon(0 0,62% 0,100% 50%,62% 100%,0 100%);background:#e6ecf5!important;border:none}
.wfl-bp-pin.exec.linked{background:#fff!important}
.wfl-bp-pin.connected{box-shadow:0 0 0 2px rgba(255,255,255,.18)}
.wfl-bp-inp{background:#0d1119;border:1px solid #263045;color:#dbe3ef;border-radius:4px;
  padding:2px 5px;font-size:11.5px;width:62px;font-family:inherit}
.wfl-bp-inp.wide{width:104px}
.wfl-bp-inp:focus{outline:none;border-color:#3d6ecf}
.wfl-bp-inp[type=checkbox]{width:15px;height:15px;accent-color:#2d6cdf}
.wfl-bp-vec{display:flex;gap:3px}
.wfl-bp-vec input{width:38px;text-align:center}

.wfl-bp-side{width:230px;flex:0 0 auto;background:#12161f;border-left:1px solid #232b3a;
  display:flex;flex-direction:column;overflow:hidden}
.wfl-bp-search{margin:7px;padding:6px 8px;background:#0d1119;border:1px solid #263045;
  color:#dbe3ef;border-radius:6px;font-size:12px;font-family:inherit}
.wfl-bp-search:focus{outline:none;border-color:#3d6ecf}
.wfl-bp-list{flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#2c3648 transparent;padding-bottom:8px}
.wfl-bp-list::-webkit-scrollbar{width:8px}
.wfl-bp-list::-webkit-scrollbar-thumb{background:#2c3648;border-radius:4px}
.wfl-bp-cat{padding:6px 10px 3px;font-size:10.5px;font-weight:700;letter-spacing:.07em;
  text-transform:uppercase;color:#7b8798;position:sticky;top:0;background:#12161f}
.wfl-bp-item{padding:5px 10px 5px 16px;font-size:12px;cursor:pointer;border-left:3px solid transparent;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wfl-bp-item:hover{background:#1b2331;color:#fff}
.wfl-bp-hint{padding:8px 10px;font-size:11px;color:#5d6a7d;border-top:1px solid #232b3a;line-height:1.5}
.wfl-bp-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;color:#4d5a6d;font-size:13px;gap:6px;pointer-events:none;text-align:center;padding:20px}
.wfl-bp-zoom{position:absolute;left:10px;bottom:10px;display:flex;gap:5px;align-items:center;
  background:rgba(18,22,31,.92);border:1px solid #232b3a;border-radius:8px;padding:4px 6px;font-size:11px;color:#8b97a8}
.wfl-bp-zoom button{width:26px;height:24px;padding:0}
.wfl-bp-err{position:absolute;right:10px;bottom:10px;max-width:320px;background:rgba(74,28,34,.95);
  border:1px solid #7a2c34;color:#ffb0b6;border-radius:8px;padding:7px 10px;font-size:11.5px;line-height:1.5}
/* Кнопки панели (раньше класс не имел стилей и выглядел как системная кнопка) */
.wfl-btn2{background:#1b2231;border:1px solid #2b3548;color:#c9d3e2;border-radius:6px;
  padding:6px 10px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap;
  transition:background .12s,border-color .12s}
.wfl-btn2:hover{background:#232c3e;color:#fff}
.wfl-btn2:active{background:#2b3548}
.wfl-btn2.play{background:#1d6b45;border-color:#2b9463;color:#d8ffe9}
.wfl-btn2.play:hover{background:#248055}
.wfl-btn2.danger{background:#5a2129;border-color:#7a2c34;color:#ffc9ce}
.wfl-btn2.danger:hover{background:#6d2832}
.wfl-ed-sep{width:1px;height:20px;background:#2b3548;flex:0 0 auto;margin:0 2px}

/* Подсветка пинов при протягивании связи */
.wfl-bp-pin.cand-ok{box-shadow:0 0 0 3px rgba(122,208,168,.55);transform:scale(1.5)}
.wfl-bp-pin.cand-cast{box-shadow:0 0 0 3px rgba(224,180,90,.55);transform:scale(1.5)}
.wfl-bp-pin.cand-bad{opacity:.25}
.wfl-bp-node.dim{opacity:.45}

/* Всплывающая подсказка о типе пина */
.wfl-bp-tip{position:absolute;z-index:20;background:#0d1119;border:1px solid #2b3548;
  color:#c9d3e2;border-radius:6px;padding:4px 8px;font-size:11.5px;pointer-events:none;
  white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.5)}
.wfl-bp-tip.bad{border-color:#7a2c34;color:#ffb0b6}
.wfl-bp-tip.cast{border-color:#8a6d2f;color:#ffd89a}

/* Нижняя панель для телефона */
.wfl-bp-mobile{display:none}
.wfl-bp-fab{position:absolute;right:12px;bottom:74px;width:52px;height:52px;border-radius:50%;
  background:#3d6ecf;border:none;color:#fff;font-size:26px;line-height:1;cursor:pointer;
  box-shadow:0 6px 18px rgba(0,0,0,.5);z-index:6}
.wfl-bp-fab:active{background:#3560b8}
.wfl-bp-linkmode{position:absolute;left:50%;transform:translateX(-50%);top:10px;z-index:8;
  background:rgba(61,110,207,.95);color:#fff;border-radius:20px;padding:7px 14px;font-size:12px;
  box-shadow:0 4px 14px rgba(0,0,0,.45);display:flex;align-items:center;gap:10px}
.wfl-bp-linkmode button{background:rgba(0,0,0,.28);border:none;color:#fff;border-radius:12px;
  padding:4px 10px;font:inherit;font-size:11.5px;cursor:pointer}

@media (max-width:900px){
  .wfl-bp-side{position:absolute;right:0;top:0;bottom:0;width:min(84vw,300px);z-index:9;
    box-shadow:-8px 0 24px rgba(0,0,0,.5);transform:translateX(100%);transition:transform .18s}
  .wfl-bp-side.open{transform:translateX(0)}
  .wfl-bp-name{width:110px}
  .wfl-bp-node{min-width:150px}
  /* Крупные цели нажатия: пины и кнопки по рекомендациям ~44px */
  .wfl-bp-pin{width:15px;height:15px;border-width:3px}
  .wfl-bp-pin.exec{width:14px;height:17px}
  /* Невидимая зона нажатия вокруг пина. Высота меньше шага строки (32px),
     иначе соседние пины перехватывали бы тап друг у друга. */
  .wfl-bp-pin::after{content:'';position:absolute;left:50%;top:50%;
    width:36px;height:28px;transform:translate(-50%,-50%)}
  .wfl-bp-row{min-height:32px;padding:3px 10px}
  .wfl-bp-node-hd{padding:10px 12px;font-size:13px}
  .wfl-bp-inp{padding:6px 7px;font-size:13px;width:74px}
  .wfl-bp-vec input{width:46px}
  .wfl-bp-item{padding:11px 12px 11px 16px;font-size:13.5px}
  .wfl-bp-search{padding:10px;font-size:14px}
  .wfl-bp-cat{padding:8px 12px 4px}
  .wfl-btn2{padding:9px 12px;font-size:13px}
  .wfl-bp-top{height:52px;gap:7px}
  .wfl-bp-zoom{bottom:auto;top:10px;left:10px;padding:6px 8px}
  .wfl-bp-zoom button{width:34px;height:32px}
  .wfl-bp-err{bottom:74px;left:10px;right:10px;max-width:none}
  /* Нижняя панель с самыми частыми действиями */
  .wfl-bp-mobile{display:flex;position:absolute;left:0;right:0;bottom:0;height:60px;z-index:7;
    background:#12161f;border-top:1px solid #232b3a;align-items:center;
    justify-content:space-around;padding:0 6px;gap:4px}
  .wfl-bp-mobile button{flex:1;height:46px;background:#1b2231;border:1px solid #2b3548;
    color:#c9d3e2;border-radius:8px;font:inherit;font-size:12px;cursor:pointer;
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
  .wfl-bp-mobile button:active{background:#2b3548}
  .wfl-bp-mobile button.on{background:#3d6ecf;border-color:#3d6ecf;color:#fff}
  .wfl-bp-mobile button.play{background:#1d6b45;border-color:#2b9463;color:#d8ffe9}
  .wfl-bp-canvas{padding-bottom:60px}
}
@media (max-width:900px) and (orientation:landscape){
  .wfl-bp-mobile{height:48px}
  .wfl-bp-mobile button{height:38px}
  .wfl-bp-top{height:44px}
}
`;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = BP_CSS;
  document.head.appendChild(s);
}

/** Экранирование значения атрибута для querySelector (CSS.escape есть не везде) */
function cssEscape(v) {
  if (typeof globalThis.CSS?.escape === 'function') return globalThis.CSS.escape(v);
  return String(v).replace(/["\\]/g, '\\$&');
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

const PIN_COLORS = {
  number: '#7ad0a8', string: '#d98fd0', boolean: '#e0705a',
  vector: '#e0b45a', object: '#5aa8e0', any: '#9aa7ba', exec: '#e6ecf5',
};

export class BlueprintEditor {
  /**
   * @param {object} host — редактор сцены (для лога), может быть null
   */
  constructor({ component, onClose = null, host = null } = {}) {
    ensureStyles();
    this.component = component;
    this.host = host;
    this.onClose = onClose;
    this.graph = component?.graph ?? new BlueprintGraph();
    if (!component?.graph && component) component.graph = this.graph;

    this.scale = 1;
    this.panX = 120;
    this.panY = 80;
    this.selected = new Set();
    this._nodeEls = new Map();
    this._linkEls = [];
    this._drag = null;
    this._pending = null;   // тянущаяся связь
    this._pointers = new Map();
    this._pinchDist = 0;
    this._tapFrom = null;   // первый пин в режиме «нажми-нажми»
    this._pinDownAt = null;
    // На сенсорных экранах режим соединения тапами включён сразу
    this.isTouch = typeof window !== 'undefined'
      && (('ontouchstart' in window) || (navigator.maxTouchPoints ?? 0) > 0);
    this.tapMode = this.isTouch;

    this._build();
    this.render();
  }

  /* ==================== DOM ==================== */
  _build() {
    this.root = el('div', 'wfl-bp');

    // --- Верхняя панель ---
    const top = el('div', 'wfl-bp-top');
    top.appendChild(el('span', 'wfl-bp-title', 'BLUEPRINT'));

    this.nameInput = el('input', 'wfl-bp-name');
    this.nameInput.value = this.component?.graphName ?? 'Граф';
    this.nameInput.placeholder = 'Имя графа';
    this.nameInput.addEventListener('change', () => {
      if (this.component) this.component.graphName = this.nameInput.value;
    });
    top.appendChild(this.nameInput);
    top.appendChild(el('div', 'wfl-ed-sep'));

    this._btn(top, '+ Узел', () => this.toggleSide(true));
    this._btn(top, 'Вписать', () => this.fitView());
    this._btn(top, 'Разложить', () => this.autoLayout());
    top.appendChild(el('div', 'wfl-ed-sep'));
    this._btn(top, 'Дублировать', () => this.duplicateSelection());
    this._btn(top, 'Удалить', () => this.deleteSelection(), 'danger');
    top.appendChild(el('div', 'wfl-ed-sep'));
    this.tapBtnTop = this._btn(top, 'Связь тапом', () => {
      this.tapMode = !this.tapMode;
      this._clearTap();
      this._syncTapBtn();
      this._flash(this.tapMode
        ? 'Режим связи: нажмите пин, затем второй пин'
        : 'Режим связи выключен — связи тянутся мышью', 'info');
    });
    this._btn(top, 'Проверить', () => this.validate());
    this._btn(top, 'Шаблон', () => this.insertTemplate());
    top.appendChild(el('div', 'wfl-ed-sep'));
    this.statsEl = el('span', 'wfl-bp-plabel', '');
    top.appendChild(this.statsEl);
    const spacer = el('div');
    spacer.style.flex = '1';
    top.appendChild(spacer);
    this._btn(top, 'Применить', () => this.apply(), 'play');
    this._btn(top, 'Закрыть', () => this.close());
    this.root.appendChild(top);

    // --- Тело ---
    const body = el('div', 'wfl-bp-body');
    this.canvas = el('div', 'wfl-bp-canvas');
    this.world = el('div', 'wfl-bp-world');
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'wfl-bp-svg');
    this.world.appendChild(this.svg);
    this.canvas.appendChild(this.world);

    this.emptyHint = el('div', 'wfl-bp-empty');
    this.emptyHint.appendChild(el('div', null, 'Граф пуст'));
    this.emptyHint.appendChild(el('div', null, 'Нажмите «+ Узел» и начните с события «При старте»,'));
    this.emptyHint.appendChild(el('div', null, 'либо вставьте готовый «Шаблон».'));
    this.canvas.appendChild(this.emptyHint);

    // Зум
    const zoom = el('div', 'wfl-bp-zoom');
    this._btn(zoom, '−', () => this.zoomBy(1 / 1.25));
    this.zoomLabel = el('span', null, '100%');
    zoom.appendChild(this.zoomLabel);
    this._btn(zoom, '+', () => this.zoomBy(1.25));
    this.canvas.appendChild(zoom);

    this.errBox = el('div', 'wfl-bp-err');
    this.errBox.style.display = 'none';
    this.canvas.appendChild(this.errBox);

    body.appendChild(this.canvas);

    // --- Палитра ---
    this.side = el('div', 'wfl-bp-side');
    this.search = el('input', 'wfl-bp-search');
    this.search.placeholder = 'Поиск узла…';
    this.search.addEventListener('input', () => this._fillPalette(this.search.value));
    this.side.appendChild(this.search);
    this.list = el('div', 'wfl-bp-list');
    this.side.appendChild(this.list);
    this.side.appendChild(el('div', 'wfl-bp-hint',
      'Соединить: нажмите один пин, затем второй (или тяните от пина к пину). '
      + 'Зелёный ободок — можно, жёлтый — с приведением типа. '
      + 'Клик по связи — удалить. Щипок — зум, перетаскивание фона — панорама.'));
    body.appendChild(this.side);

    // --- Нижняя панель для телефона ---
    this.mobileBar = el('div', 'wfl-bp-mobile');
    const mbtn = (label, sub, cb, cls = '') => {
      const b = el('button', cls);
      b.appendChild(el('span', null, label));
      if (sub) b.appendChild(el('span', null, sub)).style.cssText = 'font-size:10px;opacity:.65';
      b.addEventListener('click', (e) => { e.stopPropagation(); cb(b); });
      this.mobileBar.appendChild(b);
      return b;
    };
    mbtn('＋', 'узел', () => this.toggleSide(true));
    this.tapBtn = mbtn('🔗', 'связь', () => {
      this.tapMode = !this.tapMode;
      this._clearTap();
      this._syncTapBtn();
      this._flash(this.tapMode
        ? 'Режим связи: нажмите пин, затем второй пин'
        : 'Режим связи выключен — узлы можно двигать', 'info');
    });
    mbtn('⤢', 'вписать', () => this.fitView());
    mbtn('⧉', 'копия', () => this.duplicateSelection());
    mbtn('🗑', 'удалить', () => this.deleteSelection());
    mbtn('✓', 'применить', () => this.apply(), 'play');
    body.appendChild(this.mobileBar);
    this._syncTapBtn();

    this.root.appendChild(body);

    this._fillPalette('');
    this._bindCanvas();

    this._keyHandler = (e) => this._onKey(e);
    window.addEventListener('keydown', this._keyHandler);
  }

  _btn(parent, label, cb, cls = '') {
    const b = el('button', `wfl-btn2 ${cls}`.trim(), label);
    b.addEventListener('click', (e) => { e.stopPropagation(); cb(); });
    parent.appendChild(b);
    return b;
  }

  _syncTapBtn() {
    this.tapBtn?.classList.toggle('on', this.tapMode);
    this.canvas?.classList.toggle('tapmode', this.tapMode);
    if (this.tapBtnTop) {
      this.tapBtnTop.classList.toggle('play', this.tapMode);
      this.tapBtnTop.textContent = this.tapMode ? 'Связь тапом: вкл' : 'Связь тапом';
    }
  }

  toggleSide(force) {
    const open = force ?? !this.side.classList.contains('open');
    this.side.classList.toggle('open', open);
    if (open) this.search.focus();
  }

  /* ==================== Палитра ==================== */
  _fillPalette(filter) {
    this.list.innerHTML = '';
    const f = (filter || '').trim().toLowerCase();
    for (const [cat, defs] of nodesByCategory()) {
      const matched = defs.filter((d) => !f
        || d.title.toLowerCase().includes(f) || d.type.toLowerCase().includes(f));
      if (!matched.length) continue;
      const head = el('div', 'wfl-bp-cat', cat);
      head.style.color = CATEGORY_COLORS[cat] ? this._lighten(CATEGORY_COLORS[cat]) : '#7b8798';
      this.list.appendChild(head);
      for (const d of matched) {
        const item = el('div', 'wfl-bp-item', d.title);
        item.style.borderLeftColor = CATEGORY_COLORS[d.category] ?? '#495057';
        item.title = d.desc || d.type;
        item.addEventListener('click', () => {
          // Ставим узел в центр видимой области
          const r = this.canvas.getBoundingClientRect();
          const x = (r.width / 2 - this.panX) / this.scale - 70;
          const y = (r.height / 2 - this.panY) / this.scale - 30;
          const node = this.graph.addNode(d.type, x + (Math.random() * 40 - 20), y + (Math.random() * 40 - 20));
          this.selected = new Set([node.id]);
          this.render();
          if (window.innerWidth <= 900) this.toggleSide(false);
        });
        this.list.appendChild(item);
      }
    }
  }

  _lighten(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((n >> 16) & 255) + 70);
    const g = Math.min(255, ((n >> 8) & 255) + 70);
    const b = Math.min(255, (n & 255) + 70);
    return `rgb(${r},${g},${b})`;
  }

  /* ==================== Отрисовка ==================== */
  render() {
    // Узлы
    const seen = new Set();
    for (const node of this.graph.nodes.values()) {
      seen.add(node.id);
      let elm = this._nodeEls.get(node.id);
      if (!elm) {
        elm = this._buildNode(node);
        this._nodeEls.set(node.id, elm);
        this.world.appendChild(elm);
      } else {
        this._refreshNode(node, elm);
      }
      elm.style.left = `${node.x}px`;
      elm.style.top = `${node.y}px`;
      elm.classList.toggle('sel', this.selected.has(node.id));
    }
    for (const [id, elm] of [...this._nodeEls]) {
      if (!seen.has(id)) { elm.remove(); this._nodeEls.delete(id); }
    }
    this._applyTransform();
    // Пины перестроились — вернуть подсветку допустимых целей
    if (this._tapFrom) this._highlightCandidates(this._tapFrom);
    this.drawLinks();
    this.emptyHint.style.display = this.graph.nodes.size ? 'none' : 'flex';
    const s = this.graph.stats;
    this.statsEl.textContent = `${s.nodes} узлов · ${s.links} связей`;
  }

  _buildNode(node) {
    const def = getNodeDef(node.type);
    const wrap = el('div', 'wfl-bp-node');
    wrap.dataset.id = node.id;
    if (!def) {
      wrap.classList.add('err');
      const hd = el('div', 'wfl-bp-node-hd', `Неизвестный узел: ${node.type}`);
      hd.style.background = '#7a2c34';
      wrap.appendChild(hd);
      this._makeDraggable(wrap, node, hd);
      return wrap;
    }

    const color = CATEGORY_COLORS[def.category] ?? '#495057';
    const hd = el('div', 'wfl-bp-node-hd', def.title);
    hd.style.background = color;
    if (def.event) {
      // Событийные узлы помечаем значком-молнией, а не эмодзи
      hd.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"'
        + ' style="vertical-align:-2px;margin-right:5px"><path d="M13.2 2.8L4.6 13.4h6L10 21.2l8.6-10.6h-6z"/></svg>'
        + `<span>${def.title.replace(/[&<>]/g, '')}</span>`;
    }
    wrap.appendChild(hd);
    this._makeDraggable(wrap, node, hd);

    const bodyEl = el('div', 'wfl-bp-node-body');
    wrap.appendChild(bodyEl);
    this._buildNodeBody(node, def, bodyEl);
    return wrap;
  }

  _refreshNode(node, elm) {
    const def = getNodeDef(node.type);
    const bodyEl = elm.querySelector('.wfl-bp-node-body');
    if (!def || !bodyEl) return;
    // Перерисовываем тело, только если изменилось состояние соединений
    bodyEl.innerHTML = '';
    this._buildNodeBody(node, def, bodyEl);
  }

  _buildNodeBody(node, def, bodyEl) {
    // exec-выходы и exec-входы в одну строку с первым рядом
    const execIn = def.execIn ?? [];
    const execOut = def.execOut ?? [];
    const rows = Math.max(execIn.length, execOut.length);
    for (let i = 0; i < rows; i++) {
      const row = el('div', 'wfl-bp-row');
      if (execIn[i] !== undefined) {
        row.appendChild(this._pin(node, 'execIn', execIn[i], 'exec'));
        if (execIn.length > 1 || execIn[i] !== 'in') {
          row.appendChild(el('span', 'wfl-bp-plabel', execIn[i]));
        }
      }
      const sp = el('div');
      sp.style.flex = '1';
      row.appendChild(sp);
      if (execOut[i] !== undefined) {
        const label = execOut[i] === 'out' && execOut.length === 1 ? '' : execOut[i];
        if (label) row.appendChild(el('span', 'wfl-bp-plabel', label));
        row.appendChild(this._pin(node, 'execOut', execOut[i], 'exec'));
      }
      bodyEl.appendChild(row);
    }

    // Свойства узла
    for (const [key, spec] of Object.entries(def.props ?? {})) {
      const row = el('div', 'wfl-bp-row');
      if (spec.label) row.appendChild(el('span', 'wfl-bp-plabel', spec.label));
      row.appendChild(this._propInput(node, key, spec));
      bodyEl.appendChild(row);
    }

    // Входы данных
    for (const pin of def.inputs ?? []) {
      const row = el('div', 'wfl-bp-row');
      row.appendChild(this._pin(node, 'in', pin.name, pin.type));
      if (pin.label) row.appendChild(el('span', 'wfl-bp-plabel', pin.label));
      const linked = !!this.graph._dataIn?.get(`${node.id}:${pin.name}`);
      if (!linked) {
        const inp = this._pinInput(node, pin);
        if (inp) {
          const sp = el('div');
          sp.style.flex = '1';
          row.appendChild(sp);
          row.appendChild(inp);
        }
      }
      bodyEl.appendChild(row);
    }

    // Выходы данных
    for (const pin of def.outputs ?? []) {
      const row = el('div', 'wfl-bp-row out');
      const sp = el('div');
      sp.style.flex = '1';
      row.appendChild(sp);
      if (pin.label) row.appendChild(el('span', 'wfl-bp-plabel', pin.label));
      row.appendChild(this._pin(node, 'out', pin.name, pin.type));
      bodyEl.appendChild(row);
    }
  }

  _pin(node, kind, name, type) {
    const p = el('div', `wfl-bp-pin ${type === 'exec' ? 'exec' : ''}`);
    if (type !== 'exec') p.style.background = PIN_COLORS[type] ?? PIN_COLORS.any;
    p.dataset.node = node.id;
    p.dataset.kind = kind;
    p.dataset.pin = name;
    p.dataset.type = type;
    p.title = `${name} — ${PIN_TYPE_LABELS[type] ?? type}`;

    const connected = this._isConnected(node.id, kind, name);
    if (connected) p.classList.add('connected', 'linked');

    p.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      // Режим «нажми-нажми»: первый тап выбирает пин, второй — соединяет.
      // На телефоне тянуть тонкую нить пальцем неудобно, поэтому он основной.
      if (this.tapMode) { this._tapPin(p); return; }
      this._startLink(p, e);
      this._pinDownAt = { x: e.clientX, y: e.clientY, t: Date.now() };
    });
    p.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      if (this.tapMode) return;
      // Короткий тап без смещения = пользователь «кликнул» пин, а не тянул.
      // Тогда не рвём связь, а переходим в режим ожидания второго пина.
      const d = this._pinDownAt;
      const moved = d ? Math.hypot(e.clientX - d.x, e.clientY - d.y) : 99;
      if (d && moved < 6 && Date.now() - d.t < 400 && this._pending?.nodeId === p.dataset.node
          && this._pending?.name === p.dataset.pin) {
        this._pinDownAt = null;
        this._tapPin(p, true);
        return;
      }
      this._pinDownAt = null;
      this._finishLink(p);
    });
    return p;
  }

  /** Соединение в два нажатия (основной способ на телефоне) */
  _tapPin(pinEl, fromDrag = false) {
    const info = {
      nodeId: pinEl.dataset.node,
      name: pinEl.dataset.pin,
      kind: pinEl.dataset.kind,
      isExec: pinEl.dataset.type === 'exec',
      type: pinEl.dataset.type,
    };
    // Повторный тап по тому же пину — отмена
    if (this._tapFrom && this._tapFrom.nodeId === info.nodeId
        && this._tapFrom.name === info.name && this._tapFrom.kind === info.kind) {
      this._clearTap();
      return;
    }
    if (!this._tapFrom) {
      this._pending = null;
      this._tapFrom = info;
      if (!fromDrag) this._flash(`Выбран пин «${info.name}». Теперь нажмите второй пин.`, 'info');
      else this._flash(`Выбран пин «${info.name}». Нажмите второй пин, чтобы соединить.`, 'info');
      this._highlightCandidates(info);
      this.drawLinks();
      return;
    }
    const a = this._tapFrom;
    this._clearTap();
    this._applyConnection(a, info);
  }

  _clearTap() {
    this._tapFrom = null;
    this._pending = null;
    this._clearCandidates();
    this.drawLinks();
  }

  /**
   * Общая для мыши и тапа проверка + создание связи.
   * @param {object} a — пин-источник, {object} b — пин-приёмник
   */
  _applyConnection(a, b) {
    if (a.isExec !== b.isExec) {
      this._flash('Поток выполнения нельзя соединить со значением', 'bad');
      this.drawLinks();
      return false;
    }
    const outKinds = ['out', 'execOut'];
    let from; let fromPin; let to; let toPin;
    if (outKinds.includes(a.kind) && !outKinds.includes(b.kind)) {
      from = a.nodeId; fromPin = a.name; to = b.nodeId; toPin = b.name;
    } else if (!outKinds.includes(a.kind) && outKinds.includes(b.kind)) {
      from = b.nodeId; fromPin = b.name; to = a.nodeId; toPin = a.name;
    } else {
      this._flash('Соединять можно только выход со входом', 'bad');
      this.drawLinks();
      return false;
    }
    if (from === to) {
      this._flash('Узел нельзя соединить сам с собой', 'bad');
      this.drawLinks();
      return false;
    }
    const verdict = this.graph.checkConnection(from, fromPin, to, toPin, a.isExec);
    if (!verdict.ok) {
      this._flash(verdict.reason, 'bad');
      this.drawLinks();
      return false;
    }
    this.graph.connect(from, fromPin, to, toPin, a.isExec);
    this.render();
    if (verdict.cast) this._flash(verdict.reason, 'cast');
    return true;
  }

  /** Подсветить пины, куда можно тянуть от выбранного */
  _highlightCandidates(src) {
    this._clearCandidates();
    const outKinds = ['out', 'execOut'];
    const srcIsOut = outKinds.includes(src.kind);
    for (const [nodeId, nodeEl] of this._nodeEls) {
      let anyOk = false;
      for (const pin of nodeEl.querySelectorAll('.wfl-bp-pin')) {
        const isExec = pin.dataset.type === 'exec';
        const isOut = outKinds.includes(pin.dataset.kind);
        let cls = 'cand-bad';
        if (nodeId !== src.nodeId && isExec === src.isExec && isOut !== srcIsOut) {
          if (isExec) cls = 'cand-ok';
          else {
            const outType = srcIsOut ? src.type : pin.dataset.type;
            const inType = srcIsOut ? pin.dataset.type : src.type;
            const v = canConnectTypes(outType, inType);
            cls = v.ok ? (v.cast ? 'cand-cast' : 'cand-ok') : 'cand-bad';
          }
        }
        if (cls !== 'cand-bad') anyOk = true;
        pin.classList.add(cls);
      }
      nodeEl.classList.toggle('dim', !anyOk && nodeId !== src.nodeId);
    }
  }

  _clearCandidates() {
    for (const nodeEl of this._nodeEls.values()) {
      nodeEl.classList.remove('dim');
      for (const pin of nodeEl.querySelectorAll('.wfl-bp-pin')) {
        pin.classList.remove('cand-ok', 'cand-cast', 'cand-bad');
      }
    }
  }

  _isConnected(nodeId, kind, name) {
    return this.graph.links.some((l) => {
      if (kind === 'in') return l.to === nodeId && l.in === name;
      if (kind === 'out') return l.from === nodeId && l.out === name;
      if (kind === 'execIn') return l.to === nodeId && l.execIn === name;
      return l.from === nodeId && l.exec === name;
    });
  }

  _propInput(node, key, spec) {
    if (spec.type === 'select') {
      const sel = el('select', 'wfl-bp-inp wide');
      for (const o of spec.options ?? []) {
        const opt = el('option', null, String(o));
        opt.value = String(o);
        sel.appendChild(opt);
      }
      sel.value = String(node.props[key] ?? spec.default);
      sel.addEventListener('change', () => { node.props[key] = sel.value; });
      return sel;
    }
    const inp = el('input', 'wfl-bp-inp wide');
    if (spec.type === 'number') { inp.type = 'number'; inp.step = spec.step ?? 'any'; }
    else if (spec.type === 'boolean') { inp.type = 'checkbox'; inp.checked = !!node.props[key]; }
    else inp.type = 'text';
    if (spec.type !== 'boolean') inp.value = node.props[key] ?? spec.default ?? '';
    inp.addEventListener('pointerdown', (e) => e.stopPropagation());
    inp.addEventListener('change', () => {
      node.props[key] = spec.type === 'number' ? (parseFloat(inp.value) || 0)
        : spec.type === 'boolean' ? inp.checked : inp.value;
    });
    return inp;
  }

  _pinInput(node, pin) {
    const cur = node.inputs?.[pin.name] ?? pin.default;
    if (pin.type === 'vector') {
      const box = el('div', 'wfl-bp-vec');
      const v = cur && typeof cur === 'object' ? cur : { x: 0, y: 0, z: 0 };
      for (const axis of ['x', 'y', 'z']) {
        const i = el('input', 'wfl-bp-inp');
        i.type = 'number';
        i.step = 'any';
        i.value = v[axis] ?? 0;
        i.addEventListener('pointerdown', (e) => e.stopPropagation());
        i.addEventListener('change', () => {
          const cv = node.inputs[pin.name] && typeof node.inputs[pin.name] === 'object'
            ? node.inputs[pin.name] : { x: 0, y: 0, z: 0 };
          cv[axis] = parseFloat(i.value) || 0;
          node.inputs[pin.name] = { x: cv.x ?? 0, y: cv.y ?? 0, z: cv.z ?? 0 };
        });
        box.appendChild(i);
      }
      return box;
    }
    if (pin.type === 'object') return null; // только через связь

    const inp = el('input', 'wfl-bp-inp');
    if (pin.type === 'number') { inp.type = 'number'; inp.step = 'any'; inp.value = cur ?? 0; }
    else if (pin.type === 'boolean') { inp.type = 'checkbox'; inp.checked = !!cur; }
    else { inp.type = 'text'; inp.value = cur ?? ''; }
    inp.addEventListener('pointerdown', (e) => e.stopPropagation());
    inp.addEventListener('change', () => {
      if (pin.type === 'number') node.inputs[pin.name] = parseFloat(inp.value) || 0;
      else if (pin.type === 'boolean') node.inputs[pin.name] = inp.checked;
      else node.inputs[pin.name] = inp.value;
    });
    return inp;
  }

  /* ==================== Связи ==================== */
  drawLinks() {
    this.svg.innerHTML = '';
    for (const link of this.graph.links) {
      const isExec = link.exec !== undefined;
      const a = this._pinPos(link.from, isExec ? 'execOut' : 'out', isExec ? link.exec : link.out);
      const b = this._pinPos(link.to, isExec ? 'execIn' : 'in', isExec ? link.execIn : link.in);
      if (!a || !b) continue;
      const color = isExec ? '#e6ecf5' : (PIN_COLORS[this._pinType(link)] ?? PIN_COLORS.any);
      const d = this._curve(a, b);

      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hit.setAttribute('d', d);
      hit.setAttribute('class', 'hit');
      hit.addEventListener('click', (e) => {
        e.stopPropagation();
        this.graph.disconnect(link);
        this.render();
      });
      this.svg.appendChild(hit);

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', isExec ? 2.6 : 2);
      if (!isExec) path.setAttribute('opacity', '0.9');
      this.svg.appendChild(path);
    }
    // Тянущаяся связь
    if (this._pending?.a && this._pending.cursor) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', this._curve(this._pending.a, this._pending.cursor));
      p.setAttribute('stroke', '#8fb4ff');
      p.setAttribute('stroke-width', '2');
      p.setAttribute('stroke-dasharray', '5 4');
      this.svg.appendChild(p);
    }
  }

  _pinType(link) {
    const def = getNodeDef(this.graph.nodes.get(link.from)?.type);
    return def?.outputs?.find((o) => o.name === link.out)?.type ?? 'any';
  }

  /** Координаты пина в системе координат мира (не экрана) */
  _pinPos(nodeId, kind, name) {
    const nodeEl = this._nodeEls.get(nodeId);
    const node = this.graph.nodes.get(nodeId);
    if (!nodeEl || !node) return null;
    const pin = nodeEl.querySelector(
      `.wfl-bp-pin[data-kind="${kind}"][data-pin="${cssEscape(String(name))}"]`);
    if (!pin) return null;
    // offsetLeft/Top не зависят от масштаба — считаем внутри узла
    let x = pin.offsetLeft + pin.offsetWidth / 2;
    let y = pin.offsetTop + pin.offsetHeight / 2;
    let p = pin.offsetParent;
    while (p && p !== nodeEl) { x += p.offsetLeft; y += p.offsetTop; p = p.offsetParent; }
    return { x: node.x + x, y: node.y + y };
  }

  _curve(a, b) {
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.55);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  }

  _startLink(pinEl, e) {
    const kind = pinEl.dataset.kind;
    const nodeId = pinEl.dataset.node;
    const name = pinEl.dataset.pin;
    const isExec = pinEl.dataset.type === 'exec';

    // Потянули за занятый вход — «снимаем» существующую связь
    if (kind === 'in' && this._isConnected(nodeId, 'in', name)) {
      this.graph.disconnectInput(nodeId, name);
      this.render();
    }

    this._pending = {
      nodeId, name, kind, isExec,
      type: pinEl.dataset.type,
      a: this._pinPos(nodeId, kind, name),
      cursor: this._toWorld(e.clientX, e.clientY),
    };
    this.canvas.setPointerCapture?.(e.pointerId);
    this._pendingPointer = e.pointerId;
    this._highlightCandidates(this._pending);
    this.drawLinks();
  }

  _finishLink(pinEl) {
    const p = this._pending;
    if (!p) return;
    this._pending = null;
    this._clearCandidates();
    this._applyConnection(p, {
      nodeId: pinEl.dataset.node,
      name: pinEl.dataset.pin,
      kind: pinEl.dataset.kind,
      isExec: pinEl.dataset.type === 'exec',
      type: pinEl.dataset.type,
    });
  }

  /** @param {'bad'|'cast'|'info'|'ok'} tone */
  _flash(msg, tone = 'bad') {
    const palette = {
      bad:  ['rgba(74,28,34,.95)', '#7a2c34', '#ffb0b6'],
      cast: ['rgba(66,52,20,.95)', '#8a6d2f', '#ffd89a'],
      info: ['rgba(24,44,74,.95)', '#2c4f8a', '#bcd6ff'],
      ok:   ['rgba(29,107,69,.95)', '#2b9463', '#c8ffe2'],
    };
    const [bg, border, color] = palette[tone] ?? palette.bad;
    this.errBox.style.background = bg;
    this.errBox.style.borderColor = border;
    this.errBox.style.color = color;
    this.errBox.textContent = msg;
    this.errBox.style.display = 'block';
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => { this.errBox.style.display = 'none'; }, 2600);
  }

  /* ==================== Перетаскивание и камера ==================== */
  _makeDraggable(wrap, node, handle) {
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const additive = e.shiftKey || e.ctrlKey;
      if (!this.selected.has(node.id)) {
        if (!additive) this.selected.clear();
        this.selected.add(node.id);
      } else if (additive) {
        this.selected.delete(node.id);
      }
      for (const [id, elm] of this._nodeEls) elm.classList.toggle('sel', this.selected.has(id));

      const start = this._toWorld(e.clientX, e.clientY);
      const origins = new Map();
      for (const id of this.selected) {
        const n = this.graph.nodes.get(id);
        if (n) origins.set(id, { x: n.x, y: n.y });
      }
      this._drag = { start, origins };
      handle.setPointerCapture?.(e.pointerId);
    });
  }

  _bindCanvas() {
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.target !== this.canvas && e.target !== this.world && e.target.tagName !== 'svg') return;
      // Тап по пустому месту отменяет начатое соединение
      if (this._tapFrom) { this._clearTap(); this._flash('Соединение отменено', 'info'); }
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pointers.size === 1) {
        this._pan = { x: e.clientX, y: e.clientY, px: this.panX, py: this.panY };
        this.canvas.classList.add('panning');
        this.selected.clear();
        for (const elm of this._nodeEls.values()) elm.classList.remove('sel');
      }
      this.canvas.setPointerCapture?.(e.pointerId);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      // Тянем связь
      if (this._pending) {
        this._pending.cursor = this._toWorld(e.clientX, e.clientY);
        this.drawLinks();
        return;
      }
      // Двигаем узлы
      if (this._drag) {
        const cur = this._toWorld(e.clientX, e.clientY);
        const dx = cur.x - this._drag.start.x;
        const dy = cur.y - this._drag.start.y;
        for (const [id, o] of this._drag.origins) {
          const n = this.graph.nodes.get(id);
          if (!n) continue;
          n.x = o.x + dx;
          n.y = o.y + dy;
          const elm = this._nodeEls.get(id);
          if (elm) { elm.style.left = `${n.x}px`; elm.style.top = `${n.y}px`; }
        }
        this.drawLinks();
        return;
      }
      // Щипок двумя пальцами
      if (this._pointers.has(e.pointerId)) this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pointers.size >= 2) {
        const [p1, p2] = [...this._pointers.values()];
        const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (this._pinchDist) {
          const cx = (p1.x + p2.x) / 2;
          const cy = (p1.y + p2.y) / 2;
          this.zoomAt(d / this._pinchDist, cx, cy);
        }
        this._pinchDist = d;
        return;
      }
      // Панорама
      if (this._pan) {
        this.panX = this._pan.px + (e.clientX - this._pan.x);
        this.panY = this._pan.py + (e.clientY - this._pan.y);
        this._applyTransform();
      }
    });

    const endPointer = (e) => {
      this._pointers.delete(e.pointerId);
      if (this._pointers.size < 2) this._pinchDist = 0;
      if (this._pointers.size === 0) { this._pan = null; this.canvas.classList.remove('panning'); }
      if (this._drag) { this._drag = null; this.drawLinks(); }
      // В режиме тапа выбранный пин живёт до второго нажатия
      if (this._pending && !this._tapFrom) {
        this._pending = null; this._clearCandidates(); this.drawLinks();
      }
    };
    this.canvas.addEventListener('pointerup', endPointer);
    this.canvas.addEventListener('pointercancel', endPointer);
    // Отпускание кнопки над узлом тоже завершает перетаскивание
    window.addEventListener('pointerup', (e) => {
      if (this._drag) { this._drag = null; this.drawLinks(); }
      if (this._tapFrom) return;
      if (this._pending && e.target?.classList?.contains('wfl-bp-pin')) return;
      if (this._pending) { this._pending = null; this._clearCandidates(); this.drawLinks(); }
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
    }, { passive: false });

    this.canvas.addEventListener('dblclick', () => this.toggleSide(true));
  }

  _toWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left - this.panX) / this.scale,
      y: (clientY - r.top - this.panY) / this.scale,
    };
  }

  _applyTransform() {
    this.world.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    const g = 24 * this.scale;
    const G = g * 5;
    this.canvas.style.backgroundSize = `${g}px ${g}px, ${g}px ${g}px, ${G}px ${G}px, ${G}px ${G}px`;
    this.canvas.style.backgroundPosition = `${this.panX}px ${this.panY}px`;
    if (this.zoomLabel) this.zoomLabel.textContent = `${Math.round(this.scale * 100)}%`;
  }

  zoomBy(f) {
    const r = this.canvas.getBoundingClientRect();
    this.zoomAt(f, r.left + r.width / 2, r.top + r.height / 2);
  }

  zoomAt(factor, clientX, clientY) {
    const old = this.scale;
    const next = Math.min(2.5, Math.max(0.25, old * factor));
    if (next === old) return;
    const r = this.canvas.getBoundingClientRect();
    const mx = clientX - r.left;
    const my = clientY - r.top;
    this.panX = mx - (mx - this.panX) * (next / old);
    this.panY = my - (my - this.panY) * (next / old);
    this.scale = next;
    this._applyTransform();
  }

  fitView() {
    const nodes = [...this.graph.nodes.values()];
    if (!nodes.length) { this.scale = 1; this.panX = 120; this.panY = 80; this._applyTransform(); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const elm = this._nodeEls.get(n.id);
      const w = elm?.offsetWidth ?? 160;
      const h = elm?.offsetHeight ?? 90;
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w); maxY = Math.max(maxY, n.y + h);
    }
    const r = this.canvas.getBoundingClientRect();
    const pad = 50;
    this.scale = Math.min(1.4, Math.max(0.25,
      Math.min((r.width - pad * 2) / (maxX - minX || 1), (r.height - pad * 2) / (maxY - minY || 1))));
    this.panX = (r.width - (maxX - minX) * this.scale) / 2 - minX * this.scale;
    this.panY = (r.height - (maxY - minY) * this.scale) / 2 - minY * this.scale;
    this._applyTransform();
    this.drawLinks();
  }

  /** Простая раскладка по «уровням» от событий вправо */
  autoLayout() {
    const level = new Map();
    const queue = [];
    for (const n of this.graph.nodes.values()) {
      if (getNodeDef(n.type)?.event) { level.set(n.id, 0); queue.push(n.id); }
    }
    if (!queue.length) for (const n of this.graph.nodes.values()) { level.set(n.id, 0); queue.push(n.id); break; }
    let guard = 0;
    while (queue.length && guard++ < 5000) {
      const id = queue.shift();
      const lv = level.get(id) ?? 0;
      for (const l of this.graph.links) {
        if (l.from !== id) continue;
        const cur = level.get(l.to);
        if (cur === undefined || cur < lv + 1) { level.set(l.to, lv + 1); queue.push(l.to); }
      }
    }
    // Узлы данных ставим левее их потребителя
    for (const n of this.graph.nodes.values()) {
      if (level.has(n.id)) continue;
      const consumer = this.graph.links.find((l) => l.from === n.id && l.in);
      level.set(n.id, Math.max(0, (level.get(consumer?.to) ?? 1) - 1));
    }
    const byLevel = new Map();
    for (const [id, lv] of level) {
      if (!byLevel.has(lv)) byLevel.set(lv, []);
      byLevel.get(lv).push(id);
    }
    for (const [lv, ids] of byLevel) {
      ids.forEach((id, i) => {
        const n = this.graph.nodes.get(id);
        if (n) { n.x = lv * 250; n.y = i * 150; }
      });
    }
    this.render();
    this.fitView();
  }

  /* ==================== Команды ==================== */
  deleteSelection() {
    if (!this.selected.size) { this._flash('Ничего не выбрано'); return; }
    for (const id of this.selected) this.graph.removeNode(id);
    this.selected.clear();
    this.render();
  }

  duplicateSelection() {
    if (!this.selected.size) { this._flash('Ничего не выбрано'); return; }
    const map = new Map();
    const fresh = new Set();
    for (const id of this.selected) {
      const src = this.graph.nodes.get(id);
      if (!src) continue;
      const copy = this.graph.addNode(src.type, src.x + 30, src.y + 30);
      copy.props = JSON.parse(JSON.stringify(src.props));
      copy.inputs = JSON.parse(JSON.stringify(src.inputs));
      map.set(id, copy.id);
      fresh.add(copy.id);
    }
    // Переносим связи внутри выделения
    for (const l of [...this.graph.links]) {
      if (!map.has(l.from) || !map.has(l.to)) continue;
      if (l.exec !== undefined) this.graph.connect(map.get(l.from), l.exec, map.get(l.to), l.execIn, true);
      else this.graph.connect(map.get(l.from), l.out, map.get(l.to), l.in, false);
    }
    this.selected = fresh;
    this.render();
  }

  validate() {
    const problems = this.graph.validate();
    if (!problems.length) {
      this.errBox.style.background = 'rgba(29,107,69,.95)';
      this.errBox.style.borderColor = '#2b9463';
      this.errBox.style.color = '#c8ffe2';
      this._flash('Граф корректен');
    } else {
      this.errBox.style.background = '';
      this.errBox.style.borderColor = '';
      this.errBox.style.color = '';
      this._flash(problems.join('\n'));
    }
    this.host?.log?.(`Blueprint «${this.nameInput.value}»: ${problems.length ? problems.join('; ') : 'ошибок нет'}`,
      problems.length ? 'warn' : 'ok');
  }

  /** Готовый пример: вращение + сообщение при старте */
  insertTemplate() {
    const base = this.graph.nodes.size ? 0 : 1;
    const ox = base ? 0 : 400;
    const start = this.graph.addNode('OnStart', ox + 0, 0);
    const toast = this.graph.addNode('Toast', ox + 250, 0);
    toast.inputs.text = 'Блюпринт работает!';
    this.graph.connect(start.id, 'out', toast.id, 'in', true);

    const upd = this.graph.addNode('OnUpdate', ox + 0, 160);
    const rot = this.graph.addNode('Rotate', ox + 400, 160);
    const mul = this.graph.addNode('Multiply', ox + 210, 300);
    mul.inputs = { a: 90, b: 1 };
    this.graph.connect(upd.id, 'out', rot.id, 'in', true);
    this.graph.connect(upd.id, 'dt', mul.id, 'b');
    this.graph.connect(mul.id, 'result', rot.id, 'y');

    this.render();
    this.fitView();
    this._flash('Вставлен пример: сообщение при старте и вращение 90°/с');
  }

  /** Записать граф в компонент и пересобрать рантайм */
  apply() {
    if (!this.component) { this._flash('Компонент не задан'); return; }
    this.component.graphName = this.nameInput.value;
    this.component.graphData = JSON.stringify(this.graph.toJSON());
    this.component.compile();
    // compile() создаёт новый экземпляр графа — продолжаем редактировать именно его,
    // иначе дальнейшие правки уйдут в «осиротевший» объект.
    if (this.component.graph) {
      this.graph = this.component.graph;
      this._nodeEls.clear();
      this.world.querySelectorAll('.wfl-bp-node').forEach((n) => n.remove());
      this.render();
    }
    const problems = this.graph.validate();
    this.host?.log?.(`Blueprint «${this.component.graphName}» применён: ${this.graph.stats.nodes} узлов`
      + (problems.length ? `, замечаний: ${problems.length}` : ''), problems.length ? 'warn' : 'ok');
    this.errBox.style.background = 'rgba(29,107,69,.95)';
    this.errBox.style.borderColor = '#2b9463';
    this.errBox.style.color = '#c8ffe2';
    this._flash('Граф применён к объекту');
  }

  _onKey(e) {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'Delete' || e.key === 'x' || e.key === 'X') { this.deleteSelection(); e.preventDefault(); }
    else if (e.key === 'd' && (e.ctrlKey || e.metaKey)) { this.duplicateSelection(); e.preventDefault(); }
    else if (e.key === 'f' || e.key === 'F') { this.fitView(); }
    else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
      this.selected = new Set(this.graph.nodes.keys());
      for (const [id, elm] of this._nodeEls) elm.classList.toggle('sel', this.selected.has(id));
      e.preventDefault();
    } else if (e.key === 'Escape') { this.close(); }
  }

  /* ==================== Жизненный цикл ==================== */
  mount(parent) {
    (parent ?? document.body).appendChild(this.root);
    requestAnimationFrame(() => { this.render(); this.fitView(); });
    return this;
  }

  close() {
    this.apply();
    this.dispose();
    this.onClose?.();
  }

  dispose() {
    window.removeEventListener('keydown', this._keyHandler);
    clearTimeout(this._flashTimer);
    this.root.remove();
  }
}

export default BlueprintEditor;
