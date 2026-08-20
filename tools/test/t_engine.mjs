// Тест ядра движка без DOM/WebGL: сцена, объекты, компоненты, сериализация.
import { Scene } from '../../src/engine/core/scene.js';
import { GameObject } from '../../src/engine/core/gameobject.js';
import { Component, registerComponent, resolveComponent } from '../../src/engine/core/component.js';
import { Mathf, RandomState, Random, Noise, uuid } from '../../src/engine/core/math.js';
import '../../src/engine/components/gameplay.js';
import '../../src/engine/physics/components.js';
import '../../src/engine/rendering/components.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok    ' + m); } else { fail++; console.log('  FAIL  ' + m); } };

console.log('\n— математика —');
ok(Mathf.clamp(5, 0, 1) === 1, 'clamp');
ok(Mathf.lerp(0, 10, 0.5) === 5, 'lerp');
ok(Math.abs(Mathf.Deg2Rad * 180 - Math.PI) < 1e-9, 'Deg2Rad');
const r = new RandomState(42), r2 = new RandomState(42);
ok(r.next() === r2.next(), 'детерминированный RandomState по сиду');
const n = Noise.perlin2(1.5, 2.5);
ok(n >= -1.5 && n <= 1.5, 'Noise.perlin2 в диапазоне');
ok(uuid().length >= 8 && uuid() !== uuid(), 'uuid уникален');

console.log('\n— граф сцены —');
const scene = new Scene('Тест');
const a = scene.createGameObject('A', { position: [1, 2, 3] });
const b = scene.createGameObject('B', { parent: a.transform });
ok(scene.find('A') === a, 'find по имени');
ok(b.transform.parent === a.transform, 'иерархия родитель/потомок');
ok(a.transform.children.length === 1, 'children');
ok(a.transform.position.x === 1 && a.transform.position.z === 3, 'позиция');

a.tag = 'Player';
ok(scene.findByTag('Player') === a, 'findByTag');

console.log('\n— компоненты —');
class Spinner extends Component {
  static componentName = 'Spinner';
  // сериализуются только поля, объявленные в inspector
  static inspector = { speed: { type: 'number', default: 90 } };
  speed = 90;
  onUpdate() {}
}
registerComponent('Spinner', Spinner);
ok(resolveComponent('Spinner') === Spinner, 'реестр компонентов');
const sp = b.addComponent(Spinner);
ok(b.getComponent(Spinner) === sp, 'addComponent/getComponent');
sp.speed = 270;

console.log('\n— встроенные компоненты зарегистрированы —');
for (const name of ['Camera', 'Light', 'MeshRenderer', 'Rigidbody', 'PlayerController', 'Health', 'Rotator']) {
  ok(!!resolveComponent(name), `есть ${name}`);
}

console.log('\n— сериализация —');
const data = scene.serialize();
ok(data.version === 1, 'version=1');
ok(Array.isArray(data.objects) && data.objects.length >= 1, 'objects[]');
const json = JSON.stringify(data);
ok(json.length > 20, 'сериализуется в JSON');

const restored = Scene.deserialize(JSON.parse(json), null);
const ra = restored.find('A');
const rb = restored.find('B');
ok(!!ra && !!rb, 'объекты восстановлены');
ok(rb.transform.parent === ra.transform, 'иерархия восстановлена');
ok(Math.abs(ra.transform.position.x - 1) < 1e-6, 'позиция восстановлена');
const rsp = rb.getComponent(Spinner);
ok(!!rsp && rsp.speed === 270, 'состояние компонента восстановлено');

console.log('\n— уничтожение —');
const cnt = restored.gameObjects?.length ?? 0;
rb.destroy?.();
restored.update?.(0.016);
ok((restored.gameObjects?.length ?? 0) <= cnt, 'destroy не ломает сцену');

console.log(`\nИтого: ${pass} ok, ${fail} ошибок`);
process.exit(fail ? 1 : 0);
