import * as THREE from 'three';
import { scene } from './engine';
import { state } from './state';

const STREET_Y = 0.01; // Slightly above ground

export function addStreetPolygon(vertices: number[][], color: string): void {
  const shape = new THREE.Shape();
  shape.moveTo(vertices[0][0], -vertices[0][1]);
  for (let i = 1; i < vertices.length; i++) {
    shape.lineTo(vertices[i][0], -vertices[i][1]);
  }
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, STREET_Y, 0);

  const material = new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  state.streetPolygons.push({ vertices, color, mesh });
}

export function clearStreetPolygons(): void {
  while (state.streetPolygons.length) {
    const s = state.streetPolygons.pop()!;
    scene.remove(s.mesh);
    s.mesh.geometry.dispose();
    (s.mesh.material as THREE.Material).dispose();
  }
}
