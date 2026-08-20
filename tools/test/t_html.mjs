import { buildRuntimeHtml } from '../../src/apk/runtime-html.js';
const scene = { version:1, name:'T', settings:{}, objects:[{name:'Cube</script>',id:'1',components:[]}] };
const html = await buildRuntimeHtml({ scene, config:{ appName:'Тест <b>&"'} });
// структурные проверки
const checks = {
  doctype: html.startsWith('<!doctype html>'),
  'нет незакрытого </script> из данных': !html.includes('</script>--'),
  'экранирован < в JSON': html.includes('\\u003c'),
  'title экранирован': html.includes('&lt;b&gt;'),
  'сцена внедрена': html.includes('__WFL_SCENE__'),
  'рантайм внедрён': html.includes('WebGLRenderer') || html.length > 500000,
  'viewport': html.includes('user-scalable=no'),
};
let bad = 0;
for (const [k,v] of Object.entries(checks)) { if(!v) bad++; console.log((v?'  ok  ':'  FAIL') + '  ' + k); }
// количество открывающих/закрывающих script должно совпадать
const open = (html.match(/<script(?![^>]*\/>)/g)||[]).length;
const close = (html.match(/<\/script>/g)||[]).length;
console.log(`  script тегов: ${open} открыт / ${close} закрыт`, open===close?'ok':'FAIL');
if (open!==close) bad++;
console.log(`\nHTML ${(html.length/1024).toFixed(0)} КБ, ошибок: ${bad}`);
process.exit(bad?1:0);
