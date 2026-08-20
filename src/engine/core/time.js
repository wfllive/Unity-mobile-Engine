// WFL Engine — время (аналог UnityEngine.Time)
export const Time = {
  /** Время кадра с учётом timeScale */
  deltaTime: 0,
  /** Время кадра без учёта timeScale */
  unscaledDeltaTime: 0,
  /** Шаг физики */
  fixedDeltaTime: 1 / 60,
  /** Прошедшее игровое время */
  time: 0,
  unscaledTime: 0,
  timeScale: 1,
  frameCount: 0,
  realtimeSinceStartup: 0,
  maximumDeltaTime: 0.1,
  smoothDeltaTime: 0,
  fps: 0,

  _startMs: 0,
  _lastMs: 0,
  _fpsAccum: 0,
  _fpsFrames: 0,

  reset() {
    this.deltaTime = 0;
    this.unscaledDeltaTime = 0;
    this.time = 0;
    this.unscaledTime = 0;
    this.frameCount = 0;
    this.smoothDeltaTime = 0;
    this._startMs = performance.now();
    this._lastMs = this._startMs;
  },

  _tick(nowMs) {
    if (!this._startMs) this._startMs = nowMs;
    let dt = (nowMs - this._lastMs) / 1000;
    this._lastMs = nowMs;
    if (!isFinite(dt) || dt < 0) dt = 0;
    this.unscaledDeltaTime = Math.min(dt, this.maximumDeltaTime);
    this.deltaTime = this.unscaledDeltaTime * this.timeScale;
    this.time += this.deltaTime;
    this.unscaledTime += this.unscaledDeltaTime;
    this.realtimeSinceStartup = (nowMs - this._startMs) / 1000;
    this.frameCount++;
    this.smoothDeltaTime += (this.unscaledDeltaTime - this.smoothDeltaTime) * 0.1;

    this._fpsAccum += this.unscaledDeltaTime;
    this._fpsFrames++;
    if (this._fpsAccum >= 0.25) {
      this.fps = this._fpsFrames / this._fpsAccum;
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }
    return this.deltaTime;
  },
};
