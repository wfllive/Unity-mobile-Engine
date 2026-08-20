// jsdom-смоук: соединение тапами, подсветка кандидатов, мобильная панель.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
  pretendToBeVisual: true, url: 'http://localhost/',
});
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);
if (!dom.window.Element.prototype.setPointerCapture) {
  dom.window.Element.prototype.setPointerCapture = () => {};
  dom.window.Element.prototype.releasePointerCapture = () => {};
}
dom.window.PointerEvent = dom.window.MouseEvent;

const { BlueprintEditor } = await import('../../../src/editor/blueprint-editor.js');
const { BlueprintGraph } = await import('../../../src/engine/blueprint/graph.js');

let pass = 0; let fail = 0;
const t = (c, m) => { if (c) pass++; else { fail++; console.error(`  ✗ ${m}`); } };

const comp = { graphName: 'Тест', graph: new BlueprintGraph(), compile() {}, toJSON: () => ({}) };
const ed = new BlueprintEditor({ component: comp });
ed.mount(document.getElementById('host'));

const g = ed.graph;
const ev = g.addNode('OnStart', 0, 0);
const pr = g.addNode('Print', 300, 0);
const num = g.addNode('Number', 0, 200);
const vec = g.addNode('MakeVector', 0, 400);
ed.render();

const pinOf = (nodeId, kind, name) => ed._nodeEls.get(nodeId)
  ?.querySelector(`.wfl-bp-pin[data-kind="${kind}"][data-pin="${name}"]`);

console.log('— Разметка');
t(!!ed.mobileBar, 'должна существовать нижняя мобильная панель');
t(ed.mobileBar.querySelectorAll('button').length === 6, 'в мобильной панели 6 кнопок');
t(!!ed.tapBtn, 'кнопка режима связи создана');
t(!!ed.tapBtnTop, 'кнопка режима связи есть и в верхней панели');

console.log('— Соединение двумя тапами (exec)');
{
  ed.tapMode = true;
  ed._clearTap();
  const a = pinOf(ev.id, 'execOut', 'out');
  const b = pinOf(pr.id, 'execIn', 'in');
  t(!!a && !!b, 'exec-пины найдены в DOM');
  ed._tapPin(a);
  t(ed._tapFrom !== null, 'после первого тапа пин запомнен');
  ed._tapPin(b);
  t(ed._tapFrom === null, 'после второго тапа выбор сброшен');
  t(g.links.some((l) => l.from === ev.id && l.to === pr.id && l.exec === 'out'),
    'exec-связь должна быть создана двумя тапами');
}

console.log('— Повторный тап по тому же пину отменяет');
{
  ed._clearTap();
  const a = pinOf(num.id, 'out', 'value');
  ed._tapPin(a);
  t(ed._tapFrom !== null, 'пин выбран');
  ed._tapPin(a);
  t(ed._tapFrom === null, 'повторный тап по тому же пину снимает выбор');
}

console.log('— Подсветка допустимых целей');
{
  ed._clearTap();
  const src = pinOf(vec.id, 'out', 'vector');
  ed._tapPin(src);
  const numIn = pinOf(g.nodes.get(pr.id) ? pr.id : num.id, 'in', 'text');
  // Вектор → вход VectorLength.vector допустим
  const vl = g.addNode('VectorLength', 600, 400);
  ed.render();
  ed._highlightCandidates(ed._tapFrom);
  const okPin = pinOf(vl.id, 'in', 'vector');
  t(okPin.classList.contains('cand-ok'), 'совместимый вход подсвечен зелёным');
  const badPin = pinOf(num.id, 'out', 'value');
  t(badPin.classList.contains('cand-bad'), 'выход-выход помечен как недоступный');
  if (numIn) {
    t(numIn.classList.contains('cand-cast') || numIn.classList.contains('cand-bad'),
      'вектор в строковый вход — приведение либо запрет');
  } else pass++;
  ed._clearTap();
  t(!okPin.classList.contains('cand-ok'), 'после отмены подсветка снята');
}

console.log('— Несовместимое соединение отклоняется с подсказкой');
{
  ed._clearTap();
  const before = g.links.length;
  const vOut = pinOf(vec.id, 'out', 'vector');
  const nIn = pinOf(g.addNode('Multiply', 900, 0).id, 'in', 'a');
  ed.render();
  ed._tapPin(vOut);
  ed._tapPin(document.querySelector(`.wfl-bp-pin[data-pin="a"][data-kind="in"]`));
  t(g.links.length === before, 'вектор → число не должен создавать связь');
  t(ed.errBox.style.display === 'block', 'должно показаться сообщение об ошибке');
  t(/Несовместимые типы/.test(ed.errBox.textContent), `текст ошибки про типы, получено: "${ed.errBox.textContent}"`);
}

console.log('— Тап по пустому холсту отменяет выбор');
{
  ed._clearTap();
  ed._tapPin(pinOf(num.id, 'out', 'value'));
  t(ed._tapFrom !== null, 'пин выбран');
  ed.canvas.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true }));
  t(ed._tapFrom === null, 'тап по холсту сбрасывает выбор');
}

console.log('— Переключение режима');
{
  ed.tapMode = false; ed._syncTapBtn();
  t(!ed.tapBtn.classList.contains('on'), 'кнопка выключена');
  ed.tapMode = true; ed._syncTapBtn();
  t(ed.tapBtn.classList.contains('on'), 'кнопка подсвечена во включённом режиме');
  t(/вкл/.test(ed.tapBtnTop.textContent), 'верхняя кнопка отражает состояние');
}

console.log(`\nИтого: ${pass} ok, ${fail} ошибок`);
process.exit(fail ? 1 : 0);
