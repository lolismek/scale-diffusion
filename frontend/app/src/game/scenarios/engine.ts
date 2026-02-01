import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Scenario, ScenarioEntity, ScenarioState, TrajectoryPoint } from './types';

// Car model loader
const gltfLoader = new GLTFLoader();
let carModelTemplate: THREE.Group | null = null;
let carModelLoading = false;
const carModelCallbacks: Array<(model: THREE.Group) => void> = [];

// Scene and camera references (set via initScenarioEngine)
let sceneRef: THREE.Scene | null = null;
let cameraRef: THREE.Camera | null = null;

// State setter callback (for updating external game state)
let setStateCallback: ((updates: { yaw?: number; carSpeed?: number }) => void) | null = null;

// Load the car model once
function loadCarModel(): Promise<THREE.Group> {
  return new Promise((resolve) => {
    if (carModelTemplate) {
      resolve(carModelTemplate.clone());
      return;
    }

    carModelCallbacks.push(resolve);

    if (!carModelLoading) {
      carModelLoading = true;
      gltfLoader.load('/assets/classic_muscle_car.glb', (gltf) => {
        carModelTemplate = gltf.scene;
        carModelCallbacks.forEach(cb => cb(carModelTemplate!.clone()));
        carModelCallbacks.length = 0;
      }, undefined, (error) => {
        console.error('[Scenario] Failed to load car model:', error);
        carModelLoading = false;
      });
    }
  });
}

// Euler for camera rotation
const euler = new THREE.Euler(0, 0, 0, 'YXZ');

// Scenario playback state
export const scenarioState: ScenarioState = {
  activeScenario: null,
  isPlaying: false,
  isPaused: false,
  elapsedTime: 0,
  startTimestamp: 0,
  pauseTimestamp: 0,
  collisionCount: 0,
  hasWon: false,
  hasLost: false,
};

// Entity collision radius for player collision detection
const PLAYER_COLLISION_RADIUS = 1.0;

// Active entity meshes
const entityMeshes: Map<string, THREE.Object3D> = new Map();

// Callbacks for UI updates
let onStateChange: (() => void) | null = null;

export function setOnScenarioStateChange(callback: () => void): void {
  onStateChange = callback;
}

function notifyStateChange(): void {
  if (onStateChange) onStateChange();
}

/**
 * Initialize the scenario engine with scene and camera references
 */
export function initScenarioEngine(
  scene: THREE.Scene,
  camera: THREE.Camera,
  setState?: (updates: { yaw?: number; carSpeed?: number }) => void
): void {
  sceneRef = scene;
  cameraRef = camera;
  setStateCallback = setState || null;
  console.log('[Scenario] Engine initialized');
}

/**
 * Notify the scenario system that a collision occurred
 */
export function notifyScenarioCollision(): void {
  if (!scenarioState.activeScenario || !scenarioState.isPlaying) {
    return;
  }

  scenarioState.collisionCount++;

  if (scenarioState.activeScenario.successCondition?.type === 'no_collision') {
    scenarioState.hasLost = true;
    scenarioState.isPlaying = false;
    notifyStateChange();
  }
}

/**
 * Create a mesh for an entity based on its type
 */
function createEntityMesh(entity: ScenarioEntity): THREE.Object3D {
  const { width, height, depth } = entity.dimensions;

  if (entity.type === 'vehicle') {
    const placeholder = new THREE.Group();
    placeholder.userData.entityId = entity.id;
    placeholder.userData.entityType = entity.type;

    loadCarModel().then((carModel) => {
      const box = new THREE.Box3().setFromObject(carModel);
      const modelSize = box.getSize(new THREE.Vector3());

      const scaleX = width / modelSize.x;
      const scaleY = height / modelSize.y;
      const scaleZ = depth / modelSize.z;
      carModel.scale.set(scaleX, scaleY, scaleZ);
      carModel.rotation.y = Math.PI;

      const center = box.getCenter(new THREE.Vector3());
      carModel.position.sub(center.multiply(new THREE.Vector3(scaleX, scaleY, scaleZ)));

      carModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material instanceof THREE.MeshStandardMaterial) {
            child.material = child.material.clone();
            child.material.color.set(entity.color);
          }
        }
      });

      placeholder.add(carModel);
    });

    return placeholder;
  }

  let geometry: THREE.BufferGeometry;
  let material: THREE.Material;

  switch (entity.type) {
    case 'pedestrian':
      geometry = new THREE.CylinderGeometry(width / 2, width / 2, height, 8);
      material = new THREE.MeshStandardMaterial({
        color: entity.color,
        metalness: 0.1,
        roughness: 0.9,
      });
      break;

    case 'bicycle':
      geometry = new THREE.BoxGeometry(width, height, depth);
      material = new THREE.MeshStandardMaterial({
        color: entity.color,
        metalness: 0.5,
        roughness: 0.5,
      });
      break;

    case 'obstacle':
    default:
      geometry = new THREE.BoxGeometry(width, height, depth);
      material = new THREE.MeshStandardMaterial({
        color: entity.color,
        metalness: 0.1,
        roughness: 0.8,
        emissive: new THREE.Color(entity.color),
        emissiveIntensity: 0.2,
      });
      break;
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.entityId = entity.id;
  mesh.userData.entityType = entity.type;

  return mesh;
}

/**
 * Interpolate position from trajectory at given time
 */
function interpolateTrajectory(
  trajectory: TrajectoryPoint[],
  time: number
): { x: number; z: number; rotation: number } | null {
  if (trajectory.length === 0) return null;

  const first = trajectory[0];
  if (time < first.time) return null;

  const last = trajectory[trajectory.length - 1];
  if (trajectory.length === 1 || time >= last.time) {
    return { x: last.x, z: last.z, rotation: last.rotation };
  }

  for (let i = 0; i < trajectory.length - 1; i++) {
    const p1 = trajectory[i];
    const p2 = trajectory[i + 1];

    if (time >= p1.time && time < p2.time) {
      const duration = p2.time - p1.time;
      if (duration <= 0) {
        return { x: p1.x, z: p1.z, rotation: p1.rotation };
      }

      const t = (time - p1.time) / duration;
      const x = p1.x + (p2.x - p1.x) * t;
      const z = p1.z + (p2.z - p1.z) * t;

      let diff = p2.rotation - p1.rotation;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const rotation = p1.rotation + diff * t;

      return { x, z, rotation };
    }
  }

  return { x: first.x, z: first.z, rotation: first.rotation };
}

/**
 * Check if player collides with an entity
 */
function checkEntityCollision(
  playerX: number,
  playerZ: number,
  entity: ScenarioEntity
): boolean {
  if (!entity.currentPosition) return false;

  const { width, depth } = entity.dimensions;
  const entityX = entity.currentPosition.x;
  const entityZ = entity.currentPosition.z;
  const rotation = entity.currentRotation || 0;

  const dx = playerX - entityX;
  const dz = playerZ - entityZ;

  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;

  const halfW = width / 2 + PLAYER_COLLISION_RADIUS;
  const halfD = depth / 2 + PLAYER_COLLISION_RADIUS;

  return Math.abs(localX) < halfW && Math.abs(localZ) < halfD;
}

/**
 * Dispose of an Object3D and all its children
 */
function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      if (child.material instanceof THREE.Material) {
        child.material.dispose();
      } else if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose());
      }
    }
  });
}

/**
 * Start a scenario
 */
export function startScenario(scenario: Scenario): void {
  if (!sceneRef || !cameraRef) {
    console.error('[Scenario] Engine not initialized. Call initScenarioEngine first.');
    return;
  }

  stopScenario();

  scenarioState.activeScenario = scenario;
  scenarioState.isPlaying = true;
  scenarioState.isPaused = false;
  scenarioState.elapsedTime = 0;
  scenarioState.startTimestamp = performance.now();
  scenarioState.pauseTimestamp = 0;
  scenarioState.collisionCount = 0;
  scenarioState.hasWon = false;
  scenarioState.hasLost = false;

  // Set player spawn position
  cameraRef.position.set(scenario.playerSpawn.x, 1.6, scenario.playerSpawn.z);

  // Update external state if callback provided
  if (setStateCallback) {
    setStateCallback({
      yaw: scenario.playerSpawn.rotation,
      carSpeed: scenario.playerSpawn.initialSpeed ?? 0,
    });
  }

  // Apply camera rotation
  euler.set(0, scenario.playerSpawn.rotation, 0);
  cameraRef.quaternion.setFromEuler(euler);

  console.log(`[Scenario] Started "${scenario.name}" - Player at (${scenario.playerSpawn.x.toFixed(1)}, ${scenario.playerSpawn.z.toFixed(1)})`);

  // Create entity meshes
  for (const entity of scenario.entities) {
    const mesh = createEntityMesh(entity);
    sceneRef.add(mesh);
    entityMeshes.set(entity.id, mesh);
    entity.mesh = mesh;

    if (entity.trajectory.length > 0) {
      const firstPoint = entity.trajectory[0];
      if (firstPoint.time === 0) {
        mesh.visible = true;
        mesh.position.set(firstPoint.x, entity.dimensions.height / 2, firstPoint.z);
        mesh.rotation.y = firstPoint.rotation;
        entity.currentPosition = { x: firstPoint.x, z: firstPoint.z };
        entity.currentRotation = firstPoint.rotation;
        entity.visible = true;
      } else {
        mesh.visible = false;
      }
    }
  }

  notifyStateChange();
}

/**
 * Stop the current scenario
 */
export function stopScenario(): void {
  if (!sceneRef) return;

  for (const obj of entityMeshes.values()) {
    sceneRef.remove(obj);
    disposeObject(obj);
  }
  entityMeshes.clear();

  if (scenarioState.activeScenario) {
    for (const entity of scenarioState.activeScenario.entities) {
      entity.mesh = undefined;
      entity.currentPosition = undefined;
      entity.currentRotation = undefined;
    }
  }

  scenarioState.activeScenario = null;
  scenarioState.isPlaying = false;
  scenarioState.isPaused = false;
  scenarioState.elapsedTime = 0;

  notifyStateChange();
}

/**
 * Pause/resume the scenario
 */
export function togglePause(): void {
  if (!scenarioState.isPlaying) return;

  if (scenarioState.isPaused) {
    const pauseDuration = performance.now() - scenarioState.pauseTimestamp;
    scenarioState.startTimestamp += pauseDuration;
    scenarioState.isPaused = false;
  } else {
    scenarioState.pauseTimestamp = performance.now();
    scenarioState.isPaused = true;
  }

  notifyStateChange();
}

/**
 * Restart the current scenario
 */
export function restartScenario(): void {
  if (!scenarioState.activeScenario) return;
  const scenario = scenarioState.activeScenario;
  stopScenario();
  startScenario(scenario);
}

/**
 * Update scenario entities - called every frame
 * Returns collision and win status for the frame
 */
export function updateScenario(): { collision: boolean; won: boolean; lost: boolean } {
  const result = { collision: false, won: false, lost: false };

  if (!scenarioState.isPlaying || scenarioState.isPaused || !scenarioState.activeScenario || !cameraRef) {
    return result;
  }

  const scenario = scenarioState.activeScenario;
  const currentTime = performance.now();
  scenarioState.elapsedTime = (currentTime - scenarioState.startTimestamp) / 1000;

  // Check if scenario duration exceeded
  if (scenarioState.elapsedTime >= scenario.duration) {
    if (!scenarioState.hasLost) {
      scenarioState.hasWon = true;
      result.won = true;
    }
    scenarioState.isPlaying = false;
    notifyStateChange();
    return result;
  }

  // Update each entity
  for (const entity of scenario.entities) {
    const pos = interpolateTrajectory(entity.trajectory, scenarioState.elapsedTime);
    const mesh = entityMeshes.get(entity.id);

    if (!mesh) continue;

    if (pos) {
      entity.currentPosition = { x: pos.x, z: pos.z };
      entity.currentRotation = pos.rotation;
      entity.visible = true;

      mesh.visible = true;
      mesh.position.set(pos.x, entity.dimensions.height / 2, pos.z);
      mesh.rotation.y = pos.rotation;

      // Check collision with player
      if (checkEntityCollision(cameraRef.position.x, cameraRef.position.z, entity)) {
        scenarioState.collisionCount++;
        result.collision = true;

        if (scenario.successCondition?.type === 'no_collision') {
          scenarioState.hasLost = true;
          result.lost = true;
          scenarioState.isPlaying = false;
          notifyStateChange();
          return result;
        }
      }
    } else {
      mesh.visible = false;
      entity.visible = false;
      entity.currentPosition = undefined;
    }
  }

  // Check success condition
  if (scenario.successCondition?.type === 'reach_position' && scenario.successCondition.target) {
    const target = scenario.successCondition.target;
    const dx = cameraRef.position.x - target.x;
    const dz = cameraRef.position.z - target.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < target.radius) {
      scenarioState.hasWon = true;
      result.won = true;
      scenarioState.isPlaying = false;
      notifyStateChange();
    }
  }

  return result;
}

/**
 * Check collision with scenario entities (for movement validation)
 */
export function checkScenarioEntityCollision(x: number, z: number): boolean {
  if (!scenarioState.activeScenario || !scenarioState.isPlaying) {
    return false;
  }

  for (const entity of scenarioState.activeScenario.entities) {
    if (entity.visible && entity.currentPosition && checkEntityCollision(x, z, entity)) {
      return true;
    }
  }

  return false;
}

/**
 * Get current scenario info for UI
 */
export function getScenarioInfo(): {
  name: string;
  timeRemaining: number;
  collisions: number;
  status: 'playing' | 'paused' | 'won' | 'lost' | 'inactive';
} | null {
  if (!scenarioState.activeScenario) {
    return null;
  }

  let status: 'playing' | 'paused' | 'won' | 'lost' | 'inactive' = 'inactive';
  if (scenarioState.hasWon) status = 'won';
  else if (scenarioState.hasLost) status = 'lost';
  else if (scenarioState.isPaused) status = 'paused';
  else if (scenarioState.isPlaying) status = 'playing';

  return {
    name: scenarioState.activeScenario.name,
    timeRemaining: Math.max(0, scenarioState.activeScenario.duration - scenarioState.elapsedTime),
    collisions: scenarioState.collisionCount,
    status,
  };
}
