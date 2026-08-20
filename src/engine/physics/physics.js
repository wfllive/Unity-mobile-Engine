// WFL Engine — встроенный физический движок (импульсный решатель, AABB/сфера/капсула/меш)
import * as THREE from 'three';
import { Mathf } from '../core/math.js';
import { EventEmitter } from '../core/events.js';

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

export class RaycastHit {
  constructor() {
    this.point = new THREE.Vector3();
    this.normal = new THREE.Vector3();
    this.distance = Infinity;
    this.collider = null;
    this.rigidbody = null;
    this.gameObject = null;
    this.triangleIndex = -1;
  }
}

export class Collision {
  constructor(other, contacts, impulse, relativeVelocity) {
    this.collider = other;
    this.gameObject = other?.gameObject ?? null;
    this.rigidbody = other?.attachedRigidbody ?? null;
    this.contacts = contacts;
    this.impulse = impulse;
    this.relativeVelocity = relativeVelocity;
  }
}

/** Слои столкновений (32 слоя, битовая маска) */
export class LayerMask {
  static names = ['Default', 'TransparentFX', 'IgnoreRaycast', 'Water', 'UI', 'Player', 'Enemy', 'Ground', 'Trigger'];
  static nameToLayer(n) { return LayerMask.names.indexOf(n); }
  static getMask(...names) {
    let m = 0;
    for (const n of names) {
      const i = LayerMask.nameToLayer(n);
      if (i >= 0) m |= 1 << i;
    }
    return m;
  }
  static everything = 0xffffffff;
}

export class PhysicsWorld extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.gravity = opts.gravity ? opts.gravity.clone() : new THREE.Vector3(0, -9.81, 0);
    this.fixedTimeStep = opts.fixedTimeStep ?? 1 / 60;
    this.solverIterations = opts.solverIterations ?? 8;
    this.maxSubSteps = opts.maxSubSteps ?? 4;
    this.sleepThreshold = opts.sleepThreshold ?? 0.02;
    this.sleepTime = opts.sleepTime ?? 0.6;
    this.defaultRestitution = 0.15;
    this.defaultFriction = 0.55;
    /** @type {Collider[]} */
    this.colliders = [];
    /** @type {Rigidbody[]} */
    this.bodies = [];
    /** маска столкновений слоёв: layerCollisionMatrix[a] & (1<<b) */
    this.layerCollisionMatrix = new Uint32Array(32).fill(0xffffffff);
    this._pairs = new Map();
    this._broadphase = new SpatialHash(4);
    this.stats = { colliders: 0, bodies: 0, pairs: 0, contacts: 0, stepMs: 0 };
    this.enabled = true;
  }

  setLayerCollision(a, b, enabled) {
    if (enabled) {
      this.layerCollisionMatrix[a] |= (1 << b);
      this.layerCollisionMatrix[b] |= (1 << a);
    } else {
      this.layerCollisionMatrix[a] &= ~(1 << b);
      this.layerCollisionMatrix[b] &= ~(1 << a);
    }
  }
  _layersCollide(a, b) { return (this.layerCollisionMatrix[a] & (1 << b)) !== 0; }

  addCollider(c) { if (!this.colliders.includes(c)) this.colliders.push(c); }
  removeCollider(c) {
    const i = this.colliders.indexOf(c);
    if (i >= 0) this.colliders.splice(i, 1);
    for (const key of [...this._pairs.keys()]) if (key.includes(c.id)) this._pairs.delete(key);
  }
  addBody(b) { if (!this.bodies.includes(b)) this.bodies.push(b); }
  removeBody(b) {
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
  }

  /** Полная очистка мира (используется при выгрузке сцены) */
  clear() {
    this.colliders.length = 0;
    this.bodies.length = 0;
    this._pairs.clear();
    this._broadphase.clear();
    this.stats.colliders = this.stats.bodies = this.stats.pairs = this.stats.contacts = 0;
  }

  step(dt) {
    if (!this.enabled) return;
    const t0 = performance.now();
    const h = this.fixedTimeStep;

    // 1. Интегрирование сил
    for (const rb of this.bodies) {
      if (rb.isKinematic || !rb.enabled || rb.sleeping) continue;
      if (rb.useGravity) rb.velocity.addScaledVector(this.gravity, rb.gravityScale * h);
      rb.velocity.addScaledVector(rb._force, rb.inverseMass * h);
      rb.angularVelocity.addScaledVector(rb._torque, rb.inverseMass * h);
      rb._force.set(0, 0, 0);
      rb._torque.set(0, 0, 0);
      rb.velocity.multiplyScalar(Math.max(0, 1 - rb.drag * h));
      rb.angularVelocity.multiplyScalar(Math.max(0, 1 - rb.angularDrag * h));
      if (rb.maxSpeed < Infinity && rb.velocity.lengthSq() > rb.maxSpeed ** 2) {
        rb.velocity.setLength(rb.maxSpeed);
      }
    }

    // 2. Интегрирование позиций
    for (const rb of this.bodies) {
      if (!rb.enabled || rb.sleeping) continue;
      const t = rb.transform;
      if (!t) continue;
      if (rb.isKinematic) {
        rb._prevPosition.copy(t.position);
        continue;
      }
      const p = t.position;
      if (!rb.freezePositionX) p.x += rb.velocity.x * h;
      if (!rb.freezePositionY) p.y += rb.velocity.y * h;
      if (!rb.freezePositionZ) p.z += rb.velocity.z * h;
      t.position = p;
      const av = rb.angularVelocity;
      if (av.lengthSq() > 1e-8) {
        const angle = av.length() * h;
        const q = new THREE.Quaternion().setFromAxisAngle(_v1.copy(av).normalize(), angle);
        const cur = t.rotation;
        let next = q.multiply(cur);
        if (rb.freezeRotationX || rb.freezeRotationY || rb.freezeRotationZ) {
          const e = new THREE.Euler().setFromQuaternion(next, 'YXZ');
          const c = new THREE.Euler().setFromQuaternion(cur, 'YXZ');
          if (rb.freezeRotationX) e.x = c.x;
          if (rb.freezeRotationY) e.y = c.y;
          if (rb.freezeRotationZ) e.z = c.z;
          next = new THREE.Quaternion().setFromEuler(e);
        }
        t.rotation = next;
      }
    }

    // 3. Обновление границ
    for (const c of this.colliders) c.updateBounds();

    // 4. Broadphase
    this._broadphase.rebuild(this.colliders);
    const candidatePairs = this._broadphase.getPairs(this);

    // 5. Narrowphase + решение
    const contacts = [];
    for (const [a, b] of candidatePairs) {
      const m = testCollision(a, b);
      if (m) contacts.push(m);
    }
    this.stats.contacts = contacts.length;

    for (let it = 0; it < this.solverIterations; it++) {
      for (const m of contacts) resolveContact(m, this, h, it === 0);
    }
    // Коррекция позиций (Baumgarte)
    for (const m of contacts) positionalCorrection(m);

    // 6. События коллизий
    this._dispatchEvents(contacts);

    // 7. Засыпание
    for (const rb of this.bodies) {
      if (rb.isKinematic || !rb.enabled) continue;
      const speed = rb.velocity.lengthSq() + rb.angularVelocity.lengthSq();
      if (speed < this.sleepThreshold * this.sleepThreshold) {
        rb._sleepTimer += h;
        if (rb._sleepTimer > this.sleepTime && rb.allowSleep) {
          rb.sleeping = true;
          rb.velocity.set(0, 0, 0);
          rb.angularVelocity.set(0, 0, 0);
        }
      } else rb._sleepTimer = 0;
    }

    this.stats.colliders = this.colliders.length;
    this.stats.bodies = this.bodies.length;
    this.stats.pairs = candidatePairs.length;
    this.stats.stepMs = performance.now() - t0;
  }

  _dispatchEvents(contacts) {
    const current = new Set();
    for (const m of contacts) {
      const key = m.a.id < m.b.id ? m.a.id + '|' + m.b.id : m.b.id + '|' + m.a.id;
      current.add(key);
      const isNew = !this._pairs.has(key);
      this._pairs.set(key, m);
      const trigger = m.a.isTrigger || m.b.isTrigger;
      const evEnter = trigger ? 'onTriggerEnter' : 'onCollisionEnter';
      const evStay = trigger ? 'onTriggerStay' : 'onCollisionStay';
      const ca = new Collision(m.b, [{ point: m.point.clone(), normal: m.normal.clone() }], m.impulse ?? 0, _v1.copy(m.relVel ?? _v3.set(0, 0, 0)).clone());
      const cb = new Collision(m.a, [{ point: m.point.clone(), normal: m.normal.clone().negate() }], m.impulse ?? 0, ca.relativeVelocity.clone().negate());
      const argA = trigger ? m.b : ca;
      const argB = trigger ? m.a : cb;
      if (isNew) {
        m.a.gameObject?.sendMessage(evEnter, argA);
        m.b.gameObject?.sendMessage(evEnter, argB);
      } else {
        m.a.gameObject?.sendMessage(evStay, argA);
        m.b.gameObject?.sendMessage(evStay, argB);
      }
    }
    for (const [key, m] of [...this._pairs]) {
      if (current.has(key)) continue;
      this._pairs.delete(key);
      const trigger = m.a.isTrigger || m.b.isTrigger;
      const ev = trigger ? 'onTriggerExit' : 'onCollisionExit';
      const argA = trigger ? m.b : new Collision(m.b, [], 0, new THREE.Vector3());
      const argB = trigger ? m.a : new Collision(m.a, [], 0, new THREE.Vector3());
      if (!m.a._destroyed) m.a.gameObject?.sendMessage(ev, argA);
      if (!m.b._destroyed) m.b.gameObject?.sendMessage(ev, argB);
    }
  }

  // ---- Запросы ----
  raycast(origin, direction, maxDistance = Infinity, layerMask = LayerMask.everything, queryTriggers = false) {
    const dir = direction.clone().normalize();
    let best = null;
    for (const c of this.colliders) {
      if (!c.enabled) continue;
      if (!(layerMask & (1 << (c.gameObject?.layer ?? 0)))) continue;
      if (c.isTrigger && !queryTriggers) continue;
      const hit = c.raycast(origin, dir, maxDistance);
      if (hit && (!best || hit.distance < best.distance)) best = hit;
    }
    return best;
  }

  raycastAll(origin, direction, maxDistance = Infinity, layerMask = LayerMask.everything, queryTriggers = false) {
    const dir = direction.clone().normalize();
    const hits = [];
    for (const c of this.colliders) {
      if (!c.enabled) continue;
      if (!(layerMask & (1 << (c.gameObject?.layer ?? 0)))) continue;
      if (c.isTrigger && !queryTriggers) continue;
      const hit = c.raycast(origin, dir, maxDistance);
      if (hit) hits.push(hit);
    }
    return hits.sort((a, b) => a.distance - b.distance);
  }

  overlapSphere(center, radius, layerMask = LayerMask.everything) {
    const out = [];
    const r2 = radius * radius;
    for (const c of this.colliders) {
      if (!c.enabled) continue;
      if (!(layerMask & (1 << (c.gameObject?.layer ?? 0)))) continue;
      const closest = c.bounds.clampPoint(center, _v1.clone());
      if (closest.distanceToSquared(center) <= r2) out.push(c);
    }
    return out;
  }

  overlapBox(center, halfExtents, layerMask = LayerMask.everything) {
    const box = new THREE.Box3(center.clone().sub(halfExtents), center.clone().add(halfExtents));
    return this.colliders.filter((c) => c.enabled
      && (layerMask & (1 << (c.gameObject?.layer ?? 0)))
      && c.bounds.intersectsBox(box));
  }

  /** Проверка перемещения капсулы (для контроллера персонажа) */
  computePenetration(collider, position, iterations = 4) {
    const correction = new THREE.Vector3();
    for (let i = 0; i < iterations; i++) {
      let hitAny = false;
      collider.updateBounds(position.clone().add(correction));
      for (const other of this.colliders) {
        if (other === collider || !other.enabled || other.isTrigger) continue;
        if (!this._layersCollide(collider.gameObject?.layer ?? 0, other.gameObject?.layer ?? 0)) continue;
        const m = testCollision(collider, other, position.clone().add(correction));
        if (m && m.depth > 0.0001) {
          correction.addScaledVector(m.normal, m.depth * (m.a === collider ? 1 : -1));
          hitAny = true;
        }
      }
      if (!hitAny) break;
    }
    collider.updateBounds();
    return correction;
  }
}

/** Пространственный хэш для broadphase */
class SpatialHash {
  constructor(cellSize = 4) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }
  _key(x, y, z) { return x + ',' + y + ',' + z; }
  clear() { this.cells.clear(); }
  rebuild(colliders) {
    this.cells.clear();
    const cs = this.cellSize;
    for (const c of colliders) {
      if (!c.enabled) continue;
      const b = c.bounds;
      const x0 = Math.floor(b.min.x / cs), x1 = Math.floor(b.max.x / cs);
      const y0 = Math.floor(b.min.y / cs), y1 = Math.floor(b.max.y / cs);
      const z0 = Math.floor(b.min.z / cs), z1 = Math.floor(b.max.z / cs);
      // защита от гигантских объектов
      if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 4096) {
        if (!this.cells.has('BIG')) this.cells.set('BIG', []);
        this.cells.get('BIG').push(c);
        continue;
      }
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++)
          for (let z = z0; z <= z1; z++) {
            const k = this._key(x, y, z);
            if (!this.cells.has(k)) this.cells.set(k, []);
            this.cells.get(k).push(c);
          }
    }
  }
  getPairs(world) {
    const pairs = [];
    const seen = new Set();
    const big = this.cells.get('BIG') ?? [];
    const addPair = (a, b) => {
      if (a === b) return;
      const ka = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
      if (seen.has(ka)) return;
      seen.add(ka);
      const rbA = a.attachedRigidbody, rbB = b.attachedRigidbody;
      if (!rbA && !rbB) return;
      if (rbA?.sleeping && rbB?.sleeping) return;
      if ((rbA?.isKinematic || !rbA) && (rbB?.isKinematic || !rbB)) {
        if (!a.isTrigger && !b.isTrigger) return;
      }
      if (!world._layersCollide(a.gameObject?.layer ?? 0, b.gameObject?.layer ?? 0)) return;
      if (!a.bounds.intersectsBox(b.bounds)) return;
      pairs.push([a, b]);
    };
    for (const [k, list] of this.cells) {
      if (k === 'BIG') continue;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) addPair(list[i], list[j]);
        for (const b of big) addPair(list[i], b);
      }
    }
    for (let i = 0; i < big.length; i++)
      for (let j = i + 1; j < big.length; j++) addPair(big[i], big[j]);
    return pairs;
  }
}

// ---------- Narrowphase ----------
export function testCollision(a, b, overridePosA = null) {
  // меш-коллайдер аппроксимируется своим ориентированным боксом
  const ta = a.shape === 'mesh' ? 'box' : a.shape;
  const tb = b.shape === 'mesh' ? 'box' : b.shape;
  const pa = overridePosA ?? a.worldCenter;
  const pb = b.worldCenter;
  let m = null;
  if (ta === 'sphere' && tb === 'sphere') m = sphereSphere(a, b, pa, pb);
  else if (ta === 'sphere' && tb === 'box') m = sphereBox(a, b, pa, pb);
  else if (ta === 'box' && tb === 'sphere') { m = sphereBox(b, a, pb, pa); if (m) m = flip(m); }
  else if (ta === 'box' && tb === 'box') m = boxBox(a, b, pa, pb);
  else if (ta === 'capsule' && tb === 'box') m = capsuleBox(a, b, pa, pb);
  else if (ta === 'box' && tb === 'capsule') { m = capsuleBox(b, a, pb, pa); if (m) m = flip(m); }
  else if (ta === 'capsule' && tb === 'sphere') m = capsuleSphere(a, b, pa, pb);
  else if (ta === 'sphere' && tb === 'capsule') { m = capsuleSphere(b, a, pb, pa); if (m) m = flip(m); }
  else if (ta === 'capsule' && tb === 'capsule') m = capsuleCapsule(a, b, pa, pb);
  else if (ta === 'plane' || tb === 'plane') m = planeAny(a, b);
  else m = boxBox(a, b, pa, pb); // fallback по AABB
  if (m) { m.a = m.a ?? a; m.b = m.b ?? b; }
  return m;
}

function flip(m) {
  const t = m.a; m.a = m.b; m.b = t;
  m.normal.negate();
  return m;
}

function sphereSphere(a, b, pa, pb) {
  const ra = a.worldRadius, rb = b.worldRadius;
  const d = _v1.copy(pb).sub(pa);
  const dist = d.length();
  const sum = ra + rb;
  if (dist >= sum) return null;
  const normal = dist > 1e-6 ? d.clone().divideScalar(dist) : new THREE.Vector3(0, 1, 0);
  return {
    a, b, normal, depth: sum - dist,
    point: pa.clone().addScaledVector(normal, ra),
  };
}

function sphereBox(sphere, box, ps, pb) {
  // переводим центр сферы в локальные координаты бокса
  const inv = box.worldMatrixInverse;
  const local = ps.clone().applyMatrix4(inv);
  const he = box.halfExtents;
  const closest = new THREE.Vector3(
    Mathf.clamp(local.x, -he.x, he.x),
    Mathf.clamp(local.y, -he.y, he.y),
    Mathf.clamp(local.z, -he.z, he.z));
  const diff = local.clone().sub(closest);
  let dist = diff.length();
  const r = sphere.worldRadius;
  let normalLocal;
  if (dist > 1e-6) {
    if (dist >= r) return null;
    normalLocal = diff.divideScalar(dist).negate();
  } else {
    // центр внутри бокса — выталкиваем по минимальной оси
    const dx = he.x - Math.abs(local.x), dy = he.y - Math.abs(local.y), dz = he.z - Math.abs(local.z);
    const minD = Math.min(dx, dy, dz);
    normalLocal = new THREE.Vector3(
      minD === dx ? Math.sign(local.x) || 1 : 0,
      minD === dy ? Math.sign(local.y) || 1 : 0,
      minD === dz ? Math.sign(local.z) || 1 : 0).negate();
    dist = -minD;
  }
  const rot = new THREE.Matrix3().setFromMatrix4(box.worldMatrix);
  const normal = normalLocal.applyMatrix3(rot).normalize();
  const worldClosest = closest.applyMatrix4(box.worldMatrix);
  return { a: sphere, b: box, normal, depth: r - dist, point: worldClosest };
}

function boxBox(a, b, pa, pb) {
  // SAT по осям обоих боксов (упрощённый OBB-тест)
  const A = a.getOBB(pa), B = b.getOBB(pb);
  const axes = [];
  for (let i = 0; i < 3; i++) axes.push(A.axes[i]);
  for (let i = 0; i < 3; i++) axes.push(B.axes[i]);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const c = new THREE.Vector3().crossVectors(A.axes[i], B.axes[j]);
      if (c.lengthSq() > 1e-6) axes.push(c.normalize());
    }
  let minDepth = Infinity, bestAxis = null;
  const dc = new THREE.Vector3().subVectors(B.center, A.center);
  for (const axis of axes) {
    const pA = projectOBB(A, axis), pB = projectOBB(B, axis);
    const dist = Math.abs(dc.dot(axis));
    const overlap = pA + pB - dist;
    if (overlap <= 0) return null;
    if (overlap < minDepth) {
      minDepth = overlap;
      bestAxis = axis.clone();
      if (dc.dot(axis) < 0) bestAxis.negate();
    }
  }
  const point = A.center.clone().addScaledVector(bestAxis, projectOBB(A, bestAxis) - minDepth * 0.5);
  return { a, b, normal: bestAxis, depth: minDepth, point };
}

function projectOBB(obb, axis) {
  return obb.halfExtents.x * Math.abs(axis.dot(obb.axes[0]))
    + obb.halfExtents.y * Math.abs(axis.dot(obb.axes[1]))
    + obb.halfExtents.z * Math.abs(axis.dot(obb.axes[2]));
}

function closestPointOnSegment(p, a, b, out) {
  const ab = _v2.subVectors(b, a);
  const t = Mathf.clamp01(ab.lengthSq() < 1e-9 ? 0 : _v3.subVectors(p, a).dot(ab) / ab.lengthSq());
  return out.copy(a).addScaledVector(ab, t);
}

function capsuleSphere(cap, sph, pc, ps) {
  const seg = cap.getSegment(pc);
  const closest = closestPointOnSegment(ps, seg.a, seg.b, new THREE.Vector3());
  const d = new THREE.Vector3().subVectors(ps, closest);
  const dist = d.length();
  const sum = cap.worldRadius + sph.worldRadius;
  if (dist >= sum) return null;
  const normal = dist > 1e-6 ? d.divideScalar(dist) : new THREE.Vector3(0, 1, 0);
  return { a: cap, b: sph, normal, depth: sum - dist, point: closest.addScaledVector(normal, cap.worldRadius) };
}

function capsuleCapsule(a, b, pa, pb) {
  const sa = a.getSegment(pa), sb = b.getSegment(pb);
  const [p1, p2] = closestPointsSegments(sa.a, sa.b, sb.a, sb.b);
  const d = new THREE.Vector3().subVectors(p2, p1);
  const dist = d.length();
  const sum = a.worldRadius + b.worldRadius;
  if (dist >= sum) return null;
  const normal = dist > 1e-6 ? d.divideScalar(dist) : new THREE.Vector3(0, 1, 0);
  return { a, b, normal, depth: sum - dist, point: p1.addScaledVector(normal, a.worldRadius) };
}

function capsuleBox(cap, box, pc, pb) {
  const seg = cap.getSegment(pc);
  const inv = box.worldMatrixInverse;
  const la = seg.a.clone().applyMatrix4(inv);
  const lb = seg.b.clone().applyMatrix4(inv);
  const he = box.halfExtents;
  // ищем точку сегмента, ближайшую к боксу (итеративно)
  let best = null;
  const samples = 6;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = la.clone().lerp(lb, t);
    const closest = new THREE.Vector3(
      Mathf.clamp(p.x, -he.x, he.x), Mathf.clamp(p.y, -he.y, he.y), Mathf.clamp(p.z, -he.z, he.z));
    const dist = p.distanceTo(closest);
    if (!best || dist < best.dist) best = { dist, p, closest, t };
  }
  const r = cap.worldRadius;
  let normalLocal, depth;
  if (best.dist > 1e-6) {
    if (best.dist >= r) return null;
    normalLocal = best.p.clone().sub(best.closest).divideScalar(best.dist).negate();
    depth = r - best.dist;
  } else {
    const p = best.p;
    const dx = he.x - Math.abs(p.x), dy = he.y - Math.abs(p.y), dz = he.z - Math.abs(p.z);
    const minD = Math.min(dx, dy, dz);
    normalLocal = new THREE.Vector3(
      minD === dx ? Math.sign(p.x) || 1 : 0,
      minD === dy ? Math.sign(p.y) || 1 : 0,
      minD === dz ? Math.sign(p.z) || 1 : 0).negate();
    depth = r + minD;
  }
  const rot = new THREE.Matrix3().setFromMatrix4(box.worldMatrix);
  const normal = normalLocal.applyMatrix3(rot).normalize();
  const point = best.closest.applyMatrix4(box.worldMatrix);
  return { a: cap, b: box, normal, depth, point };
}

function planeAny(a, b) {
  const plane = a.shape === 'plane' ? a : b;
  const other = a.shape === 'plane' ? b : a;
  const n = plane.worldNormal;
  const origin = plane.worldCenter;
  const c = other.worldCenter;
  const r = other.shape === 'sphere' || other.shape === 'capsule'
    ? other.worldRadius
    : other.bounds.getSize(_v1).length() * 0.5;
  const dist = _v2.subVectors(c, origin).dot(n);
  if (dist > r) return null;
  const m = {
    a: other, b: plane, normal: n.clone().negate(), depth: r - dist,
    point: c.clone().addScaledVector(n, -r),
  };
  return plane === a ? flip(m) : m;
}

function closestPointsSegments(p1, q1, p2, q2) {
  const d1 = new THREE.Vector3().subVectors(q1, p1);
  const d2 = new THREE.Vector3().subVectors(q2, p2);
  const r = new THREE.Vector3().subVectors(p1, p2);
  const a = d1.lengthSq(), e = d2.lengthSq(), f = d2.dot(r);
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) return [p1.clone(), p2.clone()];
  if (a <= 1e-9) { s = 0; t = Mathf.clamp01(f / e); }
  else {
    const c = d1.dot(r);
    if (e <= 1e-9) { t = 0; s = Mathf.clamp01(-c / a); }
    else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s = denom !== 0 ? Mathf.clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Mathf.clamp01(-c / a); }
      else if (t > 1) { t = 1; s = Mathf.clamp01((b - c) / a); }
    }
  }
  return [p1.clone().addScaledVector(d1, s), p2.clone().addScaledVector(d2, t)];
}

// ---------- Решатель ----------
function resolveContact(m, world, h, firstIteration) {
  const rbA = m.a.attachedRigidbody, rbB = m.b.attachedRigidbody;
  if (m.a.isTrigger || m.b.isTrigger) return;
  const invMassA = rbA && !rbA.isKinematic ? rbA.inverseMass : 0;
  const invMassB = rbB && !rbB.isKinematic ? rbB.inverseMass : 0;
  const invSum = invMassA + invMassB;
  if (invSum === 0) return;

  if (rbA?.sleeping && (invMassB > 0)) rbA.wakeUp();
  if (rbB?.sleeping && (invMassA > 0)) rbB.wakeUp();

  const vA = rbA?.velocity ?? _v1.set(0, 0, 0);
  const vB = rbB?.velocity ?? _v2.set(0, 0, 0);
  const rel = _v3.copy(vB).sub(vA);
  const velAlongNormal = rel.dot(m.normal);
  if (firstIteration) {
    m.relVel = rel.clone();
    m.impulse = 0;
  }
  if (velAlongNormal > 0) return;

  const matA = m.a.material, matB = m.b.material;
  const e = Math.max(matA?.bounciness ?? world.defaultRestitution, matB?.bounciness ?? world.defaultRestitution);
  const restitution = Math.abs(velAlongNormal) < 1 ? 0 : e;
  let j = -(1 + restitution) * velAlongNormal / invSum;
  m.impulse += j;

  const impulse = m.normal.clone().multiplyScalar(j);
  if (rbA && invMassA > 0) rbA.velocity.addScaledVector(impulse, -invMassA);
  if (rbB && invMassB > 0) rbB.velocity.addScaledVector(impulse, invMassB);

  // трение (Кулон)
  const relAfter = (rbB?.velocity ?? _v2.set(0, 0, 0)).clone().sub(rbA?.velocity ?? _v1.set(0, 0, 0));
  const tangent = relAfter.clone().addScaledVector(m.normal, -relAfter.dot(m.normal));
  if (tangent.lengthSq() > 1e-8) {
    tangent.normalize();
    const jt = -relAfter.dot(tangent) / invSum;
    const mu = Math.sqrt(
      (matA?.friction ?? world.defaultFriction) * (matB?.friction ?? world.defaultFriction));
    const frictionImpulse = Math.abs(jt) < j * mu
      ? tangent.multiplyScalar(jt)
      : tangent.multiplyScalar(-j * mu);
    if (rbA && invMassA > 0) rbA.velocity.addScaledVector(frictionImpulse, -invMassA);
    if (rbB && invMassB > 0) rbB.velocity.addScaledVector(frictionImpulse, invMassB);
  }
}

function positionalCorrection(m) {
  if (m.a.isTrigger || m.b.isTrigger) return;
  const rbA = m.a.attachedRigidbody, rbB = m.b.attachedRigidbody;
  const invMassA = rbA && !rbA.isKinematic ? rbA.inverseMass : 0;
  const invMassB = rbB && !rbB.isKinematic ? rbB.inverseMass : 0;
  const invSum = invMassA + invMassB;
  if (invSum === 0) return;
  const percent = 0.8, slop = 0.005;
  const corr = Math.max(m.depth - slop, 0) / invSum * percent;
  const c = m.normal.clone().multiplyScalar(corr);
  if (invMassA > 0) {
    const t = rbA.transform;
    t.position = t.position.addScaledVector(c, -invMassA);
  }
  if (invMassB > 0) {
    const t = rbB.transform;
    t.position = t.position.addScaledVector(c, invMassB);
  }
}

export class PhysicsMaterial {
  constructor(opts = {}) {
    this.friction = opts.friction ?? 0.55;
    this.bounciness = opts.bounciness ?? 0.15;
    this.frictionCombine = opts.frictionCombine ?? 'average';
    this.bounceCombine = opts.bounceCombine ?? 'max';
  }
}
