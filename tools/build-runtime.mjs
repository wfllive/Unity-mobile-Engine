#!/usr/bin/env node
// WFL Engine — сборка рантайм-бандла, который упаковывается в APK.
//
// Плеер (src/runtime/player.js) вместе с three.js собирается в один IIFE-файл.
// Результат сохраняется как ES-модуль, экспортирующий исходник строкой, —
// так его может использовать и браузерный сборщик APK, и CLI.
import { build } from 'esbuild';
import { writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = resolve(root, 'src/apk/runtime-bundle.js');

const minify = !process.argv.includes('--no-minify');

console.log('WFL: сборка рантайма для APK…');

const result = await build({
  entryPoints: [resolve(root, 'src/runtime/player.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify,
  legalComments: 'none',
  write: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});

const code = result.outputFiles[0].text;

await mkdir(dirname(outFile), { recursive: true });
await writeFile(
  outFile,
  '// СГЕНЕРИРОВАНО автоматически: tools/build-runtime.mjs — не редактировать вручную.\n' +
  '/* eslint-disable */\n' +
  `export const RUNTIME_JS = ${JSON.stringify(code)};\n` +
  `export const RUNTIME_SIZE = ${code.length};\n`,
  'utf8',
);

const kb = (code.length / 1024).toFixed(0);
const { size } = await stat(outFile);
console.log(`WFL: рантайм собран — ${kb} КБ кода, модуль ${(size / 1024).toFixed(0)} КБ`);
console.log(`     → ${outFile.replace(root + '/', '')}`);
