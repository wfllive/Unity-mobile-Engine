// WFL Engine — подпись APK схемами v1 (JAR) и v2 (APK Signature Scheme v2).
//
// v1 — META-INF/MANIFEST.MF + CERT.SF + CERT.RSA (PKCS#7 detached).
//      Требуется для Android < 7.0.
// v2 — блок «APK Signing Block» между записями и Central Directory,
//      подписывается хеш всего файла по чанкам 1 МБ. Требуется с Android 7.0+
//      и обязателен для targetSdk ≥ 30 при установке.
import { ByteWriter, concatBytes } from './bytes.js';
import { sha256, base64 } from './hash.js';
import {
  seq, set, der, derInteger, derIntegerNum, derOid, derNull, derOctetString,
  derContext, algId, OID, TAG,
} from './asn1.js';
import { signBytes } from './keystore.js';

const enc = (s) => new TextEncoder().encode(s);

/* ================================================================== */
/*                        Схема v1 (JAR signing)                       */
/* ================================================================== */

/** Перенос строк по правилам JAR-манифеста: не более 72 байт в строке */
function wrapManifestLine(line) {
  const bytes = enc(line);
  if (bytes.length <= 72) return `${line}\r\n`;
  let out = '';
  let i = 0;
  // первая строка — 72 байта, продолжения — 71 байт с ведущим пробелом
  while (i < bytes.length) {
    const take = i === 0 ? 72 : 71;
    const chunk = bytes.subarray(i, i + take);
    out += (i === 0 ? '' : ' ') + new TextDecoder().decode(chunk) + '\r\n';
    i += take;
  }
  return out;
}

function manifestSection(lines) {
  return lines.map(([k, v]) => wrapManifestLine(`${k}: ${v}`)).join('') + '\r\n';
}

/**
 * Построить META-INF/MANIFEST.MF, CERT.SF и CERT.RSA.
 * @param {Array<{name:string,data:Uint8Array}>} entries записи APK (без META-INF)
 * @param {{privateKey:CryptoKey, certificate:Uint8Array}} key
 * @param {{createdBy?:string, alias?:string}} [opts]
 */
export async function buildV1Signature(entries, key, { createdBy = 'WFL Engine APK Builder' } = {}) {
  /* ---- MANIFEST.MF ---- */
  const mainSection = manifestSection([
    ['Manifest-Version', '1.0'],
    ['Created-By', createdBy],
  ]);

  const entrySections = [];
  for (const e of entries) {
    if (e.name.startsWith('META-INF/')) continue;
    if (e.name.endsWith('/')) continue;
    entrySections.push({
      name: e.name,
      text: manifestSection([
        ['Name', e.name],
        ['SHA-256-Digest', base64(sha256(e.data))],
      ]),
    });
  }

  const manifestText = mainSection + entrySections.map((s) => s.text).join('');
  const manifestBytes = enc(manifestText);

  /* ---- CERT.SF ---- */
  const sfMain = manifestSection([
    ['Signature-Version', '1.0'],
    ['Created-By', createdBy],
    ['SHA-256-Digest-Manifest', base64(sha256(manifestBytes))],
    ['SHA-256-Digest-Manifest-Main-Attributes', base64(sha256(enc(mainSection)))],
  ]);

  const sfEntries = entrySections.map((s) => manifestSection([
    ['Name', s.name],
    ['SHA-256-Digest', base64(sha256(enc(s.text)))],
  ])).join('');

  const sfBytes = enc(sfMain + sfEntries);

  /* ---- CERT.RSA (PKCS#7 SignedData, detached) ---- */
  const signature = await signBytes(key.privateKey, sfBytes);
  const p7 = buildPkcs7({ certificate: key.certificate, signature });

  return {
    'META-INF/MANIFEST.MF': manifestBytes,
    'META-INF/CERT.SF': sfBytes,
    'META-INF/CERT.RSA': p7,
  };
}

/** Извлечь issuer и serialNumber из DER-сертификата (для SignerInfo) */
function parseCertIssuerSerial(cert) {
  // Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signatureValue }
  // TBSCertificate ::= SEQUENCE { [0] version, serialNumber, signature, issuer, ... }
  let i = 0;
  const readTag = () => cert[i++];
  const readLen = () => {
    let len = cert[i++];
    if (len & 0x80) {
      const n = len & 0x7f;
      len = 0;
      for (let k = 0; k < n; k++) len = (len << 8) | cert[i++];
    }
    return len;
  };
  readTag(); readLen();                    // Certificate SEQUENCE
  readTag(); readLen();                    // TBSCertificate SEQUENCE

  // [0] version (опционально)
  let start = i;
  let tag = readTag();
  let len = readLen();
  if (tag === 0xa0) { i += len; } else { i = start; }

  // serialNumber INTEGER
  start = i;
  readTag(); len = readLen();
  const serial = cert.subarray(start, i + len);
  i += len;

  // signature AlgorithmIdentifier
  readTag(); len = readLen(); i += len;

  // issuer Name
  start = i;
  readTag(); len = readLen();
  const issuer = cert.subarray(start, i + len);

  return { issuer, serial };
}

/** PKCS#7 SignedData c detached-содержимым */
function buildPkcs7({ certificate, signature }) {
  const { issuer, serial } = parseCertIssuerSerial(certificate);

  const signerInfo = seq(
    derIntegerNum(1),                       // version
    seq(issuer, serial),                    // issuerAndSerialNumber
    algId(OID.sha256),                      // digestAlgorithm
    algId(OID.rsaEncryption),               // digestEncryptionAlgorithm
    derOctetString(signature),              // encryptedDigest
  );

  const signedData = seq(
    derIntegerNum(1),                       // version
    set(algId(OID.sha256)),                 // digestAlgorithms
    seq(derOid(OID.pkcs7Data)),             // contentInfo (detached: без content)
    derContext(0, certificate),             // [0] certificates
    set(signerInfo),                        // signerInfos
  );

  return seq(derOid(OID.pkcs7SignedData), derContext(0, signedData));
}

/* ================================================================== */
/*                        Схема v2 (APK Signing Block)                 */
/* ================================================================== */

const APK_SIG_BLOCK_MAGIC = enc('APK Sig Block 42');
const V2_BLOCK_ID = 0x7109871a;
/** RSASSA-PKCS1-v1_5 с SHA-256 */
const SIG_ALGO_RSA_SHA256 = 0x0103;
const CHUNK_SIZE = 1024 * 1024;

/**
 * Посчитать хеш APK по правилам v2: файл делится на чанки по 1 МБ,
 * каждый чанк хешируется с префиксом 0xa5 + длина, затем финальный хеш
 * берётся от 0x5a + количество чанков + все хеши чанков.
 *
 * @param {Array<Uint8Array>} sections три секции: содержимое записей,
 *        Central Directory, EOCD (с уже исправленным смещением CD).
 */
export function computeV2Digest(sections) {
  const chunkDigests = [];
  let chunkCount = 0;

  for (const section of sections) {
    for (let off = 0; off < section.length; off += CHUNK_SIZE) {
      const chunk = section.subarray(off, Math.min(off + CHUNK_SIZE, section.length));
      const w = new ByteWriter(5 + chunk.length);
      w.u8(0xa5);
      w.u32(chunk.length);
      w.bytes(chunk);
      chunkDigests.push(sha256(w.toBytes()));
      chunkCount++;
    }
  }

  const top = new ByteWriter(5 + chunkCount * 32);
  top.u8(0x5a);
  top.u32(chunkCount);
  for (const d of chunkDigests) top.bytes(d);
  return sha256(top.toBytes());
}

/** Блок с префиксом длины (uint32) */
function lenPrefixed(bytes) {
  const w = new ByteWriter(4 + bytes.length);
  w.u32(bytes.length);
  w.bytes(bytes);
  return w.toBytes();
}

/**
 * Собрать APK Signing Block со схемой v2.
 * @param {Uint8Array} digest       результат computeV2Digest
 * @param {Uint8Array} certificate  DER-сертификат
 * @param {CryptoKey} privateKey
 */
export async function buildV2Block(digest, certificate, privateKey) {
  // digests: sequence of (signature algorithm ID, digest)
  const digestEntry = concatBytes([
    u32(SIG_ALGO_RSA_SHA256),
    lenPrefixed(digest),
  ]);
  const digests = lenPrefixed(lenPrefixed(digestEntry));

  const certificates = lenPrefixed(lenPrefixed(certificate));

  // additional attributes — пусто
  const additional = lenPrefixed(new Uint8Array(0));

  const signedData = concatBytes([digests, certificates, additional]);
  const signedDataBlock = lenPrefixed(signedData);

  const signature = await signBytes(privateKey, signedData);
  const sigEntry = concatBytes([u32(SIG_ALGO_RSA_SHA256), lenPrefixed(signature)]);
  const signatures = lenPrefixed(lenPrefixed(sigEntry));

  // publicKey в формате SubjectPublicKeyInfo — берём из сертификата
  const spki = extractSpki(certificate);
  const publicKey = lenPrefixed(spki);

  const signer = concatBytes([signedDataBlock, signatures, publicKey]);
  const signers = lenPrefixed(lenPrefixed(signer));

  // Пара (ID, value) внутри Signing Block
  const pairValue = concatBytes([u32(V2_BLOCK_ID), signers]);

  // Полный блок: size(8) | pairs | size(8) | magic(16)
  // Размер блока должен быть кратен 4096 для оптимальности — добиваем padding-парой.
  let pairs = concatBytes([u64(pairValue.length), pairValue]);

  // Итоговая длина = 8 (size) + pairs + 8 (size) + 16 (magic)
  let total = 8 + pairs.length + 8 + 16;
  const pad = (4096 - (total % 4096)) % 4096;
  if (pad >= 12) {
    // padding pair: 8 байт длины + 4 байта ID + (pad-12) нулей
    const padValue = concatBytes([u32(0x42726577), new Uint8Array(pad - 12)]);
    pairs = concatBytes([pairs, u64(padValue.length), padValue]);
    total = 8 + pairs.length + 8 + 16;
  }

  const sizeOfBlock = pairs.length + 8 + 16;   // всё после первого поля size
  return concatBytes([u64(sizeOfBlock), pairs, u64(sizeOfBlock), APK_SIG_BLOCK_MAGIC]);
}

function u32(n) {
  const w = new ByteWriter(4);
  w.u32(n);
  return w.toBytes();
}

function u64(n) {
  const w = new ByteWriter(8);
  w.u64(n);
  return w.toBytes();
}

/** Вытащить SubjectPublicKeyInfo (DER) из сертификата */
function extractSpki(cert) {
  let i = 0;
  const readLen = () => {
    let len = cert[i++];
    if (len & 0x80) {
      const n = len & 0x7f;
      len = 0;
      for (let k = 0; k < n; k++) len = (len << 8) | cert[i++];
    }
    return len;
  };
  const skip = () => { i++; const l = readLen(); i += l; };

  i++; readLen();          // Certificate
  i++; readLen();          // TBSCertificate

  const start0 = i;
  const tag = cert[i++];
  const l0 = readLen();
  if (tag === 0xa0) i += l0; else i = start0;

  skip();                  // serialNumber
  skip();                  // signature
  skip();                  // issuer
  skip();                  // validity
  skip();                  // subject

  const spkiStart = i;
  i++;
  const spkiLen = readLen();
  return cert.subarray(spkiStart, i + spkiLen);
}
