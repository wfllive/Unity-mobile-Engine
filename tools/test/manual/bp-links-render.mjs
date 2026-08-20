// jsdom-смоук: связи ДЕЙСТВИТЕЛЬНО рисуются там, где стоят пины.
// Регрессия: слой SVG сдвинут на -20000px, а кривые считались в мировых
// координатах. Без viewBox связь с точкой (500,500) уезжала на -19500 —
// счётчик показывал «2 связей», но на холсте было пусто.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
  pretendToBeVisual: true, url: 'http://localhost/',
});
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);
dom.window.Element.prototype.setPointerCapture ??= () => {};
dom.window.PointerEvent = dom.window.MouseEvent;

const { BlueprintEditor } = await import('../../../src/editor/blueprint-editor.js');
const { BlueprintGraph } = await import('../../../src/engine/blueprint/graph.js');

let pass = 0; let fail = 0;
const t = (c, m) => { if (c) pass++; else { fail++; console.error(`  ✗ ${m}`); } };

const comp = { graphName: 'Тест', graph: new BlueprintGraph(), compile() {}, toJSON: () => ({}) };
const ed = new BlueprintEditor({ component: comp });
ed.mount(document.getElementById('host'));

const g = ed.graph;
// Ровно случай со скриншота: «Каждый кадр» → «Ветвление»
const upd = g.addNode('OnUpdate', 460, 470);
const br = g.addNode('Branch', 780, 430);
g.connect(upd.id, 'out', br.id, 'in', true);
ed.render();

console.log('— Слой связей настроен на мировые координаты');
{
  const vb = ed.svg.getAttribute('viewBox');
  t(!!vb, 'у SVG должен быть viewBox, иначе кривые уезжают за экран');
  const [minX, minY, w, h] = (vb || '0 0 0 0').split(/\s+/).map(Number);
  t(minX < -1000 && minY < -1000, `viewBox должен покрывать отрицательные координаты, получено ${vb}`);
  t(w > 30000 && h > 30000, 'viewBox должен покрывать большой мир');
  // Совпадает ли начало координат со смещением слоя
  t(String(minX) === '-20000' && String(minY) === '-20000',
    `начало viewBox должно совпадать с left/top слоя (-20000), получено ${minX} ${minY}`);
}

console.log('— Кривая нарисована рядом с пинами, а не за экраном');
{
  const paths = [...ed.svg.querySelectorAll('path')].filter((p) => !p.classList.contains('hit'));
  t(paths.length === 1, `должна быть ровно одна видимая кривая, найдено ${paths.length}`);
  const d = paths[0]?.getAttribute('d') ?? '';
  t(/^M\s*-?\d/.test(d.trim()), `путь должен начинаться с команды M, получено "${d.slice(0, 40)}"`);
  // Все координаты пути обязаны лежать в разумной близости к узлам (0..2000),
  // а не в районе ±20000.
  const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  t(nums.length > 0, 'в пути должны быть координаты');
  const far = nums.filter((n) => Math.abs(n) > 5000);
  t(far.length === 0, `координаты не должны уезжать за пределы холста, найдено: ${far.slice(0, 4)}`);
  // Кривая должна стартовать примерно у правого края узла-события
  t(nums[0] > 400 && nums[0] < 900, `начало кривой должно быть у пина узла, получено x=${nums[0]}`);
  t(nums[1] > 400 && nums[1] < 900, `начало кривой должно быть у пина узла, получено y=${nums[1]}`);
}

console.log('— Счётчик и реальность совпадают');
{
  t(g.stats.links === 1, 'в графе одна связь');
  const visible = [...ed.svg.querySelectorAll('path')].filter((p) => !p.classList.contains('hit'));
  t(visible.length === g.stats.links,
    `нарисованных кривых (${visible.length}) должно быть столько же, сколько связей (${g.stats.links})`);
  t(ed.statsEl.textContent.includes('1 связей') || ed.statsEl.textContent.includes('1 связ'),
    `счётчик должен показывать связь, получено "${ed.statsEl.textContent}"`);
}

console.log('— Зона клика повторяет кривую');
{
  const hit = ed.svg.querySelector('path.hit');
  t(!!hit, 'должна быть невидимая зона клика');
  t(hit.getAttribute('d') === ed.svg.querySelectorAll('path')[1].getAttribute('d'),
    'зона клика должна совпадать с видимой кривой');
}

console.log('— Связь данных тоже рисуется');
{
  const num = g.addNode('Number', 460, 700);
  const mul = g.addNode('Multiply', 780, 700);
  g.connect(num.id, 'value', mul.id, 'a');
  ed.render();
  const visible = [...ed.svg.querySelectorAll('path')].filter((p) => !p.classList.contains('hit'));
  t(visible.length === 2, `должно быть две кривые, найдено ${visible.length}`);
  const colored = visible.map((p) => p.getAttribute('stroke'));
  t(colored.includes('#e6ecf5'), 'exec-связь должна быть белой');
  t(colored.some((c) => c && c !== '#e6ecf5'), 'связь данных должна быть цветной по типу');
}

console.log(`\nИтого: ${pass} ok, ${fail} ошибок`);
process.exit(fail ? 1 : 0);
