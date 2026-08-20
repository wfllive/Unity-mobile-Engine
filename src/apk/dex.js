// WFL Engine — минимальный ассемблер DEX (Dalvik Executable) на чистом JS.
// Позволяет собрать classes.dex без javac/d8/Gradle.
//
// Поддерживается подмножество формата DEX 035, достаточное для генерации
// небольших классов-обёрток (например, WebView-активити).
import { ByteWriter } from './bytes.js';
import { adler32, sha1 } from './hash.js';

/* ------------------------------------------------------------------ */
/*                             Опкоды                                  */
/* ------------------------------------------------------------------ */
export const OP = {
  NOP: 0x00,
  MOVE_OBJECT: 0x07,          // 12x  vA, vB
  MOVE_RESULT: 0x0a,          // 11x  vAA
  MOVE_RESULT_OBJECT: 0x0c,   // 11x  vAA
  RETURN_VOID: 0x0e,          // 10x
  RETURN: 0x0f,               // 11x
  RETURN_OBJECT: 0x11,        // 11x
  CONST_4: 0x12,              // 11n  vA, #+B
  CONST_16: 0x13,             // 21s  vAA, #+BBBB
  CONST: 0x14,                // 31i  vAA, #+BBBBBBBB
  CONST_STRING: 0x1a,         // 21c  vAA, string@BBBB
  NEW_INSTANCE: 0x22,         // 21c  vAA, type@BBBB
  GOTO_16: 0x29,              // 20t  +AAAA
  IF_EQZ: 0x38,               // 21t  vAA, +BBBB
  IF_NEZ: 0x39,               // 21t  vAA, +BBBB
  IGET_OBJECT: 0x54,          // 22c  vA, vB, field@CCCC
  IPUT_OBJECT: 0x5b,          // 22c  vA, vB, field@CCCC
  SGET_OBJECT: 0x62,          // 21c  vAA, field@BBBB
  SPUT_OBJECT: 0x69,          // 21c  vAA, field@BBBB
  INVOKE_VIRTUAL: 0x6e,       // 35c
  INVOKE_SUPER: 0x6f,         // 35c
  INVOKE_DIRECT: 0x70,        // 35c
  INVOKE_STATIC: 0x71,        // 35c
  INVOKE_INTERFACE: 0x72,     // 35c
};

const ACC = {
  PUBLIC: 0x1, PRIVATE: 0x2, PROTECTED: 0x4, STATIC: 0x8,
  FINAL: 0x10, SUPER: 0x20, CONSTRUCTOR: 0x10000,
};
export const ACCESS = ACC;

/* ------------------------------------------------------------------ */
/*                    Инструкции (символьная форма)                    */
/* ------------------------------------------------------------------ */
/**
 * Каждая инструкция — объект с полем `size` (в 16-битных единицах)
 * и методом `emit(w, ctx, pc)`.
 */
export const I = {
  returnVoid: () => ({ size: 1, emit: (w) => { w.u16(OP.RETURN_VOID); } }),
  returnObject: (v) => ({ size: 1, emit: (w) => { w.u16((v << 8) | OP.RETURN_OBJECT); } }),

  const4: (v, n) => ({
    size: 1,
    emit: (w) => { w.u16(((n & 0xf) << 12) | ((v & 0xf) << 8) | OP.CONST_4); },
  }),
  const16: (v, n) => ({
    size: 2,
    emit: (w) => { w.u16((v << 8) | OP.CONST_16); w.u16(n & 0xffff); },
  }),
  const32: (v, n) => ({
    size: 3,
    emit: (w) => { w.u16((v << 8) | OP.CONST); w.u32(n >>> 0); },
  }),
  constString: (v, s) => ({
    size: 2, str: s,
    emit: (w, ctx) => { w.u16((v << 8) | OP.CONST_STRING); w.u16(ctx.str(s)); },
  }),
  newInstance: (v, type) => ({
    size: 2, type,
    emit: (w, ctx) => { w.u16((v << 8) | OP.NEW_INSTANCE); w.u16(ctx.type(type)); },
  }),
  moveResultObject: (v) => ({ size: 1, emit: (w) => { w.u16((v << 8) | OP.MOVE_RESULT_OBJECT); } }),
  moveResult: (v) => ({ size: 1, emit: (w) => { w.u16((v << 8) | OP.MOVE_RESULT); } }),
  moveObject: (a, b) => ({
    size: 1, emit: (w) => { w.u16(((b & 0xf) << 12) | ((a & 0xf) << 8) | OP.MOVE_OBJECT); },
  }),

  iget: (a, b, field) => ({
    size: 2, field,
    emit: (w, ctx) => {
      w.u16(((b & 0xf) << 12) | ((a & 0xf) << 8) | OP.IGET_OBJECT);
      w.u16(ctx.field(field));
    },
  }),
  iput: (a, b, field) => ({
    size: 2, field,
    emit: (w, ctx) => {
      w.u16(((b & 0xf) << 12) | ((a & 0xf) << 8) | OP.IPUT_OBJECT);
      w.u16(ctx.field(field));
    },
  }),
  sget: (v, field) => ({
    size: 2, field,
    emit: (w, ctx) => { w.u16((v << 8) | OP.SGET_OBJECT); w.u16(ctx.field(field)); },
  }),

  invoke: (kind, regs, method) => {
    const op = {
      virtual: OP.INVOKE_VIRTUAL, super: OP.INVOKE_SUPER,
      direct: OP.INVOKE_DIRECT, static: OP.INVOKE_STATIC, interface: OP.INVOKE_INTERFACE,
    }[kind];
    if (op == null) throw new Error(`Неизвестный вид invoke: ${kind}`);
    if (regs.length > 5) throw new Error('invoke: максимум 5 регистров (формат 35c)');
    return {
      size: 3, method,
      emit: (w, ctx) => {
        const [c = 0, d = 0, e = 0, f = 0, g = 0] = regs;
        w.u16((regs.length << 12) | ((g & 0xf) << 8) | op);
        w.u16(ctx.method(method));
        w.u16(((f & 0xf) << 12) | ((e & 0xf) << 8) | ((d & 0xf) << 4) | (c & 0xf));
      },
    };
  },

  label: (name) => ({ size: 0, label: name, emit: () => {} }),
  ifEqz: (v, target) => ({
    size: 2, target,
    emit: (w, ctx, pc) => {
      w.u16((v << 8) | OP.IF_EQZ);
      w.u16((ctx.label(target) - pc) & 0xffff);
    },
  }),
  ifNez: (v, target) => ({
    size: 2, target,
    emit: (w, ctx, pc) => {
      w.u16((v << 8) | OP.IF_NEZ);
      w.u16((ctx.label(target) - pc) & 0xffff);
    },
  }),
  goto: (target) => ({
    size: 2, target,
    emit: (w, ctx, pc) => { w.u16(OP.GOTO_16); w.u16((ctx.label(target) - pc) & 0xffff); },
  }),
};

/* ------------------------------------------------------------------ */
/*                       Разбор дескрипторов                           */
/* ------------------------------------------------------------------ */
/** 'Lcom/x/A;->m(II)V' → {cls, name, params:[], ret} */
function parseMethod(desc) {
  const arrow = desc.indexOf('->');
  const cls = desc.slice(0, arrow);
  const rest = desc.slice(arrow + 2);
  const lp = rest.indexOf('(');
  const rp = rest.indexOf(')');
  const name = rest.slice(0, lp);
  const params = splitParams(rest.slice(lp + 1, rp));
  const ret = rest.slice(rp + 1);
  return { cls, name, params, ret };
}

/** 'Lcom/x/A;->f:Ljava/lang/String;' → {cls, name, type} */
function parseField(desc) {
  const arrow = desc.indexOf('->');
  const cls = desc.slice(0, arrow);
  const rest = desc.slice(arrow + 2);
  const colon = rest.indexOf(':');
  return { cls, name: rest.slice(0, colon), type: rest.slice(colon + 1) };
}

function splitParams(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    let start = i;
    while (s[i] === '[') i++;
    if (s[i] === 'L') { while (s[i] !== ';') i++; i++; }
    else i++;
    out.push(s.slice(start, i));
  }
  return out;
}

/** Краткая форма прототипа для shorty-строки */
function shortyOf(type) {
  if (type.startsWith('[') || type.startsWith('L')) return 'L';
  return type;
}

/** Сравнение строк по кодовым точкам UTF-16 (как требует DEX) */
function cmpStrings(a, b) {
  const ca = [...a], cb = [...b];
  const n = Math.min(ca.length, cb.length);
  for (let i = 0; i < n; i++) {
    const d = ca[i].codePointAt(0) - cb[i].codePointAt(0);
    if (d) return d;
  }
  return ca.length - cb.length;
}

/** MUTF-8 кодирование (как в JVM/DEX: 0 → C0 80, суррогаты по 3 байта) */
function mutf8(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 0) { out.push(0xc0, 0x80); }
    else if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return new Uint8Array(out);
}

/** Количество символов UTF-16 (utf16_size в string_data_item) */
const utf16Len = (s) => s.length;

/* ------------------------------------------------------------------ */
/*                          Сборщик DEX                                */
/* ------------------------------------------------------------------ */
export class DexBuilder {
  constructor() {
    /** @type {Array<object>} */
    this.classes = [];
  }

  /**
   * @param {object} def
   * @param {string} def.name           дескриптор класса, напр. 'Lcom/x/MainActivity;'
   * @param {string} def.superName      дескриптор суперкласса
   * @param {number} [def.accessFlags]
   * @param {string} [def.sourceFile]
   * @param {Array<{name:string,type:string,accessFlags?:number}>} [def.fields]
   * @param {Array<object>} [def.methods]
   */
  addClass(def) {
    this.classes.push({
      accessFlags: ACC.PUBLIC | ACC.SUPER,
      fields: [], methods: [], ...def,
    });
    return this;
  }

  build() {
    /* ---------- 1. Сбор символов ---------- */
    const strings = new Set();
    const types = new Set();
    /** @type {Map<string, {cls:string,name:string,params:string[],ret:string}>} */
    const protos = new Map();
    const fields = new Map();
    const methods = new Map();

    const addType = (t) => { types.add(t); strings.add(t); };
    const addProto = (params, ret) => {
      const shorty = shortyOf(ret) + params.map(shortyOf).join('');
      const key = `${ret}|${params.join('')}`;
      if (!protos.has(key)) protos.set(key, { shorty, params, ret });
      strings.add(shorty);
      addType(ret);
      for (const p of params) addType(p);
      return key;
    };
    const addField = (desc) => {
      if (fields.has(desc)) return;
      const f = parseField(desc);
      fields.set(desc, f);
      addType(f.cls); addType(f.type); strings.add(f.name);
    };
    const addMethod = (desc) => {
      if (methods.has(desc)) return;
      const m = parseMethod(desc);
      methods.set(desc, m);
      addType(m.cls);
      addProto(m.params, m.ret);
      strings.add(m.name);
    };

    for (const c of this.classes) {
      addType(c.name);
      addType(c.superName);
      if (c.sourceFile) strings.add(c.sourceFile);
      for (const f of c.fields) {
        addField(`${c.name}->${f.name}:${f.type}`);
      }
      for (const m of c.methods) {
        addMethod(`${c.name}->${m.name}(${(m.params ?? []).join('')})${m.ret ?? 'V'}`);
        for (const ins of m.code ?? []) {
          if (ins.str != null) strings.add(ins.str);
          if (ins.type != null) addType(ins.type);
          if (ins.field != null) addField(ins.field);
          if (ins.method != null) addMethod(ins.method);
        }
      }
    }

    /* ---------- 2. Сортировка и индексы ---------- */
    const stringList = [...strings].sort(cmpStrings);
    const strIdx = new Map(stringList.map((s, i) => [s, i]));

    const typeList = [...types].sort((a, b) => strIdx.get(a) - strIdx.get(b));
    const typeIdx = new Map(typeList.map((t, i) => [t, i]));

    const protoList = [...protos.values()].sort((a, b) => {
      const d = typeIdx.get(a.ret) - typeIdx.get(b.ret);
      if (d) return d;
      const n = Math.min(a.params.length, b.params.length);
      for (let i = 0; i < n; i++) {
        const dd = typeIdx.get(a.params[i]) - typeIdx.get(b.params[i]);
        if (dd) return dd;
      }
      return a.params.length - b.params.length;
    });
    const protoIdx = new Map(protoList.map((p, i) => [`${p.ret}|${p.params.join('')}`, i]));

    const fieldList = [...fields.entries()].sort(([, a], [, b]) => {
      let d = typeIdx.get(a.cls) - typeIdx.get(b.cls);
      if (d) return d;
      d = strIdx.get(a.name) - strIdx.get(b.name);
      if (d) return d;
      return typeIdx.get(a.type) - typeIdx.get(b.type);
    });
    const fieldIdx = new Map(fieldList.map(([k], i) => [k, i]));

    const methodList = [...methods.entries()].sort(([, a], [, b]) => {
      let d = typeIdx.get(a.cls) - typeIdx.get(b.cls);
      if (d) return d;
      d = strIdx.get(a.name) - strIdx.get(b.name);
      if (d) return d;
      return protoIdx.get(`${a.ret}|${a.params.join('')}`) - protoIdx.get(`${b.ret}|${b.params.join('')}`);
    });
    const methodIdx = new Map(methodList.map(([k], i) => [k, i]));

    const ctxBase = {
      str: (s) => {
        const i = strIdx.get(s);
        if (i == null) throw new Error(`Строка не зарегистрирована: ${s}`);
        return i;
      },
      type: (t) => typeIdx.get(t),
      field: (f) => fieldIdx.get(f),
      method: (m) => methodIdx.get(m),
    };

    /* ---------- 3. Раскладка секций ---------- */
    const HEADER_SIZE = 112;
    let off = HEADER_SIZE;
    const align = (n) => { off = Math.ceil(off / n) * n; };

    const stringIdsOff = stringList.length ? off : 0;
    off += stringList.length * 4;
    const typeIdsOff = typeList.length ? off : 0;
    off += typeList.length * 4;
    align(4);
    const protoIdsOff = protoList.length ? off : 0;
    off += protoList.length * 12;
    const fieldIdsOff = fieldList.length ? off : 0;
    off += fieldList.length * 8;
    const methodIdsOff = methodList.length ? off : 0;
    off += methodList.length * 8;
    const classDefsOff = this.classes.length ? off : 0;
    off += this.classes.length * 32;

    const dataStart = off;

    /* --- 3a. type_list для прототипов (4-байтовое выравнивание) --- */
    const typeListOffsets = new Map();
    for (const p of protoList) {
      if (!p.params.length) continue;
      const key = p.params.join('');
      if (typeListOffsets.has(key)) continue;
      off = Math.ceil(off / 4) * 4;
      typeListOffsets.set(key, off);
      off += 4 + p.params.length * 2;
    }

    /* --- 3b. code_item (4-байтовое выравнивание) --- */
    const codeOffsets = new Map();
    const codeBlobs = new Map();
    for (const c of this.classes) {
      for (const m of c.methods) {
        if (!m.code) continue;
        const key = `${c.name}->${m.name}(${(m.params ?? []).join('')})${m.ret ?? 'V'}`;
        const blob = encodeCode(m, ctxBase);
        codeBlobs.set(key, blob);
        off = Math.ceil(off / 4) * 4;
        codeOffsets.set(key, off);
        off += blob.length;
      }
    }

    /* --- 3c. string_data_item --- */
    const stringDataOffsets = [];
    const stringDataBlobs = [];
    for (const s of stringList) {
      const enc = mutf8(s);
      const w = new ByteWriter(enc.length + 6);
      w.uleb128(utf16Len(s));
      w.bytes(enc);
      w.u8(0);
      const blob = w.toBytes();
      stringDataOffsets.push(off);
      stringDataBlobs.push(blob);
      off += blob.length;
    }

    /* --- 3d. class_data_item --- */
    const classDataOffsets = [];
    const classDataBlobs = [];
    for (const c of this.classes) {
      const blob = encodeClassData(c, { fieldIdx, methodIdx, codeOffsets });
      classDataOffsets.push(blob.length ? off : 0);
      classDataBlobs.push(blob);
      off += blob.length;
    }

    /* --- 3e. map_list --- */
    off = Math.ceil(off / 4) * 4;
    const mapOff = off;
    const mapItems = [];
    const push = (type, size, offset) => { if (size) mapItems.push({ type, size, offset }); };
    push(0x0000, 1, 0);
    push(0x0001, stringList.length, stringIdsOff);
    push(0x0002, typeList.length, typeIdsOff);
    push(0x0003, protoList.length, protoIdsOff);
    push(0x0004, fieldList.length, fieldIdsOff);
    push(0x0005, methodList.length, methodIdsOff);
    push(0x0006, this.classes.length, classDefsOff);
    if (typeListOffsets.size) {
      push(0x1001, typeListOffsets.size, Math.min(...typeListOffsets.values()));
    }
    if (codeOffsets.size) push(0x2001, codeOffsets.size, Math.min(...codeOffsets.values()));
    if (stringDataOffsets.length) push(0x2002, stringDataOffsets.length, stringDataOffsets[0]);
    const nonEmptyClassData = classDataOffsets.filter((o) => o);
    if (nonEmptyClassData.length) push(0x2000, nonEmptyClassData.length, nonEmptyClassData[0]);
    push(0x1000, 1, mapOff);
    mapItems.sort((a, b) => a.offset - b.offset);
    off += 4 + mapItems.length * 12;

    const fileSize = off;
    const dataSize = fileSize - dataStart;

    /* ---------- 4. Запись ---------- */
    const out = new Uint8Array(fileSize);
    const dv = new DataView(out.buffer);
    const putU32 = (o, v) => dv.setUint32(o, v >>> 0, true);
    const putU16 = (o, v) => dv.setUint16(o, v & 0xffff, true);

    // Заголовок
    out.set([0x64, 0x65, 0x78, 0x0a, 0x30, 0x33, 0x35, 0x00], 0); // "dex\n035\0"
    putU32(32, fileSize);
    putU32(36, HEADER_SIZE);
    putU32(40, 0x12345678);           // endian_tag
    putU32(44, 0); putU32(48, 0);     // link
    putU32(52, mapOff);
    putU32(56, stringList.length); putU32(60, stringIdsOff);
    putU32(64, typeList.length); putU32(68, typeIdsOff);
    putU32(72, protoList.length); putU32(76, protoIdsOff);
    putU32(80, fieldList.length); putU32(84, fieldIdsOff);
    putU32(88, methodList.length); putU32(92, methodIdsOff);
    putU32(96, this.classes.length); putU32(100, classDefsOff);
    putU32(104, dataSize); putU32(108, dataStart);

    // string_ids
    for (let i = 0; i < stringList.length; i++) putU32(stringIdsOff + i * 4, stringDataOffsets[i]);
    // type_ids
    for (let i = 0; i < typeList.length; i++) putU32(typeIdsOff + i * 4, strIdx.get(typeList[i]));
    // proto_ids
    for (let i = 0; i < protoList.length; i++) {
      const p = protoList[i];
      const base = protoIdsOff + i * 12;
      putU32(base, strIdx.get(p.shorty));
      putU32(base + 4, typeIdx.get(p.ret));
      putU32(base + 8, p.params.length ? typeListOffsets.get(p.params.join('')) : 0);
    }
    // field_ids
    for (let i = 0; i < fieldList.length; i++) {
      const f = fieldList[i][1];
      const base = fieldIdsOff + i * 8;
      putU16(base, typeIdx.get(f.cls));
      putU16(base + 2, typeIdx.get(f.type));
      putU32(base + 4, strIdx.get(f.name));
    }
    // method_ids
    for (let i = 0; i < methodList.length; i++) {
      const m = methodList[i][1];
      const base = methodIdsOff + i * 8;
      putU16(base, typeIdx.get(m.cls));
      putU16(base + 2, protoIdx.get(`${m.ret}|${m.params.join('')}`));
      putU32(base + 4, strIdx.get(m.name));
    }
    // class_defs
    for (let i = 0; i < this.classes.length; i++) {
      const c = this.classes[i];
      const base = classDefsOff + i * 32;
      putU32(base, typeIdx.get(c.name));
      putU32(base + 4, c.accessFlags);
      putU32(base + 8, typeIdx.get(c.superName));
      putU32(base + 12, 0); // interfaces_off
      putU32(base + 16, c.sourceFile ? strIdx.get(c.sourceFile) : 0xffffffff);
      putU32(base + 20, 0); // annotations_off
      putU32(base + 24, classDataOffsets[i]);
      putU32(base + 28, 0); // static_values_off
    }
    // type_list
    for (const [key, o] of typeListOffsets) {
      const params = splitParams(key);
      putU32(o, params.length);
      for (let i = 0; i < params.length; i++) putU16(o + 4 + i * 2, typeIdx.get(params[i]));
    }
    // code_item
    for (const [key, o] of codeOffsets) out.set(codeBlobs.get(key), o);
    // string_data
    for (let i = 0; i < stringDataBlobs.length; i++) out.set(stringDataBlobs[i], stringDataOffsets[i]);
    // class_data
    for (let i = 0; i < classDataBlobs.length; i++) {
      if (classDataOffsets[i]) out.set(classDataBlobs[i], classDataOffsets[i]);
    }
    // map_list
    putU32(mapOff, mapItems.length);
    for (let i = 0; i < mapItems.length; i++) {
      const b = mapOff + 4 + i * 12;
      putU16(b, mapItems[i].type);
      putU16(b + 2, 0);
      putU32(b + 4, mapItems[i].size);
      putU32(b + 8, mapItems[i].offset);
    }

    /* ---------- 5. Контрольные суммы ---------- */
    const sig = sha1(out.subarray(32));
    out.set(sig, 12);
    putU32(8, adler32(out, 12));

    return out;
  }
}

/* ------------------------------------------------------------------ */
/*                      Кодирование code_item                          */
/* ------------------------------------------------------------------ */
function encodeCode(m, ctxBase) {
  const code = m.code ?? [];

  // 1. Позиции меток (в 16-битных единицах от начала insns)
  const labels = new Map();
  let pc = 0;
  for (const ins of code) {
    if (ins.label != null) labels.set(ins.label, pc);
    pc += ins.size;
  }
  const insnsUnits = pc;

  const ctx = { ...ctxBase, label: (name) => {
    const v = labels.get(name);
    if (v == null) throw new Error(`Метка не найдена: ${name}`);
    return v;
  } };

  // 2. Собственно инструкции
  const insns = new ByteWriter(insnsUnits * 2);
  pc = 0;
  for (const ins of code) {
    ins.emit(insns, ctx, pc);
    pc += ins.size;
  }
  const insnBytes = insns.toBytes();
  if (insnBytes.length !== insnsUnits * 2) {
    throw new Error(`Несовпадение размера инструкций в ${m.name}: ` +
      `${insnBytes.length} байт против ожидаемых ${insnsUnits * 2}`);
  }

  const w = new ByteWriter(16 + insnBytes.length);
  w.u16(m.registers ?? 1);
  w.u16(m.ins ?? 0);
  w.u16(m.outs ?? 0);
  w.u16(0);            // tries_size
  w.u32(0);            // debug_info_off
  w.u32(insnsUnits);
  w.bytes(insnBytes);
  return w.toBytes();
}

/* ------------------------------------------------------------------ */
/*                    Кодирование class_data_item                      */
/* ------------------------------------------------------------------ */
function encodeClassData(c, { fieldIdx, methodIdx, codeOffsets }) {
  const staticFields = c.fields.filter((f) => (f.accessFlags ?? 0) & ACC.STATIC);
  const instFields = c.fields.filter((f) => !((f.accessFlags ?? 0) & ACC.STATIC));
  const direct = c.methods.filter((m) => (m.accessFlags ?? 0) & (ACC.STATIC | ACC.PRIVATE | ACC.CONSTRUCTOR));
  const virtual = c.methods.filter((m) => !((m.accessFlags ?? 0) & (ACC.STATIC | ACC.PRIVATE | ACC.CONSTRUCTOR)));

  if (!staticFields.length && !instFields.length && !direct.length && !virtual.length) {
    return new Uint8Array(0);
  }

  const w = new ByteWriter(256);
  w.uleb128(staticFields.length);
  w.uleb128(instFields.length);
  w.uleb128(direct.length);
  w.uleb128(virtual.length);

  const writeFields = (list) => {
    const sorted = [...list].sort((a, b) =>
      fieldIdx.get(`${c.name}->${a.name}:${a.type}`) - fieldIdx.get(`${c.name}->${b.name}:${b.type}`));
    let prev = 0;
    for (const f of sorted) {
      const idx = fieldIdx.get(`${c.name}->${f.name}:${f.type}`);
      w.uleb128(idx - prev);
      w.uleb128(f.accessFlags ?? ACC.PUBLIC);
      prev = idx;
    }
  };

  const keyOf = (m) => `${c.name}->${m.name}(${(m.params ?? []).join('')})${m.ret ?? 'V'}`;
  const writeMethods = (list) => {
    const sorted = [...list].sort((a, b) => methodIdx.get(keyOf(a)) - methodIdx.get(keyOf(b)));
    let prev = 0;
    for (const m of sorted) {
      const key = keyOf(m);
      const idx = methodIdx.get(key);
      w.uleb128(idx - prev);
      w.uleb128(m.accessFlags ?? ACC.PUBLIC);
      w.uleb128(m.code ? codeOffsets.get(key) : 0);
      prev = idx;
    }
  };

  writeFields(staticFields);
  writeFields(instFields);
  writeMethods(direct);
  writeMethods(virtual);
  return w.toBytes();
}
