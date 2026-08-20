// WFL Engine — оболочка приложения: переключение трёх режимов.
//
//   home   — список проектов (стартовый экран)
//   edit   — редактор сцены выбранного проекта
//   play   — игра запущена на весь экран, редактора не видно
//
// Движок создаётся один раз и переиспользуется: при смене проекта или режима
// сцена перезагружается из сохранённых данных, а не через перезагрузку страницы.

import * as THREE from 'three';
// Импортируем движок через общий модуль: он регистрирует все компоненты
// (физику, рендеринг, геймплей), без чего сцены не восстановятся из JSON.
import { Engine, Scene, TouchControls } from '../engine/index.js';
import { HomeScreen, confirmSheet } from './home.js';
import { loadProject, saveProject, setLastOpened } from './projects.js';
import { PlayOverlay } from './play-overlay.js';

export class App {
  /** @param {HTMLElement} container */
  constructor(container) {
    this.container = container;
    this.mode = 'home';
    /** @type {string|null} */
    this.projectId = null;
    /** @type {import('../editor/editor.js').Editor|null} */
    this.editor = null;
    /** @type {PlayOverlay|null} */
    this.play = null;

    this.engine = new Engine({
      container,
      touchControls: false,   // включаем только в режиме игры
      adaptiveQuality: true,
      pauseOnBlur: true,
      fixedTimeStep: 1 / 60,
    });
    this.engine.loadScene(this.engine.createScene('Пустая'));
    this.engine.start();
    this.engine.pause();

    this.home = new HomeScreen({
      onOpenEditor: (id) => this.openProject(id, 'edit'),
      onPlay: (id) => this.openProject(id, 'play'),
    });

    this._setViewport('home');
    window.addEventListener('beforeunload', () => this.saveCurrent());
    // Сохраняемся при сворачивании вкладки — на телефоне это основной сценарий выхода
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.saveCurrent();
    });
  }

  /* ==================== Режимы ==================== */

  _setViewport(mode) {
    // canvas виден только в редакторе и игре
    const visible = mode !== 'home';
    this.container.style.visibility = visible ? 'visible' : 'hidden';
    if (visible) this.engine._resize?.();
  }

  /** Открыть проект в нужном режиме */
  async openProject(id, mode = 'edit') {
    const project = loadProject(id);
    if (!project) {
      await confirmSheet({
        title: 'Проект не найден',
        message: 'Похоже, он был удалён.',
        confirmText: 'Понятно',
        danger: false,
      });
      this.home.render();
      return;
    }

    if (this.projectId && this.projectId !== id) this.saveCurrent();
    this.projectId = id;
    this.project = project;
    setLastOpened(id);

    this._loadScene(project.scene);
    this.home.hide();
    if (mode === 'play') this.startPlay();
    else await this.openEditor();
  }

  /** Загрузить сцену проекта в движок */
  _loadScene(data) {
    const engine = this.engine;
    // Порядок важен: выгружаем старую сцену и чистим физический мир ДО
    // десериализации. Компоненты регистрируются в физике при включении, и
    // clear() после deserialize стёр бы уже зарегистрированные коллайдеры.
    engine.scene?.unload();
    engine.physics.clear?.();
    let scene = null;
    if (data && data.objects?.length) {
      try { scene = Scene.deserialize(data, engine); }
      catch (e) { console.error('Не удалось прочитать сцену проекта:', e); }
    }
    if (!scene) {
      scene = new Scene(this.project?.name ?? 'Сцена');
      scene.engine = engine;
    }
    scene.physics = engine.physics;
    engine.loadScene(scene);
  }

  /* ---------- Редактор ---------- */
  async openEditor() {
    this._setViewport('edit');
    this.mode = 'edit';
    this.engine.resume();
    if (this.editor) return this.editor;
    const { Editor } = await import('../editor/editor.js');
    this.editor = new Editor(this.engine, {
      project: this.project,
      onPlay: () => this.startPlay(),
      onExit: () => this.goHome(),
      onChange: () => this.saveCurrent(),
    });
    this.engine._editor = this.editor;
    return this.editor;
  }

  closeEditor() {
    if (!this.editor) return;
    this.editor.close();
    this.editor = null;
    this.engine._editor = null;
  }

  /* ---------- Игра ---------- */
  startPlay() {
    if (this.mode === 'play') return;
    this.saveCurrent();
    // Снимок обязательно без служебной камеры редактора: иначе игра
    // отрендерится с её ракурса — у неё выставлен приоритет depth 100.
    this._snapshot = this.editor ? this.editor.sceneData() : this.engine.scene.serialize();

    // Редактор скрываем, но не разрушаем: возврат должен быть мгновенным
    this.editor?.setVisible(false);
    this.editor?.detachTools();

    this._setViewport('play');
    this.mode = 'play';

    // Сцена играется с нуля: перезагружаем из снимка, чтобы правки не «залипали»
    this._loadScene(this._snapshot);
    this._ensureCamera();

    // Тач-контролы создаются лениво: в редакторе они только мешают
    if (!this.engine.touchControls) this.engine.touchControls = new TouchControls(this.engine);
    this.engine.touchControls.clear();
    this.engine.touchControls.setupDefault();
    this.engine.touchControls.show();

    this.play = new PlayOverlay({
      engine: this.engine,
      title: this.project?.name ?? 'Игра',
      onExit: () => this.stopPlay(),
      onRestart: () => this.restartPlay(),
    });
    this.engine.resume();
  }

  restartPlay() {
    this._loadScene(this._snapshot);
    this._ensureCamera();
    this.engine.touchControls?.show();
    this.play?.rebindScene();
    this.play?.onRestarted();
    this.engine.resume();
  }

  stopPlay() {
    if (this.mode !== 'play') return;
    this.play?.dispose();
    this.play = null;
    this.engine.touchControls?.hide();

    // Возвращаем сцену в то состояние, в котором её оставил редактор
    this._loadScene(this._snapshot);

    if (this.editor) {
      this.mode = 'edit';
      this._setViewport('edit');
      this.editor.setVisible(true);
      this.editor.attachTools();
      this.editor.refresh();
      this.engine.resume();
    } else {
      this.goHome();
    }
  }

  _ensureCamera() {
    const engine = this.engine;
    if (engine.scene?.mainCamera) return;
    const cam = engine.scene.createGameObject('Камера', { position: [0, 7, 13] });
    cam.addComponent('Camera', { fieldOfView: 60, isMainCamera: true });
    cam.transform.lookAt(new THREE.Vector3(0, 1, 0));
  }

  /* ---------- Главная ---------- */
  goHome() {
    this.saveCurrent();
    if (this.play) { this.play.dispose(); this.play = null; }
    this.engine.touchControls?.hide();
    this.closeEditor();
    this.engine.pause();
    this.mode = 'home';
    this.projectId = null;
    this.project = null;
    this._setViewport('home');
    this.home.show();
  }

  /* ---------- Сохранение ---------- */
  saveCurrent() {
    if (!this.projectId || !this.engine.scene) return;
    if (this.mode === 'play') return;   // во время игры сцена «грязная»
    try {
      const data = this.editor ? this.editor.sceneData() : this.engine.scene.serialize();
      saveProject(this.projectId, { scene: data });
    } catch (e) {
      console.error('Не удалось сохранить проект:', e);
    }
  }
}
