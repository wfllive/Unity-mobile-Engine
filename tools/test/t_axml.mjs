import { buildManifest } from '../../src/apk/manifest.js';
import fs from 'fs';
const b = buildManifest({ packageName:'com.wfl.demo', appName:'WFL Demo', versionName:'1.0.0' });
fs.writeFileSync('/tmp/AndroidManifest.xml', b);
console.log('bytes', b.length);
