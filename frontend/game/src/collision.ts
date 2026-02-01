import { camera } from './engine';
import { state } from './state';

// Car collision radius (distance from center to edge)
const CAR_RADIUS = 0.5;

// Tile template reference for building collision
interface TileTemplateRef {
  buildings: Array<{ vertices: number[][]; height: number }>;
  tileWidth: number;
  tileDepth: number;
}

let tileTemplate: TileTemplateRef | null = null;

export function setCollisionTemplate(template: TileTemplateRef | null): void {
  tileTemplate = template;
}

/**
 * Point-in-polygon test using ray casting algorithm
 * Returns true if point (px, pz) is inside the polygon defined by vertices
 */
function pointInPolygon(px: number, pz: number, vertices: number[][]): boolean {
  let inside = false;
  const n = vertices.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i][0];
    const zi = vertices[i][1];
    const xj = vertices[j][0];
    const zj = vertices[j][1];

    // Check if ray from point going in +X direction crosses edge
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Check if a circle (car footprint) collides with a polygon building
 * Uses multiple sample points around the car's radius
 */
function circlePolygonCollision(
  cx: number,
  cz: number,
  radius: number,
  vertices: number[][],
): boolean {
  // Check center point
  if (pointInPolygon(cx, cz, vertices)) return true;

  // Check 8 points around the circle perimeter
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const px = cx + Math.cos(angle) * radius;
    const pz = cz + Math.sin(angle) * radius;
    if (pointInPolygon(px, pz, vertices)) return true;
  }

  // Also check if any polygon edge intersects the circle
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (lineCircleIntersection(vertices[i], vertices[j], cx, cz, radius)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a line segment intersects a circle
 */
function lineCircleIntersection(
  p1: number[],
  p2: number[],
  cx: number,
  cz: number,
  radius: number,
): boolean {
  const dx = p2[0] - p1[0];
  const dz = p2[1] - p1[1];
  const fx = p1[0] - cx;
  const fz = p1[1] - cz;

  const a = dx * dx + dz * dz;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - radius * radius;

  let discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return false;

  discriminant = Math.sqrt(discriminant);
  const t1 = (-b - discriminant) / (2 * a);
  const t2 = (-b + discriminant) / (2 * a);

  // Check if intersection point is on the segment (0 <= t <= 1)
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

/**
 * Check collision against all buildings in nearby tiles
 */
function checkBuildingCollision(x: number, z: number, radius: number): boolean {
  if (!tileTemplate || tileTemplate.buildings.length === 0) return false;

  const { buildings, tileWidth, tileDepth } = tileTemplate;

  // Check tiles in a 3x3 grid around the position
  const tileCx = Math.floor(x / tileWidth + 0.5);
  const tileCz = Math.floor(z / tileDepth + 0.5);

  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const offsetX = (tileCx + dx) * tileWidth;
      const offsetZ = (tileCz + dz) * tileDepth;

      for (const building of buildings) {
        // Translate polygon vertices to world space
        const worldVertices = building.vertices.map((v) => [v[0] + offsetX, v[1] + offsetZ]);

        if (circlePolygonCollision(x, z, radius, worldVertices)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Check collision against all blocks
 */
function checkBlockCollision(x: number, z: number, radius: number): boolean {
  for (const block of state.blocks) {
    // Block bounds (blocks are centered at x, z)
    const minX = block.x - block.width / 2 - radius;
    const maxX = block.x + block.width / 2 + radius;
    const minZ = block.z - block.depth / 2 - radius;
    const maxZ = block.z + block.depth / 2 + radius;

    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a position would cause a collision
 */
export function checkCollision(x: number, z: number): boolean {
  return checkBuildingCollision(x, z, CAR_RADIUS) || checkBlockCollision(x, z, CAR_RADIUS);
}

/**
 * Try to move from current position to new position, handling collisions
 * Returns the valid final position after collision resolution
 */
export function resolveMovement(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): { x: number; z: number; collided: boolean } {
  // First try the full movement
  if (!checkCollision(toX, toZ)) {
    return { x: toX, z: toZ, collided: false };
  }

  // Try sliding along X axis only
  if (!checkCollision(toX, fromZ)) {
    return { x: toX, z: fromZ, collided: true };
  }

  // Try sliding along Z axis only
  if (!checkCollision(fromX, toZ)) {
    return { x: fromX, z: toZ, collided: true };
  }

  // Can't move at all - stay in place
  return { x: fromX, z: fromZ, collided: true };
}
