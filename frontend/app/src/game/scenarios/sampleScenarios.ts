import type { Scenario } from './types';

/**
 * Sample scenarios using Manhattan map coordinates
 *
 * Road coordinate system:
 * - Z-axis streets run north-south, with center at X = street.center
 * - X-axis streets run east-west, with center at Z = street.center
 *
 * Key streets used:
 * - Main N-S road: X = -225.91 (14m wide), player in right lane at X = -222.41
 * - Cross street: Z = -570.98
 * - Cross street: Z = -412.98 (primary intersection)
 * - Cross street: Z = -257.98 (secondary intersection)
 *
 * Traffic conventions:
 * - On Z-axis roads: +Z is north, -Z is south
 * - Right lane (northbound): X = center + 3.5
 * - Left lane (southbound): X = center - 3.5
 *
 * Three.js rotation conventions (rotation around Y axis):
 * - rotation = 0: facing south (-Z)
 * - rotation = Math.PI: facing north (+Z)
 * - rotation = Math.PI/2: facing west (-X)
 * - rotation = -Math.PI/2: facing east (+X)
 */

// Road configuration
const MAIN_ROAD_CENTER = -225.91;
const LANE_OFFSET = 3.5;

// Lane positions (X coordinates)
const RIGHT_LANE = MAIN_ROAD_CENTER - LANE_OFFSET;
const LEFT_LANE = MAIN_ROAD_CENTER + LANE_OFFSET;

// Cross street positions (Z coordinates)
const CROSS_STREET_2 = -412.98;
const CROSS_STREET_3 = -257.98;

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
  // Scenario 1: Oncoming traffic
  {
    id: 'oncoming-traffic',
    name: 'Oncoming Traffic',
    description: 'Avoid the oncoming vehicle while staying in your lane',
    duration: 15,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -533,
      rotation: Math.PI,
      initialSpeed: 0.2,
    },
    entities: [
      {
        id: 'car-1',
        type: 'vehicle',
        color: '#e53935',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(LEFT_LANE, -283, LEFT_LANE, -583, 12, 0),
      },
    ],
    successCondition: { type: 'no_collision' },
  },

  // Scenario 2: Cut-in from adjacent lane
  {
    id: 'cut-in',
    name: 'Highway Cut-In',
    description: 'A vehicle merges into your lane - brake or evade',
    duration: 12,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -533,
      rotation: Math.PI,
      initialSpeed: 0.25,
    },
    entities: [
      {
        id: 'car-1',
        type: 'vehicle',
        color: '#1e88e5',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: [
          { time: 0, x: LEFT_LANE, z: -433, rotation: Math.PI },
          { time: 2, x: LEFT_LANE, z: -413, rotation: Math.PI },
          { time: 4, x: LEFT_LANE + 2, z: -393, rotation: Math.PI - 0.3 },
          { time: 6, x: RIGHT_LANE, z: -373, rotation: Math.PI },
          { time: 8, x: RIGHT_LANE, z: -343, rotation: Math.PI },
          { time: 10, x: RIGHT_LANE, z: -323, rotation: Math.PI },
          { time: 12, x: RIGHT_LANE, z: -293, rotation: Math.PI },
        ],
      },
    ],
    successCondition: { type: 'no_collision' },
  },

  // Scenario 3: Cross traffic at intersection
  {
    id: 'intersection',
    name: 'Busy Intersection',
    description: 'Navigate through cross traffic at the intersection',
    duration: 20,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -533,
      rotation: Math.PI,
      initialSpeed: 0.15,
    },
    entities: [
      {
        id: 'car-1',
        type: 'vehicle',
        color: '#43a047',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(-323, CROSS_STREET_2, -123, CROSS_STREET_2, 8, -Math.PI / 2),
      },
      {
        id: 'car-2',
        type: 'vehicle',
        color: '#fb8c00',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(-123, CROSS_STREET_2 + 4, -323, CROSS_STREET_2 + 4, 8, Math.PI / 2)
          .map(p => ({ ...p, time: p.time + 6 })),
      },
      {
        id: 'ped-1',
        type: 'pedestrian',
        color: '#ffeb3b',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: straightTrajectory(-213, CROSS_STREET_2 - 10, -238, CROSS_STREET_2 - 10, 8, -Math.PI / 2)
          .map(p => ({ ...p, time: p.time + 12 })),
      },
    ],
    successCondition: {
      type: 'reach_position',
      target: { x: RIGHT_LANE, z: -333, radius: 10 },
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
      z: -533,
      rotation: Math.PI,
      initialSpeed: 0.2,
    },
    entities: [
      {
        id: 'obstacle-1',
        type: 'obstacle',
        color: '#ff5722',
        dimensions: { width: 1.5, height: 0.5, depth: 1.5 },
        trajectory: [{ time: 0, x: RIGHT_LANE - 1, z: -483, rotation: 0 }],
      },
      {
        id: 'obstacle-2',
        type: 'obstacle',
        color: '#ff5722',
        dimensions: { width: 1.5, height: 0.5, depth: 1.5 },
        trajectory: [{ time: 0, x: RIGHT_LANE + 1, z: -433, rotation: 0 }],
      },
      {
        id: 'obstacle-3',
        type: 'obstacle',
        color: '#ff5722',
        dimensions: { width: 1.5, height: 0.5, depth: 1.5 },
        trajectory: [{ time: 0, x: RIGHT_LANE, z: -383, rotation: 0 }],
      },
      {
        id: 'obstacle-4',
        type: 'obstacle',
        color: '#ff5722',
        dimensions: { width: 1.5, height: 0.5, depth: 1.5 },
        trajectory: [{ time: 0, x: RIGHT_LANE - 2, z: -333, rotation: 0 }],
      },
    ],
    successCondition: { type: 'no_collision' },
  },

  // Scenario 5: Following traffic (lead car brakes suddenly)
  {
    id: 'follow-traffic',
    name: 'Lead Vehicle Braking',
    description: 'Follow the lead vehicle - watch for sudden braking',
    duration: 18,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -533,
      rotation: Math.PI,
      initialSpeed: 0.2,
    },
    entities: [
      {
        id: 'lead-car',
        type: 'vehicle',
        color: '#5e35b1',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: [
          { time: 0, x: RIGHT_LANE, z: -453, rotation: Math.PI },
          { time: 2, x: RIGHT_LANE, z: -433, rotation: Math.PI },
          { time: 4, x: RIGHT_LANE, z: -413, rotation: Math.PI },
          { time: 6, x: RIGHT_LANE, z: -403, rotation: Math.PI },
          { time: 8, x: RIGHT_LANE, z: -398, rotation: Math.PI },
          { time: 10, x: RIGHT_LANE, z: -396, rotation: Math.PI },
          { time: 12, x: RIGHT_LANE, z: -393, rotation: Math.PI },
          { time: 14, x: RIGHT_LANE, z: -373, rotation: Math.PI },
          { time: 18, x: RIGHT_LANE, z: -313, rotation: Math.PI },
        ],
      },
    ],
    successCondition: { type: 'no_collision' },
  },

  // Scenario 6: Multiple lane traffic
  {
    id: 'heavy-traffic',
    name: 'Heavy Traffic',
    description: 'Navigate through multiple vehicles on the road',
    duration: 20,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -533,
      rotation: Math.PI,
      initialSpeed: 0.2,
    },
    entities: [
      {
        id: 'slow-car',
        type: 'vehicle',
        color: '#795548',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(RIGHT_LANE, -483, RIGHT_LANE, -383, 20, Math.PI),
      },
      {
        id: 'fast-car',
        type: 'vehicle',
        color: '#00bcd4',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(LEFT_LANE, -513, LEFT_LANE, -233, 12, Math.PI),
      },
      {
        id: 'oncoming-car',
        type: 'vehicle',
        color: '#e91e63',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(MAIN_ROAD_CENTER - LANE_OFFSET - 4, -283, MAIN_ROAD_CENTER - LANE_OFFSET - 4, -583, 10, 0),
      },
    ],
    successCondition: {
      type: 'reach_position',
      target: { x: RIGHT_LANE, z: -333, radius: 15 },
    },
  },

  // Scenario 7: Rush Hour Intersection
  {
    id: 'rush-hour-intersection',
    name: 'Rush Hour Intersection',
    description: 'Survive a chaotic rush hour intersection packed with cars, pedestrians, and cyclists',
    duration: 30,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -533,
      rotation: Math.PI,
      initialSpeed: 0.15,
    },
    entities: [
      {
        id: 'rh-cross-e1',
        type: 'vehicle',
        color: '#e53935',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(-303, CROSS_STREET_2 - 4, -143, CROSS_STREET_2 - 4, 8, -Math.PI / 2)
          .map(p => ({ ...p, time: p.time + 4 })),
      },
      {
        id: 'rh-cross-w1',
        type: 'vehicle',
        color: '#1e88e5',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(-143, CROSS_STREET_2 + 4, -323, CROSS_STREET_2 + 4, 8, Math.PI / 2)
          .map(p => ({ ...p, time: p.time + 5 })),
      },
      {
        id: 'rh-cross-e2',
        type: 'vehicle',
        color: '#43a047',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(-323, CROSS_STREET_2 - 8, -123, CROSS_STREET_2 - 8, 6, -Math.PI / 2)
          .map(p => ({ ...p, time: p.time + 10 })),
      },
      {
        id: 'rh-cross-suv',
        type: 'vehicle',
        color: '#37474f',
        dimensions: { width: 2.4, height: 2, depth: 5 },
        trajectory: straightTrajectory(-123, CROSS_STREET_2 + 8, -323, CROSS_STREET_2 + 8, 7, Math.PI / 2)
          .map(p => ({ ...p, time: p.time + 11 })),
      },
      {
        id: 'rh-cyclist',
        type: 'bicycle',
        color: '#ff9800',
        dimensions: { width: 0.8, height: 1.2, depth: 2 },
        trajectory: straightTrajectory(RIGHT_LANE + 2.5, -493, RIGHT_LANE + 2.5, -353, 25, Math.PI),
      },
      {
        id: 'rh-ped-w',
        type: 'pedestrian',
        color: '#ffeb3b',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: straightTrajectory(-213, CROSS_STREET_2 - 12, -241, CROSS_STREET_2 - 12, 10, Math.PI / 2)
          .map(p => ({ ...p, time: p.time + 8 })),
      },
      {
        id: 'rh-ped-e',
        type: 'pedestrian',
        color: '#e91e63',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: straightTrajectory(-241, CROSS_STREET_2 + 12, -213, CROSS_STREET_2 + 12, 12, -Math.PI / 2)
          .map(p => ({ ...p, time: p.time + 14 })),
      },
      {
        id: 'rh-oncoming-1',
        type: 'vehicle',
        color: '#9c27b0',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(LEFT_LANE, -333, LEFT_LANE, -633, 12, 0)
          .map(p => ({ ...p, time: p.time + 2 })),
      },
      {
        id: 'rh-oncoming-2',
        type: 'vehicle',
        color: '#00695c',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(LEFT_LANE, -283, LEFT_LANE, -633, 14, 0)
          .map(p => ({ ...p, time: p.time + 8 })),
      },
      {
        id: 'rh-jaywalker',
        type: 'pedestrian',
        color: '#4caf50',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: straightTrajectory(-213, -393, -241, -393, 6, Math.PI / 2)
          .map(p => ({ ...p, time: p.time + 18 })),
      },
    ],
    successCondition: {
      type: 'reach_position',
      target: { x: RIGHT_LANE, z: -333, radius: 15 },
    },
  },

  // Scenario 8: Highway Pile-Up
  {
    id: 'highway-pileup',
    name: 'Highway Pile-Up',
    description: 'A chain-reaction accident ahead — dodge wrecks, debris, workers, and an ambulance',
    duration: 25,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -533,
      rotation: Math.PI,
      initialSpeed: 0.2,
    },
    entities: [
      {
        id: 'hp-wreck-1',
        type: 'obstacle',
        color: '#b71c1c',
        dimensions: { width: 2.5, height: 1.2, depth: 4.5 },
        trajectory: [{ time: 0, x: RIGHT_LANE, z: -413, rotation: 0.5 }],
      },
      {
        id: 'hp-wreck-2',
        type: 'obstacle',
        color: '#1a237e',
        dimensions: { width: 2.5, height: 1.2, depth: 4.5 },
        trajectory: [{ time: 0, x: MAIN_ROAD_CENTER, z: -409, rotation: -0.9 }],
      },
      {
        id: 'hp-debris-1',
        type: 'obstacle',
        color: '#ff5722',
        dimensions: { width: 1, height: 0.3, depth: 1 },
        trajectory: [{ time: 0, x: RIGHT_LANE + 1, z: -423, rotation: 0.5 }],
      },
      {
        id: 'hp-debris-2',
        type: 'obstacle',
        color: '#ff5722',
        dimensions: { width: 0.8, height: 0.3, depth: 0.8 },
        trajectory: [{ time: 0, x: RIGHT_LANE - 1.5, z: -403, rotation: 1.2 }],
      },
      {
        id: 'hp-worker-1',
        type: 'pedestrian',
        color: '#ff6f00',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: [
          { time: 0, x: RIGHT_LANE + 3, z: -415, rotation: Math.PI / 2 },
          { time: 3, x: RIGHT_LANE + 1, z: -415, rotation: Math.PI / 2 },
          { time: 5, x: RIGHT_LANE, z: -411, rotation: Math.PI },
          { time: 8, x: RIGHT_LANE - 1, z: -408, rotation: -Math.PI / 2 },
          { time: 11, x: RIGHT_LANE + 2, z: -408, rotation: -Math.PI / 2 },
          { time: 14, x: RIGHT_LANE + 3, z: -413, rotation: 0 },
          { time: 17, x: RIGHT_LANE + 3, z: -418, rotation: 0 },
          { time: 20, x: RIGHT_LANE, z: -418, rotation: Math.PI / 2 },
          { time: 25, x: RIGHT_LANE - 2, z: -418, rotation: Math.PI / 2 },
        ],
      },
      {
        id: 'hp-worker-2',
        type: 'pedestrian',
        color: '#ff6f00',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: [
          { time: 0, x: LEFT_LANE - 2, z: -411, rotation: -Math.PI / 2 },
          { time: 4, x: MAIN_ROAD_CENTER, z: -411, rotation: -Math.PI / 2 },
          { time: 7, x: MAIN_ROAD_CENTER + 1, z: -415, rotation: 0 },
          { time: 10, x: MAIN_ROAD_CENTER, z: -419, rotation: Math.PI / 2 },
          { time: 13, x: LEFT_LANE - 2, z: -419, rotation: Math.PI / 2 },
          { time: 16, x: LEFT_LANE - 2, z: -413, rotation: Math.PI },
          { time: 25, x: LEFT_LANE - 2, z: -408, rotation: Math.PI },
        ],
      },
      {
        id: 'hp-swerve-car',
        type: 'vehicle',
        color: '#00bcd4',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: [
          { time: 4, x: RIGHT_LANE, z: -483, rotation: Math.PI },
          { time: 6, x: RIGHT_LANE, z: -453, rotation: Math.PI },
          { time: 7, x: RIGHT_LANE, z: -438, rotation: Math.PI },
          { time: 8, x: RIGHT_LANE + 3, z: -428, rotation: Math.PI - 0.4 },
          { time: 9, x: LEFT_LANE, z: -418, rotation: Math.PI },
          { time: 10, x: LEFT_LANE, z: -408, rotation: Math.PI },
          { time: 12, x: LEFT_LANE, z: -383, rotation: Math.PI },
          { time: 15, x: LEFT_LANE, z: -333, rotation: Math.PI },
        ],
      },
      {
        id: 'hp-ambulance',
        type: 'vehicle',
        color: '#f44336',
        dimensions: { width: 2.2, height: 2.2, depth: 6 },
        trajectory: [
          { time: 10, x: LEFT_LANE, z: -583, rotation: Math.PI },
          { time: 13, x: LEFT_LANE, z: -483, rotation: Math.PI },
          { time: 16, x: LEFT_LANE, z: -413, rotation: Math.PI },
          { time: 17, x: LEFT_LANE, z: -403, rotation: Math.PI },
          { time: 25, x: LEFT_LANE, z: -398, rotation: Math.PI },
        ],
      },
    ],
    successCondition: { type: 'no_collision' },
  },

  // Scenario 9: School Zone
  {
    id: 'school-zone',
    name: 'School Zone Chaos',
    description: 'Navigate a school zone with a stopped bus, crossing children, and unpredictable pedestrians',
    duration: 30,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -533,
      rotation: Math.PI,
      initialSpeed: 0.1,
    },
    entities: [
      {
        id: 'sz-bus',
        type: 'vehicle',
        color: '#f9a825',
        dimensions: { width: 2.5, height: 2.5, depth: 8 },
        trajectory: [{ time: 0, x: RIGHT_LANE, z: -433, rotation: Math.PI }],
      },
      {
        id: 'sz-child-1',
        type: 'pedestrian',
        color: '#2196f3',
        dimensions: { width: 0.4, height: 1.4, depth: 0.4 },
        trajectory: straightTrajectory(-213, -437, -241, -437, 8, Math.PI / 2)
          .map(p => ({ ...p, time: p.time + 4 })),
      },
      {
        id: 'sz-child-2',
        type: 'pedestrian',
        color: '#4caf50',
        dimensions: { width: 0.4, height: 1.4, depth: 0.4 },
        trajectory: straightTrajectory(-213, -435, -241, -435, 9, Math.PI / 2)
          .map(p => ({ ...p, time: p.time + 5 })),
      },
      {
        id: 'sz-child-3',
        type: 'pedestrian',
        color: '#ff5722',
        dimensions: { width: 0.4, height: 1.4, depth: 0.4 },
        trajectory: straightTrajectory(-213, -431, -241, -431, 7, Math.PI / 2)
          .map(p => ({ ...p, time: p.time + 7 })),
      },
      {
        id: 'sz-child-4',
        type: 'pedestrian',
        color: '#9c27b0',
        dimensions: { width: 0.4, height: 1.4, depth: 0.4 },
        trajectory: straightTrajectory(-241, -429, -213, -429, 8, -Math.PI / 2)
          .map(p => ({ ...p, time: p.time + 10 })),
      },
      {
        id: 'sz-guard',
        type: 'pedestrian',
        color: '#ff6f00',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: [
          { time: 0, x: RIGHT_LANE + 3, z: -439, rotation: -Math.PI / 2 },
          { time: 3, x: RIGHT_LANE + 3, z: -439, rotation: -Math.PI / 2 },
          { time: 5, x: RIGHT_LANE, z: -439, rotation: -Math.PI / 2 },
          { time: 8, x: RIGHT_LANE - 2, z: -439, rotation: -Math.PI / 2 },
          { time: 12, x: RIGHT_LANE - 2, z: -439, rotation: Math.PI / 2 },
          { time: 15, x: RIGHT_LANE + 3, z: -439, rotation: Math.PI / 2 },
          { time: 18, x: RIGHT_LANE + 3, z: -439, rotation: -Math.PI / 2 },
          { time: 20, x: RIGHT_LANE, z: -439, rotation: -Math.PI / 2 },
          { time: 25, x: RIGHT_LANE + 3, z: -439, rotation: Math.PI / 2 },
        ],
      },
      {
        id: 'sz-cyclist',
        type: 'bicycle',
        color: '#00bcd4',
        dimensions: { width: 0.8, height: 1.2, depth: 2 },
        trajectory: straightTrajectory(RIGHT_LANE + 3, -483, RIGHT_LANE + 3, -383, 25, Math.PI),
      },
      {
        id: 'sz-slow-car',
        type: 'vehicle',
        color: '#607d8b',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: [
          { time: 0, x: LEFT_LANE, z: -473, rotation: Math.PI },
          { time: 3, x: LEFT_LANE, z: -463, rotation: Math.PI },
          { time: 6, x: LEFT_LANE, z: -453, rotation: Math.PI },
          { time: 10, x: LEFT_LANE, z: -448, rotation: Math.PI },
          { time: 14, x: LEFT_LANE, z: -445, rotation: Math.PI },
          { time: 20, x: LEFT_LANE, z: -443, rotation: Math.PI },
          { time: 25, x: LEFT_LANE, z: -428, rotation: Math.PI },
          { time: 30, x: LEFT_LANE, z: -403, rotation: Math.PI },
        ],
      },
      {
        id: 'sz-oncoming',
        type: 'vehicle',
        color: '#e91e63',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(LEFT_LANE, -383, LEFT_LANE, -583, 12, 0)
          .map(p => ({ ...p, time: p.time + 15 })),
      },
      {
        id: 'sz-jaywalker',
        type: 'pedestrian',
        color: '#e040fb',
        dimensions: { width: 0.4, height: 1.4, depth: 0.4 },
        trajectory: [
          { time: 20, x: -213, z: -403, rotation: Math.PI / 2 },
          { time: 21, x: -218, z: -403, rotation: Math.PI / 2 },
          { time: 22, x: -223, z: -403, rotation: Math.PI / 2 },
          { time: 23, x: -228, z: -403, rotation: Math.PI / 2 },
          { time: 24, x: -233, z: -403, rotation: Math.PI / 2 },
          { time: 25, x: -238, z: -403, rotation: Math.PI / 2 },
        ],
      },
    ],
    successCondition: { type: 'no_collision' },
  },

  // Scenario 10: Construction Zone
  {
    id: 'construction-zone',
    name: 'Construction Zone',
    description: 'Thread through a narrowed construction zone with barriers, workers, and merging traffic',
    duration: 25,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -533,
      rotation: Math.PI,
      initialSpeed: 0.12,
    },
    entities: [
      {
        id: 'cz-barrier-1',
        type: 'obstacle',
        color: '#ff6f00',
        dimensions: { width: 3, height: 1, depth: 1 },
        trajectory: [{ time: 0, x: RIGHT_LANE + 2, z: -463, rotation: 0.2 }],
      },
      {
        id: 'cz-barrier-2',
        type: 'obstacle',
        color: '#ff6f00',
        dimensions: { width: 3, height: 1, depth: 1.5 },
        trajectory: [{ time: 0, x: RIGHT_LANE - 2, z: -438, rotation: -0.15 }],
      },
      {
        id: 'cz-barrier-3',
        type: 'obstacle',
        color: '#f57f17',
        dimensions: { width: 2.5, height: 0.8, depth: 1 },
        trajectory: [{ time: 0, x: RIGHT_LANE + 1.5, z: -408, rotation: 0.1 }],
      },
      {
        id: 'cz-worker-1',
        type: 'pedestrian',
        color: '#ff8f00',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: [
          { time: 0, x: RIGHT_LANE - 2, z: -453, rotation: Math.PI },
          { time: 3, x: RIGHT_LANE - 2, z: -445, rotation: Math.PI },
          { time: 5, x: RIGHT_LANE, z: -445, rotation: -Math.PI / 2 },
          { time: 8, x: RIGHT_LANE + 2, z: -445, rotation: -Math.PI / 2 },
          { time: 11, x: RIGHT_LANE + 2, z: -453, rotation: 0 },
          { time: 14, x: RIGHT_LANE, z: -453, rotation: Math.PI / 2 },
          { time: 17, x: RIGHT_LANE - 2, z: -453, rotation: Math.PI / 2 },
          { time: 25, x: RIGHT_LANE - 2, z: -453, rotation: Math.PI / 2 },
        ],
      },
      {
        id: 'cz-worker-2',
        type: 'pedestrian',
        color: '#ff8f00',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: [
          { time: 0, x: LEFT_LANE + 2, z: -428, rotation: 0 },
          { time: 5, x: LEFT_LANE + 2, z: -433, rotation: 0 },
          { time: 8, x: LEFT_LANE, z: -433, rotation: Math.PI / 2 },
          { time: 12, x: RIGHT_LANE + 3, z: -433, rotation: Math.PI / 2 },
          { time: 16, x: RIGHT_LANE + 3, z: -428, rotation: Math.PI },
          { time: 20, x: LEFT_LANE + 2, z: -428, rotation: -Math.PI / 2 },
          { time: 25, x: LEFT_LANE + 2, z: -423, rotation: Math.PI },
        ],
      },
      {
        id: 'cz-truck',
        type: 'vehicle',
        color: '#f57f17',
        dimensions: { width: 2.5, height: 2.5, depth: 7 },
        trajectory: straightTrajectory(LEFT_LANE - 1, -413, LEFT_LANE - 1, -353, 25, Math.PI),
      },
      {
        id: 'cz-merge-car',
        type: 'vehicle',
        color: '#3f51b5',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: [
          { time: 6, x: LEFT_LANE, z: -473, rotation: Math.PI },
          { time: 8, x: LEFT_LANE, z: -458, rotation: Math.PI },
          { time: 10, x: LEFT_LANE - 2, z: -448, rotation: Math.PI + 0.2 },
          { time: 12, x: RIGHT_LANE + 1, z: -438, rotation: Math.PI },
          { time: 14, x: RIGHT_LANE, z: -423, rotation: Math.PI },
          { time: 16, x: RIGHT_LANE, z: -403, rotation: Math.PI },
          { time: 20, x: RIGHT_LANE, z: -363, rotation: Math.PI },
        ],
      },
      {
        id: 'cz-oncoming',
        type: 'vehicle',
        color: '#e91e63',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(MAIN_ROAD_CENTER + 1, -373, MAIN_ROAD_CENTER + 1, -523, 10, 0)
          .map(p => ({ ...p, time: p.time + 5 })),
      },
      {
        id: 'cz-cyclist',
        type: 'bicycle',
        color: '#00e676',
        dimensions: { width: 0.8, height: 1.2, depth: 2 },
        trajectory: [
          { time: 2, x: RIGHT_LANE + 3, z: -493, rotation: Math.PI },
          { time: 5, x: RIGHT_LANE + 3, z: -473, rotation: Math.PI },
          { time: 7, x: RIGHT_LANE + 1, z: -458, rotation: Math.PI + 0.15 },
          { time: 9, x: RIGHT_LANE - 1, z: -443, rotation: Math.PI - 0.15 },
          { time: 11, x: RIGHT_LANE + 1, z: -428, rotation: Math.PI + 0.15 },
          { time: 13, x: RIGHT_LANE + 3, z: -413, rotation: Math.PI },
          { time: 16, x: RIGHT_LANE + 3, z: -393, rotation: Math.PI },
          { time: 20, x: RIGHT_LANE + 3, z: -363, rotation: Math.PI },
        ],
      },
    ],
    successCondition: { type: 'no_collision' },
  },

  // Scenario 11: Double Intersection Gauntlet
  {
    id: 'double-intersection',
    name: 'Double Intersection Gauntlet',
    description: 'Run two busy intersections back-to-back with cross traffic, cyclists, and pedestrians',
    duration: 35,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -533,
      rotation: Math.PI,
      initialSpeed: 0.2,
    },
    entities: [
      {
        id: 'di-int1-car-e',
        type: 'vehicle',
        color: '#e53935',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(-303, CROSS_STREET_2 - 4, -143, CROSS_STREET_2 - 4, 7, -Math.PI / 2)
          .map(p => ({ ...p, time: p.time + 3 })),
      },
      {
        id: 'di-int1-car-w',
        type: 'vehicle',
        color: '#1565c0',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(-143, CROSS_STREET_2 + 4, -323, CROSS_STREET_2 + 4, 7, Math.PI / 2)
          .map(p => ({ ...p, time: p.time + 5 })),
      },
      {
        id: 'di-int1-ped',
        type: 'pedestrian',
        color: '#ffeb3b',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: straightTrajectory(-213, CROSS_STREET_2 - 14, -241, CROSS_STREET_2 - 14, 8, Math.PI / 2)
          .map(p => ({ ...p, time: p.time + 6 })),
      },
      {
        id: 'di-cyclist',
        type: 'bicycle',
        color: '#4caf50',
        dimensions: { width: 0.8, height: 1.2, depth: 2 },
        trajectory: straightTrajectory(RIGHT_LANE + 2.5, -403, RIGHT_LANE + 2.5, -263, 20, Math.PI)
          .map(p => ({ ...p, time: p.time + 8 })),
      },
      {
        id: 'di-oncoming',
        type: 'vehicle',
        color: '#9c27b0',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(LEFT_LANE, -283, LEFT_LANE, -583, 14, 0)
          .map(p => ({ ...p, time: p.time + 4 })),
      },
      {
        id: 'di-debris',
        type: 'obstacle',
        color: '#ff5722',
        dimensions: { width: 1.5, height: 0.5, depth: 1.5 },
        trajectory: [{ time: 0, x: RIGHT_LANE - 0.5, z: -333, rotation: 0.3 }],
      },
      {
        id: 'di-int2-car-e',
        type: 'vehicle',
        color: '#f44336',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(-323, CROSS_STREET_3 - 4, -123, CROSS_STREET_3 - 4, 6, -Math.PI / 2)
          .map(p => ({ ...p, time: p.time + 15 })),
      },
      {
        id: 'di-int2-truck',
        type: 'vehicle',
        color: '#455a64',
        dimensions: { width: 2.4, height: 2.2, depth: 6 },
        trajectory: straightTrajectory(-123, CROSS_STREET_3 + 4, -323, CROSS_STREET_3 + 4, 8, Math.PI / 2)
          .map(p => ({ ...p, time: p.time + 17 })),
      },
      {
        id: 'di-int2-fast',
        type: 'vehicle',
        color: '#00c853',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(-323, CROSS_STREET_3 - 8, -123, CROSS_STREET_3 - 8, 5, -Math.PI / 2)
          .map(p => ({ ...p, time: p.time + 20 })),
      },
      {
        id: 'di-int2-ped',
        type: 'pedestrian',
        color: '#e91e63',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: straightTrajectory(-241, CROSS_STREET_3 + 14, -213, CROSS_STREET_3 + 14, 10, -Math.PI / 2)
          .map(p => ({ ...p, time: p.time + 18 })),
      },
    ],
    successCondition: {
      type: 'reach_position',
      target: { x: RIGHT_LANE, z: -233, radius: 15 },
    },
  },
];

export function getScenarioById(id: string): Scenario | undefined {
  return sampleScenarios.find(s => s.id === id);
}
