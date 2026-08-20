// WFL Engine — генерация ключа RSA и самоподписанного сертификата X.509
// на WebCrypto (работает и в браузере, и в Node ≥ 16).
import {
  seq, set, der, derInteger, derIntegerNum, derOid, derNull, derBitString,
  derOctetString, derName, derTime, derContext, algId, OID, TAG,
} from './asn1.js';
import { concatBytes } from './bytes.js';
import { sha1, base64 } from './hash.js';

const subtle = () => {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error('WebCrypto недоступен: подпись APK невозможна');
  return c.subtle;
};

export const DEFAULT_SUBJECT = {
  CN: 'WFL Engine',
  OU: 'Game',
  O: 'WFL',
  L: 'Unknown',
  ST: 'Unknown',
  C: 'NO',
};

/**
 * Сгенерировать пару ключей RSA-2048 (SHA-256) и самоподписанный сертификат.
 * @param {object} [opts]
 * @param {object} [opts.subject]  поля DN (CN/O/OU/C/L/ST)
 * @param {number} [opts.years]    срок действия в годах (Google Play требует ≥ 25 лет после 2033)
 * @param {Date}   [opts.notBefore]
 * @returns {Promise<{privateKey:CryptoKey, publicKey:CryptoKey, certificate:Uint8Array,
 *                    subject:object, spki:Uint8Array, fingerprint:string}>}
 */
export async function generateSigningKey({
  subject = DEFAULT_SUBJECT,
  years = 30,
  notBefore = new Date(Date.now() - 24 * 3600 * 1000),
} = {}) {
  const s = subtle();
  const keys = await s.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );

  const spki = new Uint8Array(await s.exportKey('spki', keys.publicKey));
  const notAfter = new Date(notBefore.getTime());
  notAfter.setUTCFullYear(notAfter.getUTCFullYear() + years);

  const certificate = await buildSelfSignedCert({
    privateKey: keys.privateKey,
    spki,
    subject,
    notBefore,
    notAfter,
  });

  return {
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    certificate,
    subject,
    spki,
    fingerprint: hex(sha1(certificate)),
  };
}

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(':').toUpperCase();
}

/** Извлечь BIT STRING открытого ключа из SPKI (для subjectKeyIdentifier) */
function publicKeyBits(spki) {
  // SPKI = SEQUENCE { AlgorithmIdentifier, BIT STRING }
  // Ищем последний BIT STRING верхнего уровня — простой разбор DER.
  let i = 0;
  const readLen = () => {
    let len = spki[i++];
    if (len & 0x80) {
      const n = len & 0x7f;
      len = 0;
      for (let k = 0; k < n; k++) len = (len << 8) | spki[i++];
    }
    return len;
  };
  i = 1; readLen();                 // внешний SEQUENCE
  const algTag = spki[i++]; readLen0(); // AlgorithmIdentifier
  function readLen0() {
    let len = spki[i++];
    if (len & 0x80) {
      const n = len & 0x7f;
      len = 0;
      for (let k = 0; k < n; k++) len = (len << 8) | spki[i++];
    }
    i += len;
    return len;
  }
  void algTag;
  i++;                              // тег BIT STRING
  const bitLen = readLen();
  const unused = spki[i];
  void unused;
  return spki.subarray(i + 1, i + bitLen);
}

/** Собрать самоподписанный сертификат X.509 v3 */
async function buildSelfSignedCert({ privateKey, spki, subject, notBefore, notAfter }) {
  const name = derName(subject);
  const serial = derInteger(randomBytes(16));
  const sigAlg = algId(OID.sha256WithRSA);

  // subjectKeyIdentifier = SHA-1 от битов открытого ключа
  const skid = sha1(publicKeyBits(spki));

  const extensions = derContext(3, seq(
    // basicConstraints: CA:FALSE (critical)
    seq(derOid(OID.basicConstraints), derOctetString(seq())),
    // keyUsage: digitalSignature | keyEncipherment | keyCertSign
    seq(
      derOid(OID.keyUsage),
      der(TAG.BOOLEAN, new Uint8Array([0xff])),
      derOctetString(derBitString(new Uint8Array([0xa4]), 2)),
    ),
    // subjectKeyIdentifier
    seq(derOid(OID.subjectKeyIdentifier), derOctetString(derOctetString(skid))),
  ));

  const tbs = seq(
    derContext(0, derIntegerNum(2)),      // version v3
    serial,
    sigAlg,
    name,                                 // issuer == subject (самоподписанный)
    seq(derTime(notBefore), derTime(notAfter)),
    name,
    spki,
    extensions,
  );

  const signature = new Uint8Array(
    await subtle().sign('RSASSA-PKCS1-v1_5', privateKey, tbs),
  );

  return seq(tbs, sigAlg, derBitString(signature));
}

function randomBytes(n) {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  b[0] &= 0x7f;      // положительный serial
  b[0] |= 0x01;
  return b;
}

/** Экспорт ключа в PEM PKCS#8 (чтобы пользователь мог сохранить keystore) */
export async function exportPrivateKeyPem(privateKey) {
  const pkcs8 = new Uint8Array(await subtle().exportKey('pkcs8', privateKey));
  return pemWrap('PRIVATE KEY', pkcs8);
}

export function exportCertificatePem(certificate) {
  return pemWrap('CERTIFICATE', certificate);
}

function pemWrap(label, bytes) {
  // Разбиваем на строки по 64 символа. Важно не оставить пустую строку перед
  // END, иначе OpenSSL считает PEM повреждённым (когда длина кратна 64).
  const b64 = base64(bytes);
  const lines = [];
  for (let i = 0; i < b64.length; i += 64) lines.push(b64.slice(i, i + 64));
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

/** Импорт ранее сохранённого ключа (PEM PKCS#8) */
export async function importPrivateKeyPem(pem) {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = Uint8Array.from(atobSafe(body), (c) => c.charCodeAt(0));
  return subtle().importKey(
    'pkcs8', bin,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    true, ['sign'],
  );
}

function atobSafe(b64) {
  if (typeof atob === 'function') return atob(b64);
  return Buffer.from(b64, 'base64').toString('binary');
}

/** Подпись произвольных данных ключом (RSASSA-PKCS1-v1_5 / SHA-256) */
export async function signBytes(privateKey, data) {
  return new Uint8Array(await subtle().sign('RSASSA-PKCS1-v1_5', privateKey, data));
}

export { concatBytes };
