#!/usr/bin/env node
// WFL Engine — прогон всех тестов.
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

// Часть тестов использует собранный рантайм — на чистом клоне его ещё нет
if (!existsSync(resolve(root, 'src/apk/runtime-bundle.js'))) {
  await import('../build-runtime.mjs');
}

const files = (await readdir(here))
  .filter((f) => f.startsWith('t_') && f.endsWith('.mjs'))
  .sort();

const run = (file) => new Promise((res) => {
  const p = spawn(process.execPath, [join(here, file)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('close', (code) => res({ file, code, out }));
});

let failed = 0;
console.log(`\n\x1b[1mWFL Engine — тесты (${files.length})\x1b[0m`);
for (const f of files) {
  const { code, out } = await run(f);
  const okMark = code === 0 ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  const counts = out.match(/Итого: (\d+) ok, (\d+) ошиб/);
  const summary = counts ? `${counts[1]} проверок` : '';
  console.log(`  ${okMark} ${f.padEnd(16)} ${summary}`);
  if (code !== 0) { failed++; console.log(out.split('\n').map((l) => '      ' + l).join('\n')); }
}

console.log(failed
  ? `\n\x1b[31m${failed} из ${files.length} тестов упало\x1b[0m\n`
  : `\n\x1b[32mВсе ${files.length} тестов пройдены\x1b[0m\n`);
process.exit(failed ? 1 : 0);
