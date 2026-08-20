# WFL Engine

Игровой движок на **three.js** для браузера и мобильных устройств: Unity-подобный API,
встроенный визуальный редактор и **собственная сборка APK — без Gradle, Android SDK и даже JDK**.

APK собирается целиком на JavaScript: DEX-байткод, бинарный `AndroidManifest.xml`,
`resources.arsc`, ZIP с zipalign и подписи **v1 + v2** генерируются с нуля.
Сборка занимает доли секунды и работает как в Node, так и прямо в браузере.

```bash
npm install
npm run dev        # редактор и игра на http://localhost:3000
npm run apk        # собрать game.apk
npm test           # 8 наборов тестов
```

---

## Возможности

**Ядро** — `GameObject` + `Component` + `Transform` поверх `Object3D`, полный жизненный цикл
(`awake / onEnable / start / fixedUpdate / update / lateUpdate / onRender / onDisable / onDestroy`),
корутины, события, префабы, сериализация сцен в JSON.

**Рендеринг** — камеры, свет (в т.ч. hemisphere), MeshRenderer, загрузка glTF, спрайты,
системы частиц, процедурный скайбокс, террейн, тени, 5 уровней качества с адаптивным
переключением по FPS.

**Физика** — собственный движок: Rigidbody, коллайдеры (box / sphere / capsule / plane / mesh),
`CharacterController` со скольжением по склонам, лучи, триггеры, слои, пространственный хеш.

**Ввод** — клавиатура, мышь, геймпад и мультитач; виртуальный джойстик, кнопки и зона обзора
подключаются автоматически на мобильных.

**Ещё** — аудио (3D-звук), анимации и твины, UI-система, менеджер ассетов, 12 готовых
геймплейных компонентов (`PlayerController`, `Health`, `ChaseAI`, `Spawner`, …).

**Blueprints** — визуальное программирование в духе Unreal: ~70 типов узлов
(события, ветвления и циклы, математика, векторы, трансформ, физика, ввод, аудио, UI,
таймеры, переменные), исполнение по потоку выполнения (exec-пины) и по данным,
защита от бесконечных циклов, изоляция ошибок в узле. Граф хранится в компоненте
`Blueprint` и переживает сериализацию сцены — то есть работает и внутри собранного APK.

**Редактор** (клавиша `F2`) — иерархия сцены, инспектор свойств, гизмо перемещения/поворота/
масштаба, хоткеи в стиле Unity (`W/E/R`, `Ctrl+D`, `F`, `Del`), сохранение в localStorage,
экспорт сцены и кнопка «Собрать APK».

**Редактор блюпринтов** (кнопка «🧩 Блюпринт») — узловой холст с кривыми связей,
палитрой узлов с поиском, автораскладкой, дублированием, проверкой графа и готовым
шаблоном. Панорама и зум работают и мышью, и жестами (щипок) — редактировать графы
можно прямо с телефона.

---

## Сборка APK

### Из командной строки

```bash
node tools/cli.mjs apk \
  --scene my.wflscene.json \
  --name "Моя игра" \
  --package com.studio.game \
  --out game.apk

node tools/cli.mjs keygen --out key.pem --cert cert.pem   # свой ключ подписи
node tools/cli.mjs apk --key key.pem --cert cert.pem      # переиспользовать ключ
node tools/cli.mjs info game.apk                          # содержимое и подписи
```

Полный список опций — `node tools/cli.mjs help`.
Установка на устройство: `adb install -r game.apk`.

> **Важно:** ключ подписи определяет «личность» приложения. Сохраните `key.pem` —
> без него Android не примет обновление уже установленной игры.

### Из браузера

`F2` → **Собрать APK**: сборщик работает через WebCrypto и отдаёт готовый файл
через обычную загрузку — сервер не участвует.

### Что внутри APK

Игра, движок и three.js инлайнятся в один `assets/index.html`, который открывается
в `WebView` из `file:///android_asset/` — интернет не нужен, приложение работает офлайн.
Типичный размер — **около 280 КБ**, сборка ~0.3 с.

| Файл | Назначение |
|---|---|
| `AndroidManifest.xml` | бинарный AXML, собирается `src/apk/axml.js` |
| `classes.dex` | `MainActivity` с WebView, ассемблер `src/apk/dex.js` |
| `resources.arsc` | таблица ресурсов, `src/apk/arsc.js` |
| `res/drawable/ic_launcher.png` | иконка, генерируется процедурно |
| `assets/index.html` | игра целиком одним файлом |
| `META-INF/*` | подпись v1; подпись v2 живёт в APK Signing Block |

Корректность проверена независимо: **androguard** (`is_valid_APK`, обе подписи),
пересчёт чанковых SHA-256 для v2 и проверка RSA через `cryptography`, разбор PKCS#7
для v1, контроль zipalign и CRC, `openssl` для сертификатов.

---

## Пример кода

```js
import { Engine, Component, registerComponent, THREE } from './src/engine/index.js';

const engine = new Engine({ container: document.body });
const scene = engine.createScene('Уровень');

scene.createGameObject('Куб', {
  position: [0, 1, 0],              // Vector3, [x,y,z] или {x,y,z}
  components: [[MeshRenderer, { geometry: 'box' }], Rigidbody],
});

class Spinner extends Component {
  static componentName = 'Spinner';
  static inspector = { speed: { type: 'number', default: 90 } };  // поля для инспектора
  speed = 90;
  update(dt) { this.transform.rotate(0, this.speed * dt, 0); }
}
registerComponent(Spinner);

engine.loadScene(scene);
engine.start();
```

Углы Эйлера — в **градусах** (порядок `YXZ`), `forward` = `(0, 0, -1)`, как в Unity.
Сериализуются только поля, объявленные в `static inspector`.

---

## Структура

```
src/engine/      ядро, рендеринг, физика, ввод, аудио, анимация, UI, ассеты
src/engine/blueprint/  граф, каталог узлов и компонент Blueprint
src/game/        демо-сцена (66 объектов) и игровая логика
src/editor/      редактор сцены, узловой редактор блюпринтов, диалог сборки APK
src/runtime/     плеер, запускающий игру внутри APK
src/apk/         сборщик APK: dex, axml, arsc, zip, подписи, ключи, иконка
tools/           CLI, сборка рантайма, тесты
```

## Тесты

```bash
npm test
```

Покрыто: математика и граф сцены, компоненты и сериализация (round-trip демо-сцены),
рантайм блюпринтов (154 проверки: каталог узлов, поток выполнения, циклы, защита от
зацикливания, изоляция ошибок, сериализация), генерация AXML/ARSC/DEX, сертификаты,
полная сборка APK и защита HTML от инъекций.

## Требования

Node.js 18+. Для проверки готового APK полезны `androguard` и `openssl`, но для сборки
они не нужны — **JDK и Android SDK не требуются**.

## Лицензия

MIT — см. [LICENSE](LICENSE).
