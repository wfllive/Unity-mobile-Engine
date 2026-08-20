// WFL Engine — генерация самодостаточного index.html для APK.
// Весь движок, сцена и рантайм встраиваются в один файл, поэтому WebView
// работает полностью офлайн (file:///android_asset/index.html).

/** Экранирование для безопасной вставки внутрь <script> */
function safeJson(value) {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Загрузить собранный рантайм.
 * Модуль генерируется командой `npm run build:runtime`.
 * @returns {Promise<string>}
 */
async function loadRuntime() {
  try {
    const mod = await import('./runtime-bundle.js');
    if (mod?.RUNTIME_JS) return mod.RUNTIME_JS;
  } catch {
    /* модуль ещё не собран */
  }
  throw new Error(
    'Рантайм не собран. Выполните «npm run build:runtime», ' +
    'чтобы сгенерировать src/apk/runtime-bundle.js.',
  );
}

/**
 * Собрать HTML-страницу игры для упаковки в APK.
 * @param {object} opts
 * @param {object|null} [opts.scene]   сериализованная сцена
 * @param {object} [opts.config]       конфигурация сборки
 * @param {string} [opts.runtime]      готовый код рантайма (иначе берётся бандл)
 * @returns {Promise<string>}
 */
export async function buildRuntimeHtml({ scene = null, config = {}, runtime = null } = {}) {
  const js = runtime ?? await loadRuntime();
  const title = config.appName ?? 'WFL Game';

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#0b0e14">
<title>${escapeHtml(title)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#0b0e14;color:#e6e6e6;
 font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
 -webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;
 overscroll-behavior:none;touch-action:none}
#app{position:fixed;inset:0}
canvas{display:block;width:100%;height:100%;outline:none}
#splash{position:fixed;inset:0;z-index:100;display:flex;flex-direction:column;
 align-items:center;justify-content:center;gap:16px;
 background:radial-gradient(circle at 50% 40%,#16202e 0%,#0b0e14 70%);
 transition:opacity .4s ease}
#splash.gone{opacity:0;pointer-events:none}
.sp-title{font-size:26px;font-weight:800;letter-spacing:3px;color:#e2e8f0;text-align:center;padding:0 24px}
.sp-bar{width:190px;height:3px;background:#1e293b;border-radius:3px;overflow:hidden}
.sp-fill{height:100%;width:35%;border-radius:3px;background:linear-gradient(90deg,#4fc3f7,#a78bfa);
 animation:sweep 1.1s ease-in-out infinite}
@keyframes sweep{0%{margin-left:-40%}100%{margin-left:100%}}
.sp-err{color:#f87171;font-size:12px;padding:0 28px;text-align:center;line-height:1.6;
 white-space:pre-wrap;font-family:ui-monospace,monospace}
</style>
</head>
<body>
<div id="app"></div>
<div id="splash">
  <div class="sp-title">${escapeHtml(title)}</div>
  <div class="sp-bar"><div class="sp-fill"></div></div>
</div>
<script>
window.__WFL_SCENE__  = ${safeJson(scene)};
window.__WFL_CONFIG__ = ${safeJson(config)};
window.addEventListener('error', function (e) {
  var s = document.getElementById('splash');
  if (!s || s.classList.contains('gone')) return;
  s.innerHTML = '<div class="sp-title">Ошибка запуска</div><div class="sp-err">' +
    String((e.error && e.error.stack) || e.message).replace(/[<>&]/g, '') + '</div>';
});
<\/script>
<script>${js}<\/script>
<script>
(function () {
  var s = document.getElementById('splash');
  function hide() { if (s) { s.classList.add('gone'); setTimeout(function(){ s.remove(); }, 500); } }
  if (window.wfl && window.wfl.engine) { setTimeout(hide, 350); }
  else { setTimeout(hide, 2500); }
})();
<\/script>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
