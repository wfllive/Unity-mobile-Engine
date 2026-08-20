// Смоук: реально ли загружается игра из собранного APK (assets/index.html)
import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'fs';
const file = process.argv[2] ?? '/tmp/apktest/assets/index.html';
const html = fs.readFileSync(file, 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(e.message));
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'file:///android_asset/index.html', virtualConsole: vc });
const w = dom.window;
await new Promise((r) => setTimeout(r, 3000));
console.log('window.wfl:        ', !!w.wfl);
console.log('wfl.engine:        ', !!w.wfl?.engine);
console.log('__WFL_SCENE__:     ', !!w.__WFL_SCENE__, '| объектов:', w.__WFL_SCENE__?.objects?.length ?? 0);
const splash = w.document.getElementById('splash');
console.log('splash:            ', splash ? JSON.stringify(splash.textContent.trim().slice(0, 160)) : '(удалён — игра стартовала)');
console.log('ошибок:            ', errors.length);
errors.slice(0, 4).forEach((e) => console.log('   •', String(e).split('\n')[0].slice(0, 220)));
