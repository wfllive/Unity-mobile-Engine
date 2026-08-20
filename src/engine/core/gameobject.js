// WFL Engine — GameObject
import { Transform } from './transform.js';
import { resolveComponent, ComponentRegistry } from './component.js';
import { uuid } from './math.js';

export class GameObject {
  constructor(name = 'GameObject', scene = null) {
    this.id = uuid();
    this.name = name;
    this._tag = 'Untagged';
    this.layer = 0;
    /** @type {import('./scene.js').Scene|null} */
    this.scene = null;
    this._activeSelf = true;
    this._destroyed = false;
    /** @type {import('./component.js').Component[]} */
    this.components = [];
    this.transform = new Transform(this);
    this.isStatic = false;
    if (scene) scene.add(this);
  }

  /**
   * Тег объекта. При смене тега индекс сцены обновляется,
   * чтобы findByTag() сразу возвращал актуальный результат.
   */
  get tag() { return this._tag; }
  set tag(value) {
    const next = value ?? 'Untagged';
    if (next === this._tag) return;
    if (this.scene) this.scene._unindexTag(this);
    this._tag = next;
    if (this.scene) this.scene._indexTag(this);
  }

  get activeSelf() { return this._activeSelf; }
  get activeInHierarchy() {
    if (!this._activeSelf) return false;
    let p = this.transform.parent;
    while (p) {
      if (!p.gameObject._activeSelf) return false;
      p = p.parent;
    }
    return true;
  }

  setActive(value) {
    value = !!value;
    if (this._activeSelf === value) return this;
    const wasActive = this.activeInHierarchy;
    this._activeSelf = value;
    const nowActive = this.activeInHierarchy;
    this.transform.object3D.visible = value;
    if (wasActive !== nowActive) this._propagateActive(nowActive);
    return this;
  }

  _propagateActive(active) {
    for (const c of this.components) {
      if (!c._enabled) continue;
      if (active) {
        if (!c._awoken) { c._awoken = true; c.awake?.(); }
        c.onEnable?.();
      } else c.onDisable?.();
    }
    for (const child of this.transform.children) {
      if (child.gameObject._activeSelf) child.gameObject._propagateActive(active);
    }
  }

  // ---- Компоненты ----
  addComponent(type, props = null) {
    const Ctor = resolveComponent(type);
    if (!Ctor) throw new Error(`[GameObject] неизвестный компонент: ${type}`);
    if (Ctor.allowMultiple === false && this.getComponent(Ctor)) {
      return this.getComponent(Ctor);
    }
    const comp = new Ctor();
    comp.gameObject = this;
    if (props) Object.assign(comp, props);
    this.components.push(comp);
    this.scene?._registerComponent(comp);
    if (this.activeInHierarchy) {
      comp._awoken = true;
      comp.awake?.();
      if (comp._enabled) comp.onEnable?.();
    }
    return comp;
  }

  getComponent(type) {
    const Ctor = resolveComponent(type);
    if (!Ctor) return null;
    for (const c of this.components) if (c instanceof Ctor) return c;
    return null;
  }

  getComponents(type) {
    const Ctor = resolveComponent(type);
    if (!Ctor) return [];
    return this.components.filter((c) => c instanceof Ctor);
  }

  getComponentInChildren(type, includeInactive = false) {
    const Ctor = resolveComponent(type);
    if (!Ctor) return null;
    if (includeInactive || this.activeInHierarchy) {
      const own = this.getComponent(Ctor);
      if (own) return own;
    }
    for (const child of this.transform.children) {
      const found = child.gameObject.getComponentInChildren(Ctor, includeInactive);
      if (found) return found;
    }
    return null;
  }

  getComponentsInChildren(type, includeInactive = false, out = []) {
    const Ctor = resolveComponent(type);
    if (!Ctor) return out;
    if (includeInactive || this.activeInHierarchy) out.push(...this.getComponents(Ctor));
    for (const child of this.transform.children) {
      child.gameObject.getComponentsInChildren(Ctor, includeInactive, out);
    }
    return out;
  }

  getComponentInParent(type) {
    const Ctor = resolveComponent(type);
    let go = this;
    while (go) {
      const c = go.getComponent(Ctor);
      if (c) return c;
      go = go.transform.parent?.gameObject;
    }
    return null;
  }

  removeComponent(comp) {
    const i = this.components.indexOf(comp);
    if (i < 0) return false;
    this.components.splice(i, 1);
    comp.onDisable?.();
    comp.onDestroy?.();
    comp._destroyed = true;
    this.scene?._unregisterComponent(comp);
    return true;
  }

  /** Вызов метода на всех компонентах (аналог SendMessage) */
  sendMessage(method, ...args) {
    for (const c of this.components) {
      if (typeof c[method] === 'function' && c.isActiveAndEnabled) c[method](...args);
    }
  }

  broadcastMessage(method, ...args) {
    this.sendMessage(method, ...args);
    for (const child of this.transform.children) child.gameObject.broadcastMessage(method, ...args);
  }

  setParent(go, worldPositionStays = true) {
    this.transform.setParent(go ? (go.transform ?? go) : null, worldPositionStays);
    return this;
  }

  destroy(delay = 0) { this.scene?.destroy(this, delay); }

  clone(newName) {
    const data = this.serialize();
    data.name = newName ?? this.name;
    return GameObject.deserialize(data, this.scene);
  }

  serialize() {
    return {
      id: this.id,
      name: this.name,
      tag: this.tag,
      layer: this.layer,
      active: this._activeSelf,
      isStatic: this.isStatic,
      transform: {
        position: this.transform.localPosition.toArray(),
        rotation: this.transform.localRotation.toArray(),
        scale: this.transform.localScale.toArray(),
      },
      components: this.components
        .filter((c) => ComponentRegistry.has(c.constructor.componentName))
        .map((c) => ({ type: c.constructor.componentName, enabled: c._enabled, data: c.serialize() })),
      children: this.transform.children.map((t) => t.gameObject.serialize()),
    };
  }

  static deserialize(data, scene, parent = null) {
    const go = new GameObject(data.name ?? 'GameObject', scene);
    if (data.id) go.id = data.id;
    go.tag = data.tag ?? 'Untagged';
    go.layer = data.layer ?? 0;
    go.isStatic = !!data.isStatic;
    if (parent) go.transform.setParent(parent, false);
    if (data.transform) {
      go.transform.localPosition.fromArray(data.transform.position ?? [0, 0, 0]);
      go.transform.localRotation.fromArray(data.transform.rotation ?? [0, 0, 0, 1]);
      go.transform.localScale.fromArray(data.transform.scale ?? [1, 1, 1]);
    }
    for (const cd of data.components ?? []) {
      const Ctor = ComponentRegistry.get(cd.type);
      if (!Ctor) { console.warn(`[GameObject] пропущен неизвестный компонент "${cd.type}"`); continue; }
      const comp = go.addComponent(Ctor);
      comp.deserialize(cd.data);
      comp.enabled = cd.enabled !== false;
      comp.onDeserialized?.();
    }
    for (const cd of data.children ?? []) GameObject.deserialize(cd, scene, go.transform);
    if (data.active === false) go.setActive(false);
    return go;
  }
}
