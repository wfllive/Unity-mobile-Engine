import { buildArsc } from '../../src/apk/arsc.js';
import fs from 'fs';
const { bytes, ids } = buildArsc({
  packageName: 'com.wfl.demo',
  types: [
    { type: 'drawable', entries: [{ name: 'ic_launcher', value: 'res/ic_launcher.png' }] },
    { type: 'string', entries: [{ name: 'app_name', value: 'WFL Demo' }] },
  ],
});
fs.writeFileSync('/tmp/resources.arsc', bytes);
console.log(bytes.length, ids);
