// WFL Engine — набор векторных иконок интерфейса.
//
// Единый стиль: сетка 24×24, обводка `currentColor`, толщина 1.75,
// скруглённые концы. Никаких эмодзи — они выглядят по-разному в каждой
// системе и ломают вид панелей. Иконки наследуют цвет и размер текста.

/** @type {Record<string,string>} тело <svg> для каждой иконки */
const PATHS = {
  /* --- Навигация и общие --- */
  back: '<path d="M15 19l-7-7 7-7"/>',
  forward: '<path d="M9 5l7 7-7 7"/>',
  up: '<path d="M5 15l7-7 7 7"/>',
  down: '<path d="M19 9l-7 7-7-7"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  home: '<path d="M3 10.5L12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 114 2.2c-.9.6-1.6 1.1-1.6 2.1M12 17v.5"/>',
  warning: '<path d="M10.3 3.9L2.6 17.4A2 2 0 004.3 20.4h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4.2M12 16.8v.4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',

  /* --- Проекты и файлы --- */
  project: '<path d="M3 7.5A1.5 1.5 0 014.5 6h4l2 2.5h7A1.5 1.5 0 0119 10v7.5a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 013 17.5z"/>',
  file: '<path d="M13.5 3H7a1.8 1.8 0 00-1.8 1.8v14.4A1.8 1.8 0 007 21h10a1.8 1.8 0 001.8-1.8V8.3z"/><path d="M13.5 3v5.3h5.3"/>',
  save: '<path d="M5 3.8h10.2L20.2 8.8V19A1.2 1.2 0 0119 20.2H5A1.2 1.2 0 013.8 19V5A1.2 1.2 0 015 3.8z"/><path d="M7.8 3.8v5.4h7V3.8M7.5 20.2v-5.4h9v5.4"/>',
  open: '<path d="M3 7.5A1.5 1.5 0 014.5 6h4l2 2.5h7A1.5 1.5 0 0119 10v.8"/><path d="M3 17.5V10l2.6 9h12.2l2.6-8.2H6.2z"/>',
  download: '<path d="M12 3.5v11M7.8 10.3L12 14.5l4.2-4.2"/><path d="M4.5 17v2.2a1.3 1.3 0 001.3 1.3h12.4a1.3 1.3 0 001.3-1.3V17"/>',
  upload: '<path d="M12 20.5v-11M7.8 13.7L12 9.5l4.2 4.2"/><path d="M4.5 7V4.8a1.3 1.3 0 011.3-1.3h12.4a1.3 1.3 0 011.3 1.3V7"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="1.8"/><path d="M15.5 5.5V5A1.5 1.5 0 0014 3.5H5.5A1.5 1.5 0 004 5v9a1.5 1.5 0 001.5 1.5H6"/>',
  edit: '<path d="M4 20h4.2L19.4 8.8a2 2 0 000-2.8l-1.4-1.4a2 2 0 00-2.8 0L4 15.8z"/><path d="M14.4 6.2l3.4 3.4"/>',
  trash: '<path d="M4.5 6.8h15"/><path d="M9.3 6.8V4.9a1.4 1.4 0 011.4-1.4h2.6a1.4 1.4 0 011.4 1.4v1.9"/><path d="M6.5 6.8l.9 12.1a1.6 1.6 0 001.6 1.5h6a1.6 1.6 0 001.6-1.5l.9-12.1"/><path d="M10.4 10.5v6M13.6 10.5v6"/>',
  rename: '<path d="M8.5 4h7M8.5 20h7M12 4v16"/><rect x="3" y="8" width="18" height="8" rx="1.6" opacity=".35"/>',
  package: '<path d="M12 3.2l8 4.2v9.2l-8 4.2-8-4.2V7.4z"/><path d="M4 7.4l8 4.2 8-4.2M12 11.6v8.2"/>',
  android: '<path d="M6 10.5h12v6.2a1.3 1.3 0 01-1.3 1.3H7.3A1.3 1.3 0 016 16.7z"/><path d="M9 10.5A3 3 0 0112 7.5a3 3 0 013 3"/><path d="M8.6 5.4l1 1.6M15.4 5.4l-1 1.6M3.6 12v3.4M20.4 12v3.4M9.5 18v2M14.5 18v2"/>',

  /* --- Игра --- */
  play: '<path d="M7.5 4.8l12 7.2-12 7.2z"/>',
  pause: '<path d="M9 4.8v14.4M15 4.8v14.4"/>',
  stop: '<rect x="5.5" y="5.5" width="13" height="13" rx="2"/>',
  restart: '<path d="M20 12a8 8 0 11-2.6-5.9"/><path d="M20 3.8V9h-5.2"/>',
  gamepad: '<path d="M7.4 8h9.2a4.4 4.4 0 014.3 3.5l.8 4.2A2.6 2.6 0 0119.2 19c-1 0-1.6-.5-2.3-1.2L15.6 16.5H8.4L7.1 17.8C6.4 18.5 5.8 19 4.8 19a2.6 2.6 0 01-2.5-3.3l.8-4.2A4.4 4.4 0 017.4 8z"/><path d="M7 11.2v2.6M5.7 12.5h2.6M15.6 11.8v.2M17.6 13.4v.2"/>',
  fullscreen: '<path d="M4 9V5.4A1.4 1.4 0 015.4 4H9M15 4h3.6A1.4 1.4 0 0120 5.4V9M20 15v3.6a1.4 1.4 0 01-1.4 1.4H15M9 20H5.4A1.4 1.4 0 014 18.6V15"/>',

  /* --- Редактор: инструменты --- */
  move: '<path d="M12 3v18M3 12h18"/><path d="M12 3l-2.2 2.4M12 3l2.2 2.4M12 21l-2.2-2.4M12 21l2.2-2.4M3 12l2.4-2.2M3 12l2.4 2.2M21 12l-2.4-2.2M21 12l-2.4 2.2"/>',
  rotate: '<path d="M20.2 12a8.2 8.2 0 11-2.7-6.1"/><path d="M20.2 4.4V10h-5.6"/><circle cx="12" cy="12" r="1.6"/>',
  scale: '<path d="M5 19L19 5"/><path d="M14 5h5v5"/><rect x="4" y="14" width="6" height="6" rx="1.2"/>',
  snap: '<path d="M4 9h16M4 15h16M9 4v16M15 4v16"/>',
  focus: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v3.2M12 17.8V21M3 12h3.2M17.8 12H21"/>',
  hierarchy: '<rect x="3.5" y="3.5" width="7" height="5.4" rx="1.2"/><rect x="13.5" y="15.1" width="7" height="5.4" rx="1.2"/><rect x="3.5" y="15.1" width="7" height="5.4" rx="1.2"/><path d="M7 8.9v4.1M7 13h10.5v2.1M7 13v2.1"/>',
  inspector: '<path d="M5 7h9M5 12h5M5 17h9"/><circle cx="17.5" cy="7" r="2.1"/><circle cx="13" cy="12" r="2.1"/><circle cx="17.5" cy="17" r="2.1"/>',
  console: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M7 9.5l2.8 2.6L7 14.7M12.5 15h4.5"/>',
  blueprint: '<rect x="3" y="4" width="7" height="6" rx="1.4"/><rect x="14" y="14" width="7" height="6" rx="1.4"/><path d="M10 7h2.6a1.4 1.4 0 011.4 1.4V17"/><circle cx="7" cy="17" r="2.4"/>',
  layers: '<path d="M12 3.2l8.4 4.4-8.4 4.4-8.4-4.4z"/><path d="M3.6 12.2l8.4 4.4 8.4-4.4M3.6 16.6l8.4 4.4 8.4-4.4" opacity=".5"/>',
  eye: '<path d="M2.6 12S6.4 5.8 12 5.8 21.4 12 21.4 12 17.6 18.2 12 18.2 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="2.8"/>',
  'eye-off': '<path d="M9.6 6.2A8.5 8.5 0 0112 5.8c5.6 0 9.4 6.2 9.4 6.2a17 17 0 01-3 3.7M6.5 7.9A17 17 0 002.6 12S6.4 18.2 12 18.2c1 0 1.9-.2 2.7-.5"/><path d="M4 4l16 16"/>',

  /* --- Объекты сцены --- */
  cube: '<path d="M12 3.2l8 4.2v9.2l-8 4.2-8-4.2V7.4z"/><path d="M4 7.4l8 4.2 8-4.2M12 11.6v8.2"/>',
  sphere: '<circle cx="12" cy="12" r="8.6"/><path d="M3.4 12c0 1.7 3.9 3.1 8.6 3.1s8.6-1.4 8.6-3.1"/><ellipse cx="12" cy="12" rx="3.6" ry="8.6"/>',
  plane: '<path d="M2.8 16.5L12 11l9.2 5.5L12 21z"/><path d="M12 11V4"/>',
  cylinder: '<ellipse cx="12" cy="6.2" rx="6.6" ry="2.6"/><path d="M5.4 6.2v11.6c0 1.4 3 2.6 6.6 2.6s6.6-1.2 6.6-2.6V6.2"/>',
  cone: '<path d="M12 3.4l6.4 13.2H5.6z"/><ellipse cx="12" cy="16.6" rx="6.4" ry="2.6"/>',
  torus: '<ellipse cx="12" cy="12" rx="9" ry="6"/><ellipse cx="12" cy="12" rx="3.4" ry="2"/>',
  capsule: '<rect x="7.5" y="3" width="9" height="18" rx="4.5"/><path d="M7.5 12h9" opacity=".4"/>',
  light: '<path d="M9.4 17.5h5.2M10 20.4h4"/><path d="M12 3.2v1.6M5.6 6.1l1.1 1.1M18.4 6.1l-1.1 1.1M3.4 12.4H5M19 12.4h1.6"/><path d="M8.4 14.6a4.6 4.6 0 117.2 0c-.7.9-1.1 1.5-1.2 2.4H9.6c-.1-.9-.5-1.5-1.2-2.4z"/>',
  camera: '<path d="M3.5 8.4A1.9 1.9 0 015.4 6.5h2.3l1.2-2h6.2l1.2 2h2.3a1.9 1.9 0 011.9 1.9v8.2a1.9 1.9 0 01-1.9 1.9H5.4a1.9 1.9 0 01-1.9-1.9z"/><circle cx="12" cy="12.4" r="3.4"/>',
  particles: '<circle cx="6" cy="7" r="1.6"/><circle cx="12" cy="4.6" r="1.2"/><circle cx="17.8" cy="8" r="1.8"/><circle cx="8.4" cy="13.6" r="1.3"/><circle cx="15" cy="14.6" r="1.5"/><circle cx="11" cy="19.4" r="1.2"/><circle cx="19" cy="18" r="1.1"/><circle cx="4.4" cy="18.4" r="1.4"/>',
  terrain: '<path d="M2.6 18.4l5.2-8 3.4 4.6 2.6-3.4 7.6 6.8z"/><circle cx="17.4" cy="6.6" r="2.2"/>',
  component: '<path d="M9.6 3.5h4.8v3a2 2 0 002 2h3v4.8M20.4 13.3v4.8a2.3 2.3 0 01-2.3 2.3h-4.5"/><path d="M13.6 20.4H5.8a2.3 2.3 0 01-2.3-2.3V5.8a2.3 2.3 0 012.3-2.3h3.8"/>',
  sound: '<path d="M4.5 9.5h3.2L12 5.8v12.4l-4.3-3.7H4.5z"/><path d="M15.4 9.4a3.6 3.6 0 010 5.2M18 7a7 7 0 010 10"/>',
  physics: '<circle cx="12" cy="12" r="2.2"/><ellipse cx="12" cy="12" rx="9" ry="4.2"/><ellipse cx="12" cy="12" rx="9" ry="4.2" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="4.2" transform="rotate(120 12 12)"/>',
  grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="1.8"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.2 14.4a1.6 1.6 0 00.3 1.8l.1.1a1.9 1.9 0 11-2.7 2.7l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5v.2a1.9 1.9 0 11-3.8 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a1.9 1.9 0 11-2.7-2.7l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3.2a1.9 1.9 0 110-3.8h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a1.9 1.9 0 112.7-2.7l.1.1a1.6 1.6 0 001.8.3h.1a1.6 1.6 0 001-1.5V3.2a1.9 1.9 0 113.8 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a1.9 1.9 0 112.7 2.7l-.1.1a1.6 1.6 0 00-.3 1.8v.1a1.6 1.6 0 001.5 1h.2a1.9 1.9 0 110 3.8h-.1a1.6 1.6 0 00-1.5 1z"/>',
  bolt: '<path d="M13.2 2.8L4.6 13.4h6L10 21.2l8.6-10.6h-6z"/>',
  target: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r="1"/>',
  crystal: '<path d="M12 2.8l6.4 5.6L12 21.2 5.6 8.4z"/><path d="M5.6 8.4h12.8M12 2.8L9.2 8.4 12 21.2l2.8-12.8z"/>',
};

/** Иконки, которые рисуются заливкой, а не обводкой */
const FILLED = new Set(['play']);

/**
 * HTML-разметка иконки.
 * @param {string} name имя из набора
 * @param {number} [size] размер в пикселях
 */
export function icon(name, size = 20) {
  const body = PATHS[name];
  if (!body) return '';
  const fill = FILLED.has(name) ? 'currentColor' : 'none';
  const stroke = FILLED.has(name) ? 'none' : 'currentColor';
  return `<svg class="wfl-i" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${fill}" stroke="${stroke}"`
    + ' stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
    + `${body}</svg>`;
}

/**
 * Иконка как DOM-элемент.
 * @returns {SVGElement|null}
 */
export function iconEl(name, size = 20) {
  const html = icon(name, size);
  if (!html) return null;
  const tpl = document.createElement('div');
  tpl.innerHTML = html;
  return tpl.firstElementChild;
}

/** Есть ли такая иконка в наборе */
export function hasIcon(name) { return Object.hasOwn(PATHS, name); }

/** Список доступных имён (для тестов и отладки) */
export function iconNames() { return Object.keys(PATHS); }

/** Подобрать иконку под тип примитива или имя компонента */
export function iconForThing(name = '') {
  const k = String(name).toLowerCase();
  const map = {
    box: 'cube', cube: 'cube', sphere: 'sphere', plane: 'plane', ground: 'plane',
    cylinder: 'cylinder', cone: 'cone', torus: 'torus', capsule: 'capsule',
    circle: 'sphere', ring: 'torus', dodecahedron: 'sphere', icosahedron: 'sphere',
    octahedron: 'sphere', tetrahedron: 'cone', torusknot: 'torus',
    camera: 'camera', light: 'light', lightcomponent: 'light',
    meshrenderer: 'cube', modelrenderer: 'cube', spriterenderer: 'plane',
    particlesystem: 'particles', skybox: 'light', terrain: 'terrain',
    rigidbody: 'physics', boxcollider: 'cube', spherecollider: 'sphere',
    capsulecollider: 'capsule', planecollider: 'plane', meshcollider: 'cube',
    charactercontroller: 'gamepad', playercontroller: 'gamepad',
    audiosource: 'sound', audiolistener: 'sound',
    blueprint: 'blueprint', health: 'target', pickup: 'crystal',
    rotator: 'rotate', floater: 'up', killzone: 'warning', spawner: 'particles',
    chaseai: 'target', orbitcamera: 'camera', followcamera: 'camera',
    worldlabel: 'inspector', scriptbehaviour: 'console',
  };
  return map[k] ?? 'component';
}
