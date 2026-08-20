// WFL Engine — компоненты рендеринга: камеры, свет, меши, спрайты, партиклы
import * as THREE from 'three';
import { Component, registerComponent } from '../core/component.js';
import { Mathf, Random, Noise } from '../core/math.js';

// ---------- Камера ----------
export class CameraComponent extends Component {
  static componentName = 'Camera';
  static allowMultiple = false;
  static inspector = {
    fieldOfView: { type: 'number', default: 60, min: 1, max: 179, step: 1, label: 'Поле зрения' },
    nearClipPlane: { type: 'number', default: 0.1, min: 0.001, step: 0.01, label: 'Ближняя плоскость' },
    farClipPlane: { type: 'number', default: 1000, min: 1, step: 10, label: 'Дальняя плоскость' },
    orthographic: { type: 'boolean', default: false, label: 'Ортографическая' },
    orthographicSize: { type: 'number', default: 5, min: 0.1, step: 0.1, label: 'Размер орто' },
    depth: { type: 'number', default: 0, step: 1, label: 'Порядок' },
    isMainCamera: { type: 'boolean', default: true, label: 'Главная камера' },
  };

  constructor() {
    super();
    this.fieldOfView = 60;
    this.nearClipPlane = 0.1;
    this.farClipPlane = 1000;
    this.orthographic = false;
    this.orthographicSize = 5;
    this.depth = 0;
    this.isMainCamera = true;
    this.cullingMask = 0xffffffff;
    this.clearFlags = 'skybox';
    this.backgroundColor = new THREE.Color(0x0b0e14);
    /** @type {THREE.PerspectiveCamera|THREE.OrthographicCamera} */
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    this._aspect = 1;
  }

  awake() {
    this.transform.object3D.add(this.camera);
    this._rebuild();
    if (this.isMainCamera && this.scene) this.scene.mainCamera = this;
  }

  onDestroy() {
    this.camera.removeFromParent();
    if (this.scene?.mainCamera === this) this.scene.mainCamera = null;
  }

  _rebuild() {
    const aspect = this._aspect || 1;
    if (this.orthographic) {
      if (!this.camera.isOrthographicCamera) {
        this.camera.removeFromParent();
        this.camera = new THREE.OrthographicCamera();
        this.transform.object3D.add(this.camera);
      }
      const h = this.orthographicSize;
      const w = h * aspect;
      Object.assign(this.camera, { left: -w, right: w, top: h, bottom: -h, near: this.nearClipPlane, far: this.farClipPlane });
    } else {
      if (!this.camera.isPerspectiveCamera) {
        this.camera.removeFromParent();
        this.camera = new THREE.PerspectiveCamera();
        this.transform.object3D.add(this.camera);
      }
      this.camera.fov = this.fieldOfView;
      this.camera.aspect = aspect;
      this.camera.near = this.nearClipPlane;
      this.camera.far = this.farClipPlane;
    }
    this.camera.updateProjectionMatrix();
  }

  setAspect(aspect) {
    if (Math.abs(this._aspect - aspect) < 1e-6) return;
    this._aspect = aspect;
    this._rebuild();
  }

  lateUpdate() {
    // синхронизация свойств, если менялись из кода/инспектора
    const c = this.camera;
    if (this.orthographic !== !!c.isOrthographicCamera) this._rebuild();
    else if (!this.orthographic && (c.fov !== this.fieldOfView || c.near !== this.nearClipPlane || c.far !== this.farClipPlane)) this._rebuild();
    else if (this.orthographic && Math.abs(c.top - this.orthographicSize) > 1e-6) this._rebuild();
  }

  screenPointToRay(x, y, viewportWidth, viewportHeight) {
    const ndc = new THREE.Vector2((x / viewportWidth) * 2 - 1, (y / viewportHeight) * 2 - 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    return { origin: raycaster.ray.origin.clone(), direction: raycaster.ray.direction.clone() };
  }

  worldToScreenPoint(world, viewportWidth, viewportHeight) {
    const p = world.clone().project(this.camera);
    return new THREE.Vector3(
      (p.x * 0.5 + 0.5) * viewportWidth,
      (p.y * 0.5 + 0.5) * viewportHeight,
      p.z);
  }
}
registerComponent(CameraComponent, 'Camera');

// ---------- Освещение ----------
export class LightComponent extends Component {
  static componentName = 'Light';
  static allowMultiple = false;
  static inspector = {
    lightType: { type: 'select', default: 'directional', options: ['directional', 'point', 'spot', 'ambient', 'hemisphere'], label: 'Тип' },
    color: { type: 'color', default: '#ffffff', label: 'Цвет' },
    intensity: { type: 'number', default: 1, min: 0, step: 0.1, label: 'Яркость' },
    range: { type: 'number', default: 20, min: 0, step: 1, label: 'Дальность' },
    spotAngle: { type: 'number', default: 45, min: 1, max: 179, step: 1, label: 'Угол прожектора' },
    castShadows: { type: 'boolean', default: true, label: 'Тени' },
    shadowMapSize: { type: 'select', default: 1024, options: [512, 1024, 2048, 4096], label: 'Размер карты теней' },
  };

  constructor() {
    super();
    this.lightType = 'directional';
    this.color = new THREE.Color(0xffffff);
    this.intensity = 1;
    this.range = 20;
    this.spotAngle = 45;
    this.castShadows = true;
    this.shadowMapSize = 1024;
    this.shadowBias = -0.0005;
    /** @type {THREE.Light|null} */
    this.light = null;
    this._builtType = null;
  }

  awake() { this._build(); }
  onDestroy() { this.light?.removeFromParent(); this.light?.dispose?.(); }

  _build() {
    if (this.light) { this.light.removeFromParent(); this.light.dispose?.(); }
    const c = this.color, i = this.intensity;
    switch (this.lightType) {
      case 'point':
        this.light = new THREE.PointLight(c, i, this.range, 2); break;
      case 'spot':
        this.light = new THREE.SpotLight(c, i, this.range, this.spotAngle * Mathf.Deg2Rad, 0.3, 2); break;
      case 'ambient':
        this.light = new THREE.AmbientLight(c, i); break;
      case 'hemisphere':
        this.light = new THREE.HemisphereLight(c, 0x404040, i); break;
      default:
        this.light = new THREE.DirectionalLight(c, i); break;
    }
    this._builtType = this.lightType;
    if (this.light.shadow) {
      this.light.castShadow = this.castShadows;
      this.light.shadow.mapSize.set(this.shadowMapSize, this.shadowMapSize);
      this.light.shadow.bias = this.shadowBias;
      if (this.light.shadow.camera?.isOrthographicCamera) {
        const cam = this.light.shadow.camera;
        cam.left = -30; cam.right = 30; cam.top = 30; cam.bottom = -30;
        cam.near = 0.5; cam.far = 150;
        cam.updateProjectionMatrix();
      }
    }
    this.transform.object3D.add(this.light);
    if (this.light.target) this.transform.object3D.add(this.light.target);
    if (this.light.isDirectionalLight || this.light.isSpotLight) {
      this.light.target.position.set(0, 0, -1);
    }
  }

  update() {
    if (!this.light) return;
    if (this._builtType !== this.lightType) { this._build(); return; }
    this.light.color.copy(this.color);
    this.light.intensity = this.intensity;
    if (this.light.distance !== undefined) this.light.distance = this.range;
    if (this.light.angle !== undefined) this.light.angle = this.spotAngle * Mathf.Deg2Rad;
    if (this.light.shadow) this.light.castShadow = this.castShadows;
  }

  serialize() {
    const d = super.serialize();
    d.color = '#' + this.color.getHexString();
    return d;
  }
  deserialize(data) {
    super.deserialize(data);
    if (data?.color) this.color.set(data.color);
    return this;
  }
}
registerComponent(LightComponent, 'Light');

// ---------- Меш ----------
export const GEOMETRY_FACTORY = {
  box: (p) => new THREE.BoxGeometry(p.width ?? 1, p.height ?? 1, p.depth ?? 1, p.segments ?? 1, p.segments ?? 1, p.segments ?? 1),
  sphere: (p) => new THREE.SphereGeometry(p.radius ?? 0.5, p.widthSegments ?? 32, p.heightSegments ?? 16),
  capsule: (p) => new THREE.CapsuleGeometry(p.radius ?? 0.5, p.height ?? 1, p.capSegments ?? 8, p.radialSegments ?? 16),
  cylinder: (p) => new THREE.CylinderGeometry(p.radiusTop ?? 0.5, p.radiusBottom ?? 0.5, p.height ?? 1, p.radialSegments ?? 24),
  cone: (p) => new THREE.ConeGeometry(p.radius ?? 0.5, p.height ?? 1, p.radialSegments ?? 24),
  plane: (p) => new THREE.PlaneGeometry(p.width ?? 10, p.height ?? 10, p.widthSegments ?? 1, p.heightSegments ?? 1),
  torus: (p) => new THREE.TorusGeometry(p.radius ?? 0.5, p.tube ?? 0.2, p.radialSegments ?? 16, p.tubularSegments ?? 48),
  torusKnot: (p) => new THREE.TorusKnotGeometry(p.radius ?? 0.5, p.tube ?? 0.15, p.tubularSegments ?? 100, p.radialSegments ?? 16),
  icosahedron: (p) => new THREE.IcosahedronGeometry(p.radius ?? 0.5, p.detail ?? 0),
  dodecahedron: (p) => new THREE.DodecahedronGeometry(p.radius ?? 0.5, p.detail ?? 0),
  octahedron: (p) => new THREE.OctahedronGeometry(p.radius ?? 0.5, p.detail ?? 0),
  tetrahedron: (p) => new THREE.TetrahedronGeometry(p.radius ?? 0.5, p.detail ?? 0),
  ring: (p) => new THREE.RingGeometry(p.innerRadius ?? 0.3, p.outerRadius ?? 0.5, p.thetaSegments ?? 32),
  circle: (p) => new THREE.CircleGeometry(p.radius ?? 0.5, p.segments ?? 32),
};

export function createGeometry(type, params = {}) {
  const f = GEOMETRY_FACTORY[type];
  if (!f) { console.warn(`[Mesh] неизвестный тип геометрии: ${type}`); return new THREE.BoxGeometry(1, 1, 1); }
  return f(params);
}

export class MeshRenderer extends Component {
  static componentName = 'MeshRenderer';
  static allowMultiple = false;
  static inspector = {
    geometryType: {
      type: 'select', default: 'box',
      options: Object.keys(GEOMETRY_FACTORY), label: 'Геометрия',
    },
    color: { type: 'color', default: '#cfd6e4', label: 'Цвет' },
    metalness: { type: 'number', default: 0.1, min: 0, max: 1, step: 0.01, label: 'Металличность' },
    roughness: { type: 'number', default: 0.75, min: 0, max: 1, step: 0.01, label: 'Шероховатость' },
    emissive: { type: 'color', default: '#000000', label: 'Свечение' },
    emissiveIntensity: { type: 'number', default: 1, min: 0, max: 10, step: 0.1, label: 'Сила свечения' },
    opacity: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Прозрачность' },
    wireframe: { type: 'boolean', default: false, label: 'Каркас' },
    castShadow: { type: 'boolean', default: true, label: 'Отбрасывать тень' },
    receiveShadow: { type: 'boolean', default: true, label: 'Принимать тень' },
    materialType: { type: 'select', default: 'standard', options: ['standard', 'physical', 'phong', 'lambert', 'basic', 'toon', 'normal'], label: 'Материал' },
  };

  constructor() {
    super();
    this.geometryType = 'box';
    this.geometryParams = {};
    this.materialType = 'standard';
    this.color = new THREE.Color(0xcfd6e4);
    this.emissive = new THREE.Color(0x000000);
    this.emissiveIntensity = 1;
    this.metalness = 0.1;
    this.roughness = 0.75;
    this.opacity = 1;
    this.wireframe = false;
    this.castShadow = true;
    this.receiveShadow = true;
    this.texture = null;
    /** @type {THREE.Mesh|null} */
    this.mesh = null;
    this._builtGeom = null;
    this._builtMat = null;
  }

  awake() { this.rebuild(); }
  onDestroy() {
    this.mesh?.removeFromParent();
    this.mesh?.geometry?.dispose();
    if (Array.isArray(this.mesh?.material)) this.mesh.material.forEach((m) => m.dispose());
    else this.mesh?.material?.dispose();
  }

  rebuild() {
    const geom = createGeometry(this.geometryType, this.geometryParams);
    const mat = this._createMaterial();
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh.geometry = geom;
      this.mesh.material = mat;
    } else {
      this.mesh = new THREE.Mesh(geom, mat);
      this.mesh.userData.gameObject = this.gameObject;
      this.transform.object3D.add(this.mesh);
    }
    this.mesh.castShadow = this.castShadow;
    this.mesh.receiveShadow = this.receiveShadow;
    this._builtGeom = this.geometryType;
    this._builtMat = this.materialType;
  }

  _createMaterial() {
    const opts = {
      color: this.color.clone(),
      wireframe: this.wireframe,
      transparent: this.opacity < 1,
      opacity: this.opacity,
      side: THREE.FrontSide,
    };
    if (this.texture) opts.map = this.texture;
    switch (this.materialType) {
      case 'physical': return new THREE.MeshPhysicalMaterial({ ...opts, metalness: this.metalness, roughness: this.roughness, emissive: this.emissive.clone(), emissiveIntensity: this.emissiveIntensity, clearcoat: 0.3 });
      case 'phong': return new THREE.MeshPhongMaterial({ ...opts, shininess: (1 - this.roughness) * 100, emissive: this.emissive.clone() });
      case 'lambert': return new THREE.MeshLambertMaterial({ ...opts, emissive: this.emissive.clone() });
      case 'basic': return new THREE.MeshBasicMaterial(opts);
      case 'toon': return new THREE.MeshToonMaterial({ ...opts });
      case 'normal': return new THREE.MeshNormalMaterial({ wireframe: this.wireframe, transparent: opts.transparent, opacity: this.opacity });
      default: return new THREE.MeshStandardMaterial({ ...opts, metalness: this.metalness, roughness: this.roughness, emissive: this.emissive.clone(), emissiveIntensity: this.emissiveIntensity });
    }
  }

  /** Обновить параметры материала без полной пересборки */
  applyMaterial() {
    if (!this.mesh) return;
    if (this._builtGeom !== this.geometryType || this._builtMat !== this.materialType) { this.rebuild(); return; }
    const m = this.mesh.material;
    m.color?.copy(this.color);
    if (m.emissive) { m.emissive.copy(this.emissive); m.emissiveIntensity = this.emissiveIntensity; }
    if (m.metalness !== undefined) m.metalness = this.metalness;
    if (m.roughness !== undefined) m.roughness = this.roughness;
    m.wireframe = this.wireframe;
    m.opacity = this.opacity;
    m.transparent = this.opacity < 1;
    m.needsUpdate = true;
    this.mesh.castShadow = this.castShadow;
    this.mesh.receiveShadow = this.receiveShadow;
  }

  setColor(c) { this.color.set(c); this.applyMaterial(); return this; }

  serialize() {
    const d = super.serialize();
    d.color = '#' + this.color.getHexString();
    d.emissive = '#' + this.emissive.getHexString();
    d.geometryParams = { ...this.geometryParams };
    return d;
  }
  deserialize(data) {
    super.deserialize(data);
    if (data?.color) this.color.set(data.color);
    if (data?.emissive) this.emissive.set(data.emissive);
    if (data?.geometryParams) this.geometryParams = { ...data.geometryParams };
    return this;
  }
  onDeserialized() { if (this.mesh) this.rebuild(); }
}
registerComponent(MeshRenderer);

/** Отрисовка загруженной модели (glTF и т.п.) */
export class ModelRenderer extends Component {
  static componentName = 'ModelRenderer';
  static inspector = {
    assetKey: { type: 'string', default: '', label: 'Ключ ассета' },
    castShadow: { type: 'boolean', default: true, label: 'Отбрасывать тень' },
    receiveShadow: { type: 'boolean', default: true, label: 'Принимать тень' },
  };
  constructor() {
    super();
    this.assetKey = '';
    this.castShadow = true;
    this.receiveShadow = true;
    this.root = null;
    this.mixer = null;
    this.animations = [];
  }
  awake() { if (this.assetKey) this.load(this.assetKey); }
  async load(key) {
    this.assetKey = key;
    const assets = this.engine?.assets;
    if (!assets) return;
    const gltf = await assets.load(key);
    if (!gltf) return;
    this.setModel(gltf);
  }
  setModel(gltf) {
    const obj = gltf.scene ? gltf.scene.clone(true) : gltf.clone?.(true) ?? gltf;
    this.root?.removeFromParent();
    this.root = obj;
    obj.traverse((o) => {
      if (o.isMesh) { o.castShadow = this.castShadow; o.receiveShadow = this.receiveShadow; }
      o.userData.gameObject = this.gameObject;
    });
    this.transform.object3D.add(obj);
    this.animations = gltf.animations ?? [];
    if (this.animations.length) {
      this.mixer = new THREE.AnimationMixer(obj);
    }
  }
  play(nameOrIndex = 0, loop = true) {
    if (!this.mixer) return null;
    const clip = typeof nameOrIndex === 'number'
      ? this.animations[nameOrIndex]
      : THREE.AnimationClip.findByName(this.animations, nameOrIndex);
    if (!clip) return null;
    const action = this.mixer.clipAction(clip);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.reset().play();
    return action;
  }
  update(dt) { this.mixer?.update(dt); }
  onDestroy() { this.root?.removeFromParent(); }
}
registerComponent(ModelRenderer);

/** Спрайт (билборд или плоский) */
export class SpriteRenderer extends Component {
  static componentName = 'SpriteRenderer';
  static inspector = {
    color: { type: 'color', default: '#ffffff', label: 'Цвет' },
    size: { type: 'number', default: 1, min: 0.01, step: 0.1, label: 'Размер' },
    billboard: { type: 'boolean', default: true, label: 'Билборд' },
    textureKey: { type: 'string', default: '', label: 'Текстура' },
  };
  constructor() {
    super();
    this.color = new THREE.Color(0xffffff);
    this.size = 1;
    this.billboard = true;
    this.textureKey = '';
    this.sprite = null;
  }
  awake() {
    const mat = new THREE.SpriteMaterial({ color: this.color.clone(), transparent: true });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.scale.setScalar(this.size);
    this.transform.object3D.add(this.sprite);
    if (this.textureKey) this.setTexture(this.textureKey);
  }
  async setTexture(key) {
    const tex = await this.engine?.assets?.load(key);
    if (tex && this.sprite) { this.sprite.material.map = tex; this.sprite.material.needsUpdate = true; }
  }
  update() {
    if (!this.sprite) return;
    this.sprite.material.color.copy(this.color);
    this.sprite.scale.setScalar(this.size);
  }
  onDestroy() { this.sprite?.removeFromParent(); this.sprite?.material?.dispose(); }
  serialize() { const d = super.serialize(); d.color = '#' + this.color.getHexString(); return d; }
  deserialize(data) { super.deserialize(data); if (data?.color) this.color.set(data.color); return this; }
}
registerComponent(SpriteRenderer);

// ---------- Система частиц ----------
export class ParticleSystem extends Component {
  static componentName = 'ParticleSystem';
  static inspector = {
    maxParticles: { type: 'number', default: 500, min: 1, max: 20000, step: 50, label: 'Макс. частиц' },
    emissionRate: { type: 'number', default: 60, min: 0, step: 1, label: 'Частиц/сек' },
    lifetime: { type: 'number', default: 2, min: 0.05, step: 0.1, label: 'Время жизни' },
    startSpeed: { type: 'number', default: 3, step: 0.1, label: 'Нач. скорость' },
    startSize: { type: 'number', default: 0.2, min: 0.001, step: 0.01, label: 'Нач. размер' },
    endSize: { type: 'number', default: 0, min: 0, step: 0.01, label: 'Кон. размер' },
    startColor: { type: 'color', default: '#ffb457', label: 'Нач. цвет' },
    endColor: { type: 'color', default: '#ff2d2d', label: 'Кон. цвет' },
    gravityModifier: { type: 'number', default: 0, step: 0.1, label: 'Гравитация' },
    spread: { type: 'number', default: 25, min: 0, max: 180, step: 1, label: 'Разброс°' },
    loop: { type: 'boolean', default: true, label: 'Зациклено' },
    playOnAwake: { type: 'boolean', default: true, label: 'Старт при запуске' },
    worldSpace: { type: 'boolean', default: true, label: 'Мировые координаты' },
    additive: { type: 'boolean', default: true, label: 'Аддитивное смешивание' },
  };

  constructor() {
    super();
    this.maxParticles = 500;
    this.emissionRate = 60;
    this.lifetime = 2;
    this.startSpeed = 3;
    this.startSize = 0.2;
    this.endSize = 0;
    this.startColor = new THREE.Color(0xffb457);
    this.endColor = new THREE.Color(0xff2d2d);
    this.gravityModifier = 0;
    this.spread = 25;
    this.loop = true;
    this.playOnAwake = true;
    this.worldSpace = true;
    this.additive = true;
    this.duration = 5;
    this._playing = false;
    this._emitAccum = 0;
    this._elapsed = 0;
    this._points = null;
    this._data = null;
  }

  awake() {
    this._allocate();
    if (this.playOnAwake) this.play();
  }

  _allocate() {
    const n = this.maxParticles;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geom.setDrawRange(0, 0);

    const mat = new THREE.PointsMaterial({
      size: this.startSize,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: this.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      sizeAttenuation: true,
      map: makeParticleTexture(),
    });

    this._points = new THREE.Points(geom, mat);
    this._points.frustumCulled = false;
    if (this.worldSpace) this.scene?.root.add(this._points);
    else this.transform.object3D.add(this._points);

    this._data = {
      alive: new Uint8Array(n),
      age: new Float32Array(n),
      life: new Float32Array(n),
      vel: new Float32Array(n * 3),
      count: 0,
    };
  }

  play() { this._playing = true; this._elapsed = 0; return this; }
  stop() { this._playing = false; return this; }
  clear() {
    if (!this._data) return this;
    this._data.alive.fill(0);
    this._data.count = 0;
    this._points.geometry.setDrawRange(0, 0);
    return this;
  }

  emit(count = 1) {
    if (!this._data) return;
    const d = this._data;
    const origin = this.worldSpace ? this.transform.position : new THREE.Vector3();
    const dir = this.worldSpace ? this.transform.up : new THREE.Vector3(0, 1, 0);
    const pos = this._points.geometry.attributes.position.array;
    const spreadRad = this.spread * Mathf.Deg2Rad;
    for (let k = 0; k < count; k++) {
      let idx = -1;
      for (let i = 0; i < this.maxParticles; i++) {
        if (!d.alive[i]) { idx = i; break; }
      }
      if (idx < 0) return;
      d.alive[idx] = 1;
      d.age[idx] = 0;
      d.life[idx] = this.lifetime * Random.range(0.7, 1.3);
      pos[idx * 3] = origin.x; pos[idx * 3 + 1] = origin.y; pos[idx * 3 + 2] = origin.z;
      // конус разброса вокруг dir
      const theta = Random.range(0, Math.PI * 2);
      const phi = Random.range(0, spreadRad);
      const local = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      local.applyQuaternion(q).multiplyScalar(this.startSpeed * Random.range(0.6, 1.2));
      d.vel[idx * 3] = local.x; d.vel[idx * 3 + 1] = local.y; d.vel[idx * 3 + 2] = local.z;
      d.count = Math.max(d.count, idx + 1);
    }
  }

  update(dt) {
    if (!this._data) return;
    const d = this._data;
    if (this._playing) {
      this._elapsed += dt;
      if (!this.loop && this._elapsed > this.duration) this._playing = false;
      this._emitAccum += this.emissionRate * dt;
      const n = Math.floor(this._emitAccum);
      if (n > 0) { this._emitAccum -= n; this.emit(n); }
    }
    const geom = this._points.geometry;
    const pos = geom.attributes.position.array;
    const col = geom.attributes.color.array;
    const siz = geom.attributes.size.array;
    const g = (this.engine?.physics?.gravity.y ?? -9.81) * this.gravityModifier;
    let maxIdx = 0;
    for (let i = 0; i < d.count; i++) {
      if (!d.alive[i]) { siz[i] = 0; continue; }
      d.age[i] += dt;
      if (d.age[i] >= d.life[i]) { d.alive[i] = 0; siz[i] = 0; continue; }
      d.vel[i * 3 + 1] += g * dt;
      pos[i * 3] += d.vel[i * 3] * dt;
      pos[i * 3 + 1] += d.vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += d.vel[i * 3 + 2] * dt;
      const t = d.age[i] / d.life[i];
      const c = this.startColor.clone().lerp(this.endColor, t);
      const fade = 1 - t;
      col[i * 3] = c.r * fade; col[i * 3 + 1] = c.g * fade; col[i * 3 + 2] = c.b * fade;
      siz[i] = Mathf.lerp(this.startSize, this.endSize, t);
      maxIdx = i + 1;
    }
    geom.setDrawRange(0, maxIdx);
    geom.attributes.position.needsUpdate = true;
    geom.attributes.color.needsUpdate = true;
    geom.attributes.size.needsUpdate = true;
    this._points.material.size = this.startSize;
    this._points.material.blending = this.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
  }

  onDestroy() {
    this._points?.removeFromParent();
    this._points?.geometry.dispose();
    this._points?.material.dispose();
  }

  serialize() {
    const d = super.serialize();
    d.startColor = '#' + this.startColor.getHexString();
    d.endColor = '#' + this.endColor.getHexString();
    return d;
  }
  deserialize(data) {
    super.deserialize(data);
    if (data?.startColor) this.startColor.set(data.startColor);
    if (data?.endColor) this.endColor.set(data.endColor);
    return this;
  }
}
registerComponent(ParticleSystem);

let _particleTex = null;
function makeParticleTexture() {
  if (_particleTex) return _particleTex;
  // Без DOM (например, при headless-сериализации сцены) текстуру не создаём
  if (typeof document === 'undefined') return null;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);
  _particleTex = new THREE.CanvasTexture(canvas);
  return _particleTex;
}

/** Скайбокс / процедурное небо */
export class Skybox extends Component {
  static componentName = 'Skybox';
  static allowMultiple = false;
  static inspector = {
    topColor: { type: 'color', default: '#3a6ea5', label: 'Цвет неба' },
    bottomColor: { type: 'color', default: '#0d1017', label: 'Цвет горизонта' },
    offset: { type: 'number', default: 20, step: 1, label: 'Смещение' },
    exponent: { type: 'number', default: 0.6, min: 0.05, max: 4, step: 0.05, label: 'Экспонента' },
  };
  constructor() {
    super();
    this.topColor = new THREE.Color(0x3a6ea5);
    this.bottomColor = new THREE.Color(0x0d1017);
    this.offset = 20;
    this.exponent = 0.6;
    this.mesh = null;
  }
  awake() {
    const uniforms = {
      topColor: { value: this.topColor },
      bottomColor: { value: this.bottomColor },
      offset: { value: this.offset },
      exponent: { value: this.exponent },
    };
    const geo = new THREE.SphereGeometry(900, 32, 16);
    const mat = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 vWorldPosition;
        void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWorldPosition = wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);}`,
      fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; uniform float offset; uniform float exponent;
        varying vec3 vWorldPosition;
        void main(){ float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h,0.0), exponent), 0.0)), 1.0);}`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.scene?.root.add(this.mesh);
  }
  update() {
    if (!this.mesh) return;
    const u = this.mesh.material.uniforms;
    u.topColor.value.copy(this.topColor);
    u.bottomColor.value.copy(this.bottomColor);
    u.offset.value = this.offset;
    u.exponent.value = this.exponent;
  }
  onDestroy() { this.mesh?.removeFromParent(); this.mesh?.geometry.dispose(); this.mesh?.material.dispose(); }
  serialize() {
    const d = super.serialize();
    d.topColor = '#' + this.topColor.getHexString();
    d.bottomColor = '#' + this.bottomColor.getHexString();
    return d;
  }
  deserialize(data) {
    super.deserialize(data);
    if (data?.topColor) this.topColor.set(data.topColor);
    if (data?.bottomColor) this.bottomColor.set(data.bottomColor);
    return this;
  }
}
registerComponent(Skybox);

/** Terrain — процедурный ландшафт из шума */
export class Terrain extends Component {
  static componentName = 'Terrain';
  static inspector = {
    width: { type: 'number', default: 100, min: 1, step: 1, label: 'Ширина' },
    depth: { type: 'number', default: 100, min: 1, step: 1, label: 'Глубина' },
    resolution: { type: 'number', default: 96, min: 2, max: 512, step: 1, label: 'Детализация' },
    heightScale: { type: 'number', default: 6, step: 0.5, label: 'Высота' },
    noiseScale: { type: 'number', default: 0.04, min: 0.001, step: 0.005, label: 'Масштаб шума' },
    octaves: { type: 'number', default: 4, min: 1, max: 8, step: 1, label: 'Октавы' },
    color: { type: 'color', default: '#4a6741', label: 'Цвет' },
    seed: { type: 'number', default: 1337, step: 1, label: 'Сид' },
  };
  constructor() {
    super();
    this.width = 100; this.depth = 100; this.resolution = 96;
    this.heightScale = 6; this.noiseScale = 0.04; this.octaves = 4;
    this.color = new THREE.Color(0x4a6741);
    this.seed = 1337;
    this.mesh = null;
    this._heights = null;
  }
  awake() { this.generate(); }
  generate() {
    const res = Math.max(2, Math.floor(this.resolution));
    const geom = new THREE.PlaneGeometry(this.width, this.depth, res, res);
    geom.rotateX(-Math.PI / 2);
    const pos = geom.attributes.position;
    const heights = new Float32Array(pos.count);
    const off = this.seed * 0.137;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = Noise.fbm((x + off) * this.noiseScale, (z + off) * this.noiseScale, this.octaves) * this.heightScale;
      pos.setY(i, h);
      heights[i] = h;
    }
    geom.computeVertexNormals();
    this._heights = heights;
    const mat = new THREE.MeshStandardMaterial({ color: this.color.clone(), roughness: 0.95, metalness: 0, flatShading: false });
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = geom;
      this.mesh.material.color.copy(this.color);
    } else {
      this.mesh = new THREE.Mesh(geom, mat);
      this.mesh.receiveShadow = true;
      this.mesh.castShadow = false;
      this.mesh.userData.gameObject = this.gameObject;
      this.transform.object3D.add(this.mesh);
    }
    return this;
  }
  /** Высота ландшафта в мировой точке */
  sampleHeight(x, z) {
    const off = this.seed * 0.137;
    const lx = x - this.transform.position.x;
    const lz = z - this.transform.position.z;
    return Noise.fbm((lx + off) * this.noiseScale, (lz + off) * this.noiseScale, this.octaves)
      * this.heightScale + this.transform.position.y;
  }
  onDestroy() { this.mesh?.removeFromParent(); this.mesh?.geometry.dispose(); this.mesh?.material.dispose(); }
  serialize() { const d = super.serialize(); d.color = '#' + this.color.getHexString(); return d; }
  deserialize(data) { super.deserialize(data); if (data?.color) this.color.set(data.color); return this; }
  onDeserialized() { if (this.mesh) this.generate(); }
}
registerComponent(Terrain);
