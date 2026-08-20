// WFL Engine — аудио: 2D/3D звук, микшер, процедурная генерация звуков
import * as THREE from 'three';
import { Component, registerComponent } from '../core/component.js';
import { Mathf } from '../core/math.js';

export class AudioManager {
  constructor() {
    this.context = null;
    this.master = null;
    this.buses = {};
    this.listener = null;
    this.muted = false;
    this._unlocked = false;
    this._buffers = new Map();
    this.volume = 1;
  }

  init() {
    if (this.context) return this;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { console.warn('[Audio] WebAudio недоступен'); return this; }
    this.context = new AC();
    this.master = this.context.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.context.destination);
    for (const name of ['music', 'sfx', 'ui', 'ambient']) {
      const g = this.context.createGain();
      g.connect(this.master);
      this.buses[name] = g;
    }
    this.listener = this.context.listener;
    this._setupUnlock();
    return this;
  }

  _setupUnlock() {
    const unlock = async () => {
      if (this._unlocked || !this.context) return;
      try { await this.context.resume(); this._unlocked = this.context.state === 'running'; } catch {}
      if (this._unlocked) {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('touchstart', unlock);
        window.removeEventListener('keydown', unlock);
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('touchstart', unlock);
    window.addEventListener('keydown', unlock);
  }

  setVolume(v) { this.volume = Mathf.clamp01(v); if (this.master) this.master.gain.value = this.muted ? 0 : this.volume; }
  setBusVolume(bus, v) { if (this.buses[bus]) this.buses[bus].gain.value = Mathf.clamp01(v); }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.volume; }

  async loadBuffer(key, url) {
    if (this._buffers.has(key)) return this._buffers.get(key);
    if (!this.context) this.init();
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    const buf = await this.context.decodeAudioData(arr);
    this._buffers.set(key, buf);
    return buf;
  }

  registerBuffer(key, buffer) { this._buffers.set(key, buffer); return buffer; }
  getBuffer(key) { return this._buffers.get(key); }

  /** Проиграть звук 2D */
  playOneShot(key, { volume = 1, pitch = 1, bus = 'sfx', loop = false } = {}) {
    if (!this.context) this.init();
    const buf = typeof key === 'string' ? this._buffers.get(key) : key;
    if (!buf || !this.context) return null;
    const src = this.context.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitch;
    src.loop = loop;
    const g = this.context.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.buses[bus] ?? this.master);
    src.start();
    return { source: src, gain: g, stop: () => { try { src.stop(); } catch {} } };
  }

  /** Обновление позиции слушателя (для 3D-звука) */
  updateListener(position, forward, up) {
    if (!this.listener) return;
    const l = this.listener;
    if (l.positionX) {
      const t = this.context.currentTime;
      l.positionX.setValueAtTime(position.x, t);
      l.positionY.setValueAtTime(position.y, t);
      l.positionZ.setValueAtTime(position.z, t);
      l.forwardX.setValueAtTime(forward.x, t);
      l.forwardY.setValueAtTime(forward.y, t);
      l.forwardZ.setValueAtTime(forward.z, t);
      l.upX.setValueAtTime(up.x, t);
      l.upY.setValueAtTime(up.y, t);
      l.upZ.setValueAtTime(up.z, t);
    } else {
      l.setPosition(position.x, position.y, position.z);
      l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  // ---- Процедурные звуки (без ассетов) ----
  synth(type = 'blip', opts = {}) {
    if (!this.context) this.init();
    if (!this.context) return null;
    const ctx = this.context;
    const dur = opts.duration ?? 0.15;
    const vol = opts.volume ?? 0.3;
    const bus = this.buses[opts.bus ?? 'sfx'] ?? this.master;
    const now = ctx.currentTime;

    if (type === 'noise' || type === 'explosion' || type === 'hit') {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, type === 'explosion' ? 1.5 : 4);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(opts.frequency ?? 1400, now);
      filter.frequency.exponentialRampToValueAtTime(120, now + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(filter).connect(g).connect(bus);
      src.start(now);
      src.stop(now + dur);
      return src;
    }

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f0 = opts.frequency ?? 440;
    const f1 = opts.endFrequency ?? (type === 'jump' ? f0 * 2 : type === 'coin' ? f0 * 1.5 : f0);
    osc.type = opts.wave ?? (type === 'coin' ? 'square' : 'sine');
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g).connect(bus);
    osc.start(now);
    osc.stop(now + dur + 0.02);
    return osc;
  }
}

export const Audio = new AudioManager();

/** Источник звука в 3D-пространстве */
export class AudioSource extends Component {
  static componentName = 'AudioSource';
  static inspector = {
    clipKey: { type: 'string', default: '', label: 'Ключ клипа' },
    volume: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Громкость' },
    pitch: { type: 'number', default: 1, min: 0.1, max: 3, step: 0.05, label: 'Тон' },
    loop: { type: 'boolean', default: false, label: 'Зациклить' },
    playOnAwake: { type: 'boolean', default: false, label: 'Играть при старте' },
    spatial: { type: 'boolean', default: true, label: '3D звук' },
    minDistance: { type: 'number', default: 1, min: 0.1, step: 0.5, label: 'Мин. дистанция' },
    maxDistance: { type: 'number', default: 50, min: 1, step: 1, label: 'Макс. дистанция' },
    bus: { type: 'select', default: 'sfx', options: ['sfx', 'music', 'ui', 'ambient'], label: 'Шина' },
  };

  constructor() {
    super();
    this.clipKey = '';
    this.volume = 1;
    this.pitch = 1;
    this.loop = false;
    this.playOnAwake = false;
    this.spatial = true;
    this.minDistance = 1;
    this.maxDistance = 50;
    this.bus = 'sfx';
    this._source = null;
    this._panner = null;
    this._gain = null;
    this.isPlaying = false;
  }

  awake() { if (this.playOnAwake && this.clipKey) this.play(); }

  play(key = null) {
    const audio = Audio;
    if (!audio.context) audio.init();
    if (!audio.context) return this;
    const buf = audio.getBuffer(key ?? this.clipKey);
    if (!buf) return this;
    this.stop();
    const ctx = audio.context;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = this.loop;
    src.playbackRate.value = this.pitch;
    const g = ctx.createGain();
    g.gain.value = this.volume;
    if (this.spatial) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = this.minDistance;
      p.maxDistance = this.maxDistance;
      p.rolloffFactor = 1;
      const pos = this.transform.position;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
      else p.setPosition(pos.x, pos.y, pos.z);
      src.connect(g).connect(p).connect(audio.buses[this.bus] ?? audio.master);
      this._panner = p;
    } else {
      src.connect(g).connect(audio.buses[this.bus] ?? audio.master);
      this._panner = null;
    }
    src.onended = () => { this.isPlaying = false; };
    src.start();
    this._source = src;
    this._gain = g;
    this.isPlaying = true;
    return this;
  }

  stop() {
    if (this._source) { try { this._source.stop(); } catch {} }
    this._source = null; this._panner = null; this._gain = null;
    this.isPlaying = false;
    return this;
  }

  update() {
    if (this._gain) this._gain.gain.value = this.volume;
    if (this._source) this._source.playbackRate.value = this.pitch;
    if (this._panner) {
      const pos = this.transform.position;
      if (this._panner.positionX) {
        const t = Audio.context.currentTime;
        this._panner.positionX.setValueAtTime(pos.x, t);
        this._panner.positionY.setValueAtTime(pos.y, t);
        this._panner.positionZ.setValueAtTime(pos.z, t);
      } else this._panner.setPosition(pos.x, pos.y, pos.z);
    }
  }

  onDestroy() { this.stop(); }
}
registerComponent(AudioSource);

/** Слушатель — обычно на камере */
export class AudioListener extends Component {
  static componentName = 'AudioListener';
  static allowMultiple = false;
  lateUpdate() {
    if (!Audio.context) return;
    Audio.updateListener(this.transform.position, this.transform.forward, this.transform.up);
  }
}
registerComponent(AudioListener);
