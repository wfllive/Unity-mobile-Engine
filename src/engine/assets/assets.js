// WFL Engine — менеджер ассетов: текстуры, модели, звуки, JSON, с кэшем и прогрессом
import * as THREE from 'three';
import { EventEmitter } from '../core/events.js';

export class AssetManager extends EventEmitter {
  constructor(engine) {
    super();
    this.engine = engine;
    this.cache = new Map();
    this.manifest = new Map();
    this.basePath = '';
    this._loading = new Map();
    this.loadedCount = 0;
    this.totalCount = 0;
    this._textureLoader = new THREE.TextureLoader();
    this._gltfLoader = null;
    this._audioBuffers = new Map();
  }

  /** Регистрация ассетов: { key: {url, type} } */
  register(manifest) {
    for (const [key, def] of Object.entries(manifest)) {
      this.manifest.set(key, typeof def === 'string' ? { url: def, type: guessType(def) } : def);
    }
    return this;
  }

  has(key) { return this.cache.has(key); }
  get(key) { return this.cache.get(key); }

  async load(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    if (this._loading.has(key)) return this._loading.get(key);
    const def = this.manifest.get(key);
    if (!def) { console.warn(`[Assets] неизвестный ассет: ${key}`); return null; }
    const promise = this._loadByType(key, def)
      .then((asset) => {
        this.cache.set(key, asset);
        this._loading.delete(key);
        this.loadedCount++;
        this.emit('loaded', key, asset, this.loadedCount, this.totalCount);
        return asset;
      })
      .catch((err) => {
        this._loading.delete(key);
        console.error(`[Assets] ошибка загрузки "${key}":`, err);
        this.emit('error', key, err);
        return null;
      });
    this._loading.set(key, promise);
    return promise;
  }

  async loadAll(keys = null) {
    const list = keys ?? [...this.manifest.keys()];
    this.totalCount = list.length;
    this.loadedCount = 0;
    const results = await Promise.all(list.map((k) => this.load(k)));
    this.emit('allLoaded', results);
    return results;
  }

  async _loadByType(key, def) {
    const url = this.basePath + def.url;
    switch (def.type) {
      case 'texture': return this._loadTexture(url, def);
      case 'cubemap': return this._loadCubemap(def.urls.map((u) => this.basePath + u));
      case 'gltf': case 'glb': return this._loadGLTF(url);
      case 'audio': return this._loadAudio(key, url);
      case 'json': return fetch(url).then((r) => r.json());
      case 'text': return fetch(url).then((r) => r.text());
      case 'binary': return fetch(url).then((r) => r.arrayBuffer());
      case 'scene': return fetch(url).then((r) => r.json());
      default: return fetch(url).then((r) => r.blob());
    }
  }

  _loadTexture(url, def = {}) {
    return new Promise((resolve, reject) => {
      this._textureLoader.load(url, (tex) => {
        tex.colorSpace = def.linear ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = def.wrap === 'clamp' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
        if (def.repeat) tex.repeat.set(def.repeat[0], def.repeat[1]);
        tex.anisotropy = def.anisotropy ?? 4;
        tex.generateMipmaps = def.mipmaps !== false;
        resolve(tex);
      }, undefined, reject);
    });
  }

  _loadCubemap(urls) {
    return new Promise((resolve, reject) => {
      new THREE.CubeTextureLoader().load(urls, resolve, undefined, reject);
    });
  }

  async _loadGLTF(url) {
    if (!this._gltfLoader) {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      this._gltfLoader = new GLTFLoader();
      try {
        const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');
        const draco = new DRACOLoader();
        draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        this._gltfLoader.setDRACOLoader(draco);
      } catch { /* draco опционален */ }
    }
    return new Promise((resolve, reject) => {
      this._gltfLoader.load(url, resolve, undefined, reject);
    });
  }

  async _loadAudio(key, url) {
    const { Audio } = await import('../audio/audio.js');
    if (!Audio.context) Audio.init();
    const buf = await Audio.loadBuffer(key, url);
    return buf;
  }

  /** Программное создание текстуры из canvas-рисовалки */
  createTexture(key, width, height, drawFn) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    drawFn(canvas.getContext('2d'), width, height);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    this.cache.set(key, tex);
    return tex;
  }

  /** Встроенная процедурная текстура «шахматка» */
  checkerTexture(key = 'checker', size = 256, colorA = '#3a4152', colorB = '#2a3040', cells = 8) {
    if (this.cache.has(key)) return this.cache.get(key);
    return this.createTexture(key, size, size, (ctx, w, h) => {
      const cw = w / cells, ch = h / cells;
      for (let y = 0; y < cells; y++)
        for (let x = 0; x < cells; x++) {
          ctx.fillStyle = (x + y) % 2 ? colorA : colorB;
          ctx.fillRect(x * cw, y * ch, cw, ch);
        }
    });
  }

  unload(key) {
    const asset = this.cache.get(key);
    if (asset?.dispose) asset.dispose();
    this.cache.delete(key);
  }

  unloadAll() {
    for (const key of [...this.cache.keys()]) this.unload(key);
  }

  get progress() { return this.totalCount ? this.loadedCount / this.totalCount : 1; }
}

function guessType(url) {
  const ext = url.split('.').pop().toLowerCase().split('?')[0];
  if (['png', 'jpg', 'jpeg', 'webp', 'ktx2', 'basis', 'avif'].includes(ext)) return 'texture';
  if (['glb', 'gltf'].includes(ext)) return 'gltf';
  if (['mp3', 'ogg', 'wav', 'm4a', 'aac'].includes(ext)) return 'audio';
  if (ext === 'json') return 'json';
  if (['txt', 'csv', 'glsl', 'vert', 'frag'].includes(ext)) return 'text';
  return 'binary';
}
