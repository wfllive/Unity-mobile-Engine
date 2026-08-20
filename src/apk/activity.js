// WFL Engine — генерация classes.dex с MainActivity (WebView-обёрткой) без javac/d8.
//
// Класс, который генерируется (эквивалент Java-кода):
//
//   public class MainActivity extends android.app.Activity {
//       android.webkit.WebView view;
//       public void onCreate(android.os.Bundle b) {
//           super.onCreate(b);
//           requestWindowFeature(1);                       // FEATURE_NO_TITLE
//           getWindow().addFlags(1024);                    // FLAG_FULLSCREEN
//           getWindow().addFlags(128);                     // FLAG_KEEP_SCREEN_ON
//           WebView w = new WebView(this);
//           WebSettings s = w.getSettings();
//           s.setJavaScriptEnabled(true);
//           s.setDomStorageEnabled(true);
//           s.setAllowFileAccess(true);
//           s.setAllowFileAccessFromFileURLs(true);
//           s.setAllowUniversalAccessFromFileURLs(true);
//           s.setMediaPlaybackRequiresUserGesture(false);
//           s.setUseWideViewPort(true);
//           s.setLoadWithOverviewMode(true);
//           s.setCacheMode(2);                             // LOAD_NO_CACHE
//           w.setWebViewClient(new android.webkit.WebViewClient());
//           w.setWebChromeClient(new android.webkit.WebChromeClient());
//           WebView.setWebContentsDebuggingEnabled(true);
//           w.loadUrl("file:///android_asset/index.html");
//           this.view = w;
//           setContentView(w);
//       }
//       public void onBackPressed() {
//           WebView w = this.view;
//           if (w != null && w.canGoBack()) { w.goBack(); return; }
//           super.onBackPressed();
//       }
//       public void onPause()  { super.onPause();  if (view != null) view.onPause();  }
//       public void onResume() { super.onResume(); if (view != null) view.onResume(); }
//   }
import { DexBuilder, I, ACCESS } from './dex.js';

const ACTIVITY = 'Landroid/app/Activity;';
const BUNDLE = 'Landroid/os/Bundle;';
const WEBVIEW = 'Landroid/webkit/WebView;';
const WEBSETTINGS = 'Landroid/webkit/WebSettings;';
const WEBVIEWCLIENT = 'Landroid/webkit/WebViewClient;';
const WEBCHROMECLIENT = 'Landroid/webkit/WebChromeClient;';
const WINDOW = 'Landroid/view/Window;';
const VIEW = 'Landroid/view/View;';
const CONTEXT = 'Landroid/content/Context;';

/**
 * Собрать classes.dex для WebView-активити.
 * @param {object} opts
 * @param {string} opts.packageName
 * @param {string} [opts.startUrl] URL стартовой страницы
 * @param {boolean} [opts.debuggable] включить отладку WebView
 * @returns {Uint8Array}
 */
export function buildActivityDex({
  packageName,
  startUrl = 'file:///android_asset/index.html',
  debuggable = true,
}) {
  const cls = `L${packageName.replace(/\./g, '/')}/MainActivity;`;
  const fieldView = `${cls}->view:${WEBVIEW}`;

  const dex = new DexBuilder();

  /* ------------------------------------------------------------------
   * Распределение регистров onCreate: registers=4, ins=2
   *   v0 — временный/приёмник результата
   *   v1 — WebView / WebSettings
   *   v2 = p0 (this)
   *   v3 = p1 (Bundle)
   * ------------------------------------------------------------------ */
  const settingBool = (setter, value) => [
    value ? I.const4(0, 1) : I.const4(0, 0),
    I.invoke('virtual', [1, 0], `${WEBSETTINGS}->${setter}(Z)V`),
  ];

  const onCreate = {
    name: 'onCreate',
    params: [BUNDLE],
    ret: 'V',
    accessFlags: ACCESS.PUBLIC,
    registers: 4, ins: 2, outs: 2,
    code: [
      // super.onCreate(bundle)
      I.invoke('super', [2, 3], `${ACTIVITY}->onCreate(${BUNDLE})V`),

      // requestWindowFeature(1)
      I.const4(0, 1),
      I.invoke('virtual', [2, 0], `${ACTIVITY}->requestWindowFeature(I)Z`),

      // getWindow().addFlags(1024) — FLAG_FULLSCREEN
      I.invoke('virtual', [2], `${ACTIVITY}->getWindow()${WINDOW}`),
      I.moveResultObject(0),
      I.const16(1, 1024),
      I.invoke('virtual', [0, 1], `${WINDOW}->addFlags(I)V`),

      // getWindow().addFlags(128) — FLAG_KEEP_SCREEN_ON
      I.invoke('virtual', [2], `${ACTIVITY}->getWindow()${WINDOW}`),
      I.moveResultObject(0),
      I.const16(1, 128),
      I.invoke('virtual', [0, 1], `${WINDOW}->addFlags(I)V`),

      // WebView w = new WebView(this)  → v1
      I.newInstance(1, WEBVIEW),
      I.invoke('direct', [1, 2], `${WEBVIEW}-><init>(${CONTEXT})V`),

      // this.view = w  (записываем сразу, дальше v1 переиспользуется)
      I.iput(1, 2, fieldView),

      // WebSettings s = w.getSettings()  → v1 (WebView уходит в поле)
      I.invoke('virtual', [1], `${WEBVIEW}->getSettings()${WEBSETTINGS}`),
      I.moveResultObject(1),

      ...settingBool('setJavaScriptEnabled', true),
      ...settingBool('setDomStorageEnabled', true),
      ...settingBool('setDatabaseEnabled', true),
      ...settingBool('setAllowFileAccess', true),
      ...settingBool('setAllowContentAccess', true),
      ...settingBool('setAllowFileAccessFromFileURLs', true),
      ...settingBool('setAllowUniversalAccessFromFileURLs', true),
      ...settingBool('setMediaPlaybackRequiresUserGesture', false),
      ...settingBool('setUseWideViewPort', true),
      ...settingBool('setLoadWithOverviewMode', true),
      ...settingBool('setBuiltInZoomControls', false),
      ...settingBool('setSupportZoom', false),

      // s.setCacheMode(2)  — LOAD_NO_CACHE
      I.const4(0, 2),
      I.invoke('virtual', [1, 0], `${WEBSETTINGS}->setCacheMode(I)V`),

      // v1 = this.view (снова WebView)
      I.iget(1, 2, fieldView),

      // w.setWebViewClient(new WebViewClient())
      I.newInstance(0, WEBVIEWCLIENT),
      I.invoke('direct', [0], `${WEBVIEWCLIENT}-><init>()V`),
      I.invoke('virtual', [1, 0], `${WEBVIEW}->setWebViewClient(${WEBVIEWCLIENT})V`),

      // w.setWebChromeClient(new WebChromeClient())
      I.newInstance(0, WEBCHROMECLIENT),
      I.invoke('direct', [0], `${WEBCHROMECLIENT}-><init>()V`),
      I.invoke('virtual', [1, 0], `${WEBVIEW}->setWebChromeClient(${WEBCHROMECLIENT})V`),

      // WebView.setWebContentsDebuggingEnabled(true)
      ...(debuggable ? [
        I.const4(0, 1),
        I.invoke('static', [0], `${WEBVIEW}->setWebContentsDebuggingEnabled(Z)V`),
      ] : []),

      // w.loadUrl(startUrl)
      I.constString(0, startUrl),
      I.invoke('virtual', [1, 0], `${WEBVIEW}->loadUrl(Ljava/lang/String;)V`),

      // setContentView(w)
      I.invoke('virtual', [2, 1], `${ACTIVITY}->setContentView(${VIEW})V`),

      I.returnVoid(),
    ],
  };

  /* onBackPressed: registers=3, ins=1 → v2 = this */
  const onBackPressed = {
    name: 'onBackPressed',
    params: [],
    ret: 'V',
    accessFlags: ACCESS.PUBLIC,
    registers: 3, ins: 1, outs: 1,
    code: [
      I.iget(0, 2, fieldView),           // v0 = this.view
      I.ifEqz(0, 'super_back'),
      I.invoke('virtual', [0], `${WEBVIEW}->canGoBack()Z`),
      I.moveResult(1),
      I.ifEqz(1, 'super_back'),
      I.invoke('virtual', [0], `${WEBVIEW}->goBack()V`),
      I.returnVoid(),
      I.label('super_back'),
      I.invoke('super', [2], `${ACTIVITY}->onBackPressed()V`),
      I.returnVoid(),
    ],
  };

  const lifecycle = (name) => ({
    name,
    params: [],
    ret: 'V',
    accessFlags: ACCESS.PUBLIC,
    registers: 2, ins: 1, outs: 1,
    code: [
      I.invoke('super', [1], `${ACTIVITY}->${name}()V`),
      I.iget(0, 1, fieldView),
      I.ifEqz(0, 'done'),
      I.invoke('virtual', [0], `${WEBVIEW}->${name}()V`),
      I.label('done'),
      I.returnVoid(),
    ],
  });

  const ctor = {
    name: '<init>',
    params: [],
    ret: 'V',
    accessFlags: ACCESS.PUBLIC | ACCESS.CONSTRUCTOR,
    registers: 1, ins: 1, outs: 1,
    code: [
      I.invoke('direct', [0], `${ACTIVITY}-><init>()V`),
      I.returnVoid(),
    ],
  };

  const onDestroy = {
    name: 'onDestroy',
    params: [],
    ret: 'V',
    accessFlags: ACCESS.PUBLIC,
    registers: 2, ins: 1, outs: 1,
    code: [
      I.iget(0, 1, fieldView),
      I.ifEqz(0, 'skip'),
      I.invoke('virtual', [0], `${WEBVIEW}->destroy()V`),
      I.label('skip'),
      I.invoke('super', [1], `${ACTIVITY}->onDestroy()V`),
      I.returnVoid(),
    ],
  };

  dex.addClass({
    name: cls,
    superName: ACTIVITY,
    sourceFile: 'MainActivity.java',
    fields: [{ name: 'view', type: WEBVIEW, accessFlags: 0x0 }],
    methods: [ctor, onCreate, onBackPressed, lifecycle('onPause'), lifecycle('onResume'), onDestroy],
  });

  return dex.build();
}
