// Регресс: перезапуск сцены не должен «терять» коллайдеры.
//
// Баг: Collider/Rigidbody регистрировались в physics только из awake().
// App._loadScene делает deserialize (awake → addCollider) → physics.clear()
// (массив коллайдеров обнуляется) → engine.loadScene → scene.load(), который
// повторно awake НЕ вызывает (_awoken уже true). Итог: мир без коллайдеров,
// персонаж проваливается сквозь пол при каждом «Начать заново».
// Починка: регистрация перенесена в onEnable/onDisable.
import { Scene, PhysicsWorld, THREE } from '../../src/engine/index.js';
import { buildTemplateScene } from '../../src/shell/templates.js';

let pass = 0; let fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else { fail++; console.error(`  ✗ ${msg}`); }
};

function makeEngine() {
  const physics = new PhysicsWorld({ fixedTimeStep: 1 / 60 });
  const engine = {
    physics, isMobile: false,
    canvas: { addEventListener() {}, removeEventListener() {} },
    time: { deltaTime: 1 / 60, time: 0, frameCount: 0 },
    input: {
      getKey: () => false, getKeyDown: () => false, getKeyUp: () => false,
      getButton: () => false, getButtonDown: () => false, getButtonUp: () => false,
      getAxis: () => 0, getAxisRaw: () => 0,
      getMoveVector: () => new THREE.Vector2(0, 0), getTouch: () => undefined,
      isTouchDevice: false, pointerLocked: false,
      mouseScrollDelta: { x: 0, y: 0 }, mousePosition: { x: 0, y: 0 }, mouseDelta: { x: 0, y: 0 },
      touches: [], requestPointerLock() {}, exitPointerLock() {}, on() {}, off() {},
    },
    scene: null, scenes: new Map(),
    addFrameHook() {}, removeFrameHook() {}, pickVisual: () => null, _resize() {},
    loadScene(scene) {
      if (this.scene && this.scene !== scene) { this.scene.unload(); this.physics.clear(); }
      this.scene = scene;
      scene.engine = this;
      scene.physics = this.physics;
      scene.load();
      return scene;
    },
  };
  return engine;
}

/** Точная копия последовательности из src/shell/app.js::_loadScene */
function appLoadScene(engine, data) {
  engine.scene?.unload();
  engine.physics.clear?.();
  let scene = null;
  if (data && data.objects?.length) scene = Scene.deserialize(data, engine);
  if (!scene) { scene = new Scene('Сцена'); scene.engine = engine; }
  scene.physics = engine.physics;
  engine.loadScene(scene);
  return scene;
}

// --- 1. Коллайдеры остаются в мире после каждой загрузки ---
{
  const engine = makeEngine();
  const snap = buildTemplateScene('platformer', 'T');
  for (let pass = 1; pass <= 3; pass++) {
    appLoadScene(engine, snap);
    ok(engine.physics.colliders.length > 0,
      `запуск #${pass}: физический мир пуст (коллайдеров 0)`);
  }
  // Без утечек: количество не должно расти от перезапуска к перезапуску
  const n1 = engine.physics.colliders.length;
  appLoadScene(engine, snap);
  ok(engine.physics.colliders.length === n1,
    `утечка коллайдеров при перезапуске: было ${n1}, стало ${engine.physics.colliders.length}`);
}

// --- 2. Персонаж не проваливается сквозь пол ни на одном перезапуске ---
for (const tpl of ['platformer', 'demo']) {
  const engine = makeEngine();
  const snap = buildTemplateScene(tpl, 'T');
  for (let pass = 1; pass <= 3; pass++) {
    const scene = appLoadScene(engine, snap);
    const player = scene.gameObjects.find((g) => g.getComponent?.('CharacterController'));
    if (!player) continue;
    const cc = player.getComponent('CharacterController');
    let vy = 0;
    for (let i = 0; i < 180; i++) {
      const dt = 1 / 60;
      engine.time.deltaTime = dt; engine.time.time += dt; engine.time.frameCount = i;
      scene.fixedUpdate?.(dt);
      engine.physics.step(dt);
      vy += -9.81 * dt;
      if (cc.isGrounded && vy < 0) vy = -2;
      cc.move(new THREE.Vector3(0, vy, 0).multiplyScalar(dt));
      scene.update(dt);
      scene.lateUpdate?.(dt);
    }
    const y = player.transform.position.y;
    ok(y > -1, `${tpl} запуск #${pass}: персонаж провалился (y=${y.toFixed(2)})`);
    ok(cc.isGrounded, `${tpl} запуск #${pass}: персонаж не стоит на земле`);
  }
}

// --- 3. Rigidbody тоже переживает перезапуск ---
{
  const engine = makeEngine();
  const snap = buildTemplateScene('physics', 'T');
  for (let pass = 1; pass <= 2; pass++) {
    appLoadScene(engine, snap);
    ok(engine.physics.bodies.length > 0, `physics запуск #${pass}: тел в мире 0`);
  }
}

// --- 4. Отключение объекта убирает коллайдер, включение — возвращает ---
{
  const engine = makeEngine();
  const scene = appLoadScene(engine, buildTemplateScene('platformer', 'T'));
  const go = scene.gameObjects.find((g) => g.getComponent?.('BoxCollider'));
  if (go) {
    const before = engine.physics.colliders.length;
    go.setActive(false);
    ok(engine.physics.colliders.length === before - 1,
      'setActive(false) не снял коллайдер с регистрации');
    go.setActive(true);
    ok(engine.physics.colliders.length === before,
      'setActive(true) не вернул коллайдер в мир');
  }
}

console.log(`\nИтого: ${pass} ok, ${fail} ошибок`);
process.exit(fail ? 1 : 0);
