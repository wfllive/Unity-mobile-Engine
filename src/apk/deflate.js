// WFL Engine — обёртка над deflate/zlib на базе fflate.
// Используется и ZIP-упаковщиком APK, и кодировщиком PNG.
import { deflateSync, zlibSync } from 'fflate';

/**
 * Сжать данные алгоритмом raw DEFLATE (для ZIP, метод 8).
 * @param {Uint8Array} data
 * @param {number} [level] 0..9
 * @returns {Uint8Array}
 */
export function deflateRaw(data, level = 6) {
  if (!data.length) return storedDeflate(data);
  return deflateSync(data, { level });
}

/**
 * Сжать данные в формате zlib (для PNG IDAT): заголовок + deflate + adler32.
 * @param {Uint8Array} data
 * @param {number} [level] 0..9
 * @returns {Uint8Array}
 */
export function zlibCompress(data, level = 6) {
  return zlibSync(data, { level });
}

/**
 * Резервный вариант: DEFLATE-поток из несжатых (stored) блоков.
 * Валиден для любого распаковщика, применяется для пустых данных.
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
export function storedDeflate(data) {
  const MAX = 0xffff;
  const blocks = Math.max(1, Math.ceil(data.length / MAX));
  const out = new Uint8Array(data.length + blocks * 5);
  let si = 0;
  let di = 0;
  for (let b = 0; b < blocks; b++) {
    const len = Math.min(MAX, data.length - si);
    out[di++] = b === blocks - 1 ? 1 : 0;   // BFINAL, BTYPE=00 (stored)
    out[di++] = len & 0xff;
    out[di++] = (len >> 8) & 0xff;
    out[di++] = ~len & 0xff;
    out[di++] = (~len >> 8) & 0xff;
    out.set(data.subarray(si, si + len), di);
    di += len;
    si += len;
  }
  return out.subarray(0, di);
}
