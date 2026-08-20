// WFL Engine — шаблоны стартовых сцен для новых проектов.
//
// Каждый шаблон строит сцену прямо через API движка и возвращает её
// в сериализованном виде — так проект сразу открывается и запускается.

// Импорт через общий модуль движка обязателен: он регистрирует компоненты,
// которые шаблоны добавляют по строковому имени.
import { THREE, Scene } from '../engine/index.js';
import { buildDemoScene } from '../game/demo-scene.js';

/** Заглушка движка: шаблоны строятся до создания реального Engine */
function makeHost() {
  return {
    isMobile: false,
    createScene(name) { const s = new Scene(name); s.engine = this; return s; },
  };
}

/** Пустая сцена: земля, свет, камера — минимум, чтобы что-то видеть */
function emptyScene(name) {
  const host = makeHost();
  const scene = host.createScene(name);
  scene.root.background = new THREE.Color(0x0d1220);
  scene.root.fog = new THREE.Fog(0x0d1220, 45, 160);

  scene.createGameObject('Освещение', {
    components: [['Light', { lightType: 'hemisphere', intensity: 0.6, color: new THREE.Color(0x9fc0ff) }]],
  });
  const sun = scene.createGameObject('Солнце', { position: [16, 24, 12] });
  sun.addComponent('Light', {
    lightType: 'directional', intensity: 1.25,
    color: new THREE.Color(0xfff0d8), castShadows: true,
  });
  sun.transform.lookAt(new THREE.Vector3(0, 0, 0));

  const ground = scene.createGameObject('Земля', { position: [0, -0.5, 0], tag: 'Ground' });
  ground.isStatic = true;
  ground.addComponent('MeshRenderer', {
    geometryType: 'box',
    geometryParams: { width: 60, height: 1, depth: 60 },
    color: new THREE.Color(0x1e2a44), roughness: 0.95, castShadow: false,
  });
  ground.addComponent('BoxCollider', { size: new THREE.Vector3(60, 1, 60) });

  const cam = scene.createGameObject('Камера', { position: [0, 8, 14] });
  cam.addComponent('Camera', { fieldOfView: 60, isMainCamera: true });
  cam.transform.lookAt(new THREE.Vector3(0, 1, 0));

  return scene;
}

/** Платформер: игрок от третьего лица + несколько платформ */
function platformerScene(name) {
  const scene = emptyScene(name);

  const player = scene.createGameObject('Игрок', { position: [0, 1.6, 6], tag: 'Player' });
  player.addComponent('MeshRenderer', {
    geometryType: 'capsule',
    geometryParams: { radius: 0.45, height: 1.1 },
    color: new THREE.Color(0x4fc3f7), metalness: 0.15, roughness: 0.45,
  });
  player.addComponent('CapsuleCollider', { radius: 0.45, height: 2 });
  player.addComponent('CharacterController', { radius: 0.45, height: 2 });
  player.addComponent('PlayerController', {
    moveSpeed: 6, sprintSpeed: 9.5, jumpHeight: 2.4, mode: 'thirdPerson',
  });
  player.addComponent('Health', { maxHealth: 100 });

  const spots = [
    [-6, 1.2, -2, 4, 0.5, 4, 0x2f4d7d],
    [0, 2.4, -7, 4, 0.5, 4, 0x35578c],
    [6, 3.6, -12, 4, 0.5, 4, 0x3d63a1],
  ];
  spots.forEach(([x, y, z, w, h, d, color], i) => {
    const p = scene.createGameObject(`Платформа ${i + 1}`, { position: [x, y, z] });
    p.isStatic = true;
    p.addComponent('MeshRenderer', {
      geometryType: 'box', geometryParams: { width: w, height: h, depth: d },
      color: new THREE.Color(color), roughness: 0.8,
    });
    p.addComponent('BoxCollider', { size: new THREE.Vector3(w, h, d) });
  });

  const cam = scene.find('Камера');
  if (cam) {
    cam.transform.position = new THREE.Vector3(0, 6, 12);
    cam.addComponent('FollowCamera', { target: null, distance: 8, height: 3.5 });
  }
  return scene;
}

/** Сцена-песочница для физики: башня из ящиков и шар */
function physicsScene(name) {
  const scene = emptyScene(name);
  for (let i = 0; i < 6; i++) {
    const b = scene.createGameObject(`Ящик ${i + 1}`, { position: [0, 0.6 + i * 1.05, 0] });
    b.addComponent('MeshRenderer', {
      geometryType: 'box',
      color: new THREE.Color(i % 2 ? 0xe0a44c : 0xd9803f), roughness: 0.7,
    });
    b.addComponent('BoxCollider');
    b.addComponent('Rigidbody', { mass: 1.2 });
  }
  const ball = scene.createGameObject('Шар', { position: [-7, 3.2, 0] });
  ball.addComponent('MeshRenderer', {
    geometryType: 'sphere', geometryParams: { radius: 0.8 },
    color: new THREE.Color(0x9fd3ff), metalness: 0.4, roughness: 0.25,
  });
  ball.addComponent('SphereCollider', { radius: 0.8 });
  ball.addComponent('Rigidbody', { mass: 6 });
  return scene;
}

/** Полное демо движка со сбором кристаллов */
function demoScene() {
  return buildDemoScene(makeHost()).scene;
}

/**
 * Каталог шаблонов. `build()` возвращает сериализованную сцену.
 * @type {Array<{id:string,title:string,desc:string,icon:string,build:(name:string)=>object}>}
 */
export const TEMPLATES = [
  {
    id: 'empty',
    title: 'Пустая сцена',
    desc: 'Земля, свет и камера. Чистый старт для своей игры.',
    icon: 'grid',
    build: (name) => emptyScene(name).serialize(),
  },
  {
    id: 'platformer',
    title: 'Платформер',
    desc: 'Игрок с управлением от третьего лица и платформы.',
    icon: 'gamepad',
    build: (name) => platformerScene(name).serialize(),
  },
  {
    id: 'physics',
    title: 'Физика',
    desc: 'Башня из ящиков и тяжёлый шар — песочница для экспериментов.',
    icon: 'physics',
    build: (name) => physicsScene(name).serialize(),
  },
  {
    id: 'demo',
    title: 'Демо-арена',
    desc: 'Готовая игра: кристаллы, враги, счёт и победа.',
    icon: 'crystal',
    build: () => demoScene().serialize(),
  },
];

/** Найти шаблон по идентификатору */
export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

/** Построить сцену по шаблону */
export function buildTemplateScene(id, projectName) {
  return getTemplate(id).build(projectName);
}
