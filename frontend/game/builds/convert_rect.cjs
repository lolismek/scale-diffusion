#!/usr/bin/env node
/**
 * Converts manhattan_raw.json into a game-format JSON file,
 * rotated to align with the Manhattan street grid (~29° from true north),
 * then clipped to the largest axis-aligned rectangle of dense coverage.
 *
 * This means tile edges cut along streets/avenues, enabling seamless tiling.
 *
 * Usage: node builds/convert_rect.cjs
 * Input:  builds/manhattan_raw.json
 * Output: builds/manhattan_rect.json
 */

const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, 'manhattan_raw.json');
const OUTPUT = path.join(__dirname, 'manhattan_rect.json');

// Manhattan street grid: ~29° east of true north = ~61° from the east axis.
// The rotation formula works in the east-axis frame, so we use 61°.
const GRID_ANGLE_DEG = 29; // stored for reference (from north)
const GRID_ANGLE_FROM_EAST = 61;
const GRID_ANGLE_RAD = GRID_ANGLE_FROM_EAST * Math.PI / 180;
const COS_A = Math.cos(GRID_ANGLE_RAD);
const SIN_A = Math.sin(GRID_ANGLE_RAD);

// Grid cell size for rectangle detection (meters).
const CELL_SIZE = 120;

// Height-based color palette
const PALETTE = [
  { max: 30,  color: '#6B7B8D' },
  { max: 60,  color: '#708090' },
  { max: 100, color: '#5F6B7A' },
  { max: 150, color: '#8899AA' },
  { max: 200, color: '#7B8FA2' },
  { max: Infinity, color: '#A0B0C0' },
];

function colorForHeight(h) {
  for (const p of PALETTE) {
    if (h <= p.max) return p.color;
  }
  return PALETTE[PALETTE.length - 1].color;
}

/** Rotate a point to align Manhattan grid with axes. */
function rotateToGrid(x, z) {
  return [
     x * COS_A + z * SIN_A,
    -x * SIN_A + z * COS_A,
  ];
}

/**
 * Find the largest axis-aligned rectangle of 1s in a binary matrix.
 * Returns { r1, c1, r2, c2 } (inclusive row/col indices).
 */
function maxRectInMatrix(mat) {
  const rows = mat.length;
  const cols = mat[0].length;
  const heights = new Array(cols).fill(0);

  let bestArea = 0;
  let bestRect = { r1: 0, c1: 0, r2: 0, c2: 0 };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      heights[c] = mat[r][c] ? heights[c] + 1 : 0;
    }

    const stack = [];
    for (let c = 0; c <= cols; c++) {
      const h = c < cols ? heights[c] : 0;
      while (stack.length > 0 && heights[stack[stack.length - 1]] > h) {
        const height = heights[stack.pop()];
        const width = stack.length === 0 ? c : c - stack[stack.length - 1] - 1;
        const area = height * width;
        if (area > bestArea) {
          bestArea = area;
          bestRect = {
            c1: stack.length === 0 ? 0 : stack[stack.length - 1] + 1,
            c2: c - 1,
            r1: r - height + 1,
            r2: r,
          };
        }
      }
      stack.push(c);
    }
  }

  return bestRect;
}

// ── Read raw data ──
const raw = JSON.parse(fs.readFileSync(INPUT, 'utf-8'));
console.log(`Read ${raw.length} features`);

// ── Compute center (mean lon/lat) ──
let sumLon = 0, sumLat = 0, count = 0;
for (const feature of raw) {
  const ring = feature.the_geom.coordinates[0][0];
  for (const [lon, lat] of ring) {
    sumLon += lon;
    sumLat += lat;
    count++;
  }
}
const centerLon = sumLon / count;
const centerLat = sumLat / count;
const cosLat = Math.cos(centerLat * Math.PI / 180);
console.log(`Center: lon=${centerLon.toFixed(6)}, lat=${centerLat.toFixed(6)}`);
console.log(`Grid rotation: ${GRID_ANGLE_DEG}° (streets align with X axis, avenues with Z axis)`);

// ── Convert each building to meters, then rotate to grid alignment ──
const converted = [];
for (const feature of raw) {
  const heightFt = parseFloat(feature.height_roof) || 0;
  if (heightFt === 0) continue;

  const heightM = heightFt / 3.281;
  const ring = feature.the_geom.coordinates[0][0];

  // Convert lat/lon to meters, then rotate to grid-aligned coordinates
  const vertices = ring.map(([lon, lat]) => {
    const mx = (lon - centerLon) * 111320 * cosLat;
    const mz = (lat - centerLat) * 111320;
    const [rx, rz] = rotateToGrid(mx, mz);
    return [Math.round(rx * 100) / 100, Math.round(rz * 100) / 100];
  });

  // Centroid in rotated space
  let cx = 0, cz = 0;
  for (const [x, z] of vertices) { cx += x; cz += z; }
  cx /= vertices.length;
  cz /= vertices.length;

  converted.push({
    vertices,
    height: Math.round(heightM * 10) / 10,
    color: colorForHeight(heightM),
    cx, cz,
  });
}
console.log(`Converted ${converted.length} buildings (skipped ${raw.length - converted.length} with zero height)`);

// ── Bounding box of rotated centroids ──
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (const b of converted) {
  minX = Math.min(minX, b.cx);
  maxX = Math.max(maxX, b.cx);
  minZ = Math.min(minZ, b.cz);
  maxZ = Math.max(maxZ, b.cz);
}
console.log(`Rotated centroid bounds: X[${minX.toFixed(0)}, ${maxX.toFixed(0)}] Z[${minZ.toFixed(0)}, ${maxZ.toFixed(0)}]`);

// ── Build occupancy grid (in rotated space) ──
const gridCols = Math.ceil((maxX - minX) / CELL_SIZE);
const gridRows = Math.ceil((maxZ - minZ) / CELL_SIZE);
const grid = Array.from({ length: gridRows }, () => new Array(gridCols).fill(0));

for (const b of converted) {
  const col = Math.min(Math.floor((b.cx - minX) / CELL_SIZE), gridCols - 1);
  const row = Math.min(Math.floor((b.cz - minZ) / CELL_SIZE), gridRows - 1);
  grid[row][col]++;
}

const binary = grid.map(row => row.map(v => v > 0 ? 1 : 0));
const occupied = binary.flat().filter(v => v).length;
console.log(`Grid: ${gridCols} cols x ${gridRows} rows (${CELL_SIZE}m cells), ${occupied}/${gridCols * gridRows} occupied`);

// ── Morphological closing: fill isolated holes ──
for (let pass = 0; pass < 2; pass++) {
  let filled = 0;
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      if (binary[r][c]) continue;
      let neighbors = 0;
      if (r > 0 && binary[r - 1][c]) neighbors++;
      if (r < gridRows - 1 && binary[r + 1][c]) neighbors++;
      if (c > 0 && binary[r][c - 1]) neighbors++;
      if (c < gridCols - 1 && binary[r][c + 1]) neighbors++;
      if (neighbors >= 3) {
        binary[r][c] = 1;
        filled++;
      }
    }
  }
  if (filled > 0) console.log(`  Fill pass ${pass + 1}: filled ${filled} holes`);
}
const filledCount = binary.flat().filter(v => v).length;
console.log(`After filling: ${filledCount}/${gridCols * gridRows} occupied`);

// ── Find largest rectangle ──
const rect = maxRectInMatrix(binary);
const rectW = rect.c2 - rect.c1 + 1;
const rectH = rect.r2 - rect.r1 + 1;
console.log(`Largest rectangle: ${rectW} x ${rectH} cells = ${rectW * CELL_SIZE}m x ${rectH * CELL_SIZE}m`);

// Convert grid rect back to meter bounds (in rotated space)
const clipMinX = minX + rect.c1 * CELL_SIZE;
const clipMaxX = minX + (rect.c2 + 1) * CELL_SIZE;
const clipMinZ = minZ + rect.r1 * CELL_SIZE;
const clipMaxZ = minZ + (rect.r2 + 1) * CELL_SIZE;
console.log(`Clip bounds: X[${clipMinX.toFixed(0)}, ${clipMaxX.toFixed(0)}] Z[${clipMinZ.toFixed(0)}, ${clipMaxZ.toFixed(0)}]`);

// ── Clip buildings whose rotated centroid falls inside the rectangle ──
const clipped = converted
  .filter(b => b.cx >= clipMinX && b.cx <= clipMaxX && b.cz >= clipMinZ && b.cz <= clipMaxZ)
  .map(({ cx, cz, ...rest }) => rest);

console.log(`Clipped to ${clipped.length} buildings (removed ${converted.length - clipped.length})`);

// ── Re-center around the middle of the clipped rectangle ──
const rectCenterX = (clipMinX + clipMaxX) / 2;
const rectCenterZ = (clipMinZ + clipMaxZ) / 2;
for (const b of clipped) {
  b.vertices = b.vertices.map(([x, z]) => [
    Math.round((x - rectCenterX) * 100) / 100,
    Math.round((z - rectCenterZ) * 100) / 100,
  ]);
}

const tileWidth = Math.round(clipMaxX - clipMinX);
const tileDepth = Math.round(clipMaxZ - clipMinZ);

// ── Write output ──
const output = {
  map: { width: tileWidth, depth: tileDepth, color: '#3a3a3a', skyColor: '#87CEEB' },
  tileWidth,
  tileDepth,
  gridAngleDeg: GRID_ANGLE_DEG,
  buildings: clipped,
};

fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
console.log(`\nWrote ${OUTPUT}`);
console.log(`  Tile: ${tileWidth}m x ${tileDepth}m`);
console.log(`  Buildings: ${clipped.length}`);
console.log(`  Grid angle: ${GRID_ANGLE_DEG}° (stored for tiling reference)`);
