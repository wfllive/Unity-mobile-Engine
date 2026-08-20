// WFL Engine — хранилище проектов.
//
// Проект = имя + настройки сборки + данные сцены. Всё лежит в localStorage,
// поэтому движок остаётся полностью клиентским: ни сервера, ни аккаунтов.
// Модуль не зависит от DOM, чтобы его можно было проверять тестами в Node.

const INDEX_KEY = 'wfl:projects';
const PROJECT_KEY = (id) => `wfl:project:${id}`;
const LAST_KEY = 'wfl:last-project';
const SCHEMA = 1;

/** Доступное хранилище: localStorage в браузере, объект-заглушка в Node */
function store() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* доступ запрещён политикой браузера */ }
  if (!store._mem) {
    const m = new Map();
    store._mem = {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
    };
  }
  return store._mem;
}

function uid() {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `p${Date.now().toString(36)}${rnd}`;
}

function readJSON(key, fallback) {
  try {
    const raw = store().getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}

function writeJSON(key, value) {
  store().setItem(key, JSON.stringify(value));
}

/** Человекочитаемый размер */
export function formatSize(bytes) {
  if (!bytes) return '0 Б';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(2)} МБ`;
}

/** «5 минут назад», «вчера», «12 марта» */
export function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  if (diff < 172800) return 'вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

/** Настройки сборки по умолчанию для нового проекта */
function defaultBuild(name) {
  const translit = slugify(name);
  return {
    appName: name,
    packageName: `com.wfl.${translit || 'game'}`,
    versionName: '1.0',
    versionCode: 1,
    orientation: 'landscape',
    minSdk: 21,
  };
}

/** Русское имя → латинский идентификатор для имени пакета */
export function slugify(name) {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
    й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
    э: 'e', ю: 'yu', я: 'ya',
  };
  return String(name).toLowerCase().split('')
    .map((ch) => (map[ch] ?? ch))
    .join('')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 24);
}

/**
 * Список проектов (только метаданные, без сцен) — свежие сверху.
 * @returns {Array<{id,name,created,modified,size,templateId}>}
 */
export function listProjects() {
  const idx = readJSON(INDEX_KEY, null);
  if (!Array.isArray(idx)) return [];
  return idx
    .filter((p) => p && p.id)
    .sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0));
}

function writeIndex(list) { writeJSON(INDEX_KEY, list); }

/** Метаданные одного проекта */
export function getMeta(id) {
  return listProjects().find((p) => p.id === id) ?? null;
}

/** Полные данные проекта вместе со сценой */
export function loadProject(id) {
  const meta = getMeta(id);
  if (!meta) return null;
  const data = readJSON(PROJECT_KEY(id), null);
  if (!data) return null;
  return { ...meta, ...data, id };
}

/** Уникальное имя вида «Мой проект (2)» */
export function uniqueName(base) {
  const names = new Set(listProjects().map((p) => p.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

/**
 * Создать проект.
 * @param {object} opts
 * @param {string} opts.name
 * @param {object|null} [opts.scene] сериализованная сцена
 * @param {string} [opts.templateId] какой шаблон использован
 */
export function createProject({ name = 'Новый проект', scene = null, templateId = 'empty' } = {}) {
  const id = uid();
  const now = Date.now();
  const finalName = uniqueName(String(name).trim() || 'Новый проект');
  const body = {
    schema: SCHEMA,
    scene: scene ?? null,
    build: defaultBuild(finalName),
  };
  writeJSON(PROJECT_KEY(id), body);
  const meta = {
    id,
    name: finalName,
    templateId,
    created: now,
    modified: now,
    size: JSON.stringify(body).length,
    objects: scene?.objects?.length ?? 0,
  };
  writeIndex([meta, ...listProjects()]);
  return { ...meta, ...body };
}

/**
 * Обновить проект. Передавайте только изменившиеся поля.
 * @param {string} id
 * @param {{name?:string, scene?:object, build?:object}} patch
 */
export function saveProject(id, patch = {}) {
  const list = listProjects();
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) return null;
  const body = readJSON(PROJECT_KEY(id), { schema: SCHEMA, scene: null, build: defaultBuild(list[i].name) });

  if (patch.scene !== undefined) body.scene = patch.scene;
  if (patch.build !== undefined) body.build = { ...body.build, ...patch.build };
  writeJSON(PROJECT_KEY(id), body);

  const meta = { ...list[i] };
  if (patch.name !== undefined) {
    const trimmed = String(patch.name).trim();
    if (trimmed && trimmed !== meta.name) {
      meta.name = uniqueName(trimmed);
      body.build.appName = meta.name;
      writeJSON(PROJECT_KEY(id), body);
    }
  }
  meta.modified = Date.now();
  meta.size = JSON.stringify(body).length;
  meta.objects = body.scene?.objects?.length ?? 0;
  list[i] = meta;
  writeIndex(list);
  return { ...meta, ...body };
}

/** Удалить проект без возможности восстановления */
export function deleteProject(id) {
  const list = listProjects();
  const next = list.filter((p) => p.id !== id);
  if (next.length === list.length) return false;
  writeIndex(next);
  store().removeItem(PROJECT_KEY(id));
  if (getLastOpened() === id) setLastOpened(null);
  return true;
}

/** Копия проекта со сценой и настройками */
export function duplicateProject(id) {
  const src = loadProject(id);
  if (!src) return null;
  const copy = createProject({
    name: uniqueName(`${src.name} — копия`),
    scene: src.scene,
    templateId: src.templateId,
  });
  return saveProject(copy.id, { build: { ...src.build, appName: copy.name } });
}

/** Экспорт в объект для .wflproj-файла */
export function exportProject(id) {
  const p = loadProject(id);
  if (!p) return null;
  return {
    format: 'wfl-project',
    schema: SCHEMA,
    name: p.name,
    exported: Date.now(),
    build: p.build,
    scene: p.scene,
  };
}

/** Импорт из .wflproj-файла */
export function importProject(data) {
  if (!data || data.format !== 'wfl-project') {
    throw new Error('Файл не похож на проект WFL');
  }
  const created = createProject({
    name: data.name ?? 'Импортированный проект',
    scene: data.scene ?? null,
    templateId: 'imported',
  });
  if (data.build) saveProject(created.id, { build: { ...data.build, appName: created.name } });
  return loadProject(created.id);
}

/** Какой проект был открыт последним */
export function getLastOpened() {
  try { return store().getItem(LAST_KEY) || null; } catch { return null; }
}
export function setLastOpened(id) {
  if (id) store().setItem(LAST_KEY, id);
  else store().removeItem(LAST_KEY);
}

/** Суммарный объём всех проектов */
export function totalSize() {
  return listProjects().reduce((s, p) => s + (p.size ?? 0), 0);
}
