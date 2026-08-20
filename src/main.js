// WFL Engine — точка входа веб-приложения.
// Загружает демо-игру, поднимает редактор по требованию и умеет
// собрать APK прямо в браузере (без сервера, Gradle и Android SDK).
import { DemoGame } from './game/game.js';
import { openEditor } from './editor/editor.js';
import { openBuildDialog } from './editor/build-dialog.js';
import { VERSION } from './engine/index.js';

const boot = document.getElementById('boot');
const bootFill = document.getElementById('boot-fill');
const bootStatus = document.getElementById('boot-status');
const menu = document.getElementById('menu');
const app = document.getElementById('app');

const setProgress = (p, text) => {
  bootFill.style.width = `${Math.round(p * 100)}%`;
  if (text) bootStatus.textContent = text;
};

/** Дать браузеру отрисовать кадр между шагами загрузки */
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

let game = null;
let editor = null;

async function main() {
  setProgress(0.15, 'загрузка движка…');
  await nextFrame();

  setProgress(0.4, 'построение сцены…');
  await nextFrame();

  try {
    game = new DemoGame(app);
  } catch (err) {
    bootStatus.style.color = '#f87171';
    bootStatus.textContent = `ошибка: ${err.message}`;
    console.error(err);
    return;
  }

  setProgress(0.85, 'подготовка интерфейса…');
  await nextFrame();

  // Демо-игра сама показывает своё меню, наше стартовое окно не нужно
  menu.classList.add('hidden');

  setProgress(1, 'готово');
  await new Promise((r) => setTimeout(r, 220));
  boot.classList.add('hidden');
  setTimeout(() => { boot.style.display = 'none'; }, 500);

  installGlobalControls();
  console.log(
    `%cWFL Engine v${VERSION}%c\nF2 — редактор · F4 — сборка APK · window.wfl — доступ к движку`,
    'font-weight:800;font-size:14px;color:#4fc3f7', 'color:#64748b',
  );
}

/** Горячие клавиши и служебные кнопки поверх игры */
function installGlobalControls() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F2') { e.preventDefault(); toggleEditor(); }
    if (e.key === 'F4') { e.preventDefault(); openBuildDialog(game.engine); }
  });

  // Кнопки в стартовом меню (если оно будет показано вручную)
  document.getElementById('btn-play')?.addEventListener('click', () => {
    menu.classList.add('hidden');
    game.startGame();
  });
  document.getElementById('btn-editor')?.addEventListener('click', () => {
    menu.classList.add('hidden');
    toggleEditor();
  });
  document.getElementById('btn-apk')?.addEventListener('click', () => {
    openBuildDialog(game.engine);
  });

  // Плавающая кнопка редактора на десктопе
  if (!game.engine.isMobile) addEditorFab();

  // Отладочный доступ
  window.wfl = {
    engine: game.engine,
    game,
    get scene() { return game.engine.scene; },
    editor: () => toggleEditor(),
    buildApk: () => openBuildDialog(game.engine),
    version: VERSION,
  };
}

function addEditorFab() {
  const fab = document.createElement('button');
  fab.textContent = '⚙ Редактор  (F2)';
  fab.style.cssText = `
    position: fixed; left: 12px; bottom: 12px; z-index: 50;
    padding: 9px 14px; border: 1px solid #1e293b; border-radius: 8px;
    background: rgba(15,23,42,.85); color: #94a3b8; cursor: pointer;
    font: 600 12px/1 system-ui, sans-serif; backdrop-filter: blur(6px);
  `;
  fab.onmouseenter = () => { fab.style.color = '#e2e8f0'; fab.style.borderColor = '#334155'; };
  fab.onmouseleave = () => { fab.style.color = '#94a3b8'; fab.style.borderColor = '#1e293b'; };
  fab.onclick = () => toggleEditor();
  document.body.appendChild(fab);
  window.__wflFab = fab;
}

function toggleEditor() {
  if (editor) {
    editor.dispose?.();
    editor = null;
    window.__wflFab && (window.__wflFab.style.display = '');
    return;
  }
  editor = openEditor(game.engine, game);
  window.__wflFab && (window.__wflFab.style.display = 'none');

  // Когда редактор закроется сам — вернуть кнопку
  const origDispose = editor.dispose?.bind(editor);
  if (origDispose) {
    editor.dispose = () => {
      origDispose();
      editor = null;
      window.__wflFab && (window.__wflFab.style.display = '');
    };
  }
}

main();
