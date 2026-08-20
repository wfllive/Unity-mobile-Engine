// WFL Engine — готовые игровые компоненты: контроллеры, камеры, поведения
import * as THREE from 'three';
import { Component, registerComponent } from '../core/component.js';
import { Mathf } from '../core/math.js';
import { CharacterController, Rigidbody } from '../physics/components.js';
import { Audio } from '../audio/audio.js';

/** Контроллер персонажа от первого/третьего лица — работает мышью и тачем */
export class PlayerController extends Component {
  static componentName = 'PlayerController';
  static allowMultiple = false;
  static inspector = {
    moveSpeed: { type: 'number', default: 5, min: 0, step: 0.5, label: 'Скорость' },
    sprintMultiplier: { type: 'number', default: 1.8, min: 1, step: 0.1, label: 'Ускорение бега' },
    jumpHeight: { type: 'number', default: 1.6, min: 0, step: 0.1, label: 'Высота прыжка' },
    lookSensitivity: { type: 'number', default: 2.2, min: 0.1, step: 0.1, label: 'Чувств. обзора' },
    touchLookSensitivity: { type: 'number', default: 3.5, min: 0.1, step: 0.1, label: 'Чувств. тача' },
    mode: { type: 'select', default: 'firstPerson', options: ['firstPerson', 'thirdPerson', 'topDown'], label: 'Режим' },
    thirdPersonDistance: { type: 'number', default: 6, min: 1, step: 0.5, label: 'Дистанция камеры' },
    airControl: { type: 'number', default: 0.4, min: 0, max: 1, step: 0.05, label: 'Контроль в воздухе' },
    requirePointerLock: { type: 'boolean', default: true, label: 'Захват курсора' },
    gravityScale: { type: 'number', default: 1, step: 0.1, label: 'Гравитация' },
    canDoubleJump: { type: 'boolean', default: false, label: 'Двойной прыжок' },
  };

  constructor() {
    super();
    this.moveSpeed = 5;
    this.sprintMultiplier = 1.8;
    this.jumpHeight = 1.6;
    this.lookSensitivity = 2.2;
    this.touchLookSensitivity = 3.5;
    this.mode = 'firstPerson';
    this.thirdPersonDistance = 6;
    this.airControl = 0.4;
    this.requirePointerLock = true;
    this.gravityScale = 1;
    this.canDoubleJump = false;
    this.pitch = 0;
    this.yaw = 0;
    this.cameraTransform = null;
    this._controller = null;
    this._jumpsLeft = 0;
    this._verticalVelocity = 0;
  }

  awake() {
    this._controller = this.getComponent(CharacterController) ?? this.addComponent(CharacterController);
    const camComp = this.getComponentInChildren('Camera');
    this.cameraTransform = camComp?.transform ?? null;
    const e = this.transform.eulerAngles;
    this.yaw = e.y;
  }

  start() {
    if (this.requirePointerLock && !this.engine.input.isTouchDevice) {
      const canvas = this.engine.canvas;
      this._clickHandler = () => {
        if (this.mode !== 'topDown') this.engine.input.requestPointerLock();
      };
      canvas.addEventListener('click', this._clickHandler);
    }
  }

  onDestroy() {
    if (this._clickHandler) this.engine?.canvas.removeEventListener('click', this._clickHandler);
  }

  update(dt) {
    const input = this.engine.input;
    this._handleLook(input, dt);
    this._handleMove(input, dt);
  }

  _handleLook(input, dt) {
    if (this.mode === 'topDown') return;
    let dx = 0, dy = 0;
    if (input.pointerLocked) {
      dx = input.mouseDelta.x * this.lookSensitivity * 0.06;
      dy = input.mouseDelta.y * this.lookSensitivity * 0.06;
    }
    const lookX = input.getAxis('LookX'), lookY = input.getAxis('LookY');
    if (Math.abs(lookX) > 0.001 || Math.abs(lookY) > 0.001) {
      dx += lookX * this.touchLookSensitivity * 60 * dt;
      dy -= lookY * this.touchLookSensitivity * 60 * dt;
    }
    if (dx === 0 && dy === 0) return;
    this.yaw -= dx;
    this.pitch = Mathf.clamp(this.pitch - dy, -85, 85);
    this.transform.localEulerAngles = new THREE.Vector3(0, this.yaw, 0);
    if (this.cameraTransform) {
      if (this.mode === 'firstPerson') {
        this.cameraTransform.localEulerAngles = new THREE.Vector3(this.pitch, 0, 0);
      } else {
        const pitchRad = this.pitch * Mathf.Deg2Rad;
        const d = this.thirdPersonDistance;
        this.cameraTransform.localPosition.set(0, Math.sin(-pitchRad) * d + 1.5, Math.cos(pitchRad) * d);
        this.cameraTransform.localEulerAngles = new THREE.Vector3(this.pitch, 0, 0);
      }
    }
  }

  _handleMove(input, dt) {
    const cc = this._controller;
    const move = input.getMoveVector();
    let speed = this.moveSpeed;
    if (input.getButton('Sprint')) speed *= this.sprintMultiplier;

    const fwd = this.transform.forward;
    const right = this.transform.right;
    fwd.y = 0; right.y = 0;
    fwd.normalize(); right.normalize();
    const desired = new THREE.Vector3()
      .addScaledVector(right, move.x)
      .addScaledVector(fwd, move.y);
    if (desired.lengthSq() > 1) desired.normalize();
    desired.multiplyScalar(speed);

    if (!cc) {
      this.transform.position = this.transform.position.addScaledVector(desired, dt);
      return;
    }

    const g = this.engine.physics.gravity.y * this.gravityScale;
    if (cc.isGrounded) {
      if (this._verticalVelocity < 0) this._verticalVelocity = -2;
      this._jumpsLeft = this.canDoubleJump ? 2 : 1;
    }
    if (input.getButtonDown('Jump') && this._jumpsLeft > 0) {
      this._verticalVelocity = Math.sqrt(2 * Math.abs(g) * this.jumpHeight);
      this._jumpsLeft--;
      Audio.synth('jump', { frequency: 320, duration: 0.16, volume: 0.18 });
      this.gameObject.sendMessage('onJump');
    }
    this._verticalVelocity += g * dt;

    const control = cc.isGrounded ? 1 : this.airControl;
    const motion = new THREE.Vector3(
      desired.x * control, this._verticalVelocity, desired.z * control).multiplyScalar(dt);
    cc.move(motion);
    if (cc.isGrounded && this._verticalVelocity < 0) this._verticalVelocity = -2;
    if ((cc.collisionFlags & 2) && this._verticalVelocity > 0) this._verticalVelocity = 0;
  }
}
registerComponent(PlayerController);

/** Орбитальная камера с поддержкой пинч-зума */
export class OrbitCamera extends Component {
  static componentName = 'OrbitCamera';
  static inspector = {
    distance: { type: 'number', default: 10, min: 0.5, step: 0.5, label: 'Дистанция' },
    minDistance: { type: 'number', default: 2, min: 0.1, step: 0.5, label: 'Мин. дистанция' },
    maxDistance: { type: 'number', default: 60, min: 1, step: 1, label: 'Макс. дистанция' },
    rotationSpeed: { type: 'number', default: 0.35, min: 0.01, step: 0.05, label: 'Скорость вращения' },
    zoomSpeed: { type: 'number', default: 1.5, min: 0.1, step: 0.1, label: 'Скорость зума' },
    damping: { type: 'number', default: 0.12, min: 0.01, max: 1, step: 0.01, label: 'Сглаживание' },
    minPitch: { type: 'number', default: -20, step: 1, label: 'Мин. наклон' },
    maxPitch: { type: 'number', default: 85, step: 1, label: 'Макс. наклон' },
    autoRotate: { type: 'boolean', default: false, label: 'Автовращение' },
    autoRotateSpeed: { type: 'number', default: 8, step: 1, label: 'Скорость автовращения' },
    enablePan: { type: 'boolean', default: true, label: 'Панорамирование' },
  };

  constructor() {
    super();
    this.distance = 10;
    this.minDistance = 2;
    this.maxDistance = 60;
    this.rotationSpeed = 0.35;
    this.zoomSpeed = 1.5;
    this.damping = 0.12;
    this.minPitch = -20;
    this.maxPitch = 85;
    this.autoRotate = false;
    this.autoRotateSpeed = 8;
    this.enablePan = true;
    this.target = new THREE.Vector3();
    /** @type {import('../core/transform.js').Transform|null} */
    this.followTarget = null;
    this.yaw = 35;
    this.pitch = 30;
    this._targetYaw = 35;
    this._targetPitch = 30;
    this._targetDistance = 10;
    this._pinchStart = 0;
    this._dragging = false;
    this._lastPointer = new THREE.Vector2();
  }

  awake() {
    this._targetDistance = this.distance;
    this._targetYaw = this.yaw;
    this._targetPitch = this.pitch;
  }

  lateUpdate(dt) {
    const input = this.engine.input;

    // Пинч-зум
    if (input.touchCount === 2) {
      const [a, b] = input.touches;
      const d = a.position.distanceTo(b.position);
      if (this._pinchStart > 0) {
        const delta = (this._pinchStart - d) * 0.02 * this.zoomSpeed;
        this._targetDistance = Mathf.clamp(this._targetDistance + delta, this.minDistance, this.maxDistance);
      }
      this._pinchStart = d;
      this._dragging = false;
    } else {
      this._pinchStart = 0;
      // Вращение мышью / одним пальцем
      const dragging = input.getMouseButton(0) || input.touchCount === 1;
      if (dragging) {
        const dx = input.mouseDelta.x, dy = input.mouseDelta.y;
        this._targetYaw -= dx * this.rotationSpeed;
        this._targetPitch = Mathf.clamp(this._targetPitch + dy * this.rotationSpeed, this.minPitch, this.maxPitch);
      }
      // Панорамирование правой кнопкой
      if (this.enablePan && input.getMouseButton(2)) {
        const right = this.transform.right, up = this.transform.up;
        const scale = this.distance * 0.0015;
        this.target.addScaledVector(right, -input.mouseDelta.x * scale);
        this.target.addScaledVector(up, input.mouseDelta.y * scale);
      }
    }

    // Колесо мыши
    if (Math.abs(input.mouseScrollDelta.y) > 0) {
      this._targetDistance = Mathf.clamp(
        this._targetDistance + input.mouseScrollDelta.y * 0.01 * this.zoomSpeed * this.distance * 0.3,
        this.minDistance, this.maxDistance);
    }

    if (this.autoRotate && !this._dragging) this._targetYaw += this.autoRotateSpeed * dt;

    const k = 1 - Math.pow(this.damping, dt * 60);
    this.yaw = Mathf.lerpUnclamped(this.yaw, this._targetYaw, Mathf.clamp01(k * 3));
    this.pitch = Mathf.lerpUnclamped(this.pitch, this._targetPitch, Mathf.clamp01(k * 3));
    this.distance = Mathf.lerpUnclamped(this.distance, this._targetDistance, Mathf.clamp01(k * 3));

    if (this.followTarget) this.target.lerp(this.followTarget.position, Mathf.clamp01(k * 2));

    const py = this.pitch * Mathf.Deg2Rad;
    const yw = this.yaw * Mathf.Deg2Rad;
    const pos = new THREE.Vector3(
      this.target.x + this.distance * Math.cos(py) * Math.sin(yw),
      this.target.y + this.distance * Math.sin(py),
      this.target.z + this.distance * Math.cos(py) * Math.cos(yw));
    this.transform.position = pos;
    this.transform.lookAt(this.target);
  }

  setTarget(v) { this.target.copy(v.isVector3 ? v : v.position); return this; }
  serialize() { const d = super.serialize(); d.target = this.target.toArray(); return d; }
  deserialize(data) { super.deserialize(data); if (data?.target) this.target.fromArray(data.target); return this; }
}
registerComponent(OrbitCamera);

/** Плавное следование камеры за целью */
export class FollowCamera extends Component {
  static componentName = 'FollowCamera';
  static inspector = {
    offset: { type: 'vector3', default: [0, 5, 10], label: 'Смещение' },
    smoothTime: { type: 'number', default: 0.15, min: 0.001, step: 0.01, label: 'Сглаживание' },
    lookAtTarget: { type: 'boolean', default: true, label: 'Смотреть на цель' },
    targetName: { type: 'string', default: '', label: 'Имя цели' },
  };
  constructor() {
    super();
    this.offset = new THREE.Vector3(0, 5, 10);
    this.smoothTime = 0.15;
    this.lookAtTarget = true;
    this.targetName = '';
    this.target = null;
    this._vel = new THREE.Vector3();
  }
  start() { if (!this.target && this.targetName) this.target = this.find(this.targetName)?.transform ?? null; }
  lateUpdate(dt) {
    if (!this.target) return;
    const desired = this.target.position.clone().add(this.offset.clone().applyQuaternion(this.target.rotation));
    const cur = this.transform.position;
    const k = 1 - Math.exp(-dt / Math.max(0.0001, this.smoothTime));
    this.transform.position = cur.lerp(desired, k);
    if (this.lookAtTarget) this.transform.lookAt(this.target.position);
  }
  serialize() { const d = super.serialize(); d.offset = this.offset.toArray(); return d; }
  deserialize(data) { super.deserialize(data); if (Array.isArray(data?.offset)) this.offset.fromArray(data.offset); return this; }
}
registerComponent(FollowCamera);

/** Простое вращение — для декора и тестов */
export class Rotator extends Component {
  static componentName = 'Rotator';
  static inspector = {
    speed: { type: 'vector3', default: [0, 45, 0], label: 'Скорость (град/с)' },
    localSpace: { type: 'boolean', default: true, label: 'Локально' },
  };
  constructor() {
    super();
    this.speed = new THREE.Vector3(0, 45, 0);
    this.localSpace = true;
  }
  update(dt) {
    this.transform.rotate(
      this.speed.x * dt, this.speed.y * dt, this.speed.z * dt,
      this.localSpace ? 'self' : 'world');
  }
  serialize() { const d = super.serialize(); d.speed = this.speed.toArray(); return d; }
  deserialize(data) { super.deserialize(data); if (Array.isArray(data?.speed)) this.speed.fromArray(data.speed); return this; }
}
registerComponent(Rotator);

/** Колебание/парение объекта */
export class Floater extends Component {
  static componentName = 'Floater';
  static inspector = {
    amplitude: { type: 'number', default: 0.5, step: 0.1, label: 'Амплитуда' },
    frequency: { type: 'number', default: 1, step: 0.1, label: 'Частота' },
    phase: { type: 'number', default: 0, step: 0.1, label: 'Фаза' },
    axis: { type: 'vector3', default: [0, 1, 0], label: 'Ось' },
  };
  constructor() {
    super();
    this.amplitude = 0.5;
    this.frequency = 1;
    this.phase = 0;
    this.axis = new THREE.Vector3(0, 1, 0);
    this._origin = new THREE.Vector3();
    this._t = 0;
  }
  start() { this._origin.copy(this.transform.localPosition); }
  update(dt) {
    this._t += dt;
    const o = Math.sin(this._t * this.frequency * Math.PI * 2 + this.phase) * this.amplitude;
    this.transform.localPosition = this._origin.clone().addScaledVector(this.axis, o);
  }
  serialize() { const d = super.serialize(); d.axis = this.axis.toArray(); return d; }
  deserialize(data) { super.deserialize(data); if (Array.isArray(data?.axis)) this.axis.fromArray(data.axis); return this; }
}
registerComponent(Floater);

/** Здоровье с событиями урона и смерти */
export class Health extends Component {
  static componentName = 'Health';
  static allowMultiple = false;
  static inspector = {
    maxHealth: { type: 'number', default: 100, min: 1, step: 1, label: 'Макс. здоровье' },
    currentHealth: { type: 'number', default: 100, min: 0, step: 1, label: 'Здоровье' },
    invulnerableTime: { type: 'number', default: 0.4, min: 0, step: 0.1, label: 'Неуязвимость (с)' },
    destroyOnDeath: { type: 'boolean', default: true, label: 'Уничтожать при смерти' },
    regenRate: { type: 'number', default: 0, min: 0, step: 0.5, label: 'Регенерация/с' },
  };
  constructor() {
    super();
    this.maxHealth = 100;
    this.currentHealth = 100;
    this.invulnerableTime = 0.4;
    this.destroyOnDeath = true;
    this.regenRate = 0;
    this.isDead = false;
    this._invulnTimer = 0;
  }
  get normalized() { return Mathf.clamp01(this.currentHealth / this.maxHealth); }
  update(dt) {
    if (this._invulnTimer > 0) this._invulnTimer -= dt;
    if (this.regenRate > 0 && !this.isDead && this.currentHealth < this.maxHealth) {
      this.currentHealth = Math.min(this.maxHealth, this.currentHealth + this.regenRate * dt);
    }
  }
  damage(amount, source = null) {
    if (this.isDead || this._invulnTimer > 0) return false;
    this.currentHealth = Math.max(0, this.currentHealth - amount);
    this._invulnTimer = this.invulnerableTime;
    this.gameObject.sendMessage('onDamage', amount, source);
    if (this.currentHealth <= 0) this.kill(source);
    return true;
  }
  heal(amount) {
    if (this.isDead) return;
    this.currentHealth = Math.min(this.maxHealth, this.currentHealth + amount);
    this.gameObject.sendMessage('onHeal', amount);
  }
  kill(source = null) {
    if (this.isDead) return;
    this.isDead = true;
    this.currentHealth = 0;
    this.gameObject.sendMessage('onDeath', source);
    this.scene?.emit('death', this.gameObject, source);
    if (this.destroyOnDeath) this.destroy(this.gameObject, 0.01);
  }
  revive(hp = null) {
    this.isDead = false;
    this.currentHealth = hp ?? this.maxHealth;
    this.gameObject.sendMessage('onRevive');
  }
}
registerComponent(Health);

/** Простой ИИ преследования с патрулированием */
export class ChaseAI extends Component {
  static componentName = 'ChaseAI';
  static inspector = {
    targetTag: { type: 'string', default: 'Player', label: 'Тег цели' },
    speed: { type: 'number', default: 2.5, min: 0, step: 0.1, label: 'Скорость' },
    detectionRange: { type: 'number', default: 15, min: 0, step: 1, label: 'Радиус обнаружения' },
    attackRange: { type: 'number', default: 1.5, min: 0, step: 0.1, label: 'Радиус атаки' },
    attackDamage: { type: 'number', default: 10, min: 0, step: 1, label: 'Урон' },
    attackCooldown: { type: 'number', default: 1.2, min: 0.05, step: 0.1, label: 'Перезарядка' },
    patrolRadius: { type: 'number', default: 6, min: 0, step: 0.5, label: 'Радиус патруля' },
    turnSpeed: { type: 'number', default: 6, min: 0.1, step: 0.5, label: 'Скорость поворота' },
    useGravity: { type: 'boolean', default: true, label: 'Гравитация' },
  };
  constructor() {
    super();
    this.targetTag = 'Player';
    this.speed = 2.5;
    this.detectionRange = 15;
    this.attackRange = 1.5;
    this.attackDamage = 10;
    this.attackCooldown = 1.2;
    this.patrolRadius = 6;
    this.turnSpeed = 6;
    this.useGravity = true;
    this.state = 'idle';
    this.target = null;
    this._cooldown = 0;
    this._home = new THREE.Vector3();
    this._patrolPoint = new THREE.Vector3();
    this._patrolTimer = 0;
    this._vy = 0;
  }
  start() {
    this._home.copy(this.transform.position);
    this._patrolPoint.copy(this._home);
  }
  update(dt) {
    if (this._cooldown > 0) this._cooldown -= dt;
    if (!this.target || this.target._destroyed) {
      this.target = this.scene?.findByTag(this.targetTag) ?? null;
    }
    const pos = this.transform.position;
    let destination = null;

    if (this.target) {
      const tp = this.target.transform.position;
      const dist = pos.distanceTo(tp);
      if (dist <= this.detectionRange) {
        this.state = dist <= this.attackRange ? 'attack' : 'chase';
        destination = tp;
        if (this.state === 'attack' && this._cooldown <= 0) {
          this._cooldown = this.attackCooldown;
          const hp = this.target.getComponent('Health');
          hp?.damage(this.attackDamage, this.gameObject);
          this.gameObject.sendMessage('onAttack', this.target);
        }
      } else this.state = 'patrol';
    } else this.state = 'patrol';

    if (this.state === 'patrol' && this.patrolRadius > 0) {
      this._patrolTimer -= dt;
      if (this._patrolTimer <= 0 || pos.distanceTo(this._patrolPoint) < 0.6) {
        this._patrolTimer = 3 + Math.random() * 3;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * this.patrolRadius;
        this._patrolPoint.set(this._home.x + Math.cos(a) * r, this._home.y, this._home.z + Math.sin(a) * r);
      }
      destination = this._patrolPoint;
    }

    if (!destination || this.state === 'attack') { this._applyGravity(dt); return; }

    const dir = destination.clone().sub(pos);
    dir.y = 0;
    if (dir.lengthSq() < 0.01) { this._applyGravity(dt); return; }
    dir.normalize();

    const targetRot = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, -1), dir);
    this.transform.rotation = this.transform.rotation.slerp(targetRot, Mathf.clamp01(this.turnSpeed * dt));

    const cc = this.getComponent(CharacterController);
    const rb = this.getComponent(Rigidbody);
    if (cc) {
      const g = this.engine.physics.gravity.y;
      if (cc.isGrounded && this._vy < 0) this._vy = -2;
      this._vy += g * dt;
      cc.move(new THREE.Vector3(dir.x * this.speed, this._vy, dir.z * this.speed).multiplyScalar(dt));
    } else if (rb) {
      rb.velocity.x = dir.x * this.speed;
      rb.velocity.z = dir.z * this.speed;
      rb.wakeUp();
    } else {
      this.transform.position = pos.addScaledVector(dir, this.speed * dt);
    }
  }
  _applyGravity(dt) {
    const cc = this.getComponent(CharacterController);
    if (!cc || !this.useGravity) return;
    const g = this.engine.physics.gravity.y;
    if (cc.isGrounded && this._vy < 0) this._vy = -2;
    this._vy += g * dt;
    cc.move(new THREE.Vector3(0, this._vy, 0).multiplyScalar(dt));
  }
}
registerComponent(ChaseAI);

/** Снаряд */
export class Projectile extends Component {
  static componentName = 'Projectile';
  static inspector = {
    speed: { type: 'number', default: 25, step: 1, label: 'Скорость' },
    damage: { type: 'number', default: 25, step: 1, label: 'Урон' },
    lifetime: { type: 'number', default: 4, min: 0.1, step: 0.1, label: 'Время жизни' },
    gravityScale: { type: 'number', default: 0, step: 0.1, label: 'Гравитация' },
    destroyOnHit: { type: 'boolean', default: true, label: 'Уничтожать при попадании' },
    ownerTag: { type: 'string', default: '', label: 'Тег владельца (игнор)' },
  };
  constructor() {
    super();
    this.speed = 25;
    this.damage = 25;
    this.lifetime = 4;
    this.gravityScale = 0;
    this.destroyOnHit = true;
    this.ownerTag = '';
    this.direction = new THREE.Vector3(0, 0, -1);
    this.owner = null;
    this._age = 0;
    this._velocity = new THREE.Vector3();
  }
  start() {
    this._velocity.copy(this.direction).normalize().multiplyScalar(this.speed);
  }
  update(dt) {
    this._age += dt;
    if (this._age >= this.lifetime) { this.destroy(this.gameObject); return; }
    if (this.gravityScale) this._velocity.y += this.engine.physics.gravity.y * this.gravityScale * dt;
    const pos = this.transform.position;
    const step = this._velocity.clone().multiplyScalar(dt);
    const dist = step.length();
    if (dist > 0.0001) {
      const hit = this.engine.physics.raycast(pos, step.clone().normalize(), dist + 0.05, 0xffffffff, false);
      if (hit && hit.gameObject !== this.gameObject
        && (!this.ownerTag || hit.gameObject?.tag !== this.ownerTag)
        && hit.gameObject !== this.owner) {
        this._onHit(hit);
        return;
      }
    }
    this.transform.position = pos.add(step);
    if (this._velocity.lengthSq() > 0.001) {
      this.transform.forward = this._velocity.clone().normalize();
    }
  }
  _onHit(hit) {
    const hp = hit.gameObject?.getComponent('Health');
    hp?.damage(this.damage, this.owner ?? this.gameObject);
    const rb = hit.rigidbody;
    rb?.addForce(this._velocity.clone().normalize().multiplyScalar(this.damage * 0.15), 'impulse');
    this.gameObject.sendMessage('onProjectileHit', hit);
    Audio.synth('hit', { duration: 0.12, volume: 0.2, frequency: 900 });
    if (this.destroyOnHit) this.destroy(this.gameObject);
  }
  serialize() { const d = super.serialize(); d.direction = this.direction.toArray(); return d; }
  deserialize(data) { super.deserialize(data); if (Array.isArray(data?.direction)) this.direction.fromArray(data.direction); return this; }
}
registerComponent(Projectile);

/** Подбираемый предмет */
export class Pickup extends Component {
  static componentName = 'Pickup';
  static inspector = {
    pickupType: { type: 'select', default: 'score', options: ['score', 'health', 'ammo', 'custom'], label: 'Тип' },
    amount: { type: 'number', default: 10, step: 1, label: 'Количество' },
    radius: { type: 'number', default: 1.2, min: 0.1, step: 0.1, label: 'Радиус' },
    targetTag: { type: 'string', default: 'Player', label: 'Тег цели' },
    respawnTime: { type: 'number', default: 0, min: 0, step: 1, label: 'Респавн (с, 0=нет)' },
    rotateSpeed: { type: 'number', default: 90, step: 10, label: 'Вращение' },
  };
  constructor() {
    super();
    this.pickupType = 'score';
    this.amount = 10;
    this.radius = 1.2;
    this.targetTag = 'Player';
    this.respawnTime = 0;
    this.rotateSpeed = 90;
    this._collected = false;
    this._respawnTimer = 0;
  }
  update(dt) {
    if (this._collected) {
      if (this.respawnTime > 0) {
        this._respawnTimer -= dt;
        if (this._respawnTimer <= 0) {
          this._collected = false;
          this.transform.object3D.visible = true;
        }
      }
      return;
    }
    if (this.rotateSpeed) this.transform.rotate(0, this.rotateSpeed * dt, 0);
    const target = this.scene?.findByTag(this.targetTag);
    if (!target) return;
    if (target.transform.position.distanceTo(this.transform.position) <= this.radius) {
      this._collect(target);
    }
  }
  _collect(target) {
    this._collected = true;
    if (this.pickupType === 'health') target.getComponent('Health')?.heal(this.amount);
    this.gameObject.sendMessage('onPickup', target, this.amount);
    this.scene?.emit('pickup', { type: this.pickupType, amount: this.amount, target, source: this.gameObject });
    Audio.synth('coin', { frequency: 660, duration: 0.14, volume: 0.2 });
    if (this.respawnTime > 0) {
      this._respawnTimer = this.respawnTime;
      this.transform.object3D.visible = false;
    } else this.destroy(this.gameObject);
  }
}
registerComponent(Pickup);

/** Спавнер объектов из префаба */
export class Spawner extends Component {
  static componentName = 'Spawner';
  static inspector = {
    prefabName: { type: 'string', default: '', label: 'Имя префаба' },
    interval: { type: 'number', default: 2, min: 0.05, step: 0.1, label: 'Интервал (с)' },
    maxAlive: { type: 'number', default: 10, min: 1, step: 1, label: 'Макс. одновременно' },
    radius: { type: 'number', default: 5, min: 0, step: 0.5, label: 'Радиус разброса' },
    autoStart: { type: 'boolean', default: true, label: 'Автостарт' },
    totalLimit: { type: 'number', default: 0, min: 0, step: 1, label: 'Всего (0=∞)' },
  };
  constructor() {
    super();
    this.prefabName = '';
    this.interval = 2;
    this.maxAlive = 10;
    this.radius = 5;
    this.autoStart = true;
    this.totalLimit = 0;
    this.running = false;
    this.spawned = [];
    this.totalSpawned = 0;
    this._timer = 0;
    /** Функция-фабрика вместо префаба */
    this.factory = null;
  }
  start() { this.running = this.autoStart; }
  update(dt) {
    if (!this.running) return;
    this.spawned = this.spawned.filter((g) => g && !g._destroyed);
    if (this.spawned.length >= this.maxAlive) return;
    if (this.totalLimit > 0 && this.totalSpawned >= this.totalLimit) { this.running = false; return; }
    this._timer -= dt;
    if (this._timer > 0) return;
    this._timer = this.interval;
    this.spawn();
  }
  spawn() {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * this.radius;
    const pos = this.transform.position.clone()
      .add(new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r));
    let go = null;
    if (this.factory) go = this.factory(pos, this);
    else if (this.prefabName && this.engine?.prefabs?.has(this.prefabName)) {
      go = this.scene.instantiate(this.engine.prefabs.get(this.prefabName), pos);
    }
    if (go) {
      this.spawned.push(go);
      this.totalSpawned++;
      this.gameObject.sendMessage('onSpawn', go);
    }
    return go;
  }
}
registerComponent(Spawner);

/** Уничтожение объекта, вышедшего за границы мира */
export class KillZone extends Component {
  static componentName = 'KillZone';
  static inspector = {
    minY: { type: 'number', default: -50, step: 1, label: 'Мин. Y' },
    respawnPoint: { type: 'vector3', default: [0, 3, 0], label: 'Точка возрождения' },
    respawn: { type: 'boolean', default: true, label: 'Возрождать' },
  };
  constructor() {
    super();
    this.minY = -50;
    this.respawnPoint = new THREE.Vector3(0, 3, 0);
    this.respawn = true;
  }
  update() {
    if (this.transform.position.y > this.minY) return;
    if (this.respawn) {
      this.transform.position = this.respawnPoint.clone();
      const rb = this.getComponent(Rigidbody);
      if (rb) { rb.velocity.set(0, 0, 0); rb.angularVelocity.set(0, 0, 0); }
      const pc = this.getComponent(PlayerController);
      if (pc) pc._verticalVelocity = 0;
      this.gameObject.sendMessage('onRespawn');
    } else this.destroy(this.gameObject);
  }
  serialize() { const d = super.serialize(); d.respawnPoint = this.respawnPoint.toArray(); return d; }
  deserialize(data) { super.deserialize(data); if (Array.isArray(data?.respawnPoint)) this.respawnPoint.fromArray(data.respawnPoint); return this; }
}
registerComponent(KillZone);

/** Скриптовый компонент — позволяет писать логику прямо в редакторе */
export class ScriptBehaviour extends Component {
  static componentName = 'ScriptBehaviour';
  static inspector = {
    scriptName: { type: 'string', default: 'NewScript', label: 'Имя скрипта' },
    code: { type: 'code', default: '', label: 'Код' },
  };
  constructor() {
    super();
    this.scriptName = 'NewScript';
    this.code = '';
    this._compiled = null;
    this._instance = null;
    this.error = null;
  }
  awake() { this.compile(); this._instance?.awake?.call(this); }
  compile() {
    this.error = null;
    if (!this.code?.trim()) { this._instance = null; return; }
    try {
      // код исполняется в контексте компонента: доступны this.transform, this.engine и т.д.
      const factory = new Function('THREE', 'Mathf', `"use strict"; return { ${this.code} };`);
      this._instance = factory(THREE, Mathf);
    } catch (e) {
      this.error = String(e);
      console.error(`[ScriptBehaviour:${this.scriptName}] ошибка компиляции`, e);
      this._instance = null;
    }
  }
  start() { this._safe('start'); }
  update(dt) { this._safe('update', dt); }
  lateUpdate(dt) { this._safe('lateUpdate', dt); }
  fixedUpdate(dt) { this._safe('fixedUpdate', dt); }
  onCollisionEnter(c) { this._safe('onCollisionEnter', c); }
  onTriggerEnter(c) { this._safe('onTriggerEnter', c); }
  onDestroy() { this._safe('onDestroy'); }
  _safe(m, ...args) {
    const fn = this._instance?.[m];
    if (typeof fn !== 'function') return;
    try { fn.apply(this, args); }
    catch (e) { this.error = String(e); console.error(`[ScriptBehaviour:${this.scriptName}.${m}]`, e); }
  }
  onDeserialized() { this.compile(); }
}
registerComponent(ScriptBehaviour);
