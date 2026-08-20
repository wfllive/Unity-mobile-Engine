// WFL Engine — обёртка над WebGLRenderer с адаптацией под мобильные
import * as THREE from 'three';
import { Mathf } from '../core/math.js';

export const QualityLevel = {
  VeryLow: 0, Low: 1, Medium: 2, High: 3, Ultra: 4,
};

// PCFSoftShadowMap объявлен устаревшим в three r18x: рендерер сам заменяет его
// на PCFShadowMap и пишет предупреждение в консоль каждый кадр. Ставим
// PCFShadowMap сразу — картинка та же, консоль чистая.
const SOFT_SHADOWS = THREE.PCFShadowMap;

export const QUALITY_PRESETS = {
  0: { pixelRatio: 0.5, shadows: false, shadowType: THREE.BasicShadowMap, shadowMapSize: 512, antialias: false, maxLights: 2, toneMapping: THREE.NoToneMapping },
  1: { pixelRatio: 0.7, shadows: false, shadowType: THREE.BasicShadowMap, shadowMapSize: 512, antialias: false, maxLights: 3, toneMapping: THREE.NoToneMapping },
  2: { pixelRatio: 1.0, shadows: true, shadowType: THREE.PCFShadowMap, shadowMapSize: 1024, antialias: false, maxLights: 4, toneMapping: THREE.ACESFilmicToneMapping },
  3: { pixelRatio: 1.5, shadows: true, shadowType: SOFT_SHADOWS, shadowMapSize: 2048, antialias: true, maxLights: 8, toneMapping: THREE.ACESFilmicToneMapping },
  4: { pixelRatio: 2.0, shadows: true, shadowType: SOFT_SHADOWS, shadowMapSize: 4096, antialias: true, maxLights: 16, toneMapping: THREE.ACESFilmicToneMapping },
};

export class Renderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.isMobile = opts.isMobile ?? false;
    this.qualityLevel = opts.quality ?? (this.isMobile ? QualityLevel.Medium : QualityLevel.High);

    const preset = QUALITY_PRESETS[this.qualityLevel];
    this.three = new THREE.WebGLRenderer({
      canvas,
      antialias: opts.antialias ?? preset.antialias,
      alpha: opts.alpha ?? false,
      powerPreference: opts.powerPreference ?? (this.isMobile ? 'default' : 'high-performance'),
      stencil: false,
      depth: true,
      preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
      failIfMajorPerformanceCaveat: false,
    });
    this.three.setClearColor(0x0b0e14, 1);
    this.three.outputColorSpace = THREE.SRGBColorSpace;
    this.three.shadowMap.enabled = preset.shadows;
    this.three.shadowMap.type = preset.shadowType;
    this.three.toneMapping = preset.toneMapping;
    this.three.toneMappingExposure = 1.0;

    this.width = 1; this.height = 1;
    this._targetFPS = opts.targetFPS ?? 0;
    this.adaptiveQuality = opts.adaptiveQuality ?? this.isMobile;
    this._fpsHistory = [];
    this._adaptCooldown = 0;
    this.stats = { drawCalls: 0, triangles: 0, programs: 0, textures: 0, geometries: 0 };
    this.setQuality(this.qualityLevel);
  }

  setQuality(level) {
    level = Mathf.clamp(Math.round(level), 0, 4);
    this.qualityLevel = level;
    const p = QUALITY_PRESETS[level];
    const dpr = Math.min(window.devicePixelRatio || 1, p.pixelRatio);
    this.three.setPixelRatio(dpr);
    this.three.shadowMap.enabled = p.shadows;
    this.three.shadowMap.type = p.shadowType;
    this.three.toneMapping = p.toneMapping;
    this.three.shadowMap.needsUpdate = true;
    this.preset = p;
    return this;
  }

  setSize(width, height) {
    this.width = Math.max(1, width | 0);
    this.height = Math.max(1, height | 0);
    this.three.setSize(this.width, this.height, false);
  }

  render(scene, camera) {
    this.three.render(scene, camera);
    const info = this.three.info;
    this.stats.drawCalls = info.render.calls;
    this.stats.triangles = info.render.triangles;
    this.stats.programs = info.programs?.length ?? 0;
    this.stats.textures = info.memory.textures;
    this.stats.geometries = info.memory.geometries;
  }

  /** Автопонижение качества при просадке FPS на слабых устройствах */
  updateAdaptive(fps, dt) {
    if (!this.adaptiveQuality) return;
    this._adaptCooldown -= dt;
    this._fpsHistory.push(fps);
    if (this._fpsHistory.length > 60) this._fpsHistory.shift();
    if (this._adaptCooldown > 0 || this._fpsHistory.length < 40) return;
    const avg = this._fpsHistory.reduce((a, b) => a + b, 0) / this._fpsHistory.length;
    if (avg < 28 && this.qualityLevel > 0) {
      this.setQuality(this.qualityLevel - 1);
      this._adaptCooldown = 5;
      this._fpsHistory.length = 0;
    } else if (avg > 57 && this.qualityLevel < (this.isMobile ? 3 : 4)) {
      this.setQuality(this.qualityLevel + 1);
      this._adaptCooldown = 8;
      this._fpsHistory.length = 0;
    }
  }

  dispose() { this.three.dispose(); }
}
