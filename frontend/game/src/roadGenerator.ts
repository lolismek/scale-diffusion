/**
 * Procedural road mesh generation from CommonRoad lanelet data.
 * Creates road surfaces and lane markings for scenario-specific worlds.
 */

import * as THREE from 'three';
import { scene } from './engine';
import type {
  LaneletNetwork,
  Lanelet,
  Point2D,
  RawLaneletNetwork,
  RoadSurface,
  LaneMarking,
} from './scenarios/laneletTypes';

// ── Config ───────────────────────────────────────────────────────────────────
const ROAD_Y = 0.005;       // Road surface height
const MARKING_Y = 0.015;    // Lane marking height
const DASH_LENGTH = 3;      // Dash length in meters
const DASH_GAP = 3;         // Gap between dashes
const DASH_WIDTH = 0.15;    // Width of dashed lines
const EDGE_WIDTH = 0.12;    // Width of edge lines
const DASH_COLOR = 0xffffff; // White dashes
const EDGE_COLOR = 0xffffff; // White edges
const CENTER_COLOR = 0xdaa520; // Gold for center divider
const ROAD_COLOR = 0x333333;  // Dark gray asphalt

// ── State ────────────────────────────────────────────────────────────────────
let roadMeshes: THREE.Object3D[] = [];
let markingMesh: THREE.InstancedMesh | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse raw JSON network data into LaneletNetwork with Map */
export function parseLaneletNetwork(raw: RawLaneletNetwork): LaneletNetwork {
  const lanelets = new Map<number, Lanelet>();

  for (const ll of raw.lanelets) {
    // Convert arrays to Point2D
    const leftBound: Point2D[] = ll.leftBound.map(([x, y]) => ({ x, y }));
    const rightBound: Point2D[] = ll.rightBound.map(([x, y]) => ({ x, y }));

    // Compute centerline
    const centerline: Point2D[] = [];
    const maxLen = Math.max(leftBound.length, rightBound.length);
    for (let i = 0; i < maxLen; i++) {
      const li = Math.min(i, leftBound.length - 1);
      const ri = Math.min(i, rightBound.length - 1);
      centerline.push({
        x: (leftBound[li].x + rightBound[ri].x) / 2,
        y: (leftBound[li].y + rightBound[ri].y) / 2,
      });
    }

    // Compute average width
    let totalWidth = 0;
    const samples = Math.min(leftBound.length, rightBound.length);
    for (let i = 0; i < samples; i++) {
      const dx = leftBound[i].x - rightBound[i].x;
      const dy = leftBound[i].y - rightBound[i].y;
      totalWidth += Math.sqrt(dx * dx + dy * dy);
    }
    const width = samples > 0 ? totalWidth / samples : 3.5;

    lanelets.set(ll.id, {
      id: ll.id,
      leftBound,
      rightBound,
      centerline,
      successors: ll.successors,
      predecessors: ll.predecessors,
      adjacentLeft: ll.adjacentLeft,
      adjacentRight: ll.adjacentRight,
      width,
    });
  }

  return { lanelets, bounds: raw.bounds };
}

/** Compute length of a polyline */
function polylineLength(points: Point2D[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

/** Get point at distance along polyline */
function pointAtDistance(points: Point2D[], dist: number): { point: Point2D; angle: number } {
  let accumulated = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (accumulated + segLen >= dist) {
      const t = (dist - accumulated) / segLen;
      return {
        point: {
          x: points[i - 1].x + dx * t,
          y: points[i - 1].y + dy * t,
        },
        angle: Math.atan2(dy, dx),
      };
    }
    accumulated += segLen;
  }
  // Past end - return last point
  const last = points[points.length - 1];
  const prev = points[points.length - 2] || points[0];
  return {
    point: last,
    angle: Math.atan2(last.y - prev.y, last.x - prev.x),
  };
}

/** Collect all adjacent lanelets forming a road group */
function collectRoadGroup(
  network: LaneletNetwork,
  startId: number,
  visited: Set<number>
): Lanelet[] {
  const group: Lanelet[] = [];
  const queue = [startId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const lanelet = network.lanelets.get(id);
    if (!lanelet) continue;

    group.push(lanelet);

    // Add adjacent lanelets
    if (lanelet.adjacentLeft && !visited.has(lanelet.adjacentLeft.id)) {
      queue.push(lanelet.adjacentLeft.id);
    }
    if (lanelet.adjacentRight && !visited.has(lanelet.adjacentRight.id)) {
      queue.push(lanelet.adjacentRight.id);
    }
  }

  return group;
}

/** Sort lanelets from left to right based on position */
function sortLaneletsLeftToRight(lanelets: Lanelet[]): Lanelet[] {
  // Use average centerline position to sort
  return lanelets.slice().sort((a, b) => {
    const aMid = a.centerline[Math.floor(a.centerline.length / 2)];
    const bMid = b.centerline[Math.floor(b.centerline.length / 2)];
    // Sort by perpendicular distance - approximate with x coordinate
    return aMid.x - bMid.x;
  });
}

/** Create road boundary polygon from a group of adjacent lanelets */
function createRoadBoundary(lanelets: Lanelet[]): Point2D[] {
  if (lanelets.length === 0) return [];
  if (lanelets.length === 1) {
    // Single lanelet - use left + reversed right
    const ll = lanelets[0];
    return [...ll.leftBound, ...ll.rightBound.slice().reverse()];
  }

  // Sort lanelets left-to-right
  const sorted = sortLaneletsLeftToRight(lanelets);
  const leftmost = sorted[0];
  const rightmost = sorted[sorted.length - 1];

  // Boundary = leftmost left bound + rightmost right bound (reversed)
  return [...leftmost.leftBound, ...rightmost.rightBound.slice().reverse()];
}

// ── Road Surface Generation ──────────────────────────────────────────────────

/** Compute all road surfaces from lanelet network - one surface per lanelet */
function computeRoadSurfaces(network: LaneletNetwork): RoadSurface[] {
  const surfaces: RoadSurface[] = [];

  for (const [, lanelet] of network.lanelets) {
    // Create a polygon from left bound + reversed right bound
    const boundary: Point2D[] = [
      ...lanelet.leftBound,
      ...lanelet.rightBound.slice().reverse(),
    ];

    if (boundary.length >= 3) {
      surfaces.push({ vertices: boundary, type: 'road' });
    }
  }

  return surfaces;
}

/** Create Three.js mesh from lanelet using quad strips for precise alignment */
function createLaneletMesh(lanelet: Lanelet): THREE.Mesh {
  const left = lanelet.leftBound;
  const right = lanelet.rightBound;

  // Create vertices and indices for a quad strip
  const vertices: number[] = [];
  const indices: number[] = [];

  const numPoints = Math.min(left.length, right.length);

  for (let i = 0; i < numPoints; i++) {
    // Left vertex (y becomes -z in Three.js)
    vertices.push(left[i].x, ROAD_Y, -left[i].y);
    // Right vertex
    vertices.push(right[i].x, ROAD_Y, -right[i].y);

    // Create two triangles for each quad (except first iteration)
    if (i > 0) {
      const bl = (i - 1) * 2;     // bottom-left
      const br = (i - 1) * 2 + 1; // bottom-right
      const tl = i * 2;           // top-left
      const tr = i * 2 + 1;       // top-right

      // Triangle 1: bl, br, tl
      indices.push(bl, br, tl);
      // Triangle 2: br, tr, tl
      indices.push(br, tr, tl);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: ROAD_COLOR,
    roughness: 0.9,
    metalness: 0.1,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  return new THREE.Mesh(geometry, material);
}

// ── Lane Marking Generation ──────────────────────────────────────────────────

/** Compute lane markings from lanelet boundaries */
function computeLaneMarkings(network: LaneletNetwork): LaneMarking[] {
  const markings: LaneMarking[] = [];

  for (const [, lanelet] of network.lanelets) {
    // Center divider - between opposite-direction lanes
    if (lanelet.adjacentLeft && !lanelet.adjacentLeft.sameDirection) {
      markings.push({
        points: lanelet.leftBound,
        type: 'dashed',
        side: 'center',
      });
    }

    // Edge lines - outermost boundaries
    if (!lanelet.adjacentLeft) {
      markings.push({
        points: lanelet.leftBound,
        type: 'solid',
        side: 'left',
      });
    }
    if (!lanelet.adjacentRight) {
      markings.push({
        points: lanelet.rightBound,
        type: 'solid',
        side: 'right',
      });
    }

    // Lane dividers - between same-direction lanes
    if (lanelet.adjacentRight && lanelet.adjacentRight.sameDirection) {
      markings.push({
        points: lanelet.rightBound,
        type: 'dashed',
        side: 'right',
      });
    }
  }

  return markings;
}

/** Count total dashes needed for all markings */
function countTotalDashes(markings: LaneMarking[]): number {
  let count = 0;
  for (const marking of markings) {
    const len = polylineLength(marking.points);
    if (marking.type === 'dashed') {
      count += Math.floor((len + DASH_GAP) / (DASH_LENGTH + DASH_GAP));
    } else {
      // Solid lines - use many small segments
      count += Math.ceil(len / DASH_LENGTH);
    }
  }
  return count;
}

/** Create instanced mesh for all lane markings */
function createMarkingMeshes(markings: LaneMarking[]): THREE.InstancedMesh | null {
  const totalDashes = countTotalDashes(markings);
  if (totalDashes === 0) return null;

  // Create dash geometry
  const dashGeo = new THREE.PlaneGeometry(DASH_LENGTH, DASH_WIDTH);
  dashGeo.rotateX(-Math.PI / 2);

  const dashMat = new THREE.MeshBasicMaterial({
    color: DASH_COLOR,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const mesh = new THREE.InstancedMesh(dashGeo, dashMat, totalDashes);
  mesh.frustumCulled = false;

  // Populate instances
  const mat4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  let idx = 0;

  for (const marking of markings) {
    const len = polylineLength(marking.points);
    const spacing = marking.type === 'dashed' ? DASH_LENGTH + DASH_GAP : DASH_LENGTH;
    let dist = DASH_LENGTH / 2;

    while (dist < len && idx < totalDashes) {
      const { point, angle } = pointAtDistance(marking.points, dist);

      // Position in Three.js coords (y -> z, negated)
      pos.set(point.x, MARKING_Y, -point.y);

      // Rotate to align with road direction
      quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -angle);

      // Adjust scale for solid lines (stretch to fill gap)
      if (marking.type === 'solid') {
        scale.set(1, 1, 1);
      } else {
        scale.set(1, 1, 1);
      }

      // Set color based on marking type
      // Note: Can't change color per instance with basic material
      // For center lines, we'd need a separate mesh

      mat4.compose(pos, quat, scale);
      mesh.setMatrixAt(idx++, mat4);

      dist += spacing;
    }
  }

  mesh.count = idx;
  mesh.instanceMatrix.needsUpdate = true;

  return mesh;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Generate road meshes from raw lanelet network data */
export function generateRoad(raw: RawLaneletNetwork): void {
  clear();

  const network = parseLaneletNetwork(raw);

  // Generate road surfaces - one mesh per lanelet for precise alignment with lane markings
  for (const [, lanelet] of network.lanelets) {
    const mesh = createLaneletMesh(lanelet);
    scene.add(mesh);
    roadMeshes.push(mesh);
  }

  // Generate lane markings
  const markings = computeLaneMarkings(network);
  markingMesh = createMarkingMeshes(markings);
  if (markingMesh) {
    scene.add(markingMesh);
  }

  console.log(
    `[RoadGenerator] Created ${network.lanelets.size} road surfaces, ` +
    `${markings.length} marking polylines, ` +
    `${markingMesh?.count || 0} dash instances`
  );
}

/** Clear all generated road meshes */
export function clear(): void {
  for (const mesh of roadMeshes) {
    scene.remove(mesh);
    if (mesh instanceof THREE.Mesh) {
      mesh.geometry.dispose();
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
    }
  }
  roadMeshes = [];

  if (markingMesh) {
    scene.remove(markingMesh);
    markingMesh.geometry.dispose();
    if (markingMesh.material instanceof THREE.Material) {
      markingMesh.material.dispose();
    }
    markingMesh = null;
  }
}

/** Get road bounds (for camera/spawn positioning) */
export function getRoadBounds(raw: RawLaneletNetwork): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  // Note: network bounds are in game coords where y -> z (negated)
  return {
    minX: raw.bounds.minX,
    maxX: raw.bounds.maxX,
    minZ: -raw.bounds.maxY, // Flip because Y is negated
    maxZ: -raw.bounds.minY,
  };
}
