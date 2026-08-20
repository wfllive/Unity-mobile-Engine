// WFL Engine — интерфейс режима игры.
//
// Показывается поверх canvas, когда проект запущен. Задача — чтобы было
// очевидно: игра идёт, вот пауза, вот выход. Всё управление пальцем.

import { icon } from '../ui/icons.js';

const STYLE_ID = 'wfl-play-styles';

const CSS = `
.wfl-play{position:absolute;inset:0;z-index:50;pointer-events:none;
  font:14px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#eaf0fb;
  -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.wfl-play *{box-sizing:border-box}
.wfl-play .wfl-i{display:block}
.wfl-play .topbar{position:absolute;top:max(10px,env(safe-area-inset-top));left:12px;right:12px;
  display:flex;align-items:center;gap:10px;pointer-events:none}
.wfl-play .title{pointer-events:none;font-size:13px;font-weight:700;padding:8px 13px;border-radius:11px;
  background:rgba(10,14,24,.62);-webkit-backdrop-filter:blur(9px);backdrop-filter:blur(9px);
  border:1px solid rgba(255,255,255,.08);max-width:46vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wfl-play .sp{flex:1}
.wfl-pbtn{pointer-events:auto;width:46px;height:46px;border-radius:14px;border:1px solid rgba(255,255,255,.1);
  background:rgba(10,14,24,.66);-webkit-backdrop-filter:blur(9px);backdrop-filter:blur(9px);
  color:#dce6f7;display:grid;place-items:center;cursor:pointer;flex:0 0 auto}
.wfl-pbtn:active{transform:scale(.93);background:rgba(28,38,60,.85)}

/* Модальный слой паузы / финала */
.wfl-play .veil{position:absolute;inset:0;pointer-events:auto;display:flex;align-items:center;
  justify-content:center;padding:20px;background:rgba(5,8,15,.76);
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);animation:wfl-pfade .18s ease}
@keyframes wfl-pfade{from{opacity:0}to{opacity:1}}
.wfl-play .card{width:100%;max-width:380px;touch-action:pan-y;padding:26px 22px calc(22px + env(safe-area-inset-bottom));
  border-radius:22px;background:linear-gradient(170deg,rgba(24,31,50,.98),rgba(13,18,30,.98));
  border:1px solid #202c47;box-shadow:0 22px 60px rgba(0,0,0,.55);text-align:center}
.wfl-play .card .ic{width:62px;height:62px;margin:0 auto 15px;border-radius:19px;display:grid;place-items:center;
  background:rgba(91,140,255,.14);color:#8fb0ff}
.wfl-play .card.win .ic{background:rgba(74,222,128,.14);color:#6ee7a0}
.wfl-play .card.lose .ic{background:rgba(248,113,113,.14);color:#fb9797}
.wfl-play .card h2{margin:0 0 8px;font-size:22px;font-weight:800}
.wfl-play .card p{margin:0 0 20px;font-size:13.5px;color:#8d9bb5;line-height:1.55}
.wfl-play .card .stat{display:flex;justify-content:center;gap:22px;margin:-6px 0 20px}
.wfl-play .card .stat b{display:block;font-size:20px;font-weight:800;color:#eaf0fb}
.wfl-play .card .stat span{font-size:11px;color:#7b8aa5;letter-spacing:.04em;text-transform:uppercase}
.wfl-play .card .row{display:flex;flex-direction:column;gap:10px}
.wfl-pbig{display:inline-flex;align-items:center;justify-content:center;gap:9px;width:100%;min-height:52px;
  padding:15px;border:0;border-radius:15px;font:700 15px/1 inherit;cursor:pointer;color:#fff}
.wfl-pbig.primary{background:linear-gradient(135deg,#2f7cf6,#7b5cf0)}
.wfl-pbig.neutral{background:#1b2438;color:#c6d1e6;border:1px solid #27334f}
.wfl-pbig:active{transform:scale(.97)}

/* HUD */
.wfl-play .hud{position:absolute;top:calc(64px + env(safe-area-inset-top));left:12px;pointer-events:none;
  display:flex;flex-direction:column;gap:7px;align-items:flex-start}
.wfl-play .hud .chip{padding:7px 12px;border-radius:11px;background:rgba(10,14,24,.62);
  -webkit-backdrop-filter:blur(9px);backdrop-filter:blur(9px);border:1px solid rgba(255,255,255,.08);
  font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px}
.wfl-play .hud .chip .ic{color:#8fb0ff}
.wfl-play .hud .hp{width:132px;height:8px;border-radius:999px;background:rgba(255,255,255,.14);
  overflow:hidden;margin-top:2px}
.wfl-play .hud .hp > i{display:block;height:100%;border-radius:999px;width:100%;
  background:linear-gradient(90deg,#3ecf8e,#2bb673);transition:width .2s ease}
.wfl-play .hud .hp.low > i{background:linear-gradient(90deg,#f87171,#dc2626)}

/* Подсказка в начале игры */
.wfl-play .hint{position:absolute;left:50%;bottom:calc(22px + env(safe-area-inset-bottom));
  transform:translateX(-50%);pointer-events:none;padding:11px 17px;border-radius:13px;
  background:rgba(10,14,24,.72);-webkit-backdrop-filter:blur(9px);backdrop-filter:blur(9px);
  border:1px solid rgba(255,255,255,.08);font-size:12.5px;color:#c3cee2;text-align:center;
  display:flex;align-items:center;gap:9px;max-width:min(92vw,460px);
  animation:wfl-hint-in .3s ease;transition:opacity .45s ease}
@keyframes wfl-hint-in{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}
.wfl-play .hint.gone{opacity:0}
`;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export class PlayOverlay {
  /**
   * @param {object} o
   * @param {import('../engine/engine.js').Engine} o.engine
   * @param {string} o.title название проекта
   * @param {Function} o.onExit выйти из игры
   * @param {Function} o.onRestart начать заново
   */
  constructor({ engine, title, onExit, onRestart, standalone = false }) {
    ensureStyles();
    this.engine = engine;
    this.title = title;
    this.standalone = standalone;
    this.onExit = onExit ?? (() => {});
    this.onRestart = onRestart ?? (() => {});
    this.paused = false;

    this.root = el('div', 'wfl-play');

    const top = el('div', 'topbar');
    top.appendChild(el('div', 'title', esc(title)));
    top.appendChild(el('div', 'sp'));
    this.pauseBtn = el('button', 'wfl-pbtn', icon('pause', 20));
    this.pauseBtn.title = 'Пауза';
    this.pauseBtn.onclick = () => this.pause();
    const fs = el('button', 'wfl-pbtn', icon('fullscreen', 20));
    fs.title = 'Во весь экран';
    fs.onclick = () => this.toggleFullscreen();
    top.append(fs, this.pauseBtn);
    this.root.appendChild(top);

    /* HUD: наполняется только тем, что реально есть в сцене */
    this.hud = el('div', 'hud');
    this.root.appendChild(this.hud);
    this._initHud();

    this.hint = el('div', 'hint',
      `${icon('gamepad', 17)}<span>Джойстик слева — движение, кнопки справа — действия. Свайп по экрану — обзор.</span>`);
    this.root.appendChild(this.hint);
    this._hintTimer = setTimeout(() => {
      this.hint.classList.add('gone');
      setTimeout(() => this.hint.remove(), 600);
    }, 4200);

    engine.container.appendChild(this.root);

    // Аппаратная кнопка «назад» на Android и Esc на десктопе ставят паузу
    this._onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); this.togglePause(); } };
    window.addEventListener('keydown', this._onKey);
  }

  /* ---------- HUD ---------- */
  /**
   * HUD собирается по содержимому сцены: счёт показываем, если есть
   * подбираемые предметы, полоску здоровья — если у игрока есть Health.
   */
  _initHud() {
    const scene = this.engine.scene;
    this.score = 0;
    this.elapsed = 0;
    this.hud.innerHTML = '';
    if (!scene) return;

    const pickups = scene.gameObjects.filter((g) => g.getComponent?.('Pickup')).length;
    this.player = scene.findByTag?.('Player') ?? null;
    this.playerHealth = this.player?.getComponent?.('Health') ?? null;
    this.totalPickups = pickups;
    this.collected = 0;

    if (pickups) {
      this.scoreChip = el('div', 'chip');
      this.scoreChip.innerHTML = `<span class="ic">${icon('crystal', 15)}</span>`
        + `<span class="v">0</span><span style="opacity:.5;font-weight:500">/ ${pickups}</span>`;
      this.hud.appendChild(this.scoreChip);
    }
    if (this.playerHealth) {
      const wrap = el('div', 'chip');
      wrap.innerHTML = `<span class="ic">${icon('target', 15)}</span>`
        + '<span><span class="v">100</span><span class="hp"><i></i></span></span>';
      this.hud.appendChild(wrap);
      this.hpBar = wrap.querySelector('.hp');
      this.hpFill = wrap.querySelector('.hp > i');
      this.hpText = wrap.querySelector('.v');
    }

    /* Подписки на события сцены */
    this._onPickup = ({ type, amount }) => {
      if (type === 'score') this.score += amount ?? 0;
      this.collected++;
      this._updateHud();
      if (this.totalPickups && this.collected >= this.totalPickups) {
        setTimeout(() => this.showResult({
          win: true,
          title: 'Уровень пройден',
          text: 'Собрано всё, что было на карте.',
          stats: [['Очки', this.score], ['Время', `${Math.floor(this.elapsed)} с`]],
        }), 400);
      }
    };
    this._onDeath = (go) => {
      if (go === this.player) {
        this.showResult({
          win: false,
          title: 'Игра окончена',
          text: 'Персонаж погиб.',
          stats: [['Очки', this.score], ['Время', `${Math.floor(this.elapsed)} с`]],
        });
      } else {
        this.score += 25;
        this._updateHud();
      }
    };
    scene.on?.('pickup', this._onPickup);
    scene.on?.('death', this._onDeath);
    this._scene = scene;

    this._frameHook = (dt) => {
      if (!this.paused) this.elapsed += dt;
      this._updateHud();
    };
    this.engine.addFrameHook(this._frameHook);
  }

  _updateHud() {
    if (this.scoreChip) this.scoreChip.querySelector('.v').textContent = String(this.collected);
    if (this.playerHealth && this.hpFill) {
      const n = Math.max(0, Math.min(1, this.playerHealth.normalized ?? 0));
      this.hpFill.style.width = `${Math.round(n * 100)}%`;
      this.hpBar.classList.toggle('low', n < 0.35);
      this.hpText.textContent = String(Math.max(0, Math.round(this.playerHealth.currentHealth)));
    }
  }

  /** Пересобрать HUD после перезапуска сцены */
  rebindScene() {
    this._unbindScene();
    this._initHud();
  }

  _unbindScene() {
    if (this._scene) {
      this._scene.off?.('pickup', this._onPickup);
      this._scene.off?.('death', this._onDeath);
      this._scene = null;
    }
    if (this._frameHook) {
      this.engine.removeFrameHook(this._frameHook);
      this._frameHook = null;
    }
  }

  /* ---------- Пауза ---------- */
  togglePause() { this.paused ? this.resume() : this.pause(); }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.engine.pause();
    this.engine.touchControls?.hide();
    this._showCard({
      kind: 'pause',
      iconName: 'pause',
      title: 'Пауза',
      text: 'Игра остановлена. Можно продолжить, начать заново или выйти в редактор.',
      buttons: [
        ['primary', 'play', 'Продолжить', () => this.resume()],
        ['neutral', 'restart', 'Начать заново', () => this._restart()],
        ...(this.standalone ? [] : [['neutral', 'close', 'Выйти из игры', () => this.onExit()]]),
      ],
    });
  }

  /** Перезапуск: снимаем паузу сами, чтобы интерфейс не завис в модалке */
  _restart() {
    this._closeCard();
    this.paused = false;
    this.onRestart();
  }

  resume() {
    this.paused = false;
    this._closeCard();
    this.engine.touchControls?.show();
    this.engine.resume();
  }

  onRestarted() {
    this.paused = false;
    this._closeCard();
  }

  /**
   * Показать финальный экран (победа / поражение).
   * @param {{win:boolean, title?:string, text?:string, stats?:Array<[string,string|number]>}} o
   */
  showResult({ win = true, title, text, stats = [] } = {}) {
    this.paused = true;
    this.engine.pause();
    this.engine.touchControls?.hide();
    this._showCard({
      kind: win ? 'win' : 'lose',
      iconName: win ? 'check' : 'restart',
      title: title ?? (win ? 'Победа!' : 'Игра окончена'),
      text: text ?? (win ? 'Уровень пройден.' : 'Попробуйте ещё раз.'),
      stats,
      buttons: [
        ['primary', 'restart', 'Играть снова', () => this._restart()],
        ...(this.standalone ? [] : [['neutral', 'close', 'Выйти из игры', () => this.onExit()]]),
      ],
    });
  }

  _showCard({ kind, iconName, title, text, stats = [], buttons }) {
    this._closeCard();
    const veil = el('div', 'veil');
    const card = el('div', `card ${kind}`);
    card.appendChild(el('div', 'ic', icon(iconName, 30)));
    card.appendChild(el('h2', null, esc(title)));
    card.appendChild(el('p', null, esc(text)));
    if (stats.length) {
      const row = el('div', 'stat');
      for (const [label, value] of stats) {
        row.appendChild(el('div', null, `<b>${esc(value)}</b><span>${esc(label)}</span>`));
      }
      card.appendChild(row);
    }
    const row = el('div', 'row');
    for (const [cls, ico, label, fn] of buttons) {
      const b = el('button', `wfl-pbig ${cls}`, `${icon(ico, 18)}<span>${esc(label)}</span>`);
      b.onclick = fn;
      row.appendChild(b);
    }
    card.appendChild(row);
    veil.appendChild(card);
    this.root.appendChild(veil);
    this._veil = veil;
  }

  _closeCard() {
    this._veil?.remove();
    this._veil = null;
  }

  async toggleFullscreen() {
    if (document.fullscreenElement) this.engine.exitFullscreen();
    else await this.engine.requestFullscreen();
  }

  dispose() {
    clearTimeout(this._hintTimer);
    this._unbindScene();
    window.removeEventListener('keydown', this._onKey);
    this.root.remove();
  }
}
