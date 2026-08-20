// Ручной smoke-тест UI редактора блюпринтов в jsdom.
// Не входит в `npm test`: требует необязательную зависимость jsdom.
//   npm install --no-save jsdom && node tools/test/manual/bp-ui-smoke.mjs
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
for (const k of ['window','document','Node','Element','HTMLElement','Event','PointerEvent',
                 'MouseEvent','KeyboardEvent','SVGElement','Option','getComputedStyle','requestAnimationFrame']) {
  globalThis[k] = dom.window[k];
}
globalThis.CSS = dom.window.CSS;
// jsdom не реализует layout — подставим размеры
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetWidth', { get(){ return 160; } });
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', { get(){ return 90; } });
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetLeft', { get(){ return 8; } });
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetTop', { get(){ return 20; } });
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetParent', { get(){ return null; } });
dom.window.HTMLElement.prototype.setPointerCapture = function(){};
dom.window.Element.prototype.getBoundingClientRect = function(){ return { left:0, top:0, width:1200, height:700, right:1200, bottom:700 }; };

const { Blueprint } = await import('../../../src/engine/blueprint/component.js');
const { BlueprintEditor } = await import('../../../src/editor/blueprint-editor.js');

let errors = 0, ok = 0;
const check=(c,m)=>{ if(c){ok++;} else {errors++; console.log('  ✗',m);} };

const comp = new Blueprint();
comp.compile();
const ed = new BlueprintEditor({ component: comp, host: { log: () => {} } });
ed.mount(dom.window.document.body);

check(dom.window.document.querySelector('.wfl-bp'), 'корень редактора смонтирован');
check(dom.window.document.querySelectorAll('.wfl-bp-item').length > 50, 'палитра заполнена (>50 узлов)');

// Шаблон
ed.insertTemplate();
check(ed.graph.stats.nodes === 5, `шаблон: 5 узлов, получено ${ed.graph.stats.nodes}`);
check(ed.graph.stats.links === 4, `шаблон: 4 связи, получено ${ed.graph.stats.links}`);
check(dom.window.document.querySelectorAll('.wfl-bp-node').length === 5, 'отрисовано 5 DOM-узлов');
check(ed.svg.querySelectorAll('path').length === 8, `8 path (4 связи × hit+видимый), получено ${ed.svg.querySelectorAll('path').length}`);

// Пины отрисованы
check(dom.window.document.querySelectorAll('.wfl-bp-pin').length > 10, 'пины отрисованы');
check(dom.window.document.querySelectorAll('.wfl-bp-pin.exec').length > 0, 'exec-пины отрисованы');

// Поиск по палитре
ed._fillPalette('поверн');
const filtered = dom.window.document.querySelectorAll('.wfl-bp-item').length;
check(filtered > 0 && filtered < 20, `поиск по названию фильтрует (${filtered} результатов)`);
ed._fillPalette('rotate');
const byType = dom.window.document.querySelectorAll('.wfl-bp-item').length;
check(byType > 0, `поиск по типу узла работает (${byType})`);
ed._fillPalette('щщщнеттакого');
check(dom.window.document.querySelectorAll('.wfl-bp-item').length === 0, 'поиск без совпадений даёт пусто');
ed._fillPalette('');
check(dom.window.document.querySelectorAll('.wfl-bp-item').length === 74, 'сброс поиска возвращает все 74 узла');

// Автораскладка + fit
ed.autoLayout();
check([...ed.graph.nodes.values()].every(n => Number.isFinite(n.x) && Number.isFinite(n.y)), 'автораскладка даёт конечные координаты');
ed.fitView();
check(ed.scale > 0.2 && ed.scale <= 2.5, `масштаб в пределах (${ed.scale.toFixed(2)})`);

// Зум
const before = ed.scale;
ed.zoomAt(1.25, 600, 350);
check(ed.scale > before, 'зум увеличивает масштаб');
ed.zoomBy(1/1.25);

// Выделение и дублирование
ed.selected = new Set(ed.graph.nodes.keys());
const n0 = ed.graph.stats.nodes;
ed.duplicateSelection();
check(ed.graph.stats.nodes === n0 * 2, `дублирование: ${n0}→${ed.graph.stats.nodes}`);
check(ed.graph.stats.links === 8, `связи скопированы: ${ed.graph.stats.links}`);

// Удаление
ed.deleteSelection();
check(ed.graph.stats.nodes === n0, `удаление вернуло ${n0}, получено ${ed.graph.stats.nodes}`);

// Валидация
ed.validate();
check(ed.errBox.style.display === 'block', 'валидация показала сообщение');

// Позиции пинов
const anyNode = [...ed.graph.nodes.values()][0];
const pos = ed._pinPos(anyNode.id, 'execOut', 'out') || ed._pinPos(anyNode.id, 'out', 'value');
check(!pos || (Number.isFinite(pos.x) && Number.isFinite(pos.y)), 'координаты пина конечны');

// Применение к компоненту
ed.apply();
check(comp.graphData.length > 50, 'graphData записан в компонент');
check(comp.graph && comp.graph.stats.nodes === n0, 'компонент пересобрал граф');
check(ed.graph === comp.graph, 'редактор переключился на новый экземпляр графа');
const parsed = JSON.parse(comp.graphData);
check(parsed.nodes.length === n0, 'JSON round-trip сохранил узлы');

// Соединение через симуляцию пинов
const g2 = ed.graph;
const nodesArr = [...g2.nodes.values()];
ed._pending = { nodeId: nodesArr[0].id, name: 'out', kind: 'execOut', isExec: true, a:{x:0,y:0}, cursor:{x:1,y:1} };
const fakePin = dom.window.document.createElement('div');
fakePin.dataset.kind='execIn'; fakePin.dataset.node=nodesArr[1].id; fakePin.dataset.pin='in'; fakePin.dataset.type='exec';
const linksBefore = g2.links.length;
ed._finishLink(fakePin);
check(g2.links.length >= linksBefore, 'соединение через пины не падает');

// Нельзя exec ↔ данные
ed._pending = { nodeId: nodesArr[0].id, name: 'out', kind: 'execOut', isExec: true, a:{x:0,y:0}, cursor:{x:1,y:1} };
const dataPin = dom.window.document.createElement('div');
dataPin.dataset.kind='in'; dataPin.dataset.node=nodesArr[1].id; dataPin.dataset.pin='value'; dataPin.dataset.type='number';
const lb = g2.links.length;
ed._finishLink(dataPin);
check(g2.links.length === lb, 'exec нельзя соединить с данными');

ed.dispose();
check(!dom.window.document.querySelector('.wfl-bp'), 'dispose убрал DOM');

console.log(`\nИтого: ${ok} ok, ${errors} ошибок`);
process.exit(errors ? 1 : 0);
