// WFL Engine — кодировщик Android Binary XML (AXML) без aapt/Gradle.
// Формат: ResChunk_header + ResStringPool + ResXMLResourceMap + узлы дерева.
import { ByteWriter } from './bytes.js';

/* Типы чанков */
const RES_STRING_POOL_TYPE = 0x0001;
const RES_XML_TYPE = 0x0003;
const RES_XML_START_NAMESPACE_TYPE = 0x0100;
const RES_XML_END_NAMESPACE_TYPE = 0x0101;
const RES_XML_START_ELEMENT_TYPE = 0x0102;
const RES_XML_END_ELEMENT_TYPE = 0x0103;
const RES_XML_RESOURCE_MAP_TYPE = 0x0180;

/* Типы значений Res_value */
export const TYPE_NULL = 0x00;
export const TYPE_REFERENCE = 0x01;
export const TYPE_ATTRIBUTE = 0x02;
export const TYPE_STRING = 0x03;
export const TYPE_FLOAT = 0x04;
export const TYPE_DIMENSION = 0x05;
export const TYPE_INT_DEC = 0x10;
export const TYPE_INT_HEX = 0x11;
export const TYPE_INT_BOOLEAN = 0x12;

export const ANDROID_NS = 'http://schemas.android.com/apk/res/android';

/**
 * Идентификаторы системных атрибутов (android:*).
 * Значения — публичные ID из android.R.attr, стабильные между версиями платформы.
 */
export const ATTR_IDS = {
  theme: 0x01010000,
  label: 0x01010001,
  icon: 0x01010002,
  name: 0x01010003,
  permission: 0x01010006,
  process: 0x01010011,
  debuggable: 0x0101000f,
  exported: 0x01010010,
  enabled: 0x0101000e,
  persistent: 0x0101000d,
  taskAffinity: 0x01010012,
  multiprocess: 0x01010013,
  finishOnTaskLaunch: 0x01010014,
  clearTaskOnLaunch: 0x01010015,
  stateNotNeeded: 0x01010016,
  excludeFromRecents: 0x01010017,
  authorities: 0x01010018,
  launchMode: 0x0101001d,
  screenOrientation: 0x0101001e,
  configChanges: 0x0101001f,
  value: 0x01010024,
  resource: 0x01010025,
  windowSoftInputMode: 0x0101022b,
  minSdkVersion: 0x0101020c,
  versionCode: 0x0101021b,
  versionName: 0x0101021c,
  targetSdkVersion: 0x01010270,
  maxSdkVersion: 0x01010271,
  glEsVersion: 0x01010281,
  required: 0x0101028e,
  installLocation: 0x010102b7,
  immersive: 0x010102c0,
  hardwareAccelerated: 0x010102d3,
  allowBackup: 0x01010280,
  supportsRtl: 0x010103af,
  largeHeap: 0x0101035a,
  resizeableActivity: 0x010104f6,
  roundIcon: 0x0101052c,
  extractNativeLibs: 0x010104ea,
  usesCleartextTraffic: 0x010104ec,
  appComponentFactory: 0x0101057a,
  compileSdkVersion: 0x01010572,
  compileSdkVersionCodename: 0x01010573,
  banner: 0x010103f2,
  isGame: 0x010103f4,
  maxAspectRatio: 0x01010560,
  anyDensity: 0x0101026c,
  smallScreens: 0x01010284,
  normalScreens: 0x01010285,
  largeScreens: 0x01010286,
  xlargeScreens: 0x010102bf,
};

/* ------------------------------------------------------------------ */
/*                          Пул строк                                  */
/* ------------------------------------------------------------------ */
export class StringPool {
  constructor() {
    this.strings = [];
    this._index = new Map();
  }

  /** Добавить строку, вернуть её индекс. */
  add(s) {
    if (s == null) return -1;
    if (this._index.has(s)) return this._index.get(s);
    const i = this.strings.length;
    this.strings.push(s);
    this._index.set(s, i);
    return i;
  }

  indexOf(s) { return s == null ? -1 : (this._index.get(s) ?? -1); }

  get size() { return this.strings.length; }

  /**
   * Сериализация в чанк RES_STRING_POOL_TYPE (UTF-16LE, без стилей).
   * UTF-16 выбран намеренно: он однозначен и поддерживается всеми версиями Android.
   */
  encode() {
    const data = new ByteWriter(1024);
    const offsets = [];
    for (const s of this.strings) {
      offsets.push(data.length);
      const units = [];
      for (let i = 0; i < s.length; i++) units.push(s.charCodeAt(i));
      if (units.length > 0x7fff) {
        // длинная строка: старший u16 со взведённым битом + младший u16
        data.u16(0x8000 | ((units.length >> 16) & 0x7fff));
        data.u16(units.length & 0xffff);
      } else {
        data.u16(units.length);
      }
      for (const u of units) data.u16(u);
      data.u16(0); // NUL-терминатор
    }
    data.align(4);
    const stringData = data.toBytes();

    const headerSize = 28;
    const offsetsSize = offsets.length * 4;
    const stringsStart = headerSize + offsetsSize;
    const chunkSize = stringsStart + stringData.length;

    const w = new ByteWriter(chunkSize);
    w.u16(RES_STRING_POOL_TYPE);
    w.u16(headerSize);
    w.u32(chunkSize);
    w.u32(this.strings.length);
    w.u32(0);            // styleCount
    w.u32(0);            // flags (0 = UTF-16, не отсортирован)
    w.u32(stringsStart);
    w.u32(0);            // stylesStart
    for (const o of offsets) w.u32(o);
    w.bytes(stringData);
    return w.toBytes();
  }
}

/* ------------------------------------------------------------------ */
/*                      Модель XML-документа                           */
/* ------------------------------------------------------------------ */

/**
 * Описание атрибута.
 * @typedef {{name:string, ns?:string|null, type:number, data:number, raw?:string|null}} AxmlAttr
 */

export class AxmlNode {
  constructor(name, ns = null) {
    this.name = name;
    this.ns = ns;
    /** @type {AxmlAttr[]} */
    this.attributes = [];
    /** @type {AxmlNode[]} */
    this.children = [];
  }

  /** Строковый атрибут android:* */
  str(name, value, ns = ANDROID_NS) {
    this.attributes.push({ name, ns, type: TYPE_STRING, data: 0, raw: String(value) });
    return this;
  }

  /** Целочисленный атрибут */
  int(name, value, ns = ANDROID_NS, hex = false) {
    this.attributes.push({
      name, ns, type: hex ? TYPE_INT_HEX : TYPE_INT_DEC, data: value >>> 0, raw: null,
    });
    return this;
  }

  /** Логический атрибут */
  bool(name, value, ns = ANDROID_NS) {
    this.attributes.push({
      name, ns, type: TYPE_INT_BOOLEAN, data: value ? 0xffffffff : 0, raw: null,
    });
    return this;
  }

  /** Ссылка на ресурс (@id) */
  ref(name, resId, ns = ANDROID_NS) {
    this.attributes.push({ name, ns, type: TYPE_REFERENCE, data: resId >>> 0, raw: null });
    return this;
  }

  child(name, ns = null) {
    const n = new AxmlNode(name, ns);
    this.children.push(n);
    return n;
  }

  add(node) { this.children.push(node); return this; }
}

/* ------------------------------------------------------------------ */
/*                        Кодировщик                                   */
/* ------------------------------------------------------------------ */
export function encodeAxml(rootNode, { nsPrefix = 'android', nsUri = ANDROID_NS } = {}) {
  const pool = new StringPool();

  /* 1. Собираем имена атрибутов, имеющие resource-id — они ОБЯЗАНЫ идти
        первыми в пуле, а их ID — в том же порядке в ResourceMap. */
  const attrNames = [];
  const seenAttr = new Set();
  const walkAttrs = (n) => {
    for (const a of n.attributes) {
      if (a.ns === nsUri && ATTR_IDS[a.name] != null && !seenAttr.has(a.name)) {
        seenAttr.add(a.name);
        attrNames.push(a.name);
      }
    }
    for (const c of n.children) walkAttrs(c);
  };
  walkAttrs(rootNode);
  // Порядок в ResourceMap не обязан быть отсортирован, но так надёжнее для парсеров
  attrNames.sort((a, b) => ATTR_IDS[a] - ATTR_IDS[b]);
  for (const n of attrNames) pool.add(n);
  const resourceMapIds = attrNames.map((n) => ATTR_IDS[n]);

  /* 2. Остальные строки */
  pool.add(nsPrefix);
  pool.add(nsUri);
  const walkRest = (n) => {
    if (n.ns) pool.add(n.ns);
    pool.add(n.name);
    for (const a of n.attributes) {
      pool.add(a.name);
      if (a.raw != null) pool.add(a.raw);
    }
    for (const c of n.children) walkRest(c);
  };
  walkRest(rootNode);

  const S = (s) => (s == null ? 0xffffffff : pool.indexOf(s));

  /* 3. Тело документа */
  const body = new ByteWriter(4096);

  // START NAMESPACE
  body.u16(RES_XML_START_NAMESPACE_TYPE);
  body.u16(16);
  body.u32(24);
  body.u32(1);            // lineNumber
  body.u32(0xffffffff);   // comment
  body.u32(S(nsPrefix));
  body.u32(S(nsUri));

  let line = 2;
  const writeElement = (node) => {
    const attrs = [...node.attributes];
    // Атрибуты с resource-id должны идти в порядке возрастания ID
    attrs.sort((a, b) => {
      const ia = a.ns === nsUri ? (ATTR_IDS[a.name] ?? 0xffffffff) : 0xffffffff;
      const ib = b.ns === nsUri ? (ATTR_IDS[b.name] ?? 0xffffffff) : 0xffffffff;
      return ia - ib;
    });

    const chunkSize = 36 + attrs.length * 20;
    body.u16(RES_XML_START_ELEMENT_TYPE);
    body.u16(16);
    body.u32(chunkSize);
    body.u32(line++);
    body.u32(0xffffffff);
    body.u32(S(node.ns));      // ns
    body.u32(S(node.name));    // name
    body.u16(20);              // attributeStart
    body.u16(20);              // attributeSize
    body.u16(attrs.length);    // attributeCount
    body.u16(0);               // idIndex
    body.u16(0);               // classIndex
    body.u16(0);               // styleIndex

    for (const a of attrs) {
      body.u32(S(a.ns));
      body.u32(S(a.name));
      body.u32(a.raw != null ? S(a.raw) : 0xffffffff); // rawValue
      body.u16(8);          // Res_value.size
      body.u8(0);           // res0
      body.u8(a.type);      // dataType
      body.u32(a.type === TYPE_STRING ? S(a.raw) : a.data);
    }

    for (const c of node.children) writeElement(c);

    body.u16(RES_XML_END_ELEMENT_TYPE);
    body.u16(16);
    body.u32(24);
    body.u32(line++);
    body.u32(0xffffffff);
    body.u32(S(node.ns));
    body.u32(S(node.name));
  };
  writeElement(rootNode);

  // END NAMESPACE
  body.u16(RES_XML_END_NAMESPACE_TYPE);
  body.u16(16);
  body.u32(24);
  body.u32(line++);
  body.u32(0xffffffff);
  body.u32(S(nsPrefix));
  body.u32(S(nsUri));

  /* 4. Склейка */
  const poolBytes = pool.encode();

  const mapW = new ByteWriter(8 + resourceMapIds.length * 4);
  mapW.u16(RES_XML_RESOURCE_MAP_TYPE);
  mapW.u16(8);
  mapW.u32(8 + resourceMapIds.length * 4);
  for (const id of resourceMapIds) mapW.u32(id);
  const mapBytes = mapW.toBytes();

  const bodyBytes = body.toBytes();
  const total = 8 + poolBytes.length + mapBytes.length + bodyBytes.length;

  const out = new ByteWriter(total);
  out.u16(RES_XML_TYPE);
  out.u16(8);
  out.u32(total);
  out.bytes(poolBytes);
  out.bytes(mapBytes);
  out.bytes(bodyBytes);
  return out.toBytes();
}
