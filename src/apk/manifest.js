// WFL Engine — построение AndroidManifest.xml (в виде AXML-дерева)
import { AxmlNode, encodeAxml, ANDROID_NS } from './axml.js';

/**
 * @typedef {object} ApkConfig
 * @property {string} packageName   имя пакета, напр. 'com.wfl.game'
 * @property {string} appName       отображаемое имя
 * @property {number} versionCode
 * @property {string} versionName
 * @property {number} minSdk
 * @property {number} targetSdk
 * @property {'landscape'|'portrait'|'sensorLandscape'|'fullSensor'|'unspecified'} orientation
 * @property {boolean} fullscreen
 * @property {string[]} permissions
 */

export const DEFAULT_CONFIG = {
  packageName: 'com.wfl.game',
  appName: 'WFL Game',
  versionCode: 1,
  versionName: '1.0',
  minSdk: 21,
  targetSdk: 33,
  orientation: 'sensorLandscape',
  fullscreen: true,
  debuggable: false,
  permissions: ['android.permission.INTERNET', 'android.permission.VIBRATE'],
};

/** Числовые коды screenOrientation из android.R.attr */
const ORIENTATION = {
  unspecified: -1,
  landscape: 0,
  portrait: 1,
  user: 2,
  behind: 3,
  sensor: 4,
  nosensor: 5,
  sensorLandscape: 6,
  sensorPortrait: 7,
  reverseLandscape: 8,
  reversePortrait: 9,
  fullSensor: 10,
  userLandscape: 11,
  fullUser: 13,
  locked: 14,
};

/** Маска configChanges — активити переживает поворот/ресайз без пересоздания */
const CONFIG_CHANGES =
  0x0080 |  // orientation
  0x0400 |  // screenSize
  0x0800 |  // smallestScreenSize
  0x1000 |  // density
  0x0010 |  // keyboardHidden
  0x0008 |  // keyboard
  0x0004 |  // navigation
  0x0100 |  // screenLayout
  0x0200 |  // uiMode
  0x0002 |  // locale
  0x0020;   // orientation-related: fontScale/other

// Тема: android:style/Theme.NoTitleBar.Fullscreen = 0x01030007
const THEME_FULLSCREEN = 0x01030007;
// android:style/Theme.NoTitleBar = 0x01030006
const THEME_NOTITLE = 0x01030006;

/** Построить дерево манифеста */
export function buildManifestTree(cfg) {
  const c = { ...DEFAULT_CONFIG, ...cfg };
  const m = new AxmlNode('manifest');
  // xmlns объявляется кодировщиком; здесь только атрибуты
  m.int('versionCode', c.versionCode);
  m.str('versionName', String(c.versionName));
  m.int('compileSdkVersion', c.targetSdk);
  m.str('compileSdkVersionCodename', String(c.targetSdk));
  m.int('installLocation', 0); // auto
  m.attributes.push({ name: 'package', ns: null, type: 0x03, data: 0, raw: c.packageName });
  m.attributes.push({ name: 'platformBuildVersionCode', ns: null, type: 0x10, data: c.targetSdk });
  m.attributes.push({
    name: 'platformBuildVersionName', ns: null, type: 0x03, data: 0, raw: String(c.targetSdk),
  });

  const sdk = m.child('uses-sdk');
  sdk.int('minSdkVersion', c.minSdk);
  sdk.int('targetSdkVersion', c.targetSdk);

  for (const p of c.permissions ?? []) {
    m.child('uses-permission').str('name', p);
  }

  // WebGL требует OpenGL ES 2.0+
  m.child('uses-feature').int('glEsVersion', 0x00020000, ANDROID_NS, true).bool('required', true);
  m.child('uses-feature').str('name', 'android.hardware.touchscreen').bool('required', false);

  const screens = m.child('supports-screens');
  screens.bool('anyDensity', true);
  screens.bool('smallScreens', true);
  screens.bool('normalScreens', true);
  screens.bool('largeScreens', true);
  screens.bool('xlargeScreens', true);

  const app = m.child('application');
  app.bool('allowBackup', true);
  app.bool('supportsRtl', true);
  app.bool('hardwareAccelerated', true);
  app.bool('largeHeap', true);
  app.bool('usesCleartextTraffic', true);
  app.bool('extractNativeLibs', false);
  if (c.debuggable) app.bool('debuggable', true);
  app.str('label', c.appName);
  // ID иконки приходит из resources.arsc (см. buildArsc → ids)
  const iconId = c.iconResId ?? 0x7f010000;
  app.ref('icon', iconId);
  app.ref('roundIcon', iconId);
  app.ref('theme', THEME_FULLSCREEN, ANDROID_NS);

  const act = app.child('activity');
  act.str('name', `${c.packageName}.MainActivity`);
  act.str('label', c.appName);
  act.bool('exported', true);
  act.int('launchMode', 1); // singleTop
  act.int('screenOrientation', ORIENTATION[c.orientation] ?? 6);
  act.int('configChanges', CONFIG_CHANGES, ANDROID_NS, true);
  act.bool('hardwareAccelerated', true);
  act.bool('resizeableActivity', true);
  act.int('windowSoftInputMode', 0x30); // adjustNothing|stateAlwaysHidden
  act.ref('theme', c.fullscreen ? THEME_FULLSCREEN : THEME_NOTITLE, ANDROID_NS);

  const filter = act.child('intent-filter');
  filter.child('action').str('name', 'android.intent.action.MAIN');
  filter.child('category').str('name', 'android.intent.category.LAUNCHER');

  return m;
}

/** Готовый бинарный AndroidManifest.xml */
export function buildManifest(cfg) {
  return encodeAxml(buildManifestTree(cfg));
}
