// WFL Engine — проверка целостности копии проекта.
//
// Отвечает на вопрос «почему Vite пишет Failed to resolve import».
// Почти всегда причина одна: копия проекта неполная (скачан ZIP и
// распакован не до конца, оборвалась загрузка, антивирус съел файл).
// Скрипт обходит все относительные импорты и показывает, чего не хватает.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['src', 'tools'];
const SKIP = /node_modules|[/\\]\.git|[/\\]dist|[/\\]build/;

// Файлы, которые генерируются и в репозитории отсутствуют намеренно.
const GENERATED = new Set([path.join('src', 'apk', 'runtime-bundle.js')]);

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (SKIP.test(p)) continue;
    if (e.isDirectory()) walk(p, out);
    else if (/\.(m?js)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Вырезает строки и комментарии, чтобы не ловить импорты из JSDoc и текста */
function stripNoise(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // блочные комментарии (и JSDoc)
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); // строчные
}

const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
const missing = [];
const generatedMissing = [];
let checked = 0;

for (const file of files) {
  const src = stripNoise(fs.readFileSync(file, 'utf8'));
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*)['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1];
    checked++;
    const target = path.resolve(path.dirname(file), spec);
    if (fs.existsSync(target)) continue;
    const rel = path.relative(ROOT, target);
    (GENERATED.has(rel) ? generatedMissing : missing).push({
      from: path.relative(ROOT, file),
      spec,
      rel,
    });
  }
}

// Ключевые файлы, без которых проект просто не поднимется
const ESSENTIAL = [
  'package.json', 'vite.config.js', 'index.html',
  'src/main.js', 'src/engine/index.js', 'src/apk/builder.js',
  'src/editor/editor.js', 'src/shell/app.js',
];
const essentialMissing = ESSENTIAL.filter((p) => !fs.existsSync(path.join(ROOT, p)));

console.log(c.bold('\nWFL Engine — проверка целостности\n'));
console.log(`  просканировано файлов:   ${files.length}`);
console.log(`  проверено импортов:      ${checked}`);

if (essentialMissing.length) {
  console.log(c.red(`\n  ✗ Отсутствуют ключевые файлы (${essentialMissing.length}):`));
  for (const p of essentialMissing) console.log(c.red(`      ${p}`));
}

if (missing.length) {
  const uniq = [...new Set(missing.map((x) => x.rel))];
  console.log(c.red(`\n  ✗ Битые импорты: ${missing.length} (нет ${uniq.length} файлов)\n`));
  for (const x of missing.slice(0, 40)) {
    console.log(`      ${c.yellow(x.from)}`);
    console.log(`        → ${c.red(x.rel)}  ${c.dim('(' + x.spec + ')')}`);
  }
  if (missing.length > 40) console.log(c.dim(`      … и ещё ${missing.length - 40}`));
}

if (generatedMissing.length) {
  console.log(c.yellow('\n  ! Не собран генерируемый бандл рантайма:'));
  console.log(c.yellow('      src/apk/runtime-bundle.js'));
  console.log(c.dim('      Лечится:  npm run build:runtime'));
}

const broken = essentialMissing.length || missing.length;
if (broken) {
  console.log(c.red(c.bold('\n  Копия проекта НЕПОЛНАЯ.\n')));
  console.log('  Надёжнее всего забрать проект через git, а не ZIP:\n');
  console.log(c.bold('    git clone -b arena/01a01ed8-unity-mobile-engine \\'));
  console.log(c.bold('      https://github.com/wfllive/Unity-mobile-Engine.git'));
  console.log(c.bold('    cd Unity-mobile-Engine && npm install && npm run dev\n'));
  console.log(c.dim('  Если проект уже склонирован — обновить и починить файлы:\n'));
  console.log(c.dim('    git fetch origin arena/01a01ed8-unity-mobile-engine'));
  console.log(c.dim('    git reset --hard FETCH_HEAD\n'));
  process.exit(1);
}

console.log(c.green(c.bold('\n  ✓ Все импорты разрешаются, копия целая.\n')));
if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
  console.log(c.yellow('  ! node_modules нет — выполните npm install\n'));
}
