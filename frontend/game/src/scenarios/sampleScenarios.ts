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
const MAIN_ROAD_CENTER = -225.91;  // Z-axis street center X coordinate
const ROAD_WIDTH = 14;
const LANE_OFFSET = 3.5;  // Distance from center to lane center

// Lane positions (X coordinates)
const RIGHT_LANE = MAIN_ROAD_CENTER - LANE_OFFSET;   // -229.41 (northbound, west side)
const LEFT_LANE = MAIN_ROAD_CENTER + LANE_OFFSET;    // -222.41 (southbound/oncoming, east side)

// Cross street positions (Z coordinates)
const CROSS_STREET_1 = -570.98;
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

const handcraftedScenarios: Scenario[] = [
  // Scenario 1: Oncoming traffic on the same road
  {
    id: 'oncoming-traffic',
    name: 'Oncoming Traffic',
    description: 'Avoid the oncoming vehicle while staying in your lane',
    duration: 15,
    playerSpawn: {
      x: RIGHT_LANE,
      z: -533,
      rotation: Math.PI,  // Facing north (+Z)
      initialSpeed: 0.2,
    },
    entities: [
      {
        id: 'car-1',
        type: 'vehicle',
        color: '#e53935',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          LEFT_LANE, -283,   // was -750 (+467)
          LEFT_LANE, -583,   // was -1050 (+467)
          12,
          0
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
          { time: 0, x: LEFT_LANE, z: -433, rotation: Math.PI },       // was -900
          { time: 2, x: LEFT_LANE, z: -413, rotation: Math.PI },       // was -880
          { time: 4, x: LEFT_LANE + 2, z: -393, rotation: Math.PI - 0.3 },  // was -860
          { time: 6, x: RIGHT_LANE, z: -373, rotation: Math.PI },      // was -840
          { time: 8, x: RIGHT_LANE, z: -343, rotation: Math.PI },      // was -810
          { time: 10, x: RIGHT_LANE, z: -323, rotation: Math.PI },     // was -790
          { time: 12, x: RIGHT_LANE, z: -293, rotation: Math.PI },     // was -760
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
      z: -533,
      rotation: Math.PI,
      initialSpeed: 0.15,
    },
    entities: [
      // Cross traffic from west - traveling east (+X)
      {
        id: 'car-1',
        type: 'vehicle',
        color: '#43a047',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          -323, CROSS_STREET_2,   // was -1200
          -123, CROSS_STREET_2,   // was -1000
          8,
          -Math.PI / 2
        ),
      },
      // Cross traffic from east, delayed - traveling west (-X)
      {
        id: 'car-2',
        type: 'vehicle',
        color: '#fb8c00',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          -123, CROSS_STREET_2 + 4,   // was -1000
          -323, CROSS_STREET_2 + 4,   // was -1200
          8,
          Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 6 })),
      },
      // Pedestrian crossing - traveling east (+X)
      {
        id: 'ped-1',
        type: 'pedestrian',
        color: '#ffeb3b',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: straightTrajectory(
          -213, CROSS_STREET_2 - 10,   // was -1115
          -238, CROSS_STREET_2 - 10,   // was -1090 (note: ped walks west here)
          8,
          -Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 12 })),
      },
    ],
    successCondition: {
      type: 'reach_position',
      target: { x: RIGHT_LANE, z: -333, radius: 10 },  // was -800
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
        trajectory: [{ time: 0, x: RIGHT_LANE - 1, z: -483, rotation: 0 }],  // was -950
      },
      {
        id: 'obstacle-2',
        type: 'obstacle',
        color: '#ff5722',
        dimensions: { width: 1.5, height: 0.5, depth: 1.5 },
        trajectory: [{ time: 0, x: RIGHT_LANE + 1, z: -433, rotation: 0 }],  // was -900
      },
      {
        id: 'obstacle-3',
        type: 'obstacle',
        color: '#ff5722',
        dimensions: { width: 1.5, height: 0.5, depth: 1.5 },
        trajectory: [{ time: 0, x: RIGHT_LANE, z: -383, rotation: 0 }],  // was -850
      },
      {
        id: 'obstacle-4',
        type: 'obstacle',
        color: '#ff5722',
        dimensions: { width: 1.5, height: 0.5, depth: 1.5 },
        trajectory: [{ time: 0, x: RIGHT_LANE - 2, z: -333, rotation: 0 }],  // was -800
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
          { time: 0, x: RIGHT_LANE, z: -453, rotation: Math.PI },    // was -920
          { time: 2, x: RIGHT_LANE, z: -433, rotation: Math.PI },    // was -900
          { time: 4, x: RIGHT_LANE, z: -413, rotation: Math.PI },    // was -880
          { time: 6, x: RIGHT_LANE, z: -403, rotation: Math.PI },    // was -870
          { time: 8, x: RIGHT_LANE, z: -398, rotation: Math.PI },    // was -865
          { time: 10, x: RIGHT_LANE, z: -396, rotation: Math.PI },   // was -863
          { time: 12, x: RIGHT_LANE, z: -393, rotation: Math.PI },   // was -860
          { time: 14, x: RIGHT_LANE, z: -373, rotation: Math.PI },   // was -840
          { time: 18, x: RIGHT_LANE, z: -313, rotation: Math.PI },   // was -780
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
      z: -533,
      rotation: Math.PI,
      initialSpeed: 0.2,
    },
    entities: [
      // Slow car ahead in our lane
      {
        id: 'slow-car',
        type: 'vehicle',
        color: '#795548',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          RIGHT_LANE, -483,   // was -950
          RIGHT_LANE, -383,   // was -850
          20,
          Math.PI
        ),
      },
      // Fast car in left lane going same direction
      {
        id: 'fast-car',
        type: 'vehicle',
        color: '#00bcd4',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          LEFT_LANE, -513,   // was -980
          LEFT_LANE, -233,   // was -700
          12,
          Math.PI
        ),
      },
      // Oncoming car in far lane
      {
        id: 'oncoming-car',
        type: 'vehicle',
        color: '#e91e63',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          MAIN_ROAD_CENTER - LANE_OFFSET - 4, -283,   // was -750
          MAIN_ROAD_CENTER - LANE_OFFSET - 4, -583,   // was -1050
          10,
          0
        ),
      },
    ],
    successCondition: {
      type: 'reach_position',
      target: { x: RIGHT_LANE, z: -333, radius: 15 },  // was -800
    },
  },

  // ================================================================
  // COMPLEX SCENARIOS (7-11): 8-10 entities each
  // ================================================================

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
      // === Wave 1 cross traffic (t=4-12) ===
      {
        id: 'rh-cross-e1',
        type: 'vehicle',
        color: '#e53935',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          -303, CROSS_STREET_2 - 4,   // was -1180
          -143, CROSS_STREET_2 - 4,   // was -1020
          8, -Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 4 })),
      },
      {
        id: 'rh-cross-w1',
        type: 'vehicle',
        color: '#1e88e5',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          -143, CROSS_STREET_2 + 4,   // was -1020
          -323, CROSS_STREET_2 + 4,   // was -1200
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
          -323, CROSS_STREET_2 - 8,   // was -1200
          -123, CROSS_STREET_2 - 8,   // was -1000
          6, -Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 10 })),
      },
      {
        id: 'rh-cross-suv',
        type: 'vehicle',
        color: '#37474f',
        dimensions: { width: 2.4, height: 2, depth: 5 },
        trajectory: straightTrajectory(
          -123, CROSS_STREET_2 + 8,   // was -1000
          -323, CROSS_STREET_2 + 8,   // was -1200
          7, Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 11 })),
      },
      // === Cyclist in right lane shoulder ===
      {
        id: 'rh-cyclist',
        type: 'bicycle',
        color: '#ff9800',
        dimensions: { width: 0.8, height: 1.2, depth: 2 },
        trajectory: straightTrajectory(
          RIGHT_LANE + 2.5, -493,   // was -960
          RIGHT_LANE + 2.5, -353,   // was -820
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
          -213, CROSS_STREET_2 - 12,   // was -1090
          -241, CROSS_STREET_2 - 12,   // was -1118
          10, Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 8 })),
      },
      {
        id: 'rh-ped-e',
        type: 'pedestrian',
        color: '#e91e63',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: straightTrajectory(
          -241, CROSS_STREET_2 + 12,   // was -1118
          -213, CROSS_STREET_2 + 12,   // was -1090
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
          LEFT_LANE, -333,   // was -800
          LEFT_LANE, -633,   // was -1100
          12, 0
        ).map(p => ({ ...p, time: p.time + 2 })),
      },
      {
        id: 'rh-oncoming-2',
        type: 'vehicle',
        color: '#00695c',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          LEFT_LANE, -283,   // was -750
          LEFT_LANE, -633,   // was -1100
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
          -213, -393,   // was -1090, -860
          -241, -393,   // was -1118, -860
          6, Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 18 })),
      },
    ],
    successCondition: {
      type: 'reach_position',
      target: { x: RIGHT_LANE, z: -333, radius: 15 },  // was -800
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
      // === Static crash scene (wrecks + debris) ===
      {
        id: 'hp-wreck-1',
        type: 'obstacle',
        color: '#b71c1c',
        dimensions: { width: 2.5, height: 1.2, depth: 4.5 },
        trajectory: [{ time: 0, x: RIGHT_LANE, z: -413, rotation: 0.5 }],  // was -880
      },
      {
        id: 'hp-wreck-2',
        type: 'obstacle',
        color: '#1a237e',
        dimensions: { width: 2.5, height: 1.2, depth: 4.5 },
        trajectory: [{ time: 0, x: MAIN_ROAD_CENTER, z: -409, rotation: -0.9 }],  // was -876
      },
      {
        id: 'hp-debris-1',
        type: 'obstacle',
        color: '#ff5722',
        dimensions: { width: 1, height: 0.3, depth: 1 },
        trajectory: [{ time: 0, x: RIGHT_LANE + 1, z: -423, rotation: 0.5 }],  // was -890
      },
      {
        id: 'hp-debris-2',
        type: 'obstacle',
        color: '#ff5722',
        dimensions: { width: 0.8, height: 0.3, depth: 0.8 },
        trajectory: [{ time: 0, x: RIGHT_LANE - 1.5, z: -403, rotation: 1.2 }],  // was -870
      },
      // === Emergency workers patrolling the scene ===
      {
        id: 'hp-worker-1',
        type: 'pedestrian',
        color: '#ff6f00',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: [
          { time: 0, x: RIGHT_LANE + 3, z: -415, rotation: Math.PI / 2 },    // was -882
          { time: 3, x: RIGHT_LANE + 1, z: -415, rotation: Math.PI / 2 },
          { time: 5, x: RIGHT_LANE, z: -411, rotation: Math.PI },             // was -878
          { time: 8, x: RIGHT_LANE - 1, z: -408, rotation: -Math.PI / 2 },   // was -875
          { time: 11, x: RIGHT_LANE + 2, z: -408, rotation: -Math.PI / 2 },
          { time: 14, x: RIGHT_LANE + 3, z: -413, rotation: 0 },             // was -880
          { time: 17, x: RIGHT_LANE + 3, z: -418, rotation: 0 },             // was -885
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
          { time: 0, x: LEFT_LANE - 2, z: -411, rotation: -Math.PI / 2 },    // was -878
          { time: 4, x: MAIN_ROAD_CENTER, z: -411, rotation: -Math.PI / 2 },
          { time: 7, x: MAIN_ROAD_CENTER + 1, z: -415, rotation: 0 },        // was -882
          { time: 10, x: MAIN_ROAD_CENTER, z: -419, rotation: Math.PI / 2 }, // was -886
          { time: 13, x: LEFT_LANE - 2, z: -419, rotation: Math.PI / 2 },
          { time: 16, x: LEFT_LANE - 2, z: -413, rotation: Math.PI },         // was -880
          { time: 25, x: LEFT_LANE - 2, z: -408, rotation: Math.PI },         // was -875
        ],
      },
      // === Car ahead that swerves around the wreck ===
      {
        id: 'hp-swerve-car',
        type: 'vehicle',
        color: '#00bcd4',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: [
          { time: 4, x: RIGHT_LANE, z: -483, rotation: Math.PI },      // was -950
          { time: 6, x: RIGHT_LANE, z: -453, rotation: Math.PI },      // was -920
          { time: 7, x: RIGHT_LANE, z: -438, rotation: Math.PI },      // was -905
          { time: 8, x: RIGHT_LANE + 3, z: -428, rotation: Math.PI - 0.4 },  // was -895
          { time: 9, x: LEFT_LANE, z: -418, rotation: Math.PI },       // was -885
          { time: 10, x: LEFT_LANE, z: -408, rotation: Math.PI },      // was -875
          { time: 12, x: LEFT_LANE, z: -383, rotation: Math.PI },      // was -850
          { time: 15, x: LEFT_LANE, z: -333, rotation: Math.PI },      // was -800
        ],
      },
      // === Ambulance approaching fast from behind in the left lane ===
      {
        id: 'hp-ambulance',
        type: 'vehicle',
        color: '#f44336',
        dimensions: { width: 2.2, height: 2.2, depth: 6 },
        trajectory: [
          { time: 10, x: LEFT_LANE, z: -583, rotation: Math.PI },   // was -1050
          { time: 13, x: LEFT_LANE, z: -483, rotation: Math.PI },   // was -950
          { time: 16, x: LEFT_LANE, z: -413, rotation: Math.PI },   // was -880
          { time: 17, x: LEFT_LANE, z: -403, rotation: Math.PI },   // was -870
          { time: 25, x: LEFT_LANE, z: -398, rotation: Math.PI },   // was -865
        ],
      },
    ],
    successCondition: {
      type: 'no_collision',
    },
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
      // === Stopped school bus blocking the right lane ===
      {
        id: 'sz-bus',
        type: 'vehicle',
        color: '#f9a825',
        dimensions: { width: 2.5, height: 2.5, depth: 8 },
        trajectory: [{ time: 0, x: RIGHT_LANE, z: -433, rotation: Math.PI }],  // was -900
      },
      // === Children crossing in front of the bus (staggered timing) ===
      {
        id: 'sz-child-1',
        type: 'pedestrian',
        color: '#2196f3',
        dimensions: { width: 0.4, height: 1.4, depth: 0.4 },
        trajectory: straightTrajectory(
          -213, -437, -241, -437, 8, Math.PI / 2   // was -1090, -904, -1118, -904
        ).map(p => ({ ...p, time: p.time + 4 })),
      },
      {
        id: 'sz-child-2',
        type: 'pedestrian',
        color: '#4caf50',
        dimensions: { width: 0.4, height: 1.4, depth: 0.4 },
        trajectory: straightTrajectory(
          -213, -435, -241, -435, 9, Math.PI / 2   // was -1090, -902, -1118, -902
        ).map(p => ({ ...p, time: p.time + 5 })),
      },
      {
        id: 'sz-child-3',
        type: 'pedestrian',
        color: '#ff5722',
        dimensions: { width: 0.4, height: 1.4, depth: 0.4 },
        trajectory: straightTrajectory(
          -213, -431, -241, -431, 7, Math.PI / 2   // was -1090, -898, -1118, -898
        ).map(p => ({ ...p, time: p.time + 7 })),
      },
      {
        id: 'sz-child-4',
        type: 'pedestrian',
        color: '#9c27b0',
        dimensions: { width: 0.4, height: 1.4, depth: 0.4 },
        trajectory: straightTrajectory(
          -241, -429, -213, -429, 8, -Math.PI / 2   // was -1118, -896, -1090, -896
        ).map(p => ({ ...p, time: p.time + 10 })),
      },
      // === Crossing guard walking back and forth ===
      {
        id: 'sz-guard',
        type: 'pedestrian',
        color: '#ff6f00',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: [
          { time: 0, x: RIGHT_LANE + 3, z: -439, rotation: -Math.PI / 2 },   // was -906
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
      // === Cyclist going same direction, slow ===
      {
        id: 'sz-cyclist',
        type: 'bicycle',
        color: '#00bcd4',
        dimensions: { width: 0.8, height: 1.2, depth: 2 },
        trajectory: straightTrajectory(
          RIGHT_LANE + 3, -483,   // was -950
          RIGHT_LANE + 3, -383,   // was -850
          25, Math.PI
        ),
      },
      // === Slow car in left lane (parent dropping off) ===
      {
        id: 'sz-slow-car',
        type: 'vehicle',
        color: '#607d8b',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: [
          { time: 0, x: LEFT_LANE, z: -473, rotation: Math.PI },    // was -940
          { time: 3, x: LEFT_LANE, z: -463, rotation: Math.PI },    // was -930
          { time: 6, x: LEFT_LANE, z: -453, rotation: Math.PI },    // was -920
          { time: 10, x: LEFT_LANE, z: -448, rotation: Math.PI },   // was -915
          { time: 14, x: LEFT_LANE, z: -445, rotation: Math.PI },   // was -912
          { time: 20, x: LEFT_LANE, z: -443, rotation: Math.PI },   // was -910
          { time: 25, x: LEFT_LANE, z: -428, rotation: Math.PI },   // was -895
          { time: 30, x: LEFT_LANE, z: -403, rotation: Math.PI },   // was -870
        ],
      },
      // === Oncoming car in left lane (appears later) ===
      {
        id: 'sz-oncoming',
        type: 'vehicle',
        color: '#e91e63',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          LEFT_LANE, -383, LEFT_LANE, -583, 12, 0   // was -850, -1050
        ).map(p => ({ ...p, time: p.time + 15 })),
      },
      // === Late jaywalking child — surprise hazard ===
      {
        id: 'sz-jaywalker',
        type: 'pedestrian',
        color: '#e040fb',
        dimensions: { width: 0.4, height: 1.4, depth: 0.4 },
        trajectory: [
          { time: 20, x: -213, z: -403, rotation: Math.PI / 2 },   // was -1090, -870
          { time: 21, x: -218, z: -403, rotation: Math.PI / 2 },   // was -1095
          { time: 22, x: -223, z: -403, rotation: Math.PI / 2 },   // was -1100
          { time: 23, x: -228, z: -403, rotation: Math.PI / 2 },   // was -1105
          { time: 24, x: -233, z: -403, rotation: Math.PI / 2 },   // was -1110
          { time: 25, x: -238, z: -403, rotation: Math.PI / 2 },   // was -1115
        ],
      },
    ],
    successCondition: {
      type: 'no_collision',
    },
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
      // === Barriers creating a slalom through the right lane ===
      {
        id: 'cz-barrier-1',
        type: 'obstacle',
        color: '#ff6f00',
        dimensions: { width: 3, height: 1, depth: 1 },
        trajectory: [{ time: 0, x: RIGHT_LANE + 2, z: -463, rotation: 0.2 }],  // was -930
      },
      {
        id: 'cz-barrier-2',
        type: 'obstacle',
        color: '#ff6f00',
        dimensions: { width: 3, height: 1, depth: 1.5 },
        trajectory: [{ time: 0, x: RIGHT_LANE - 2, z: -438, rotation: -0.15 }],  // was -905
      },
      {
        id: 'cz-barrier-3',
        type: 'obstacle',
        color: '#f57f17',
        dimensions: { width: 2.5, height: 0.8, depth: 1 },
        trajectory: [{ time: 0, x: RIGHT_LANE + 1.5, z: -408, rotation: 0.1 }],  // was -875
      },
      // === Workers moving around the zone ===
      {
        id: 'cz-worker-1',
        type: 'pedestrian',
        color: '#ff8f00',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: [
          { time: 0, x: RIGHT_LANE - 2, z: -453, rotation: Math.PI },      // was -920
          { time: 3, x: RIGHT_LANE - 2, z: -445, rotation: Math.PI },      // was -912
          { time: 5, x: RIGHT_LANE, z: -445, rotation: -Math.PI / 2 },
          { time: 8, x: RIGHT_LANE + 2, z: -445, rotation: -Math.PI / 2 },
          { time: 11, x: RIGHT_LANE + 2, z: -453, rotation: 0 },           // was -920
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
          { time: 0, x: LEFT_LANE + 2, z: -428, rotation: 0 },      // was -895
          { time: 5, x: LEFT_LANE + 2, z: -433, rotation: 0 },      // was -900
          { time: 8, x: LEFT_LANE, z: -433, rotation: Math.PI / 2 },
          { time: 12, x: RIGHT_LANE + 3, z: -433, rotation: Math.PI / 2 },
          { time: 16, x: RIGHT_LANE + 3, z: -428, rotation: Math.PI },  // was -895
          { time: 20, x: LEFT_LANE + 2, z: -428, rotation: -Math.PI / 2 },
          { time: 25, x: LEFT_LANE + 2, z: -423, rotation: Math.PI },   // was -890
        ],
      },
      // === Slow construction truck ahead in left lane ===
      {
        id: 'cz-truck',
        type: 'vehicle',
        color: '#f57f17',
        dimensions: { width: 2.5, height: 2.5, depth: 7 },
        trajectory: straightTrajectory(
          LEFT_LANE - 1, -413,   // was -880
          LEFT_LANE - 1, -353,   // was -820
          25, Math.PI
        ),
      },
      // === Car forced to merge from left lane into right ===
      {
        id: 'cz-merge-car',
        type: 'vehicle',
        color: '#3f51b5',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: [
          { time: 6, x: LEFT_LANE, z: -473, rotation: Math.PI },                // was -940
          { time: 8, x: LEFT_LANE, z: -458, rotation: Math.PI },                // was -925
          { time: 10, x: LEFT_LANE - 2, z: -448, rotation: Math.PI + 0.2 },    // was -915
          { time: 12, x: RIGHT_LANE + 1, z: -438, rotation: Math.PI },          // was -905
          { time: 14, x: RIGHT_LANE, z: -423, rotation: Math.PI },              // was -890
          { time: 16, x: RIGHT_LANE, z: -403, rotation: Math.PI },              // was -870
          { time: 20, x: RIGHT_LANE, z: -363, rotation: Math.PI },              // was -830
        ],
      },
      // === Oncoming car squeezed toward center line by construction ===
      {
        id: 'cz-oncoming',
        type: 'vehicle',
        color: '#e91e63',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          MAIN_ROAD_CENTER + 1, -373,   // was -840
          MAIN_ROAD_CENTER + 1, -523,   // was -990
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
          { time: 2, x: RIGHT_LANE + 3, z: -493, rotation: Math.PI },               // was -960
          { time: 5, x: RIGHT_LANE + 3, z: -473, rotation: Math.PI },               // was -940
          { time: 7, x: RIGHT_LANE + 1, z: -458, rotation: Math.PI + 0.15 },       // was -925
          { time: 9, x: RIGHT_LANE - 1, z: -443, rotation: Math.PI - 0.15 },       // was -910
          { time: 11, x: RIGHT_LANE + 1, z: -428, rotation: Math.PI + 0.15 },      // was -895
          { time: 13, x: RIGHT_LANE + 3, z: -413, rotation: Math.PI },              // was -880
          { time: 16, x: RIGHT_LANE + 3, z: -393, rotation: Math.PI },              // was -860
          { time: 20, x: RIGHT_LANE + 3, z: -363, rotation: Math.PI },              // was -830
        ],
      },
    ],
    successCondition: {
      type: 'no_collision',
    },
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
      // === First intersection: CROSS_STREET_2 (Z = -412.98) ===
      {
        id: 'di-int1-car-e',
        type: 'vehicle',
        color: '#e53935',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          -303, CROSS_STREET_2 - 4,   // was -1180
          -143, CROSS_STREET_2 - 4,   // was -1020
          7, -Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 3 })),
      },
      {
        id: 'di-int1-car-w',
        type: 'vehicle',
        color: '#1565c0',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          -143, CROSS_STREET_2 + 4,   // was -1020
          -323, CROSS_STREET_2 + 4,   // was -1200
          7, Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 5 })),
      },
      {
        id: 'di-int1-ped',
        type: 'pedestrian',
        color: '#ffeb3b',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: straightTrajectory(
          -213, CROSS_STREET_2 - 14,   // was -1090
          -241, CROSS_STREET_2 - 14,   // was -1118
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
          RIGHT_LANE + 2.5, -403,   // was -870
          RIGHT_LANE + 2.5, -263,   // was -730
          20, Math.PI
        ).map(p => ({ ...p, time: p.time + 8 })),
      },
      {
        id: 'di-oncoming',
        type: 'vehicle',
        color: '#9c27b0',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          LEFT_LANE, -283,   // was -750
          LEFT_LANE, -583,   // was -1050
          14, 0
        ).map(p => ({ ...p, time: p.time + 4 })),
      },
      {
        id: 'di-debris',
        type: 'obstacle',
        color: '#ff5722',
        dimensions: { width: 1.5, height: 0.5, depth: 1.5 },
        trajectory: [{ time: 0, x: RIGHT_LANE - 0.5, z: -333, rotation: 0.3 }],  // was -800
      },
      // === Second intersection: CROSS_STREET_3 (Z = -257.98) ===
      {
        id: 'di-int2-car-e',
        type: 'vehicle',
        color: '#f44336',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          -323, CROSS_STREET_3 - 4,   // was -1200
          -123, CROSS_STREET_3 - 4,   // was -1000
          6, -Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 15 })),
      },
      {
        id: 'di-int2-truck',
        type: 'vehicle',
        color: '#455a64',
        dimensions: { width: 2.4, height: 2.2, depth: 6 },
        trajectory: straightTrajectory(
          -123, CROSS_STREET_3 + 4,   // was -1000
          -323, CROSS_STREET_3 + 4,   // was -1200
          8, Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 17 })),
      },
      {
        id: 'di-int2-fast',
        type: 'vehicle',
        color: '#00c853',
        dimensions: { width: 2, height: 1.5, depth: 4 },
        trajectory: straightTrajectory(
          -323, CROSS_STREET_3 - 8,   // was -1200
          -123, CROSS_STREET_3 - 8,   // was -1000
          5, -Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 20 })),
      },
      {
        id: 'di-int2-ped',
        type: 'pedestrian',
        color: '#e91e63',
        dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
        trajectory: straightTrajectory(
          -241, CROSS_STREET_3 + 14,   // was -1118
          -213, CROSS_STREET_3 + 14,   // was -1090
          10, -Math.PI / 2
        ).map(p => ({ ...p, time: p.time + 18 })),
      },
    ],
    successCondition: {
      type: 'reach_position',
      target: { x: RIGHT_LANE, z: -233, radius: 15 },  // was -700
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
