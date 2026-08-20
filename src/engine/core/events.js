// WFL Engine — шина событий
export class EventEmitter {
  constructor() { this._handlers = new Map(); }

  on(event, fn) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(fn);
    return () => this.off(event, fn);
  }

  once(event, fn) {
    const wrapper = (...args) => { this.off(event, wrapper); fn(...args); };
    return this.on(event, wrapper);
  }

  off(event, fn) {
    const set = this._handlers.get(event);
    if (set) set.delete(fn);
  }

  emit(event, ...args) {
    const set = this._handlers.get(event);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try { fn(...args); } catch (e) { console.error(`[EventEmitter] ошибка в обработчике "${event}"`, e); }
    }
  }

  clear(event) {
    if (event) this._handlers.delete(event);
    else this._handlers.clear();
  }
}

export const GlobalEvents = new EventEmitter();
