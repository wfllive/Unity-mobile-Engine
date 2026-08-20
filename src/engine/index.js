// WFL Engine — публичный API
export * as THREE from 'three';

export { Engine, QualityLevel } from './engine.js';

// Ядро
export * from './core/math.js';
export { Time } from './core/time.js';
export { EventEmitter, GlobalEvents } from './core/events.js';
export {
  Component, ComponentRegistry, registerComponent, resolveComponent,
  serializeValue, deserializeValue,
} from './core/component.js';
export { Transform } from './core/transform.js';
export { GameObject } from './core/gameobject.js';
export {
  Scene, WaitForSeconds, WaitForSecondsRealtime, WaitUntil, WaitWhile, WaitForNextFrame,
} from './core/scene.js';

// Ввод
export { InputSystem, Touch, detectMobile } from './input/input.js';
export { TouchControls, VirtualJoystick, TouchButton, TouchLookArea, TOUCH_ICON } from './input/touch-controls.js';

// Физика
export {
  PhysicsWorld, RaycastHit, Collision, LayerMask, PhysicsMaterial, testCollision,
} from './physics/physics.js';
export {
  Rigidbody, Collider, BoxCollider, SphereCollider, CapsuleCollider,
  PlaneCollider, MeshCollider, CharacterController,
} from './physics/components.js';

// Рендеринг
export { Renderer, QUALITY_PRESETS } from './rendering/renderer.js';
export {
  CameraComponent, LightComponent, MeshRenderer, ModelRenderer, SpriteRenderer,
  ParticleSystem, Skybox, Terrain, createGeometry, GEOMETRY_FACTORY,
} from './rendering/components.js';

// Аудио
export { Audio, AudioManager, AudioSource, AudioListener } from './audio/audio.js';

// Ассеты
export { AssetManager } from './assets/assets.js';

// Анимация
export {
  Easing, Tween, TweenManager, Tweens, Animator, AnimatorState,
  SpriteAnimator, KeyframeAnimation,
} from './animation/animation.js';

// UI
export {
  UIManager, UIElement, UIPanel, UIText, UIButton, UIProgressBar,
  UIImage, UISlider, UIToggle, UIScreen, WorldLabel,
} from './ui/ui.js';

// Игровые компоненты
export {
  PlayerController, OrbitCamera, FollowCamera, Rotator, Floater, Health,
  ChaseAI, Projectile, Pickup, Spawner, KillZone, ScriptBehaviour,
} from './components/gameplay.js';

// Blueprints — визуальное программирование
export { BlueprintGraph } from './blueprint/graph.js';
export { Blueprint } from './blueprint/component.js';
export {
  NodeRegistry, defineNode, getNodeDef, nodesByCategory, CATEGORY_COLORS,
} from './blueprint/nodes.js';

export const VERSION = '0.1.0';
export const ENGINE_NAME = 'WFL Engine';
