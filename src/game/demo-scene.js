// WFL Engine — демонстрационная сцена: паркур-арена со сбором кристаллов и врагами
import {
  THREE, RandomState,
  CameraComponent, LightComponent, MeshRenderer, ParticleSystem, Skybox,
  Rigidbody, BoxCollider, SphereCollider, CapsuleCollider, CharacterController,
  PlayerController, Health, ChaseAI, Pickup, Rotator, Floater, KillZone, Spawner,
  WorldLabel,
} from '../engine/index.js';

/**
 * Строит демонстрационную сцену.
 * @param {import('../engine/index.js').Engine} engine
 */
export function buildDemoScene(engine) {
  const scene = engine.createScene('Демо-арена');
  scene.environment.background = new THREE.Color(0x0a0f1c);
  scene.root.background = scene.environment.background;
  scene.root.fog = new THREE.Fog(0x0a0f1c, 40, 140);

  /* ---------- Освещение ---------- */
  scene.createGameObject('Ambient', {
    components: [[LightComponent, { lightType: 'hemisphere', intensity: 0.55, color: new THREE.Color(0x8fb4ff) }]],
  });

  const sun = scene.createGameObject('Солнце', { position: new THREE.Vector3(18, 28, 14) });
  sun.addComponent(LightComponent, {
    lightType: 'directional', intensity: 1.35,
    color: new THREE.Color(0xfff2dd), castShadows: true, shadowMapSize: 2048,
  });
  sun.transform.lookAt(new THREE.Vector3(0, 0, 0));

  scene.createGameObject('Небо', {
    components: [[Skybox, {
      topColor: new THREE.Color(0x1b3a6b), bottomColor: new THREE.Color(0x0a0f1c), exponent: 0.7,
    }]],
  });

  /* ---------- Земля ---------- */
  const ground = scene.createGameObject('Земля', {
    position: new THREE.Vector3(0, -0.5, 0), tag: 'Ground',
  });
  ground.layer = 7;
  ground.isStatic = true;
  ground.addComponent(MeshRenderer, {
    geometryType: 'box',
    geometryParams: { width: 120, height: 1, depth: 120 },
    color: new THREE.Color(0x1d2740), roughness: 0.95, metalness: 0.02, castShadow: false,
  });
  ground.addComponent(BoxCollider, { size: new THREE.Vector3(120, 1, 120) });

  // Сетка для ориентации
  const grid = new THREE.GridHelper(120, 60, 0x2f4570, 0x1a2540);
  grid.position.y = 0.02;
  grid.material.opacity = 0.4;
  grid.material.transparent = true;
  scene.root.add(grid);

  /* ---------- Платформы ---------- */
  const platformSpecs = [
    [0, 1.2, -10, 8, 0.5, 8, 0x2b4a7a],
    [-12, 2.6, -4, 5, 0.5, 5, 0x2b4a7a],
    [11, 3.8, -2, 5, 0.5, 5, 0x2b4a7a],
    [0, 5.4, 6, 6, 0.5, 6, 0x2b4a7a],
    [-16, 6.8, 10, 4, 0.5, 4, 0x3a5f9e],
    [16, 8.2, 12, 4, 0.5, 4, 0x3a5f9e],
    [0, 9.6, 18, 7, 0.5, 7, 0x4a76bd],
  ];
  platformSpecs.forEach(([x, y, z, w, h, d, color], i) => {
    const p = scene.createGameObject(`Платформа ${i + 1}`, { position: new THREE.Vector3(x, y, z), tag: 'Ground' });
    p.layer = 7;
    p.isStatic = true;
    p.addComponent(MeshRenderer, {
      geometryType: 'box', geometryParams: { width: w, height: h, depth: d },
      color: new THREE.Color(color), roughness: 0.6, metalness: 0.25,
      emissive: new THREE.Color(color).multiplyScalar(0.12),
    });
    p.addComponent(BoxCollider, { size: new THREE.Vector3(w, h, d) });
  });

  // Движущаяся платформа
  const mover = scene.createGameObject('Движущаяся платформа', { position: new THREE.Vector3(6, 2.4, 2), tag: 'Ground' });
  mover.layer = 7;
  mover.addComponent(MeshRenderer, {
    geometryType: 'box', geometryParams: { width: 4, height: 0.4, depth: 4 },
    color: new THREE.Color(0xd98a35), metalness: 0.4, roughness: 0.4,
    emissive: new THREE.Color(0x2a1a08),
  });
  mover.addComponent(BoxCollider, { size: new THREE.Vector3(4, 0.4, 4) });
  mover.addComponent(Floater, { amplitude: 3, frequency: 0.22, axis: new THREE.Vector3(1, 0, 0) });

  /* ---------- Декоративные колонны ---------- */
  const rng = new RandomState(1337);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = 30 + rng.range(-4, 6);
    const h = rng.range(4, 13);
    const col = scene.createGameObject(`Колонна ${i}`, {
      position: new THREE.Vector3(Math.cos(a) * r, h / 2, Math.sin(a) * r),
    });
    col.isStatic = true;
    col.layer = 7;
    col.addComponent(MeshRenderer, {
      geometryType: 'cylinder',
      geometryParams: { radiusTop: 1.1, radiusBottom: 1.4, height: h, radialSegments: 8 },
      color: new THREE.Color(0x223252), roughness: 0.85, metalness: 0.1,
    });
    col.addComponent(BoxCollider, { size: new THREE.Vector3(2.4, h, 2.4) });
  }

  /* ---------- Игрок ---------- */
  const player = scene.createGameObject('Игрок', { position: new THREE.Vector3(0, 2, 8), tag: 'Player' });
  player.layer = 5;
  player.addComponent(MeshRenderer, {
    geometryType: 'capsule', geometryParams: { radius: 0.4, length: 1, capSegments: 6, radialSegments: 12 },
    color: new THREE.Color(0x4fd1c5), metalness: 0.3, roughness: 0.4,
    emissive: new THREE.Color(0x0d3b38), emissiveIntensity: 1.4,
  });
  player.addComponent(CapsuleCollider, { radius: 0.4, height: 1.8 });
  player.addComponent(CharacterController, { radius: 0.4, height: 1.8, stepOffset: 0.45, slopeLimit: 48 });
  player.addComponent(Health, { maxHealth: 100, currentHealth: 100, regenRate: 2 });
  player.addComponent(KillZone, { minY: -12, respawn: true, respawnPoint: new THREE.Vector3(0, 3, 8) });
  const pc = player.addComponent(PlayerController, {
    moveSpeed: 6, sprintMultiplier: 1.7, jumpHeight: 2.1,
    mode: 'thirdPerson', thirdPersonDistance: 7, canDoubleJump: true,
  });

  // Камера — дочерний объект игрока (режим 3-го лица)
  const camGO = scene.createGameObject('Главная камера', { parent: player, position: new THREE.Vector3(0, 2.2, 7) });
  const cam = camGO.addComponent(CameraComponent, {
    fieldOfView: engine.isMobile ? 68 : 60, nearClipPlane: 0.1, farClipPlane: 400, isMainCamera: true,
  });
  scene.mainCamera = cam;
  pc.cameraTransform = camGO.transform;

  /* ---------- Кристаллы (сбор) ---------- */
  const crystalPositions = [
    [0, 2.2, -10], [-12, 3.6, -4], [11, 4.8, -2], [0, 6.4, 6],
    [-16, 7.8, 10], [16, 9.2, 12], [0, 10.6, 18],
    [5, 1.2, 12], [-6, 1.2, 14], [9, 1.2, -14], [-9, 1.2, -16],
  ];
  for (const [x, y, z] of crystalPositions) {
    const c = scene.createGameObject('Кристалл', { position: new THREE.Vector3(x, y, z) });
    c.addComponent(MeshRenderer, {
      geometryType: 'octahedron', geometryParams: { radius: 0.42, detail: 0 },
      color: new THREE.Color(0xffd166), metalness: 0.7, roughness: 0.15,
      emissive: new THREE.Color(0xffb700), emissiveIntensity: 1.8,
    });
    c.addComponent(Rotator, { speed: new THREE.Vector3(0, 110, 25) });
    c.addComponent(Floater, { amplitude: 0.28, frequency: 0.6, phase: Math.random() * 6 });
    c.addComponent(Pickup, { pickupType: 'score', amount: 10, radius: 1.4, targetTag: 'Player', rotateSpeed: 0 });
    c.addComponent(LightComponent, { lightType: 'point', intensity: 1.2, range: 5, color: new THREE.Color(0xffc04d), castShadows: false });
  }

  /* ---------- Аптечки ---------- */
  for (const [x, y, z] of [[-20, 1.2, 0], [20, 1.2, 4], [0, 1.2, -22]]) {
    const h = scene.createGameObject('Аптечка', { position: new THREE.Vector3(x, y, z) });
    h.addComponent(MeshRenderer, {
      geometryType: 'box', geometryParams: { width: 0.7, height: 0.7, depth: 0.7 },
      color: new THREE.Color(0x3ecf8e), emissive: new THREE.Color(0x0f5a3c), emissiveIntensity: 1.5,
      metalness: 0.2, roughness: 0.35,
    });
    h.addComponent(Rotator, { speed: new THREE.Vector3(30, 60, 0) });
    h.addComponent(Pickup, { pickupType: 'health', amount: 35, radius: 1.5, respawnTime: 20, rotateSpeed: 0 });
  }

  /* ---------- Враги ---------- */
  function makeEnemy(pos) {
    const e = scene.createGameObject('Страж', { position: pos, tag: 'Enemy' });
    e.layer = 6;
    e.addComponent(MeshRenderer, {
      geometryType: 'dodecahedron', geometryParams: { radius: 0.6, detail: 0 },
      color: new THREE.Color(0xe0525c), metalness: 0.55, roughness: 0.3,
      emissive: new THREE.Color(0x4a0d12), emissiveIntensity: 1.6,
    });
    e.addComponent(CapsuleCollider, { radius: 0.55, height: 1.4 });
    e.addComponent(CharacterController, { radius: 0.55, height: 1.4, stepOffset: 0.4 });
    e.addComponent(Health, { maxHealth: 60, destroyOnDeath: true });
    e.addComponent(ChaseAI, {
      targetTag: 'Player', speed: 3.1, detectionRange: 18,
      attackRange: 1.9, attackDamage: 9, attackCooldown: 1.1, patrolRadius: 9,
    });
    e.addComponent(Rotator, { speed: new THREE.Vector3(0, 55, 0) });
    e.addComponent(WorldLabel, { text: 'Страж', offsetY: 1.5, showHealthBar: true, maxDistance: 35 });
    return e;
  }
  for (const p of [[-18, 1.2, -12], [18, 1.2, -10], [-4, 1.2, 22], [22, 1.2, 18]]) {
    makeEnemy(new THREE.Vector3(...p));
  }

  // Спавнер врагов
  const spawner = scene.createGameObject('Спавнер', { position: new THREE.Vector3(0, 1.2, -26) });
  const sp = spawner.addComponent(Spawner, { interval: 12, maxAlive: 7, radius: 10, autoStart: true });
  sp.factory = (pos) => makeEnemy(pos);

  /* ---------- Физические ящики ---------- */
  for (let i = 0; i < 12; i++) {
    const b = scene.createGameObject(`Ящик ${i}`, {
      position: new THREE.Vector3(rng.range(-14, 14), 3 + i * 1.4, rng.range(-14, 14)),
    });
    const s = rng.range(0.6, 1.1);
    b.addComponent(MeshRenderer, {
      geometryType: 'box', geometryParams: { width: s, height: s, depth: s },
      color: new THREE.Color().setHSL(rng.next(), 0.5, 0.55), roughness: 0.65, metalness: 0.15,
    });
    b.addComponent(BoxCollider, { size: new THREE.Vector3(s, s, s) });
    b.addComponent(Rigidbody, { mass: s * 2, drag: 0.05, angularDrag: 0.4, useGravity: true });
  }

  // Мячи
  for (let i = 0; i < 6; i++) {
    const s = scene.createGameObject(`Мяч ${i}`, {
      position: new THREE.Vector3(rng.range(-8, 8), 8 + i, rng.range(-8, 8)),
    });
    const r = rng.range(0.35, 0.6);
    s.addComponent(MeshRenderer, {
      geometryType: 'sphere', geometryParams: { radius: r, widthSegments: 16, heightSegments: 12 },
      color: new THREE.Color().setHSL(rng.next(), 0.7, 0.55), roughness: 0.25, metalness: 0.5,
    });
    const sc = s.addComponent(SphereCollider, { radius: r });
    sc.material.bounciness = 0.6;
    sc.material.friction = 0.3;
    s.addComponent(Rigidbody, { mass: r * 3, drag: 0.02, angularDrag: 0.1 });
  }

  /* ---------- Частицы ---------- */
  const dust = scene.createGameObject('Пыль', { position: new THREE.Vector3(0, 6, 0) });
  dust.addComponent(ParticleSystem, {
    maxParticles: 240, emissionRate: 24, lifetime: 9, startSpeed: 0.35,
    startSize: 0.1, endSize: 0.02,
    startColor: new THREE.Color(0x9fc4ff), endColor: new THREE.Color(0x2b4570),
    spread: 180, gravityModifier: -0.008, loop: true, additive: true, worldSpace: true,
  });

  return { scene, player, cam, playerController: pc };
}
