import type * as THREE from 'three';

// Entity types in the scenario
export type EntityType = 'vehicle' | 'pedestrian' | 'obstacle' | 'bicycle';

// A single point in a trajectory
export interface TrajectoryPoint {
  time: number;      // Time in seconds from scenario start
  x: number;         // World X position
  z: number;         // World Z position
  rotation: number;  // Yaw rotation in radians
  speed?: number;    // Optional speed at this point
}

// A scenario entity (NPC vehicle, pedestrian, obstacle)
export interface ScenarioEntity {
  id: string;
  type: EntityType;
  color: string;
  dimensions: {
    width: number;   // X dimension
    height: number;  // Y dimension (vertical)
    depth: number;   // Z dimension
  };
  trajectory: TrajectoryPoint[];
  mesh?: THREE.Object3D;
  // Runtime state
  currentPosition?: { x: number; z: number };
  currentRotation?: number;
  visible?: boolean;
}

// Player spawn configuration
export interface PlayerSpawn {
  x: number;
  z: number;
  rotation: number;    // Initial yaw in radians
  initialSpeed?: number;  // Initial player speed in m/s (optional, defaults to 0)
}

// Scenario metadata
export interface Scenario {
  id: string;
  name: string;
  description: string;
  duration: number;  // Total scenario duration in seconds
  playerSpawn: PlayerSpawn;
  entities: ScenarioEntity[];
  // Optional success/failure conditions
  successCondition?: {
    type: 'reach_position' | 'survive_duration' | 'no_collision';
    target?: { x: number; z: number; radius: number };
  };
}

// Scenario playback state
export interface ScenarioState {
  activeScenario: Scenario | null;
  isPlaying: boolean;
  isPaused: boolean;
  elapsedTime: number;        // Current time in seconds
  startTimestamp: number;     // When playback started (performance.now())
  pauseTimestamp: number;     // When paused (for resume calculation)
  collisionCount: number;
  hasWon: boolean;
  hasLost: boolean;
}
