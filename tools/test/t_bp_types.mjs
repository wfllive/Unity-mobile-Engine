// Проверка совместимости типов пинов и защиты graph.connect().
// Раньше в вход number можно было воткнуть string — ошибка всплывала только
// в рантайме странным поведением. Теперь несовместимое соединение не создаётся.
import { BlueprintGraph } from '../../src/engine/blueprint/graph.js';
import { canConnectTypes, pinType, PIN_TYPE_LABELS } from '../../src/engine/blueprint/nodes.js';

let pass = 0; let fail = 0;
const t = (cond, msg) => { if (cond) pass++; else { fail++; console.error(`  ✗ ${msg}`); } };

console.log('— Матрица типов');
{
  // Совпадающие типы
  for (const ty of ['number', 'string', 'boolean', 'vector', 'object']) {
    t(canConnectTypes(ty, ty).ok, `${ty} → ${ty} должно быть разрешено`);
    t(!canConnectTypes(ty, ty).cast, `${ty} → ${ty} не должно требовать приведения`);
  }
  // any совместим в обе стороны
  for (const ty of ['number', 'string', 'boolean', 'vector', 'object']) {
    t(canConnectTypes('any', ty).ok, `any → ${ty} должно быть разрешено`);
    t(canConnectTypes(ty, 'any').ok, `${ty} → any должно быть разрешено`);
  }
  // Приведение скаляров
  t(canConnectTypes('number', 'string').cast, 'число → строка должно помечаться как приведение');
  t(canConnectTypes('boolean', 'number').cast, 'да/нет → число должно помечаться как приведение');
  t(canConnectTypes('number', 'boolean').cast, 'число → да/нет должно помечаться как приведение');
  // Несовместимые
  t(!canConnectTypes('vector', 'number').ok, 'вектор → число должно быть запрещено');
  t(!canConnectTypes('object', 'vector').ok, 'объект → вектор должно быть запрещено');
  t(!canConnectTypes('string', 'vector').ok, 'строка → вектор должно быть запрещено');
  t(!canConnectTypes('vector', 'object').ok, 'вектор → объект должно быть запрещено');
  // exec живёт отдельно
  t(canConnectTypes('exec', 'exec').ok, 'поток → поток должно быть разрешено');
  t(!canConnectTypes('exec', 'number').ok, 'поток → число должно быть запрещено');
  t(!canConnectTypes('number', 'exec').ok, 'число → поток должно быть запрещено');
  // Причина отказа — человекочитаемая
  t(/Несовместимые типы/.test(canConnectTypes('vector', 'number').reason),
    'у отказа должна быть внятная причина');
  t(PIN_TYPE_LABELS.number === 'число', 'подпись типа number должна быть русской');
}

console.log('— pinType по каталогу');
{
  t(pinType('Multiply', 'in', 'a') === 'number', 'вход a у Multiply — число');
  t(pinType('Multiply', 'out', 'result') === 'number', 'выход result у Multiply — число');
  t(pinType('НетТакогоУзла', 'in', 'x') === null, 'неизвестный узел → null');
}

console.log('— graph.connect не создаёт несовместимые связи');
{
  const g = new BlueprintGraph();
  const vec = g.addNode('MakeVector', 0, 0);
  const mul = g.addNode('Multiply', 200, 0);
  const before = g.links.length;
  const link = g.connect(vec.id, 'vector', mul.id, 'a');
  t(link === null, 'вектор во вход-число не должен соединяться');
  t(g.links.length === before, 'несовместимая связь не должна попадать в граф');

  // Совместимое — соединяется
  const n1 = g.addNode('Number', 0, 200);
  const okLink = g.connect(n1.id, 'value', mul.id, 'a');
  t(okLink !== null, 'число во вход-число должно соединяться');
  t(g.links.length === before + 1, 'корректная связь должна попадать в граф');
}

console.log('— checkConnection как предпросмотр');
{
  const g = new BlueprintGraph();
  const vec = g.addNode('MakeVector', 0, 0);
  const mul = g.addNode('Multiply', 200, 0);
  const n1 = g.addNode('Number', 0, 200);

  const bad = g.checkConnection(vec.id, 'vector', mul.id, 'a');
  t(!bad.ok, 'checkConnection должен отклонить вектор → число');
  t(g.links.length === 0, 'checkConnection не должен менять граф');

  const good = g.checkConnection(n1.id, 'value', mul.id, 'a');
  t(good.ok, 'checkConnection должен разрешить число → число');

  const self = g.checkConnection(mul.id, 'result', mul.id, 'a');
  t(!self.ok, 'checkConnection должен отклонить самосоединение');

  const missing = g.checkConnection('нет', 'value', mul.id, 'a');
  t(!missing.ok, 'checkConnection должен отклонить несуществующий узел');

  // exec не проверяется по типам данных
  const ev = g.addNode('OnStart', 0, 400);
  const pr = g.addNode('Print', 200, 400);
  t(g.checkConnection(ev.id, 'out', pr.id, 'in', true).ok, 'exec-связь должна разрешаться');
}

console.log('— exec-связи по-прежнему работают');
{
  const g = new BlueprintGraph();
  const ev = g.addNode('OnStart', 0, 0);
  const pr = g.addNode('Print', 200, 0);
  t(g.connect(ev.id, 'out', pr.id, 'in', true) !== null, 'exec должен соединяться');
  t(g.links.length === 1, 'exec-связь должна попасть в граф');
}

console.log(`\nИтого: ${pass} ok, ${fail} ошибок`);
process.exit(fail ? 1 : 0);
