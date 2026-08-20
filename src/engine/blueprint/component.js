// WFL Engine — компонент «Блюпринт»: визуальный граф логики на объекте.
import { Component, registerComponent } from '../core/component.js';
import { BlueprintGraph } from './graph.js';

/**
 * Граф хранится как JSON-строка, потому что Component.serialize() умеет
 * сохранять только примитивы и векторы. Строка переживает round-trip
 * сериализации сцены и без изменений попадает в APK.
 */
export class Blueprint extends Component {
  static componentName = 'Blueprint';
  static inspector = {
    graphName: { type: 'string', default: 'Новый блюпринт', label: 'Имя графа' },
    graphData: { type: 'blueprint', default: '', label: 'Граф' },
    verbose: { type: 'boolean', default: false, label: 'Подробный лог' },
  };

  constructor() {
    super();
    this.graphName = 'Новый блюпринт';
    this.graphData = '';
    this.verbose = false;
    /** @type {BlueprintGraph|null} */
    this.graph = null;
    this.error = null;
    this._time = 0;
  }

  /** Пересобрать граф из graphData */
  compile() {
    this.error = null;
    try {
      const data = this.graphData?.trim() ? JSON.parse(this.graphData) : { nodes: [], links: [] };
      this.graph = new BlueprintGraph(data);
      this.graph.bind({
        gameObject: this.gameObject,
        component: this,
        scene: this.scene,
        engine: this.engine,
        log: (m) => this._log(m),
      });
    } catch (e) {
      this.error = String(e);
      this.graph = null;
      console.error(`[Blueprint:${this.graphName}] не удалось разобрать граф`, e);
    }
    return this;
  }

  /** Записать текущий граф обратно в поле сериализации (вызывает редактор) */
  syncFromGraph() {
    if (this.graph) this.graphData = JSON.stringify(this.graph.toJSON());
    return this;
  }

  _log(m) {
    if (this.verbose) console.log(`[${this.graphName}]`, m);
    this.engine?.editor?.log?.(`[${this.graphName}] ${m}`);
  }

  awake() {
    if (!this.graph) this.compile();
    // Контекст мог быть собран до присоединения к объекту
    this.graph?.bind({
      gameObject: this.gameObject,
      component: this,
      scene: this.scene,
      engine: this.engine,
      log: (m) => this._log(m),
    });
  }

  start() {
    this.graph?.beginFrame(0, 0);
    this.graph?.trigger('start');
  }

  update(dt) {
    if (!this.graph) return;
    this._time += dt;
    this.graph.beginFrame(dt, this._time);
    this.graph.tickTimers(dt);
    this.graph.trigger('update', { dt });
  }

  fixedUpdate(dt) {
    if (!this.graph) return;
    this.graph.beginFrame(dt, this._time);
    this.graph.trigger('fixedUpdate', { dt });
  }

  onCollisionEnter(c) {
    this.graph?.trigger('collisionEnter', { other: c?.gameObject ?? null });
  }

  onTriggerEnter(c) {
    this.graph?.trigger('triggerEnter', { other: c?.gameObject ?? c ?? null });
  }

  onDestroy() {
    this.graph?.trigger('destroy');
  }

  onDeserialized() { this.compile(); }

  /** Сводка для инспектора */
  /** Краткое описание графа для инспектора */
  get summary() {
    if (this.error) return `Ошибка: ${this.error}`;
    if (!this.graph) return 'Граф не собран';
    const s = this.graph.stats;
    if (!s.nodes) return 'Граф пуст — нажмите «Открыть граф»';
    const ev = s.events.length ? s.events.join(', ') : 'нет событий';
    return `${s.nodes} узлов, ${s.links} связей · ${ev}`;
  }
}

registerComponent(Blueprint);

export default Blueprint;
