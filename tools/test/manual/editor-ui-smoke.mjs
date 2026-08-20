// Ручной тест редактора сцены в jsdom: панели, выбор объекта, инспектор,
// создание и удаление объектов. WebGL не поднимается — движок подменён
// минимальной заглушкой, проверяется именно интерфейс.
//
//   npm install --no-save jsdom && node tools/test/manual/editor-ui-smoke.mjs

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
  url: 'https://localhost/',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Option = dom.window.Option;
globalThis.Blob = dom.window.Blob;
globalThis.localStorage = dom.window.localStorage;
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
dom.window.URL.createObjectURL ??= () => 'blob:fake';
dom.window.URL.revokeObjectURL ??= () => {};
globalThis.URL = dom.window.URL;
globalThis.ResizeObserver = class { observe() {} disconnect() {} };

let ok = 0, errors = 0;
const check = (c, m) => { if (c) { ok++; } else { errors++; console.log('  FAIL  ' + m); } };
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const tap = (el, what = '') => {
  if (!el) throw new Error('нет элемента для нажатия: ' + what);
  el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
};
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

const { Scene, PhysicsWorld } = await import('../../../src/engine/index.js');

/* Заглушка движка: даёт сцену и контейнер, но не трогает WebGL */
const container = document.getElementById('app');
const scene = new Scene('Тестовая сцена');
const fakeEngine = {
  container,
  canvas: document.createElement('canvas'),
  isMobile: true,
  isPaused: false,
  scene,
  physics: new PhysicsWorld({ fixedTimeStep: 1 / 60 }),
  hooks: [],
  pause() { this.isPaused = true; },
  resume() { this.isPaused = false; },
  addFrameHook(f) { this.hooks.push(f); },
  removeFrameHook(f) { this.hooks = this.hooks.filter((x) => x !== f); },
  pickVisual: () => null,
  requestFullscreen: async () => true,
  exitFullscreen() {},
};
scene.engine = fakeEngine;
container.appendChild(fakeEngine.canvas);

const { Editor } = await import('../../../src/editor/editor.js').catch(async (e) => {
  console.log('Не удалось импортировать редактор:', e.message);
  process.exit(1);
});

console.log('\nЗапуск редактора:');
let played = false, exited = false, changed = 0;
let editor;
try {
  editor = new Editor(fakeEngine, {
    project: { id: 'p1', name: 'Мой проект' },
    onPlay: () => { played = true; },
    onExit: () => { exited = true; },
    onChange: () => { changed++; },
  });
} catch (e) {
  console.log('  FAIL  редактор не запустился:', e.message);
  console.log(e.stack);
  process.exit(1);
}
check(!!$('.wfl-ed'), 'редактор отрисован');
check($('.wfl-ed .bar').textContent.includes('Мой проект'), 'в шапке имя проекта');

/* ---------- Никаких эмодзи ---------- */
const emoji = /[\p{Extended_Pictographic}\u2190-\u21FF\u25A0-\u25FF\u2B00-\u2BFF\u2600-\u27BF]/u;
check(!emoji.test($('.wfl-ed').textContent), 'в редакторе нет эмодзи');
check($$('.wfl-ed svg').length > 10, `иконки нарисованы svg (${$$('.wfl-ed svg').length} шт.)`);

/* ---------- Кнопка «Играть» ---------- */
console.log('\nРежимы:');
tap($('.wfl-tb.play'), 'играть');
check(played, 'кнопка «Играть» запускает игру');
check(changed > 0, 'перед запуском проект сохраняется');

tap($('.wfl-ed .bar .wfl-tb'), 'назад');
check(exited, 'кнопка «Назад» выходит на главную');

/* ---------- Инструменты ---------- */
console.log('\nИнструменты:');
check(editor.mode === 'translate', 'по умолчанию режим перемещения');
check(editor.moveBtn.classList.contains('on'), 'кнопка перемещения подсвечена');
tap(editor.rotBtn);
check(editor.mode === 'rotate' && editor.rotBtn.classList.contains('on')
  && !editor.moveBtn.classList.contains('on'), 'переключение на поворот');
tap(editor.scaleBtn);
check(editor.mode === 'scale', 'переключение на масштаб');
tap(editor.snapBtn);
check(editor.snap === true, 'привязка включается');
tap(editor.snapBtn);
check(editor.snap === false, 'привязка выключается');

/* ---------- Панели ---------- */
console.log('\nПанели:');
check(editor.dock.classList.contains('closed'), 'панель изначально свёрнута');
editor.openPanel('hierarchy');
check(!editor.dock.classList.contains('closed'), 'панель раскрывается');
check(editor.tabBtns.hierarchy.classList.contains('on'), 'вкладка «Объекты» активна');
check($('.wfl-none', editor.dockBody)?.textContent.includes('нет объектов'),
  'пустая сцена показывает подсказку');
editor.openPanel('console');
check(editor.tabBtns.console.classList.contains('on'), 'вкладка «Консоль» активна');
check(editor.dockBody.textContent.includes('Редактор открыт'), 'в консоли есть записи');
editor.toggleDock();
check(editor.dock.classList.contains('closed'), 'панель сворачивается кнопкой');

/* ---------- Создание объектов ---------- */
console.log('\nОбъекты:');
const cube = editor.createObject('box');
check(!!cube, 'куб создан');
check(cube.name === 'Куб', `имя по-русски: ${cube.name}`);
check(!!cube.getComponent('MeshRenderer'), 'у куба есть меш');
check(!!cube.getComponent('BoxCollider'), 'у куба есть коллайдер');
check(editor.selected === cube, 'новый объект выделен');

const cube2 = editor.createObject('box');
check(cube2.name === 'Куб 2', `второй куб получил уникальное имя: ${cube2.name}`);
const sphere = editor.createObject('sphere');
check(!!sphere.getComponent('SphereCollider'), 'у сферы сферический коллайдер');

const light = editor.createSpecial('light');
check(!!light?.getComponent('Light'), 'источник света создан');
const cam = editor.createSpecial('camera');
check(!!cam?.getComponent('Camera'), 'камера создана');
const empty = editor.createSpecial('empty');
check(empty && empty.components.length === 0, 'пустой объект без компонентов');

/* ---------- Иерархия ---------- */
editor.openPanel('hierarchy');
const rows = $$('.wfl-row', editor.dockBody);
check(rows.length === 6, `в иерархии 6 объектов (получено ${rows.length})`);
check(!editor.dockBody.textContent.includes('__EditorCamera'), 'служебная камера скрыта из иерархии');

// Выбор тапом по строке
tap(rows[0]);
check(editor.selected?.name === 'Куб', 'тап по строке выбирает объект');
check(editor.panel === 'inspector', 'после выбора открывается инспектор');

// Переключение видимости
editor.openPanel('hierarchy');
const firstRow = $$('.wfl-row', editor.dockBody)[0];
tap($('.vis', firstRow));
check(cube.activeSelf === false, 'глаз выключает объект');
tap($('.vis', $$('.wfl-row', editor.dockBody)[0]));
check(cube.activeSelf === true, 'глаз включает обратно');

/* ---------- Инспектор ---------- */
console.log('\nИнспектор:');
editor.select(cube);
editor.openPanel('inspector');
const insp = editor.dockBody.textContent;
check(insp.includes('Трансформ'), 'показан трансформ');
check(insp.includes('Меш'), 'компонент MeshRenderer назван по-русски');
check(insp.includes('Коллайдер-куб'), 'коллайдер назван по-русски');
check(insp.includes('Добавить компонент'), 'есть кнопка добавления компонента');

// Правка имени
const nameInput = $$('.wfl-f input[type=text]', editor.dockBody)[0];
check(!!nameInput, 'поле имени присутствует');
nameInput.value = 'Ящик';
nameInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
check(cube.name === 'Ящик', 'имя объекта меняется из инспектора');

// Правка позиции
const vecInputs = $$('.wfl-f .v3 input', editor.dockBody);
check(vecInputs.length >= 9, `есть поля позиции, поворота и масштаба (${vecInputs.length})`);
vecInputs[0].value = '5';
vecInputs[0].dispatchEvent(new dom.window.Event('input', { bubbles: true }));
check(Math.abs(cube.transform.localPosition.x - 5) < 0.001, 'позиция X применилась');

// Переключатель «Активен»
const sw = $$('.wfl-sw', editor.dockBody).find((s) => s.textContent.includes('Активен'));
check(!!sw, 'есть переключатель активности');
tap(sw);
check(cube.activeSelf === false, 'переключатель выключает объект');
tap(sw);

/* ---------- Дублирование и удаление ---------- */
console.log('\nДублирование и удаление:');
const before = scene.gameObjects.length;
editor.select(cube);
editor.duplicateSelected();
check(scene.gameObjects.length === before + 1, 'объект продублирован');
check(editor.selected !== cube, 'выделен дубликат');
check(editor.selected.name !== cube.name, `у дубликата своё имя: ${editor.selected.name}`);

// Удаление спрашивает подтверждение
const delPromise = editor.deleteSelected();
await tick(60);
check(!!$('.wfl-sheet .warn'), 'удаление требует подтверждения');
tap($$('.wfl-sheet .wfl-big').find((b) => b.textContent.includes('Отмена')));
await delPromise;
check(scene.gameObjects.length === before + 1, 'после отмены объект на месте');

const target = editor.selected;
const del2 = editor.deleteSelected();
await tick(60);
tap($$('.wfl-sheet .wfl-big').find((b) => b.textContent.includes('Удалить')));
await del2;
await tick(80);
check(target._destroyed === true, 'после подтверждения объект удалён');
check(editor.selected === null, 'выделение снято');

/* ---------- Листы добавления ---------- */
console.log('\nЛисты:');
await editor.showAddSheet();
await tick(60);
check(!!$('.wfl-sheet'), 'лист добавления открыт');
check($$('.wfl-add-item').length > 10, `перечислены примитивы (${$$('.wfl-add-item').length})`);
check($('.wfl-sheet').textContent.includes('Источник света'), 'есть специальные объекты');
const cnt = scene.gameObjects.length;
tap($$('.wfl-add-item')[0]);
await tick(40);
check(scene.gameObjects.length === cnt + 1, 'тап по примитиву создаёт объект');
check(!$('.wfl-sheet'), 'лист закрылся после выбора');

editor.select(scene.gameObjects.find((g) => g.name.startsWith('Куб')));
await editor.showComponentSheet();
await tick(60);
check($$('.wfl-sheet .wfl-list-item').length > 5, 'список компонентов показан');
const search = $('.wfl-sheet input[type=text]');
search.value = 'здоров';
search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
const found = $$('.wfl-sheet .wfl-list-item');
check(found.length === 1 && found[0].textContent.includes('Здоровье'),
  'поиск по русскому названию находит компонент');
tap(found[0]);
await tick(40);
check(!!editor.selected.getComponent('Health'), 'компонент добавлен на объект');

/* ---------- Перезагрузка сцены (возврат из игры) ---------- */
console.log('\nВозврат из игры:');
const snapshot = editor.sceneData();
editor.setVisible(false);
editor.detachTools();

// Оболочка подменяет сцену новым объектом — как после запуска игры
const fresh = Scene.deserialize(snapshot, fakeEngine);
fresh.physics = fakeEngine.physics;
fakeEngine.scene.unload();
fakeEngine.physics.clear();
fakeEngine.scene = fresh;
fresh.load();

const realUpdate = fresh.update;
editor.setVisible(true);
editor.attachTools();
check(fresh.update !== realUpdate, 'после возврата симуляция снова остановлена');
check(!!fresh.gameObjects.find((g) => g.name === '__EditorCamera'),
  'редакторская камера пересоздана в новой сцене');
check(fresh.mainCamera === editor.editorCamera, 'вид переключён на камеру редактора');

// Восстановление должно вернуть методы именно этой сцене
editor.setSimulation(true);
check(fresh.update === realUpdate, 'симуляция корректно возвращается новой сцене');
editor.setSimulation(false);

editor.refresh();
check(!!$('.wfl-ed'), 'редактор жив после перезагрузки сцены');

/* ---------- Сохранение сцены ---------- */
console.log('\nСохранение:');
const data = editor.sceneData();
check(Array.isArray(data.objects), 'sceneData отдаёт объекты');
check(data.objects.length > 0, `в сохранении есть объекты (${data.objects.length})`);
check(!JSON.stringify(data).includes('__EditorCamera'), 'служебная камера не попадает в сохранение');
check(data.name === 'Мой проект', 'имя сцены берётся из проекта');

/* ---------- Закрытие ---------- */
editor.close();
check(!$('.wfl-ed'), 'редактор убран из DOM');
check(!scene.gameObjects.some((g) => g.name === '__EditorCamera'), 'служебная камера удалена');

console.log(`\nИтого: ${ok} успешно, ${errors} ошибок`);
process.exit(errors ? 1 : 0);
