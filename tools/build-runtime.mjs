// WFL Engine — сборка рантайм-бандла, который упаковывается в APK.
//
// Плеер (src/runtime/player.js) вместе с three.js собирается в один IIFE-файл.
// Результат сохраняется как ES-модуль, экспортирующий исходник строкой, —
// так его может использовать и браузерный сборщик APK, и CLI.
//
// Модуль можно и импортировать: `import { buildRuntime } from './build-runtime.mjs'`.
import { build } from 'esbuild';
import { writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = resolve(root, 'src/apk/runtime-bundle.js');
const ENTRY = resolve(root, 'src/runtime/player.js');

/** Самое свежее время изменения среди исходников движка и рантайма */
async function newestSourceMtime() {
  let newest = 0;
  const walk = async (dir) => {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      // Сам бандл — результат, а не источник: иначе сборка всегда «свежая»
      if (e.name === 'runtime-bundle.js') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith('.js')) {
        const { mtimeMs } = await stat(p);
        if (mtimeMs > newest) newest = mtimeMs;
      }
    }
  };
  await walk(resolve(root, 'src'));
  return newest;
}

/** Нужна ли пересборка: файла нет либо исходники новее его */
export async function isRuntimeStale() {
  if (!existsSync(OUT_FILE)) return true;
  const out = statSync(OUT_FILE).mtimeMs;
  return (await newestSourceMtime()) > out;
}

/**
 * Собрать рантайм в src/apk/runtime-bundle.js.
 * @param {object} [opts]
 * @param {boolean} [opts.minify=true]
 * @param {boolean} [opts.quiet=false]  не печатать в консоль
 * @param {boolean} [opts.force=false]  собрать даже если бандл свежий
 * @returns {Promise<{path:string, size:number, skipped:boolean}>}
 */
export async function buildRuntime({ minify = true, quiet = false, force = false } = {}) {
  const log = quiet ? () => {} : (...a) => console.log(...a);

  if (!force && !(await isRuntimeStale())) {
    const { size } = await stat(OUT_FILE);
    log('WFL: рантайм актуален, пересборка не нужна');
    return { path: OUT_FILE, size, skipped: true };
  }

  log('WFL: сборка рантайма для APK…');

  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    minify,
    legalComments: 'none',
    write: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: quiet ? 'silent' : 'warning',
  });

  const code = result.outputFiles[0].text;

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(
    OUT_FILE,
    '// СГЕНЕРИРОВАНО автоматически: tools/build-runtime.mjs — не редактировать вручную.\n' +
    '/* eslint-disable */\n' +
    `export const RUNTIME_JS = ${JSON.stringify(code)};\n` +
    `export const RUNTIME_SIZE = ${code.length};\n`,
    'utf8',
  );

  const { size } = await stat(OUT_FILE);
  log(`WFL: рантайм собран — ${(code.length / 1024).toFixed(0)} КБ кода, модуль ${(size / 1024).toFixed(0)} КБ`);
  log(`     → ${OUT_FILE.replace(root + '/', '')}`);
  return { path: OUT_FILE, size, skipped: false };
}

export const RUNTIME_BUNDLE_PATH = OUT_FILE;

// Запуск как скрипта: node tools/build-runtime.mjs [--no-minify] [--force]
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildRuntime({
    minify: !process.argv.includes('--no-minify'),
    force: process.argv.includes('--force'),
  });
}
