/**
 * Building placement along procedurally generated roads.
 * Loads building shapes from GeoJSON and places them along road edges.
 */

import * as THREE from 'three';
import { scene } from './engine';
import type { LaneletNetwork, Lanelet, Point2D, RawLaneletNetwork } from './scenarios/laneletTypes';
import { parseLaneletNetwork } from './roadGenerator';

// ── Config ───────────────────────────────────────────────────────────────────
const BUILDING_SETBACK = 8;     // Distance from road edge to building
const BUILDING_SPACING = 15;    // Approximate spacing between buildings (~15m dense)
const MIN_BUILDING_HEIGHT = 15; // Minimum building height in meters
const MAX_BUILDING_HEIGHT = 80; // Maximum building height in meters
const FEET_TO_METERS = 0.3048;

// Building colors (NYC-style)
const BUILDING_COLORS = [
  '#8AAEC0', '#A0B5C0', '#7899A8', '#9AB0C0', '#85A0B0',
  '#B5C4CC', '#95A8B5', '#A8B8C4', '#7A8F9C', '#8CA0AC',
];

// ── Types ────────────────────────────────────────────────────────────────────
interface GeoJSONFeature {
  geometry: {
    type: 'MultiPolygon';
    coordinates: number[][][][];
  };
  properties: {
    height_roof?: string;
    ground_elevation?: string;
  };
}

interface BuildingTemplate {
  vertices: Point2D[];  // Normalized building footprint (centered at origin)
  width: number;        // Approximate width
  depth: number;        // Approximate depth
  height: number;       // Building height in meters
}

interface PlacementEdge {
  points: Point2D[];    // Polyline along road edge
  side: 'left' | 'right'; // Which side of road this edge is on
}

// ── State ────────────────────────────────────────────────────────────────────
let buildings: THREE.Mesh[] = [];
let buildingTemplates: BuildingTemplate[] = [];
let templatesLoaded = false;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert WGS84 coordinates to local meters (relative to centroid) */
function wgs84ToLocal(coords: number[][], centroid: [number, number]): Point2D[] {
  const [lonC, latC] = centroid;
  const metersPerDegreeLat = 111000;
  const metersPerDegreeLon = 111000 * Math.cos(latC * Math.PI / 180);

  return coords.map(([lon, lat]) => ({
    x: (lon - lonC) * metersPerDegreeLon,
    y: (lat - latC) * metersPerDegreeLat,
  }));
}

/** Compute centroid of WGS84 coordinates */
function computeWGS84Centroid(coords: number[][]): [number, number] {
  let sumLon = 0, sumLat = 0;
  for (const [lon, lat] of coords) {
    sumLon += lon;
    sumLat += lat;
  }
  return [sumLon / coords.length, sumLat / coords.length];
}

/** Compute bounding box of points */
function computeBounds(points: Point2D[]): { width: number; depth: number } {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { width: maxX - minX, depth: maxY - minY };
}

/** Center points at origin */
function centerPoints(points: Point2D[]): Point2D[] {
  const bounds = computeBounds(points);
  let sumX = 0, sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const cx = sumX / points.length;
  const cy = sumY / points.length;
  return points.map(p => ({ x: p.x - cx, y: p.y - cy }));
}

/** Scale points to fit within a target size */
function scalePoints(points: Point2D[], targetSize: number): Point2D[] {
  const bounds = computeBounds(points);
  const maxDim = Math.max(bounds.width, bounds.depth);
  if (maxDim === 0) return points;
  const scale = targetSize / maxDim;
  return points.map(p => ({ x: p.x * scale, y: p.y * scale }));
}

/** Polyline length */
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
  const last = points[points.length - 1];
  const prev = points[points.length - 2] || points[0];
  return {
    point: last,
    angle: Math.atan2(last.y - prev.y, last.x - prev.x),
  };
}

/** Offset a polyline outward by a distance */
function offsetPolyline(points: Point2D[], distance: number): Point2D[] {
  if (points.length < 2) return points;

  const result: Point2D[] = [];

  for (let i = 0; i < points.length; i++) {
    // Compute normal at this point
    let nx = 0, ny = 0;

    if (i === 0) {
      // First point - use direction to next
      const dx = points[1].x - points[0].x;
      const dy = points[1].y - points[0].y;
      const len = Math.sqrt(dx * dx + dy * dy);
      nx = -dy / len;
      ny = dx / len;
    } else if (i === points.length - 1) {
      // Last point - use direction from previous
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      const len = Math.sqrt(dx * dx + dy * dy);
      nx = -dy / len;
      ny = dx / len;
    } else {
      // Middle point - average of adjacent normals
      const dx1 = points[i].x - points[i - 1].x;
      const dy1 = points[i].y - points[i - 1].y;
      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

      const dx2 = points[i + 1].x - points[i].x;
      const dy2 = points[i + 1].y - points[i].y;
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      const nx1 = -dy1 / len1, ny1 = dx1 / len1;
      const nx2 = -dy2 / len2, ny2 = dx2 / len2;

      nx = (nx1 + nx2) / 2;
      ny = (ny1 + ny2) / 2;
      const nlen = Math.sqrt(nx * nx + ny * ny);
      if (nlen > 0) {
        nx /= nlen;
        ny /= nlen;
      }
    }

    result.push({
      x: points[i].x + nx * distance,
      y: points[i].y + ny * distance,
    });
  }

  return result;
}

// ── Template Loading ─────────────────────────────────────────────────────────

/** Load building templates from GeoJSON */
export async function loadBuildingTemplates(geojsonPath: string): Promise<void> {
  if (templatesLoaded) return;

  try {
    const response = await fetch(geojsonPath);
    const geojson = await response.json();

    buildingTemplates = [];

    for (const feature of geojson.features as GeoJSONFeature[]) {
      if (feature.geometry.type !== 'MultiPolygon') continue;

      // Get first polygon ring
      const ring = feature.geometry.coordinates[0]?.[0];
      if (!ring || ring.length < 3) continue;

      // Convert to local coordinates
      const centroid = computeWGS84Centroid(ring);
      let vertices = wgs84ToLocal(ring, centroid);

      // Center and normalize
      vertices = centerPoints(vertices);

      // Scale to reasonable building size (10-30m footprint)
      const targetSize = 15 + Math.random() * 15;
      vertices = scalePoints(vertices, targetSize);

      const bounds = computeBounds(vertices);

      // Get height from properties (in feet)
      let height = MIN_BUILDING_HEIGHT + Math.random() * (MAX_BUILDING_HEIGHT - MIN_BUILDING_HEIGHT);
      if (feature.properties.height_roof) {
        const roofFeet = parseFloat(feature.properties.height_roof);
        const groundFeet = parseFloat(feature.properties.ground_elevation || '0');
        height = (roofFeet - groundFeet) * FEET_TO_METERS;
        // Clamp to reasonable range
        height = Math.max(MIN_BUILDING_HEIGHT, Math.min(MAX_BUILDING_HEIGHT * 2, height));
      }

      buildingTemplates.push({
        vertices,
        width: bounds.width,
        depth: bounds.depth,
        height,
      });
    }

    templatesLoaded = true;
    console.log(`[BuildingPlacer] Loaded ${buildingTemplates.length} building templates`);
  } catch (err) {
    console.error('[BuildingPlacer] Failed to load GeoJSON:', err);
  }
}

// ── Road Edge Detection ──────────────────────────────────────────────────────

/** Find road edges (outermost lanelet boundaries) */
function findRoadEdges(network: LaneletNetwork): PlacementEdge[] {
  const edges: PlacementEdge[] = [];

  for (const [, lanelet] of network.lanelets) {
    // Left edge - no adjacent lanelet on left (offset to the left = negative)
    if (!lanelet.adjacentLeft) {
      edges.push({
        points: lanelet.leftBound,
        side: 'left',
      });
    }

    // Right edge - no adjacent lanelet on right (offset to the right = positive)
    if (!lanelet.adjacentRight) {
      edges.push({
        points: lanelet.rightBound,
        side: 'right',
      });
    }
  }

  return edges;
}

// ── Building Mesh Creation ───────────────────────────────────────────────────

/** Rotate a point around the origin */
function rotatePoint(p: Point2D, angle: number): Point2D {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  };
}

/** Find the angle of the longest side of a polygon */
function findLongestSideAngle(vertices: Point2D[]): number {
  let maxLen = 0;
  let maxAngle = 0;

  for (let i = 0; i < vertices.length; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % vertices.length];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len > maxLen) {
      maxLen = len;
      maxAngle = Math.atan2(dy, dx);
    }
  }

  return maxAngle;
}

/** Create a building mesh from template at given position */
function createBuildingMesh(
  template: BuildingTemplate,
  position: Point2D,
  rotation: number,
  heightScale: number = 1
): THREE.Mesh {
  // Rotate vertices before creating shape (more reliable than geometry rotation)
  const rotatedVerts = template.vertices.map(v => rotatePoint(v, rotation));

  // Create shape from rotated vertices
  const shape = new THREE.Shape();
  const first = rotatedVerts[0];
  shape.moveTo(first.x, first.y);

  for (let i = 1; i < rotatedVerts.length; i++) {
    shape.lineTo(rotatedVerts[i].x, rotatedVerts[i].y);
  }
  shape.closePath();

  // Extrude to create 3D building
  const height = template.height * heightScale;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
  });

  // Rotate from XY plane to XZ plane (building stands up)
  geometry.rotateX(-Math.PI / 2);

  // Translate to position (y -> z in game coords)
  geometry.translate(position.x, 0, -position.y);

  // Random color
  const color = BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)];
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    metalness: 0.1,
  });

  return new THREE.Mesh(geometry, material);
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Place buildings along the edges of a road network */
export function placeBuildings(raw: RawLaneletNetwork): void {
  clear();

  if (!templatesLoaded || buildingTemplates.length === 0) {
    console.warn('[BuildingPlacer] No building templates loaded');
    return;
  }

  const network = parseLaneletNetwork(raw);
  const edges = findRoadEdges(network);

  let buildingCount = 0;

  for (const edge of edges) {
    // Determine offset direction based on side
    // Left edges offset to the left (negative), right edges to the right (positive)
    const offsetDistance = edge.side === 'left' ? -BUILDING_SETBACK : BUILDING_SETBACK;

    // Offset edge outward from road
    const placementLine = offsetPolyline(edge.points, offsetDistance);
    const edgeLength = polylineLength(placementLine);

    if (edgeLength < BUILDING_SPACING) continue; // Skip very short edges

    // Place buildings along this edge
    let dist = BUILDING_SPACING / 2;

    while (dist < edgeLength) {
      const { point, angle } = pointAtDistance(placementLine, dist);

      // Select random template
      const template = buildingTemplates[Math.floor(Math.random() * buildingTemplates.length)];

      // Rotate building so its longest side is parallel to the road
      // roadAngle is the direction along the road edge
      // buildingAngle is the direction of the building's longest side
      // We need to rotate the building by (roadAngle - buildingAngle) to align them
      const buildingLongestSideAngle = findLongestSideAngle(template.vertices);
      const rotation = angle - buildingLongestSideAngle;

      // Random height variation
      const heightScale = 0.5 + Math.random() * 1.0;

      // Create and add building
      const mesh = createBuildingMesh(template, point, rotation, heightScale);
      scene.add(mesh);
      buildings.push(mesh);
      buildingCount++;

      // Move to next position with some randomness
      dist += BUILDING_SPACING + (Math.random() - 0.5) * 5;
    }
  }

  console.log(`[BuildingPlacer] Placed ${buildingCount} buildings along ${edges.length} road edges`);
}

/** Clear all placed buildings */
export function clear(): void {
  for (const mesh of buildings) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    if (mesh.material instanceof THREE.Material) {
      mesh.material.dispose();
    }
  }
  buildings = [];
}

/** Check if templates are loaded */
export function isLoaded(): boolean {
  return templatesLoaded;
}
