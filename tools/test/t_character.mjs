// Регрессии контроллера персонажа: провал сквозь пол и туннелирование.
//
// Ловит два реальных бага:
//  1. computePenetration выталкивал персонажа ПО нормали (нормаль смотрит
//     от A к B, то есть внутрь препятствия) — за 4 итерации ошибка росла
//     0.1 → 0.3 → 0.7 → 1.5 и игрока «выстреливало» под пол.
//  2. CharacterController.move передавал в computePenetration устаревший
//     worldCenter (bounds с прошлого кадра) — на больших dt персонаж
//     застревал внутри платформы.
import { Scene, PhysicsWorld, THREE, BoxCollider, CapsuleCollider, CharacterController, testCollision } from '../../src/engine/index.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok    ' + m); } else { fail++; console.log('  FAIL  ' + m); } };

function makeWorld() {
  const physics = new PhysicsWorld({ fixedTimeStep: 1 / 60 });
  const engine = {
    physics, canvas: { addEventListener() {}, removeEventListener() {} },
    time: { deltaTime: 1 / 60, time: 0, frameCount: 0 },
    createScene(n) { const s = new Scene(n); s.engine = this; s.physics = physics; return s; },
    addFrameHook() {}, removeFrameHook() {},
  };
  const scene = engine.createScene('phys');
  return { scene, physics };
}

/** Пол с верхней гранью ровно на y=0 */
function addGround(scene, { size = new THREE.Vector3(60, 1, 60), y = null } = {}) {
  const g = scene.createGameObject('Пол', { position: new THREE.Vector3(0, y ?? -size.y / 2, 0) });
  g.layer = 7;
  g.addComponent(BoxCollider, { size });
  return g;
}

function addPlayer(scene, y) {
  const p = scene.createGameObject('Игрок', { position: new THREE.Vector3(0, y, 0) });
  const cc = p.addComponent(CharacterController, { radius: 0.4, height: 1.8 });
  return { p, cc };
}

/** Прогон падения; возвращает минимальную и финальную высоту */
function fall(scene, physics, cc, p, { dt = 1 / 60, frames = 400, vx = 0, speed = 0 } = {}) {
  let vy = 0, minY = Infinity;
  for (let i = 0; i < frames; i++) {
    scene.fixedUpdate?.(dt);
    physics.step(dt);
    vy += -9.81 * dt;
    if (cc.isGrounded && vy < 0) vy = -2;
    cc.move(new THREE.Vector3(vx * speed, vy, 0).multiplyScalar(dt));
    scene.update(dt);
    minY = Math.min(minY, p.transform.position.y);
  }
  return { minY, finalY: p.transform.position.y };
}

// Капсула radius=0.4 height=1.8 на полу с верхом y=0 стоит центром на y=0.9
const REST = 0.9;

console.log('\n— знак выталкивания из проникновения');
{
  const { scene, physics } = makeWorld();
  addGround(scene);
  const p = scene.createGameObject('Игрок', { position: new THREE.Vector3(0, REST - 0.1, 0) });
  const cap = p.addComponent(CapsuleCollider, { radius: 0.4, height: 1.8 });
  cap.isTrigger = true;
  scene.load();
  cap.updateBounds();

  const corr = physics.computePenetration(cap, cap.worldCenter.clone());
  ok(corr.y > 0, `утопленную капсулу выталкивает ВВЕРХ (correction.y=${corr.y.toFixed(4)})`);
  ok(Math.abs(corr.y - 0.1) < 0.02, `глубина выталкивания точная (${corr.y.toFixed(4)}, ожидалось 0.1)`);

  // аргумент не должен мутировать: его часто передают как worldCenter
  const arg = cap.worldCenter.clone();
  const before = arg.clone();
  physics.computePenetration(cap, arg);
  ok(arg.equals(before), 'computePenetration не мутирует переданную позицию');
}

console.log('\n— нормаль контакта направлена от A к B');
{
  const { scene } = makeWorld();
  const g = addGround(scene);
  const p = scene.createGameObject('Игрок', { position: new THREE.Vector3(0, REST - 0.1, 0) });
  const cap = p.addComponent(CapsuleCollider, { radius: 0.4, height: 1.8 });
  scene.load();
  cap.updateBounds();
  const m = testCollision(cap, g.getComponent(BoxCollider), cap.worldCenter.clone());
  ok(!!m, 'проникновение капсулы в пол обнаружено');
  ok(m && m.a === cap && m.normal.y < 0,
    `нормаль смотрит от капсулы к полу, т.е. вниз (normal.y=${m?.normal.y.toFixed(2)})`);
}

console.log('\n— падение на пол не проваливается');
for (const [label, startY, dt, frames] of [
  ['с 3 м при 60 FPS', 3, 1 / 60, 400],
  ['с 40 м (большая скорость)', 40, 1 / 60, 400],
  ['с 120 м (очень быстро)', 120, 1 / 60, 700],
  ['при 20 FPS', 20, 1 / 20, 400],
  ['при лаг-спайке 5 FPS', 20, 0.2, 200],
]) {
  const { scene, physics } = makeWorld();
  addGround(scene);
  const { p, cc } = addPlayer(scene, startY);
  scene.load();
  const { minY, finalY } = fall(scene, physics, cc, p, { dt, frames });
  ok(minY > REST - 0.15 && Math.abs(finalY - REST) < 0.15,
    `${label}: не провалился и встал на пол (minY=${minY.toFixed(3)}, итог=${finalY.toFixed(3)})`);
}

console.log('\n— тонкая платформа (туннелирование)');
for (const [label, thickness, startY, dt] of [
  ['0.2 м, падение с 30 м', 0.2, 30, 1 / 60],
  ['0.2 м при 20 FPS', 0.2, 30, 1 / 20],
  ['0.5 м как в демо-сцене', 0.5, 50, 1 / 60],
]) {
  const { scene, physics } = makeWorld();
  addGround(scene, { size: new THREE.Vector3(8, thickness, 8) });
  const { p, cc } = addPlayer(scene, startY);
  scene.load();
  const { minY, finalY } = fall(scene, physics, cc, p, { dt, frames: 500 });
  ok(minY > REST - 0.15 && Math.abs(finalY - REST) < 0.15,
    `${label}: не пробил насквозь (minY=${minY.toFixed(3)}, итог=${finalY.toFixed(3)})`);
}

console.log('\n— горизонтальные столкновения не сломаны');
{
  const { scene, physics } = makeWorld();
  addGround(scene);
  const w = scene.createGameObject('Стена', { position: new THREE.Vector3(5, 1.5, 0) });
  w.layer = 7;
  w.addComponent(BoxCollider, { size: new THREE.Vector3(1, 3, 20) });
  const { p, cc } = addPlayer(scene, 1);
  scene.load();
  const { finalY } = fall(scene, physics, cc, p, { frames: 240, vx: 1, speed: 6 });
  const x = p.transform.position.x;
  ok(x < 4.6, `стена останавливает игрока (x=${x.toFixed(2)})`);
  ok(Math.abs(finalY - REST) < 0.15, `при ходьбе держится на полу (y=${finalY.toFixed(3)})`);
}
{
  const { scene, physics } = makeWorld();
  addGround(scene);
  const { p, cc } = addPlayer(scene, 1);
  scene.load();
  fall(scene, physics, cc, p, { frames: 240, vx: 1, speed: 6 });
  ok(p.transform.position.x > 22, `свободная ходьба не тормозится (x=${p.transform.position.x.toFixed(2)})`);
}
{
  // стык двух платформ — классическое место провала
  const { scene, physics } = makeWorld();
  for (const x of [-2, 2]) {
    const pl = scene.createGameObject(`Пл${x}`, { position: new THREE.Vector3(x, 2.75, 0) });
    pl.layer = 7;
    pl.addComponent(BoxCollider, { size: new THREE.Vector3(4, 0.5, 6) });
  }
  const p = scene.createGameObject('Игрок', { position: new THREE.Vector3(-2, 4.2, 0) });
  const cc = p.addComponent(CharacterController, { radius: 0.4, height: 1.8 });
  scene.load();
  // 120 кадров × 2 м/с = 4 м: проходим стык в x=0 и остаёмся на настиле
  // (платформы перекрывают x от -4 до 4), не сваливаясь с края.
  const { minY, finalY } = fall(scene, physics, cc, p, { frames: 120, vx: 1, speed: 2 });
  ok(minY > 3.7 && finalY > 3.7,
    `не провалился на стыке платформ (minY=${minY.toFixed(3)}, итог=${finalY.toFixed(3)}, ожидалось 3.9)`);
}

console.log(`\nИтого: ${pass} ok, ${fail} ошибок`);
process.exit(fail ? 1 : 0);
