// WFL Engine Editor — встроенный редактор сцены (иерархия, инспектор, гизмо, консоль)
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { ComponentRegistry, resolveComponent } from '../engine/core/component.js';
import { GameObject } from '../engine/core/gameobject.js';
import { GEOMETRY_FACTORY } from '../engine/rendering/components.js';
import { Mathf } from '../engine/core/math.js';

const EDITOR_STYLE_ID = 'wfl-editor-styles';

const CSS = `
.wfl-editor{position:absolute;inset:0;z-index:60;display:grid;pointer-events:none;
  grid-template-columns:250px 1fr 300px;grid-template-rows:44px 1fr 150px;
  grid-template-areas:"top top top" "left center right" "left bottom right";
  font:13px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#d7dee9}
.wfl-editor.mobile{grid-template-columns:1fr;grid-template-rows:44px 1fr auto;
  grid-template-areas:"top" "center" "bottom"}
.wfl-editor > *{pointer-events:auto}
.wfl-ed-top{grid-area:top;display:flex;align-items:center;gap:6px;padding:0 10px;
  background:#12161f;border-bottom:1px solid #232b3a;overflow-x:auto;scrollbar-width:thin}
.wfl-ed-left{grid-area:left;background:#12161f;border-right:1px solid #232b3a;display:flex;flex-direction:column;overflow:hidden}
.wfl-ed-right{grid-area:right;background:#12161f;border-left:1px solid #232b3a;display:flex;flex-direction:column;overflow:hidden}
.wfl-ed-bottom{grid-area:bottom;background:#0e1219;border-top:1px solid #232b3a;overflow:auto;padding:6px 10px;
  font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
.wfl-ed-center{grid-area:center;pointer-events:none!important}
.wfl-ed-hd{padding:8px 10px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
  color:#7b8798;background:#151a25;border-bottom:1px solid #232b3a;display:flex;justify-content:space-between;align-items:center;flex:0 0 auto}
.wfl-ed-scroll{overflow-y:auto;overflow-x:hidden;flex:1;scrollbar-width:thin;scrollbar-color:#2c3648 transparent}
.wfl-ed-scroll::-webkit-scrollbar{width:8px}
.wfl-ed-scroll::-webkit-scrollbar-thumb{background:#2c3648;border-radius:4px}
.wfl-btn2{background:#1d2534;border:1px solid #2c3648;color:#cdd6e3;border-radius:7px;padding:6px 11px;
  font-size:12px;cursor:pointer;white-space:nowrap;transition:background .12s,border-color .12s}
.wfl-btn2:hover{background:#26314a;border-color:#3d4c68}
.wfl-btn2:active{background:#161d29}
.wfl-btn2.on{background:#2d6cdf;border-color:#4b86f0;color:#fff}
.wfl-btn2.danger{background:#4a1c22;border-color:#7a2c34;color:#ffb0b6}
.wfl-btn2.play{background:#1d6b45;border-color:#2b9463;color:#c8ffe2}
.wfl-ed-sep{width:1px;height:22px;background:#2a3342;margin:0 4px;flex:0 0 auto}
.wfl-ed-title{font-weight:800;font-size:13px;letter-spacing:.04em;color:#8fb4ff;margin-right:6px;white-space:nowrap}
.wfl-node{display:flex;align-items:center;gap:5px;padding:4px 8px;cursor:pointer;border-radius:5px;
  margin:1px 4px;font-size:12.5px;user-select:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wfl-node:hover{background:#1b2331}
.wfl-node.sel{background:#2d6cdf;color:#fff}
.wfl-node .tw{width:12px;flex:0 0 auto;opacity:.6;font-size:9px;text-align:center}
.wfl-node .eye{margin-left:auto;opacity:.45;font-size:11px;flex:0 0 auto}
.wfl-node.off{opacity:.42}
.wfl-comp{border-bottom:1px solid #1c2330;padding:8px 10px}
.wfl-comp-hd{display:flex;align-items:center;gap:7px;font-weight:700;font-size:12px;color:#a8c0e8;cursor:pointer;user-select:none}
.wfl-comp-hd .x{margin-left:auto;opacity:.4;font-weight:400;cursor:pointer;padding:0 4px}
.wfl-comp-hd .x:hover{opacity:1;color:#ff8b8b}
.wfl-field{display:grid;grid-template-columns:96px 1fr;gap:6px;align-items:center;margin-top:6px}
.wfl-field > label{font-size:11.5px;color:#8b97a8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wfl-field input[type=text],.wfl-field input[type=number],.wfl-field select,.wfl-field textarea{
  width:100%;background:#0d1119;border:1px solid #263045;color:#dbe3ef;border-radius:5px;padding:4px 7px;font-size:12px;font-family:inherit}
.wfl-field input:focus,.wfl-field select:focus,.wfl-field textarea:focus{outline:none;border-color:#3d6ecf}
.wfl-field input[type=color]{width:100%;height:26px;padding:1px;background:#0d1119;border:1px solid #263045;border-radius:5px}
.wfl-field input[type=checkbox]{width:16px;height:16px;accent-color:#2d6cdf}
.wfl-vec3{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}
.wfl-vec3 input{text-align:center}
.wfl-log{white-space:pre-wrap;word-break:break-word}
.wfl-log .err{color:#ff8b8b}
.wfl-log .warn{color:#ffce7a}
.wfl-log .ok{color:#7ae0a8}
.wfl-log .dim{color:#5d6a7d}
.wfl-ed-add{display:flex;gap:5px;padding:7px;border-top:1px solid #232b3a;flex:0 0 auto}
.wfl-ed-add select{flex:1;background:#0d1119;border:1px solid #263045;color:#dbe3ef;border-radius:5px;padding:5px;font-size:12px}
.wfl-ed-empty{padding:20px 12px;text-align:center;color:#5d6a7d;font-size:12px}
.wfl-ed-tabs{display:flex;gap:4px;padding:6px;background:#151a25;border-bottom:1px solid #232b3a;flex:0 0 auto}
.wfl-ed-tabs button{flex:1}
@media (max-width:900px){
  .wfl-editor{grid-template-columns:1fr;grid-template-rows:44px 1fr 45vh;grid-template-areas:"top" "center" "bottom"}
  .wfl-ed-left,.wfl-ed-right{grid-area:bottom;border:none;border-top:1px solid #232b3a}
  .wfl-ed-left.hidden,.wfl-ed-right.hidden{display:none}
  .wfl-ed-bottom{display:none}
  .wfl-ed-bottom.shown{display:block;grid-area:bottom}
}
`;

function ensureStyles() {
  if (document.getElementById(EDITOR_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = EDITOR_STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export class Editor {
  /**
   * @param {import('../engine/index.js').Engine} engine
   */
  constructor(engine, game = null) {
    ensureStyles();
    this.engine = engine;
    this.game = game;
    this.selected = null;
    this.mode = 'translate';
    this.snap = false;
    this.isPlaying = false;
    this.logLines = [];
    this._panel = 'hierarchy';
    this._collapsed = new Set();

    this._buildDOM();
    this._setupGizmo();
    this._setupEditorCamera();
    this._setupPicking();
    this._hookConsole();
    this.refresh();
    this.log('Редактор WFL Engine запущен. ЛКМ — выбор объекта, W/E/R — режимы гизмо.', 'ok');
  }

  /* ==================== DOM ==================== */
  _buildDOM() {
    const isMobile = this.engine.isMobile || window.innerWidth < 900;
    this.root = el('div', `wfl-editor${isMobile ? ' mobile' : ''}`);

    /* --- Верхняя панель --- */
    const top = el('div', 'wfl-ed-top');
    top.appendChild(el('span', 'wfl-ed-title', 'WFL Editor'));
    top.appendChild(el('div', 'wfl-ed-sep'));

    this.playBtn = this._btn(top, '▶ Играть', () => this.togglePlay(), 'play');
    top.appendChild(el('div', 'wfl-ed-sep'));

    this.moveBtn = this._btn(top, '⬌ Move', () => this.setMode('translate'), 'on');
    this.rotBtn = this._btn(top, '⟳ Rotate', () => this.setMode('rotate'));
    this.scaleBtn = this._btn(top, '⤢ Scale', () => this.setMode('scale'));
    this.snapBtn = this._btn(top, '⊞ Snap', () => this.toggleSnap());
    top.appendChild(el('div', 'wfl-ed-sep'));

    this._btn(top, '+ Объект', () => this.createObject());
    this._btn(top, '⧉ Дублировать', () => this.duplicateSelected());
    this._btn(top, '🗑 Удалить', () => this.deleteSelected(), 'danger');
    top.appendChild(el('div', 'wfl-ed-sep'));

    this._btn(top, '💾 Сохранить', () => this.saveScene());
    this._btn(top, '📂 Открыть', () => this.loadSceneFile());
    this._btn(top, '⬇ Экспорт JSON', () => this.exportJSON());
    top.appendChild(el('div', 'wfl-ed-sep'));

    this._btn(top, '📦 Собрать APK', () => this.buildAPK());
    this._btn(top, '✕ Закрыть', () => this.close(), 'danger');

    /* --- Левая панель: иерархия --- */
    const left = el('div', 'wfl-ed-left');
    const lhd = el('div', 'wfl-ed-hd');
    lhd.appendChild(el('span', null, 'Иерархия'));
    this.countLabel = el('span', null, '0');
    this.countLabel.style.cssText = 'font-weight:400;opacity:.6';
    lhd.appendChild(this.countLabel);
    left.appendChild(lhd);
    this.hierarchyEl = el('div', 'wfl-ed-scroll');
    left.appendChild(this.hierarchyEl);

    const addRow = el('div', 'wfl-ed-add');
    this.primSelect = el('select');
    for (const g of Object.keys(GEOMETRY_FACTORY)) {
      this.primSelect.appendChild(new Option(g, g));
    }
    addRow.appendChild(this.primSelect);
    this._btn(addRow, '+', () => this.createObject(this.primSelect.value));
    left.appendChild(addRow);

    /* --- Правая панель: инспектор --- */
    const right = el('div', 'wfl-ed-right');
    const rhd = el('div', 'wfl-ed-hd');
    rhd.appendChild(el('span', null, 'Инспектор'));
    right.appendChild(rhd);
    this.inspectorEl = el('div', 'wfl-ed-scroll');
    right.appendChild(this.inspectorEl);

    const compRow = el('div', 'wfl-ed-add');
    this.compSelect = el('select');
    const names = [...ComponentRegistry.keys()].sort();
    for (const n of names) this.compSelect.appendChild(new Option(n, n));
    compRow.appendChild(this.compSelect);
    this._btn(compRow, '+ Компонент', () => this.addComponentToSelected());
    right.appendChild(compRow);

    /* --- Нижняя панель: консоль --- */
    const bottom = el('div', 'wfl-ed-bottom');
    this.logEl = el('div', 'wfl-log');
    bottom.appendChild(this.logEl);

    /* --- Мобильные вкладки --- */
    if (isMobile) {
      const tabs = el('div', 'wfl-ed-tabs');
      const mk = (label, panel) => {
        const b = this._btn(tabs, label, () => this.setPanel(panel));
        b.dataset.panel = panel;
        return b;
      };
      mk('Иерархия', 'hierarchy').classList.add('on');
      mk('Инспектор', 'inspector');
      mk('Консоль', 'console');
      this.tabsEl = tabs;
      this.root.appendChild(tabs);
      tabs.style.gridArea = 'top';
      tabs.style.marginTop = '44px';
      this.root.style.gridTemplateRows = '44px 1fr 45vh';
    }

    const center = el('div', 'wfl-ed-center');
    this.root.append(top, left, center, right, bottom);
    this.leftEl = left; this.rightEl = right; this.bottomEl = bottom;
    this.engine.container.appendChild(this.root);
    if (isMobile) this.setPanel('hierarchy');

    // Горячие клавиши
    this._keyHandler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.code === 'KeyW') this.setMode('translate');
      else if (e.code === 'KeyE') this.setMode('rotate');
      else if (e.code === 'KeyR') this.setMode('scale');
      else if (e.code === 'Delete' || e.code === 'KeyX') this.deleteSelected();
      else if (e.code === 'KeyD' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.duplicateSelected(); }
      else if (e.code === 'KeyF') this.focusSelected();
      else if (e.code === 'Escape') this.select(null);
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  _btn(parent, label, onClick, cls = '') {
    const b = el('button', `wfl-btn2 ${cls}`.trim(), label);
    b.addEventListener('click', (e) => { e.preventDefault(); onClick(); });
    parent.appendChild(b);
    return b;
  }

  setPanel(p) {
    this._panel = p;
    this.leftEl.classList.toggle('hidden', p !== 'hierarchy');
    this.rightEl.classList.toggle('hidden', p !== 'inspector');
    this.bottomEl.classList.toggle('shown', p === 'console');
    if (this.tabsEl) {
      for (const b of this.tabsEl.children) b.classList.toggle('on', b.dataset.panel === p);
    }
  }

  /* ==================== Гизмо и камера ==================== */
  _setupGizmo() {
    const cam = this.engine.mainCamera?.camera;
    if (!cam) { this.log('Нет активной камеры — гизмо недоступно', 'warn'); return; }
    this.gizmo = new TransformControls(cam, this.engine.canvas);
    this.gizmo.setSize(this.engine.isMobile ? 1.35 : 1);
    this.gizmo.addEventListener('dragging-changed', (e) => {
      this._dragging = e.value;
      if (this.editorControls) this.editorControls.enabled = !e.value;
    });
    this.gizmo.addEventListener('objectChange', () => this._syncInspectorFromGizmo());
    const helper = this.gizmo.getHelper ? this.gizmo.getHelper() : this.gizmo;
    this._gizmoHelper = helper;
    this.engine.scene?.root.add(helper);
  }

  _setupEditorCamera() {
    // редакторская орбитальная камера поверх игровой
    const engine = this.engine;
    this.editorCameraGO = engine.scene.createGameObject('__EditorCamera');
    this.editorCameraGO._editorOnly = true;
    const camComp = this.editorCameraGO.addComponent('Camera', {
      fieldOfView: 60, nearClipPlane: 0.05, farClipPlane: 800, isMainCamera: false, depth: 100,
    });
    this.editorCamera = camComp;
    this.editorCameraGO.transform.position = new THREE.Vector3(14, 12, 18);
    this.editorCameraGO.transform.lookAt(new THREE.Vector3(0, 1, 0));
    this._orbit = {
      target: new THREE.Vector3(0, 1, 0),
      distance: 26, yaw: 38, pitch: 28,
    };
    this._gameCamera = engine.scene.mainCamera;
    engine.scene.mainCamera = camComp;
    camComp.isMainCamera = true;
    if (this.gizmo) this.gizmo.camera = camComp.camera;

    this._camHook = (dt) => this._updateEditorCamera(dt);
    engine.addFrameHook(this._camHook);
    this._applyOrbit();

    // Пауза симуляции: движок работает, но сцену не апдейтим
    this._prevPaused = engine.isPaused;
    this.setSimulation(false);
  }

  _applyOrbit() {
    const o = this._orbit;
    const py = o.pitch * Mathf.Deg2Rad, yw = o.yaw * Mathf.Deg2Rad;
    this.editorCameraGO.transform.position = new THREE.Vector3(
      o.target.x + o.distance * Math.cos(py) * Math.sin(yw),
      o.target.y + o.distance * Math.sin(py),
      o.target.z + o.distance * Math.cos(py) * Math.cos(yw));
    this.editorCameraGO.transform.lookAt(o.target);
  }

  _updateEditorCamera(dt) {
    if (this.isPlaying || this._dragging) return;
    const input = this.engine.input;
    const o = this._orbit;
    let changed = false;

    if (input.touchCount === 2) {
      const [a, b] = input.touches;
      const d = a.position.distanceTo(b.position);
      if (this._pinch) {
        o.distance = Mathf.clamp(o.distance + (this._pinch - d) * 0.06, 1, 300);
        changed = true;
      }
      this._pinch = d;
    } else {
      this._pinch = 0;
      if (input.getMouseButton(0) && !this._overUI && !this._dragging) {
        if (Math.abs(input.mouseDelta.x) + Math.abs(input.mouseDelta.y) > 0) {
          o.yaw -= input.mouseDelta.x * 0.3;
          o.pitch = Mathf.clamp(o.pitch + input.mouseDelta.y * 0.3, -88, 88);
          changed = true;
        }
      }
      if (input.getMouseButton(2) || input.getMouseButton(1)) {
        const t = this.editorCameraGO.transform;
        const scale = o.distance * 0.0018;
        o.target.addScaledVector(t.right, -input.mouseDelta.x * scale);
        o.target.addScaledVector(t.up, input.mouseDelta.y * scale);
        changed = true;
      }
    }
    if (Math.abs(input.mouseScrollDelta.y) > 0) {
      o.distance = Mathf.clamp(o.distance * (1 + input.mouseScrollDelta.y * 0.0012), 0.5, 400);
      changed = true;
    }
    // WASD-полёт
    const spd = (input.getKey('ShiftLeft') ? 26 : 10) * dt;
    const t = this.editorCameraGO.transform;
    let pan = new THREE.Vector3();
    if (input.getKey('KeyW')) pan.addScaledVector(t.forward, spd);
    if (input.getKey('KeyS')) pan.addScaledVector(t.forward, -spd);
    if (input.getKey('KeyA')) pan.addScaledVector(t.right, -spd);
    if (input.getKey('KeyD')) pan.addScaledVector(t.right, spd);
    if (input.getKey('KeyQ')) pan.y -= spd;
    if (input.getKey('KeyE')) pan.y += spd;
    if (pan.lengthSq() > 0) { o.target.add(pan); changed = true; }

    if (changed) this._applyOrbit();
  }

  _setupPicking() {
    this._pickHandler = (e) => {
      if (this.isPlaying || this._dragging) return;
      if (e.target !== this.engine.canvas) return;
      const rect = this.engine.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = rect.height - (e.clientY - rect.top);
      const hit = this.engine.pickVisual(x, y);
      this.select(hit?.gameObject ?? null);
    };
    this.engine.canvas.addEventListener('pointerdown', (e) => {
      this._downPos = { x: e.clientX, y: e.clientY };
    });
    this.engine.canvas.addEventListener('pointerup', (e) => {
      const d = this._downPos;
      if (!d) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) this._pickHandler(e);
      this._downPos = null;
    });
  }

  /* ==================== Логика редактора ==================== */
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
    if (this.gizmo) {
      this.gizmo.setTranslationSnap(this.snap ? 0.5 : null);
      this.gizmo.setRotationSnap(this.snap ? Math.PI / 12 : null);
      this.gizmo.setScaleSnap(this.snap ? 0.25 : null);
    }
  }

  setSimulation(on) {
    // При выключенной симуляции сцена не обновляется, но рендерится
    const scene = this.engine.scene;
    if (!scene) return;
    if (!on && !this._savedUpdate) {
      this._savedUpdate = { u: scene.update, f: scene.fixedUpdate, l: scene.lateUpdate };
      const noop = function () {};
      scene.update = noop;
      scene.fixedUpdate = noop;
      scene.lateUpdate = function (dt) { /* только рендер-хуки */ };
    } else if (on && this._savedUpdate) {
      scene.update = this._savedUpdate.u;
      scene.fixedUpdate = this._savedUpdate.f;
      scene.lateUpdate = this._savedUpdate.l;
      this._savedUpdate = null;
    }
  }

  togglePlay() {
    this.isPlaying = !this.isPlaying;
    this.playBtn.textContent = this.isPlaying ? '⏸ Стоп' : '▶ Играть';
    this.playBtn.classList.toggle('danger', this.isPlaying);
    if (this.isPlaying) {
      this._snapshot = this.engine.scene.serialize();
      this.setSimulation(true);
      if (this._gameCamera) {
        this.editorCamera.isMainCamera = false;
        this.engine.scene.mainCamera = this._gameCamera;
      }
      if (this._gizmoHelper) this._gizmoHelper.visible = false;
      this.engine.resume();
      this.log('Режим игры включён.', 'ok');
    } else {
      this.setSimulation(false);
      this.editorCamera.isMainCamera = true;
      this.engine.scene.mainCamera = this.editorCamera;
      if (this._gizmoHelper) this._gizmoHelper.visible = true;
      if (this._snapshot) this.restoreSnapshot();
      this.log('Режим игры выключен, сцена восстановлена.', 'ok');
    }
  }

  restoreSnapshot() {
    if (!this._snapshot) return;
    const engine = this.engine;
    const data = this._snapshot;
    const cameraGO = this.editorCameraGO;
    // удаляем всё, кроме редакторской камеры
    for (const go of [...engine.scene.gameObjects]) {
      if (go === cameraGO) continue;
      engine.scene.remove(go);
    }
    engine.physics.clear();
    for (const objData of data.objects ?? []) {
      GameObject.deserialize(objData, engine.scene, null);
    }
    this._gameCamera = engine.scene.gameObjects
      .flatMap((g) => g.components)
      .find((c) => c.constructor.componentName === 'Camera' && c.gameObject !== cameraGO) ?? null;
    engine.scene.mainCamera = this.editorCamera;
    this.select(null);
    this.refresh();
  }

  select(go) {
    this.selected = go;
    if (this.gizmo) {
      if (go && go !== this.editorCameraGO) this.gizmo.attach(go.transform.object3D);
      else this.gizmo.detach();
    }
    this.refreshHierarchy();
    this.refreshInspector();
  }

  focusSelected() {
    if (!this.selected) return;
    this._orbit.target.copy(this.selected.transform.position);
    this._orbit.distance = 8;
    this._applyOrbit();
  }

  createObject(primitive = 'box') {
    const scene = this.engine.scene;
    const t = this._orbit.target;
    const go = scene.createGameObject(this._uniqueName(primitive), {
      position: new THREE.Vector3(Math.round(t.x), Math.max(0.5, Math.round(t.y)), Math.round(t.z)),
    });
    go.addComponent('MeshRenderer', { geometryType: primitive });
    if (primitive === 'sphere') go.addComponent('SphereCollider');
    else go.addComponent('BoxCollider');
    this.select(go);
    this.refresh();
    this.log(`Создан объект «${go.name}»`, 'ok');
    return go;
  }

  _uniqueName(base) {
    const names = new Set(this.engine.scene.gameObjects.map((g) => g.name));
    let n = base, i = 1;
    while (names.has(n)) n = `${base} (${i++})`;
    return n;
  }

  duplicateSelected() {
    if (!this.selected) return;
    const data = this.selected.serialize();
    data.name = this._uniqueName(this.selected.name);
    const clone = GameObject.deserialize(data, this.engine.scene, this.selected.transform.parent);
    clone.transform.position = clone.transform.position.add(new THREE.Vector3(1.5, 0, 0));
    this.select(clone);
    this.refresh();
    this.log(`Дублирован объект «${clone.name}»`);
  }

  deleteSelected() {
    if (!this.selected || this.selected === this.editorCameraGO) return;
    const name = this.selected.name;
    this.gizmo?.detach();
    this.engine.scene.destroy(this.selected);
    this.selected = null;
    setTimeout(() => this.refresh(), 30);
    this.log(`Удалён объект «${name}»`, 'warn');
  }

  addComponentToSelected() {
    if (!this.selected) { this.log('Не выбран объект', 'warn'); return; }
    const name = this.compSelect.value;
    try {
      this.selected.addComponent(name);
      this.refreshInspector();
      this.log(`Добавлен компонент ${name}`, 'ok');
    } catch (e) { this.log(String(e), 'err'); }
  }

  /* ==================== Иерархия ==================== */
  refresh() { this.refreshHierarchy(); this.refreshInspector(); }

  refreshHierarchy() {
    const scene = this.engine.scene;
    if (!scene) return;
    this.hierarchyEl.innerHTML = '';
    const roots = scene.gameObjects.filter((g) => !g.transform.parent && g !== this.editorCameraGO);
    this.countLabel.textContent = String(scene.gameObjects.length - 1);
    const build = (go, depth) => {
      const node = el('div', 'wfl-node');
      if (go === this.selected) node.classList.add('sel');
      if (!go.activeSelf) node.classList.add('off');
      node.style.paddingLeft = `${8 + depth * 13}px`;
      const kids = go.transform.children.filter((c) => c.gameObject);
      const tw = el('span', 'tw', kids.length ? (this._collapsed.has(go.id) ? '▶' : '▼') : '');
      if (kids.length) {
        tw.addEventListener('click', (e) => {
          e.stopPropagation();
          this._collapsed.has(go.id) ? this._collapsed.delete(go.id) : this._collapsed.add(go.id);
          this.refreshHierarchy();
        });
      }
      node.appendChild(tw);
      node.appendChild(el('span', null, go.name));
      const eye = el('span', 'eye', go.activeSelf ? '👁' : '⌀');
      eye.addEventListener('click', (e) => {
        e.stopPropagation();
        go.setActive(!go.activeSelf);
        this.refreshHierarchy();
      });
      node.appendChild(eye);
      node.addEventListener('click', () => this.select(go));
      node.addEventListener('dblclick', () => this.focusSelected());
      this.hierarchyEl.appendChild(node);
      if (!this._collapsed.has(go.id)) {
        for (const c of kids) build(c.gameObject, depth + 1);
      }
    };
    for (const g of roots) build(g, 0);
    if (!roots.length) this.hierarchyEl.appendChild(el('div', 'wfl-ed-empty', 'Сцена пуста'));
  }

  /* ==================== Инспектор ==================== */
  refreshInspector() {
    const box = this.inspectorEl;
    box.innerHTML = '';
    const go = this.selected;
    if (!go) { box.appendChild(el('div', 'wfl-ed-empty', 'Объект не выбран')); return; }

    /* Заголовок объекта */
    const head = el('div', 'wfl-comp');
    const nameField = this._field(head, 'Имя', 'text', go.name, (v) => { go.name = v; this.refreshHierarchy(); });
    this._field(head, 'Тег', 'text', go.tag, (v) => { go.tag = v; });
    this._field(head, 'Слой', 'number', go.layer, (v) => { go.layer = Math.round(v); });
    this._field(head, 'Активен', 'checkbox', go.activeSelf, (v) => { go.setActive(v); this.refreshHierarchy(); });
    this._field(head, 'Статичный', 'checkbox', go.isStatic, (v) => { go.isStatic = v; });
    box.appendChild(head);

    /* Трансформ */
    const tr = el('div', 'wfl-comp');
    const trHd = el('div', 'wfl-comp-hd');
    trHd.appendChild(el('span', null, '◆ Transform'));
    tr.appendChild(trHd);
    this._vec3Field(tr, 'Позиция', go.transform.localPosition, () => go.transform.object3D.updateMatrix());
    const euler = go.transform.localEulerAngles.clone();
    this._vec3Field(tr, 'Поворот', euler, () => { go.transform.localEulerAngles = euler; });
    this._vec3Field(tr, 'Масштаб', go.transform.localScale, null);
    box.appendChild(tr);

    /* Компоненты */
    for (const comp of go.components) {
      const Ctor = comp.constructor;
      const cname = Ctor.componentName ?? Ctor.name;
      const wrap = el('div', 'wfl-comp');
      const hd = el('div', 'wfl-comp-hd');
      const collapsed = this._collapsed.has(`${go.id}:${cname}`);
      hd.appendChild(el('span', null, `${collapsed ? '▶' : '▼'} ${cname}`));
      const enableCb = document.createElement('input');
      enableCb.type = 'checkbox';
      enableCb.checked = comp.enabled;
      enableCb.style.cssText = 'accent-color:#2d6cdf;margin-left:6px';
      enableCb.addEventListener('change', () => { comp.enabled = enableCb.checked; });
      enableCb.addEventListener('click', (e) => e.stopPropagation());
      hd.appendChild(enableCb);
      const x = el('span', 'x', '✕');
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        go.removeComponent(comp);
        this.refreshInspector();
        this.log(`Удалён компонент ${cname}`, 'warn');
      });
      hd.appendChild(x);
      hd.addEventListener('click', () => {
        const k = `${go.id}:${cname}`;
        this._collapsed.has(k) ? this._collapsed.delete(k) : this._collapsed.add(k);
        this.refreshInspector();
      });
      wrap.appendChild(hd);

      if (!collapsed) this._buildComponentFields(wrap, comp, Ctor);
      box.appendChild(wrap);
    }
  }

  _buildComponentFields(wrap, comp, Ctor) {
    const spec = Ctor.inspector ?? {};
    for (const [key, def] of Object.entries(spec)) {
      const cur = comp[key];
      const label = def.label ?? key;
      switch (def.type) {
        case 'number':
          this._field(wrap, label, 'number', cur, (v) => { comp[key] = v; this._afterEdit(comp); }, def);
          break;
        case 'boolean':
          this._field(wrap, label, 'checkbox', cur, (v) => { comp[key] = v; this._afterEdit(comp); });
          break;
        case 'string':
          this._field(wrap, label, 'text', cur ?? '', (v) => { comp[key] = v; this._afterEdit(comp); });
          break;
        case 'color': {
          const hex = cur?.getHexString ? `#${cur.getHexString()}` : (cur ?? '#ffffff');
          this._field(wrap, label, 'color', hex, (v) => {
            if (comp[key]?.set) comp[key].set(v); else comp[key] = new THREE.Color(v);
            this._afterEdit(comp);
          });
          break;
        }
        case 'select': {
          this._selectField(wrap, label, def.options ?? [], cur, (v) => {
            const num = Number(v);
            comp[key] = (!Number.isNaN(num) && String(num) === v && typeof def.default === 'number') ? num : v;
            this._afterEdit(comp);
          });
          break;
        }
        case 'vector3': {
          if (cur?.isVector3) this._vec3Field(wrap, label, cur, () => this._afterEdit(comp));
          break;
        }
        case 'code': {
          this._textareaField(wrap, label, cur ?? '', (v) => { comp[key] = v; comp.compile?.(); });
          break;
        }
        default:
          if (typeof cur === 'number') this._field(wrap, label, 'number', cur, (v) => { comp[key] = v; this._afterEdit(comp); });
          else if (typeof cur === 'boolean') this._field(wrap, label, 'checkbox', cur, (v) => { comp[key] = v; this._afterEdit(comp); });
          else if (typeof cur === 'string') this._field(wrap, label, 'text', cur, (v) => { comp[key] = v; this._afterEdit(comp); });
      }
    }
  }

  _afterEdit(comp) {
    comp.rebuild?.();
    comp._build?.();
    comp.updateBounds?.();
    comp.onValidate?.();
  }

  _field(parent, label, type, value, onChange, def = {}) {
    const row = el('div', 'wfl-field');
    row.appendChild(el('label', null, label));
    const input = document.createElement('input');
    input.type = type;
    if (type === 'checkbox') input.checked = !!value;
    else input.value = value ?? '';
    if (type === 'number') {
      if (def.step != null) input.step = def.step;
      if (def.min != null) input.min = def.min;
      if (def.max != null) input.max = def.max;
    }
    const handler = () => {
      let v;
      if (type === 'checkbox') v = input.checked;
      else if (type === 'number') v = parseFloat(input.value) || 0;
      else v = input.value;
      onChange(v);
    };
    input.addEventListener(type === 'text' ? 'input' : 'change', handler);
    if (type === 'number') input.addEventListener('input', handler);
    row.appendChild(input);
    parent.appendChild(row);
    return input;
  }

  _selectField(parent, label, options, value, onChange) {
    const row = el('div', 'wfl-field');
    row.appendChild(el('label', null, label));
    const sel = document.createElement('select');
    for (const o of options) sel.appendChild(new Option(String(o), String(o)));
    sel.value = String(value);
    sel.addEventListener('change', () => onChange(sel.value));
    row.appendChild(sel);
    parent.appendChild(row);
    return sel;
  }

  _textareaField(parent, label, value, onChange) {
    const row = el('div', 'wfl-field');
    row.style.gridTemplateColumns = '1fr';
    row.appendChild(el('label', null, label));
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.rows = 8;
    ta.spellcheck = false;
    ta.style.cssText = 'font-family:ui-monospace,Menlo,monospace;font-size:11px;resize:vertical';
    ta.addEventListener('change', () => onChange(ta.value));
    row.appendChild(ta);
    parent.appendChild(row);
    return ta;
  }

  _vec3Field(parent, label, vec, onChange) {
    const row = el('div', 'wfl-field');
    row.appendChild(el('label', null, label));
    const grid = el('div', 'wfl-vec3');
    const inputs = [];
    ['x', 'y', 'z'].forEach((axis) => {
      const i = document.createElement('input');
      i.type = 'number';
      i.step = '0.1';
      i.value = Number(vec[axis].toFixed(3));
      i.title = axis.toUpperCase();
      i.addEventListener('input', () => {
        vec[axis] = parseFloat(i.value) || 0;
        onChange?.();
      });
      grid.appendChild(i);
      inputs.push(i);
    });
    row.appendChild(grid);
    parent.appendChild(row);
    this._vecInputs = this._vecInputs ?? [];
    this._vecInputs.push({ vec, inputs });
    return inputs;
  }

  _syncInspectorFromGizmo() {
    if (!this._vecInputs) return;
    for (const { vec, inputs } of this._vecInputs) {
      for (let i = 0; i < 3; i++) {
        const axis = ['x', 'y', 'z'][i];
        if (document.activeElement !== inputs[i]) {
          inputs[i].value = Number(vec[axis].toFixed(3));
        }
      }
    }
  }

  /* ==================== Сохранение / загрузка ==================== */
  _sceneData() {
    const data = this.engine.scene.serialize();
    data.objects = (data.objects ?? []).filter((o) => o.name !== '__EditorCamera');
    return data;
  }

  saveScene() {
    const data = this._sceneData();
    try {
      localStorage.setItem('wfl:scene', JSON.stringify(data));
      this.log(`Сцена сохранена в localStorage (${data.objects.length} объектов)`, 'ok');
    } catch (e) { this.log(`Ошибка сохранения: ${e}`, 'err'); }
  }

  exportJSON() {
    const data = this._sceneData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(data.name ?? 'scene').replace(/\s+/g, '-')}.wflscene.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    this.log('Сцена экспортирована в JSON', 'ok');
  }

  loadSceneFile() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.addEventListener('change', async () => {
      const f = inp.files?.[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        this._snapshot = data;
        this.restoreSnapshot();
        this.log(`Загружена сцена «${data.name ?? f.name}»`, 'ok');
      } catch (e) { this.log(`Ошибка загрузки: ${e}`, 'err'); }
    });
    inp.click();
  }

  async buildAPK() {
    const data = this._sceneData();
    this.log('Подготовка сборки APK…');
    try {
      const { showBuildDialog } = await import('./build-dialog.js');
      showBuildDialog(this, data);
    } catch (e) {
      this.log(`Не удалось открыть диалог сборки: ${e}`, 'err');
    }
  }

  /* ==================== Консоль ==================== */
  _hookConsole() {
    const orig = { log: console.log, warn: console.warn, error: console.error };
    this._origConsole = orig;
    console.warn = (...a) => { orig.warn(...a); this.log(a.map(String).join(' '), 'warn'); };
    console.error = (...a) => { orig.error(...a); this.log(a.map(String).join(' '), 'err'); };
  }

  log(msg, kind = '') {
    const time = new Date().toLocaleTimeString('ru-RU', { hour12: false });
    const line = el('div', kind, `[${time}] ${msg}`);
    this.logEl.appendChild(line);
    while (this.logEl.childElementCount > 250) this.logEl.firstChild.remove();
    this.logEl.parentElement.scrollTop = this.logEl.parentElement.scrollHeight;
  }

  /* ==================== Закрытие ==================== */
  close() {
    if (this.isPlaying) this.togglePlay();
    this.setSimulation(true);
    this.gizmo?.detach();
    this._gizmoHelper?.removeFromParent();
    this.gizmo?.dispose?.();
    this.engine.removeFrameHook(this._camHook);
    window.removeEventListener('keydown', this._keyHandler);
    if (this._origConsole) {
      console.warn = this._origConsole.warn;
      console.error = this._origConsole.error;
    }
    if (this.editorCameraGO) this.engine.scene.remove(this.editorCameraGO);
    if (this._gameCamera) {
      this._gameCamera.isMainCamera = true;
      this.engine.scene.mainCamera = this._gameCamera;
    }
    this.root.remove();
    this.engine.resume();
    this.engine._editor = null;
  }
}

/** Открыть/закрыть редактор (синглтон на движок) */
export function openEditor(engine, game = null) {
  if (engine._editor) { engine._editor.close(); return null; }
  engine._editor = new Editor(engine, game);
  return engine._editor;
}
