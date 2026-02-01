import type { Scenario } from './types';

/**
 * Sample scenarios using Manhattan map coordinates
 *
 * Road coordinate system:
 * - Z-axis streets run north-south, with center at X = street.center
 * - X-axis streets run east-west, with center at Z = street.center
 *
 * Key streets used:
 * - Main N-S road: X = -1102.9 (16m wide), player in right lane at X = -1099
 * - Cross street: Z = -1096 (26m wide)
 * - Cross street: Z = -880 (26m wide)
 *
 * Traffic conventions:
 * - On Z-axis roads: +Z is north, -Z is south
 * - Right lane (northbound): X = center + 4
 * - Left lane (southbound): X = center - 4
 *
 * Three.js rotation conventions (rotation around Y axis):
 * - rotation = 0: facing south (-Z)
 * - rotation = Math.PI: facing north (+Z)
 * - rotation = Math.PI/2: facing west (-X)
 * - rotation = -Math.PI/2: facing east (+X)
 */

// Road configuration
const MAIN_ROAD_CENTER = -1102.9;  // Z-axis street center X coordinate
const ROAD_WIDTH = 16;
const LANE_OFFSET = 4;  // Distance from center to lane center

// Lane positions (X coordinates)
// Note: When facing +Z (north), +X is to your LEFT in Three.js
const RIGHT_LANE = MAIN_ROAD_CENTER - LANE_OFFSET;  // ~-1107 (northbound, right side when facing +Z)
const LEFT_LANE = MAIN_ROAD_CENTER + LANE_OFFSET;   // ~-1099 (southbound/oncoming, left side when facing +Z)

// Cross street positions (Z coordinates)
const CROSS_STREET_1 = -1096;
const CROSS_STREET_2 = -880;
const CROSS_STREET_3 = -726;

// Helper to generate a straight-line trajectory
function straightTrajectory(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  duration: number,
  rotation: number,
  steps: number = 60
): { time: number; x: number; z: number; rotation: number }[] {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({
      time: t * duration,
      x: startX + (endX - startX) * t,
      z: startZ + (endZ - startZ) * t,
      rotation,
    });
  }
  return points;
}

export const sampleScenarios: Scenario[] = [
  // Scenario 1: Oncoming traffic on the same road
  // Note: In Three.js, rotation=0 faces -Z, rotation=PI faces +Z
  {
    id: 'oncoming-traffic',
    name: 'Oncoming Traffic',
    description: 'Avoid the oncoming vehicle while staying in your lane',
    duration: 15,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -950,
      rotation: Math.PI,  // Facing north (+Z)
      initialSpeed: 0.2,  // Start moving (~50% max speed)
    },
    entities: [
      {
        id: 'car-1',
        type: 'vehicle',
        color: '#e53935',  // Red car
        dimensions: { width: 2, height: 1.5, depth: 4 },
        // Oncoming car in the left lane, heading south toward player
        trajectory: straightTrajectory(
          LEFT_LANE, -750,  // Start north of player
          LEFT_LANE, -1050, // End south of player
          12,
          0  // Facing south (-Z)
        ),
      },
    ],
    successCondition: {
      type: 'no_collision',
    },
  },

  // Scenario 2: Cut-in from adjacent lane
  {
    id: 'cut-in',
    name: 'Highway Cut-In',
    description: 'A vehicle merges into your lane - brake or evade',
    duration: 12,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -950,
      rotation: Math.PI,  // Facing north (+Z)
      initialSpeed: 0.25,  // Start moving (~60% max speed)
    },
    entities: [
      {
        id: 'car-1',
        type: 'vehicle',
        color: '#1e88e5',  // Blue car
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: [
          // Start in left lane ahead, then merge into right lane (traveling north/+Z)
          { time: 0, x: LEFT_LANE, z: -900, rotation: Math.PI },
          { time: 2, x: LEFT_LANE, z: -880, rotation: Math.PI },
          { time: 4, x: LEFT_LANE + 2, z: -860, rotation: Math.PI - 0.3 },  // Begin merge
          { time: 6, x: RIGHT_LANE, z: -840, rotation: Math.PI },  // Complete merge
          { time: 8, x: RIGHT_LANE, z: -810, rotation: Math.PI },  // Slow down
          { time: 10, x: RIGHT_LANE, z: -790, rotation: Math.PI },
          { time: 12, x: RIGHT_LANE, z: -760, rotation: Math.PI },
        ],
      },
    ],
    successCondition: {
      type: 'no_collision',
    },
  },

  // Scenario 3: Cross traffic at intersection
  {
    id: 'intersection',
    name: 'Busy Intersection',
    description: 'Navigate through cross traffic at the intersection',
    duration: 20,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -950,
      rotation: Math.PI,  // Facing north (+Z)
      initialSpeed: 0.15,  // Start moving (~40% max speed, slower for intersection)
    },
    entities: [
      // Cross traffic from west (left) - traveling east (+X)
      {
        id: 'car-1',
        type: 'vehicle',
        color: '#43a047',  // Green car
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          -1200, CROSS_STREET_2,  // Start west
          -1000, CROSS_STREET_2,  // End east
          8,
          -Math.PI / 2  // Facing east (+X)
        ),
      },
      // Cross traffic from east (right), delayed - traveling west (-X)
      {
        id: 'car-2',
        type: 'vehicle',
        color: '#fb8c00',  // Orange car
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          -1000, CROSS_STREET_2 + 4,
          -1200, CROSS_STREET_2 + 4,
          8,
          Math.PI / 2  // Facing west (-X)
        ).map(p => ({ ...p, time: p.time + 6 })),  // Delay by 6 seconds
      },
      // Pedestrian crossing - traveling east (+X)
      {
        id: 'ped-1',
        type: 'pedestrian',
        color: '#ffeb3b',  // Yellow
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: straightTrajectory(
          -1115, CROSS_STREET_2 - 10,
          -1090, CROSS_STREET_2 - 10,
          8,
          -Math.PI / 2  // Facing east (+X)
        ).map(p => ({ ...p, time: p.time + 12 })),
      },
    ],
    successCondition: {
      type: 'reach_position',
      target: { x: RIGHT_LANE, z: -800, radius: 10 },
    },
  },

  // Scenario 4: Obstacle avoidance
  {
    id: 'obstacle-course',
    name: 'Road Debris',
    description: 'Avoid obstacles in the road ahead',
    duration: 25,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -1000,
      rotation: Math.PI,  // Facing north (+Z)
      initialSpeed: 0.2,  // Start moving (~50% max speed)
    },
    entities: [
      {
        id: 'obstacle-1',
        type: 'obstacle',
        color: '#ff5722',  // Orange warning
        dimensions: { width: 1.5, height: 0.5, depth: 1.5 },
        trajectory: [{ time: 0, x: RIGHT_LANE - 1, z: -950, rotation: 0 }],
      },
      {
        id: 'obstacle-2',
        type: 'obstacle',
        color: '#ff5722',
        dimensions: { width: 1.5, height: 0.5, depth: 1.5 },
        trajectory: [{ time: 0, x: RIGHT_LANE + 1, z: -900, rotation: 0 }],
      },
      {
        id: 'obstacle-3',
        type: 'obstacle',
        color: '#ff5722',
        dimensions: { width: 1.5, height: 0.5, depth: 1.5 },
        trajectory: [{ time: 0, x: RIGHT_LANE, z: -850, rotation: 0 }],
      },
      {
        id: 'obstacle-4',
        type: 'obstacle',
        color: '#ff5722',
        dimensions: { width: 1.5, height: 0.5, depth: 1.5 },
        trajectory: [{ time: 0, x: RIGHT_LANE - 2, z: -800, rotation: 0 }],
      },
    ],
    successCondition: {
      type: 'no_collision',
    },
  },

  // Scenario 5: Following traffic (lead car brakes suddenly)
  {
    id: 'follow-traffic',
    name: 'Lead Vehicle Braking',
    description: 'Follow the lead vehicle - watch for sudden braking',
    duration: 18,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -950,
      rotation: Math.PI,  // Facing north (+Z)
      initialSpeed: 0.2,  // Start moving (~50% max speed, following lead car)
    },
    entities: [
      {
        id: 'lead-car',
        type: 'vehicle',
        color: '#5e35b1',  // Purple
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: [
          // Car ahead traveling north (+Z), facing north
          { time: 0, x: RIGHT_LANE, z: -920, rotation: Math.PI },
          { time: 2, x: RIGHT_LANE, z: -900, rotation: Math.PI },  // Moving
          { time: 4, x: RIGHT_LANE, z: -880, rotation: Math.PI },
          { time: 6, x: RIGHT_LANE, z: -870, rotation: Math.PI },  // Slowing
          { time: 8, x: RIGHT_LANE, z: -865, rotation: Math.PI },  // Nearly stopped
          { time: 10, x: RIGHT_LANE, z: -863, rotation: Math.PI }, // Stopped
          { time: 12, x: RIGHT_LANE, z: -860, rotation: Math.PI }, // Creeping
          { time: 14, x: RIGHT_LANE, z: -840, rotation: Math.PI }, // Accelerating
          { time: 18, x: RIGHT_LANE, z: -780, rotation: Math.PI }, // Full speed
        ],
      },
    ],
    successCondition: {
      type: 'no_collision',
    },
  },

  // Scenario 6: Multiple lane traffic
  {
    id: 'heavy-traffic',
    name: 'Heavy Traffic',
    description: 'Navigate through multiple vehicles on the road',
    duration: 20,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -1000,
      rotation: Math.PI,  // Facing north (+Z)
      initialSpeed: 0.2,  // Start moving (~50% max speed)
    },
    entities: [
      // Slow car ahead in our lane - traveling north (+Z)
      {
        id: 'slow-car',
        type: 'vehicle',
        color: '#795548',  // Brown
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          RIGHT_LANE, -950,
          RIGHT_LANE, -850,
          20,  // Very slow
          Math.PI  // Facing north (+Z)
        ),
      },
      // Fast car in left lane going same direction - traveling north (+Z)
      {
        id: 'fast-car',
        type: 'vehicle',
        color: '#00bcd4',  // Cyan
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          LEFT_LANE, -980,
          LEFT_LANE, -700,
          12,
          Math.PI  // Facing north (+Z)
        ),
      },
      // Oncoming car in far lane - traveling south (-Z)
      {
        id: 'oncoming-car',
        type: 'vehicle',
        color: '#e91e63',  // Pink
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          MAIN_ROAD_CENTER - LANE_OFFSET - 4, -750,  // Far left lane
          MAIN_ROAD_CENTER - LANE_OFFSET - 4, -1050,
          10,
          0  // Facing south (-Z)
        ),
      },
    ],
    successCondition: {
      type: 'reach_position',
      target: { x: RIGHT_LANE, z: -800, radius: 15 },
    },
  },
];

export function getScenarioById(id: string): Scenario | undefined {
  return sampleScenarios.find(s => s.id === id);
}
