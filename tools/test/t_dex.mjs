import { buildActivityDex } from '../../src/apk/activity.js';
import fs from 'fs';
const b = buildActivityDex({ packageName: 'com.wfl.demo' });
fs.writeFileSync('/tmp/classes.dex', b);
console.log('dex bytes', b.length);
