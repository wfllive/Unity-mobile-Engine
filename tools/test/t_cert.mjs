import { generateSigningKey, exportCertificatePem, exportPrivateKeyPem } from '../../src/apk/keystore.js';
import fs from 'fs';
const k = await generateSigningKey();
fs.writeFileSync('/tmp/cert.der', k.certificate);
fs.writeFileSync('/tmp/cert.pem', exportCertificatePem(k.certificate));
fs.writeFileSync('/tmp/key.pem', await exportPrivateKeyPem(k.privateKey));
console.log('cert bytes', k.certificate.length);
console.log('fp', k.fingerprint);
