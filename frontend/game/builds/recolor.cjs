#!/usr/bin/env node
/**
 * Recolors buildings in a scene JSON to improve contrast for video diffusion.
 *
 * Uses realistic NYC building-material colors (brick, sandstone, concrete,
 * brownstone, limestone, glass) and a spatial-neighbor-aware assignment so
 * adjacent buildings always get different colors.
 *
 * The original palette (blue-gray height bands) is preserved in the source
 * conversion scripts.  This script produces a *separate* recolored file.
 *
 * Usage:
 *   node builds/recolor.cjs                          # defaults: manhattan_rect.json → manhattan_rect_color.json
 *   node builds/recolor.cjs builds/midtown_nyc.json  # custom input → midtown_nyc_color.json
 */

const fs = require('fs');
const path = require('path');

// ── CLI ──────────────────────────────────────────────────────────────────────
const inputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, 'manhattan_rect.json');

const ext = path.extname(inputPath);
const outputPath = inputPath.replace(ext, `_color${ext}`);

// ── Realistic NYC material palette ───────────────────────────────────────────
// Grouped by height tier so the overall skyline still reads naturally, but
// within each tier the hues are spread wide enough for a diffusion model to
// latch onto distinct surfaces.
//
// Tier 0  –  low-rise  (≤ 30 m) : warm brick / brownstone tones
// Tier 1  –  mid-rise  (≤ 60 m) : sandstone / tan / terracotta
// Tier 2  –  mid-tall  (≤ 100 m): concrete / limestone / warm gray
// Tier 3  –  tall      (≤ 150 m): steel / cool gray / slate
// Tier 4  –  hi-rise   (≤ 200 m): glass curtain-wall blues + greens
// Tier 5  –  supertall (> 200 m): light glass / silver

const TIERS = [
  { max: 30, colors: ['#8B4513', '#A0522D', '#6B3A2A', '#7A4E3B', '#94563C', '#5C3317'] },
  { max: 60, colors: ['#C4A77D', '#B8956A', '#D2B48C', '#A68B5B', '#BFA07A', '#C9945A'] },
  { max: 100, colors: ['#8C8C8C', '#A39E93', '#B5AFA6', '#7A7568', '#9E9488', '#A8A295'] },
  { max: 150, colors: ['#6E7B8B', '#7D8B99', '#5B6A78', '#8494A2', '#6A7F8D', '#5F7080'] },
  { max: 200, colors: ['#5A7D9A', '#4E7C91', '#6B96AB', '#4A8BA0', '#5E8FA3', '#537B92'] },
  { max: Infinity, colors: ['#8AAEC0', '#9BBAC8', '#7CA6B8', '#A3C4D1', '#90B5C5', '#86AFBF'] },
];

function tierIndex(height) {
  for (let i = 0; i < TIERS.length; i++) {
    if (height <= TIERS[i].max) return i;
  }
  return TIERS.length - 1;
}

// ── Spatial helpers ──────────────────────────────────────────────────────────

/** Centroid of a polygon defined by [[x,z], …] */
function centroid(vertices) {
  let cx = 0, cz = 0;
  for (const [x, z] of vertices) { cx += x; cz += z; }
  return [cx / vertices.length, cz / vertices.length];
}

/** Squared distance between two [x,z] points. */
function dist2(a, b) {
  const dx = a[0] - b[0], dz = a[1] - b[1];
  return dx * dx + dz * dz;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const scene = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
const buildings = scene.buildings || [];
console.log(`Read ${buildings.length} buildings from ${path.basename(inputPath)}`);

if (buildings.length === 0) {
  console.log('No buildings to recolor.');
  process.exit(0);
}

// Pre-compute centroids
const centroids = buildings.map(b => centroid(b.vertices));

// Build a spatial grid so neighbor lookups are fast
const NEIGHBOR_RADIUS = 60; // meters – roughly one NYC block width
const CELL = NEIGHBOR_RADIUS;

const grid = new Map(); // "col,row" → [index, …]
const cellOf = (cx, cz) => `${Math.floor(cx / CELL)},${Math.floor(cz / CELL)}`;

for (let i = 0; i < centroids.length; i++) {
  const key = cellOf(centroids[i][0], centroids[i][1]);
  if (!grid.has(key)) grid.set(key, []);
  grid.get(key).push(i);
}

function neighbors(i) {
  const [cx, cz] = centroids[i];
  const col = Math.floor(cx / CELL);
  const row = Math.floor(cz / CELL);
  const r2 = NEIGHBOR_RADIUS * NEIGHBOR_RADIUS;
  const result = [];
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      const key = `${col + dc},${row + dr}`;
      const bucket = grid.get(key);
      if (!bucket) continue;
      for (const j of bucket) {
        if (j !== i && dist2(centroids[i], centroids[j]) <= r2) {
          result.push(j);
        }
      }
    }
  }
  return result;
}

// ── Greedy graph-coloring within each height tier ────────────────────────────
// For every building, pick the color from its tier that no neighbor is already
// using.  If all colors are taken (very dense area), pick the least-used one
// among neighbors.

const assigned = new Array(buildings.length).fill(null);

// Process buildings in random-ish order (shuffle by centroid hash) so the
// palette usage stays even.
const order = buildings.map((_, i) => i);
order.sort((a, b) => {
  const ha = (centroids[a][0] * 7919 + centroids[a][1] * 6271) | 0;
  const hb = (centroids[b][0] * 7919 + centroids[b][1] * 6271) | 0;
  return ha - hb;
});

for (const i of order) {
  const tier = TIERS[tierIndex(buildings[i].height)];
  const nbrs = neighbors(i);
  const usedByNeighbors = new Set(nbrs.map(j => assigned[j]).filter(c => c !== null));

  // Pick first available color in tier
  let picked = null;
  for (const c of tier.colors) {
    if (!usedByNeighbors.has(c)) { picked = c; break; }
  }

  // Fallback: pick the color least used among neighbors
  if (!picked) {
    const counts = {};
    for (const c of tier.colors) counts[c] = 0;
    for (const j of nbrs) {
      if (assigned[j] && counts[assigned[j]] !== undefined) counts[assigned[j]]++;
    }
    picked = tier.colors.reduce((best, c) => counts[c] < counts[best] ? c : best);
  }

  assigned[i] = picked;
}

// Apply colors
for (let i = 0; i < buildings.length; i++) {
  buildings[i].color = assigned[i];
}

// ── Write output ─────────────────────────────────────────────────────────────
fs.writeFileSync(outputPath, JSON.stringify(scene, null, 2));
console.log(`Wrote ${path.basename(outputPath)} (${buildings.length} buildings recolored)`);

// Stats
const tierCounts = TIERS.map(() => 0);
for (const b of buildings) tierCounts[tierIndex(b.height)]++;
console.log('\nHeight-tier distribution:');
const labels = ['low-rise ≤30m', 'mid-rise ≤60m', 'mid-tall ≤100m', 'tall ≤150m', 'hi-rise ≤200m', 'supertall >200m'];
tierCounts.forEach((n, i) => { if (n > 0) console.log(`  ${labels[i]}: ${n}`); });
