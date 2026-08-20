// WFL Engine — генерация PNG-иконки без canvas (чистый JS).
// Пишем несжатый PNG (RGBA, фильтр 0) через stored-блоки DEFLATE + zlib-обёртку.
import { crc32 } from './hash.js';
import { ByteWriter, concatBytes } from './bytes.js';
import { zlibCompress } from './deflate.js';

/** Один чанк PNG: length | type | data | crc */
function chunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const body = concatBytes([typeBytes, data]);
  const w = new ByteWriter(12 + data.length);
  w.u32be(data.length);
  w.bytes(body);
  w.u32be(crc32(body));
  return w.toBytes();
}

/**
 * Собрать PNG из RGBA-буфера.
 * @param {Uint8Array} rgba  width*height*4
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array}
 */
export function encodePng(rgba, width, height) {
  // Сырые скан-линии с байтом фильтра 0 в начале каждой строки
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const src = y * width * 4;
    const dst = y * (width * 4 + 1);
    raw[dst] = 0;
    raw.set(rgba.subarray(src, src + width * 4), dst + 1);
  }

  const z = zlibCompress(raw);

  const ihdr = new ByteWriter(13);
  ihdr.u32be(width);
  ihdr.u32be(height);
  ihdr.u8(8);      // bit depth
  ihdr.u8(6);      // color type: RGBA
  ihdr.u8(0);      // compression
  ihdr.u8(0);      // filter
  ihdr.u8(0);      // interlace

  return concatBytes([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr.toBytes()),
    chunk('IDAT', z),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/** Простой хеш строки → оттенок */
function hueOf(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0; let g = 0; let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/* Растровый шрифт 5×7 для букв и цифр (для монограммы на иконке) */
const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '11110', '10001', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '11110', '10000', '10000', '10000', '11111'],
  F: ['11111', '10000', '11110', '10000', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '11111', '10001', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '11100', '10100', '10010', '10001', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '01010', '00100', '00100', '00100', '01010', '10001'],
  Y: ['10001', '01010', '00100', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};

/**
 * Сгенерировать иконку приложения: скруглённый квадрат с градиентом
 * и монограммой из первой буквы названия.
 *
 * @param {string} appName
 * @param {number} [size] сторона в пикселях
 * @returns {Uint8Array} PNG
 */
export function makeIcon(appName = 'W', size = 192) {
  const letter = (appName.trim()[0] ?? 'W').toUpperCase();
  const glyph = FONT[letter] ?? FONT.W;

  const hue = hueOf(appName || 'WFL');
  const [r1, g1, b1] = hslToRgb(hue, 0.72, 0.55);
  const [r2, g2, b2] = hslToRgb((hue + 40) % 360, 0.78, 0.35);

  const rgba = new Uint8Array(size * size * 4);
  const radius = size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // Скруглённый квадрат: расстояние до ближайшего угла
      const dx = Math.max(radius - x, x - (size - 1 - radius), 0);
      const dy = Math.max(radius - y, y - (size - 1 - radius), 0);
      const dist = Math.hypot(dx, dy);
      let alpha = 255;
      if (dist > radius) alpha = 0;
      else if (dist > radius - 1.5) alpha = Math.round(255 * (radius - dist) / 1.5);

      // Диагональный градиент
      const t = (x + y) / (2 * size);
      rgba[i] = Math.round(r1 + (r2 - r1) * t);
      rgba[i + 1] = Math.round(g1 + (g2 - g1) * t);
      rgba[i + 2] = Math.round(b1 + (b2 - b1) * t);
      rgba[i + 3] = alpha;
    }
  }

  // Монограмма по центру
  const scale = Math.floor(size / 12);
  const glyphW = 5 * scale;
  const glyphH = 7 * scale;
  const ox = Math.floor((size - glyphW) / 2);
  const oy = Math.floor((size - glyphH) / 2);

  for (let gy = 0; gy < 7; gy++) {
    for (let gx = 0; gx < 5; gx++) {
      if (glyph[gy][gx] !== '1') continue;
      for (let py = 0; py < scale; py++) {
        for (let px = 0; px < scale; px++) {
          const x = ox + gx * scale + px;
          const y = oy + gy * scale + py;
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          const i = (y * size + x) * 4;
          if (rgba[i + 3] === 0) continue;
          rgba[i] = 255;
          rgba[i + 1] = 255;
          rgba[i + 2] = 255;
        }
      }
    }
  }

  return encodePng(rgba, size, size);
}
