// WFL Engine — физические компоненты: Rigidbody, коллайдеры, CharacterController
import * as THREE from 'three';
import { Component, registerComponent } from '../core/component.js';
import { Mathf } from '../core/math.js';
import { RaycastHit, PhysicsMaterial } from './physics.js';

const _v = new THREE.Vector3();

export class Rigidbody extends Component {
  static componentName = 'Rigidbody';
  static allowMultiple = false;
  static inspector = {
    mass: { type: 'number', default: 1, min: 0.001, step: 0.1, label: 'Масса' },
    drag: { type: 'number', default: 0.02, min: 0, step: 0.01, label: 'Сопротивление' },
    angularDrag: { type: 'number', default: 0.05, min: 0, step: 0.01, label: 'Угл. сопротивление' },
    useGravity: { type: 'boolean', default: true, label: 'Гравитация' },
    gravityScale: { type: 'number', default: 1, step: 0.1, label: 'Множ. гравитации' },
    isKinematic: { type: 'boolean', default: false, label: 'Кинематическое' },
    allowSleep: { type: 'boolean', default: true, label: 'Может засыпать' },
    freezePositionX: { type: 'boolean', default: false, label: 'Заморозить X' },
    freezePositionY: { type: 'boolean', default: false, label: 'Заморозить Y' },
    freezePositionZ: { type: 'boolean', default: false, label: 'Заморозить Z' },
    freezeRotationX: { type: 'boolean', default: false, label: 'Заморозить вращ. X' },
    freezeRotationY: { type: 'boolean', default: false, label: 'Заморозить вращ. Y' },
    freezeRotationZ: { type: 'boolean', default: false, label: 'Заморозить вращ. Z' },
  };

  constructor() {
    super();
    this.mass = 1;
    this.drag = 0.02;
    this.angularDrag = 0.05;
    this.useGravity = true;
    this.gravityScale = 1;
    this.isKinematic = false;
    this.allowSleep = true;
    this.maxSpeed = Infinity;
    this.velocity = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3();
    this.freezePositionX = false; this.freezePositionY = false; this.freezePositionZ = false;
    this.freezeRotationX = false; this.freezeRotationY = false; this.freezeRotationZ = false;
    this._force = new THREE.Vector3();
    this._torque = new THREE.Vector3();
    this._prevPosition = new THREE.Vector3();
    this._sleepTimer = 0;
    this.sleeping = false;
  }

  get inverseMass() { return this.isKinematic || this.mass <= 0 ? 0 : 1 / this.mass; }
  get position() { return this.transform.position; }
  set position(v) { this.transform.position = v; }
  get speed() { return this.velocity.length(); }

  onEnable() { this.engine?.physics?.addBody(this); }
  onDisable() { this.engine?.physics?.removeBody(this); }
  onDestroy() { this.engine?.physics?.removeBody(this); }

  addForce(force, mode = 'force') {
    this.wakeUp();
    if (mode === 'impulse') this.velocity.addScaledVector(force, this.inverseMass);
    else if (mode === 'velocityChange') this.velocity.add(force);
    else if (mode === 'acceleration') this._force.addScaledVector(force, this.mass);
    else this._force.add(force);
    return this;
  }

  addTorque(torque, mode = 'force') {
    this.wakeUp();
    if (mode === 'impulse') this.angularVelocity.addScaledVector(torque, this.inverseMass);
    else this._torque.add(torque);
    return this;
  }

  addForceAtPosition(force, position, mode = 'force') {
    this.addForce(force, mode);
    const r = _v.copy(position).sub(this.transform.position);
    this.addTorque(new THREE.Vector3().crossVectors(r, force), mode);
    return this;
  }

  addExplosionForce(power, center, radius, upModifier = 0) {
    const pos = this.transform.position;
    const dir = pos.clone().sub(center);
    const dist = dir.length();
    if (dist > radius) return this;
    dir.y += upModifier;
    const falloff = 1 - Mathf.clamp01(dist / radius);
    this.addForce(dir.normalize().multiplyScalar(power * falloff), 'impulse');
    return this;
  }

  movePosition(p) { this.transform.position = p; this.wakeUp(); return this; }
  moveRotation(q) { this.transform.rotation = q; this.wakeUp(); return this; }
  wakeUp() { this.sleeping = false; this._sleepTimer = 0; return this; }
  sleep() { this.sleeping = true; this.velocity.set(0, 0, 0); this.angularVelocity.set(0, 0, 0); return this; }

  serialize() {
    const d = super.serialize();
    d.velocity = this.velocity.toArray();
    return d;
  }
  deserialize(data) {
    super.deserialize(data);
    if (data?.velocity) this.velocity.fromArray(data.velocity);
    return this;
  }
}
registerComponent(Rigidbody);

// ---------- Коллайдеры ----------
export class Collider extends Component {
  static componentName = 'Collider';
  static inspector = {
    isTrigger: { type: 'boolean', default: false, label: 'Триггер' },
    center: { type: 'vector3', default: [0, 0, 0], label: 'Центр' },
  };

  constructor() {
    super();
    this.shape = 'box';
    this.isTrigger = false;
    this.center = new THREE.Vector3();
    this.material = new PhysicsMaterial();
    this.bounds = new THREE.Box3();
    this.worldCenter = new THREE.Vector3();
    this.worldMatrix = new THREE.Matrix4();
    this.worldMatrixInverse = new THREE.Matrix4();
    /** @type {Rigidbody|null} */
    this.attachedRigidbody = null;
  }

  awake() {
    this.attachedRigidbody = this.getComponent(Rigidbody) ?? this.getComponentInParent(Rigidbody);
    this.updateBounds();
  }
  // Регистрация именно в onEnable/onDisable (контракт Unity): awake срабатывает
  // один раз, поэтому после physics.clear() при перезапуске сцены коллайдер
  // больше не вернулся бы в мир — и объекты проваливались бы сквозь пол.
  onEnable() {
    if (!this.attachedRigidbody) {
      this.attachedRigidbody = this.getComponent(Rigidbody) ?? this.getComponentInParent(Rigidbody);
    }
    this.engine?.physics?.addCollider(this);
    this.updateBounds();
  }
  onDisable() { this.engine?.physics?.removeCollider(this); }
  onDestroy() { this.engine?.physics?.removeCollider(this); }

  updateBounds() { /* переопределяется */ }
  raycast(origin, dir, maxDistance) { return null; }

  _computeWorldMatrix(overrideCenter = null) {
    const t = this.transform;
    if (!t) return;
    const m = t.localToWorldMatrix;
    const offset = new THREE.Matrix4().makeTranslation(this.center.x, this.center.y, this.center.z);
    this.worldMatrix.multiplyMatrices(m, offset);
    if (overrideCenter) this.worldCenter.copy(overrideCenter);
    else this.worldCenter.setFromMatrixPosition(this.worldMatrix);
    this.worldMatrixInverse.copy(this.worldMatrix).invert();
  }
}

export class BoxCollider extends Collider {
  static componentName = 'BoxCollider';
  static inspector = {
    ...Collider.inspector,
    size: { type: 'vector3', default: [1, 1, 1], label: 'Размер' },
  };

  constructor() {
    super();
    this.shape = 'box';
    this.size = new THREE.Vector3(1, 1, 1);
    this.halfExtents = new THREE.Vector3(0.5, 0.5, 0.5);
    this._obb = { center: new THREE.Vector3(), axes: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], halfExtents: new THREE.Vector3() };
  }

  updateBounds(overrideCenter = null) {
    this._computeWorldMatrix(overrideCenter);
    const scale = this.transform.lossyScale;
    this.halfExtents.set(
      Math.abs(this.size.x * scale.x) * 0.5,
      Math.abs(this.size.y * scale.y) * 0.5,
      Math.abs(this.size.z * scale.z) * 0.5);
    // AABB, охватывающий повёрнутый бокс
    const rot = new THREE.Matrix3().setFromMatrix4(this.worldMatrix);
    const e = this.halfExtents;
    const ax = new THREE.Vector3(1, 0, 0).applyMatrix3(rot).normalize();
    const ay = new THREE.Vector3(0, 1, 0).applyMatrix3(rot).normalize();
    const az = new THREE.Vector3(0, 0, 1).applyMatrix3(rot).normalize();
    const ext = new THREE.Vector3(
      Math.abs(ax.x) * e.x + Math.abs(ay.x) * e.y + Math.abs(az.x) * e.z,
      Math.abs(ax.y) * e.x + Math.abs(ay.y) * e.y + Math.abs(az.y) * e.z,
      Math.abs(ax.z) * e.x + Math.abs(ay.z) * e.y + Math.abs(az.z) * e.z);
    this.bounds.set(this.worldCenter.clone().sub(ext), this.worldCenter.clone().add(ext));
    this._obb.center.copy(this.worldCenter);
    this._obb.axes[0].copy(ax); this._obb.axes[1].copy(ay); this._obb.axes[2].copy(az);
    this._obb.halfExtents.copy(e);
  }

  getOBB(overrideCenter = null) {
    if (overrideCenter) {
      return { center: overrideCenter, axes: this._obb.axes, halfExtents: this._obb.halfExtents };
    }
    return this._obb;
  }

  raycast(origin, dir, maxDistance) {
    const lo = origin.clone().applyMatrix4(this.worldMatrixInverse);
    const ld = dir.clone().transformDirection(this.worldMatrixInverse);
    const scale = this.transform.lossyScale;
    const he = new THREE.Vector3(this.size.x * 0.5, this.size.y * 0.5, this.size.z * 0.5);
    let tmin = 0, tmax = maxDistance;
    let hitAxis = 0, hitSign = 1;
    for (let i = 0; i < 3; i++) {
      const axis = ['x', 'y', 'z'][i];
      const d = ld[axis], o = lo[axis], h = he[axis];
      if (Math.abs(d) < 1e-8) { if (o < -h || o > h) return null; continue; }
      let t1 = (-h - o) / d, t2 = (h - o) / d;
      let sign = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sign = 1; }
      if (t1 > tmin) { tmin = t1; hitAxis = i; hitSign = sign; }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    if (tmin > maxDistance) return null;
    const hit = new RaycastHit();
    hit.distance = tmin;
    hit.point.copy(origin).addScaledVector(dir, tmin);
    const n = new THREE.Vector3();
    n[['x', 'y', 'z'][hitAxis]] = hitSign;
    hit.normal.copy(n.transformDirection(this.worldMatrix).normalize());
    hit.collider = this;
    hit.rigidbody = this.attachedRigidbody;
    hit.gameObject = this.gameObject;
    return hit;
  }
}
registerComponent(BoxCollider);

export class SphereCollider extends Collider {
  static componentName = 'SphereCollider';
  static inspector = {
    ...Collider.inspector,
    radius: { type: 'number', default: 0.5, min: 0.001, step: 0.05, label: 'Радиус' },
  };

  constructor() {
    super();
    this.shape = 'sphere';
    this.radius = 0.5;
    this.worldRadius = 0.5;
  }

  updateBounds(overrideCenter = null) {
    this._computeWorldMatrix(overrideCenter);
    const s = this.transform.lossyScale;
    this.worldRadius = this.radius * Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z));
    const r = this.worldRadius;
    this.bounds.set(
      this.worldCenter.clone().subScalar(r),
      this.worldCenter.clone().addScalar(r));
  }

  raycast(origin, dir, maxDistance) {
    const oc = origin.clone().sub(this.worldCenter);
    const b = oc.dot(dir);
    const c = oc.lengthSq() - this.worldRadius * this.worldRadius;
    if (c > 0 && b > 0) return null;
    const disc = b * b - c;
    if (disc < 0) return null;
    let t = -b - Math.sqrt(disc);
    if (t < 0) t = -b + Math.sqrt(disc);
    if (t < 0 || t > maxDistance) return null;
    const hit = new RaycastHit();
    hit.distance = t;
    hit.point.copy(origin).addScaledVector(dir, t);
    hit.normal.copy(hit.point).sub(this.worldCenter).normalize();
    hit.collider = this;
    hit.rigidbody = this.attachedRigidbody;
    hit.gameObject = this.gameObject;
    return hit;
  }
}
registerComponent(SphereCollider);

export class CapsuleCollider extends Collider {
  static componentName = 'CapsuleCollider';
  static inspector = {
    ...Collider.inspector,
    radius: { type: 'number', default: 0.5, min: 0.01, step: 0.05, label: 'Радиус' },
    height: { type: 'number', default: 2, min: 0.01, step: 0.05, label: 'Высота' },
    direction: { type: 'select', default: 1, options: [0, 1, 2], label: 'Ось (0=X,1=Y,2=Z)' },
  };

  constructor() {
    super();
    this.shape = 'capsule';
    this.radius = 0.5;
    this.height = 2;
    this.direction = 1;
    this.worldRadius = 0.5;
    this._segA = new THREE.Vector3();
    this._segB = new THREE.Vector3();
  }

  updateBounds(overrideCenter = null) {
    this._computeWorldMatrix(overrideCenter);
    const s = this.transform.lossyScale;
    const axes = ['x', 'y', 'z'];
    const radialScale = this.direction === 1 ? Math.max(Math.abs(s.x), Math.abs(s.z))
      : this.direction === 0 ? Math.max(Math.abs(s.y), Math.abs(s.z))
        : Math.max(Math.abs(s.x), Math.abs(s.y));
    this.worldRadius = this.radius * radialScale;
    const axisScale = Math.abs(s[axes[this.direction]]);
    const halfLine = Math.max(0, (this.height * axisScale) * 0.5 - this.worldRadius);
    const dirLocal = new THREE.Vector3();
    dirLocal[axes[this.direction]] = 1;
    const dirWorld = dirLocal.transformDirection(this.worldMatrix).normalize();
    this._segA.copy(this.worldCenter).addScaledVector(dirWorld, -halfLine);
    this._segB.copy(this.worldCenter).addScaledVector(dirWorld, halfLine);
    const r = this.worldRadius;
    this.bounds.makeEmpty();
    this.bounds.expandByPoint(this._segA.clone().subScalar(r));
    this.bounds.expandByPoint(this._segA.clone().addScalar(r));
    this.bounds.expandByPoint(this._segB.clone().subScalar(r));
    this.bounds.expandByPoint(this._segB.clone().addScalar(r));
  }

  getSegment(overrideCenter = null) {
    if (overrideCenter) {
      const delta = overrideCenter.clone().sub(this.worldCenter);
      return { a: this._segA.clone().add(delta), b: this._segB.clone().add(delta) };
    }
    return { a: this._segA, b: this._segB };
  }

  raycast(origin, dir, maxDistance) {
    // приближение: тестируем две сферы и цилиндр через сегмент
    const seg = this.getSegment();
    const r = this.worldRadius;
    let best = null;
    for (const c of [seg.a, seg.b]) {
      const oc = origin.clone().sub(c);
      const b = oc.dot(dir);
      const cc = oc.lengthSq() - r * r;
      const disc = b * b - cc;
      if (disc < 0) continue;
      let t = -b - Math.sqrt(disc);
      if (t < 0) t = -b + Math.sqrt(disc);
      if (t >= 0 && t <= maxDistance && (!best || t < best.t)) best = { t, center: c };
    }
    // цилиндрическая часть
    const ab = seg.b.clone().sub(seg.a);
    const ao = origin.clone().sub(seg.a);
    const abLen2 = ab.lengthSq();
    if (abLen2 > 1e-9) {
      const abd = ab.dot(dir), abao = ab.dot(ao);
      const A = abLen2 - abd * abd;
      const B = abLen2 * ao.dot(dir) - abao * abd;
      const C = abLen2 * ao.lengthSq() - abao * abao - r * r * abLen2;
      if (Math.abs(A) > 1e-9) {
        const disc = B * B - A * C;
        if (disc >= 0) {
          const t = (-B - Math.sqrt(disc)) / A;
          const y = abao + t * abd;
          if (t >= 0 && t <= maxDistance && y >= 0 && y <= abLen2 && (!best || t < best.t)) {
            best = { t, cylinder: true, y: y / abLen2 };
          }
        }
      }
    }
    if (!best) return null;
    const hit = new RaycastHit();
    hit.distance = best.t;
    hit.point.copy(origin).addScaledVector(dir, best.t);
    if (best.cylinder) {
      const axisPoint = seg.a.clone().addScaledVector(ab, best.y);
      hit.normal.copy(hit.point).sub(axisPoint).normalize();
    } else {
      hit.normal.copy(hit.point).sub(best.center).normalize();
    }
    hit.collider = this;
    hit.rigidbody = this.attachedRigidbody;
    hit.gameObject = this.gameObject;
    return hit;
  }
}
registerComponent(CapsuleCollider);

export class PlaneCollider extends Collider {
  static componentName = 'PlaneCollider';
  static inspector = { ...Collider.inspector };
  constructor() {
    super();
    this.shape = 'plane';
    this.worldNormal = new THREE.Vector3(0, 1, 0);
  }
  updateBounds(overrideCenter = null) {
    this._computeWorldMatrix(overrideCenter);
    this.worldNormal.set(0, 1, 0).transformDirection(this.worldMatrix).normalize();
    const big = 1e5;
    this.bounds.set(
      new THREE.Vector3(-big, this.worldCenter.y - 0.1, -big),
      new THREE.Vector3(big, this.worldCenter.y + 0.1, big));
  }
  raycast(origin, dir, maxDistance) {
    const denom = this.worldNormal.dot(dir);
    if (Math.abs(denom) < 1e-8) return null;
    const t = this.worldCenter.clone().sub(origin).dot(this.worldNormal) / denom;
    if (t < 0 || t > maxDistance) return null;
    const hit = new RaycastHit();
    hit.distance = t;
    hit.point.copy(origin).addScaledVector(dir, t);
    hit.normal.copy(this.worldNormal).multiplyScalar(denom < 0 ? 1 : -1);
    hit.collider = this;
    hit.rigidbody = this.attachedRigidbody;
    hit.gameObject = this.gameObject;
    return hit;
  }
}
registerComponent(PlaneCollider);

/** MeshCollider — точный райкаст по треугольникам, коллизия по AABB */
export class MeshCollider extends Collider {
  static componentName = 'MeshCollider';
  static inspector = { ...Collider.inspector, convex: { type: 'boolean', default: false, label: 'Выпуклый' } };
  constructor() {
    super();
    this.shape = 'mesh';
    this.convex = false;
    this._raycaster = new THREE.Raycaster();
    this._mesh = null;
    this.halfExtents = new THREE.Vector3(0.5, 0.5, 0.5);
    this._obb = null;
  }
  awake() {
    super.awake();
    this._mesh = this.transform.object3D.getObjectByProperty('isMesh', true);
  }
  updateBounds(overrideCenter = null) {
    this._computeWorldMatrix(overrideCenter);
    if (!this._mesh) this._mesh = this.transform.object3D.getObjectByProperty('isMesh', true);
    if (this._mesh) {
      this._mesh.updateWorldMatrix(true, false);
      if (!this._mesh.geometry.boundingBox) this._mesh.geometry.computeBoundingBox();
      this.bounds.copy(this._mesh.geometry.boundingBox).applyMatrix4(this._mesh.matrixWorld);
      this.bounds.getCenter(this.worldCenter);
      this.bounds.getSize(this.halfExtents).multiplyScalar(0.5);
    } else {
      this.bounds.setFromCenterAndSize(this.worldCenter, new THREE.Vector3(1, 1, 1));
      this.halfExtents.set(0.5, 0.5, 0.5);
    }
  }
  getOBB(overrideCenter = null) {
    return {
      center: overrideCenter ?? this.worldCenter,
      axes: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
      halfExtents: this.halfExtents,
    };
  }
  raycast(origin, dir, maxDistance) {
    if (!this._mesh) return null;
    this._raycaster.set(origin, dir);
    this._raycaster.far = maxDistance;
    const results = this._raycaster.intersectObject(this._mesh, true);
    if (!results.length) return null;
    const r = results[0];
    const hit = new RaycastHit();
    hit.distance = r.distance;
    hit.point.copy(r.point);
    hit.normal.copy(r.face?.normal ?? new THREE.Vector3(0, 1, 0))
      .transformDirection(r.object.matrixWorld).normalize();
    hit.collider = this;
    hit.rigidbody = this.attachedRigidbody;
    hit.gameObject = this.gameObject;
    hit.triangleIndex = r.faceIndex ?? -1;
    return hit;
  }
}
registerComponent(MeshCollider);

/** CharacterController — движение с скольжением по стенам, ступеньками и гравитацией */
export class CharacterController extends Component {
  static componentName = 'CharacterController';
  static allowMultiple = false;
  static inspector = {
    radius: { type: 'number', default: 0.4, min: 0.05, step: 0.05, label: 'Радиус' },
    height: { type: 'number', default: 1.8, min: 0.1, step: 0.05, label: 'Высота' },
    slopeLimit: { type: 'number', default: 50, min: 0, max: 89, step: 1, label: 'Макс. уклон°' },
    stepOffset: { type: 'number', default: 0.35, min: 0, step: 0.05, label: 'Высота ступени' },
    skinWidth: { type: 'number', default: 0.03, min: 0.001, step: 0.005, label: 'Толщина кожи' },
    gravityScale: { type: 'number', default: 1, step: 0.1, label: 'Множ. гравитации' },
  };

  constructor() {
    super();
    this.radius = 0.4;
    this.height = 1.8;
    this.slopeLimit = 50;
    this.stepOffset = 0.35;
    this.skinWidth = 0.03;
    this.gravityScale = 1;
    this.center = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.isGrounded = false;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.collisionFlags = 0; // 1=sides 2=above 4=below
    this._collider = null;
  }

  awake() {
    this._collider = this.getComponent(CapsuleCollider) ?? this.addComponent(CapsuleCollider);
    this.syncCollider();
  }

  /** Переносит размеры контроллера на его капсульный коллайдер */
  syncCollider() {
    if (!this._collider) return;
    this._collider.radius = this.radius;
    this._collider.height = this.height;
    this._collider.center.copy(this.center);
    this._collider.isTrigger = true; // сами разрешаем коллизии
  }

  /** После загрузки сцены размеры могли измениться — пересинхронизируем */
  onDeserialized() {
    this._collider ??= this.getComponent(CapsuleCollider);
    this.syncCollider();
  }

  /** Перемещение с учётом столкновений; motion — уже умноженное на dt смещение */
  move(motion) {
    const physics = this.engine?.physics;
    if (!physics) { this.transform.position = this.transform.position.add(motion); return 0; }
    this.collisionFlags = 0;
    const t = this.transform;
    let pos = t.position;
    let remaining = motion.clone();

    for (let iter = 0; iter < 4 && remaining.lengthSq() > 1e-10; iter++) {
      const dist = remaining.length();
      const dir = remaining.clone().divideScalar(dist);
      const hit = this._capsuleCast(pos, dir, dist + this.skinWidth, physics);
      if (!hit) { pos.add(remaining); break; }
      const travel = Math.max(0, hit.distance - this.skinWidth);
      pos.addScaledVector(dir, travel);
      const leftover = remaining.clone().sub(dir.clone().multiplyScalar(travel));
      // скольжение вдоль поверхности
      remaining = leftover.sub(hit.normal.clone().multiplyScalar(leftover.dot(hit.normal)));
      const angle = THREE.MathUtils.radToDeg(Math.acos(Mathf.clamp(hit.normal.y, -1, 1)));
      if (hit.normal.y > 0.1 && angle <= this.slopeLimit) this.collisionFlags |= 4;
      else if (hit.normal.y < -0.1) this.collisionFlags |= 2;
      else this.collisionFlags |= 1;
      this.gameObject.sendMessage('onControllerColliderHit', hit);
    }

    t.position = pos;
    // Разрешение проникновений. Пересчитываем bounds от НОВОЙ позиции: иначе
    // worldCenter остаётся с прошлого кадра, и на больших dt (лаг-спайк)
    // выталкивание считается от устаревшей точки — персонаж застревает в полу.
    this._collider.updateBounds();
    const corr = physics.computePenetration(this._collider, this._collider.worldCenter.clone());
    if (corr.lengthSq() > 0) {
      t.position = t.position.add(corr);
      this._collider.updateBounds();
    }
    this._checkGround(physics);
    return this.collisionFlags;
  }

  /** Простое движение с гравитацией (аналог SimpleMove) */
  simpleMove(velocity, dt) {
    const g = this.engine.physics.gravity.clone().multiplyScalar(this.gravityScale);
    if (this.isGrounded && this.velocity.y < 0) this.velocity.y = -2;
    this.velocity.y += g.y * dt;
    const motion = new THREE.Vector3(velocity.x, this.velocity.y, velocity.z).multiplyScalar(dt);
    return this.move(motion);
  }

  jump(force) {
    if (!this.isGrounded) return false;
    this.velocity.y = force;
    this.isGrounded = false;
    return true;
  }

  _capsuleCast(position, dir, distance, physics) {
    // приближение: несколько лучей по капсуле
    const halfLine = Math.max(0, this.height * 0.5 - this.radius);
    const base = position.clone().add(this.center);
    const points = [
      base.clone().add(new THREE.Vector3(0, halfLine, 0)),
      base.clone(),
      base.clone().add(new THREE.Vector3(0, -halfLine, 0)),
    ];
    let best = null;
    const layerMask = ~(1 << 2); // игнор слоя IgnoreRaycast
    for (const p of points) {
      const origin = p.clone().addScaledVector(dir, -this.radius);
      const hit = physics.raycast(origin, dir, distance + this.radius, layerMask, false);
      if (hit && hit.collider !== this._collider) {
        const adjusted = hit.distance - this.radius;
        if (!best || adjusted < best.distance) {
          best = hit;
          best.distance = adjusted;
        }
      }
    }
    return best && best.distance <= distance ? best : null;
  }

  _checkGround(physics) {
    const base = this.transform.position.clone().add(this.center);
    const origin = base.clone().add(new THREE.Vector3(0, -this.height * 0.5 + this.radius, 0));
    const hit = physics.raycast(origin, new THREE.Vector3(0, -1, 0),
      this.radius + this.skinWidth + 0.08, ~(1 << 2), false);
    const wasGrounded = this.isGrounded;
    if (hit && hit.collider !== this._collider) {
      const angle = THREE.MathUtils.radToDeg(Math.acos(Mathf.clamp(hit.normal.y, -1, 1)));
      this.isGrounded = angle <= this.slopeLimit;
      this.groundNormal.copy(hit.normal);
      if (this.isGrounded) this.collisionFlags |= 4;
    } else {
      this.isGrounded = false;
      this.groundNormal.set(0, 1, 0);
    }
    if (!wasGrounded && this.isGrounded) this.gameObject.sendMessage('onLanded');
  }
}
registerComponent(CharacterController);
