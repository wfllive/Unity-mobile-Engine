// Проверка оболочки приложения без браузера: хранилище проектов,
// шаблоны сцен и набор иконок. DOM-часть (главный экран) проверяется
// отдельно в tools/test/manual/shell-ui-smoke.mjs, где нужен jsdom.

import {
  listProjects, createProject, saveProject, loadProject, deleteProject,
  duplicateProject, exportProject, importProject, uniqueName, slugify,
  formatSize, formatDate, getLastOpened, setLastOpened, totalSize,
} from '../../src/shell/projects.js';
import { icon, iconEl, hasIcon, iconNames, iconForThing } from '../../src/ui/icons.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok    ' + m); } else { fail++; console.log('  FAIL  ' + m); } };
const eq = (a, b, m) => ok(a === b, `${m} (получено: ${JSON.stringify(a)})`);

/* ==================== Хранилище проектов ==================== */
console.log('\nПроекты:');
eq(listProjects().length, 0, 'изначально проектов нет');

const p1 = createProject({ name: 'Моя игра', templateId: 'empty' });
ok(!!p1.id, 'проект создан и получил id');
eq(p1.name, 'Моя игра', 'имя сохранено');
eq(listProjects().length, 1, 'проект попал в список');

// Имена не должны конфликтовать
const p2 = createProject({ name: 'Моя игра' });
eq(p2.name, 'Моя игра (2)', 'дубликат имени получает суффикс');
eq(uniqueName('Моя игра'), 'Моя игра (3)', 'uniqueName учитывает уже занятые');

// Сохранение сцены
const scene = { version: 1, name: 'S', settings: {}, objects: [{ name: 'Куб', id: '1', components: [] }] };
saveProject(p1.id, { scene });
const loaded = loadProject(p1.id);
eq(loaded.scene.objects.length, 1, 'сцена сохранена и прочитана');
eq(loaded.objects, 1, 'счётчик объектов обновился в метаданных');
ok(loaded.build.packageName.startsWith('com.wfl.'), `имя пакета сгенерировано: ${loaded.build.packageName}`);

// Переименование меняет и имя приложения в сборке
saveProject(p1.id, { name: 'Переименованная' });
const renamed = loadProject(p1.id);
eq(renamed.name, 'Переименованная', 'проект переименован');
eq(renamed.build.appName, 'Переименованная', 'имя приложения синхронизировано');
eq(renamed.scene.objects.length, 1, 'сцена не потерялась при переименовании');

// Настройки сборки правятся частично
saveProject(p1.id, { build: { versionCode: 7 } });
const b = loadProject(p1.id).build;
eq(b.versionCode, 7, 'versionCode обновлён');
eq(b.appName, 'Переименованная', 'остальные настройки сборки не затёрты');

// Копия
const copy = duplicateProject(p1.id);
ok(copy.name.includes('копия'), `копия названа «${copy.name}»`);
eq(loadProject(copy.id).scene.objects.length, 1, 'сцена скопирована');
eq(listProjects().length, 3, 'копия добавлена в список');

// Экспорт / импорт
const dump = exportProject(p1.id);
eq(dump.format, 'wfl-project', 'экспорт помечен форматом');
const back = importProject(JSON.parse(JSON.stringify(dump)));
eq(back.scene.objects.length, 1, 'импорт восстановил сцену');
eq(listProjects().length, 4, 'импортированный проект добавлен');

let threw = false;
try { importProject({ foo: 1 }); } catch { threw = true; }
ok(threw, 'импорт чужого файла отклонён');

// Последний открытый
setLastOpened(p1.id);
eq(getLastOpened(), p1.id, 'запомнен последний открытый проект');

// Удаление
ok(deleteProject(copy.id), 'копия удалена');
eq(listProjects().length, 3, 'список уменьшился');
eq(loadProject(copy.id), null, 'удалённый проект не читается');
ok(!deleteProject('нет-такого'), 'удаление несуществующего возвращает false');

deleteProject(p1.id);
eq(getLastOpened(), null, 'ссылка на последний проект сброшена вместе с ним');

ok(totalSize() > 0, `суммарный размер считается: ${formatSize(totalSize())}`);

/* ==================== Утилиты ==================== */
console.log('\nУтилиты:');
eq(slugify('Моя Игра'), 'moyaigra', 'транслитерация русского имени');
eq(slugify('Test-Game 2!'), 'testgame2', 'спецсимволы вычищены');
ok(slugify('').length === 0, 'пустое имя даёт пустой slug');
eq(formatSize(0), '0 Б', 'нулевой размер');
eq(formatSize(2048), '2.0 КБ', 'килобайты');
ok(formatSize(3 * 1024 * 1024).endsWith('МБ'), 'мегабайты');
eq(formatDate(Date.now() - 5000), 'только что', 'свежая дата');
eq(formatDate(Date.now() - 3600 * 1000 * 3), '3 ч назад', 'часы назад');
eq(formatDate(null), '—', 'пустая дата');

/* ==================== Иконки ==================== */
console.log('\nИконки:');
const names = iconNames();
ok(names.length > 40, `в наборе ${names.length} иконок`);
ok(icon('play').startsWith('<svg'), 'иконка отдаётся как svg');
ok(icon('play').includes('width="20"'), 'размер по умолчанию 20');
ok(icon('play', 32).includes('width="32"'), 'размер настраивается');
eq(icon('такой-нет'), '', 'неизвестная иконка даёт пустую строку');
ok(hasIcon('trash') && !hasIcon('нет'), 'hasIcon работает');
ok(icon('play').includes('fill="currentColor"'), 'заливка play наследует цвет');
ok(icon('trash').includes('stroke="currentColor"'), 'обводка наследует цвет');
eq(iconForThing('sphere'), 'sphere', 'иконка для сферы');
eq(iconForThing('MeshRenderer'), 'cube', 'иконка для меша');
eq(iconForThing('Rigidbody'), 'physics', 'иконка для физики');
eq(iconForThing('НетТакого'), 'component', 'запасная иконка');

// Все иконки должны быть валидным XML
const bad = names.filter((n) => {
  const svg = icon(n);
  const open = (svg.match(/</g) ?? []).length;
  const close = (svg.match(/>/g) ?? []).length;
  return open !== close || !svg.endsWith('</svg>');
});
eq(bad.length, 0, `все ${names.length} иконок структурно корректны`);

// iconEl без DOM должен не падать, а вернуть null-совместимое поведение
ok(typeof iconEl === 'function', 'iconEl экспортирован');

console.log(`\nИтого: ${pass} успешно, ${fail} ошибок`);
process.exit(fail ? 1 : 0);
