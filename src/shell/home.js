// WFL Engine — главный экран: список проектов, создание, правка, удаление.
//
// Первое, что видит пользователь. Рассчитан на телефон: крупные карточки,
// действия в один тап, никаких контекстных меню по правой кнопке.

import { icon } from '../ui/icons.js';
import { TEMPLATES } from './templates.js';
import {
  listProjects, createProject, saveProject, deleteProject, duplicateProject,
  exportProject, importProject, formatDate, formatSize, totalSize, getLastOpened,
} from './projects.js';

const STYLE_ID = 'wfl-home-styles';

const HOME_CSS = `
.wfl-home{position:fixed;inset:0;z-index:80;overflow-y:auto;overscroll-behavior:contain;
  -webkit-overflow-scrolling:touch;touch-action:pan-y;background:
  radial-gradient(1100px 520px at 78% -12%,rgba(94,132,255,.20),transparent 62%),
  radial-gradient(760px 420px at 6% 4%,rgba(160,110,255,.14),transparent 60%),#080b12;
  color:#e8edf7;font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.wfl-home *{box-sizing:border-box}
.wfl-home .wrap{max-width:1080px;margin:0 auto;padding:max(20px,env(safe-area-inset-top)) 16px
  calc(96px + env(safe-area-inset-bottom))}
.wfl-i{display:block;flex:0 0 auto}

/* Шапка */
.wfl-home .head{display:flex;align-items:center;gap:13px;padding:6px 2px 22px}
.wfl-home .logo{width:46px;height:46px;border-radius:14px;flex:0 0 auto;display:grid;place-items:center;
  background:linear-gradient(140deg,#5b8cff,#a06bff);color:#fff;
  box-shadow:0 10px 26px rgba(80,110,255,.36)}
.wfl-home .brand{font-size:20px;font-weight:800;letter-spacing:.2px;line-height:1.15}
.wfl-home .brand small{display:block;font-size:11.5px;font-weight:500;color:#7c8aa5;letter-spacing:.5px;margin-top:2px}
.wfl-home .head-sp{flex:1}
.wfl-home .ghost-ico{width:42px;height:42px;border-radius:12px;border:1px solid #1e2942;background:#111726;
  color:#93a1bd;display:grid;place-items:center;cursor:pointer}
.wfl-home .ghost-ico:active{background:#182136;transform:scale(.95)}

/* Секции */
.wfl-home .sec{display:flex;align-items:center;gap:9px;margin:26px 2px 12px;
  font-size:11.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6f7d99}
.wfl-home .sec .line{flex:1;height:1px;background:linear-gradient(90deg,#1d2740,transparent)}

/* Карточка проекта */
.wfl-home .cards{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(290px,1fr))}
.wfl-card{position:relative;display:flex;gap:13px;align-items:flex-start;padding:15px;border-radius:17px;
  background:linear-gradient(165deg,rgba(26,34,54,.96),rgba(15,20,33,.96));
  border:1px solid #1d2942;box-shadow:0 6px 22px rgba(0,0,0,.34);cursor:pointer;
  transition:transform .13s ease,border-color .16s ease}
.wfl-card:active{transform:scale(.985);border-color:#31456f}
.wfl-card .thumb{width:52px;height:52px;border-radius:14px;flex:0 0 auto;display:grid;place-items:center;
  background:linear-gradient(150deg,#28345a,#1b2440);color:#cfe0ff}
.wfl-card .body{flex:1;min-width:0}
.wfl-card .nm{font-size:16.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wfl-card .meta{margin-top:5px;font-size:12px;color:#77869f;display:flex;flex-wrap:wrap;gap:5px 12px}
.wfl-card .meta span{display:inline-flex;align-items:center;gap:5px}
.wfl-card .acts{display:flex;gap:7px;margin-top:12px;flex-wrap:wrap}
.wfl-chip{display:inline-flex;align-items:center;gap:6px;padding:8px 13px;border-radius:11px;
  border:1px solid #26334f;background:#151d2f;color:#c3cee2;font:600 12.5px/1 inherit;cursor:pointer;
  min-height:38px}
.wfl-chip:active{transform:scale(.95);background:#1c2740}
.wfl-chip.play{background:linear-gradient(135deg,#2f7cf6,#7b5cf0);border-color:transparent;color:#fff}
.wfl-chip.danger{color:#ff9c9c;border-color:#4a2531;background:#25141b}
.wfl-chip.wide{flex:1;justify-content:center}

/* Шаблоны */
.wfl-home .tpls{display:grid;gap:11px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.wfl-tpl{display:flex;gap:12px;align-items:center;padding:14px;border-radius:15px;cursor:pointer;
  background:rgba(20,26,42,.72);border:1px solid #1c2740;transition:border-color .16s,transform .13s}
.wfl-tpl:active{transform:scale(.98);border-color:#3a52a1}
.wfl-tpl .ic{width:42px;height:42px;border-radius:12px;flex:0 0 auto;display:grid;place-items:center;
  background:rgba(91,140,255,.14);color:#8fb0ff}
.wfl-tpl .t{font-size:14.5px;font-weight:700}
.wfl-tpl .d{font-size:11.5px;color:#77869f;margin-top:3px;line-height:1.45}

/* Пустое состояние */
.wfl-empty{padding:40px 22px;text-align:center;border:1px dashed #26314d;border-radius:18px;
  background:rgba(16,21,34,.55)}
.wfl-empty .ic{width:64px;height:64px;margin:0 auto 14px;border-radius:20px;display:grid;place-items:center;
  background:rgba(91,140,255,.12);color:#7fa3ff}
.wfl-empty h3{margin:0 0 7px;font-size:17px;font-weight:700}
.wfl-empty p{margin:0;font-size:13px;color:#77869f;line-height:1.6}

/* Плавающая кнопка */
.wfl-fab{position:fixed;right:16px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:82;
  display:inline-flex;align-items:center;gap:9px;padding:15px 21px;border:0;border-radius:16px;
  background:linear-gradient(135deg,#2f7cf6,#7b5cf0);color:#fff;font:700 15px/1 inherit;cursor:pointer;
  box-shadow:0 12px 30px rgba(58,96,240,.44)}
.wfl-fab:active{transform:scale(.96)}

/* Нижний лист */
.wfl-sheet-bd{position:fixed;inset:0;z-index:95;background:rgba(4,7,14,.72);
  -webkit-backdrop-filter:blur(7px);backdrop-filter:blur(7px);
  display:flex;align-items:flex-end;justify-content:center;animation:wfl-fade .18s ease}
@keyframes wfl-fade{from{opacity:0}to{opacity:1}}
@keyframes wfl-rise{from{transform:translateY(26px);opacity:.5}to{transform:translateY(0);opacity:1}}
.wfl-sheet{width:100%;max-width:520px;max-height:88vh;overflow-y:auto;-webkit-overflow-scrolling:touch;
  touch-action:pan-y;
  background:#111726;border:1px solid #1e2942;border-bottom:0;border-radius:22px 22px 0 0;
  padding:8px 18px calc(20px + env(safe-area-inset-bottom));animation:wfl-rise .2s ease;
  box-shadow:0 -14px 44px rgba(0,0,0,.5)}
@media(min-width:640px){.wfl-sheet-bd{align-items:center}
  .wfl-sheet{border-radius:20px;border-bottom:1px solid #1e2942;padding-bottom:20px}}
.wfl-sheet .grab{width:40px;height:4px;border-radius:3px;background:#2a3550;margin:8px auto 14px}
.wfl-sheet h2{margin:0 0 4px;font-size:19px;font-weight:800}
.wfl-sheet .sub{font-size:12.5px;color:#77869f;margin-bottom:16px;line-height:1.5}
.wfl-sheet label{display:block;font-size:11.5px;font-weight:700;color:#8b99b4;margin:0 0 6px;
  letter-spacing:.04em;text-transform:uppercase}
.wfl-sheet input[type=text],.wfl-sheet input[type=number],.wfl-sheet select{
  width:100%;padding:13px 14px;border-radius:12px;border:1px solid #26334f;background:#0c1220;
  color:#e8edf7;font:15px/1 inherit;outline:none;-webkit-appearance:none}
.wfl-sheet input:focus,.wfl-sheet select:focus{border-color:#4b7cf3}
.wfl-sheet .fld{margin-bottom:15px}
.wfl-sheet .row{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.wfl-sheet .btns{display:flex;gap:10px;margin-top:20px}
.wfl-big{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:15px;
  border:0;border-radius:14px;font:700 15px/1 inherit;cursor:pointer;min-height:52px}
.wfl-big.primary{background:linear-gradient(135deg,#2f7cf6,#7b5cf0);color:#fff}
.wfl-big.neutral{background:#1a2337;color:#c3cee2;border:1px solid #26334f}
.wfl-big.danger{background:linear-gradient(135deg,#e04a5f,#b8324a);color:#fff}
.wfl-big:active{transform:scale(.97)}
.wfl-big:disabled{opacity:.5}
.wfl-sheet .warn{display:flex;gap:11px;padding:13px;border-radius:13px;background:rgba(224,74,95,.1);
  border:1px solid rgba(224,74,95,.3);color:#ffb4be;font-size:13px;line-height:1.5;margin-bottom:6px}
.wfl-sheet .warn .wi{color:#ff8ea0}
.wfl-sheet .pick{display:grid;gap:9px;margin-bottom:6px}
.wfl-pick-item{display:flex;gap:12px;align-items:center;padding:13px;border-radius:13px;cursor:pointer;
  background:#0e1524;border:1.5px solid #23304c}
.wfl-pick-item.on{border-color:#4b7cf3;background:rgba(75,124,243,.12)}
.wfl-pick-item .ic{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;flex:0 0 auto;
  background:rgba(91,140,255,.14);color:#8fb0ff}
.wfl-pick-item .t{font-size:14px;font-weight:700}
.wfl-pick-item .d{font-size:11.5px;color:#77869f;margin-top:2px;line-height:1.4}

/* Подсказка снизу */
.wfl-home .foot{margin-top:30px;padding:16px 2px 0;border-top:1px solid #182135;
  font-size:11.5px;color:#5d6a85;display:flex;flex-wrap:wrap;gap:6px 16px;justify-content:center}
`;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = HOME_CSS;
  document.head.appendChild(s);
}

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

/** Экранирование пользовательского текста */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ==================== Нижний лист ==================== */

/**
 * Модальное окно снизу (как в мобильных приложениях).
 * @returns {{root:HTMLElement, body:HTMLElement, close:Function}}
 */
export function sheet({ title, subtitle = '', onClose } = {}) {
  ensureStyles();
  const bd = el('div', 'wfl-sheet-bd');
  const sh = el('div', 'wfl-sheet');
  sh.appendChild(el('div', 'grab'));
  if (title) sh.appendChild(el('h2', null, esc(title)));
  if (subtitle) sh.appendChild(el('div', 'sub', esc(subtitle)));
  const body = el('div');
  sh.appendChild(body);
  bd.appendChild(sh);
  document.body.appendChild(bd);

  const close = () => {
    bd.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  bd.addEventListener('click', (e) => { if (e.target === bd) close(); });

  return { root: bd, sheet: sh, body, close };
}

/** Диалог подтверждения с крупными кнопками */
export function confirmSheet({ title, message, confirmText = 'Удалить', danger = true }) {
  return new Promise((resolve) => {
    // Ответ фиксируем до закрытия: close() вызывает onClose, и без этого
    // флага любое подтверждение успевало разрешиться отказом.
    let answer = false;
    const s = sheet({ title, onClose: () => resolve(answer) });
    s.body.appendChild(el('div', 'warn',
      `<span class="wi">${icon('warning', 20)}</span><span>${esc(message)}</span>`));
    const btns = el('div', 'btns');
    const cancel = el('button', 'wfl-big neutral', `${icon('close', 18)}<span>Отмена</span>`);
    const ok = el('button', `wfl-big ${danger ? 'danger' : 'primary'}`,
      `${icon(danger ? 'trash' : 'check', 18)}<span>${esc(confirmText)}</span>`);
    cancel.onclick = () => s.close();
    ok.onclick = () => { answer = true; s.close(); };
    btns.append(cancel, ok);
    s.body.appendChild(btns);
  });
}

/* ==================== Главный экран ==================== */

export class HomeScreen {
  /**
   * @param {object} handlers
   * @param {(id:string)=>void} handlers.onOpenEditor открыть проект в редакторе
   * @param {(id:string)=>void} handlers.onPlay запустить проект
   */
  constructor({ onOpenEditor, onPlay } = {}) {
    ensureStyles();
    this.onOpenEditor = onOpenEditor ?? (() => {});
    this.onPlay = onPlay ?? (() => {});
    this.root = el('div', 'wfl-home');
    this.wrap = el('div', 'wrap');
    this.root.appendChild(this.wrap);
    this._buildFab();
    document.body.appendChild(this.root);
    this.render();
  }

  _buildFab() {
    this.fab = el('button', 'wfl-fab', `${icon('plus', 20)}<span>Создать проект</span>`);
    this.fab.onclick = () => this.showCreate();
    this.root.appendChild(this.fab);
  }

  show() { this.root.style.display = ''; this.fab.style.display = ''; this.render(); }
  hide() { this.root.style.display = 'none'; this.fab.style.display = 'none'; }
  dispose() { this.root.remove(); }

  /* ---------- Отрисовка ---------- */
  render() {
    const projects = listProjects();
    this.wrap.innerHTML = '';

    /* Шапка */
    const head = el('div', 'head');
    head.appendChild(el('div', 'logo', icon('bolt', 26)));
    head.appendChild(el('div', 'brand', 'WFL Engine<small>Игровой движок в браузере</small>'));
    head.appendChild(el('div', 'head-sp'));
    const imp = el('button', 'ghost-ico', icon('upload', 20));
    imp.title = 'Импортировать проект';
    imp.onclick = () => this.importFile();
    const help = el('button', 'ghost-ico', icon('help', 20));
    help.title = 'Справка';
    help.onclick = () => this.showHelp();
    head.append(imp, help);
    this.wrap.appendChild(head);

    /* Проекты */
    if (projects.length) {
      const sec = el('div', 'sec', `<span>Мои проекты · ${projects.length}</span><span class="line"></span>`);
      this.wrap.appendChild(sec);
      const cards = el('div', 'cards');
      const last = getLastOpened();
      for (const p of projects) cards.appendChild(this._card(p, p.id === last));
      this.wrap.appendChild(cards);
    } else {
      const e = el('div', 'wfl-empty');
      e.appendChild(el('div', 'ic', icon('project', 30)));
      e.appendChild(el('h3', null, 'Пока нет ни одного проекта'));
      e.appendChild(el('p', null,
        'Выберите шаблон ниже — движок создаст готовую сцену,<br>которую сразу можно запустить и собрать в APK.'));
      this.wrap.appendChild(e);
    }

    /* Шаблоны */
    this.wrap.appendChild(el('div', 'sec', '<span>Новый проект из шаблона</span><span class="line"></span>'));
    const tpls = el('div', 'tpls');
    for (const t of TEMPLATES) {
      const c = el('div', 'wfl-tpl');
      c.appendChild(el('div', 'ic', icon(t.icon, 22)));
      c.appendChild(el('div', null, `<div class="t">${esc(t.title)}</div><div class="d">${esc(t.desc)}</div>`));
      c.onclick = () => this.showCreate(t.id);
      tpls.appendChild(c);
    }
    this.wrap.appendChild(tpls);

    /* Подвал */
    const used = totalSize();
    this.wrap.appendChild(el('div', 'foot',
      `<span>Проекты хранятся в этом браузере</span><span>Занято: ${formatSize(used)}</span>`));
  }

  _card(p, isLast) {
    const card = el('div', 'wfl-card');
    const tpl = TEMPLATES.find((t) => t.id === p.templateId);
    card.appendChild(el('div', 'thumb', icon(tpl?.icon ?? 'project', 24)));

    const body = el('div', 'body');
    body.appendChild(el('div', 'nm', esc(p.name)));
    const meta = el('div', 'meta',
      `<span>${icon('clock', 13)}${formatDate(p.modified)}</span>`
      + `<span>${icon('cube', 13)}${p.objects ?? 0} объектов</span>`
      + (isLast ? '<span style="color:#7fa3ff">открыт последним</span>' : ''));
    body.appendChild(meta);

    const acts = el('div', 'acts');
    const play = el('button', 'wfl-chip play', `${icon('play', 15)}<span>Запустить</span>`);
    play.onclick = (e) => { e.stopPropagation(); this.onPlay(p.id); };
    const edit = el('button', 'wfl-chip', `${icon('edit', 15)}<span>Редактор</span>`);
    edit.onclick = (e) => { e.stopPropagation(); this.onOpenEditor(p.id); };
    const more = el('button', 'wfl-chip', icon('more', 15));
    more.title = 'Ещё';
    more.onclick = (e) => { e.stopPropagation(); this.showProjectMenu(p); };
    acts.append(play, edit, more);
    body.appendChild(acts);

    card.appendChild(body);
    card.onclick = () => this.onOpenEditor(p.id);
    return card;
  }

  /* ---------- Создание ---------- */
  showCreate(templateId = 'empty') {
    let picked = templateId;
    const s = sheet({
      title: 'Новый проект',
      subtitle: 'Дайте имя и выберите, с чего начать. Всё можно поменять позже.',
    });

    const f1 = el('div', 'fld');
    f1.appendChild(el('label', null, 'Название проекта'));
    const name = document.createElement('input');
    name.type = 'text';
    name.value = 'Моя игра';
    name.autocomplete = 'off';
    f1.appendChild(name);
    s.body.appendChild(f1);

    s.body.appendChild(el('label', null, 'Шаблон'));
    const pick = el('div', 'pick');
    const items = TEMPLATES.map((t) => {
      const it = el('div', `wfl-pick-item${t.id === picked ? ' on' : ''}`);
      it.appendChild(el('div', 'ic', icon(t.icon, 20)));
      it.appendChild(el('div', null, `<div class="t">${esc(t.title)}</div><div class="d">${esc(t.desc)}</div>`));
      it.onclick = () => {
        picked = t.id;
        items.forEach((x) => x.classList.toggle('on', x === it));
      };
      pick.appendChild(it);
      return it;
    });
    s.body.appendChild(pick);

    const btns = el('div', 'btns');
    const cancel = el('button', 'wfl-big neutral', `${icon('close', 18)}<span>Отмена</span>`);
    cancel.onclick = () => s.close();
    const create = el('button', 'wfl-big primary', `${icon('check', 18)}<span>Создать</span>`);
    create.onclick = async () => {
      create.disabled = true;
      create.innerHTML = '<span>Создаём сцену…</span>';
      // Даём кадр на перерисовку — генерация демо-сцены заметно нагружает поток
      await new Promise((r) => requestAnimationFrame(r));
      try {
        const { buildTemplateScene } = await import('./templates.js');
        const title = name.value.trim() || 'Моя игра';
        const scene = buildTemplateScene(picked, title);
        const p = createProject({ name: title, scene, templateId: picked });
        s.close();
        this.render();
        this.onOpenEditor(p.id);
      } catch (err) {
        console.error(err);
        create.disabled = false;
        create.innerHTML = `${icon('warning', 18)}<span>Ошибка: ${esc(err.message)}</span>`;
      }
    };
    btns.append(cancel, create);
    s.body.appendChild(btns);
    setTimeout(() => { name.focus(); name.select(); }, 120);
  }

  /* ---------- Меню проекта ---------- */
  showProjectMenu(p) {
    const s = sheet({ title: p.name, subtitle: `Изменён ${formatDate(p.modified)} · ${formatSize(p.size)}` });
    const mk = (ico, label, fn, cls = 'neutral') => {
      const b = el('button', `wfl-big ${cls}`, `${icon(ico, 18)}<span>${esc(label)}</span>`);
      b.style.width = '100%';
      b.style.justifyContent = 'flex-start';
      b.style.marginBottom = '9px';
      b.onclick = fn;
      s.body.appendChild(b);
      return b;
    };
    mk('play', 'Запустить игру', () => { s.close(); this.onPlay(p.id); }, 'primary');
    mk('edit', 'Открыть в редакторе', () => { s.close(); this.onOpenEditor(p.id); });
    mk('rename', 'Переименовать', () => { s.close(); this.showRename(p); });
    mk('copy', 'Создать копию', () => {
      duplicateProject(p.id);
      s.close();
      this.render();
    });
    mk('download', 'Экспорт в файл', () => { s.close(); this.exportFile(p); });
    mk('trash', 'Удалить проект', async () => {
      s.close();
      const yes = await confirmSheet({
        title: 'Удалить проект?',
        message: `Проект «${p.name}» будет удалён навсегда. Это действие нельзя отменить.`,
      });
      if (yes) { deleteProject(p.id); this.render(); }
    }, 'danger');
  }

  showRename(p) {
    const s = sheet({ title: 'Переименовать', subtitle: 'Новое имя подставится и в настройки сборки APK.' });
    const f = el('div', 'fld');
    f.appendChild(el('label', null, 'Название проекта'));
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = p.name;
    f.appendChild(inp);
    s.body.appendChild(f);
    const btns = el('div', 'btns');
    const cancel = el('button', 'wfl-big neutral', `${icon('close', 18)}<span>Отмена</span>`);
    cancel.onclick = () => s.close();
    const ok = el('button', 'wfl-big primary', `${icon('check', 18)}<span>Сохранить</span>`);
    ok.onclick = () => {
      saveProject(p.id, { name: inp.value });
      s.close();
      this.render();
    };
    btns.append(cancel, ok);
    s.body.appendChild(btns);
    setTimeout(() => { inp.focus(); inp.select(); }, 120);
  }

  /* ---------- Импорт / экспорт ---------- */
  exportFile(p) {
    const data = exportProject(p.id);
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${p.name.replace(/[^\wа-яА-ЯёЁ -]/g, '').trim() || 'project'}.wflproj.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  importFile() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const p = importProject(data);
        this.render();
        this.onOpenEditor(p.id);
      } catch (e) {
        await confirmSheet({
          title: 'Не удалось открыть файл',
          message: String(e.message ?? e),
          confirmText: 'Понятно',
          danger: false,
        });
      }
    };
    inp.click();
  }

  showHelp() {
    const s = sheet({ title: 'Как пользоваться', subtitle: 'Коротко о главном.' });
    const rows = [
      ['project', 'Проекты', 'Создайте проект из шаблона. Он сохраняется в браузере и переживает перезагрузку.'],
      ['edit', 'Редактор', 'Тапните по объекту, чтобы выбрать. Стрелки-гизмо двигают, панель снизу правит свойства.'],
      ['play', 'Запуск', 'Кнопка «Запустить» стартует игру поверх редактора. Выход — кнопкой «Стоп».'],
      ['android', 'Сборка APK', 'Готовую игру можно собрать в APK прямо здесь: без Gradle и Android SDK.'],
    ];
    for (const [ic, t, d] of rows) {
      const r = el('div', 'wfl-pick-item');
      r.style.cursor = 'default';
      r.appendChild(el('div', 'ic', icon(ic, 20)));
      r.appendChild(el('div', null, `<div class="t">${esc(t)}</div><div class="d">${esc(d)}</div>`));
      r.style.marginBottom = '9px';
      s.body.appendChild(r);
    }
    const ok = el('button', 'wfl-big primary', `${icon('check', 18)}<span>Понятно</span>`);
    ok.style.width = '100%';
    ok.onclick = () => s.close();
    s.body.appendChild(ok);
  }
}
