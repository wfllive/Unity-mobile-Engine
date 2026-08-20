// WFL Engine — рантайм-плеер, который запускается внутри APK (или standalone HTML).
// Загружает сцену, собранную в редакторе, и сразу запускает её: никакого
// редактора, никаких меню проектов — только игра и её интерфейс.
import { Engine, Scene, GlobalEvents, THREE } from '../engine/index.js';
import { PlayOverlay } from '../shell/play-overlay.js';

/**
 * Запустить игру из сериализованной сцены.
 * @param {object} [opts]
 * @param {object|null} [opts.scene] данные сцены (`Scene.serialize()`)
 * @param {HTMLElement} [opts.container]
 * @param {object} [opts.config] конфигурация сборки (имя игры и т.п.)
 */
export function startPlayer({ scene = null, container = document.body, config = {} } = {}) {
  const engine = new Engine({
    container,
    touchControls: true,
    adaptiveQuality: true,
    pauseOnBlur: true,
    fixedTimeStep: 1 / 60,
  });

  const snapshot = scene && scene.objects?.length ? scene : null;
  loadInto(engine, snapshot);
  engine.start();

  const overlay = new PlayOverlay({
    engine,
    title: config.appName ?? 'WFL Game',
    standalone: true,
    onExit: () => {
      // В собранном приложении выходить некуда — просто снимаем паузу
      overlay.resume();
    },
    onRestart: () => {
      loadInto(engine, snapshot);
      engine.touchControls?.show();
      overlay.rebindScene();
      overlay.onRestarted();
      engine.resume();
    },
  });
  window.wfl = { engine, overlay, get scene() { return engine.scene; }, config };
  GlobalEvents.emit('player:started', engine);
  return engine;
}

/** Загрузить сцену (или запасную пустую) в движок */
function loadInto(engine, data) {
  engine.scene?.unload();
  engine.physics?.clear?.();
  let scene = null;
  if (data) {
    try { scene = Scene.deserialize(data, engine); }
    catch (err) { console.error('Не удалось прочитать сцену:', err); }
  }
  if (!scene) {
    scene = new Scene('Сцена');
    scene.engine = engine;
  }
  scene.physics = engine.physics;
  engine.loadScene(scene);

  if (!engine.scene.mainCamera) {
    const cam = engine.scene.createGameObject('Камера', { position: [0, 6, 12] });
    cam.addComponent('Camera', { fieldOfView: 60, isMainCamera: true });
    cam.transform.lookAt(new THREE.Vector3(0, 0, 0));
  }
  return scene;
}

// Автозапуск: данные подставляются сборщиком APK в window.__WFL_SCENE__
if (typeof window !== 'undefined' && window.__WFL_AUTOSTART__ !== false) {
  const boot = () => startPlayer({
    scene: window.__WFL_SCENE__ ?? null,
    config: window.__WFL_CONFIG__ ?? {},
    container: document.getElementById('app') ?? document.body,
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}
