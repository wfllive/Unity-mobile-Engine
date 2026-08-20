// WFL Engine — базовый класс компонента (аналог MonoBehaviour)
import { uuid } from './math.js';

export class Component {
  static componentName = 'Component';
  /** Описание инспектируемых полей: { имя: {type, default, min, max, step, options, label} } */
  static inspector = {};
  /** Разрешено ли несколько экземпляров на одном объекте */
  static allowMultiple = true;

  constructor() {
    this.id = uuid();
    /** @type {import('./gameobject.js').GameObject|null} */
    this.gameObject = null;
    this._enabled = true;
    this._started = false;
    this._awoken = false;
    this._destroyed = false;
  }

  get enabled() { return this._enabled; }
  set enabled(v) {
    v = !!v;
    if (this._enabled === v) return;
    this._enabled = v;
    if (!this.gameObject) return;
    if (v && this.gameObject.activeInHierarchy) this.onEnable?.();
    else this.onDisable?.();
  }

  get isActiveAndEnabled() {
    return this._enabled && !!this.gameObject && this.gameObject.activeInHierarchy;
  }

  get transform() { return this.gameObject?.transform; }
  get scene() { return this.gameObject?.scene; }
  get engine() { return this.gameObject?.scene?.engine; }
  get name() { return this.gameObject?.name; }

  // --- сокращения Unity-стиля ---
  getComponent(type) { return this.gameObject?.getComponent(type); }
  getComponents(type) { return this.gameObject?.getComponents(type) ?? []; }
  getComponentInChildren(type) { return this.gameObject?.getComponentInChildren(type); }
  getComponentsInChildren(type) { return this.gameObject?.getComponentsInChildren(type) ?? []; }
  getComponentInParent(type) { return this.gameObject?.getComponentInParent(type); }
  addComponent(type, props) { return this.gameObject?.addComponent(type, props); }
  find(name) { return this.scene?.find(name); }
  findByTag(tag) { return this.scene?.findByTag(tag); }
  instantiate(...args) { return this.scene?.instantiate(...args); }
  destroy(target, delay) { return this.scene?.destroy(target ?? this.gameObject, delay); }
  startCoroutine(gen) { return this.scene?.startCoroutine(gen, this); }
  stopCoroutine(c) { return this.scene?.stopCoroutine(c); }
  invoke(fn, delay) { return this.scene?.invoke(fn, delay, this); }

  /** Сериализация значений полей инспектора */
  serialize() {
    const out = {};
    const insp = this.constructor.inspector || {};
    for (const key of Object.keys(insp)) {
      const v = this[key];
      out[key] = serializeValue(v);
    }
    return out;
  }

  deserialize(data) {
    if (!data) return this;
    const insp = this.constructor.inspector || {};
    for (const [key, val] of Object.entries(data)) {
      const meta = insp[key];
      this[key] = deserializeValue(val, meta, this[key]);
    }
    return this;
  }
}

function serializeValue(v) {
  if (v == null) return v;
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map(serializeValue);
  if (typeof v.toArray === 'function' && typeof v.isColor === 'boolean' && v.isColor) return '#' + v.getHexString();
  if (v.isVector2) return { x: v.x, y: v.y };
  if (v.isVector3) return { x: v.x, y: v.y, z: v.z };
  if (v.isVector4 || v.isQuaternion) return { x: v.x, y: v.y, z: v.z, w: v.w };
  if (v.isColor) return '#' + v.getHexString();
  if (typeof v === 'object' && v.__ref) return { __ref: v.__ref };
  return undefined;
}

function deserializeValue(val, meta, current) {
  if (val == null) return val;
  const type = meta?.type;
  if (type === 'vector3' || (current && current.isVector3)) {
    if (current?.isVector3) return current.set(val.x ?? 0, val.y ?? 0, val.z ?? 0);
    return val;
  }
  if (type === 'vector2' || (current && current.isVector2)) {
    if (current?.isVector2) return current.set(val.x ?? 0, val.y ?? 0);
    return val;
  }
  if (type === 'color' && current?.isColor) return current.set(val);
  return val;
}

export { serializeValue, deserializeValue };

/** Реестр типов компонентов — нужен для сериализации сцен и редактора */
export const ComponentRegistry = new Map();

export function registerComponent(ctor, name) {
  // Допускаем оба порядка аргументов: (класс, 'Имя') и ('Имя', класс)
  if (typeof ctor === 'string' && typeof name === 'function') {
    const tmp = ctor; ctor = name; name = tmp;
  }
  if (typeof ctor !== 'function') {
    throw new TypeError('[registerComponent] ожидается класс компонента');
  }
  const key = name || ctor.componentName || ctor.name;
  ctor.componentName = key;
  ComponentRegistry.set(key, ctor);
  return ctor;
}

export function resolveComponent(type) {
  if (typeof type === 'string') return ComponentRegistry.get(type);
  return type;
}
