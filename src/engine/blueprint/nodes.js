// WFL Engine — каталог узлов визуального программирования (Blueprints).
//
// Узлы бывают двух видов:
//   • «чистые» (pure) — только считают значения, метод evaluate(inp, ctx, node)
//     возвращает объект выходов. Вызываются лениво, когда значение кому-то нужно.
//   • исполняемые — имеют exec-входы/выходы, метод run(ctx, inp, node, graph)
//     возвращает имя следующего exec-пина (или undefined = 'out') либо
//     объект { next, out } — где out кладётся в кеш выходов узла.
//
// Типы пинов: exec | number | string | boolean | vector | object | any
import * as THREE from 'three';
import { Mathf } from '../core/math.js';

/** @type {Map<string, object>} */
export const NodeRegistry = new Map();

/** Зарегистрировать тип узла */
export function defineNode(type, def) {
  const node = {
    type,
    title: def.title ?? type,
    category: def.category ?? 'Прочее',
    pure: !!def.pure,
    // Пины
    execIn: def.execIn ?? (def.pure ? [] : ['in']),
    execOut: def.execOut ?? (def.pure ? [] : ['out']),
    inputs: def.inputs ?? [],
    outputs: def.outputs ?? [],
    // Свойства, редактируемые прямо в узле
    props: def.props ?? {},
    event: def.event ?? null,
    color: def.color ?? null,
    desc: def.desc ?? '',
    evaluate: def.evaluate,
    run: def.run,
  };
  NodeRegistry.set(type, node);
  return node;
}

export function getNodeDef(type) {
  return NodeRegistry.get(type);
}

/* =======================================================================
   СОВМЕСТИМОСТЬ ТИПОВ ПИНОВ
   =======================================================================
   Матрица «из чего → во что» можно соединять. Значение:
     'ok'   — типы совпадают, соединяем молча;
     'cast' — допустимо с неявным приведением (предупреждаем, но разрешаем);
     null   — соединять нельзя.
   'any' совместим со всем в обе стороны — это осознанно «дикий» тип. */
const TYPE_CAST = {
  number:  { number: 'ok', boolean: 'cast', string: 'cast', any: 'ok' },
  string:  { string: 'ok', any: 'ok', number: 'cast', boolean: 'cast' },
  boolean: { boolean: 'ok', number: 'cast', string: 'cast', any: 'ok' },
  vector:  { vector: 'ok', any: 'ok' },
  object:  { object: 'ok', any: 'ok' },
  any:     { number: 'ok', string: 'ok', boolean: 'ok', vector: 'ok', object: 'ok', any: 'ok' },
};

export const PIN_TYPE_LABELS = {
  number: 'число', string: 'строка', boolean: 'да/нет',
  vector: 'вектор', object: 'объект', any: 'любой', exec: 'поток',
};

/**
 * Можно ли соединить выход типа `from` со входом типа `to`.
 * @returns {{ok: boolean, cast: boolean, reason: string}}
 */
export function canConnectTypes(from, to) {
  const a = from ?? 'any';
  const b = to ?? 'any';
  if (a === 'exec' || b === 'exec') {
    return a === b
      ? { ok: true, cast: false, reason: '' }
      : { ok: false, cast: false, reason: 'Поток выполнения нельзя соединить со значением' };
  }
  const verdict = TYPE_CAST[a]?.[b] ?? null;
  if (verdict === 'ok') return { ok: true, cast: false, reason: '' };
  if (verdict === 'cast') {
    return {
      ok: true,
      cast: true,
      reason: `${PIN_TYPE_LABELS[a] ?? a} → ${PIN_TYPE_LABELS[b] ?? b}: значение будет приведено`,
    };
  }
  return {
    ok: false,
    cast: false,
    reason: `Несовместимые типы: ${PIN_TYPE_LABELS[a] ?? a} → ${PIN_TYPE_LABELS[b] ?? b}`,
  };
}

/** Тип конкретного пина узла. kind: 'in' | 'out' */
export function pinType(nodeType, kind, pinName) {
  const def = getNodeDef(nodeType);
  if (!def) return null;
  const list = kind === 'out' ? def.outputs : def.inputs;
  return list?.find((p) => p.name === pinName)?.type ?? null;
}

/** Цвета категорий — используются и в редакторе, и в легенде */
export const CATEGORY_COLORS = {
  'События': '#b3402f',
  'Поток': '#4a5568',
  'Математика': '#2f7a52',
  'Логика': '#2f6b7a',
  'Вектор': '#7a5c2f',
  'Трансформ': '#3b5bdb',
  'Объект': '#6741d9',
  'Физика': '#0b7285',
  'Игровое': '#a61e4d',
  'Переменные': '#5f3dc4',
  'Ввод': '#c2255c',
  'Отладка': '#495057',
  'Прочее': '#495057',
};

const V = (v) => (v?.isVector3 ? v : new THREE.Vector3(v?.x ?? 0, v?.y ?? 0, v?.z ?? 0));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/* =======================================================================
   СОБЫТИЯ — точки входа графа
   ======================================================================= */
defineNode('OnStart', {
  title: 'При старте', category: 'События', event: 'start',
  execIn: [], execOut: ['out'],
  desc: 'Срабатывает один раз при запуске объекта',
});

defineNode('OnUpdate', {
  title: 'Каждый кадр', category: 'События', event: 'update',
  execIn: [], execOut: ['out'],
  outputs: [{ name: 'dt', type: 'number', label: 'Δt' }],
  desc: 'Срабатывает каждый кадр',
});

defineNode('OnFixedUpdate', {
  title: 'Физический шаг', category: 'События', event: 'fixedUpdate',
  execIn: [], execOut: ['out'],
  outputs: [{ name: 'dt', type: 'number', label: 'Δt' }],
});

defineNode('OnCollision', {
  title: 'При столкновении', category: 'События', event: 'collisionEnter',
  execIn: [], execOut: ['out'],
  outputs: [{ name: 'other', type: 'object', label: 'Объект' }],
});

defineNode('OnTrigger', {
  title: 'При триггере', category: 'События', event: 'triggerEnter',
  execIn: [], execOut: ['out'],
  outputs: [{ name: 'other', type: 'object', label: 'Объект' }],
});

defineNode('OnDestroy', {
  title: 'При уничтожении', category: 'События', event: 'destroy',
  execIn: [], execOut: ['out'],
});

defineNode('OnKeyDown', {
  title: 'Нажата клавиша', category: 'События', event: 'update',
  execIn: [], execOut: ['out'],
  props: { key: { type: 'string', default: 'Space', label: 'Клавиша' } },
  // Событие приходит каждый кадр, но пропускаем дальше только по факту нажатия
  run(ctx, inp, node) {
    const input = ctx.engine?.input;
    if (!input) return null;
    const code = node.props?.key || 'Space';
    const name = /^[A-Za-z]$/.test(code) ? `Key${code.toUpperCase()}`
      : code === 'Space' ? 'Space' : code;
    return input.getKeyDown?.(name) ? 'out' : null;
  },
});

/* =======================================================================
   ПОТОК УПРАВЛЕНИЯ
   ======================================================================= */
defineNode('Branch', {
  title: 'Ветвление', category: 'Поток',
  execOut: ['true', 'false'],
  inputs: [{ name: 'condition', type: 'boolean', label: 'Условие', default: false }],
  run(ctx, inp) { return inp.condition ? 'true' : 'false'; },
});

defineNode('Sequence', {
  title: 'Последовательность', category: 'Поток',
  execOut: ['0', '1', '2'],
  run() { return ['0', '1', '2']; }, // массив = выполнить все по очереди
});

defineNode('ForLoop', {
  title: 'Цикл', category: 'Поток',
  execOut: ['body', 'done'],
  inputs: [
    { name: 'from', type: 'number', label: 'От', default: 0 },
    { name: 'to', type: 'number', label: 'До', default: 5 },
  ],
  outputs: [{ name: 'index', type: 'number', label: 'Индекс' }],
  run(ctx, inp, node, graph) {
    const from = Math.floor(num(inp.from));
    const to = Math.floor(num(inp.to));
    for (let i = from; i < to; i++) {
      graph._setOut(node.id, 'index', i);
      graph._runExec(node.id, 'body');
    }
    return 'done';
  },
});

defineNode('DoOnce', {
  title: 'Только один раз', category: 'Поток',
  run(ctx, inp, node, graph) {
    const s = graph._state(node.id);
    if (s.done) return null;
    s.done = true;
    return 'out';
  },
});

defineNode('FlipFlop', {
  title: 'Переключатель', category: 'Поток',
  execOut: ['A', 'B'],
  run(ctx, inp, node, graph) {
    const s = graph._state(node.id);
    s.flag = !s.flag;
    return s.flag ? 'A' : 'B';
  },
});

defineNode('Delay', {
  title: 'Задержка', category: 'Поток',
  inputs: [{ name: 'seconds', type: 'number', label: 'Секунды', default: 1 }],
  run(ctx, inp, node, graph) {
    graph._schedule(num(inp.seconds), node.id, 'out');
    return null; // продолжение произойдёт позже
  },
});

defineNode('Gate', {
  title: 'Клапан', category: 'Поток',
  inputs: [{ name: 'open', type: 'boolean', label: 'Открыт', default: true }],
  run(ctx, inp) { return inp.open ? 'out' : null; },
});

/* =======================================================================
   МАТЕМАТИКА (чистые узлы)
   ======================================================================= */
const mathBinary = (type, title, fn, defB = 0) => defineNode(type, {
  title, category: 'Математика', pure: true,
  inputs: [
    { name: 'a', type: 'number', label: 'A', default: 0 },
    { name: 'b', type: 'number', label: 'B', default: defB },
  ],
  outputs: [{ name: 'result', type: 'number', label: '' }],
  evaluate: (i) => ({ result: fn(num(i.a), num(i.b)) }),
});

mathBinary('Add', 'Сложить', (a, b) => a + b);
mathBinary('Subtract', 'Вычесть', (a, b) => a - b);
mathBinary('Multiply', 'Умножить', (a, b) => a * b, 1);
mathBinary('Divide', 'Разделить', (a, b) => (b === 0 ? 0 : a / b), 1);
mathBinary('Min', 'Минимум', Math.min);
mathBinary('Max', 'Максимум', Math.max);
mathBinary('Power', 'Степень', (a, b) => a ** b, 2);
mathBinary('Modulo', 'Остаток', (a, b) => (b === 0 ? 0 : a % b), 1);

const mathUnary = (type, title, fn) => defineNode(type, {
  title, category: 'Математика', pure: true,
  inputs: [{ name: 'a', type: 'number', label: '', default: 0 }],
  outputs: [{ name: 'result', type: 'number', label: '' }],
  evaluate: (i) => ({ result: fn(num(i.a)) }),
});

mathUnary('Sin', 'Синус', (a) => Math.sin(a));
mathUnary('Cos', 'Косинус', (a) => Math.cos(a));
mathUnary('Abs', 'Модуль', Math.abs);
mathUnary('Sqrt', 'Корень', (a) => Math.sqrt(Math.max(0, a)));
mathUnary('Negate', 'Минус', (a) => -a);
mathUnary('Round', 'Округлить', Math.round);

defineNode('Clamp', {
  title: 'Ограничить', category: 'Математика', pure: true,
  inputs: [
    { name: 'value', type: 'number', label: 'Значение', default: 0 },
    { name: 'min', type: 'number', label: 'Мин', default: 0 },
    { name: 'max', type: 'number', label: 'Макс', default: 1 },
  ],
  outputs: [{ name: 'result', type: 'number', label: '' }],
  evaluate: (i) => ({ result: Mathf.clamp(num(i.value), num(i.min), num(i.max)) }),
});

defineNode('Lerp', {
  title: 'Интерполяция', category: 'Математика', pure: true,
  inputs: [
    { name: 'a', type: 'number', label: 'A', default: 0 },
    { name: 'b', type: 'number', label: 'B', default: 1 },
    { name: 't', type: 'number', label: 'T', default: 0.5 },
  ],
  outputs: [{ name: 'result', type: 'number', label: '' }],
  evaluate: (i) => ({ result: Mathf.lerp(num(i.a), num(i.b), num(i.t)) }),
});

defineNode('RandomFloat', {
  title: 'Случайное число', category: 'Математика', pure: true,
  inputs: [
    { name: 'min', type: 'number', label: 'Мин', default: 0 },
    { name: 'max', type: 'number', label: 'Макс', default: 1 },
  ],
  outputs: [{ name: 'result', type: 'number', label: '' }],
  evaluate: (i) => ({ result: num(i.min) + Math.random() * (num(i.max) - num(i.min)) }),
});

defineNode('DeltaTime', {
  title: 'Время кадра', category: 'Математика', pure: true,
  outputs: [{ name: 'dt', type: 'number', label: 'Δt' }],
  evaluate: (i, ctx) => ({ dt: ctx.dt ?? 0 }),
});

defineNode('ElapsedTime', {
  title: 'Время с начала', category: 'Математика', pure: true,
  outputs: [{ name: 'time', type: 'number', label: 'Сек' }],
  evaluate: (i, ctx) => ({ time: ctx.time ?? 0 }),
});

/* =======================================================================
   ЛОГИКА
   ======================================================================= */
const cmp = (type, title, fn) => defineNode(type, {
  title, category: 'Логика', pure: true,
  inputs: [
    { name: 'a', type: 'number', label: 'A', default: 0 },
    { name: 'b', type: 'number', label: 'B', default: 0 },
  ],
  outputs: [{ name: 'result', type: 'boolean', label: '' }],
  evaluate: (i) => ({ result: fn(num(i.a), num(i.b)) }),
});

cmp('Greater', 'Больше (>)', (a, b) => a > b);
cmp('Less', 'Меньше (<)', (a, b) => a < b);
cmp('GreaterEqual', 'Больше или равно', (a, b) => a >= b);
cmp('Equal', 'Равно (=)', (a, b) => Math.abs(a - b) < 1e-6);

defineNode('And', {
  title: 'И', category: 'Логика', pure: true,
  inputs: [
    { name: 'a', type: 'boolean', label: 'A', default: false },
    { name: 'b', type: 'boolean', label: 'B', default: false },
  ],
  outputs: [{ name: 'result', type: 'boolean', label: '' }],
  evaluate: (i) => ({ result: !!i.a && !!i.b }),
});

defineNode('Or', {
  title: 'ИЛИ', category: 'Логика', pure: true,
  inputs: [
    { name: 'a', type: 'boolean', label: 'A', default: false },
    { name: 'b', type: 'boolean', label: 'B', default: false },
  ],
  outputs: [{ name: 'result', type: 'boolean', label: '' }],
  evaluate: (i) => ({ result: !!i.a || !!i.b }),
});

defineNode('Not', {
  title: 'НЕ', category: 'Логика', pure: true,
  inputs: [{ name: 'a', type: 'boolean', label: '', default: false }],
  outputs: [{ name: 'result', type: 'boolean', label: '' }],
  evaluate: (i) => ({ result: !i.a }),
});

/* =======================================================================
   ЛИТЕРАЛЫ И ПЕРЕМЕННЫЕ
   ======================================================================= */
defineNode('Number', {
  title: 'Число', category: 'Переменные', pure: true,
  props: { value: { type: 'number', default: 0, label: '' } },
  outputs: [{ name: 'value', type: 'number', label: '' }],
  evaluate: (i, ctx, node) => ({ value: num(node.props?.value) }),
});

defineNode('String', {
  title: 'Текст', category: 'Переменные', pure: true,
  props: { value: { type: 'string', default: '', label: '' } },
  outputs: [{ name: 'value', type: 'string', label: '' }],
  evaluate: (i, ctx, node) => ({ value: String(node.props?.value ?? '') }),
});

defineNode('Boolean', {
  title: 'Логическое', category: 'Переменные', pure: true,
  props: { value: { type: 'boolean', default: true, label: '' } },
  outputs: [{ name: 'value', type: 'boolean', label: '' }],
  evaluate: (i, ctx, node) => ({ value: !!node.props?.value }),
});

defineNode('GetVariable', {
  title: 'Взять переменную', category: 'Переменные', pure: true,
  props: { name: { type: 'string', default: 'счёт', label: 'Имя' } },
  outputs: [{ name: 'value', type: 'any', label: '' }],
  evaluate: (i, ctx, node) => ({ value: ctx.vars?.[node.props?.name] ?? 0 }),
});

defineNode('SetVariable', {
  title: 'Задать переменную', category: 'Переменные',
  props: { name: { type: 'string', default: 'счёт', label: 'Имя' } },
  inputs: [{ name: 'value', type: 'any', label: 'Значение', default: 0 }],
  outputs: [{ name: 'value', type: 'any', label: '' }],
  run(ctx, inp, node) {
    if (ctx.vars) ctx.vars[node.props?.name] = inp.value;
    return { next: 'out', out: { value: inp.value } };
  },
});

/* =======================================================================
   ВЕКТОРЫ
   ======================================================================= */
defineNode('MakeVector', {
  title: 'Собрать вектор', category: 'Вектор', pure: true,
  inputs: [
    { name: 'x', type: 'number', label: 'X', default: 0 },
    { name: 'y', type: 'number', label: 'Y', default: 0 },
    { name: 'z', type: 'number', label: 'Z', default: 0 },
  ],
  outputs: [{ name: 'vector', type: 'vector', label: '' }],
  evaluate: (i) => ({ vector: new THREE.Vector3(num(i.x), num(i.y), num(i.z)) }),
});

defineNode('BreakVector', {
  title: 'Разобрать вектор', category: 'Вектор', pure: true,
  inputs: [{ name: 'vector', type: 'vector', label: '' }],
  outputs: [
    { name: 'x', type: 'number', label: 'X' },
    { name: 'y', type: 'number', label: 'Y' },
    { name: 'z', type: 'number', label: 'Z' },
  ],
  evaluate: (i) => { const v = V(i.vector); return { x: v.x, y: v.y, z: v.z }; },
});

defineNode('VectorAdd', {
  title: 'Сложить векторы', category: 'Вектор', pure: true,
  inputs: [
    { name: 'a', type: 'vector', label: 'A' },
    { name: 'b', type: 'vector', label: 'B' },
  ],
  outputs: [{ name: 'result', type: 'vector', label: '' }],
  evaluate: (i) => ({ result: V(i.a).clone().add(V(i.b)) }),
});

defineNode('VectorScale', {
  title: 'Умножить вектор', category: 'Вектор', pure: true,
  inputs: [
    { name: 'vector', type: 'vector', label: 'Вектор' },
    { name: 'scale', type: 'number', label: 'Множитель', default: 1 },
  ],
  outputs: [{ name: 'result', type: 'vector', label: '' }],
  evaluate: (i) => ({ result: V(i.vector).clone().multiplyScalar(num(i.scale)) }),
});

defineNode('VectorLength', {
  title: 'Длина вектора', category: 'Вектор', pure: true,
  inputs: [{ name: 'vector', type: 'vector', label: '' }],
  outputs: [{ name: 'length', type: 'number', label: '' }],
  evaluate: (i) => ({ length: V(i.vector).length() }),
});

defineNode('VectorNormalize', {
  title: 'Нормализовать', category: 'Вектор', pure: true,
  inputs: [{ name: 'vector', type: 'vector', label: '' }],
  outputs: [{ name: 'result', type: 'vector', label: '' }],
  evaluate: (i) => ({ result: V(i.vector).clone().normalize() }),
});

defineNode('Distance', {
  title: 'Расстояние', category: 'Вектор', pure: true,
  inputs: [
    { name: 'a', type: 'vector', label: 'A' },
    { name: 'b', type: 'vector', label: 'B' },
  ],
  outputs: [{ name: 'distance', type: 'number', label: '' }],
  evaluate: (i) => ({ distance: V(i.a).distanceTo(V(i.b)) }),
});

/* =======================================================================
   ТРАНСФОРМ
   ======================================================================= */
defineNode('GetPosition', {
  title: 'Позиция', category: 'Трансформ', pure: true,
  inputs: [{ name: 'target', type: 'object', label: 'Объект' }],
  outputs: [{ name: 'position', type: 'vector', label: '' }],
  evaluate: (i, ctx) => {
    const go = i.target ?? ctx.gameObject;
    return { position: go?.transform?.position ?? new THREE.Vector3() };
  },
});

defineNode('SetPosition', {
  title: 'Задать позицию', category: 'Трансформ',
  inputs: [
    { name: 'target', type: 'object', label: 'Объект' },
    { name: 'position', type: 'vector', label: 'Позиция' },
  ],
  run(ctx, inp) {
    const go = inp.target ?? ctx.gameObject;
    if (go?.transform) go.transform.position = V(inp.position);
  },
});

defineNode('Translate', {
  title: 'Сместить', category: 'Трансформ',
  inputs: [
    { name: 'target', type: 'object', label: 'Объект' },
    { name: 'delta', type: 'vector', label: 'Смещение' },
  ],
  run(ctx, inp) {
    const go = inp.target ?? ctx.gameObject;
    const d = V(inp.delta);
    go?.transform?.translate?.(d.x, d.y, d.z, 'world');
  },
});

defineNode('Rotate', {
  title: 'Повернуть', category: 'Трансформ',
  inputs: [
    { name: 'target', type: 'object', label: 'Объект' },
    { name: 'x', type: 'number', label: 'X°', default: 0 },
    { name: 'y', type: 'number', label: 'Y°', default: 0 },
    { name: 'z', type: 'number', label: 'Z°', default: 0 },
  ],
  run(ctx, inp) {
    const go = inp.target ?? ctx.gameObject;
    go?.transform?.rotate?.(num(inp.x), num(inp.y), num(inp.z));
  },
});

defineNode('SetScale', {
  title: 'Задать масштаб', category: 'Трансформ',
  inputs: [
    { name: 'target', type: 'object', label: 'Объект' },
    { name: 'scale', type: 'vector', label: 'Масштаб' },
  ],
  run(ctx, inp) {
    const go = inp.target ?? ctx.gameObject;
    if (go?.transform) go.transform.localScale = V(inp.scale);
  },
});

defineNode('LookAt', {
  title: 'Смотреть на', category: 'Трансформ',
  inputs: [
    { name: 'target', type: 'object', label: 'Объект' },
    { name: 'point', type: 'vector', label: 'Точка' },
  ],
  run(ctx, inp) {
    const go = inp.target ?? ctx.gameObject;
    go?.transform?.lookAt?.(V(inp.point));
  },
});

/* =======================================================================
   ОБЪЕКТЫ
   ======================================================================= */
defineNode('Self', {
  title: 'Этот объект', category: 'Объект', pure: true,
  outputs: [{ name: 'self', type: 'object', label: '' }],
  evaluate: (i, ctx) => ({ self: ctx.gameObject ?? null }),
});

defineNode('FindObject', {
  title: 'Найти объект', category: 'Объект', pure: true,
  props: { name: { type: 'string', default: 'Player', label: 'Имя' } },
  outputs: [{ name: 'object', type: 'object', label: '' }],
  evaluate: (i, ctx, node) => ({ object: ctx.scene?.find?.(node.props?.name) ?? null }),
});

defineNode('FindByTag', {
  title: 'Найти по тегу', category: 'Объект', pure: true,
  props: { tag: { type: 'string', default: 'Player', label: 'Тег' } },
  outputs: [{ name: 'object', type: 'object', label: '' }],
  evaluate: (i, ctx, node) => ({ object: ctx.scene?.findByTag?.(node.props?.tag) ?? null }),
});

defineNode('DestroyObject', {
  title: 'Уничтожить', category: 'Объект',
  inputs: [
    { name: 'target', type: 'object', label: 'Объект' },
    { name: 'delay', type: 'number', label: 'Задержка', default: 0 },
  ],
  run(ctx, inp) {
    const go = inp.target ?? ctx.gameObject;
    if (go) ctx.scene?.destroy?.(go, num(inp.delay));
  },
});

defineNode('SetActive', {
  title: 'Включить/выключить', category: 'Объект',
  inputs: [
    { name: 'target', type: 'object', label: 'Объект' },
    { name: 'active', type: 'boolean', label: 'Активен', default: true },
  ],
  run(ctx, inp) {
    const go = inp.target ?? ctx.gameObject;
    go?.setActive?.(!!inp.active);
  },
});

defineNode('GetName', {
  title: 'Имя объекта', category: 'Объект', pure: true,
  inputs: [{ name: 'target', type: 'object', label: 'Объект' }],
  outputs: [{ name: 'name', type: 'string', label: '' }],
  evaluate: (i, ctx) => ({ name: (i.target ?? ctx.gameObject)?.name ?? '' }),
});

/* =======================================================================
   ФИЗИКА
   ======================================================================= */
defineNode('AddForce', {
  title: 'Приложить силу', category: 'Физика',
  inputs: [
    { name: 'target', type: 'object', label: 'Объект' },
    { name: 'force', type: 'vector', label: 'Сила' },
  ],
  run(ctx, inp) {
    const go = inp.target ?? ctx.gameObject;
    const rb = go?.getComponent?.('Rigidbody');
    rb?.addForce?.(V(inp.force));
  },
});

defineNode('SetVelocity', {
  title: 'Задать скорость', category: 'Физика',
  inputs: [
    { name: 'target', type: 'object', label: 'Объект' },
    { name: 'velocity', type: 'vector', label: 'Скорость' },
  ],
  run(ctx, inp) {
    const go = inp.target ?? ctx.gameObject;
    const rb = go?.getComponent?.('Rigidbody');
    if (rb?.velocity) rb.velocity.copy(V(inp.velocity));
  },
});

defineNode('GetVelocity', {
  title: 'Скорость', category: 'Физика', pure: true,
  inputs: [{ name: 'target', type: 'object', label: 'Объект' }],
  outputs: [{ name: 'velocity', type: 'vector', label: '' }],
  evaluate: (i, ctx) => {
    const rb = (i.target ?? ctx.gameObject)?.getComponent?.('Rigidbody');
    return { velocity: rb?.velocity ?? new THREE.Vector3() };
  },
});

/* =======================================================================
   ИГРОВОЕ
   ======================================================================= */
defineNode('ApplyDamage', {
  title: 'Нанести урон', category: 'Игровое',
  inputs: [
    { name: 'target', type: 'object', label: 'Объект' },
    { name: 'amount', type: 'number', label: 'Урон', default: 10 },
  ],
  run(ctx, inp) {
    const h = (inp.target ?? ctx.gameObject)?.getComponent?.('Health');
    h?.damage?.(num(inp.amount), ctx.gameObject);
  },
});

defineNode('Heal', {
  title: 'Восстановить', category: 'Игровое',
  inputs: [
    { name: 'target', type: 'object', label: 'Объект' },
    { name: 'amount', type: 'number', label: 'Лечение', default: 10 },
  ],
  run(ctx, inp) {
    const h = (inp.target ?? ctx.gameObject)?.getComponent?.('Health');
    h?.heal?.(num(inp.amount));
  },
});

defineNode('GetHealth', {
  title: 'Здоровье', category: 'Игровое', pure: true,
  inputs: [{ name: 'target', type: 'object', label: 'Объект' }],
  outputs: [
    { name: 'current', type: 'number', label: 'Текущее' },
    { name: 'max', type: 'number', label: 'Максимум' },
  ],
  evaluate: (i, ctx) => {
    const h = (i.target ?? ctx.gameObject)?.getComponent?.('Health');
    return { current: h?.currentHealth ?? 0, max: h?.maxHealth ?? 0 };
  },
});

defineNode('Toast', {
  title: 'Сообщение на экран', category: 'Игровое',
  inputs: [{ name: 'text', type: 'any', label: 'Текст', default: 'Привет!' }],
  run(ctx, inp) {
    ctx.engine?.ui?.toast?.(String(inp.text ?? ''));
  },
});

/* =======================================================================
   ВВОД
   ======================================================================= */
defineNode('GetAxis', {
  title: 'Ось ввода', category: 'Ввод', pure: true,
  props: {
    axis: {
      type: 'select', default: 'Horizontal',
      options: ['Horizontal', 'Vertical'], label: 'Ось',
    },
  },
  outputs: [{ name: 'value', type: 'number', label: '' }],
  evaluate: (i, ctx, node) => ({
    value: ctx.engine?.input?.getAxis?.(node.props?.axis ?? 'Horizontal') ?? 0,
  }),
});

defineNode('GetButton', {
  title: 'Кнопка нажата', category: 'Ввод', pure: true,
  props: {
    button: {
      type: 'select', default: 'Jump',
      options: ['Jump', 'Fire1', 'Fire2', 'Sprint', 'Crouch', 'Interact'], label: 'Кнопка',
    },
  },
  outputs: [{ name: 'pressed', type: 'boolean', label: '' }],
  evaluate: (i, ctx, node) => ({
    pressed: !!ctx.engine?.input?.getButton?.(node.props?.button ?? 'Jump'),
  }),
});

/* =======================================================================
   ОТЛАДКА
   ======================================================================= */
defineNode('Print', {
  title: 'Вывести в консоль', category: 'Отладка',
  inputs: [{ name: 'value', type: 'any', label: 'Значение', default: 'Привет' }],
  run(ctx, inp) {
    const v = inp.value;
    const text = v?.isVector3 ? `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})` : String(v);
    ctx.log?.(text);
    console.log('[Blueprint]', text);
  },
});

/** Список узлов, сгруппированных по категориям — для палитры редактора */
export function nodesByCategory() {
  const out = new Map();
  for (const def of NodeRegistry.values()) {
    if (!out.has(def.category)) out.set(def.category, []);
    out.get(def.category).push(def);
  }
  for (const list of out.values()) list.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  return out;
}
