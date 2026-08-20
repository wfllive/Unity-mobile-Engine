#!/usr/bin/env node
// WFL Engine — консольная утилита: сборка APK без Gradle и Android SDK.
//
//   wfl apk [--out game.apk] [--name "Моя игра"] [--package com.my.game]
//           [--scene scene.json] [--version 1.0] [--version-code 1]
//           [--portrait] [--debug] [--min-sdk 21] [--no-v1] [--no-v2]
//   wfl keygen [--out key.pem] [--cert cert.pem]
//   wfl info <file.apk>
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------------- разбор аргументов ---------------------- */
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = true;
    } else out._.push(a);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] ?? 'help';

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

const HELP = `
${c.bold('WFL Engine')} — сборка APK без Gradle и Android SDK

${c.bold('Команды:')}
  ${c.cyan('apk')}         собрать APK из сцены
  ${c.cyan('keygen')}      сгенерировать ключ подписи и сертификат
  ${c.cyan('info')}        показать сведения об APK
  ${c.cyan('help')}        эта справка

${c.bold('wfl apk')} [опции]
  --out <файл>          куда сохранить (по умолчанию game.apk)
  --name <строка>       название приложения
  --package <id>        имя пакета, напр. com.my.game
  --scene <файл.json>   сцена, экспортированная из редактора
  --version <строка>    versionName (по умолчанию 1.0)
  --version-code <n>    versionCode (по умолчанию 1)
  --min-sdk <n>         минимальный API (по умолчанию 21)
  --portrait            портретная ориентация
  --debug               отладочная сборка
  --key <key.pem>       использовать существующий ключ PKCS#8
  --cert <cert.pem>     сертификат к нему
  --no-v1 / --no-v2     отключить схему подписи

${c.bold('Примеры:')}
  ${c.dim('npm run apk -- --name "Моя игра" --package com.studio.game')}
  ${c.dim('node tools/cli.mjs apk --scene my.wflscene.json --out build/game.apk')}
  ${c.dim('node tools/cli.mjs info game.apk')}
`;

/* ------------------------- команды ------------------------- */
async function cmdApk() {
  // Рантайм собирается при необходимости (нет файла или исходники новее)
  const { buildRuntime } = await import('./build-runtime.mjs');
  await buildRuntime({ quiet: true });

  const { buildApk } = await import('../src/apk/builder.js');
  const { buildRuntimeHtml } = await import('../src/apk/runtime-html.js');

  let scene = null;
  if (args.scene) {
    const p = resolve(process.cwd(), args.scene);
    if (!existsSync(p)) {
      console.error(c.red(`Файл сцены не найден: ${p}`));
      process.exit(1);
    }
    scene = JSON.parse(await readFile(p, 'utf8'));
    console.log(c.dim(`сцена: ${basename(p)} — объектов: ${scene.objects?.length ?? 0}`));
  }

  const config = {
    appName: args.name ?? 'WFL Game',
    packageName: args.package ?? 'com.wfl.game',
    versionName: args.version ?? '1.0',
    versionCode: parseInt(args['version-code'] ?? '1', 10),
    minSdk: parseInt(args['min-sdk'] ?? '21', 10),
    orientation: args.portrait ? 'portrait' : 'sensorLandscape',
    debuggable: !!args.debug,
  };

  if (!/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(config.packageName)) {
    console.error(c.red(`Некорректное имя пакета: ${config.packageName}`));
    process.exit(1);
  }

  // Ключ подписи
  let key = null;
  if (args.key) {
    const { importPrivateKeyPem } = await import('../src/apk/keystore.js');
    const pem = await readFile(resolve(process.cwd(), args.key), 'utf8');
    const privateKey = await importPrivateKeyPem(pem);
    if (!args.cert) {
      console.error(c.red('С опцией --key нужно указать и --cert'));
      process.exit(1);
    }
    const certPem = await readFile(resolve(process.cwd(), args.cert), 'utf8');
    const certificate = pemToDer(certPem);
    key = { privateKey, certificate };
    console.log(c.dim('ключ подписи: загружен из файла'));
  }

  const html = await buildRuntimeHtml({ scene, config });

  const t0 = Date.now();
  const result = await buildApk({
    config,
    key,
    signV1: args['no-v1'] !== true,
    signV2: args['no-v2'] !== true,
    assets: [{ path: 'index.html', data: html }],
    onProgress: (stage, p) => {
      const bar = '█'.repeat(Math.round(p * 22)).padEnd(22, '·');
      process.stdout.write(`\r  ${c.cyan(bar)} ${String(Math.round(p * 100)).padStart(3)}%  ${stage.padEnd(34)}`);
    },
  });
  process.stdout.write('\n');

  const outPath = resolve(process.cwd(), args.out ?? 'game.apk');
  await writeFile(outPath, result.bytes);

  console.log(`
${c.green('✓ APK собран')}
  файл       ${c.bold(outPath)}
  размер     ${(result.size / 1024).toFixed(1)} КБ
  файлов     ${result.entries}
  пакет      ${config.packageName}
  версия     ${config.versionName} (${config.versionCode})
  подпись    ${args['no-v1'] ? '' : 'v1 '}${args['no-v2'] ? '' : 'v2'}
  время      ${((Date.now() - t0) / 1000).toFixed(2)} с

${c.dim('Установка: adb install -r ' + basename(outPath))}`);
}

async function cmdKeygen() {
  const { generateSigningKey, exportPrivateKeyPem, exportCertificatePem } =
    await import('../src/apk/keystore.js');

  const key = await generateSigningKey({
    subject: { CN: args.name ?? 'WFL Engine', O: args.org ?? 'WFL', C: args.country ?? 'NO' },
    years: parseInt(args.years ?? '30', 10),
  });

  const keyPath = resolve(process.cwd(), args.out ?? 'wfl-key.pem');
  const certPath = resolve(process.cwd(), args.cert ?? 'wfl-cert.pem');

  await writeFile(keyPath, await exportPrivateKeyPem(key.privateKey));
  await writeFile(certPath, exportCertificatePem(key.certificate));

  console.log(`${c.green('✓ Ключ создан')}
  ключ         ${keyPath}
  сертификат   ${certPath}
  отпечаток    ${c.dim(key.fingerprint)}

${c.yellow('Храните ключ надёжно:')} без него нельзя выпустить обновление приложения.`);
}

async function cmdInfo() {
  const file = args._[1];
  if (!file) { console.error(c.red('Укажите файл: wfl info game.apk')); process.exit(1); }
  const buf = new Uint8Array(await readFile(resolve(process.cwd(), file)));

  // Разбираем ZIP по Central Directory
  const dv = new DataView(buf.buffer, buf.byteOffset);
  let eocd = buf.length - 22;
  while (eocd >= 0 && dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) { console.error(c.red('Это не ZIP/APK')); process.exit(1); }

  const count = dv.getUint16(eocd + 10, true);
  const cdOff = dv.getUint32(eocd + 16, true);

  console.log(`${c.bold(basename(file))} — ${(buf.length / 1024).toFixed(1)} КБ, ${count} файлов\n`);

  let p = cdOff;
  const names = [];
  for (let i = 0; i < count; i++) {
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const cmtLen = dv.getUint16(p + 32, true);
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    names.push(name);
    console.log(`  ${name.padEnd(34)} ${String(csize).padStart(8)} / ${String(usize).padStart(8)} ` +
      c.dim(method === 8 ? 'deflate' : 'store'));
    p += 46 + nameLen + extraLen + cmtLen;
  }

  const hasV1 = names.some((n) => /^META-INF\/.*\.(RSA|DSA|EC)$/.test(n));
  const magic = new TextDecoder().decode(buf.subarray(cdOff - 16, cdOff));
  const hasV2 = magic === 'APK Sig Block 42';

  console.log(`\n  подпись v1 (JAR)          ${hasV1 ? c.green('есть') : c.red('нет')}`);
  console.log(`  подпись v2 (Signing Block) ${hasV2 ? c.green('есть') : c.red('нет')}`);
}

function pemToDer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/* --------------------------- запуск --------------------------- */
try {
  switch (cmd) {
    case 'apk': await cmdApk(); break;
    case 'keygen': await cmdKeygen(); break;
    case 'info': await cmdInfo(); break;
    default: console.log(HELP);
  }
} catch (err) {
  console.error(c.red(`\nОшибка: ${err.message}`));
  if (process.env.WFL_DEBUG) console.error(err.stack);
  process.exit(1);
}
