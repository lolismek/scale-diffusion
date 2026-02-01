import type { Scenario } from './types';
import { commonRoadScenarios } from './commonRoadScenarios';

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

const handcraftedScenarios: Scenario[] = [
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

  // ================================================================
  // COMPLEX SCENARIOS (7-11): 8-10 entities each
  // ================================================================

  // Scenario 7: Rush Hour Intersection — waves of cross traffic, pedestrians, cyclists, oncoming cars
  {
    id: 'rush-hour-intersection',
    name: 'Rush Hour Intersection',
    description: 'Survive a chaotic rush hour intersection packed with cars, pedestrians, and cyclists',
    duration: 30,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -1000,
      rotation: Math.PI,
      initialSpeed: 0.15,
    },
    entities: [
      // === Wave 1 cross traffic (t=4-12) ===
      {
        id: 'rh-cross-e1',
        type: 'vehicle',
        color: '#e53935',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          -1180, CROSS_STREET_2 - 4,
          -1020, CROSS_STREET_2 - 4,
          8, -Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 4 })),
      },
      {
        id: 'rh-cross-w1',
        type: 'vehicle',
        color: '#1e88e5',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          -1020, CROSS_STREET_2 + 4,
          -1200, CROSS_STREET_2 + 4,
          8, Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 5 })),
      },
      // === Wave 2 cross traffic (t=10-18) ===
      {
        id: 'rh-cross-e2',
        type: 'vehicle',
        color: '#43a047',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          -1200, CROSS_STREET_2 - 8,
          -1000, CROSS_STREET_2 - 8,
          6, -Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 10 })),
      },
      {
        id: 'rh-cross-suv',
        type: 'vehicle',
        color: '#37474f',
        dimensions: { width: 2.4, height: 2, depth: 5 },
        trajectory: straightTrajectory(
          -1000, CROSS_STREET_2 + 8,
          -1200, CROSS_STREET_2 + 8,
          7, Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 11 })),
      },
      // === Cyclist in right lane shoulder (slow, present throughout) ===
      {
        id: 'rh-cyclist',
        type: 'bicycle',
        color: '#ff9800',
        dimensions: { width: 0.8, height: 1.2, depth: 2 },
        trajectory: straightTrajectory(
          RIGHT_LANE + 2.5, -960,
          RIGHT_LANE + 2.5, -820,
          25, Math.PI
        ),
      },
      // === Pedestrians crossing the main road at the intersection ===
      {
        id: 'rh-ped-w',
        type: 'pedestrian',
        color: '#ffeb3b',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: straightTrajectory(
          -1090, CROSS_STREET_2 - 12,
          -1118, CROSS_STREET_2 - 12,
          10, Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 8 })),
      },
      {
        id: 'rh-ped-e',
        type: 'pedestrian',
        color: '#e91e63',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: straightTrajectory(
          -1118, CROSS_STREET_2 + 12,
          -1090, CROSS_STREET_2 + 12,
          12, -Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 14 })),
      },
      // === Oncoming traffic in left lane ===
      {
        id: 'rh-oncoming-1',
        type: 'vehicle',
        color: '#9c27b0',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          LEFT_LANE, -800,
          LEFT_LANE, -1100,
          12, 0
        ).map(p => ({ ...p, time: p.time + 2 })),
      },
      {
        id: 'rh-oncoming-2',
        type: 'vehicle',
        color: '#00695c',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          LEFT_LANE, -750,
          LEFT_LANE, -1100,
          14, 0
        ).map(p => ({ ...p, time: p.time + 8 })),
      },
      // === Jaywalker crossing outside the crosswalk (t=18-24) ===
      {
        id: 'rh-jaywalker',
        type: 'pedestrian',
        color: '#4caf50',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: straightTrajectory(
          -1090, -860,
          -1118, -860,
          6, Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 18 })),
      },
    ],
    successCondition: {
      type: 'reach_position',
      target: { x: RIGHT_LANE, z: -800, radius: 15 },
    },
  },

  // Scenario 8: Highway Pile-Up — chain reaction crash scene with debris, workers, swerving car, ambulance
  {
    id: 'highway-pileup',
    name: 'Highway Pile-Up',
    description: 'A chain-reaction accident ahead — dodge wrecks, debris, workers, and an ambulance',
    duration: 25,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -1000,
      rotation: Math.PI,
      initialSpeed: 0.2,
    },
    entities: [
      // === Static crash scene (wrecks + debris) ===
      {
        id: 'hp-wreck-1',
        type: 'obstacle',
        color: '#b71c1c',
        dimensions: { width: 2.5, height: 1.2, depth: 4.5 },
        trajectory: [{ time: 0, x: RIGHT_LANE, z: -880, rotation: 0.5 }],
      },
      {
        id: 'hp-wreck-2',
        type: 'obstacle',
        color: '#1a237e',
        dimensions: { width: 2.5, height: 1.2, depth: 4.5 },
        trajectory: [{ time: 0, x: MAIN_ROAD_CENTER, z: -876, rotation: -0.9 }],
      },
      {
        id: 'hp-debris-1',
        type: 'obstacle',
        color: '#ff5722',
        dimensions: { width: 1, height: 0.3, depth: 1 },
        trajectory: [{ time: 0, x: RIGHT_LANE + 1, z: -890, rotation: 0.5 }],
      },
      {
        id: 'hp-debris-2',
        type: 'obstacle',
        color: '#ff5722',
        dimensions: { width: 0.8, height: 0.3, depth: 0.8 },
        trajectory: [{ time: 0, x: RIGHT_LANE - 1.5, z: -870, rotation: 1.2 }],
      },
      // === Emergency workers patrolling the scene ===
      {
        id: 'hp-worker-1',
        type: 'pedestrian',
        color: '#ff6f00',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: [
          { time: 0, x: RIGHT_LANE + 3, z: -882, rotation: Math.PI / 2 },
          { time: 3, x: RIGHT_LANE + 1, z: -882, rotation: Math.PI / 2 },
          { time: 5, x: RIGHT_LANE, z: -878, rotation: Math.PI },
          { time: 8, x: RIGHT_LANE - 1, z: -875, rotation: -Math.PI / 2 },
          { time: 11, x: RIGHT_LANE + 2, z: -875, rotation: -Math.PI / 2 },
          { time: 14, x: RIGHT_LANE + 3, z: -880, rotation: 0 },
          { time: 17, x: RIGHT_LANE + 3, z: -885, rotation: 0 },
          { time: 20, x: RIGHT_LANE, z: -885, rotation: Math.PI / 2 },
          { time: 25, x: RIGHT_LANE - 2, z: -885, rotation: Math.PI / 2 },
        ],
      },
      {
        id: 'hp-worker-2',
        type: 'pedestrian',
        color: '#ff6f00',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: [
          { time: 0, x: LEFT_LANE - 2, z: -878, rotation: -Math.PI / 2 },
          { time: 4, x: MAIN_ROAD_CENTER, z: -878, rotation: -Math.PI / 2 },
          { time: 7, x: MAIN_ROAD_CENTER + 1, z: -882, rotation: 0 },
          { time: 10, x: MAIN_ROAD_CENTER, z: -886, rotation: Math.PI / 2 },
          { time: 13, x: LEFT_LANE - 2, z: -886, rotation: Math.PI / 2 },
          { time: 16, x: LEFT_LANE - 2, z: -880, rotation: Math.PI },
          { time: 25, x: LEFT_LANE - 2, z: -875, rotation: Math.PI },
        ],
      },
      // === Car ahead that swerves around the wreck ===
      {
        id: 'hp-swerve-car',
        type: 'vehicle',
        color: '#00bcd4',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: [
          { time: 4, x: RIGHT_LANE, z: -950, rotation: Math.PI },
          { time: 6, x: RIGHT_LANE, z: -920, rotation: Math.PI },
          { time: 7, x: RIGHT_LANE, z: -905, rotation: Math.PI },
          { time: 8, x: RIGHT_LANE + 3, z: -895, rotation: Math.PI - 0.4 },
          { time: 9, x: LEFT_LANE, z: -885, rotation: Math.PI },
          { time: 10, x: LEFT_LANE, z: -875, rotation: Math.PI },
          { time: 12, x: LEFT_LANE, z: -850, rotation: Math.PI },
          { time: 15, x: LEFT_LANE, z: -800, rotation: Math.PI },
        ],
      },
      // === Ambulance approaching fast from behind in the left lane ===
      {
        id: 'hp-ambulance',
        type: 'vehicle',
        color: '#f44336',
        dimensions: { width: 2.2, height: 2.2, depth: 6 },
        trajectory: [
          { time: 10, x: LEFT_LANE, z: -1050, rotation: Math.PI },
          { time: 13, x: LEFT_LANE, z: -950, rotation: Math.PI },
          { time: 16, x: LEFT_LANE, z: -880, rotation: Math.PI },
          { time: 17, x: LEFT_LANE, z: -870, rotation: Math.PI },
          { time: 25, x: LEFT_LANE, z: -865, rotation: Math.PI },
        ],
      },
    ],
    successCondition: {
      type: 'no_collision',
    },
  },

  // Scenario 9: School Zone — stopped bus, children crossing, crossing guard, cyclist, jaywalker
  {
    id: 'school-zone',
    name: 'School Zone Chaos',
    description: 'Navigate a school zone with a stopped bus, crossing children, and unpredictable pedestrians',
    duration: 30,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -1000,
      rotation: Math.PI,
      initialSpeed: 0.1,
    },
    entities: [
      // === Stopped school bus blocking the right lane ===
      {
        id: 'sz-bus',
        type: 'vehicle',
        color: '#f9a825',
        dimensions: { width: 2.5, height: 2.5, depth: 8 },
        trajectory: [{ time: 0, x: RIGHT_LANE, z: -900, rotation: Math.PI }],
      },
      // === Children crossing in front of the bus (staggered timing) ===
      {
        id: 'sz-child-1',
        type: 'pedestrian',
        color: '#2196f3',
        dimensions: { width: 0.4, height: 1.4, depth: 0.4 },
        trajectory: straightTrajectory(
          -1090, -904, -1118, -904, 8, Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 4 })),
      },
      {
        id: 'sz-child-2',
        type: 'pedestrian',
        color: '#4caf50',
        dimensions: { width: 0.4, height: 1.4, depth: 0.4 },
        trajectory: straightTrajectory(
          -1090, -902, -1118, -902, 9, Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 5 })),
      },
      {
        id: 'sz-child-3',
        type: 'pedestrian',
        color: '#ff5722',
        dimensions: { width: 0.4, height: 1.4, depth: 0.4 },
        trajectory: straightTrajectory(
          -1090, -898, -1118, -898, 7, Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 7 })),
      },
      {
        id: 'sz-child-4',
        type: 'pedestrian',
        color: '#9c27b0',
        dimensions: { width: 0.4, height: 1.4, depth: 0.4 },
        trajectory: straightTrajectory(
          -1118, -896, -1090, -896, 8, -Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 10 })),
      },
      // === Crossing guard walking back and forth ===
      {
        id: 'sz-guard',
        type: 'pedestrian',
        color: '#ff6f00',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: [
          { time: 0, x: RIGHT_LANE + 3, z: -906, rotation: -Math.PI / 2 },
          { time: 3, x: RIGHT_LANE + 3, z: -906, rotation: -Math.PI / 2 },
          { time: 5, x: RIGHT_LANE, z: -906, rotation: -Math.PI / 2 },
          { time: 8, x: RIGHT_LANE - 2, z: -906, rotation: -Math.PI / 2 },
          { time: 12, x: RIGHT_LANE - 2, z: -906, rotation: Math.PI / 2 },
          { time: 15, x: RIGHT_LANE + 3, z: -906, rotation: Math.PI / 2 },
          { time: 18, x: RIGHT_LANE + 3, z: -906, rotation: -Math.PI / 2 },
          { time: 20, x: RIGHT_LANE, z: -906, rotation: -Math.PI / 2 },
          { time: 25, x: RIGHT_LANE + 3, z: -906, rotation: Math.PI / 2 },
        ],
      },
      // === Cyclist going same direction, slow ===
      {
        id: 'sz-cyclist',
        type: 'bicycle',
        color: '#00bcd4',
        dimensions: { width: 0.8, height: 1.2, depth: 2 },
        trajectory: straightTrajectory(
          RIGHT_LANE + 3, -950,
          RIGHT_LANE + 3, -850,
          25, Math.PI
        ),
      },
      // === Slow car in left lane (parent dropping off, stops then resumes) ===
      {
        id: 'sz-slow-car',
        type: 'vehicle',
        color: '#607d8b',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: [
          { time: 0, x: LEFT_LANE, z: -940, rotation: Math.PI },
          { time: 3, x: LEFT_LANE, z: -930, rotation: Math.PI },
          { time: 6, x: LEFT_LANE, z: -920, rotation: Math.PI },
          { time: 10, x: LEFT_LANE, z: -915, rotation: Math.PI },
          { time: 14, x: LEFT_LANE, z: -912, rotation: Math.PI },
          { time: 20, x: LEFT_LANE, z: -910, rotation: Math.PI },
          { time: 25, x: LEFT_LANE, z: -895, rotation: Math.PI },
          { time: 30, x: LEFT_LANE, z: -870, rotation: Math.PI },
        ],
      },
      // === Oncoming car in left lane (appears later) ===
      {
        id: 'sz-oncoming',
        type: 'vehicle',
        color: '#e91e63',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          LEFT_LANE, -850, LEFT_LANE, -1050, 12, 0
        ).map(p => ({ ...p, time: p.time + 15 })),
      },
      // === Late jaywalking child — surprise hazard ===
      {
        id: 'sz-jaywalker',
        type: 'pedestrian',
        color: '#e040fb',
        dimensions: { width: 0.4, height: 1.4, depth: 0.4 },
        trajectory: [
          { time: 20, x: -1090, z: -870, rotation: Math.PI / 2 },
          { time: 21, x: -1095, z: -870, rotation: Math.PI / 2 },
          { time: 22, x: -1100, z: -870, rotation: Math.PI / 2 },
          { time: 23, x: -1105, z: -870, rotation: Math.PI / 2 },
          { time: 24, x: -1110, z: -870, rotation: Math.PI / 2 },
          { time: 25, x: -1115, z: -870, rotation: Math.PI / 2 },
        ],
      },
    ],
    successCondition: {
      type: 'no_collision',
    },
  },

  // Scenario 10: Construction Zone — barriers narrow the road, workers walk around, merging traffic
  {
    id: 'construction-zone',
    name: 'Construction Zone',
    description: 'Thread through a narrowed construction zone with barriers, workers, and merging traffic',
    duration: 25,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -980,
      rotation: Math.PI,
      initialSpeed: 0.12,
    },
    entities: [
      // === Barriers creating a slalom through the right lane ===
      {
        id: 'cz-barrier-1',
        type: 'obstacle',
        color: '#ff6f00',
        dimensions: { width: 3, height: 1, depth: 1 },
        trajectory: [{ time: 0, x: RIGHT_LANE + 2, z: -930, rotation: 0.2 }],
      },
      {
        id: 'cz-barrier-2',
        type: 'obstacle',
        color: '#ff6f00',
        dimensions: { width: 3, height: 1, depth: 1.5 },
        trajectory: [{ time: 0, x: RIGHT_LANE - 2, z: -905, rotation: -0.15 }],
      },
      {
        id: 'cz-barrier-3',
        type: 'obstacle',
        color: '#f57f17',
        dimensions: { width: 2.5, height: 0.8, depth: 1 },
        trajectory: [{ time: 0, x: RIGHT_LANE + 1.5, z: -875, rotation: 0.1 }],
      },
      // === Workers moving around the zone ===
      {
        id: 'cz-worker-1',
        type: 'pedestrian',
        color: '#ff8f00',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: [
          { time: 0, x: RIGHT_LANE - 2, z: -920, rotation: Math.PI },
          { time: 3, x: RIGHT_LANE - 2, z: -912, rotation: Math.PI },
          { time: 5, x: RIGHT_LANE, z: -912, rotation: -Math.PI / 2 },
          { time: 8, x: RIGHT_LANE + 2, z: -912, rotation: -Math.PI / 2 },
          { time: 11, x: RIGHT_LANE + 2, z: -920, rotation: 0 },
          { time: 14, x: RIGHT_LANE, z: -920, rotation: Math.PI / 2 },
          { time: 17, x: RIGHT_LANE - 2, z: -920, rotation: Math.PI / 2 },
          { time: 25, x: RIGHT_LANE - 2, z: -920, rotation: Math.PI / 2 },
        ],
      },
      {
        id: 'cz-worker-2',
        type: 'pedestrian',
        color: '#ff8f00',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: [
          { time: 0, x: LEFT_LANE + 2, z: -895, rotation: 0 },
          { time: 5, x: LEFT_LANE + 2, z: -900, rotation: 0 },
          { time: 8, x: LEFT_LANE, z: -900, rotation: Math.PI / 2 },
          { time: 12, x: RIGHT_LANE + 3, z: -900, rotation: Math.PI / 2 },
          { time: 16, x: RIGHT_LANE + 3, z: -895, rotation: Math.PI },
          { time: 20, x: LEFT_LANE + 2, z: -895, rotation: -Math.PI / 2 },
          { time: 25, x: LEFT_LANE + 2, z: -890, rotation: Math.PI },
        ],
      },
      // === Slow construction truck ahead in left lane ===
      {
        id: 'cz-truck',
        type: 'vehicle',
        color: '#f57f17',
        dimensions: { width: 2.5, height: 2.5, depth: 7 },
        trajectory: straightTrajectory(
          LEFT_LANE - 1, -880,
          LEFT_LANE - 1, -820,
          25, Math.PI
        ),
      },
      // === Car forced to merge from left lane into right (squeezed by truck) ===
      {
        id: 'cz-merge-car',
        type: 'vehicle',
        color: '#3f51b5',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: [
          { time: 6, x: LEFT_LANE, z: -940, rotation: Math.PI },
          { time: 8, x: LEFT_LANE, z: -925, rotation: Math.PI },
          { time: 10, x: LEFT_LANE - 2, z: -915, rotation: Math.PI + 0.2 },
          { time: 12, x: RIGHT_LANE + 1, z: -905, rotation: Math.PI },
          { time: 14, x: RIGHT_LANE, z: -890, rotation: Math.PI },
          { time: 16, x: RIGHT_LANE, z: -870, rotation: Math.PI },
          { time: 20, x: RIGHT_LANE, z: -830, rotation: Math.PI },
        ],
      },
      // === Oncoming car squeezed toward center line by construction ===
      {
        id: 'cz-oncoming',
        type: 'vehicle',
        color: '#e91e63',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          MAIN_ROAD_CENTER + 1, -840,
          MAIN_ROAD_CENTER + 1, -990,
          10, 0
        ).map(p => ({ ...p, time: p.time + 5 })),
      },
      // === Cyclist weaving through the zone ===
      {
        id: 'cz-cyclist',
        type: 'bicycle',
        color: '#00e676',
        dimensions: { width: 0.8, height: 1.2, depth: 2 },
        trajectory: [
          { time: 2, x: RIGHT_LANE + 3, z: -960, rotation: Math.PI },
          { time: 5, x: RIGHT_LANE + 3, z: -940, rotation: Math.PI },
          { time: 7, x: RIGHT_LANE + 1, z: -925, rotation: Math.PI + 0.15 },
          { time: 9, x: RIGHT_LANE - 1, z: -910, rotation: Math.PI - 0.15 },
          { time: 11, x: RIGHT_LANE + 1, z: -895, rotation: Math.PI + 0.15 },
          { time: 13, x: RIGHT_LANE + 3, z: -880, rotation: Math.PI },
          { time: 16, x: RIGHT_LANE + 3, z: -860, rotation: Math.PI },
          { time: 20, x: RIGHT_LANE + 3, z: -830, rotation: Math.PI },
        ],
      },
    ],
    successCondition: {
      type: 'no_collision',
    },
  },

  // Scenario 11: Double Intersection Gauntlet — two busy intersections back-to-back
  {
    id: 'double-intersection',
    name: 'Double Intersection Gauntlet',
    description: 'Run two busy intersections back-to-back with cross traffic, cyclists, and pedestrians',
    duration: 35,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -1000,
      rotation: Math.PI,
      initialSpeed: 0.2,
    },
    entities: [
      // === First intersection: CROSS_STREET_2 (Z = -880) ===
      {
        id: 'di-int1-car-e',
        type: 'vehicle',
        color: '#e53935',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          -1180, CROSS_STREET_2 - 4,
          -1020, CROSS_STREET_2 - 4,
          7, -Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 3 })),
      },
      {
        id: 'di-int1-car-w',
        type: 'vehicle',
        color: '#1565c0',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          -1020, CROSS_STREET_2 + 4,
          -1200, CROSS_STREET_2 + 4,
          7, Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 5 })),
      },
      {
        id: 'di-int1-ped',
        type: 'pedestrian',
        color: '#ffeb3b',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: straightTrajectory(
          -1090, CROSS_STREET_2 - 14,
          -1118, CROSS_STREET_2 - 14,
          8, Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 6 })),
      },
      // === Between intersections: cyclist + oncoming car + debris ===
      {
        id: 'di-cyclist',
        type: 'bicycle',
        color: '#4caf50',
        dimensions: { width: 0.8, height: 1.2, depth: 2 },
        trajectory: straightTrajectory(
          RIGHT_LANE + 2.5, -870,
          RIGHT_LANE + 2.5, -730,
          20, Math.PI
        ).map(p => ({ ...p, time: p.time + 8 })),
      },
      {
        id: 'di-oncoming',
        type: 'vehicle',
        color: '#9c27b0',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          LEFT_LANE, -750,
          LEFT_LANE, -1050,
          14, 0
        ).map(p => ({ ...p, time: p.time + 4 })),
      },
      {
        id: 'di-debris',
        type: 'obstacle',
        color: '#ff5722',
        dimensions: { width: 1.5, height: 0.5, depth: 1.5 },
        trajectory: [{ time: 0, x: RIGHT_LANE - 0.5, z: -800, rotation: 0.3 }],
      },
      // === Second intersection: CROSS_STREET_3 (Z = -726) ===
      {
        id: 'di-int2-car-e',
        type: 'vehicle',
        color: '#f44336',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          -1200, CROSS_STREET_3 - 4,
          -1000, CROSS_STREET_3 - 4,
          6, -Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 15 })),
      },
      {
        id: 'di-int2-truck',
        type: 'vehicle',
        color: '#455a64',
        dimensions: { width: 2.4, height: 2.2, depth: 6 },
        trajectory: straightTrajectory(
          -1000, CROSS_STREET_3 + 4,
          -1200, CROSS_STREET_3 + 4,
          8, Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 17 })),
      },
      {
        id: 'di-int2-fast',
        type: 'vehicle',
        color: '#00c853',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          -1200, CROSS_STREET_3 - 8,
          -1000, CROSS_STREET_3 - 8,
          5, -Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 20 })),
      },
      {
        id: 'di-int2-ped',
        type: 'pedestrian',
        color: '#e91e63',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: straightTrajectory(
          -1118, CROSS_STREET_3 + 14,
          -1090, CROSS_STREET_3 + 14,
          10, -Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 18 })),
      },
    ],
    successCondition: {
      type: 'reach_position',
      target: { x: RIGHT_LANE, z: -700, radius: 15 },
    },
  },
];

export const sampleScenarios: Scenario[] = [
  ...handcraftedScenarios,
  ...commonRoadScenarios,
];

export function getScenarioById(id: string): Scenario | undefined {
  return sampleScenarios.find(s => s.id === id);
}
