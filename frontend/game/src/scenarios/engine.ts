import * as THREE from 'three';
import { scene, camera } from '../engine';
import { state } from '../state';
import type { Scenario, ScenarioEntity, ScenarioState, TrajectoryPoint } from './types';

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
const PLAYER_COLLISION_RADIUS = 0.5;

// Active entity meshes
const entityMeshes: Map<string, THREE.Mesh> = new Map();

// Callbacks for UI updates
let onStateChange: (() => void) | null = null;

export function setOnScenarioStateChange(callback: () => void): void {
  onStateChange = callback;
}

function notifyStateChange(): void {
  if (onStateChange) onStateChange();
}

/**
 * Create a mesh for an entity based on its type
 */
function createEntityMesh(entity: ScenarioEntity): THREE.Mesh {
  const { width, height, depth } = entity.dimensions;

  let geometry: THREE.BufferGeometry;
  let material: THREE.Material;

  switch (entity.type) {
    case 'vehicle':
      // Simple box for vehicles
      geometry = new THREE.BoxGeometry(width, height, depth);
      material = new THREE.MeshStandardMaterial({
        color: entity.color,
        metalness: 0.3,
        roughness: 0.7,
      });
      break;

    case 'pedestrian':
      // Cylinder for pedestrians
      geometry = new THREE.CylinderGeometry(width / 2, width / 2, height, 8);
      material = new THREE.MeshStandardMaterial({
        color: entity.color,
        metalness: 0.1,
        roughness: 0.9,
      });
      break;

    case 'bicycle':
      // Thin box for bicycles
      geometry = new THREE.BoxGeometry(width, height, depth);
      material = new THREE.MeshStandardMaterial({
        color: entity.color,
        metalness: 0.5,
        roughness: 0.5,
      });
      break;

    case 'obstacle':
    default:
      // Box with warning color for obstacles
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

  // Before first point - entity not yet visible
  if (time < first.time) {
    return null;
  }

  // Single point trajectory or at/after last point - return last position
  const last = trajectory[trajectory.length - 1];
  if (trajectory.length === 1 || time >= last.time) {
    return { x: last.x, z: last.z, rotation: last.rotation };
  }

  // Find surrounding points and interpolate
  for (let i = 0; i < trajectory.length - 1; i++) {
    const p1 = trajectory[i];
    const p2 = trajectory[i + 1];

    if (time >= p1.time && time < p2.time) {
      const duration = p2.time - p1.time;
      // Avoid division by zero
      if (duration <= 0) {
        return { x: p1.x, z: p1.z, rotation: p1.rotation };
      }

      const t = (time - p1.time) / duration;

      // Linear interpolation for position
      const x = p1.x + (p2.x - p1.x) * t;
      const z = p1.z + (p2.z - p1.z) * t;

      // Angle interpolation (shortest path)
      let diff = p2.rotation - p1.rotation;

      // Normalize angle difference to [-PI, PI]
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      const rotation = p1.rotation + diff * t;

      return { x, z, rotation };
    }
  }

  // Fallback - return first point
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

  // Transform player position to entity's local space
  const dx = playerX - entityX;
  const dz = playerZ - entityZ;

  // Rotate to entity's local coordinates
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;

  // Check AABB collision with player radius
  const halfW = width / 2 + PLAYER_COLLISION_RADIUS;
  const halfD = depth / 2 + PLAYER_COLLISION_RADIUS;

  return Math.abs(localX) < halfW && Math.abs(localZ) < halfD;
}

/**
 * Start a scenario
 */
export function startScenario(scenario: Scenario): void {
  // Clean up any existing scenario
  stopScenario();

  // Set up scenario state
  scenarioState.activeScenario = scenario;
  scenarioState.isPlaying = true;
  scenarioState.isPaused = false;
  scenarioState.elapsedTime = 0;
  scenarioState.startTimestamp = performance.now();
  scenarioState.pauseTimestamp = 0;
  scenarioState.collisionCount = 0;
  scenarioState.hasWon = false;
  scenarioState.hasLost = false;

  // Spawn player at start position
  camera.position.set(scenario.playerSpawn.x, 1.6, scenario.playerSpawn.z);
  state.yaw = scenario.playerSpawn.rotation;
  state.pitch = 0;
  state.carSpeed = 0;

  // Apply camera rotation immediately
  euler.set(0, state.yaw, 0);
  camera.quaternion.setFromEuler(euler);

  console.log(`[Scenario] Player spawned at (${scenario.playerSpawn.x.toFixed(1)}, ${scenario.playerSpawn.z.toFixed(1)}) facing ${(scenario.playerSpawn.rotation * 180 / Math.PI).toFixed(0)}°`);

  // Create entity meshes
  for (const entity of scenario.entities) {
    const mesh = createEntityMesh(entity);
    scene.add(mesh);
    entityMeshes.set(entity.id, mesh);
    entity.mesh = mesh;

    // Set initial position if trajectory starts at time 0
    if (entity.trajectory.length > 0) {
      const firstPoint = entity.trajectory[0];
      if (firstPoint.time === 0) {
        mesh.visible = true;
        mesh.position.set(firstPoint.x, entity.dimensions.height / 2, firstPoint.z);
        mesh.rotation.y = firstPoint.rotation;
        entity.currentPosition = { x: firstPoint.x, z: firstPoint.z };
        entity.currentRotation = firstPoint.rotation;
        entity.visible = true;
        console.log(`[Scenario] Entity "${entity.id}" spawned at (${firstPoint.x.toFixed(1)}, ${firstPoint.z.toFixed(1)})`);
      } else {
        mesh.visible = false;
        console.log(`[Scenario] Entity "${entity.id}" will appear at t=${firstPoint.time}s`);
      }
    }
  }

  notifyStateChange();
}

/**
 * Stop the current scenario
 */
export function stopScenario(): void {
  // Remove all entity meshes
  for (const mesh of entityMeshes.values()) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    if (mesh.material instanceof THREE.Material) {
      mesh.material.dispose();
    }
  }
  entityMeshes.clear();

  // Clear entity mesh references
  if (scenarioState.activeScenario) {
    for (const entity of scenarioState.activeScenario.entities) {
      entity.mesh = undefined;
      entity.currentPosition = undefined;
      entity.currentRotation = undefined;
    }
  }

  // Reset state
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
    // Resume: adjust start timestamp to account for pause duration
    const pauseDuration = performance.now() - scenarioState.pauseTimestamp;
    scenarioState.startTimestamp += pauseDuration;
    scenarioState.isPaused = false;
  } else {
    // Pause: record pause time
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
 */
export function updateScenario(): void {
  if (!scenarioState.isPlaying || scenarioState.isPaused || !scenarioState.activeScenario) {
    return;
  }

  const scenario = scenarioState.activeScenario;
  const currentTime = performance.now();
  scenarioState.elapsedTime = (currentTime - scenarioState.startTimestamp) / 1000;

  // Check if scenario duration exceeded
  if (scenarioState.elapsedTime >= scenario.duration) {
    // Check win condition
    if (!scenarioState.hasLost) {
      scenarioState.hasWon = true;
    }
    scenarioState.isPlaying = false;
    notifyStateChange();
    return;
  }

  // Update each entity
  for (const entity of scenario.entities) {
    const pos = interpolateTrajectory(entity.trajectory, scenarioState.elapsedTime);
    const mesh = entityMeshes.get(entity.id);

    if (!mesh) {
      console.warn(`[Scenario] No mesh found for entity "${entity.id}"`);
      continue;
    }

    if (pos) {
      // Update entity position
      entity.currentPosition = { x: pos.x, z: pos.z };
      entity.currentRotation = pos.rotation;
      entity.visible = true;

      mesh.visible = true;
      mesh.position.set(pos.x, entity.dimensions.height / 2, pos.z);
      mesh.rotation.y = pos.rotation;

      // Check collision with player
      if (checkEntityCollision(camera.position.x, camera.position.z, entity)) {
        scenarioState.collisionCount++;

        // Check if collision means failure
        if (scenario.successCondition?.type === 'no_collision') {
          scenarioState.hasLost = true;
          scenarioState.isPlaying = false;
          notifyStateChange();
          return;
        }
      }
    } else {
      // Entity not visible at this time
      mesh.visible = false;
      entity.visible = false;
      entity.currentPosition = undefined;
    }
  }

  // Check success condition
  if (scenario.successCondition?.type === 'reach_position' && scenario.successCondition.target) {
    const target = scenario.successCondition.target;
    const dx = camera.position.x - target.x;
    const dz = camera.position.z - target.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < target.radius) {
      scenarioState.hasWon = true;
      scenarioState.isPlaying = false;
      notifyStateChange();
    }
  }
}

/**
 * Check collision with scenario entities (for player movement)
 */
export function checkScenarioEntityCollision(x: number, z: number): boolean {
  if (!scenarioState.activeScenario || !scenarioState.isPlaying) {
    return false;
  }

  for (const entity of scenarioState.activeScenario.entities) {
    if (entity.visible && checkEntityCollision(x, z, entity)) {
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
