// Тесты системы Blueprints: узлы, исполнитель графа, компонент, сериализация.
import * as THREE from 'three';
import { BlueprintGraph } from '../../src/engine/blueprint/graph.js';
import { NodeRegistry, getNodeDef, nodesByCategory } from '../../src/engine/blueprint/nodes.js';
import { Blueprint } from '../../src/engine/blueprint/component.js';
import { Scene } from '../../src/engine/core/scene.js';
import { ComponentRegistry } from '../../src/engine/core/component.js';
import { Health } from '../../src/engine/components/gameplay.js';

let ok = 0, bad = 0;
const eq = (a, b, msg) => {
  const pass = Object.is(a, b) || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-6);
  if (pass) { ok++; } else { bad++; console.error(`  ✗ ${msg}: ожидалось ${b}, получено ${a}`); }
};
const t = (cond, msg) => { if (cond) ok++; else { bad++; console.error(`  ✗ ${msg}`); } };

/** Быстрая сборка графа */
function g(nodes, links, vars = {}) {
  return new BlueprintGraph({ version: 1, variables: vars, nodes, links });
}
const D = (from, out, to, inn) => ({ from, out, to, in: inn });
/** Довести сцену до состояния «start уже выполнен» */
const boot = (scene) => { scene.load(); scene.update(0); return scene; };
const E = (from, exec, to) => ({ from, exec, to, execIn: 'in' });

console.log('— Каталог узлов');
t(NodeRegistry.size >= 60, `в каталоге ${NodeRegistry.size} узлов (ожидалось ≥ 60)`);
t(getNodeDef('Branch') !== undefined, 'узел Branch зарегистрирован');
t(getNodeDef('НетТакого') === undefined, 'несуществующий узел не находится');
{
  const cats = nodesByCategory();
  t(cats.has('События') && cats.has('Математика'), 'категории заполнены');
  let total = 0; for (const l of cats.values()) total += l.length;
  eq(total, NodeRegistry.size, 'все узлы попали в категории');
}
// Каждый узел объявляет либо evaluate, либо run, либо является чистым событием
for (const def of NodeRegistry.values()) {
  const isEventOnly = def.event && !def.pure && !def.run;
  t(isEventOnly || (def.pure ? typeof def.evaluate === 'function' : typeof def.run === 'function' || def.event),
    `у узла ${def.type} есть реализация`);
}

console.log('— Чистые узлы и разрешение значений');
{
  // 5 + 3 = 8
  const graph = g(
    [{ id: 'a', type: 'Number', props: { value: 5 } },
     { id: 'b', type: 'Number', props: { value: 3 } },
     { id: 's', type: 'Add' }],
    [D('a', 'value', 's', 'a'), D('b', 'value', 's', 'b')]);
  graph.bind({});
  eq(graph._resolve('s', 'result'), 8, 'Add через связи');
}
{
  // Литералы на входах, когда связи нет
  const graph = g([{ id: 's', type: 'Multiply', inputs: { a: 6, b: 7 } }], []);
  graph.bind({});
  eq(graph._resolve('s', 'result'), 42, 'Multiply по литералам входов');
}
{
  // Значения по умолчанию из определения пина
  const graph = g([{ id: 's', type: 'Add' }], []);
  graph.bind({});
  eq(graph._resolve('s', 'result'), 0, 'Add по умолчанию = 0');
}
{
  // Вложенные чистые узлы: (2+3)*4 = 20
  const graph = g(
    [{ id: 'add', type: 'Add', inputs: { a: 2, b: 3 } },
     { id: 'mul', type: 'Multiply', inputs: { b: 4 } }],
    [D('add', 'result', 'mul', 'a')]);
  graph.bind({});
  eq(graph._resolve('mul', 'result'), 20, 'цепочка чистых узлов');
}
{
  // Деление на ноль не роняет граф
  const graph = g([{ id: 'd', type: 'Divide', inputs: { a: 1, b: 0 } }], []);
  graph.bind({});
  eq(graph._resolve('d', 'result'), 0, 'деление на 0 → 0');
}
{
  // Векторная математика
  const graph = g(
    [{ id: 'v', type: 'MakeVector', inputs: { x: 3, y: 4, z: 0 } },
     { id: 'len', type: 'VectorLength' }],
    [D('v', 'vector', 'len', 'vector')]);
  graph.bind({});
  eq(graph._resolve('len', 'length'), 5, 'длина вектора (3,4,0) = 5');
  const brk = g([{ id: 'v', type: 'MakeVector', inputs: { x: 1, y: 2, z: 3 } },
                 { id: 'b', type: 'BreakVector' }],
                [D('v', 'vector', 'b', 'vector')]);
  brk.bind({});
  eq(brk._resolve('b', 'y'), 2, 'BreakVector.y');
}
{
  // Clamp и Lerp
  const graph = g([{ id: 'c', type: 'Clamp', inputs: { value: 15, min: 0, max: 10 } },
                   { id: 'l', type: 'Lerp', inputs: { a: 0, b: 100, t: 0.25 } }], []);
  graph.bind({});
  eq(graph._resolve('c', 'result'), 10, 'Clamp сверху');
  eq(graph._resolve('l', 'result'), 25, 'Lerp 25%');
}
{
  // Логика
  const graph = g([{ id: 'gt', type: 'Greater', inputs: { a: 5, b: 3 } },
                   { id: 'not', type: 'Not' }], [D('gt', 'result', 'not', 'a')]);
  graph.bind({});
  eq(graph._resolve('gt', 'result'), true, '5 > 3');
  eq(graph._resolve('not', 'result'), false, 'НЕ (5>3)');
}

console.log('— Семантика чистых узлов');
{
  // Как в Unreal: чистый узел пересчитывается на каждое обращение.
  // Это обязательно для циклов, где входы меняются в пределах кадра.
  const graph = g([{ id: 'get', type: 'GetVariable', props: { name: 'n' } },
                   { id: 'add', type: 'Add', inputs: { b: 0 } }],
                  [D('get', 'value', 'add', 'a')], { n: 1 });
  graph.bind({});
  eq(graph._resolve('add', 'result'), 1, 'первое чтение');
  graph.variables.n = 5;
  eq(graph._resolve('add', 'result'), 5, 'чистый узел видит изменившийся вход без нового кадра');
}
{
  // Обращение к выходу исполняемого узла возвращает результат его последнего запуска
  const graph = g(
    [{ id: 'ev', type: 'OnStart' },
     { id: 'set', type: 'SetVariable', props: { name: 'v' }, inputs: { value: 11 } },
     { id: 'copy', type: 'SetVariable', props: { name: 'echo' } }],
    [E('ev', 'out', 'set'), E('set', 'out', 'copy'), D('set', 'value', 'copy', 'value')]);
  graph.bind({});
  graph.trigger('start');
  eq(graph.variables.echo, 11, 'выход исполняемого узла доступен следующему в цепочке');
}

console.log('— Поток управления');
{
  // Branch: истина → ветка true
  const graph = g(
    [{ id: 'ev', type: 'OnStart' },
     { id: 'br', type: 'Branch', inputs: { condition: true } },
     { id: 'yes', type: 'SetVariable', props: { name: 'r' }, inputs: { value: 'да' } },
     { id: 'no', type: 'SetVariable', props: { name: 'r' }, inputs: { value: 'нет' } }],
    [E('ev', 'out', 'br'),
     { from: 'br', exec: 'true', to: 'yes', execIn: 'in' },
     { from: 'br', exec: 'false', to: 'no', execIn: 'in' }]);
  graph.bind({});
  graph.trigger('start');
  eq(graph.variables.r, 'да', 'Branch → true');

  const g2 = graph.clone();
  g2.nodes.get('br').inputs.condition = false;
  g2.bind({});
  g2.trigger('start');
  eq(g2.variables.r, 'нет', 'Branch → false');
}
{
  // Линейная цепочка из трёх действий
  const graph = g(
    [{ id: 'ev', type: 'OnStart' },
     { id: 's1', type: 'SetVariable', props: { name: 'a' }, inputs: { value: 1 } },
     { id: 's2', type: 'SetVariable', props: { name: 'b' }, inputs: { value: 2 } },
     { id: 's3', type: 'SetVariable', props: { name: 'c' }, inputs: { value: 3 } }],
    [E('ev', 'out', 's1'), E('s1', 'out', 's2'), E('s2', 'out', 's3')]);
  graph.bind({});
  graph.trigger('start');
  eq(graph.variables.a + graph.variables.b + graph.variables.c, 6, 'цепочка выполнилась целиком');
}
{
  // ForLoop: сумма 0..4 = 10
  const graph = g(
    [{ id: 'ev', type: 'OnStart' },
     { id: 'loop', type: 'ForLoop', inputs: { from: 0, to: 5 } },
     { id: 'get', type: 'GetVariable', props: { name: 'sum' } },
     { id: 'add', type: 'Add' },
     { id: 'set', type: 'SetVariable', props: { name: 'sum' } }],
    [E('ev', 'out', 'loop'),
     { from: 'loop', exec: 'body', to: 'set', execIn: 'in' },
     D('get', 'value', 'add', 'a'),
     D('loop', 'index', 'add', 'b'),
     D('add', 'result', 'set', 'value')],
    { sum: 0 });
  graph.bind({});
  graph.trigger('start');
  eq(graph.variables.sum, 10, 'ForLoop накопил 0+1+2+3+4');
}
{
  // Sequence выполняет все выходы
  const graph = g(
    [{ id: 'ev', type: 'OnStart' }, { id: 'seq', type: 'Sequence' },
     { id: 'a', type: 'SetVariable', props: { name: 'x' }, inputs: { value: 1 } },
     { id: 'b', type: 'SetVariable', props: { name: 'y' }, inputs: { value: 2 } },
     { id: 'c', type: 'SetVariable', props: { name: 'z' }, inputs: { value: 3 } }],
    [E('ev', 'out', 'seq'),
     { from: 'seq', exec: '0', to: 'a', execIn: 'in' },
     { from: 'seq', exec: '1', to: 'b', execIn: 'in' },
     { from: 'seq', exec: '2', to: 'c', execIn: 'in' }]);
  graph.bind({});
  graph.trigger('start');
  t(graph.variables.x === 1 && graph.variables.y === 2 && graph.variables.z === 3, 'Sequence запустил все три выхода');
}
{
  // DoOnce пропускает только первый вызов
  const graph = g(
    [{ id: 'ev', type: 'OnUpdate' }, { id: 'once', type: 'DoOnce' },
     { id: 'get', type: 'GetVariable', props: { name: 'n' } },
     { id: 'add', type: 'Add', inputs: { b: 1 } },
     { id: 'set', type: 'SetVariable', props: { name: 'n' } }],
    [E('ev', 'out', 'once'), E('once', 'out', 'set'),
     D('get', 'value', 'add', 'a'), D('add', 'result', 'set', 'value')],
    { n: 0 });
  graph.bind({});
  for (let i = 0; i < 5; i++) { graph.beginFrame(0.016, i * 0.016); graph.trigger('update'); }
  eq(graph.variables.n, 1, 'DoOnce сработал ровно один раз');
}
{
  // FlipFlop чередует A/B
  const graph = g(
    [{ id: 'ev', type: 'OnUpdate' }, { id: 'ff', type: 'FlipFlop' },
     { id: 'a', type: 'SetVariable', props: { name: 'last' }, inputs: { value: 'A' } },
     { id: 'b', type: 'SetVariable', props: { name: 'last' }, inputs: { value: 'B' } }],
    [E('ev', 'out', 'ff'),
     { from: 'ff', exec: 'A', to: 'a', execIn: 'in' },
     { from: 'ff', exec: 'B', to: 'b', execIn: 'in' }]);
  graph.bind({});
  graph.beginFrame(0, 0); graph.trigger('update');
  eq(graph.variables.last, 'A', 'FlipFlop первый вызов → A');
  graph.beginFrame(0, 0); graph.trigger('update');
  eq(graph.variables.last, 'B', 'FlipFlop второй вызов → B');
}
{
  // Gate закрыт
  const graph = g(
    [{ id: 'ev', type: 'OnStart' }, { id: 'gate', type: 'Gate', inputs: { open: false } },
     { id: 'set', type: 'SetVariable', props: { name: 'passed' }, inputs: { value: true } }],
    [E('ev', 'out', 'gate'), E('gate', 'out', 'set')], { passed: false });
  graph.bind({});
  graph.trigger('start');
  eq(graph.variables.passed, false, 'закрытый Gate не пропускает поток');
}
{
  // Delay откладывает продолжение
  const graph = g(
    [{ id: 'ev', type: 'OnStart' }, { id: 'd', type: 'Delay', inputs: { seconds: 0.5 } },
     { id: 'set', type: 'SetVariable', props: { name: 'fired' }, inputs: { value: true } }],
    [E('ev', 'out', 'd'), E('d', 'out', 'set')], { fired: false });
  graph.bind({});
  graph.trigger('start');
  eq(graph.variables.fired, false, 'Delay не выполняется сразу');
  graph.tickTimers(0.3);
  eq(graph.variables.fired, false, 'Delay ждёт полное время');
  graph.tickTimers(0.3);
  eq(graph.variables.fired, true, 'Delay сработал после 0.6 с');
  eq(graph._timers.length, 0, 'таймер удалён после срабатывания');
}

console.log('— Защита от зацикливания');
{
  // Узел, ведущий сам в себя по exec
  const graph = g(
    [{ id: 'ev', type: 'OnStart' }, { id: 'a', type: 'SetVariable', props: { name: 'k' }, inputs: { value: 1 } }],
    [E('ev', 'out', 'a'), E('a', 'out', 'a')]);
  graph.bind({});
  const t0 = Date.now();
  graph.trigger('start');
  t(Date.now() - t0 < 3000, 'бесконечный exec-цикл прерван по лимиту шагов');
  t(graph.errors.length > 0, 'зацикливание записано в ошибки');
}
{
  // Циклическая зависимость данных не приводит к переполнению стека
  const graph = g([{ id: 'a', type: 'Add' }, { id: 'b', type: 'Add' }],
                  [D('a', 'result', 'b', 'a'), D('b', 'result', 'a', 'a')]);
  graph.bind({});
  let threw = false;
  try { graph._resolve('a', 'result'); } catch { threw = true; }
  t(!threw, 'цикл данных не роняет исполнитель');
}
{
  // Ошибка внутри узла ловится
  const graph = g([{ id: 'ev', type: 'OnStart' }, { id: 'p', type: 'Print' }], [E('ev', 'out', 'p')]);
  graph.bind({ log: () => { throw new Error('сломанный лог'); } });
  let threw = false;
  try { graph.trigger('start'); } catch { threw = true; }
  t(!threw, 'исключение узла перехвачено');
  t(graph.errors.length > 0, 'ошибка узла записана');
}

console.log('— Редактирование графа');
{
  const graph = new BlueprintGraph();
  const n1 = graph.addNode('OnStart', 10, 20);
  const n2 = graph.addNode('Print', 200, 20);
  t(n1.id !== n2.id, 'id узлов уникальны');
  eq(graph.nodes.size, 2, 'два узла добавлены');
  eq(n2.inputs.value, 'Привет', 'значения входов взяты из default');
  graph.connect(n1.id, 'out', n2.id, 'in', true);
  eq(graph.links.length, 1, 'exec-связь создана');
  // Повторное подключение того же выхода заменяет старую связь
  const n3 = graph.addNode('Print', 400, 20);
  graph.connect(n1.id, 'out', n3.id, 'in', true);
  eq(graph.links.length, 1, 'exec-выход держит только одну связь');
  eq(graph.links[0].to, n3.id, 'новая связь заменила старую');
  // Вход данных тоже одиночный
  const num1 = graph.addNode('Number');
  const num2 = graph.addNode('Number');
  graph.connect(num1.id, 'value', n3.id, 'value');
  graph.connect(num2.id, 'value', n3.id, 'value');
  eq(graph.links.filter((l) => l.in === 'value' && l.to === n3.id).length, 1, 'вход данных принимает одну связь');
  // Удаление узла чистит связи
  graph.removeNode(n3.id);
  t(!graph.links.some((l) => l.from === n3.id || l.to === n3.id), 'связи удалённого узла убраны');
  // Самоподключение запрещено
  t(graph.connect(n1.id, 'out', n1.id, 'in', true) === null, 'узел нельзя соединить сам с собой');
  let threw = false;
  try { graph.addNode('НетТакогоТипа'); } catch { threw = true; }
  t(threw, 'добавление неизвестного узла бросает ошибку');
}

console.log('— Сериализация');
{
  const graph = new BlueprintGraph();
  const ev = graph.addNode('OnUpdate', 0, 0);
  const set = graph.addNode('SetVariable', 250, 0);
  set.props.name = 'счёт';
  set.inputs.value = 42;
  graph.connect(ev.id, 'out', set.id, 'in', true);
  graph.variables['счёт'] = 0;

  const json = JSON.stringify(graph.toJSON());
  const back = new BlueprintGraph(JSON.parse(json));
  eq(back.nodes.size, graph.nodes.size, 'round-trip: число узлов');
  eq(back.links.length, graph.links.length, 'round-trip: число связей');
  eq(back.nodes.get(set.id).props.name, 'счёт', 'round-trip: кириллица в свойствах');
  eq(back.nodes.get(set.id).inputs.value, 42, 'round-trip: значения входов');
  eq(JSON.stringify(back.toJSON()), json, 'round-trip стабилен побайтово');

  back.bind({});
  back.beginFrame(0.016, 0);
  back.trigger('update');
  eq(back.variables['счёт'], 42, 'восстановленный граф выполняется');
}
{
  // Битые данные не роняют загрузку
  const graph = new BlueprintGraph('это не json');
  eq(graph.nodes.size, 0, 'мусорная строка → пустой граф');
  const g2 = new BlueprintGraph({ nodes: [{ id: 'x', type: 'ЧтоТо' }], links: [] });
  t(g2.validate().some((p) => p.includes('ЧтоТо')), 'validate находит неизвестный узел');
  const g3 = new BlueprintGraph({ nodes: [{ id: 'a', type: 'Print' }], links: [{ from: 'a', exec: 'out', to: 'нет', execIn: 'in' }] });
  t(g3.validate().some((p) => p.includes('никуда')), 'validate находит висячую связь');
  const g4 = new BlueprintGraph({ nodes: [{ id: 'a', type: 'Print' }], links: [] });
  t(g4.validate().some((p) => p.includes('события')), 'validate предупреждает об отсутствии события');
  t(new BlueprintGraph().validate().length === 0, 'пустой граф валиден');
}
{
  // Неизвестный узел в цепочке просто обрывает её, не роняя игру
  const graph = g([{ id: 'ev', type: 'OnStart' }, { id: 'x', type: 'Мусор' },
                   { id: 's', type: 'SetVariable', props: { name: 'v' }, inputs: { value: 1 } }],
                  [E('ev', 'out', 'x'), E('x', 'out', 's')]);
  graph.bind({});
  let threw = false;
  try { graph.trigger('start'); } catch { threw = true; }
  t(!threw, 'неизвестный узел не роняет выполнение');
}

console.log('— Компонент Blueprint в сцене');
{
  t(ComponentRegistry.has('Blueprint'), 'Blueprint зарегистрирован в реестре компонентов');

  const scene = new Scene('bp-test');
  const graph = new BlueprintGraph();
  const ev = graph.addNode('OnStart');
  const move = graph.addNode('SetPosition');
  const vec = graph.addNode('MakeVector');
  vec.inputs = { x: 1, y: 2, z: 3 };
  graph.connect(ev.id, 'out', move.id, 'in', true);
  graph.connect(vec.id, 'vector', move.id, 'position');

  const go = scene.createGameObject('Робот', {
    components: [[Blueprint, { graphName: 'Движение', graphData: JSON.stringify(graph.toJSON()) }]],
  });
  const bp = go.getComponent('Blueprint');
  t(bp instanceof Blueprint, 'компонент добавлен на объект');

  boot(scene);
  const p = go.transform.position;
  t(Math.abs(p.x - 1) < 1e-6 && Math.abs(p.y - 2) < 1e-6 && Math.abs(p.z - 3) < 1e-6,
    `граф переместил объект (получено ${p.x},${p.y},${p.z})`);

  // Сериализация сцены сохраняет граф
  const data = scene.serialize();
  const scene2 = Scene.deserialize(data);
  const go2 = scene2.find('Робот');
  const bp2 = go2?.getComponent('Blueprint');
  t(!!bp2, 'компонент выжил после сериализации сцены');
  eq(bp2.graphName, 'Движение', 'имя графа сохранилось');
  t(bp2.graph instanceof BlueprintGraph, 'граф пересобран при десериализации');
  eq(bp2.graph.nodes.size, 3, 'узлы графа восстановлены');
  boot(scene2);
  const p2 = go2.transform.position;
  t(Math.abs(p2.x - 1) < 1e-6 && Math.abs(p2.z - 3) < 1e-6, 'восстановленный граф работает');
  t(bp2.error === null, 'ошибок компиляции нет');
}
{
  // Каждый кадр: узел Rotate поворачивает объект
  const scene = new Scene('bp-update');
  const graph = new BlueprintGraph();
  const ev = graph.addNode('OnUpdate');
  const rot = graph.addNode('Rotate');
  rot.inputs = { y: 90 };
  graph.connect(ev.id, 'out', rot.id, 'in', true);

  const go = scene.createGameObject('Вертушка', {
    components: [[Blueprint, { graphData: JSON.stringify(graph.toJSON()) }]],
  });
  scene.load();
  scene.update(0.016); // start + первый update в одном кадре
  t(Math.abs(go.transform.localEulerAngles.y - 90) < 1e-3,
    `OnUpdate повернул объект (${go.transform.localEulerAngles.y})`);
}
{
  // Взаимодействие с другим компонентом: урон по здоровью
  const scene = new Scene('bp-health');
  const graph = new BlueprintGraph();
  const ev = graph.addNode('OnStart');
  const dmg = graph.addNode('ApplyDamage');
  dmg.inputs = { amount: 30 };
  graph.connect(ev.id, 'out', dmg.id, 'in', true);

  const go = scene.createGameObject('Цель', {
    components: [Health, [Blueprint, { graphData: JSON.stringify(graph.toJSON()) }]],
  });
  boot(scene);
  eq(go.getComponent(Health).currentHealth, 70, 'узел ApplyDamage снял 30 HP');
}
{
  // Пустой граф безопасен
  const scene = new Scene('bp-empty');
  const go = scene.createGameObject('Пустой', { components: [Blueprint] });
  boot(scene);
  scene.update(0.016);
  ok++; // дошли сюда без исключения
  t(go.getComponent(Blueprint).error === null, 'пустой граф не даёт ошибок');
}
{
  // Поиск объектов из графа
  const scene = new Scene('bp-find');
  scene.createGameObject('Игрок', { position: [5, 0, 0], tag: 'Player' });
  const graph = new BlueprintGraph();
  const ev = graph.addNode('OnStart');
  const find = graph.addNode('FindByTag');
  find.props.tag = 'Player';
  const getPos = graph.addNode('GetPosition');
  const setPos = graph.addNode('SetPosition');
  graph.connect(ev.id, 'out', setPos.id, 'in', true);
  graph.connect(find.id, 'object', getPos.id, 'target');
  graph.connect(getPos.id, 'position', setPos.id, 'position');
  const go = scene.createGameObject('Тень', {
    components: [[Blueprint, { graphData: JSON.stringify(graph.toJSON()) }]],
  });
  boot(scene);
  eq(go.transform.position.x, 5, 'граф нашёл объект по тегу и скопировал позицию');
}
{
  // Переменные графа сохраняются в JSON
  const graph = new BlueprintGraph({ nodes: [], links: [], variables: { счёт: 7, имя: 'Игрок' } });
  const back = new BlueprintGraph(JSON.parse(JSON.stringify(graph.toJSON())));
  eq(back.variables['счёт'], 7, 'числовая переменная сохранена');
  eq(back.variables['имя'], 'Игрок', 'строковая переменная сохранена');
}
{
  // resetRuntime возвращает DoOnce в исходное состояние
  const graph = g([{ id: 'ev', type: 'OnUpdate' }, { id: 'once', type: 'DoOnce' },
                   { id: 's', type: 'SetVariable', props: { name: 'n' }, inputs: { value: 1 } }],
                  [E('ev', 'out', 'once'), E('once', 'out', 's')], { n: 0 });
  graph.bind({});
  graph.trigger('update');
  graph.variables.n = 0;
  graph.trigger('update');
  eq(graph.variables.n, 0, 'DoOnce закрыт');
  graph.resetRuntime();
  graph.trigger('update');
  eq(graph.variables.n, 1, 'после resetRuntime DoOnce снова открыт');
}

console.log('— Статистика графа');
{
  const graph = new BlueprintGraph();
  graph.addNode('OnStart');
  graph.addNode('OnUpdate');
  graph.variables.x = 1;
  const s = graph.stats;
  eq(s.nodes, 2, 'stats.nodes');
  eq(s.variables, 1, 'stats.variables');
  t(s.events.includes('start') && s.events.includes('update'), 'stats.events перечисляет события');
}

console.log(`Итого: ${ok} ok, ${bad} ошибок`);
if (bad > 0) process.exit(1);
