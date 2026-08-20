// WFL Engine — диалог сборки APK прямо в браузере.
// Собирает текущую сцену + рантайм движка в самодостаточный APK
// и отдаёт его пользователю как файл. Без Gradle и Android SDK.
import { buildApk, DEFAULT_CONFIG } from '../apk/builder.js';
import { buildRuntimeHtml } from '../apk/runtime-html.js';

const STORAGE_KEY = 'wfl:apk-config';
let dialogOpen = false;

const STYLE_ID = 'wfl-build-styles';
const CSS = `
.wfl-build-backdrop {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(3, 7, 18, .78); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center; padding: 16px;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
.wfl-build {
  width: 100%; max-width: 520px; max-height: 92vh; overflow-y: auto;
  background: #0f172a; border: 1px solid #1e293b; border-radius: 14px;
  color: #e2e8f0; box-shadow: 0 24px 70px rgba(0,0,0,.6);
}
.wfl-build header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 18px; border-bottom: 1px solid #1e293b;
}
.wfl-build header h2 { margin: 0; font-size: 16px; font-weight: 700; }
.wfl-build header .sub { font-size: 11px; color: #64748b; margin-top: 3px; }
.wfl-build .close {
  background: none; border: 0; color: #64748b; font-size: 22px;
  cursor: pointer; line-height: 1; padding: 0 4px;
}
.wfl-build .close:hover { color: #e2e8f0; }
.wfl-build .body { padding: 16px 18px; display: flex; flex-direction: column; gap: 13px; }
.wfl-field { display: flex; flex-direction: column; gap: 5px; }
.wfl-field label { font-size: 11px; color: #94a3b8; font-weight: 600; letter-spacing: .3px; }
.wfl-field input[type=text], .wfl-field input[type=number], .wfl-field select {
  background: #1e293b; border: 1px solid #334155; border-radius: 7px;
  padding: 9px 11px; color: #e2e8f0; font-size: 13px; font-family: inherit; outline: none;
}
.wfl-field input:focus, .wfl-field select:focus { border-color: #4fc3f7; }
.wfl-field .hint { font-size: 10px; color: #475569; }
.wfl-row { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; }
.wfl-check { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #cbd5e1; cursor: pointer; }
.wfl-check input { width: 15px; height: 15px; accent-color: #4fc3f7; cursor: pointer; }
.wfl-build footer {
  padding: 14px 18px; border-top: 1px solid #1e293b;
  display: flex; gap: 10px; align-items: center;
}
.wfl-btn {
  padding: 10px 16px; border: 0; border-radius: 8px; cursor: pointer;
  font: 600 13px/1 inherit; font-family: inherit;
}
.wfl-btn.primary { background: linear-gradient(135deg, #4fc3f7, #a78bfa); color: #08111c; flex: 1; }
.wfl-btn.primary:disabled { opacity: .55; cursor: default; }
.wfl-btn.ghost { background: #1e293b; color: #cbd5e1; }
.wfl-btn.ghost:hover { background: #273449; }
.wfl-progress { height: 4px; background: #1e293b; border-radius: 3px; overflow: hidden; margin-top: 10px; }
.wfl-progress-fill {
  height: 100%; width: 0; border-radius: 3px;
  background: linear-gradient(90deg, #4fc3f7, #a78bfa); transition: width .25s ease;
}
.wfl-status { font-size: 11px; color: #64748b; margin-top: 7px; min-height: 15px; }
.wfl-status.error { color: #f87171; }
.wfl-status.ok { color: #4ade80; }
.wfl-note {
  font-size: 11px; color: #64748b; line-height: 1.6;
  background: #131f35; border-left: 2px solid #4fc3f7;
  padding: 9px 11px; border-radius: 0 7px 7px 0;
}
`;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(cfg) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch { /* нет доступа */ }
}

/**
 * Открыть диалог сборки APK.
 * @param {import('../engine/engine.js').Engine} engine
 * @param {object} [opts]
 * @param {object} [opts.sceneData] сцена для упаковки (по умолчанию — текущая)
 * @param {object} [opts.project] проект: его имя и настройки подставляются в поля
 */
export function openBuildDialog(engine, { sceneData = null, project = null } = {}) {
  if (dialogOpen) return null;
  dialogOpen = true;
  ensureStyles();

  // Настройки проекта важнее глобальных: у каждой игры своё имя и пакет
  const cfg = { ...loadConfig(), ...(project?.build ?? {}) };

  const backdrop = document.createElement('div');
  backdrop.className = 'wfl-build-backdrop';
  backdrop.innerHTML = `
    <div class="wfl-build" role="dialog" aria-modal="true">
      <header>
        <div>
          <h2>Сборка APK</h2>
          <div class="sub">без Gradle и Android SDK — прямо в браузере</div>
        </div>
        <button class="close" title="Закрыть">&times;</button>
      </header>
      <div class="body">
        <div class="wfl-field">
          <label>Название приложения</label>
          <input type="text" id="b-name" value="${esc(cfg.appName)}" />
        </div>
        <div class="wfl-field">
          <label>Имя пакета</label>
          <input type="text" id="b-pkg" value="${esc(cfg.packageName)}" />
          <div class="hint">Формат: com.company.game — только латиница, цифры и точки</div>
        </div>
        <div class="wfl-row">
          <div class="wfl-field">
            <label>Версия (имя)</label>
            <input type="text" id="b-vname" value="${esc(cfg.versionName)}" />
          </div>
          <div class="wfl-field">
            <label>Версия (код)</label>
            <input type="number" id="b-vcode" min="1" step="1" value="${cfg.versionCode}" />
          </div>
        </div>
        <div class="wfl-row">
          <div class="wfl-field">
            <label>Ориентация</label>
            <select id="b-orient">
              <option value="sensorLandscape">Альбомная</option>
              <option value="portrait">Портретная</option>
              <option value="fullSensor">Автоповорот</option>
              <option value="unspecified">Как в системе</option>
            </select>
          </div>
          <div class="wfl-field">
            <label>Минимальный Android</label>
            <select id="b-minsdk">
              <option value="21">5.0 (API 21)</option>
              <option value="23">6.0 (API 23)</option>
              <option value="26">8.0 (API 26)</option>
              <option value="29">10 (API 29)</option>
            </select>
          </div>
        </div>
        <label class="wfl-check">
          <input type="checkbox" id="b-debug" ${cfg.debuggable ? 'checked' : ''} />
          Отладочная сборка (разрешить инспектор WebView)
        </label>
        <label class="wfl-check">
          <input type="checkbox" id="b-scene" checked />
          Упаковать текущую сцену из редактора
        </label>
        <div class="wfl-note">
          APK подписывается автоматически сгенерированным ключом (v1 + v2).
          Для установки включите на устройстве «Установка из неизвестных источников».
        </div>
        <div>
          <div class="wfl-progress"><div class="wfl-progress-fill" id="b-fill"></div></div>
          <div class="wfl-status" id="b-status"></div>
        </div>
      </div>
      <footer>
        <button class="wfl-btn ghost" id="b-cancel">Отмена</button>
        <button class="wfl-btn primary" id="b-build">Собрать APK</button>
      </footer>
    </div>
  `;
  document.body.appendChild(backdrop);

  const $ = (id) => backdrop.querySelector(`#${id}`);
  $('b-orient').value = cfg.orientation;
  $('b-minsdk').value = String(cfg.minSdk);

  const fill = $('b-fill');
  const status = $('b-status');
  const buildBtn = $('b-build');

  const close = () => {
    backdrop.remove();
    dialogOpen = false;
    window.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', onKey);

  backdrop.querySelector('.close').onclick = close;
  $('b-cancel').onclick = close;
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };

  buildBtn.onclick = async () => {
    const packageName = $('b-pkg').value.trim();
    if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(packageName)) {
      status.className = 'wfl-status error';
      status.textContent = 'Некорректное имя пакета: нужно минимум два сегмента, напр. com.game.my';
      return;
    }

    const conf = {
      appName: $('b-name').value.trim() || 'WFL Game',
      packageName,
      versionName: $('b-vname').value.trim() || '1.0',
      versionCode: Math.max(1, parseInt($('b-vcode').value, 10) || 1),
      orientation: $('b-orient').value,
      minSdk: parseInt($('b-minsdk').value, 10),
      debuggable: $('b-debug').checked,
    };
    saveConfig(conf);

    buildBtn.disabled = true;
    status.className = 'wfl-status';

    try {
      const scene = $('b-scene').checked
        ? (sceneData ?? engine.scene?.serialize?.() ?? null)
        : null;

      status.textContent = 'подготовка рантайма…';
      const html = await buildRuntimeHtml({ scene, config: conf });

      const result = await buildApk({
        config: conf,
        assets: [{ path: 'index.html', data: html }],
        onProgress: (stage, p) => {
          fill.style.width = `${Math.round(p * 100)}%`;
          status.textContent = stage.toLowerCase() + '…';
        },
      });

      const name = `${conf.appName.replace(/[^\w.-]+/g, '_')}-${conf.versionName}.apk`;
      downloadBytes(result.bytes, name);

      status.className = 'wfl-status ok';
      status.textContent =
        `Готово: ${name} — ${(result.size / 1024).toFixed(0)} КБ, ${result.entries} файлов, подпись v1+v2`;
    } catch (err) {
      console.error(err);
      status.className = 'wfl-status error';
      status.textContent = `Ошибка сборки: ${err.message}`;
      fill.style.width = '0';
    } finally {
      buildBtn.disabled = false;
    }
  };

  return { close, element: backdrop };
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/vnd.android.package-archive' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}
