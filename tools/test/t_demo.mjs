// Проверка демо-сцены без DOM/WebGL: сборка, сериализация, восстановление.
import { Scene } from '../../src/engine/core/scene.js';
import { buildDemoScene } from '../../src/game/demo-scene.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok    ' + m); } else { fail++; console.log('  FAIL  ' + m); } };

// Минимальная заглушка движка
const fakeEngine = {
  isMobile: false,
  createScene(name) { const s = new Scene(name); s.engine = this; return s; },
};

const built = buildDemoScene(fakeEngine);
const scene = built.scene;
ok(!!scene && Array.isArray(scene.gameObjects), 'сцена построена');
ok(!!built.player && !!built.cam, 'возвращены player и cam');
ok(scene.gameObjects.length > 5, `объектов в сцене: ${scene.gameObjects.length}`);
ok(!!built.playerController, 'есть PlayerController');

const json = JSON.stringify(scene.serialize());
ok(json.length > 100, `сериализация ${(json.length / 1024).toFixed(1)} КБ`);

const back = Scene.deserialize(JSON.parse(json), null);
ok(back.gameObjects.length === scene.gameObjects.length,
  `восстановлено объектов: ${back.gameObjects.length} из ${scene.gameObjects.length}`);

const json2 = JSON.stringify(back.serialize());
ok(json2.length === json.length, 'повторная сериализация стабильна');

console.log(`\nИтого: ${pass} ok, ${fail} ошибок`);
process.exit(fail ? 1 : 0);
