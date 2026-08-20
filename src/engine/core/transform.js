// WFL Engine — Transform поверх THREE.Object3D
import * as THREE from 'three';
import { Mathf } from './math.js';

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();

export class Transform {
  /** @param {import('./gameobject.js').GameObject} gameObject */
  constructor(gameObject) {
    this.gameObject = gameObject;
    /** @type {THREE.Object3D} */
    this.object3D = new THREE.Group();
    this.object3D.name = gameObject.name;
    this.object3D.userData.gameObject = gameObject;
    /** @type {Transform|null} */
    this.parent = null;
    /** @type {Transform[]} */
    this.children = [];
  }

  // ---- Локальные ----
  get localPosition() { return this.object3D.position; }
  set localPosition(v) { this.object3D.position.copy(v); }
  get localRotation() { return this.object3D.quaternion; }
  set localRotation(q) { this.object3D.quaternion.copy(q); }
  get localScale() { return this.object3D.scale; }
  set localScale(v) {
    if (typeof v === 'number') this.object3D.scale.setScalar(v);
    else this.object3D.scale.copy(v);
  }
  /** Углы Эйлера в градусах (Unity-стиль) */
  get localEulerAngles() {
    _e.setFromQuaternion(this.object3D.quaternion, 'YXZ');
    return new THREE.Vector3(_e.x * Mathf.Rad2Deg, _e.y * Mathf.Rad2Deg, _e.z * Mathf.Rad2Deg);
  }
  set localEulerAngles(v) {
    this.object3D.quaternion.setFromEuler(new THREE.Euler(
      v.x * Mathf.Deg2Rad, v.y * Mathf.Deg2Rad, v.z * Mathf.Deg2Rad, 'YXZ'));
  }

  // ---- Мировые ----
  get position() {
    this.object3D.updateWorldMatrix(true, false);
    return this.object3D.getWorldPosition(new THREE.Vector3());
  }
  set position(v) {
    if (this.object3D.parent) {
      this.object3D.parent.updateWorldMatrix(true, false);
      _v.copy(v);
      this.object3D.parent.worldToLocal(_v);
      this.object3D.position.copy(_v);
    } else this.object3D.position.copy(v);
  }
  get rotation() {
    this.object3D.updateWorldMatrix(true, false);
    return this.object3D.getWorldQuaternion(new THREE.Quaternion());
  }
  set rotation(q) {
    if (this.object3D.parent) {
      this.object3D.parent.updateWorldMatrix(true, false);
      this.object3D.parent.getWorldQuaternion(_q).invert();
      this.object3D.quaternion.copy(_q.multiply(q));
    } else this.object3D.quaternion.copy(q);
  }
  get eulerAngles() {
    _e.setFromQuaternion(this.rotation, 'YXZ');
    return new THREE.Vector3(_e.x * Mathf.Rad2Deg, _e.y * Mathf.Rad2Deg, _e.z * Mathf.Rad2Deg);
  }
  set eulerAngles(v) {
    this.rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      v.x * Mathf.Deg2Rad, v.y * Mathf.Deg2Rad, v.z * Mathf.Deg2Rad, 'YXZ'));
  }
  get lossyScale() {
    this.object3D.updateWorldMatrix(true, false);
    return this.object3D.getWorldScale(new THREE.Vector3());
  }

  // ---- Направления ----
  get forward() { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.rotation); }
  set forward(v) { this.rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), v.clone().normalize()); }
  get right() { return new THREE.Vector3(1, 0, 0).applyQuaternion(this.rotation); }
  get up() { return new THREE.Vector3(0, 1, 0).applyQuaternion(this.rotation); }

  get localToWorldMatrix() { this.object3D.updateWorldMatrix(true, false); return this.object3D.matrixWorld.clone(); }
  get worldToLocalMatrix() { return this.localToWorldMatrix.invert(); }

  // ---- Операции ----
  translate(x, y, z, relativeTo = 'self') {
    const v = x instanceof THREE.Vector3 ? x.clone() : new THREE.Vector3(x, y, z);
    if (typeof y === 'string') relativeTo = y;
    if (relativeTo === 'world') this.position = this.position.add(v);
    else this.object3D.position.add(v.applyQuaternion(this.object3D.quaternion));
    return this;
  }

  rotate(x, y, z, relativeTo = 'self') {
    const v = x instanceof THREE.Vector3 ? x.clone() : new THREE.Vector3(x, y, z);
    if (typeof y === 'string') relativeTo = y;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      v.x * Mathf.Deg2Rad, v.y * Mathf.Deg2Rad, v.z * Mathf.Deg2Rad, 'YXZ'));
    if (relativeTo === 'world') this.rotation = q.multiply(this.rotation);
    else this.object3D.quaternion.multiply(q);
    return this;
  }

  rotateAround(point, axis, angleDeg) {
    const pos = this.position;
    const q = new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), angleDeg * Mathf.Deg2Rad);
    const dir = pos.clone().sub(point).applyQuaternion(q);
    this.position = point.clone().add(dir);
    this.rotation = q.multiply(this.rotation);
    return this;
  }

  lookAt(target, up = new THREE.Vector3(0, 1, 0)) {
    const t = target?.isVector3 ? target : (target?.position ?? target?.transform?.position);
    if (!t) return this;
    _m.lookAt(this.position, t, up);
    this.rotation = new THREE.Quaternion().setFromRotationMatrix(_m);
    return this;
  }

  transformPoint(p) { return p.clone().applyMatrix4(this.localToWorldMatrix); }
  inverseTransformPoint(p) { return p.clone().applyMatrix4(this.worldToLocalMatrix); }
  transformDirection(d) { return d.clone().applyQuaternion(this.rotation); }
  inverseTransformDirection(d) { return d.clone().applyQuaternion(this.rotation.invert()); }

  // ---- Иерархия ----
  setParent(parent, worldPositionStays = true) {
    const worldPos = worldPositionStays ? this.position : null;
    const worldRot = worldPositionStays ? this.rotation : null;
    const worldScale = worldPositionStays ? this.lossyScale : null;

    if (this.parent) {
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
    }
    this.parent = parent || null;

    if (parent) {
      parent.children.push(this);
      parent.object3D.add(this.object3D);
      if (this.gameObject.scene !== parent.gameObject.scene) {
        parent.gameObject.scene?._adopt(this.gameObject);
      }
    } else {
      const scene = this.gameObject.scene;
      if (scene) scene.root.add(this.object3D);
      else this.object3D.removeFromParent();
    }

    if (worldPositionStays) {
      this.position = worldPos;
      this.rotation = worldRot;
      const parentScale = parent ? parent.lossyScale : new THREE.Vector3(1, 1, 1);
      this.object3D.scale.set(
        worldScale.x / (parentScale.x || 1),
        worldScale.y / (parentScale.y || 1),
        worldScale.z / (parentScale.z || 1));
    }
    return this;
  }

  get childCount() { return this.children.length; }
  getChild(i) { return this.children[i]; }
  find(path) {
    const parts = String(path).split('/').filter(Boolean);
    let cur = this;
    for (const part of parts) {
      cur = cur.children.find((c) => c.gameObject.name === part);
      if (!cur) return null;
    }
    return cur;
  }
  detachChildren() {
    for (const c of [...this.children]) c.setParent(null);
  }
  get root() { let t = this; while (t.parent) t = t.parent; return t; }
  isChildOf(other) { let t = this.parent; while (t) { if (t === other) return true; t = t.parent; } return false; }
}
