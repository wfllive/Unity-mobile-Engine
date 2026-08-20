// WFL Engine — точка входа веб-приложения.
//
// Приложение открывается на списке проектов. Оттуда пользователь либо
// запускает игру, либо открывает её в редакторе. Демо-сцена — просто один
// из шаблонов проекта, а не то, что грузится само по себе.
import { App } from './shell/app.js';
import { VERSION } from './engine/index.js';

const boot = document.getElementById('boot');
const bootFill = document.getElementById('boot-fill');
const bootStatus = document.getElementById('boot-status');
const app = document.getElementById('app');

const setProgress = (p, text) => {
  if (bootFill) bootFill.style.width = `${Math.round(p * 100)}%`;
  if (text && bootStatus) bootStatus.textContent = text;
};

/** Дать браузеру отрисовать кадр между шагами загрузки */
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function main() {
  setProgress(0.2, 'загрузка движка…');
  await nextFrame();

  let shell;
  try {
    setProgress(0.6, 'подготовка интерфейса…');
    await nextFrame();
    shell = new App(app);
  } catch (err) {
    if (bootStatus) {
      bootStatus.style.color = '#f87171';
      bootStatus.textContent = `ошибка: ${err.message}`;
    }
    console.error(err);
    return;
  }

  setProgress(1, 'готово');
  await new Promise((r) => setTimeout(r, 180));
  boot?.classList.add('hidden');
  setTimeout(() => { if (boot) boot.style.display = 'none'; }, 460);

  // Отладочный доступ из консоли
  window.wfl = {
    app: shell,
    engine: shell.engine,
    get scene() { return shell.engine.scene; },
    get editor() { return shell.editor; },
    version: VERSION,
  };

  console.log(
    `%cWFL Engine v${VERSION}%c\nПроекты · Редактор · Сборка APK — всё в браузере. window.wfl — доступ к движку.`,
    'font-weight:800;font-size:14px;color:#4fc3f7', 'color:#64748b',
  );
}

main();
