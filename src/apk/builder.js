// WFL Engine — сборщик APK «под ключ», без Gradle, javac и Android SDK.
//
// Работает одинаково в браузере (Editor → «Собрать APK») и в Node (CLI).
// Всё, что нужно, генерируется на лету: AndroidManifest.xml (binary AXML),
// resources.arsc, classes.dex, иконка, ассеты игры, подписи v1 + v2.
import { DEFAULT_CONFIG, buildManifest } from './manifest.js';
import { buildArsc } from './arsc.js';
import { buildActivityDex } from './activity.js';
import { ZipBuilder } from './zip.js';
import { generateSigningKey, DEFAULT_SUBJECT } from './keystore.js';
import { buildV1Signature, buildV2Block, computeV2Digest } from './signer.js';
import { makeIcon } from './icon.js';
import { ByteWriter, concatBytes } from './bytes.js';

/**
 * @typedef {object} ApkAsset
 * @property {string} path  путь внутри assets/ (например 'index.html')
 * @property {Uint8Array|string} data
 */

/**
 * Собрать APK.
 *
 * @param {object} options
 * @param {object} [options.config]      конфигурация манифеста (см. DEFAULT_CONFIG)
 * @param {ApkAsset[]} [options.assets]  файлы, попадающие в assets/
 * @param {Uint8Array} [options.icon]    PNG-иконка (если не задана — генерируется)
 * @param {object} [options.key]         {privateKey, certificate}; если нет — генерируется
 * @param {(stage:string, progress:number)=>void} [options.onProgress]
 * @param {boolean} [options.signV1]
 * @param {boolean} [options.signV2]
 * @returns {Promise<{bytes:Uint8Array, config:object, key:object, size:number, entries:number}>}
 */
export async function buildApk({
  config = {},
  assets = [],
  icon = null,
  key = null,
  onProgress = () => {},
  signV1 = true,
  signV2 = true,
} = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const report = (stage, p) => onProgress(stage, p);

  /* ---------- 1. Ключ подписи ---------- */
  report('Генерация ключа подписи', 0.05);
  const signingKey = key ?? await generateSigningKey({
    subject: {
      ...DEFAULT_SUBJECT,
      CN: cfg.appName || 'WFL Game',
      ...(cfg.certSubject ?? {}),
    },
  });

  /* ---------- 2. Ресурсы ---------- */
  report('Сборка ресурсов', 0.15);
  const iconPng = icon ?? makeIcon(cfg.appName || 'W');
  const iconPath = 'res/drawable/ic_launcher.png';

  const arsc = buildArsc({
    packageName: cfg.packageName,
    types: [
      { type: 'drawable', entries: [{ name: 'ic_launcher', value: iconPath }] },
      { type: 'string', entries: [{ name: 'app_name', value: cfg.appName }] },
    ],
  });

  /* ---------- 3. Манифест ---------- */
  // ID иконки берём из таблицы ресурсов, а не «зашиваем» константой
  report('Сборка AndroidManifest.xml', 0.25);
  cfg.iconResId = arsc.ids['drawable/ic_launcher'];
  const manifest = buildManifest(cfg);

  /* ---------- 4. Байт-код ---------- */
  report('Генерация classes.dex', 0.35);
  const dex = buildActivityDex({
    packageName: cfg.packageName,
    startUrl: cfg.startUrl ?? 'file:///android_asset/index.html',
    debuggable: cfg.debuggable ?? false,
  });

  /* ---------- 5. Наполнение архива ---------- */
  report('Упаковка файлов', 0.5);
  const files = [
    { name: 'AndroidManifest.xml', data: manifest },
    { name: 'classes.dex', data: dex },
    { name: 'resources.arsc', data: arsc.bytes, store: true },
    { name: iconPath, data: iconPng, store: true },
  ];

  for (const asset of assets) {
    const path = asset.path.replace(/^\/+/, '');
    files.push({
      name: `assets/${path}`,
      data: typeof asset.data === 'string' ? new TextEncoder().encode(asset.data) : asset.data,
    });
  }

  /* ---------- 6. Подпись v1 ---------- */
  let v1Files = {};
  if (signV1) {
    report('Подпись v1 (JAR)', 0.65);
    v1Files = await buildV1Signature(files, signingKey);
  }

  const zip = new ZipBuilder();
  // META-INF идёт первым — так делает apksigner, и некоторые парсеры это любят
  for (const [name, data] of Object.entries(v1Files)) zip.add(name, data);
  for (const f of files) zip.add(f.name, f.data, { store: f.store });

  /* ---------- 7. Подпись v2 ---------- */
  if (!signV2) {
    report('Готово', 1);
    const built = zip.build();
    return {
      bytes: built.bytes, config: cfg, key: signingKey,
      size: built.bytes.length, entries: built.records.length,
    };
  }

  report('Подпись v2 (APK Signing Block)', 0.8);

  // Первый проход: получаем раскладку без блока подписи.
  const pass1 = zip.build();

  // Размер блока подписи заранее неизвестен, но он не влияет на содержимое
  // записей — только на смещение Central Directory в EOCD. Собираем блок,
  // затем пересобираем архив с ним и правим EOCD.
  const sections1 = splitSections(pass1);

  // Пробный блок нужного размера: делаем два прохода, т.к. размер блока
  // зависит только от длины подписи (фиксирована) и padding до 4096.
  let block = await buildV2Block(
    computeV2Digest([
      sections1.entries,
      sections1.centralDirectory,
      sections1.eocd,
    ]),
    signingKey.certificate,
    signingKey.privateKey,
  );

  // Пересобираем с блоком: смещение CD сдвигается на block.length
  let final = zip.build({ signingBlock: block });
  let sections = splitSections(final, block.length);

  // Хеш должен считаться от финальной раскладки → второй проход
  const digest2 = computeV2Digest([
    sections.entries,
    sections.centralDirectory,
    sections.eocd,
  ]);
  const block2 = await buildV2Block(digest2, signingKey.certificate, signingKey.privateKey);

  if (block2.length !== block.length) {
    // Размер изменился (маловероятно) — ещё один проход
    block = block2;
    final = zip.build({ signingBlock: block });
    sections = splitSections(final, block.length);
    const digest3 = computeV2Digest([
      sections.entries, sections.centralDirectory, sections.eocd,
    ]);
    const block3 = await buildV2Block(digest3, signingKey.certificate, signingKey.privateKey);
    final = zip.build({ signingBlock: block3 });
  } else {
    final = zip.build({ signingBlock: block2 });
  }

  report('Готово', 1);
  return {
    bytes: final.bytes,
    config: cfg,
    key: signingKey,
    size: final.bytes.length,
    entries: final.records.length,
  };
}

/**
 * Разделить готовый архив на три секции для хеширования v2.
 * @param {{bytes:Uint8Array, cdOffset:number, cdSize:number}} built
 * @param {number} [blockLength] длина вставленного Signing Block
 */
function splitSections(built, blockLength = 0) {
  const { bytes, cdOffset, cdSize } = built;
  const entriesEnd = cdOffset - blockLength;
  return {
    entries: bytes.subarray(0, entriesEnd),
    centralDirectory: bytes.subarray(cdOffset, cdOffset + cdSize),
    // В хеше v2 поле «смещение Central Directory» должно указывать
    // на начало Signing Block, а не на реальное положение CD.
    eocd: patchEocd(bytes.subarray(cdOffset + cdSize), entriesEnd),
  };
}

/**
 * В EOCD при подсчёте хеша v2 поле «смещение Central Directory» должно
 * указывать на начало Signing Block. Здесь мы подменяем его копией.
 */
function patchEocd(eocd, offset) {
  const copy = eocd.slice();
  new DataView(copy.buffer, copy.byteOffset).setUint32(16, offset, true);
  return copy;
}

export { DEFAULT_CONFIG };
export { concatBytes, ByteWriter };
