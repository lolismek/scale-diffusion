import * as THREE from 'three';
import { scene } from './engine';
import { state } from './state';

export function addBuilding(vertices: number[][], height: number, color: string): void {
  const shape = new THREE.Shape();
  shape.moveTo(vertices[0][0], -vertices[0][1]);
  for (let i = 1; i < vertices.length; i++) {
    shape.lineTo(vertices[i][0], -vertices[i][1]);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
  });
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshStandardMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  state.buildings.push({ vertices, height, color, mesh });
}

export function clearBuildings(): void {
  while (state.buildings.length) {
    const b = state.buildings.pop()!;
    scene.remove(b.mesh);
    b.mesh.geometry.dispose();
    (b.mesh.material as THREE.Material).dispose();
  }
}
