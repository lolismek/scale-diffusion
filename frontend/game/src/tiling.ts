import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { scene, camera } from './engine';
import { getGround } from './ground';
import type { SceneData, StreetCorridor } from './types';

// ── Config ───────────────────────────────────────────────────────────────────
const TILE_RADIUS = 2; // 5×5 grid = 25 tiles max

// Street rendering constants (same as streets.ts)
const DASH_LENGTH = 3;
const DASH_GAP = 3;
const DASH_COLOR = 0xDAA520;
const DASH_Y = 0.015;
const DASH_WIDTH = 0.3;
const EDGE_COLOR = 0xCCCCCC;
const EDGE_Y = 0.012;
const EDGE_WIDTH = 0.15;

// ── Template state ───────────────────────────────────────────────────────────
interface TileTemplate {
  buildings: Array<{ vertices: number[][]; height: number; color: string }>;
  streets: StreetCorridor[];
  tileWidth: number;
  tileDepth: number;
}

let template: TileTemplate | null = null;
const loadedTiles = new Map<string, THREE.Group>();
let lastCx = NaN;
let lastCz = NaN;

// ── Public API ───────────────────────────────────────────────────────────────

export function setTileTemplate(data: SceneData): void {
  template = {
    buildings: (data.buildings || []) as Array<{ vertices: number[][]; height: number; color: string }>,
    streets: data.streets || [],
    tileWidth: data.tileWidth!,
    tileDepth: data.tileDepth!,
  };
  lastCx = NaN;
  lastCz = NaN;
}

export function updateTiles(): void {
  if (!template) return;

  const { tileWidth, tileDepth } = template;
  const cx = Math.floor(camera.position.x / tileWidth + 0.5);
  const cz = Math.floor(camera.position.z / tileDepth + 0.5);

  // Keep ground centered under the camera
  const ground = getGround();
  if (ground) {
    ground.position.x = camera.position.x;
    ground.position.z = camera.position.z;
  }

  if (cx === lastCx && cz === lastCz) return;
  lastCx = cx;
  lastCz = cz;

  // Determine needed tile keys
  const needed = new Set<string>();
  for (let dx = -TILE_RADIUS; dx <= TILE_RADIUS; dx++) {
    for (let dz = -TILE_RADIUS; dz <= TILE_RADIUS; dz++) {
      needed.add(`${cx + dx},${cz + dz}`);
    }
  }

  // Remove tiles no longer needed
  for (const [key, group] of loadedTiles) {
    if (!needed.has(key)) {
      disposeTileGroup(group);
      scene.remove(group);
      loadedTiles.delete(key);
    }
  }

  // Create missing tiles
  for (const key of needed) {
    if (!loadedTiles.has(key)) {
      const [tx, tz] = key.split(',').map(Number);
      const group = createTile(tx, tz);
      scene.add(group);
      loadedTiles.set(key, group);
    }
  }
}

export function clearTiles(): void {
  for (const [, group] of loadedTiles) {
    disposeTileGroup(group);
    scene.remove(group);
  }
  loadedTiles.clear();
  template = null;
  lastCx = NaN;
  lastCz = NaN;
}

// ── Tile creation ────────────────────────────────────────────────────────────

function disposeTileGroup(group: THREE.Group): void {
  for (const child of group.children) {
    if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
  }
}

function createTile(cx: number, cz: number): THREE.Group {
  const group = new THREE.Group();
  const offsetX = cx * template!.tileWidth;
  const offsetZ = cz * template!.tileDepth;

  const buildingMesh = createBuildingMesh(offsetX, offsetZ);
  if (buildingMesh) group.add(buildingMesh);

  const { dashes, edges } = createStreetMeshes(offsetX, offsetZ);
  if (dashes) group.add(dashes);
  if (edges) group.add(edges);

  return group;
}

// ── Merged building mesh ─────────────────────────────────────────────────────

function createBuildingMesh(offsetX: number, offsetZ: number): THREE.Mesh | null {
  if (!template || template.buildings.length === 0) return null;

  const geometries: THREE.BufferGeometry[] = [];

  for (const b of template.buildings) {
    const shape = new THREE.Shape();
    shape.moveTo(b.vertices[0][0], -b.vertices[0][1]);
    for (let i = 1; i < b.vertices.length; i++) {
      shape.lineTo(b.vertices[i][0], -b.vertices[i][1]);
    }
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: b.height,
      bevelEnabled: false,
    });
    geo.rotateX(-Math.PI / 2);
    geo.translate(offsetX, 0, offsetZ);

    // Bake vertex colors
    const color = new THREE.Color(b.color);
    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    geometries.push(geo);
  }

  const merged = mergeGeometries(geometries, false);
  for (const g of geometries) g.dispose();
  if (!merged) return null;

  return new THREE.Mesh(
    merged,
    new THREE.MeshStandardMaterial({ vertexColors: true }),
  );
}

// ── Street meshes per tile ───────────────────────────────────────────────────

function clearSegments(c: StreetCorridor): [number, number][] {
  const segs: [number, number][] = [];
  let cursor = c.start;
  for (const [iStart, iEnd] of c.interrupts) {
    if (iStart > cursor) segs.push([cursor, iStart]);
    cursor = Math.max(cursor, iEnd);
  }
  if (cursor < c.end) segs.push([cursor, c.end]);
  return segs;
}

function countDashes(segments: [number, number][]): number {
  let n = 0;
  for (const [start, end] of segments) {
    let pos = start + DASH_LENGTH / 2;
    while (pos + DASH_LENGTH / 2 <= end) { n++; pos += DASH_LENGTH + DASH_GAP; }
  }
  return n;
}

function countEdgeDashes(segments: [number, number][]): number {
  return countDashes(segments) * 2;
}

function createStreetMeshes(
  offsetX: number,
  offsetZ: number,
): { dashes: THREE.InstancedMesh | null; edges: THREE.InstancedMesh | null } {
  const corridors = template?.streets;
  if (!corridors || corridors.length === 0) return { dashes: null, edges: null };

  let totalDashes = 0;
  let totalEdges = 0;
  for (const c of corridors) {
    const segs = clearSegments(c);
    totalDashes += countDashes(segs);
    totalEdges += countEdgeDashes(segs);
  }
  if (totalDashes === 0 && totalEdges === 0) return { dashes: null, edges: null };

  // Shared geometry templates (flat on XZ plane)
  const dashGeo = new THREE.PlaneGeometry(DASH_LENGTH, DASH_WIDTH);
  dashGeo.rotateX(-Math.PI / 2);
  const dashes = new THREE.InstancedMesh(
    dashGeo,
    new THREE.MeshBasicMaterial({ color: DASH_COLOR, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    totalDashes,
  );
  dashes.frustumCulled = false;

  const edgeGeo = new THREE.PlaneGeometry(DASH_LENGTH, EDGE_WIDTH);
  edgeGeo.rotateX(-Math.PI / 2);
  const edges = new THREE.InstancedMesh(
    edgeGeo,
    new THREE.MeshBasicMaterial({ color: EDGE_COLOR, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    totalEdges,
  );
  edges.frustumCulled = false;

  const mat4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  const rotZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const noRot = new THREE.Quaternion();

  let dIdx = 0;
  let eIdx = 0;

  for (const c of corridors) {
    const isZ = c.axis === 'z';
    const q = isZ ? rotZ : noRot;
    const halfW = c.width / 2;

    // Center dashes
    for (const [segStart, segEnd] of clearSegments(c)) {
      let off = segStart + DASH_LENGTH / 2;
      while (off + DASH_LENGTH / 2 <= segEnd) {
        if (isZ) pos.set(c.center + offsetX, DASH_Y, off + offsetZ);
        else pos.set(off + offsetX, DASH_Y, c.center + offsetZ);
        scale.set(1, 1, 1);
        mat4.compose(pos, q, scale);
        dashes.setMatrixAt(dIdx++, mat4);
        off += DASH_LENGTH + DASH_GAP;
      }
    }

    // Edge dashes (same rhythm as center, both sides)
    for (const [segStart, segEnd] of clearSegments(c)) {
      let off = segStart + DASH_LENGTH / 2;
      while (off + DASH_LENGTH / 2 <= segEnd) {
        for (let side = -1; side <= 1; side += 2) {
          const edgeOff = side * halfW;
          if (isZ) pos.set(c.center + edgeOff + offsetX, EDGE_Y, off + offsetZ);
          else pos.set(off + offsetX, EDGE_Y, c.center + edgeOff + offsetZ);
          scale.set(1, 1, 1);
          mat4.compose(pos, q, scale);
          edges.setMatrixAt(eIdx++, mat4);
        }
        off += DASH_LENGTH + DASH_GAP;
      }
    }
  }

  dashes.count = dIdx;
  edges.count = eIdx;
  dashes.instanceMatrix.needsUpdate = true;
  edges.instanceMatrix.needsUpdate = true;

  return { dashes, edges };
}
