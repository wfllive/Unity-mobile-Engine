// WFL Engine — сборщик ZIP-архива (формат APK) с поддержкой zipalign.
//
// Особенности, важные для APK:
//  * `resources.arsc` и `*.so` должны храниться без сжатия (STORED) и быть
//    выровнены по 4 (для arsc — обязательно с Android 11) / 4096 байт;
//  * запись выравнивается за счёт «extra field» в локальном заголовке;
//  * подпись v2 вставляется отдельным блоком между данными и Central Directory.
import { ByteWriter, concatBytes } from './bytes.js';
import { crc32 } from './hash.js';
import { deflateRaw } from './deflate.js';

const LOCAL_SIG = 0x04034b50;
const CD_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

/** Расширения, которые всегда хранятся без сжатия */
const STORE_EXT = new Set([
  '.arsc', '.so', '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.mp3', '.ogg', '.m4a', '.aac', '.wav', '.mp4', '.webm',
]);

/** Выравнивание по типу файла */
function alignmentFor(name) {
  if (name.endsWith('.so')) return 4096;
  if (name === 'resources.arsc') return 4;
  return 4;
}

function shouldStore(name) {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return false;
  return STORE_EXT.has(name.slice(dot).toLowerCase());
}

/** Преобразовать JS-дату в поля MS-DOS (time, date) */
function dosDateTime(date) {
  const y = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((y - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export class ZipBuilder {
  /**
   * @param {object} [opts]
   * @param {Date} [opts.date] дата модификации всех записей
   * @param {boolean} [opts.compress] сжимать ли по умолчанию
   */
  constructor({ date = new Date(), compress = true } = {}) {
    this.date = date;
    this.compress = compress;
    /** @type {Array<{name:string,data:Uint8Array,store:boolean}>} */
    this.entries = [];
  }

  /**
   * Добавить файл.
   * @param {string} name путь внутри архива (прямые слэши)
   * @param {Uint8Array|string} data
   * @param {{store?:boolean}} [opts]
   */
  add(name, data, { store } = {}) {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    this.entries.push({
      name,
      data: bytes,
      store: store ?? (!this.compress || shouldStore(name)),
    });
    return this;
  }

  has(name) {
    return this.entries.some((e) => e.name === name);
  }

  get(name) {
    return this.entries.find((e) => e.name === name)?.data ?? null;
  }

  remove(name) {
    this.entries = this.entries.filter((e) => e.name !== name);
    return this;
  }

  /**
   * Собрать архив.
   * @param {object} [opts]
   * @param {Uint8Array} [opts.signingBlock] APK Signing Block (v2), вставляется
   *        между данными записей и Central Directory.
   * @returns {{bytes:Uint8Array, cdOffset:number, cdSize:number, eocdOffset:number,
   *            records:Array}}
   */
  build({ signingBlock = null } = {}) {
    const { time, date } = dosDateTime(this.date);
    const chunks = [];
    const records = [];
    let offset = 0;

    for (const entry of this.entries) {
      const nameBytes = new TextEncoder().encode(entry.name);
      const crc = crc32(entry.data);
      let method = 0;
      let payload = entry.data;

      if (!entry.store) {
        const deflated = deflateRaw(entry.data);
        // сжимаем только если это действительно выгодно
        if (deflated.length < entry.data.length) {
          method = 8;
          payload = deflated;
        }
      }

      // Выравнивание: local header = 30 + nameLen + extraLen
      let extraLen = 0;
      if (method === 0) {
        const align = alignmentFor(entry.name);
        const dataStart = offset + 30 + nameBytes.length;
        const rem = dataStart % align;
        if (rem !== 0) extraLen = align - rem;
      }

      const lh = new ByteWriter(30 + nameBytes.length + extraLen);
      lh.u32(LOCAL_SIG);
      lh.u16(method === 8 ? 20 : 10);   // version needed
      lh.u16(0);                        // flags
      lh.u16(method);
      lh.u16(time);
      lh.u16(date);
      lh.u32(crc);
      lh.u32(payload.length);
      lh.u32(entry.data.length);
      lh.u16(nameBytes.length);
      lh.u16(extraLen);
      lh.bytes(nameBytes);
      if (extraLen) lh.zeros(extraLen);

      const header = lh.toBytes();
      chunks.push(header, payload);

      records.push({
        name: entry.name, nameBytes, crc, method, time, date,
        compressedSize: payload.length,
        uncompressedSize: entry.data.length,
        localOffset: offset,
      });

      offset += header.length + payload.length;
    }

    // APK Signing Block (v2/v3) вставляется здесь
    if (signingBlock) {
      chunks.push(signingBlock);
      offset += signingBlock.length;
    }

    const cdOffset = offset;
    const cdChunks = [];
    for (const r of records) {
      const w = new ByteWriter(46 + r.nameBytes.length);
      w.u32(CD_SIG);
      w.u16(0x0314);                    // version made by (UNIX, 2.0)
      w.u16(r.method === 8 ? 20 : 10);
      w.u16(0);
      w.u16(r.method);
      w.u16(r.time);
      w.u16(r.date);
      w.u32(r.crc);
      w.u32(r.compressedSize);
      w.u32(r.uncompressedSize);
      w.u16(r.nameBytes.length);
      w.u16(0);                         // extra len (в CD — 0)
      w.u16(0);                         // comment len
      w.u16(0);                         // disk number
      w.u16(0);                         // internal attrs
      w.u32(0x81a40000 >>> 0);          // external attrs: -rw-r--r--
      w.u32(r.localOffset);
      w.bytes(r.nameBytes);
      cdChunks.push(w.toBytes());
    }
    const cd = concatBytes(cdChunks);
    chunks.push(cd);

    const eocd = new ByteWriter(22);
    eocd.u32(EOCD_SIG);
    eocd.u16(0);
    eocd.u16(0);
    eocd.u16(records.length);
    eocd.u16(records.length);
    eocd.u32(cd.length);
    eocd.u32(cdOffset);
    eocd.u16(0);
    chunks.push(eocd.toBytes());

    return {
      bytes: concatBytes(chunks),
      cdOffset,
      cdSize: cd.length,
      eocdOffset: cdOffset + cd.length,
      records,
    };
  }
}
