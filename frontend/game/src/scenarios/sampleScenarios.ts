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
 */

// Road configuration
const MAIN_ROAD_CENTER = -1102.9;  // Z-axis street center X coordinate
const ROAD_WIDTH = 16;
const LANE_OFFSET = 4;  // Distance from center to lane center

// Lane positions (X coordinates)
const RIGHT_LANE = MAIN_ROAD_CENTER + LANE_OFFSET;  // ~-1099 (northbound)
const LEFT_LANE = MAIN_ROAD_CENTER - LANE_OFFSET;   // ~-1107 (southbound/oncoming)

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
  {
    id: 'oncoming-traffic',
    name: 'Oncoming Traffic',
    description: 'Avoid the oncoming vehicle while staying in your lane',
    duration: 15,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -950,
      rotation: 0  // Facing north (+Z)
    },
    entities: [
      {
        id: 'car-1',
        type: 'vehicle',
        color: '#e53935',  // Red car
        dimensions: { width: 2, height: 1.5, depth: 4 },
        // Oncoming car in the left lane, heading south
        trajectory: straightTrajectory(
          LEFT_LANE, -750,  // Start north of player
          LEFT_LANE, -1050, // End south of player
          12,
          Math.PI  // Facing south (-Z)
        ),
      },
    ],
    successCondition: {
      type: 'survive_duration',
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
      rotation: 0
    },
    entities: [
      {
        id: 'car-1',
        type: 'vehicle',
        color: '#1e88e5',  // Blue car
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: [
          // Start in left lane ahead, then merge into right lane
          { time: 0, x: LEFT_LANE, z: -900, rotation: 0 },
          { time: 2, x: LEFT_LANE, z: -880, rotation: 0 },
          { time: 4, x: LEFT_LANE + 2, z: -860, rotation: 0.3 },  // Begin merge
          { time: 6, x: RIGHT_LANE, z: -840, rotation: 0 },  // Complete merge
          { time: 8, x: RIGHT_LANE, z: -810, rotation: 0 },  // Slow down
          { time: 10, x: RIGHT_LANE, z: -790, rotation: 0 },
          { time: 12, x: RIGHT_LANE, z: -760, rotation: 0 },
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
      rotation: 0
    },
    entities: [
      // Cross traffic from west (left)
      {
        id: 'car-1',
        type: 'vehicle',
        color: '#43a047',  // Green car
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          -1200, CROSS_STREET_2,  // Start west
          -1000, CROSS_STREET_2,  // End east
          8,
          -Math.PI / 2  // Facing east
        ),
      },
      // Cross traffic from east (right), delayed
      {
        id: 'car-2',
        type: 'vehicle',
        color: '#fb8c00',  // Orange car
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          -1000, CROSS_STREET_2 + 4,
          -1200, CROSS_STREET_2 + 4,
          8,
          Math.PI / 2  // Facing west
        ).map(p => ({ ...p, time: p.time + 6 })),  // Delay by 6 seconds
      },
      // Pedestrian crossing
      {
        id: 'ped-1',
        type: 'pedestrian',
        color: '#ffeb3b',  // Yellow
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: straightTrajectory(
          -1115, CROSS_STREET_2 - 10,
          -1090, CROSS_STREET_2 - 10,
          8,
          -Math.PI / 2
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
      rotation: 0
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
      type: 'reach_position',
      target: { x: RIGHT_LANE, z: -750, radius: 10 },
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
      rotation: 0
    },
    entities: [
      {
        id: 'lead-car',
        type: 'vehicle',
        color: '#5e35b1',  // Purple
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: [
          { time: 0, x: RIGHT_LANE, z: -920, rotation: 0 },
          { time: 2, x: RIGHT_LANE, z: -900, rotation: 0 },  // Moving
          { time: 4, x: RIGHT_LANE, z: -880, rotation: 0 },
          { time: 6, x: RIGHT_LANE, z: -870, rotation: 0 },  // Slowing
          { time: 8, x: RIGHT_LANE, z: -865, rotation: 0 },  // Nearly stopped
          { time: 10, x: RIGHT_LANE, z: -863, rotation: 0 }, // Stopped
          { time: 12, x: RIGHT_LANE, z: -860, rotation: 0 }, // Creeping
          { time: 14, x: RIGHT_LANE, z: -840, rotation: 0 }, // Accelerating
          { time: 18, x: RIGHT_LANE, z: -780, rotation: 0 }, // Full speed
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
      rotation: 0
    },
    entities: [
      // Slow car ahead in our lane
      {
        id: 'slow-car',
        type: 'vehicle',
        color: '#795548',  // Brown
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          RIGHT_LANE, -950,
          RIGHT_LANE, -850,
          20,  // Very slow
          0
        ),
      },
      // Fast car in left lane going same direction
      {
        id: 'fast-car',
        type: 'vehicle',
        color: '#00bcd4',  // Cyan
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          LEFT_LANE, -980,
          LEFT_LANE, -700,
          12,
          0
        ),
      },
      // Oncoming car in far lane
      {
        id: 'oncoming-car',
        type: 'vehicle',
        color: '#e91e63',  // Pink
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          MAIN_ROAD_CENTER - LANE_OFFSET - 4, -750,  // Far left lane
          MAIN_ROAD_CENTER - LANE_OFFSET - 4, -1050,
          10,
          Math.PI
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
