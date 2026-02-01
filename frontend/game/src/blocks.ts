import * as THREE from 'three';
import { scene } from './engine';
import { state } from './state';
import type { Block } from './types';

let onChanged = (): void => {};
let onUpdated = (_index: number): void => {};
let onDeleted = (_index: number): void => {};

export function initBlocks(callbacks: {
  onChanged: () => void;
  onUpdated: (index: number) => void;
  onDeleted: (index: number) => void;
}): void {
  onChanged = callbacks.onChanged;
  onUpdated = callbacks.onUpdated;
  onDeleted = callbacks.onDeleted;
}

export function addBlock(x: number, z: number, w: number, h: number, d: number, color: string): number {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, h / 2, z);
  mesh.userData.blockIndex = state.blocks.length;
  scene.add(mesh);
  state.blocks.push({ x, z, width: w, height: h, depth: d, color, mesh });
  onChanged();
  return state.blocks.length - 1;
}

export function updateBlock(index: number, props: Partial<Omit<Block, 'mesh'>>): void {
  const block = state.blocks[index];
  if (!block) return;
  scene.remove(block.mesh);
  block.mesh.geometry.dispose();
  (block.mesh.material as THREE.Material).dispose();

  Object.assign(block, props);
  const geo = new THREE.BoxGeometry(block.width, block.height, block.depth);
  const mat = new THREE.MeshStandardMaterial({ color: block.color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(block.x, block.height / 2, block.z);
  mesh.userData.blockIndex = index;
  scene.add(mesh);
  block.mesh = mesh;

  onUpdated(index);
  onChanged();
}

export function deleteBlock(index: number): void {
  const block = state.blocks[index];
  if (!block) return;
  scene.remove(block.mesh);
  block.mesh.geometry.dispose();
  (block.mesh.material as THREE.Material).dispose();
  state.blocks.splice(index, 1);
  for (let i = 0; i < state.blocks.length; i++) {
    state.blocks[i].mesh.userData.blockIndex = i;
  }
  onDeleted(index);
  onChanged();
}

export function clearBlocks(): void {
  while (state.blocks.length) {
    const b = state.blocks.pop()!;
    scene.remove(b.mesh);
    b.mesh.geometry.dispose();
    (b.mesh.material as THREE.Material).dispose();
  }
}
