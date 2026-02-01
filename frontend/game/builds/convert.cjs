#!/usr/bin/env node
/**
 * Converts midtown_raw.json (NYC building footprints GeoJSON)
 * into midtown_nyc.json (game format with polygon vertices + heights).
 *
 * Usage: node builds/convert.js
 */

const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, 'midtown_raw.json');
const OUTPUT = path.join(__dirname, 'midtown_nyc.json');

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

// Read raw data
const raw = JSON.parse(fs.readFileSync(INPUT, 'utf-8'));
console.log(`Read ${raw.length} features`);

// 1. Compute center point (mean lon/lat)
let sumLon = 0, sumLat = 0, count = 0;
for (const feature of raw) {
  const ring = feature.the_geom.coordinates[0][0]; // first polygon, outer ring
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

// 2. Convert each building
const buildings = [];
for (const feature of raw) {
  const heightFt = parseFloat(feature.height_roof) || 0;
  if (heightFt === 0) continue;

  const heightM = heightFt / 3.281;
  const ring = feature.the_geom.coordinates[0][0];

  const vertices = ring.map(([lon, lat]) => {
    const x = (lon - centerLon) * 111320 * cosLat;
    const z = (lat - centerLat) * 111320;
    return [Math.round(x * 100) / 100, Math.round(z * 100) / 100];
  });

  buildings.push({
    vertices,
    height: Math.round(heightM * 10) / 10,
    color: colorForHeight(heightM),
  });
}

console.log(`Converted ${buildings.length} buildings (skipped ${raw.length - buildings.length} with zero height)`);

// 3. Output
const output = {
  map: { width: 1200, depth: 1200, color: '#3a3a3a', skyColor: '#87CEEB' },
  buildings,
};

fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
console.log(`Wrote ${OUTPUT}`);
