#!/usr/bin/env node
/**
 * Fetches NYC building footprints from the Open Data SODA API.
 * Queries a ~2km x 2km box centered on midtown Manhattan
 * (same area as the existing midtown_raw.json, but larger).
 *
 * Usage: node builds/fetch.js
 * Output: builds/manhattan_raw.json
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, 'manhattan_raw.json');

// Center of the existing midtown dataset
const CENTER_LAT = 40.755;
const CENTER_LON = -73.984;

// Query radius in meters. Oversized to compensate for the 29° grid rotation
// in convert_rect.cjs (a rotated rectangle inscribed in this box needs margin).
const RADIUS_M = 1500;

// Convert radius to lat/lon offsets
const dLat = RADIUS_M / 111320;
const cosLat = Math.cos(CENTER_LAT * Math.PI / 180);
const dLon = RADIUS_M / (111320 * cosLat);

// Bounding box corners (NW = top-left, SE = bottom-right)
const NW_LAT = CENTER_LAT + dLat;
const NW_LON = CENTER_LON - dLon;
const SE_LAT = CENTER_LAT - dLat;
const SE_LON = CENTER_LON + dLon;

// SODA API endpoint for NYC Building Footprints
const DATASET = '5zhs-2jue';
const BASE = `https://data.cityofnewyork.us/resource/${DATASET}.json`;

const where = `within_box(the_geom, ${NW_LAT}, ${NW_LON}, ${SE_LAT}, ${SE_LON})`;
const params = new URLSearchParams({
  '$where': where,
  '$limit': '9999',
});
const url = `${BASE}?${params}`;

console.log('Fetching NYC building footprints...');
console.log(`  Center: ${CENTER_LAT}, ${CENTER_LON}`);
console.log(`  Box NW: ${NW_LAT.toFixed(6)}, ${NW_LON.toFixed(6)}`);
console.log(`  Box SE: ${SE_LAT.toFixed(6)}, ${SE_LON.toFixed(6)}`);
console.log(`  Radius: ${RADIUS_M}m (~${(RADIUS_M * 2 / 1000).toFixed(1)}km x ${(RADIUS_M * 2 / 1000).toFixed(1)}km)`);

https.get(url, (res) => {
  if (res.statusCode !== 200) {
    console.error(`HTTP ${res.statusCode}`);
    res.resume();
    return;
  }

  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const buildings = JSON.parse(data);
      if (!Array.isArray(buildings)) {
        console.error('Unexpected response:', data.slice(0, 200));
        return;
      }
      console.log(`Fetched ${buildings.length} buildings`);
      fs.writeFileSync(OUTPUT, JSON.stringify(buildings, null, 2));
      console.log(`Saved to ${OUTPUT}`);
    } catch (err) {
      console.error('Parse error:', err.message);
      console.error('Response preview:', data.slice(0, 300));
    }
  });
}).on('error', err => {
  console.error('Fetch failed:', err.message);
});
