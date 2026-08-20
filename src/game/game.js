// WFL Engine — игровая логика демо: HUD, счёт, меню, состояния
import { Engine, Audio, Tweens, UIText } from '../engine/index.js';
import { buildDemoScene } from './demo-scene.js';

export class DemoGame {
  constructor(container) {
    this.engine = new Engine({
      container,
      touchControls: 'auto',
      adaptiveQuality: true,
      fixedTimeStep: 1 / 60,
      pauseOnBlur: true,
    });

    this.score = 0;
    this.crystalsTotal = 0;
    this.state = 'menu'; // menu | playing | paused | gameover | win
    this.elapsed = 0;

    const built = buildDemoScene(this.engine);
    this.scene = built.scene;
    this.player = built.player;
    this.playerController = built.playerController;

    this.engine.loadScene(this.scene);
    this._buildUI();
    this._bindEvents();

    this.crystalsTotal = this.scene.gameObjects.filter((g) => g.name === 'Кристалл').length;
    this._updateHUD();

    this.engine.start();
    this.showMenu();
  }

  /* ------------------- UI ------------------- */
  _buildUI() {
    const ui = this.engine.ui;
    const isMobile = this.engine.isMobile;

    // HUD
    this.hud = ui.panel({
      position: [12, 12], anchor: 'top-right', layout: 'vertical', gap: 8, padding: 12,
    });
    this.hud.el.style.minWidth = '168px';

    this.scoreText = this._relText(this.hud, 'Очки: 0', { size: 19, weight: 800 });
    this.crystalText = this._relText(this.hud, '', { size: 13, opacity: 0.8 });
    this.timeText = this._relText(this.hud, '', { size: 13, opacity: 0.8 });

    // Здоровье
    this.healthLabel = this._relText(this.hud, 'Здоровье', { size: 11, opacity: 0.65 });
    const barHolder = document.createElement('div');
    barHolder.style.cssText = 'position:relative;width:100%;height:12px';
    this.hud.el.appendChild(barHolder);
    this.healthBar = ui.progressBar({ width: '100%', height: 12, value: 1 });
    this.healthBar.el.style.position = 'absolute';
    this.healthBar.el.style.inset = '0';
    barHolder.appendChild(this.healthBar.el);

    // Прицел / подсказки
    if (!isMobile) {
      this.hint = ui.text(
        'WASD — движение · Пробел — прыжок (двойной) · Shift — бег\n' +
        'Мышь — обзор · Esc — пауза · F — во весь экран · G — статистика',
        { size: 12, opacity: 0.6, position: [14, 14], anchor: 'bottom-left' });
    } else {
      this.hint = ui.text('Джойстик слева · ▲ прыжок · » бег · свайп справа — обзор',
        { size: 11, opacity: 0.6, position: [10, 6], anchor: 'bottom-center', align: 'center' });
    }

    // Кнопка паузы (важно для мобильных)
    this.pauseBtn = ui.button('II', () => this.togglePause(), {
      position: [12, 12], anchor: 'top-left', variant: 'ghost',
    });
    this.pauseBtn.el.style.width = '46px';
    this.pauseBtn.el.style.height = '46px';
    this.pauseBtn.el.style.padding = '0';
    this.pauseBtn.el.style.borderRadius = '50%';
    this.pauseBtn.el.style.fontWeight = '900';

    // Кнопка редактора
    this.editorBtn = ui.button('Редактор', () => this._openEditor(), {
      position: [66, 12], anchor: 'top-left', variant: 'ghost',
    });
    this.editorBtn.el.style.fontSize = '13px';
    this.editorBtn.el.style.padding = '9px 14px';

    /* --- Экраны --- */
    this.menuScreen = ui.screen('menu', {
      title: 'WFL ENGINE',
      subtitle: 'Демо-арена. Собери все кристаллы и уцелей.\nДвижок на three.js с редактором, физикой и сборкой APK.',
    });
    this.menuScreen.addButton('Играть', () => this.startGame(), { variant: 'success' });
    this.menuScreen.addButton('Редактор сцены', () => this._openEditor(), { variant: 'ghost' });
    this.menuScreen.addButton('Во весь экран', () => this.engine.requestFullscreen(), { variant: 'ghost' });

    this.pauseScreen = ui.screen('pause', { title: 'Пауза', subtitle: 'Игра приостановлена' });
    this.pauseScreen.addButton('Продолжить', () => this.resumeGame(), { variant: 'success' });
    this.pauseScreen.addButton('Настройки качества', () => this._cycleQuality(), { variant: 'ghost' });
    this.pauseScreen.addButton('В главное меню', () => this.showMenu(), { variant: 'ghost' });

    this.overScreen = ui.screen('gameover', { title: 'Поражение', subtitle: '' });
    this.overScreen.addButton('Заново', () => this.restart(), { variant: 'danger' });
    this.overScreen.addButton('В меню', () => this.showMenu(), { variant: 'ghost' });

    this.winScreen = ui.screen('win', { title: 'Победа!', subtitle: '' });
    this.winScreen.addButton('Ещё раз', () => this.restart(), { variant: 'success' });
    this.winScreen.addButton('В меню', () => this.showMenu(), { variant: 'ghost' });
  }

  /** Текст внутри flex-панели (position: relative вместо absolute) */
  _relText(panel, text, opts) {
    const t = new UIText(text, opts);
    panel.add(t);
    t.el.style.position = 'relative';
    return t;
  }

  _bindEvents() {
    // Подбор предметов
    this.scene.on('pickup', ({ type, amount }) => {
      if (type === 'score') {
        this.addScore(amount);
        this.engine.ui.toast(`+${amount} очков`, 1.1);
      } else if (type === 'health') {
        this.engine.ui.toast(`+${amount} здоровья`, 1.1, { color: '#3ecf8e' });
      }
      this._updateHUD();
    });

    this.scene.on('death', (go) => {
      if (go === this.player) this.gameOver();
      else { this.addScore(25); this.engine.ui.toast('Страж повержен: +25', 1.2, { color: '#e0525c' }); }
    });

    // HUD каждый кадр
    this.engine.addFrameHook((dt) => {
      if (this.state === 'playing') this.elapsed += dt;
      this._updateHUD();
    });

    // Горячие клавиши
    const input = this.engine.input;
    input.on('keydown', (code) => {
      if (code === 'Escape') this.togglePause();
      if (code === 'KeyF') this.engine.requestFullscreen();
      if (code === 'KeyG') { this._statsOn = !this._statsOn; this.engine.ui.showStats(this._statsOn); }
      if (code === 'KeyC') this.playerController.mode =
        this.playerController.mode === 'firstPerson' ? 'thirdPerson' : 'firstPerson';
    });

    this.engine.on('backgrounded', () => { if (this.state === 'playing') this.pauseGame(); });
  }

  _updateHUD() {
    if (!this.scoreText) return;
    this.scoreText.setText(`Очки: ${this.score}`);
    const left = this.scene.gameObjects.filter((g) => g.name === 'Кристалл' && !g._destroyed).length;
    this.crystalText?.setText(`Кристаллы: ${this.crystalsTotal - left} / ${this.crystalsTotal}`);
    const m = Math.floor(this.elapsed / 60), s = Math.floor(this.elapsed % 60);
    this.timeText?.setText(`Время: ${m}:${String(s).padStart(2, '0')}`);
    const hp = this.player?.getComponent('Health');
    if (hp && this.healthBar) this.healthBar.value = hp.normalized;
    if (this.state === 'playing' && left === 0 && this.crystalsTotal > 0) this.win();
  }

  /* ------------------- Состояния ------------------- */
  showMenu() {
    this.state = 'menu';
    this.engine.pause();
    this.engine.ui.showScreen('menu');
    this.hud.hide();
    this.pauseBtn.hide();
    this.hint?.hide();
    if (this.engine.touchControls) this.engine.touchControls.setVisible?.(false);
  }

  startGame() {
    this.engine.ui.hideAllScreens();
    this.hud.show();
    this.pauseBtn.show();
    this.hint?.show();
    if (this.engine.touchControls) this.engine.touchControls.setVisible?.(true);
    Audio.init();
    this.state = 'playing';
    this.engine.resume();
    this.engine.ui.toast('Собери все кристаллы!', 2.4);
  }

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.engine.pause();
    this.engine.ui.showScreen('pause');
  }

  resumeGame() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.engine.ui.hideAllScreens();
    this.engine.resume();
  }

  togglePause() {
    if (this.state === 'playing') this.pauseGame();
    else if (this.state === 'paused') this.resumeGame();
  }

  gameOver() {
    if (this.state === 'gameover') return;
    this.state = 'gameover';
    this.overScreen.setSubtitle(`Набрано очков: ${this.score}\nВремя: ${Math.floor(this.elapsed)} с`);
    this.engine.ui.showScreen('gameover');
    this.engine.pause();
  }

  win() {
    if (this.state === 'win') return;
    this.state = 'win';
    this.winScreen.setSubtitle(`Все кристаллы собраны!\nОчки: ${this.score} · Время: ${Math.floor(this.elapsed)} с`);
    this.engine.ui.showScreen('win');
    this.engine.pause();
    Audio.synth('coin', { frequency: 880, duration: 0.4, volume: 0.25 });
  }

  restart() {
    location.reload();
  }

  addScore(v) {
    this.score += v;
    if (this.scoreText) {
      Tweens.value(1.35, 1, 0.35, (k) => { this.scoreText.el.style.transform = `scale(${k})`; },
        { ease: 'backOut', useUnscaledTime: true });
    }
  }

  _cycleQuality() {
    const cur = this.engine.renderer.qualityLevel;
    const next = (cur + 1) % 5;
    this.engine.setQuality(next);
    const names = ['Очень низкое', 'Низкое', 'Среднее', 'Высокое', 'Ультра'];
    this.engine.ui.toast(`Качество: ${names[next]}`, 1.6);
  }

  async _openEditor() {
    const { openEditor } = await import('../editor/editor.js');
    openEditor(this.engine, this);
  }
}
