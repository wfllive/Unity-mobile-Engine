// Ручной тест интерфейса оболочки в jsdom: главный экран, карточки проектов,
// нижние листы, режим игры. Запуск:
//   npm install --no-save jsdom && node tools/test/manual/shell-ui-smoke.mjs
//
// В обычный npm test не входит: jsdom не является зависимостью проекта.

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
if (!dom.window.URL.createObjectURL) {
  dom.window.URL.createObjectURL = () => 'blob:fake';
  dom.window.URL.revokeObjectURL = () => {};
}
globalThis.URL = dom.window.URL;

let ok = 0, errors = 0;
const check = (c, m) => { if (c) { ok++; } else { errors++; console.log('  FAIL  ' + m); } };
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const tap = (el) => {
  if (!el) throw new Error('нет элемента для нажатия');
  el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
};
const tick = () => new Promise((r) => setTimeout(r, 20));

const { HomeScreen, sheet, confirmSheet } = await import('../../../src/shell/home.js');
const { createProject, listProjects, loadProject } = await import('../../../src/shell/projects.js');
const { icon } = await import('../../../src/ui/icons.js');

/* ==================== Главный экран ==================== */
console.log('\nГлавный экран:');
let openedEditor = null, playedProject = null;
const home = new HomeScreen({
  onOpenEditor: (id) => { openedEditor = id; },
  onPlay: (id) => { playedProject = id; },
});

check(!!$('.wfl-home'), 'главный экран отрисован');
check($$('.wfl-tpl').length >= 4, 'показаны шаблоны проектов');
check(!!$('.wfl-empty'), 'пустое состояние при отсутствии проектов');
check(!!$('.wfl-fab'), 'есть кнопка «Создать проект»');
check(!$('.wfl-card'), 'карточек проектов пока нет');

// Никаких эмодзи в интерфейсе — только svg-иконки
const homeText = $('.wfl-home').textContent;
const emoji = /[\p{Extended_Pictographic}\u2190-\u21FF\u25A0-\u25FF\u2B00-\u2BFF\u2600-\u27BF]/u;
check(!emoji.test(homeText), 'на главной нет эмодзи');
check($$('svg.wfl-i').length > 5, `иконки нарисованы svg (${$$('svg.wfl-i').length} шт.)`);

/* ==================== Карточки проектов ==================== */
console.log('\nПроекты:');
const scene = { version: 1, name: 'S', settings: {}, objects: [{ name: 'Куб', id: '1', components: [] }] };
const proj = createProject({ name: 'Тестовая игра', scene, templateId: 'platformer' });
home.render();

check($$('.wfl-card').length === 1, 'карточка проекта появилась');
const card = $('.wfl-card');
check(card.textContent.includes('Тестовая игра'), 'на карточке имя проекта');
check(card.textContent.includes('1 объектов'), 'на карточке число объектов');
check(!$('.wfl-empty'), 'пустое состояние исчезло');

// Кнопка «Запустить» не должна открывать редактор
tap($('.wfl-chip.play', card));
check(playedProject === proj.id, 'кнопка «Запустить» вызывает запуск игры');
check(openedEditor === null, 'запуск не открывает редактор');

// Кнопка «Редактор»
tap($$('.wfl-chip', card)[1]);
check(openedEditor === proj.id, 'кнопка «Редактор» открывает редактор');

// Тап по самой карточке — тоже редактор
openedEditor = null;
tap(card);
check(openedEditor === proj.id, 'тап по карточке открывает редактор');

/* ==================== Меню проекта ==================== */
console.log('\nМеню проекта:');
tap($$('.wfl-chip', $('.wfl-card'))[2]);
await tick();
check(!!$('.wfl-sheet'), 'открылся нижний лист');
const menuText = $('.wfl-sheet').textContent;
for (const label of ['Запустить игру', 'Открыть в редакторе', 'Переименовать', 'Создать копию', 'Удалить проект']) {
  check(menuText.includes(label), `в меню есть «${label}»`);
}

// Переименование
const renameBtn = $$('.wfl-sheet .wfl-big').find((b) => b.textContent.includes('Переименовать'));
tap(renameBtn);
await tick();
const input = $('.wfl-sheet input[type=text]');
check(!!input, 'поле ввода имени показано');
input.value = 'Новое имя';
tap($$('.wfl-sheet .wfl-big').find((b) => b.textContent.includes('Сохранить')));
await tick();
check(loadProject(proj.id).name === 'Новое имя', 'проект переименован через интерфейс');
check($('.wfl-card').textContent.includes('Новое имя'), 'карточка обновилась');

/* ==================== Удаление с подтверждением ==================== */
console.log('\nУдаление:');
const confirmPromise = confirmSheet({ title: 'Удалить?', message: 'Проверка' });
await tick();
check(!!$('.wfl-sheet .warn'), 'показано предупреждение');
tap($$('.wfl-sheet .wfl-big').find((b) => b.textContent.includes('Отмена')));
check((await confirmPromise) === false, 'отмена возвращает false');

const confirm2 = confirmSheet({ title: 'Удалить?', message: 'Проверка' });
await tick();
tap($$('.wfl-sheet .wfl-big').find((b) => b.textContent.includes('Удалить')));
check((await confirm2) === true, 'подтверждение возвращает true');

/* ==================== Создание проекта ==================== */
console.log('\nСоздание проекта:');
tap($('.wfl-fab'));
await tick();
check(!!$('.wfl-sheet'), 'лист создания открыт');
check($$('.wfl-pick-item').length >= 4, 'шаблоны перечислены');
const items = $$('.wfl-pick-item');
check(items[0].classList.contains('on'), 'первый шаблон выбран по умолчанию');
tap(items[1]);
check(items[1].classList.contains('on') && !items[0].classList.contains('on'), 'выбор шаблона переключается');
const nameInput = $('.wfl-sheet input[type=text]');
nameInput.value = 'Из шаблона';
tap($$('.wfl-sheet .wfl-big').find((b) => b.textContent.includes('Создать')));
await new Promise((r) => setTimeout(r, 600));
const created = listProjects().find((p) => p.name === 'Из шаблона');
check(!!created, 'проект создан из шаблона');
check(created && created.objects > 0, `в сцене шаблона есть объекты (${created?.objects})`);
check(openedEditor === created?.id, 'после создания открывается редактор');

/* ==================== Справка ==================== */
console.log('\nСправка:');
home.render();
tap($$('.wfl-home .ghost-ico')[1]);
await tick();
check($('.wfl-sheet').textContent.includes('Как пользоваться'), 'справка открывается');
tap($$('.wfl-sheet .wfl-big')[0]);
await tick();
check(!$('.wfl-sheet'), 'справка закрывается');

/* ==================== Показ / скрытие ==================== */
console.log('\nПереключение экрана:');
home.hide();
check($('.wfl-home').style.display === 'none', 'главный экран прячется');
check($('.wfl-fab').style.display === 'none', 'кнопка создания прячется вместе с ним');
home.show();
check($('.wfl-home').style.display === '', 'главный экран возвращается');

/* ==================== Оверлей игры ==================== */
console.log('\nРежим игры:');
const { PlayOverlay } = await import('../../../src/shell/play-overlay.js');

// Минимальная заглушка движка
const fakeEngine = {
  container: document.getElementById('app'),
  isPaused: false,
  hooks: [],
  scene: {
    gameObjects: [],
    findByTag: () => null,
    on() {}, off() {},
  },
  pause() { this.isPaused = true; },
  resume() { this.isPaused = false; },
  addFrameHook(f) { this.hooks.push(f); },
  removeFrameHook(f) { this.hooks = this.hooks.filter((x) => x !== f); },
  requestFullscreen: async () => true,
  exitFullscreen() {},
  touchControls: { shown: true, show() { this.shown = true; }, hide() { this.shown = false; } },
};

let exited = false, restarted = false;
const overlay = new PlayOverlay({
  engine: fakeEngine,
  title: 'Тестовая игра',
  onExit: () => { exited = true; },
  onRestart: () => { restarted = true; },
});

check(!!$('.wfl-play'), 'оверлей игры отрисован');
check($('.wfl-play .title').textContent === 'Тестовая игра', 'показано имя игры');
check($$('.wfl-play .wfl-pbtn').length === 2, 'есть кнопки паузы и полного экрана');
check(!!$('.wfl-play .hint'), 'показана подсказка по управлению');
check(!emoji.test($('.wfl-play').textContent), 'в игровом интерфейсе нет эмодзи');

// Пауза
overlay.pause();
check(fakeEngine.isPaused, 'пауза останавливает движок');
check(!fakeEngine.touchControls.shown, 'тач-контролы скрыты на паузе');
check(!!$('.veil', overlay.root), 'показано окно паузы');
const pauseText = $('.card', overlay.root).textContent;
check(pauseText.includes('Продолжить') && pauseText.includes('Начать заново')
  && pauseText.includes('Выйти из игры'), 'в паузе три действия');

// Продолжить
tap($$('.wfl-pbig', overlay.root).find((b) => b.textContent.includes('Продолжить')));
check(!fakeEngine.isPaused, 'продолжение снимает паузу');
check(fakeEngine.touchControls.shown, 'тач-контролы вернулись');
check(!$('.veil', overlay.root), 'окно паузы закрылось');

// Перезапуск и выход
overlay.pause();
tap($$('.wfl-pbig', overlay.root).find((b) => b.textContent.includes('Начать заново')));
check(restarted, 'кнопка перезапуска срабатывает');
check(!overlay.paused, 'после перезапуска игра не остаётся на паузе');
check(!$('.veil', overlay.root), 'окно паузы закрылось после перезапуска');
overlay.pause();
tap($$('.wfl-pbig', overlay.root).find((b) => b.textContent.includes('Выйти')));
check(exited, 'кнопка выхода срабатывает');

// Финальный экран
overlay.showResult({ win: true, title: 'Победа', text: 'Готово', stats: [['Очки', 42]] });
check($('.card', overlay.root).classList.contains('win'), 'экран победы оформлен как победа');
check($('.card', overlay.root).textContent.includes('42'), 'показана статистика');
overlay.showResult({ win: false });
check($('.card', overlay.root).classList.contains('lose'), 'экран поражения оформлен как поражение');

// Автономный режим (APK): выхода нет
const solo = new PlayOverlay({ engine: fakeEngine, title: 'APK', standalone: true, onExit: () => {} });
solo.pause();
check(!$('.card', solo.root).textContent.includes('Выйти из игры'),
  'в автономной сборке нет кнопки выхода');
solo.dispose();

overlay.dispose();
check($$('.wfl-play').length === 0, 'оверлей удаляется при закрытии');

console.log(`\nИтого: ${ok} успешно, ${errors} ошибок`);
process.exit(errors ? 1 : 0);
