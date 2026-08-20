// WFL Engine — рантайм-плеер, который запускается внутри APK (или standalone HTML).
// Загружает сцену, сериализованную редактором, и запускает её без редактора.
import { Engine, Scene, GlobalEvents } from '../engine/index.js';
import { buildDemoScene } from '../game/demo-scene.js';

/**
 * Запустить игру из сериализованной сцены.
 * @param {object} [opts]
 * @param {object|null} [opts.scene] данные сцены (`Scene.serialize()`); null → демо
 * @param {HTMLElement} [opts.container]
 * @param {object} [opts.config] конфигурация сборки (имя игры и т.п.)
 */
export function startPlayer({ scene = null, container = document.body, config = {} } = {}) {
  const engine = new Engine({
    container,
    touchControls: 'auto',
    adaptiveQuality: true,
    pauseOnBlur: true,
    fixedTimeStep: 1 / 60,
  });

  let loaded = null;
  if (scene && scene.objects?.length) {
    try {
      loaded = Scene.deserialize(scene, engine);
    } catch (err) {
      console.error('Не удалось загрузить сцену, запускаем демо:', err);
      loaded = null;
    }
  }

  if (!loaded) {
    loaded = buildDemoScene(engine).scene;
  }

  engine.loadScene(loaded);

  // Если в сцене не оказалось камеры — добавим свободную
  if (!engine.scene.mainCamera) {
    const cam = engine.scene.createGameObject('Камера', { position: [0, 6, 12] });
    cam.addComponent('Camera', { fov: 60 });
    cam.transform.lookAt?.(0, 0, 0);
  }

  engine.start();

  // Простейший HUD: FPS по долгому тапу тремя пальцами (для отладки на устройстве)
  installDebugGesture(engine);

  window.wfl = { engine, get scene() { return engine.scene; }, config };
  GlobalEvents.emit('player:started', engine);
  return engine;
}

function installDebugGesture(engine) {
  let shown = false;
  window.addEventListener('touchstart', (e) => {
    if (e.touches.length === 3) {
      shown = !shown;
      engine.ui?.showStats?.(shown);
    }
  }, { passive: true });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'F3') {
      shown = !shown;
      engine.ui?.showStats?.(shown);
    }
  });
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
