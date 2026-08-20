// WFL Engine — минимальный DER-кодировщик ASN.1 (для X.509 и PKCS#7)
import { concatBytes } from './bytes.js';

/* Теги */
export const TAG = {
  BOOLEAN: 0x01,
  INTEGER: 0x02,
  BIT_STRING: 0x03,
  OCTET_STRING: 0x04,
  NULL: 0x05,
  OID: 0x06,
  UTF8_STRING: 0x0c,
  SEQUENCE: 0x30,
  SET: 0x31,
  PRINTABLE_STRING: 0x13,
  IA5_STRING: 0x16,
  UTC_TIME: 0x17,
  GENERALIZED_TIME: 0x18,
};

/** Кодирование длины по правилам DER */
function encodeLength(n) {
  if (n < 0x80) return new Uint8Array([n]);
  const bytes = [];
  let v = n;
  while (v > 0) { bytes.unshift(v & 0xff); v >>>= 8; }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

/** Обернуть содержимое в TLV */
export function der(tag, content) {
  const body = content instanceof Uint8Array ? content : concatBytes(content);
  return concatBytes([new Uint8Array([tag]), encodeLength(body.length), body]);
}

export const seq = (...items) => der(TAG.SEQUENCE, concatBytes(items.flat()));
export const set = (...items) => der(TAG.SET, concatBytes(items.flat()));

/** Целое (беззнаковое, из массива байтов big-endian) */
export function derInteger(bytes) {
  let b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // убрать ведущие нули
  let i = 0;
  while (i < b.length - 1 && b[i] === 0) i++;
  b = b.subarray(i);
  // если старший бит взведён — добавить 0x00 (чтобы число осталось положительным)
  if (b[0] & 0x80) b = concatBytes([new Uint8Array([0]), b]);
  return der(TAG.INTEGER, b);
}

export function derIntegerNum(n) {
  if (n === 0) return der(TAG.INTEGER, new Uint8Array([0]));
  const bytes = [];
  let v = Math.abs(n);
  while (v > 0) { bytes.unshift(v & 0xff); v = Math.floor(v / 256); }
  return derInteger(new Uint8Array(bytes));
}

/** Кодирование OID из строки '1.2.840.113549.1.1.11' */
export function derOid(oid) {
  const parts = oid.split('.').map(Number);
  const out = [parts[0] * 40 + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i];
    const chunk = [v & 0x7f];
    v = Math.floor(v / 128);
    while (v > 0) { chunk.unshift((v & 0x7f) | 0x80); v = Math.floor(v / 128); }
    out.push(...chunk);
  }
  return der(TAG.OID, new Uint8Array(out));
}

export const derNull = () => new Uint8Array([TAG.NULL, 0x00]);

export function derBitString(bytes, unusedBits = 0) {
  return der(TAG.BIT_STRING, concatBytes([new Uint8Array([unusedBits]), bytes]));
}

export const derOctetString = (bytes) => der(TAG.OCTET_STRING, bytes);

export function derUtf8(str) {
  return der(TAG.UTF8_STRING, new TextEncoder().encode(str));
}

export function derPrintable(str) {
  return der(TAG.PRINTABLE_STRING, new TextEncoder().encode(str));
}

/** UTCTime в формате YYMMDDhhmmssZ */
export function derUtcTime(date) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const s = `${p(date.getUTCFullYear() % 100)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
  return der(TAG.UTC_TIME, new TextEncoder().encode(s));
}

/** GeneralizedTime YYYYMMDDhhmmssZ (для дат после 2049) */
export function derGeneralizedTime(date) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const s = `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
  return der(TAG.GENERALIZED_TIME, new TextEncoder().encode(s));
}

/** Время по правилам X.509: до 2050 — UTCTime, иначе GeneralizedTime */
export const derTime = (d) => (d.getUTCFullYear() < 2050 ? derUtcTime(d) : derGeneralizedTime(d));

/** Контекстно-зависимый тег [n] (конструктивный) */
export const derContext = (n, content) => der(0xa0 | n, content);

/* Часто используемые OID */
export const OID = {
  rsaEncryption: '1.2.840.113549.1.1.1',
  sha256WithRSA: '1.2.840.113549.1.1.11',
  sha1WithRSA: '1.2.840.113549.1.1.5',
  sha256: '2.16.840.1.101.3.4.2.1',
  sha1: '1.3.14.3.2.26',
  commonName: '2.5.4.3',
  organizationName: '2.5.4.10',
  organizationalUnit: '2.5.4.11',
  countryName: '2.5.4.6',
  localityName: '2.5.4.7',
  stateName: '2.5.4.8',
  // PKCS#7
  pkcs7Data: '1.2.840.113549.1.7.1',
  pkcs7SignedData: '1.2.840.113549.1.7.2',
  // X.509 расширения
  basicConstraints: '2.5.29.19',
  keyUsage: '2.5.29.15',
  subjectKeyIdentifier: '2.5.29.14',
};

/** AlgorithmIdentifier с параметром NULL */
export const algId = (oid) => seq(derOid(oid), derNull());

/**
 * Построить Name (RDNSequence) из объекта {CN, O, OU, C, L, ST}
 */
export function derName(fields) {
  const map = [
    ['C', OID.countryName, derPrintable],
    ['ST', OID.stateName, derUtf8],
    ['L', OID.localityName, derUtf8],
    ['O', OID.organizationName, derUtf8],
    ['OU', OID.organizationalUnit, derUtf8],
    ['CN', OID.commonName, derUtf8],
  ];
  const rdns = [];
  for (const [key, oid, enc] of map) {
    const v = fields[key];
    if (v == null || v === '') continue;
    rdns.push(set(seq(derOid(oid), enc(String(v)))));
  }
  return seq(...rdns);
}
