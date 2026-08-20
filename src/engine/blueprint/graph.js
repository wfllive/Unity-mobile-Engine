// WFL Engine — исполнитель графов Blueprints.
//
// Формат графа (полностью JSON-сериализуемый):
// {
//   version: 1,
//   variables: { счёт: 0 },
//   nodes: [ { id, type, x, y, props: {}, inputs: { имяПина: значение } } ],
//   links: [
//     { from: idУзла, out: 'имяВыхода', to: idУзла, in: 'имяВхода' },        // данные
//     { from: idУзла, exec: 'out', to: idУзла, execIn: 'in' }                 // поток
//   ]
// }
import { getNodeDef, canConnectTypes, pinType } from './nodes.js';

const MAX_STEPS = 10000;   // защита от бесконечных циклов на кадр

export class BlueprintGraph {
  constructor(data = null) {
    this.nodes = new Map();     // id -> node
    this.links = [];
    this.variables = {};
    this.ctx = {};
    this.errors = [];
    this._outCache = new Map(); // "nodeId:pin" -> значение
    this._states = new Map();   // id -> постоянное состояние узла (DoOnce и т.п.)
    this._timers = [];          // отложенные продолжения (Delay)
    this._evaluating = new Set();
    this._steps = 0;
    if (data) this.load(data);
  }

  /* ------------------------------------------------------------------ */
  /* Загрузка / сохранение                                              */
  /* ------------------------------------------------------------------ */
  load(data) {
    const d = typeof data === 'string' ? safeParse(data) : data;
    this.nodes.clear();
    this.links = [];
    this.variables = { ...(d?.variables ?? {}) };
    for (const n of d?.nodes ?? []) {
      this.nodes.set(n.id, {
        id: n.id,
        type: n.type,
        x: n.x ?? 0,
        y: n.y ?? 0,
        props: { ...(n.props ?? {}) },
        inputs: { ...(n.inputs ?? {}) },
        collapsed: !!n.collapsed,
      });
    }
    for (const l of d?.links ?? []) this.links.push({ ...l });
    this._rebuild();
    return this;
  }

  toJSON() {
    return {
      version: 1,
      variables: { ...this.variables },
      nodes: [...this.nodes.values()].map((n) => ({
        id: n.id, type: n.type, x: Math.round(n.x), y: Math.round(n.y),
        ...(Object.keys(n.props).length ? { props: n.props } : {}),
        ...(Object.keys(n.inputs).length ? { inputs: n.inputs } : {}),
        ...(n.collapsed ? { collapsed: true } : {}),
      })),
      links: this.links.map((l) => ({ ...l })),
    };
  }

  clone() { return new BlueprintGraph(JSON.parse(JSON.stringify(this.toJSON()))); }

  /* ------------------------------------------------------------------ */
  /* Редактирование графа                                               */
  /* ------------------------------------------------------------------ */
  addNode(type, x = 0, y = 0, id = null) {
    const def = getNodeDef(type);
    if (!def) throw new Error(`Неизвестный тип узла: ${type}`);
    const nid = id ?? this._nextId();
    const props = {};
    for (const [k, p] of Object.entries(def.props ?? {})) props[k] = p.default;
    const inputs = {};
    for (const pin of def.inputs ?? []) {
      if (pin.default !== undefined) inputs[pin.name] = pin.default;
    }
    const node = { id: nid, type, x, y, props, inputs, collapsed: false };
    this.nodes.set(nid, node);
    this._rebuild();
    return node;
  }

  removeNode(id) {
    this.nodes.delete(id);
    this.links = this.links.filter((l) => l.from !== id && l.to !== id);
    this._rebuild();
  }

  /**
   * Проверить, допустимо ли соединение, не создавая его.
   * @returns {{ok: boolean, cast: boolean, reason: string}}
   */
  checkConnection(fromId, fromPin, toId, toPin, isExec = false) {
    if (fromId === toId) return { ok: false, cast: false, reason: 'Узел нельзя соединить сам с собой' };
    if (!this.nodes.has(fromId) || !this.nodes.has(toId)) {
      return { ok: false, cast: false, reason: 'Один из узлов не найден' };
    }
    if (isExec) return { ok: true, cast: false, reason: '' };
    const a = this.nodes.get(fromId);
    const b = this.nodes.get(toId);
    return canConnectTypes(pinType(a.type, 'out', fromPin), pinType(b.type, 'in', toPin));
  }

  /** Соединить пины. Для exec: connect(a,'out',b,'in',true) */
  connect(fromId, fromPin, toId, toPin, isExec = false) {
    if (fromId === toId) return null;
    if (!this.nodes.has(fromId) || !this.nodes.has(toId)) return null;
    // Типы данных проверяем и здесь, а не только в редакторе: граф может
    // собираться кодом или прийти из чужого JSON.
    if (!isExec && !this.checkConnection(fromId, fromPin, toId, toPin, false).ok) return null;
    let link;
    if (isExec) {
      // Один exec-выход ведёт максимум в одно место
      this.links = this.links.filter((l) => !(l.exec && l.from === fromId && l.exec === fromPin));
      link = { from: fromId, exec: fromPin, to: toId, execIn: toPin };
    } else {
      // Один вход данных принимает максимум одно соединение
      this.links = this.links.filter((l) => !(l.in && l.to === toId && l.in === toPin));
      link = { from: fromId, out: fromPin, to: toId, in: toPin };
    }
    this.links.push(link);
    this._rebuild();
    return link;
  }

  disconnect(link) {
    const i = this.links.indexOf(link);
    if (i >= 0) this.links.splice(i, 1);
    else {
      this.links = this.links.filter((l) => !(l.from === link.from && l.to === link.to
        && l.in === link.in && l.out === link.out && l.exec === link.exec));
    }
    this._rebuild();
  }

  /** Удалить связь, входящую в конкретный вход данных */
  disconnectInput(nodeId, pin) {
    this.links = this.links.filter((l) => !(l.in === pin && l.to === nodeId));
    this._rebuild();
  }

  _nextId() {
    let i = 1;
    while (this.nodes.has(`n${i}`)) i++;
    return `n${i}`;
  }

  /** Индексы для быстрого поиска связей */
  _rebuild() {
    this._dataIn = new Map();   // "to:in" -> link
    this._execOut = new Map();  // "from:exec" -> link
    this._eventNodes = new Map(); // event -> [nodeId]
    for (const l of this.links) {
      if (l.exec !== undefined) this._execOut.set(`${l.from}:${l.exec}`, l);
      else this._dataIn.set(`${l.to}:${l.in}`, l);
    }
    for (const n of this.nodes.values()) {
      const def = getNodeDef(n.type);
      if (def?.event) {
        if (!this._eventNodes.has(def.event)) this._eventNodes.set(def.event, []);
        this._eventNodes.get(def.event).push(n.id);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Выполнение                                                          */
  /* ------------------------------------------------------------------ */
  /** Привязать граф к контексту выполнения */
  bind(ctx) {
    this.ctx = { ...ctx, vars: this.variables, log: ctx.log ?? (() => {}) };
    return this;
  }

  _state(id) {
    if (!this._states.has(id)) this._states.set(id, {});
    return this._states.get(id);
  }

  _setOut(nodeId, pin, value) { this._outCache.set(`${nodeId}:${pin}`, value); }
  _getOut(nodeId, pin) { return this._outCache.get(`${nodeId}:${pin}`); }

  _schedule(seconds, nodeId, pin) {
    this._timers.push({ t: Math.max(0, seconds), nodeId, pin });
  }

  /** Вычислить значение выхода узла (лениво, с защитой от циклов) */
  _resolve(nodeId, pin) {
    const key = `${nodeId}:${pin}`;
    const node = this.nodes.get(nodeId);
    if (!node) return undefined;
    const def = getNodeDef(node.type);
    if (!def) return undefined;

    if (!def.pure) return this._outCache.get(key); // результат последнего выполнения

    // Чистый узел пересчитывается при каждом обращении: его входы могут
    // меняться в пределах кадра (например, индекс цикла). Кеш служит только
    // для разрыва циклических зависимостей.
    if (this._evaluating.has(nodeId)) return this._outCache.get(key);

    this._evaluating.add(nodeId);
    let outs = {};
    try {
      outs = def.evaluate ? (def.evaluate(this._gatherInputs(node, def), this.ctx, node, this) ?? {}) : {};
    } catch (e) {
      this._error(node, e);
    } finally {
      this._evaluating.delete(nodeId);
    }
    for (const [k, v] of Object.entries(outs)) this._outCache.set(`${nodeId}:${k}`, v);
    return this._outCache.get(key);
  }

  /** Собрать значения всех входов узла: связь → литерал → default */
  _gatherInputs(node, def) {
    const inp = {};
    for (const pin of def.inputs ?? []) {
      const link = this._dataIn.get(`${node.id}:${pin.name}`);
      if (link) {
        inp[pin.name] = this._resolve(link.from, link.out);
        if (inp[pin.name] === undefined) inp[pin.name] = node.inputs?.[pin.name] ?? pin.default;
      } else {
        inp[pin.name] = node.inputs?.[pin.name] ?? pin.default;
      }
    }
    return inp;
  }

  /** Пройти по exec-цепочке от указанного выхода узла */
  _runExec(fromId, execPin) {
    const link = this._execOut.get(`${fromId}:${execPin}`);
    if (!link) return;
    this._execNode(link.to);
  }

  /** Выполнить узел и продолжить по цепочке */
  _execNode(nodeId) {
    let currentId = nodeId;
    while (currentId) {
      if (++this._steps > MAX_STEPS) {
        this._error({ id: currentId, type: '?' }, new Error('Превышен лимит шагов (возможен бесконечный цикл)'));
        return;
      }
      const node = this.nodes.get(currentId);
      if (!node) return;
      const def = getNodeDef(node.type);
      if (!def) return;

      let result;
      try {
        const inp = this._gatherInputs(node, def);
        result = def.run ? def.run(this.ctx, inp, node, this) : 'out';
      } catch (e) {
        this._error(node, e);
        return;
      }

      // Нормализуем результат
      let next = result;
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        if (result.out) for (const [k, v] of Object.entries(result.out)) this._setOut(node.id, k, v);
        next = result.next;
      }
      if (next === undefined) next = 'out';
      if (next === null || next === false) return;   // цепочка прервана

      if (Array.isArray(next)) {                      // несколько выходов подряд
        for (const pin of next) this._runExec(node.id, pin);
        return;
      }

      const link = this._execOut.get(`${node.id}:${next}`);
      if (!link) return;
      currentId = link.to;                            // хвостовая рекурсия → цикл
    }
  }

  _error(node, e) {
    const msg = `Узел ${node?.type ?? '?'} (${node?.id ?? '?'}): ${e.message}`;
    if (!this.errors.includes(msg)) {
      this.errors.push(msg);
      // Логгер пользователя может сам бросить исключение — не даём ему уронить граф
      try { this.ctx.log?.(`Blueprint: ${msg}`); } catch { /* игнорируем */ }
      console.warn('[Blueprint]', msg);
    }
  }

  /** Начать новый кадр: обновить контекст времени */
  beginFrame(dt = 0, time = 0) {
    this._steps = 0;
    this.ctx.dt = dt;
    this.ctx.time = time;
  }

  /** Запустить все узлы-события заданного типа */
  trigger(event, payload = null) {
    const ids = this._eventNodes?.get(event);
    if (!ids?.length) return false;
    this._steps = 0; // бюджет шагов — на каждое событие
    for (const id of ids) {
      if (payload) {
        for (const [k, v] of Object.entries(payload)) this._setOut(id, k, v);
      }
      const node = this.nodes.get(id);
      const def = getNodeDef(node?.type);
      // Событие с собственным условием (например «Нажата клавиша»)
      if (def?.run) {
        let next;
        try { next = def.run(this.ctx, this._gatherInputs(node, def), node, this); }
        catch (e) { this._error(node, e); continue; }
        if (next === null || next === false) continue;
        this._runExec(id, typeof next === 'string' ? next : 'out');
      } else {
        this._runExec(id, 'out');
      }
    }
    return true;
  }

  /** Продвинуть таймеры Delay */
  tickTimers(dt) {
    if (!this._timers.length) return;
    const due = [];
    for (const t of this._timers) {
      t.t -= dt;
      if (t.t <= 0) due.push(t);
    }
    if (!due.length) return;
    this._timers = this._timers.filter((t) => !due.includes(t));
    for (const t of due) this._runExec(t.nodeId, t.pin);
  }

  /** Полный сброс состояния выполнения (без потери структуры) */
  resetRuntime() {
    this._outCache.clear();
    this._states.clear();
    this._timers = [];
    this.errors = [];
  }

  /** Проверка графа: висячие события, неизвестные узлы, разорванные связи */
  validate() {
    const problems = [];
    for (const n of this.nodes.values()) {
      if (!getNodeDef(n.type)) problems.push(`Неизвестный узел «${n.type}» (${n.id})`);
    }
    for (const l of this.links) {
      if (!this.nodes.has(l.from) || !this.nodes.has(l.to)) {
        problems.push(`Связь ведёт в никуда: ${l.from} → ${l.to}`);
      }
    }
    const hasEvent = [...this.nodes.values()].some((n) => getNodeDef(n.type)?.event);
    if (this.nodes.size > 0 && !hasEvent) problems.push('В графе нет ни одного события — он никогда не выполнится');
    return problems;
  }

  get stats() {
    return {
      nodes: this.nodes.size,
      links: this.links.length,
      variables: Object.keys(this.variables).length,
      events: this._eventNodes ? [...this._eventNodes.keys()] : [],
    };
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return { nodes: [], links: [] }; }
}

export default BlueprintGraph;
