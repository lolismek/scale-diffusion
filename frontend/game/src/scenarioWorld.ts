/**
 * Scenario World Orchestrator
 * Manages procedural world generation for CommonRoad scenarios.
 * Replaces Manhattan map with scenario-specific roads and buildings.
 */

import * as THREE from 'three';
import { scene } from './engine';
import { generateRoad, clear as clearRoad, getRoadBounds } from './roadGenerator';
import { loadBuildingTemplates, placeBuildings, clear as clearBuildings, isLoaded } from './buildingPlacer';
import { clearBuildings as clearManhattanBuildings } from './buildings';
import { clearStreets } from './streets';
import { clearStreetPolygons } from './streetPolygons';
import { clearTiles } from './tiling';
import { hideGround, showGround } from './ground';
import type { Scenario } from './scenarios/types';

// ── Config ───────────────────────────────────────────────────────────────────
const GEOJSON_PATH = '/builds/midtown_sample/buildings_40.geojson';
const GROUND_COLOR = 0x2d5016;  // Grass green
const GROUND_PADDING = 100;     // Extra space around scenario

// ── State ────────────────────────────────────────────────────────────────────
let scenarioGroundMesh: THREE.Mesh | null = null;
let scenarioWorldActive = false;

// ── Ground Generation ────────────────────────────────────────────────────────

/** Create a grass ground plane sized to the scenario */
function createScenarioGround(bounds: {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}): void {
  if (scenarioGroundMesh) {
    scene.remove(scenarioGroundMesh);
    scenarioGroundMesh.geometry.dispose();
    (scenarioGroundMesh.material as THREE.Material).dispose();
  }

  const width = (bounds.maxX - bounds.minX) + GROUND_PADDING * 2;
  const depth = (bounds.maxZ - bounds.minZ) + GROUND_PADDING * 2;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;

  const geometry = new THREE.PlaneGeometry(width, depth);
  const material = new THREE.MeshStandardMaterial({
    color: GROUND_COLOR,
    roughness: 1.0,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  });

  scenarioGroundMesh = new THREE.Mesh(geometry, material);
  scenarioGroundMesh.rotation.x = -Math.PI / 2;
  scenarioGroundMesh.position.set(centerX, -0.01, centerZ);

  scene.add(scenarioGroundMesh);
}

/** Clear the scenario ground */
function clearScenarioGround(): void {
  if (scenarioGroundMesh) {
    scene.remove(scenarioGroundMesh);
    scenarioGroundMesh.geometry.dispose();
    (scenarioGroundMesh.material as THREE.Material).dispose();
    scenarioGroundMesh = null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a procedural world for a CommonRoad scenario.
 * Replaces Manhattan map with scenario-specific roads and buildings.
 */
export async function generateScenarioWorld(scenario: Scenario): Promise<void> {
  if (!scenario.roadGeometry) {
    console.warn('[ScenarioWorld] No road geometry in scenario');
    return;
  }

  console.log('[ScenarioWorld] Generating world for scenario:', scenario.id);

  // Clear existing world (Manhattan map)
  clearScenarioWorld();
  clearManhattanBuildings();
  clearStreets();
  clearStreetPolygons();
  clearTiles();  // Clear dynamic tile system (Manhattan grid)
  hideGround();

  const { network } = scenario.roadGeometry;

  // Generate road meshes
  generateRoad(network);

  // Get road bounds for ground sizing
  const roadBounds = getRoadBounds(network);
  createScenarioGround(roadBounds);

  // Load building templates if not already loaded
  if (!isLoaded()) {
    await loadBuildingTemplates(GEOJSON_PATH);
  }

  // Place buildings along roads
  placeBuildings(network);

  scenarioWorldActive = true;
  console.log('[ScenarioWorld] World generation complete');
}

/**
 * Clear the scenario world and restore Manhattan map visibility.
 */
export function clearScenarioWorld(): void {
  if (!scenarioWorldActive) return;

  clearRoad();
  clearBuildings();
  clearScenarioGround();
  showGround();

  scenarioWorldActive = false;
  console.log('[ScenarioWorld] Cleared scenario world');
}

/**
 * Check if a scenario world is currently active.
 */
export function isScenarioWorldActive(): boolean {
  return scenarioWorldActive;
}

/**
 * Get the bounds of the current scenario world (for camera positioning).
 */
export function getScenarioWorldBounds(scenario: Scenario): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} | null {
  if (!scenario.roadGeometry) return null;
  return getRoadBounds(scenario.roadGeometry.network);
}
