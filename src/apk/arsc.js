// WFL Engine — генератор resources.arsc (таблица ресурсов Android) без aapt.
// Поддерживает один пакет (0x7f) и произвольный набор типов/записей.
import { ByteWriter } from './bytes.js';
import { StringPool } from './axml.js';

const RES_TABLE_TYPE = 0x0002;
const RES_TABLE_PACKAGE_TYPE = 0x0200;
const RES_TABLE_TYPE_TYPE = 0x0201;
const RES_TABLE_TYPE_SPEC_TYPE = 0x0202;

const TYPE_STRING = 0x03;

/** Размер структуры ResTable_config (классический вариант aapt) */
const CONFIG_SIZE = 56;

/**
 * @typedef {{name:string, value:string}} ArscEntry
 * @typedef {{type:string, entries:ArscEntry[]}} ArscType
 */

/**
 * Собрать resources.arsc.
 * @param {object} opts
 * @param {string} opts.packageName
 * @param {ArscType[]} opts.types  типы ресурсов в порядке возрастания typeId (с 1)
 * @returns {{bytes:Uint8Array, ids:Record<string, number>}} байты и карта 'drawable/ic_launcher' → resId
 */
export function buildArsc({ packageName, types }) {
  const packageId = 0x7f;

  /* --- Глобальный пул значений (все строковые значения ресурсов) --- */
  const valuePool = new StringPool();
  const typePool = new StringPool();
  const keyPool = new StringPool();

  const ids = {};
  for (let ti = 0; ti < types.length; ti++) {
    const t = types[ti];
    typePool.add(t.type);
    for (let ei = 0; ei < t.entries.length; ei++) {
      keyPool.add(t.entries[ei].name);
      valuePool.add(t.entries[ei].value);
      ids[`${t.type}/${t.entries[ei].name}`] =
        (packageId << 24) | ((ti + 1) << 16) | ei;
    }
  }

  /* --- Чанки типов внутри пакета --- */
  const typeChunks = [];
  for (let ti = 0; ti < types.length; ti++) {
    const t = types[ti];
    const typeId = ti + 1;
    const count = t.entries.length;

    // typeSpec
    const spec = new ByteWriter(16 + count * 4);
    spec.u16(RES_TABLE_TYPE_SPEC_TYPE);
    spec.u16(16);
    spec.u32(16 + count * 4);
    spec.u8(typeId);
    spec.u8(0);   // res0
    spec.u16(0);  // res1
    spec.u32(count);
    for (let i = 0; i < count; i++) spec.u32(0); // конфигурационные флаги
    typeChunks.push(spec.toBytes());

    // type (одна конфигурация — default)
    const headerSize = 20 + CONFIG_SIZE;
    const entriesStart = headerSize + count * 4;

    const entryData = new ByteWriter(count * 16);
    const offsets = [];
    for (const e of t.entries) {
      offsets.push(entryData.length);
      entryData.u16(8);                       // ResTable_entry.size
      entryData.u16(0);                       // flags
      entryData.u32(keyPool.indexOf(e.name)); // key index
      entryData.u16(8);                       // Res_value.size
      entryData.u8(0);                        // res0
      entryData.u8(TYPE_STRING);              // dataType
      entryData.u32(valuePool.indexOf(e.value));
    }
    const entryBytes = entryData.toBytes();

    const type = new ByteWriter(entriesStart + entryBytes.length);
    type.u16(RES_TABLE_TYPE_TYPE);
    type.u16(headerSize);
    type.u32(entriesStart + entryBytes.length);
    type.u8(typeId);
    type.u8(0);
    type.u16(0);
    type.u32(count);
    type.u32(entriesStart);
    // ResTable_config: size + нули (конфигурация по умолчанию)
    type.u32(CONFIG_SIZE);
    type.zeros(CONFIG_SIZE - 4);
    for (const o of offsets) type.u32(o);
    type.bytes(entryBytes);
    typeChunks.push(type.toBytes());
  }

  /* --- Пакет --- */
  const typeStrings = typePool.encode();
  const keyStrings = keyPool.encode();
  const pkgHeaderSize = 288;
  const typeStringsOff = pkgHeaderSize;
  const keyStringsOff = pkgHeaderSize + typeStrings.length;

  let typeChunksSize = 0;
  for (const c of typeChunks) typeChunksSize += c.length;
  const pkgSize = keyStringsOff + keyStrings.length + typeChunksSize;

  const pkg = new ByteWriter(pkgSize);
  pkg.u16(RES_TABLE_PACKAGE_TYPE);
  pkg.u16(pkgHeaderSize);
  pkg.u32(pkgSize);
  pkg.u32(packageId);
  pkg.utf16Fixed(packageName, 128);
  pkg.u32(typeStringsOff);
  pkg.u32(types.length);   // lastPublicType
  pkg.u32(keyStringsOff);
  pkg.u32(keyPool.size);   // lastPublicKey
  pkg.u32(0);              // typeIdOffset
  pkg.bytes(typeStrings);
  pkg.bytes(keyStrings);
  for (const c of typeChunks) pkg.bytes(c);

  /* --- Таблица --- */
  const valueStrings = valuePool.encode();
  const tableHeaderSize = 12;
  const pkgBytes = pkg.toBytes();
  const total = tableHeaderSize + valueStrings.length + pkgBytes.length;

  const out = new ByteWriter(total);
  out.u16(RES_TABLE_TYPE);
  out.u16(tableHeaderSize);
  out.u32(total);
  out.u32(1); // packageCount
  out.bytes(valueStrings);
  out.bytes(pkgBytes);

  return { bytes: out.toBytes(), ids };
}
