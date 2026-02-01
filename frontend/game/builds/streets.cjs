#!/usr/bin/env node
/**
 * Street detection script — finds street corridors from building gaps.
 *
 * Rasterizes building footprints onto a 2m boolean grid, projects occupancy
 * onto X and Z axes, finds valleys (unoccupied runs), filters by width,
 * and computes intersection interrupt zones.
 *
 * Usage:
 *   node builds/streets.cjs                              # default: manhattan_rect_color.json (in-place)
 *   node builds/streets.cjs builds/some_other.json       # custom input (in-place)
 */

const fs = require('fs');
const path = require('path');

// ── CLI ──────────────────────────────────────────────────────────────────────
const inputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, 'manhattan_rect_color.json');

// ── Config ───────────────────────────────────────────────────────────────────
const CELL_SIZE = 2;          // meters per grid cell
const MIN_WIDTH_CELLS = 4;    // 8m minimum street width
const MAX_WIDTH_CELLS = 20;   // 40m maximum street width
const MIN_OCCUPANCY = 0.15;   // threshold: column/row is "occupied" if > 15% filled

// ── Load scene ───────────────────────────────────────────────────────────────
const scene = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
const buildings = scene.buildings || [];
console.log(`Read ${buildings.length} buildings from ${path.basename(inputPath)}`);

if (buildings.length === 0) {
  console.log('No buildings — nothing to detect.');
  process.exit(0);
}

// ── Compute axis-aligned bounding box for each building ──────────────────────
const bboxes = buildings.map(b => {
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of b.vertices) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
});

// ── Determine world bounds ───────────────────────────────────────────────────
let worldMinX = Infinity, worldMaxX = -Infinity;
let worldMinZ = Infinity, worldMaxZ = -Infinity;
for (const bb of bboxes) {
  if (bb.minX < worldMinX) worldMinX = bb.minX;
  if (bb.maxX > worldMaxX) worldMaxX = bb.maxX;
  if (bb.minZ < worldMinZ) worldMinZ = bb.minZ;
  if (bb.maxZ > worldMaxZ) worldMaxZ = bb.maxZ;
}

console.log(`World bounds: X [${worldMinX.toFixed(0)}, ${worldMaxX.toFixed(0)}], Z [${worldMinZ.toFixed(0)}, ${worldMaxZ.toFixed(0)}]`);

const gridW = Math.ceil((worldMaxX - worldMinX) / CELL_SIZE);
const gridH = Math.ceil((worldMaxZ - worldMinZ) / CELL_SIZE);
console.log(`Grid size: ${gridW} × ${gridH} cells (${CELL_SIZE}m each)`);

// ── Rasterize building bounding boxes onto grid ──────────────────────────────
// grid[row][col] = true if occupied
const grid = Array.from({ length: gridH }, () => new Uint8Array(gridW));

for (const bb of bboxes) {
  const c0 = Math.max(0, Math.floor((bb.minX - worldMinX) / CELL_SIZE));
  const c1 = Math.min(gridW - 1, Math.floor((bb.maxX - worldMinX) / CELL_SIZE));
  const r0 = Math.max(0, Math.floor((bb.minZ - worldMinZ) / CELL_SIZE));
  const r1 = Math.min(gridH - 1, Math.floor((bb.maxZ - worldMinZ) / CELL_SIZE));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      grid[r][c] = 1;
    }
  }
}

// ── Project occupancy ────────────────────────────────────────────────────────
// Column sums (project onto X axis) — used to find Z-parallel corridors (avenues)
const colSums = new Float64Array(gridW);
for (let c = 0; c < gridW; c++) {
  let sum = 0;
  for (let r = 0; r < gridH; r++) sum += grid[r][c];
  colSums[c] = sum / gridH; // fraction of rows occupied in this column
}

// Row sums (project onto Z axis) — used to find X-parallel corridors (streets)
const rowSums = new Float64Array(gridH);
for (let r = 0; r < gridH; r++) {
  let sum = 0;
  for (let c = 0; c < gridW; c++) sum += grid[r][c];
  rowSums[r] = sum / gridW;
}

// ── Find valleys (runs of low occupancy) ─────────────────────────────────────
function findValleys(profile, cellCount, minCells, maxCells) {
  const valleys = [];
  let runStart = -1;
  for (let i = 0; i <= cellCount; i++) {
    const occupied = i < cellCount ? profile[i] >= MIN_OCCUPANCY : true;
    if (!occupied) {
      if (runStart === -1) runStart = i;
    } else {
      if (runStart !== -1) {
        const runLen = i - runStart;
        if (runLen >= minCells && runLen <= maxCells) {
          valleys.push({ start: runStart, end: i });
        }
        runStart = -1;
      }
    }
  }
  return valleys;
}

const colValleys = findValleys(colSums, gridW, MIN_WIDTH_CELLS, MAX_WIDTH_CELLS);
const rowValleys = findValleys(rowSums, gridH, MIN_WIDTH_CELLS, MAX_WIDTH_CELLS);

console.log(`\nDetected ${colValleys.length} Z-parallel corridors (avenues, from column projection)`);
console.log(`Detected ${rowValleys.length} X-parallel corridors (streets, from row projection)`);

// ── Compute corridor extents ─────────────────────────────────────────────────
// For each valley, find the actual extent along the corridor's running axis
// by scanning the grid within the valley band.

function corridorExtent(valley, axis, grid, gridW, gridH) {
  // axis='col' means valley is in columns → corridor runs along Z
  // axis='row' means valley is in rows → corridor runs along X
  if (axis === 'col') {
    // Scan rows to find where corridor is actually clear
    let firstRow = gridH, lastRow = 0;
    for (let r = 0; r < gridH; r++) {
      let clear = true;
      for (let c = valley.start; c < valley.end; c++) {
        if (grid[r][c]) { clear = false; break; }
      }
      if (clear) {
        if (r < firstRow) firstRow = r;
        if (r > lastRow) lastRow = r;
      }
    }
    return { start: firstRow, end: lastRow + 1 };
  } else {
    let firstCol = gridW, lastCol = 0;
    for (let c = 0; c < gridW; c++) {
      let clear = true;
      for (let r = valley.start; r < valley.end; r++) {
        if (grid[r][c]) { clear = false; break; }
      }
      if (clear) {
        if (c < firstCol) firstCol = c;
        if (c > lastCol) lastCol = c;
      }
    }
    return { start: firstCol, end: lastCol + 1 };
  }
}

// ── Build corridor descriptors ───────────────────────────────────────────────

const corridors = [];

// Z-parallel corridors (avenues) from column valleys
for (const v of colValleys) {
  const centerCell = (v.start + v.end) / 2;
  const widthCells = v.end - v.start;
  const extent = corridorExtent(v, 'col', grid, gridW, gridH);
  corridors.push({
    axis: 'z',
    center: worldMinX + centerCell * CELL_SIZE,
    width: widthCells * CELL_SIZE,
    start: worldMinZ + extent.start * CELL_SIZE,
    end: worldMinZ + extent.end * CELL_SIZE,
    interrupts: [],
    _valleyStart: v.start,
    _valleyEnd: v.end,
  });
}

// X-parallel corridors (streets) from row valleys
for (const v of rowValleys) {
  const centerCell = (v.start + v.end) / 2;
  const widthCells = v.end - v.start;
  const extent = corridorExtent(v, 'row', grid, gridW, gridH);
  corridors.push({
    axis: 'x',
    center: worldMinZ + centerCell * CELL_SIZE,
    width: widthCells * CELL_SIZE,
    start: worldMinX + extent.start * CELL_SIZE,
    end: worldMinX + extent.end * CELL_SIZE,
    interrupts: [],
    _valleyStart: v.start,
    _valleyEnd: v.end,
  });
}

// ── Compute intersection interrupts ──────────────────────────────────────────
// Where X-corridors and Z-corridors cross, suppress center dashes

const zCorridors = corridors.filter(c => c.axis === 'z');
const xCorridors = corridors.filter(c => c.axis === 'x');

for (const zc of zCorridors) {
  for (const xc of xCorridors) {
    // Z-corridor runs along Z axis; X-corridor perpendicular position is xc.center (on Z axis)
    // Check if this X-corridor's Z-position falls within the Z-corridor's extent
    const zPos = xc.center; // position on Z axis
    if (zPos >= zc.start && zPos <= zc.end) {
      const halfW = xc.width / 2;
      zc.interrupts.push([zPos - halfW, zPos + halfW]);
    }
  }
}

for (const xc of xCorridors) {
  for (const zc of zCorridors) {
    // X-corridor runs along X axis; Z-corridor perpendicular position is zc.center (on X axis)
    const xPos = zc.center;
    if (xPos >= xc.start && xPos <= xc.end) {
      const halfW = zc.width / 2;
      xc.interrupts.push([xPos - halfW, xPos + halfW]);
    }
  }
}

// Sort interrupts along corridor axis
for (const c of corridors) {
  c.interrupts.sort((a, b) => a[0] - b[0]);
}

// ── Clean up internal fields and round values ────────────────────────────────
const output = corridors.map(c => ({
  axis: c.axis,
  center: Math.round(c.center * 100) / 100,
  width: Math.round(c.width * 100) / 100,
  start: Math.round(c.start * 100) / 100,
  end: Math.round(c.end * 100) / 100,
  interrupts: c.interrupts.map(([a, b]) => [
    Math.round(a * 100) / 100,
    Math.round(b * 100) / 100,
  ]),
}));

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\nTotal corridors: ${output.length}`);
for (const c of output) {
  const len = (c.end - c.start).toFixed(0);
  console.log(`  ${c.axis}-corridor at ${c.center.toFixed(0)}, width=${c.width.toFixed(0)}m, length=${len}m, ${c.interrupts.length} intersections`);
}

// ── Write back into scene JSON ───────────────────────────────────────────────
scene.streets = output;
fs.writeFileSync(inputPath, JSON.stringify(scene, null, 2));
console.log(`\nWrote ${output.length} street corridors into ${path.basename(inputPath)}`);
