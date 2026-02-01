import * as THREE from 'three';
import { scene } from './engine';
import type { StreetCorridor } from './types';

// ── Config ───────────────────────────────────────────────────────────────────
const DASH_LENGTH = 3;      // meters
const DASH_GAP = 3;         // meters
const DASH_COLOR = 0xDAA520; // muted gold
const DASH_Y = 0.015;
const DASH_WIDTH = 0.3;     // width of center dash stripe

const EDGE_COLOR = 0xCCCCCC; // white-ish
const EDGE_Y = 0.012;
const EDGE_WIDTH = 0.15;    // width of edge line stripe

// ── State ────────────────────────────────────────────────────────────────────
let dashMesh: THREE.InstancedMesh | null = null;
let edgeMesh: THREE.InstancedMesh | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Given a corridor, return segments along its axis where center dashes are allowed
 *  (i.e., the corridor extent minus interrupt zones). */
function clearSegments(corridor: StreetCorridor): [number, number][] {
  const segs: [number, number][] = [];
  let cursor = corridor.start;
  for (const [iStart, iEnd] of corridor.interrupts) {
    if (iStart > cursor) {
      segs.push([cursor, iStart]);
    }
    cursor = Math.max(cursor, iEnd);
  }
  if (cursor < corridor.end) {
    segs.push([cursor, corridor.end]);
  }
  return segs;
}

/** Count how many dashes fit in a set of segments. */
function countDashes(segments: [number, number][]): number {
  let count = 0;
  for (const [start, end] of segments) {
    const len = end - start;
    count += Math.floor((len + DASH_GAP) / (DASH_LENGTH + DASH_GAP));
  }
  return count;
}

/** Count edge dashes for a corridor (same spacing as center dashes, both sides). */
function countEdgeDashes(segments: [number, number][]): number {
  return countDashes(segments) * 2;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function addStreets(corridors: StreetCorridor[]): void {
  if (corridors.length === 0) return;

  // ── Count total instances ──────────────────────────────────────────────
  let totalDashes = 0;
  let totalEdges = 0;
  for (const c of corridors) {
    const segs = clearSegments(c);
    totalDashes += countDashes(segs);
    totalEdges += countEdgeDashes(segs);
  }

  if (totalDashes === 0 && totalEdges === 0) return;

  // ── Create geometries ─────────────────────────────────────────────────
  // Dashes: thin flat box (length along X by default, rotated for Z-corridors)
  const dashGeo = new THREE.PlaneGeometry(DASH_LENGTH, DASH_WIDTH);
  dashGeo.rotateX(-Math.PI / 2); // lay flat on XZ plane
  const dashMat = new THREE.MeshBasicMaterial({ color: DASH_COLOR, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });

  dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, totalDashes);
  dashMesh.frustumCulled = false;

  // Edge dashes: same size as center dashes
  const edgeGeo = new THREE.PlaneGeometry(DASH_LENGTH, EDGE_WIDTH);
  edgeGeo.rotateX(-Math.PI / 2);
  const edgeMat = new THREE.MeshBasicMaterial({ color: EDGE_COLOR, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });

  edgeMesh = new THREE.InstancedMesh(edgeGeo, edgeMat, totalEdges);
  edgeMesh.frustumCulled = false;

  // ── Populate instances ────────────────────────────────────────────────
  const mat4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const rotZ = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.PI / 2,
  );
  const noRot = new THREE.Quaternion();

  let dashIdx = 0;
  let edgeIdx = 0;

  for (const c of corridors) {
    const isZ = c.axis === 'z';
    const q = isZ ? rotZ : noRot;
    const halfW = c.width / 2;

    // ── Center dashes ────────────────────────────────────────────────
    const segs = clearSegments(c);
    for (const [segStart, segEnd] of segs) {
      const segLen = segEnd - segStart;
      let offset = segStart + DASH_LENGTH / 2; // center of first dash
      while (offset + DASH_LENGTH / 2 <= segEnd) {
        if (isZ) {
          pos.set(c.center, DASH_Y, offset);
        } else {
          pos.set(offset, DASH_Y, c.center);
        }
        mat4.compose(pos, q, scale);
        dashMesh.setMatrixAt(dashIdx++, mat4);
        offset += DASH_LENGTH + DASH_GAP;
      }
    }

    // ── Edge dashes (same rhythm as center, both sides) ──────────────
    const edgeSegs = clearSegments(c);
    for (const [segStart, segEnd] of edgeSegs) {
      let offset = segStart + DASH_LENGTH / 2;
      while (offset + DASH_LENGTH / 2 <= segEnd) {
        for (let side = -1; side <= 1; side += 2) {
          const edgeOffset = side * halfW;
          if (isZ) {
            pos.set(c.center + edgeOffset, EDGE_Y, offset);
          } else {
            pos.set(offset, EDGE_Y, c.center + edgeOffset);
          }
          scale.set(1, 1, 1);
          mat4.compose(pos, q, scale);
          edgeMesh.setMatrixAt(edgeIdx++, mat4);
        }
        offset += DASH_LENGTH + DASH_GAP;
      }
    }
  }

  // Update instance counts to actual usage (may be fewer than allocated)
  dashMesh.count = dashIdx;
  edgeMesh.count = edgeIdx;
  dashMesh.instanceMatrix.needsUpdate = true;
  edgeMesh.instanceMatrix.needsUpdate = true;

  scene.add(dashMesh);
  scene.add(edgeMesh);
}

export function clearStreets(): void {
  if (dashMesh) {
    scene.remove(dashMesh);
    dashMesh.geometry.dispose();
    (dashMesh.material as THREE.Material).dispose();
    dashMesh = null;
  }
  if (edgeMesh) {
    scene.remove(edgeMesh);
    edgeMesh.geometry.dispose();
    (edgeMesh.material as THREE.Material).dispose();
    edgeMesh = null;
  }
}
