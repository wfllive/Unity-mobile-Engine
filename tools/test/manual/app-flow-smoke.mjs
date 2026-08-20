// Ручной тест сквозного сценария: главная → редактор → игра → главная.
// WebGL в jsdom нет, поэтому рендерер движка подменяется заглушкой:
// проверяется логика оболочки, а не картинка.
//
//   npm install --no-save jsdom && node tools/test/manual/app-flow-smoke.mjs

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
  url: 'https://localhost/',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;
globalThis.Option = dom.window.Option;
globalThis.Blob = dom.window.Blob;
globalThis.localStorage = dom.window.localStorage;
globalThis.performance = dom.window.performance;
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
dom.window.URL.createObjectURL ??= () => 'blob:fake';
globalThis.URL = dom.window.URL;

// WebGL-контекста в jsdom нет — отдаём заглушку, которой хватает three.js
// для конструирования WebGLRenderer в тестовом режиме.
HTMLCanvasElement.prototype.getContext = function () { return null; };

let ok = 0, errors = 0;
const check = (c, m) => { if (c) { ok++; } else { errors++; console.log('  FAIL  ' + m); } };
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const tap = (el, what = '') => {
  if (!el) throw new Error('нет элемента: ' + what);
  el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
};
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

/* Движок требует WebGL, поэтому проверяем оболочку на уровне её логики:
   подменяем Engine минимальной, но честной по API заглушкой. */
const { Scene, PhysicsWorld, TouchControls } = await import('../../../src/engine/index.js');

const engineStub = (container) => {
  const physics = new PhysicsWorld({ fixedTimeStep: 1 / 60 });
  return {
    container,
    canvas: (() => { const c = document.createElement('canvas'); container.appendChild(c); return c; })(),
    isMobile: true,
    isPaused: true,
    isRunning: false,
    physics,
    scene: null,
    scenes: new Map(),
    hooks: [],
    touchControls: null,
    input: { on() {}, off() {} },
    ui: { showStats() {} },
    createScene(name) { const s = new Scene(name); s.engine = this; s.physics = physics; return s; },
    loadScene(s) { this.scene = s; s.engine = this; s.physics = physics; s.load?.(); return s; },
    start() { this.isRunning = true; this.isPaused = false; },
    stop() { this.isRunning = false; },
    pause() { this.isPaused = true; },
    resume() { this.isPaused = false; },
    addFrameHook(f) { this.hooks.push(f); },
    removeFrameHook(f) { this.hooks = this.hooks.filter((x) => x !== f); },
    pickVisual: () => null,
    requestFullscreen: async () => true,
    exitFullscreen() {},
    _resize() {},
  };
};

/* App создаёт настоящий Engine (нужен WebGL), поэтому здесь повторяем его
   шаги вручную поверх заглушки — проверяем сам сценарий переходов. */
const { HomeScreen } = await import('../../../src/shell/home.js');
const { PlayOverlay } = await import('../../../src/shell/play-overlay.js');
const { createProject, loadProject, saveProject, listProjects, setLastOpened, getLastOpened } =
  await import('../../../src/shell/projects.js');
const { buildTemplateScene } = await import('../../../src/shell/templates.js');

const container = document.getElementById('app');
const engine = engineStub(container);
engine.loadScene(engine.createScene('Пустая'));

console.log('\nШаблоны сцен:');
for (const id of ['empty', 'platformer', 'physics']) {
  const data = buildTemplateScene(id, 'Проверка');
  check(Array.isArray(data.objects) && data.objects.length > 0,
    `шаблон «${id}» даёт непустую сцену (${data.objects?.length} объектов)`);
  const restored = Scene.deserialize(data, engine);
  check(restored.gameObjects.length === data.objects.length,
    `шаблон «${id}» восстанавливается из JSON`);
  const hasCamera = restored.gameObjects.some((g) => g.getComponent('Camera'));
  check(hasCamera, `в шаблоне «${id}» есть камера`);
}

console.log('\nСценарий «создать → редактировать → играть»:');
const scene = buildTemplateScene('platformer', 'Платформер');
const project = createProject({ name: 'Платформер', scene, templateId: 'platformer' });
check(!!loadProject(project.id), 'проект сохранён');

// Главный экран
let mode = 'home';
const home = new HomeScreen({
  onOpenEditor: () => { mode = 'edit'; },
  onPlay: () => { mode = 'play'; },
});
check($$('.wfl-card').length === 1, 'проект виден на главной');

tap($('.wfl-chip.play'));
check(mode === 'play', 'запуск игры из карточки');
mode = 'home';
tap($$('.wfl-chip')[1]);
check(mode === 'edit', 'открытие редактора из карточки');

// Загрузка сцены проекта в движок
const loadInto = (data) => {
  engine.scene?.unload();
  engine.physics.clear();
  const s = data?.objects?.length ? Scene.deserialize(data, engine) : new Scene('Пустая');
  s.physics = engine.physics;
  engine.loadScene(s);
  return s;
};
const live = loadInto(loadProject(project.id).scene);
check(live.gameObjects.length > 0, `сцена проекта загружена (${live.gameObjects.length} объектов)`);
check(!!live.findByTag('Player'), 'в платформере есть игрок с тегом Player');

// Режим игры
home.hide();
const snapshot = live.serialize();
engine.touchControls = new TouchControls(engine);
engine.touchControls.setupDefault();
engine.touchControls.show();

let exited = false;
const overlay = new PlayOverlay({
  engine,
  title: project.name,
  onExit: () => { exited = true; },
  onRestart: () => { loadInto(snapshot); overlay.rebindScene(); overlay.onRestarted(); },
});
check(!!$('.wfl-play'), 'интерфейс игры показан');
check($$('.wfl-touch-button').length === 3, 'экранные кнопки созданы');
check($$('.wfl-joystick').length === 1, 'джойстик создан');
check(!/[\p{Extended_Pictographic}]/u.test($('.wfl-touch-controls')?.textContent ?? ''),
  'на экранных кнопках нет эмодзи');
check($$('.wfl-touch-button svg').length === 3, 'кнопки подписаны иконками');

// HUD собран по содержимому сцены
check(!!overlay.playerHealth, 'HUD нашёл здоровье игрока');
check(!!$('.wfl-play .hud .hp'), 'полоска здоровья показана');

// Пауза и возврат
overlay.pause();
check(engine.isPaused, 'игра встала на паузу');
tap($$('.wfl-pbig', overlay.root).find((b) => b.textContent.includes('Выйти')));
check(exited, 'выход из игры сработал');

// Возврат в редактор: сцена восстанавливается из снимка
// Сравниваем со снимком: объект live к этому моменту уже выгружен
const back = loadInto(snapshot);
check(back.gameObjects.length === snapshot.objects.length,
  `после игры сцена вернулась к исходному состоянию (${back.gameObjects.length} объектов)`);
check(!!back.findByTag('Player'), 'игрок на месте после возврата из игры');

overlay.dispose();
engine.touchControls.clear();
check($$('.wfl-touch-button').length === 0, 'экранные кнопки убраны из редактора');

// Возврат на главную
home.show();
check($('.wfl-home').style.display === '', 'главная снова видна');
setLastOpened(project.id);
home.render();
check($('.wfl-card').textContent.includes('открыт последним'), 'отмечен последний открытый проект');

console.log('\nСохранение прогресса:');
const edited = JSON.parse(JSON.stringify(snapshot));
edited.objects.push({ name: 'Новый куб', id: 'x1', components: [] });
saveProject(project.id, { scene: edited });
check(loadProject(project.id).scene.objects.length === snapshot.objects.length + 1,
  'изменения сцены сохраняются в проект');
check(listProjects()[0].objects === edited.objects.length, 'метаданные обновились');

console.log(`\nИтого: ${ok} успешно, ${errors} ошибок`);
process.exit(errors ? 1 : 0);
