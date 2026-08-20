// Проверка того, что игры из шаблонов реально ЗАПУСКАЮТСЯ и крутятся.
//
// Обычные тесты проверяли только сборку и сериализацию сцены, из-за чего
// падения в игровом цикле (update/fixedUpdate компонентов) оставались
// незамеченными. Здесь сцена восстанавливается ровно так же, как в плеере,
// и прокручивается несколько сотен кадров с физикой.
import { Scene, PhysicsWorld, THREE } from '../../src/engine/index.js';
import { TEMPLATES, buildTemplateScene } from '../../src/shell/templates.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok    ' + m); } else { fail++; console.log('  FAIL  ' + m); } };

/** Заглушка движка: даёт компонентам всё, чем они пользуются вне рендера */
function makeEngine() {
  const physics = new PhysicsWorld({ fixedTimeStep: 1 / 60 });
  const input = {
    getKey: () => false, getKeyDown: () => false, getKeyUp: () => false,
    getButton: () => false, getButtonDown: () => false, getButtonUp: () => false,
    getAxis: () => 0, getAxisRaw: () => 0,
    getMoveVector: () => new THREE.Vector2(0, 0),
    getTouch: () => undefined, isTouchDevice: false, pointerLocked: false,
    mouseScrollDelta: { x: 0, y: 0 }, requestPointerLock() {}, exitPointerLock() {},
    mousePosition: { x: 0, y: 0 }, mouseDelta: { x: 0, y: 0 },
    touches: [], on() {}, off() {},
  };
  const canvas = { addEventListener() {}, removeEventListener() {} };
  return {
    isMobile: false, physics, input, scene: null, canvas,
    time: { deltaTime: 1 / 60, time: 0, frameCount: 0 },
    camera: null, renderer: null,
    createScene(name) { const s = new Scene(name); s.engine = this; s.physics = physics; return s; },
    addFrameHook() {}, removeFrameHook() {},
    pickVisual: () => null,
  };
}

/** Прокрутить сцену как настоящий игровой цикл */
function runFrames(scene, engine, frames, dt = 1 / 60) {
  const errors = [];
  for (let i = 0; i < frames; i++) {
    try {
      engine.time.deltaTime = dt;
      engine.time.time += dt;
      engine.time.frameCount = i;
      scene.fixedUpdate?.(dt);
      engine.physics?.step?.(dt);
      scene.update(dt);
      scene.lateUpdate?.(dt);
    } catch (err) {
      errors.push(`кадр ${i}: ${err.message}`);
      if (errors.length > 3) break;
    }
  }
  return errors;
}

/** Нет ли NaN в позициях — типичный признак развала физики */
function findNaN(scene) {
  const bad = [];
  for (const go of scene.gameObjects) {
    const p = go.transform?.position;
    if (!p) continue;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) bad.push(go.name);
  }
  return bad;
}

for (const tpl of TEMPLATES) {
  console.log(`\n— шаблон «${tpl.title}» (${tpl.id})`);

  let data;
  try {
    data = buildTemplateScene(tpl.id, 'Тест');
    ok(!!data && Array.isArray(data.objects) && data.objects.length > 0,
      `сцена построена, объектов: ${data?.objects?.length ?? 0}`);
  } catch (err) {
    ok(false, `сцена НЕ построена: ${err.message}`);
    continue;
  }

  // Плеер именно так и делает: десериализует снимок в свежий движок
  const engine = makeEngine();
  let scene;
  try {
    scene = Scene.deserialize(data, engine);
    scene.physics = engine.physics;
    engine.scene = scene;
    ok(scene.gameObjects.length > 0,
      `восстановлено объектов: ${scene.gameObjects.length}`);
  } catch (err) {
    ok(false, `десериализация упала: ${err.message}`);
    continue;
  }

  try {
    scene.load();
    ok(true, 'scene.load() без ошибок');
  } catch (err) {
    ok(false, `scene.load() упал: ${err.message}`);
    continue;
  }

  const errors = runFrames(scene, engine, 300);
  ok(errors.length === 0, errors.length ? `игровой цикл падает — ${errors[0]}` : '300 кадров игрового цикла без ошибок');

  // Игрок не стоит на месте: имитируем зажатые кнопки движения и прыжка
  engine.input.getMoveVector = () => new THREE.Vector2(1, 1);
  engine.input.getAxis = (n) => (n === 'Horizontal' || n === 'Vertical' ? 1 : n === 'LookX' ? 0.2 : 0);
  engine.input.getButton = () => true;
  engine.input.getButtonDown = () => true;
  const errAct = runFrames(scene, engine, 300);
  ok(errAct.length === 0, errAct.length
    ? `падение при активном вводе — ${errAct[0]}`
    : '300 кадров с активным вводом (движение, прыжок, обзор) без ошибок');

  const nanAct = findNaN(scene);
  ok(nanAct.length === 0, nanAct.length ? `NaN после ввода: ${nanAct.slice(0, 3).join(', ')}` : 'после ввода позиции конечны');

  engine.input.getButton = () => false;
  engine.input.getButtonDown = () => false;
  engine.input.getMoveVector = () => new THREE.Vector2(0, 0);
  engine.input.getAxis = () => 0;

  const nan = findNaN(scene);
  ok(nan.length === 0, nan.length ? `NaN в позициях: ${nan.slice(0, 3).join(', ')}` : 'позиции объектов конечны');

  // У играбельной сцены обязана быть камера — иначе чёрный экран
  const hasCam = scene.gameObjects.some((g) => g.getComponent?.('Camera'));
  ok(hasCam, hasCam ? 'в сцене есть камера' : 'КАМЕРЫ НЕТ — игрок увидит чёрный экран');

  // Ссылки на объекты должны переживать сериализацию
  for (const go of scene.gameObjects) {
    const fc = go.getComponent?.('FollowCamera');
    if (fc) {
      ok(!!fc.target, fc.target
        ? `FollowCamera нацелена на «${fc.target.name ?? fc.target.gameObject?.name}»`
        : 'у FollowCamera нет цели — камера не будет следовать за игроком');
    }
  }

  try {
    scene.unload();
    ok(true, 'scene.unload() без ошибок');
  } catch (err) {
    ok(false, `scene.unload() упал: ${err.message}`);
  }
}

console.log(`\nИтого: ${pass} ok, ${fail} ошибок`);
process.exit(fail ? 1 : 0);
