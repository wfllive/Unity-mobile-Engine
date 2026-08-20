import { buildApk } from '../../src/apk/builder.js';
import fs from 'fs';
const r = await buildApk({
  config: { packageName: 'com.wfl.demo', appName: 'WFL Demo', versionName: '1.0' },
  assets: [
    { path: 'index.html', data: '<!doctype html><html><body><h1>WFL</h1></body></html>' },
    { path: 'game.js', data: 'console.log("hi");' },
  ],
  onProgress: (s, p) => console.log(`  [${(p*100).toFixed(0)}%] ${s}`),
});
fs.writeFileSync('/tmp/out.apk', r.bytes);
console.log('APK', r.size, 'bytes,', r.entries, 'entries');
